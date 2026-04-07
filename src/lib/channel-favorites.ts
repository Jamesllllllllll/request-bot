import {
  type ChannelBlacklist,
  getBlacklistReasonCodes,
} from "~/lib/channel-blacklist";
import type { SongSearchResult } from "~/lib/song-search/types";

export type FavoritedChart = SongSearchResult & {
  favoritedAt: number;
};

export type RolledUpFavoriteSong = FavoritedChart & {
  chartCount: number;
  latestFavoritedAt: number;
};

export function buildFavoriteGroupKey(
  song: Pick<FavoritedChart, "groupedProjectId" | "artist" | "title">
) {
  if (song.groupedProjectId != null) {
    return `group:${song.groupedProjectId}`;
  }

  const normalizedArtist = (song.artist ?? "").trim().toLowerCase();
  const normalizedTitle = song.title.trim().toLowerCase();
  return `song:${normalizedArtist}|${normalizedTitle}`;
}

export function rollupFavoriteCharts(
  charts: FavoritedChart[],
  blacklist: ChannelBlacklist
) {
  const groups = new Map<
    string,
    {
      representative: FavoritedChart;
      chartCount: number;
      latestFavoritedAt: number;
    }
  >();

  for (const chart of charts) {
    const key = buildFavoriteGroupKey(chart);
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        representative: chart,
        chartCount: 1,
        latestFavoritedAt: chart.favoritedAt,
      });
      continue;
    }

    current.chartCount += 1;
    current.latestFavoritedAt = Math.max(
      current.latestFavoritedAt,
      chart.favoritedAt
    );

    if (
      isBetterFavoriteRepresentative(chart, current.representative, blacklist)
    ) {
      current.representative = chart;
    }
  }

  return [...groups.values()]
    .map(({ representative, chartCount, latestFavoritedAt }) => ({
      ...representative,
      chartCount,
      latestFavoritedAt,
    }))
    .sort((left, right) => {
      if (right.latestFavoritedAt !== left.latestFavoritedAt) {
        return right.latestFavoritedAt - left.latestFavoritedAt;
      }

      const artistComparison = (left.artist ?? "").localeCompare(
        right.artist ?? ""
      );
      if (artistComparison !== 0) {
        return artistComparison;
      }

      return left.title.localeCompare(right.title);
    });
}

function isBetterFavoriteRepresentative(
  candidate: FavoritedChart,
  current: FavoritedChart,
  blacklist: ChannelBlacklist
) {
  const candidateBlacklistCount = getFavoriteBlacklistReasonCount(
    candidate,
    blacklist
  );
  const currentBlacklistCount = getFavoriteBlacklistReasonCount(
    current,
    blacklist
  );

  if (candidateBlacklistCount === 0 && currentBlacklistCount > 0) {
    return true;
  }

  if (candidateBlacklistCount > 0 && currentBlacklistCount === 0) {
    return false;
  }

  if (candidate.favoritedAt !== current.favoritedAt) {
    return candidate.favoritedAt > current.favoritedAt;
  }

  const candidateUpdatedAt = candidate.sourceUpdatedAt ?? 0;
  const currentUpdatedAt = current.sourceUpdatedAt ?? 0;
  if (candidateUpdatedAt !== currentUpdatedAt) {
    return candidateUpdatedAt > currentUpdatedAt;
  }

  const candidateSourceId = candidate.sourceId ?? 0;
  const currentSourceId = current.sourceId ?? 0;
  if (candidateSourceId !== currentSourceId) {
    return candidateSourceId > currentSourceId;
  }

  return candidate.id.localeCompare(current.id) > 0;
}

function getFavoriteBlacklistReasonCount(
  chart: FavoritedChart,
  blacklist: ChannelBlacklist
) {
  return getBlacklistReasonCodes(
    {
      songCatalogSourceId: chart.sourceId ?? null,
      songGroupedProjectId: chart.groupedProjectId ?? null,
      songArtistId: chart.artistId ?? null,
      songArtist: chart.artist ?? null,
      songCharterId: chart.authorId ?? null,
      songCreator: chart.creator ?? null,
    },
    blacklist
  ).length;
}
