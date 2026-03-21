// Route: Returns admin dashboard status and operational data for the app owner.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import {
  createAuditLog,
  getAdminDashboardState,
  getBotAuthorization,
  updateAdminBotOfflineTesting,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

async function requireAdminDashboardState(
  request: Request,
  runtimeEnv: AppEnv
) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getAdminDashboardState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireAdminDashboardState(request, runtimeEnv);
        if (!state) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        const botAuthorization = await getBotAuthorization(runtimeEnv);
        return json({
          channel: state.channel,
          settings: state.settings
            ? {
                adminForceBotWhileOffline:
                  state.settings.adminForceBotWhileOffline,
              }
            : null,
          logs: state.logs,
          audits: state.audits,
          bot: {
            connected: !!botAuthorization,
            configuredUsername: runtimeEnv.TWITCH_BOT_USERNAME,
          },
        });
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireAdminDashboardState(request, runtimeEnv);
        if (!state) {
          return json(
            { error: "Forbidden", message: "Forbidden" },
            { status: 403 }
          );
        }

        const payload = (await request.json().catch(() => null)) as {
          action?: "setOfflineTesting";
          enabled?: boolean;
        } | null;

        if (payload?.action !== "setOfflineTesting") {
          return json(
            { error: "invalid_action", message: "Invalid admin action." },
            { status: 400 }
          );
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
