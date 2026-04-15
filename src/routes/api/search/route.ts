// Route: Returns song search results for the public search experience.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { isAbortError, throwIfAborted } from "~/lib/abort";
import { getSessionUserId } from "~/lib/auth/session.server";
import { consumeSearchRateLimit } from "~/lib/db/repositories";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { performCachedCatalogSearch } from "~/lib/server/cached-catalog-search";
import {
  createRequestStageTimer,
  registerAbortTrace,
  serializeErrorForLog,
} from "~/lib/server/request-tracing";
import { json, sha256 } from "~/lib/utils";
import { searchInputSchema } from "~/lib/validation";

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
        const traceId = crypto.randomUUID();
        const startedAt = Date.now();
        const timer = createRequestStageTimer();
        const url = new URL(request.url);

        const payload = {
          query: url.searchParams.get("query") ?? undefined,
          channelSlug: url.searchParams.get("channelSlug") ?? undefined,
          favoritesOnly: url.searchParams.get("favoritesOnly") ?? undefined,
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
        const traceContext = {
          traceId,
          path: url.pathname,
          query: payload.query ?? "",
          channelSlug: payload.channelSlug ?? null,
          page: payload.page ?? null,
          pageSize: payload.pageSize ?? null,
          field: payload.field ?? null,
        };

        console.info("Search request started", traceContext);
        const cleanupAbortTrace = registerAbortTrace(request.signal, () => {
          console.warn("Search request abort signaled", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
          });
        });

        try {
          throwIfAborted(request.signal);
          console.info("Search request stage started", {
            ...traceContext,
            stage: "assertSchemaCurrent",
          });
          await timer.measure("assertSchemaCurrent", () =>
            assertDatabaseSchemaCurrent(runtimeEnv)
          );
          console.info("Search request stage completed", {
            ...traceContext,
            stage: "assertSchemaCurrent",
            durationMs: timer.stageDurations.assertSchemaCurrent,
          });

          const parsed = searchInputSchema.safeParse(payload);
          if (!parsed.success) {
            const message =
              parsed.error.issues[0]?.message ?? "Invalid search parameters.";
            console.warn("Search request rejected", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
              message,
            });
            return json({ error: "invalid_search", message }, { status: 400 });
          }

          const normalizedInput = {
            ...parsed.data,
            sortBy: "updated" as const,
            sortDirection: "desc" as const,
          };

          console.info("Search request stage started", {
            ...traceContext,
            stage: "resolveIdentity",
          });
          const identity = await timer.measure("resolveIdentity", () =>
            getSearchIdentity(request, runtimeEnv)
          );
          console.info("Search request stage completed", {
            ...traceContext,
            stage: "resolveIdentity",
            durationMs: timer.stageDurations.resolveIdentity,
          });
          console.info("Search request stage started", {
            ...traceContext,
            stage: "consumeRateLimit",
          });
          const rateLimit = await timer.measure("consumeRateLimit", () =>
            consumeSearchRateLimit(runtimeEnv, {
              rateLimitKey: identity,
            })
          );
          console.info("Search request stage completed", {
            ...traceContext,
            stage: "consumeRateLimit",
            durationMs: timer.stageDurations.consumeRateLimit,
          });

          if (!rateLimit.allowed) {
            console.warn("Search request rate limited", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
              message:
                rateLimit.message ??
                "Please wait before performing another search.",
            });
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

          console.info("Search request stage started", {
            ...traceContext,
            stage: "performCachedCatalogSearch",
          });
          const searchResult = await timer.measure(
            "performCachedCatalogSearch",
            () =>
              performCachedCatalogSearch({
                env: runtimeEnv,
                search: normalizedInput,
                signal: request.signal,
                traceId,
                channelScope: normalizedInput.channelSlug
                  ? {
                      channelSlug: normalizedInput.channelSlug,
                    }
                  : undefined,
              })
          );
          console.info("Search request stage completed", {
            ...traceContext,
            stage: "performCachedCatalogSearch",
            durationMs: timer.stageDurations.performCachedCatalogSearch,
          });

          console.info("Search request completed", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
            cacheStatus: searchResult.cacheStatus,
            resultCount: searchResult.data.results.length,
            total: searchResult.data.total,
            hiddenBlacklistedCount:
              searchResult.data.hiddenBlacklistedCount ?? 0,
          });

          return json(searchResult.data, {
            headers: {
              "x-search-cache": searchResult.cacheStatus,
            },
          });
        } catch (error) {
          if (isAbortError(error)) {
            console.warn("Search request aborted", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
              error: serializeErrorForLog(error),
            });
            return new Response(null, { status: 499 });
          }

          console.error("Search request failed", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
            error: serializeErrorForLog(error),
          });

          return json(
            {
              error: "search_failed",
              message: "Search failed. Try again in a moment.",
            },
            { status: 500 }
          );
        } finally {
          cleanupAbortTrace();
        }
      },
    },
  },
});
