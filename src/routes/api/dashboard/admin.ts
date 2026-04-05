// Route: Returns admin dashboard status and operational data for the app owner.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import {
  createAuditLog,
  deleteBotAuthorization,
  deleteEventSubSubscriptionRecord,
  getAdminDashboardBaseState,
  getBotAuthorization,
  getChannelByTwitchChannelId,
  getChannelsByTwitchChannelIds,
  updateAdminBotOfflineTesting,
  upsertEventSubSubscription,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  deleteEventSubSubscription,
  getAppAccessToken,
  getTwitchUserById,
  listEventSubSubscriptions,
} from "~/lib/twitch/api";
import { disconnectBotAuthFromReplies } from "~/lib/twitch/bot";
import {
  buildAdminChatSubscriptionCleanupPlan,
  getEventSubChannelTwitchId,
  summarizeAdminEventSubSubscriptions,
} from "~/lib/twitch/eventsub-dashboard";
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
        let eventSub: {
          error?: string;
          currentBotUserId: string | null;
          currentCallbackUrl: string;
          totalRemoteSubscriptions: number;
          totalChatSubscriptions: number;
          channelsWithChatSubscription: number;
          channelsWithDuplicateChatSubscriptions: number;
          channels: Array<{
            channelId: string | null;
            twitchChannelId: string;
            displayName: string;
            login: string | null;
            botReadyState: string | null;
            totalSubscriptionCount: number;
            chatSubscriptionCount: number;
            duplicateChatSubscriptions: boolean;
            chatSubscriptionIds: string[];
            chatBotUserIds: string[];
            chatCallbacks: string[];
          }>;
        } = {
          currentBotUserId: connectedUserId,
          currentCallbackUrl: `${runtimeEnv.APP_URL}/api/eventsub`,
          totalRemoteSubscriptions: 0,
          totalChatSubscriptions: 0,
          channelsWithChatSubscription: 0,
          channelsWithDuplicateChatSubscriptions: 0,
          channels: [],
        };

        try {
          const appToken = await getAppAccessToken(runtimeEnv);
          const remoteSubscriptions = await listEventSubSubscriptions({
            env: runtimeEnv,
            appAccessToken: appToken.access_token,
          });
          const twitchChannelIds = [
            ...new Set(
              remoteSubscriptions
                .map((subscription) => getEventSubChannelTwitchId(subscription))
                .filter((value): value is string => !!value)
            ),
          ];
          const channels = await getChannelsByTwitchChannelIds(
            runtimeEnv,
            twitchChannelIds
          );
          eventSub = {
            ...eventSub,
            ...summarizeAdminEventSubSubscriptions({
              subscriptions: remoteSubscriptions,
              channelsByTwitchId: new Map(
                channels.map((channel) => [channel.twitchChannelId, channel])
              ),
            }),
          };

          if (botAuthorization?.twitchUserId) {
            const connectedUser = await getTwitchUserById({
              env: runtimeEnv,
              accessToken: appToken.access_token,
              id: botAuthorization.twitchUserId,
            });
            connectedLogin = connectedUser?.login ?? null;
            connectedDisplayName = connectedUser?.display_name ?? null;
          }
        } catch (error) {
          console.error("Failed to load admin EventSub status", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
          eventSub = {
            ...eventSub,
            error: "Live bot subscription status could not be loaded.",
          };
        }

        if (botAuthorization?.twitchUserId && !connectedLogin) {
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
          eventSub,
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
          action?:
            | "setOfflineTesting"
            | "disconnectBot"
            | "cleanupChatSubscriptions";
          enabled?: boolean;
          twitchChannelId?: string;
        } | null;

        if (
          payload?.action !== "setOfflineTesting" &&
          payload?.action !== "disconnectBot" &&
          payload?.action !== "cleanupChatSubscriptions"
        ) {
          return json(
            { error: "invalid_action", message: "Invalid admin action." },
            { status: 400 }
          );
        }

        if (payload.action === "cleanupChatSubscriptions") {
          const twitchChannelId = payload.twitchChannelId?.trim();
          if (!twitchChannelId) {
            return json(
              {
                error: "missing_channel",
                message: "A channel is required for chat subscription cleanup.",
              },
              { status: 400 }
            );
          }

          const channel = await getChannelByTwitchChannelId(
            runtimeEnv,
            twitchChannelId
          );
          if (!channel) {
            return json(
              { error: "channel_not_found", message: "Channel not found." },
              { status: 404 }
            );
          }

          const appToken = await getAppAccessToken(runtimeEnv);
          const currentCallbackUrl = `${runtimeEnv.APP_URL}/api/eventsub`;
          const currentBotUserId =
            (await getBotAuthorization(runtimeEnv))?.twitchUserId ?? null;
          const shouldKeepCurrentCallbackSubscription =
            channel.botReadyState === "active" ||
            channel.botReadyState === "active_offline_testing";
          let remoteSubscriptions = await listEventSubSubscriptions({
            env: runtimeEnv,
            appAccessToken: appToken.access_token,
            type: "channel.chat.message",
          });
          let cleanupPlan = buildAdminChatSubscriptionCleanupPlan({
            subscriptions: remoteSubscriptions,
            broadcasterUserId: channel.twitchChannelId,
            currentCallbackUrl,
            currentBotUserId,
            shouldKeepCurrentCallbackSubscription,
          });

          if (cleanupPlan.requiresReconcile) {
            await callBackend(runtimeEnv, "/internal/bot/reconcile", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                channelId: channel.id,
                refreshLiveState: false,
              }),
            });
            remoteSubscriptions = await listEventSubSubscriptions({
              env: runtimeEnv,
              appAccessToken: appToken.access_token,
              type: "channel.chat.message",
            });
            cleanupPlan = buildAdminChatSubscriptionCleanupPlan({
              subscriptions: remoteSubscriptions,
              broadcasterUserId: channel.twitchChannelId,
              currentCallbackUrl,
              currentBotUserId,
              shouldKeepCurrentCallbackSubscription,
            });
          }

          if (cleanupPlan.requiresReconcile) {
            return json(
              {
                error: "cleanup_failed",
                message:
                  "No active chat subscription could be confirmed for this callback.",
              },
              { status: 409 }
            );
          }

          await Promise.all(
            cleanupPlan.deleteSubscriptionIds.map((subscriptionId) =>
              deleteEventSubSubscription({
                env: runtimeEnv,
                appAccessToken: appToken.access_token,
                subscriptionId,
              })
            )
          );

          const keptSubscription = cleanupPlan.keepSubscriptionId
            ? (remoteSubscriptions.find(
                (subscription) =>
                  subscription.id === cleanupPlan.keepSubscriptionId
              ) ?? null)
            : null;

          if (keptSubscription) {
            await upsertEventSubSubscription(runtimeEnv, {
              channelId: channel.id,
              subscriptionType: "channel.chat.message",
              twitchSubscriptionId: keptSubscription.id,
              status: keptSubscription.status,
              errorMessage: null,
              lastVerifiedAt: Date.now(),
            });
          } else {
            await deleteEventSubSubscriptionRecord(
              runtimeEnv,
              channel.id,
              "channel.chat.message"
            );
          }

          await createAuditLog(runtimeEnv, {
            channelId: channel.id,
            actorUserId: state.channel.ownerUserId,
            actorType: "admin",
            action: "cleanup_chat_subscriptions",
            entityType: "eventsub_subscription",
            entityId: channel.id,
            payloadJson: JSON.stringify({
              twitchChannelId: channel.twitchChannelId,
              currentCallbackUrl,
              keptSubscriptionId: cleanupPlan.keepSubscriptionId,
              removedSubscriptionIds: cleanupPlan.deleteSubscriptionIds,
              untouchedOtherCallbackSubscriptionIds:
                cleanupPlan.untouchedOtherCallbackSubscriptionIds,
            }),
          });

          const removedCount = cleanupPlan.deleteSubscriptionIds.length;
          const untouchedCount =
            cleanupPlan.untouchedOtherCallbackSubscriptionIds.length;
          const keptMessage = cleanupPlan.keepSubscriptionId
            ? "One current chat subscription was kept."
            : "No current chat subscription was kept.";
          const warning =
            untouchedCount > 0
              ? `${untouchedCount} subscriptions using other callback URLs were left untouched.`
              : null;

          return json({
            ok: true,
            message:
              removedCount > 0
                ? `Removed ${removedCount} stale chat subscriptions for this callback. ${keptMessage}`
                : `No stale chat subscriptions were removed for this callback. ${keptMessage}`,
            warning,
          });
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
