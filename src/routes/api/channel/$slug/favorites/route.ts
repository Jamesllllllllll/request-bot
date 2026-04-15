import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { notifyPlaylistStream } from "~/lib/backend";
import {
  createAuditLog,
  getCatalogSongById,
  getChannelBySlug,
  getChannelFavoritedSongGroupKeys,
  getChannelFavoriteSongsPage,
  setChannelFavoriteChart,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { requirePlaylistManagementState } from "~/lib/server/playlist-management";
import { json } from "~/lib/utils";
import {
  channelFavoriteMutationSchema,
  favoriteSongsPageSchema,
} from "~/lib/validation";

export const Route = createFileRoute("/api/channel/$slug/favorites")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const runtimeEnv = env as AppEnv;
        const channel = await getChannelBySlug(runtimeEnv, params.slug);

        if (!channel) {
          return json({ error: "Channel not found." }, { status: 404 });
        }

        const url = new URL(request.url);
        const summaryOnly = url.searchParams.get("summary") === "1";
        const parsed = favoriteSongsPageSchema.safeParse({
          page: url.searchParams.get("page") ?? undefined,
          pageSize: url.searchParams.get("pageSize") ?? undefined,
        });

        if (!parsed.success) {
          return json(
            {
              error:
                parsed.error.issues[0]?.message ?? "Invalid favorites page.",
            },
            { status: 400 }
          );
        }

        if (summaryOnly) {
          const favoritedGroupKeys = await getChannelFavoritedSongGroupKeys(
            runtimeEnv,
            channel.id
          );

          return json({
            items: [],
            favoritedChartSongIds: [],
            favoritedGroupKeys,
            total: favoritedGroupKeys.length,
            page: 1,
            limit: 0,
            hasPrevious: false,
            hasNext: false,
          });
        }

        return json(
          await getChannelFavoriteSongsPage(runtimeEnv, {
            channelId: channel.id,
            page: parsed.data.page,
            limit: parsed.data.pageSize,
          })
        );
      },
      POST: async ({ params, request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requirePlaylistManagementState(
          request,
          runtimeEnv,
          params.slug
        );

        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        if (state.accessRole !== "owner") {
          return json(
            {
              error: "Only the streamer can manage favorites.",
            },
            { status: 403 }
          );
        }

        const payload = channelFavoriteMutationSchema.safeParse(
          await request.json().catch(() => null)
        );

        if (!payload.success) {
          return json(
            {
              error:
                payload.error.issues[0]?.message ?? "Invalid favorite update.",
            },
            { status: 400 }
          );
        }

        const song = await getCatalogSongById(
          runtimeEnv,
          payload.data.catalogSongId
        );

        if (!song) {
          return json({ error: "Song not found." }, { status: 404 });
        }

        await setChannelFavoriteChart(runtimeEnv, {
          channelId: state.channel.id,
          catalogSongId: payload.data.catalogSongId,
          favorited: payload.data.favorited,
        });

        try {
          await createAuditLog(runtimeEnv, {
            channelId: state.channel.id,
            actorUserId: state.actorUserId,
            actorType: "owner",
            action: payload.data.favorited
              ? "favorite_song"
              : "unfavorite_song",
            entityType: "catalog_song",
            entityId: song.id,
            payloadJson: JSON.stringify({
              title: song.title,
              artist: song.artist ?? null,
              sourceId: song.sourceId ?? null,
              groupedProjectId: song.groupedProjectId ?? null,
            }),
          });
        } catch (error) {
          console.error("Failed to write favorite-song audit log", {
            channelId: state.channel.id,
            actorUserId: state.actorUserId,
            songId: song.id,
            favorited: payload.data.favorited,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        await notifyPlaylistStream(runtimeEnv, {
          channelId: state.channel.id,
          reason: "favorites",
        });

        return json({
          ok: true,
          favorited: payload.data.favorited,
        });
      },
    },
  },
});
