import { callBackend } from "~/lib/backend";
import {
  type CatalogSearchInput,
  consumeVipToken,
  countAcceptedRequestsInPeriod,
  countActiveRequestsForUser,
  createAuditLog,
  createRequestLog,
  getCatalogSongBySourceId,
  getChannelByLogin,
  getDashboardState,
  getRequestLogByMessageId,
  getVipTokenBalance,
  grantVipToken,
  isBlockedUser,
  searchCatalogSongs,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import type { PlaylistMutationResult } from "~/lib/playlist/types";
import {
  parseRequestModifiers,
  STREAMER_CHOICE_TITLE,
  STREAMER_CHOICE_WARNING_CODE,
} from "~/lib/request-modes";
import {
  buildBlacklistMessage,
  buildChannelPlaylistMessage,
  buildHowMessage,
  buildSearchMessage,
  buildSetlistMessage,
  formatPathList,
  getActiveRequestLimit,
  getArraySetting,
  getRateLimitWindow,
  getRequiredPathsMatchMode,
  getRequiredPathsWarning,
  isRequesterAllowed,
  isSongAllowed,
  songMatchesRequestedPaths,
} from "~/lib/request-policy";
import type { NormalizedChatEvent, ParsedChatCommand } from "~/lib/requests";
import type { SongSearchResult } from "~/lib/song-search/types";
import { createId } from "~/lib/utils";
import { formatVipTokenCount, hasRedeemableVipToken } from "~/lib/vip-tokens";

export interface EventSubChatChannel {
  id: string;
  ownerUserId: string;
  twitchChannelId: string;
  slug: string;
}

export interface EventSubChatSettings {
  requestsEnabled: boolean;
  moderatorCanManageVipTokens: boolean;
  autoGrantVipTokenToSubscribers: boolean;
  duplicateWindowSeconds: number;
  maxQueueSize: number;
}

export interface EventSubChatState {
  settings: EventSubChatSettings & Parameters<typeof isRequesterAllowed>[0];
  blacklistArtists: Array<{ artistId: number; artistName: string }>;
  blacklistCharters: Array<{ charterId: number; charterName: string }>;
  blacklistSongs: Array<{
    songId: number;
    songTitle: string;
    artistName?: string | null;
  }>;
  blacklistSongGroups: Array<{
    groupedProjectId: number;
    songTitle: string;
    artistId?: number | null;
    artistName?: string | null;
  }>;
  setlistArtists: Array<{ artistName: string }>;
  logs: Array<{
    matchedSongId: string | null;
    outcome: string;
    createdAt: number;
  }>;
  items: Array<{
    id: string;
    songId: string | null;
    songTitle?: string | null;
    status: string;
    requestKind: string | null;
    requestedQuery?: string | null;
    warningCode?: string | null;
    requestedByTwitchUserId: string | null;
    requestedByLogin: string | null;
    requestedByDisplayName: string | null;
    position?: number | null;
  }>;
}

export interface VipTokenBalance {
  availableCount: number;
  autoSubscriberGranted?: boolean | null;
}

export interface PlaylistAddSong {
  id: string;
  title: string;
  groupedProjectId?: number;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string;
  parts?: string[];
  durationText?: string;
  cdlcId?: number;
  sourceId?: number;
  source: string;
  sourceUrl?: string;
  requestedQuery?: string;
  warningCode?: string;
  warningMessage?: string;
  candidateMatchesJson?: string;
}

export interface EventSubChatDependencies {
  getChannelByLogin(
    env: AppEnv,
    login: string
  ): Promise<EventSubChatChannel | null>;
  getRequestLogByMessageId(
    env: AppEnv,
    input: { channelId: string; twitchMessageId: string }
  ): Promise<unknown>;
  getDashboardState(
    env: AppEnv,
    ownerUserId: string
  ): Promise<EventSubChatState | null>;
  countActiveRequestsForUser(
    env: AppEnv,
    input: { channelId: string; twitchUserId: string }
  ): Promise<number>;
  countAcceptedRequestsInPeriod(
    env: AppEnv,
    input: { channelId: string; twitchUserId: string; since: number }
  ): Promise<number>;
  isBlockedUser(
    env: AppEnv,
    channelId: string,
    twitchUserId: string
  ): Promise<boolean>;
  getVipTokenBalance(
    env: AppEnv,
    input: { channelId: string; login: string }
  ): Promise<VipTokenBalance | null>;
  grantVipToken(
    env: AppEnv,
    input: {
      channelId: string;
      login: string;
      displayName?: string | null;
      twitchUserId?: string | null;
      count?: number;
      autoSubscriberGrant?: boolean;
    }
  ): Promise<unknown>;
  consumeVipToken(
    env: AppEnv,
    input: {
      channelId: string;
      login: string;
      displayName?: string | null;
      twitchUserId?: string | null;
    }
  ): Promise<unknown>;
  getCatalogSongBySourceId(
    env: AppEnv,
    sourceSongId: number
  ): Promise<SongSearchResult | null>;
  searchSongs(
    env: AppEnv,
    input: CatalogSearchInput
  ): Promise<{ results: SongSearchResult[]; total?: number }>;
  resolveTwitchUserByLogin(
    env: AppEnv,
    login: string
  ): Promise<{
    twitchUserId: string;
    login: string;
    displayName: string;
  } | null>;
  addRequestToPlaylist(
    env: AppEnv,
    input: {
      channelId: string;
      requestedByTwitchUserId: string;
      requestedByLogin: string;
      requestedByDisplayName: string;
      messageId: string;
      prioritizeNext: boolean;
      requestKind: "regular" | "vip";
      song: PlaylistAddSong;
    }
  ): Promise<PlaylistMutationResult>;
  removeRequestsFromPlaylist(
    env: AppEnv,
    input: {
      channelId: string;
      requesterTwitchUserId: string;
      requesterLogin: string;
      actorUserId: string | null;
      kind: "regular" | "vip" | "all";
    }
  ): Promise<PlaylistMutationResult>;
  changeRequestKind(
    env: AppEnv,
    input: {
      channelId: string;
      itemId: string;
      requestKind: "regular" | "vip";
    }
  ): Promise<PlaylistMutationResult>;
  createRequestLog(
    env: AppEnv,
    input: Record<string, unknown>
  ): Promise<unknown>;
  createAuditLog(env: AppEnv, input: Record<string, unknown>): Promise<unknown>;
  sendChatReply(
    env: AppEnv,
    input: { channelId: string; broadcasterUserId: string; message: string }
  ): Promise<unknown>;
}

export interface ProcessEventSubChatMessageResult {
  body: string;
  status: number;
}

function mention(login: string) {
  return `@${login}`;
}

function formatSongForReply(song: { artist?: string; title: string }) {
  return song.artist ? `${song.artist} - ${song.title}` : song.title;
}

function buildCandidateMatchesJson(results: SongSearchResult[]) {
  if (results.length <= 1) {
    return undefined;
  }

  return JSON.stringify(
    results.slice(0, 5).map((result) => ({
      id: result.id,
      groupedProjectId: result.groupedProjectId,
      authorId: result.authorId,
      title: result.title,
      artist: result.artist,
      album: result.album,
      creator: result.creator,
      tuning: result.tuning,
      parts: result.parts ?? [],
      durationText: result.durationText,
      year: result.year,
      sourceUpdatedAt: result.sourceUpdatedAt,
      downloads: result.downloads,
      sourceUrl: result.sourceUrl,
      sourceId: result.sourceId,
    }))
  );
}

function getRequesterMatchingActiveItem(input: {
  items: EventSubChatState["items"];
  requesterTwitchUserId: string;
  matchedSongId: string | null;
}) {
  if (!input.matchedSongId) {
    return null;
  }

  return (
    input.items.find(
      (item) =>
        item.songId === input.matchedSongId &&
        item.requestedByTwitchUserId === input.requesterTwitchUserId &&
        (item.status === "queued" || item.status === "current")
    ) ?? null
  );
}

function getRequesterMatchingSpecialItem(input: {
  items: EventSubChatState["items"];
  requesterTwitchUserId: string;
  requestedQuery: string;
  warningCode: string;
}) {
  const normalizedRequestedQuery = input.requestedQuery.trim().toLowerCase();
  if (!normalizedRequestedQuery) {
    return null;
  }

  return (
    input.items.find(
      (item) =>
        item.requestedByTwitchUserId === input.requesterTwitchUserId &&
        item.warningCode === input.warningCode &&
        item.requestedQuery?.trim().toLowerCase() ===
          normalizedRequestedQuery &&
        (item.status === "queued" || item.status === "current")
    ) ?? null
  );
}

function getRejectedSongMessage(input: {
  login: string;
  reason?: string;
  reasonCode?: string;
}) {
  if (
    input.reasonCode === "charter_blacklist" ||
    input.reasonCode === "song_blacklist" ||
    input.reasonCode === "version_blacklist"
  ) {
    return `${mention(input.login)} I cannot add that song to the playlist.`;
  }

  return `${mention(input.login)} ${
    input.reason ?? "that song is not allowed in this channel."
  }`;
}

function getRequestedPathMismatchMessage(requestedPaths: string[]) {
  const formattedPaths = formatPathList(requestedPaths);
  return `That song does not include the requested path${requestedPaths.length === 1 ? "" : "s"}: ${formattedPaths}.`;
}

function extractRequestedSourceSongId(query: string | undefined) {
  const match = /^song:(\d+)$/i.exec((query ?? "").trim());
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function parseRemoveKind(query: string | undefined) {
  const normalized = (query ?? "").trim().toLowerCase();
  if (normalized === "reg" || normalized === "regular") {
    return "regular";
  }

  if (normalized === "vip") {
    return "vip";
  }

  if (normalized === "all") {
    return "all";
  }

  return null;
}

function normalizeRequestedLogin(login: string | undefined) {
  return login?.trim().replace(/^@+/, "").toLowerCase() ?? undefined;
}

function buildCatalogSearchInput(input: {
  query: string;
  page: number;
  pageSize: number;
  state: EventSubChatState;
  allowBlacklistOverride: boolean;
}) {
  const blacklistFilters =
    input.allowBlacklistOverride || !input.state.settings.blacklistEnabled
      ? {}
      : {
          excludeSongIds: input.state.blacklistSongs.map((song) => song.songId),
          excludeGroupedProjectIds: input.state.blacklistSongGroups.map(
            (song) => song.groupedProjectId
          ),
          excludeArtistIds: input.state.blacklistArtists.map(
            (artist) => artist.artistId
          ),
          excludeArtistNames: input.state.blacklistArtists.map(
            (artist) => artist.artistName
          ),
          excludeAuthorIds: input.state.blacklistCharters.map(
            (charter) => charter.charterId
          ),
          excludeCreatorNames: input.state.blacklistCharters.map(
            (charter) => charter.charterName
          ),
        };

  return {
    query: input.query,
    page: input.page,
    pageSize: input.pageSize,
    restrictToOfficial: !!input.state.settings.onlyOfficialDlc,
    allowedTuningsFilter: getArraySetting(
      input.state.settings.allowedTuningsJson
    ),
    requiredPartsFilter: getArraySetting(
      input.state.settings.requiredPathsJson
    ),
    requiredPartsFilterMatchMode: getRequiredPathsMatchMode(
      input.state.settings.requiredPathsMatchMode
    ),
    sortBy: "relevance" as const,
    sortDirection: "desc" as const,
    ...blacklistFilters,
  } satisfies CatalogSearchInput;
}

function getSongAllowance(input: {
  song: SongSearchResult;
  state: EventSubChatState;
  requesterContext: Parameters<typeof isRequesterAllowed>[1];
  allowBlacklistOverride: boolean;
  requestedPaths: string[];
}) {
  const policyAllowance = isSongAllowed({
    song: input.song,
    settings: input.state.settings,
    blacklistArtists: input.state.blacklistArtists,
    blacklistCharters: input.state.blacklistCharters,
    blacklistSongs: input.state.blacklistSongs,
    blacklistSongGroups: input.state.blacklistSongGroups,
    setlistArtists: input.state.setlistArtists,
    requester: input.requesterContext,
    allowBlacklistOverride: input.allowBlacklistOverride,
  });

  if (!policyAllowance.allowed) {
    return policyAllowance;
  }

  if (
    input.requestedPaths.length > 0 &&
    !songMatchesRequestedPaths({
      song: input.song,
      requestedPaths: input.requestedPaths,
    })
  ) {
    return {
      allowed: false,
      reason: getRequestedPathMismatchMessage(input.requestedPaths),
      reasonCode: "requested_paths_not_matched",
    };
  }

  return policyAllowance;
}

async function resolveChatRandomMatch(input: {
  env: AppEnv;
  deps: EventSubChatDependencies;
  query: string;
  state: EventSubChatState;
  requesterContext: Parameters<typeof isRequesterAllowed>[1];
  allowBlacklistOverride: boolean;
  requestedPaths: string[];
}) {
  const baseSearchInput = buildCatalogSearchInput({
    query: input.query,
    page: 1,
    pageSize: 1,
    state: input.state,
    allowBlacklistOverride: input.allowBlacklistOverride,
  });
  const filteredSearch = await input.deps.searchSongs(
    input.env,
    baseSearchInput
  );
  const filteredTotal = Math.max(
    0,
    filteredSearch.total ?? filteredSearch.results.length
  );
  const attemptedPages = new Set<number>();
  let firstRejectedMatch:
    | {
        song: SongSearchResult;
        reason?: string;
        reasonCode?: string;
      }
    | undefined;

  const attemptLimit = Math.min(filteredTotal, 12);
  while (attemptedPages.size < attemptLimit) {
    const nextPage = Math.floor(Math.random() * filteredTotal) + 1;
    if (attemptedPages.has(nextPage)) {
      continue;
    }

    attemptedPages.add(nextPage);
    const randomPage = await input.deps.searchSongs(input.env, {
      ...baseSearchInput,
      page: nextPage,
      pageSize: 1,
    });
    const candidate = randomPage.results[0] ?? null;
    if (!candidate) {
      continue;
    }

    const songAllowed = getSongAllowance({
      song: candidate,
      state: input.state,
      requesterContext: input.requesterContext,
      allowBlacklistOverride: input.allowBlacklistOverride,
      requestedPaths: input.requestedPaths,
    });
    if (songAllowed.allowed) {
      return { firstMatch: candidate, firstRejectedMatch: undefined };
    }

    if (!firstRejectedMatch) {
      firstRejectedMatch = {
        song: candidate,
        reason: songAllowed.reason,
        reasonCode:
          "reasonCode" in songAllowed ? songAllowed.reasonCode : undefined,
      };
    }
  }

  if (filteredTotal > 0) {
    const fallbackSearch = await input.deps.searchSongs(input.env, {
      ...baseSearchInput,
      page: 1,
      pageSize: Math.min(filteredTotal, 25),
    });
    const allowedResults = fallbackSearch.results.filter(
      (song) =>
        getSongAllowance({
          song,
          state: input.state,
          requesterContext: input.requesterContext,
          allowBlacklistOverride: input.allowBlacklistOverride,
          requestedPaths: input.requestedPaths,
        }).allowed
    );

    if (allowedResults.length > 0) {
      const picked =
        allowedResults[Math.floor(Math.random() * allowedResults.length)] ??
        allowedResults[0];
      return { firstMatch: picked, firstRejectedMatch: undefined };
    }
  }

  const rawSearch = await input.deps.searchSongs(input.env, {
    query: input.query,
    page: 1,
    pageSize: 5,
    sortBy: "relevance",
    sortDirection: "desc",
  });

  for (const result of rawSearch.results) {
    const songAllowed = getSongAllowance({
      song: result,
      state: input.state,
      requesterContext: input.requesterContext,
      allowBlacklistOverride: input.allowBlacklistOverride,
      requestedPaths: input.requestedPaths,
    });
    if (!songAllowed.allowed && !firstRejectedMatch) {
      firstRejectedMatch = {
        song: result,
        reason: songAllowed.reason,
        reasonCode:
          "reasonCode" in songAllowed ? songAllowed.reasonCode : undefined,
      };
    }
  }

  return {
    firstMatch: null,
    firstRejectedMatch,
    hadRawMatches: rawSearch.results.length > 0,
  };
}

async function resolveChatChoiceAvailability(input: {
  env: AppEnv;
  deps: EventSubChatDependencies;
  query: string;
  state: EventSubChatState;
  requesterContext: Parameters<typeof isRequesterAllowed>[1];
  allowBlacklistOverride: boolean;
  requestedPaths: string[];
}) {
  const filteredSearch = await input.deps.searchSongs(
    input.env,
    buildCatalogSearchInput({
      query: input.query,
      page: 1,
      pageSize: 1,
      state: input.state,
      allowBlacklistOverride: input.allowBlacklistOverride,
    })
  );

  if ((filteredSearch.total ?? filteredSearch.results.length) > 0) {
    return {
      allowed: true,
      hadRawMatches: true,
    };
  }

  const rawSearch = await input.deps.searchSongs(input.env, {
    query: input.query,
    page: 1,
    pageSize: 5,
    sortBy: "relevance",
    sortDirection: "desc",
  });

  let firstRejectedMatch:
    | {
        song: SongSearchResult;
        reason?: string;
        reasonCode?: string;
      }
    | undefined;

  for (const result of rawSearch.results) {
    const songAllowed = getSongAllowance({
      song: result,
      state: input.state,
      requesterContext: input.requesterContext,
      allowBlacklistOverride: input.allowBlacklistOverride,
      requestedPaths: input.requestedPaths,
    });

    if (songAllowed.allowed) {
      return {
        allowed: true,
        hadRawMatches: true,
      };
    }

    if (!firstRejectedMatch) {
      firstRejectedMatch = {
        song: result,
        reason: songAllowed.reason,
        reasonCode:
          "reasonCode" in songAllowed ? songAllowed.reasonCode : undefined,
      };
    }
  }

  return {
    allowed: rawSearch.results.length === 0,
    hadRawMatches: rawSearch.results.length > 0,
    firstRejectedMatch,
  };
}

function formatSpecialRequestReply(input: {
  requestedText: string;
  requestKind: "regular" | "vip";
  status?: string;
  existing?: boolean;
}) {
  if (input.requestKind === "vip") {
    const nextPositionSuffix =
      input.status === "current" ? "." : " and will play next.";
    return input.existing
      ? `your existing streamer choice request for "${input.requestedText}" is now a VIP request${nextPositionSuffix} 1 VIP token was used.`
      : `your streamer choice request for "${input.requestedText}" has been added as a VIP request${nextPositionSuffix}`;
  }

  return input.existing
    ? `your existing VIP streamer choice request for "${input.requestedText}" is now a regular request again. 1 VIP token was refunded.`
    : `your streamer choice request for "${input.requestedText}" has been added to the playlist.`;
}

function buildStreamerChoiceSong(requestedText: string): PlaylistAddSong {
  return {
    id: createId("rqm"),
    title: STREAMER_CHOICE_TITLE,
    source: "choice",
    requestedQuery: requestedText,
    warningCode: STREAMER_CHOICE_WARNING_CODE,
  };
}

function getPositionReplyMessage(input: {
  login: string;
  items: EventSubChatState["items"];
  requesterTwitchUserId: string;
}) {
  const activeRequests = input.items
    .filter(
      (item) =>
        item.requestedByTwitchUserId === input.requesterTwitchUserId &&
        (item.status === "queued" || item.status === "current")
    )
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

  if (activeRequests.length === 0) {
    return `${mention(input.login)} you do not have any active requests in this playlist.`;
  }

  const currentRequests = activeRequests.filter(
    (item) => item.status === "current"
  );
  const queuedRequests = activeRequests.filter(
    (item) => item.status === "queued"
  );
  const parts: string[] = [];

  if (currentRequests.length > 0) {
    const currentTitles = currentRequests
      .map((item) => item.songTitle)
      .filter((title): title is string => Boolean(title))
      .join(", ");
    parts.push(
      currentTitles.length > 0 ? `playing now: ${currentTitles}` : "playing now"
    );
  }

  if (queuedRequests.length > 0) {
    const positions = queuedRequests
      .map((item) => item.position)
      .filter((position): position is number => position != null)
      .map((position) => `#${position}`);
    parts.push(
      positions.length > 0
        ? `queued at ${positions.join(", ")}`
        : "queued in the playlist"
    );
  }

  return `${mention(input.login)} your request${activeRequests.length === 1 ? " is" : "s are"} ${parts.join(" and ")}.`;
}

export async function processEventSubChatMessage(input: {
  env: AppEnv;
  event: NormalizedChatEvent;
  parsed: ParsedChatCommand;
  deps: EventSubChatDependencies;
  channel?: EventSubChatChannel;
}): Promise<ProcessEventSubChatMessageResult> {
  const { env, event, parsed, deps } = input;
  const channel =
    input.channel ??
    (await deps.getChannelByLogin(env, event.broadcasterLogin));
  if (!channel) {
    console.error("EventSub channel lookup failed", {
      broadcasterLogin: event.broadcasterLogin,
    });
    return { body: "Channel not found", status: 202 };
  }

  if (event.messageId) {
    const existingLog = await deps.getRequestLogByMessageId(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
    });

    if (existingLog) {
      console.info(
        "EventSub chat message ignored because it was already processed",
        {
          channelId: channel.id,
          messageId: event.messageId,
        }
      );
      return { body: "Duplicate", status: 202 };
    }
  }

  const state = await deps.getDashboardState(env, channel.ownerUserId);
  if (!state?.settings) {
    return { body: "Ignored", status: 202 };
  }

  if (await deps.isBlockedUser(env, channel.id, event.chatterTwitchUserId)) {
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: event.chatterTwitchUserId,
      requesterLogin: event.chatterLogin,
      requesterDisplayName: event.chatterDisplayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "blocked",
      outcomeReason: "user_blocked",
    });
    return { body: "Blocked", status: 202 };
  }

  if (parsed.command === "addvip") {
    const targetLogin = parsed.query?.trim();
    const grantAmount = parsed.amount ?? 1;
    const canManageVipTokens =
      event.isBroadcaster ||
      (event.isModerator && state.settings.moderatorCanManageVipTokens);
    if (!canManageVipTokens) {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: event.chatterTwitchUserId,
        requesterLogin: event.chatterLogin,
        requesterDisplayName: event.chatterDisplayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        outcome: "rejected",
        outcomeReason: "vip_token_permission_denied",
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message:
          "Only the broadcaster or an allowed moderator can grant VIP tokens.",
      });
      return { body: "Rejected", status: 202 };
    }

    if (!targetLogin) {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: event.chatterTwitchUserId,
        requesterLogin: event.chatterLogin,
        requesterDisplayName: event.chatterDisplayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        outcome: "rejected",
        outcomeReason: "vip_token_missing_target",
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message:
          "Use !addvip <username> or !addvip <username> <amount> to grant VIP tokens.",
      });
      return { body: "Rejected", status: 202 };
    }

    if (!Number.isFinite(grantAmount) || grantAmount <= 0) {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: event.chatterTwitchUserId,
        requesterLogin: event.chatterLogin,
        requesterDisplayName: event.chatterDisplayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        outcome: "rejected",
        outcomeReason: "vip_token_invalid_amount",
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: "Use a VIP token amount greater than 0.",
      });
      return { body: "Rejected", status: 202 };
    }

    const resolvedTarget =
      (await deps.resolveTwitchUserByLogin(env, targetLogin)) ?? null;

    await deps.grantVipToken(env, {
      channelId: channel.id,
      login: resolvedTarget?.login ?? targetLogin,
      displayName: resolvedTarget?.displayName ?? targetLogin,
      twitchUserId: resolvedTarget?.twitchUserId ?? null,
      count: grantAmount,
    });
    await deps.createAuditLog(env, {
      channelId: channel.id,
      actorUserId: channel.ownerUserId,
      actorType: event.isBroadcaster ? "owner" : "moderator",
      action: "grant_vip_token_chat",
      entityType: "vip_token",
      entityId: resolvedTarget?.login ?? targetLogin,
      payloadJson: JSON.stringify({
        grantedBy: event.chatterLogin,
        login: resolvedTarget?.login ?? targetLogin,
        twitchUserId: resolvedTarget?.twitchUserId ?? null,
        count: grantAmount,
      }),
    });
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: event.chatterTwitchUserId,
      requesterLogin: event.chatterLogin,
      requesterDisplayName: event.chatterDisplayName,
      rawMessage: event.rawMessage,
      normalizedQuery: resolvedTarget?.login ?? targetLogin,
      outcome: "accepted",
      outcomeReason: "vip_token_granted",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: `Granted ${formatVipTokenCount(grantAmount)} VIP token${grantAmount === 1 ? "" : "s"} to ${resolvedTarget?.login ?? targetLogin}.`,
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "remove") {
    const effectiveRequester = await getEffectiveRequester(env, deps, event, {
      targetLogin: parsed.targetLogin,
    });
    if (!effectiveRequester.allowed) {
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: effectiveRequester.message,
      });
      return { body: "Rejected", status: 202 };
    }

    const kind = parseRemoveKind(parsed.query);
    if (!kind) {
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: `Use ${state.settings.commandPrefix}remove reg, ${state.settings.commandPrefix}remove vip, or ${state.settings.commandPrefix}remove all.`,
      });
      return { body: "Rejected", status: 202 };
    }

    try {
      const result = await deps.removeRequestsFromPlaylist(env, {
        channelId: channel.id,
        requesterTwitchUserId: effectiveRequester.requester.twitchUserId,
        requesterLogin: effectiveRequester.requester.login,
        actorUserId: null,
        kind,
      });
      const removedCount = Number.parseInt(
        result.message.match(/\d+/)?.[0] ?? "0",
        10
      );
      const kindLabel =
        kind === "all"
          ? "request"
          : `${kind === "regular" ? "regular" : "VIP"} request`;

      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message:
          removedCount > 0
            ? `${mention(effectiveRequester.requester.login)} removed ${removedCount} ${kindLabel}${removedCount === 1 ? "" : "s"} from this playlist.`
            : `${mention(effectiveRequester.requester.login)} you do not have any ${kindLabel}${kind === "all" ? "s" : ""} in this playlist.`,
      });
      return { body: "Accepted", status: 202 };
    } catch (error) {
      console.error("EventSub failed to remove requests from playlist", {
        channelId: channel.id,
        requesterTwitchUserId: event.chatterTwitchUserId,
        requesterLogin: event.chatterLogin,
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: `${mention(event.chatterLogin)} I couldn't remove your requests right now. Please try again.`,
      });
      return { body: "Remove failed", status: 202 };
    }
  }

  const effectiveRequester = await getEffectiveRequester(env, deps, event, {
    targetLogin: parsed.targetLogin,
  });
  if (!effectiveRequester.allowed) {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: effectiveRequester.message,
    });
    return { body: "Rejected", status: 202 };
  }

  const requesterContext = effectiveRequester.requester.context;
  const requesterIdentity = effectiveRequester.requester;

  if (parsed.command === "how") {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: buildHowMessage({
        commandPrefix: state.settings.commandPrefix,
        appUrl: env.APP_URL,
        channelSlug: channel.slug,
        allowRequestPathModifiers: state.settings.allowRequestPathModifiers,
      }),
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "search") {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: buildSearchMessage(env.APP_URL),
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "blacklist") {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: buildBlacklistMessage(
        state.blacklistArtists,
        state.blacklistCharters,
        state.blacklistSongs,
        state.blacklistSongGroups
      ),
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "setlist") {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: buildSetlistMessage(state.setlistArtists),
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "position") {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: getPositionReplyMessage({
        login: requesterIdentity.login,
        items: state.items,
        requesterTwitchUserId: requesterIdentity.twitchUserId,
      }),
    });
    return { body: "Accepted", status: 202 };
  }

  if (!state.settings.requestsEnabled) {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: "Requests are disabled for this channel right now.",
    });
    return { body: "Ignored", status: 202 };
  }

  const isVipCommand = parsed.command === "vip";
  const isEditCommand = parsed.command === "edit";
  const allowBlacklistOverride = event.isBroadcaster || event.isModerator;

  if (isVipCommand && !parsed.query) {
    const balance = await deps.getVipTokenBalance(env, {
      channelId: channel.id,
      login: requesterIdentity.login,
    });
    const availableCount = balance?.availableCount ?? 0;
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: `${mention(requesterIdentity.login)} you have ${formatVipTokenCount(availableCount)} VIP token${availableCount === 1 ? "" : "s"} available.`,
    });
    return { body: "Accepted", status: 202 };
  }

  const requesterAccess = isRequesterAllowed(state.settings, requesterContext);
  if (!requesterAccess.allowed) {
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "rejected",
      outcomeReason: requesterAccess.reason,
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message:
        requesterAccess.reason ??
        "You cannot request songs in this channel right now.",
    });
    return { body: "Rejected", status: 202 };
  }

  const activeLimit = getActiveRequestLimit(state.settings, requesterContext);
  const existingActiveCount = await deps.countActiveRequestsForUser(env, {
    channelId: channel.id,
    twitchUserId: requesterIdentity.twitchUserId,
  });
  if (isEditCommand && existingActiveCount <= 0) {
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "rejected",
      outcomeReason: "edit_target_missing_request",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: `${mention(requesterIdentity.login)} there is no active request to edit in this playlist.`,
    });
    return { body: "Rejected", status: 202 };
  }
  const effectiveActiveCount = isEditCommand
    ? Math.max(0, existingActiveCount - existingActiveCount)
    : existingActiveCount;

  const timeWindow = getRateLimitWindow(state.settings, requesterContext);
  if (timeWindow) {
    const acceptedInPeriod = await deps.countAcceptedRequestsInPeriod(env, {
      channelId: channel.id,
      twitchUserId: requesterIdentity.twitchUserId,
      since: Date.now() - timeWindow.periodSeconds * 1000,
    });

    if (acceptedInPeriod >= timeWindow.limit) {
      const message = `You have reached the request limit for the next ${timeWindow.periodSeconds} seconds.`;
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        requesterDisplayName: requesterIdentity.displayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        outcome: "rejected",
        outcomeReason: "time_window_limit",
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message,
      });
      return { body: "Rejected", status: 202 };
    }
  }

  const vipTokenBalance = isVipCommand
    ? await deps.getVipTokenBalance(env, {
        channelId: channel.id,
        login: requesterIdentity.login,
      })
    : null;
  // Intentionally disabled for now. The original one-time auto-grant behavior
  // does not match the intended product behavior, which should track recurring
  // subscriber renewal periods before granting monthly VIP tokens.
  const canAutoGrantVipToken = false;

  if (
    isVipCommand &&
    !hasRedeemableVipToken(vipTokenBalance?.availableCount ?? 0) &&
    !canAutoGrantVipToken
  ) {
    const balanceText = vipTokenBalance
      ? ` You have ${formatVipTokenCount(vipTokenBalance.availableCount)}.`
      : "";
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "rejected",
      outcomeReason: "vip_token_required",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: `You do not have enough VIP tokens for this channel.${balanceText}`,
    });
    return { body: "Rejected", status: 202 };
  }

  const parsedRequest = parseRequestModifiers(parsed.query?.trim() ?? "", {
    allowPathModifiers: state.settings.allowRequestPathModifiers,
  });
  const requestMode = parsedRequest.mode;
  const normalizedQuery = parsedRequest.query;
  const unmatchedQuery = normalizedQuery;
  const requestedPaths = parsedRequest.requestedPaths;

  if (!normalizedQuery) {
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "rejected",
      outcomeReason: "missing_request_query",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: `${mention(requesterIdentity.login)} include an artist or song before using request modifiers.`,
    });
    return { body: "Rejected", status: 202 };
  }

  let firstMatch: SongSearchResult | null = null;
  let candidateMatchesJson: string | undefined;
  let firstRejectedMatch:
    | {
        song: SongSearchResult;
        reason?: string;
        reasonCode?: string;
      }
    | undefined;

  try {
    const requestedSourceSongId =
      requestMode === "catalog"
        ? extractRequestedSourceSongId(normalizedQuery)
        : null;
    if (requestMode === "choice") {
      const choiceAvailability = await resolveChatChoiceAvailability({
        env,
        deps,
        query: normalizedQuery,
        state,
        requesterContext,
        allowBlacklistOverride,
        requestedPaths,
      });

      if (
        !choiceAvailability.allowed &&
        choiceAvailability.firstRejectedMatch
      ) {
        firstRejectedMatch = choiceAvailability.firstRejectedMatch;
      }
    } else if (requestMode === "random") {
      const randomMatch = await resolveChatRandomMatch({
        env,
        deps,
        query: normalizedQuery,
        state,
        requesterContext,
        allowBlacklistOverride,
        requestedPaths,
      });
      firstMatch = randomMatch.firstMatch;
      firstRejectedMatch = randomMatch.firstRejectedMatch;
    } else if (requestedSourceSongId != null) {
      firstMatch = await deps.getCatalogSongBySourceId(
        env,
        requestedSourceSongId
      );
    } else {
      const search = await deps.searchSongs(env, {
        query: normalizedQuery,
        page: 1,
        pageSize: 5,
      });
      candidateMatchesJson = buildCandidateMatchesJson(search.results);
      for (const result of search.results) {
        const effectiveSongAllowance = getSongAllowance({
          song: result,
          state,
          requesterContext,
          allowBlacklistOverride,
          requestedPaths,
        });

        if (effectiveSongAllowance.allowed) {
          firstMatch = result;
          break;
        }

        if (!firstRejectedMatch) {
          firstRejectedMatch = {
            song: result,
            reason: effectiveSongAllowance.reason,
            reasonCode:
              "reasonCode" in effectiveSongAllowance
                ? effectiveSongAllowance.reasonCode
                : undefined,
          };
        }
      }
    }
  } catch (error) {
    console.error("EventSub song lookup failed", {
      channelId: channel.id,
      query: parsed.query,
      error: error instanceof Error ? error.message : String(error),
    });
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "error",
      outcomeReason: "song_lookup_failed",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: `${mention(requesterIdentity.login)} I ran into a problem searching for that song. Please try again.`,
    });
    return { body: "Lookup failed", status: 202 };
  }

  if (firstMatch) {
    const firstMatchAllowance = getSongAllowance({
      song: firstMatch,
      state,
      requesterContext,
      allowBlacklistOverride,
      requestedPaths,
    });

    if (!firstMatchAllowance.allowed) {
      firstRejectedMatch ??= {
        song: firstMatch,
        reason: firstMatchAllowance.reason,
        reasonCode:
          "reasonCode" in firstMatchAllowance
            ? firstMatchAllowance.reasonCode
            : undefined,
      };
      firstMatch = null;
    }
  }

  let warningCode: string | undefined;
  let warningMessage: string | undefined;

  if (requestMode === "choice") {
    if (firstRejectedMatch) {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        requesterDisplayName: requesterIdentity.displayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        matchedSongId: firstRejectedMatch.song.id,
        matchedSongTitle: firstRejectedMatch.song.title,
        matchedSongArtist: firstRejectedMatch.song.artist,
        outcome: "rejected",
        outcomeReason: firstRejectedMatch.reason,
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: getRejectedSongMessage({
          login: requesterIdentity.login,
          reason: firstRejectedMatch.reason,
          reasonCode: firstRejectedMatch.reasonCode,
        }),
      });
      return { body: "Rejected", status: 202 };
    }

    warningCode = STREAMER_CHOICE_WARNING_CODE;
  } else if (!firstMatch) {
    if (firstRejectedMatch) {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        requesterDisplayName: requesterIdentity.displayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        matchedSongId: firstRejectedMatch.song.id,
        matchedSongTitle: firstRejectedMatch.song.title,
        matchedSongArtist: firstRejectedMatch.song.artist,
        outcome: "rejected",
        outcomeReason: firstRejectedMatch.reason,
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: getRejectedSongMessage({
          login: requesterIdentity.login,
          reason: firstRejectedMatch.reason,
          reasonCode: firstRejectedMatch.reasonCode,
        }),
      });
      return { body: "Rejected", status: 202 };
    }

    if (requestMode === "random") {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        requesterDisplayName: requesterIdentity.displayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        outcome: "rejected",
        outcomeReason: "random_match_missing",
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: `${mention(requesterIdentity.login)} I couldn't find an allowed random match for "${unmatchedQuery}".`,
      });
      return { body: "Rejected", status: 202 };
    }

    warningCode = "no_song_match";
    warningMessage = `No matching track found for "${unmatchedQuery}".`;
  }

  if (firstMatch) {
    const songAllowed = getSongAllowance({
      song: firstMatch,
      state,
      requesterContext,
      allowBlacklistOverride,
      requestedPaths,
    });

    if (!songAllowed.allowed) {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        requesterDisplayName: requesterIdentity.displayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        matchedSongId: firstMatch.id,
        matchedSongTitle: firstMatch.title,
        matchedSongArtist: firstMatch.artist,
        outcome: "rejected",
        outcomeReason: songAllowed.reason,
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: getRejectedSongMessage({
          login: requesterIdentity.login,
          reason: songAllowed.reason,
          reasonCode:
            "reasonCode" in songAllowed ? songAllowed.reasonCode : undefined,
        }),
      });
      return { body: "Rejected", status: 202 };
    }

    const warningForRequiredPaths = getRequiredPathsWarning({
      song: firstMatch,
      settings: state.settings,
    });

    if (warningForRequiredPaths) {
      warningCode = "missing_required_paths";
      warningMessage = warningForRequiredPaths;
    }
  }

  const existingMatchingRequest =
    (requestMode === "choice"
      ? getRequesterMatchingSpecialItem({
          items: state.items,
          requesterTwitchUserId: requesterIdentity.twitchUserId,
          requestedQuery: unmatchedQuery,
          warningCode: STREAMER_CHOICE_WARNING_CODE,
        })
      : getRequesterMatchingActiveItem({
          items: state.items,
          requesterTwitchUserId: requesterIdentity.twitchUserId,
          matchedSongId: firstMatch?.id ?? null,
        })) ?? null;

  if (
    existingMatchingRequest &&
    existingMatchingRequest.requestKind ===
      (isVipCommand ? "vip" : "regular") &&
    !isEditCommand
  ) {
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      matchedSongId: firstMatch?.id ?? null,
      matchedSongTitle: firstMatch?.title ?? null,
      matchedSongArtist: firstMatch?.artist ?? null,
      outcome: "rejected",
      outcomeReason: "existing_request_same_song",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message:
        requestMode === "choice"
          ? `${mention(requesterIdentity.login)} that streamer choice request is already in your active requests.`
          : `${mention(requesterIdentity.login)} that song is already in your active requests.`,
    });
    return { body: "Rejected", status: 202 };
  }

  if (
    Number.isFinite(activeLimit) &&
    effectiveActiveCount >= activeLimit &&
    !existingMatchingRequest
  ) {
    const message = `You already have ${activeLimit} active request${activeLimit === 1 ? "" : "s"} in the playlist.`;
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "rejected",
      outcomeReason: "active_request_limit",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message,
    });
    return { body: "Rejected", status: 202 };
  }

  if (
    firstMatch &&
    !existingMatchingRequest &&
    state.settings.duplicateWindowSeconds > 0 &&
    state.logs.some(
      (log) =>
        log.matchedSongId === firstMatch.id &&
        log.outcome === "accepted" &&
        Date.now() - log.createdAt <=
          state.settings.duplicateWindowSeconds * 1000
    )
  ) {
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      matchedSongId: firstMatch.id,
      matchedSongTitle: firstMatch.title,
      matchedSongArtist: firstMatch.artist,
      outcome: "rejected",
      outcomeReason: "duplicate_window",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: `${mention(requesterIdentity.login)} that song was requested too recently. Please wait before requesting it again.`,
    });
    return { body: "Rejected", status: 202 };
  }

  if (
    state.items.length >= state.settings.maxQueueSize &&
    !existingMatchingRequest
  ) {
    const effectiveQueueCount = isEditCommand
      ? Math.max(0, state.items.length - existingActiveCount)
      : state.items.length;
    if (effectiveQueueCount < state.settings.maxQueueSize) {
      // space is available once the target request is edited
    } else {
      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        requesterDisplayName: requesterIdentity.displayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        matchedSongId: firstMatch?.id ?? null,
        matchedSongTitle: firstMatch?.title ?? null,
        matchedSongArtist: firstMatch?.artist ?? null,
        outcome: "rejected",
        outcomeReason: "max_queue_size",
      });
      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message: `${mention(requesterIdentity.login)} the playlist is full right now.`,
      });
      return { body: "Rejected", status: 202 };
    }
  }

  try {
    if (
      existingMatchingRequest &&
      existingMatchingRequest.requestKind !== (isVipCommand ? "vip" : "regular")
    ) {
      await deps.changeRequestKind(env, {
        channelId: channel.id,
        itemId: existingMatchingRequest.id,
        requestKind: isVipCommand ? "vip" : "regular",
      });

      await deps.createRequestLog(env, {
        channelId: channel.id,
        twitchMessageId: event.messageId,
        twitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        requesterDisplayName: requesterIdentity.displayName,
        rawMessage: event.rawMessage,
        normalizedQuery: parsed.query,
        matchedSongId: firstMatch?.id ?? null,
        matchedSongTitle: firstMatch?.title ?? null,
        matchedSongArtist: firstMatch?.artist ?? null,
        outcome: "accepted",
        outcomeReason: isVipCommand
          ? "vip_request_upgrade"
          : "vip_request_downgrade",
      });

      if (isVipCommand) {
        if (canAutoGrantVipToken) {
          await deps.grantVipToken(env, {
            channelId: channel.id,
            login: requesterIdentity.login,
            displayName: requesterIdentity.displayName,
            twitchUserId: requesterIdentity.twitchUserId,
            autoSubscriberGrant: true,
          });
        }

        await deps.consumeVipToken(env, {
          channelId: channel.id,
          login: requesterIdentity.login,
          displayName: requesterIdentity.displayName,
          twitchUserId: requesterIdentity.twitchUserId,
        });
      } else {
        await deps.grantVipToken(env, {
          channelId: channel.id,
          login: requesterIdentity.login,
          displayName: requesterIdentity.displayName,
          twitchUserId: requesterIdentity.twitchUserId,
        });
      }

      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message:
          requestMode === "choice"
            ? `${mention(requesterIdentity.login)} ${formatSpecialRequestReply({
                requestedText: unmatchedQuery,
                requestKind: isVipCommand ? "vip" : "regular",
                status: existingMatchingRequest.status,
                existing: true,
              })}`
            : isVipCommand
              ? `${mention(requesterIdentity.login)} your existing request "${firstMatch ? formatSongForReply(firstMatch) : unmatchedQuery}" is now a VIP request${existingMatchingRequest.status === "current" ? "." : " and will play next."} 1 VIP token was used.`
              : `${mention(requesterIdentity.login)} your existing VIP request "${firstMatch ? formatSongForReply(firstMatch) : unmatchedQuery}" is now a regular request again. 1 VIP token was refunded.`,
      });
      return { body: "Accepted", status: 202 };
    }

    if (isEditCommand && existingActiveCount > 0) {
      await deps.removeRequestsFromPlaylist(env, {
        channelId: channel.id,
        requesterTwitchUserId: requesterIdentity.twitchUserId,
        requesterLogin: requesterIdentity.login,
        actorUserId: null,
        kind: "all",
      });
    }

    const playlistResult = await deps.addRequestToPlaylist(env, {
      channelId: channel.id,
      requestedByTwitchUserId: requesterIdentity.twitchUserId,
      requestedByLogin: requesterIdentity.login,
      requestedByDisplayName: requesterIdentity.displayName,
      messageId: event.messageId,
      prioritizeNext: isVipCommand,
      requestKind: isVipCommand ? "vip" : "regular",
      song:
        requestMode === "choice"
          ? buildStreamerChoiceSong(unmatchedQuery)
          : {
              id: firstMatch?.id ?? createId("rqm"),
              title: firstMatch?.title ?? unmatchedQuery,
              groupedProjectId: firstMatch?.groupedProjectId,
              artist: firstMatch?.artist,
              album: firstMatch?.album,
              creator: firstMatch?.creator,
              tuning: firstMatch?.tuning,
              parts: firstMatch?.parts,
              durationText: firstMatch?.durationText,
              cdlcId: firstMatch?.sourceId,
              source: firstMatch?.source ?? "unmatched",
              sourceUrl: firstMatch?.sourceUrl,
              requestedQuery: unmatchedQuery || undefined,
              warningCode,
              warningMessage,
              candidateMatchesJson,
            },
    });

    if (playlistResult.duplicate) {
      console.info(
        "EventSub chat message ignored because playlist request already exists",
        {
          channelId: channel.id,
          messageId: event.messageId,
          changedItemId: playlistResult.changedItemId,
        }
      );

      const existingLog = event.messageId
        ? await deps.getRequestLogByMessageId(env, {
            channelId: channel.id,
            twitchMessageId: event.messageId,
          })
        : null;

      if (!existingLog) {
        await deps.createRequestLog(env, {
          channelId: channel.id,
          twitchMessageId: event.messageId,
          twitchUserId: requesterIdentity.twitchUserId,
          requesterLogin: requesterIdentity.login,
          requesterDisplayName: requesterIdentity.displayName,
          rawMessage: event.rawMessage,
          normalizedQuery: parsed.query,
          matchedSongId: firstMatch?.id ?? null,
          matchedSongTitle: firstMatch?.title ?? null,
          matchedSongArtist: firstMatch?.artist ?? null,
          outcome: "accepted",
          outcomeReason:
            warningCode ??
            (isVipCommand ? "vip_request" : "duplicate_delivery"),
        });

        await deps.sendChatReply(env, {
          channelId: channel.id,
          broadcasterUserId: channel.twitchChannelId,
          message:
            requestMode === "choice"
              ? `${mention(requesterIdentity.login)} ${formatSpecialRequestReply(
                  {
                    requestedText: unmatchedQuery,
                    requestKind: isVipCommand ? "vip" : "regular",
                  }
                )}`
              : !firstMatch
                ? `${mention(requesterIdentity.login)} there was no matching track found for "${unmatchedQuery}", but I added it anyway. ${buildChannelPlaylistMessage(env.APP_URL, channel.slug)}`
                : warningCode === "missing_required_paths"
                  ? `${mention(requesterIdentity.login)} your song "${formatSongForReply(firstMatch)}" has been added to the playlist, but it is missing required paths: ${warningMessage?.replace("Missing required paths: ", "").replace(/\.$/, "")}.`
                  : isVipCommand
                    ? `${mention(requesterIdentity.login)} your VIP song "${formatSongForReply(firstMatch)}" will play next.`
                    : `${mention(requesterIdentity.login)} your song "${formatSongForReply(firstMatch)}" has been added to the playlist.`,
        });
      }

      return { body: "Duplicate", status: 202 };
    }

    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      matchedSongId: firstMatch?.id ?? null,
      matchedSongTitle: firstMatch?.title ?? null,
      matchedSongArtist: firstMatch?.artist ?? null,
      outcome: "accepted",
      outcomeReason: warningCode ?? (isVipCommand ? "vip_request" : null),
    });

    if (isVipCommand) {
      if (canAutoGrantVipToken) {
        await deps.grantVipToken(env, {
          channelId: channel.id,
          login: requesterIdentity.login,
          displayName: requesterIdentity.displayName,
          twitchUserId: requesterIdentity.twitchUserId,
          autoSubscriberGrant: true,
        });
      }

      await deps.consumeVipToken(env, {
        channelId: channel.id,
        login: requesterIdentity.login,
        displayName: requesterIdentity.displayName,
        twitchUserId: requesterIdentity.twitchUserId,
      });
    }

    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message:
        requestMode === "choice"
          ? `${mention(requesterIdentity.login)} ${formatSpecialRequestReply({
              requestedText: unmatchedQuery,
              requestKind: isVipCommand ? "vip" : "regular",
            })}`
          : !firstMatch
            ? `${mention(requesterIdentity.login)} there was no matching track found for "${unmatchedQuery}", but I added it anyway. ${buildChannelPlaylistMessage(env.APP_URL, channel.slug)}`
            : warningCode === "missing_required_paths"
              ? `${mention(requesterIdentity.login)} your song "${formatSongForReply(firstMatch)}" has been added to the playlist, but it is missing required paths: ${warningMessage?.replace("Missing required paths: ", "").replace(/\.$/, "")}.`
              : isVipCommand
                ? `${mention(requesterIdentity.login)} your VIP song "${formatSongForReply(firstMatch)}" will play next.`
                : `${mention(requesterIdentity.login)} your song "${formatSongForReply(firstMatch)}" has been added to the playlist.`,
    });
  } catch (error) {
    console.error("EventSub failed to add request to playlist", {
      channelId: channel.id,
      songId: firstMatch?.id ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      matchedSongId: firstMatch?.id ?? null,
      matchedSongTitle: firstMatch?.title ?? null,
      matchedSongArtist: firstMatch?.artist ?? null,
      outcome: "error",
      outcomeReason: "playlist_add_failed",
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message:
        requestMode === "choice"
          ? `${mention(requesterIdentity.login)} I couldn't add your streamer choice request right now. Please try again.`
          : firstMatch
            ? `${mention(requesterIdentity.login)} I found a song match, but I couldn't add it to the playlist. Please try again.`
            : `${mention(requesterIdentity.login)} I couldn't find a song match, and I couldn't add the warning request to the playlist. Please try again.`,
    });
    return { body: "Playlist add failed", status: 202 };
  }

  return { body: "Accepted", status: 202 };
}

