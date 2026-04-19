import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  createAuditLog,
  deleteYouTubeAuthorization,
  getActiveYouTubeAuthorizationForChannel,
  getDashboardState,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getErrorMessage, json } from "~/lib/utils";
import {
  getActiveYouTubeBroadcast,
  isYouTubeConfigured,
  listYouTubeLiveChatMessages,
  sendYouTubeLiveChatMessage,
} from "~/lib/youtube/api";

const sendMessageSchema = z.object({
  message: z.string().trim().min(1).max(200),
});

async function requireDashboardState(request: Request, runtimeEnv: AppEnv) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getDashboardState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/integrations/youtube")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireDashboardState(request, runtimeEnv);

        if (!state) {
          return json(
            { error: "unauthorized", message: "You need to sign in first." },
            { status: 401 }
          );
        }

        if (!isYouTubeConfigured(runtimeEnv)) {
          return json({
            available: false,
            connected: false,
            account: null,
            activeBroadcast: null,
            recentMessages: [],
            statusError: null,
          });
        }

        const authorization = await getActiveYouTubeAuthorizationForChannel(
          runtimeEnv,
          state.channel.id
        );

        if (!authorization) {
          return json({
            available: true,
            connected: false,
            account: null,
            activeBroadcast: null,
            recentMessages: [],
            statusError: null,
          });
        }

        try {
          const activeBroadcast = await getActiveYouTubeBroadcast(
            authorization.accessTokenEncrypted
          );
          const recentMessages = activeBroadcast
            ? await listYouTubeLiveChatMessages(
                authorization.accessTokenEncrypted,
                activeBroadcast.liveChatId
              )
            : [];

          return json({
            available: true,
            connected: true,
            account: {
              youtubeChannelId: authorization.youtubeChannelId,
              channelTitle: authorization.channelTitle,
              channelCustomUrl: authorization.channelCustomUrl,
              thumbnailUrl: authorization.thumbnailUrl,
              updatedAt: authorization.updatedAt,
            },
            activeBroadcast,
            recentMessages,
            statusError: null,
          });
        } catch (error) {
          return json({
            available: true,
            connected: true,
            account: {
              youtubeChannelId: authorization.youtubeChannelId,
              channelTitle: authorization.channelTitle,
              channelCustomUrl: authorization.channelCustomUrl,
              thumbnailUrl: authorization.thumbnailUrl,
              updatedAt: authorization.updatedAt,
            },
            activeBroadcast: null,
            recentMessages: [],
            statusError: getErrorMessage(error),
          });
        }
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireDashboardState(request, runtimeEnv);

        if (!state) {
          return json(
            { error: "unauthorized", message: "You need to sign in first." },
            { status: 401 }
          );
        }

        if (!isYouTubeConfigured(runtimeEnv)) {
          return json(
            {
              error: "youtube_unavailable",
              message: "YouTube OAuth is not configured.",
            },
            { status: 503 }
          );
        }

        const parsed = sendMessageSchema.safeParse(
          await request.json().catch(() => null)
        );

        if (!parsed.success) {
          return json(
            {
              error: "invalid_message",
              message:
                parsed.error.issues[0]?.message ??
                "Message payload is invalid.",
            },
            { status: 400 }
          );
        }

        const authorization = await getActiveYouTubeAuthorizationForChannel(
          runtimeEnv,
          state.channel.id
        );

        if (!authorization) {
          return json(
            {
              error: "youtube_not_connected",
              message: "Connect YouTube before sending a test message.",
            },
            { status: 409 }
          );
        }

        const activeBroadcast = await getActiveYouTubeBroadcast(
          authorization.accessTokenEncrypted
        );

        if (!activeBroadcast) {
          return json(
            {
              error: "youtube_not_live",
              message: "No active YouTube live chat is available right now.",
            },
            { status: 409 }
          );
        }

        const sentMessage = await sendYouTubeLiveChatMessage(
          authorization.accessTokenEncrypted,
          {
            liveChatId: activeBroadcast.liveChatId,
            messageText: parsed.data.message,
          }
        );

        await createAuditLog(runtimeEnv, {
          channelId: state.channel.id,
          actorUserId: state.channel.ownerUserId,
          actorType: "owner",
          action: "send_youtube_test_message",
          entityType: "youtube_live_chat",
          entityId: activeBroadcast.liveChatId,
          payloadJson: JSON.stringify({
            broadcastId: activeBroadcast.id,
            liveChatId: activeBroadcast.liveChatId,
            message: parsed.data.message,
            messageId: sentMessage.id ?? null,
          }),
        });

        return json({
          ok: true,
          messageId: sentMessage.id ?? null,
          displayMessage:
            sentMessage.snippet?.displayMessage ?? parsed.data.message,
          publishedAt: sentMessage.snippet?.publishedAt ?? null,
          activeBroadcast,
        });
      },
      DELETE: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireDashboardState(request, runtimeEnv);

        if (!state) {
          return json(
            { error: "unauthorized", message: "You need to sign in first." },
            { status: 401 }
          );
        }

        const authorization = await getActiveYouTubeAuthorizationForChannel(
          runtimeEnv,
          state.channel.id
        );

        await deleteYouTubeAuthorization(runtimeEnv, state.channel.id);

        await createAuditLog(runtimeEnv, {
          channelId: state.channel.id,
          actorUserId: state.channel.ownerUserId,
          actorType: "owner",
          action: "disconnect_youtube_authorization",
          entityType: "youtube_authorization",
          entityId: authorization?.youtubeChannelId ?? state.channel.id,
          payloadJson: JSON.stringify({
            youtubeChannelId: authorization?.youtubeChannelId ?? null,
          }),
        });

        return json({
          ok: true,
          message: "YouTube disconnected.",
        });
      },
    },
  },
});
