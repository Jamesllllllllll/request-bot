// Route: Returns cached search filter options such as years and tunings.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  getCachedSearchResult,
  getCatalogSearchFilterOptions,
  getCatalogSearchVersionToken,
  upsertCachedSearchResult,
} from "~/lib/db/repositories";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import type { TuningOption } from "~/lib/tunings";
import { json } from "~/lib/utils";

const filterOptionsCacheKey = "search-filter-options-v4";
const filterOptionsCacheTtlMs = 60 * 60 * 1000;

export const Route = createFileRoute("/api/search/filters")({
  server: {
    handlers: {
      GET: async () => {
        const runtimeEnv = env as AppEnv;
        await assertDatabaseSchemaCurrent(runtimeEnv);
        try {
          const versionToken = await getCatalogSearchVersionToken(runtimeEnv);
          const cached = await getCachedSearchResult<{
            years: number[];
            tunings: TuningOption[];
          }>(runtimeEnv, filterOptionsCacheKey, Date.now(), versionToken);

          if (cached) {
            return json(cached);
          }

          const options = await getCatalogSearchFilterOptions(runtimeEnv);
          await upsertCachedSearchResult(runtimeEnv, {
            cacheKey: filterOptionsCacheKey,
            responseJson: JSON.stringify(options),
            expiresAt: Date.now() + filterOptionsCacheTtlMs,
            versionToken,
          });

          return json(options);
        } catch (error) {
          console.error("Failed to serve cached search filter options", {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const options = await getCatalogSearchFilterOptions(runtimeEnv);
        return json(options);
      },
    },
  },
});
