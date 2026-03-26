import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { getErrorMessage } from "~/lib/utils";

type ArtistMatch = {
  artistId: number;
  artistName: string;
  trackCount: number;
};

type CharterMatch = {
  charterId: number;
  charterName: string;
  trackCount: number;
};

type SongMatch = {
  songId: number;
  songTitle: string;
  artistId?: number | null;
  artistName?: string | null;
};

type SongGroupMatch = {
  groupedProjectId: number;
  songTitle: string;
  artistId?: number | null;
  artistName?: string | null;
  versionCount: number;
};

type SearchResponse = {
  artists?: ArtistMatch[];
  charters?: CharterMatch[];
  songs?: SongGroupMatch[];
  songVersions?: SongMatch[];
};

export function ChannelRulesPanel(props: {
  slug: string;
  blacklistEnabled: boolean;
  setlistEnabled: boolean;
  letSetlistBypassBlacklist: boolean;
  subscribersMustFollowSetlist: boolean;
  canManageBlacklist: boolean;
  canManageSetlist: boolean;
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
    artistName?: string | null;
  }>;
  setlistArtists: Array<{ artistId: number; artistName: string }>;
}) {
  const queryClient = useQueryClient();
  const [artistQuery, setArtistQuery] = useState("");
  const [charterQuery, setCharterQuery] = useState("");
  const [songGroupQuery, setSongGroupQuery] = useState("");
  const [songVersionQuery, setSongVersionQuery] = useState("");
  const [setlistQuery, setSetlistQuery] = useState("");
  const [debouncedArtistQuery, setDebouncedArtistQuery] = useState("");
  const [debouncedCharterQuery, setDebouncedCharterQuery] = useState("");
  const [debouncedSongGroupQuery, setDebouncedSongGroupQuery] = useState("");
  const [debouncedSongVersionQuery, setDebouncedSongVersionQuery] =
    useState("");
  const [debouncedSetlistQuery, setDebouncedSetlistQuery] = useState("");
  const [artistMatches, setArtistMatches] = useState<ArtistMatch[]>([]);
  const [charterMatches, setCharterMatches] = useState<CharterMatch[]>([]);
  const [songGroupMatches, setSongGroupMatches] = useState<SongGroupMatch[]>(
    []
  );
  const [songVersionMatches, setSongVersionMatches] = useState<SongMatch[]>([]);
  const [setlistMatches, setSetlistMatches] = useState<ArtistMatch[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedArtistQuery(artistQuery.trim());
      setDebouncedCharterQuery(charterQuery.trim());
      setDebouncedSongGroupQuery(songGroupQuery.trim());
      setDebouncedSongVersionQuery(songVersionQuery.trim());
      setDebouncedSetlistQuery(setlistQuery.trim());
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    artistQuery,
    charterQuery,
    setlistQuery,
    songGroupQuery,
    songVersionQuery,
  ]);

  const mutateRules = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch(`/api/channel/${props.slug}/moderation`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update channel rules.");
      }

      return payload;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["public-channel-page", props.slug],
        }),
        queryClient.invalidateQueries({
          queryKey: [`channel-playlist-management-${props.slug}`],
        }),
      ]);
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function runSearch(
      type: "artist" | "charter" | "song" | "song-version",
      query: string,
      onSuccess: (payload: SearchResponse) => void
    ) {
      if (query.length < 2) {
        onSuccess({});
        return;
      }

      try {
        setSearchError(null);
        const params = new URLSearchParams({ type, query });
        const response = await fetch(
          `/api/channel/${props.slug}/moderation/search?${params}`
        );
        const payload = (await response.json().catch(() => null)) as
          | SearchResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload ? payload.error : undefined
          );
        }

        if (!cancelled) {
          onSuccess(payload as SearchResponse);
        }
      } catch (error) {
        if (!cancelled) {
          setSearchError(getErrorMessage(error) || "Search failed.");
        }
      }
    }

    if (props.canManageBlacklist) {
      void runSearch("artist", debouncedArtistQuery, (payload) => {
        setArtistMatches(payload.artists ?? []);
      });
      void runSearch("charter", debouncedCharterQuery, (payload) => {
        setCharterMatches(payload.charters ?? []);
      });
      void runSearch("song", debouncedSongGroupQuery, (payload) => {
        setSongGroupMatches(payload.songs ?? []);
      });
      void runSearch("song-version", debouncedSongVersionQuery, (payload) => {
        setSongVersionMatches(payload.songVersions ?? []);
      });
    }

    if (props.canManageSetlist) {
      void runSearch("artist", debouncedSetlistQuery, (payload) => {
        setSetlistMatches(payload.artists ?? []);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    debouncedArtistQuery,
    debouncedCharterQuery,
    debouncedSetlistQuery,
    debouncedSongGroupQuery,
    debouncedSongVersionQuery,
    props.canManageBlacklist,
    props.canManageSetlist,
    props.slug,
  ]);

  const blacklistedArtistIds = useMemo(
    () => new Set(props.artists.map((item) => item.artistId)),
    [props.artists]
  );
  const blacklistedCharterIds = useMemo(
    () => new Set(props.charters.map((item) => item.charterId)),
    [props.charters]
  );
  const blacklistedSongIds = useMemo(
    () => new Set(props.songs.map((item) => item.songId)),
    [props.songs]
  );
  const blacklistedSongGroupIds = useMemo(
    () => new Set(props.songGroups.map((item) => item.groupedProjectId)),
    [props.songGroups]
  );
  const setlistArtistIds = useMemo(
    () => new Set(props.setlistArtists.map((item) => item.artistId)),
    [props.setlistArtists]
  );

  const visibleArtistMatches = artistMatches.filter(
    (artist) => !blacklistedArtistIds.has(artist.artistId)
  );
  const visibleCharterMatches = charterMatches.filter(
    (charter) => !blacklistedCharterIds.has(charter.charterId)
  );
  const visibleSongGroupMatches = songGroupMatches.filter(
    (song) => !blacklistedSongGroupIds.has(song.groupedProjectId)
  );
  const visibleSongVersionMatches = songVersionMatches.filter(
    (song) => !blacklistedSongIds.has(song.songId)
  );
  const visibleSetlistMatches = setlistMatches.filter(
    (artist) => !setlistArtistIds.has(artist.artistId)
  );

  const hasVisibleRules =
    props.blacklistEnabled ||
    props.setlistEnabled ||
    props.artists.length > 0 ||
    props.charters.length > 0 ||
    props.songGroups.length > 0 ||
    props.songs.length > 0 ||
    props.setlistArtists.length > 0;

  if (
    !hasVisibleRules &&
    !props.canManageBlacklist &&
    !props.canManageSetlist
  ) {
    return null;
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-(--text)">
          Channel rules
        </h2>
      </div>

      {searchError ? (
        <div className="rounded-[24px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {searchError}
        </div>
      ) : null}

      {props.canManageBlacklist ||
      props.artists.length > 0 ||
      props.charters.length > 0 ||
      props.songGroups.length > 0 ||
      props.songs.length > 0 ||
      props.canManageSetlist ||
      props.setlistArtists.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
          {props.canManageBlacklist ||
          props.artists.length > 0 ||
          props.charters.length > 0 ||
          props.songGroups.length > 0 ||
          props.songs.length > 0 ? (
            <>
              <SearchManageCard
                title="Blacklisted artists"
                description="Blocks requests for any song by these artists."
                inputValue={artistQuery}
                onInputChange={setArtistQuery}
                placeholder="Search artists by name"
                matches={visibleArtistMatches.map((artist) => ({
                  key: `artist-match-${artist.artistId}`,
                  label: artist.artistName,
                  meta: `${artist.trackCount} tracks`,
                  onAdd: () =>
                    mutateRules.mutate({
                      action: "addBlacklistedArtist",
                      artistId: artist.artistId,
                      artistName: artist.artistName,
                    }),
                }))}
                currentItems={props.artists.map((item) => ({
                  key: `artist-current-${item.artistId}`,
                  label: item.artistName,
                  hoverDetail: `Artist ID ${item.artistId}`,
                  onRemove: () =>
                    mutateRules.mutate({
                      action: "removeBlacklistedArtist",
                      artistId: item.artistId,
                    }),
                }))}
                isPending={mutateRules.isPending}
                emptyCurrentLabel="No blacklisted artists."
                canManage={props.canManageBlacklist}
                readOnlyMessage="You can view this blacklist, but cannot change it."
              />

              <SearchManageCard
                title="Blacklisted charters"
                description="Blocks requests for any song charted by these charters."
                inputValue={charterQuery}
                onInputChange={setCharterQuery}
                placeholder="Search charters by name"
                matches={visibleCharterMatches.map((charter) => ({
                  key: `charter-match-${charter.charterId}`,
                  label: charter.charterName,
                  meta: `${charter.trackCount} tracks`,
                  onAdd: () =>
                    mutateRules.mutate({
                      action: "addBlacklistedCharter",
                      charterId: charter.charterId,
                      charterName: charter.charterName,
                    }),
                }))}
                currentItems={props.charters.map((item) => ({
                  key: `charter-current-${item.charterId}`,
                  label: item.charterName,
                  hoverDetail: `Charter ID ${item.charterId}`,
                  onRemove: () =>
                    mutateRules.mutate({
                      action: "removeBlacklistedCharter",
                      charterId: item.charterId,
                    }),
                }))}
                isPending={mutateRules.isPending}
                emptyCurrentLabel="No blacklisted charters."
                canManage={props.canManageBlacklist}
                readOnlyMessage="You can view this blacklist, but cannot change it."
              />

              <SearchManageCard
                title="Blacklisted songs"
                description="Blocks every version grouped under the same song."
                inputValue={songGroupQuery}
                onInputChange={setSongGroupQuery}
                placeholder="Search songs by title"
                matches={visibleSongGroupMatches.map((song) => ({
                  key: `song-group-match-${song.groupedProjectId}`,
                  label: song.artistName
                    ? `${song.songTitle} - ${song.artistName}`
                    : song.songTitle,
                  meta: `${song.versionCount} version${song.versionCount === 1 ? "" : "s"} - Song group ${song.groupedProjectId}`,
                  onAdd: () =>
                    mutateRules.mutate({
                      action: "addBlacklistedSongGroup",
                      groupedProjectId: song.groupedProjectId,
                      songTitle: song.songTitle,
                      artistId: song.artistId ?? null,
                      artistName: song.artistName ?? undefined,
                    }),
                }))}
                currentItems={props.songGroups.map((item) => ({
                  key: `song-group-current-${item.groupedProjectId}`,
                  label: item.artistName
                    ? `${item.songTitle} - ${item.artistName}`
                    : item.songTitle,
                  hoverDetail: `Song group ${item.groupedProjectId}`,
                  onRemove: () =>
                    mutateRules.mutate({
                      action: "removeBlacklistedSongGroup",
                      groupedProjectId: item.groupedProjectId,
                    }),
                }))}
                isPending={mutateRules.isPending}
                emptyCurrentLabel="No blacklisted songs."
                canManage={props.canManageBlacklist}
                readOnlyMessage="You can view this blacklist, but cannot change it."
              />

              <SearchManageCard
                title="Blacklisted versions"
                description="Blocks only one exact version ID."
                inputValue={songVersionQuery}
                onInputChange={setSongVersionQuery}
                placeholder="Search versions by title"
                matches={visibleSongVersionMatches.map((song) => ({
                  key: `song-version-match-${song.songId}`,
                  label: song.artistName
                    ? `${song.songTitle} - ${song.artistName}`
                    : song.songTitle,
                  meta: `Version ID ${song.songId}`,
                  onAdd: () =>
                    mutateRules.mutate({
                      action: "addBlacklistedSong",
                      songId: song.songId,
                      songTitle: song.songTitle,
                      artistId: song.artistId ?? null,
                      artistName: song.artistName ?? undefined,
                    }),
                }))}
                currentItems={props.songs.map((item) => ({
                  key: `song-version-current-${item.songId}`,
                  label: item.artistName
                    ? `${item.songTitle} - ${item.artistName}`
                    : item.songTitle,
                  hoverDetail: `Version ID ${item.songId}`,
                  onRemove: () =>
                    mutateRules.mutate({
                      action: "removeBlacklistedSong",
                      songId: item.songId,
                    }),
                }))}
                isPending={mutateRules.isPending}
                emptyCurrentLabel="No blacklisted versions."
                canManage={props.canManageBlacklist}
                readOnlyMessage="You can view this blacklist, but cannot change it."
              />
            </>
          ) : null}

          {props.canManageSetlist || props.setlistArtists.length > 0 ? (
            <SearchManageCard
              title="Setlist artists"
              description="Limits requests to songs by these artists when setlist mode is active."
              inputValue={setlistQuery}
              onInputChange={setSetlistQuery}
              placeholder="Search artists by name"
              matches={visibleSetlistMatches.map((artist) => ({
                key: `setlist-match-${artist.artistId}`,
                label: artist.artistName,
                meta: `${artist.trackCount} tracks`,
                onAdd: () =>
                  mutateRules.mutate({
                    action: "addSetlistArtist",
                    artistId: artist.artistId,
                    artistName: artist.artistName,
                  }),
              }))}
              currentItems={props.setlistArtists.map((item) => ({
                key: `setlist-current-${item.artistId}`,
                label: item.artistName,
                hoverDetail: `Artist ID ${item.artistId}`,
                onRemove: () =>
                  mutateRules.mutate({
                    action: "removeSetlistArtist",
                    artistId: item.artistId,
                  }),
              }))}
              isPending={mutateRules.isPending}
              emptyCurrentLabel="No setlist artists."
              canManage={props.canManageSetlist}
              readOnlyMessage="You can view this setlist, but cannot change it."
            />
          ) : null}
        </div>
      ) : null}

      {mutateRules.error ? (
        <div className="rounded-[24px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {getErrorMessage(mutateRules.error)}
        </div>
      ) : null}
    </section>
  );
}

