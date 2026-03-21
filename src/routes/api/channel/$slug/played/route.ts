// Route: Returns paginated played-song history for a public channel playlist.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getChannelBySlug, getPlayedHistoryPage } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/channel/$slug/played")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const runtimeEnv = env as AppEnv;
        const channel = await getChannelBySlug(runtimeEnv, params.slug);

        if (!channel) {
          return json({ error: "Channel not found" }, { status: 404 });
        }

        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const pageSize = Math.min(
          20,
          Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"))
        );
        const query = url.searchParams.get("query") ?? undefined;
        const requesterId = url.searchParams.get("requesterId") ?? undefined;

        return json(
          await getPlayedHistoryPage(runtimeEnv, {
            channelId: channel.id,
            page,
            pageSize,
            query,
            requesterId,
          })
        );
      },
    },
  },
});
