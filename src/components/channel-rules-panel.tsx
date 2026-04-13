import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useLocaleTranslation } from "~/lib/i18n/client";
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
};

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

export function ChannelRulesPanel(props: {
  slug: string;
  channelDisplayName?: string | null;
  blacklistEnabled: boolean;
  setlistEnabled: boolean;
  letSetlistBypassBlacklist: boolean;
  subscribersMustFollowSetlist: boolean;
  canManageBlacklist: boolean;
  canManageSetlist: boolean;
  artists: Array<{ artistId: number; artistName: string }>;
  charters: Array<{ charterId: number; charterName: string }>;
  preferredCharters: Array<{ charterId: number; charterName: string }>;
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
  const { t } = useLocaleTranslation("playlist");
  const queryClient = useQueryClient();
  const [artistQuery, setArtistQuery] = useState("");
  const [charterQuery, setCharterQuery] = useState("");
  const [preferredCharterQuery, setPreferredCharterQuery] = useState("");
  const [songGroupQuery, setSongGroupQuery] = useState("");
  const [setlistQuery, setSetlistQuery] = useState("");
  const [debouncedArtistQuery, setDebouncedArtistQuery] = useState("");
  const [debouncedCharterQuery, setDebouncedCharterQuery] = useState("");
  const [debouncedPreferredCharterQuery, setDebouncedPreferredCharterQuery] =
    useState("");
  const [debouncedSongGroupQuery, setDebouncedSongGroupQuery] = useState("");
  const [debouncedSetlistQuery, setDebouncedSetlistQuery] = useState("");
  const [artistMatches, setArtistMatches] = useState<ArtistMatch[]>([]);
  const [charterMatches, setCharterMatches] = useState<CharterMatch[]>([]);
  const [preferredCharterMatches, setPreferredCharterMatches] = useState<
    CharterMatch[]
  >([]);
  const [songGroupMatches, setSongGroupMatches] = useState<SongGroupMatch[]>(
    []
  );
  const [setlistMatches, setSetlistMatches] = useState<ArtistMatch[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedArtistQuery(artistQuery.trim());
      setDebouncedCharterQuery(charterQuery.trim());
      setDebouncedPreferredCharterQuery(preferredCharterQuery.trim());
      setDebouncedSongGroupQuery(songGroupQuery.trim());
      setDebouncedSetlistQuery(setlistQuery.trim());
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    artistQuery,
    charterQuery,
    preferredCharterQuery,
    setlistQuery,
    songGroupQuery,
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
        throw new Error(payload?.error ?? t("rules.states.updateFailed"));
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
          setSearchError(
            getErrorMessage(error) || t("rules.states.searchFailed")
          );
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
      void runSearch("charter", debouncedPreferredCharterQuery, (payload) => {
        setPreferredCharterMatches(payload.charters ?? []);
      });
      void runSearch("song", debouncedSongGroupQuery, (payload) => {
        setSongGroupMatches(payload.songs ?? []);
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
    debouncedPreferredCharterQuery,
    debouncedSetlistQuery,
    debouncedSongGroupQuery,
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
  const preferredCharterIds = useMemo(
    () => new Set(props.preferredCharters.map((item) => item.charterId)),
    [props.preferredCharters]
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
  const visiblePreferredCharterMatches = preferredCharterMatches.filter(
    (charter) => !preferredCharterIds.has(charter.charterId)
  );
  const visibleSongGroupMatches = songGroupMatches.filter(
    (song) => !blacklistedSongGroupIds.has(song.groupedProjectId)
  );
  const visibleSetlistMatches = setlistMatches.filter(
    (artist) => !setlistArtistIds.has(artist.artistId)
  );
  const sortedArtists = useMemo(
    () =>
      [...props.artists].sort((left, right) =>
        compareText(left.artistName, right.artistName)
      ),
    [props.artists]
  );
  const sortedCharters = useMemo(
    () =>
      [...props.charters].sort((left, right) =>
        compareText(left.charterName, right.charterName)
      ),
    [props.charters]
  );
  const sortedPreferredCharters = useMemo(
    () =>
      [...props.preferredCharters].sort((left, right) =>
        compareText(left.charterName, right.charterName)
      ),
    [props.preferredCharters]
  );
  const sortedSongGroups = useMemo(
    () =>
      [...props.songGroups].sort((left, right) =>
        compareText(
          left.artistName
            ? `${left.songTitle} - ${left.artistName}`
            : left.songTitle,
          right.artistName
            ? `${right.songTitle} - ${right.artistName}`
            : right.songTitle
        )
      ),
    [props.songGroups]
  );
  const sortedSongs = useMemo(
    () =>
      [...props.songs].sort((left, right) =>
        compareText(
          left.artistName
            ? `${left.songTitle} - ${left.artistName}`
            : left.songTitle,
          right.artistName
            ? `${right.songTitle} - ${right.artistName}`
            : right.songTitle
        )
      ),
    [props.songs]
  );
  const sortedSetlistArtists = useMemo(
    () =>
      [...props.setlistArtists].sort((left, right) =>
        compareText(left.artistName, right.artistName)
      ),
    [props.setlistArtists]
  );
  const showBlacklistedArtistsCard =
    props.canManageBlacklist || props.artists.length > 0;
  const showPreferredChartersCard =
    props.canManageBlacklist || props.preferredCharters.length > 0;
  const showBlacklistedChartersCard = props.canManageBlacklist;
  const showBlacklistedSongsCard =
    props.canManageBlacklist || props.songGroups.length > 0;
  const showBlacklistedVersionsCard = props.canManageBlacklist;
  const showSetlistArtistsCard =
    props.canManageSetlist || props.setlistArtists.length > 0;
  const showBlacklistSection =
    showPreferredChartersCard ||
    showBlacklistedArtistsCard ||
    showBlacklistedChartersCard ||
    showBlacklistedSongsCard ||
    showBlacklistedVersionsCard;

  const hasVisibleRules = showBlacklistSection || showSetlistArtistsCard;

  if (
    !hasVisibleRules &&
    !props.canManageBlacklist &&
    !props.canManageSetlist
  ) {
    return null;
  }

  return (
    <section className="grid gap-6 max-[960px]:gap-4 max-[960px]:border-t max-[960px]:border-(--border) max-[960px]:pt-4">
      <div className="grid gap-2 px-8 max-[960px]:px-6">
        <h2 className="text-4xl font-semibold tracking-tight text-(--text)">
          {props.channelDisplayName
            ? t("rules.sectionTitleWithChannel", {
                channel: props.channelDisplayName,
              })
            : t("rules.sectionTitle")}
        </h2>
      </div>

      {searchError ? (
        <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {searchError}
        </div>
      ) : null}

      {showBlacklistSection || showSetlistArtistsCard ? (
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4 max-[960px]:gap-0">
          {showBlacklistSection ? (
            <>
              {showPreferredChartersCard ? (
                <SearchManageCard
                  title={t("rules.preferredCharters")}
                  inputValue={preferredCharterQuery}
                  onInputChange={setPreferredCharterQuery}
                  placeholder={t("rules.searchCharters")}
                  matches={visiblePreferredCharterMatches.map((charter) => ({
                    key: `preferred-charter-match-${charter.charterId}`,
                    label: charter.charterName,
                    meta: t("rules.trackCount", { count: charter.trackCount }),
                    onAdd: () =>
                      mutateRules.mutate({
                        action: "addPreferredCharter",
                        charterId: charter.charterId,
                        charterName: charter.charterName,
                      }),
                  }))}
                  currentItems={sortedPreferredCharters.map((item) => ({
                    key: `preferred-charter-current-${item.charterId}`,
                    label: item.charterName,
                    hoverDetail: t("rules.charterId", { id: item.charterId }),
                    onRemove: () =>
                      mutateRules.mutate({
                        action: "removePreferredCharter",
                        charterId: item.charterId,
                      }),
                  }))}
                  isPending={mutateRules.isPending}
                  emptyCurrentLabel={t("rules.noPreferredCharters")}
                  canManage={props.canManageBlacklist}
                  hideReadOnlyRemoveAction
                />
              ) : null}

              {showBlacklistedArtistsCard ? (
                <SearchManageCard
                  title={t("rules.blacklistedArtists")}
                  inputValue={artistQuery}
                  onInputChange={setArtistQuery}
                  placeholder={t("rules.searchArtists")}
                  matches={visibleArtistMatches.map((artist) => ({
                    key: `artist-match-${artist.artistId}`,
                    label: artist.artistName,
                    meta: t("rules.trackCount", { count: artist.trackCount }),
                    onAdd: () =>
                      mutateRules.mutate({
                        action: "addBlacklistedArtist",
                        artistId: artist.artistId,
                        artistName: artist.artistName,
                      }),
                  }))}
                  currentItems={sortedArtists.map((item) => ({
                    key: `artist-current-${item.artistId}`,
                    label: item.artistName,
                    hoverDetail: t("rules.artistId", { id: item.artistId }),
                    onRemove: () =>
                      mutateRules.mutate({
                        action: "removeBlacklistedArtist",
                        artistId: item.artistId,
                      }),
                  }))}
                  isPending={mutateRules.isPending}
                  emptyCurrentLabel={t("rules.noBlacklistedArtists")}
                  canManage={props.canManageBlacklist}
                  hideReadOnlyRemoveAction
                />
              ) : null}

              {showBlacklistedChartersCard ? (
                <SearchManageCard
                  title={t("rules.blacklistedCharters")}
                  inputValue={charterQuery}
                  onInputChange={setCharterQuery}
                  placeholder={t("rules.searchCharters")}
                  matches={visibleCharterMatches.map((charter) => ({
                    key: `charter-match-${charter.charterId}`,
                    label: charter.charterName,
                    meta: t("rules.trackCount", { count: charter.trackCount }),
                    onAdd: () =>
                      mutateRules.mutate({
                        action: "addBlacklistedCharter",
                        charterId: charter.charterId,
                        charterName: charter.charterName,
                      }),
                  }))}
                  currentItems={sortedCharters.map((item) => ({
                    key: `charter-current-${item.charterId}`,
                    label: item.charterName,
                    hoverDetail: t("rules.charterId", { id: item.charterId }),
                    onRemove: () =>
                      mutateRules.mutate({
                        action: "removeBlacklistedCharter",
                        charterId: item.charterId,
                      }),
                  }))}
                  isPending={mutateRules.isPending}
                  emptyCurrentLabel={t("rules.noBlacklistedCharters")}
                  canManage={props.canManageBlacklist}
                  hideReadOnlyRemoveAction
                />
              ) : null}

              {showBlacklistedSongsCard ? (
                <SearchManageCard
                  title={t("rules.blacklistedSongs")}
                  inputValue={songGroupQuery}
                  onInputChange={setSongGroupQuery}
                  placeholder={t("rules.searchSongs")}
                  matches={visibleSongGroupMatches.map((song) => ({
                    key: `song-group-match-${song.groupedProjectId}`,
                    label: song.artistName
                      ? `${song.songTitle} - ${song.artistName}`
                      : song.songTitle,
                    meta: t("rules.versionCount", {
                      count: song.versionCount,
                      groupId: song.groupedProjectId,
                    }),
                    onAdd: () =>
                      mutateRules.mutate({
                        action: "addBlacklistedSongGroup",
                        groupedProjectId: song.groupedProjectId,
                        songTitle: song.songTitle,
                        artistId: song.artistId ?? null,
                        artistName: song.artistName ?? undefined,
                      }),
                  }))}
                  currentItems={sortedSongGroups.map((item) => ({
                    key: `song-group-current-${item.groupedProjectId}`,
                    label: item.artistName
                      ? `${item.songTitle} - ${item.artistName}`
                      : item.songTitle,
                    hoverDetail: t("rules.songGroupId", {
                      groupId: item.groupedProjectId,
                    }),
                    onRemove: () =>
                      mutateRules.mutate({
                        action: "removeBlacklistedSongGroup",
                        groupedProjectId: item.groupedProjectId,
                      }),
                  }))}
                  isPending={mutateRules.isPending}
                  emptyCurrentLabel={t("rules.noBlacklistedSongs")}
                  canManage={props.canManageBlacklist}
                  hideReadOnlyRemoveAction
                />
              ) : null}

              {showBlacklistedVersionsCard ? (
                <SearchManageCard
                  title={t("rules.blacklistedVersions")}
                  inputValue=""
                  onInputChange={() => {}}
                  placeholder=""
                  matches={[]}
                  currentItems={sortedSongs.map((item) => ({
                    key: `song-version-current-${item.songId}`,
                    label: item.artistName
                      ? `${item.songTitle} - ${item.artistName}`
                      : item.songTitle,
                    hoverDetail: t("rules.versionId", { id: item.songId }),
                    onRemove: () =>
                      mutateRules.mutate({
                        action: "removeBlacklistedSong",
                        songId: item.songId,
                      }),
                  }))}
                  isPending={mutateRules.isPending}
                  emptyCurrentLabel={t("rules.noBlacklistedVersions")}
                  canManage={props.canManageBlacklist}
                  showSearch={false}
                  hideReadOnlyRemoveAction
                />
              ) : null}
            </>
          ) : null}

          {showSetlistArtistsCard ? (
            <SearchManageCard
              title={t("rules.setlistArtists")}
              inputValue={setlistQuery}
              onInputChange={setSetlistQuery}
              placeholder={t("rules.searchArtists")}
              matches={visibleSetlistMatches.map((artist) => ({
                key: `setlist-match-${artist.artistId}`,
                label: artist.artistName,
                meta: t("rules.trackCount", { count: artist.trackCount }),
                onAdd: () =>
                  mutateRules.mutate({
                    action: "addSetlistArtist",
                    artistId: artist.artistId,
                    artistName: artist.artistName,
                  }),
              }))}
              currentItems={sortedSetlistArtists.map((item) => ({
                key: `setlist-current-${item.artistId}`,
                label: item.artistName,
                hoverDetail: t("rules.artistId", { id: item.artistId }),
                onRemove: () =>
                  mutateRules.mutate({
                    action: "removeSetlistArtist",
                    artistId: item.artistId,
                  }),
              }))}
              isPending={mutateRules.isPending}
              emptyCurrentLabel={t("rules.noSetlistArtists")}
              canManage={props.canManageSetlist}
              hideReadOnlyRemoveAction
            />
          ) : null}
        </div>
      ) : null}

      {mutateRules.error ? (
        <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {getErrorMessage(mutateRules.error)}
        </div>
      ) : null}
    </section>
  );
}

function SearchManageCard(props: {
  title: string;
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
  showSearch?: boolean;
  hideReadOnlyRemoveAction?: boolean;
}) {
  const { t } = useLocaleTranslation("playlist");
  const normalizedLength = props.inputValue.trim().length;
  const canManage = props.canManage !== false;
  const showSearch = props.showSearch !== false;
  const showRemoveAction = canManage || !props.hideReadOnlyRemoveAction;

  return (
    <Card className="max-[960px]:rounded-none max-[960px]:border-x-0 max-[960px]:bg-transparent max-[960px]:shadow-none max-[960px]:[background-image:none]">
      <CardHeader className="p-5 pb-3 max-[960px]:px-0">
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pb-5 pt-0 max-[960px]:px-0">
        {canManage && showSearch ? (
          <>
            <Input
              value={props.inputValue}
              onChange={(event) => props.onInputChange(event.target.value)}
              placeholder={props.placeholder}
            />
            {normalizedLength > 0 && normalizedLength < 2 ? (
              <p className="text-sm text-(--muted)">{t("rules.searchMin")}</p>
            ) : null}
          </>
        ) : null}
        {canManage && showSearch && normalizedLength >= 2 ? (
          <div className="overflow-hidden border border-(--border)">
            {props.matches.length > 0 ? (
              props.matches.map((match, index) => (
                <div
                  key={match.key}
                  className={`flex items-center justify-between gap-4 px-4 py-3 ${
                    index % 2 === 0 ? "bg-(--panel-soft)" : "bg-(--panel-muted)"
                  } ${index > 0 ? "border-t border-(--border)" : ""}`}
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
                    {t("rules.add")}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-(--muted)">{t("rules.noMatches")}</p>
            )}
          </div>
        ) : null}
        <div className="max-h-[320px] overflow-y-auto border border-(--border)">
          {props.currentItems.length > 0 ? (
            <div>
              {props.currentItems.map((item, index) => (
                <div
                  key={item.key}
                  title={item.hoverDetail}
                  className={
                    showRemoveAction
                      ? `flex items-start justify-between gap-4 px-4 py-3 ${
                          index % 2 === 0
                            ? "bg-(--panel-soft)"
                            : "bg-(--panel-muted)"
                        } ${index > 0 ? "border-t border-(--border)" : ""}`
                      : `px-4 py-3 ${
                          index % 2 === 0
                            ? "bg-(--panel-soft)"
                            : "bg-(--panel-muted)"
                        } ${index > 0 ? "border-t border-(--border)" : ""}`
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text)">
                      {item.label}
                    </p>
                  </div>
                  {showRemoveAction ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto p-0 text-sm font-medium text-(--muted) hover:bg-transparent hover:text-rose-200"
                      onClick={item.onRemove}
                      disabled={props.isPending || !canManage}
                    >
                      {t("rules.remove")}
                    </Button>
                  ) : null}
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
