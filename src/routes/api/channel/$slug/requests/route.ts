import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  createAuditLog,
  updateChannelRequestsEnabled,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  canManageChannelRequests,
  requirePlaylistManagementState,
} from "~/lib/server/playlist-management";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/channel/$slug/requests")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requirePlaylistManagementState(
          request,
          runtimeEnv,
          params.slug
        );

        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!canManageChannelRequests(state)) {
          return json(
            {
              error: "You do not have permission to manage requests.",
            },
            { status: 403 }
          );
        }

        const payload = (await request.json().catch(() => null)) as {
          requestsEnabled?: unknown;
        } | null;

        if (typeof payload?.requestsEnabled !== "boolean") {
          return json(
            {
              error: "Invalid request state.",
            },
            { status: 400 }
          );
        }

        await updateChannelRequestsEnabled(
          runtimeEnv,
          state.channel.id,
          payload.requestsEnabled
        );

        await createAuditLog(runtimeEnv, {
          channelId: state.channel.id,
          actorUserId: state.actorUserId,
          actorType: state.accessRole,
          action: "update_requests_enabled",
          entityType: "channel_settings",
          entityId: state.channel.id,
          payloadJson: JSON.stringify({
            requestsEnabled: payload.requestsEnabled,
          }),
        });

        return json({
          ok: true,
          requestsEnabled: payload.requestsEnabled,
        });
      },
    },
  },
});
