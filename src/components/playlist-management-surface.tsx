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
  type LucideIcon,
  MoreHorizontal,
  Plus,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { PickOrderBadge } from "~/components/pick-order-badge";
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
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useAppLocale, useLocaleTranslation } from "~/lib/i18n/client";
import {
  formatDate as formatLocaleDate,
  formatNumber,
} from "~/lib/i18n/format";
import { getPickNumbersForQueuedItems } from "~/lib/pick-order";
import {
  formatPlaylistItemSummaryLine,
  getResolvedPlaylistCandidates,
} from "~/lib/playlist/management-display";
import {
  getQueuedPositionsFromRegularOrder,
  getUpdatedPositionsAfterSetCurrent,
  getUpdatedQueuedPositionsAfterKindChange,
} from "~/lib/playlist/order";
import { areChannelRequestsOpen } from "~/lib/request-availability";
import { formatPathLabel } from "~/lib/request-policy";
import { getErrorMessage } from "~/lib/utils";
import {
  formatVipTokenCount,
  hasRedeemableVipToken,
  normalizeVipTokenCount,
  subtractVipTokenRedemption,
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
  songDurationText?: string;
  songUrl?: string;
  songSourceUpdatedAt?: number | null;
  songDownloads?: number | null;
  requestedByTwitchUserId?: string;
  requestedByLogin?: string;
  requestedByDisplayName?: string;
  requestedQuery?: string;
  warningCode?: string;
  warningMessage?: string;
  candidateMatchesJson?: string;
  pickNumber?: number | null;
  createdAt: number;
  position: number;
  regularPosition?: number | null;
  status: string;
  requestKind?: "regular" | "vip";
};

export type PlaylistCandidate = {
  id: string;
  groupedProjectId?: number;
  authorId?: number;
  title: string;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string;
  parts?: string[];
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
    parts: ["lead", "rhythm", "bass", "voice"],
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
  songPartsJson: JSON.stringify(["lead", "rhythm", "bass", "voice"]),
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
    groupedProjectId?: number;
    authorId?: number;
    title: string;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: string;
    parts?: string[];
    durationText?: string;
    source: string;
    sourceUrl?: string;
    sourceId?: number;
  }>;
};

const playlistItemTransition = {
  duration: 0.22,
  ease: [0.2, 0, 0, 1] as const,
};

