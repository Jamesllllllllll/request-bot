// Route: Returns song search results for the public search experience.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  consumeSearchRateLimit,
  getCachedSearchResult,
  searchCatalogSongs as searchCatalogSongsInDb,
  upsertCachedSearchResult,
} from "~/lib/db/repositories";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { getErrorMessage, json, sha256 } from "~/lib/utils";
import { searchInputSchema } from "~/lib/validation";

const searchCacheTtlMs = 5 * 60 * 1000;

function normalizeSearchCacheInput(
  input: ReturnType<typeof searchInputSchema.parse>
) {
  return {
    query: input.query ?? "",
    field: input.field,
    title: input.title ?? "",
    artist: input.artist ?? "",
    album: input.album ?? "",
    creator: input.creator ?? "",
    tuning: input.tuning ?? [],
    parts: input.parts ?? [],
    year: input.year ?? [],
    page: input.page,
    pageSize: input.pageSize,
    sortBy: "updated",
    sortDirection: "desc",
  };
}

async function getSearchIdentity(request: Request, runtimeEnv: AppEnv) {
  const sessionUserId = await getSessionUserId(request, runtimeEnv);
  if (sessionUserId) {
    return `user:${sessionUserId}`;
  }

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const hashed = await sha256(
    `${ip}:${userAgent}:${runtimeEnv.SESSION_SECRET}`
  );
  return `anon:${hashed}`;
}

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        await assertDatabaseSchemaCurrent(runtimeEnv);
        const url = new URL(request.url);

        const payload = {
          query: url.searchParams.get("query") ?? undefined,
          field: url.searchParams.get("field") ?? undefined,
          title: url.searchParams.get("title") ?? undefined,
          artist: url.searchParams.get("artist") ?? undefined,
          album: url.searchParams.get("album") ?? undefined,
          creator: url.searchParams.get("creator") ?? undefined,
          tuning: (() => {
            const values = url.searchParams
              .getAll("tuning")
              .map((value) => value.trim())
              .filter(Boolean);
            return values.length > 0 ? values : undefined;
          })(),
          parts: (() => {
            const values = url.searchParams
              .getAll("parts")
              .map((value) => value.trim())
              .filter(Boolean);
            return values.length > 0 ? values : undefined;
          })(),
          year: (() => {
            const values = url.searchParams
              .getAll("year")
              .map((value) => value.trim())
              .filter(Boolean);
            return values.length > 0 ? values : undefined;
          })(),
          page: url.searchParams.get("page") ?? undefined,
          pageSize: url.searchParams.get("pageSize") ?? undefined,
          sortBy: url.searchParams.get("sortBy") ?? undefined,
          sortDirection: url.searchParams.get("sortDirection") ?? undefined,
        };

        const parsed = searchInputSchema.safeParse(payload);
        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid search parameters.";
          return json({ error: "invalid_search", message }, { status: 400 });
        }

        const normalizedInput = {
          ...parsed.data,
          sortBy: "updated" as const,
          sortDirection: "desc" as const,
        };

        const identity = await getSearchIdentity(request, runtimeEnv);
        const rateLimit = await consumeSearchRateLimit(runtimeEnv, {
          rateLimitKey: identity,
        });

        if (!rateLimit.allowed) {
          return json(
            {
              error: "rate_limited",
              message:
                rateLimit.message ??
                "Please wait before performing another search.",
            },
            { status: 429 }
          );
        }

        const cacheInput = normalizeSearchCacheInput(normalizedInput);
        const cacheKey = await sha256(JSON.stringify(cacheInput));
        const cached = await getCachedSearchResult(runtimeEnv, cacheKey);

        if (cached) {
          return json(cached, {
            headers: {
              "x-search-cache": "hit",
            },
          });
        }

        try {
          const results = await searchCatalogSongsInDb(
            runtimeEnv,
            normalizedInput
          );

          await upsertCachedSearchResult(runtimeEnv, {
            cacheKey,
            responseJson: JSON.stringify(results),
            expiresAt: Date.now() + searchCacheTtlMs,
          });

          return json(results, {
            headers: {
              "x-search-cache": "miss",
            },
          });
        } catch (error) {
          return json(
            {
              error: "search_failed",
              message: getErrorMessage(
                error,
                "Search failed. Try again in a moment."
              ),
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
