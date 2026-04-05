// Route: Returns overlay playlist data for a tokenized public channel view.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getOverlayStateBySlugAndToken } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
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
        requestedQuery?: string | null;
        requestKind?: string | null;
        status: string;
        createdAt?: number | null;
      }>
    | undefined;
  playedSongs:
    | Array<{
        requestedByTwitchUserId?: string | null;
        requestedByLogin?: string | null;
        requestedAt?: number | null;
        playedAt?: number | null;
        createdAt?: number | null;
      }>
    | undefined;
}) {
  const items = input.items ?? [];
  const pickNumbers = getPickNumbersForQueuedItems(
    items,
    input.playedSongs ?? []
  );

  return items.map((item, index) => ({
    id: item.id,
    songTitle: item.songTitle,
    songArtist: item.songArtist,
    songAlbum: item.songAlbum,
    songCreator: item.songCreator,
    songTuning: item.songTuning,
    songDurationText: item.songDurationText,
    requestedByDisplayName: item.requestedByDisplayName,
    requestedByLogin: item.requestedByLogin,
    requestedQuery: item.requestedQuery,
    requestKind:
      item.requestKind === "vip" || item.status === "vip" ? "vip" : "regular",
    pickNumber: pickNumbers[index] ?? null,
    status: item.status,
  }));
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