type PlaylistQueryData = {
  channel: {
    id: string;
    slug: string;
    displayName: string;
    isLive: boolean;
    botReadyState?: string | null;
  };
  settings?: {
    canManageBlacklist?: boolean;
    showPickOrderBadges?: boolean;
  };
  items: PlaylistItem[];
  playedSongs: PlayedSong[];
  blacklistArtists: Array<{ artistId: number; artistName: string }>;
  blacklistCharters: Array<{ charterId: number; charterName: string }>;
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
  queryKeyBase: string;
  queryKey?: (string | null)[];
  headerTitle?: string;
  headerDescription?: string;
  showAncillaryPanels?: boolean;
  showManualAdd?: boolean;
  embedCurrentPlaylist?: boolean;
  currentPlaylistTitle?: string | null;
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
  const playlistQuery = useQuery({
    queryKey: playlistQueryKey,
    queryFn: async () => {
      const response = await fetch(playlistEndpoint);
      return response.json() as Promise<{
        channel: {
          id: string;
          slug: string;
          displayName: string;
          isLive: boolean;
          botReadyState?: string | null;
        };
        settings?: {
          canManageBlacklist?: boolean;
          showPickOrderBadges?: boolean;
        };
        items: PlaylistItem[];
        playedSongs: PlayedSong[];
        vipTokens: VipTokenBalance[];
        blacklistArtists: Array<{ artistId: number; artistName: string }>;
        blacklistCharters: Array<{
          charterId: number;
          charterName: string;
        }>;
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
        accessRole?: "owner" | "moderator";
      }>;
    },
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });
  const moderationEndpoint = playlistQuery.data?.channel?.slug
    ? `/api/channel/${playlistQuery.data.channel.slug}/moderation`
    : null;

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
    queryFn: async () => {
      const params = new URLSearchParams({
        query: debouncedManualQuery.trim(),
        page: "1",
        pageSize: "6",
        field: "any",
      });
      const response = await fetch(`/api/search?${params.toString()}`);
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
      const response = await fetch(playlistEndpoint, {
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
        queryClient.getQueryData<PlaylistQueryData>(playlistQueryKey);

      if (!previous) {
        return undefined;
      }

      if (action === "resetSession") {
        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: [],
          playedSongs: previous.playedSongs,
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
                  }
                : item
            ),
            vipTokens: updateVipTokenBalancesAfterRequestKindChange({
              vipTokens: previous.vipTokens,
              requesterLogin: targetItem.requestedByLogin,
              requestKind: body.requestKind,
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
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKey,
      });
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
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKey,
      });
    },
  });

  const playedSongs = playlistQuery.data?.playedSongs ?? [];
  const showPickOrderBadges =
    !!playlistQuery.data?.settings?.showPickOrderBadges;
  const items = useMemo(() => {
    const baseItems = playlistQuery.data?.items ?? [];
    const pickNumbers = getPickNumbersForQueuedItems(baseItems, playedSongs);

    return baseItems.map((item, index) => ({
      ...item,
      pickNumber: pickNumbers[index] ?? null,
    }));
  }, [playedSongs, playlistQuery.data?.items]);
  const currentItemId = useMemo(
    () => items.find((item) => item.status === "current")?.id ?? null,
    [items]
  );

  const vipTokens = playlistQuery.data?.vipTokens ?? [];
  const blacklistArtists = playlistQuery.data?.blacklistArtists ?? [];
  const blacklistCharters = playlistQuery.data?.blacklistCharters ?? [];
  const blacklistSongs = playlistQuery.data?.blacklistSongs ?? [];
  const blacklistSongGroups = playlistQuery.data?.blacklistSongGroups ?? [];
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
  const vipTokenBalancesByLogin = new Map(
    vipTokens.map((token) => [token.login.toLowerCase(), token.availableCount])
  );
  const managedChannel = playlistQuery.data?.channel ?? null;
  const requestsOpen = managedChannel
    ? areChannelRequestsOpen(managedChannel)
    : false;
  const accessRole = playlistQuery.data?.accessRole ?? "owner";
  const canManageBlacklist = !!playlistQuery.data?.settings?.canManageBlacklist;
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
                          {song.parts?.length
                            ? song.parts.join(", ")
                            : t("management.manual.noPathInfo")}
                        </p>
                      </div>
                      <div className="dashboard-playlist__manual-add flex items-center justify-end self-start">
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
                                  durationText: song.durationText,
                                  sourceUrl: song.sourceUrl,
                                  sourceId: song.sourceId,
                                },
                              ]),
                            })
                          }
                          disabled={
                            !requestsOpen || isManualAddPending(song.id)
                          }
                          title={
                            requestsOpen
                              ? undefined
                              : t("page.requestsLiveOnly")
                          }
                        >
                          <Plus className="h-4 w-4" />
                          {t("management.manual.addButton")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {props.embedCurrentPlaylist ? (
        <section className="grid gap-3 max-[960px]:px-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {props.currentPlaylistTitle ? (
              <h2 className="text-3xl font-semibold text-(--text)">
                {props.currentPlaylistTitle}
              </h2>
            ) : null}
            <div className="dashboard-playlist__actions dashboard-playlist__actions--public flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => mutation.mutate({ action: "shufflePlaylist" })}
                disabled={mutation.isPending || items.length < 2}
              >
                {t("management.actions.shuffle")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm(t("management.actions.confirmClear"))) {
                    mutation.mutate({ action: "clearPlaylist" });
                  }
                }}
                disabled={mutation.isPending || items.length === 0}
              >
                {t("management.actions.clearPlaylist")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm(t("management.actions.confirmReset"))) {
                    mutation.mutate({ action: "resetSession" });
                  }
                }}
                disabled={
                  mutation.isPending &&
                  pendingRowAction?.action === "resetSession"
                    ? true
                    : items.length === 0
                }
              >
                {t("management.actions.resetSession")}
              </Button>
            </div>
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
            vipTokenBalancesByLogin={vipTokenBalancesByLogin}
            isDeletingItem={isDeletingItem}
            isRowPending={isRowPending}
            isReorderPending={
              mutation.isPending && pendingRowAction?.action === "reorderItems"
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
              <div className="dashboard-playlist__actions flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => mutation.mutate({ action: "shufflePlaylist" })}
                  disabled={mutation.isPending || items.length < 2}
                >
                  {t("management.actions.shuffle")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (window.confirm(t("management.actions.confirmClear"))) {
                      mutation.mutate({ action: "clearPlaylist" });
                    }
                  }}
                  disabled={mutation.isPending || items.length === 0}
                >
                  {t("management.actions.clearPlaylist")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (window.confirm(t("management.actions.confirmReset"))) {
                      mutation.mutate({ action: "resetSession" });
                    }
                  }}
                  disabled={
                    mutation.isPending &&
                    pendingRowAction?.action === "resetSession"
                      ? true
                      : items.length === 0
                  }
                >
                  {t("management.actions.resetSession")}
                </Button>
              </div>
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
              vipTokenBalancesByLogin={vipTokenBalancesByLogin}
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
              isBlacklistArtistPending={moderationMutation.isPending}
              isBlacklistSongPending={moderationMutation.isPending}
              isBlacklistSongGroupPending={moderationMutation.isPending}
              isBlacklistCharterPending={moderationMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

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
        open={deleteDialogItem != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogItem(null);
          }
        }}
      >
        <AlertDialogContent>
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
  vipTokenBalancesByLogin: Map<string, number>;
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
  onBlacklistSongGroup: (item: PlaylistItem) => void;
  onBlacklistArtist: (item: PlaylistItem) => void;
  onBlacklistCharter: (candidate: PlaylistCandidate) => void;
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
        {props.items.map((item, index) => (
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
            blacklistedCharterIds={props.blacklistedCharterIds}
            blacklistedSongIds={props.blacklistedSongIds}
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
            onBlacklistSongGroup={() => props.onBlacklistSongGroup(item)}
            onBlacklistArtist={() => props.onBlacklistArtist(item)}
            onBlacklistCharter={props.onBlacklistCharter}
          />
        ))}
      </AnimatePresence>
      {props.items.length === 0 ? (
        <p className="px-4 text-sm leading-7 text-(--muted)">
          {t("management.queue.empty")}
        </p>
      ) : null}
    </>
  );
}

