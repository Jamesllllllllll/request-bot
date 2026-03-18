import { drizzle } from "drizzle-orm/d1";
import type { AppEnv } from "~/lib/env";
import * as schema from "./schema";

export function getDb(env: AppEnv) {
  return drizzle(env.DB, { schema });
}
