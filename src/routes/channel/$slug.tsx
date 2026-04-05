// Route: Preserves the channel alias path for a public playlist by slug.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { PickOrderBadge } from "~/components/pick-order-badge";
import { PublicPlayedHistoryCard } from "~/components/public-played-history-card";
import { RequesterChatBadges } from "~/components/requester-chat-badges";
import { Badge } from "~/components/ui/badge";
import { getBlacklistReasons as getChannelBlacklistReasons } from "~/lib/channel-blacklist";
import { useLocaleTranslation } from "~/lib/i18n/client";
import { getLocalizedPageTitle } from "~/lib/i18n/metadata";
import { formatSlugTitle } from "~/lib/page-title";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
import { formatPathLabel } from "~/lib/request-policy";
import { getPrimaryRequestedPath } from "~/lib/requested-paths";
import type { RequesterChatBadge } from "~/lib/twitch/chat-badges";
import { cn, decodeHtmlEntities } from "~/lib/utils";

type ChannelPlaylistItem = {
  id: string;
  position?: number | null;
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
  requesterChatBadges?: RequesterChatBadge[] | null;
  requestKind?: "regular" | "vip" | null;
  vipTokenCost?: number | null;
  requestedQuery?: string | null;
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
    settings?: {
      blacklistEnabled?: boolean;
      showPlaylistPositions?: boolean;
      showPickOrderBadges?: boolean;
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
  head: async ({ params }) => ({
    meta: [
      {
        title: await getLocalizedPageTitle({
          namespace: "playlist",
          key: "page.title",
          options: {
            channel: formatSlugTitle(params.slug),
          },
        }),
      },
    ],
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

function getStoredVipTokenCost(input: {
  requestKind?: "regular" | "vip" | null;
  vipTokenCost?: number | null;
}) {
  if (
    typeof input.vipTokenCost === "number" &&
    Number.isFinite(input.vipTokenCost) &&
    input.vipTokenCost > 0
  ) {
    return Math.trunc(input.vipTokenCost);
  }

  return input.requestKind === "vip" ? 1 : 0;
}

function getRequestedPathLabel(input: { requestedQuery?: string | null }) {
  const requestedPath = getPrimaryRequestedPath(input);
  return requestedPath ? formatPathLabel(requestedPath) : null;
}

function formatCompactPlaylistRelativeTime(
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const elapsedMs = Math.max(0, Date.now() - timestamp);

  if (elapsedMs < 60_000) {
    return t("row.relative.now");
  }

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) {
    return t("row.relative.minutes", { count: minutes });
  }

  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) {
    return t("row.relative.hours", { count: hours });
  }

  const days = Math.floor(elapsedMs / 86_400_000);
  return t("row.relative.days", { count: days });
}

function ChannelPage() {
  const { slug } = Route.useParams();
  const { t } = useLocaleTranslation("playlist");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["channel-page", slug],
    queryFn: async (): Promise<ChannelPageData> => {
      const playlistResponse = await fetch(`/api/channel/${slug}/playlist`);
      const playlist = (await playlistResponse.json()) as {
        channel?: ChannelPageData["playlist"]["channel"];
        settings?: ChannelPageData["playlist"]["settings"];
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
  const blacklistEnabled = !!data?.playlist.settings?.blacklistEnabled;
  const showPlaylistPositions =
    !!data?.playlist.settings?.showPlaylistPositions;
  const showPickOrderBadges = !!data?.playlist.settings?.showPickOrderBadges;
  const filteredItems = useMemo(
    () =>
      blacklistEnabled
        ? playlistItems.filter((item) => {
            const blacklistReasons = getBlacklistReasons(item, {
              artists: data?.playlist.blacklistArtists ?? [],
              charters: data?.playlist.blacklistCharters ?? [],
              songs: data?.playlist.blacklistSongs ?? [],
              songGroups: data?.playlist.blacklistSongGroups ?? [],
            });
            return blacklistReasons.length === 0;
          })
        : playlistItems,
    [
      blacklistEnabled,
      data?.playlist.blacklistArtists,
      data?.playlist.blacklistCharters,
      data?.playlist.blacklistSongs,
      data?.playlist.blacklistSongGroups,
      playlistItems,
    ]
  );
  return (
    <section className="page-section-stack grid gap-6">
      <div className="border border-(--border) bg-(--panel-strong) p-8 shadow-none max-[960px]:border-x-0 max-[960px]:bg-transparent max-[960px]:px-0 max-[960px]:py-6">
        <h1 className="text-4xl font-semibold">
          {t("page.title", {
            channel: data?.playlist?.channel?.displayName ?? slug,
          })}
        </h1>
        {isLoading ? <p className="mt-4">Loading playlist...</p> : null}
        <div className="mt-6 overflow-hidden border border-(--border) max-[960px]:border-x-0">
          <AnimatePresence initial={false} mode="popLayout">
            {filteredItems.map((item, index) => (
              <PublicPlaylistRow
                key={item.id}
                item={item}
                index={index}
                showPlaylistPositions={showPlaylistPositions}
                showPickOrderBadges={showPickOrderBadges}
                blacklistReasons={
                  blacklistEnabled
                    ? getBlacklistReasons(item, {
                        artists: data?.playlist.blacklistArtists ?? [],
                        charters: data?.playlist.blacklistCharters ?? [],
                        songs: data?.playlist.blacklistSongs ?? [],
                        songGroups: data?.playlist.blacklistSongGroups ?? [],
                      })
                    : []
                }
              />
            ))}
          </AnimatePresence>
          {!isLoading && !filteredItems.length ? (
            <p className="text-sm text-(--muted)">
              {blacklistEnabled && playlistItems.length > 0
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
        showCharters={false}
        showVersions={false}
        description={
          blacklistEnabled
            ? "Blacklisted artists and songs are blocked for requests in this channel."
            : "Blacklist rules are off for this channel."
        }
      />

      <PublicPlayedHistoryCard slug={slug} />
    </section>
  );
}

function PublicPlaylistRow(props: {
  item: EnrichedChannelPlaylistItem;
  index: number;
  showPlaylistPositions: boolean;
  showPickOrderBadges: boolean;
  blacklistReasons: string[];
}) {
  const { t } = useLocaleTranslation("playlist");
  const isVipRequest = props.item.requestKind === "vip";
  const requesterName =
    props.item.requestedByDisplayName ??
    props.item.requestedByLogin ??
    "viewer";
  const addedLabel = props.item.createdAt
    ? formatCompactPlaylistRelativeTime(props.item.createdAt, t)
    : null;
  const metadataLine = addedLabel ? t("row.added", { time: addedLabel }) : null;
  const titleLine = [
    decodeHtmlEntities(props.item.songTitle),
    decodeHtmlEntities(props.item.songArtist),
  ]
    .filter(Boolean)
    .join(" - ");
  const rowStripeClass =
    props.index % 2 === 0 ? "bg-(--panel-soft)" : "bg-(--panel-muted)";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.985 }}
      transition={publicPlaylistItemTransition}
      className={cn(
        "px-5 py-4",
        props.index > 0 ? "border-t" : "",
        props.blacklistReasons.length > 0
          ? "border-amber-400/35 bg-amber-500/8"
          : isVipRequest
            ? `${rowStripeClass} border-violet-400/45 shadow-[0_0_0_1px_rgba(168,85,247,0.08),0_0_28px_rgba(168,85,247,0.12)]`
            : `border-(--border) ${rowStripeClass}`
      )}
    >
      <div className="flex items-start gap-4">
        <StatusColumn
          position={props.showPlaylistPositions ? props.item.position : null}
          isCurrent={props.item.status === "current"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-lg font-semibold text-(--text)">
                {titleLine}
              </p>
              {isVipRequest ? (
                <Badge className="border-violet-400/35 bg-violet-500/15 text-violet-100 hover:bg-violet-500/15">
                  {t("management.item.vipBadge")}
                </Badge>
              ) : null}
              {getRequestedPathLabel(props.item) ? (
                <Badge variant="outline">
                  {getRequestedPathLabel(props.item)}
                </Badge>
              ) : null}
            </div>
            {metadataLine ? (
              <p className="shrink-0 text-sm font-medium text-(--muted)">
                {metadataLine}
              </p>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <RequesterChatBadges badges={props.item.requesterChatBadges} />
            <p className="min-w-0 truncate text-base font-semibold text-(--text)">
              {requesterName}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.showPickOrderBadges && props.item.pickNumber != null ? (
              <PickOrderBadge pickNumber={props.item.pickNumber} />
            ) : null}
            {(isVipRequest && getStoredVipTokenCost(props.item) > 1) ||
            (!isVipRequest && getStoredVipTokenCost(props.item) > 0) ? (
              <Badge variant="outline">
                {t("management.item.vipTokens", {
                  count: getStoredVipTokenCost(props.item),
                })}
              </Badge>
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

function StatusColumn(props: {
  position: number | null | undefined;
  isCurrent: boolean;
}) {
  if (!props.isCurrent && props.position == null) {
    return null;
  }

  return (
    <div className="mt-0.5 flex w-[72px] shrink-0 flex-col items-center gap-2">
      {props.position != null ? (
        <PlaylistPositionBadge position={props.position} />
      ) : null}
      {props.isCurrent ? (
        <RecordBadge spinning={props.isCurrent} active={props.isCurrent} />
      ) : null}
    </div>
  );
}

function PlaylistPositionBadge(props: { position: number }) {
  return (
    <span className="inline-flex min-h-7 min-w-7 items-center justify-center border border-(--border-strong) bg-(--panel) px-2 text-xs font-semibold text-(--text)">
      {props.position}
    </span>
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

function BlacklistReasonBadge(props: { reason: string }) {
  return (
    <span className="inline-flex items-center border border-amber-400/35 bg-amber-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
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
