import { drizzle } from "drizzle-orm/d1";
import { getSentryD1Database } from "~/lib/sentry";
import * as schema from "./schema";

type DatabaseRuntimeEnv = Parameters<typeof getSentryD1Database>[0];

export function getDb(env: DatabaseRuntimeEnv) {
  return drizzle(getSentryD1Database(env), { schema });
}
