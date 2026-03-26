import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppEnv } from "~/lib/env";
import {
  getAppAccessToken,
  getLiveStreams,
  getModeratedChannels,
  refreshAccessToken,
  TwitchApiError,
} from "~/lib/twitch/api";
import {
  createId,
  decodeHtmlEntities,
  encodeHtmlEntities,
  normalizeSongSourceUrl,
  parseJsonStringArray,
  slugify,
} from "~/lib/utils";
import {
  clampVipTokenCount,
  hasRedeemableVipToken,
  normalizeVipTokenCount,
  subtractVipTokenRedemption,
} from "~/lib/vip-tokens";
import { getDb } from "./client";
import {
  type AuditLogInsert,
  auditLogs,
  type BlacklistedArtistInsert,
  type BlacklistedCharterInsert,
  type BlacklistedSongGroupInsert,
  type BlacklistedSongInsert,
  blacklistedArtists,
  blacklistedCharters,
  blacklistedSongGroups,
  blacklistedSongs,
  blockedUsers,
  type CatalogSongInsert,
  catalogSongs,
  channelSettings,
  channels,
  type EventSubDeliveryInsert,
  type EventSubSubscriptionInsert,
  eventSubDeliveries,
  eventSubSubscriptions,
  type PlayedSongInsert,
  playedSongs,
  playlistItems,
  playlists,
  type RequestLogInsert,
  requestLogs,
  type SetlistArtistInsert,
  searchCache,
  searchRateLimits,
  setlistArtists,
  twitchAuthorizations,
  users,
  type VipTokenInsert,
  vipTokens,
} from "./schema";

const CATALOG_SONG_MUTABLE_FIELDS: Array<keyof CatalogSongInsert> = [
  "artistId",
  "title",
  "artistName",
  "albumName",
  "authorId",
  "creatorName",
  "groupedProjectId",
  "artistsFtJson",
  "tagsJson",
  "genresJson",
  "subgenresJson",
  "genreName",
  "subgenreName",
  "tuningSummary",
  "leadTuningId",
  "leadTuningName",
  "rhythmTuningId",
  "rhythmTuningName",
  "bassTuningId",
  "bassTuningName",
  "altLeadTuningId",
  "altRhythmTuningId",
  "altBassTuningId",
  "bonusLeadTuningId",
  "bonusRhythmTuningId",
  "bonusBassTuningId",
  "partsJson",
  "platformsJson",
  "durationText",
  "durationSeconds",
  "year",
  "versionText",
  "downloads",
  "views",
  "commentsCount",
  "reportsCount",
  "collectedCount",
  "hasLyrics",
  "hasLead",
  "hasRhythm",
  "hasBass",
  "hasVocals",
  "hasBonusArrangements",
  "hasAlternateArrangements",
  "isDisabled",
  "isAbandoned",
  "isTrending",
  "filePcAvailable",
  "fileMacAvailable",
  "albumArtUrl",
  "sourceCreatedAt",
  "sourceUpdatedAt",
  "lastSeenAt",
  "updatedAt",
];

