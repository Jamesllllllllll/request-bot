// Route: Shows the public playlist page for a single channel by slug.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { useEffect, useState } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { SongSearchPanel } from "~/components/song-search-panel";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import { formatSlugTitle, pageTitle } from "~/lib/page-title";
import { decodeHtmlEntities } from "~/lib/utils";

type PublicPlaylistItem = {
  id: string;
  songTitle: string;
  songArtist?: string | null;
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedByDisplayName?: string | null;
  requestKind?: "regular" | "vip" | null;
  status: string;
  pickNumber?: number | null;
};

type EnrichedPublicPlaylistItem = PublicPlaylistItem & {
  requestKind: "regular" | "vip";
  pickNumber: number | null;
};

type PlayedSongRow = {
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
};

type PublicChannelPageData = {
  playlist: {
    channel?: {
      displayName?: string;
      login?: string;
    };
    items?: EnrichedPublicPlaylistItem[];
    playedSongs?: PlayedSongRow[];
    blacklistArtists?: Array<{ artistId: number; artistName: string }>;
    blacklistSongs?: Array<{
      songId: number;
      songTitle: string;
      artistName?: string | null;
    }>;
  };
};

type PublicPlayedSong = {
  id: string;
  songTitle: string;
  songArtist?: string | null;
  requestedByDisplayName?: string | null;
  requestedByLogin?: string | null;
  playedAt: number;
};

