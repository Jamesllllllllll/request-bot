import { throwIfAborted } from "~/lib/abort";
import {
  getCachedSearchResultState,
  getCatalogSearchVersionToken,
  getChannelBlacklistByChannelId,
  getChannelById,
  getChannelBySlug,
  getChannelPreferredChartersByChannelId,
  getChannelSearchVersionToken,
  getChannelSettingsByChannelId,
  searchCatalogSongs as searchCatalogSongsInDb,
  tryAcquireSearchCacheRevalidationLease,
  upsertCachedSearchResult,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getRequestWaitUntil } from "~/lib/server/request-context";
import { createRequestStageTimer } from "~/lib/server/request-tracing";
import { parseStoredTuningIds } from "~/lib/tunings";
import { sha256 } from "~/lib/utils";

const defaultSearchCacheFreshTtlMs = 5 * 60 * 1000;
const defaultSearchCacheStaleTtlMs = 24 * 60 * 60 * 1000;
const defaultSearchCacheRevalidationLeaseMs = 30 * 1000;

type ResolvedChannel = NonNullable<Awaited<ReturnType<typeof getChannelById>>>;

export type CachedCatalogSearchInput = {
  env: AppEnv;
  search: {
    query?: string;
    favoritesOnly?: boolean;
    showBlacklisted?: boolean;
    field?: "any" | "title" | "artist" | "album" | "creator";
    title?: string;
    artist?: string;
    album?: string;
    creator?: string;
    tuning?: number[];
    parts?: string[];
    partsMatchMode?: "any" | "all";
    year?: number[];
    page: number;
    pageSize: number;
  };
  channelScope?: {
    channelId?: string;
    channelSlug?: string;
    resolvedChannel?: ResolvedChannel | null;
  };
  cacheFreshMs?: number;
  cacheStaleMs?: number;
  revalidationLeaseMs?: number;
  signal?: AbortSignal | null;
  traceId?: string;
};

type NormalizedCachedCatalogSearchInput = {
  query?: string;
  favoritesOnly: boolean;
  showBlacklisted: boolean;
  field: "any" | "title" | "artist" | "album" | "creator";
  title?: string;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: number[];
  parts?: string[];
  partsMatchMode: "any" | "all";
  year?: number[];
  page: number;
  pageSize: number;
  sortBy: "updated";
  sortDirection: "desc";
};

export type CachedCatalogSearchData = Awaited<
  ReturnType<typeof searchCatalogSongsInDb>
>;

export type CachedCatalogSearchResult = {
  data: CachedCatalogSearchData;
  cacheStatus: "hit" | "stale" | "miss";
  resolvedChannel: ResolvedChannel | null;
};

function normalizeCachedCatalogSearchInput(
  input: CachedCatalogSearchInput["search"]
): NormalizedCachedCatalogSearchInput {
  return {
    query: input.query,
    favoritesOnly: input.favoritesOnly ?? false,
    showBlacklisted: input.showBlacklisted ?? false,
    field: input.field ?? "any",
    title: input.title,
    artist: input.artist,
    album: input.album,
    creator: input.creator,
    tuning: input.tuning,
    parts: input.parts,
    partsMatchMode: input.partsMatchMode ?? "any",
    year: input.year,
    page: input.page,
    pageSize: input.pageSize,
    sortBy: "updated",
    sortDirection: "desc",
  };
}

