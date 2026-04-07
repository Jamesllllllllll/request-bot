// Route: Shows the public playlist page for a single channel by slug.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CircleQuestionMark, Heart } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ChannelCommunityPanel } from "~/components/channel-community-panel";
import { ChannelRulesPanel } from "~/components/channel-rules-panel";
import { PickOrderBadge } from "~/components/pick-order-badge";
import {
  PlaylistManagementSurface,
  type PlaylistManagementSurfaceData,
} from "~/components/playlist-management-surface";
import { PublicPlayedHistoryCard } from "~/components/public-played-history-card";
import { RequesterChatBadges } from "~/components/requester-chat-badges";
import type {
  SearchSong,
  SearchSongActionRenderArgs,
  SearchSongResultState,
} from "~/components/song-search-panel";
import { SongSearchPanel } from "~/components/song-search-panel";
import { StatusToggleBadge } from "~/components/status-toggle-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  formatBlacklistReasonLabel,
  getBlacklistReasonCodes,
} from "~/lib/channel-blacklist";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import { getLocalizedPageTitle } from "~/lib/i18n/metadata";
import { formatSlugTitle } from "~/lib/page-title";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
import {
  ADD_REQUESTS_WHEN_LIVE_MESSAGE,
  areChannelRequestsOpen,
} from "~/lib/request-availability";
import { STREAMER_CHOICE_WARNING_CODE } from "~/lib/request-modes";
import { formatPathLabel, getArraySetting } from "~/lib/request-policy";
import {
  getAvailableRequestedPaths,
  getPrimaryRequestedPath,
  getRequestVipTokenPlan,
  getStoredRequestedPaths,
  type RequestPathOption,
  requestedPathsMatch,
} from "~/lib/requested-paths";
import type { RequesterChatBadge } from "~/lib/twitch/chat-badges";
import { cn, decodeHtmlEntities, getErrorMessage } from "~/lib/utils";
import { viewerSessionQueryOptions } from "~/lib/viewer-session-query";
import {
  getVipTokenAutomationDetails,
  getVipTokenRedemptionDetails,
} from "~/lib/vip-token-automation";
import {
  formatVipTokenCostLabel,
  getRequiredVipTokenCostForSong,
  parseVipTokenDurationThresholds,
} from "~/lib/vip-token-duration-thresholds";
import { formatVipTokenCount, hasRedeemableVipToken } from "~/lib/vip-tokens";

