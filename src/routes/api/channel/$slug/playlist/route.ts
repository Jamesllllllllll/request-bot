// Route: Returns public playlist data for a single channel by slug.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { getDb } from "~/lib/db/client";
import {
  getChannelBlacklistByChannelId,
  getChannelBySlug,
  getChannelSettingsByChannelId,
  getPlaylistByChannelId,
} from "~/lib/db/repositories";
import { playedSongs } from "~/lib/db/schema";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/channel/$slug/playlist")({
  server: {
    handlers: {
      GET: async ({ params }) => {
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

        const [playlist, playedRows, blacklist] = await Promise.all([
          getPlaylistByChannelId(runtimeEnv, channel.id),
          getDb(runtimeEnv).query.playedSongs.findMany({
            where: eq(playedSongs.channelId, channel.id),
            orderBy: [desc(playedSongs.playedAt)],
            limit: 500,
          }),
          getChannelBlacklistByChannelId(runtimeEnv, channel.id),
        ]);
        return json({
          channel,
          items: playlist?.items ?? [],
          playedSongs: playedRows,
          blacklistArtists: blacklist.blacklistArtists,
          blacklistSongs: blacklist.blacklistSongs,
        });
      },
    },
  },
});
