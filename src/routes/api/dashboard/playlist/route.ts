// Route: Reads and mutates playlist state for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import { getDb } from "~/lib/db/client";
import {
  getCatalogSongsByIds,
  getChannelBlacklistByChannelId,
  getChannelSettingsByChannelId,
  getDashboardChannelAccess,
  getDashboardState,
  getPlaylistByChannelId,
} from "~/lib/db/repositories";
import { playedSongs } from "~/lib/db/schema";
import {
  assertDatabaseSchemaCurrent,
  DatabaseSchemaOutOfDateError,
} from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { getArraySetting } from "~/lib/request-policy";
import { json } from "~/lib/utils";
import { playlistMutationSchema } from "~/lib/validation";

async function requireDashboardState(
  request: Request,
  runtimeEnv: AppEnv,
  requestedSlug?: string | null
) {
  await assertDatabaseSchemaCurrent(runtimeEnv);
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  const access = await getDashboardChannelAccess(
    runtimeEnv,
    userId,
    requestedSlug
  );
  if (!access) {
    return null;
  }

  if (access.accessRole === "owner") {
    const state = await getDashboardState(runtimeEnv, userId);
    if (!state) {
      return null;
    }

    return {
      ...state,
      accessRole: access.accessRole,
      actorUserId: access.actorUserId,
    };
  }

  const playlistState = await getPlaylistByChannelId(
    runtimeEnv,
    access.channel.id
  );
  const settings = await getChannelSettingsByChannelId(
    runtimeEnv,
    access.channel.id
  );
  const playedRows = await getDb(runtimeEnv).query.playedSongs.findMany({
    where: eq(playedSongs.channelId, access.channel.id),
    orderBy: [desc(playedSongs.playedAt)],
    limit: 100,
  });
  const blacklist = await getChannelBlacklistByChannelId(
    runtimeEnv,
    access.channel.id
  );
  if (!playlistState) {
    return null;
  }

  return {
    channel: access.channel,
    settings,
    playlist: playlistState.playlist,
    items: playlistState.items,
    playedSongs: playedRows,
    blacklistArtists: blacklist.blacklistArtists,
    blacklistCharters: blacklist.blacklistCharters,
    blacklistSongs: blacklist.blacklistSongs,
    accessRole: access.accessRole,
    actorUserId: access.actorUserId,
  };
}

async function enrichPlaylistItems(
  runtimeEnv: AppEnv,
  items: Array<Record<string, unknown>>
) {
  const songIds = items
    .map((item) => (typeof item.songId === "string" ? item.songId : null))
    .filter((songId): songId is string => Boolean(songId));

  const catalogSongs = await getCatalogSongsByIds(runtimeEnv, songIds);
  const catalogById = new Map(catalogSongs.map((song) => [song.id, song]));

  return items.map((item) => {
    const songId = typeof item.songId === "string" ? item.songId : null;
    const catalogSong = songId ? catalogById.get(songId) : null;

    return {
      ...item,
      songCatalogSourceId:
        item.songCatalogSourceId ?? catalogSong?.sourceId ?? null,
      songUrl: item.songUrl ?? catalogSong?.sourceUrl ?? null,
      songSourceUpdatedAt: catalogSong?.sourceUpdatedAt ?? null,
      songDownloads: catalogSong?.downloads ?? null,
    };
  });
}

export const Route = createFileRoute("/api/dashboard/playlist")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        try {
          const requestedSlug =
            new URL(request.url).searchParams.get("channel") ?? null;
          const state = await requireDashboardState(
            request,
            runtimeEnv,
            requestedSlug
          );
          if (!state) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }

          return json({
            channel: state.channel,
            playlist: state.playlist,
            items: await enrichPlaylistItems(runtimeEnv, state.items),
            playedSongs: state.playedSongs,
            blacklistArtists: state.blacklistArtists,
            blacklistCharters: state.blacklistCharters,
            blacklistSongs: state.blacklistSongs,
            accessRole: state.accessRole,
            requiredPaths: state.settings
              ? getArraySetting(state.settings.requiredPathsJson)
              : [],
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load the playlist.";
          const status =
            error instanceof DatabaseSchemaOutOfDateError ? 503 : 500;

          return json({ error: message }, { status });
        }
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const requestedSlug =
          new URL(request.url).searchParams.get("channel") ?? null;
        const state = await requireDashboardState(
          request,
          runtimeEnv,
          requestedSlug
        );
        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const body = playlistMutationSchema.parse(await request.json());
          const response = await callBackend(
            runtimeEnv,
            "/internal/playlist/mutate",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                channelId: state.channel.id,
                actorUserId: state.actorUserId,
                ...body,
              }),
            }
          );

          return new Response(await response.text(), {
            status: response.status,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Playlist update failed.";

          if (
            error instanceof DatabaseSchemaOutOfDateError ||
            message.includes("no column named request_kind")
          ) {
            return json(
              {
                error: message,
              },
              { status: 503 }
            );
          }

          return json(
            {
              error: message,
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
