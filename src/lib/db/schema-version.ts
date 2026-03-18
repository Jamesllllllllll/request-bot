import type { AppEnv, BackendEnv } from "~/lib/env";
import { LATEST_MIGRATION_NAME } from "./latest-migration.generated";

const SCHEMA_CHECK_TTL_MS = 30_000;

type DatabaseEnv = Pick<AppEnv, "DB"> | Pick<BackendEnv, "DB">;

let cachedSchemaCheck:
  | {
      checkedAt: number;
      migrationName: string;
    }
  | undefined;

export class DatabaseSchemaOutOfDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseSchemaOutOfDateError";
  }
}

export async function assertDatabaseSchemaCurrent(env: DatabaseEnv) {
  const now = Date.now();
  if (
    cachedSchemaCheck &&
    cachedSchemaCheck.migrationName === LATEST_MIGRATION_NAME &&
    now - cachedSchemaCheck.checkedAt < SCHEMA_CHECK_TTL_MS
  ) {
    return;
  }

  let latestMigrationName: string | null = null;

  try {
    const result = await env.DB.prepare(
      "select name from d1_migrations order by id desc limit 1"
    ).first<{ name: string }>();
    latestMigrationName = result?.name ?? null;
  } catch (error) {
    throw new DatabaseSchemaOutOfDateError(
      getSchemaMismatchMessage(
        "Unable to read the migration table.",
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  if (latestMigrationName !== LATEST_MIGRATION_NAME) {
    throw new DatabaseSchemaOutOfDateError(
      getSchemaMismatchMessage(
        `Expected ${LATEST_MIGRATION_NAME} but found ${latestMigrationName ?? "no applied migrations"}.`
      )
    );
  }

  cachedSchemaCheck = {
    checkedAt: now,
    migrationName: latestMigrationName,
  };
}

function getSchemaMismatchMessage(summary: string, detail?: string) {
  const suffix = detail ? ` ${detail}` : "";
  return `Your local database is out of date. Run \`npm run db:migrate\`, then restart the dev server. ${summary}${suffix}`.trim();
}