function parseAdminTwitchUserIds(env: AppEnv) {
  return new Set(
    (env.ADMIN_TWITCH_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isConfiguredAdmin(env: AppEnv, twitchUserId: string) {
  return parseAdminTwitchUserIds(env).has(twitchUserId);
}

function normalizeLogin(value: string) {
  return value.trim().toLowerCase();
}

export function parseAuthorizationScopes(scopesJson: string) {
  try {
    const parsed = JSON.parse(scopesJson) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasRequiredAuthorizationScopes(
  scopesJson: string,
  requiredScopes: string[]
) {
  const scopes = new Set(parseAuthorizationScopes(scopesJson));
  return requiredScopes.every((scope) => scopes.has(scope));
}

function uniqueCompact(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => !!value)
    ),
  ];
}

function escapeLikeValue(value: string) {
  return value.replace(/[%_]+/g, " ").replace(/\s+/g, " ").trim();
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function catalogSongNeedsUpdate(
  existing: Record<string, unknown>,
  next: CatalogSongInsert
) {
  return CATALOG_SONG_MUTABLE_FIELDS.some((field) => {
    const nextValue = next[field] ?? null;
    const existingValue = existing[field] ?? null;
    return existingValue !== nextValue;
  });
}

function unwrapD1Rows<T>(result: T[] | { results: T[] }) {
  return Array.isArray(result) ? result : result.results;
}

export async function upsertUserAndChannel(
  env: AppEnv,
  input: {
    twitchUserId: string;
    login: string;
    displayName: string;
    profileImageUrl?: string;
  }
) {
  const db = getDb(env);
  const slug = slugify(input.login);

  await db
    .insert(users)
    .values({
      id: createId("usr"),
      twitchUserId: input.twitchUserId,
      login: input.login,
      displayName: input.displayName,
      profileImageUrl: input.profileImageUrl,
      isAdmin: isConfiguredAdmin(env, input.twitchUserId),
    })
    .onConflictDoUpdate({
      target: users.twitchUserId,
      set: {
        login: input.login,
        displayName: input.displayName,
        profileImageUrl: input.profileImageUrl,
      },
    });

  const user = await db.query.users.findFirst({
    where: eq(users.twitchUserId, input.twitchUserId),
  });

  if (!user) {
    throw new Error("User upsert failed");
  }

  if (isConfiguredAdmin(env, input.twitchUserId) && !user.isAdmin) {
    await db
      .update(users)
      .set({
        isAdmin: true,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, user.id));

    const refreshedUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    if (refreshedUser) {
      Object.assign(user, refreshedUser);
    }
  }

  await db
    .insert(channels)
    .values({
      id: createId("chn"),
      ownerUserId: user.id,
      twitchChannelId: input.twitchUserId,
      slug,
      login: input.login,
      displayName: input.displayName,
    })
    .onConflictDoUpdate({
      target: channels.twitchChannelId,
      set: {
        login: input.login,
        displayName: input.displayName,
        slug,
      },
    });

  const channel = await db.query.channels.findFirst({
    where: eq(channels.twitchChannelId, input.twitchUserId),
  });

  if (!channel) {
    throw new Error("Channel upsert failed");
  }

  await db
    .insert(channelSettings)
    .values({ channelId: channel.id })
    .onConflictDoNothing();
  await db
    .insert(playlists)
    .values({ id: createId("pl"), channelId: channel.id })
    .onConflictDoNothing();

  return { user, channel };
}

export async function saveTwitchAuthorization(
  env: AppEnv,
  input: {
    authorizationType?: "broadcaster" | "bot";
    userId: string;
    channelId?: string | null;
    twitchUserId: string;
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    scopes: string[];
    expiresAt?: number;
  }
) {
  await getDb(env)
    .insert(twitchAuthorizations)
    .values({
      id: createId("twa"),
      authorizationType: input.authorizationType ?? "broadcaster",
      userId: input.userId,
      channelId: input.channelId ?? null,
      twitchUserId: input.twitchUserId,
      accessTokenEncrypted: input.accessToken,
      refreshTokenEncrypted: input.refreshToken,
      tokenType: input.tokenType,
      scopes: JSON.stringify(input.scopes),
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        twitchAuthorizations.authorizationType,
        twitchAuthorizations.twitchUserId,
      ],
      set: {
        userId: input.userId,
        channelId: input.channelId ?? null,
        accessTokenEncrypted: input.accessToken,
        refreshTokenEncrypted: input.refreshToken,
        tokenType: input.tokenType,
        scopes: JSON.stringify(input.scopes),
        expiresAt: input.expiresAt,
        updatedAt: Date.now(),
      },
    });
}

export async function getDashboardState(env: AppEnv, ownerUserId: string) {
  const db = getDb(env);
  const channel = await db.query.channels.findFirst({
    where: eq(channels.ownerUserId, ownerUserId),
  });

  if (!channel) {
    return null;
  }

  const [
    settings,
    playlist,
    items,
    blocks,
    logs,
    audits,
    blacklistArtistsRows,
    blacklistSongsRows,
    blacklistSongGroupRows,
    blacklistCharterRows,
    setlistArtistRows,
    vipTokenRows,
    playedRows,
  ] = await Promise.all([
    db.query.channelSettings.findFirst({
      where: eq(channelSettings.channelId, channel.id),
    }),
    db.query.playlists.findFirst({
      where: eq(playlists.channelId, channel.id),
    }),
    db.query.playlistItems.findMany({
      where: eq(playlistItems.channelId, channel.id),
      orderBy: [asc(playlistItems.position)],
    }),
    db.query.blockedUsers.findMany({
      where: eq(blockedUsers.channelId, channel.id),
      orderBy: [desc(blockedUsers.createdAt)],
    }),
    db.query.requestLogs.findMany({
      where: eq(requestLogs.channelId, channel.id),
      orderBy: [desc(requestLogs.createdAt)],
      limit: 50,
    }),
    db.query.auditLogs.findMany({
      where: eq(auditLogs.channelId, channel.id),
      orderBy: [desc(auditLogs.createdAt)],
      limit: 50,
    }),
    db.query.blacklistedArtists.findMany({
      where: eq(blacklistedArtists.channelId, channel.id),
      orderBy: [asc(blacklistedArtists.artistName)],
    }),
    db.query.blacklistedSongs.findMany({
      where: eq(blacklistedSongs.channelId, channel.id),
      orderBy: [
        asc(blacklistedSongs.songTitle),
        asc(blacklistedSongs.artistName),
      ],
    }),
    db.query.blacklistedSongGroups.findMany({
      where: eq(blacklistedSongGroups.channelId, channel.id),
      orderBy: [
        asc(blacklistedSongGroups.songTitle),
        asc(blacklistedSongGroups.artistName),
      ],
    }),
    db.query.blacklistedCharters.findMany({
      where: eq(blacklistedCharters.channelId, channel.id),
      orderBy: [asc(blacklistedCharters.charterName)],
    }),
    db.query.setlistArtists.findMany({
      where: eq(setlistArtists.channelId, channel.id),
      orderBy: [asc(setlistArtists.artistName)],
    }),
    db.query.vipTokens.findMany({
      where: eq(vipTokens.channelId, channel.id),
      orderBy: [asc(vipTokens.login)],
    }),
    db.query.playedSongs.findMany({
      where: eq(playedSongs.channelId, channel.id),
      orderBy: [desc(playedSongs.playedAt)],
      limit: 100,
    }),
  ]);

  return {
    channel,
    settings,
    playlist,
    items: items.filter(
      (item) => item.status === "queued" || item.status === "current"
    ),
    blocks,
    logs,
    audits,
    blacklistArtists: blacklistArtistsRows,
    blacklistCharters: blacklistCharterRows,
    blacklistSongs: blacklistSongsRows,
    blacklistSongGroups: blacklistSongGroupRows,
    setlistArtists: setlistArtistRows,
    vipTokens: vipTokenRows,
    playedSongs: playedRows,
  };
}

export async function getAdminDashboardState(env: AppEnv, userId: string) {
  const user = await getUserById(env, userId);
  if (!user?.isAdmin) {
    return null;
  }

  return getDashboardState(env, userId);
}

export async function getLiveChannels(env: AppEnv) {
  const db = getDb(env);
  const liveChannels = await db.query.channels.findMany({
    where: and(eq(channels.isLive, true), eq(channels.botEnabled, true)),
    orderBy: [asc(channels.displayName)],
    limit: 50,
  });

  if (!liveChannels.length) {
    return [];
  }

  const appToken = await getAppAccessToken(env);
  const liveStreams = await getLiveStreams({
    env,
    appAccessToken: appToken.access_token,
    broadcasterUserIds: liveChannels.map((channel) => channel.twitchChannelId),
  });
  const liveStreamByChannelId = new Map(
    liveStreams.map((stream) => [stream.user_id, stream])
  );

  const playlistsForChannels = await db.query.playlists.findMany({
    where: inArray(
      playlists.channelId,
      liveChannels.map((channel) => channel.id)
    ),
  });
  const playlistIds = playlistsForChannels.map((playlist) => playlist.id);
  const playlistByChannelId = new Map(
    playlistsForChannels.map((playlist) => [playlist.channelId, playlist])
  );

  const itemsForChannels = playlistIds.length
    ? await db.query.playlistItems.findMany({
        where: and(
          inArray(playlistItems.playlistId, playlistIds),
          inArray(playlistItems.status, ["queued", "current"])
        ),
        orderBy: [asc(playlistItems.position)],
      })
    : [];

  return liveChannels.map((channel) => {
    const stream = liveStreamByChannelId.get(channel.twitchChannelId);
    const playlist = playlistByChannelId.get(channel.id);
    const channelItems = playlist
      ? itemsForChannels.filter((item) => item.playlistId === playlist.id)
      : [];
    const currentItem =
      channelItems.find((item) => item.status === "current") ?? null;
    const nextItem =
      channelItems.find((item) => item.status === "queued") ??
      (currentItem ? null : (channelItems[0] ?? null));

    return {
      id: channel.id,
      slug: channel.slug,
      displayName: channel.displayName,
      login: channel.login,
      streamTitle: stream?.title ?? null,
      streamThumbnailUrl: stream?.thumbnail_url
        ? stream.thumbnail_url
            .replace("{width}", "640")
            .replace("{height}", "360")
        : null,
      currentItem: currentItem
        ? {
            title: currentItem.songTitle,
            artist: currentItem.songArtist ?? null,
          }
        : null,
      nextItem: nextItem
        ? {
            title: nextItem.songTitle,
            artist: nextItem.songArtist ?? null,
          }
        : null,
    };
  });
}

export async function getChannelBySlug(env: AppEnv, slug: string) {
  return getDb(env).query.channels.findFirst({
    where: eq(channels.slug, slug),
  });
}

export async function getChannelByLogin(env: AppEnv, login: string) {
  return getDb(env).query.channels.findFirst({
    where: eq(channels.login, login),
  });
}

export async function getChannelById(env: AppEnv, channelId: string) {
  return getDb(env).query.channels.findFirst({
    where: eq(channels.id, channelId),
  });
}

export async function getChannelByTwitchChannelId(
  env: AppEnv,
  twitchChannelId: string
) {
  return getDb(env).query.channels.findFirst({
    where: eq(channels.twitchChannelId, twitchChannelId),
  });
}

export async function getChannelSettingsByChannelId(
  env: AppEnv,
  channelId: string
) {
  return getDb(env).query.channelSettings.findFirst({
    where: eq(channelSettings.channelId, channelId),
  });
}

export async function getPlaylistByChannelId(env: AppEnv, channelId: string) {
  const db = getDb(env);
  const playlist = await db.query.playlists.findFirst({
    where: eq(playlists.channelId, channelId),
  });

  if (!playlist) {
    return null;
  }

  const items = await db.query.playlistItems.findMany({
    where: eq(playlistItems.playlistId, playlist.id),
    orderBy: [asc(playlistItems.position)],
  });

  return {
    playlist,
    items: items.filter(
      (item) => item.status === "queued" || item.status === "current"
    ),
  };
}

export async function getChannelBlacklistByChannelId(
  env: AppEnv,
  channelId: string
) {
  const [artistRows, charterRows, songRows, songGroupRows] = await Promise.all([
    getDb(env).query.blacklistedArtists.findMany({
      where: eq(blacklistedArtists.channelId, channelId),
      orderBy: [asc(blacklistedArtists.artistName)],
    }),
    getDb(env).query.blacklistedCharters.findMany({
      where: eq(blacklistedCharters.channelId, channelId),
      orderBy: [asc(blacklistedCharters.charterName)],
    }),
    getDb(env).query.blacklistedSongs.findMany({
      where: eq(blacklistedSongs.channelId, channelId),
      orderBy: [
        asc(blacklistedSongs.songTitle),
        asc(blacklistedSongs.artistName),
      ],
    }),
    getDb(env).query.blacklistedSongGroups.findMany({
      where: eq(blacklistedSongGroups.channelId, channelId),
      orderBy: [
        asc(blacklistedSongGroups.songTitle),
        asc(blacklistedSongGroups.artistName),
      ],
    }),
  ]);

  return {
    blacklistArtists: artistRows,
    blacklistCharters: charterRows,
    blacklistSongs: songRows,
    blacklistSongGroups: songGroupRows,
  };
}

function nextOverlayToken() {
  return createId("ovl");
}

export async function ensureOverlayAccessToken(env: AppEnv, channelId: string) {
  const existing = await getChannelSettingsByChannelId(env, channelId);

  if (existing?.overlayAccessToken) {
    return existing.overlayAccessToken;
  }

  const token = nextOverlayToken();
  await getDb(env)
    .update(channelSettings)
    .set({
      overlayAccessToken: token,
      updatedAt: Date.now(),
    })
    .where(eq(channelSettings.channelId, channelId));

  return token;
}

export async function regenerateOverlayAccessToken(
  env: AppEnv,
  channelId: string
) {
  const token = nextOverlayToken();
  await getDb(env)
    .update(channelSettings)
    .set({
      overlayAccessToken: token,
      updatedAt: Date.now(),
    })
    .where(eq(channelSettings.channelId, channelId));

  return token;
}

export async function getOverlayStateForOwner(
  env: AppEnv,
  ownerUserId: string
) {
  const channel = await getDb(env).query.channels.findFirst({
    where: eq(channels.ownerUserId, ownerUserId),
  });

  if (!channel) {
    return null;
  }

  const [settings, playlist] = await Promise.all([
    getChannelSettingsByChannelId(env, channel.id),
    getPlaylistByChannelId(env, channel.id),
  ]);

  const overlayAccessToken = await ensureOverlayAccessToken(env, channel.id);

  return {
    channel,
    settings,
    overlayAccessToken,
    playlist,
  };
}

export async function getOverlayStateBySlugAndToken(
  env: AppEnv,
  slug: string,
  token: string
) {
  const channel = await getChannelBySlug(env, slug);

  if (!channel) {
    return null;
  }

  const settings = await getChannelSettingsByChannelId(env, channel.id);

  if (!settings) {
    return null;
  }

  const overlayAccessToken = await ensureOverlayAccessToken(env, channel.id);

  if (overlayAccessToken !== token) {
    return null;
  }

  const [playlist, playedRows] = await Promise.all([
    getPlaylistByChannelId(env, channel.id),
    getDb(env).query.playedSongs.findMany({
      where: eq(playedSongs.channelId, channel.id),
      orderBy: [desc(playedSongs.playedAt)],
      limit: 500,
    }),
  ]);

  return {
    channel,
    settings: {
      ...settings,
      overlayAccessToken,
    },
    playlist,
    playedSongs: playedRows,
  };
}

export async function searchPlayedSongRequesters(
  env: AppEnv,
  input: {
    channelId: string;
    query: string;
    limit?: number;
  }
) {
  const normalizedQuery = escapeLikeValue(input.query.trim().toLowerCase());
  if (normalizedQuery.length < 2) {
    return [];
  }

  const rows = await getDb(env).all<{
    requesterId: string;
    requesterLogin: string | null;
    requesterDisplayName: string | null;
    requestCount: number;
  }>(sql`
    SELECT
      requested_by_twitch_user_id AS requesterId,
      requested_by_login AS requesterLogin,
      requested_by_display_name AS requesterDisplayName,
      COUNT(*) AS requestCount
    FROM played_songs
    WHERE channel_id = ${input.channelId}
      AND requested_by_twitch_user_id IS NOT NULL
      AND (
        lower(COALESCE(requested_by_display_name, '')) LIKE ${`%${normalizedQuery}%`}
        OR lower(COALESCE(requested_by_login, '')) LIKE ${`%${normalizedQuery}%`}
      )
    GROUP BY
      requested_by_twitch_user_id,
      requested_by_login,
      requested_by_display_name
    ORDER BY
      CASE
        WHEN lower(COALESCE(requested_by_display_name, '')) LIKE ${`${normalizedQuery}%`} THEN 0
        WHEN lower(COALESCE(requested_by_login, '')) LIKE ${`${normalizedQuery}%`} THEN 1
        ELSE 2
      END,
      lower(COALESCE(requested_by_display_name, requested_by_login, '')) ASC
    LIMIT ${Math.min(Math.max(input.limit ?? 8, 1), 25)}
  `);

  return unwrapD1Rows(rows).map((row) => ({
    requesterId: row.requesterId,
    requesterLogin: row.requesterLogin,
    requesterDisplayName: row.requesterDisplayName,
    requestCount: row.requestCount,
  }));
}

export async function getPlayedHistoryPage(
  env: AppEnv,
  input: {
    channelId: string;
    page: number;
    pageSize: number;
    query?: string;
    requesterId?: string;
  }
) {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(20, Math.max(1, input.pageSize));
  const offset = (page - 1) * pageSize;
  const conditions = [eq(playedSongs.channelId, input.channelId)];

  if (input.requesterId?.trim()) {
    conditions.push(eq(playedSongs.requestedByTwitchUserId, input.requesterId));
  }

  const normalizedQuery = input.query?.trim().toLowerCase();
  if (normalizedQuery) {
    const escapedQuery = `%${escapeLikeValue(normalizedQuery)}%`;
    conditions.push(sql`
      (
        lower(COALESCE(${playedSongs.songTitle}, '')) LIKE ${escapedQuery}
        OR lower(COALESCE(${playedSongs.songArtist}, '')) LIKE ${escapedQuery}
        OR lower(COALESCE(${playedSongs.songAlbum}, '')) LIKE ${escapedQuery}
        OR lower(COALESCE(${playedSongs.songCreator}, '')) LIKE ${escapedQuery}
      )
    `);
  }

  const rows = await getDb(env).query.playedSongs.findMany({
    where: and(...conditions),
    orderBy: [desc(playedSongs.playedAt)],
    limit: pageSize + 1,
    offset,
  });

  return {
    results: rows.slice(0, pageSize),
    page,
    pageSize,
    hasNextPage: rows.length > pageSize,
  };
}

export interface CatalogSearchInput {
  query?: string;
  field?: "any" | "title" | "artist" | "album" | "creator" | "tuning" | "parts";
  title?: string;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string[];
  parts?: string[];
  year?: number[];
  excludeSongIds?: number[];
  excludeGroupedProjectIds?: number[];
  excludeArtistIds?: number[];
  excludeArtistNames?: string[];
  excludeAuthorIds?: number[];
  excludeCreatorNames?: string[];
  page: number;
  pageSize: number;
  sortBy?:
    | "relevance"
    | "artist"
    | "title"
    | "album"
    | "creator"
    | "tuning"
    | "duration"
    | "downloads"
    | "updated";
  sortDirection?: "asc" | "desc";
}

function normalizeSearchPhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchPhrase(value: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "by",
    "feat",
    "featuring",
    "ft",
    "of",
    "the",
  ]);
  return [
    ...new Set(
      normalizeSearchPhrase(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !stopWords.has(token))
    ),
  ];
}

function parseArtistTitleVariant(query: string) {
  const normalized = query.trim();
  const dashMatch = normalized.split(/\s[-–—]\s/);

  if (dashMatch.length === 2) {
    return {
      artist: dashMatch[0].trim(),
      title: dashMatch[1].trim(),
    };
  }

  const byMatch = /^(.*)\s+by\s+(.*)$/i.exec(normalized);
  if (byMatch) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim(),
    };
  }

  return null;
}

function buildTokenMatchScore(
  column:
    | typeof catalogSongs.title
    | typeof catalogSongs.artistName
    | typeof catalogSongs.albumName
    | typeof catalogSongs.creatorName,
  tokens: string[],
  containsWeight: number,
  prefixWeight: number
) {
  if (!tokens.length) {
    return sql`0`;
  }

  return sql.join(
    tokens.map(
      (token) => sql`
    CASE WHEN lower(coalesce(${column}, '')) LIKE ${`${token}%`} THEN ${prefixWeight} ELSE 0 END +
    CASE WHEN lower(coalesce(${column}, '')) LIKE ${`%${token}%`} THEN ${containsWeight} ELSE 0 END
  `
    ),
    sql` + `
  );
}

function buildTokenPresenceCount(
  column:
    | typeof catalogSongs.title
    | typeof catalogSongs.artistName
    | typeof catalogSongs.albumName
    | typeof catalogSongs.creatorName,
  tokens: string[]
) {
  if (!tokens.length) {
    return sql`0`;
  }

  return sql.join(
    tokens.map(
      (token) => sql`
    CASE WHEN lower(coalesce(${column}, '')) LIKE ${`%${token}%`} THEN 1 ELSE 0 END
  `
    ),
    sql` + `
  );
}