export function createEventSubChatDependencies(): EventSubChatDependencies {
  return {
    getChannelByLogin: async (env, login) =>
      (await getChannelByLogin(env, login)) ?? null,
    getRequestLogByMessageId,
    getDashboardState: async (env, ownerUserId) =>
      getDashboardState(env, ownerUserId) as Promise<EventSubChatState | null>,
    countActiveRequestsForUser,
    countAcceptedRequestsInPeriod,
    isBlockedUser,
    getVipTokenBalance: async (env, input) =>
      getVipTokenBalance(env, input) as Promise<VipTokenBalance | null>,
    grantVipToken,
    consumeVipToken,
    getCatalogSongBySourceId,
    searchSongs: async (env, input) => searchCatalogSongs(env, input),
    resolveTwitchUserByLogin: async (env, login) => {
      const response = await callBackend(
        env,
        `/internal/twitch/user-by-login?login=${encodeURIComponent(login)}`,
        {
          method: "GET",
        }
      );
      const payload = (await response.json()) as {
        user: {
          twitchUserId: string;
          login: string;
          displayName: string;
        } | null;
      };
      return payload.user;
    },
    addRequestToPlaylist: async (env, input) => {
      const response = await callBackend(
        env,
        "/internal/playlist/add-request",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }
      );
      return (await response.json()) as PlaylistMutationResult;
    },
    removeRequestsFromPlaylist: async (env, input) => {
      const response = await callBackend(
        env,
        "/internal/playlist/remove-requests",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }
      );
      return (await response.json()) as PlaylistMutationResult;
    },
    changeRequestKind: async (env, input) => {
      const response = await callBackend(env, "/internal/playlist/mutate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "changeRequestKind",
          ...input,
        }),
      });
      return (await response.json()) as PlaylistMutationResult;
    },
    createRequestLog: async (env, input) =>
      createRequestLog(env, input as never),
    createAuditLog: async (env, input) => createAuditLog(env, input as never),
    sendChatReply: async (env, input) => {
      console.info("Queueing Twitch chat reply", {
        channelId: input.channelId,
        broadcasterUserId: input.broadcasterUserId,
        message: input.message,
      });
      return env.TWITCH_REPLY_QUEUE.send(input);
    },
  };
}

