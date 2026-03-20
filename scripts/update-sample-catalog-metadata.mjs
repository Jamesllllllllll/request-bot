import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sampleCatalogPath = path.join(repoRoot, "data", "sample-catalog.sql");
const metadataPath = path.join(repoRoot, "data", "sample-catalog-metadata.json");

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

const newColumns = [
  "artist_id",
  "author_id",
  "grouped_project_id",
  "tags_json",
  "genres_json",
  "subgenres_json",
  "lead_tuning_id",
  "rhythm_tuning_id",
  "bass_tuning_id",
  "alt_lead_tuning_id",
  "alt_rhythm_tuning_id",
  "alt_bass_tuning_id",
  "bonus_lead_tuning_id",
  "bonus_rhythm_tuning_id",
  "bonus_bass_tuning_id"
];

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

function toSqlLiteral(value) {
  if (value == null) {
    return "NULL";
  }

  if (typeof value === "number") {
    return String(value);
  }

  const json = JSON.stringify(value);
  return `'${json.replace(/'/g, "''")}'`;
}

function normalizeEntry(entry) {
  return {
    artist_id: entry.artistId ?? null,
    author_id: entry.authorId ?? null,
    grouped_project_id: entry.groupedProjectId ?? null,
    tags_json: entry.tags ?? [],
    genres_json: entry.genres ?? [],
    subgenres_json: entry.subgenres ?? [],
    lead_tuning_id: entry.leadTuningId ?? null,
    rhythm_tuning_id: entry.rhythmTuningId ?? null,
    bass_tuning_id: entry.bassTuningId ?? null,
    alt_lead_tuning_id: entry.altLeadTuningId ?? null,
    alt_rhythm_tuning_id: entry.altRhythmTuningId ?? null,
    alt_bass_tuning_id: entry.altBassTuningId ?? null,
    bonus_lead_tuning_id: entry.bonusLeadTuningId ?? null,
    bonus_rhythm_tuning_id: entry.bonusRhythmTuningId ?? null,
    bonus_bass_tuning_id: entry.bonusBassTuningId ?? null
  };
}

const input = fs.readFileSync(sampleCatalogPath, "utf8");
const output = input.replace(
  /INSERT INTO catalog_songs \(([^)]+)\) VALUES \((.+?)\);/g,
  (statement, columnsText, valuesText) => {
    const columns = splitSqlList(columnsText);
    const values = splitSqlList(valuesText);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    const sourceSongId = row.source_song_id;

    if (!sourceSongId || !(sourceSongId in metadata)) {
      return statement;
    }

    const entry = normalizeEntry(metadata[sourceSongId]);
    const outputColumns = [...columns];

    for (const column of newColumns) {
      if (!outputColumns.includes(column)) {
        outputColumns.push(column);
      }
      row[column] = toSqlLiteral(entry[column]);
    }

    const outputValues = outputColumns.map((column) => row[column] ?? "NULL");
    return `INSERT INTO catalog_songs (${outputColumns.join(", ")}) VALUES (${outputValues.join(", ")});`;
  }
);

fs.writeFileSync(sampleCatalogPath, output);
console.log(`Updated ${path.relative(repoRoot, sampleCatalogPath)}`);