function SearchManageCard(props: {
  title: string;
  description?: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder: string;
  matches: Array<{
    key: string;
    label: string;
    meta: string;
    onAdd: () => void;
  }>;
  currentItems: Array<{
    key: string;
    label: string;
    hoverDetail?: string;
    onRemove: () => void;
  }>;
  isPending: boolean;
  emptyCurrentLabel: string;
  canManage?: boolean;
  readOnlyMessage?: string;
}) {
  const normalizedLength = props.inputValue.trim().length;
  const canManage = props.canManage !== false;

  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle>{props.title}</CardTitle>
        {props.description ? (
          <p className="text-sm text-(--muted)">{props.description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pb-5 pt-0">
        {canManage ? (
          <>
            <Input
              value={props.inputValue}
              onChange={(event) => props.onInputChange(event.target.value)}
              placeholder={props.placeholder}
            />
            {normalizedLength > 0 && normalizedLength < 2 ? (
              <p className="text-sm text-(--muted)">
                Type at least 2 characters to search.
              </p>
            ) : null}
          </>
        ) : props.readOnlyMessage ? (
          <p className="text-sm text-(--muted)">{props.readOnlyMessage}</p>
        ) : null}
        {canManage && normalizedLength >= 2 ? (
          <div className="grid gap-3">
            {props.matches.length > 0 ? (
              props.matches.map((match) => (
                <div
                  key={match.key}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-(--border) bg-(--panel-soft) px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-(--text)">
                      {match.label}
                    </p>
                    <p className="text-xs text-(--muted)">{match.meta}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={match.onAdd}
                    disabled={props.isPending}
                  >
                    Add
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-(--muted)">
                No matching entries to add.
              </p>
            )}
          </div>
        ) : null}
        <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-(--border) bg-(--panel-soft)">
          {props.currentItems.length > 0 ? (
            <div className="divide-y divide-(--border)">
              {props.currentItems.map((item) => (
                <div
                  key={item.key}
                  title={item.hoverDetail}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text)">
                      {item.label}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto p-0 text-sm font-medium text-(--muted) hover:bg-transparent hover:text-rose-200"
                    onClick={item.onRemove}
                    disabled={props.isPending || !canManage}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-(--muted)">
              {props.emptyCurrentLabel}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
