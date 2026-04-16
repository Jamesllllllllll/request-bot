import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2];
const FETCH_BATCH_SIZE = 2000;
const UPDATE_BATCH_SIZE = 500;
const tempUpdateSqlPath = path.join(
  repoRoot,
  ".generated",
  "tmp-refresh-catalog-canonical-groups-batch.sql"
);
if (mode !== "local" && mode !== "remote") {
  console.error(
    "Usage: node scripts/refresh-catalog-canonical-groups.mjs <local|remote>"
  );
  process.exit(1);
}

function decodeHtmlEntities(input) {
  if (!input) {
    return input ?? "";
  }

  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }

    return namedEntities[normalized] ?? match;
  });
}

function normalizeSongGroupingText(value) {
  return decodeHtmlEntities(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeArtistNameForSongGrouping(artistName) {
  const normalized = normalizeSongGroupingText(artistName);
  return normalized ? normalized.replace(/^the\s+/, "") : "";
}

function normalizeTitleForSongGrouping(title) {
  return normalizeSongGroupingText(title);
}

function getSongFallbackGroupKey(song) {
  const titleKey = normalizeTitleForSongGrouping(song.title);
  if (!titleKey) {
    return "";
  }

  return `${normalizeArtistNameForSongGrouping(song.artistName)}|${titleKey}`;
}

function findRoot(parents, id) {
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

function unionRoots(parents, leftId, rightId) {
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

function buildCanonicalAssignments(songs) {
  const uniqueSongs = [
    ...new Map(songs.map((song) => [song.id, song])).values(),
  ];
  const parents = new Map();
  const projectBuckets = new Map();
  const fallbackBuckets = new Map();

  for (const song of uniqueSongs) {
    parents.set(song.id, song.id);

    if (
      typeof song.groupedProjectId === "number" &&
      Number.isInteger(song.groupedProjectId) &&
      song.groupedProjectId > 0
    ) {
      const current = projectBuckets.get(song.groupedProjectId) ?? [];
      current.push(song.id);
      projectBuckets.set(song.groupedProjectId, current);
    }

    const fallbackKey = getSongFallbackGroupKey(song);
    if (fallbackKey) {
      const current = fallbackBuckets.get(fallbackKey) ?? [];
      current.push(song.id);
      fallbackBuckets.set(fallbackKey, current);
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

  const groupsByRoot = new Map();
  for (const song of uniqueSongs) {
    const rootId = findRoot(parents, song.id);
    const current = groupsByRoot.get(rootId) ?? [];
    current.push(song);
    groupsByRoot.set(rootId, current);
  }

  const assignments = [];

  for (const groupSongs of groupsByRoot.values()) {
    const groupedProjectIds = [
      ...new Set(
        groupSongs
          .map((song) => song.groupedProjectId)
          .filter(
            (groupedProjectId) =>
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
    const groupingSource = hasGroupedProjectIds
      ? hasFallbackOverlap
        ? "both"
        : "groupedProjectId"
      : "fallback";
    const representativeSongId = [
      ...groupSongs.map((song) => song.id),
    ].sort()[0];
    const canonicalGroupKey = `${groupingSource}:${representativeSongId ?? "unknown"}`;

    for (const song of groupSongs) {
      assignments.push({
        id: song.id,
        canonicalGroupKey,
        canonicalGroupingSource: groupingSource,
      });
    }
  }

  return assignments;
}

function escapeSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runWranglerD1Json(command) {
  const normalizedCommand = command.replace(/\s+/g, " ").trim();
  const stdout = execSync(
    [
      "npx",
      "wrangler",
      "d1",
      "execute",
      "request_bot",
      mode === "local" ? "--local" : "--remote",
      ...(mode === "remote"
        ? ["--config", ".generated/wrangler.production.jsonc"]
        : []),
      "--yes",
      "--json",
      "--command",
      JSON.stringify(normalizedCommand),
    ].join(" "),
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  );

  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

function runWranglerD1JsonFile(sql) {
  fs.mkdirSync(path.dirname(tempUpdateSqlPath), { recursive: true });
  fs.writeFileSync(tempUpdateSqlPath, `${sql.trim()};\n`);

  const stdout = execSync(
    [
      "npx",
      "wrangler",
      "d1",
      "execute",
      "request_bot",
      mode === "local" ? "--local" : "--remote",
      ...(mode === "remote"
        ? ["--config", ".generated/wrangler.production.jsonc"]
        : []),
      "--yes",
      "--json",
      "--file",
      JSON.stringify(tempUpdateSqlPath),
    ].join(" "),
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  );

  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

function fetchCatalogSongsBatch(offset) {
  const result = runWranglerD1Json(`
    SELECT
      id,
      grouped_project_id AS groupedProjectId,
      canonical_group_key AS canonicalGroupKey,
      canonical_grouping_source AS canonicalGroupingSource,
      title,
      artist_name AS artistName
    FROM catalog_songs
    ORDER BY id ASC
    LIMIT ${FETCH_BATCH_SIZE}
    OFFSET ${offset}
  `);

  return result.results ?? [];
}

function runUpdateBatch(assignments) {
  if (assignments.length === 0) {
    return;
  }

  const statements = assignments.map(
    (assignment) => `
      UPDATE catalog_songs
      SET
        canonical_group_key = ${escapeSqlString(assignment.canonicalGroupKey)},
        canonical_grouping_source = ${escapeSqlString(
          assignment.canonicalGroupingSource
        )}
      WHERE id = ${escapeSqlString(assignment.id)}
    `
  );

  runWranglerD1JsonFile(`
    BEGIN TRANSACTION;
    ${statements.join(";\n")}
    ;
    COMMIT;
  `);
}

console.log(
  `Refreshing catalog canonical groups (${mode}) in batches. This can still take a few minutes on a full catalog.`
);

if (mode === "local") {
  console.log("Applying any pending local D1 migrations first...");
  execFileSync(process.execPath, ["scripts/run-db-migrate.mjs", "--local"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

const totalResult = runWranglerD1Json(
  "SELECT COUNT(*) AS count FROM catalog_songs"
);
const totalSongs = Number(totalResult.results?.[0]?.count ?? 0);
console.log(`Catalog contains ${totalSongs.toLocaleString()} songs.`);

const songs = [];
for (let offset = 0; offset < totalSongs; offset += FETCH_BATCH_SIZE) {
  const batch = fetchCatalogSongsBatch(offset);
  songs.push(...batch);
  console.log(
    `Fetched ${Math.min(offset + batch.length, totalSongs).toLocaleString()} / ${totalSongs.toLocaleString()} songs...`
  );
}

console.log("Building canonical groups in memory...");
const assignments = buildCanonicalAssignments(songs);
if (assignments.length !== songs.length) {
  throw new Error(
    `Expected ${songs.length} assignments but built ${assignments.length}.`
  );
}

const existingById = new Map(
  songs.map((song) => [
    song.id,
    {
      canonicalGroupKey: song.canonicalGroupKey ?? null,
      canonicalGroupingSource: song.canonicalGroupingSource ?? null,
    },
  ])
);
const changedAssignments = assignments.filter((assignment) => {
  const existing = existingById.get(assignment.id);
  return (
    existing?.canonicalGroupKey !== assignment.canonicalGroupKey ||
    existing?.canonicalGroupingSource !== assignment.canonicalGroupingSource
  );
});

console.log(
  `Built ${new Set(assignments.map((assignment) => assignment.canonicalGroupKey)).size.toLocaleString()} canonical groups.`
);

if (changedAssignments.length === 0) {
  console.log("No canonical group changes were needed.");
  console.log(`Refreshed catalog canonical groups (${mode}).`);
  process.exit(0);
}

console.log(
  `Updating ${changedAssignments.length.toLocaleString()} songs whose canonical grouping changed...`
);

for (
  let index = 0;
  index < changedAssignments.length;
  index += UPDATE_BATCH_SIZE
) {
  const batch = changedAssignments.slice(index, index + UPDATE_BATCH_SIZE);
  runUpdateBatch(batch);
  console.log(
    `Updated ${Math.min(index + batch.length, changedAssignments.length).toLocaleString()} / ${changedAssignments.length.toLocaleString()} songs...`
  );
}

console.log(`Refreshed catalog canonical groups (${mode}).`);
