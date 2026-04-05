import type { AppEnv } from "~/lib/env";
import {
  getAppAccessToken,
  getChannelChatBadges,
  getGlobalChatBadges,
} from "~/lib/twitch/api";
import type {
  TwitchChatBadgeReference,
  TwitchChatBadgeSet,
  TwitchChatBadgeVersion,
} from "~/lib/twitch/types";

const BADGE_CACHE_TTL_MS = 15 * 60 * 1000;

export type RequesterChatBadgeReference = {
  setId: string;
  versionId: string;
  info?: string | null;
};

export type RequesterChatBadge = RequesterChatBadgeReference & {
  title: string;
  description?: string | null;
  imageUrl1x: string;
  imageUrl2x: string;
  imageUrl4x: string;
};

type CachedBadgeMap = {
  expiresAt: number;
  byKey: Map<string, TwitchChatBadgeVersion>;
};

const globalBadgeCache: {
  current: CachedBadgeMap | null;
} = {
  current: null,
};

const channelBadgeCache = new Map<string, CachedBadgeMap>();

function toBadgeKey(setId: string, versionId: string) {
  return `${setId}:${versionId}`;
}

function toCachedBadgeMap(sets: TwitchChatBadgeSet[]) {
  return {
    expiresAt: Date.now() + BADGE_CACHE_TTL_MS,
    byKey: new Map(
      sets.flatMap((set) =>
        set.versions.map((version) => [
          toBadgeKey(set.set_id, version.id),
          version,
        ])
      )
    ),
  } satisfies CachedBadgeMap;
}

function isCacheFresh(entry: CachedBadgeMap | null | undefined) {
  return !!entry && entry.expiresAt > Date.now();
}

function isRequesterChatBadge(value: unknown): value is RequesterChatBadge {
  if (!value || typeof value !== "object") {
    return false;
  }

  const badge = value as Partial<RequesterChatBadge>;
  return (
    typeof badge.setId === "string" &&
    badge.setId.length > 0 &&
    typeof badge.versionId === "string" &&
    badge.versionId.length > 0 &&
    typeof badge.title === "string" &&
    badge.title.length > 0 &&
    typeof badge.imageUrl1x === "string" &&
    badge.imageUrl1x.length > 0 &&
    typeof badge.imageUrl2x === "string" &&
    badge.imageUrl2x.length > 0 &&
    typeof badge.imageUrl4x === "string" &&
    badge.imageUrl4x.length > 0
  );
}

function parseRequesterChatBadgeArray(value: unknown): RequesterChatBadge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    isRequesterChatBadge(entry)
      ? [
          {
            setId: entry.setId,
            versionId: entry.versionId,
            info:
              typeof entry.info === "string" && entry.info.length > 0
                ? entry.info
                : null,
            title: entry.title,
            description:
              typeof entry.description === "string" &&
              entry.description.length > 0
                ? entry.description
                : null,
            imageUrl1x: entry.imageUrl1x,
            imageUrl2x: entry.imageUrl2x,
            imageUrl4x: entry.imageUrl4x,
          },
        ]
      : []
  );
}

async function getCachedBadgeMaps(input: {
  env: AppEnv;
  broadcasterUserId: string;
}) {
  let globalBadgeSets = globalBadgeCache.current;
  let channelBadgeSets = channelBadgeCache.get(input.broadcasterUserId);

  if (!isCacheFresh(globalBadgeSets) || !isCacheFresh(channelBadgeSets)) {
    const appAccessToken = (await getAppAccessToken(input.env)).access_token;
    const [nextGlobalBadgeSets, nextChannelBadgeSets] = await Promise.all([
      isCacheFresh(globalBadgeSets)
        ? Promise.resolve(globalBadgeSets)
        : getGlobalChatBadges({
            env: input.env,
            accessToken: appAccessToken,
          }).then((response) => {
            const nextCache = toCachedBadgeMap(response.data);
            globalBadgeCache.current = nextCache;
            return nextCache;
          }),
      isCacheFresh(channelBadgeSets)
        ? Promise.resolve(channelBadgeSets)
        : getChannelChatBadges({
            env: input.env,
            accessToken: appAccessToken,
            broadcasterUserId: input.broadcasterUserId,
          }).then((response) => {
            const nextCache = toCachedBadgeMap(response.data);
            channelBadgeCache.set(input.broadcasterUserId, nextCache);
            return nextCache;
          }),
    ]);

    globalBadgeSets = nextGlobalBadgeSets;
    channelBadgeSets = nextChannelBadgeSets;
  }

  if (!globalBadgeSets || !channelBadgeSets) {
    return {
      globalBadgeSets: new Map<string, TwitchChatBadgeVersion>(),
      channelBadgeSets: new Map<string, TwitchChatBadgeVersion>(),
    };
  }

  return {
    globalBadgeSets: globalBadgeSets.byKey,
    channelBadgeSets: channelBadgeSets.byKey,
  };
}

