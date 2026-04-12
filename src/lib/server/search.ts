import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import type { z } from "zod";
import { getSessionUserId } from "~/lib/auth/session.server";
import { consumeSearchRateLimit } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { performCachedCatalogSearch } from "~/lib/server/cached-catalog-search";
import { sha256 } from "~/lib/utils";
import { searchInputSchema } from "~/lib/validation";

export type SearchInput = z.input<typeof searchInputSchema>;

export type SearchResponse = {
  results: Array<{
    id: string;
    groupedProjectId?: number;
    artistId?: number;
    authorId?: number;
    title: string;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: string;
    parts?: string[];
    durationText?: string;
    year?: number;
    hasLyrics?: boolean;
    downloads?: number;
    sourceId?: number;
    source: string;
    sourceUrl?: string;
  }>;
  total: number;
  hiddenBlacklistedCount?: number;
  page: number;
  pageSize: number;
  hasNextPage?: boolean;
};

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
  hiddenBlacklistedCount?: number;
  page?: number;
  pageSize?: number;
  hasNextPage?: boolean;
}): SearchResponse {
  return {
    results: result.results ?? [],
    total: result.total ?? result.results?.length ?? 0,
    hiddenBlacklistedCount: result.hiddenBlacklistedCount ?? 0,
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

    const searchResult = await performCachedCatalogSearch({
      env: runtimeEnv,
      search: normalizedInput,
      channelScope: normalizedInput.channelSlug
        ? {
            channelSlug: normalizedInput.channelSlug,
          }
        : undefined,
    });

    return normalizeSearchResponse(searchResult.data);
  });
