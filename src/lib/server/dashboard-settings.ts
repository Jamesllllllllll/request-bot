import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import {
  createAuditLog,
  getActiveBroadcasterAuthorizationForChannel,
  getBotAuthorization,
  getDashboardState,
  updateSettings,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { defaultLocale, normalizeLocale } from "~/lib/i18n/locales";
import {
  getArraySetting,
  getRequiredPathsMatchMode,
} from "~/lib/request-policy";
import { getTwitchUser } from "~/lib/twitch/api";
import {
  getChannelPointRewardEligibility,
  unknownChannelPointRewardEligibility,
} from "~/lib/twitch/channel-point-reward-eligibility";
import { getChannelPointRewardWarningMessageFromWarnings } from "~/lib/twitch/channel-point-reward-warnings";
import { getErrorMessage } from "~/lib/utils";
import { type SettingsInputData, settingsInputSchema } from "~/lib/validation";
import { parseVipTokenDurationThresholds } from "~/lib/vip-token-duration-thresholds";

export type DashboardSettingsFormData = Omit<
  SettingsInputData,
  "allowedTunings" | "requiredPaths"
> & {
  allowedTunings: string[];
  requiredPaths: string[];
};

async function requireDashboardState(runtimeEnv: AppEnv) {
  const request = getRequest();
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    throw new Error("You need to sign in to manage channel settings.");
  }

  const state = await getDashboardState(runtimeEnv, userId);
  if (!state) {
    throw new Error("Only the channel owner can manage channel settings.");
  }

  return state;
}

function normalizeCheerMinimumTokenPercent(
  value: number
): DashboardSettingsFormData["cheerMinimumTokenPercent"] {
  if (value === 50 || value === 75 || value === 100) {
    return value;
  }

  return 25;
}

export type DashboardSettingsData = {
  channel: {
    isLive: boolean;
    botEnabled: boolean;
    botReadyState: string;
  };
  settings: DashboardSettingsFormData | null;
  ownedOfficialDlcImport: {
    count: number;
    importedAt: number | null;
  };
  channelPointRewardsEligibility: {
    isKnown: boolean;
    isSupported: boolean;
  };
  bot: {
    connected: boolean;
    configuredUsername: string;
  };
};

export const getDashboardSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    const runtimeEnv = env as AppEnv;
    const state = await requireDashboardState(runtimeEnv);
    const [botAuthorization, broadcasterAuthorization] = await Promise.all([
      getBotAuthorization(runtimeEnv),
      getActiveBroadcasterAuthorizationForChannel(runtimeEnv, state.channel.id),
    ]);
    let channelPointRewardsEligibility = unknownChannelPointRewardEligibility;

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
        console.error("Failed to resolve Twitch channel point eligibility", {
          channelId: state.channel.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      channel: state.channel,
      settings: state.settings
        ? {
            ...state.settings,
            allowedTunings: getArraySetting(state.settings.allowedTuningsJson),
            requiredPaths: getArraySetting(state.settings.requiredPathsJson),
            requiredPathsMatchMode: getRequiredPathsMatchMode(
              state.settings.requiredPathsMatchMode
            ),
            defaultLocale:
              normalizeLocale(state.settings.defaultLocale) ?? defaultLocale,
            cheerMinimumTokenPercent: normalizeCheerMinimumTokenPercent(
              state.settings.cheerMinimumTokenPercent
            ),
            showPickOrderBadges: !!state.settings.showPickOrderBadges,
            vipTokenDurationThresholds: parseVipTokenDurationThresholds(
              state.settings.vipTokenDurationThresholdsJson
            ),
          }
        : null,
      ownedOfficialDlcImport: state.ownedOfficialDlcImport,
      channelPointRewardsEligibility,
      playedSongs: state.playedSongs,
      bot: {
        connected: !!botAuthorization,
        configuredUsername: runtimeEnv.TWITCH_BOT_USERNAME,
      },
    } satisfies DashboardSettingsData & { playedSongs: unknown[] };
  }
);

export const saveDashboardSettings = createServerFn({ method: "POST" })
  .inputValidator(settingsInputSchema)
  .handler(async ({ data }) => {
    const runtimeEnv = env as AppEnv;
    const state = await requireDashboardState(runtimeEnv);

    await updateSettings(runtimeEnv, state.channel.id, data);
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
      reconcileError = error instanceof Error ? error.message : String(error);
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
      payloadJson: JSON.stringify(data),
    });

    return {
      ok: true,
      message: "Settings saved.",
      warning:
        reconcileWarning ??
        (reconcileError
          ? "Your settings were saved, but bot status could not be refreshed right away. The bot will retry on the next live/status check."
          : null),
      reconcileError: reconcileError ? getErrorMessage(reconcileError) : null,
    };
  });
