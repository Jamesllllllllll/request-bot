// Route: Returns overlay playlist data for a tokenized public channel view.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getOverlayStateBySlugAndToken } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

function toOverlayItems(input: {
  items:
    | Array<{
        id: string;
        songTitle: string;
        songArtist?: string | null;
        songAlbum?: string | null;
        songCreator?: string | null;
        songTuning?: string | null;
        songDurationText?: string | null;
        requestedByTwitchUserId?: string | null;
        requestedByDisplayName?: string | null;
        requestedByLogin?: string | null;
        requestKind?: string | null;
        status: string;
      }>
    | undefined;
  playedSongs:
    | Array<{
        requestedByTwitchUserId?: string | null;
        requestedByLogin?: string | null;
      }>
    | undefined;
}) {
  const playedCounts = new Map<string, number>();

  for (const row of input.playedSongs ?? []) {
    const key = row.requestedByTwitchUserId || row.requestedByLogin || "";
    if (!key) {
      continue;
    }

    playedCounts.set(key, (playedCounts.get(key) ?? 0) + 1);
  }

  const queuedCounts = new Map<string, number>();

  return (input.items ?? []).map((item) => {
    const key = item.requestedByTwitchUserId || item.requestedByLogin || "";
    const priorPlayed = key ? (playedCounts.get(key) ?? 0) : 0;
    const earlierQueued = key ? (queuedCounts.get(key) ?? 0) : 0;
    const pickNumber = key ? priorPlayed + earlierQueued + 1 : null;

    if (key) {
      queuedCounts.set(key, earlierQueued + 1);
    }

    return {
      id: item.id,
      songTitle: item.songTitle,
      songArtist: item.songArtist,
      songAlbum: item.songAlbum,
      songCreator: item.songCreator,
      songTuning: item.songTuning,
      songDurationText: item.songDurationText,
      requestedByDisplayName: item.requestedByDisplayName,
      requestedByLogin: item.requestedByLogin,
      requestKind:
        item.requestKind === "vip" || item.status === "vip" ? "vip" : "regular",
      pickNumber,
      status: item.status,
    };
  });
}

export const Route = createFileRoute("/api/overlay/$slug/$token")({
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
          return json({ error: "Overlay not found" }, { status: 404 });
        }

        return json({
          channel: {
            id: state.channel.id,
            slug: state.channel.slug,
            displayName: state.channel.displayName,
          },
          settings: state.settings,
          items: toOverlayItems({
            items: state.playlist?.items,
            playedSongs: state.playedSongs,
          }),
        });
      },
    },
  },
});