async function getEffectiveRequester(
  env: AppEnv,
  deps: EventSubChatDependencies,
  event: NormalizedChatEvent,
  input: {
    targetLogin?: string;
  }
) {
  const targetLogin = normalizeRequestedLogin(input.targetLogin);
  if (!targetLogin || targetLogin === event.chatterLogin.toLowerCase()) {
    return {
      allowed: true as const,
      requester: {
        twitchUserId: event.chatterTwitchUserId,
        login: event.chatterLogin,
        displayName: event.chatterDisplayName,
        context: {
          isBroadcaster: event.isBroadcaster,
          isModerator: event.isModerator,
          isVip: event.isVip,
          isSubscriber: event.isSubscriber,
        },
      },
    };
  }

  if (!event.isBroadcaster && !event.isModerator) {
    return {
      allowed: false as const,
      message:
        "Only the broadcaster or a moderator can request for someone else.",
    };
  }

  const resolved = await deps.resolveTwitchUserByLogin(env, targetLogin);
  if (!resolved) {
    return {
      allowed: false as const,
      message: `I couldn't find Twitch user @${targetLogin}.`,
    };
  }

  return {
    allowed: true as const,
    requester: {
      twitchUserId: resolved.twitchUserId,
      login: resolved.login,
      displayName: resolved.displayName,
      context: {
        isBroadcaster: resolved.twitchUserId === event.broadcasterTwitchUserId,
        isModerator: false,
        isVip: false,
        isSubscriber: false,
      },
    },
  };
}
