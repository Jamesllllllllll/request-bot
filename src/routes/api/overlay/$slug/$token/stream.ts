// Route: Streams overlay playlist updates for a tokenized public channel view.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { callBackend } from "~/lib/backend";
import { getOverlayStateBySlugAndToken } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";

export const Route = createFileRoute("/api/overlay/$slug/$token/stream")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const runtimeEnv = env as AppEnv;
        const state = await getOverlayStateBySlugAndToken(
          runtimeEnv,
          params.slug,
          params.token
        );

        if (!state) {
          return new Response("Overlay not found", { status: 404 });
        }

        return callBackend(
          runtimeEnv,
          `/internal/playlist/stream?channelId=${encodeURIComponent(state.channel.id)}`,
          {
            method: "GET",
          }
        );
      },
    },
  },
});
