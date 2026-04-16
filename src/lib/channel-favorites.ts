import {
  type ChannelBlacklist,
  getBlacklistReasonCodes,
} from "~/lib/channel-blacklist";
import { buildSongGroups } from "~/lib/song-grouping";
import type { SongSearchResult } from "~/lib/song-search/types";

export type FavoritedChart = SongSearchResult & {
  favoritedAt: number;
};

export type RolledUpFavoriteSong = FavoritedChart & {
  groupKey: string;
  groupingSource: "groupedProjectId" | "fallback" | "both";
  chartCount: number;
  latestFavoritedAt: number;
};

export function rollupFavoriteCharts(
  charts: FavoritedChart[],
  blacklist: ChannelBlacklist
) {
  const chartsById = new Map(charts.map((chart) => [chart.id, chart]));
  const canUseStoredGroups = charts.every(
    (chart) =>
      typeof chart.groupKey === "string" &&
      chart.groupKey.length > 0 &&
      (chart.groupingSource === "groupedProjectId" ||
        chart.groupingSource === "fallback" ||
        chart.groupingSource === "both")
  );
  const chartGroups = canUseStoredGroups
    ? (() => {
        const groupsByKey = new Map<string, FavoritedChart[]>();
        for (const chart of charts) {
          const groupKey = chart.groupKey;
          if (!groupKey) {
            continue;
          }

          const current = groupsByKey.get(groupKey) ?? [];
          current.push(chart);
          groupsByKey.set(groupKey, current);
        }

        return [...groupsByKey.entries()]
          .map(([groupKey, groupCharts]) => {
            const firstChart = groupCharts[0];
            if (
              !firstChart ||
              (firstChart.groupingSource !== "groupedProjectId" &&
                firstChart.groupingSource !== "fallback" &&
                firstChart.groupingSource !== "both")
            ) {
              return null;
            }

            return {
              groupKey,
              groupingSource: firstChart.groupingSource,
              songs: groupCharts,
            };
          })
          .filter((group): group is NonNullable<typeof group> =>
            Boolean(group)
          );
      })()
    : buildSongGroups(charts);

  return chartGroups
    .map((group) => {
      const groupCharts = group.songs
        .map((song) => chartsById.get(song.id))
        .filter((chart): chart is FavoritedChart => Boolean(chart));

      if (groupCharts.length === 0) {
        return null;
      }

      const representative = groupCharts.reduce((best, candidate) =>
        isBetterFavoriteRepresentative(candidate, best, blacklist)
          ? candidate
          : best
      );

      return {
        ...representative,
        groupKey: group.groupKey,
        groupingSource: group.groupingSource,
        chartCount: groupCharts.length,
        latestFavoritedAt: Math.max(
          ...groupCharts.map((chart) => chart.favoritedAt)
        ),
      } satisfies RolledUpFavoriteSong;
    })
    .filter((group): group is RolledUpFavoriteSong => Boolean(group))
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
