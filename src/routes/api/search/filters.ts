// Route: Returns cached search filter options such as years and tunings.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  getCachedSearchResult,
  getCatalogSearchFilterOptions,
  upsertCachedSearchResult,
} from "~/lib/db/repositories";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

const filterOptionsCacheKey = "search-filter-options-v1";
const filterOptionsCacheTtlMs = 60 * 60 * 1000;

export const Route = createFileRoute("/api/search/filters")({
  server: {
    handlers: {
      GET: async () => {
        const runtimeEnv = env as AppEnv;
        await assertDatabaseSchemaCurrent(runtimeEnv);
        const cached = await getCachedSearchResult<{
          years: number[];
          tunings: string[];
        }>(runtimeEnv, filterOptionsCacheKey);

        if (cached) {
          return json(cached);
        }

        const options = await getCatalogSearchFilterOptions(runtimeEnv);
        await upsertCachedSearchResult(runtimeEnv, {
          cacheKey: filterOptionsCacheKey,
          responseJson: JSON.stringify(options),
          expiresAt: Date.now() + filterOptionsCacheTtlMs,
        });

        return json(options);
      },
    },
  },
});