function buildNormalizedVariants(query: string) {
  const raw = query.trim();
  const decoded = decodeHtmlEntities(raw);
  const encoded = encodeHtmlEntities(raw);
  const normalized = normalizeSearchPhrase(decoded);
  const encodedNormalized = normalizeSearchPhrase(encoded);
  const collapsed = normalized.replace(/\s+/g, " ").trim();
  const encodedCollapsed = encodedNormalized.replace(/\s+/g, " ").trim();
  const strippedPunctuation = collapsed
    .replace(/[-_:|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const encodedStrippedPunctuation = encodedCollapsed
    .replace(/[-_:|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = collapsed.replace(/[^a-z0-9]+/g, "");
  const encodedCompact = encodedCollapsed.replace(/[^a-z0-9]+/g, "");

  return uniqueCompact([
    normalized,
    collapsed,
    strippedPunctuation,
    compact,
    encodedNormalized,
    encodedCollapsed,
    encodedStrippedPunctuation,
    encodedCompact,
  ]);
}

function buildMatchLike(
  column:
    | typeof catalogSongs.title
    | typeof catalogSongs.artistName
    | typeof catalogSongs.albumName
    | typeof catalogSongs.creatorName
    | typeof catalogSongs.tuningSummary
    | typeof catalogSongs.partsJson,
  query: string
) {
  const variants = buildNormalizedVariants(query).slice(0, 4);
  if (!variants.length) {
    return sql`0`;
  }

  return sql.join(
    variants.map(
      (variant) =>
        sql`lower(coalesce(${column}, '')) LIKE ${`%${escapeLikeValue(variant)}%`}`
    ),
    sql` OR `
  );
}

export async function searchCatalogSongs(
  env: AppEnv,
  input: CatalogSearchInput
) {
  const db = getDb(env);
  const page = input.page;
  const pageSize = input.pageSize;
  const offset = (page - 1) * pageSize;
  const query = input.query?.trim() ?? "";
  const normalizedVariants = buildNormalizedVariants(query);
  const tokens = tokenizeSearchPhrase(query);
  const scoringTokens = tokens.slice(0, 3);
  const scoringVariants = normalizedVariants.slice(0, 2);
  const primaryVariant = scoringVariants[0] ?? null;
  const artistTitleVariant = parseArtistTitleVariant(query);
  const normalizedArtistVariant = artistTitleVariant?.artist
    ? normalizeSearchPhrase(artistTitleVariant.artist)
    : null;
  const normalizedTitleVariant = artistTitleVariant?.title
    ? normalizeSearchPhrase(artistTitleVariant.title)
    : null;
  const artistVariantTokens = tokenizeSearchPhrase(
    artistTitleVariant?.artist ?? ""
  ).slice(0, 2);
  const titleVariantTokens = tokenizeSearchPhrase(
    artistTitleVariant?.title ?? ""
  ).slice(0, 2);
  const field = input.field ?? "any";
  const ftsTerms = tokens.slice(0, 4);
  const ftsQuery = ftsTerms.map((token) => `${token}*`).join(" ");

  const orderSql = (() => {
    switch (input.sortBy) {
      case "artist":
        return sql`catalog_songs.artist_name ${sql.raw(input.sortDirection === "desc" ? "DESC" : "ASC")}, catalog_songs.title ASC`;
      case "title":
        return sql`catalog_songs.title ${sql.raw(input.sortDirection === "desc" ? "DESC" : "ASC")}, catalog_songs.artist_name ASC`;
      case "album":
        return sql`catalog_songs.album_name ${sql.raw(input.sortDirection === "desc" ? "DESC" : "ASC")}, catalog_songs.artist_name ASC, catalog_songs.title ASC`;
      case "creator":
        return sql`catalog_songs.creator_name ${sql.raw(input.sortDirection === "desc" ? "DESC" : "ASC")}, catalog_songs.artist_name ASC, catalog_songs.title ASC`;
      case "tuning":
        return sql`catalog_songs.tuning_summary ${sql.raw(input.sortDirection === "desc" ? "DESC" : "ASC")}, catalog_songs.artist_name ASC, catalog_songs.title ASC`;
      case "duration":
        return sql`catalog_songs.duration_seconds ${sql.raw(input.sortDirection === "desc" ? "DESC" : "ASC")}, catalog_songs.artist_name ASC, catalog_songs.title ASC`;
      case "downloads":
        return sql`catalog_songs.downloads ${sql.raw(input.sortDirection === "asc" ? "ASC" : "DESC")}, catalog_songs.artist_name ASC, catalog_songs.title ASC`;
      case "updated":
        return sql`catalog_songs.source_updated_at ${sql.raw(input.sortDirection === "asc" ? "ASC" : "DESC")}, catalog_songs.source_song_id DESC`;
      default:
        return sql`relevance DESC, catalog_songs.downloads DESC, catalog_songs.artist_name ASC, catalog_songs.title ASC`;
    }
  })();

  const ftsEnabled = field === "any" && ftsQuery.length > 0;

  const basicCondition = (() => {
    if (!query) {
      return sql`0`;
    }

    switch (field) {
      case "title":
        return buildMatchLike(catalogSongs.title, query);
      case "artist":
        return buildMatchLike(catalogSongs.artistName, query);
      case "album":
        return buildMatchLike(catalogSongs.albumName, query);
      case "creator":
        return buildMatchLike(catalogSongs.creatorName, query);
      case "tuning":
        return buildMatchLike(catalogSongs.tuningSummary, query);
      case "parts":
        return buildMatchLike(catalogSongs.partsJson, query);
      default:
        return sql`
          ${ftsEnabled ? sql`catalog_songs.rowid IN (SELECT rowid FROM fts_matches)` : sql`0`}
          OR ${buildMatchLike(catalogSongs.title, query)}
          OR ${buildMatchLike(catalogSongs.artistName, query)}
          OR ${buildMatchLike(catalogSongs.albumName, query)}
          OR ${buildMatchLike(catalogSongs.creatorName, query)}
        `;
    }
  })();

  const advancedConditions = [
    input.title ? buildMatchLike(catalogSongs.title, input.title) : null,
    input.artist ? buildMatchLike(catalogSongs.artistName, input.artist) : null,
    input.album ? buildMatchLike(catalogSongs.albumName, input.album) : null,
    input.creator
      ? buildMatchLike(catalogSongs.creatorName, input.creator)
      : null,
    input.tuning?.length
      ? sql`(${sql.join(
          input.tuning.map((tuning) =>
            buildMatchLike(catalogSongs.tuningSummary, tuning)
          ),
          sql` OR `
        )})`
      : null,
    input.parts?.length
      ? sql`(${sql.join(
          input.parts.map((part) =>
            buildMatchLike(catalogSongs.partsJson, part)
          ),
          sql` OR `
        )})`
      : null,
    input.year?.length
      ? sql`(${sql.join(
          input.year.map((year) => sql`${catalogSongs.year} = ${year}`),
          sql` OR `
        )})`
      : null,
  ].filter(
    (condition): condition is ReturnType<typeof sql> => condition !== null
  );

  const hasAdvancedFilters = advancedConditions.length > 0;
  const advancedCondition = hasAdvancedFilters
    ? sql.join(advancedConditions, sql` AND `)
    : null;
  const baseWhereCondition =
    query && advancedCondition
      ? sql`(${basicCondition}) AND (${advancedCondition})`
      : query
        ? basicCondition
        : (advancedCondition ?? sql`1 = 1`);
  const normalizedExcludedArtists = uniqueCompact(
    (input.excludeArtistNames ?? []).map((name) => normalizeSearchPhrase(name))
  );
  const normalizedExcludedCreators = uniqueCompact(
    (input.excludeCreatorNames ?? []).map((name) => normalizeSearchPhrase(name))
  );
  const excludedArtistIds = [...new Set(input.excludeArtistIds ?? [])].filter(
    (artistId): artistId is number => Number.isInteger(artistId) && artistId > 0
  );
  const excludedAuthorIds = [...new Set(input.excludeAuthorIds ?? [])].filter(
    (authorId): authorId is number => Number.isInteger(authorId) && authorId > 0
  );
  const excludedSongIds = [...new Set(input.excludeSongIds ?? [])].filter(
    (songId): songId is number => Number.isInteger(songId) && songId > 0
  );
  const excludedGroupedProjectIds = [
    ...new Set(input.excludeGroupedProjectIds ?? []),
  ].filter(
    (groupedProjectId): groupedProjectId is number =>
      Number.isInteger(groupedProjectId) && groupedProjectId > 0
  );
  const blacklistConditions = [
    excludedSongIds.length
      ? sql`${catalogSongs.sourceSongId} NOT IN ${sql`(${sql.join(
          excludedSongIds.map((songId) => sql`${songId}`),
          sql`, `
        )})`}`
      : null,
    excludedGroupedProjectIds.length
      ? sql`(${catalogSongs.groupedProjectId} IS NULL OR ${catalogSongs.groupedProjectId} NOT IN ${sql`(${sql.join(
          excludedGroupedProjectIds.map(
            (groupedProjectId) => sql`${groupedProjectId}`
          ),
          sql`, `
        )})`})`
      : null,
    excludedArtistIds.length
      ? sql`(${catalogSongs.artistId} IS NULL OR ${catalogSongs.artistId} NOT IN ${sql`(${sql.join(
          excludedArtistIds.map((artistId) => sql`${artistId}`),
          sql`, `
        )})`})`
      : null,
    normalizedExcludedArtists.length
      ? sql`lower(coalesce(${catalogSongs.artistName}, '')) NOT IN ${sql`(${sql.join(
          normalizedExcludedArtists.map((name) => sql`${name}`),
          sql`, `
        )})`}`
      : null,
    excludedAuthorIds.length
      ? sql`(${catalogSongs.authorId} IS NULL OR ${catalogSongs.authorId} NOT IN ${sql`(${sql.join(
          excludedAuthorIds.map((authorId) => sql`${authorId}`),
          sql`, `
        )})`})`
      : null,
    normalizedExcludedCreators.length
      ? sql`lower(coalesce(${catalogSongs.creatorName}, '')) NOT IN ${sql`(${sql.join(
          normalizedExcludedCreators.map((name) => sql`${name}`),
          sql`, `
        )})`}`
      : null,
  ].filter(
    (condition): condition is ReturnType<typeof sql> => condition !== null
  );
  const whereCondition =
    blacklistConditions.length > 0
      ? sql`(${baseWhereCondition}) AND (${sql.join(blacklistConditions, sql` AND `)})`
      : baseWhereCondition;
  const hasBlacklistFilters = blacklistConditions.length > 0;

  const titleTokenScore = buildTokenMatchScore(
    catalogSongs.title,
    scoringTokens,
    10,
    16
  );
  const artistTokenScore = buildTokenMatchScore(
    catalogSongs.artistName,
    scoringTokens,
    9,
    14
  );
  const albumTokenScore = buildTokenMatchScore(
    catalogSongs.albumName,
    scoringTokens,
    4,
    6
  );
  const creatorTokenScore = buildTokenMatchScore(
    catalogSongs.creatorName,
    scoringTokens,
    3,
    5
  );
  const titleTokenPresence = buildTokenPresenceCount(
    catalogSongs.title,
    scoringTokens
  );
  const artistTokenPresence = buildTokenPresenceCount(
    catalogSongs.artistName,
    scoringTokens
  );
  const splitArtistPresence = buildTokenPresenceCount(
    catalogSongs.artistName,
    artistVariantTokens
  );
  const splitTitlePresence = buildTokenPresenceCount(
    catalogSongs.title,
    titleVariantTokens
  );
  const splitArtistTitleBonus =
    normalizedArtistVariant && normalizedTitleVariant
      ? sql`
          CASE WHEN lower(catalog_songs.artist_name) LIKE ${`%${normalizedArtistVariant}%`}
                    AND lower(catalog_songs.title) LIKE ${`%${normalizedTitleVariant}%`}
               THEN 85 ELSE 0 END +
          CASE WHEN ${splitArtistPresence} >= ${Math.max(1, Math.min(artistVariantTokens.length, 2))}
                    AND ${splitTitlePresence} >= ${Math.max(1, Math.min(titleVariantTokens.length, 2))}
               THEN 65 ELSE 0 END +
          CASE WHEN lower(catalog_songs.artist_name) LIKE ${`%${normalizedTitleVariant}%`}
                    AND lower(catalog_songs.title) LIKE ${`%${normalizedArtistVariant}%`}
               THEN 45 ELSE 0 END
        `
      : sql`0`;

  const primaryVariantPrefix = primaryVariant
    ? `${escapeLikeValue(primaryVariant)}%`
    : null;
  const primaryFieldScore = (
    column:
      | typeof catalogSongs.title
      | typeof catalogSongs.artistName
      | typeof catalogSongs.albumName
      | typeof catalogSongs.creatorName
      | typeof catalogSongs.tuningSummary,
    exactWeight: number,
    prefixWeight: number
  ) =>
    primaryVariant && primaryVariantPrefix
      ? sql`
          CASE WHEN lower(coalesce(${column}, '')) = ${primaryVariant} THEN ${exactWeight} ELSE 0 END +
          CASE WHEN lower(coalesce(${column}, '')) LIKE ${primaryVariantPrefix} THEN ${prefixWeight} ELSE 0 END
        `
      : sql`0`;

  const relevanceSql = query
    ? field === "artist"
      ? sql`
          ${primaryFieldScore(catalogSongs.artistName, 90, 45)} +
          ${artistTokenScore} +
          CASE WHEN ${buildMatchLike(catalogSongs.artistName, query)} THEN 20 ELSE 0 END
        `
      : field === "title"
        ? sql`
            ${primaryFieldScore(catalogSongs.title, 90, 45)} +
            ${titleTokenScore} +
            CASE WHEN ${buildMatchLike(catalogSongs.title, query)} THEN 20 ELSE 0 END
          `
        : field === "album"
          ? sql`
              ${primaryFieldScore(catalogSongs.albumName, 80, 35)} +
              ${albumTokenScore} +
              CASE WHEN ${buildMatchLike(catalogSongs.albumName, query)} THEN 24 ELSE 0 END
            `
          : field === "creator"
            ? sql`
                ${primaryFieldScore(catalogSongs.creatorName, 80, 35)} +
                ${creatorTokenScore} +
                CASE WHEN ${buildMatchLike(catalogSongs.creatorName, query)} THEN 24 ELSE 0 END
              `
            : field === "tuning"
              ? sql`
                  ${primaryFieldScore(catalogSongs.tuningSummary, 70, 30)} +
                  CASE WHEN ${buildMatchLike(catalogSongs.tuningSummary, query)} THEN 18 ELSE 0 END
                `
              : field === "parts"
                ? sql`
                    CASE WHEN ${buildMatchLike(catalogSongs.partsJson, query)} THEN 30 ELSE 0 END
                  `
                : sql`
                    CASE WHEN ${ftsEnabled ? sql`catalog_songs.rowid IN (SELECT rowid FROM fts_matches)` : sql`0`} THEN 80 ELSE 0 END +
                    CASE WHEN ${titleTokenPresence} > 0 AND ${artistTokenPresence} > 0 THEN 45 ELSE 0 END +
                    ${splitArtistTitleBonus} +
                    ${primaryFieldScore(catalogSongs.title, 62, 34)} +
                    ${primaryFieldScore(catalogSongs.artistName, 52, 28)} +
                    ${primaryFieldScore(catalogSongs.albumName, 28, 12)} +
                    ${titleTokenScore} +
                    ${artistTokenScore} +
                    ${albumTokenScore} +
                    ${creatorTokenScore} +
                    CASE WHEN ${buildMatchLike(catalogSongs.albumName, query)} THEN 8 ELSE 0 END +
                    CASE WHEN ${buildMatchLike(catalogSongs.creatorName, query)} THEN 6 ELSE 0 END
                  `
    : sql`0`;

  const totalResultPromise = db.all<{ count: number }>(sql`
    WITH fts_matches AS (
      ${
        ftsEnabled
          ? sql`SELECT rowid FROM catalog_song_fts WHERE catalog_song_fts MATCH ${ftsQuery}`
          : sql`SELECT NULL AS rowid WHERE 0`
      }
    ),
    matches AS (
      SELECT
        catalog_songs.id
      FROM catalog_songs
      WHERE ${whereCondition}
    )
    SELECT count(*) AS count FROM matches
  `);
  const unfilteredTotalResultPromise = hasBlacklistFilters
    ? db.all<{ count: number }>(sql`
        WITH fts_matches AS (
          ${
            ftsEnabled
              ? sql`SELECT rowid FROM catalog_song_fts WHERE catalog_song_fts MATCH ${ftsQuery}`
              : sql`SELECT NULL AS rowid WHERE 0`
          }
        ),
        matches AS (
          SELECT
            catalog_songs.id
          FROM catalog_songs
          WHERE ${baseWhereCondition}
        )
        SELECT count(*) AS count FROM matches
      `)
    : Promise.resolve(null);

  const rowsPromise = db.all<{
    id: string;
    sourceSongId: number;
    groupedProjectId: number | null;
    artistId: number | null;
    authorId: number | null;
    title: string;
    artistName: string;
    albumName: string | null;
    creatorName: string | null;
    tuningSummary: string | null;
    partsJson: string;
    durationText: string | null;
    durationSeconds: number | null;
    year: number | null;
    sourceUpdatedAt: number | null;
    downloads: number;
    hasLyrics: number;
    source: string;
    relevance: number;
  }>(sql`
    WITH fts_matches AS (
      ${
        ftsEnabled
          ? sql`SELECT rowid FROM catalog_song_fts WHERE catalog_song_fts MATCH ${ftsQuery}`
          : sql`SELECT NULL AS rowid WHERE 0`
      }
    )
    SELECT
        catalog_songs.id,
        catalog_songs.source_song_id AS sourceSongId,
        catalog_songs.grouped_project_id AS groupedProjectId,
        catalog_songs.artist_id AS artistId,
        catalog_songs.author_id AS authorId,
        catalog_songs.title,
      catalog_songs.artist_name AS artistName,
      catalog_songs.album_name AS albumName,
      catalog_songs.creator_name AS creatorName,
      catalog_songs.tuning_summary AS tuningSummary,
      catalog_songs.parts_json AS partsJson,
      catalog_songs.duration_text AS durationText,
      catalog_songs.duration_seconds AS durationSeconds,
      catalog_songs.year,
      catalog_songs.source_updated_at AS sourceUpdatedAt,
      catalog_songs.downloads,
      catalog_songs.has_lyrics AS hasLyrics,
      catalog_songs.source,
      (${relevanceSql}) AS relevance
    FROM catalog_songs
    WHERE ${whereCondition}
    ORDER BY ${orderSql}
    LIMIT ${pageSize}
    OFFSET ${offset}
  `);
  const [totalResult, unfilteredTotalResult, rows] = await Promise.all([
    totalResultPromise,
    unfilteredTotalResultPromise,
    rowsPromise,
  ]);
  const totalRows = unwrapD1Rows(totalResult);
  const unfilteredTotalRows = unfilteredTotalResult
    ? unwrapD1Rows(unfilteredTotalResult)
    : [];
  const resultRows = unwrapD1Rows(rows);
  const visibleTotal = totalRows[0]?.count ?? 0;
  const unfilteredTotal = unfilteredTotalRows[0]?.count ?? visibleTotal;

  return {
    results: resultRows.map((row) => ({
      id: row.id,
      groupedProjectId: row.groupedProjectId ?? undefined,
      artistId: row.artistId ?? undefined,
      authorId: row.authorId ?? undefined,
      title: decodeHtmlEntities(row.title),
      artist: decodeHtmlEntities(row.artistName),
      album: row.albumName ? decodeHtmlEntities(row.albumName) : undefined,
      creator: row.creatorName
        ? decodeHtmlEntities(row.creatorName)
        : undefined,
      tuning: row.tuningSummary
        ? decodeHtmlEntities(row.tuningSummary)
        : undefined,
      parts: parseJsonStringArray(row.partsJson),
      durationText: row.durationText ?? undefined,
      year: row.year ?? undefined,
      sourceUpdatedAt: row.sourceUpdatedAt ?? undefined,
      sourceId: row.sourceSongId,
      hasLyrics: !!row.hasLyrics,
      downloads: row.downloads,
      source: row.source,
      sourceUrl: normalizeSongSourceUrl({
        source: row.source,
        sourceId: row.sourceSongId,
      }),
      score: row.relevance,
    })),
    total: visibleTotal,
    hiddenBlacklistedCount: Math.max(0, unfilteredTotal - visibleTotal),
    page,
    pageSize,
  };
}

export async function getCatalogSongBySourceId(
  env: AppEnv,
  sourceSongId: number
) {
  const row = await getDb(env).query.catalogSongs.findFirst({
    where: eq(catalogSongs.sourceSongId, sourceSongId),
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    groupedProjectId: row.groupedProjectId ?? undefined,
    artistId: row.artistId ?? undefined,
    authorId: row.authorId ?? undefined,
    title: decodeHtmlEntities(row.title),
    artist: decodeHtmlEntities(row.artistName),
    album: row.albumName ? decodeHtmlEntities(row.albumName) : undefined,
    creator: row.creatorName ? decodeHtmlEntities(row.creatorName) : undefined,
    tuning: row.tuningSummary
      ? decodeHtmlEntities(row.tuningSummary)
      : undefined,
    parts: parseJsonStringArray(row.partsJson),
    durationText: row.durationText ?? undefined,
    year: row.year ?? undefined,
    sourceId: row.sourceSongId,
    hasLyrics: !!row.hasLyrics,
    downloads: row.downloads,
    source: row.source,
    sourceUrl: normalizeSongSourceUrl({
      source: row.source,
      sourceId: row.sourceSongId,
    }),
  };
}

export async function searchCatalogArtistsForBlacklist(
  env: AppEnv,
  input: {
    query: string;
    limit?: number;
  }
) {
  const normalizedQuery = escapeLikeValue(input.query.toLowerCase());
  if (normalizedQuery.length < 2) {
    return [];
  }

  const rows = await getDb(env).all<{
    artistId: number;
    artistName: string;
    trackCount: number;
  }>(sql`
    SELECT
      artist_id AS artistId,
      artist_name AS artistName,
      COUNT(*) AS trackCount
    FROM catalog_songs
    WHERE artist_id IS NOT NULL
      AND lower(artist_name) LIKE ${`%${normalizedQuery}%`}
    GROUP BY artist_id, artist_name
    ORDER BY
      CASE
        WHEN lower(artist_name) LIKE ${`${normalizedQuery}%`} THEN 0
        ELSE 1
      END,
      artist_name ASC
    LIMIT ${Math.min(Math.max(input.limit ?? 8, 1), 25)}
  `);

  return unwrapD1Rows(rows).map((row) => ({
    artistId: row.artistId,
    artistName: decodeHtmlEntities(row.artistName),
    trackCount: row.trackCount,
  }));
}

export async function searchCatalogSongsForBlacklist(
  env: AppEnv,
  input: {
    query: string;
    limit?: number;
  }
) {
  const normalizedQuery = escapeLikeValue(input.query.toLowerCase());
  if (normalizedQuery.length < 2) {
    return [];
  }

  const rows = await getDb(env).all<{
    songId: number;
    title: string;
    artistId: number | null;
    artistName: string;
  }>(sql`
    SELECT
      source_song_id AS songId,
      title,
      artist_id AS artistId,
      artist_name AS artistName
    FROM catalog_songs
    WHERE lower(title) LIKE ${`%${normalizedQuery}%`}
    ORDER BY
      CASE
        WHEN lower(title) LIKE ${`${normalizedQuery}%`} THEN 0
        ELSE 1
      END,
      title ASC,
      artist_name ASC
    LIMIT ${Math.min(Math.max(input.limit ?? 8, 1), 25)}
  `);

  return unwrapD1Rows(rows).map((row) => ({
    songId: row.songId,
    songTitle: decodeHtmlEntities(row.title),
    artistId: row.artistId,
    artistName: decodeHtmlEntities(row.artistName),
  }));
}

export async function searchCatalogSongGroupsForBlacklist(
  env: AppEnv,
  input: {
    query: string;
    limit?: number;
  }
) {
  const normalizedQuery = escapeLikeValue(input.query.toLowerCase());
  if (normalizedQuery.length < 2) {
    return [];
  }

  const rows = await getDb(env).all<{
    groupedProjectId: number;
    title: string;
    artistId: number | null;
    artistName: string;
    versionCount: number;
  }>(sql`
    WITH ranked_matches AS (
      SELECT
        grouped_project_id AS groupedProjectId,
        title,
        artist_id AS artistId,
        artist_name AS artistName,
        COUNT(*) OVER (PARTITION BY grouped_project_id) AS versionCount,
        ROW_NUMBER() OVER (
          PARTITION BY grouped_project_id
          ORDER BY coalesce(source_updated_at, 0) DESC, source_song_id DESC
        ) AS rowNumber
      FROM catalog_songs
      WHERE grouped_project_id IS NOT NULL
        AND lower(title) LIKE ${`%${normalizedQuery}%`}
    )
    SELECT
      groupedProjectId,
      title,
      artistId,
      artistName,
      versionCount
    FROM ranked_matches
    WHERE rowNumber = 1
    ORDER BY
      CASE
        WHEN lower(title) LIKE ${`${normalizedQuery}%`} THEN 0
        ELSE 1
      END,
      title ASC,
      artistName ASC
    LIMIT ${Math.min(Math.max(input.limit ?? 8, 1), 25)}
  `);

  return unwrapD1Rows(rows).map((row) => ({
    groupedProjectId: row.groupedProjectId,
    songTitle: decodeHtmlEntities(row.title),
    artistId: row.artistId,
    artistName: decodeHtmlEntities(row.artistName),
    versionCount: row.versionCount,
  }));
}

export async function searchCatalogChartersForBlacklist(
  env: AppEnv,
  input: {
    query: string;
    limit?: number;
  }
) {
  const normalizedQuery = escapeLikeValue(input.query.toLowerCase());
  if (normalizedQuery.length < 2) {
    return [];
  }

  const rows = await getDb(env).all<{
    charterId: number;
    charterName: string;
    trackCount: number;
  }>(sql`
    SELECT
      author_id AS charterId,
      creator_name AS charterName,
      COUNT(*) AS trackCount
    FROM catalog_songs
    WHERE author_id IS NOT NULL
      AND trim(coalesce(creator_name, '')) != ''
      AND lower(creator_name) LIKE ${`%${normalizedQuery}%`}
    GROUP BY author_id, creator_name
    ORDER BY
      CASE
        WHEN lower(creator_name) LIKE ${`${normalizedQuery}%`} THEN 0
        ELSE 1
      END,
      creator_name ASC
    LIMIT ${Math.min(Math.max(input.limit ?? 8, 1), 25)}
  `);

  return unwrapD1Rows(rows).map((row) => ({
    charterId: row.charterId,
    charterName: decodeHtmlEntities(row.charterName),
    trackCount: row.trackCount,
  }));
}

export async function getCatalogSongsByIds(env: AppEnv, songIds: string[]) {
  const uniqueIds = [...new Set(songIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = await getDb(env).query.catalogSongs.findMany({
    where: inArray(catalogSongs.id, uniqueIds),
  });

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.sourceSongId,
    groupedProjectId: row.groupedProjectId ?? undefined,
    artistId: row.artistId ?? undefined,
    authorId: row.authorId ?? undefined,
    source: row.source,
    sourceUrl: normalizeSongSourceUrl({
      source: row.source,
      sourceId: row.sourceSongId,
    }),
    sourceUpdatedAt: row.sourceUpdatedAt ?? undefined,
    downloads: row.downloads,
  }));
}

export async function getCatalogSearchFilterOptions(env: AppEnv) {
  const db = getDb(env);

  const [yearRows, tuningRows] = await Promise.all([
    db
      .selectDistinct({ year: catalogSongs.year })
      .from(catalogSongs)
      .where(sql`${catalogSongs.year} IS NOT NULL`)
      .orderBy(desc(catalogSongs.year)),
    db
      .selectDistinct({ tuning: catalogSongs.tuningSummary })
      .from(catalogSongs)
      .where(
        sql`${catalogSongs.tuningSummary} IS NOT NULL AND trim(${catalogSongs.tuningSummary}) != ''`
      )
      .orderBy(asc(catalogSongs.tuningSummary)),
  ]);

  return {
    years: yearRows
      .map((row) => row.year)
      .filter((year): year is number => year != null),
    tunings: tuningRows
      .map((row) => row.tuning)
      .filter((tuning): tuning is string => !!tuning)
      .map((tuning) => decodeHtmlEntities(tuning)),
  };
}

export async function upsertCatalogSongs(
  env: AppEnv,
  songs: CatalogSongInsert[]
) {
  if (!songs.length) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      changedSongIds: [] as string[],
    };
  }

  const db = getDb(env);
  const source = songs[0]?.source ?? "library";
  const sourceSongIds = [
    ...new Set(
      songs
        .map((song) => song.sourceSongId)
        .filter((value): value is number => value != null)
    ),
  ];
  const existingRows = sourceSongIds.length
    ? await db.all<{
        id: string;
        source: string;
        sourceSongId: number;
        artistId: number | null;
        title: string;
        artistName: string;
        albumName: string | null;
        authorId: number | null;
        creatorName: string | null;
        groupedProjectId: number | null;
        artistsFtJson: string | null;
        tagsJson: string | null;
        genresJson: string | null;
        subgenresJson: string | null;
        genreName: string | null;
        subgenreName: string | null;
        tuningSummary: string | null;
        leadTuningId: number | null;
        leadTuningName: string | null;
        rhythmTuningId: number | null;
        rhythmTuningName: string | null;
        bassTuningId: number | null;
        bassTuningName: string | null;
        altLeadTuningId: number | null;
        altRhythmTuningId: number | null;
        altBassTuningId: number | null;
        bonusLeadTuningId: number | null;
        bonusRhythmTuningId: number | null;
        bonusBassTuningId: number | null;
        partsJson: string;
        platformsJson: string | null;
        durationText: string | null;
        durationSeconds: number | null;
        year: number | null;
        versionText: string | null;
        downloads: number;
        views: number;
        commentsCount: number;
        reportsCount: number;
        collectedCount: number;
        hasLyrics: number;
        hasLead: number;
        hasRhythm: number;
        hasBass: number;
        hasVocals: number;
        hasBonusArrangements: number;
        hasAlternateArrangements: number;
        isDisabled: number;
        isAbandoned: number;
        isTrending: number;
        filePcAvailable: number;
        fileMacAvailable: number;
        albumArtUrl: string | null;
        sourceCreatedAt: number | null;
        sourceUpdatedAt: number | null;
        firstSeenAt: number;
        lastSeenAt: number;
        createdAt: number;
        updatedAt: number;
      }>(
        sql`
          SELECT
            id,
            source,
            source_song_id AS sourceSongId,
            artist_id AS artistId,
            title,
            artist_name AS artistName,
            album_name AS albumName,
            author_id AS authorId,
            creator_name AS creatorName,
            grouped_project_id AS groupedProjectId,
            artists_ft_json AS artistsFtJson,
            tags_json AS tagsJson,
            genres_json AS genresJson,
            subgenres_json AS subgenresJson,
            genre_name AS genreName,
            subgenre_name AS subgenreName,
            tuning_summary AS tuningSummary,
            lead_tuning_id AS leadTuningId,
            lead_tuning_name AS leadTuningName,
            rhythm_tuning_id AS rhythmTuningId,
            rhythm_tuning_name AS rhythmTuningName,
            bass_tuning_id AS bassTuningId,
            bass_tuning_name AS bassTuningName,
            alt_lead_tuning_id AS altLeadTuningId,
            alt_rhythm_tuning_id AS altRhythmTuningId,
            alt_bass_tuning_id AS altBassTuningId,
            bonus_lead_tuning_id AS bonusLeadTuningId,
            bonus_rhythm_tuning_id AS bonusRhythmTuningId,
            bonus_bass_tuning_id AS bonusBassTuningId,
            parts_json AS partsJson,
            platforms_json AS platformsJson,
            duration_text AS durationText,
            duration_seconds AS durationSeconds,
            year,
            version_text AS versionText,
            downloads,
            views,
            comments_count AS commentsCount,
            reports_count AS reportsCount,
            collected_count AS collectedCount,
            has_lyrics AS hasLyrics,
            has_lead AS hasLead,
            has_rhythm AS hasRhythm,
            has_bass AS hasBass,
            has_vocals AS hasVocals,
            has_bonus_arrangements AS hasBonusArrangements,
            has_alternate_arrangements AS hasAlternateArrangements,
            is_disabled AS isDisabled,
            is_abandoned AS isAbandoned,
            is_trending AS isTrending,
            file_pc_available AS filePcAvailable,
            file_mac_available AS fileMacAvailable,
            album_art_url AS albumArtUrl,
            source_created_at AS sourceCreatedAt,
            source_updated_at AS sourceUpdatedAt,
            first_seen_at AS firstSeenAt,
            last_seen_at AS lastSeenAt,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM catalog_songs
          WHERE source = ${source}
            AND source_song_id IN (${sql.join(
              sourceSongIds.map((id) => sql`${id}`),
              sql`, `
            )})
        `
      )
    : [];
  const existingCatalogRows = unwrapD1Rows(existingRows);
  const existingBySourceSongId = new Map<
    number,
    (typeof existingCatalogRows)[number]
  >(existingCatalogRows.map((row) => [row.sourceSongId, row]));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const changedSongIds: string[] = [];

  for (const song of songs) {
    if (song.sourceSongId == null) {
      continue;
    }

    const existing = existingBySourceSongId.get(song.sourceSongId);

    if (existing) {
      if (!catalogSongNeedsUpdate(existing, song)) {
        skipped += 1;
        continue;
      }

      await db
        .update(catalogSongs)
        .set({
          artistId: song.artistId ?? null,
          title: song.title,
          artistName: song.artistName,
          albumName: song.albumName ?? null,
          authorId: song.authorId ?? null,
          creatorName: song.creatorName ?? null,
          groupedProjectId: song.groupedProjectId ?? null,
          artistsFtJson: song.artistsFtJson ?? "[]",
          tagsJson: song.tagsJson ?? "[]",
          genresJson: song.genresJson ?? "[]",
          subgenresJson: song.subgenresJson ?? "[]",
          genreName: song.genreName ?? null,
          subgenreName: song.subgenreName ?? null,
          tuningSummary: song.tuningSummary ?? null,
          leadTuningId: song.leadTuningId ?? null,
          leadTuningName: song.leadTuningName ?? null,
          rhythmTuningId: song.rhythmTuningId ?? null,
          rhythmTuningName: song.rhythmTuningName ?? null,
          bassTuningId: song.bassTuningId ?? null,
          bassTuningName: song.bassTuningName ?? null,
          altLeadTuningId: song.altLeadTuningId ?? null,
          altRhythmTuningId: song.altRhythmTuningId ?? null,
          altBassTuningId: song.altBassTuningId ?? null,
          bonusLeadTuningId: song.bonusLeadTuningId ?? null,
          bonusRhythmTuningId: song.bonusRhythmTuningId ?? null,
          bonusBassTuningId: song.bonusBassTuningId ?? null,
          partsJson: song.partsJson ?? "[]",
          platformsJson: song.platformsJson ?? "[]",
          durationText: song.durationText ?? null,
          durationSeconds: song.durationSeconds ?? null,
          year: song.year ?? null,
          versionText: song.versionText ?? null,
          downloads: song.downloads ?? 0,
          views: song.views ?? 0,
          commentsCount: song.commentsCount ?? 0,
          reportsCount: song.reportsCount ?? 0,
          collectedCount: song.collectedCount ?? 0,
          hasLyrics: song.hasLyrics ?? false,
          hasLead: song.hasLead ?? false,
          hasRhythm: song.hasRhythm ?? false,
          hasBass: song.hasBass ?? false,
          hasVocals: song.hasVocals ?? false,
          hasBonusArrangements: song.hasBonusArrangements ?? false,
          hasAlternateArrangements: song.hasAlternateArrangements ?? false,
          isDisabled: song.isDisabled ?? false,
          isAbandoned: song.isAbandoned ?? false,
          isTrending: song.isTrending ?? false,
          filePcAvailable: song.filePcAvailable ?? false,
          fileMacAvailable: song.fileMacAvailable ?? false,
          albumArtUrl: song.albumArtUrl ?? null,
          sourceCreatedAt: song.sourceCreatedAt ?? null,
          sourceUpdatedAt: song.sourceUpdatedAt ?? null,
          lastSeenAt: song.lastSeenAt ?? Date.now(),
          updatedAt: song.updatedAt ?? Date.now(),
        })
        .where(eq(catalogSongs.id, existing.id));
      updated += 1;
      changedSongIds.push(existing.id);
    } else {
      await db.insert(catalogSongs).values(song);
      inserted += 1;
      changedSongIds.push(song.id);
    }
  }

  return { inserted, updated, skipped, changedSongIds };
}

export async function rebuildCatalogSongFts(env: AppEnv) {
  const db = getDb(env);

  await db.run(sql`DELETE FROM catalog_song_fts`);
  await db.run(sql`
    INSERT INTO catalog_song_fts (
      rowid,
      song_id,
      title,
      artist_name,
      album_name,
      creator_name,
      genre_name,
      subgenre_name,
      tuning_summary,
      parts_summary,
      artists_ft
    )
    SELECT
      rowid,
      id,
      title,
      artist_name,
      coalesce(album_name, ''),
      coalesce(creator_name, ''),
      coalesce(genre_name, ''),
      coalesce(subgenre_name, ''),
      coalesce(tuning_summary, ''),
      coalesce(parts_json, '[]'),
      coalesce(artists_ft_json, '[]')
    FROM catalog_songs
  `);
}

export async function refreshCatalogSongFts(env: AppEnv, songIds: string[]) {
  if (!songIds.length) {
    return;
  }

  const db = getDb(env);

  for (const chunk of chunkArray([...new Set(songIds)], 250)) {
    await db.run(
      sql`DELETE FROM catalog_song_fts WHERE song_id IN (${sql.join(
        chunk.map((id) => sql`${id}`),
        sql`, `
      )})`
    );
    await db.run(sql`
      INSERT INTO catalog_song_fts (
        rowid,
        song_id,
        title,
        artist_name,
        album_name,
        creator_name,
        genre_name,
        subgenre_name,
        tuning_summary,
        parts_summary,
        artists_ft
      )
      SELECT
        rowid,
        id,
        title,
        artist_name,
        coalesce(album_name, ''),
        coalesce(creator_name, ''),
        coalesce(genre_name, ''),
        coalesce(subgenre_name, ''),
        coalesce(tuning_summary, ''),
        coalesce(parts_json, '[]'),
        coalesce(artists_ft_json, '[]')
      FROM catalog_songs
      WHERE id IN (${sql.join(
        chunk.map((id) => sql`${id}`),
        sql`, `
      )})
    `);
  }
}

export async function setBotEnabled(
  env: AppEnv,
  channelId: string,
  enabled: boolean,
  readyState: string
) {
  await getDb(env)
    .update(channels)
    .set({
      botEnabled: enabled,
      botReadyState: readyState,
      updatedAt: Date.now(),
    })
    .where(eq(channels.id, channelId));
}

export async function setChannelLiveState(
  env: AppEnv,
  channelId: string,
  isLive: boolean
) {
  await getDb(env)
    .update(channels)
    .set({
      isLive,
      updatedAt: Date.now(),
    })
    .where(eq(channels.id, channelId));
}

export async function updateSettings(
  env: AppEnv,
  channelId: string,
  input: {
    botChannelEnabled: boolean;
    moderatorCanManageRequests: boolean;
    moderatorCanManageBlacklist: boolean;
    moderatorCanManageSetlist: boolean;
    moderatorCanManageBlockedChatters: boolean;
    moderatorCanViewVipTokens: boolean;
    moderatorCanManageVipTokens: boolean;
    moderatorCanManageTags: boolean;
    requestsEnabled: boolean;
    allowAnyoneToRequest: boolean;
    allowSubscribersToRequest: boolean;
    allowVipsToRequest: boolean;
    onlyOfficialDlc: boolean;
    allowedTunings: string[];
    requiredPaths: string[];
    requiredPathsMatchMode: "any" | "all";
    maxQueueSize: number;
    maxViewerRequestsAtOnce: number;
    maxSubscriberRequestsAtOnce: number;
    maxVipViewerRequestsAtOnce: number;
    maxVipSubscriberRequestsAtOnce: number;
    limitRegularRequestsEnabled: boolean;
    regularRequestsPerPeriod: number;
    regularRequestPeriodSeconds: number;
    limitVipRequestsEnabled: boolean;
    vipRequestsPerPeriod: number;
    vipRequestPeriodSeconds: number;
    blacklistEnabled: boolean;
    letSetlistBypassBlacklist: boolean;
    setlistEnabled: boolean;
    subscribersMustFollowSetlist: boolean;
    autoGrantVipTokenToSubscribers: boolean;
    autoGrantVipTokensToSubGifters: boolean;
    autoGrantVipTokensToGiftRecipients: boolean;
    autoGrantVipTokensForCheers: boolean;
    cheerBitsPerVipToken: number;
    cheerMinimumTokenPercent: 25 | 50 | 75 | 100;
    duplicateWindowSeconds: number;
    commandPrefix: string;
  }
) {
  const moderatorCanViewVipTokens =
    input.moderatorCanViewVipTokens || input.moderatorCanManageVipTokens;

  await getDb(env)
    .update(channelSettings)
    .set({
      botChannelEnabled: input.botChannelEnabled,
      moderatorCanManageRequests: input.moderatorCanManageRequests,
      moderatorCanManageBlacklist: input.moderatorCanManageBlacklist,
      moderatorCanManageSetlist: input.moderatorCanManageSetlist,
      moderatorCanManageBlockedChatters:
        input.moderatorCanManageBlockedChatters,
      moderatorCanViewVipTokens,
      moderatorCanManageVipTokens: input.moderatorCanManageVipTokens,
      moderatorCanManageTags: input.moderatorCanManageTags,
      requestsEnabled: input.requestsEnabled,
      allowAnyoneToRequest: input.allowAnyoneToRequest,
      allowSubscribersToRequest: input.allowSubscribersToRequest,
      allowVipsToRequest: input.allowVipsToRequest,
      onlyOfficialDlc: input.onlyOfficialDlc,
      allowedTuningsJson: JSON.stringify(input.allowedTunings),
      requiredPathsJson: JSON.stringify(input.requiredPaths),
      requiredPathsMatchMode: input.requiredPathsMatchMode,
      maxQueueSize: input.maxQueueSize,
      maxViewerRequestsAtOnce: input.maxViewerRequestsAtOnce,
      maxSubscriberRequestsAtOnce: input.maxSubscriberRequestsAtOnce,
      maxVipViewerRequestsAtOnce: input.maxVipViewerRequestsAtOnce,
      maxVipSubscriberRequestsAtOnce: input.maxVipSubscriberRequestsAtOnce,
      limitRegularRequestsEnabled: input.limitRegularRequestsEnabled,
      regularRequestsPerPeriod: input.regularRequestsPerPeriod,
      regularRequestPeriodSeconds: input.regularRequestPeriodSeconds,
      limitVipRequestsEnabled: input.limitVipRequestsEnabled,
      vipRequestsPerPeriod: input.vipRequestsPerPeriod,
      vipRequestPeriodSeconds: input.vipRequestPeriodSeconds,
      blacklistEnabled: input.blacklistEnabled,
      letSetlistBypassBlacklist: input.letSetlistBypassBlacklist,
      setlistEnabled: input.setlistEnabled,
      subscribersMustFollowSetlist: input.subscribersMustFollowSetlist,
      autoGrantVipTokenToSubscribers: input.autoGrantVipTokenToSubscribers,
      autoGrantVipTokensToSubGifters: input.autoGrantVipTokensToSubGifters,
      autoGrantVipTokensToGiftRecipients:
        input.autoGrantVipTokensToGiftRecipients,
      autoGrantVipTokensForCheers: input.autoGrantVipTokensForCheers,
      cheerBitsPerVipToken: input.cheerBitsPerVipToken,
      cheerMinimumTokenPercent: input.cheerMinimumTokenPercent,
      duplicateWindowSeconds: input.duplicateWindowSeconds,
      commandPrefix: input.commandPrefix,
      updatedAt: Date.now(),
    })
    .where(eq(channelSettings.channelId, channelId));
}

export async function updateAdminBotOfflineTesting(
  env: AppEnv,
  channelId: string,
  enabled: boolean
) {
  await getDb(env)
    .update(channelSettings)
    .set({
      adminForceBotWhileOffline: enabled,
      updatedAt: Date.now(),
    })
    .where(eq(channelSettings.channelId, channelId));
}

export async function updateOverlaySettings(
  env: AppEnv,
  channelId: string,
  input: {
    overlayShowCreator: boolean;
    overlayShowAlbum: boolean;
    overlayAnimateNowPlaying: boolean;
    overlayAccentColor: string;
    overlayVipColor: string;
    overlayTextColor: string;
    overlayMutedTextColor: string;
    overlayPanelColor: string;
    overlayBackgroundColor: string;
    overlayBorderColor: string;
    overlayBackgroundOpacity: number;
    overlayCornerRadius: number;
    overlayItemGap: number;
    overlayItemPadding: number;
    overlayTitleFontSize: number;
    overlayMetaFontSize: number;
  }
) {
  await ensureOverlayAccessToken(env, channelId);

  await getDb(env)
    .update(channelSettings)
    .set({
      overlayShowCreator: input.overlayShowCreator,
      overlayShowAlbum: input.overlayShowAlbum,
      overlayAnimateNowPlaying: input.overlayAnimateNowPlaying,
      overlayAccentColor: input.overlayAccentColor,
      overlayVipColor: input.overlayVipColor,
      overlayTextColor: input.overlayTextColor,
      overlayMutedTextColor: input.overlayMutedTextColor,
      overlayPanelColor: input.overlayPanelColor,
      overlayBackgroundColor: input.overlayBackgroundColor,
      overlayBorderColor: input.overlayBorderColor,
      overlayBackgroundOpacity: input.overlayBackgroundOpacity,
      overlayCornerRadius: input.overlayCornerRadius,
      overlayItemGap: input.overlayItemGap,
      overlayItemPadding: input.overlayItemPadding,
      overlayTitleFontSize: input.overlayTitleFontSize,
      overlayMetaFontSize: input.overlayMetaFontSize,
      updatedAt: Date.now(),
    })
    .where(eq(channelSettings.channelId, channelId));
}

export async function addBlockedUser(
  env: AppEnv,
  input: {
    channelId: string;
    twitchUserId: string;
    login?: string;
    displayName?: string;
    reason?: string;
    createdByUserId: string;
  }
) {
  await getDb(env)
    .insert(blockedUsers)
    .values({
      channelId: input.channelId,
      twitchUserId: input.twitchUserId,
      login: input.login,
      displayName: input.displayName,
      reason: input.reason,
      createdByUserId: input.createdByUserId,
    })
    .onConflictDoNothing();
}

export async function removeBlockedUser(
  env: AppEnv,
  input: {
    channelId: string;
    twitchUserId: string;
  }
) {
  await getDb(env)
    .delete(blockedUsers)
    .where(
      and(
        eq(blockedUsers.channelId, input.channelId),
        eq(blockedUsers.twitchUserId, input.twitchUserId)
      )
    );
}

export async function addBlacklistedArtist(
  env: AppEnv,
  input: Omit<BlacklistedArtistInsert, "createdAt">
) {
  await getDb(env)
    .insert(blacklistedArtists)
    .values(input)
    .onConflictDoNothing();
}

export async function removeBlacklistedArtist(
  env: AppEnv,
  channelId: string,
  artistId: number
) {
  await getDb(env)
    .delete(blacklistedArtists)
    .where(
      and(
        eq(blacklistedArtists.channelId, channelId),
        eq(blacklistedArtists.artistId, artistId)
      )
    );
}

export async function addBlacklistedSong(
  env: AppEnv,
  input: Omit<BlacklistedSongInsert, "createdAt">
) {
  await getDb(env).insert(blacklistedSongs).values(input).onConflictDoNothing();
}

export async function addBlacklistedSongGroup(
  env: AppEnv,
  input: Omit<BlacklistedSongGroupInsert, "createdAt">
) {
  await getDb(env)
    .insert(blacklistedSongGroups)
    .values(input)
    .onConflictDoNothing();
}

export async function addBlacklistedCharter(
  env: AppEnv,
  input: Omit<BlacklistedCharterInsert, "createdAt">
) {
  await getDb(env)
    .insert(blacklistedCharters)
    .values(input)
    .onConflictDoNothing();
}

export async function removeBlacklistedSong(
  env: AppEnv,
  channelId: string,
  songId: number
) {
  await getDb(env)
    .delete(blacklistedSongs)
    .where(
      and(
        eq(blacklistedSongs.channelId, channelId),
        eq(blacklistedSongs.songId, songId)
      )
    );
}

export async function removeBlacklistedSongGroup(
  env: AppEnv,
  channelId: string,
  groupedProjectId: number
) {
  await getDb(env)
    .delete(blacklistedSongGroups)
    .where(
      and(
        eq(blacklistedSongGroups.channelId, channelId),
        eq(blacklistedSongGroups.groupedProjectId, groupedProjectId)
      )
    );
}

export async function removeBlacklistedCharter(
  env: AppEnv,
  channelId: string,
  charterId: number
) {
  await getDb(env)
    .delete(blacklistedCharters)
    .where(
      and(
        eq(blacklistedCharters.channelId, channelId),
        eq(blacklistedCharters.charterId, charterId)
      )
    );
}

export async function addSetlistArtist(
  env: AppEnv,
  input: Omit<SetlistArtistInsert, "createdAt">
) {
  await getDb(env).insert(setlistArtists).values(input).onConflictDoNothing();
}

export async function removeSetlistArtist(
  env: AppEnv,
  channelId: string,
  artistId: number
) {
  await getDb(env)
    .delete(setlistArtists)
    .where(
      and(
        eq(setlistArtists.channelId, channelId),
        eq(setlistArtists.artistId, artistId)
      )
    );
}

export async function getVipTokenBalance(
  env: AppEnv,
  input: {
    channelId: string;
    login: string;
  }
) {
  return getDb(env).query.vipTokens.findFirst({
    where: and(
      eq(vipTokens.channelId, input.channelId),
      eq(vipTokens.normalizedLogin, normalizeLogin(input.login))
    ),
  });
}

export async function grantVipToken(
  env: AppEnv,
  input: {
    channelId: string;
    login: string;
    displayName?: string | null;
    twitchUserId?: string | null;
    count?: number;
    autoSubscriberGrant?: boolean;
  }
) {
  const now = Date.now();
  const existing = await getVipTokenBalance(env, {
    channelId: input.channelId,
    login: input.login,
  });
  const count = clampVipTokenCount(input.count ?? 1);

  if (count <= 0) {
    return existing ?? null;
  }

  if (existing) {
    const availableCount = normalizeVipTokenCount(
      existing.availableCount + count
    );
    const grantedCount = normalizeVipTokenCount(existing.grantedCount + count);
    await getDb(env)
      .update(vipTokens)
      .set({
        twitchUserId: input.twitchUserId ?? existing.twitchUserId ?? null,
        login: input.login,
        displayName: input.displayName ?? existing.displayName ?? null,
        availableCount,
        grantedCount,
        autoSubscriberGranted: input.autoSubscriberGrant
          ? true
          : existing.autoSubscriberGranted,
        lastGrantedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(vipTokens.channelId, input.channelId),
          eq(vipTokens.normalizedLogin, normalizeLogin(input.login))
        )
      );

    return {
      ...existing,
      twitchUserId: input.twitchUserId ?? existing.twitchUserId ?? null,
      login: input.login,
      displayName: input.displayName ?? existing.displayName ?? null,
      availableCount,
      grantedCount,
      autoSubscriberGranted: input.autoSubscriberGrant
        ? true
        : existing.autoSubscriberGranted,
      lastGrantedAt: now,
      updatedAt: now,
    };
  } else {
    const normalizedCount = normalizeVipTokenCount(count);
    await getDb(env)
      .insert(vipTokens)
      .values({
        channelId: input.channelId,
        normalizedLogin: normalizeLogin(input.login),
        twitchUserId: input.twitchUserId ?? null,
        login: input.login,
        displayName: input.displayName ?? null,
        availableCount: normalizedCount,
        grantedCount: normalizedCount,
        consumedCount: 0,
        autoSubscriberGranted: !!input.autoSubscriberGrant,
        lastGrantedAt: now,
        updatedAt: now,
      } satisfies VipTokenInsert);

    return getVipTokenBalance(env, {
      channelId: input.channelId,
      login: input.login,
    });
  }
}

export async function consumeVipToken(
  env: AppEnv,
  input: {
    channelId: string;
    login: string;
    displayName?: string | null;
    twitchUserId?: string | null;
  }
) {
  const existing = await getVipTokenBalance(env, {
    channelId: input.channelId,
    login: input.login,
  });

  if (!existing || !hasRedeemableVipToken(existing.availableCount)) {
    return null;
  }

  const now = Date.now();
  const availableCount = subtractVipTokenRedemption(existing.availableCount);
  const consumedCount = normalizeVipTokenCount(existing.consumedCount + 1);
  await getDb(env)
    .update(vipTokens)
    .set({
      twitchUserId: input.twitchUserId ?? existing.twitchUserId ?? null,
      login: input.login,
      displayName: input.displayName ?? existing.displayName ?? null,
      availableCount,
      consumedCount,
      lastConsumedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(vipTokens.channelId, input.channelId),
        eq(vipTokens.normalizedLogin, normalizeLogin(input.login))
      )
    );

  return {
    ...existing,
    availableCount,
    consumedCount,
    lastConsumedAt: now,
    updatedAt: now,
  };
}

export async function revokeVipToken(
  env: AppEnv,
  input: {
    channelId: string;
    login: string;
  }
) {
  const existing = await getVipTokenBalance(env, {
    channelId: input.channelId,
    login: input.login,
  });

  if (!existing || !hasRedeemableVipToken(existing.availableCount)) {
    return null;
  }

  const nextCount = subtractVipTokenRedemption(existing.availableCount);

  await getDb(env)
    .update(vipTokens)
    .set({
      availableCount: nextCount,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(vipTokens.channelId, input.channelId),
        eq(vipTokens.normalizedLogin, normalizeLogin(input.login))
      )
    );

  return nextCount;
}

export async function setVipTokenAvailableCount(
  env: AppEnv,
  input: {
    channelId: string;
    login: string;
    count: number;
  }
) {
  const existing = await getVipTokenBalance(env, {
    channelId: input.channelId,
    login: input.login,
  });

  if (!existing) {
    return null;
  }

  const nextCount = clampVipTokenCount(input.count);
  const delta = normalizeVipTokenCount(nextCount - existing.availableCount);
  const now = Date.now();
  const grantedCount =
    delta > 0
      ? normalizeVipTokenCount(existing.grantedCount + delta)
      : existing.grantedCount;

  await getDb(env)
    .update(vipTokens)
    .set({
      availableCount: nextCount,
      grantedCount,
      lastGrantedAt: delta > 0 ? now : existing.lastGrantedAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(vipTokens.channelId, input.channelId),
        eq(vipTokens.normalizedLogin, normalizeLogin(input.login))
      )
    );

  return {
    ...existing,
    availableCount: nextCount,
    grantedCount,
    lastGrantedAt: delta > 0 ? now : existing.lastGrantedAt,
    updatedAt: now,
  };
}

export async function isBlockedUser(
  env: AppEnv,
  channelId: string,
  twitchUserId: string
) {
  const row = await getDb(env).query.blockedUsers.findFirst({
    where: and(
      eq(blockedUsers.channelId, channelId),
      eq(blockedUsers.twitchUserId, twitchUserId)
    ),
  });
  return !!row;
}

export async function createRequestLog(
  env: AppEnv,
  input: Omit<RequestLogInsert, "id">
) {
  await getDb(env)
    .insert(requestLogs)
    .values({
      id: createId("rlog"),
      ...input,
    });
}

export async function getRequestLogByMessageId(
  env: AppEnv,
  input: {
    channelId: string;
    twitchMessageId: string;
  }
) {
  return getDb(env).query.requestLogs.findFirst({
    where: and(
      eq(requestLogs.channelId, input.channelId),
      eq(requestLogs.twitchMessageId, input.twitchMessageId)
    ),
  });
}

export async function createAuditLog(
  env: AppEnv,
  input: Omit<AuditLogInsert, "id">
) {
  await getDb(env)
    .insert(auditLogs)
    .values({
      id: createId("alog"),
      ...input,
    });
}

export async function createPlayedSong(
  env: AppEnv,
  input: Omit<PlayedSongInsert, "id" | "createdAt">
) {
  await getDb(env)
    .insert(playedSongs)
    .values({
      id: createId("psong"),
      ...input,
    });
}

export async function getAuthorizationForChannel(
  env: AppEnv,
  channelId: string
) {
  return getDb(env).query.twitchAuthorizations.findFirst({
    where: and(
      eq(twitchAuthorizations.channelId, channelId),
      eq(twitchAuthorizations.authorizationType, "broadcaster")
    ),
  });
}

export async function getBroadcasterAuthorizationForUser(
  env: AppEnv,
  userId: string
) {
  return getDb(env).query.twitchAuthorizations.findFirst({
    where: and(
      eq(twitchAuthorizations.userId, userId),
      eq(twitchAuthorizations.authorizationType, "broadcaster")
    ),
  });
}

export async function getActiveBroadcasterAuthorizationForUser(
  env: AppEnv,
  userId: string
) {
  const authorization = await getBroadcasterAuthorizationForUser(env, userId);
  if (!authorization) {
    return null;
  }

  return refreshBroadcasterAuthorizationIfNeeded(env, authorization);
}

export async function getActiveBroadcasterAuthorizationForChannel(
  env: AppEnv,
  channelId: string
) {
  const authorization = await getAuthorizationForChannel(env, channelId);
  if (!authorization) {
    return null;
  }

  return refreshBroadcasterAuthorizationIfNeeded(env, authorization);
}

export async function getBotAuthorization(env: AppEnv) {
  return getDb(env).query.twitchAuthorizations.findFirst({
    where: eq(twitchAuthorizations.authorizationType, "bot"),
  });
}

export async function deleteBotAuthorization(env: AppEnv) {
  await getDb(env)
    .delete(twitchAuthorizations)
    .where(eq(twitchAuthorizations.authorizationType, "bot"));
}

export async function updateTwitchAuthorizationTokens(
  env: AppEnv,
  authorizationId: string,
  input: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: number | null;
    scopes?: string[];
    tokenType?: string;
  }
) {
  await getDb(env)
    .update(twitchAuthorizations)
    .set({
      accessTokenEncrypted: input.accessToken,
      refreshTokenEncrypted: input.refreshToken ?? null,
      expiresAt: input.expiresAt ?? null,
      scopes: input.scopes ? JSON.stringify(input.scopes) : undefined,
      tokenType: input.tokenType ?? undefined,
      updatedAt: Date.now(),
    })
    .where(eq(twitchAuthorizations.id, authorizationId));
}

export async function getEventSubSubscription(
  env: AppEnv,
  channelId: string,
  subscriptionType: string
) {
  return getDb(env).query.eventSubSubscriptions.findFirst({
    where: and(
      eq(eventSubSubscriptions.channelId, channelId),
      eq(eventSubSubscriptions.subscriptionType, subscriptionType)
    ),
  });
}

export async function getEventSubSubscriptionsForChannel(
  env: AppEnv,
  channelId: string
) {
  return getDb(env).query.eventSubSubscriptions.findMany({
    where: eq(eventSubSubscriptions.channelId, channelId),
    orderBy: [asc(eventSubSubscriptions.subscriptionType)],
  });
}

export async function upsertEventSubSubscription(
  env: AppEnv,
  input: Omit<EventSubSubscriptionInsert, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  }
) {
  await getDb(env)
    .insert(eventSubSubscriptions)
    .values({
      id: input.id ?? createId("esub"),
      ...input,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [
        eventSubSubscriptions.channelId,
        eventSubSubscriptions.subscriptionType,
      ],
      set: {
        twitchSubscriptionId: input.twitchSubscriptionId,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        updatedAt: Date.now(),
        lastVerifiedAt: input.lastVerifiedAt ?? null,
      },
    });
}

