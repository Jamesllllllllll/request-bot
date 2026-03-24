// Route: Shows the public playlist page for a single channel by slug.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ChannelCommunityPanel } from "~/components/channel-community-panel";
import { ChannelRulesPanel } from "~/components/channel-rules-panel";
import { PlaylistManagementSurface } from "~/components/playlist-management-surface";
import { PublicPlayedHistoryCard } from "~/components/public-played-history-card";
import type {
  SearchSong,
  SearchSongActionRenderArgs,
  SearchSongResultState,
} from "~/components/song-search-panel";
import { SongSearchPanel } from "~/components/song-search-panel";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
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

type ViewerSessionData = {
  viewer: null | {
    user: {
      twitchUserId: string;
      displayName: string;
      login: string;
    };
  };
};

type ViewerMatch = {
  id: string;
  login: string;
  displayName: string;
};

type ChannelViewerSearchResponse = {
  users: ViewerMatch[];
  needsChatterScopeReconnect?: boolean;
};

type PublicChannelPageData = {
  channel?: {
    displayName?: string;
    login?: string;
  };
  settings?: {
    blacklistEnabled?: boolean;
    setlistEnabled?: boolean;
    letSetlistBypassBlacklist?: boolean;
    subscribersMustFollowSetlist?: boolean;
    canManageRequests?: boolean;
    canManageBlacklist?: boolean;
    canManageSetlist?: boolean;
    canManageBlockedChatters?: boolean;
    canViewVipTokens?: boolean;
    canManageVipTokens?: boolean;
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
  setlistArtists?: Array<{ artistId: number; artistName: string }>;
  blocks?: Array<{
    twitchUserId: string;
    login?: string | null;
    displayName?: string | null;
    reason?: string | null;
  }>;
  vipTokens?: Array<{
    login: string;
    displayName?: string | null;
    availableCount: number;
  }>;
  accessRole?: "anonymous" | "viewer" | "moderator" | "owner";
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
  const [pendingAddSongId, setPendingAddSongId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["channel-playlist", slug],
    queryFn: async (): Promise<PublicChannelPageData> => {
      const playlistResponse = await fetch(`/api/channel/${slug}/playlist`);
      const playlist = (await playlistResponse.json()) as {
        channel?: PublicChannelPageData["channel"];
        settings?: PublicChannelPageData["settings"];
        items?: PublicPlaylistItem[];
        playedSongs?: PlayedSongRow[];
        blacklistArtists?: PublicChannelPageData["blacklistArtists"];
        blacklistCharters?: PublicChannelPageData["blacklistCharters"];
        blacklistSongs?: PublicChannelPageData["blacklistSongs"];
        setlistArtists?: PublicChannelPageData["setlistArtists"];
        blocks?: PublicChannelPageData["blocks"];
        vipTokens?: PublicChannelPageData["vipTokens"];
        accessRole?: PublicChannelPageData["accessRole"];
      };

      return {
        ...playlist,
        items: toPlaylistItems(
          playlist.items ?? [],
          playlist.playedSongs ?? []
        ),
      };
    },
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });
  const { data: sessionData } = useQuery<ViewerSessionData>({
    queryKey: ["viewer-session"],
    queryFn: async () => {
      const response = await fetch("/api/session", {
        credentials: "include",
      });
      return response.json() as Promise<ViewerSessionData>;
    },
  });

  const channelDisplayName = data?.channel?.displayName ?? slug;
  const vipAutomationSummary = getVipAutomationSummary(data?.settings ?? {});
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
            artists: data?.blacklistArtists ?? [],
            charters: data?.blacklistCharters ?? [],
            songs: data?.blacklistSongs ?? [],
          }
        );

        return {
          disabled: reasons.length > 0,
          reasons,
        };
      },
    [data?.blacklistArtists, data?.blacklistCharters, data?.blacklistSongs]
  );
  const playlistItems = data?.items ?? [];
  const filteredItems = useMemo(
    () =>
      playlistItems.filter((item) => {
        const blacklistReasons = getBlacklistReasons(item, {
          artists: data?.blacklistArtists ?? [],
          charters: data?.blacklistCharters ?? [],
          songs: data?.blacklistSongs ?? [],
        });
        return showBlacklisted || blacklistReasons.length === 0;
      }),
    [
      data?.blacklistArtists,
      data?.blacklistCharters,
      data?.blacklistSongs,
      playlistItems,
      showBlacklisted,
    ]
  );
  const hiddenBlacklistedCount = playlistItems.length - filteredItems.length;
  const canManagePlaylist = !!data?.settings?.canManageRequests;
  const canManageBlacklist = !!data?.settings?.canManageBlacklist;
  const canManageSetlist = !!data?.settings?.canManageSetlist;
  const signedInViewer = sessionData?.viewer ?? null;
  const addSongMutation = useMutation({
    mutationFn: async (input: {
      song: SearchSong;
      requesterLogin: string;
      requesterTwitchUserId?: string;
      requesterDisplayName?: string;
    }) => {
      const response = await fetch(`/api/channel/${slug}/playlist`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "manualAdd",
          songId: input.song.id,
          requesterLogin: input.requesterLogin,
          requesterTwitchUserId: input.requesterTwitchUserId,
          requesterDisplayName: input.requesterDisplayName,
          title: input.song.title,
          artist: input.song.artist,
          album: input.song.album,
          creator: input.song.creator,
          tuning: input.song.tuning,
          parts: input.song.parts,
          durationText: input.song.durationText,
          source: input.song.source,
          sourceId: input.song.sourceId,
          candidateMatchesJson: JSON.stringify([
            {
              id: input.song.id,
              title: input.song.title,
              artist: input.song.artist,
              album: input.song.album,
              creator: input.song.creator,
              tuning: input.song.tuning,
              parts: input.song.parts ?? [],
              durationText: input.song.durationText,
              sourceId: input.song.sourceId,
            },
          ]),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error ?? body?.message ?? "Unable to add the song."
        );
      }
      return body;
    },
    onMutate: (input) => {
      setPendingAddSongId(input.song.id);
    },
    onSuccess: () => {
      setPendingAddSongId(null);
      void queryClient.invalidateQueries({
        queryKey: ["channel-playlist", slug],
      });
    },
    onSettled: () => {
      setPendingAddSongId(null);
    },
  });
  const currentViewer = signedInViewer
    ? {
        id: signedInViewer.user.twitchUserId,
        login: signedInViewer.user.login,
        displayName: signedInViewer.user.displayName,
      }
    : null;

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
        {canManagePlaylist ? (
          <div className="mt-6 px-8">
            <PlaylistManagementSurface
              apiPath={`/api/channel/${slug}/playlist`}
              queryKeyBase={`channel-playlist-management-${slug}`}
              queryKey={["channel-playlist", slug]}
              showAncillaryPanels={false}
              showManualAdd={false}
              embedCurrentPlaylist
              currentPlaylistTitle={null}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-3 px-8">
            <AnimatePresence initial={false} mode="popLayout">
              {filteredItems.map((item) => (
                <PublicPlaylistRow
                  key={item.id}
                  item={item}
                  blacklistReasons={getBlacklistReasons(item, {
                    artists: data?.blacklistArtists ?? [],
                    charters: data?.blacklistCharters ?? [],
                    songs: data?.blacklistSongs ?? [],
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
        )}
      </div>

      <SongSearchPanel
        title="Search to add a song"
        description={
          canManagePlaylist
            ? "Add the song to the playlist or assign it to a current viewer."
            : "Copy the request command and use it in Twitch chat."
        }
        placeholder={`Search songs for ${channelDisplayName}`}
        extraSearchParams={{
          channelSlug: slug,
          showBlacklisted,
        }}
        resultState={publicSearchResultState}
        useTotalForSummary
        actionsLabel={canManagePlaylist ? "Add" : "Actions"}
        renderActions={
          canManagePlaylist
            ? ({ song, resultState }: SearchSongActionRenderArgs) => (
                <ManageSearchSongActions
                  slug={slug}
                  song={song}
                  resultState={resultState}
                  currentViewer={currentViewer}
                  pendingAddSongId={pendingAddSongId}
                  mutationIsPending={addSongMutation.isPending}
                  onAdd={(requester) =>
                    addSongMutation.mutate({
                      song,
                      requesterLogin: requester.login,
                      requesterTwitchUserId: requester.id,
                      requesterDisplayName: requester.displayName,
                    })
                  }
                />
              )
            : undefined
        }
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

      <ChannelRulesPanel
        slug={slug}
        blacklistEnabled={!!data?.settings?.blacklistEnabled}
        setlistEnabled={!!data?.settings?.setlistEnabled}
        letSetlistBypassBlacklist={!!data?.settings?.letSetlistBypassBlacklist}
        subscribersMustFollowSetlist={
          !!data?.settings?.subscribersMustFollowSetlist
        }
        canManageBlacklist={canManageBlacklist}
        canManageSetlist={canManageSetlist}
        artists={data?.blacklistArtists ?? []}
        charters={data?.blacklistCharters ?? []}
        songs={data?.blacklistSongs ?? []}
        setlistArtists={data?.setlistArtists ?? []}
      />

      <ChannelCommunityPanel
        slug={slug}
        canManageBlockedChatters={!!data?.settings?.canManageBlockedChatters}
        canViewVipTokens={!!data?.settings?.canViewVipTokens}
        canManageVipTokens={!!data?.settings?.canManageVipTokens}
        blocks={data?.blocks ?? []}
        vipTokens={data?.vipTokens ?? []}
      />

      <PublicPlayedHistoryCard slug={slug} />
    </section>
  );
}

function ManageSearchSongActions(props: {
  slug: string;
  song: SearchSong;
  resultState: SearchSongResultState;
  currentViewer: ViewerMatch | null;
  pendingAddSongId: string | null;
  mutationIsPending: boolean;
  onAdd: (requester: ViewerMatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const normalizedQuery = debouncedQuery
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  const lookupQuery = useQuery<ChannelViewerSearchResponse>({
    queryKey: ["channel-viewer-search", props.slug, normalizedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        query: normalizedQuery,
      });
      const response = await fetch(
        `/api/channel/${props.slug}/viewers?${params}`
      );
      return response.json() as Promise<ChannelViewerSearchResponse>;
    },
    enabled: open && normalizedQuery.length >= 2,
  });
  const addDisabled =
    props.resultState.disabled ||
    (props.mutationIsPending && props.pendingAddSongId === props.song.id) ||
    !props.currentViewer?.login;

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="w-full px-4 shadow-none"
          onClick={() => {
            if (!props.currentViewer || props.resultState.disabled) {
              return;
            }
            props.onAdd(props.currentViewer);
          }}
          disabled={addDisabled}
        >
          {props.mutationIsPending && props.pendingAddSongId === props.song.id
            ? "Adding..."
            : "Add to playlist"}
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full px-4"
              disabled={props.resultState.disabled || props.mutationIsPending}
            >
              Add for user
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[200px] rounded-2xl border-(--border) bg-(--panel-strong) p-3 text-(--text)"
          >
            <div className="grid gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search current viewers"
              />
              {normalizedQuery.length > 0 && normalizedQuery.length < 2 ? (
                <p className="text-sm text-(--muted)">
                  Type at least 2 characters to search current viewers.
                </p>
              ) : null}
              {lookupQuery.data?.needsChatterScopeReconnect ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <p className="text-sm text-amber-100">
                    Reconnect Twitch to search viewers currently in chat.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`/auth/twitch/start?redirectTo=${encodeURIComponent(`/${props.slug}`)}`}
                    >
                      Reconnect
                    </a>
                  </Button>
                </div>
              ) : null}
              {normalizedQuery.length >= 2 ? (
                lookupQuery.isFetching ? (
                  <p className="text-sm text-(--muted)">
                    Searching current viewers...
                  </p>
                ) : (lookupQuery.data?.users?.length ?? 0) > 0 ? (
                  <div className="grid gap-1">
                    {lookupQuery.data?.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          props.onAdd(user);
                          setOpen(false);
                          setQuery("");
                          setDebouncedQuery("");
                        }}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-(--panel-soft)"
                      >
                        <div>
                          <p className="font-medium text-(--text)">
                            {user.displayName}
                          </p>
                          <p className="text-sm text-(--muted)">
                            @{user.login}
                          </p>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-(--brand-deep)">
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-(--muted)">
                    No current viewers matched that username.
                  </p>
                )
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
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
