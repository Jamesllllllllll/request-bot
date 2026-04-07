import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { callBackend } from "~/lib/backend";
import type { AppEnv } from "~/lib/env";
import { requirePlaylistManagementState } from "~/lib/server/playlist-management";

export const Route = createFileRoute(
  "/api/channel/$slug/playlist/management-stream"
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requirePlaylistManagementState(
          request,
          runtimeEnv,
          params.slug
        );

        if (!state) {
          return new Response("Unauthorized", { status: 401 });
        }

        return callBackend(
          runtimeEnv,
          `/internal/playlist/stream?channelId=${encodeURIComponent(
            state.channel.id
          )}`,
          {
            method: "GET",
          }
        );
      },
    },
  },
});
