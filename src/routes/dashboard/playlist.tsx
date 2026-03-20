// Route: Renders playlist management, manual add, and queue controls for a channel.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  GripVertical,
  History,
  ListMusic,
  Plus,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { BlacklistPanel } from "~/components/blacklist-panel";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { pageTitle } from "~/lib/page-title";
import { formatPathLabel } from "~/lib/request-policy";
import { getErrorMessage, normalizeSongSourceUrl } from "~/lib/utils";

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
};

type PlaylistCandidate = {
  id: string;
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

type ManualSearchData = Pick<SearchResponse, "results">;

type SearchResponse = {
  results: Array<{
    id: string;
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

export const Route = createFileRoute("/dashboard/playlist")({
  head: () => ({
    meta: [{ title: pageTitle("Playlist") }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    channel:
      typeof search.channel === "string" && search.channel.trim().length > 0
        ? search.channel
        : undefined,
  }),
  component: DashboardPlaylistPage,
});

const playlistItemTransition = {
  duration: 0.22,
  ease: [0.2, 0, 0, 1] as const,
};

function DashboardPlaylistPage() {
  const { channel: selectedChannelSlug } = Route.useSearch();
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
  const playlistQuery = useQuery({
    queryKey: ["dashboard-playlist", selectedChannelSlug ?? null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedChannelSlug) {
        params.set("channel", selectedChannelSlug);
      }
      const response = await fetch(
        `/api/dashboard/playlist${params.size ? `?${params.toString()}` : ""}`
      );
      return response.json() as Promise<{
        channel: { id: string; slug: string; displayName: string };
        items: PlaylistItem[];
        playedSongs: PlayedSong[];
        blacklistArtists: Array<{ artistId: number; artistName: string }>;
        blacklistSongs: Array<{
          songId: number;
          songTitle: string;
          artistName?: string | null;
        }>;
        accessRole?: "owner" | "moderator";
        requiredPaths?: string[];
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
        sortBy: "relevance",
        sortDirection: "desc",
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
      const params = new URLSearchParams();
      if (selectedChannelSlug) {
        params.set("channel", selectedChannelSlug);
      }
      const response = await fetch(
        `/api/dashboard/playlist${params.size ? `?${params.toString()}` : ""}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

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

      await queryClient.cancelQueries({ queryKey: ["dashboard-playlist"] });
      const previous = queryClient.getQueryData<{
        channel: { id: string; slug: string; displayName: string };
        items: PlaylistItem[];
        playedSongs: PlayedSong[];
        blacklistArtists: Array<{ artistId: number; artistName: string }>;
        blacklistSongs: Array<{
          songId: number;
          songTitle: string;
          artistName?: string | null;
        }>;
        accessRole?: "owner" | "moderator";
      }>(["dashboard-playlist", selectedChannelSlug ?? null]);

      if (!previous) {
        return undefined;
      }

      if (action === "resetSession") {
        queryClient.setQueryData(
          ["dashboard-playlist", selectedChannelSlug ?? null],
          {
            ...previous,
            items: [],
            playedSongs: previous.playedSongs,
          }
        );
      }

      if (
        itemId &&
        (action === "deleteItem" ||
          action === "markPlayed" ||
          action === "skipItem")
      ) {
        const removedItem =
          previous.items.find((item) => item.id === itemId) ?? null;
        const remainingItems = previous.items.filter(
          (item) => item.id !== itemId
        );
        const sortedRemaining = [...remainingItems].sort(
          (a, b) => a.position - b.position
        );

        queryClient.setQueryData(
          ["dashboard-playlist", selectedChannelSlug ?? null],
          {
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
          }
        );
      }

      if (itemId && action === "setCurrent") {
        queryClient.setQueryData(
          ["dashboard-playlist", selectedChannelSlug ?? null],
          {
            ...previous,
            items: previous.items.map((item) => ({
              ...item,
              status: item.id === itemId ? "current" : "queued",
            })),
          }
        );
      }

      return { previous };
    },
    onError: (error, body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["dashboard-playlist", selectedChannelSlug ?? null],
          context.previous
        );
      }

      const action = typeof body.action === "string" ? body.action : "unknown";
      const message = getErrorMessage(error, "Playlist update failed.");

      if (action === "manualAdd") {
        setManualAddError(message);
      } else {
        setPlaylistActionError(message);
      }
    },
    onSuccess: async () => {
      setManualAddError(null);
      setPlaylistActionError(null);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-playlist", selectedChannelSlug ?? null],
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
  const blacklistArtists = playlistQuery.data?.blacklistArtists ?? [];
  const blacklistSongs = playlistQuery.data?.blacklistSongs ?? [];
  const managedChannel = playlistQuery.data?.channel ?? null;
  const accessRole = playlistQuery.data?.accessRole ?? "owner";
  const requiredPaths = playlistQuery.data?.requiredPaths ?? [];
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
  return (
    <div className="grid gap-6">
      <section className="surface-grid surface-noise rounded-[34px] border border-(--border-strong) bg-(--panel) p-6 shadow-(--shadow) md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--brand-deep)">
              Playlist control
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-(--text)">
              Playlist
            </h1>
            {managedChannel ? (
              <p className="mt-3 text-sm text-(--muted)">
                {accessRole === "moderator" ? "Managing" : "Channel"}{" "}
                <span className="font-medium text-(--text)">
                  {managedChannel.displayName}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
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

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <PlaylistStat label="Queued" value={items.length} icon={ListMusic} />
          <PlaylistStat
            label="Current"
            value={currentItemId ? 1 : 0}
            icon={GripVertical}
          />
          <PlaylistStat
            label="Played"
            value={playedSongs.length}
            icon={History}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Manual add</CardTitle>
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
            <div className="overflow-hidden rounded-[24px] border border-(--border)">
              <div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_96px] gap-4 bg-(--panel-muted) px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
                <div>Track</div>
                <div>Album / Creator</div>
                <div>Tuning / Path</div>
                <div>Add</div>
              </div>
              {manualSearchQuery.data?.results?.map((song, index) => (
                <div
                  key={song.id}
                  className={`grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_96px] gap-4 border-t border-(--border) px-5 py-4 ${
                    index % 2 === 0
                      ? "bg-(--panel-strong)"
                      : "bg-(--panel-soft)"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-(--text)">
                      {song.title}
                    </p>
                    <p className="mt-1 truncate text-sm text-(--brand-deep)">
                      {song.artist ?? "Unknown artist"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-(--text)">
                      {song.album ?? "Unknown album"}
                    </p>
                    <p className="mt-1 truncate text-sm text-(--muted)">
                      {song.creator
                        ? `Charted by ${song.creator}`
                        : "Unknown creator"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-(--text)">
                      {song.tuning ?? "No tuning info"}
                    </p>
                    <p className="mt-1 truncate text-sm text-(--muted)">
                      {song.parts?.length
                        ? song.parts.join(", ")
                        : "No path info"}
                    </p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={() =>
                        mutation.mutate({
                          action: "manualAdd",
                          songId: song.id,
                          requesterLogin:
                            manualRequesterLogin.trim() || undefined,
                          title: song.title,
                          artist: song.artist,
                          album: song.album,
                          creator: song.creator,
                          tuning: song.tuning,
                          parts: song.parts,
                          durationText: song.durationText,
                          source: song.source,
                          sourceUrl: song.sourceUrl,
                          sourceId: song.sourceId,
                        })
                      }
                      disabled={isManualAddPending(song.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <BlacklistPanel
        artists={blacklistArtists}
        songs={blacklistSongs}
        description="These exact artist IDs and track IDs are currently blocked for this channel."
      />

      <Card>
        <CardHeader>
          <CardTitle>Current playlist</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {playlistActionError ? (
            <div className="rounded-[20px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {playlistActionError}
            </div>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.985 }}
                transition={playlistItemTransition}
                className={`rounded-[24px] border px-5 py-4 ${
                  index % 2 === 0
                    ? "border-(--border) bg-(--panel-soft)"
                    : "border-(--border) bg-(--panel-muted)"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-(--border) bg-(--panel) px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">
                        #{item.position}
                      </span>
                      <Badge
                        variant="outline"
                        className="uppercase tracking-[0.18em]"
                      >
                        {item.status}
                      </Badge>
                      {item.warningMessage ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Warning
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xl font-semibold text-(--text)">
                      {item.songTitle}
                    </p>
                    <p className="mt-1 text-sm text-(--brand-deep)">
                      {item.songArtist ?? "Unknown artist"}
                    </p>
                    {item.requestedQuery ? (
                      <p className="mt-2 text-xs text-amber-200">
                        Requested text: {item.requestedQuery}
                      </p>
                    ) : null}
                    {item.warningMessage ? (
                      <p className="mt-2 text-sm text-amber-100">
                        {item.warningMessage}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-(--muted)">
                      <span>Requested {formatTimeAgo(item.createdAt)}</span>
                      {item.songAlbum ? (
                        <span>Album: {item.songAlbum}</span>
                      ) : null}
                      {item.songCreator ? (
                        <span>Creator: {item.songCreator}</span>
                      ) : null}
                      {item.songTuning ? (
                        <span>Tuning: {item.songTuning}</span>
                      ) : null}
                      {item.requestedByDisplayName || item.requestedByLogin ? (
                        <span>
                          Requested by{" "}
                          {item.requestedByDisplayName ?? item.requestedByLogin}
                        </span>
                      ) : null}
                      {item.songDurationText ? (
                        <span>Duration: {item.songDurationText}</span>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-2">
                      {requiredPaths.length > 0 ? (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                          Stream rule paths
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {["lead", "rhythm", "bass", "voice"].map((path) => (
                          <PathStatusChip
                            key={`${item.id}-${path}`}
                            path={path}
                            required={requiredPaths.includes(path)}
                            available={getSongParts(item.songPartsJson).some(
                              (part) =>
                                normalizePathToken(part) ===
                                normalizePathToken(path)
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <details className="mt-4 rounded-[20px] border border-(--border) bg-(--panel) p-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-(--brand-deep)">
                        View {getResolvedCandidates(item).length} version
                        {getResolvedCandidates(item).length === 1 ? "" : "s"}
                      </summary>
                      <div className="mt-4 overflow-x-auto rounded-[16px] border border-(--border)">
                        <table className="min-w-full table-fixed border-collapse">
                          <thead className="bg-(--panel-muted)">
                            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                              <th className="w-[30%] px-4 py-3">Song</th>
                              <th className="w-[12%] px-4 py-3">Tuning</th>
                              <th className="w-[14%] px-4 py-3">Paths</th>
                              <th className="w-[14%] px-4 py-3">Creator</th>
                              <th className="w-[8%] px-4 py-3">Length</th>
                              <th className="w-[10%] px-4 py-3">Updated</th>
                              <th className="w-[6%] px-4 py-3">DLs</th>
                              <th className="w-[6%] px-4 py-3 text-right">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {getResolvedCandidates(item).map(
                              (candidate, candidateIndex) => (
                                <tr
                                  key={`${item.id}-${candidate.id}-${candidateIndex}`}
                                  className={`border-t border-(--border) text-sm ${
                                    candidateIndex % 2 === 0
                                      ? "bg-(--panel-strong)"
                                      : "bg-(--panel-soft)"
                                  }`}
                                >
                                  <td className="px-4 py-3 align-top">
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-(--text)">
                                        {candidate.artist
                                          ? `${candidate.artist} - ${candidate.title}`
                                          : candidate.title}
                                      </p>
                                      {candidate.album ? (
                                        <p className="mt-1 truncate text-xs text-(--muted)">
                                          {candidate.album}
                                        </p>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 align-top text-(--text)">
                                    <span className="block truncate">
                                      {candidate.tuning ?? "Unknown"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 align-top text-(--text)">
                                    <span className="block truncate">
                                      {candidate.parts?.length
                                        ? candidate.parts
                                            .map((part) =>
                                              formatPathLabel(part)
                                            )
                                            .join(", ")
                                        : "Unknown"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 align-top text-(--text)">
                                    <span className="block truncate">
                                      {candidate.creator ?? "Unknown"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 align-top text-(--text)">
                                    {candidate.durationText ?? "??:??"}
                                  </td>
                                  <td className="px-4 py-3 align-top text-(--text)">
                                    {candidate.sourceUpdatedAt
                                      ? formatDate(candidate.sourceUpdatedAt)
                                      : "Unknown"}
                                  </td>
                                  <td className="px-4 py-3 align-top text-(--text)">
                                    {candidate.downloads != null
                                      ? candidate.downloads.toLocaleString()
                                      : "Unknown"}
                                  </td>
                                  <td className="px-4 py-3 align-top text-right">
                                    {candidate.sourceUrl ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        asChild
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
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>

                  <div className="flex max-w-full flex-col items-end gap-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutation.mutate({
                            action: "setCurrent",
                            itemId: item.id,
                          })
                        }
                        disabled={
                          currentItemId === item.id ||
                          isRowPending("setCurrent", item.id)
                        }
                      >
                        Play now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutation.mutate({
                            action: "markPlayed",
                            itemId: item.id,
                          })
                        }
                        disabled={
                          currentItemId !== item.id ||
                          isRowPending("markPlayed", item.id)
                        }
                      >
                        Mark played
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutation.mutate({
                            action: "skipItem",
                            itemId: item.id,
                          })
                        }
                        disabled={
                          item.status === "current" ||
                          isRowPending("skipItem", item.id)
                        }
                      >
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutation.mutate({
                            action: "deleteItem",
                            itemId: item.id,
                          })
                        }
                        disabled={isDeletingItem(item.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {items.length === 0 ? (
            <p className="text-sm leading-7 text-(--muted)">
              No songs in the playlist yet.
            </p>
          ) : null}
        </CardContent>
      </Card>

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
                    {song.songArtist ? ` by ${song.songArtist}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-(--muted)">
                    {(song.requestedByDisplayName ?? song.requestedByLogin)
                      ? `Requested by ${song.requestedByDisplayName ?? song.requestedByLogin} · `
                      : ""}
                    {new Date(song.playedAt).toLocaleString()}
                  </p>
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
    </div>
  );
}

function PlaylistStat(props: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-[26px] border border-(--border) bg-(--panel-soft) p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm uppercase tracking-[0.16em] text-(--muted)">
          {props.label}
        </p>
        <Icon className="h-4 w-4 text-(--brand-deep)" />
      </div>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-(--text)">
        {props.value}
      </p>
    </div>
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

function normalizePathToken(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "vocals") {
    return "voice";
  }

  return normalized;
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
    return candidates.map((candidate) => ({
      ...candidate,
      sourceUrl: normalizeSongSourceUrl({
        source: "library",
        sourceUrl: candidate.sourceUrl,
        sourceId: candidate.sourceId,
      }),
    }));
  }

  return [
    {
      id: item.id,
      title: item.songTitle,
      artist: item.songArtist,
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

function PathStatusChip(props: {
  path: string;
  required: boolean;
  available: boolean;
}) {
  const label = formatPathLabel(props.path);
  const className = props.required
    ? props.available
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
      : "border-rose-400/40 bg-rose-500/15 text-rose-200"
    : props.available
      ? "border-(--border-strong) bg-(--panel) text-(--text)"
      : "border-(--border) bg-(--panel-soft) text-(--muted)";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${className}`}
    >
      {label}
      {props.required ? (props.available ? " required" : " missing") : ""}
    </span>
  );
}
