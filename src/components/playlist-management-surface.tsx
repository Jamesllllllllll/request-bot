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
import {
  AlertTriangle,
  Clock3,
  GripVertical,
  type LucideIcon,
  Plus,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { DashboardPageHeader } from "~/components/dashboard-page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { formatPathLabel } from "~/lib/request-policy";
import { getErrorMessage, normalizeSongSourceUrl } from "~/lib/utils";
import {
  formatVipTokenCount,
  hasRedeemableVipToken,
  normalizeVipTokenCount,
  subtractVipTokenRedemption,
} from "~/lib/vip-tokens";

type PlaylistItem = {
  id: string;
  songId?: string;
  songCatalogSourceId?: number | null;
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
  createdAt: number;
  position: number;
  status: string;
  requestKind?: "regular" | "vip";
};

type PlaylistCandidate = {
  id: string;
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

type VipTokenBalance = {
  twitchUserId?: string | null;
  login: string;
  availableCount: number;
};

type ManualSearchData = Pick<SearchResponse, "results">;

type SearchResponse = {
  results: Array<{
    id: string;
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
  channel: { id: string; slug: string; displayName: string };
  items: PlaylistItem[];
  playedSongs: PlayedSong[];
  blacklistArtists: Array<{ artistId: number; artistName: string }>;
  blacklistCharters: Array<{ charterId: number; charterName: string }>;
  blacklistSongs: Array<{
    songId: number;
    songTitle: string;
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

export function PlaylistManagementSurface(
  props: PlaylistManagementSurfaceProps
) {
  const queryClient = useQueryClient();
  const [manualQuery, setManualQuery] = useState("");
  const [manualRequesterLogin, setManualRequesterLogin] = useState("");
  const [debouncedManualQuery, setDebouncedManualQuery] = useState("");
  const [manualAddError, setManualAddError] = useState<string | null>(null);
  const [playlistActionError, setPlaylistActionError] = useState<string | null>(
    null
  );
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
        channel: { id: string; slug: string; displayName: string };
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
        accessRole?: "owner" | "moderator";
      }>;
    },
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });

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
            ? (body.message ?? "Search failed.")
            : "Search failed."
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
          payload?.error ?? payload?.message ?? "Playlist update failed."
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
        const targetItem =
          previous.items.find((item) => item.id === itemId) ?? null;
        const reorderedItems = targetItem
          ? [
              {
                ...targetItem,
                status: "current",
              },
              ...previous.items
                .filter((item) => item.id !== itemId)
                .map((item) => ({
                  ...item,
                  status: "queued",
                })),
            ].map((item, index) => ({
              ...item,
              position: index + 1,
            }))
          : previous.items.map((item) => ({
              ...item,
              status: item.id === itemId ? "current" : "queued",
            }));

        queryClient.setQueryData(playlistQueryKey, {
          ...previous,
          items: reorderedItems,
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
      const message = getErrorMessage(error, "Playlist update failed.");

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

  const currentItemId = useMemo(
    () =>
      playlistQuery.data?.items?.find((item) => item.status === "current")
        ?.id ?? null,
    [playlistQuery.data?.items]
  );

  const items = playlistQuery.data?.items ?? [];
  const playedSongs = playlistQuery.data?.playedSongs ?? [];
  const vipTokens = playlistQuery.data?.vipTokens ?? [];
  const blacklistArtists = playlistQuery.data?.blacklistArtists ?? [];
  const blacklistCharters = playlistQuery.data?.blacklistCharters ?? [];
  const blacklistSongs = playlistQuery.data?.blacklistSongs ?? [];
  const blacklistedCharterIds = new Set(
    blacklistCharters.map((item) => item.charterId)
  );
  const vipTokenBalancesByLogin = new Map(
    vipTokens.map((token) => [token.login.toLowerCase(), token.availableCount])
  );
  const managedChannel = playlistQuery.data?.channel ?? null;
  const accessRole = playlistQuery.data?.accessRole ?? "owner";
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
  return (
    <div className="dashboard-playlist grid gap-6">
      {props.headerTitle ? (
        <DashboardPageHeader
          title={props.headerTitle}
          description={
            props.headerDescription ??
            (managedChannel
              ? `${accessRole === "moderator" ? "Managing" : "Channel:"} ${managedChannel.displayName}`
              : undefined)
          }
        />
      ) : null}

      {props.showManualAdd !== false ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a song</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input
              value={manualRequesterLogin}
              onChange={(event) => setManualRequesterLogin(event.target.value)}
              placeholder="Requester username (optional)"
            />
            <Input
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              placeholder="Search and add a song"
            />
            {manualQueryTooShort ? (
              <p className="text-sm text-(--muted)">
                Search terms must be at least 3 characters.
              </p>
            ) : null}
            {manualSearchQuery.error ? (
              <p className="text-sm text-rose-300">
                {getErrorMessage(manualSearchQuery.error)}
              </p>
            ) : null}
            {manualAddError ? (
              <div className="rounded-[20px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {manualAddError}
              </div>
            ) : null}
            {manualQuery.trim().length >= 3 ? (
              <div className="dashboard-playlist__manual-results overflow-hidden rounded-[24px] border border-(--border)">
                <div className="dashboard-playlist__manual-head grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_96px] gap-4 bg-(--panel-muted) px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
                  <div>Track</div>
                  <div>Album / Creator</div>
                  <div>Tuning / Path</div>
                  <div>Add</div>
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
                      } ${isBlacklistedCharter ? "opacity-55" : ""}`}
                    >
                      <div className="dashboard-playlist__manual-track min-w-0">
                        <p className="truncate font-semibold text-(--text)">
                          {song.title}
                        </p>
                        <p className="mt-1 truncate text-sm text-(--brand-deep)">
                          {song.artist ?? "Unknown artist"}
                        </p>
                      </div>
                      <div className="dashboard-playlist__manual-meta min-w-0">
                        <p className="truncate text-sm text-(--text)">
                          {song.album ?? "Unknown album"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-(--muted)">
                          <span>
                            {song.creator
                              ? `Charted by ${song.creator}`
                              : "Unknown creator"}
                          </span>
                          {isBlacklistedCharter ? (
                            <Badge
                              variant="outline"
                              className="border-rose-400/40 bg-rose-500/10 text-rose-200"
                            >
                              Blacklisted
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="dashboard-playlist__manual-extra min-w-0">
                        <p className="truncate text-sm text-(--text)">
                          {song.tuning ?? "No tuning info"}
                        </p>
                        <p className="mt-1 truncate text-sm text-(--muted)">
                          {song.parts?.length
                            ? song.parts.join(", ")
                            : "No path info"}
                        </p>
                      </div>
                      <div className="dashboard-playlist__manual-add flex items-center justify-end">
                        <Button
                          size="sm"
                          onClick={() =>
                            mutation.mutate({
                              action: "manualAdd",
                              songId: song.id,
                              requesterLogin:
                                manualRequesterLogin.trim() || undefined,
                              title: song.title,
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
                            isBlacklistedCharter || isManualAddPending(song.id)
                          }
                        >
                          <Plus className="h-4 w-4" />
                          Add
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
        <section className="grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {props.currentPlaylistTitle ? (
              <h2 className="text-2xl font-semibold text-(--text)">
                {props.currentPlaylistTitle}
              </h2>
            ) : null}
            <div className="dashboard-playlist__actions flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => mutation.mutate({ action: "shufflePlaylist" })}
                disabled={mutation.isPending || items.length < 2}
              >
                Shuffle
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Empty the entire playlist? This cannot be undone."
                    )
                  ) {
                    mutation.mutate({ action: "clearPlaylist" });
                  }
                }}
                disabled={mutation.isPending || items.length === 0}
              >
                Clear playlist
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset the session? This will clear the current playlist."
                    )
                  ) {
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
                Reset session
              </Button>
            </div>
          </div>
          <CurrentPlaylistRows
            items={items}
            playlistActionError={playlistActionError}
            draggingItemId={draggingItemId}
            dropTargetState={dropTargetState}
            currentItemId={currentItemId}
            blacklistedCharterIds={blacklistedCharterIds}
            vipTokenBalancesByLogin={vipTokenBalancesByLogin}
            isDeletingItem={isDeletingItem}
            isRowPending={isRowPending}
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
            onSetCurrent={(itemId) =>
              mutation.mutate({
                action: "setCurrent",
                itemId,
              })
            }
            onMarkPlayed={(itemId) =>
              mutation.mutate({
                action: "markPlayed",
                itemId,
              })
            }
            onDelete={(itemId) => {
              const confirmed = window.confirm(
                "Delete this song from the playlist? This cannot be undone."
              );
              if (!confirmed) {
                return;
              }
              mutation.mutate({
                action: "deleteItem",
                itemId,
              });
            }}
            onChangeRequestKind={(itemId, requestKind) =>
              mutation.mutate({
                action: "changeRequestKind",
                itemId,
                requestKind,
              })
            }
          />
        </section>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <CardTitle>
                {props.currentPlaylistTitle ?? "Current playlist"}
              </CardTitle>
              <div className="dashboard-playlist__actions flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => mutation.mutate({ action: "shufflePlaylist" })}
                  disabled={mutation.isPending || items.length < 2}
                >
                  Shuffle
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Empty the entire playlist? This cannot be undone."
                      )
                    ) {
                      mutation.mutate({ action: "clearPlaylist" });
                    }
                  }}
                  disabled={mutation.isPending || items.length === 0}
                >
                  Clear playlist
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset the session? This will clear the current playlist."
                      )
                    ) {
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
                  Reset session
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
              blacklistedCharterIds={blacklistedCharterIds}
              vipTokenBalancesByLogin={vipTokenBalancesByLogin}
              isDeletingItem={isDeletingItem}
              isRowPending={isRowPending}
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
              onSetCurrent={(itemId) =>
                mutation.mutate({
                  action: "setCurrent",
                  itemId,
                })
              }
              onMarkPlayed={(itemId) =>
                mutation.mutate({
                  action: "markPlayed",
                  itemId,
                })
              }
              onDelete={(itemId) => {
                const confirmed = window.confirm(
                  "Delete this song from the playlist? This cannot be undone."
                );
                if (!confirmed) {
                  return;
                }
                mutation.mutate({
                  action: "deleteItem",
                  itemId,
                });
              }}
              onChangeRequestKind={(itemId, requestKind) =>
                mutation.mutate({
                  action: "changeRequestKind",
                  itemId,
                  requestKind,
                })
              }
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
            description="These exact artist IDs and track IDs are currently blocked for this channel."
            collapsible
            defaultOpen={false}
          />

          <Card>
            <CardHeader>
              <CardTitle>Played history</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {playedSongs.map((song, index) => (
                <div
                  key={song.id}
                  className={`rounded-[22px] border px-4 py-3 ${
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
                            Requested by{" "}
                            {song.requestedByDisplayName ??
                              song.requestedByLogin}
                          </p>
                        ) : null}
                        <p className="text-(--muted)">
                          Played {formatTimeAgo(song.playedAt)}
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
                        {isRestorePending(song.id) ? "Restoring..." : "Restore"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {playedSongs.length === 0 ? (
                <p className="text-sm leading-7 text-(--muted)">
                  Nothing has been marked played yet.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function CurrentPlaylistRows(props: {
  items: PlaylistItem[];
  playlistActionError: string | null;
  draggingItemId: string | null;
  dropTargetState: { itemId: string; edge: Edge } | null;
  currentItemId: string | null;
  blacklistedCharterIds: Set<number>;
  vipTokenBalancesByLogin: Map<string, number>;
  isDeletingItem: (itemId: string) => boolean;
  isRowPending: (action: string, itemId: string) => boolean;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragHover: (targetItemId: string, edge: Edge) => void;
  onDragLeaveForItem: (itemId: string) => void;
  onReorder: (sourceItemId: string, targetItemId: string, edge: Edge) => void;
  onSetCurrent: (itemId: string) => void;
  onMarkPlayed: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onChangeRequestKind: (itemId: string, requestKind: "regular" | "vip") => void;
}) {
  return (
    <>
      {props.playlistActionError ? (
        <div className="rounded-[20px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
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
            isDeletingItem={props.isDeletingItem(item.id)}
            isSetCurrentPending={props.isRowPending("setCurrent", item.id)}
            isMarkPlayedPending={props.isRowPending("markPlayed", item.id)}
            isChangeRequestKindPending={props.isRowPending(
              "changeRequestKind",
              item.id
            )}
            availableVipTokenCount={
              item.requestedByLogin
                ? (props.vipTokenBalancesByLogin.get(
                    item.requestedByLogin.toLowerCase()
                  ) ?? 0)
                : 0
            }
            blacklistedCharterIds={props.blacklistedCharterIds}
            onDragStart={props.onDragStart}
            onDragEnd={props.onDragEnd}
            onDragHover={props.onDragHover}
            onDragLeave={() => {
              props.onDragLeaveForItem(item.id);
            }}
            onReorder={props.onReorder}
            onSetCurrent={() => props.onSetCurrent(item.id)}
            onMarkPlayed={() => props.onMarkPlayed(item.id)}
            onDelete={() => props.onDelete(item.id)}
            onChangeRequestKind={(requestKind) =>
              props.onChangeRequestKind(item.id, requestKind)
            }
          />
        ))}
      </AnimatePresence>
      {props.items.length === 0 ? (
        <p className="text-sm leading-7 text-(--muted)">
          No songs in the playlist yet.
        </p>
      ) : null}
    </>
  );
}

function getSongParts(partsJson?: string) {
  if (!partsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(partsJson) as unknown;
    return Array.isArray(parsed) ? parsed.map((part) => String(part)) : [];
  } catch {
    return [];
  }
}

function getPlaylistCandidates(candidateMatchesJson?: string) {
  if (!candidateMatchesJson) {
    return [] as PlaylistCandidate[];
  }

  try {
    const parsed = JSON.parse(candidateMatchesJson) as unknown;
    return Array.isArray(parsed) ? (parsed as PlaylistCandidate[]) : [];
  } catch {
    return [];
  }
}

function getResolvedCandidates(item: PlaylistItem) {
  const candidates = getPlaylistCandidates(item.candidateMatchesJson);
  if (candidates.length > 0) {
    return [...candidates]
      .map((candidate) => ({
        ...candidate,
        album: candidate.album ?? item.songAlbum,
        sourceUrl: normalizeSongSourceUrl({
          source: "library",
          sourceUrl: candidate.sourceUrl,
          sourceId: candidate.sourceId,
        }),
      }))
      .sort((left, right) => {
        const leftUpdatedAt = left.sourceUpdatedAt ?? -1;
        const rightUpdatedAt = right.sourceUpdatedAt ?? -1;
        return rightUpdatedAt - leftUpdatedAt;
      });
  }

  return [
    {
      id: item.id,
      title: item.songTitle,
      artist: item.songArtist,
      album: item.songAlbum,
      creator: item.songCreator,
      tuning: item.songTuning,
      parts: getSongParts(item.songPartsJson),
      durationText: item.songDurationText,
      sourceUpdatedAt: item.songSourceUpdatedAt ?? undefined,
      downloads: item.songDownloads ?? undefined,
      sourceUrl: normalizeSongSourceUrl({
        source: "library",
        sourceUrl: item.songUrl,
        sourceId: item.songCatalogSourceId ?? undefined,
      }),
      sourceId: item.songCatalogSourceId ?? undefined,
    } satisfies PlaylistCandidate,
  ];
}

function formatTimeAgo(timestamp: number) {
  const deltaMs = Date.now() - timestamp;
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));

  if (deltaMinutes < 1) {
    return "just now";
  }

  if (deltaMinutes < 60) {
    return `${deltaMinutes} minute${deltaMinutes === 1 ? "" : "s"} ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} hour${deltaHours === 1 ? "" : "s"} ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays} day${deltaDays === 1 ? "" : "s"} ago`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString();
}

function getRequesterLabel(item: PlaylistItem) {
  return item.requestedByDisplayName ?? item.requestedByLogin ?? null;
}

function getReorderedItemsAfterRequestKindChange(
  items: PlaylistItem[],
  itemId: string,
  requestKind: "regular" | "vip"
) {
  const targetItem = items.find((item) => item.id === itemId);

  if (!targetItem || targetItem.status === "current") {
    return items.map((item, index) => ({
      ...item,
      position: index + 1,
    }));
  }

  const remainingItems = items.filter((item) => item.id !== itemId);
  const currentItem = remainingItems.find((item) => item.status === "current");
  const queuedItems = remainingItems.filter(
    (item) => item.status !== "current"
  );
  const reorderedQueuedItems =
    requestKind === "vip"
      ? [targetItem, ...queuedItems]
      : [...queuedItems, targetItem];
  const reorderedItems = currentItem
    ? [currentItem, ...reorderedQueuedItems]
    : reorderedQueuedItems;

  return reorderedItems.map((item, index) => ({
    ...item,
    position: index + 1,
  }));
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
  isDeletingItem: boolean;
  isSetCurrentPending: boolean;
  isMarkPlayedPending: boolean;
  isChangeRequestKindPending: boolean;
  availableVipTokenCount: number;
  blacklistedCharterIds: Set<number>;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onDragHover: (targetItemId: string, edge: Edge) => void;
  onDragLeave: () => void;
  onReorder: (sourceItemId: string, targetItemId: string, edge: Edge) => void;
  onSetCurrent: () => void;
  onMarkPlayed: () => void;
  onDelete: () => void;
  onChangeRequestKind: (requestKind: "regular" | "vip") => void;
}) {
  const itemRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const isDragging = props.draggingItemId === props.item.id;
  const isCurrentItem = props.item.status === "current";
  const isVipRequest = props.item.requestKind === "vip";
  const requesterLogin = props.item.requestedByLogin?.trim() ?? "";
  const hasRequester = requesterLogin.length > 0;
  const showVipTokenBalance =
    hasRequester && (isVipRequest || props.availableVipTokenCount > 0);
  const canUpgradeToVip =
    !isVipRequest &&
    hasRequester &&
    hasRedeemableVipToken(props.availableVipTokenCount);
  const dropEdge =
    props.dropTargetState?.itemId === props.item.id
      ? props.dropTargetState.edge
      : null;
  const resolvedCandidates = getResolvedCandidates(props.item);

  useEffect(() => {
    const element = itemRef.current;
    const dragHandle = dragHandleRef.current;

    if (!element || !dragHandle) {
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
  }, [isCurrentItem, props.item.id, props.onDragEnd, props.onDragStart]);

  useEffect(() => {
    const element = itemRef.current;

    if (!element) {
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
  ]);

  return (
    <motion.div
      ref={itemRef}
      layout
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: isDragging ? 0.72 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.985 }}
      transition={playlistItemTransition}
      className={`dashboard-playlist__item group relative rounded-[24px] border ${
        isVipRequest
          ? "border-violet-400/45 bg-(--panel-soft) shadow-[0_0_0_1px_rgba(168,85,247,0.08),0_0_28px_rgba(168,85,247,0.12)]"
          : props.index % 2 === 0
            ? "border-(--border) bg-(--panel-soft)"
            : "border-(--border) bg-(--panel-muted)"
      }`}
    >
      {dropEdge === "top" ? (
        <div className="pointer-events-none absolute inset-x-4 top-0 h-0.5 rounded-full bg-(--brand)" />
      ) : null}
      {dropEdge === "bottom" ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-(--brand)" />
      ) : null}

      <div className="flex items-stretch">
        <button
          ref={dragHandleRef}
          type="button"
          aria-label={`Reorder ${props.item.songTitle}`}
          className={`dashboard-playlist__drag-handle inline-flex shrink-0 items-center justify-center self-stretch border-r border-(--border) px-2 text-(--muted) opacity-45 transition ${
            isCurrentItem
              ? "cursor-not-allowed opacity-30"
              : "cursor-grab group-hover:opacity-100 hover:bg-(--panel) hover:text-(--text) active:cursor-grabbing"
          } w-11 rounded-l-[24px]`}
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

        <div className="min-w-0 flex-1 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                  isVipRequest
                    ? "border-violet-400/30 bg-violet-500/15 text-violet-100"
                    : "border-(--border) bg-(--panel) text-(--muted)"
                }`}
              >
                #{props.item.position}
              </span>
              {isVipRequest ? (
                <Badge className="border-violet-400/35 bg-violet-500/15 text-violet-100 hover:bg-violet-500/15">
                  VIP
                </Badge>
              ) : null}
              {isCurrentItem ? (
                <Badge className="border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">
                  Playing
                </Badge>
              ) : null}
              {props.item.warningMessage ? (
                <StatusPill
                  icon={AlertTriangle}
                  className="border-amber-400/40 bg-amber-500/15 text-amber-200"
                >
                  Warning
                </StatusPill>
              ) : null}
            </div>

            <div className="dashboard-playlist__item-actions flex max-w-full flex-wrap justify-end gap-2">
              {isVipRequest && hasRequester ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onChangeRequestKind("regular")}
                  disabled={props.isChangeRequestKindPending}
                >
                  {props.isChangeRequestKindPending
                    ? "Saving..."
                    : "Make regular"}
                </Button>
              ) : null}
              {canUpgradeToVip ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onChangeRequestKind("vip")}
                  disabled={props.isChangeRequestKindPending}
                >
                  {props.isChangeRequestKindPending ? "Saving..." : "Make VIP"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={props.onSetCurrent}
                disabled={
                  props.currentItemId === props.item.id ||
                  props.isSetCurrentPending
                }
              >
                Play now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={props.onMarkPlayed}
                disabled={
                  props.currentItemId !== props.item.id ||
                  props.isMarkPlayedPending
                }
              >
                Mark played
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={props.onDelete}
                disabled={props.isDeletingItem}
              >
                Delete
              </Button>
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <p className="text-xl font-semibold text-(--text)">
              {props.item.songTitle}
            </p>
            <p className="mt-1 text-sm text-(--brand-deep)">
              {props.item.songArtist ?? "Unknown artist"}
              {props.item.songAlbum ? ` - ${props.item.songAlbum}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              {getRequesterLabel(props.item) ? (
                <p className="text-sm font-medium text-(--brand-deep)">
                  Requested by {getRequesterLabel(props.item)}
                </p>
              ) : null}
              {showVipTokenBalance ? (
                <p className="text-sm text-(--muted)">
                  VIP tokens:{" "}
                  {formatVipTokenCount(props.availableVipTokenCount)}
                </p>
              ) : null}
              <p className="inline-flex items-center gap-1.5 text-sm text-(--muted)">
                <Clock3 className="h-3.5 w-3.5" />
                <span>Requested {formatTimeAgo(props.item.createdAt)}</span>
              </p>
            </div>
            {props.item.requestedQuery ? (
              <p className="mt-2 text-xs text-amber-200">
                Requested text: {props.item.requestedQuery}
              </p>
            ) : null}
            {props.item.warningMessage ? (
              <p className="mt-2 text-sm text-amber-100">
                {props.item.warningMessage}
              </p>
            ) : null}
          </div>

          <details className="mt-4 border-t border-(--border) pt-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-(--brand-deep)">
              View {resolvedCandidates.length} version
              {resolvedCandidates.length === 1 ? "" : "s"}
            </summary>
            <div className="mt-3 overflow-hidden rounded-[16px] border border-(--border)">
              <div className="grid">
                {resolvedCandidates.map((candidate, candidateIndex) => {
                  const isBlacklistedCharter =
                    candidate.authorId != null &&
                    props.blacklistedCharterIds.has(candidate.authorId);

                  return (
                    <div
                      key={`${props.item.id}-${candidate.id}-${candidateIndex}`}
                      className={`grid gap-3 border-t border-(--border) px-4 py-4 first:border-t-0 ${
                        candidateIndex % 2 === 0
                          ? "bg-(--panel-strong)"
                          : "bg-(--panel-soft)"
                      } ${isBlacklistedCharter ? "opacity-55" : ""}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-(--text)">
                            {candidate.title}
                          </p>
                          {candidate.album ? (
                            <p className="mt-1 truncate text-xs text-(--muted)">
                              {candidate.album}
                            </p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--muted)">
                            <span>
                              Charted by {candidate.creator ?? "Unknown"}
                            </span>
                            {isBlacklistedCharter ? (
                              <Badge
                                variant="outline"
                                className="border-rose-400/40 bg-rose-500/10 text-rose-200"
                              >
                                Blacklisted
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        {candidate.sourceUrl ? (
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                            className="shrink-0"
                          >
                            <a
                              href={candidate.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="no-underline"
                            >
                              Download
                            </a>
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                        <VersionMeta
                          label="Tuning"
                          value={candidate.tuning ?? "Unknown"}
                        />
                        <VersionMeta
                          label="Paths"
                          value={
                            candidate.parts?.length
                              ? candidate.parts
                                  .map((part) => formatPathLabel(part))
                                  .join(", ")
                              : "Unknown"
                          }
                        />
                        <VersionMeta
                          label="Length"
                          value={candidate.durationText ?? "??:??"}
                        />
                        <VersionMeta
                          label="Updated"
                          value={
                            candidate.sourceUpdatedAt
                              ? formatDate(candidate.sourceUpdatedAt)
                              : "Unknown"
                          }
                        />
                        <VersionMeta
                          label="DLs"
                          value={
                            candidate.downloads != null
                              ? candidate.downloads.toLocaleString()
                              : "Unknown"
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
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
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${props.className ?? ""}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {props.children}
    </span>
  );
}

function VersionMeta(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
        {props.label}
      </p>
      <p className="mt-1 truncate text-(--text)">{props.value}</p>
    </div>
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
