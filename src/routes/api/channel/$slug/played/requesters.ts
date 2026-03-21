// Route: Returns matching played-history requesters for a public channel playlist.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  getChannelBySlug,
  searchPlayedSongRequesters,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/channel/$slug/played/requesters")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const runtimeEnv = env as AppEnv;
        const channel = await getChannelBySlug(runtimeEnv, params.slug);

        if (!channel) {
          return json({ error: "Channel not found" }, { status: 404 });
        }

        const url = new URL(request.url);
        const query = url.searchParams.get("query") ?? "";

        return json({
          results: await searchPlayedSongRequesters(runtimeEnv, {
            channelId: channel.id,
            query,
          }),
        });
      },
    },
  },
});