type PublicPlayedHistoryResponse = {
  results: PublicPlayedSong[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};

export const Route = createFileRoute("/$slug/")({
  head: ({ params }) => ({
    meta: [{ title: pageTitle(`${formatSlugTitle(params.slug)} Playlist`) }],
  }),
  component: PublicChannelPage,
});

function toPlaylistItems(
  items: PublicPlaylistItem[],
  playedSongs: PlayedSongRow[]
): EnrichedPublicPlaylistItem[] {
  const playedCounts = new Map<string, number>();

  for (const row of playedSongs) {
    const key = row.requestedByTwitchUserId || row.requestedByLogin || "";
    if (!key) {
      continue;
    }

    playedCounts.set(key, (playedCounts.get(key) ?? 0) + 1);
  }

  const queuedCounts = new Map<string, number>();

  return items.map((item) => {
    const key = item.requestedByTwitchUserId || item.requestedByLogin || "";
    const priorPlayed = key ? (playedCounts.get(key) ?? 0) : 0;
    const earlierQueued = key ? (queuedCounts.get(key) ?? 0) : 0;
    const pickNumber = key ? priorPlayed + earlierQueued + 1 : null;
    const requestKind: "regular" | "vip" =
      item.requestKind === "vip" || item.status === "vip" ? "vip" : "regular";

    if (key) {
      queuedCounts.set(key, earlierQueued + 1);
    }

    return {
      ...item,
      requestKind,
      pickNumber,
    };
  });
}

function PublicChannelPage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["public-channel-page", slug],
    queryFn: async (): Promise<PublicChannelPageData> => {
      const playlistResponse = await fetch(`/api/channel/${slug}/playlist`);
      const playlist = (await playlistResponse.json()) as {
        channel?: PublicChannelPageData["playlist"]["channel"];
        items?: PublicPlaylistItem[];
        playedSongs?: PlayedSongRow[];
        blacklistArtists?: PublicChannelPageData["playlist"]["blacklistArtists"];
        blacklistSongs?: PublicChannelPageData["playlist"]["blacklistSongs"];
      };

      return {
        playlist: {
          ...playlist,
          items: toPlaylistItems(
            playlist.items ?? [],
            playlist.playedSongs ?? []
          ),
        },
      };
    },
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const source = new EventSource(`/api/channel/${slug}/playlist/stream`);

    source.addEventListener("playlist", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        items: PublicPlaylistItem[];
        playedSongs?: PlayedSongRow[];
      };

      queryClient.setQueryData(
        ["public-channel-page", slug],
        (current: PublicChannelPageData | undefined) => ({
          playlist: {
            ...(current?.playlist ?? {}),
            items: toPlaylistItems(
              payload.items ?? [],
              payload.playedSongs ?? []
            ),
            playedSongs:
              payload.playedSongs ?? current?.playlist.playedSongs ?? [],
          },
        })
      );
    });

    return () => {
      source.close();
    };
  }, [queryClient, slug]);

  const playedHistoryQuery = useQuery<PublicPlayedHistoryResponse>({
    queryKey: ["public-played-history", slug, historyPage],
    queryFn: async () => {
      const response = await fetch(
        `/api/channel/${slug}/played?page=${historyPage}&pageSize=20`
      );
      return response.json() as Promise<PublicPlayedHistoryResponse>;
    },
    enabled: historyOpen,
  });

  const channelDisplayName = data?.playlist?.channel?.displayName ?? slug;

  return (
    <section className="grid gap-6">
      <div className="rounded-[32px] border border-(--border) bg-(--panel-strong) py-8 shadow-(--shadow)">
        <div className="px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">
                {`${channelDisplayName}'s Playlist`}
              </h1>
            </div>
          </div>
        </div>
        {isLoading ? <p className="mt-4 px-8">Loading playlist...</p> : null}
        <div className="mt-6 grid gap-3 px-8">
          {data?.playlist?.items?.map((item) => (
            <PublicPlaylistRow key={item.id} item={item} />
          ))}
          {!isLoading && !data?.playlist?.items?.length ? (
            <p className="text-sm text-(--muted)">
              This playlist is empty right now.
            </p>
          ) : null}
        </div>
      </div>

      <SongSearchPanel
        title="Search to add a song"
        description="Copy the request command and use it in Twitch chat."
        placeholder={`Search songs for ${channelDisplayName}`}
      />

      <BlacklistPanel
        artists={data?.playlist.blacklistArtists ?? []}
        songs={data?.playlist.blacklistSongs ?? []}
        description="These exact artist IDs and track IDs are blocked for requests in this channel."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-(--border) bg-(--panel-soft) p-2 text-(--brand)">
              <History className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Played history</CardTitle>
              <p className="mt-1 text-sm text-(--muted)">
                View the 20 most recent played songs.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setHistoryOpen((current) => !current)}
          >
            {historyOpen ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide history
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show history
              </>
            )}
          </Button>
        </CardHeader>
        {historyOpen ? (
          <CardContent className="grid gap-3">
            {playedHistoryQuery.isLoading ? (
              <p className="text-sm text-(--muted)">
                Loading played history...
              </p>
            ) : null}
            {!playedHistoryQuery.isLoading &&
            (playedHistoryQuery.data?.results.length ?? 0) === 0 ? (
              <p className="text-sm text-(--muted)">
                No songs have been marked played yet.
              </p>
            ) : null}
            {playedHistoryQuery.data?.results.map((song, index) => (
              <div
                key={song.id}
                className={`rounded-[22px] border px-4 py-3 ${
                  index % 2 === 0
                    ? "border-(--border) bg-(--panel-soft)"
                    : "border-(--border) bg-(--panel-muted)"
                }`}
              >
                <p className="font-medium text-(--text)">
                  {decodeHtmlEntities(song.songTitle)}
                  {song.songArtist
                    ? ` by ${decodeHtmlEntities(song.songArtist)}`
                    : ""}
                </p>
                <p className="mt-1 text-sm text-(--muted)">
                  {(song.requestedByDisplayName ?? song.requestedByLogin)
                    ? `Requested by ${song.requestedByDisplayName ?? song.requestedByLogin} · `
                    : ""}
                  {new Date(song.playedAt).toLocaleString()}
                </p>
              </div>
            ))}
            {playedHistoryQuery.data &&
            ((playedHistoryQuery.data.page ?? 1) > 1 ||
              playedHistoryQuery.data.hasNextPage) ? (
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <p className="text-sm text-(--muted)">
                  Page {playedHistoryQuery.data.page}
                </p>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          setHistoryPage((current) => Math.max(1, current - 1))
                        }
                        disabled={(playedHistoryQuery.data.page ?? 1) <= 1}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setHistoryPage((current) => current + 1)}
                        disabled={!playedHistoryQuery.data.hasNextPage}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}

function PublicPlaylistRow(props: { item: EnrichedPublicPlaylistItem }) {
  const requesterName =
    props.item.requestedByDisplayName ??
    props.item.requestedByLogin ??
    "viewer";
  const titleLine = [
    decodeHtmlEntities(props.item.songTitle),
    decodeHtmlEntities(props.item.songArtist),
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <div className="rounded-[24px] border border-(--border) bg-(--panel-soft) px-5 py-4">
      <div className="flex items-start gap-4">
        <StatusColumn
          isCurrent={props.item.status === "current"}
          isVip={props.item.requestKind === "vip"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-(--text)">
            {titleLine}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-(--muted)">
            {requesterName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.item.pickNumber && props.item.pickNumber <= 3 ? (
              <PickBadge pickNumber={props.item.pickNumber} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusColumn(props: { isCurrent: boolean; isVip: boolean }) {
  if (!props.isCurrent && !props.isVip) {
    return null;
  }

  return (
    <div className="mt-0.5 flex w-[72px] shrink-0 flex-col items-center gap-2">
      {props.isCurrent ? (
        <RecordBadge spinning={props.isCurrent} active={props.isCurrent} />
      ) : null}
      {props.isVip ? <VipTag /> : null}
    </div>
  );
}

function RecordBadge(props: { spinning: boolean; active: boolean }) {
  const activeColor = "#a855f7";

  return (
    <div
      className={`flex h-14 w-14 items-center justify-center ${props.spinning ? `animate-[spin_3.2s_linear_infinite]` : ``}`}
      style={{
        color: props.active ? activeColor : "var(--border-strong)",
        filter: props.active
          ? "drop-shadow(0 0 16px rgba(168, 85, 247, 0.28))"
          : "none",
      }}
      title={props.active ? "Now playing" : undefined}
    >
      <svg
        viewBox="0 0 48 48"
        className="h-full w-full"
        aria-hidden="true"
        fill="none"
      >
        <path
          d="M24,2.5A21.5,21.5,0,1,0,45.5,24,21.51,21.51,0,0,0,24,2.5ZM24,8A16.06,16.06,0,0,0,8,24H8M24,13.62A10.38,10.38,0,0,0,13.62,24h0M24,17.86A6.14,6.14,0,1,1,17.86,24,6.14,6.14,0,0,1,24,17.86Zm0,16.52A10.38,10.38,0,0,0,34.38,24h0M24,40.05a16.06,16.06,0,0,0,16-16h0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function VipTag() {
  return (
    <div className="inline-flex min-h-7 items-center rounded-full border border-white/15 bg-[#a855f7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white">
      VIP
    </div>
  );
}

function PickBadge(props: { pickNumber: number }) {
  const tone =
    props.pickNumber === 1
      ? { label: "1st pick", background: "#16a34a", icon: "✓" }
      : props.pickNumber === 2
        ? { label: "2nd pick", background: "#eab308", icon: "!" }
        : { label: "3rd pick", background: "#f97316", icon: "!" };

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
      style={{ background: tone.background }}
    >
      <span>{tone.icon}</span>
      <span>{tone.label}</span>
    </span>
  );
}
