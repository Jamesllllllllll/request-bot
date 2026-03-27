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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  formatBlacklistReasonLabel,
  getBlacklistReasonCodes,
} from "~/lib/channel-blacklist";
import { formatSlugTitle, pageTitle } from "~/lib/page-title";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
import { cn, decodeHtmlEntities, getErrorMessage } from "~/lib/utils";
import { formatVipTokenCount, hasRedeemableVipToken } from "~/lib/vip-tokens";

type PublicPlaylistItem = {
  id: string;
  songId?: string | null;
  songTitle: string;
  songArtist?: string | null;
  songAlbum?: string | null;
  songCreator?: string | null;
  songCatalogSourceId?: number | null;
  songGroupedProjectId?: number | null;
  songArtistId?: number | null;
  songCharterId?: number | null;
  songSourceUpdatedAt?: number | null;
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedByDisplayName?: string | null;
  requestKind?: "regular" | "vip" | null;
  status: string;
  createdAt?: number | null;
  updatedAt?: number | null;
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
      profileImageUrl?: string | null;
    };
  };
};

type ViewerRequestStateData = {
  viewer: null | {
    twitchUserId: string;
    login: string;
    displayName: string;
    profileImageUrl?: string | null;
    isSubscriber: boolean;
    subscriptionVerified: boolean;
    vipTokensAvailable: number;
    activeRequestLimit: number | null;
    access: {
      allowed: boolean;
      reason?: string;
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
  blacklistSongGroups?: Array<{
    groupedProjectId: number;
    songTitle: string;
    artistId?: number | null;
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
  const [viewerRequestFeedback, setViewerRequestFeedback] = useState<
    string | null
  >(null);
  const [viewerRequestError, setViewerRequestError] = useState<string | null>(
    null
  );
  const [pendingViewerRequest, setPendingViewerRequest] = useState<{
    action: "submit" | "remove";
    songId?: string;
    requestKind?: "regular" | "vip";
  } | null>(null);
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
        blacklistSongGroups?: PublicChannelPageData["blacklistSongGroups"];
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
  const signedInViewer = sessionData?.viewer ?? null;
  const viewerRequestStateQuery = useQuery<ViewerRequestStateData>({
    queryKey: ["channel-viewer-request-state", slug],
    queryFn: async () => {
      const response = await fetch(`/api/channel/${slug}/viewer-request`, {
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as
        | ViewerRequestStateData
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "error" in body
            ? (body.error ?? "Viewer request state failed to load.")
            : "Viewer request state failed to load."
        );
      }

      return body as ViewerRequestStateData;
    },
    enabled: !!signedInViewer && !data?.settings?.canManageRequests,
  });

  const channelDisplayName = data?.channel?.displayName ?? slug;
  const vipAutomationSummary = getVipAutomationSummary(data?.settings ?? {});
  const publicSearchResultState = useMemo(
    () =>
      (song: SearchSong): SearchSongResultState => {
        const reasons = getBlacklistReasonCodes(
          {
            songCatalogSourceId: song.sourceId ?? null,
            songGroupedProjectId: song.groupedProjectId ?? null,
            songArtistId: song.artistId ?? null,
            songArtist: song.artist ?? null,
            songCharterId: song.authorId ?? null,
            songCreator: song.creator ?? null,
          },
          {
            artists: data?.blacklistArtists ?? [],
            charters: data?.blacklistCharters ?? [],
            songs: data?.blacklistSongs ?? [],
            songGroups: data?.blacklistSongGroups ?? [],
          }
        ).map(formatBlacklistReasonLabel);

        return {
          disabled: reasons.length > 0,
          reasons,
        };
      },
    [
      data?.blacklistArtists,
      data?.blacklistCharters,
      data?.blacklistSongGroups,
      data?.blacklistSongs,
    ]
  );
  const playlistItems = data?.items ?? [];
  const filteredItems = playlistItems;
  const canManagePlaylist = !!data?.settings?.canManageRequests;
  const canManageBlacklist = !!data?.settings?.canManageBlacklist;
  const canManageSetlist = !!data?.settings?.canManageSetlist;
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
  const viewerRequestMutation = useMutation({
    mutationFn: async (input: {
      action: "submit";
      song: SearchSong;
      requestKind: "regular" | "vip";
      replaceExisting: boolean;
    }) => {
      const response = await fetch(`/api/channel/${slug}/viewer-request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "submit",
          songId: input.song.id,
          requestKind: input.requestKind,
          replaceExisting: input.replaceExisting,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ?? body?.message ?? "Unable to update your request."
        );
      }

      return body;
    },
    onMutate: (input) => {
      setViewerRequestFeedback(null);
      setViewerRequestError(null);
      setPendingViewerRequest({
        action: "submit",
        songId: input.song.id,
        requestKind: input.requestKind,
      });
    },
    onSuccess: async (payload) => {
      setViewerRequestFeedback(payload?.message ?? "Request updated.");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["channel-playlist", slug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["channel-viewer-request-state", slug],
        }),
      ]);
    },
    onError: (error) => {
      setViewerRequestError(
        getErrorMessage(error) || "Unable to update your request."
      );
    },
    onSettled: () => {
      setPendingViewerRequest(null);
    },
  });
  const removeViewerRequestsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/channel/${slug}/viewer-request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "remove",
          kind: "all",
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ?? body?.message ?? "Unable to remove your requests."
        );
      }

      return body;
    },
    onMutate: () => {
      setViewerRequestFeedback(null);
      setViewerRequestError(null);
      setPendingViewerRequest({
        action: "remove",
      });
    },
    onSuccess: async (payload) => {
      setViewerRequestFeedback(payload?.message ?? "Requests removed.");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["channel-playlist", slug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["channel-viewer-request-state", slug],
        }),
      ]);
    },
    onError: (error) => {
      setViewerRequestError(
        getErrorMessage(error) || "Unable to remove your requests."
      );
    },
    onSettled: () => {
      setPendingViewerRequest(null);
    },
  });
  const currentViewer = signedInViewer
    ? {
        id: signedInViewer.user.twitchUserId,
        login: signedInViewer.user.login,
        displayName: signedInViewer.user.displayName,
      }
    : null;
  const viewerRequestState = viewerRequestStateQuery.data?.viewer ?? null;
  const viewerActiveRequests = useMemo(
    () =>
      currentViewer
        ? playlistItems.filter(
            (item) =>
              item.requestedByTwitchUserId === currentViewer.id &&
              (item.status === "queued" || item.status === "current")
          )
        : [],
    [currentViewer, playlistItems]
  );
  const viewerActiveRequestLimitReached =
    viewerRequestState?.activeRequestLimit != null &&
    viewerActiveRequests.length >= viewerRequestState.activeRequestLimit;
  const effectiveReplaceExisting =
    viewerActiveRequests.length > 0 && viewerActiveRequestLimitReached;

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
                  isViewerRequest={
                    currentViewer != null &&
                    item.requestedByTwitchUserId === currentViewer.id
                  }
                />
              ))}
            </AnimatePresence>
            {!isLoading && !filteredItems.length ? (
              <p className="text-sm text-(--muted)">
                This playlist is empty right now.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {!canManagePlaylist && viewerRequestFeedback ? (
        <InlineStatusBanner tone="success">
          {viewerRequestFeedback}
        </InlineStatusBanner>
      ) : null}
      {!canManagePlaylist && viewerRequestError ? (
        <InlineStatusBanner tone="danger">
          {viewerRequestError}
        </InlineStatusBanner>
      ) : null}
      {!canManagePlaylist &&
      viewerRequestStateQuery.error &&
      !viewerRequestError ? (
        <InlineStatusBanner tone="danger">
          {getErrorMessage(
            viewerRequestStateQuery.error,
            "Viewer request tools failed to load."
          )}
        </InlineStatusBanner>
      ) : null}

      <SongSearchPanel
        title="Search to add a song"
        description={
          canManagePlaylist
            ? "Add the song to the playlist or assign it to a current viewer."
            : undefined
        }
        placeholder={`Search songs for ${channelDisplayName}`}
        extraSearchParams={{
          channelSlug: slug,
          showBlacklisted,
        }}
        resultState={publicSearchResultState}
        useTotalForSummary
        actionsLabel={
          canManagePlaylist ? "Add" : signedInViewer ? "Request" : "Actions"
        }
        summaryContent={
          canManagePlaylist ? null : (
            <ViewerRequestSummaryWidget
              slug={slug}
              signedInViewer={signedInViewer}
              viewerState={viewerRequestState}
              viewerStateLoading={viewerRequestStateQuery.isLoading}
              viewerStateError={viewerRequestStateQuery.error}
              activeRequests={viewerActiveRequests}
              removePending={removeViewerRequestsMutation.isPending}
              onRemoveRequests={() => removeViewerRequestsMutation.mutate()}
            />
          )
        }
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
            : signedInViewer
              ? ({ song, resultState }: SearchSongActionRenderArgs) => (
                  <ViewerSearchSongActions
                    song={song}
                    resultState={resultState}
                    viewerState={viewerRequestState}
                    viewerStateLoading={viewerRequestStateQuery.isLoading}
                    viewerStateError={getErrorMessage(
                      viewerRequestStateQuery.error,
                      ""
                    )}
                    activeRequests={viewerActiveRequests}
                    replaceExisting={effectiveReplaceExisting}
                    mutationIsPending={viewerRequestMutation.isPending}
                    pendingViewerRequest={pendingViewerRequest}
                    onSubmit={(requestKind) =>
                      viewerRequestMutation.mutate({
                        action: "submit",
                        song,
                        requestKind,
                        replaceExisting: effectiveReplaceExisting,
                      })
                    }
                  />
                )
              : undefined
        }
        advancedFiltersContent={({ data: searchData }) => (
          <div className="inline-flex w-fit self-start flex-wrap items-center gap-3 rounded-full border border-(--border) bg-(--panel) px-4 py-2.5">
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
            {!showBlacklisted &&
            (searchData?.hiddenBlacklistedCount ?? 0) > 0 ? (
              <span className="inline-flex items-center text-xs text-(--muted)">
                Hiding {searchData?.hiddenBlacklistedCount ?? 0}
              </span>
            ) : null}
          </div>
        )}
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
        songGroups={data?.blacklistSongGroups ?? []}
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

function ViewerRequestSummaryWidget(props: {
  slug: string;
  signedInViewer: ViewerSessionData["viewer"];
  viewerState: ViewerRequestStateData["viewer"];
  viewerStateLoading: boolean;
  viewerStateError: unknown;
  activeRequests: EnrichedPublicPlaylistItem[];
  removePending: boolean;
  onRemoveRequests: () => void;
}) {
  if (!props.signedInViewer) {
    return (
      <Button asChild variant="outline" className="rounded-[24px] px-4 py-3">
        <a
          href={`/auth/twitch/start?redirectTo=${encodeURIComponent(`/${props.slug}`)}`}
        >
          Sign in with Twitch
        </a>
      </Button>
    );
  }

  const viewer = props.signedInViewer.user;
  const activeLimit = props.viewerState?.activeRequestLimit ?? null;
  const limitReached =
    activeLimit != null && props.activeRequests.length >= activeLimit;
  const vipTokensLabel =
    props.viewerState != null
      ? `${formatVipTokenCount(props.viewerState.vipTokensAvailable)} VIP`
      : props.viewerStateLoading
        ? "... VIP"
        : "VIP";
  const requestsLabel =
    activeLimit != null
      ? `${props.activeRequests.length}/${activeLimit} reqs`
      : `${props.activeRequests.length} reqs`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full items-center justify-between gap-3 rounded-[24px] border border-(--border) bg-(--panel-soft) px-4 py-2.5 text-left transition-colors hover:bg-(--panel)"
        >
          {viewer.profileImageUrl ? (
            <span
              className="block shrink-0 overflow-hidden rounded-full border border-(--border-strong)"
              style={{ width: 40, height: 40, minWidth: 40 }}
            >
              <img
                src={viewer.profileImageUrl}
                alt={viewer.displayName}
                className="block h-full w-full rounded-full object-cover"
              />
            </span>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-(--border-strong) bg-(--panel-strong) text-sm font-semibold text-(--text)">
              {viewer.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-(--text)">
              {viewer.displayName}
            </span>
          </span>
          <span className="shrink-0 text-right text-xs font-medium text-(--muted)">
            <span className="inline-flex items-center gap-2">
              <span>{vipTokensLabel}</span>
              {requestsLabel}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] rounded-2xl border-(--border) bg-(--panel-strong) p-4 text-(--text)"
      >
        <div className="grid gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{viewer.displayName}</p>
            <p className="truncate text-sm text-(--muted)">@{viewer.login}</p>
          </div>
          {!props.viewerState?.access.allowed &&
          props.viewerState?.access.reason ? (
            <p className="text-sm text-(--muted)">
              {props.viewerState.access.reason}
            </p>
          ) : null}
          {props.viewerStateError ? (
            <p className="text-sm text-rose-200">
              {getErrorMessage(
                props.viewerStateError,
                "Viewer request tools failed to load."
              )}
            </p>
          ) : null}
          {limitReached && props.activeRequests.length > 0 ? (
            <p className="text-sm text-(--muted)">
              New adds replace your current requests.
            </p>
          ) : null}
          {props.activeRequests.length > 0 ? (
            <div className="grid gap-2">
              {props.activeRequests.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-(--border) bg-(--panel) px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-(--text)">
                      {item.songTitle}
                    </p>
                    <p className="truncate text-sm text-(--muted)">
                      {item.songArtist || "Unknown artist"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        item.requestKind === "vip" ? "default" : "secondary"
                      }
                    >
                      {item.requestKind === "vip" ? "VIP" : "Regular"}
                    </Badge>
                    {item.status === "current" ? (
                      <Badge variant="outline">Now playing</Badge>
                    ) : item.pickNumber != null ? (
                      <Badge variant="outline">Pick {item.pickNumber}</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--muted)">
              No requests in the playlist.
            </p>
          )}
          {props.activeRequests.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onRemoveRequests}
              disabled={props.removePending}
            >
              {props.removePending ? "Removing..." : "Remove my requests"}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ViewerSearchSongActions(props: {
  song: SearchSong;
  resultState: SearchSongResultState;
  viewerState: ViewerRequestStateData["viewer"];
  viewerStateLoading: boolean;
  viewerStateError: string;
  activeRequests: EnrichedPublicPlaylistItem[];
  replaceExisting: boolean;
  mutationIsPending: boolean;
  pendingViewerRequest: {
    action: "submit" | "remove";
    songId?: string;
    requestKind?: "regular" | "vip";
  } | null;
  onSubmit: (requestKind: "regular" | "vip") => void;
}) {
  const matchingRequest =
    props.activeRequests.find((item) => item.songId === props.song.id) ?? null;
  const activeLimit = props.viewerState?.activeRequestLimit ?? null;
  const atActiveLimit =
    activeLimit != null && props.activeRequests.length >= activeLimit;

  const regularDisabledReason = getViewerSongActionDisabledReason({
    requestKind: "regular",
    resultState: props.resultState,
    viewerState: props.viewerState,
    viewerStateLoading: props.viewerStateLoading,
    viewerStateError: props.viewerStateError,
    activeRequests: props.activeRequests,
    matchingRequest,
    atActiveLimit,
    replaceExisting: props.replaceExisting,
  });
  const vipDisabledReason = getViewerSongActionDisabledReason({
    requestKind: "vip",
    resultState: props.resultState,
    viewerState: props.viewerState,
    viewerStateLoading: props.viewerStateLoading,
    viewerStateError: props.viewerStateError,
    activeRequests: props.activeRequests,
    matchingRequest,
    atActiveLimit,
    replaceExisting: props.replaceExisting,
  });
  const regularPending =
    props.mutationIsPending &&
    props.pendingViewerRequest?.action === "submit" &&
    props.pendingViewerRequest.songId === props.song.id &&
    props.pendingViewerRequest.requestKind === "regular";
  const vipPending =
    props.mutationIsPending &&
    props.pendingViewerRequest?.action === "submit" &&
    props.pendingViewerRequest.songId === props.song.id &&
    props.pendingViewerRequest.requestKind === "vip";
  const disabledReason = regularDisabledReason || vipDisabledReason;
  const helperText =
    disabledReason === "You do not have enough VIP tokens."
      ? ""
      : disabledReason;

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="w-full px-4 shadow-none"
          onClick={() => props.onSubmit("regular")}
          disabled={!!regularDisabledReason || props.mutationIsPending}
        >
          {regularPending ? "Adding..." : "Add"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full px-4"
          onClick={() => props.onSubmit("vip")}
          disabled={!!vipDisabledReason || props.mutationIsPending}
        >
          {vipPending ? "Adding..." : "Add VIP"}
        </Button>
      </div>
      {helperText ? (
        <p className="text-right text-xs text-(--muted)">{helperText}</p>
      ) : matchingRequest ? (
        <p className="text-right text-xs text-(--muted)">
          {matchingRequest.requestKind === "vip"
            ? "Already in your queue as a VIP request."
            : "Already in your queue as a regular request."}
        </p>
      ) : null}
    </div>
  );
}

function getViewerSongActionDisabledReason(input: {
  requestKind: "regular" | "vip";
  resultState: SearchSongResultState;
  viewerState: ViewerRequestStateData["viewer"];
  viewerStateLoading: boolean;
  viewerStateError: string;
  activeRequests: EnrichedPublicPlaylistItem[];
  matchingRequest: EnrichedPublicPlaylistItem | null;
  atActiveLimit: boolean;
  replaceExisting: boolean;
}) {
  if (input.resultState.disabled) {
    return input.resultState.reasons?.length
      ? `Blacklisted - ${input.resultState.reasons.join(" · ")}`
      : "That song is unavailable here.";
  }

  if (input.viewerStateLoading) {
    return "Checking your request access...";
  }

  if (!input.viewerState) {
    return input.viewerStateError || "Viewer request tools are unavailable.";
  }

  if (!input.viewerState.access.allowed) {
    return input.viewerState.access.reason ?? "You cannot request songs here.";
  }

  if (
    input.matchingRequest &&
    input.matchingRequest.requestKind === input.requestKind &&
    !input.replaceExisting
  ) {
    return "This song is already in your active requests.";
  }

  if (
    input.atActiveLimit &&
    !input.replaceExisting &&
    !(
      input.matchingRequest &&
      input.matchingRequest.requestKind !== input.requestKind
    )
  ) {
    const activeLimit =
      input.viewerState.activeRequestLimit ?? input.activeRequests.length;
    return `You already have ${activeLimit} active request${activeLimit === 1 ? "" : "s"}.`;
  }

  if (
    input.requestKind === "vip" &&
    !hasRedeemableVipToken(input.viewerState.vipTokensAvailable)
  ) {
    return "You do not have enough VIP tokens.";
  }

  return "";
}

function InlineStatusBanner(props: {
  tone: "success" | "danger";
  children: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border px-4 py-3 text-sm",
        props.tone === "success"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-rose-500/30 bg-rose-500/10 text-rose-200"
      )}
    >
      {props.children}
    </div>
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
  isViewerRequest: boolean;
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
  const albumLabel = props.item.songAlbum
    ? decodeHtmlEntities(props.item.songAlbum)
    : null;
  const addedLabel = props.item.createdAt
    ? formatCompactPlaylistRelativeTime(props.item.createdAt)
    : null;
  const editedTimestamp = props.item.updatedAt ?? null;
  const editedLabel = editedTimestamp
    ? formatCompactPlaylistRelativeTime(editedTimestamp)
    : null;
  const showEditedLabel =
    editedTimestamp != null &&
    editedLabel != null &&
    (props.item.createdAt == null || editedTimestamp > props.item.createdAt);
  const metadataLine = [
    requesterName,
    addedLabel ? `Added ${addedLabel}` : null,
    showEditedLabel && editedLabel ? `Edited ${editedLabel}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" - ");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.985 }}
      transition={publicPlaylistItemTransition}
      className="rounded-[24px] border border-(--border) bg-(--panel-soft) px-5 py-4"
      style={
        props.isViewerRequest
          ? {
              borderColor: "var(--viewer-highlight-border)",
              backgroundColor: "var(--viewer-highlight-bg)",
            }
          : undefined
      }
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
          {albumLabel ? (
            <p className="mt-1 truncate text-sm text-(--brand-deep)">
              {albumLabel}
            </p>
          ) : null}
          <p className="mt-1 truncate text-sm font-medium text-(--muted)">
            {metadataLine}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.item.pickNumber && props.item.pickNumber <= 3 ? (
              <PickBadge pickNumber={props.item.pickNumber} />
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function formatCompactPlaylistRelativeTime(timestamp: number) {
  const elapsedMs = Math.max(0, Date.now() - timestamp);

  if (elapsedMs < 60_000) {
    return "now";
  }

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(elapsedMs / 86_400_000);
  return `${days}d`;
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
