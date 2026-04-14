import { normalizeArtistNameForSongGrouping } from "~/lib/song-grouping";
import type { SongSearchResult } from "~/lib/song-search/types";
import {
  decodeHtmlEntities,
  normalizeSongSourceUrl,
  parseJsonStringArray,
} from "~/lib/utils";

export type PlaylistCandidateMatch = {
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

export type PlaylistCatalogCandidateSong = {
  id: string;
  groupedProjectId?: number | null;
  authorId?: number | null;
  title: string;
  artistName?: string | null;
  albumName?: string | null;
  creatorName?: string | null;
  tuningSummary?: string | null;
  partsJson?: string | null;
  hasLyrics?: boolean | number | null;
  durationText?: string | null;
  year?: number | null;
  sourceUpdatedAt?: number | null;
  downloads?: number | null;
  source: string;
  sourceUrl?: string | null;
  sourceSongId?: number | null;
};

export function normalizeArtistNameForCandidateGrouping(
  artistName?: string | null
) {
  return normalizeArtistNameForSongGrouping(artistName);
}

export function buildPlaylistCandidateMatchesJson(
  matches: PlaylistCandidateMatch[]
) {
  if (matches.length <= 1) {
    return undefined;
  }

  return JSON.stringify(matches);
}

export function buildPlaylistCandidateMatchesFromSongSearchResults(
  results: SongSearchResult[]
) {
  return results.map(
    (result) =>
      ({
        id: result.id,
        groupedProjectId: result.groupedProjectId,
        authorId: result.authorId,
        isPreferredCharter: result.isPreferredCharter,
        title: result.title,
        artist: result.artist,
        album: result.album,
        creator: result.creator,
        tuning: result.tuning,
        parts: result.parts ?? [],
        hasLyrics: result.hasLyrics,
        durationText: result.durationText,
        year: result.year,
        sourceUpdatedAt: result.sourceUpdatedAt,
        downloads: result.downloads,
        sourceUrl: result.sourceUrl,
        sourceId: result.sourceId,
      }) satisfies PlaylistCandidateMatch
  );
}

export function getPreferredCharterSets(
  preferredCharters: Array<{
    charterId?: number | null;
    charterName?: string | null;
  }>
) {
  return {
    ids: new Set(
      preferredCharters
        .map((charter) => charter.charterId)
        .filter((charterId): charterId is number => Number.isInteger(charterId))
    ),
    names: new Set(
      preferredCharters
        .map((charter) => charter.charterName?.trim().toLowerCase())
        .filter((charterName): charterName is string => Boolean(charterName))
    ),
  };
}

export function buildPlaylistCandidateMatchesFromCatalogSongs(input: {
  songs: PlaylistCatalogCandidateSong[];
  preferredCharterIds?: Set<number>;
  preferredCharterNames?: Set<string>;
}) {
  const preferredCharterIds = input.preferredCharterIds ?? new Set<number>();
  const preferredCharterNames =
    input.preferredCharterNames ?? new Set<string>();

  return [...new Map(input.songs.map((song) => [song.id, song])).values()]
    .map(
      (song) =>
        ({
          id: song.id,
          groupedProjectId: song.groupedProjectId ?? undefined,
          authorId: song.authorId ?? undefined,
          isPreferredCharter:
            (song.authorId != null && preferredCharterIds.has(song.authorId)) ||
            preferredCharterNames.has(
              song.creatorName?.trim().toLowerCase() ?? ""
            ),
          title: decodeHtmlEntities(song.title),
          artist: song.artistName
            ? decodeHtmlEntities(song.artistName)
            : undefined,
          album: song.albumName
            ? decodeHtmlEntities(song.albumName)
            : undefined,
          creator: song.creatorName
            ? decodeHtmlEntities(song.creatorName)
            : undefined,
          tuning: song.tuningSummary
            ? decodeHtmlEntities(song.tuningSummary)
            : undefined,
          parts: parseJsonStringArray(song.partsJson),
          hasLyrics: Boolean(song.hasLyrics),
          durationText: song.durationText ?? undefined,
          year: song.year ?? undefined,
          sourceUpdatedAt: song.sourceUpdatedAt ?? undefined,
          downloads: song.downloads ?? undefined,
          sourceUrl: normalizeSongSourceUrl({
            source: song.source,
            sourceUrl: song.sourceUrl ?? undefined,
            sourceId: song.sourceSongId ?? undefined,
          }),
          sourceId: song.sourceSongId ?? undefined,
        }) satisfies PlaylistCandidateMatch
    )
    .sort((left, right) => {
      if (!!left.isPreferredCharter !== !!right.isPreferredCharter) {
        return (
          Number(!!right.isPreferredCharter) - Number(!!left.isPreferredCharter)
        );
      }

      const leftUpdatedAt = left.sourceUpdatedAt ?? -1;
      const rightUpdatedAt = right.sourceUpdatedAt ?? -1;
      if (leftUpdatedAt !== rightUpdatedAt) {
        return rightUpdatedAt - leftUpdatedAt;
      }

      const leftDownloads = left.downloads ?? -1;
      const rightDownloads = right.downloads ?? -1;
      if (leftDownloads !== rightDownloads) {
        return rightDownloads - leftDownloads;
      }

      const leftSourceId = left.sourceId ?? -1;
      const rightSourceId = right.sourceId ?? -1;
      return rightSourceId - leftSourceId;
    });
}
