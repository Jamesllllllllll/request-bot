import { drizzle } from "drizzle-orm/d1";
import type { AppEnv } from "~/lib/env";
import { getSentryD1Database } from "~/lib/sentry";
import * as schema from "./schema";

export function getDb(env: AppEnv) {
  return drizzle(getSentryD1Database(env), { schema });
}