function getRequesterLabel(item: PlaylistItem) {
  return item.requestedByDisplayName ?? item.requestedByLogin ?? null;
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
  requestKind: "regular" | "vip";
}) {
  if (!input.requesterLogin) {
    return input.vipTokens;
  }

  const normalizedLogin = input.requesterLogin.toLowerCase();

  return input.vipTokens.map((token) => {
    if (token.login.toLowerCase() !== normalizedLogin) {
      return token;
    }

    return {
      ...token,
      availableCount:
        input.requestKind === "vip"
          ? subtractVipTokenRedemption(token.availableCount)
          : normalizeVipTokenCount(token.availableCount + 1),
    };
  });
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
  blacklistedSongIds: Set<number>;
  blacklistedCharterIds: Set<number>;
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
  onBlacklistSongGroup: () => void;
  onBlacklistArtist: () => void;
  onBlacklistCharter: (candidate: PlaylistCandidate) => void;
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
  const showVipTokenBalance =
    hasRequester && (isVipRequest || props.availableVipTokenCount > 0);
  const canUpgradeToVip =
    !isCurrentItem &&
    !isVipRequest &&
    hasRequester &&
    hasRedeemableVipToken(props.availableVipTokenCount);
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
  const singleVersionDownloadUrl =
    !hasMultipleVersions && resolvedCandidates[0]?.sourceUrl
      ? resolvedCandidates[0].sourceUrl
      : null;

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
            ? "border-(--border) bg-(--panel-soft)"
            : "border-(--border) bg-(--panel-muted)"
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
          <div className="dashboard-playlist__drag-handle inline-flex w-14 shrink-0 self-stretch border-r border-(--border) px-1 py-2">
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
                <p className="break-words text-lg font-semibold leading-tight text-(--text)">
                  {props.item.songTitle}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {isVipRequest ? (
                    <Badge className="border-violet-400/35 bg-violet-500/15 text-violet-100 hover:bg-violet-500/15">
                      {t("management.item.vipBadge")}
                    </Badge>
                  ) : null}
                  {props.showPickOrderBadges &&
                  props.item.pickNumber != null ? (
                    <PickOrderBadge pickNumber={props.item.pickNumber} />
                  ) : null}
                  {isCurrentItem ? (
                    <Badge className="border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">
                      {t("management.item.playingBadge")}
                    </Badge>
                  ) : null}
                  {props.item.warningMessage ? (
                    <StatusPill
                      icon={AlertTriangle}
                      className="border-amber-400/40 bg-amber-500/15 text-amber-200"
                    >
                      {t("management.item.warningBadge")}
                    </StatusPill>
                  ) : null}
                  {props.isBlacklistedSong ? (
                    <Badge
                      variant="outline"
                      className="border-rose-400/40 bg-rose-500/10 text-rose-200"
                    >
                      {t("management.item.versionBlacklisted")}
                    </Badge>
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
              <p className="break-words text-sm text-(--brand-deep)">
                {formatPlaylistItemSummaryLine(props.item, {
                  hasMultipleVersions,
                  chartedByLabel: t("management.versionsTable.chartedBy"),
                  unknownArtistLabel: t("management.manual.unknownArtist"),
                })}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {getRequesterLabel(props.item) ? (
                  <p className="text-base font-semibold text-(--text)">
                    {t("management.item.requestedBy", {
                      requester: getRequesterLabel(props.item),
                    })}
                  </p>
                ) : null}
                {showVipTokenBalance ? (
                  <p className="text-sm font-medium text-(--muted)">
                    {t("management.item.vipTokens", {
                      count: formatVipTokenCount(props.availableVipTokenCount),
                    })}
                  </p>
                ) : null}
                <p className="inline-flex items-center gap-1.5 text-sm text-(--muted)">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>
                    {t("management.item.added", {
                      time: formatTimeAgo(t, props.item.createdAt),
                    })}
                  </span>
                </p>
              </div>
              {props.item.requestedQuery ? (
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

          <div className="grid gap-3 sm:justify-items-end md:min-w-[12rem] md:content-between">
            <div className="dashboard-playlist__item-actions flex max-w-full flex-wrap gap-2 sm:justify-end">
              {isVipRequest && hasRequester && !isCurrentItem ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  onClick={() => props.onChangeRequestKind("regular")}
                  disabled={props.isChangeRequestKindPending}
                >
                  {props.isChangeRequestKindPending
                    ? t("management.item.saving")
                    : t("management.item.makeRegular")}
                </Button>
              ) : null}
              {canUpgradeToVip && !isCurrentItem ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  onClick={() => props.onChangeRequestKind("vip")}
                  disabled={props.isChangeRequestKindPending}
                >
                  {props.isChangeRequestKindPending
                    ? t("management.item.saving")
                    : t("management.item.makeVip")}
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
                  className="h-8 px-2.5 text-[11px]"
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
                className="h-8 w-fit px-2.5 text-[11px]"
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
                className="h-8 w-fit px-2.5 text-[11px]"
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
                    isBlacklistSongPending={props.isBlacklistSongPending}
                    onBlacklistCandidateSong={props.onBlacklistCandidateSong}
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
          className="h-8 w-8"
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
                  <span className="text-xs text-(--muted)">
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
                  <span className="text-xs text-(--muted)">
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
                  <span className="text-xs text-(--muted)">
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
                      <span className="text-xs text-(--muted)">
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
  isBlacklistSongPending: boolean;
  onBlacklistCandidateSong: (candidate: PlaylistCandidate) => void;
}) {
  const { t } = useLocaleTranslation("playlist");
  const { locale } = useAppLocale();

  return (
    <div className="overflow-x-auto border border-(--border)">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-(--panel)">
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
        <tbody>
          {props.candidates.map((candidate, index) => {
            const isBlacklistedCandidateSong =
              candidate.sourceId != null &&
              props.blacklistedSongIds.has(candidate.sourceId);
            const isBlacklistedCharter =
              candidate.authorId != null &&
              props.blacklistedCharterIds.has(candidate.authorId);

            return (
              <tr
                key={`${props.itemId}-${candidate.id}-${index}`}
                className={`border-b border-(--border) align-top ${
                  index % 2 === 0 ? "bg-(--panel)" : "bg-(--panel-soft)"
                } ${isBlacklistedCharter ? "opacity-55" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="grid gap-0.5">
                    <p className="font-medium text-(--text)">
                      {candidate.title}
                      {candidate.album ? ` · ${candidate.album}` : ""}
                    </p>
                    <p className="text-xs text-(--muted)">
                      {candidate.artist ??
                        t("management.versionsTable.unknownArtist")}
                    </p>
                    {candidate.creator ? (
                      <p className="text-xs text-(--muted)">
                        <span className="text-(--brand-deep)">
                          {t("management.versionsTable.chartedBy")}
                        </span>{" "}
                        {candidate.creator}
                        {isBlacklistedCharter
                          ? ` · ${t("management.versionsTable.charterBlacklisted")}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-(--muted)">
                  {candidate.tuning ?? t("management.versionsTable.unknown")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(candidate.parts ?? []).map((part) => (
                      <span
                        key={`${candidate.id}-${part}`}
                        className={getPlaylistPathBadgeClass(part)}
                        title={formatPathLabel(part)}
                      >
                        {getPathAbbreviation(part)}
                      </span>
                    ))}
                    {(candidate.parts ?? []).length === 0 ? (
                      <span className="text-xs text-(--muted)">
                        {t("management.versionsTable.unknown")}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-(--muted)">
                  {candidate.sourceUpdatedAt
                    ? formatLocaleDate(locale, candidate.sourceUpdatedAt, {
                        dateStyle: "medium",
                      })
                    : t("management.versionsTable.unknown")}
                </td>
                <td className="px-4 py-3 text-(--muted)">
                  {candidate.downloads != null
                    ? formatNumber(locale, candidate.downloads)
                    : t("management.versionsTable.unknown")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.sourceUrl ? (
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
                    ) : null}
                    {props.canManageBlacklist ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[11px]"
                        disabled={
                          isBlacklistedCandidateSong ||
                          candidate.sourceId == null ||
                          props.isBlacklistSongPending
                        }
                        onClick={() =>
                          props.onBlacklistCandidateSong(candidate)
                        }
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {isBlacklistedCandidateSong
                          ? t("management.versionsTable.blacklisted")
                          : t("management.versionsTable.blacklist")}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
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
    case "lyrics":
    case "voice":
    case "vocals":
      return "V";
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
    case "lyrics":
    case "voice":
    case "vocals":
      return "inline-flex h-6 min-w-6 items-center justify-center border border-violet-700/50 bg-violet-950 px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-100";
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
      blacklistedSongIds={blacklistedSongIds}
      blacklistedCharterIds={blacklistedCharterIds}
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
      onBlacklistSongGroup={() => setIsBlacklistedSongGroup(true)}
      onBlacklistArtist={() => setIsBlacklistedArtist(true)}
      onBlacklistCharter={(candidate) => {
        if (candidate.authorId == null) {
          return;
        }

        const authorId = candidate.authorId;
        setBlacklistedCharterIds((current) => new Set([...current, authorId]));
      }}
    />
  );
}

function getPlaylistEndpoint(apiPath: string, selectedChannelSlug?: string) {
  if (!selectedChannelSlug) {
    return apiPath;
  }

  const params = new URLSearchParams({
    channel: selectedChannelSlug,
  });

  return `${apiPath}?${params.toString()}`;
}
