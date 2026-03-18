// Route: Reads and updates overlay settings for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  createAuditLog,
  getOverlayStateForOwner,
  regenerateOverlayAccessToken,
  updateOverlaySettings,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";
import { overlaySettingsInputSchema } from "~/lib/validation";

async function requireOverlayState(request: Request, runtimeEnv: AppEnv) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getOverlayStateForOwner(runtimeEnv, userId);
}

function buildOverlayPath(slug: string, token: string) {
  return `/${slug}/stream-playlist/${token}`;
}

export const Route = createFileRoute("/api/dashboard/overlay")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireOverlayState(request, runtimeEnv);

        if (!state || !state.settings) {
          return json(
            { error: "unauthorized", message: "You need to sign in first." },
            { status: 401 }
          );
        }

        const overlayPath = buildOverlayPath(
          state.channel.slug,
          state.overlayAccessToken
        );

        return json({
          channel: state.channel,
          settings: state.settings,
          overlayPath,
          overlayUrl: `${runtimeEnv.APP_URL}${overlayPath}`,
        });
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireOverlayState(request, runtimeEnv);

        if (!state || !state.settings) {
          return json(
            { error: "unauthorized", message: "You need to sign in first." },
            { status: 401 }
          );
        }

        const payload = (await request.json().catch(() => null)) as {
          action?: "regenerateToken";
          settings?: unknown;
        } | null;

        if (payload?.action === "regenerateToken") {
          const token = await regenerateOverlayAccessToken(
            runtimeEnv,
            state.channel.id
          );
          const overlayPath = buildOverlayPath(state.channel.slug, token);

          await createAuditLog(runtimeEnv, {
            channelId: state.channel.id,
            actorUserId: state.channel.ownerUserId,
            actorType: "owner",
            action: "regenerate_overlay_token",
            entityType: "channel_settings",
            entityId: state.channel.id,
            payloadJson: JSON.stringify({ overlayPath }),
          });

          return json({
            ok: true,
            message: "Overlay URL regenerated.",
            overlayPath,
            overlayUrl: `${runtimeEnv.APP_URL}${overlayPath}`,
          });
        }

        const parsed = overlaySettingsInputSchema.safeParse(payload?.settings);

        if (!parsed.success) {
          return json(
            {
              error: "invalid_overlay_settings",
              message:
                parsed.error.issues[0]?.message ??
                "Overlay settings payload is invalid.",
            },
            { status: 400 }
          );
        }

        await updateOverlaySettings(runtimeEnv, state.channel.id, parsed.data);
        await createAuditLog(runtimeEnv, {
          channelId: state.channel.id,
          actorUserId: state.channel.ownerUserId,
          actorType: "owner",
          action: "update_overlay_settings",
          entityType: "channel_settings",
          entityId: state.channel.id,
          payloadJson: JSON.stringify(parsed.data),
        });

        return json({
          ok: true,
          message: "Overlay settings saved.",
        });
      },
    },
  },
});
