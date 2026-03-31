// Route: Returns song search results for the public search experience.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  consumeSearchRateLimit,
  getCachedSearchResult,
  getChannelBlacklistByChannelId,
  getChannelBySlug,
  getChannelSettingsByChannelId,
  searchCatalogSongs as searchCatalogSongsInDb,
  upsertCachedSearchResult,
} from "~/lib/db/repositories";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { getArraySetting } from "~/lib/request-policy";
import { getErrorMessage, json, sha256 } from "~/lib/utils";
import { searchInputSchema } from "~/lib/validation";

const searchCacheTtlMs = 5 * 60 * 1000;

function normalizeSearchCacheInput(
  input: ReturnType<typeof searchInputSchema.parse>
) {
  return {
    query: input.query ?? "",
    channelSlug: input.channelSlug ?? "",
    showBlacklisted: input.showBlacklisted ?? false,
    field: input.field,
    title: input.title ?? "",
    artist: input.artist ?? "",
    album: input.album ?? "",
    creator: input.creator ?? "",
    tuning: input.tuning ?? [],
    parts: input.parts ?? [],
    partsMatchMode: input.partsMatchMode,
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
          channelSlug: url.searchParams.get("channelSlug") ?? undefined,
          showBlacklisted: url.searchParams.get("showBlacklisted") ?? undefined,
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
          partsMatchMode: url.searchParams.get("partsMatchMode") ?? undefined,
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

        const isChannelScopedSearch = !!normalizedInput.channelSlug;
        const cacheInput = normalizeSearchCacheInput(normalizedInput);
        const cacheKey = await sha256(JSON.stringify(cacheInput));
        const cached = isChannelScopedSearch
          ? null
          : await getCachedSearchResult(runtimeEnv, cacheKey);

        if (cached) {
          return json(cached, {
            headers: {
              "x-search-cache": "hit",
            },
          });
        }

        try {
          let blacklistFilterInput = {};
          let channelPolicyFilterInput = {};
          let hasBlacklistFilters = false;
          if (normalizedInput.channelSlug) {
            const channel = await getChannelBySlug(
              runtimeEnv,
              normalizedInput.channelSlug
            );

            if (channel) {
              const [settings, blacklist] = await Promise.all([
                getChannelSettingsByChannelId(runtimeEnv, channel.id),
                getChannelBlacklistByChannelId(runtimeEnv, channel.id),
              ]);

              channelPolicyFilterInput = {
                restrictToOfficial: !!settings?.onlyOfficialDlc,
                allowedTuningsFilter: getArraySetting(
                  settings?.allowedTuningsJson
                ),
              };

              if (settings?.blacklistEnabled) {
                blacklistFilterInput = {
                  excludeSongIds: blacklist.blacklistSongs.map(
                    (song) => song.songId
                  ),
                  excludeGroupedProjectIds: blacklist.blacklistSongGroups.map(
                    (song) => song.groupedProjectId
                  ),
                  excludeArtistIds: blacklist.blacklistArtists.map(
                    (artist) => artist.artistId
                  ),
                  excludeArtistNames: blacklist.blacklistArtists.map(
                    (artist) => artist.artistName
                  ),
                  excludeAuthorIds: blacklist.blacklistCharters.map(
                    (charter) => charter.charterId
                  ),
                  excludeCreatorNames: blacklist.blacklistCharters.map(
                    (charter) => charter.charterName
                  ),
                };
                hasBlacklistFilters = Object.values(blacklistFilterInput).some(
                  (value) => Array.isArray(value) && value.length > 0
                );
              }
            }
          }

          const results = await searchCatalogSongsInDb(runtimeEnv, {
            ...normalizedInput,
            ...channelPolicyFilterInput,
            ...(normalizedInput.showBlacklisted ? {} : blacklistFilterInput),
          });
          const resolvedResults =
            normalizedInput.showBlacklisted && hasBlacklistFilters
              ? {
                  ...results,
                  hiddenBlacklistedCount: (
                    await searchCatalogSongsInDb(runtimeEnv, {
                      ...normalizedInput,
                      ...channelPolicyFilterInput,
                      ...blacklistFilterInput,
                    })
                  ).hiddenBlacklistedCount,
                }
              : results;

          if (!isChannelScopedSearch) {
            await upsertCachedSearchResult(runtimeEnv, {
              cacheKey,
              responseJson: JSON.stringify(resolvedResults),
              expiresAt: Date.now() + searchCacheTtlMs,
            });
          }

          return json(resolvedResults, {
            headers: {
              "x-search-cache": isChannelScopedSearch ? "bypass" : "miss",
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
