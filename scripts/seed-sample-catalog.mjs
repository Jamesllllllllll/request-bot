import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sampleCatalogPath = path.join(repoRoot, "data", "sample-catalog.sql");
const tempSqlPath = path.join(repoRoot, ".generated", "tmp-sample-seed.sql");
const mode = process.argv[2];

if (mode !== "local" && mode !== "remote") {
  console.error('Usage: node scripts/seed-sample-catalog.mjs <local|remote>');
  process.exit(1);
}

const sql = fs.readFileSync(sampleCatalogPath, "utf8");
const rawStatements = sql
  .split(/;\r?\n/g)
  .map((statement) => statement.trim())
  .filter(Boolean)
  .map((statement) =>
    statement
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter(Boolean);

const baseArgs = ["npx", "wrangler", "d1", "execute", "request_bot"];

if (mode === "local") {
  baseArgs.push("--local");
} else {
  baseArgs.push(
    "--remote",
    "--config",
    ".generated/wrangler.production.jsonc"
  );
}

function splitSqlList(value) {
  const parts = [];
  let current = "";
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const nextChar = value[index + 1];

    if (char === "'") {
      current += char;
      if (inString && nextChar === "'") {
        current += nextChar;
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (char === "," && !inString) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function toInsertAndUpdateStatements(statement) {
  const match = statement.match(
    /^INSERT INTO catalog_songs \(([^)]+)\) VALUES \(([\s\S]+)\)$/i
  );

  if (!match) {
    return [statement];
  }

  const [, columnsText, valuesText] = match;
  const columns = splitSqlList(columnsText);
  const values = splitSqlList(valuesText);
  const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  const updateColumns = columns.filter(
    (column) =>
      !["id", "source", "source_song_id", "created_at", "first_seen_at"].includes(
        column
      )
  );

  const assignments = updateColumns
    .map((column) => `${column} = ${row[column] ?? "NULL"}`)
    .join(", ");

  return [
    statement.replace(/^INSERT INTO/i, "INSERT OR IGNORE INTO"),
    `UPDATE catalog_songs SET ${assignments} WHERE source = ${row.source} AND source_song_id = ${row.source_song_id}`,
  ];
}

const statements = rawStatements
  .filter(
    (statement) =>
      /^DELETE FROM search_(cache|rate_limits)$/i.test(statement) ||
      /^INSERT INTO catalog_songs /i.test(statement)
  )
  .flatMap((statement) =>
    /^INSERT INTO catalog_songs /i.test(statement)
      ? toInsertAndUpdateStatements(statement)
      : [statement]
  );

const preStatements = [
  "DROP TRIGGER IF EXISTS `catalog_song_fts_update`",
];

const postStatements = [
  "INSERT INTO catalog_song_fts(catalog_song_fts) VALUES('rebuild')",
  `CREATE TRIGGER \`catalog_song_fts_update\` AFTER UPDATE ON \`catalog_songs\` BEGIN
  INSERT INTO catalog_song_fts(catalog_song_fts, rowid, song_id, title, artist_name, album_name, creator_name, genre_name, subgenre_name, tuning_summary, parts_summary, artists_ft)
  VALUES('delete', old.rowid, old.id, old.title, old.artist_name, coalesce(old.album_name, ''), coalesce(old.creator_name, ''), coalesce(old.genre_name, ''), coalesce(old.subgenre_name, ''), coalesce(old.tuning_summary, ''), coalesce(old.parts_json, '[]'), coalesce(old.artists_ft_json, '[]'));
  INSERT INTO catalog_song_fts (
    rowid,
    song_id,
    title,
    artist_name,
    album_name,
    creator_name,
    genre_name,
    subgenre_name,
    tuning_summary,
    parts_summary,
    artists_ft
  ) VALUES (
    new.rowid,
    new.id,
    new.title,
    new.artist_name,
    coalesce(new.album_name, ''),
    coalesce(new.creator_name, ''),
    coalesce(new.genre_name, ''),
    coalesce(new.subgenre_name, ''),
    coalesce(new.tuning_summary, ''),
    coalesce(new.parts_json, '[]'),
    coalesce(new.artists_ft_json, '[]')
  );
END`,
];

for (const statement of [...preStatements, ...statements, ...postStatements]) {
  fs.mkdirSync(path.dirname(tempSqlPath), { recursive: true });
  fs.writeFileSync(tempSqlPath, `${statement};\n`);
  const command = [...baseArgs, "--file", JSON.stringify(tempSqlPath)].join(" ");
  execSync(command, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

console.log(
  `Seeded sample catalog with ${statements.length} statement${statements.length === 1 ? "" : "s"}.`
);
