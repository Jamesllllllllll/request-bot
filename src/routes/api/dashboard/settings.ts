// Route: Reads and updates request settings for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend, notifyPlaylistStream } from "~/lib/backend";
import {
  createAuditLog,
  ensureStreamElementsTipWebhookToken,
  getActiveBroadcasterAuthorizationForChannel,
  getBotAuthorization,
  getCatalogSearchFilterOptions,
  getDashboardState,
  updateSettings,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  getAllowedRequestPathsSetting,
  getRequiredPathsMatchMode,
  getRequiredPathsSetting,
  normalizeAllowedRequestPaths,
} from "~/lib/request-policy";
import { parseStoredTuningIds } from "~/lib/tunings";
import { getTwitchUser } from "~/lib/twitch/api";
import {
  getChannelPointRewardEligibility,
  unknownChannelPointRewardEligibility,
} from "~/lib/twitch/channel-point-reward-eligibility";
import { getChannelPointRewardWarningMessageFromWarnings } from "~/lib/twitch/channel-point-reward-warnings";
import { getErrorMessage, json } from "~/lib/utils";
import { settingsInputSchema } from "~/lib/validation";
import { parseVipTokenDurationThresholds } from "~/lib/vip-token-duration-thresholds";

async function requireDashboardState(request: Request, runtimeEnv: AppEnv) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getDashboardState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/settings")({
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

        const [
          botAuthorization,
          streamElementsTipWebhookToken,
          broadcasterAuthorization,
          filterOptions,
        ] = await Promise.all([
          getBotAuthorization(runtimeEnv),
          state.settings
            ? ensureStreamElementsTipWebhookToken(runtimeEnv, state.channel.id)
            : null,
          getActiveBroadcasterAuthorizationForChannel(
            runtimeEnv,
            state.channel.id
          ),
          getCatalogSearchFilterOptions(runtimeEnv),
        ]);
        let channelPointRewardsEligibility =
          unknownChannelPointRewardEligibility;

        if (broadcasterAuthorization) {
          try {
            const twitchUser = await getTwitchUser(
              runtimeEnv,
              broadcasterAuthorization.accessTokenEncrypted
            );
            channelPointRewardsEligibility = getChannelPointRewardEligibility(
              twitchUser.broadcaster_type
            );
          } catch (error) {
            console.error(
              "Failed to resolve Twitch channel point reward eligibility",
              {
                channelId: state.channel.id,
                error: error instanceof Error ? error.message : String(error),
              }
            );
          }
        }

        return json({
          channel: state.channel,
          settings: state.settings
            ? {
                ...state.settings,
                allowedTunings: parseStoredTuningIds(
                  state.settings.allowedTuningsJson
                ),
                requiredPaths: getRequiredPathsSetting(state.settings),
                allowedRequestPaths: normalizeAllowedRequestPaths(
                  getAllowedRequestPathsSetting(state.settings)
                ),
                vipTokenDurationThresholds: parseVipTokenDurationThresholds(
                  state.settings.vipTokenDurationThresholdsJson
                ),
                requiredPathsMatchMode: getRequiredPathsMatchMode(
                  state.settings.requiredPathsMatchMode
                ),
                allowRequestPathModifiers:
                  state.settings.allowRequestPathModifiers,
              }
            : null,
          tuningOptions: filterOptions.tunings,
          integrations: {
            streamElementsTipRelayUrl: streamElementsTipWebhookToken
              ? `${runtimeEnv.APP_URL}/api/integrations/streamelements/${state.channel.slug}/${streamElementsTipWebhookToken}`
              : null,
          },
          channelPointRewardsEligibility,
          playedSongs: state.playedSongs,
          bot: {
            connected: !!botAuthorization,
            configuredUsername: runtimeEnv.TWITCH_BOT_USERNAME,
          },
        });
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

        const payload = await request.json().catch(() => null);
        const parsed = settingsInputSchema.safeParse(payload);

        if (!parsed.success) {
          return json(
            {
              error: "invalid_settings",
              message:
                parsed.error.issues[0]?.message ??
                "Settings payload is invalid.",
            },
            { status: 400 }
          );
        }

        await updateSettings(runtimeEnv, state.channel.id, parsed.data);
        let reconcileWarning: string | null = null;
        let reconcileError: string | null = null;

        try {
          const response = await callBackend(
            runtimeEnv,
            "/internal/bot/reconcile",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                channelId: state.channel.id,
                refreshLiveState: true,
              }),
            }
          );

          const reconcileResult = (await response.json().catch(() => null)) as {
            warnings?: string[];
          } | null;
          reconcileWarning = getChannelPointRewardWarningMessageFromWarnings(
            reconcileResult?.warnings
          );
        } catch (error) {
          reconcileError =
            error instanceof Error ? error.message : String(error);
          console.error("Bot reconcile failed after settings update", {
            channelId: state.channel.id,
            reconcileError,
          });
        }

        await createAuditLog(runtimeEnv, {
          channelId: state.channel.id,
          actorUserId: state.channel.ownerUserId,
          actorType: "owner",
          action: "update_settings",
          entityType: "channel_settings",
          entityId: state.channel.id,
          payloadJson: JSON.stringify(parsed.data),
        });

        await notifyPlaylistStream(runtimeEnv, {
          channelId: state.channel.id,
          reason: "settings",
        });

        return json({
          ok: true,
          message: "Settings saved.",
          warning:
            reconcileWarning ??
            (reconcileError
              ? "Your settings were saved, but bot status could not be refreshed right away. The bot will retry on the next live/status check."
              : null),
          reconcileError: reconcileError
            ? getErrorMessage(reconcileError)
            : null,
        });
      },
    },
  },
});
