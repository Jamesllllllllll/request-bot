import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "drizzle");
const outputPath = join(root, "src", "lib", "db", "latest-migration.generated.ts");
const checkMode = process.argv.includes("--check");

const latestMigration = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .at(-1);

if (!latestMigration) {
  throw new Error("No SQL migrations found in ./drizzle");
}

const nextContent = `export const LATEST_MIGRATION_NAME = ${JSON.stringify(latestMigration)};\n`;

if (checkMode) {
  let currentContent = null;

  try {
    currentContent = readFileSync(outputPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      currentContent = null;
    } else {
      throw error;
    }
  }

  if (currentContent !== nextContent) {
    console.error(
      `Latest migration file is out of date. Run npm run db:sync-latest-migration to update ${outputPath}.`
    );
    process.exit(1);
  }

  console.log(`Verified ${outputPath} -> ${latestMigration}`);
} else {
  writeFileSync(outputPath, nextContent);
  console.log(`Wrote ${outputPath} -> ${latestMigration}`);
}
