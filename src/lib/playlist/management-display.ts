import { hasLyricsMetadata, normalizePathOptions } from "~/lib/channel-options";
import { normalizeSongSourceUrl } from "~/lib/utils";

export type PlaylistManagementDisplayCandidate = {
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

export type PlaylistManagementDisplayItem = {
  id: string;
  candidateMatchesJson?: string;
  songGroupedProjectId?: number | null;
  songCatalogSourceId?: number | null;
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
};

function parseSongParts(partsJson?: string) {
  if (!partsJson) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(partsJson) as unknown;
    return Array.isArray(parsed) ? parsed.map((part) => String(part)) : [];
  } catch {
    return [];
  }
}

function parsePlaylistCandidates(candidateMatchesJson?: string) {
  if (!candidateMatchesJson) {
    return [] as PlaylistManagementDisplayCandidate[];
  }

  try {
    const parsed = JSON.parse(candidateMatchesJson) as unknown;
    return Array.isArray(parsed)
      ? (parsed as PlaylistManagementDisplayCandidate[])
      : [];
  } catch {
    return [];
  }
}

export function getPlaylistDisplayParts(
  parts: Array<string | null | undefined> | null | undefined
) {
  return normalizePathOptions(parts);
}

export function playlistDisplayCandidateHasLyrics(
  candidate: Pick<PlaylistManagementDisplayCandidate, "hasLyrics" | "parts">
) {
  return hasLyricsMetadata({
    hasLyrics: candidate.hasLyrics,
    parts: candidate.parts,
  });
}

export function playlistDisplayItemHasLyrics(
  item: Pick<PlaylistManagementDisplayItem, "songHasLyrics" | "songPartsJson">
) {
  return hasLyricsMetadata({
    hasLyrics: item.songHasLyrics,
    parts: parseSongParts(item.songPartsJson),
  });
}

export function getResolvedPlaylistCandidates(
  item: PlaylistManagementDisplayItem
) {
  const candidates = parsePlaylistCandidates(item.candidateMatchesJson);
  if (candidates.length > 0) {
    return [...candidates]
      .map((candidate) => ({
        ...candidate,
        groupedProjectId:
          candidate.groupedProjectId ?? item.songGroupedProjectId ?? undefined,
        album: candidate.album ?? item.songAlbum,
        hasLyrics:
          candidate.hasLyrics ??
          hasLyricsMetadata({
            hasLyrics: item.songHasLyrics,
            parts: candidate.parts,
          }),
        sourceUrl: normalizeSongSourceUrl({
          source: "library",
          sourceUrl: candidate.sourceUrl,
          sourceId: candidate.sourceId,
        }),
      }))
      .sort((left, right) => {
        if (!!left.isPreferredCharter !== !!right.isPreferredCharter) {
          return (
            Number(!!right.isPreferredCharter) -
            Number(!!left.isPreferredCharter)
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

  return [
    {
      id: item.id,
      groupedProjectId: item.songGroupedProjectId ?? undefined,
      authorId: item.songCharterId ?? undefined,
      title: item.songTitle,
      artist: item.songArtist,
      album: item.songAlbum,
      creator: item.songCreator,
      tuning: item.songTuning,
      parts: parseSongParts(item.songPartsJson),
      hasLyrics: playlistDisplayItemHasLyrics(item),
      durationText: item.songDurationText,
      sourceUpdatedAt: item.songSourceUpdatedAt ?? undefined,
      downloads: item.songDownloads ?? undefined,
      sourceUrl: normalizeSongSourceUrl({
        source: "library",
        sourceUrl: item.songUrl,
        sourceId: item.songCatalogSourceId ?? undefined,
      }),
      sourceId: item.songCatalogSourceId ?? undefined,
    } satisfies PlaylistManagementDisplayCandidate,
  ];
}

export function formatPlaylistItemSummaryLine(
  item: Pick<
    PlaylistManagementDisplayItem,
    "songArtist" | "songAlbum" | "songCreator"
  >,
  options?: {
    hasMultipleVersions?: boolean;
    chartedByLabel?: string;
    unknownArtistLabel?: string;
  }
) {
  return (
    [
      item.songArtist,
      item.songAlbum,
      !options?.hasMultipleVersions && item.songCreator
        ? `${options?.chartedByLabel ?? "Charted by"} ${item.songCreator}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") ||
    options?.unknownArtistLabel ||
    "Unknown artist"
  );
}
