// Route: Shows the public playlist page for a single channel by slug.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { PublicPlayedHistoryCard } from "~/components/public-played-history-card";
import type {
  SearchSong,
  SearchSongResultState,
} from "~/components/song-search-panel";
import { SongSearchPanel } from "~/components/song-search-panel";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { formatSlugTitle, pageTitle } from "~/lib/page-title";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
import { cn, decodeHtmlEntities } from "~/lib/utils";

type PublicPlaylistItem = {
  id: string;
  songTitle: string;
  songArtist?: string | null;
  songCreator?: string | null;
  songCatalogSourceId?: number | null;
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedByDisplayName?: string | null;
  requestKind?: "regular" | "vip" | null;
  status: string;
  createdAt?: number | null;
  pickNumber?: number | null;
};

type EnrichedPublicPlaylistItem = PublicPlaylistItem & {
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

type PublicChannelPageData = {
  playlist: {
    channel?: {
      displayName?: string;
      login?: string;
    };
    settings?: {
      autoGrantVipTokensToSubGifters?: boolean;
      autoGrantVipTokensToGiftRecipients?: boolean;
      autoGrantVipTokensForCheers?: boolean;
      cheerBitsPerVipToken?: number;
    };
    items?: EnrichedPublicPlaylistItem[];
    playedSongs?: PlayedSongRow[];
    blacklistArtists?: Array<{ artistId: number; artistName: string }>;
    blacklistCharters?: Array<{ charterId: number; charterName: string }>;
    blacklistSongs?: Array<{
      songId: number;
      songTitle: string;
      artistName?: string | null;
    }>;
  };
};

const publicPlaylistItemTransition = {
  duration: 0.28,
  ease: [0.2, 0, 0, 1] as const,
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

function PublicChannelPage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();
  const [showBlacklisted, setShowBlacklisted] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["public-channel-page", slug],
    queryFn: async (): Promise<PublicChannelPageData> => {
      const playlistResponse = await fetch(`/api/channel/${slug}/playlist`);
      const playlist = (await playlistResponse.json()) as {
        channel?: PublicChannelPageData["playlist"]["channel"];
        settings?: PublicChannelPageData["playlist"]["settings"];
        items?: PublicPlaylistItem[];
        playedSongs?: PlayedSongRow[];
        blacklistArtists?: PublicChannelPageData["playlist"]["blacklistArtists"];
        blacklistCharters?: PublicChannelPageData["playlist"]["blacklistCharters"];
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

  const channelDisplayName = data?.playlist?.channel?.displayName ?? slug;
  const vipAutomationSummary = getVipAutomationSummary(
    data?.playlist.settings ?? {}
  );
  const publicSearchResultState = useMemo(
    () =>
      (song: SearchSong): SearchSongResultState => {
        const reasons = getBlacklistReasons(
          {
            songCatalogSourceId: song.sourceId ?? null,
            songArtist: song.artist ?? null,
            songCreator: song.creator ?? null,
          },
          {
            artists: data?.playlist.blacklistArtists ?? [],
            charters: data?.playlist.blacklistCharters ?? [],
            songs: data?.playlist.blacklistSongs ?? [],
          }
        );

        return {
          disabled: reasons.length > 0,
          reasons,
        };
      },
    [
      data?.playlist.blacklistArtists,
      data?.playlist.blacklistCharters,
      data?.playlist.blacklistSongs,
    ]
  );
  const playlistItems = data?.playlist?.items ?? [];
  const filteredItems = useMemo(
    () =>
      playlistItems.filter((item) => {
        const blacklistReasons = getBlacklistReasons(item, {
          artists: data?.playlist.blacklistArtists ?? [],
          charters: data?.playlist.blacklistCharters ?? [],
          songs: data?.playlist.blacklistSongs ?? [],
        });
        return showBlacklisted || blacklistReasons.length === 0;
      }),
    [
      data?.playlist.blacklistArtists,
      data?.playlist.blacklistCharters,
      data?.playlist.blacklistSongs,
      playlistItems,
      showBlacklisted,
    ]
  );
  const hiddenBlacklistedCount = playlistItems.length - filteredItems.length;

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
        {vipAutomationSummary ? (
          <div className="mt-5 px-8">
            <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-[22px] border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
              <span className="rounded-full border border-violet-300/30 bg-violet-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100">
                VIP tokens
              </span>
              <span>{vipAutomationSummary}</span>
            </div>
          </div>
        ) : null}
        {isLoading ? <p className="mt-4 px-8">Loading playlist...</p> : null}
        <div className="mt-6 grid gap-3 px-8">
          <AnimatePresence initial={false} mode="popLayout">
            {filteredItems.map((item) => (
              <PublicPlaylistRow
                key={item.id}
                item={item}
                blacklistReasons={getBlacklistReasons(item, {
                  artists: data?.playlist.blacklistArtists ?? [],
                  charters: data?.playlist.blacklistCharters ?? [],
                  songs: data?.playlist.blacklistSongs ?? [],
                })}
              />
            ))}
          </AnimatePresence>
          {!isLoading && !filteredItems.length ? (
            <p className="text-sm text-(--muted)">
              {playlistItems.length > 0 && !showBlacklisted
                ? "Only blacklisted songs are in the queue right now."
                : "This playlist is empty right now."}
            </p>
          ) : null}
        </div>
      </div>

      <SongSearchPanel
        title="Search to add a song"
        description="Copy the request command and use it in Twitch chat."
        placeholder={`Search songs for ${channelDisplayName}`}
        extraSearchParams={{
          channelSlug: slug,
          showBlacklisted,
        }}
        resultState={publicSearchResultState}
        useTotalForSummary
        advancedFiltersContent={
          <div className="inline-flex flex-wrap items-center gap-3 rounded-full border border-(--border) bg-(--panel) px-4 py-2.5">
            <Checkbox
              id="show-blacklisted-public-playlist"
              checked={showBlacklisted}
              onCheckedChange={(checked) =>
                setShowBlacklisted(checked === true)
              }
            />
            <Label
              htmlFor="show-blacklisted-public-playlist"
              className="cursor-pointer text-sm font-medium text-(--text)"
            >
              Show blacklisted songs
            </Label>
            {!showBlacklisted && hiddenBlacklistedCount > 0 ? (
              <span className="text-xs text-(--muted)">
                Hiding {hiddenBlacklistedCount}
              </span>
            ) : null}
          </div>
        }
      />

      <BlacklistPanel
        artists={data?.playlist.blacklistArtists ?? []}
        charters={data?.playlist.blacklistCharters ?? []}
        songs={data?.playlist.blacklistSongs ?? []}
        description="These exact artist IDs and track IDs are blocked for requests in this channel."
      />

      <PublicPlayedHistoryCard slug={slug} />
    </section>
  );
}

function getVipAutomationSummary(input: {
  autoGrantVipTokensToSubGifters?: boolean;
  autoGrantVipTokensToGiftRecipients?: boolean;
  autoGrantVipTokensForCheers?: boolean;
  cheerBitsPerVipToken?: number;
}) {
  const parts: string[] = [];

  if (input.autoGrantVipTokensToSubGifters) {
    parts.push("Gift 1 sub");
  }

  if (input.autoGrantVipTokensToGiftRecipients) {
    parts.push("Receive a gifted sub");
  }

  if (input.autoGrantVipTokensForCheers && input.cheerBitsPerVipToken) {
    parts.push(`Cheer ${input.cheerBitsPerVipToken} bits`);
  }

  if (!parts.length) {
    return null;
  }

  return `1 VIP token = ${parts.join(" or ")}.`;
}

function PublicPlaylistRow(props: {
  item: EnrichedPublicPlaylistItem;
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

function BlacklistReasonBadge(props: { reason: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
      {props.reason}
    </span>
  );
}

function normalizeBlacklistValue(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getBlacklistReasons(
  item: {
    songCatalogSourceId?: number | null;
    songArtist?: string | null;
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
  }
) {
  const reasons: string[] = [];
  const artistName = normalizeBlacklistValue(item.songArtist);
  const creatorName = normalizeBlacklistValue(item.songCreator);

  if (
    item.songCatalogSourceId != null &&
    blacklist.songs.some((song) => song.songId === item.songCatalogSourceId)
  ) {
    reasons.push("Song blacklisted");
  }

  if (
    artistName &&
    blacklist.artists.some(
      (artist) => normalizeBlacklistValue(artist.artistName) === artistName
    )
  ) {
    reasons.push("Artist blacklisted");
  }

  if (
    creatorName &&
    blacklist.charters.some(
      (charter) => normalizeBlacklistValue(charter.charterName) === creatorName
    )
  ) {
    reasons.push("Creator blacklisted");
  }

  return reasons;
}