function normalizeSearchCacheInput(
  input: NormalizedCachedCatalogSearchInput,
  channelCacheScope: string
) {
  return {
    query: input.query ?? "",
    channelId: channelCacheScope,
    favoritesOnly: input.favoritesOnly,
    showBlacklisted: input.showBlacklisted,
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
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

async function resolveSearchChannel(input: {
  env: AppEnv;
  channelScope?: CachedCatalogSearchInput["channelScope"];
}): Promise<ResolvedChannel | null> {
  if (input.channelScope?.resolvedChannel !== undefined) {
    return input.channelScope.resolvedChannel ?? null;
  }

  if (input.channelScope?.channelId) {
    return (
      (await getChannelById(input.env, input.channelScope.channelId)) ?? null
    );
  }

  if (input.channelScope?.channelSlug) {
    return (
      (await getChannelBySlug(input.env, input.channelScope.channelSlug)) ??
      null
    );
  }

  return null;
}

async function resolveSearchCacheVersionToken(input: {
  env: AppEnv;
  resolvedChannel: ResolvedChannel | null;
}) {
  const [catalogVersionToken, channelVersionToken] = await Promise.all([
    getCatalogSearchVersionToken(input.env),
    input.resolvedChannel
      ? getChannelSearchVersionToken(input.env, input.resolvedChannel.id)
      : Promise.resolve(null),
  ]);

  return JSON.stringify({
    catalog: catalogVersionToken,
    channel: channelVersionToken,
  });
}

async function resolveChannelSearchFilters(input: {
  env: AppEnv;
  normalizedSearch: NormalizedCachedCatalogSearchInput;
  resolvedChannel: ResolvedChannel | null;
}) {
  let blacklistFilterInput = {};
  let channelPolicyFilterInput = {};
  let charterPreferenceFilterInput = {};
  let favoritesFilterInput = {};
  let hasBlacklistFilters = false;

  if (input.resolvedChannel) {
    const [settings, blacklist, preferredCharters] = await Promise.all([
      getChannelSettingsByChannelId(input.env, input.resolvedChannel.id),
      getChannelBlacklistByChannelId(input.env, input.resolvedChannel.id),
      getChannelPreferredChartersByChannelId(
        input.env,
        input.resolvedChannel.id
      ),
    ]);

    channelPolicyFilterInput = {
      restrictToOfficial: !!settings?.onlyOfficialDlc,
      allowedTuningsFilter: parseStoredTuningIds(settings?.allowedTuningsJson),
    };
    charterPreferenceFilterInput = {
      preferredAuthorIds: preferredCharters.map((charter) => charter.charterId),
      preferredCreatorNames: preferredCharters.map(
        (charter) => charter.charterName
      ),
    };
    favoritesFilterInput = input.normalizedSearch.favoritesOnly
      ? {
          favoriteChannelId: input.resolvedChannel.id,
        }
      : {};

    if (settings?.blacklistEnabled) {
      blacklistFilterInput = {
        excludeSongIds: blacklist.blacklistSongs.map((song) => song.songId),
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

  return {
    blacklistFilterInput,
    channelPolicyFilterInput,
    charterPreferenceFilterInput,
    favoritesFilterInput,
    hasBlacklistFilters,
  };
}

async function runCatalogSearch(input: {
  env: AppEnv;
  normalizedSearch: NormalizedCachedCatalogSearchInput;
  resolvedChannel: ResolvedChannel | null;
  signal?: AbortSignal | null;
  traceId?: string;
}) {
  throwIfAborted(input.signal);
  const filters = await resolveChannelSearchFilters(input);
  throwIfAborted(input.signal);
  const results = await searchCatalogSongsInDb(input.env, {
    ...input.normalizedSearch,
    ...filters.favoritesFilterInput,
    ...filters.channelPolicyFilterInput,
    ...filters.charterPreferenceFilterInput,
    signal: input.signal,
    traceId: input.traceId,
    ...(input.normalizedSearch.showBlacklisted
      ? {}
      : filters.blacklistFilterInput),
  });
  throwIfAborted(input.signal);

  if (!input.normalizedSearch.showBlacklisted || !filters.hasBlacklistFilters) {
    return results;
  }

  throwIfAborted(input.signal);
  return {
    ...results,
    hiddenBlacklistedCount: (
      await searchCatalogSongsInDb(input.env, {
        ...input.normalizedSearch,
        ...filters.favoritesFilterInput,
        ...filters.channelPolicyFilterInput,
        ...filters.charterPreferenceFilterInput,
        ...filters.blacklistFilterInput,
        signal: input.signal,
        traceId: input.traceId,
      })
    ).hiddenBlacklistedCount,
  };
}

function revalidateSearchCacheInBackground(input: {
  env: AppEnv;
  normalizedSearch: NormalizedCachedCatalogSearchInput;
  resolvedChannel: ResolvedChannel | null;
  cacheKey: string;
  versionToken: string;
  cacheFreshMs: number;
  cacheStaleMs: number;
  traceId?: string;
}) {
  const waitUntil = getRequestWaitUntil();
  const refreshPromise = (async () => {
    const results = await runCatalogSearch({
      env: input.env,
      normalizedSearch: input.normalizedSearch,
      resolvedChannel: input.resolvedChannel,
      traceId: input.traceId,
    });
    const now = Date.now();

    await upsertCachedSearchResult(input.env, {
      cacheKey: input.cacheKey,
      responseJson: JSON.stringify(results),
      versionToken: input.versionToken,
      freshUntil: now + input.cacheFreshMs,
      staleUntil: now + input.cacheStaleMs,
    });
  })().catch((error) => {
    console.error("Search cache revalidation failed", {
      channelId: input.resolvedChannel?.id ?? null,
      cacheKey: input.cacheKey,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (waitUntil) {
    waitUntil(refreshPromise);
    return;
  }

  void refreshPromise;
}

export async function performCachedCatalogSearch(
  input: CachedCatalogSearchInput
): Promise<CachedCatalogSearchResult> {
  const timer = createRequestStageTimer();
  throwIfAborted(input.signal);
  const normalizedSearch = normalizeCachedCatalogSearchInput(input.search);
  if (input.traceId) {
    console.info("Cached catalog search stage started", {
      traceId: input.traceId,
      stage: "resolveSearchChannel",
    });
  }
  const resolvedChannel = await timer.measure("resolveSearchChannel", () =>
    resolveSearchChannel({
      env: input.env,
      channelScope: input.channelScope,
    })
  );
  if (input.traceId) {
    console.info("Cached catalog search stage completed", {
      traceId: input.traceId,
      stage: "resolveSearchChannel",
      durationMs: timer.stageDurations.resolveSearchChannel,
      channelId: resolvedChannel?.id ?? null,
    });
  }
  throwIfAborted(input.signal);
  const cacheFreshMs = input.cacheFreshMs ?? defaultSearchCacheFreshTtlMs;
  const cacheStaleMs = input.cacheStaleMs ?? defaultSearchCacheStaleTtlMs;
  const revalidationLeaseMs =
    input.revalidationLeaseMs ?? defaultSearchCacheRevalidationLeaseMs;
  const cacheInput = normalizeSearchCacheInput(
    normalizedSearch,
    resolvedChannel?.id ?? ""
  );
  const cacheKey = await sha256(JSON.stringify(cacheInput));
  if (input.traceId) {
    console.info("Cached catalog search stage started", {
      traceId: input.traceId,
      stage: "resolveVersionToken",
    });
  }
  const versionToken = await timer.measure("resolveVersionToken", () =>
    resolveSearchCacheVersionToken({
      env: input.env,
      resolvedChannel,
    })
  );
  if (input.traceId) {
    console.info("Cached catalog search stage completed", {
      traceId: input.traceId,
      stage: "resolveVersionToken",
      durationMs: timer.stageDurations.resolveVersionToken,
    });
  }
  throwIfAborted(input.signal);
  if (input.traceId) {
    console.info("Cached catalog search stage started", {
      traceId: input.traceId,
      stage: "getCachedSearchResultState",
      cacheKey,
    });
  }
  const cached = await timer.measure("getCachedSearchResultState", () =>
    getCachedSearchResultState<CachedCatalogSearchData>(input.env, {
      cacheKey,
      versionToken,
    })
  );
  if (input.traceId) {
    console.info("Cached catalog search stage completed", {
      traceId: input.traceId,
      stage: "getCachedSearchResultState",
      durationMs: timer.stageDurations.getCachedSearchResultState,
      cacheKey,
      cacheState: cached.state,
    });
  }
  throwIfAborted(input.signal);

  if (cached.state === "fresh") {
    if (input.traceId) {
      console.info("Cached catalog search resolved", {
        traceId: input.traceId,
        cacheState: cached.state,
        elapsedMs: Object.values(timer.stageDurations).reduce(
          (total, duration) => total + duration,
          0
        ),
        stageDurations: timer.stageDurations,
        channelId: resolvedChannel?.id ?? null,
      });
    }

    return {
      data: cached.response,
      cacheStatus: "hit",
      resolvedChannel,
    };
  }

  if (cached.state === "stale") {
    if (input.traceId) {
      console.info("Cached catalog search stage started", {
        traceId: input.traceId,
        stage: "acquireRevalidationLease",
        cacheKey,
      });
    }
    const hasLease = await timer.measure("acquireRevalidationLease", () =>
      tryAcquireSearchCacheRevalidationLease(input.env, {
        cacheKey,
        leaseMs: revalidationLeaseMs,
      })
    );
    if (input.traceId) {
      console.info("Cached catalog search stage completed", {
        traceId: input.traceId,
        stage: "acquireRevalidationLease",
        durationMs: timer.stageDurations.acquireRevalidationLease,
        cacheKey,
        hasLease,
      });
    }

    if (hasLease) {
      revalidateSearchCacheInBackground({
        env: input.env,
        normalizedSearch,
        resolvedChannel,
        cacheKey,
        versionToken,
        cacheFreshMs,
        cacheStaleMs,
        traceId: input.traceId,
      });
    }

    if (input.traceId) {
      console.info("Cached catalog search resolved", {
        traceId: input.traceId,
        cacheState: cached.state,
        hasLease,
        elapsedMs: Object.values(timer.stageDurations).reduce(
          (total, duration) => total + duration,
          0
        ),
        stageDurations: timer.stageDurations,
        channelId: resolvedChannel?.id ?? null,
      });
    }

    return {
      data: cached.response,
      cacheStatus: "stale",
      resolvedChannel,
    };
  }

  if (input.traceId) {
    console.info("Cached catalog search stage started", {
      traceId: input.traceId,
      stage: "runCatalogSearch",
      cacheKey,
    });
  }
  const data = await timer.measure("runCatalogSearch", () =>
    runCatalogSearch({
      env: input.env,
      normalizedSearch,
      resolvedChannel,
      signal: input.signal,
      traceId: input.traceId,
    })
  );
  if (input.traceId) {
    console.info("Cached catalog search stage completed", {
      traceId: input.traceId,
      stage: "runCatalogSearch",
      durationMs: timer.stageDurations.runCatalogSearch,
      cacheKey,
      total: data.total,
      resultCount: data.results.length,
    });
  }
  const now = Date.now();

  if (input.traceId) {
    console.info("Cached catalog search stage started", {
      traceId: input.traceId,
      stage: "upsertCachedSearchResult",
      cacheKey,
    });
  }
  await timer.measure("upsertCachedSearchResult", () =>
    upsertCachedSearchResult(input.env, {
      cacheKey,
      responseJson: JSON.stringify(data),
      versionToken,
      freshUntil: now + cacheFreshMs,
      staleUntil: now + cacheStaleMs,
    })
  );
  if (input.traceId) {
    console.info("Cached catalog search stage completed", {
      traceId: input.traceId,
      stage: "upsertCachedSearchResult",
      durationMs: timer.stageDurations.upsertCachedSearchResult,
      cacheKey,
    });
  }

  if (input.traceId) {
    console.info("Cached catalog search resolved", {
      traceId: input.traceId,
      cacheState: "miss",
      elapsedMs: Object.values(timer.stageDurations).reduce(
        (total, duration) => total + duration,
        0
      ),
      stageDurations: timer.stageDurations,
      channelId: resolvedChannel?.id ?? null,
      total: data.total,
      resultCount: data.results.length,
      hiddenBlacklistedCount: data.hiddenBlacklistedCount ?? 0,
    });
  }

  return {
    data,
    cacheStatus: "miss",
    resolvedChannel,
  };
}
