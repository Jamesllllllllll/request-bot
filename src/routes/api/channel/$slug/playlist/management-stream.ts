import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { callBackend } from "~/lib/backend";
import type { AppEnv } from "~/lib/env";
import { requirePlaylistManagementAccess } from "~/lib/server/playlist-management";

export const Route = createFileRoute(
  "/api/channel/$slug/playlist/management-stream"
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const access = await requirePlaylistManagementAccess(
          request,
          runtimeEnv,
          params.slug
        );

        if (!access) {
          return new Response("Unauthorized", { status: 401 });
        }

        return callBackend(
          runtimeEnv,
          `/internal/playlist/stream?channelId=${encodeURIComponent(
            access.channel.id
          )}`,
          {
            method: "GET",
          }
        );
      },
    },
  },
});
