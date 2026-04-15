// Shared channel playlist management surface.
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { reorder } from "@atlaskit/pragmatic-drag-and-drop/reorder";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronsDown,
  ChevronsUp,
  CircleCheckBig,
  Clock3,
  Download,
  GripVertical,
  Heart,
  type LucideIcon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { FavoriteToggleButton } from "~/components/favorite-toggle-button";
import { PickOrderBadge } from "~/components/pick-order-badge";
import { RequesterChatBadges } from "~/components/requester-chat-badges";
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
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import {
  formatDate as formatLocaleDate,
  formatNumber,
} from "~/lib/i18n/format";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
import {
  getPlaylistDisplayParts,
  getResolvedPlaylistCandidates,
  playlistDisplayCandidateHasLyrics,
  playlistDisplayItemHasLyrics,
} from "~/lib/playlist/management-display";
import {
  getPlaylistEndpoint,
  getPlaylistMutationEndpoint,
} from "~/lib/playlist/management-endpoints";
import {
  getQueuedPositionsFromRegularOrder,
  getUpdatedPositionsAfterSetCurrent,
  getUpdatedQueuedPositionsAfterKindChange,
} from "~/lib/playlist/order";
import { isRequesterInactive } from "~/lib/playlist/requester-activity";
import { areChannelRequestsOpen } from "~/lib/request-availability";
import { formatPathLabel } from "~/lib/request-policy";
import {
  getPrimaryRequestedPath,
  getRequestVipTokenPlan,
  getStoredRequestedPaths,
} from "~/lib/requested-paths";
import {
  getSongPrimaryGroupKey,
  summarizeSongGroup,
} from "~/lib/song-grouping";
import {
  formatCompactTuningSummary,
  getUniqueTunings,
} from "~/lib/tuning-summary";
import type { RequesterChatBadge } from "~/lib/twitch/chat-badges";
import { cn, getErrorMessage } from "~/lib/utils";
import {
  parseVipTokenDurationThresholds,
  type VipTokenDurationThreshold,
} from "~/lib/vip-token-duration-thresholds";
import {
  formatVipTokenCount,
  hasRedeemableVipToken,
  normalizeVipTokenCount,
} from "~/lib/vip-tokens";

export type PlaylistItem = {
  id: string;
  songId?: string;
  songCatalogSourceId?: number | null;
  songGroupedProjectId?: number | null;
  songArtistId?: number | null;
  songCharterId?: number | null;
  songTitle: string;
  songArtist?: string;
  songAlbum?: string;
  songCreator?: string;
  songTuning?: string;
  songPartsJson?: string;
  songHasLyrics?: boolean | null;
  songDurationText?: string;
  songUrl?: string;
  songSourceUpdatedAt?: number | null;
  songDownloads?: number | null;
  requestedByTwitchUserId?: string;
  requestedByLogin?: string;
  requestedByDisplayName?: string;
  requesterChatBadges?: RequesterChatBadge[];
  requestedQuery?: string;
  warningCode?: string;
  warningMessage?: string;
  candidateMatchesJson?: string;
  vipTokenCost?: number | null;
  pickNumber?: number | null;
  createdAt: number;
  editedAt?: number | null;
  position: number;
  regularPosition?: number | null;
  status: string;
  requestKind?: "regular" | "vip";
  requesterLastChatAt?: number | null;
};

export type PlaylistCandidate = {
  id: string;
  groupedProjectId?: number;
  authorId?: number;
  isPreferredCharter?: boolean;
  title: string;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string;
  parts?: string[];
  hasLyrics?: boolean;
  durationText?: string;
  year?: number;
  sourceUpdatedAt?: number;
  downloads?: number;
  sourceUrl?: string;
  sourceId?: number;
};

type PlayedSong = {
  id: string;
  songTitle: string;
  songArtist?: string;
  requestKind?: "regular" | "vip";
  requestedByDisplayName?: string;
  requestedByLogin?: string;
  playedAt: number;
};

const PLAYLIST_PREVIEW_CANDIDATES: PlaylistCandidate[] = [
  {
    id: "vv-neon-noir-johncryx",
    groupedProjectId: 81554,
    authorId: 2638,
    title: "Neon Noir",
    artist: "VV",
    album: "Neon Noir",
    creator: "JohnCryx",
    tuning: "E Standard | A Standard",
    parts: ["lead", "rhythm", "bass"],
    hasLyrics: true,
    durationText: "3:49",
    sourceUpdatedAt: Date.parse("2025-12-08T00:00:00Z"),
    downloads: 4284,
    sourceUrl: "https://customsforge.com/index.php?/customs/99081",
    sourceId: 99081,
  },
  {
    id: "vv-neon-noir-alt",
    groupedProjectId: 81554,
    authorId: 4811,
    title: "Neon Noir",
    artist: "VV",
    album: "Neon Noir",
    creator: "AltCharter",
    tuning: "E Standard",
    parts: ["lead", "rhythm"],
    durationText: "3:49",
    sourceUpdatedAt: Date.parse("2026-01-16T00:00:00Z"),
    downloads: 1137,
    sourceUrl: "https://customsforge.com/index.php?/customs/99142",
    sourceId: 99142,
  },
];

const PLAYLIST_PREVIEW_ITEM: PlaylistItem = {
  id: "demo-playlist-item",
  songId: "cat_5e52d9dbbeea471ca4683636778cbc03",
  songCatalogSourceId: 99081,
  songGroupedProjectId: 81554,
  songArtistId: 934,
  songCharterId: 2638,
  songTitle: "Neon Noir",
  songArtist: "VV",
  songAlbum: "Neon Noir",
  songCreator: "JohnCryx",
  songTuning: "E Standard | A Standard",
  songPartsJson: JSON.stringify(["lead", "rhythm", "bass"]),
  songHasLyrics: true,
  songDurationText: "3:49",
  songUrl: "https://customsforge.com/index.php?/customs/99081",
  songSourceUpdatedAt: Date.parse("2025-12-08T00:00:00Z"),
  songDownloads: 4284,
  requestedByLogin: "jimmy_pants_",
  requestedByDisplayName: "Jimmy_Pants_",
  candidateMatchesJson: JSON.stringify(PLAYLIST_PREVIEW_CANDIDATES),
  createdAt: Date.now() - 12 * 60 * 1000,
  position: 2,
  status: "queued",
  requestKind: "vip",
};

type VipTokenBalance = {
  twitchUserId?: string | null;
  login: string;
  availableCount: number;
};

type ManualSearchData = Pick<SearchResponse, "results">;

type SearchResponse = {
  results: Array<{
    id: string;
    groupKey?: string;
    groupingSource?: "groupedProjectId" | "fallback" | "both";
    versionCount?: number;
    groupedProjectIds?: number[];
    groupedProjectId?: number;
    artistId?: number;
    authorId?: number;
    title: string;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: string;
    parts?: string[];
    hasLyrics?: boolean;
    durationText?: string;
    source: string;
    sourceUrl?: string;
    sourceId?: number;
  }>;
};

export type GroupedSongsReportResponse = {
  items: Array<{
    groupKey: string;
    groupingSource: "groupedProjectId" | "fallback" | "both";
    versionCount: number;
    groupedProjectIds: number[];
    title: string;
    artist?: string;
    tuning?: string;
    latestUpdatedAt?: number;
    downloads?: number;
    versions: PlaylistCandidate[];
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};

export type GroupedSongsGroupingFilter =
  | "all"
  | "groupedProjectId"
  | "fallback"
  | "both";

const playlistItemTransition = {
  duration: 0.22,
  ease: [0.2, 0, 0, 1] as const,
};

export type PlaylistManagementSurfaceData = {
  channel: {
    slug: string;
    login?: string;
    displayName: string;
    isLive: boolean;
    botReadyState?: string | null;
  };
  settings?: {
    botChannelEnabled?: boolean;
    requestsEnabled?: boolean;
    canManageBlacklist?: boolean;
    canViewVipTokens?: boolean;
    canManageVipTokens?: boolean;
    requestPathModifierVipTokenCost?: number;
    requestPathModifierVipTokenCosts?: {
      guitar: number;
      lead: number;
      rhythm: number;
      bass: number;
    };
    requestPathModifierUsesVipPriority?: boolean;
    showPickOrderBadges?: boolean;
    vipTokenDurationThresholdsJson?: string | null;
  };
  items: PlaylistItem[];
  playedSongs: PlayedSong[];
  blacklistArtists: Array<{ artistId: number; artistName: string }>;
  blacklistCharters: Array<{ charterId: number; charterName: string }>;
  preferredCharters: Array<{ charterId: number; charterName: string }>;
  blacklistSongs: Array<{
    songId: number;
    songTitle: string;
    artistName?: string | null;
  }>;
  blacklistSongGroups: Array<{
    groupedProjectId: number;
    songTitle: string;
    artistId?: number | null;
    artistName?: string | null;
  }>;
  vipTokens: VipTokenBalance[];
  accessRole?: "owner" | "moderator";
};

export type PlaylistManagementSurfaceProps = {
  selectedChannelSlug?: string;
  apiPath: string;
  mutationPath?: string;
  queryKeyBase: string;
  queryKey?: (string | null)[];
  playlistData?: PlaylistManagementSurfaceData | null;
  refetchIntervalMs?: number | false;
  staleTimeMs?: number;
  invalidateOnMutationSuccess?: boolean;
  headerTitle?: string;
  headerDescription?: string;
  showAncillaryPanels?: boolean;
  showManualAdd?: boolean;
  embedCurrentPlaylist?: boolean;
  currentPlaylistTitle?: string | null;
  canManageFavorites?: boolean;
  isSongFavorited?: (groupKey: string) => boolean;
  favoritePendingGroupKey?: string | null;
  onToggleFavorite?: (input: {
    songId: string;
    groupKey: string;
    favorited: boolean;
  }) => void;
};

function formatTimeAgo(t: TFunction, timestamp: number) {
  const deltaMs = Date.now() - timestamp;
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));

  if (deltaMinutes < 1) {
    return t("management.relative.now");
  }

  if (deltaMinutes < 60) {
    return t("management.relative.minutesAgo", { count: deltaMinutes });
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return t("management.relative.hoursAgo", { count: deltaHours });
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return t("management.relative.daysAgo", { count: deltaDays });
}

