// Route: Returns admin dashboard status and operational data for the app owner.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import {
  createAuditLog,
  deleteBotAuthorization,
  getAdminDashboardBaseState,
  getBotAuthorization,
  updateAdminBotOfflineTesting,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getAppAccessToken, getTwitchUserById } from "~/lib/twitch/api";
import { disconnectBotAuthFromReplies } from "~/lib/twitch/bot";
import { json } from "~/lib/utils";

async function requireAdminDashboardBaseState(
  request: Request,
  runtimeEnv: AppEnv
) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getAdminDashboardBaseState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireAdminDashboardBaseState(request, runtimeEnv);
        if (!state) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        const botAuthorization = await getBotAuthorization(runtimeEnv);
        let connectedLogin: string | null = null;
        let connectedDisplayName: string | null = null;
        const connectedUserId: string | null =
          botAuthorization?.twitchUserId ?? null;

        if (botAuthorization?.twitchUserId) {
          try {
            const appToken = await getAppAccessToken(runtimeEnv);
            const connectedUser = await getTwitchUserById({
              env: runtimeEnv,
              accessToken: appToken.access_token,
              id: botAuthorization.twitchUserId,
            });
            connectedLogin = connectedUser?.login ?? null;
            connectedDisplayName = connectedUser?.display_name ?? null;
          } catch (error) {
            console.error("Failed to resolve connected bot identity", {
              twitchUserId: botAuthorization.twitchUserId,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        return json({
          channel: state.channel,
          settings: state.settings
            ? {
                adminForceBotWhileOffline:
                  state.settings.adminForceBotWhileOffline,
              }
            : null,
          bot: {
            connected: !!botAuthorization,
            configuredUsername: runtimeEnv.TWITCH_BOT_USERNAME,
            connectedLogin,
            connectedDisplayName,
            connectedUserId,
          },
        });
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireAdminDashboardBaseState(request, runtimeEnv);
        if (!state) {
          return json(
            { error: "Forbidden", message: "Forbidden" },
            { status: 403 }
          );
        }

        const payload = (await request.json().catch(() => null)) as {
          action?: "setOfflineTesting" | "disconnectBot";
          enabled?: boolean;
        } | null;

        if (
          payload?.action !== "setOfflineTesting" &&
          payload?.action !== "disconnectBot"
        ) {
          return json(
            { error: "invalid_action", message: "Invalid admin action." },
            { status: 400 }
          );
        }

        if (payload.action === "disconnectBot") {
          const botAuthorization = await getBotAuthorization(runtimeEnv);
          if (!botAuthorization) {
            return json({
              ok: true,
              message: "Bot account is already disconnected.",
            });
          }

          await disconnectBotAuthFromReplies(runtimeEnv);
          await deleteBotAuthorization(runtimeEnv);
          await createAuditLog(runtimeEnv, {
            channelId: state.channel.id,
            actorUserId: state.channel.ownerUserId,
            actorType: "admin",
            action: "disconnect_bot_account",
            entityType: "twitch_authorization",
            entityId: botAuthorization.id,
            payloadJson: JSON.stringify({
              twitchUserId: botAuthorization.twitchUserId,
            }),
          });

          return json({
            ok: true,
            message: "Bot account disconnected.",
          });
        }

        const enabled = !!payload.enabled;
        await updateAdminBotOfflineTesting(
          runtimeEnv,
          state.channel.id,
          enabled
        );

        let reconcileWarning: string | null = null;
        try {
          await callBackend(runtimeEnv, "/internal/bot/reconcile", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              channelId: state.channel.id,
              refreshLiveState: true,
            }),
          });
        } catch (error) {
          reconcileWarning =
            "The testing flag was saved, but bot status could not be refreshed immediately.";
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(
            "Bot reconcile failed after admin offline testing update",
            {
              channelId: state.channel.id,
              error: errorMessage,
            }
          );
        }

        await createAuditLog(runtimeEnv, {
          channelId: state.channel.id,
          actorUserId: state.channel.ownerUserId,
          actorType: "admin",
          action: enabled
            ? "enable_offline_bot_testing"
            : "disable_offline_bot_testing",
          entityType: "channel_settings",
          entityId: state.channel.id,
          payloadJson: JSON.stringify({ enabled }),
        });

        return json({
          ok: true,
          message: enabled
            ? "Offline bot testing enabled."
            : "Offline bot testing disabled.",
          warning: reconcileWarning,
        });
      },
    },
  },
});
