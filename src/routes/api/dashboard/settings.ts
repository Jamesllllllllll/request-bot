// Route: Reads and updates request settings for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import {
  createAuditLog,
  getBotAuthorization,
  getDashboardState,
  updateSettings,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getArraySetting } from "~/lib/request-policy";
import { getErrorMessage, json } from "~/lib/utils";
import { settingsInputSchema } from "~/lib/validation";

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

        const botAuthorization = await getBotAuthorization(runtimeEnv);

        return json({
          channel: state.channel,
          settings: state.settings
            ? {
                ...state.settings,
                allowedTunings: getArraySetting(
                  state.settings.allowedTuningsJson
                ),
                requiredPaths: getArraySetting(
                  state.settings.requiredPathsJson
                ),
              }
            : null,
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

        return json({
          ok: true,
          message: "Settings saved.",
          warning: reconcileError
            ? "Your settings were saved, but bot status could not be refreshed right away. The bot will retry on the next live/status check."
            : null,
          reconcileError: reconcileError
            ? getErrorMessage(reconcileError)
            : null,
        });
      },
    },
  },
});