export function resolveRequesterChatBadgesFromBadgeSets(input: {
  references: RequesterChatBadgeReference[];
  channelBadgeSets?: TwitchChatBadgeSet[];
  globalBadgeSets?: TwitchChatBadgeSet[];
}) {
  const channelBadgeMap = toCachedBadgeMap(input.channelBadgeSets ?? []).byKey;
  const globalBadgeMap = toCachedBadgeMap(input.globalBadgeSets ?? []).byKey;

  return input.references.flatMap((reference) => {
    const matchedVersion =
      channelBadgeMap.get(toBadgeKey(reference.setId, reference.versionId)) ??
      globalBadgeMap.get(toBadgeKey(reference.setId, reference.versionId));

    if (!matchedVersion) {
      return [];
    }

    return [
      {
        setId: reference.setId,
        versionId: reference.versionId,
        info: reference.info ?? null,
        title: matchedVersion.title,
        description: matchedVersion.description,
        imageUrl1x: matchedVersion.image_url_1x,
        imageUrl2x: matchedVersion.image_url_2x,
        imageUrl4x: matchedVersion.image_url_4x,
      },
    ] satisfies RequesterChatBadge[];
  });
}

export async function resolveRequesterChatBadges(input: {
  env: AppEnv;
  broadcasterUserId: string;
  references: RequesterChatBadgeReference[];
}) {
  if (!input.references.length) {
    return [];
  }

  const { globalBadgeSets, channelBadgeSets } = await getCachedBadgeMaps({
    env: input.env,
    broadcasterUserId: input.broadcasterUserId,
  });

  return input.references.flatMap((reference) => {
    const matchedVersion =
      channelBadgeSets.get(toBadgeKey(reference.setId, reference.versionId)) ??
      globalBadgeSets.get(toBadgeKey(reference.setId, reference.versionId));

    if (!matchedVersion) {
      return [];
    }

    return [
      {
        setId: reference.setId,
        versionId: reference.versionId,
        info: reference.info ?? null,
        title: matchedVersion.title,
        description: matchedVersion.description,
        imageUrl1x: matchedVersion.image_url_1x,
        imageUrl2x: matchedVersion.image_url_2x,
        imageUrl4x: matchedVersion.image_url_4x,
      },
    ] satisfies RequesterChatBadge[];
  });
}

export function serializeRequesterChatBadges(
  badges: RequesterChatBadge[] | null | undefined
) {
  if (!badges?.length) {
    return null;
  }

  return JSON.stringify(badges);
}

export function parseRequesterChatBadges(value: unknown) {
  if (typeof value === "string") {
    try {
      return parseRequesterChatBadgeArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return parseRequesterChatBadgeArray(value);
}

export function toRequesterChatBadgeReferences(
  badges: TwitchChatBadgeReference[] | null | undefined
) {
  return (badges ?? []).flatMap((badge) =>
    typeof badge?.set_id === "string" &&
    badge.set_id.length > 0 &&
    typeof badge.id === "string" &&
    badge.id.length > 0
      ? [
          {
            setId: badge.set_id,
            versionId: badge.id,
            info:
              typeof badge.info === "string" && badge.info.length > 0
                ? badge.info
                : null,
          },
        ]
      : []
  );
}
