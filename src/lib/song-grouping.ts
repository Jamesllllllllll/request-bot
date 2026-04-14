import { decodeHtmlEntities } from "~/lib/utils";

export type SongGroupingSource = "groupedProjectId" | "fallback" | "both";

export type GroupableSong = {
  id: string;
  groupedProjectId?: number | null;
  title: string;
  artist?: string | null;
};

export type SongGroup<TSong extends GroupableSong = GroupableSong> = {
  groupKey: string;
  groupingSource: SongGroupingSource;
  songs: TSong[];
  groupedProjectIds: number[];
  fallbackKeys: string[];
};

function normalizeSongGroupingText(value?: string | null) {
  return decodeHtmlEntities(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeArtistNameForSongGrouping(artistName?: string | null) {
  const normalized = normalizeSongGroupingText(artistName);
  if (!normalized) {
    return "";
  }

  return normalized.replace(/^the\s+/, "");
}

export function normalizeTitleForSongGrouping(title?: string | null) {
  return normalizeSongGroupingText(title);
}

export function getSongFallbackGroupKey(
  song: Pick<GroupableSong, "artist" | "title">
) {
  const titleKey = normalizeTitleForSongGrouping(song.title);
  if (!titleKey) {
    return "";
  }

  const artistKey = normalizeArtistNameForSongGrouping(song.artist);
  return `${artistKey}|${titleKey}`;
}

export function getSongPrimaryGroupKey(song: GroupableSong) {
  if (
    typeof song.groupedProjectId === "number" &&
    Number.isInteger(song.groupedProjectId) &&
    song.groupedProjectId > 0
  ) {
    return `project:${song.groupedProjectId}`;
  }

  return `fallback:${getSongFallbackGroupKey(song)}`;
}

function buildStableSongGroupKey(input: {
  groupingSource: SongGroupingSource;
  groupedProjectIds: number[];
  fallbackKeys: string[];
}) {
  if (input.groupingSource === "both") {
    return `both:${input.groupedProjectIds.join("+")}:${input.fallbackKeys.join("+")}`;
  }

  if (input.groupingSource === "groupedProjectId") {
    return `project:${input.groupedProjectIds.join("+")}`;
  }

  return `fallback:${input.fallbackKeys.join("+")}`;
}

function findRoot(parents: Map<string, string>, id: string): string {
  let root = parents.get(id) ?? id;

  while (parents.get(root) !== root) {
    root = parents.get(root) ?? root;
  }

  let current = id;
  while (parents.get(current) !== root) {
    const next = parents.get(current) ?? root;
    parents.set(current, root);
    current = next;
  }

  return root;
}

function unionRoots(
  parents: Map<string, string>,
  leftId: string,
  rightId: string
) {
  const leftRoot = findRoot(parents, leftId);
  const rightRoot = findRoot(parents, rightId);

  if (leftRoot === rightRoot) {
    return;
  }

  if (leftRoot.localeCompare(rightRoot) <= 0) {
    parents.set(rightRoot, leftRoot);
    return;
  }

  parents.set(leftRoot, rightRoot);
}

export function buildSongGroups<TSong extends GroupableSong>(songs: TSong[]) {
  const uniqueSongs = [
    ...new Map(songs.map((song) => [song.id, song])).values(),
  ];
  const parents = new Map<string, string>();
  const projectBuckets = new Map<number, string[]>();
  const fallbackBuckets = new Map<string, string[]>();

  for (const song of uniqueSongs) {
    parents.set(song.id, song.id);

    if (
      typeof song.groupedProjectId === "number" &&
      Number.isInteger(song.groupedProjectId) &&
      song.groupedProjectId > 0
    ) {
      const existingProjectBucket =
        projectBuckets.get(song.groupedProjectId) ?? [];
      existingProjectBucket.push(song.id);
      projectBuckets.set(song.groupedProjectId, existingProjectBucket);
    }

    const fallbackKey = getSongFallbackGroupKey(song);
    if (fallbackKey) {
      const existingFallbackBucket = fallbackBuckets.get(fallbackKey) ?? [];
      existingFallbackBucket.push(song.id);
      fallbackBuckets.set(fallbackKey, existingFallbackBucket);
    }
  }

  for (const bucket of projectBuckets.values()) {
    const [firstId, ...restIds] = bucket;
    if (!firstId) {
      continue;
    }

    for (const songId of restIds) {
      unionRoots(parents, firstId, songId);
    }
  }

  for (const bucket of fallbackBuckets.values()) {
    const [firstId, ...restIds] = bucket;
    if (!firstId) {
      continue;
    }

    for (const songId of restIds) {
      unionRoots(parents, firstId, songId);
    }
  }

  const groupedSongs = new Map<string, TSong[]>();
  for (const song of uniqueSongs) {
    const rootId = findRoot(parents, song.id);
    const current = groupedSongs.get(rootId) ?? [];
    current.push(song);
    groupedSongs.set(rootId, current);
  }

  return [...groupedSongs.values()].map((groupSongs) => {
    const groupedProjectIds = [
      ...new Set(
        groupSongs
          .map((song) => song.groupedProjectId)
          .filter(
            (groupedProjectId): groupedProjectId is number =>
              typeof groupedProjectId === "number" &&
              Number.isInteger(groupedProjectId) &&
              groupedProjectId > 0
          )
      ),
    ].sort((left, right) => left - right);
    const fallbackKeys = [
      ...new Set(
        groupSongs.map((song) => getSongFallbackGroupKey(song)).filter(Boolean)
      ),
    ].sort();
    const hasGroupedProjectIds = groupedProjectIds.length > 0;
    const hasFallbackOverlap = fallbackKeys.some(
      (fallbackKey) => (fallbackBuckets.get(fallbackKey)?.length ?? 0) > 1
    );
    const groupingSource: SongGroupingSource = hasGroupedProjectIds
      ? hasFallbackOverlap
        ? "both"
        : "groupedProjectId"
      : "fallback";

    return {
      groupKey: buildStableSongGroupKey({
        groupingSource,
        groupedProjectIds,
        fallbackKeys,
      }),
      groupingSource,
      songs: groupSongs,
      groupedProjectIds,
      fallbackKeys,
    } satisfies SongGroup<TSong>;
  });
}

export function getSongGroupForSongId<TSong extends GroupableSong>(
  groups: SongGroup<TSong>[],
  songId: string
) {
  return (
    groups.find((group) => group.songs.some((song) => song.id === songId)) ??
    null
  );
}

export function summarizeSongGroup<TSong extends GroupableSong>(
  songs: TSong[]
) {
  return buildSongGroups(songs)[0] ?? null;
}
