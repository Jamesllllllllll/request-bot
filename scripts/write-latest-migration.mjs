import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "drizzle");
const outputPath = join(root, "src", "lib", "db", "latest-migration.generated.ts");

const latestMigration = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .at(-1);

if (!latestMigration) {
  throw new Error("No SQL migrations found in ./drizzle");
}

writeFileSync(
  outputPath,
  `export const LATEST_MIGRATION_NAME = ${JSON.stringify(latestMigration)};\n`
);

console.log(`Wrote ${outputPath} -> ${latestMigration}`);
