// Route: Preserves the channel alias path for a public playlist by slug.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { PublicPlayedHistoryCard } from "~/components/public-played-history-card";
import { getBlacklistReasons as getChannelBlacklistReasons } from "~/lib/channel-blacklist";
import { formatSlugTitle, pageTitle } from "~/lib/page-title";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
import { cn, decodeHtmlEntities } from "~/lib/utils";

type ChannelPlaylistItem = {
  id: string;
  songTitle: string;
  songArtist?: string | null;
  songCreator?: string | null;
  songCatalogSourceId?: number | null;
  songGroupedProjectId?: number | null;
  songArtistId?: number | null;
  songCharterId?: number | null;
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedByDisplayName?: string | null;
  requestKind?: "regular" | "vip" | null;
  status: string;
  createdAt?: number | null;
  pickNumber?: number | null;
};

type EnrichedChannelPlaylistItem = ChannelPlaylistItem & {
  requestKind: "regular" | "vip";
  pickNumber: number | null;
};

type PlayedSongRow = {
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedAt?: number | null;
  playedAt?: number | null;
  createdAt?: number | null;
};

type ChannelPageData = {
  playlist: {
    channel?: {
      displayName?: string;
    };
    items?: EnrichedChannelPlaylistItem[];
    playedSongs?: PlayedSongRow[];
    blacklistArtists?: Array<{ artistId: number; artistName: string }>;
    blacklistCharters?: Array<{ charterId: number; charterName: string }>;
    blacklistSongs?: Array<{
      songId: number;
      songTitle: string;
      artistName?: string | null;
    }>;
    blacklistSongGroups?: Array<{
      groupedProjectId: number;
      songTitle: string;
      artistId?: number | null;
      artistName?: string | null;
    }>;
  };
};

const publicPlaylistItemTransition = {
  duration: 0.28,
  ease: [0.2, 0, 0, 1] as const,
};

export const Route = createFileRoute("/channel/$slug")({
  head: ({ params }) => ({
    meta: [{ title: pageTitle(`${formatSlugTitle(params.slug)} Playlist`) }],
  }),
  component: ChannelPage,
});

function toPlaylistItems(
  items: ChannelPlaylistItem[],
  playedSongs: PlayedSongRow[]
): EnrichedChannelPlaylistItem[] {
  const pickNumbers = getPickNumbersForQueuedItems(items, playedSongs);

  return items.map((item, index) => {
    const requestKind: "regular" | "vip" =
      item.requestKind === "vip" || item.status === "vip" ? "vip" : "regular";

    return {
      ...item,
      requestKind,
      pickNumber: pickNumbers[index] ?? null,
    };
  });
}

function ChannelPage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["channel-page", slug],
    queryFn: async (): Promise<ChannelPageData> => {
      const playlistResponse = await fetch(`/api/channel/${slug}/playlist`);
      const playlist = (await playlistResponse.json()) as {
        channel?: ChannelPageData["playlist"]["channel"];
        items?: ChannelPlaylistItem[];
        playedSongs?: PlayedSongRow[];
        blacklistArtists?: ChannelPageData["playlist"]["blacklistArtists"];
        blacklistCharters?: ChannelPageData["playlist"]["blacklistCharters"];
        blacklistSongs?: ChannelPageData["playlist"]["blacklistSongs"];
        blacklistSongGroups?: ChannelPageData["playlist"]["blacklistSongGroups"];
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
        items: ChannelPlaylistItem[];
        playedSongs?: PlayedSongRow[];
      };

      queryClient.setQueryData(
        ["channel-page", slug],
        (current: ChannelPageData | undefined) => ({
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

  const playlistItems = data?.playlist?.items ?? [];
  const filteredItems = useMemo(
    () =>
      playlistItems.filter((item) => {
        const blacklistReasons = getBlacklistReasons(item, {
          artists: data?.playlist.blacklistArtists ?? [],
          charters: data?.playlist.blacklistCharters ?? [],
          songs: data?.playlist.blacklistSongs ?? [],
          songGroups: data?.playlist.blacklistSongGroups ?? [],
        });
        return blacklistReasons.length === 0;
      }),
    [
      data?.playlist.blacklistArtists,
      data?.playlist.blacklistCharters,
      data?.playlist.blacklistSongs,
      data?.playlist.blacklistSongGroups,
      playlistItems,
    ]
  );
  return (
    <section className="grid gap-6">
      <div className="rounded-[32px] border border-(--border) bg-(--panel-strong) p-8 shadow-(--shadow)">
        <h1 className="text-3xl font-semibold">
          {`${data?.playlist?.channel?.displayName ?? slug}'s Playlist`}
        </h1>
        {isLoading ? <p className="mt-4">Loading playlist...</p> : null}
        <div className="mt-6 grid gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {filteredItems.map((item) => (
              <PublicPlaylistRow
                key={item.id}
                item={item}
                blacklistReasons={getBlacklistReasons(item, {
                  artists: data?.playlist.blacklistArtists ?? [],
                  charters: data?.playlist.blacklistCharters ?? [],
                  songs: data?.playlist.blacklistSongs ?? [],
                  songGroups: data?.playlist.blacklistSongGroups ?? [],
                })}
              />
            ))}
          </AnimatePresence>
          {!isLoading && !filteredItems.length ? (
            <p className="text-sm text-(--muted)">
              {playlistItems.length > 0
                ? "Only blacklisted songs are in the queue right now."
                : "This playlist is empty right now."}
            </p>
          ) : null}
        </div>
      </div>

      <BlacklistPanel
        artists={data?.playlist.blacklistArtists ?? []}
        charters={data?.playlist.blacklistCharters ?? []}
        songs={data?.playlist.blacklistSongs ?? []}
        songGroups={data?.playlist.blacklistSongGroups ?? []}
        description="Artists, charters, songs, and specific versions are blocked for requests in this channel."
      />

      <PublicPlayedHistoryCard slug={slug} />
    </section>
  );
}

function PublicPlaylistRow(props: {
  item: EnrichedChannelPlaylistItem;
  blacklistReasons: string[];
}) {
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.985 }}
      transition={publicPlaylistItemTransition}
      className={cn(
        "rounded-[24px] border bg-(--panel-soft) px-5 py-4",
        props.blacklistReasons.length > 0
          ? "border-amber-400/35 bg-amber-500/8"
          : "border-(--border)"
      )}
    >
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
            {props.blacklistReasons.map((reason) => (
              <BlacklistReasonBadge key={reason} reason={reason} />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
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
      className={`flex h-14 w-14 items-center justify-center ${props.spinning ? "animate-[spin_3.2s_linear_infinite]" : ""}`}
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

function BlacklistReasonBadge(props: { reason: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
      {props.reason}
    </span>
  );
}

function getBlacklistReasons(
  item: {
    songCatalogSourceId?: number | null;
    songGroupedProjectId?: number | null;
    songArtistId?: number | null;
    songArtist?: string | null;
    songCharterId?: number | null;
    songCreator?: string | null;
  },
  blacklist: {
    artists: Array<{ artistId: number; artistName: string }>;
    charters: Array<{ charterId: number; charterName: string }>;
    songs: Array<{
      songId: number;
      songTitle: string;
      artistName?: string | null;
    }>;
    songGroups: Array<{
      groupedProjectId: number;
      songTitle: string;
      artistId?: number | null;
      artistName?: string | null;
    }>;
  }
) {
  return getChannelBlacklistReasons(item, blacklist);
}
