import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/start-server-core";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import {
  createAuditLog,
  getBotAuthorization,
  getDashboardState,
  updateSettings,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  getArraySetting,
  getRequiredPathsMatchMode,
} from "~/lib/request-policy";
import { getErrorMessage } from "~/lib/utils";
import { type SettingsInputData, settingsInputSchema } from "~/lib/validation";

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
    throw new Error("Your channel could not be loaded.");
  }

  return state;
}

export type DashboardSettingsData = {
  channel: {
    isLive: boolean;
    botEnabled: boolean;
    botReadyState: string;
  };
  settings: DashboardSettingsFormData | null;
  bot: {
    connected: boolean;
    configuredUsername: string;
  };
};

export const getDashboardSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    const runtimeEnv = env as AppEnv;
    const state = await requireDashboardState(runtimeEnv);
    const botAuthorization = await getBotAuthorization(runtimeEnv);

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
          }
        : null,
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
    let reconcileError: string | null = null;

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
      warning: reconcileError
        ? "Your settings were saved, but bot status could not be refreshed right away. The bot will retry on the next live/status check."
        : null,
      reconcileError: reconcileError ? getErrorMessage(reconcileError) : null,
    };
  });