type PublicPlaylistItem = {
  id: string;
  position?: number | null;
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
  requesterChatBadges?: RequesterChatBadge[] | null;
  requestKind?: "regular" | "vip" | null;
  vipTokenCost?: number | null;
  requestedQuery?: string | null;
  status: string;
  createdAt?: number | null;
  editedAt?: number | null;
  pickNumber?: number | null;
  warningCode?: string | null;
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

type PendingViewerRequestState = {
  action: "submit" | "remove";
  songId?: string;
  query?: string;
  requestMode?: "catalog" | "random" | "choice";
  requestKind?: "regular" | "vip";
  requestedPath?: RequestPathOption | null;
  itemId?: string;
} | null;

type ChannelViewerSearchResponse = {
  users: ViewerMatch[];
  needsChatterScopeReconnect?: boolean;
};

type PublicChannelPageData = {
  channel?: {
    displayName?: string;
    login?: string;
    isLive?: boolean;
    botReadyState?: string | null;
  };
  settings?: {
    botChannelEnabled?: boolean;
    requestsEnabled?: boolean;
    blacklistEnabled?: boolean;
    setlistEnabled?: boolean;
    letSetlistBypassBlacklist?: boolean;
    subscribersMustFollowSetlist?: boolean;
    allowRequestPathModifiers?: boolean;
    allowedRequestPaths?: string[];
    requestPathModifierVipTokenCost?: number;
    requestPathModifierUsesVipPriority?: boolean;
    requiredPathsJson?: string | null;
    vipTokenDurationThresholdsJson?: string | null;
    requiredPathsMatchMode?: string | null;
    canManageRequests?: boolean;
    canManageBlacklist?: boolean;
    canManageSetlist?: boolean;
    canManageBlockedChatters?: boolean;
    canViewVipTokens?: boolean;
    canManageVipTokens?: boolean;
    autoGrantVipTokenToSubscribers?: boolean;
    autoGrantVipTokensForSharedSubRenewalMessage?: boolean;
    autoGrantVipTokensToSubGifters?: boolean;
    autoGrantVipTokensToGiftRecipients?: boolean;
    autoGrantVipTokensForCheers?: boolean;
    cheerBitsPerVipToken?: number;
    cheerMinimumTokenPercent?: number;
    autoGrantVipTokensForRaiders?: boolean;
    raidMinimumViewerCount?: number;
    autoGrantVipTokensForStreamElementsTips?: boolean;
    streamElementsTipAmountPerVipToken?: number;
    showPlaylistPositions?: boolean;
    showPickOrderBadges?: boolean;
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

type ManagementPlaylistItem = PublicPlaylistItem & {
  songTuning?: string | null;
  songPartsJson?: string | null;
  songDurationText?: string | null;
  songUrl?: string | null;
  songSourceUpdatedAt?: number | null;
  songDownloads?: number | null;
  warningMessage?: string | null;
  candidateMatchesJson?: string | null;
  regularPosition?: number | null;
};

type ManagementChannelPageData = Omit<
  PublicChannelPageData,
  "items" | "accessRole"
> & {
  items?: ManagementPlaylistItem[];
  accessRole?: "moderator" | "owner";
};

type FavoriteSongsData = {
  items: SearchSong[];
  favoritedChartSongIds: string[];
  total: number;
  page: number;
  limit: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type PendingFavoriteState = {
  songId: string;
  favorited: boolean;
} | null;

type PlaylistStreamMeta = {
  reason?: string | null;
  emittedAt?: number | null;
};

type PlaylistStreamPayload = {
  channel?: PublicChannelPageData["channel"];
  settings?: PublicChannelPageData["settings"];
  items?: PublicPlaylistItem[];
  playedSongs?: PlayedSongRow[];
  blacklistArtists?: PublicChannelPageData["blacklistArtists"];
  blacklistCharters?: PublicChannelPageData["blacklistCharters"];
  blacklistSongs?: PublicChannelPageData["blacklistSongs"];
  blacklistSongGroups?: PublicChannelPageData["blacklistSongGroups"];
  setlistArtists?: PublicChannelPageData["setlistArtists"];
  streamMeta?: PlaylistStreamMeta;
};

const publicPlaylistItemTransition = {
  duration: 0.28,
  ease: [0.2, 0, 0, 1] as const,
};

export const Route = createFileRoute("/$slug/")({
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

function mergeStreamPlaylistData(
  current: PublicChannelPageData | undefined,
  payload: PlaylistStreamPayload
): PublicChannelPageData {
  const nextPlayedSongs = payload.playedSongs ?? current?.playedSongs ?? [];
  const nextItems = payload.items ?? current?.items ?? [];

  return {
    ...(current ?? {}),
    channel: {
      ...(current?.channel ?? {}),
      ...(payload.channel ?? {}),
    },
    settings: {
      ...(current?.settings ?? {}),
      ...(payload.settings ?? {}),
    },
    items: toPlaylistItems(nextItems, nextPlayedSongs),
    playedSongs: nextPlayedSongs,
    blacklistArtists:
      payload.blacklistArtists ?? current?.blacklistArtists ?? [],
    blacklistCharters:
      payload.blacklistCharters ?? current?.blacklistCharters ?? [],
    blacklistSongs: payload.blacklistSongs ?? current?.blacklistSongs ?? [],
    blacklistSongGroups:
      payload.blacklistSongGroups ?? current?.blacklistSongGroups ?? [],
    setlistArtists: payload.setlistArtists ?? current?.setlistArtists ?? [],
  };
}

function getStreamReason(payload: PlaylistStreamPayload) {
  return payload.streamMeta?.reason ?? "playlist";
}

function shouldInvalidateViewerState(reason: string) {
  return (
    reason === "playlist" ||
    reason === "requests" ||
    reason === "settings" ||
    reason === "stream-status" ||
    reason === "vip-tokens"
  );
}

function shouldInvalidatePlayedHistory(reason: string) {
  return reason === "playlist";
}

function shouldInvalidateFavorites(reason: string) {
  return reason === "favorites";
}

function isStreamerChoicePlaylistItem(item: {
  warningCode?: string | null;
  requestedQuery?: string | null;
}) {
  return item.warningCode === STREAMER_CHOICE_WARNING_CODE;
}

function formatPublicPlaylistTitle(
  item: {
    songTitle: string;
    songArtist?: string | null;
    requestedQuery?: string | null;
    warningCode?: string | null;
  },
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (isStreamerChoicePlaylistItem(item)) {
    return item.requestedQuery?.trim()
      ? t("row.streamerChoiceTitle", { query: item.requestedQuery.trim() })
      : item.songTitle;
  }

  return [
    decodeHtmlEntities(item.songTitle),
    decodeHtmlEntities(item.songArtist),
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatPublicPlaylistSecondaryLine(
  item: {
    songArtist?: string | null;
    songAlbum?: string | null;
    requestedQuery?: string | null;
    warningCode?: string | null;
  },
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (isStreamerChoicePlaylistItem(item)) {
    return t("row.streamerChoiceSubtitle");
  }

  if (item.songAlbum) {
    return decodeHtmlEntities(item.songAlbum);
  }

  return item.songArtist || null;
}

function PublicChannelPage() {
  const { t } = useLocaleTranslation(["common", "playlist", "extension"]);
  const { locale } = useAppLocale();
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
  const [showDisableBotDialog, setShowDisableBotDialog] = useState(false);
  const [pendingViewerRequest, setPendingViewerRequest] =
    useState<PendingViewerRequestState>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [pendingFavoriteState, setPendingFavoriteState] =
    useState<PendingFavoriteState>(null);
  const [editingViewerRequestItemId, setEditingViewerRequestItemId] = useState<
    string | null
  >(null);
  const [playlistPollingFallbackEnabled, setPlaylistPollingFallbackEnabled] =
    useState(false);
  const [
    managementPollingFallbackEnabled,
    setManagementPollingFallbackEnabled,
  ] = useState(false);
  const publicPlaylistQueryKey = ["channel-playlist-public", slug] as const;
  const managementPlaylistQueryKey = [
    "channel-playlist-management",
    slug,
  ] as const;
  const { data: publicData, isLoading } = useQuery({
    queryKey: publicPlaylistQueryKey,
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
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: playlistPollingFallbackEnabled ? 2_000 : false,
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
    ...viewerSessionQueryOptions,
  });
  const signedInViewer = sessionData?.viewer ?? null;
  const managementQuery = useQuery<ManagementChannelPageData | null>({
    queryKey: managementPlaylistQueryKey,
    queryFn: async () => {
      const response = await fetch(`/api/channel/${slug}/playlist/management`, {
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as
        | ManagementChannelPageData
        | { error?: string }
        | null;

      if (response.status === 401 || response.status === 403) {
        return null;
      }

      if (!response.ok) {
        throw new Error(
          body && "error" in body
            ? (body.error ??
                t("management.states.playlistLoadFailed", { ns: "playlist" }))
            : t("management.states.playlistLoadFailed", { ns: "playlist" })
        );
      }

      return body as ManagementChannelPageData;
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: managementPollingFallbackEnabled ? 2_000 : false,
    refetchIntervalInBackground: false,
    enabled: !!signedInViewer,
    retry: false,
  });
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
            ? (body.error ?? t("page.viewerStateFailed", { ns: "playlist" }))
            : t("page.viewerStateFailed", { ns: "playlist" })
        );
      }

      return body as ViewerRequestStateData;
    },
    enabled: !!signedInViewer,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const favoritesQuery = useQuery<FavoriteSongsData>({
    queryKey: ["channel-favorites", slug],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "1",
      });
      const response = await fetch(`/api/channel/${slug}/favorites?${params}`);
      const body = (await response.json().catch(() => null)) as
        | FavoriteSongsData
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "error" in body
            ? (body.error ?? t("favorites.loadFailed", { ns: "playlist" }))
            : t("favorites.loadFailed", { ns: "playlist" })
        );
      }

      return body as FavoriteSongsData;
    },
    enabled: managementQuery.data?.accessRole === "owner",
    staleTime: Number.POSITIVE_INFINITY,
  });
  const data = managementQuery.data ?? publicData;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (typeof EventSource === "undefined") {
      setPlaylistPollingFallbackEnabled(true);
      return;
    }

    let fallbackTimer: number | null = null;
    const clearFallbackTimer = () => {
      if (fallbackTimer != null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const scheduleFallbackPolling = () => {
      if (fallbackTimer != null) {
        return;
      }

      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        setPlaylistPollingFallbackEnabled(true);
      }, 15_000);
    };
    const markStreamHealthy = () => {
      clearFallbackTimer();
      setPlaylistPollingFallbackEnabled(false);
    };
    const source = new EventSource(
      `/api/channel/${slug}/playlist/public-stream`
    );
    const handlePlaylistEvent = (event: Event) => {
      const payload = JSON.parse(
        (event as MessageEvent<string>).data
      ) as PlaylistStreamPayload;
      const reason = getStreamReason(payload);

      markStreamHealthy();
      queryClient.setQueryData(
        publicPlaylistQueryKey,
        (current: PublicChannelPageData | undefined) =>
          mergeStreamPlaylistData(current, payload)
      );

      if (shouldInvalidateViewerState(reason)) {
        void queryClient.invalidateQueries({
          queryKey: ["channel-viewer-request-state", slug],
          exact: false,
        });
      }

      if (shouldInvalidatePlayedHistory(reason)) {
        void queryClient.invalidateQueries({
          queryKey: ["public-played-history", slug],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["played-history-requesters", slug],
          exact: false,
        });
      }

      if (shouldInvalidateFavorites(reason)) {
        void queryClient.invalidateQueries({
          queryKey: ["channel-favorites", slug],
          exact: false,
        });
        if (showFavoritesOnly) {
          void queryClient.invalidateQueries({
            queryKey: ["song-search"],
            exact: false,
          });
        }
      }
    };

    source.onopen = () => {
      markStreamHealthy();
    };
    source.onerror = () => {
      if (source.readyState !== EventSource.OPEN) {
        scheduleFallbackPolling();
      }
    };
    source.addEventListener("playlist", handlePlaylistEvent);

    return () => {
      clearFallbackTimer();
      source.removeEventListener("playlist", handlePlaylistEvent);
      source.close();
    };
  }, [queryClient, showFavoritesOnly, slug]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      (managementQuery.data?.accessRole !== "owner" &&
        managementQuery.data?.accessRole !== "moderator")
    ) {
      return;
    }

    if (typeof EventSource === "undefined") {
      setManagementPollingFallbackEnabled(true);
      return;
    }

    let fallbackTimer: number | null = null;
    const clearFallbackTimer = () => {
      if (fallbackTimer != null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const scheduleFallbackPolling = () => {
      if (fallbackTimer != null) {
        return;
      }

      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        setManagementPollingFallbackEnabled(true);
      }, 15_000);
    };
    const markStreamHealthy = () => {
      clearFallbackTimer();
      setManagementPollingFallbackEnabled(false);
    };
    const source = new EventSource(
      `/api/channel/${slug}/playlist/management-stream`
    );
    const handlePlaylistEvent = (_event: Event) => {
      markStreamHealthy();
      void queryClient.invalidateQueries({
        queryKey: managementPlaylistQueryKey,
        refetchType: "active",
      });
    };

    source.onopen = () => {
      markStreamHealthy();
    };
    source.onerror = () => {
      if (source.readyState !== EventSource.OPEN) {
        scheduleFallbackPolling();
      }
    };
    source.addEventListener("playlist", handlePlaylistEvent);

    return () => {
      clearFallbackTimer();
      source.removeEventListener("playlist", handlePlaylistEvent);
      source.close();
    };
  }, [managementQuery.data?.accessRole, queryClient, slug]);

  const invalidatePlaylistQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: publicPlaylistQueryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: managementPlaylistQueryKey,
      }),
    ]);
  };
  const patchPlaylistSettings = (
    patch: Partial<NonNullable<PublicChannelPageData["settings"]>>
  ) => {
    queryClient.setQueryData<PublicChannelPageData>(
      publicPlaylistQueryKey,
      (current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                ...patch,
              },
            }
          : current
    );
    queryClient.setQueryData<ManagementChannelPageData | null>(
      managementPlaylistQueryKey,
      (current) =>
        current
          ? {
              ...current,
              settings: {
                ...current.settings,
                ...patch,
              },
            }
          : current
    );
  };

  const channelDisplayName = data?.channel?.displayName ?? slug;
  const channelIsLive = !!data?.channel?.isLive;
  const channelRequestsOpen = areChannelRequestsOpen(data?.channel ?? {});
  const botChannelEnabled = data?.settings?.botChannelEnabled ?? false;
  const requestsEnabled = data?.settings?.requestsEnabled ?? true;
  const requestsAvailableNow = requestsEnabled && channelRequestsOpen;
  const channelStatusTone = channelIsLive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
    : "border-slate-400/30 bg-slate-500/10 text-slate-100";
  const botStatusTone = botChannelEnabled
    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
    : "border-slate-400/30 bg-slate-500/10 text-slate-100";
  const requestStatusTone = requestsAvailableNow
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
    : requestsEnabled
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : "border-rose-500/30 bg-rose-500/10 text-rose-100";
  const vipAutomationDetails = getVipTokenAutomationDetails(
    data?.settings ?? {},
    {
      locale,
      translate: (key, options) =>
        t(key, {
          ns: "extension",
          ...(options ?? {}),
        }),
    }
  );
  const defaultSearchPathFilters = useMemo(
    () => getArraySetting(data?.settings?.requiredPathsJson),
    [data?.settings?.requiredPathsJson]
  );
  const vipTokenDurationThresholds = useMemo(
    () =>
      parseVipTokenDurationThresholds(
        data?.settings?.vipTokenDurationThresholdsJson
      ),
    [data?.settings?.vipTokenDurationThresholdsJson]
  );
  const defaultSearchPathMatchMode =
    data?.settings?.requiredPathsMatchMode === "all" ? "all" : "any";
  const blacklistEnabled = !!data?.settings?.blacklistEnabled;
  const searchExtraParams = useMemo(
    () => ({
      channelSlug: slug,
      favoritesOnly: showFavoritesOnly ? true : undefined,
      showBlacklisted: blacklistEnabled ? showBlacklisted : undefined,
    }),
    [blacklistEnabled, showBlacklisted, showFavoritesOnly, slug]
  );
  const showPlaylistPositions = !!data?.settings?.showPlaylistPositions;
  const showPickOrderBadges = !!data?.settings?.showPickOrderBadges;
  const publicSearchResultState = useMemo(
    () =>
      (
        song: SearchSong,
        context: {
          defaultPathFilters: string[];
          defaultPathFilterMatchMode: "any" | "all";
          hasOverriddenDefaultPathFilters: boolean;
        }
      ): SearchSongResultState => {
        const reasons = blacklistEnabled
          ? getBlacklistReasonCodes(
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
            ).map(formatBlacklistReasonLabel)
          : [];
        const pathWarning =
          reasons.length === 0 &&
          context.hasOverriddenDefaultPathFilters &&
          context.defaultPathFilters.length > 0 &&
          !songMatchesPathFilters(
            song.parts ?? [],
            context.defaultPathFilters,
            context.defaultPathFilterMatchMode
          )
            ? t("search.pathWarning", {
                ns: "playlist",
                count: context.defaultPathFilters.length,
                paths: formatPathFilterSummary(
                  context.defaultPathFilters,
                  context.defaultPathFilterMatchMode
                ),
              })
            : undefined;
        const vipTokenCost = getRequiredVipTokenCostForSong(
          song,
          vipTokenDurationThresholds
        );
        const vipTokenWarning =
          reasons.length === 0 && vipTokenCost > 0
            ? signedInViewer
              ? t("viewerActions.requiresVipTokens", {
                  ns: "playlist",
                  count: formatVipTokenCostLabel(vipTokenCost),
                })
              : t("viewerActions.copyVipCommandNotice", {
                  ns: "playlist",
                  count: formatVipTokenCostLabel(vipTokenCost),
                  suffix:
                    vipTokenCost > 1 ? ` *${Math.trunc(vipTokenCost)}` : "",
                })
            : undefined;

        return {
          disabled: reasons.length > 0,
          reasons,
          warning: [pathWarning, vipTokenWarning].filter(Boolean).join(" "),
          vipTokenCost: vipTokenCost > 0 ? vipTokenCost : undefined,
        };
      },
    [
      blacklistEnabled,
      data?.blacklistArtists,
      data?.blacklistCharters,
      data?.blacklistSongGroups,
      data?.blacklistSongs,
      signedInViewer,
      t,
      vipTokenDurationThresholds,
    ]
  );
  const playlistItems = publicData?.items ?? [];
  const filteredItems = playlistItems;
  const accessRole =
    managementQuery.data?.accessRole ?? publicData?.accessRole ?? "anonymous";
  const canManagePlaylist = !!managementQuery.data?.settings?.canManageRequests;
  const canManageFavorites = accessRole === "owner";
  const canManageBlacklist =
    !!managementQuery.data?.settings?.canManageBlacklist;
  const canManageSetlist = !!managementQuery.data?.settings?.canManageSetlist;
  const favoritedChartSongIds = useMemo(
    () => new Set(favoritesQuery.data?.favoritedChartSongIds ?? []),
    [favoritesQuery.data?.favoritedChartSongIds]
  );
  const isChartFavorited = (songId: string) =>
    pendingFavoriteState?.songId === songId
      ? pendingFavoriteState.favorited
      : favoritedChartSongIds.has(songId);

  const requestsEnabledMutation = useMutation({
    mutationFn: async (nextRequestsEnabled: boolean) => {
      const response = await fetch(`/api/channel/${slug}/requests`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          requestsEnabled: nextRequestsEnabled,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        requestsEnabled?: boolean;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ??
            t("states.updateRequestToggleFailed", { ns: "playlist" })
        );
      }

      return {
        requestsEnabled: body?.requestsEnabled ?? nextRequestsEnabled,
      };
    },
    onMutate: async (nextRequestsEnabled) => {
      setViewerRequestError(null);
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: publicPlaylistQueryKey,
        }),
        queryClient.cancelQueries({
          queryKey: managementPlaylistQueryKey,
        }),
      ]);
      const previousPublic = queryClient.getQueryData<PublicChannelPageData>(
        publicPlaylistQueryKey
      );
      const previousManagement =
        queryClient.getQueryData<ManagementChannelPageData | null>(
          managementPlaylistQueryKey
        );

      patchPlaylistSettings({
        requestsEnabled: nextRequestsEnabled,
      });

      return { previousPublic, previousManagement };
    },
    onError: (error, _nextRequestsEnabled, context) => {
      queryClient.setQueryData(publicPlaylistQueryKey, context?.previousPublic);
      queryClient.setQueryData(
        managementPlaylistQueryKey,
        context?.previousManagement
      );
      setViewerRequestError(
        getErrorMessage(error) ||
          t("states.updateRequestToggleFailed", { ns: "playlist" })
      );
    },
    onSuccess: async () => {
      await Promise.all([
        invalidatePlaylistQueries(),
        queryClient.invalidateQueries({
          queryKey: ["channel-viewer-request-state", slug],
        }),
      ]);
    },
  });
  const botEnabledMutation = useMutation({
    mutationFn: async (nextBotEnabled: boolean) => {
      const response = await fetch(`/api/channel/${slug}/playlist`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "setBotChannelEnabled",
          enabled: nextBotEnabled,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;

      if (!response.ok || body?.ok === false) {
        throw new Error(
          body?.error ??
            t("management.states.playlistUpdateFailed", { ns: "playlist" })
        );
      }

      return {
        botChannelEnabled: nextBotEnabled,
      };
    },
    onMutate: async (nextBotEnabled) => {
      setViewerRequestError(null);
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: publicPlaylistQueryKey,
        }),
        queryClient.cancelQueries({
          queryKey: managementPlaylistQueryKey,
        }),
      ]);
      const previousPublic = queryClient.getQueryData<PublicChannelPageData>(
        publicPlaylistQueryKey
      );
      const previousManagement =
        queryClient.getQueryData<ManagementChannelPageData | null>(
          managementPlaylistQueryKey
        );

      patchPlaylistSettings({
        botChannelEnabled: nextBotEnabled,
      });

      return { previousPublic, previousManagement };
    },
    onError: (error, _nextBotEnabled, context) => {
      queryClient.setQueryData(publicPlaylistQueryKey, context?.previousPublic);
      queryClient.setQueryData(
        managementPlaylistQueryKey,
        context?.previousManagement
      );
      setViewerRequestError(
        getErrorMessage(error) ||
          t("management.states.playlistUpdateFailed", { ns: "playlist" })
      );
    },
    onSuccess: async () => {
      await invalidatePlaylistQueries();
    },
  });

  useEffect(() => {
    if (!signedInViewer) {
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: ["channel-viewer-request-state", slug],
    });
  }, [channelRequestsOpen, queryClient, signedInViewer, slug]);

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
          body?.error ??
            body?.message ??
            t("states.unableToAddSong", { ns: "playlist" })
        );
      }
      return body;
    },
    onMutate: (input) => {
      setPendingAddSongId(input.song.id);
    },
    onSuccess: () => {
      setPendingAddSongId(null);
      void invalidatePlaylistQueries();
    },
    onSettled: () => {
      setPendingAddSongId(null);
    },
  });
  const viewerRequestMutation = useMutation({
    mutationFn: async (
      input:
        | {
            action: "submit";
            song: SearchSong;
            requestKind: "regular" | "vip";
            vipTokenCost?: number;
            requestedPath?: RequestPathOption;
            replaceExisting: boolean;
            itemId?: string;
          }
        | {
            action: "submit";
            query: string;
            requestMode: "random" | "choice";
            requestKind: "regular" | "vip";
            vipTokenCost?: number;
            replaceExisting: boolean;
            itemId?: string;
          }
    ) => {
      const response = await fetch(`/api/channel/${slug}/viewer-request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "submit",
          ...("song" in input
            ? {
                songId: input.song.id,
                requestMode: "catalog",
                requestedPath: input.requestedPath,
              }
            : {
                query: input.query,
                requestMode: input.requestMode,
              }),
          requestKind: input.requestKind,
          vipTokenCost: input.vipTokenCost,
          replaceExisting: input.replaceExisting,
          itemId: input.itemId,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ??
            body?.message ??
            t("states.unableToUpdateRequest", { ns: "playlist" })
        );
      }

      return body;
    },
    onMutate: (input) => {
      setViewerRequestFeedback(null);
      setViewerRequestError(null);
      setPendingViewerRequest({
        action: "submit",
        songId: "song" in input ? input.song.id : undefined,
        query: "query" in input ? input.query : undefined,
        requestMode: "query" in input ? input.requestMode : "catalog",
        requestKind: input.requestKind,
        requestedPath: "song" in input ? (input.requestedPath ?? null) : null,
        itemId: input.itemId,
      });
    },
    onSuccess: async (payload) => {
      setViewerRequestFeedback(
        payload?.message ?? t("states.requestUpdated", { ns: "playlist" })
      );
      setEditingViewerRequestItemId(null);
      await Promise.all([
        invalidatePlaylistQueries(),
        queryClient.invalidateQueries({
          queryKey: ["channel-viewer-request-state", slug],
        }),
      ]);
    },
    onError: (error) => {
      setViewerRequestError(
        getErrorMessage(error) ||
          t("states.unableToUpdateRequest", { ns: "playlist" })
      );
    },
    onSettled: () => {
      setPendingViewerRequest(null);
    },
  });
  const favoriteSongMutation = useMutation({
    mutationFn: async (input: { songId: string; favorited: boolean }) => {
      const response = await fetch(`/api/channel/${slug}/favorites`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          catalogSongId: input.songId,
          favorited: input.favorited,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ?? t("favorites.saveFailed", { ns: "playlist" })
        );
      }

      return body;
    },
    onMutate: (input) => {
      setPendingFavoriteState({
        songId: input.songId,
        favorited: input.favorited,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["channel-favorites", slug],
        }),
        ...(showFavoritesOnly
          ? [
              queryClient.invalidateQueries({
                queryKey: ["song-search"],
                exact: false,
              }),
            ]
          : []),
      ]);
    },
    onSettled: () => {
      setPendingFavoriteState(null);
    },
  });
  const removeViewerRequestsMutation = useMutation({
    mutationFn: async (input?: { itemId?: string }) => {
      const response = await fetch(`/api/channel/${slug}/viewer-request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "remove",
          kind: "all",
          itemId: input?.itemId,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ??
            body?.message ??
            t("states.unableToRemoveRequests", { ns: "playlist" })
        );
      }

      return body;
    },
    onMutate: (input) => {
      setViewerRequestFeedback(null);
      setViewerRequestError(null);
      setPendingViewerRequest({
        action: "remove",
        itemId: input?.itemId,
      });
    },
    onSuccess: async (payload, input) => {
      setViewerRequestFeedback(
        payload?.message ?? t("states.requestsRemoved", { ns: "playlist" })
      );
      if (input?.itemId) {
        setEditingViewerRequestItemId((current) =>
          current === input.itemId ? null : current
        );
      }
      await Promise.all([
        invalidatePlaylistQueries(),
        queryClient.invalidateQueries({
          queryKey: ["channel-viewer-request-state", slug],
        }),
      ]);
    },
    onError: (error) => {
      setViewerRequestError(
        getErrorMessage(error) ||
          t("states.unableToRemoveRequests", { ns: "playlist" })
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
  const viewerQueuedRequests = useMemo(
    () => viewerActiveRequests.filter((item) => item.status === "queued"),
    [viewerActiveRequests]
  );
  const editingViewerRequest = useMemo(
    () =>
      viewerQueuedRequests.find(
        (item) => item.id === editingViewerRequestItemId
      ) ?? null,
    [editingViewerRequestItemId, viewerQueuedRequests]
  );
  const currentViewerVipTokenCount = useMemo(() => {
    if (!signedInViewer) {
      return null;
    }

    if (viewerRequestState?.vipTokensAvailable != null) {
      return viewerRequestState.vipTokensAvailable;
    }

    const matchedVipTokenRow = data?.vipTokens?.find(
      (entry) =>
        entry.login.trim().toLowerCase() ===
        signedInViewer.user.login.trim().toLowerCase()
    );

    if (matchedVipTokenRow) {
      return matchedVipTokenRow.availableCount;
    }

    if (!canManagePlaylist && viewerRequestStateQuery.isPending) {
      return null;
    }

    return 0;
  }, [
    canManagePlaylist,
    data?.vipTokens,
    signedInViewer,
    viewerRequestState?.vipTokensAvailable,
    viewerRequestStateQuery.isPending,
  ]);
  const viewerActiveRequestLimitReached =
    viewerRequestState?.activeRequestLimit != null &&
    viewerActiveRequests.length >= viewerRequestState.activeRequestLimit;
  const effectiveReplaceExisting =
    viewerQueuedRequests.length > 0 && viewerActiveRequestLimitReached;
  const effectiveViewerReplaceExisting =
    editingViewerRequest != null || effectiveReplaceExisting;

  useEffect(() => {
    if (editingViewerRequestItemId && !editingViewerRequest) {
      setEditingViewerRequestItemId(null);
    }
  }, [editingViewerRequest, editingViewerRequestItemId]);

  function handleEditViewerRequest(itemId: string) {
    setViewerRequestFeedback(null);
    setViewerRequestError(null);
    setEditingViewerRequestItemId(itemId);
    document.getElementById("playlist-search-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleCancelViewerRequestEdit() {
    setEditingViewerRequestItemId(null);
  }

  return (
    <section className="page-section-stack grid gap-6">
      <div className="border border-(--border) bg-(--panel-strong) py-8 shadow-none max-[960px]:border-x-0 max-[960px]:bg-transparent max-[960px]:py-6 max-[960px]:[background-image:none]">
        <div className="px-8 max-[960px]:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold">
                {t("page.title", {
                  ns: "playlist",
                  channel: channelDisplayName,
                })}
              </h1>
            </div>
            {!isLoading && data?.settings ? (
              <div className="flex flex-wrap items-center justify-end gap-2 max-[960px]:w-full max-[960px]:justify-center">
                <ChannelStatusBadge
                  isLive={channelIsLive}
                  toneClassName={channelStatusTone}
                />
                {accessRole === "owner" ? (
                  <StatusToggleBadge
                    enabled={botChannelEnabled}
                    toneClassName={botStatusTone}
                    enabledLabel={t("management.bot.enabled", {
                      ns: "playlist",
                    })}
                    disabledLabel={t("management.bot.disabled", {
                      ns: "playlist",
                    })}
                    toggleAriaLabel={t("management.bot.toggleAria", {
                      ns: "playlist",
                    })}
                    disabled={botEnabledMutation.isPending}
                    onToggle={() => {
                      if (botChannelEnabled) {
                        setShowDisableBotDialog(true);
                        return;
                      }

                      botEnabledMutation.mutate(true);
                    }}
                  />
                ) : null}
                <RequestsStatusBadge
                  requestsEnabled={requestsEnabled}
                  toneClassName={requestStatusTone}
                  canManageRequests={canManagePlaylist}
                  isPending={requestsEnabledMutation.isPending}
                  onScrollToSearch={() => {
                    document
                      .getElementById("playlist-search-panel")
                      ?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                  }}
                  onToggle={() =>
                    requestsEnabledMutation.mutate(!requestsEnabled)
                  }
                />
                <VipTokenInfoBadge
                  vipAutomationDetails={vipAutomationDetails}
                  balanceCount={currentViewerVipTokenCount}
                  align="end"
                />
              </div>
            ) : null}
          </div>
        </div>
        {isLoading ? (
          <p className="mt-4 px-8 max-[960px]:px-6">
            {t("page.loading", { ns: "playlist" })}
          </p>
        ) : null}
        {canManagePlaylist ? (
          <div className="mt-6 px-8 max-[960px]:px-0 max-[960px]:[&_.dashboard-playlist__drag-handle]:rounded-none max-[960px]:[&_.dashboard-playlist__item]:rounded-none max-[960px]:[&_.dashboard-playlist__item]:border-x-0 max-[960px]:[&_.dashboard-playlist__item]:shadow-none">
            <PlaylistManagementSurface
              apiPath={`/api/channel/${slug}/playlist/management`}
              mutationPath={`/api/channel/${slug}/playlist`}
              queryKeyBase={`channel-playlist-management-${slug}`}
              queryKey={[...managementPlaylistQueryKey]}
              playlistData={
                managementQuery.data as
                  | PlaylistManagementSurfaceData
                  | undefined
              }
              refetchIntervalMs={
                managementPollingFallbackEnabled ? 2_000 : false
              }
              staleTimeMs={Number.POSITIVE_INFINITY}
              showAncillaryPanels={false}
              showManualAdd={false}
              embedCurrentPlaylist
              currentPlaylistTitle={null}
            />
          </div>
        ) : (
          <div className="mt-6 overflow-hidden border border-(--border) mx-8 max-[960px]:mx-4">
            <AnimatePresence initial={false} mode="popLayout">
              {filteredItems.map((item, index) => (
                <PublicPlaylistRow
                  key={item.id}
                  item={item}
                  index={index}
                  showPlaylistPositions={showPlaylistPositions}
                  showPickOrderBadges={showPickOrderBadges}
                  isViewerRequest={
                    currentViewer != null &&
                    item.requestedByTwitchUserId === currentViewer.id
                  }
                />
              ))}
            </AnimatePresence>
            {!isLoading && !filteredItems.length ? (
              <p className="px-5 py-4 text-sm text-(--muted) max-[960px]:px-6">
                {t("page.empty", { ns: "playlist" })}
              </p>
            ) : null}
          </div>
        )}
        <AlertDialog
          open={showDisableBotDialog}
          onOpenChange={setShowDisableBotDialog}
        >
          <AlertDialogContent className="bg-(--panel)">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("management.bot.disableDialog.title", {
                  ns: "playlist",
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("management.bot.disableDialog.description", {
                  ns: "playlist",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={botEnabledMutation.isPending}>
                {t("management.bot.disableDialog.cancel", {
                  ns: "playlist",
                })}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowDisableBotDialog(false);
                  botEnabledMutation.mutate(false);
                }}
                disabled={botEnabledMutation.isPending}
                className="border-transparent bg-rose-600 text-white shadow-none hover:bg-rose-700"
              >
                {t("management.bot.disableDialog.confirm", {
                  ns: "playlist",
                })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {!canManagePlaylist && viewerRequestFeedback ? (
        <InlineStatusBanner tone="success">
          {viewerRequestFeedback}
        </InlineStatusBanner>
      ) : null}
      {!channelRequestsOpen ? (
        <InlineStatusBanner tone="notice">
          {t("page.requestsLiveOnly", { ns: "playlist" })}
        </InlineStatusBanner>
      ) : null}
      {viewerRequestError ? (
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
            t("page.viewerToolsFailed", { ns: "playlist" })
          )}
        </InlineStatusBanner>
      ) : null}
      {favoritesQuery.error && canManageFavorites ? (
        <InlineStatusBanner tone="danger">
          {getErrorMessage(
            favoritesQuery.error,
            t("favorites.loadFailed", { ns: "playlist" })
          )}
        </InlineStatusBanner>
      ) : null}

      <div id="playlist-search-panel">
        {/*
          Keep these params stable so SongSearchPanel only resets pagination
          when the effective external filters actually change.
        */}
        <SongSearchPanel
          key={`playlist-search-${slug}-${defaultSearchPathFilters.join(",")}-${defaultSearchPathMatchMode}`}
          title={t("search.title", { ns: "playlist" })}
          searchEnabled={!isLoading}
          headerActionsContent={
            <Button
              type="button"
              variant={showFavoritesOnly ? "secondary" : "outline"}
              className="h-10 px-3.5 text-[12px] font-semibold shadow-none"
              aria-pressed={showFavoritesOnly}
              onClick={() => setShowFavoritesOnly((current) => !current)}
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  showFavoritesOnly ? "fill-current" : ""
                )}
              />
              {t("favorites.showOnly", {
                ns: "playlist",
                channel: channelDisplayName,
              })}
            </Button>
          }
          defaultPathFilters={defaultSearchPathFilters}
          defaultPathFilterMatchMode={defaultSearchPathMatchMode}
          defaultPathFilterOwnerName={channelDisplayName}
          placeholder={t("search.placeholder", {
            ns: "playlist",
            channel: channelDisplayName,
          })}
          extraSearchParams={searchExtraParams}
          resultState={publicSearchResultState}
          useTotalForSummary
          controlsContent={
            signedInViewer
              ? (_: { query: string }) => (
                  <ViewerSpecialRequestControls
                    canManagePlaylist={canManagePlaylist}
                    requestsOpen={channelRequestsOpen}
                    viewerState={viewerRequestState}
                    viewerStateLoading={viewerRequestStateQuery.isLoading}
                    viewerStateError={getErrorMessage(
                      viewerRequestStateQuery.error,
                      ""
                    )}
                    editingRequest={editingViewerRequest}
                    replaceExisting={effectiveViewerReplaceExisting}
                    mutationIsPending={viewerRequestMutation.isPending}
                    pendingViewerRequest={pendingViewerRequest}
                    onSubmit={(query, requestMode, requestKind) =>
                      viewerRequestMutation.mutate({
                        action: "submit",
                        query,
                        requestMode,
                        requestKind,
                        replaceExisting: effectiveViewerReplaceExisting,
                        itemId: editingViewerRequest?.id,
                      })
                    }
                    onCancelEdit={handleCancelViewerRequestEdit}
                  />
                )
              : undefined
          }
          actionsLabel={
            canManagePlaylist
              ? t("search.actions.add", { ns: "playlist" })
              : signedInViewer
                ? t("search.actions.request", { ns: "playlist" })
                : t("search.actions.actions", { ns: "playlist" })
          }
          summaryContent={
            canManagePlaylist ? null : (
              <ViewerRequestSummaryWidget
                slug={slug}
                signedInViewer={signedInViewer}
                viewerState={viewerRequestState}
                requestsOpen={channelRequestsOpen}
                showPickOrderBadges={showPickOrderBadges}
                viewerStateLoading={viewerRequestStateQuery.isLoading}
                viewerStateError={viewerRequestStateQuery.error}
                vipAutomationDetails={vipAutomationDetails}
                activeRequests={viewerActiveRequests}
                queuedRequests={viewerQueuedRequests}
                editingRequest={editingViewerRequest}
                requestMutationPending={viewerRequestMutation.isPending}
                pendingViewerRequest={pendingViewerRequest}
                onEditRequest={handleEditViewerRequest}
                onCancelEdit={handleCancelViewerRequestEdit}
                onRemoveRequests={(itemId) =>
                  removeViewerRequestsMutation.mutate(
                    itemId ? { itemId } : undefined
                  )
                }
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
                    requestsOpen={channelRequestsOpen}
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
                    canManageFavorites={canManageFavorites}
                    isFavorited={isChartFavorited(song.id)}
                    favoritePending={pendingFavoriteState?.songId === song.id}
                    onToggleFavorite={() =>
                      favoriteSongMutation.mutate({
                        songId: song.id,
                        favorited: !isChartFavorited(song.id),
                      })
                    }
                  />
                )
              : signedInViewer
                ? ({ song, resultState }: SearchSongActionRenderArgs) => (
                    <ViewerSearchSongActions
                      song={song}
                      resultState={resultState}
                      allowRequestPathModifiers={
                        !!data?.settings?.allowRequestPathModifiers
                      }
                      allowedRequestPaths={
                        data?.settings?.allowedRequestPaths ?? []
                      }
                      requestPathModifierVipTokenCost={
                        data?.settings?.requestPathModifierVipTokenCost ?? 0
                      }
                      requestPathModifierUsesVipPriority={
                        data?.settings?.requestPathModifierUsesVipPriority ??
                        true
                      }
                      vipTokenDurationThresholds={vipTokenDurationThresholds}
                      requestsOpen={channelRequestsOpen}
                      viewerState={viewerRequestState}
                      viewerStateLoading={viewerRequestStateQuery.isLoading}
                      viewerStateError={getErrorMessage(
                        viewerRequestStateQuery.error,
                        ""
                      )}
                      editingRequest={editingViewerRequest}
                      activeRequests={viewerActiveRequests}
                      replaceExisting={effectiveViewerReplaceExisting}
                      mutationIsPending={viewerRequestMutation.isPending}
                      pendingViewerRequest={pendingViewerRequest}
                      onSubmit={(requestKind, vipTokenCost, requestedPath) =>
                        viewerRequestMutation.mutate({
                          action: "submit",
                          song,
                          requestKind,
                          vipTokenCost,
                          requestedPath,
                          replaceExisting: effectiveViewerReplaceExisting,
                          itemId: editingViewerRequest?.id,
                        })
                      }
                    />
                  )
                : undefined
          }
          advancedFiltersContent={({ data: searchData }) => (
            <div className="inline-flex w-fit self-start flex-wrap items-center gap-4 border border-(--border) bg-(--panel) px-4 py-2.5">
              {blacklistEnabled ? (
                <div className="inline-flex items-center gap-3">
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
                    {t("search.showBlacklisted", { ns: "playlist" })}{" "}
                    <span className="text-(--muted)">
                      ({searchData?.hiddenBlacklistedCount ?? 0})
                    </span>
                  </Label>
                </div>
              ) : null}
            </div>
          )}
        />
      </div>

      <ChannelRulesPanel
        slug={slug}
        channelDisplayName={channelDisplayName}
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

      <PublicPlayedHistoryCard
        slug={slug}
        channelDisplayName={channelDisplayName}
      />
    </section>
  );
}

function ViewerRequestSummaryWidget(props: {
  slug: string;
  signedInViewer: ViewerSessionData["viewer"];
  viewerState: ViewerRequestStateData["viewer"];
  requestsOpen: boolean;
  showPickOrderBadges: boolean;
  viewerStateLoading: boolean;
  viewerStateError: unknown;
  vipAutomationDetails: ReturnType<typeof getVipTokenAutomationDetails>;
  activeRequests: EnrichedPublicPlaylistItem[];
  queuedRequests: EnrichedPublicPlaylistItem[];
  editingRequest: EnrichedPublicPlaylistItem | null;
  requestMutationPending: boolean;
  pendingViewerRequest: PendingViewerRequestState;
  onEditRequest: (itemId: string) => void;
  onCancelEdit: () => void;
  onRemoveRequests: (itemId?: string) => void;
}) {
  const { t } = useLocaleTranslation(["common", "playlist"]);
  if (!props.signedInViewer) {
    return (
      <Button asChild variant="outline" className="px-4 py-3">
        <a
          href={`/auth/twitch/start?redirectTo=${encodeURIComponent(`/${props.slug}`)}`}
        >
          {t("auth.signIn", { ns: "common" })}
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
      ? t("viewerSummary.vipTokensLabel", {
          ns: "playlist",
          count: props.viewerState.vipTokensAvailable,
          countText: formatVipTokenCount(props.viewerState.vipTokensAvailable),
        })
      : props.viewerStateLoading
        ? t("viewerSummary.vipBalanceLoading", { ns: "playlist" })
        : t("viewerSummary.vipTokensShort", { ns: "playlist" });
  const requestsLabel =
    activeLimit != null
      ? t("viewerSummary.requestsWithLimit", {
          ns: "playlist",
          count: props.activeRequests.length,
          limit: activeLimit,
        })
      : t("viewerSummary.requestsNoLimit", {
          ns: "playlist",
          count: props.activeRequests.length,
        });
  const vipBalanceSummary =
    props.viewerState != null
      ? t("viewerSummary.vipBalanceSummary", {
          ns: "playlist",
          count: props.viewerState.vipTokensAvailable,
          countText: formatVipTokenCount(props.viewerState.vipTokensAvailable),
        })
      : props.viewerStateLoading
        ? t("viewerSummary.vipBalanceChecking", { ns: "playlist" })
        : t("viewerSummary.vipBalanceUnavailable", { ns: "playlist" });
  const bulkRemovePending =
    props.pendingViewerRequest?.action === "remove" &&
    !props.pendingViewerRequest.itemId;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full items-center justify-between gap-3 border border-(--border) bg-(--panel-soft) px-4 py-2.5 text-left transition-colors hover:bg-(--panel)"
        >
          {viewer.profileImageUrl ? (
            <span
              className="block shrink-0 overflow-hidden border border-(--border-strong)"
              style={{ width: 40, height: 40, minWidth: 40 }}
            >
              <img
                src={viewer.profileImageUrl}
                alt={viewer.displayName}
                className="block h-full w-full object-cover"
              />
            </span>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-(--border-strong) bg-(--panel-strong) text-sm font-semibold text-(--text)">
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
        className="w-[320px] border-(--border) bg-(--panel-strong) p-4 text-(--text)"
      >
        <div className="grid gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{viewer.displayName}</p>
            <p className="truncate text-sm text-(--muted)">@{viewer.login}</p>
          </div>
          {!props.requestsOpen ? (
            <p className="text-sm text-(--muted)">
              {ADD_REQUESTS_WHEN_LIVE_MESSAGE}
            </p>
          ) : !props.viewerState?.access.allowed &&
            props.viewerState?.access.reason ? (
            <p className="text-sm text-(--muted)">
              {props.viewerState.access.reason}
            </p>
          ) : null}
          {props.viewerStateError ? (
            <p className="text-sm text-rose-200">
              {getErrorMessage(
                props.viewerStateError,
                t("page.viewerToolsFailed", { ns: "playlist" })
              )}
            </p>
          ) : null}
          {limitReached && props.queuedRequests.length > 0 ? (
            <p className="text-sm text-(--muted)">
              {t("viewerSummary.replaceQueued", { ns: "playlist" })}
            </p>
          ) : null}
          {props.editingRequest ? (
            <div className="grid gap-2 border border-sky-400/30 bg-sky-500/10 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                {t("viewerSummary.editing", { ns: "playlist" })}
              </p>
              <p className="text-sm font-medium text-(--text)">
                {formatPublicPlaylistTitle(props.editingRequest, t)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={props.onCancelEdit}
                  disabled={props.requestMutationPending}
                >
                  {t("viewerSummary.cancelEdit", { ns: "playlist" })}
                </Button>
              </div>
            </div>
          ) : null}
          <Collapsible>
            <div className="overflow-hidden border border-(--border)">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 bg-(--panel-soft) px-4 py-3 text-left text-sm font-medium text-(--text) transition-colors hover:bg-(--panel)"
                >
                  <span>{t("viewerSummary.vipHelp", { ns: "playlist" })}</span>
                  <span className="text-xs font-medium text-(--muted)">
                    {t("viewerSummary.open", { ns: "playlist" })}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-(--border) bg-(--panel) p-4">
                <VipTokenInfoContent
                  vipAutomationDetails={props.vipAutomationDetails}
                  balanceSummary={vipBalanceSummary}
                />
              </CollapsibleContent>
            </div>
          </Collapsible>
          {props.activeRequests.length > 0 ? (
            <div className="overflow-hidden border border-(--border)">
              {props.activeRequests.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                    props.editingRequest?.id === item.id
                      ? "bg-sky-500/10"
                      : index % 2 === 0
                        ? "bg-(--panel)"
                        : "bg-(--panel-soft)"
                  } ${index > 0 ? "border-t border-(--border)" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-(--text)">
                      {formatPublicPlaylistTitle(item, t)}
                    </p>
                    {formatPublicPlaylistSecondaryLine(item, t) ? (
                      <p className="truncate text-sm text-(--muted)">
                        {formatPublicPlaylistSecondaryLine(item, t)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        item.requestKind === "vip" ? "default" : "secondary"
                      }
                    >
                      {item.requestKind === "vip"
                        ? t("badges.vip", { ns: "playlist" })
                        : t("badges.regular", { ns: "playlist" })}
                    </Badge>
                    {getRequestedPathLabel(item) ? (
                      <Badge variant="outline">
                        {getRequestedPathLabel(item)}
                      </Badge>
                    ) : null}
                    {(item.requestKind === "vip" &&
                      getStoredVipTokenCost(item) > 1) ||
                    (item.requestKind !== "vip" &&
                      getStoredVipTokenCost(item) > 0) ? (
                      <Badge variant="outline">
                        {t("management.item.vipTokens", {
                          ns: "playlist",
                          count: getStoredVipTokenCost(item),
                        })}
                      </Badge>
                    ) : null}
                    {item.status === "current" ? (
                      <Badge variant="outline">
                        {t("badges.nowPlaying", { ns: "playlist" })}
                      </Badge>
                    ) : props.showPickOrderBadges && item.pickNumber != null ? (
                      <Badge variant="outline">
                        {t("badges.pick", {
                          ns: "playlist",
                          count: item.pickNumber,
                        })}
                      </Badge>
                    ) : null}
                    {item.status === "queued" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => props.onEditRequest(item.id)}
                          disabled={
                            props.requestMutationPending ||
                            props.pendingViewerRequest?.action === "remove"
                          }
                        >
                          {t("viewerSummary.edit", { ns: "playlist" })}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => props.onRemoveRequests(item.id)}
                          disabled={
                            props.requestMutationPending ||
                            props.pendingViewerRequest?.action === "remove"
                          }
                        >
                          {props.pendingViewerRequest?.action === "remove" &&
                          props.pendingViewerRequest.itemId === item.id
                            ? t("viewerSummary.removing", { ns: "playlist" })
                            : t("viewerSummary.remove", { ns: "playlist" })}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--muted)">
              {t("viewerSummary.noRequests", { ns: "playlist" })}
            </p>
          )}
          {props.queuedRequests.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onRemoveRequests()}
              disabled={bulkRemovePending || props.requestMutationPending}
            >
              {bulkRemovePending
                ? t("viewerSummary.removing", { ns: "playlist" })
                : t("viewerSummary.removeQueued", { ns: "playlist" })}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RequestsStatusBadge(props: {
  requestsEnabled: boolean;
  toneClassName: string;
  canManageRequests: boolean;
  isPending: boolean;
  onScrollToSearch: () => void;
  onToggle: () => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  if (!props.canManageRequests) {
    return (
      <StatusToggleBadge
        enabled={props.requestsEnabled}
        toneClassName={props.toneClassName}
        enabledLabel={t("badges.requestsOn")}
        disabledLabel={t("badges.requestsOff")}
        onLabelClick={props.onScrollToSearch}
      />
    );
  }

  return (
    <StatusToggleBadge
      enabled={props.requestsEnabled}
      toneClassName={props.toneClassName}
      enabledLabel={t("badges.requestsOn")}
      disabledLabel={t("badges.requestsOff")}
      toggleAriaLabel={
        props.requestsEnabled
          ? t("badges.turnRequestsOff")
          : t("badges.turnRequestsOn")
      }
      disabled={props.isPending}
      onLabelClick={props.onScrollToSearch}
      onToggle={props.onToggle}
    />
  );
}

function ChannelStatusBadge(props: { isLive: boolean; toneClassName: string }) {
  const { t } = useLocaleTranslation("playlist");
  return (
    <span
      className={cn(
        "inline-flex items-center border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] select-none",
        props.toneClassName
      )}
    >
      {props.isLive ? t("badges.online") : t("badges.offline")}
    </span>
  );
}

function VipTokenInfoBadge(props: {
  vipAutomationDetails: ReturnType<typeof getVipTokenAutomationDetails>;
  balanceCount?: number | null;
  align?: "start" | "center" | "end";
}) {
  const { t } = useLocaleTranslation("playlist");
  const balanceLabel =
    props.balanceCount != null
      ? t("badges.vipBalance", {
          count: props.balanceCount,
          countText: formatVipTokenCount(props.balanceCount),
        })
      : t("badges.vipTokens");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100 transition-colors hover:bg-sky-500/15"
        >
          <span>{balanceLabel}</span>
          <CircleQuestionMark size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={props.align ?? "center"}
        className="w-[min(24rem,calc(100vw-2rem))] border-(--border) bg-(--panel-strong) p-0 text-(--text)"
      >
        <VipTokenInfoContent
          vipAutomationDetails={props.vipAutomationDetails}
        />
      </PopoverContent>
    </Popover>
  );
}

function VipTokenInfoContent(props: {
  vipAutomationDetails: ReturnType<typeof getVipTokenAutomationDetails>;
  balanceSummary?: string;
}) {
  const { t } = useLocaleTranslation(["playlist", "extension"]);
  const redemptionDetails = getVipTokenRedemptionDetails((key, options) =>
    t(key, {
      ns: "extension",
      ...(options ?? {}),
    })
  );

  return (
    <div className="grid gap-4 p-4 mt-1 text-sm leading-6 text-(--muted) bg-(--panel-soft)">
      {props.balanceSummary ? <p>{props.balanceSummary}</p> : null}
      <p className="font-semibold text-(--text)">{redemptionDetails.summary}</p>
      <div className="grid gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--text)">
          {t("vipInfo.earn")}
        </p>
        {props.vipAutomationDetails.earningRules.length ? (
          <div className="grid gap-1">
            {props.vipAutomationDetails.earningRules.map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </div>
        ) : (
          <p>{t("vipInfo.manualOnly")}</p>
        )}
        {props.vipAutomationDetails.notes.length ? (
          <div className="grid gap-1">
            {props.vipAutomationDetails.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function songMatchesPathFilters(
  songParts: string[],
  requiredParts: string[],
  matchMode: "any" | "all"
) {
  if (requiredParts.length === 0) {
    return true;
  }

  const normalizedSongParts = new Set(
    songParts.map((part) => part.trim().toLowerCase()).filter(Boolean)
  );
  const normalizedRequiredParts = requiredParts
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (matchMode === "all") {
    return normalizedRequiredParts.every((part) =>
      normalizedSongParts.has(part)
    );
  }

  return normalizedRequiredParts.some((part) => normalizedSongParts.has(part));
}

function formatPathFilterSummary(parts: string[], matchMode: "any" | "all") {
  const labels = parts.map((part) => formatPathLabel(part));

  if (labels.length <= 1) {
    return labels[0] ?? "Unknown";
  }

  return matchMode === "all" ? labels.join(" + ") : labels.join(" or ");
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

function ViewerSearchSongActions(props: {
  song: SearchSong;
  resultState: SearchSongResultState;
  allowRequestPathModifiers: boolean;
  allowedRequestPaths: string[];
  requestPathModifierVipTokenCost: number;
  requestPathModifierUsesVipPriority: boolean;
  vipTokenDurationThresholds: ReturnType<
    typeof parseVipTokenDurationThresholds
  >;
  requestsOpen: boolean;
  viewerState: ViewerRequestStateData["viewer"];
  viewerStateLoading: boolean;
  viewerStateError: string;
  editingRequest: EnrichedPublicPlaylistItem | null;
  activeRequests: EnrichedPublicPlaylistItem[];
  replaceExisting: boolean;
  mutationIsPending: boolean;
  pendingViewerRequest: PendingViewerRequestState;
  compact?: boolean;
  onSubmit: (
    requestKind: "regular" | "vip",
    vipTokenCost?: number,
    requestedPath?: RequestPathOption
  ) => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const [compactOpen, setCompactOpen] = useState(false);
  const availableRequestedPaths = useMemo(
    () =>
      props.allowRequestPathModifiers
        ? getAvailableRequestedPaths(
            props.song.parts,
            props.allowedRequestPaths
          )
        : [],
    [
      props.allowRequestPathModifiers,
      props.allowedRequestPaths,
      props.song.parts,
    ]
  );
  const editingRequestedPath =
    props.editingRequest?.songId === props.song.id
      ? getPrimaryRequestedPath(props.editingRequest)
      : null;
  const [requestedPath, setRequestedPath] = useState<RequestPathOption | "">(
    editingRequestedPath ?? ""
  );

  useEffect(() => {
    setRequestedPath(editingRequestedPath ?? "");
  }, [editingRequestedPath, props.song.id]);

  useEffect(() => {
    if (
      requestedPath &&
      !availableRequestedPaths.includes(requestedPath as RequestPathOption)
    ) {
      setRequestedPath("");
    }
  }, [availableRequestedPaths, requestedPath]);

  const selectedRequestedPath = requestedPath || undefined;
  const selectedRequestedPaths = selectedRequestedPath
    ? [selectedRequestedPath]
    : [];
  const matchingRequest =
    props.activeRequests.find(
      (item) =>
        item.songId === props.song.id && item.id !== props.editingRequest?.id
    ) ?? null;
  const activeLimit = props.viewerState?.activeRequestLimit ?? null;
  const atActiveLimit =
    activeLimit != null && props.activeRequests.length >= activeLimit;
  const regularRequestPlan = getRequestVipTokenPlan({
    requestKind: "regular",
    song: props.song,
    requestedPaths: selectedRequestedPaths,
    thresholds: props.vipTokenDurationThresholds,
    settings: {
      requestPathModifierVipTokenCost: props.requestPathModifierVipTokenCost,
      requestPathModifierUsesVipPriority:
        props.requestPathModifierUsesVipPriority,
    },
  });
  const vipRequestPlan = getRequestVipTokenPlan({
    requestKind: "vip",
    song: props.song,
    requestedPaths: selectedRequestedPaths,
    thresholds: props.vipTokenDurationThresholds,
    settings: {
      requestPathModifierVipTokenCost: props.requestPathModifierVipTokenCost,
      requestPathModifierUsesVipPriority:
        props.requestPathModifierUsesVipPriority,
    },
  });
  const matchingRequestHasSameRequestedPaths =
    matchingRequest != null &&
    requestedPathsMatch(
      getStoredRequestedPaths(matchingRequest),
      selectedRequestedPaths
    );

  const regularDisabledReason = getViewerSongActionDisabledReason({
    requestKind: "regular",
    requestedVipTokenCost: regularRequestPlan.totalVipTokenCost,
    regularRequestRequiresVip: regularRequestPlan.regularRequestRequiresVip,
    resultState: props.resultState,
    requestsOpen: props.requestsOpen,
    viewerState: props.viewerState,
    viewerStateLoading: props.viewerStateLoading,
    viewerStateError: props.viewerStateError,
    editingRequest: props.editingRequest,
    requestedSongId: props.song.id,
    requestedPaths: selectedRequestedPaths,
    activeRequests: props.activeRequests,
    matchingRequest,
    atActiveLimit,
    replaceExisting: props.replaceExisting,
    t,
  });
  const vipDisabledReason = getViewerSongActionDisabledReason({
    requestKind: "vip",
    requestedVipTokenCost: vipRequestPlan.totalVipTokenCost,
    regularRequestRequiresVip: false,
    resultState: props.resultState,
    requestsOpen: props.requestsOpen,
    viewerState: props.viewerState,
    viewerStateLoading: props.viewerStateLoading,
    viewerStateError: props.viewerStateError,
    editingRequest: props.editingRequest,
    requestedSongId: props.song.id,
    requestedPaths: selectedRequestedPaths,
    activeRequests: props.activeRequests,
    matchingRequest,
    atActiveLimit,
    replaceExisting: props.replaceExisting,
    t,
  });
  const regularPending =
    props.mutationIsPending &&
    props.pendingViewerRequest?.action === "submit" &&
    props.pendingViewerRequest.songId === props.song.id &&
    props.pendingViewerRequest.requestKind === "regular" &&
    (props.pendingViewerRequest.requestedPath ?? null) ===
      (selectedRequestedPath ?? null);
  const vipPending =
    props.mutationIsPending &&
    props.pendingViewerRequest?.action === "submit" &&
    props.pendingViewerRequest.songId === props.song.id &&
    props.pendingViewerRequest.requestKind === "vip" &&
    (props.pendingViewerRequest.requestedPath ?? null) ===
      (selectedRequestedPath ?? null);
  const requestedPathHelperText =
    selectedRequestedPath && regularRequestPlan.requestedPathVipTokenCost > 0
      ? props.requestPathModifierUsesVipPriority
        ? t("viewerActions.pathRequiresVip", {
            path: formatPathLabel(selectedRequestedPath),
            count: formatVipTokenCostLabel(
              regularRequestPlan.requestedPathVipTokenCost
            ),
          })
        : t("viewerActions.pathCostsVipTokens", {
            path: formatPathLabel(selectedRequestedPath),
            count: formatVipTokenCostLabel(
              regularRequestPlan.requestedPathVipTokenCost
            ),
          })
      : "";
  const helperText =
    regularDisabledReason ||
    vipDisabledReason ||
    requestedPathHelperText ||
    props.resultState.warning ||
    "";
  const regularActionLabel =
    regularRequestPlan.totalVipTokenCost > 0
      ? t(
          props.editingRequest
            ? "viewerActions.editCost"
            : "viewerActions.addCost",
          {
            count: formatVipTokenCostLabel(
              regularRequestPlan.totalVipTokenCost
            ),
          }
        )
      : props.editingRequest
        ? t("viewerActions.edit")
        : t("viewerActions.add");
  const vipActionLabel =
    vipRequestPlan.totalVipTokenCost > 1
      ? t(
          props.editingRequest
            ? "viewerActions.editVipCost"
            : "viewerActions.addVipCost",
          {
            count: Math.trunc(vipRequestPlan.totalVipTokenCost),
          }
        )
      : props.editingRequest
        ? t("viewerActions.editVip")
        : t("viewerActions.addVip");
  const existingRequestText = matchingRequest
    ? matchingRequestHasSameRequestedPaths &&
      matchingRequest.requestKind === "vip" &&
      getStoredVipTokenCost(matchingRequest) >= vipRequestPlan.totalVipTokenCost
      ? t("viewerActions.alreadyVip")
      : matchingRequestHasSameRequestedPaths
        ? t("viewerActions.alreadyRegular")
        : t("viewerActions.updateExisting")
    : "";
  const compactButtonTitle = helperText || existingRequestText || undefined;

  if (props.compact) {
    return (
      <Popover open={compactOpen} onOpenChange={setCompactOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-[10px] shadow-none"
            disabled={
              props.mutationIsPending ||
              (!!regularDisabledReason && !!vipDisabledReason)
            }
            title={compactButtonTitle}
            variant={props.editingRequest ? "outline" : "default"}
          >
            {regularPending || vipPending
              ? t("viewerActions.adding")
              : props.editingRequest
                ? t("viewerActions.edit")
                : t("viewerActions.add")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 border-(--border) bg-(--panel-strong) p-3 text-(--text)"
        >
          <ViewerSearchSongActions {...props} compact={false} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="grid gap-2">
      {availableRequestedPaths.length > 0 ? (
        <div className="grid gap-1">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--muted)">
            {t("viewerActions.choosePath")}
          </Label>
          <Select
            value={selectedRequestedPath ?? "__none"}
            onValueChange={(value) =>
              setRequestedPath(
                value === "__none" ? "" : (value as RequestPathOption)
              )
            }
          >
            <SelectTrigger className="h-9 bg-(--panel) text-left text-sm">
              <SelectValue placeholder={t("viewerActions.noPathPreference")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">
                {t("viewerActions.noPathPreference")}
              </SelectItem>
              {availableRequestedPaths.map((path) => (
                <SelectItem key={path} value={path}>
                  {formatPathLabel(path)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="w-full px-4 shadow-none"
          onClick={() =>
            props.onSubmit(
              "regular",
              regularRequestPlan.totalVipTokenCost || undefined,
              selectedRequestedPath
            )
          }
          disabled={!!regularDisabledReason || props.mutationIsPending}
        >
          {regularPending ? t("viewerActions.adding") : regularActionLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full px-4"
          onClick={() =>
            props.onSubmit(
              "vip",
              vipRequestPlan.totalVipTokenCost || 1,
              selectedRequestedPath
            )
          }
          disabled={!!vipDisabledReason || props.mutationIsPending}
        >
          {vipPending ? t("viewerActions.adding") : vipActionLabel}
        </Button>
      </div>
      {helperText ? (
        <p className="text-right text-xs text-(--muted)">{helperText}</p>
      ) : matchingRequest ? (
        <p className="text-right text-xs text-(--muted)">
          {existingRequestText}
        </p>
      ) : null}
    </div>
  );
}

function ViewerSpecialRequestControls(props: {
  canManagePlaylist: boolean;
  requestsOpen: boolean;
  viewerState: ViewerRequestStateData["viewer"];
  viewerStateLoading: boolean;
  viewerStateError: string;
  editingRequest: EnrichedPublicPlaylistItem | null;
  replaceExisting: boolean;
  mutationIsPending: boolean;
  pendingViewerRequest: PendingViewerRequestState;
  onSubmit: (
    query: string,
    requestMode: "random" | "choice",
    requestKind: "regular" | "vip"
  ) => void;
  onCancelEdit: () => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const [artistQuery, setArtistQuery] = useState("");
  const [requestMode, setRequestMode] = useState<"random" | "choice">("random");
  const [requestKind, setRequestKind] = useState<"regular" | "vip">("regular");
  const normalizedQuery = artistQuery.trim();
  const isViewerReady =
    props.viewerStateLoading ||
    props.viewerState != null ||
    props.viewerStateError.trim().length > 0;

  useEffect(() => {
    if (!props.editingRequest) {
      return;
    }

    setRequestKind(props.editingRequest.requestKind);
    if (props.editingRequest.warningCode === STREAMER_CHOICE_WARNING_CODE) {
      setRequestMode("choice");
      setArtistQuery(props.editingRequest.requestedQuery ?? "");
    }
  }, [
    props.editingRequest?.id,
    props.editingRequest?.requestKind,
    props.editingRequest?.warningCode,
    props.editingRequest?.requestedQuery,
  ]);

  if (!isViewerReady) {
    return null;
  }

  const selectedDisabledReason = getViewerSpecialActionDisabledReason({
    query: normalizedQuery,
    requestMode,
    requestKind,
    requestsOpen: props.requestsOpen,
    viewerState: props.viewerState,
    viewerStateLoading: props.viewerStateLoading,
    viewerStateError: props.viewerStateError,
    editingRequest: props.editingRequest,
    t,
  });
  const helperText =
    selectedDisabledReason ||
    (normalizedQuery.length >= 2
      ? requestMode === "random"
        ? t("specialRequest.randomHelp")
        : t("specialRequest.choiceHelp")
      : null);
  const submitPending =
    props.mutationIsPending &&
    props.pendingViewerRequest?.action === "submit" &&
    props.pendingViewerRequest.requestMode === requestMode &&
    props.pendingViewerRequest.requestKind === requestKind &&
    props.pendingViewerRequest.query?.trim() === normalizedQuery;
  const compactToggleClass =
    "h-8 min-w-[4.5rem] px-2.5 text-[11px] tracking-[0.05em] shadow-none";

  return (
    <div className="grid gap-2 border border-(--border) bg-(--panel-soft) px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--brand-deep)">
          {props.canManagePlaylist
            ? t("specialRequest.titleManage")
            : t("specialRequest.titleViewer")}
        </p>
        {props.editingRequest ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[11px] shadow-none"
            onClick={props.onCancelEdit}
            disabled={props.mutationIsPending}
          >
            {t("viewerSummary.cancelEdit", { ns: "playlist" })}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-[11rem] flex-1 gap-1">
          <Label
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--muted)"
            htmlFor="viewer-special-request-artist"
          >
            {t("specialRequest.artist")}
          </Label>
          <Input
            id="viewer-special-request-artist"
            value={artistQuery}
            onChange={(event) => setArtistQuery(event.target.value)}
            placeholder={t("specialRequest.artistPlaceholder")}
            className="h-9 px-3"
          />
        </div>

        <div className="grid gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--muted)">
            {t("specialRequest.chooseMode")}
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={requestMode === "random" ? "secondary" : "ghost"}
              className={cn(compactToggleClass, "w-auto")}
              aria-pressed={requestMode === "random"}
              onClick={() => setRequestMode("random")}
            >
              {t("specialRequest.random")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={requestMode === "choice" ? "secondary" : "ghost"}
              className={cn(compactToggleClass, "w-auto")}
              aria-pressed={requestMode === "choice"}
              onClick={() => setRequestMode("choice")}
            >
              {t("specialRequest.choice")}
            </Button>
          </div>
        </div>

        <div className="grid gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--muted)">
            {t("specialRequest.chooseType")}
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={requestKind === "regular" ? "secondary" : "ghost"}
              className={cn(compactToggleClass, "w-auto")}
              aria-pressed={requestKind === "regular"}
              onClick={() => setRequestKind("regular")}
            >
              {t("specialRequest.regular")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={requestKind === "vip" ? "secondary" : "ghost"}
              className={cn(compactToggleClass, "w-auto")}
              aria-pressed={requestKind === "vip"}
              onClick={() => setRequestKind("vip")}
            >
              VIP
            </Button>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-9 min-w-[6.5rem] px-3 shadow-none"
          onClick={() =>
            props.onSubmit(normalizedQuery, requestMode, requestKind)
          }
          disabled={!!selectedDisabledReason || props.mutationIsPending}
        >
          {submitPending
            ? t("specialRequest.adding")
            : requestKind === "vip"
              ? props.editingRequest
                ? t("specialRequest.editVip")
                : t("specialRequest.addVip")
              : props.editingRequest
                ? t("specialRequest.edit")
                : t("specialRequest.add")}
        </Button>
      </div>

      {helperText ? (
        <p className="text-[11px] text-(--muted)">{helperText}</p>
      ) : props.replaceExisting ? (
        <p className="text-[11px] text-(--muted)">
          {t("viewerSummary.replaceQueued")}
        </p>
      ) : null}
    </div>
  );
}

function getViewerSongActionDisabledReason(input: {
  requestKind: "regular" | "vip";
  requestedVipTokenCost: number;
  regularRequestRequiresVip: boolean;
  resultState: SearchSongResultState;
  requestsOpen?: boolean;
  viewerState: ViewerRequestStateData["viewer"];
  viewerStateLoading: boolean;
  viewerStateError: string;
  editingRequest: EnrichedPublicPlaylistItem | null;
  requestedSongId: string;
  requestedPaths: string[];
  activeRequests: EnrichedPublicPlaylistItem[];
  matchingRequest: EnrichedPublicPlaylistItem | null;
  atActiveLimit: boolean;
  replaceExisting: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (input.resultState.disabled) {
    return input.resultState.reasons?.length
      ? `${input.t("viewerActions.blacklistedPrefix")} - ${input.resultState.reasons.join(" · ")}`
      : input.t("viewerActions.songUnavailable");
  }

  if (input.viewerStateLoading) {
    return input.t("viewerActions.checkingAccess");
  }

  if (input.requestsOpen === false) {
    return input.t("page.requestsLiveOnly");
  }

  if (!input.viewerState) {
    return input.viewerStateError || input.t("page.viewerToolsFailed");
  }

  if (!input.viewerState.access.allowed) {
    return (
      input.viewerState.access.reason ?? input.t("viewerActions.cannotRequest")
    );
  }

  if (
    input.requestKind === "regular" &&
    input.regularRequestRequiresVip &&
    input.requestedVipTokenCost > 0
  ) {
    return input.t("viewerActions.requiresVipTokens", {
      count: formatVipTokenCostLabel(input.requestedVipTokenCost),
    });
  }

  const matchingRequestVipTokenCost = input.matchingRequest
    ? getStoredVipTokenCost(input.matchingRequest)
    : 0;
  const matchingRequestHasSameRequestedPaths =
    input.matchingRequest != null &&
    requestedPathsMatch(
      getStoredRequestedPaths(input.matchingRequest),
      input.requestedPaths
    );
  const editingRequestVipTokenCost = input.editingRequest
    ? getStoredVipTokenCost(input.editingRequest)
    : 0;
  const editingRequestHasSameRequestedPaths =
    input.editingRequest != null &&
    requestedPathsMatch(
      getStoredRequestedPaths(input.editingRequest),
      input.requestedPaths
    );
  const editingSameRequest =
    input.editingRequest != null &&
    input.editingRequest.songId === input.requestedSongId &&
    input.editingRequest.requestKind === input.requestKind &&
    editingRequestVipTokenCost === input.requestedVipTokenCost &&
    editingRequestHasSameRequestedPaths;

  if (editingSameRequest) {
    return input.t("viewerActions.alreadyActive");
  }

  if (
    input.matchingRequest &&
    input.matchingRequest.requestKind === input.requestKind &&
    matchingRequestVipTokenCost === input.requestedVipTokenCost &&
    matchingRequestHasSameRequestedPaths &&
    !input.replaceExisting
  ) {
    return input.t("viewerActions.alreadyActive");
  }

  if (
    input.atActiveLimit &&
    !input.replaceExisting &&
    !(
      input.matchingRequest &&
      (input.matchingRequest.requestKind !== input.requestKind ||
        matchingRequestVipTokenCost !== input.requestedVipTokenCost ||
        !matchingRequestHasSameRequestedPaths)
    )
  ) {
    const activeLimit =
      input.viewerState.activeRequestLimit ?? input.activeRequests.length;
    return input.t("viewerActions.activeLimitReached", { count: activeLimit });
  }

  if (
    input.requestedVipTokenCost > 0 &&
    !hasRedeemableVipToken(
      input.viewerState.vipTokensAvailable,
      Math.max(0, input.requestedVipTokenCost - editingRequestVipTokenCost)
    )
  ) {
    return input.t("viewerActions.insufficientVipTokens");
  }

  return "";
}

function InlineStatusBanner(props: {
  tone: "success" | "danger" | "notice";
  children: string;
}) {
  return (
    <div
      className={cn(
        "border px-4 py-3 text-sm",
        props.tone === "success"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : props.tone === "danger"
            ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
            : "border-amber-500/30 bg-amber-500/10 text-amber-100"
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
  requestsOpen: boolean;
  currentViewer: ViewerMatch | null;
  pendingAddSongId: string | null;
  mutationIsPending: boolean;
  onAdd: (requester: ViewerMatch) => void;
  canManageFavorites?: boolean;
  isFavorited?: boolean;
  favoritePending?: boolean;
  compact?: boolean;
  onToggleFavorite?: () => void;
}) {
  const { t } = useLocaleTranslation("playlist");
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
    !props.requestsOpen ||
    props.resultState.disabled ||
    (props.mutationIsPending && props.pendingAddSongId === props.song.id) ||
    !props.currentViewer?.login;
  const favoriteButtonClass = props.compact
    ? "h-7 w-7 shrink-0 px-0 shadow-none hover:bg-transparent"
    : "h-8 w-8 shrink-0 px-0 shadow-none hover:bg-transparent";
  const favoriteIconClass = props.compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const actionButtonClass = props.compact
    ? "h-7 px-2.5 text-[10px] shadow-none"
    : "h-9 w-full px-2.5 py-2 text-center text-[clamp(0.65rem,0.2vw+0.62rem,0.76rem)] leading-[1.1] whitespace-normal tracking-[0.08em] shadow-none";
  const actionGroupClass = props.compact
    ? "flex min-w-0 items-center justify-end gap-1.5"
    : "grid min-w-0 flex-1 grid-cols-2 gap-2 max-[860px]:w-36 max-[860px]:grid-cols-1 max-[720px]:w-[clamp(5.75rem,27vw,7.75rem)]";

  return (
    <div
      className={cn(
        "min-w-0",
        props.compact ? "flex items-center justify-end gap-1.5" : "grid gap-2"
      )}
    >
      <div
        className={cn(
          "flex w-full min-w-0 items-start justify-end gap-2",
          props.compact ? "w-auto gap-1.5" : ""
        )}
      >
        {props.canManageFavorites ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              favoriteButtonClass,
              props.isFavorited
                ? "text-rose-300 hover:text-rose-200"
                : "text-(--muted) hover:text-(--text)"
            )}
            aria-label={t(
              props.isFavorited
                ? "favorites.unfavoriteAria"
                : "favorites.favoriteAria"
            )}
            aria-pressed={props.isFavorited}
            title={t(
              props.isFavorited
                ? "favorites.unfavoriteAria"
                : "favorites.favoriteAria"
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onToggleFavorite?.();
            }}
            disabled={props.favoritePending || !props.onToggleFavorite}
          >
            <Heart
              className={cn(
                favoriteIconClass,
                props.isFavorited
                  ? "fill-current text-rose-300"
                  : "text-(--muted)"
              )}
            />
          </Button>
        ) : null}
        <div className={actionGroupClass}>
          <Button
            type="button"
            size={props.compact ? "sm" : undefined}
            className={actionButtonClass}
            onClick={() => {
              if (
                !props.requestsOpen ||
                !props.currentViewer ||
                props.resultState.disabled
              ) {
                return;
              }
              props.onAdd(props.currentViewer);
            }}
            disabled={addDisabled}
            title={props.requestsOpen ? undefined : t("page.requestsLiveOnly")}
          >
            {props.mutationIsPending && props.pendingAddSongId === props.song.id
              ? t("manageActions.adding")
              : t("manageActions.add")}
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size={props.compact ? "sm" : undefined}
                variant="outline"
                className={actionButtonClass}
                disabled={
                  !props.requestsOpen ||
                  props.resultState.disabled ||
                  props.mutationIsPending
                }
                title={
                  props.requestsOpen ? undefined : t("page.requestsLiveOnly")
                }
              >
                {t("manageActions.addForUser")}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align={props.compact ? "end" : "start"}
              className="w-62.5 border-(--border) bg-(--panel-strong) p-3 text-(--text)"
            >
              <div className="grid gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("manageActions.searchViewers")}
                />
                {normalizedQuery.length > 0 && normalizedQuery.length < 2 ? (
                  <p className="text-sm text-(--muted)">
                    {t("manageActions.searchMin")}
                  </p>
                ) : null}
                {lookupQuery.data?.needsChatterScopeReconnect ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <p className="text-sm text-amber-100">
                      {t("manageActions.reconnectMessage")}
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/auth/twitch/start?redirectTo=${encodeURIComponent(`/${props.slug}`)}`}
                      >
                        {t("manageActions.reconnect")}
                      </a>
                    </Button>
                  </div>
                ) : null}
                {normalizedQuery.length >= 2 ? (
                  lookupQuery.isFetching ? (
                    <p className="text-sm text-(--muted)">
                      {t("manageActions.searching")}
                    </p>
                  ) : (lookupQuery.data?.users?.length ?? 0) > 0 ? (
                    <div className="overflow-hidden border border-(--border)">
                      {lookupQuery.data?.users.map((user, index) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            if (!props.requestsOpen) {
                              return;
                            }
                            props.onAdd(user);
                            setOpen(false);
                            setQuery("");
                            setDebouncedQuery("");
                          }}
                          className={`flex items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-(--panel-soft) ${
                            index % 2 === 0
                              ? "bg-(--panel-soft)"
                              : "bg-(--panel-muted)"
                          } ${index > 0 ? "border-t border-(--border)" : ""}`}
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
                            {t("manageActions.add")}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-(--muted)">
                      {t("manageActions.noMatches")}
                    </p>
                  )
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

function getViewerSpecialActionDisabledReason(input: {
  query: string;
  requestMode: "random" | "choice";
  requestKind: "regular" | "vip";
  requestsOpen?: boolean;
  viewerState: ViewerRequestStateData["viewer"];
  viewerStateLoading: boolean;
  viewerStateError: string;
  editingRequest: EnrichedPublicPlaylistItem | null;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (input.query.length < 2) {
    return input.t("specialRequest.artistMin");
  }

  if (input.viewerStateLoading) {
    return input.t("viewerActions.checkingAccess");
  }

  if (input.requestsOpen === false) {
    return input.t("page.requestsLiveOnly");
  }

  if (!input.viewerState) {
    return input.viewerStateError || input.t("page.viewerToolsFailed");
  }

  if (!input.viewerState.access.allowed) {
    return (
      input.viewerState.access.reason ?? input.t("viewerActions.cannotRequest")
    );
  }

  if (
    input.requestKind === "vip" &&
    !hasRedeemableVipToken(
      input.viewerState.vipTokensAvailable,
      Math.max(
        0,
        1 -
          (input.editingRequest
            ? getStoredVipTokenCost(input.editingRequest)
            : 0)
      )
    )
  ) {
    return input.t("viewerActions.insufficientVipTokens");
  }

  return null;
}

function PublicPlaylistRow(props: {
  item: EnrichedPublicPlaylistItem;
  index: number;
  showPlaylistPositions: boolean;
  showPickOrderBadges: boolean;
  isViewerRequest: boolean;
}) {
  const { t } = useLocaleTranslation("playlist");
  const isVipRequest = props.item.requestKind === "vip";
  const requesterName =
    props.item.requestedByDisplayName ??
    props.item.requestedByLogin ??
    t("row.viewer");
  const titleLine = formatPublicPlaylistTitle(props.item, t);
  const secondaryLine = formatPublicPlaylistSecondaryLine(props.item, t);
  const addedLabel = props.item.createdAt
    ? formatCompactPlaylistRelativeTime(props.item.createdAt, t)
    : null;
  const editedTimestamp = props.item.editedAt ?? null;
  const editedLabel = editedTimestamp
    ? formatCompactPlaylistRelativeTime(editedTimestamp, t)
    : null;
  const showEditedLabel =
    editedTimestamp != null &&
    editedLabel != null &&
    (props.item.createdAt == null || editedTimestamp > props.item.createdAt);
  const metadataLine = [
    addedLabel ? t("row.added", { time: addedLabel }) : null,
    showEditedLabel && editedLabel
      ? t("row.edited", { time: editedLabel })
      : null,
  ]
    .filter((value): value is string => Boolean(value))
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
        "border-(--border) px-5 py-4 max-[960px]:px-6",
        props.index > 0 ? "border-t" : "",
        isVipRequest
          ? `${rowStripeClass} border-violet-400/45 shadow-[0_0_0_1px_rgba(168,85,247,0.08),0_0_28px_rgba(168,85,247,0.12)]`
          : rowStripeClass
      )}
      style={
        props.isViewerRequest
          ? {
              backgroundColor: "var(--viewer-highlight-bg)",
              ...(isVipRequest
                ? {}
                : { borderColor: "var(--viewer-highlight-border)" }),
            }
          : undefined
      }
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
          {secondaryLine ? (
            <p className="mt-1 truncate text-sm text-(--brand-deep)">
              {secondaryLine}
            </p>
          ) : null}
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
          </div>
        </div>
      </div>
    </motion.div>
  );
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

function StatusColumn(props: {
  position: number | null | undefined;
  isCurrent: boolean;
}) {
  if (!props.isCurrent && props.position == null) {
    return null;
  }

  return (
    <div className="mt-0.5 flex shrink-0 flex-col items-center gap-2">
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
  const { t } = useLocaleTranslation("playlist");
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
      title={props.active ? t("badges.nowPlaying") : undefined}
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
