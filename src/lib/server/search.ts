import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestIP } from "@tanstack/start-server-core";
import type { z } from "zod";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  consumeSearchRateLimit,
  getCachedSearchResult,
  searchCatalogSongs as searchCatalogSongsInDb,
  upsertCachedSearchResult,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { sha256 } from "~/lib/utils";
import { searchInputSchema } from "~/lib/validation";

const searchCacheTtlMs = 5 * 60 * 1000;

export type SearchInput = z.input<typeof searchInputSchema>;

export type SearchResponse = {
  results: Array<{
    id: string;
    title: string;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: string;
    parts?: string[];
    durationText?: string;
    year?: number;
    downloads?: number;
    sourceId?: number;
    source: string;
    sourceUrl?: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasNextPage?: boolean;
};

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

async function getSearchIdentity(runtimeEnv: AppEnv) {
  const request = getRequest();
  const sessionUserId = await getSessionUserId(request, runtimeEnv);
  if (sessionUserId) {
    return `user:${sessionUserId}`;
  }

  const ip =
    getRequestIP() ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const hashed = await sha256(
    `${ip}:${userAgent}:${runtimeEnv.SESSION_SECRET}`
  );
  return `anon:${hashed}`;
}

function normalizeSearchResponse(result: {
  results?: SearchResponse["results"];
  total?: number;
  page?: number;
  pageSize?: number;
  hasNextPage?: boolean;
}): SearchResponse {
  return {
    results: result.results ?? [],
    total: result.total ?? result.results?.length ?? 0,
    page: result.page ?? 1,
    pageSize: result.pageSize ?? 25,
    hasNextPage: result.hasNextPage ?? false,
  };
}

export const searchCatalogSongs = createServerFn({ method: "GET" })
  .inputValidator(searchInputSchema)
  .handler(async ({ data }) => {
    const runtimeEnv = env as AppEnv;
    const normalizedInput = {
      ...data,
      sortBy: "updated" as const,
      sortDirection: "desc" as const,
    };
    const identity = await getSearchIdentity(runtimeEnv);
    const rateLimit = await consumeSearchRateLimit(runtimeEnv, {
      rateLimitKey: identity,
    });

    if (!rateLimit.allowed) {
      throw new Error(
        rateLimit.message ?? "Please wait before performing another search."
      );
    }

    const cacheInput = normalizeSearchCacheInput(normalizedInput);
    const cacheKey = await sha256(JSON.stringify(cacheInput));
    const cached = await getCachedSearchResult<SearchResponse>(
      runtimeEnv,
      cacheKey
    );

    if (cached) {
      return normalizeSearchResponse(cached);
    }

    const results = normalizeSearchResponse(
      await searchCatalogSongsInDb(runtimeEnv, normalizedInput)
    );
    await upsertCachedSearchResult(runtimeEnv, {
      cacheKey,
      responseJson: JSON.stringify(results),
      expiresAt: Date.now() + searchCacheTtlMs,
    });

    return results;
  });