export function PlaylistManagementSurface(
  props: PlaylistManagementSurfaceProps
) {
  const { t } = useLocaleTranslation("playlist");
  const queryClient = useQueryClient();
  const [manualQuery, setManualQuery] = useState("");
  const [manualRequesterLogin, setManualRequesterLogin] = useState("");
  const [debouncedManualQuery, setDebouncedManualQuery] = useState("");
  const [manualAddError, setManualAddError] = useState<string | null>(null);
  const [playlistActionError, setPlaylistActionError] = useState<string | null>(
    null
  );
  const [deleteDialogItem, setDeleteDialogItem] = useState<{
    id: string;
    songTitle: string;
    songArtist?: string;
  } | null>(null);
  const [showClearPlaylistDialog, setShowClearPlaylistDialog] = useState(false);
  const [showResetSessionDialog, setShowResetSessionDialog] = useState(false);
  const [showDisableBotDialog, setShowDisableBotDialog] = useState(false);
  const [pendingRowAction, setPendingRowAction] = useState<{
    action: string;
    itemId?: string;
    songId?: string;
  } | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetState, setDropTargetState] = useState<{
    itemId: string;
    edge: Edge;
  } | null>(null);
  const [useTouchReorderControls, setUseTouchReorderControls] = useState(false);
  const playlistQueryKey = props.queryKey ?? [
    props.queryKeyBase,
    props.selectedChannelSlug ?? null,
  ];
  const playlistEndpoint = getPlaylistEndpoint(
    props.apiPath,
    props.selectedChannelSlug
  );
  const playlistMutationEndpoint = getPlaylistMutationEndpoint(
    props.apiPath,
    props.mutationPath,
    props.selectedChannelSlug
  );
  const usesPrefetchedPlaylistData = props.playlistData !== undefined;
  const playlistQuery = useQuery<PlaylistManagementSurfaceData>({
    queryKey: playlistQueryKey,
    queryFn: async () => {
      const response = await fetch(playlistEndpoint);
      return response.json() as Promise<PlaylistManagementSurfaceData>;
    },
    enabled: !usesPrefetchedPlaylistData,
    staleTime: props.staleTimeMs ?? 0,
    refetchInterval:
      props.refetchIntervalMs === undefined ? 2_000 : props.refetchIntervalMs,
    refetchIntervalInBackground: false,
  });
  const playlistData = props.playlistData ?? playlistQuery.data;
  const moderationEndpoint = playlistData?.channel?.slug
    ? `/api/channel/${playlistData.channel.slug}/moderation`
    : null;
  const vipTokenDurationThresholds = useMemo(
    () =>
      parseVipTokenDurationThresholds(
        playlistData?.settings?.vipTokenDurationThresholdsJson
      ),
    [playlistData?.settings?.vipTokenDurationThresholdsJson]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedManualQuery(manualQuery);
    }, 800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [manualQuery]);

  const manualQueryTooShort =
    manualQuery.trim().length > 0 && manualQuery.trim().length < 3;

  const manualSearchQuery = useQuery<ManualSearchData>({
    queryKey: ["playlist-manual-search", debouncedManualQuery],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        query: debouncedManualQuery.trim(),
        page: "1",
        pageSize: "6",
        field: "any",
      });
      const response = await fetch(`/api/search?${params.toString()}`, {
        signal,
      });
      const body = (await response.json().catch(() => null)) as
        | SearchResponse
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && "message" in body
            ? (body.message ?? t("management.states.searchFailed"))
            : t("management.states.searchFailed")
        );
      }

      return { results: (body as SearchResponse).results };
    },
    enabled: manualQuery.trim().length >= 3,
  });
  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch(playlistMutationEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;

        throw new Error(
          payload?.error ??
            payload?.message ??
            t("management.states.playlistUpdateFailed")
        );
      }

      return response.json();
    },
    onMutate: async (body: Record<string, unknown>) => {
      const action = typeof body.action === "string" ? body.action : "unknown";
      const itemId = typeof body.itemId === "string" ? body.itemId : undefined;
      const songId =
        typeof body.songId === "string"
          ? body.songId
          : typeof body.candidateId === "string"
            ? body.candidateId
            : typeof body.playedSongId === "string"
              ? body.playedSongId
              : undefined;
      if (action === "manualAdd") {
        setManualAddError(null);
      } else {
        setPlaylistActionError(null);
      }
      setPendingRowAction({ action, itemId, songId });

      await queryClient.cancelQueries({ queryKey: playlistQueryKey });
      const previous =
        queryClient.getQueryData<PlaylistManagementSurfaceData>(
          playlistQueryKey
        );

      if (!previous) {
        return undefined;
      }

      if (action === "clearPlaylist") {
        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: [],
        });
      }

      if (action === "resetSession") {
        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: [],
          playedSongs: [],
          settings: previous.settings
            ? {
                ...previous.settings,
                requestsEnabled: false,
              }
            : {
                requestsEnabled: false,
              },
        });
      }

      if (
        action === "setBotChannelEnabled" &&
        typeof body.enabled === "boolean"
      ) {
        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          channel: {
            ...previous.channel,
            botReadyState: body.enabled
              ? previous.channel.botReadyState
              : "disabled",
          },
          settings: previous.settings
            ? {
                ...previous.settings,
                botChannelEnabled: body.enabled,
              }
            : previous.settings,
        });
      }

      if (
        action === "reorderItems" &&
        Array.isArray(body.orderedItemIds) &&
        body.orderedItemIds.every((itemId) => typeof itemId === "string")
      ) {
        const reorderedItems = orderPlaylistItems(
          previous.items,
          body.orderedItemIds as string[]
        );

        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: reorderedItems,
        });
      }

      if (itemId && (action === "deleteItem" || action === "markPlayed")) {
        const removedItem =
          previous.items.find((item) => item.id === itemId) ?? null;
        const remainingItems = previous.items.filter(
          (item) => item.id !== itemId
        );
        const sortedRemaining = [...remainingItems].sort(
          (a, b) => a.position - b.position
        );

        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: sortedRemaining.map((item, index) => ({
            ...item,
            position: index + 1,
          })),
          vipTokens:
            action === "deleteItem" && removedItem
              ? updateVipTokenBalanceForLogin({
                  vipTokens: previous.vipTokens,
                  requesterLogin: removedItem.requestedByLogin,
                  delta: -getManagedStoredVipTokenCost({
                    requestKind: removedItem.requestKind,
                    vipTokenCost: removedItem.vipTokenCost,
                    requesterLogin: removedItem.requestedByLogin,
                    channelLogin:
                      previous.channel.login?.trim() ||
                      previous.channel.slug?.trim() ||
                      "",
                  }),
                })
              : previous.vipTokens,
          playedSongs:
            action === "markPlayed" && removedItem
              ? [
                  {
                    id: `optimistic-${removedItem.id}`,
                    songTitle: removedItem.songTitle,
                    songArtist: removedItem.songArtist,
                    requestedByDisplayName:
                      removedItem.requestedByDisplayName ??
                      removedItem.requestedByLogin,
                    playedAt: Date.now(),
                  },
                  ...previous.playedSongs,
                ]
              : previous.playedSongs,
        });
      }

      if (itemId && action === "setCurrent") {
        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: getReorderedItemsAfterSetCurrent(previous.items, itemId),
        });
      }

      if (itemId && action === "returnToQueue") {
        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: getReorderedItemsAfterReturnToQueue(previous.items),
        });
      }

      if (
        itemId &&
        action === "changeRequestKind" &&
        (body.requestKind === "vip" || body.requestKind === "regular")
      ) {
        const targetItem =
          previous.items.find((item) => item.id === itemId) ?? null;

        if (targetItem) {
          const channelLogin =
            previous.channel.login?.trim() ||
            previous.channel.slug?.trim() ||
            "";
          const currentVipTokenCost = getManagedStoredVipTokenCost({
            requestKind: targetItem.requestKind,
            vipTokenCost: targetItem.vipTokenCost,
            requesterLogin: targetItem.requestedByLogin,
            channelLogin,
          });
          const nextVipTokenCost = getManagedPlaylistRequestVipTokenCost({
            requestKind: body.requestKind,
            durationText: targetItem.songDurationText,
            requestedQuery: targetItem.requestedQuery,
            thresholds: vipTokenDurationThresholds,
            requesterLogin: targetItem.requestedByLogin,
            channelLogin,
            requestPathModifierVipTokenCost:
              previous.settings?.requestPathModifierVipTokenCost ?? 0,
            requestPathModifierVipTokenCosts:
              previous.settings?.requestPathModifierVipTokenCosts,
            requestPathModifierUsesVipPriority:
              previous.settings?.requestPathModifierUsesVipPriority ?? true,
          });
          const vipTokenDelta = nextVipTokenCost - currentVipTokenCost;

          queryClient.setQueryData(playlistQueryKey, {
            ...previous,
            items: getReorderedItemsAfterRequestKindChange(
              previous.items,
              itemId,
              body.requestKind
            ).map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    requestKind: body.requestKind,
                    vipTokenCost: nextVipTokenCost,
                  }
                : item
            ),
            vipTokens: updateVipTokenBalancesAfterRequestKindChange({
              vipTokens: previous.vipTokens,
              requesterLogin: targetItem.requestedByLogin,
              delta: vipTokenDelta,
            }),
          });
        }
      }

      return { previous };
    },
    onError: (error, body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(playlistQueryKey, context.previous);
      }

      const action = typeof body.action === "string" ? body.action : "unknown";
      const message = getErrorMessage(
        error,
        t("management.states.playlistUpdateFailed")
      );

      if (action === "manualAdd") {
        setManualAddError(message);
      } else {
        setPlaylistActionError(message);
      }
    },
    onSuccess: (_data, body) => {
      setManualAddError(null);
      setPlaylistActionError(null);
      if (body.action === "manualAdd") {
        setManualQuery("");
        setDebouncedManualQuery("");
        setManualRequesterLogin("");
      }
      if (props.invalidateOnMutationSuccess ?? true) {
        void queryClient.invalidateQueries({
          queryKey: playlistQueryKey,
        });
      }
    },
    onSettled: () => {
      setPendingRowAction(null);
    },
  });
  const moderationMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!moderationEndpoint) {
        throw new Error(t("management.states.moderationUnavailable"));
      }

      const response = await fetch(moderationEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            payload?.message ??
            t("management.states.blacklistUpdateFailed")
        );
      }

      return payload;
    },
    onMutate: () => {
      setPlaylistActionError(null);
    },
    onError: (error) => {
      setPlaylistActionError(
        getErrorMessage(error, t("management.states.blacklistUpdateFailed"))
      );
    },
    onSuccess: () => {
      setPlaylistActionError(null);
      if (props.invalidateOnMutationSuccess ?? true) {
        void queryClient.invalidateQueries({
          queryKey: playlistQueryKey,
        });
      }
    },
  });

  const playedSongs = playlistData?.playedSongs ?? [];
  const showPickOrderBadges = !!playlistData?.settings?.showPickOrderBadges;
  const items = useMemo(() => {
    const baseItems = playlistData?.items ?? [];
    const pickNumbers = getPickNumbersForQueuedItems(baseItems, playedSongs);

    return baseItems.map((item, index) => ({
      ...item,
      pickNumber: pickNumbers[index] ?? null,
    }));
  }, [playedSongs, playlistData?.items]);
  const currentItemId = useMemo(
    () => items.find((item) => item.status === "current")?.id ?? null,
    [items]
  );

  const vipTokens = playlistData?.vipTokens ?? [];
  const requestsEnabled = playlistData?.settings?.requestsEnabled ?? true;
  const managedChannel = playlistData?.channel ?? null;
  const managedChannelLogin =
    managedChannel?.login?.trim() || managedChannel?.slug?.trim() || "";
  const canEndSession =
    items.length > 0 || playedSongs.length > 0 || requestsEnabled;
  const resetSessionTooltip = t(
    showPickOrderBadges
      ? "management.actions.resetSessionTooltipWithPickOrder"
      : "management.actions.resetSessionTooltip"
  );
  const resetSessionDescription = t(
    showPickOrderBadges
      ? "management.actions.resetDialog.descriptionWithPickOrder"
      : "management.actions.resetDialog.description"
  );
  const blacklistArtists = playlistData?.blacklistArtists ?? [];
  const blacklistCharters = playlistData?.blacklistCharters ?? [];
  const preferredCharters = playlistData?.preferredCharters ?? [];
  const blacklistSongs = playlistData?.blacklistSongs ?? [];
  const blacklistSongGroups = playlistData?.blacklistSongGroups ?? [];
  const blacklistedArtistIds = new Set(
    blacklistArtists.map((item) => item.artistId)
  );
  const blacklistedSongIds = new Set(blacklistSongs.map((item) => item.songId));
  const blacklistedSongGroupIds = new Set(
    blacklistSongGroups.map((item) => item.groupedProjectId)
  );
  const blacklistedCharterIds = new Set(
    blacklistCharters.map((item) => item.charterId)
  );
  const preferredCharterIds = new Set(
    preferredCharters.map((item) => item.charterId)
  );
  const vipTokenBalancesByLogin = new Map(
    vipTokens.map((token) => [token.login.toLowerCase(), token.availableCount])
  );
  const requestsOpen = managedChannel
    ? areChannelRequestsOpen(managedChannel)
    : false;
  const accessRole = playlistData?.accessRole ?? "owner";
  const canUseManualVipTokenBalances =
    !!playlistData?.settings?.canViewVipTokens ||
    !!playlistData?.settings?.canManageVipTokens ||
    accessRole === "owner";
  const botChannelEnabled = !!playlistData?.settings?.botChannelEnabled;
  const canManageBlacklist = !!playlistData?.settings?.canManageBlacklist;
  const isDeletingItem = (itemId: string) =>
    mutation.isPending &&
    pendingRowAction?.action === "deleteItem" &&
    pendingRowAction.itemId === itemId;
  const isRowPending = (action: string, itemId: string) =>
    mutation.isPending &&
    pendingRowAction?.action === action &&
    pendingRowAction.itemId === itemId;
  const isManualAddPending = (songId: string) =>
    mutation.isPending &&
    pendingRowAction?.action === "manualAdd" &&
    pendingRowAction.songId === songId;
  const isRestorePending = (playedSongId: string) =>
    mutation.isPending &&
    pendingRowAction?.action === "restorePlayed" &&
    pendingRowAction.songId === playedSongId;
  const isBotTogglePending =
    mutation.isPending && pendingRowAction?.action === "setBotChannelEnabled";
  const isClearPlaylistPending =
    mutation.isPending && pendingRowAction?.action === "clearPlaylist";
  const isResetSessionPending =
    mutation.isPending && pendingRowAction?.action === "resetSession";
  const confirmDeleteItem = () => {
    if (!deleteDialogItem) {
      return;
    }

    const itemId = deleteDialogItem.id;
    setDeleteDialogItem(null);
    mutation.mutate({
      action: "deleteItem",
      itemId,
    });
  };
  const handleShufflePlaylist = () => {
    mutation.mutate({ action: "shufflePlaylist" });
  };
  const handleClearPlaylist = () => {
    setShowClearPlaylistDialog(true);
  };
  const handleResetSession = () => {
    setShowResetSessionDialog(true);
  };
  const confirmClearPlaylist = () => {
    setShowClearPlaylistDialog(false);
    mutation.mutate({ action: "clearPlaylist" });
  };
  const confirmResetSession = () => {
    setShowResetSessionDialog(false);
    mutation.mutate({ action: "resetSession" });
  };
  const handleBotToggle = (enabled: boolean) => {
    if (enabled) {
      mutation.mutate({
        action: "setBotChannelEnabled",
        enabled: true,
      });
      return;
    }

    setShowDisableBotDialog(true);
  };
  const confirmDisableBot = () => {
    setShowDisableBotDialog(false);
    mutation.mutate({
      action: "setBotChannelEnabled",
      enabled: false,
    });
  };
  const reorderPlaylist = (
    sourceItemId: string,
    targetItemId: string,
    edge: Edge
  ) => {
    const orderedItemIds = getReorderedItemIds(
      items,
      sourceItemId,
      targetItemId,
      edge
    );

    if (!orderedItemIds) {
      return;
    }

    mutation.mutate({
      action: "reorderItems",
      orderedItemIds,
    });
  };

  const reorderPlaylistByMoveAction = (
    itemId: string,
    moveAction: "top" | "up" | "down" | "bottom"
  ) => {
    const orderedItemIds = getOrderedItemIdsForMoveAction(
      items,
      itemId,
      moveAction
    );

    if (!orderedItemIds) {
      return;
    }

    setDraggingItemId(null);
    setDropTargetState(null);
    mutation.mutate({
      action: "reorderItems",
      orderedItemIds,
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updatePreference = () => {
      setUseTouchReorderControls(
        mediaQuery.matches || navigator.maxTouchPoints > 0
      );
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  return (
    <div className="dashboard-playlist grid gap-6">
      {props.headerTitle ? (
        <DashboardPageHeader
          title={props.headerTitle}
          description={
            props.headerDescription ??
            (managedChannel
              ? accessRole === "moderator"
                ? t("management.header.managing", {
                    channel: managedChannel.displayName,
                  })
                : t("management.header.channel", {
                    channel: managedChannel.displayName,
                  })
              : undefined)
          }
        />
      ) : null}

      {props.showManualAdd !== false ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("management.manual.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input
              value={manualRequesterLogin}
              onChange={(event) => setManualRequesterLogin(event.target.value)}
              placeholder={t("management.manual.requesterPlaceholder")}
              disabled={!requestsOpen}
            />
            <Input
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              placeholder={t("management.manual.searchPlaceholder")}
              disabled={!requestsOpen}
            />
            {!requestsOpen ? (
              <div className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {t("page.requestsLiveOnly")}
              </div>
            ) : null}
            {manualQueryTooShort ? (
              <p className="text-sm text-(--muted)">
                {t("management.manual.searchMin")}
              </p>
            ) : null}
            {manualSearchQuery.error ? (
              <p className="text-sm text-rose-300">
                {getErrorMessage(manualSearchQuery.error)}
              </p>
            ) : null}
            {manualAddError ? (
              <div className="border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {manualAddError}
              </div>
            ) : null}
            {manualQuery.trim().length >= 3 ? (
              <div className="dashboard-playlist__manual-results overflow-hidden border border-(--border)">
                <div className="dashboard-playlist__manual-head grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_96px] gap-4 bg-(--panel-muted) px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
                  <div>{t("management.manual.table.track")}</div>
                  <div>{t("management.manual.table.albumCreator")}</div>
                  <div>{t("management.manual.table.tuningPath")}</div>
                  <div>{t("management.manual.table.add")}</div>
                </div>
                {manualSearchQuery.data?.results?.map((song, index) => {
                  const isBlacklistedCharter =
                    song.authorId != null &&
                    blacklistedCharterIds.has(song.authorId);
                  const displaySongParts = getPlaylistDisplayParts(song.parts);
                  const manualAddVipTokenCost =
                    getManagedPlaylistRequestVipTokenCost({
                      requestKind: "regular",
                      durationText: song.durationText,
                      thresholds: vipTokenDurationThresholds,
                      requesterLogin:
                        manualRequesterLogin.trim() || managedChannelLogin,
                      channelLogin: managedChannelLogin,
                      requestPathModifierVipTokenCost:
                        playlistQuery.data?.settings
                          ?.requestPathModifierVipTokenCost ?? 0,
                      requestPathModifierVipTokenCosts:
                        playlistQuery.data?.settings
                          ?.requestPathModifierVipTokenCosts,
                      requestPathModifierUsesVipPriority:
                        playlistQuery.data?.settings
                          ?.requestPathModifierUsesVipPriority ?? true,
                    });
                  const manualAddAvailableVipTokenCount =
                    manualAddVipTokenCost > 0 && canUseManualVipTokenBalances
                      ? (vipTokenBalancesByLogin.get(
                          (manualRequesterLogin.trim() || "").toLowerCase()
                        ) ?? 0)
                      : null;
                  const manualAddHasInsufficientVipTokens =
                    manualAddAvailableVipTokenCount != null &&
                    manualAddVipTokenCost > manualAddAvailableVipTokenCount;
                  const manualAddCostLabel = getManagedVipTokenStatusLabel({
                    requiredVipTokenCost: manualAddVipTokenCost,
                    availableVipTokenCount: manualAddAvailableVipTokenCount,
                    t,
                  });

                  return (
                    <div
                      key={song.id}
                      className={`dashboard-playlist__manual-row grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_96px] gap-4 border-t border-(--border) px-5 py-4 ${
                        index % 2 === 0
                          ? "bg-(--panel-strong)"
                          : "bg-(--panel-soft)"
                      }`}
                    >
                      <div className="dashboard-playlist__manual-track min-w-0">
                        <p className="truncate font-semibold text-(--text)">
                          {song.title}
                        </p>
                        <p className="mt-1 truncate text-sm text-(--brand-deep)">
                          {song.artist ?? t("management.manual.unknownArtist")}
                        </p>
                      </div>
                      <div className="dashboard-playlist__manual-meta min-w-0">
                        <p className="truncate text-sm text-(--text)">
                          {song.album ?? t("management.manual.unknownAlbum")}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-(--muted)">
                          <span>
                            {song.creator
                              ? t("management.manual.chartedBy", {
                                  creator: song.creator,
                                })
                              : t("management.manual.unknownCreator")}
                          </span>
                          {isBlacklistedCharter ? (
                            <Badge
                              variant="outline"
                              className="border-rose-400/40 bg-rose-500/10 text-rose-200"
                            >
                              {t("management.manual.blacklisted")}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="dashboard-playlist__manual-extra min-w-0">
                        <p className="truncate text-sm text-(--text)">
                          {song.tuning ?? t("management.manual.noTuningInfo")}
                        </p>
                        <p className="mt-1 truncate text-sm text-(--muted)">
                          {displaySongParts.length > 0
                            ? displaySongParts
                                .map((part) => formatPathLabel(part))
                                .join(", ")
                            : t("management.manual.noPathInfo")}
                        </p>
                      </div>
                      <div className="dashboard-playlist__manual-add grid justify-items-end gap-1 self-start text-right">
                        <Button
                          size="sm"
                          className="h-8 px-2.5 text-[11px]"
                          onClick={() =>
                            mutation.mutate({
                              action: "manualAdd",
                              songId: song.id,
                              requesterLogin:
                                manualRequesterLogin.trim() || undefined,
                              title: song.title,
                              groupedProjectId: song.groupedProjectId,
                              authorId: song.authorId,
                              artist: song.artist,
                              album: song.album,
                              creator: song.creator,
                              tuning: song.tuning,
                              parts: song.parts,
                              durationText: song.durationText,
                              source: song.source,
                              sourceUrl: song.sourceUrl,
                              sourceId: song.sourceId,
                              candidateMatchesJson: JSON.stringify([
                                {
                                  id: song.id,
                                  groupedProjectId: song.groupedProjectId,
                                  authorId: song.authorId,
                                  title: song.title,
                                  artist: song.artist,
                                  album: song.album,
                                  creator: song.creator,
                                  tuning: song.tuning,
                                  parts: song.parts ?? [],
                                  hasLyrics: song.hasLyrics,
                                  durationText: song.durationText,
                                  sourceUrl: song.sourceUrl,
                                  sourceId: song.sourceId,
                                },
                              ]),
                            })
                          }
                          disabled={
                            !requestsOpen ||
                            isManualAddPending(song.id) ||
                            manualAddHasInsufficientVipTokens
                          }
                          title={
                            !requestsOpen
                              ? t("page.requestsLiveOnly")
                              : manualAddHasInsufficientVipTokens
                                ? manualAddCostLabel || undefined
                                : undefined
                          }
                        >
                          <Plus className="h-4 w-4" />
                          {t("management.manual.addButton")}
                        </Button>
                        {manualAddCostLabel ? (
                          <p className="text-[11px] leading-4 text-(--muted)">
                            {manualAddCostLabel}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {props.embedCurrentPlaylist ? (
          <section className="grid max-[960px]:px-3">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
              {props.currentPlaylistTitle ? (
                <h2 className="text-4xl font-semibold text-(--text)">
                  {props.currentPlaylistTitle}
                </h2>
              ) : null}
              <PlaylistManagementActions
                className="dashboard-playlist__actions dashboard-playlist__actions--public flex flex-wrap items-center gap-3"
                showBotToggle={false}
                botEnabled={botChannelEnabled}
                isBotTogglePending={isBotTogglePending}
                onToggleBot={handleBotToggle}
                itemCount={items.length}
                canEndSession={canEndSession}
                resetSessionTooltip={resetSessionTooltip}
                isMutationPending={mutation.isPending}
                isResetSessionPending={isResetSessionPending}
                onShuffle={handleShufflePlaylist}
                onClear={handleClearPlaylist}
                onReset={handleResetSession}
              />
            </div>
            <CurrentPlaylistRows
              items={items}
              playlistActionError={playlistActionError}
              draggingItemId={draggingItemId}
              dropTargetState={dropTargetState}
              currentItemId={currentItemId}
              showPickOrderBadges={showPickOrderBadges}
              canManageBlacklist={canManageBlacklist}
              blacklistedArtistIds={blacklistedArtistIds}
              blacklistedSongIds={blacklistedSongIds}
              blacklistedSongGroupIds={blacklistedSongGroupIds}
              blacklistedCharterIds={blacklistedCharterIds}
              preferredCharterIds={preferredCharterIds}
              canManageFavorites={props.canManageFavorites}
              isSongFavorited={props.isSongFavorited}
              favoritePendingGroupKey={props.favoritePendingGroupKey}
              onToggleFavorite={props.onToggleFavorite}
              vipTokenBalancesByLogin={vipTokenBalancesByLogin}
              channelLogin={managedChannelLogin}
              requestPathModifierVipTokenCost={
                playlistQuery.data?.settings?.requestPathModifierVipTokenCost ??
                0
              }
              requestPathModifierVipTokenCosts={
                playlistQuery.data?.settings?.requestPathModifierVipTokenCosts
              }
              requestPathModifierUsesVipPriority={
                playlistQuery.data?.settings
                  ?.requestPathModifierUsesVipPriority ?? true
              }
              vipTokenDurationThresholds={vipTokenDurationThresholds}
              isDeletingItem={isDeletingItem}
              isRowPending={isRowPending}
              isReorderPending={
                mutation.isPending &&
                pendingRowAction?.action === "reorderItems"
              }
              useTouchReorderControls={useTouchReorderControls}
              onDragStart={setDraggingItemId}
              onDragEnd={() => {
                setDraggingItemId(null);
                setDropTargetState(null);
              }}
              onDragHover={(targetItemId, edge) =>
                setDropTargetState({ itemId: targetItemId, edge })
              }
              onDragLeaveForItem={(itemId) => {
                setDropTargetState((current) =>
                  current?.itemId === itemId ? null : current
                );
              }}
              onReorder={reorderPlaylist}
              onMoveItem={reorderPlaylistByMoveAction}
              onSetCurrent={(itemId) =>
                mutation.mutate({
                  action: "setCurrent",
                  itemId,
                })
              }
              onReturnToQueue={(itemId) =>
                mutation.mutate({
                  action: "returnToQueue",
                  itemId,
                })
              }
              onMarkPlayed={(itemId) =>
                mutation.mutate({
                  action: "markPlayed",
                  itemId,
                })
              }
              onDelete={(item) =>
                setDeleteDialogItem({
                  id: item.id,
                  songTitle: item.songTitle,
                  songArtist: item.songArtist,
                })
              }
              onChangeRequestKind={(itemId, requestKind) =>
                mutation.mutate({
                  action: "changeRequestKind",
                  itemId,
                  requestKind,
                })
              }
              onBlacklistSong={(item) => {
                if (item.songCatalogSourceId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingRequestVersionId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "addBlacklistedSong",
                  songId: item.songCatalogSourceId,
                  songTitle: item.songTitle,
                  artistName: item.songArtist ?? undefined,
                });
              }}
              onBlacklistCandidateSong={(candidate) => {
                if (candidate.sourceId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingVersionVersionId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "addBlacklistedSong",
                  songId: candidate.sourceId,
                  songTitle: candidate.title,
                  artistName: candidate.artist ?? undefined,
                });
              }}
              onUnblacklistCandidateSong={(candidate) => {
                if (candidate.sourceId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingVersionVersionId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "removeBlacklistedSong",
                  songId: candidate.sourceId,
                });
              }}
              onBlacklistSongGroup={(item) => {
                if (item.songGroupedProjectId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingRequestSongGroupId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "addBlacklistedSongGroup",
                  groupedProjectId: item.songGroupedProjectId,
                  songTitle: item.songTitle,
                  artistId: item.songArtistId ?? null,
                  artistName: item.songArtist ?? undefined,
                });
              }}
              onBlacklistArtist={(item) => {
                if (item.songArtistId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingRequestArtistId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "addBlacklistedArtist",
                  artistId: item.songArtistId,
                  artistName:
                    item.songArtist ??
                    t("management.blacklistErrors.unknownArtist"),
                });
              }}
              onBlacklistCharter={(candidate) => {
                if (candidate.authorId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingVersionCharterId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "addBlacklistedCharter",
                  charterId: candidate.authorId,
                  charterName:
                    candidate.creator ??
                    t("management.blacklistErrors.unknownCharter"),
                });
              }}
              onPreferCharter={(candidate) => {
                if (candidate.authorId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingVersionCharterId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "addPreferredCharter",
                  charterId: candidate.authorId,
                  charterName:
                    candidate.creator ??
                    t("management.blacklistErrors.unknownCharter"),
                });
              }}
              onUnpreferCharter={(candidate) => {
                if (candidate.authorId == null) {
                  setPlaylistActionError(
                    t("management.blacklistErrors.missingVersionCharterId")
                  );
                  return;
                }

                moderationMutation.mutate({
                  action: "removePreferredCharter",
                  charterId: candidate.authorId,
                });
              }}
              isBlacklistArtistPending={moderationMutation.isPending}
              isBlacklistSongPending={moderationMutation.isPending}
              isBlacklistSongGroupPending={moderationMutation.isPending}
              isBlacklistCharterPending={moderationMutation.isPending}
            />
          </section>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <CardTitle>
                  {props.currentPlaylistTitle ?? t("management.currentTitle")}
                </CardTitle>
                <PlaylistManagementActions
                  className="dashboard-playlist__actions flex flex-wrap gap-3"
                  showBotToggle={accessRole === "owner"}
                  botEnabled={botChannelEnabled}
                  isBotTogglePending={isBotTogglePending}
                  onToggleBot={handleBotToggle}
                  itemCount={items.length}
                  canEndSession={canEndSession}
                  resetSessionTooltip={resetSessionTooltip}
                  isMutationPending={mutation.isPending}
                  isResetSessionPending={isResetSessionPending}
                  onShuffle={handleShufflePlaylist}
                  onClear={handleClearPlaylist}
                  onReset={handleResetSession}
                />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <CurrentPlaylistRows
                items={items}
                playlistActionError={playlistActionError}
                draggingItemId={draggingItemId}
                dropTargetState={dropTargetState}
                currentItemId={currentItemId}
                showPickOrderBadges={showPickOrderBadges}
                canManageBlacklist={canManageBlacklist}
                blacklistedArtistIds={blacklistedArtistIds}
                blacklistedSongIds={blacklistedSongIds}
                blacklistedSongGroupIds={blacklistedSongGroupIds}
                blacklistedCharterIds={blacklistedCharterIds}
                preferredCharterIds={preferredCharterIds}
                canManageFavorites={props.canManageFavorites}
                isSongFavorited={props.isSongFavorited}
                favoritePendingGroupKey={props.favoritePendingGroupKey}
                onToggleFavorite={props.onToggleFavorite}
                vipTokenBalancesByLogin={vipTokenBalancesByLogin}
                channelLogin={managedChannelLogin}
                requestPathModifierVipTokenCost={
                  playlistQuery.data?.settings
                    ?.requestPathModifierVipTokenCost ?? 0
                }
                requestPathModifierVipTokenCosts={
                  playlistQuery.data?.settings?.requestPathModifierVipTokenCosts
                }
                requestPathModifierUsesVipPriority={
                  playlistQuery.data?.settings
                    ?.requestPathModifierUsesVipPriority ?? true
                }
                vipTokenDurationThresholds={vipTokenDurationThresholds}
                isDeletingItem={isDeletingItem}
                isRowPending={isRowPending}
                isReorderPending={
                  mutation.isPending &&
                  pendingRowAction?.action === "reorderItems"
                }
                useTouchReorderControls={useTouchReorderControls}
                onDragStart={setDraggingItemId}
                onDragEnd={() => {
                  setDraggingItemId(null);
                  setDropTargetState(null);
                }}
                onDragHover={(targetItemId, edge) =>
                  setDropTargetState({ itemId: targetItemId, edge })
                }
                onDragLeaveForItem={(itemId) => {
                  setDropTargetState((current) =>
                    current?.itemId === itemId ? null : current
                  );
                }}
                onReorder={reorderPlaylist}
                onMoveItem={reorderPlaylistByMoveAction}
                onSetCurrent={(itemId) =>
                  mutation.mutate({
                    action: "setCurrent",
                    itemId,
                  })
                }
                onReturnToQueue={(itemId) =>
                  mutation.mutate({
                    action: "returnToQueue",
                    itemId,
                  })
                }
                onMarkPlayed={(itemId) =>
                  mutation.mutate({
                    action: "markPlayed",
                    itemId,
                  })
                }
                onDelete={(item) =>
                  setDeleteDialogItem({
                    id: item.id,
                    songTitle: item.songTitle,
                    songArtist: item.songArtist,
                  })
                }
                onChangeRequestKind={(itemId, requestKind) =>
                  mutation.mutate({
                    action: "changeRequestKind",
                    itemId,
                    requestKind,
                  })
                }
                onBlacklistSong={(item) => {
                  if (item.songCatalogSourceId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingRequestVersionId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "addBlacklistedSong",
                    songId: item.songCatalogSourceId,
                    songTitle: item.songTitle,
                    artistName: item.songArtist ?? undefined,
                  });
                }}
                onBlacklistCandidateSong={(candidate) => {
                  if (candidate.sourceId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingVersionVersionId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "addBlacklistedSong",
                    songId: candidate.sourceId,
                    songTitle: candidate.title,
                    artistName: candidate.artist ?? undefined,
                  });
                }}
                onUnblacklistCandidateSong={(candidate) => {
                  if (candidate.sourceId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingVersionVersionId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "removeBlacklistedSong",
                    songId: candidate.sourceId,
                  });
                }}
                onBlacklistSongGroup={(item) => {
                  if (item.songGroupedProjectId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingRequestSongGroupId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "addBlacklistedSongGroup",
                    groupedProjectId: item.songGroupedProjectId,
                    songTitle: item.songTitle,
                    artistId: item.songArtistId ?? null,
                    artistName: item.songArtist ?? undefined,
                  });
                }}
                onBlacklistArtist={(item) => {
                  if (item.songArtistId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingRequestArtistId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "addBlacklistedArtist",
                    artistId: item.songArtistId,
                    artistName:
                      item.songArtist ??
                      t("management.blacklistErrors.unknownArtist"),
                  });
                }}
                onBlacklistCharter={(candidate) => {
                  if (candidate.authorId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingVersionCharterId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "addBlacklistedCharter",
                    charterId: candidate.authorId,
                    charterName:
                      candidate.creator ??
                      t("management.blacklistErrors.unknownCharter"),
                  });
                }}
                onPreferCharter={(candidate) => {
                  if (candidate.authorId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingVersionCharterId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "addPreferredCharter",
                    charterId: candidate.authorId,
                    charterName:
                      candidate.creator ??
                      t("management.blacklistErrors.unknownCharter"),
                  });
                }}
                onUnpreferCharter={(candidate) => {
                  if (candidate.authorId == null) {
                    setPlaylistActionError(
                      t("management.blacklistErrors.missingVersionCharterId")
                    );
                    return;
                  }

                  moderationMutation.mutate({
                    action: "removePreferredCharter",
                    charterId: candidate.authorId,
                  });
                }}
                isBlacklistArtistPending={moderationMutation.isPending}
                isBlacklistSongPending={moderationMutation.isPending}
                isBlacklistSongGroupPending={moderationMutation.isPending}
                isBlacklistCharterPending={moderationMutation.isPending}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {props.showAncillaryPanels !== false ? (
        <>
          <BlacklistPanel
            artists={blacklistArtists}
            charters={blacklistCharters}
            songs={blacklistSongs}
            songGroups={blacklistSongGroups}
            description={t("management.blacklistPanelDescription")}
            collapsible
            defaultOpen={false}
          />

          <Card>
            <CardHeader>
              <CardTitle>{t("management.history.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {playedSongs.map((song, index) => (
                <div
                  key={song.id}
                  className={`border px-4 py-3 ${
                    index % 2 === 0
                      ? "border-(--border) bg-(--panel-soft)"
                      : "border-(--border) bg-(--panel-muted)"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-(--text)">
                        {song.songTitle}
                      </p>
                      {song.songArtist ? (
                        <p className="mt-1 text-sm text-(--brand-deep)">
                          {song.songArtist}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        {(song.requestedByDisplayName ??
                        song.requestedByLogin) ? (
                          <p className="text-(--brand-deep)">
                            {t("management.history.requestedBy", {
                              requester:
                                song.requestedByDisplayName ??
                                song.requestedByLogin,
                            })}
                          </p>
                        ) : null}
                        <p className="text-(--muted)">
                          {t("management.history.played", {
                            time: formatTimeAgo(t, song.playedAt),
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {song.requestKind === "vip" ? (
                        <Badge className="border-violet-400/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/10">
                          VIP
                        </Badge>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          mutation.mutate({
                            action: "restorePlayed",
                            playedSongId: song.id,
                          })
                        }
                        disabled={isRestorePending(song.id)}
                      >
                        {isRestorePending(song.id)
                          ? t("management.history.restoring")
                          : t("management.history.restore")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {playedSongs.length === 0 ? (
                <p className="text-sm leading-7 text-(--muted)">
                  {t("management.history.empty")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      <AlertDialog
        open={showClearPlaylistDialog}
        onOpenChange={setShowClearPlaylistDialog}
      >
        <AlertDialogContent className="bg-(--panel)">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("management.actions.clearDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("management.actions.clearDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearPlaylistPending}>
              {t("management.actions.clearDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClearPlaylist}
              disabled={isClearPlaylistPending}
              className="border-transparent bg-rose-600 text-white shadow-none hover:bg-rose-700"
            >
              {t("management.actions.clearDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={showResetSessionDialog}
        onOpenChange={setShowResetSessionDialog}
      >
        <AlertDialogContent className="bg-(--panel)">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("management.actions.resetDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resetSessionDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetSessionPending}>
              {t("management.actions.resetDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetSession}
              disabled={isResetSessionPending}
              className="border-transparent bg-rose-600 text-white shadow-none hover:bg-rose-700"
            >
              {t("management.actions.resetDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={deleteDialogItem != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogItem(null);
          }
        }}
      >
        <AlertDialogContent className="bg-(--panel)">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("management.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogItem
                ? deleteDialogItem.songArtist
                  ? t("management.deleteDialog.descriptionWithArtist", {
                      title: deleteDialogItem.songTitle,
                      artist: deleteDialogItem.songArtist,
                    })
                  : t("management.deleteDialog.descriptionWithoutArtist", {
                      title: deleteDialogItem.songTitle,
                    })
                : t("management.deleteDialog.descriptionFallback")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("management.deleteDialog.keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
              disabled={
                mutation.isPending &&
                deleteDialogItem != null &&
                isDeletingItem(deleteDialogItem.id)
              }
              className="border-transparent bg-rose-600 text-white shadow-none hover:bg-rose-700"
            >
              {mutation.isPending &&
              deleteDialogItem != null &&
              isDeletingItem(deleteDialogItem.id)
                ? t("management.deleteDialog.removing")
                : t("management.deleteDialog.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={showDisableBotDialog}
        onOpenChange={setShowDisableBotDialog}
      >
        <AlertDialogContent className="bg-(--panel)">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("management.bot.disableDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("management.bot.disableDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBotTogglePending}>
              {t("management.bot.disableDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisableBot}
              disabled={isBotTogglePending}
              className="border-transparent bg-rose-600 text-white shadow-none hover:bg-rose-700"
            >
              {t("management.bot.disableDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CurrentPlaylistRows(props: {
  items: PlaylistItem[];
  playlistActionError: string | null;
  draggingItemId: string | null;
  dropTargetState: { itemId: string; edge: Edge } | null;
  currentItemId: string | null;
  showPickOrderBadges: boolean;
  canManageBlacklist: boolean;
  blacklistedArtistIds: Set<number>;
  blacklistedSongIds: Set<number>;
  blacklistedSongGroupIds: Set<number>;
  blacklistedCharterIds: Set<number>;
  preferredCharterIds: Set<number>;
  canManageFavorites?: boolean;
  isSongFavorited?: (groupKey: string) => boolean;
  favoritePendingGroupKey?: string | null;
  onToggleFavorite?: (input: {
    songId: string;
    groupKey: string;
    favorited: boolean;
  }) => void;
  vipTokenBalancesByLogin: Map<string, number>;
  channelLogin: string;
  requestPathModifierVipTokenCost: number;
  requestPathModifierVipTokenCosts?: {
    guitar: number;
    lead: number;
    rhythm: number;
    bass: number;
  };
  requestPathModifierUsesVipPriority: boolean;
  vipTokenDurationThresholds: VipTokenDurationThreshold[];
  isDeletingItem: (itemId: string) => boolean;
  isRowPending: (action: string, itemId: string) => boolean;
  isReorderPending: boolean;
  useTouchReorderControls: boolean;
  isBlacklistArtistPending: boolean;
  isBlacklistSongPending: boolean;
  isBlacklistSongGroupPending: boolean;
  isBlacklistCharterPending: boolean;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragHover: (targetItemId: string, edge: Edge) => void;
  onDragLeaveForItem: (itemId: string) => void;
  onReorder: (sourceItemId: string, targetItemId: string, edge: Edge) => void;
  onMoveItem: (
    itemId: string,
    moveAction: "top" | "up" | "down" | "bottom"
  ) => void;
  onSetCurrent: (itemId: string) => void;
  onReturnToQueue: (itemId: string) => void;
  onMarkPlayed: (itemId: string) => void;
  onDelete: (item: PlaylistItem) => void;
  onChangeRequestKind: (itemId: string, requestKind: "regular" | "vip") => void;
  onBlacklistSong: (item: PlaylistItem) => void;
  onBlacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onUnblacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onBlacklistSongGroup: (item: PlaylistItem) => void;
  onBlacklistArtist: (item: PlaylistItem) => void;
  onBlacklistCharter: (candidate: PlaylistCandidate) => void;
  onPreferCharter: (candidate: PlaylistCandidate) => void;
  onUnpreferCharter: (candidate: PlaylistCandidate) => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const reorderableItemIds = props.items
    .filter((item) => item.id !== props.currentItemId)
    .map((item) => item.id);

  return (
    <>
      {props.playlistActionError ? (
        <div className="border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {props.playlistActionError}
        </div>
      ) : null}
      <AnimatePresence initial={false} mode="popLayout">
        {props.items.map((item, index) => {
          const resolvedCandidates = getResolvedPlaylistCandidates(item);
          const favoriteSongs =
            resolvedCandidates.length > 0
              ? resolvedCandidates.map((candidate) => ({
                  id: candidate.id,
                  groupedProjectId: candidate.groupedProjectId,
                  title: candidate.title,
                  artist: candidate.artist,
                }))
              : item.songId
                ? [
                    {
                      id: item.songId,
                      groupedProjectId: item.songGroupedProjectId,
                      title: item.songTitle,
                      artist: item.songArtist,
                    },
                  ]
                : [];
          const favoriteGroup =
            favoriteSongs.length > 0 ? summarizeSongGroup(favoriteSongs) : null;
          const favoriteSongId =
            item.songId ??
            resolvedCandidates[0]?.id ??
            favoriteSongs[0]?.id ??
            null;
          const favoriteGroupKey =
            favoriteGroup?.groupKey ??
            (favoriteSongId
              ? getSongPrimaryGroupKey({
                  id: favoriteSongId,
                  groupedProjectId: item.songGroupedProjectId,
                  title: item.songTitle,
                  artist: item.songArtist,
                })
              : null);
          const isFavorited =
            favoriteGroupKey != null
              ? (props.isSongFavorited?.(favoriteGroupKey) ?? false)
              : false;
          const onToggleFavorite =
            favoriteSongId != null &&
            favoriteGroupKey != null &&
            props.onToggleFavorite
              ? () =>
                  props.onToggleFavorite?.({
                    songId: favoriteSongId,
                    groupKey: favoriteGroupKey,
                    favorited: !isFavorited,
                  })
              : undefined;

          return (
            <PlaylistQueueItem
              key={item.id}
              item={item}
              index={index}
              draggingItemId={props.draggingItemId}
              dropTargetState={props.dropTargetState}
              currentItemId={props.currentItemId}
              showPickOrderBadges={props.showPickOrderBadges}
              isDeletingItem={props.isDeletingItem(item.id)}
              isSetCurrentPending={props.isRowPending("setCurrent", item.id)}
              isReturnToQueuePending={props.isRowPending(
                "returnToQueue",
                item.id
              )}
              isMarkPlayedPending={props.isRowPending("markPlayed", item.id)}
              isChangeRequestKindPending={props.isRowPending(
                "changeRequestKind",
                item.id
              )}
              isReorderPending={props.isReorderPending}
              useTouchReorderControls={props.useTouchReorderControls}
              reorderableIndex={reorderableItemIds.indexOf(item.id)}
              reorderableCount={reorderableItemIds.length}
              canManageBlacklist={props.canManageBlacklist}
              isBlacklistedArtist={
                item.songArtistId != null &&
                props.blacklistedArtistIds.has(item.songArtistId)
              }
              isBlacklistedSong={
                item.songCatalogSourceId != null &&
                props.blacklistedSongIds.has(item.songCatalogSourceId)
              }
              isBlacklistedSongGroup={
                item.songGroupedProjectId != null &&
                props.blacklistedSongGroupIds.has(item.songGroupedProjectId)
              }
              isBlacklistArtistPending={props.isBlacklistArtistPending}
              isBlacklistSongPending={props.isBlacklistSongPending}
              isBlacklistSongGroupPending={props.isBlacklistSongGroupPending}
              isBlacklistCharterPending={props.isBlacklistCharterPending}
              availableVipTokenCount={
                item.requestedByLogin
                  ? (props.vipTokenBalancesByLogin.get(
                      item.requestedByLogin.toLowerCase()
                    ) ?? 0)
                  : 0
              }
              channelLogin={props.channelLogin}
              requestPathModifierVipTokenCost={
                props.requestPathModifierVipTokenCost
              }
              requestPathModifierVipTokenCosts={
                props.requestPathModifierVipTokenCosts
              }
              requestPathModifierUsesVipPriority={
                props.requestPathModifierUsesVipPriority
              }
              vipTokenDurationThresholds={props.vipTokenDurationThresholds}
              blacklistedCharterIds={props.blacklistedCharterIds}
              preferredCharterIds={props.preferredCharterIds}
              blacklistedSongIds={props.blacklistedSongIds}
              canManageFavorites={
                !!props.canManageFavorites &&
                favoriteSongId != null &&
                favoriteGroupKey != null
              }
              isFavorited={isFavorited}
              favoritePending={
                favoriteGroupKey != null &&
                props.favoritePendingGroupKey === favoriteGroupKey
              }
              onToggleFavorite={onToggleFavorite}
              onDragStart={props.onDragStart}
              onDragEnd={props.onDragEnd}
              onDragHover={props.onDragHover}
              onDragLeave={() => {
                props.onDragLeaveForItem(item.id);
              }}
              onReorder={props.onReorder}
              onMoveItem={(moveAction) => props.onMoveItem(item.id, moveAction)}
              onSetCurrent={() => props.onSetCurrent(item.id)}
              onReturnToQueue={() => props.onReturnToQueue(item.id)}
              onMarkPlayed={() => props.onMarkPlayed(item.id)}
              onDelete={() => props.onDelete(item)}
              onChangeRequestKind={(requestKind) =>
                props.onChangeRequestKind(item.id, requestKind)
              }
              onBlacklistSong={() => props.onBlacklistSong(item)}
              onBlacklistCandidateSong={props.onBlacklistCandidateSong}
              onUnblacklistCandidateSong={props.onUnblacklistCandidateSong}
              onBlacklistSongGroup={() => props.onBlacklistSongGroup(item)}
              onBlacklistArtist={() => props.onBlacklistArtist(item)}
              onBlacklistCharter={props.onBlacklistCharter}
              onPreferCharter={props.onPreferCharter}
              onUnpreferCharter={props.onUnpreferCharter}
            />
          );
        })}
      </AnimatePresence>
      {props.items.length === 0 ? (
        <p className="px-4 text-sm leading-7 text-(--muted)">
          {t("management.queue.empty")}
        </p>
      ) : null}
    </>
  );
}

export function GroupedSongsReviewCard(props: {
  query: string;
  onQueryChange: (value: string) => void;
  groupingSource: GroupedSongsGroupingFilter;
  onGroupingSourceChange: (value: GroupedSongsGroupingFilter) => void;
  page: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  isLoading: boolean;
  error: string | null;
  total: number;
  pageSize: number;
  hasNextPage: boolean;
  items: GroupedSongsReportResponse["items"];
  canManageBlacklist: boolean;
  blacklistedSongIds: Set<number>;
  blacklistedCharterIds: Set<number>;
  preferredCharterIds: Set<number>;
  isBlacklistSongPending: boolean;
  onBlacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onUnblacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onPreferCharter: (candidate: PlaylistCandidate) => void;
  onUnpreferCharter: (candidate: PlaylistCandidate) => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const { locale } = useAppLocale();
  const start = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const end = Math.min(props.total, start + props.items.length - 1);

  return (
    <Card>
      <CardHeader className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>{t("management.groupedSongs.title")}</CardTitle>
            <p className="text-sm text-(--muted)">
              {t("management.groupedSongs.description")}
            </p>
          </div>
          <Badge variant="outline" className="h-8 px-3 text-[11px]">
            {t("management.groupedSongs.count", { count: props.total })}
          </Badge>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid w-full max-w-3xl gap-3">
            <Input
              value={props.query}
              onChange={(event) => props.onQueryChange(event.target.value)}
              placeholder={t("management.groupedSongs.searchPlaceholder")}
            />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "all",
                  "fallback",
                  "groupedProjectId",
                  "both",
                ] as GroupedSongsGroupingFilter[]
              ).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={
                    props.groupingSource === value ? "default" : "outline"
                  }
                  onClick={() => props.onGroupingSourceChange(value)}
                  className="h-8 px-3 text-[11px]"
                >
                  {t(`management.groupedSongs.filters.${value}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-(--muted)">
            <span>
              {props.total > 0
                ? t("management.groupedSongs.showing", {
                    start,
                    end,
                    total: props.total,
                  })
                : t("management.groupedSongs.empty")}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={props.onPreviousPage}
              disabled={props.page <= 1 || props.isLoading}
            >
              {t("management.groupedSongs.previous")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={props.onNextPage}
              disabled={!props.hasNextPage || props.isLoading}
            >
              {t("management.groupedSongs.next")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {props.error ? (
          <div className="border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {props.error}
          </div>
        ) : null}
        {props.isLoading ? (
          <p className="text-sm text-(--muted)">
            {t("management.groupedSongs.loading")}
          </p>
        ) : null}
        {!props.isLoading && !props.error && props.items.length === 0 ? (
          <p className="text-sm leading-7 text-(--muted)">
            {t("management.groupedSongs.empty")}
          </p>
        ) : null}
        {props.items.map((group) => {
          const groupingSourceLabel =
            group.groupingSource === "both"
              ? t("management.groupedSongs.groupingSource.both")
              : group.groupingSource === "fallback"
                ? t("management.groupedSongs.groupingSource.fallback")
                : t("management.groupedSongs.groupingSource.groupedProjectId");

          return (
            <Collapsible
              key={group.groupKey}
              className="border border-(--border) bg-(--panel-soft)"
            >
              <CollapsibleTrigger className="grid w-full gap-3 px-4 py-3 text-left hover:bg-(--panel)">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-(--text)">
                      {group.artist
                        ? `${group.title} - ${group.artist}`
                        : group.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--muted)">
                      <Badge variant="outline" className="h-7 px-2 text-[10px]">
                        {t("management.item.versionsCount", {
                          count: group.versionCount,
                        })}
                      </Badge>
                      <Badge variant="outline" className="h-7 px-2 text-[10px]">
                        {groupingSourceLabel}
                      </Badge>
                      {group.groupedProjectIds.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="h-7 px-2 text-[10px] normal-case tracking-normal"
                        >
                          {t("management.groupedSongs.projectIds", {
                            ids: group.groupedProjectIds.join(", "),
                          })}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-1 text-right text-xs text-(--muted)">
                    {group.tuning ? <p>{group.tuning}</p> : null}
                    <p>
                      {group.latestUpdatedAt
                        ? formatLocaleDate(locale, group.latestUpdatedAt, {
                            dateStyle: "medium",
                          })
                        : t("management.versionsTable.unknown")}
                      {group.downloads != null
                        ? ` · ${formatNumber(locale, group.downloads)}`
                        : ""}
                    </p>
                    <p className="font-medium text-(--brand-deep)">
                      {t("management.groupedSongs.showVersions")}
                    </p>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <PlaylistVersionsTable
                  itemId={group.groupKey}
                  candidates={group.versions}
                  canManageBlacklist={props.canManageBlacklist}
                  blacklistedSongIds={props.blacklistedSongIds}
                  blacklistedCharterIds={props.blacklistedCharterIds}
                  preferredCharterIds={props.preferredCharterIds}
                  isBlacklistSongPending={props.isBlacklistSongPending}
                  onBlacklistCandidateSong={props.onBlacklistCandidateSong}
                  onUnblacklistCandidateSong={props.onUnblacklistCandidateSong}
                  onPreferCharter={props.onPreferCharter}
                  onUnpreferCharter={props.onUnpreferCharter}
                />
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}

function getRequesterLabel(item: PlaylistItem) {
  return item.requestedByDisplayName ?? item.requestedByLogin ?? null;
}

function getRequestedPathLabel(item: Pick<PlaylistItem, "requestedQuery">) {
  const requestedPath = getPrimaryRequestedPath(item);
  return requestedPath ? formatPathLabel(requestedPath) : null;
}

function getStoredVipTokenCost(input: {
  requestKind?: "regular" | "vip" | null;
  vipTokenCost?: number | null;
}) {
  if (
    typeof input.vipTokenCost === "number" &&
    Number.isFinite(input.vipTokenCost) &&
    input.vipTokenCost >= 0
  ) {
    return Math.trunc(input.vipTokenCost);
  }

  return input.requestKind === "vip" ? 1 : 0;
}

function isOwnerPlaylistRequesterLogin(input: {
  requesterLogin?: string | null;
  channelLogin?: string | null;
}) {
  const normalizedRequester = input.requesterLogin?.trim().toLowerCase();
  const normalizedOwner = input.channelLogin?.trim().toLowerCase();

  return !!normalizedRequester && !!normalizedOwner
    ? normalizedRequester === normalizedOwner
    : false;
}

function getManagedStoredVipTokenCost(input: {
  requestKind?: "regular" | "vip" | null;
  vipTokenCost?: number | null;
  requesterLogin?: string | null;
  channelLogin?: string | null;
}) {
  if (
    isOwnerPlaylistRequesterLogin({
      requesterLogin: input.requesterLogin,
      channelLogin: input.channelLogin,
    })
  ) {
    return 0;
  }

  return getStoredVipTokenCost(input);
}

function getManagedPlaylistRequestVipTokenCost(input: {
  requestKind: "regular" | "vip";
  durationText?: string | null;
  requestedQuery?: string | null;
  thresholds: VipTokenDurationThreshold[];
  requesterLogin?: string | null;
  channelLogin?: string | null;
  requestPathModifierVipTokenCost: number;
  requestPathModifierVipTokenCosts?: {
    guitar: number;
    lead: number;
    rhythm: number;
    bass: number;
  };
  requestPathModifierUsesVipPriority: boolean;
}) {
  if (
    isOwnerPlaylistRequesterLogin({
      requesterLogin: input.requesterLogin,
      channelLogin: input.channelLogin,
    })
  ) {
    return 0;
  }

  return getRequestVipTokenPlan({
    requestKind: input.requestKind,
    song: {
      durationText: input.durationText,
    },
    requestedPaths: getStoredRequestedPaths({
      requestedQuery: input.requestedQuery,
    }),
    thresholds: input.thresholds,
    settings: {
      requestPathModifierVipTokenCost: input.requestPathModifierVipTokenCost,
      requestPathModifierVipTokenCosts: input.requestPathModifierVipTokenCosts,
      requestPathModifierUsesVipPriority:
        input.requestPathModifierUsesVipPriority,
    },
  }).totalVipTokenCost;
}

function getManagedVipTokenStatusLabel(input: {
  requiredVipTokenCost: number;
  availableVipTokenCount?: number | null;
  t: TFunction;
}) {
  if (input.requiredVipTokenCost <= 0) {
    return "";
  }

  if (
    input.availableVipTokenCount != null &&
    Number.isFinite(input.availableVipTokenCount)
  ) {
    const count = formatVipTokenCount(input.availableVipTokenCount);
    const cost = input.t("viewerSummary.vipTokensLabel", {
      count: input.requiredVipTokenCost,
      countText: formatVipTokenCount(input.requiredVipTokenCost),
    });

    return input.availableVipTokenCount < input.requiredVipTokenCost
      ? input.t("manageActions.insufficientWithBalance", {
          cost,
          count,
        })
      : input.t("manageActions.costWithBalance", {
          cost,
          count,
        });
  }

  return input.t("viewerSummary.vipTokensLabel", {
    count: input.requiredVipTokenCost,
    countText: formatVipTokenCount(input.requiredVipTokenCost),
  });
}

function updateVipTokenBalanceForLogin(input: {
  vipTokens: VipTokenBalance[];
  requesterLogin?: string | null;
  delta: number;
}) {
  if (!input.requesterLogin || input.delta === 0) {
    return input.vipTokens;
  }

  const normalizedLogin = input.requesterLogin.trim().toLowerCase();

  return input.vipTokens.map((token) => {
    if (token.login.toLowerCase() !== normalizedLogin) {
      return token;
    }

    const nextAvailableCount =
      input.delta > 0
        ? normalizeVipTokenCount(token.availableCount - input.delta)
        : normalizeVipTokenCount(token.availableCount + Math.abs(input.delta));

    return {
      ...token,
      availableCount: nextAvailableCount,
    };
  });
}

function PlaylistManagementActions(props: {
  className: string;
  showBotToggle: boolean;
  botEnabled: boolean;
  isBotTogglePending: boolean;
  onToggleBot: (enabled: boolean) => void;
  itemCount: number;
  canEndSession: boolean;
  resetSessionTooltip: string;
  isMutationPending: boolean;
  isResetSessionPending: boolean;
  onShuffle: () => void;
  onClear: () => void;
  onReset: () => void;
}) {
  const { t } = useLocaleTranslation("playlist");

  return (
    <TooltipProvider>
      <div className={`${props.className} w-full justify-between`}>
        <div className="flex flex-wrap items-center justify-start gap-3">
          {props.showBotToggle ? (
            <PlaylistBotToggle
              enabled={props.botEnabled}
              disabled={props.isBotTogglePending}
              onToggle={props.onToggleBot}
            />
          ) : null}
          <PlaylistManagementActionButton
            label={t("management.actions.shuffle")}
            tooltip={t("management.actions.shuffleTooltip")}
            icon={Shuffle}
            disabled={props.isMutationPending || props.itemCount < 2}
            onClick={props.onShuffle}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <PlaylistManagementActionButton
            label={t("management.actions.clearPlaylist")}
            tooltip={t("management.actions.clearPlaylistTooltip")}
            icon={Trash2}
            disabled={props.isMutationPending || props.itemCount === 0}
            onClick={props.onClear}
          />
          <PlaylistManagementActionButton
            label={t("management.actions.resetSession")}
            tooltip={props.resetSessionTooltip}
            icon={RotateCcw}
            disabled={props.isResetSessionPending || !props.canEndSession}
            onClick={props.onReset}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function PlaylistBotToggle(props: {
  enabled: boolean;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useLocaleTranslation("playlist");

  return (
    <StatusToggleBadge
      enabled={props.enabled}
      disabled={props.disabled}
      onToggle={() => props.onToggle(!props.enabled)}
      toggleAriaLabel={t("management.bot.toggleAria")}
      enabledLabel={t("management.bot.enabled")}
      disabledLabel={t("management.bot.disabled")}
      toneClassName={
        props.enabled
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
          : "border-slate-400/30 bg-slate-500/10 text-slate-100"
      }
    />
  );
}

function PlaylistManagementActionButton(props: {
  label: string;
  tooltip: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant="outline"
            disabled={props.disabled}
            onClick={props.onClick}
          >
            <Icon className="h-3.5 w-3.5" />
            {props.label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-center leading-5">
        {props.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function getReorderedItemsAfterRequestKindChange(
  items: PlaylistItem[],
  itemId: string,
  requestKind: "regular" | "vip"
) {
  const nextPositions = getUpdatedQueuedPositionsAfterKindChange({
    items,
    playlistCurrentItemId:
      items.find((item) => item.status === "current")?.id ?? null,
    targetItemId: itemId,
    requestKind,
  });
  const nextPositionById = new Map(
    nextPositions.map((item) => [item.id, item.position])
  );

  return items
    .map((item) => ({
      ...item,
      position: nextPositionById.get(item.id) ?? item.position,
    }))
    .sort((left, right) => left.position - right.position);
}

function getReorderedItemsAfterSetCurrent(
  items: PlaylistItem[],
  itemId: string
) {
  const nextPositions = getUpdatedPositionsAfterSetCurrent({
    items,
    targetItemId: itemId,
  });
  const nextPositionById = new Map(
    nextPositions.map((item) => [item.id, item.position])
  );

  return items
    .map((item) => ({
      ...item,
      position: nextPositionById.get(item.id) ?? item.position,
      status: item.id === itemId ? "current" : "queued",
    }))
    .sort((left, right) => left.position - right.position);
}

function getReorderedItemsAfterReturnToQueue(items: PlaylistItem[]) {
  const nextPositions = getQueuedPositionsFromRegularOrder(items);
  const nextPositionById = new Map(
    nextPositions.map((item) => [item.id, item.position])
  );

  return items
    .map((item) => ({
      ...item,
      position: nextPositionById.get(item.id) ?? item.position,
      status: "queued",
    }))
    .sort((left, right) => left.position - right.position);
}

function updateVipTokenBalancesAfterRequestKindChange(input: {
  vipTokens: VipTokenBalance[];
  requesterLogin?: string;
  delta: number;
}) {
  return updateVipTokenBalanceForLogin(input);
}

function orderPlaylistItems(items: PlaylistItem[], orderedItemIds: string[]) {
  const itemLookup = new Map(items.map((item) => [item.id, item]));
  const orderedItems = orderedItemIds
    .map((itemId) => itemLookup.get(itemId))
    .filter((item): item is PlaylistItem => Boolean(item));
  const missingItems = items.filter(
    (item) => !orderedItemIds.includes(item.id)
  );

  return [...orderedItems, ...missingItems].map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

function getReorderedItemIds(
  items: PlaylistItem[],
  sourceItemId: string,
  targetItemId: string,
  edge: Edge
) {
  const startIndex = items.findIndex((item) => item.id === sourceItemId);
  const indexOfTarget = items.findIndex((item) => item.id === targetItemId);

  if (startIndex === -1 || indexOfTarget === -1) {
    return null;
  }

  const finishIndex = getReorderDestinationIndex({
    startIndex,
    indexOfTarget,
    closestEdgeOfTarget: edge,
    axis: "vertical",
  });

  if (finishIndex === startIndex) {
    return null;
  }

  return reorder({
    list: items.map((item) => item.id),
    startIndex,
    finishIndex,
  });
}

function getOrderedItemIdsForMoveAction(
  items: PlaylistItem[],
  itemId: string,
  moveAction: "top" | "up" | "down" | "bottom"
) {
  const currentItemId =
    items.find((item) => item.status === "current")?.id ?? null;
  const reorderableItemIds = items
    .filter((item) => item.id !== currentItemId)
    .map((item) => item.id);
  const startIndex = reorderableItemIds.indexOf(itemId);

  if (startIndex === -1) {
    return null;
  }

  const finishIndex =
    moveAction === "top"
      ? 0
      : moveAction === "bottom"
        ? reorderableItemIds.length - 1
        : moveAction === "up"
          ? Math.max(0, startIndex - 1)
          : Math.min(reorderableItemIds.length - 1, startIndex + 1);

  if (finishIndex === startIndex) {
    return null;
  }

  const reorderedItemIds = reorder({
    list: reorderableItemIds,
    startIndex,
    finishIndex,
  });

  return currentItemId
    ? [currentItemId, ...reorderedItemIds]
    : reorderedItemIds;
}

function getPlaylistDragData(args: {
  itemId: string;
  element: HTMLElement;
  input: Parameters<typeof attachClosestEdge>[1]["input"];
}) {
  return attachClosestEdge(
    {
      type: "playlist-item",
      itemId: args.itemId,
    },
    {
      element: args.element,
      input: args.input,
      allowedEdges: ["top", "bottom"],
    }
  );
}

function PlaylistQueueItem(props: {
  item: PlaylistItem;
  index: number;
  draggingItemId: string | null;
  dropTargetState: { itemId: string; edge: Edge } | null;
  currentItemId: string | null;
  showPickOrderBadges: boolean;
  isDeletingItem: boolean;
  isSetCurrentPending: boolean;
  isReturnToQueuePending: boolean;
  isMarkPlayedPending: boolean;
  isChangeRequestKindPending: boolean;
  isReorderPending: boolean;
  useTouchReorderControls: boolean;
  reorderableIndex: number;
  reorderableCount: number;
  canManageBlacklist: boolean;
  isBlacklistedArtist: boolean;
  isBlacklistedSong: boolean;
  isBlacklistedSongGroup: boolean;
  isBlacklistArtistPending: boolean;
  isBlacklistSongPending: boolean;
  isBlacklistSongGroupPending: boolean;
  isBlacklistCharterPending: boolean;
  availableVipTokenCount: number;
  channelLogin: string;
  requestPathModifierVipTokenCost: number;
  requestPathModifierVipTokenCosts?: {
    guitar: number;
    lead: number;
    rhythm: number;
    bass: number;
  };
  requestPathModifierUsesVipPriority: boolean;
  vipTokenDurationThresholds: VipTokenDurationThreshold[];
  blacklistedSongIds: Set<number>;
  blacklistedCharterIds: Set<number>;
  preferredCharterIds: Set<number>;
  canManageFavorites?: boolean;
  isFavorited?: boolean;
  favoritePending?: boolean;
  onToggleFavorite?: () => void;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragHover: (targetItemId: string, edge: Edge) => void;
  onDragLeave: () => void;
  onReorder: (sourceItemId: string, targetItemId: string, edge: Edge) => void;
  onMoveItem: (moveAction: "top" | "up" | "down" | "bottom") => void;
  onSetCurrent: () => void;
  onReturnToQueue: () => void;
  onMarkPlayed: () => void;
  onDelete: () => void;
  onChangeRequestKind: (requestKind: "regular" | "vip") => void;
  onBlacklistSong: () => void;
  onBlacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onUnblacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onBlacklistSongGroup: () => void;
  onBlacklistArtist: () => void;
  onBlacklistCharter: (candidate: PlaylistCandidate) => void;
  onPreferCharter: (candidate: PlaylistCandidate) => void;
  onUnpreferCharter: (candidate: PlaylistCandidate) => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const itemRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const isDragging = props.draggingItemId === props.item.id;
  const isCurrentItem = props.item.status === "current";
  const isVipRequest = props.item.requestKind === "vip";
  const requesterLogin = props.item.requestedByLogin?.trim() ?? "";
  const hasRequester = requesterLogin.length > 0;
  const hasCurrentItem = props.currentItemId != null;
  const requesterLabel = getRequesterLabel(props.item) ?? requesterLogin;
  const storedVipTokenCost = getManagedStoredVipTokenCost({
    requestKind: props.item.requestKind,
    vipTokenCost: props.item.vipTokenCost,
    requesterLogin,
    channelLogin: props.channelLogin,
  });
  const nextVipTokenCost = getManagedPlaylistRequestVipTokenCost({
    requestKind: "vip",
    durationText: props.item.songDurationText,
    requestedQuery: props.item.requestedQuery,
    thresholds: props.vipTokenDurationThresholds,
    requesterLogin,
    channelLogin: props.channelLogin,
    requestPathModifierVipTokenCost: props.requestPathModifierVipTokenCost,
    requestPathModifierVipTokenCosts: props.requestPathModifierVipTokenCosts,
    requestPathModifierUsesVipPriority:
      props.requestPathModifierUsesVipPriority,
  });
  const requiredVipTokenCount = Math.max(
    0,
    nextVipTokenCost - storedVipTokenCost
  );
  const canShowMakeVipButton = !isCurrentItem && !isVipRequest && hasRequester;
  const canUpgradeToVip =
    canShowMakeVipButton &&
    hasRedeemableVipToken(props.availableVipTokenCount, requiredVipTokenCount);
  const showDisabledMakeVipButton =
    canShowMakeVipButton && requiredVipTokenCount > 0 && !canUpgradeToVip;
  const makeVipLabel =
    requiredVipTokenCount > 0
      ? `${t("management.item.makeVip")} (${requiredVipTokenCount})`
      : t("management.item.makeVip");
  const makeVipDisabledTooltip = showDisabledMakeVipButton
    ? t("management.item.makeVipDisabledTooltip", {
        requiredCount: requiredVipTokenCount,
        requester: requesterLabel,
        availableCount: formatVipTokenCount(props.availableVipTokenCount),
      })
    : null;
  const canMoveUp = props.reorderableIndex > 0;
  const canMoveDown =
    props.reorderableIndex >= 0 &&
    props.reorderableIndex < props.reorderableCount - 1;
  const dropEdge =
    props.dropTargetState?.itemId === props.item.id
      ? props.dropTargetState.edge
      : null;
  const resolvedCandidates = getResolvedPlaylistCandidates(props.item);
  const hasMultipleVersions = resolvedCandidates.length > 1;
  const primaryCandidate = resolvedCandidates[0];
  const displayArtist = primaryCandidate?.artist ?? props.item.songArtist;
  const displayAlbum = primaryCandidate?.album ?? props.item.songAlbum;
  const displayYear = primaryCandidate?.year;
  const titleLine = displayArtist
    ? `${props.item.songTitle} - ${displayArtist}`
    : props.item.songTitle;
  const albumLine = [
    displayAlbum,
    displayYear != null ? String(displayYear) : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const tuningValues = resolvedCandidates.some((candidate) => candidate.tuning)
    ? resolvedCandidates.map((candidate) => candidate.tuning)
    : [props.item.songTuning];
  const compactTuning = formatCompactTuningSummary(tuningValues);
  const itemDurationText =
    primaryCandidate?.durationText ?? props.item.songDurationText;
  const compactTuningTitle =
    compactTuning && tuningValues.length > 0
      ? (() => {
          const fullTuningSummary = getUniqueTunings(tuningValues).join(" | ");
          return fullTuningSummary !== compactTuning
            ? fullTuningSummary
            : undefined;
        })()
      : undefined;
  const singleVersionDownloadUrl =
    !hasMultipleVersions && primaryCandidate?.sourceUrl
      ? primaryCandidate.sourceUrl
      : null;
  const itemHasLyrics = playlistDisplayItemHasLyrics(props.item);
  const queueItemBadgeClass =
    "h-8 px-2.5 text-[10px] leading-none uppercase tracking-[0.14em]";
  const createdAgoLabel = formatTimeAgo(t, props.item.createdAt);
  const editedTimestamp = props.item.editedAt ?? null;
  const editedAgoLabel =
    editedTimestamp != null && editedTimestamp > props.item.createdAt
      ? t("row.edited", { time: formatTimeAgo(t, editedTimestamp) })
      : null;
  const requesterLastChatAt = props.item.requesterLastChatAt ?? null;
  const requesterInactive = isRequesterInactive(requesterLastChatAt);
  const requesterActivityLabel =
    requesterLastChatAt != null ? formatTimeAgo(t, requesterLastChatAt) : null;

  useEffect(() => {
    const element = itemRef.current;
    const dragHandle = dragHandleRef.current;

    if (props.useTouchReorderControls || !element || !dragHandle) {
      return;
    }

    return draggable({
      element,
      dragHandle,
      canDrag: () => !isCurrentItem,
      getInitialData: () => ({
        type: "playlist-item",
        itemId: props.item.id,
      }),
      onDragStart: () => {
        props.onDragStart(props.item.id);
      },
      onDrop: () => {
        props.onDragEnd();
      },
    });
  }, [
    isCurrentItem,
    props.item.id,
    props.onDragEnd,
    props.onDragStart,
    props.useTouchReorderControls,
  ]);

  useEffect(() => {
    const element = itemRef.current;

    if (props.useTouchReorderControls || !element) {
      return;
    }

    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        !isCurrentItem &&
        source.data.type === "playlist-item" &&
        source.data.itemId !== props.item.id,
      getData: ({ input, element }) =>
        getPlaylistDragData({
          itemId: props.item.id,
          element: element as HTMLElement,
          input,
        }),
      onDragEnter: ({ self }) => {
        const edge = extractClosestEdge(self.data);
        if (edge) {
          props.onDragHover(props.item.id, edge);
        }
      },
      onDrag: ({ self }) => {
        const edge = extractClosestEdge(self.data);
        if (edge) {
          props.onDragHover(props.item.id, edge);
        }
      },
      onDragLeave: () => {
        props.onDragLeave();
      },
      onDrop: ({ source, self }) => {
        const edge = extractClosestEdge(self.data);
        const sourceItemId =
          typeof source.data.itemId === "string" ? source.data.itemId : null;

        if (!edge || !sourceItemId) {
          props.onDragEnd();
          return;
        }

        props.onReorder(sourceItemId, props.item.id, edge);
        props.onDragEnd();
      },
    });
  }, [
    props.item.id,
    isCurrentItem,
    props.onDragEnd,
    props.onDragHover,
    props.onDragLeave,
    props.onReorder,
    props.useTouchReorderControls,
  ]);

  return (
    <motion.div
      ref={itemRef}
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: isDragging ? 0.72 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.985 }}
      transition={playlistItemTransition}
      className={`dashboard-playlist__item group relative border ${
        isVipRequest
          ? "border-violet-400/45 bg-(--panel-soft) shadow-[0_0_0_1px_rgba(168,85,247,0.08),0_0_28px_rgba(168,85,247,0.12)]"
          : props.index % 2 === 0
            ? "border-(--border) bg-(--panel)"
            : "border-(--border) bg-(--panel-soft)"
      }`}
    >
      {dropEdge === "top" ? (
        <div className="pointer-events-none absolute inset-x-4 top-0 h-0.5 bg-(--brand)" />
      ) : null}
      {dropEdge === "bottom" ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-0 h-0.5 bg-(--brand)" />
      ) : null}

      <div className="flex items-stretch">
        {props.useTouchReorderControls ? (
          <div className="dashboard-playlist__drag-handle inline-flex shrink-0 self-stretch border-r border-(--border) px-1 py-2">
            <div className="grid w-full grid-cols-1 gap-1">
              <TouchReorderButton
                label={t("management.item.moveTop")}
                icon={ChevronsUp}
                disabled={isCurrentItem || !canMoveUp || props.isReorderPending}
                onClick={() => props.onMoveItem("top")}
              />
              <TouchReorderButton
                label={t("management.item.moveUp")}
                icon={ArrowUp}
                disabled={isCurrentItem || !canMoveUp || props.isReorderPending}
                onClick={() => props.onMoveItem("up")}
              />
              <TouchReorderButton
                label={t("management.item.moveDown")}
                icon={ArrowDown}
                disabled={
                  isCurrentItem || !canMoveDown || props.isReorderPending
                }
                onClick={() => props.onMoveItem("down")}
              />
              <TouchReorderButton
                label={t("management.item.moveBottom")}
                icon={ChevronsDown}
                disabled={
                  isCurrentItem || !canMoveDown || props.isReorderPending
                }
                onClick={() => props.onMoveItem("bottom")}
              />
            </div>
          </div>
        ) : (
          <button
            ref={dragHandleRef}
            type="button"
            aria-label={t("management.item.reorderAria", {
              title: props.item.songTitle,
            })}
            className={`dashboard-playlist__drag-handle inline-flex shrink-0 items-center justify-center self-stretch border-r border-(--border) px-2 text-(--muted) opacity-45 transition ${
              isCurrentItem
                ? "cursor-not-allowed opacity-30"
                : "cursor-grab group-hover:opacity-100 hover:bg-(--panel) hover:text-(--text) active:cursor-grabbing"
            } w-11`}
            disabled={isCurrentItem}
          >
            <span
              className={`flex h-full items-center justify-center ${
                isVipRequest ? "text-violet-200" : ""
              } min-h-[8.5rem]`}
            >
              <GripVertical className="h-4.5 w-4.5" />
            </span>
          </button>
        )}

        <div className="grid min-w-0 flex-1 gap-4 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <motion.div layout="position" className="min-w-0 grid gap-3">
            <motion.div layout="position" className="flex items-center gap-3">
              <span
                className={`inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center border px-2 text-xs font-semibold ${
                  isVipRequest
                    ? "border-violet-400/30 bg-violet-500/15 text-violet-100"
                    : "border-(--border-strong) bg-(--panel) text-(--text)"
                }`}
              >
                {props.item.position}
              </span>
              <div className="min-w-0 flex flex-1 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="break-words text-lg font-semibold leading-tight text-(--text)">
                      {titleLine}
                    </p>
                    {props.canManageFavorites && props.item.songId ? (
                      <FavoriteToggleButton
                        favorited={!!props.isFavorited}
                        pending={props.favoritePending}
                        onToggle={props.onToggleFavorite}
                        className="mt-[-1px] h-7 w-7"
                        iconClassName="h-3.5 w-3.5"
                      />
                    ) : null}
                  </div>
                  {albumLine ? (
                    <p className="mt-1 break-words text-sm text-(--brand-deep)">
                      {albumLine}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start">
                  {isVipRequest ? (
                    <Badge
                      className={cn(
                        queueItemBadgeClass,
                        "border-violet-400/35 bg-violet-500/15 text-violet-100 hover:bg-violet-500/15"
                      )}
                    >
                      {t("management.item.vipBadge")}
                    </Badge>
                  ) : null}
                  {getRequestedPathLabel(props.item) ? (
                    <Badge variant="outline" className={queueItemBadgeClass}>
                      {getRequestedPathLabel(props.item)}
                    </Badge>
                  ) : null}
                  {(isVipRequest && storedVipTokenCost > 1) ||
                  (!isVipRequest && storedVipTokenCost > 0) ? (
                    <Badge variant="outline" className={queueItemBadgeClass}>
                      {t("management.item.vipTokens", {
                        count: storedVipTokenCost,
                      })}
                    </Badge>
                  ) : null}
                  {props.showPickOrderBadges &&
                  props.item.pickNumber != null ? (
                    <PickOrderBadge
                      pickNumber={props.item.pickNumber}
                      className={queueItemBadgeClass}
                    />
                  ) : null}
                  {isCurrentItem ? (
                    <Badge
                      className={cn(
                        queueItemBadgeClass,
                        "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15"
                      )}
                    >
                      {t("management.item.playingBadge")}
                    </Badge>
                  ) : null}
                  {requesterInactive ? (
                    <StatusPill
                      icon={AlertTriangle}
                      className="border-amber-400/40 bg-amber-500/15 text-amber-200"
                    >
                      {t("management.item.inactiveBadge")}
                    </StatusPill>
                  ) : null}
                  {props.item.warningMessage ? (
                    <StatusPill
                      icon={AlertTriangle}
                      className="border-amber-400/40 bg-amber-500/15 text-amber-200"
                    >
                      {t("management.item.warningBadge")}
                    </StatusPill>
                  ) : null}
                  {props.isBlacklistedSongGroup ? (
                    <Badge
                      variant="outline"
                      className="border-rose-400/40 bg-rose-500/10 text-rose-200"
                    >
                      {t("management.item.songBlacklisted")}
                    </Badge>
                  ) : null}
                  {props.isBlacklistedArtist ? (
                    <Badge
                      variant="outline"
                      className="border-rose-400/40 bg-rose-500/10 text-rose-200"
                    >
                      {t("management.item.artistBlacklisted")}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </motion.div>

            <motion.div layout="position" className="grid gap-1.5">
              {itemDurationText || compactTuning || itemHasLyrics ? (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-(--muted)">
                  {itemDurationText ? (
                    <>
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{itemDurationText}</span>
                    </>
                  ) : null}
                  {itemDurationText && compactTuning ? (
                    <span aria-hidden="true">·</span>
                  ) : null}
                  {compactTuning ? (
                    <span title={compactTuningTitle}>{compactTuning}</span>
                  ) : null}
                  {(itemDurationText || compactTuning) && itemHasLyrics ? (
                    <span aria-hidden="true">·</span>
                  ) : null}
                  {itemHasLyrics ? (
                    <span>{t("management.item.lyrics")}</span>
                  ) : null}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {getRequesterLabel(props.item) ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <RequesterChatBadges
                      badges={props.item.requesterChatBadges}
                    />
                    <p className="truncate text-base font-semibold text-(--text)">
                      {t("management.item.requestedBy", {
                        requester: getRequesterLabel(props.item),
                      })}
                    </p>
                  </div>
                ) : null}
                <p className="inline-flex items-center gap-1.5 text-sm text-(--muted)">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{createdAgoLabel}</span>
                  {editedAgoLabel ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{editedAgoLabel}</span>
                    </>
                  ) : null}
                </p>
              </div>
              {getRequesterLabel(props.item) && requesterActivityLabel ? (
                <p
                  className={cn(
                    "inline-flex items-center gap-1.5 text-sm",
                    requesterInactive ? "text-amber-100" : "text-(--muted)"
                  )}
                >
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{requesterActivityLabel}</span>
                </p>
              ) : null}
              {props.item.requestedQuery &&
              !getRequestedPathLabel(props.item) ? (
                <p className="text-xs text-amber-200">
                  {t("management.item.requestedText", {
                    query: props.item.requestedQuery,
                  })}
                </p>
              ) : null}
              {props.item.warningMessage ? (
                <p className="text-sm text-amber-100">
                  {props.item.warningMessage}
                </p>
              ) : null}
            </motion.div>
          </motion.div>

          <div className="grid gap-3 justify-items-end md:min-w-[12rem] md:content-between">
            <div className="dashboard-playlist__item-actions flex w-full max-w-full flex-wrap items-center justify-end gap-2 md:w-auto md:flex-nowrap">
              {hasMultipleVersions ? (
                <Button
                  type="button"
                  size="sm"
                  variant={showVersions ? "secondary" : "outline"}
                  className="h-8 px-2.5 text-[11px] md:hidden"
                  aria-expanded={showVersions}
                  onClick={() => setShowVersions((current) => !current)}
                >
                  {t("management.item.versionsCount", {
                    count: resolvedCandidates.length,
                  })}
                </Button>
              ) : singleVersionDownloadUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  asChild
                  className="h-8 px-2.5 text-[11px] md:hidden"
                >
                  <a
                    href={singleVersionDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="no-underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("management.item.downloadFromCf")}
                  </a>
                </Button>
              ) : null}
              {isVipRequest && hasRequester && !isCurrentItem ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 max-w-[9rem] flex-none px-2.5 text-[11px]"
                  onClick={() => props.onChangeRequestKind("regular")}
                  disabled={props.isChangeRequestKindPending}
                >
                  {props.isChangeRequestKindPending
                    ? t("management.item.saving")
                    : t("management.item.makeRegular")}
                </Button>
              ) : null}
              {showDisabledMakeVipButton ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          size="sm"
                          variant="outline"
                          className="pointer-events-none h-8 max-w-[9rem] flex-none px-2.5 text-[11px]"
                          disabled
                        >
                          {makeVipLabel}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64 text-center leading-5">
                      {makeVipDisabledTooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              {canUpgradeToVip ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 max-w-[9rem] flex-none px-2.5 text-[11px]"
                  onClick={() => props.onChangeRequestKind("vip")}
                  disabled={props.isChangeRequestKindPending}
                >
                  {props.isChangeRequestKindPending
                    ? t("management.item.saving")
                    : makeVipLabel}
                </Button>
              ) : null}
              {isCurrentItem ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  onClick={props.onReturnToQueue}
                  disabled={props.isReturnToQueuePending}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {props.isReturnToQueuePending
                    ? t("management.item.saving")
                    : t("management.item.returnToQueue")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 max-w-[9rem] flex-none border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-200 hover:border-emerald-400/40 hover:bg-emerald-500/15 hover:text-emerald-100"
                  onClick={props.onSetCurrent}
                  disabled={hasCurrentItem || props.isSetCurrentPending}
                >
                  {t("management.item.playNow")}
                </Button>
              )}
              {isCurrentItem ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  onClick={props.onMarkPlayed}
                  disabled={props.isMarkPlayedPending}
                >
                  <CircleCheckBig className="h-3.5 w-3.5" />
                  {t("management.item.markComplete")}
                </Button>
              ) : null}
              {props.canManageBlacklist || !isCurrentItem ? (
                <PlaylistItemActionsPopover
                  item={props.item}
                  candidates={resolvedCandidates}
                  canManageBlacklist={props.canManageBlacklist}
                  isCurrentItem={isCurrentItem}
                  isBlacklistedArtist={props.isBlacklistedArtist}
                  isBlacklistedSong={props.isBlacklistedSong}
                  isBlacklistedSongGroup={props.isBlacklistedSongGroup}
                  blacklistedCharterIds={props.blacklistedCharterIds}
                  isBlacklistArtistPending={props.isBlacklistArtistPending}
                  isBlacklistSongPending={props.isBlacklistSongPending}
                  isBlacklistSongGroupPending={
                    props.isBlacklistSongGroupPending
                  }
                  isBlacklistCharterPending={props.isBlacklistCharterPending}
                  isDeletingItem={props.isDeletingItem}
                  onDelete={props.onDelete}
                  onBlacklistSong={props.onBlacklistSong}
                  onBlacklistSongGroup={props.onBlacklistSongGroup}
                  onBlacklistArtist={props.onBlacklistArtist}
                  onBlacklistCharter={props.onBlacklistCharter}
                />
              ) : null}
            </div>

            {hasMultipleVersions ? (
              <Button
                type="button"
                size="sm"
                variant={showVersions ? "secondary" : "outline"}
                className="hidden h-8 w-fit justify-self-end px-2.5 text-[11px] md:inline-flex"
                aria-expanded={showVersions}
                onClick={() => setShowVersions((current) => !current)}
              >
                {t("management.item.versionsCount", {
                  count: resolvedCandidates.length,
                })}
              </Button>
            ) : singleVersionDownloadUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                asChild
                className="hidden h-8 w-fit justify-self-end px-2.5 text-[11px] md:inline-flex"
              >
                <a
                  href={singleVersionDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="no-underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("management.item.downloadFromCf")}
                </a>
              </Button>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {showVersions && hasMultipleVersions ? (
              <motion.div
                key="versions"
                initial={{ height: 0, opacity: 0.7 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0.7 }}
                transition={{
                  duration: 0.2,
                  ease: [0.2, 0, 0, 1],
                }}
                className="overflow-hidden md:col-span-2"
              >
                <div className="border-t border-(--border) pt-4">
                  <PlaylistVersionsTable
                    itemId={props.item.id}
                    candidates={resolvedCandidates}
                    canManageBlacklist={props.canManageBlacklist}
                    blacklistedSongIds={props.blacklistedSongIds}
                    blacklistedCharterIds={props.blacklistedCharterIds}
                    preferredCharterIds={props.preferredCharterIds}
                    isBlacklistSongPending={props.isBlacklistSongPending}
                    onBlacklistCandidateSong={props.onBlacklistCandidateSong}
                    onUnblacklistCandidateSong={
                      props.onUnblacklistCandidateSong
                    }
                    onPreferCharter={props.onPreferCharter}
                    onUnpreferCharter={props.onUnpreferCharter}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function StatusPill(props: {
  icon: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  const Icon = props.icon;

  return (
    <span
      className={`inline-flex items-center gap-2 border border-transparent px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${props.className ?? ""}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {props.children}
    </span>
  );
}

function TouchReorderButton(props: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={props.label}
      title={props.label}
      className="h-6 w-6 rounded-none border border-(--border) px-0 text-(--muted) shadow-none hover:bg-(--panel) hover:text-(--text)"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

function PlaylistItemActionsPopover(props: {
  item: PlaylistItem;
  candidates: PlaylistCandidate[];
  canManageBlacklist: boolean;
  isCurrentItem: boolean;
  isBlacklistedArtist: boolean;
  isBlacklistedSong: boolean;
  isBlacklistedSongGroup: boolean;
  blacklistedCharterIds: Set<number>;
  isBlacklistArtistPending: boolean;
  isBlacklistSongPending: boolean;
  isBlacklistSongGroupPending: boolean;
  isBlacklistCharterPending: boolean;
  isDeletingItem: boolean;
  onDelete: () => void;
  onBlacklistSong: () => void;
  onBlacklistSongGroup: () => void;
  onBlacklistArtist: () => void;
  onBlacklistCharter: (candidate: PlaylistCandidate) => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "blacklist">("menu");
  const queuedVersionLabel =
    props.item.songCatalogSourceId != null
      ? t("management.actionsMenu.queuedVersionId", {
          id: props.item.songCatalogSourceId,
        })
      : t("management.actionsMenu.noQueuedVersionId");
  const charterCandidates = Array.from(
    new Map(
      props.candidates
        .filter(
          (candidate): candidate is PlaylistCandidate & { authorId: number } =>
            candidate.authorId != null
        )
        .map((candidate) => [candidate.authorId, candidate])
    ).values()
  );
  const canRemoveFromPlaylist = !props.isCurrentItem;
  const hasActions = canRemoveFromPlaylist || props.canManageBlacklist;

  if (!hasActions) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setView("menu");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={t("management.actionsMenu.openActionsAria", {
            title: props.item.songTitle,
          })}
          className="h-8 w-8 shrink-0"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] border-(--border) bg-(--panel-strong) p-3 text-(--text)"
      >
        {view === "menu" ? (
          <div className="grid gap-1">
            {canRemoveFromPlaylist ? (
              <button
                type="button"
                className="flex w-full items-center px-2 py-1.5 text-left text-xs font-medium text-(--text) hover:bg-(--panel-soft)"
                disabled={props.isDeletingItem}
                onClick={() => {
                  setOpen(false);
                  props.onDelete();
                }}
              >
                <span>
                  {props.isDeletingItem
                    ? t("management.actionsMenu.removing")
                    : t("management.actionsMenu.removeFromPlaylist")}
                </span>
              </button>
            ) : null}
            {props.canManageBlacklist ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium text-(--text) hover:bg-(--panel-soft)"
                onClick={() => setView("blacklist")}
              >
                <Ban className="h-3.5 w-3.5 shrink-0" />
                <span>{t("management.actionsMenu.blacklist")}</span>
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <PopoverHeader className="gap-0 px-0 py-0">
                <PopoverTitle className="truncate text-sm">
                  {t("management.actionsMenu.blacklistTitle")}
                </PopoverTitle>
              </PopoverHeader>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => setView("menu")}
              >
                {t("management.actionsMenu.back")}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-(--muted)">
              {t("management.actionsMenu.description")}
            </p>
            <p className="mt-1 text-xs leading-5 text-(--muted)">
              {queuedVersionLabel}
            </p>
            <div className="mt-3 grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-2.5 text-left"
                disabled={
                  props.isBlacklistedSong ||
                  props.item.songCatalogSourceId == null ||
                  props.isBlacklistSongPending
                }
                onClick={() => {
                  props.onBlacklistSong();
                  setOpen(false);
                }}
              >
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                  <span className="font-medium">
                    {props.isBlacklistedSong
                      ? t("management.actionsMenu.versionBlocked")
                      : t("management.actionsMenu.blacklistQueuedVersion")}
                  </span>
                  <span className="text-xs font-normal normal-case tracking-normal [font-family:var(--font-body)] text-(--muted)">
                    {props.item.songCatalogSourceId != null
                      ? t("management.actionsMenu.blockVersionDescription", {
                          id: props.item.songCatalogSourceId,
                        })
                      : t(
                          "management.actionsMenu.blockVersionFallbackDescription"
                        )}
                  </span>
                </div>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-2.5 text-left"
                disabled={
                  props.isBlacklistedSongGroup ||
                  props.item.songGroupedProjectId == null ||
                  props.isBlacklistSongGroupPending
                }
                onClick={() => {
                  props.onBlacklistSongGroup();
                  setOpen(false);
                }}
              >
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                  <span className="font-medium">
                    {props.isBlacklistedSongGroup
                      ? t("management.actionsMenu.songBlocked")
                      : t("management.actionsMenu.blacklistSongGroup")}
                  </span>
                  <span className="text-xs font-normal normal-case tracking-normal [font-family:var(--font-body)] text-(--muted)">
                    {t("management.actionsMenu.blockSongDescription")}
                  </span>
                </div>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-2.5 text-left"
                disabled={
                  props.isBlacklistedArtist ||
                  props.item.songArtistId == null ||
                  props.isBlacklistArtistPending
                }
                onClick={() => {
                  props.onBlacklistArtist();
                  setOpen(false);
                }}
              >
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                  <span className="font-medium">
                    {props.isBlacklistedArtist
                      ? t("management.actionsMenu.artistBlocked", {
                          artist:
                            props.item.songArtist ??
                            t("management.blacklistErrors.unknownArtist"),
                        })
                      : t("management.actionsMenu.blacklistArtist", {
                          artist:
                            props.item.songArtist ??
                            t("management.blacklistErrors.unknownArtist"),
                        })}
                  </span>
                  <span className="text-xs font-normal normal-case tracking-normal [font-family:var(--font-body)] text-(--muted)">
                    {t("management.actionsMenu.blockArtistDescription")}
                  </span>
                </div>
              </Button>
              {charterCandidates.map((candidate) => {
                const isBlacklistedCharter = props.blacklistedCharterIds.has(
                  candidate.authorId
                );

                return (
                  <Button
                    key={`${props.item.id}-${candidate.id}-${candidate.authorId}`}
                    type="button"
                    variant="outline"
                    className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-2.5 text-left"
                    disabled={
                      isBlacklistedCharter || props.isBlacklistCharterPending
                    }
                    onClick={() => {
                      props.onBlacklistCharter(candidate);
                      setOpen(false);
                    }}
                  >
                    <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                      <span className="font-medium">
                        {isBlacklistedCharter
                          ? t("management.actionsMenu.charterBlocked", {
                              charter:
                                candidate.creator ??
                                t("management.blacklistErrors.unknownCharter"),
                            })
                          : t("management.actionsMenu.blacklistCharter", {
                              charter:
                                candidate.creator ??
                                t("management.blacklistErrors.unknownCharter"),
                            })}
                      </span>
                      <span className="text-xs font-normal normal-case tracking-normal [font-family:var(--font-body)] text-(--muted)">
                        {t("management.actionsMenu.blockCharterDescription")}
                      </span>
                    </div>
                  </Button>
                );
              })}
              {!charterCandidates.length ? (
                <div className="border border-dashed border-(--border) px-3 py-2 text-xs text-(--muted)">
                  {t("management.actionsMenu.noCharterIds")}
                </div>
              ) : null}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PlaylistVersionsTable(props: {
  itemId: string;
  candidates: PlaylistCandidate[];
  canManageBlacklist: boolean;
  blacklistedSongIds: Set<number>;
  blacklistedCharterIds: Set<number>;
  preferredCharterIds: Set<number>;
  isBlacklistSongPending: boolean;
  onBlacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onUnblacklistCandidateSong: (candidate: PlaylistCandidate) => void;
  onPreferCharter: (candidate: PlaylistCandidate) => void;
  onUnpreferCharter: (candidate: PlaylistCandidate) => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const { locale } = useAppLocale();
  const sortedCandidates = useMemo(
    () =>
      props.candidates
        .map((candidate, index) => {
          const isBlacklistedCandidateSong =
            candidate.sourceId != null &&
            props.blacklistedSongIds.has(candidate.sourceId);
          const isBlacklistedCharter =
            candidate.authorId != null &&
            props.blacklistedCharterIds.has(candidate.authorId);

          return {
            candidate,
            index,
            isBlacklistedCandidateSong,
            isBlacklistedCharter,
            isPreferredCharter:
              (candidate.authorId != null &&
                props.preferredCharterIds.has(candidate.authorId)) ||
              !!candidate.isPreferredCharter,
            isBlocked: isBlacklistedCandidateSong || isBlacklistedCharter,
          };
        })
        .sort(
          (left, right) =>
            Number(left.isBlocked) - Number(right.isBlocked) ||
            Number(right.isPreferredCharter) -
              Number(left.isPreferredCharter) ||
            left.index - right.index
        ),
    [
      props.blacklistedCharterIds,
      props.blacklistedSongIds,
      props.candidates,
      props.preferredCharterIds,
    ]
  );

  return (
    <div className="dashboard-playlist__versions-wrap overflow-x-auto border border-(--border)">
      <table className="dashboard-playlist__versions-table min-w-full border-collapse text-left text-sm">
        <thead className="dashboard-playlist__versions-head bg-(--panel)">
          <tr className="border-b border-(--border)">
            <th className="px-4 py-2 text-[13px] font-semibold text-(--muted)">
              {t("management.versionsTable.songAlbum")}
            </th>
            <th className="px-4 py-2 text-[13px] font-semibold text-(--muted)">
              {t("management.versionsTable.tunings")}
            </th>
            <th className="px-4 py-2 text-[13px] font-semibold text-(--muted)">
              {t("management.versionsTable.paths")}
            </th>
            <th className="px-4 py-2 text-[13px] font-semibold text-(--muted)">
              {t("management.versionsTable.updated")}
            </th>
            <th className="px-4 py-2 text-[13px] font-semibold text-(--muted)">
              {t("management.versionsTable.downloads")}
            </th>
            <th className="px-4 py-2 text-[13px] font-semibold text-(--muted)">
              {t("management.versionsTable.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="dashboard-playlist__versions-body">
          {sortedCandidates.map(
            (
              {
                candidate,
                index,
                isBlacklistedCandidateSong,
                isBlacklistedCharter,
                isPreferredCharter,
                isBlocked,
              },
              sortedIndex
            ) => {
              const displayParts = getPlaylistDisplayParts(candidate.parts);
              const hasLyrics = playlistDisplayCandidateHasLyrics(candidate);

              return (
                <tr
                  key={`${props.itemId}-${candidate.id}-${index}`}
                  className={`dashboard-playlist__versions-row border-b border-(--border) align-top ${
                    sortedIndex % 2 === 0 ? "bg-(--panel)" : "bg-(--panel-soft)"
                  } ${isBlocked ? "opacity-55" : ""}`}
                >
                  <td className="dashboard-playlist__versions-song-cell dashboard-playlist__versions-cell px-4 py-3">
                    <div className="grid gap-0.5">
                      <p className="font-medium text-(--text)">
                        {candidate.title}
                        {candidate.album ? ` · ${candidate.album}` : ""}
                      </p>
                      <p className="text-xs text-(--muted)">
                        {candidate.artist ??
                          t("management.versionsTable.unknownArtist")}
                      </p>
                    </div>
                  </td>
                  <td
                    className="dashboard-playlist__versions-cell px-4 py-3 text-(--muted)"
                    data-label={t("management.versionsTable.tunings")}
                  >
                    {candidate.tuning ?? t("management.versionsTable.unknown")}
                  </td>
                  <td
                    className="dashboard-playlist__versions-cell px-4 py-3"
                    data-label={t("management.versionsTable.paths")}
                  >
                    <div className="flex flex-wrap gap-1">
                      {displayParts.map((part) => (
                        <span
                          key={`${candidate.id}-${part}`}
                          className={getPlaylistPathBadgeClass(part)}
                          title={formatPathLabel(part)}
                        >
                          {getPathAbbreviation(part)}
                        </span>
                      ))}
                      {hasLyrics ? (
                        <span className="inline-flex h-6 items-center justify-center border border-(--border-strong) bg-(--panel) px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-(--muted)">
                          {t("management.versionsTable.lyrics")}
                        </span>
                      ) : null}
                      {displayParts.length === 0 && !hasLyrics ? (
                        <span className="text-xs text-(--muted)">
                          {t("management.versionsTable.unknown")}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td
                    className="dashboard-playlist__versions-cell px-4 py-3 text-(--muted)"
                    data-label={t("management.versionsTable.updated")}
                  >
                    {candidate.sourceUpdatedAt
                      ? formatLocaleDate(locale, candidate.sourceUpdatedAt, {
                          dateStyle: "medium",
                        })
                      : t("management.versionsTable.unknown")}
                  </td>
                  <td
                    className="dashboard-playlist__versions-cell px-4 py-3 text-(--muted)"
                    data-label={t("management.versionsTable.downloads")}
                  >
                    {candidate.downloads != null
                      ? formatNumber(locale, candidate.downloads)
                      : t("management.versionsTable.unknown")}
                  </td>
                  <td
                    className="dashboard-playlist__versions-actions-cell dashboard-playlist__versions-cell px-4 py-3"
                    data-label={t("management.versionsTable.actions")}
                  >
                    <div className="dashboard-playlist__versions-actions grid gap-2">
                      <div className="dashboard-playlist__versions-download flex flex-wrap gap-1.5">
                        {candidate.sourceUrl ? (
                          isBlocked ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled
                              title={t("management.versionsTable.blacklisted")}
                            >
                              <Download className="h-3.5 w-3.5" />
                              {t("management.versionsTable.download")}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              asChild
                              className="h-7 px-2 text-[11px]"
                            >
                              <a
                                href={candidate.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="no-underline"
                              >
                                <Download className="h-3.5 w-3.5" />
                                {t("management.versionsTable.download")}
                              </a>
                            </Button>
                          )
                        ) : null}
                      </div>
                      {candidate.creator || props.canManageBlacklist ? (
                        <TooltipProvider>
                          <div className="dashboard-playlist__versions-charter flex flex-wrap items-center gap-1.5">
                            {candidate.creator ? (
                              <span
                                className={`text-xs ${
                                  isBlacklistedCharter
                                    ? "text-rose-300"
                                    : "text-(--muted)"
                                }`}
                                title={
                                  isBlacklistedCharter
                                    ? t(
                                        "management.versionsTable.charterBlacklisted"
                                      )
                                    : undefined
                                }
                              >
                                {candidate.creator}
                              </span>
                            ) : null}
                            {props.canManageBlacklist ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={
                                        isPreferredCharter
                                          ? "outline"
                                          : "secondary"
                                      }
                                      className="h-7 w-7 px-0"
                                      disabled={candidate.authorId == null}
                                      aria-label={
                                        isPreferredCharter
                                          ? t(
                                              "management.versionsTable.unprefer"
                                            )
                                          : t("management.versionsTable.prefer")
                                      }
                                      onClick={() => {
                                        if (isPreferredCharter) {
                                          props.onUnpreferCharter(candidate);
                                          return;
                                        }

                                        props.onPreferCharter(candidate);
                                      }}
                                    >
                                      <Heart className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isPreferredCharter
                                    ? t("management.versionsTable.unprefer")
                                    : t("management.versionsTable.prefer")}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            {props.canManageBlacklist ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={
                                        isBlacklistedCandidateSong
                                          ? "outline"
                                          : "secondary"
                                      }
                                      className="h-7 w-7 px-0"
                                      disabled={
                                        candidate.sourceId == null ||
                                        props.isBlacklistSongPending
                                      }
                                      aria-label={
                                        isBlacklistedCandidateSong
                                          ? t(
                                              "management.versionsTable.unblacklist"
                                            )
                                          : t(
                                              "management.versionsTable.blacklist"
                                            )
                                      }
                                      onClick={() => {
                                        if (isBlacklistedCandidateSong) {
                                          props.onUnblacklistCandidateSong(
                                            candidate
                                          );
                                          return;
                                        }

                                        props.onBlacklistCandidateSong(
                                          candidate
                                        );
                                      }}
                                    >
                                      <Ban className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isBlacklistedCandidateSong
                                    ? t("management.versionsTable.unblacklist")
                                    : t("management.versionsTable.blacklist")}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </TooltipProvider>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            }
          )}
        </tbody>
      </table>
    </div>
  );
}

function getPathAbbreviation(path: string) {
  switch (path.trim().toLowerCase()) {
    case "lead":
      return "L";
    case "rhythm":
      return "R";
    case "bass":
      return "B";
    default:
      return path.slice(0, 1).toUpperCase();
  }
}

function getPlaylistPathBadgeClass(path: string) {
  switch (path.trim().toLowerCase()) {
    case "lead":
      return "inline-flex h-6 min-w-6 items-center justify-center border border-emerald-700/50 bg-emerald-950 px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-100";
    case "rhythm":
      return "inline-flex h-6 min-w-6 items-center justify-center border border-sky-700/50 bg-sky-950 px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-100";
    case "bass":
      return "inline-flex h-6 min-w-6 items-center justify-center border border-orange-700/50 bg-orange-950 px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-orange-100";
    default:
      return "inline-flex h-6 min-w-6 items-center justify-center border border-(--border) bg-(--panel-strong) px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-(--text)";
  }
}

export function PlaylistQueueItemPreview() {
  const { t } = useLocaleTranslation("playlist");
  const [item, setItem] = useState<PlaylistItem>(PLAYLIST_PREVIEW_ITEM);
  const [removed, setRemoved] = useState(false);
  const [isBlacklistedArtist, setIsBlacklistedArtist] = useState(false);
  const [isBlacklistedSongGroup, setIsBlacklistedSongGroup] = useState(false);
  const [blacklistedSongIds, setBlacklistedSongIds] = useState<Set<number>>(
    new Set()
  );
  const [blacklistedCharterIds, setBlacklistedCharterIds] = useState<
    Set<number>
  >(new Set());
  const [preferredCharterIds, setPreferredCharterIds] = useState<Set<number>>(
    new Set()
  );

  if (removed) {
    return (
      <div className="grid gap-3 border border-dashed border-(--border) bg-(--panel) px-4 py-5">
        <p className="text-sm text-(--muted)">
          {t("management.preview.removed")}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRemoved(false);
              setItem(PLAYLIST_PREVIEW_ITEM);
            }}
          >
            {t("management.preview.restore")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PlaylistQueueItem
      item={item}
      index={0}
      draggingItemId={null}
      dropTargetState={null}
      currentItemId={item.status === "current" ? item.id : null}
      showPickOrderBadges
      isDeletingItem={false}
      isSetCurrentPending={false}
      isReturnToQueuePending={false}
      isMarkPlayedPending={false}
      isChangeRequestKindPending={false}
      isReorderPending={false}
      useTouchReorderControls={false}
      reorderableIndex={0}
      reorderableCount={1}
      canManageBlacklist
      isBlacklistedArtist={isBlacklistedArtist}
      isBlacklistedSong={
        item.songCatalogSourceId != null &&
        blacklistedSongIds.has(item.songCatalogSourceId)
      }
      isBlacklistedSongGroup={isBlacklistedSongGroup}
      isBlacklistArtistPending={false}
      isBlacklistSongPending={false}
      isBlacklistSongGroupPending={false}
      isBlacklistCharterPending={false}
      availableVipTokenCount={3}
      channelLogin="jimmy_pants_"
      requestPathModifierVipTokenCost={1}
      requestPathModifierVipTokenCosts={{
        guitar: 0,
        lead: 1,
        rhythm: 1,
        bass: 1,
      }}
      requestPathModifierUsesVipPriority
      vipTokenDurationThresholds={[]}
      blacklistedSongIds={blacklistedSongIds}
      blacklistedCharterIds={blacklistedCharterIds}
      preferredCharterIds={preferredCharterIds}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onDragHover={() => {}}
      onDragLeave={() => {}}
      onReorder={() => {}}
      onMoveItem={() => {}}
      onSetCurrent={() =>
        setItem((current) => ({
          ...current,
          status: "current",
        }))
      }
      onReturnToQueue={() =>
        setItem((current) => ({
          ...current,
          status: "queued",
        }))
      }
      onMarkPlayed={() => setRemoved(true)}
      onDelete={() => setRemoved(true)}
      onChangeRequestKind={(requestKind) =>
        setItem((current) => ({
          ...current,
          requestKind,
        }))
      }
      onBlacklistSong={() => {
        if (item.songCatalogSourceId == null) {
          return;
        }

        const sourceId = item.songCatalogSourceId;
        setBlacklistedSongIds((current) => new Set([...current, sourceId]));
      }}
      onBlacklistCandidateSong={(candidate) => {
        if (candidate.sourceId == null) {
          return;
        }

        const sourceId = candidate.sourceId;
        setBlacklistedSongIds((current) => new Set([...current, sourceId]));
      }}
      onUnblacklistCandidateSong={(candidate) => {
        if (candidate.sourceId == null) {
          return;
        }

        const sourceId = candidate.sourceId;
        setBlacklistedSongIds((current) => {
          const next = new Set(current);
          next.delete(sourceId);
          return next;
        });
      }}
      onBlacklistSongGroup={() => setIsBlacklistedSongGroup(true)}
      onBlacklistArtist={() => setIsBlacklistedArtist(true)}
      onBlacklistCharter={(candidate) => {
        if (candidate.authorId == null) {
          return;
        }

        const authorId = candidate.authorId;
        setBlacklistedCharterIds((current) => new Set([...current, authorId]));
      }}
      onPreferCharter={(candidate) => {
        if (candidate.authorId == null) {
          return;
        }

        const authorId = candidate.authorId;
        setPreferredCharterIds((current) => new Set([...current, authorId]));
      }}
      onUnpreferCharter={(candidate) => {
        if (candidate.authorId == null) {
          return;
        }

        const authorId = candidate.authorId;
        setPreferredCharterIds((current) => {
          const next = new Set(current);
          next.delete(authorId);
          return next;
        });
      }}
    />
  );
}