export async function claimEventSubDelivery(
  env: AppEnv,
  input: Omit<EventSubDeliveryInsert, "createdAt">
) {
  try {
    await getDb(env)
      .insert(eventSubDeliveries)
      .values({
        ...input,
        createdAt: Date.now(),
      });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("UNIQUE constraint failed") ||
      message.includes("PRIMARY KEY constraint failed")
    ) {
      return false;
    }

    throw error;
  }
}

export async function deleteEventSubSubscriptionRecord(
  env: AppEnv,
  channelId: string,
  subscriptionType: string
) {
  await getDb(env)
    .delete(eventSubSubscriptions)
    .where(
      and(
        eq(eventSubSubscriptions.channelId, channelId),
        eq(eventSubSubscriptions.subscriptionType, subscriptionType)
      )
    );
}

export async function getUserById(env: AppEnv, userId: string) {
  return getDb(env).query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function countActiveRequestsForUser(
  env: AppEnv,
  input: {
    channelId: string;
    twitchUserId: string;
  }
) {
  const result = await getDb(env).all<{ count: number }>(sql`
    SELECT count(*) AS count
    FROM playlist_items
    WHERE channel_id = ${input.channelId}
      AND requested_by_twitch_user_id = ${input.twitchUserId}
      AND status IN ('queued', 'current')
  `);

  const rows = unwrapD1Rows(result);
  return rows[0]?.count ?? 0;
}

export async function countAcceptedRequestsInPeriod(
  env: AppEnv,
  input: {
    channelId: string;
    twitchUserId: string;
    since: number;
  }
) {
  const result = await getDb(env).all<{ count: number }>(sql`
    SELECT count(*) AS count
    FROM request_logs
    WHERE channel_id = ${input.channelId}
      AND twitch_user_id = ${input.twitchUserId}
      AND outcome = 'accepted'
      AND created_at >= ${input.since}
  `);

  const rows = unwrapD1Rows(result);
  return rows[0]?.count ?? 0;
}

export async function getViewerState(env: AppEnv, userId: string) {
  const user = await getUserById(env, userId);

  if (!user) {
    return null;
  }

  const db = getDb(env);

  const channel = await db.query.channels.findFirst({
    where: eq(channels.ownerUserId, userId),
  });

  const settings = channel
    ? await db.query.channelSettings.findFirst({
        where: eq(channelSettings.channelId, channel.id),
      })
    : null;

  const botAuthorization = await getBotAuthorization(env);
  const broadcasterAuthorization = await getBroadcasterAuthorizationForUser(
    env,
    userId
  );
  const needsBroadcasterScopeReconnect =
    !broadcasterAuthorization ||
    !hasRequiredAuthorizationScopes(broadcasterAuthorization.scopes, [
      "user:read:moderated_channels",
      "moderator:read:chatters",
      "channel:bot",
      "channel:read:subscriptions",
      "bits:read",
    ]);
  const moderatedChannelsState = broadcasterAuthorization
    ? await getModeratedChannelViewerState(env, broadcasterAuthorization)
    : {
        manageableChannels: [],
        needsModeratorScopeReconnect: false,
      };

  return {
    user,
    channel,
    settings,
    botConnected: !!botAuthorization,
    botLogin: botAuthorization?.twitchUserId ?? null,
    manageableChannels: moderatedChannelsState.manageableChannels,
    needsBroadcasterScopeReconnect,
    needsModeratorScopeReconnect:
      moderatedChannelsState.needsModeratorScopeReconnect,
  };
}

export async function getDashboardChannelAccess(
  env: AppEnv,
  userId: string,
  requestedSlug?: string | null
) {
  const db = getDb(env);
  const requestedChannel = requestedSlug
    ? await db.query.channels.findFirst({
        where: eq(channels.slug, requestedSlug),
      })
    : null;

  const ownedChannel = await db.query.channels.findFirst({
    where: eq(channels.ownerUserId, userId),
  });

  if (!requestedChannel) {
    if (!ownedChannel) {
      return null;
    }

    return {
      channel: ownedChannel,
      accessRole: "owner" as const,
      actorUserId: userId,
    };
  }

  if (requestedChannel.ownerUserId === userId) {
    return {
      channel: requestedChannel,
      accessRole: "owner" as const,
      actorUserId: userId,
    };
  }

  const settings = await db.query.channelSettings.findFirst({
    where: eq(channelSettings.channelId, requestedChannel.id),
  });

  if (!hasAnyModeratorChannelCapability(settings)) {
    return null;
  }

  const broadcasterAuthorization = await getBroadcasterAuthorizationForUser(
    env,
    userId
  );
  if (!broadcasterAuthorization) {
    return null;
  }

  const moderatedChannelsState = await getModeratedChannelViewerState(
    env,
    broadcasterAuthorization
  );

  const isModeratorForRequestedChannel =
    moderatedChannelsState.manageableChannels.some(
      (channel) => channel.id === requestedChannel.id
    );

  if (!isModeratorForRequestedChannel) {
    return null;
  }

  return {
    channel: requestedChannel,
    accessRole: "moderator" as const,
    actorUserId: userId,
  };
}

function hasAnyModeratorChannelCapability(
  settings:
    | {
        moderatorCanManageRequests: boolean;
        moderatorCanManageBlacklist: boolean;
        moderatorCanManageSetlist: boolean;
        moderatorCanManageBlockedChatters: boolean;
        moderatorCanViewVipTokens: boolean;
        moderatorCanManageVipTokens: boolean;
        moderatorCanManageTags: boolean;
      }
    | null
    | undefined
) {
  if (!settings) {
    return false;
  }

  return (
    settings.moderatorCanManageRequests ||
    settings.moderatorCanManageBlacklist ||
    settings.moderatorCanManageSetlist ||
    settings.moderatorCanManageBlockedChatters ||
    settings.moderatorCanViewVipTokens ||
    settings.moderatorCanManageVipTokens ||
    settings.moderatorCanManageTags
  );
}

async function getModeratedChannelViewerState(
  env: AppEnv,
  authorization: NonNullable<
    Awaited<ReturnType<typeof getBroadcasterAuthorizationForUser>>
  >
) {
  const scopes = parseAuthorizationScopes(authorization.scopes);
  if (!scopes.includes("user:read:moderated_channels")) {
    return {
      manageableChannels: [],
      needsModeratorScopeReconnect: true,
    };
  }

  let activeAuthorization = await refreshBroadcasterAuthorizationIfNeeded(
    env,
    authorization
  );

  try {
    return {
      manageableChannels: await getManageableModeratedChannels(
        env,
        activeAuthorization.twitchUserId,
        activeAuthorization.accessTokenEncrypted
      ),
      needsModeratorScopeReconnect: false,
    };
  } catch (error) {
    if (
      error instanceof TwitchApiError &&
      error.status === 401 &&
      activeAuthorization.refreshTokenEncrypted
    ) {
      activeAuthorization = await refreshBroadcasterAuthorization(
        env,
        activeAuthorization
      );

      return {
        manageableChannels: await getManageableModeratedChannels(
          env,
          activeAuthorization.twitchUserId,
          activeAuthorization.accessTokenEncrypted
        ),
        needsModeratorScopeReconnect: false,
      };
    }

    console.error("Failed to resolve moderated channels for viewer", {
      twitchUserId: authorization.twitchUserId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      manageableChannels: [],
      needsModeratorScopeReconnect: false,
    };
  }
}

async function getManageableModeratedChannels(
  env: AppEnv,
  twitchUserId: string,
  accessToken: string
) {
  const moderatedChannels = await getModeratedChannels({
    env,
    accessToken,
    userId: twitchUserId,
  });
  const moderatedBroadcasterIds = [
    ...new Set(moderatedChannels.map((channel) => channel.broadcaster_id)),
  ];

  if (!moderatedBroadcasterIds.length) {
    return [];
  }

  const localLiveChannels = await getDb(env)
    .select({
      id: channels.id,
      slug: channels.slug,
      login: channels.login,
      displayName: channels.displayName,
      twitchChannelId: channels.twitchChannelId,
      isLive: channels.isLive,
    })
    .from(channels)
    .innerJoin(channelSettings, eq(channelSettings.channelId, channels.id))
    .where(
      and(
        inArray(channels.twitchChannelId, moderatedBroadcasterIds),
        eq(channelSettings.moderatorCanManageRequests, true)
      )
    );

  const appToken = await getAppAccessToken(env);
  const liveStreams = await getLiveStreams({
    env,
    appAccessToken: appToken.access_token,
    broadcasterUserIds: localLiveChannels.map(
      (channel) => channel.twitchChannelId
    ),
  });
  const liveBroadcasterIds = new Set(
    liveStreams.map((stream) => stream.user_id)
  );

  return localLiveChannels
    .filter((channel) => channel.id !== undefined)
    .map(({ twitchChannelId, isLive, ...channel }) => ({
      ...channel,
      accessRole: "moderator" as const,
      isLive: liveBroadcasterIds.has(twitchChannelId) || !!isLive,
    }));
}

async function refreshBroadcasterAuthorizationIfNeeded(
  env: AppEnv,
  authorization: NonNullable<
    Awaited<ReturnType<typeof getBroadcasterAuthorizationForUser>>
  >
) {
  if (
    !authorization.refreshTokenEncrypted ||
    !authorization.expiresAt ||
    authorization.expiresAt > Date.now() + 60_000
  ) {
    return authorization;
  }

  return refreshBroadcasterAuthorization(env, authorization);
}

async function refreshBroadcasterAuthorization(
  env: AppEnv,
  authorization: NonNullable<
    Awaited<ReturnType<typeof getBroadcasterAuthorizationForUser>>
  >
) {
  const refreshedToken = await refreshAccessToken(
    env,
    authorization.refreshTokenEncrypted ?? ""
  );

  await updateTwitchAuthorizationTokens(env, authorization.id, {
    accessToken: refreshedToken.access_token,
    refreshToken:
      refreshedToken.refresh_token ?? authorization.refreshTokenEncrypted,
    expiresAt: refreshedToken.expires_in
      ? Date.now() + refreshedToken.expires_in * 1000
      : authorization.expiresAt,
    scopes:
      refreshedToken.scope ?? parseAuthorizationScopes(authorization.scopes),
    tokenType: refreshedToken.token_type,
  });

  return {
    ...authorization,
    accessTokenEncrypted: refreshedToken.access_token,
    refreshTokenEncrypted:
      refreshedToken.refresh_token ?? authorization.refreshTokenEncrypted,
    expiresAt: refreshedToken.expires_in
      ? Date.now() + refreshedToken.expires_in * 1000
      : authorization.expiresAt,
    scopes: JSON.stringify(
      refreshedToken.scope ?? parseAuthorizationScopes(authorization.scopes)
    ),
    tokenType: refreshedToken.token_type,
  };
}

export async function getCachedSearchResult<T>(
  env: AppEnv,
  cacheKey: string,
  now = Date.now()
) {
  const cached = await getDb(env).query.searchCache.findFirst({
    where: eq(searchCache.cacheKey, cacheKey),
  });

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    await getDb(env)
      .delete(searchCache)
      .where(eq(searchCache.cacheKey, cacheKey));
    return null;
  }

  await getDb(env)
    .update(searchCache)
    .set({
      lastAccessedAt: now,
    })
    .where(eq(searchCache.cacheKey, cacheKey));

  return JSON.parse(cached.responseJson) as T;
}

export async function upsertCachedSearchResult(
  env: AppEnv,
  input: {
    cacheKey: string;
    responseJson: string;
    expiresAt: number;
  }
) {
  const now = Date.now();

  await getDb(env)
    .insert(searchCache)
    .values({
      cacheKey: input.cacheKey,
      responseJson: input.responseJson,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    })
    .onConflictDoUpdate({
      target: searchCache.cacheKey,
      set: {
        responseJson: input.responseJson,
        expiresAt: input.expiresAt,
        updatedAt: now,
        lastAccessedAt: now,
      },
    });
}

export async function consumeSearchRateLimit(
  env: AppEnv,
  input: {
    rateLimitKey: string;
    now?: number;
    maxRequests?: number;
    windowMs?: number;
    baseCooldownMs?: number;
    maxCooldownMs?: number;
  }
) {
  const db = getDb(env);
  const now = input.now ?? Date.now();
  const maxRequests = input.maxRequests ?? 10;
  const windowMs = input.windowMs ?? 10_000;
  const baseCooldownMs = input.baseCooldownMs ?? 10_000;
  const maxCooldownMs = input.maxCooldownMs ?? 300_000;

  const existing = await db.query.searchRateLimits.findFirst({
    where: eq(searchRateLimits.rateLimitKey, input.rateLimitKey),
  });

  if (!existing) {
    await db.insert(searchRateLimits).values({
      rateLimitKey: input.rateLimitKey,
      requestCount: 1,
      windowStartedAt: now,
      cooldownUntil: null,
      violationCount: 0,
      lastSeenAt: now,
    });

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
    };
  }

  if (existing.cooldownUntil && existing.cooldownUntil > now) {
    const retryAfterMs = existing.cooldownUntil - now;
    return {
      allowed: false,
      retryAfterMs,
      message: `Please wait ${Math.ceil(retryAfterMs / 1000)} seconds before performing your next search.`,
    };
  }

  const sameWindow = now - existing.windowStartedAt < windowMs;
  const requestCount = sameWindow ? existing.requestCount + 1 : 1;
  const nextWindowStartedAt = sameWindow ? existing.windowStartedAt : now;

  if (requestCount > maxRequests) {
    const violationCount = existing.violationCount + 1;
    const cooldownMs = Math.min(
      baseCooldownMs * 2 ** (violationCount - 1),
      maxCooldownMs
    );
    const cooldownUntil = now + cooldownMs;

    await db
      .update(searchRateLimits)
      .set({
        requestCount,
        windowStartedAt: nextWindowStartedAt,
        cooldownUntil,
        violationCount,
        lastSeenAt: now,
      })
      .where(eq(searchRateLimits.rateLimitKey, input.rateLimitKey));

    return {
      allowed: false,
      retryAfterMs: cooldownMs,
      message: `Please wait ${Math.ceil(cooldownMs / 1000)} seconds before performing your next search.`,
    };
  }

  await db
    .update(searchRateLimits)
    .set({
      requestCount,
      windowStartedAt: nextWindowStartedAt,
      cooldownUntil: null,
      lastSeenAt: now,
    })
    .where(eq(searchRateLimits.rateLimitKey, input.rateLimitKey));

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - requestCount),
  };
}
