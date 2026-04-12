import {
  getCachedSearchResultState,
  getCatalogSearchVersionToken,
  getChannelBlacklistByChannelId,
  getChannelById,
  getChannelBySlug,
  getChannelSearchVersionToken,
  getChannelSettingsByChannelId,
  searchCatalogSongs as searchCatalogSongsInDb,
  tryAcquireSearchCacheRevalidationLease,
  upsertCachedSearchResult,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getRequestWaitUntil } from "~/lib/server/request-context";
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
  let favoritesFilterInput = {};
  let hasBlacklistFilters = false;

  if (input.resolvedChannel) {
    const [settings, blacklist] = await Promise.all([
      getChannelSettingsByChannelId(input.env, input.resolvedChannel.id),
      getChannelBlacklistByChannelId(input.env, input.resolvedChannel.id),
    ]);

    channelPolicyFilterInput = {
      restrictToOfficial: !!settings?.onlyOfficialDlc,
      allowedTuningsFilter: parseStoredTuningIds(settings?.allowedTuningsJson),
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
    favoritesFilterInput,
    hasBlacklistFilters,
  };
}

async function runCatalogSearch(input: {
  env: AppEnv;
  normalizedSearch: NormalizedCachedCatalogSearchInput;
  resolvedChannel: ResolvedChannel | null;
}) {
  const filters = await resolveChannelSearchFilters(input);
  const results = await searchCatalogSongsInDb(input.env, {
    ...input.normalizedSearch,
    ...filters.favoritesFilterInput,
    ...filters.channelPolicyFilterInput,
    ...(input.normalizedSearch.showBlacklisted
      ? {}
      : filters.blacklistFilterInput),
  });

  if (!input.normalizedSearch.showBlacklisted || !filters.hasBlacklistFilters) {
    return results;
  }

  return {
    ...results,
    hiddenBlacklistedCount: (
      await searchCatalogSongsInDb(input.env, {
        ...input.normalizedSearch,
        ...filters.favoritesFilterInput,
        ...filters.channelPolicyFilterInput,
        ...filters.blacklistFilterInput,
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
}) {
  const waitUntil = getRequestWaitUntil();
  const refreshPromise = (async () => {
    const results = await runCatalogSearch({
      env: input.env,
      normalizedSearch: input.normalizedSearch,
      resolvedChannel: input.resolvedChannel,
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
  const normalizedSearch = normalizeCachedCatalogSearchInput(input.search);
  const resolvedChannel = await resolveSearchChannel({
    env: input.env,
    channelScope: input.channelScope,
  });
  const cacheFreshMs = input.cacheFreshMs ?? defaultSearchCacheFreshTtlMs;
  const cacheStaleMs = input.cacheStaleMs ?? defaultSearchCacheStaleTtlMs;
  const revalidationLeaseMs =
    input.revalidationLeaseMs ?? defaultSearchCacheRevalidationLeaseMs;
  const cacheInput = normalizeSearchCacheInput(
    normalizedSearch,
    resolvedChannel?.id ?? ""
  );
  const cacheKey = await sha256(JSON.stringify(cacheInput));
  const versionToken = await resolveSearchCacheVersionToken({
    env: input.env,
    resolvedChannel,
  });
  const cached = await getCachedSearchResultState<CachedCatalogSearchData>(
    input.env,
    {
      cacheKey,
      versionToken,
    }
  );

  if (cached.state === "fresh") {
    return {
      data: cached.response,
      cacheStatus: "hit",
      resolvedChannel,
    };
  }

  if (cached.state === "stale") {
    const hasLease = await tryAcquireSearchCacheRevalidationLease(input.env, {
      cacheKey,
      leaseMs: revalidationLeaseMs,
    });

    if (hasLease) {
      revalidateSearchCacheInBackground({
        env: input.env,
        normalizedSearch,
        resolvedChannel,
        cacheKey,
        versionToken,
        cacheFreshMs,
        cacheStaleMs,
      });
    }

    return {
      data: cached.response,
      cacheStatus: "stale",
      resolvedChannel,
    };
  }

  const data = await runCatalogSearch({
    env: input.env,
    normalizedSearch,
    resolvedChannel,
  });
  const now = Date.now();

  await upsertCachedSearchResult(input.env, {
    cacheKey,
    responseJson: JSON.stringify(data),
    versionToken,
    freshUntil: now + cacheFreshMs,
    staleUntil: now + cacheStaleMs,
  });

  return {
    data,
    cacheStatus: "miss",
    resolvedChannel,
  };
}
