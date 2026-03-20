// Route: Returns paginated played-song history for a public channel playlist.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { getDb } from "~/lib/db/client";
import {
  getChannelBySlug,
  getChannelSettingsByChannelId,
} from "~/lib/db/repositories";
import { playedSongs } from "~/lib/db/schema";
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

        const settings = await getChannelSettingsByChannelId(
          runtimeEnv,
          channel.id
        );
        if (settings && !settings.publicPlaylistEnabled) {
          return json({ error: "Playlist is private" }, { status: 403 });
        }

        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const pageSize = Math.min(
          20,
          Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"))
        );
        const offset = (page - 1) * pageSize;

        const rows = await getDb(runtimeEnv).query.playedSongs.findMany({
          where: eq(playedSongs.channelId, channel.id),
          orderBy: [desc(playedSongs.playedAt)],
          limit: pageSize + 1,
          offset,
        });

        return json({
          results: rows.slice(0, pageSize),
          page,
          pageSize,
          hasNextPage: rows.length > pageSize,
        });
      },
    },
  },
});
