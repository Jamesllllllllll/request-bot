import type { AppEnv, BackendEnv } from "~/lib/env";
import { getSentryD1Database } from "~/lib/sentry";
import { LATEST_MIGRATION_NAME } from "./latest-migration.generated";

const SCHEMA_CHECK_TTL_MS = 30_000;
const COMPATIBLE_MIGRATION_NAMES = new Set([LATEST_MIGRATION_NAME]);

type DatabaseEnv =
  | Pick<
      AppEnv,
      | "DB"
      | "CF_VERSION_METADATA"
      | "SENTRY_DSN"
      | "SENTRY_ENVIRONMENT"
      | "SENTRY_RELEASE"
      | "SENTRY_TRACES_SAMPLE_RATE"
    >
  | Pick<
      BackendEnv,
      | "DB"
      | "CF_VERSION_METADATA"
      | "SENTRY_DSN"
      | "SENTRY_ENVIRONMENT"
      | "SENTRY_RELEASE"
      | "SENTRY_TRACES_SAMPLE_RATE"
    >;

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
  const db = getSentryD1Database(env);

  try {
    const result = (await db
      .prepare("select name from d1_migrations order by id desc limit 1")
      .first()) as { name?: string } | null;
    latestMigrationName = result?.name ?? null;
  } catch (error) {
    throw new DatabaseSchemaOutOfDateError(
      getSchemaMismatchMessage(
        "Unable to read the migration table.",
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  if (
    !latestMigrationName ||
    !COMPATIBLE_MIGRATION_NAMES.has(latestMigrationName)
  ) {
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
  return `The database schema is out of date. Run \`npm run db:migrate\`, then restart the dev server. ${summary}${suffix}`.trim();
}
