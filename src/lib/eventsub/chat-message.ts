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
import { getServerTranslation } from "~/lib/i18n/server";
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
  getMissingRequiredPaths,
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
  defaultLocale: string;
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

type Translate = (key: string, options?: Record<string, unknown>) => string;

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
  requestedPaths?: string[];
  translate: Translate;
}) {
  if (
    input.reasonCode === "charter_blacklist" ||
    input.reasonCode === "song_blacklist" ||
    input.reasonCode === "version_blacklist"
  ) {
    return input.translate("replies.rejectedSongBlocked", {
      mention: mention(input.login),
    });
  }

  return input.translate("replies.rejectedSongReason", {
    mention: mention(input.login),
    reason: getLocalizedReasonText({
      reason: input.reason,
      reasonCode: input.reasonCode,
      requestedPaths: input.requestedPaths,
      translate: input.translate,
    }),
  });
}

function getLocalizedReasonText(input: {
  reason?: string;
  reasonCode?: string;
  requestedPaths?: string[];
  translate: Translate;
}) {
  switch (input.reasonCode) {
    case "requests_disabled":
    case "vip_requests_disabled":
    case "subscriber_requests_disabled":
    case "subscriber_or_vip_only":
    case "only_official_dlc":
    case "disallowed_tuning":
    case "artist_not_in_setlist":
      return input.translate(`reasons.${input.reasonCode}`);
    case "requested_paths_not_matched":
      return input.translate("reasons.requested_paths_not_matched", {
        count: input.requestedPaths?.length ?? 0,
        paths: formatPathList(input.requestedPaths ?? [], input.translate),
      });
    default:
      return input.reason ?? input.translate("replies.requestDeniedFallback");
  }
}

function getRequestedPathMismatchMessage(
  requestedPaths: string[],
  translate?: Translate
) {
  if (!translate) {
    const formattedPaths = formatPathList(requestedPaths);
    return `That song does not include the requested path${requestedPaths.length === 1 ? "" : "s"}: ${formattedPaths}.`;
  }

  return translate("reasons.requested_paths_not_matched", {
    count: requestedPaths.length,
    paths: formatPathList(requestedPaths, translate),
  });
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
  translate?: Translate;
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
      reason: getRequestedPathMismatchMessage(
        input.requestedPaths,
        input.translate
      ),
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
  translate: Translate;
}) {
  if (input.requestKind === "vip") {
    const nextPositionSuffix =
      input.status === "current" ? "." : " and will play next.";
    return input.existing
      ? input.translate("replies.choiceExistingVip", {
          query: input.requestedText,
          suffix: nextPositionSuffix,
        })
      : input.translate("replies.choiceNewVip", {
          query: input.requestedText,
          suffix: nextPositionSuffix,
        });
  }

  return input.existing
    ? input.translate("replies.choiceExistingRegular", {
        query: input.requestedText,
      })
    : input.translate("replies.choiceNewRegular", {
        query: input.requestedText,
      });
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
  translate: Translate;
}) {
  const activeRequests = input.items
    .filter(
      (item) =>
        item.requestedByTwitchUserId === input.requesterTwitchUserId &&
        (item.status === "queued" || item.status === "current")
    )
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

  if (activeRequests.length === 0) {
    return input.translate("replies.positionNone", {
      mention: mention(input.login),
    });
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
      currentTitles.length > 0
        ? input.translate("replies.positionPlayingNow", {
            titles: currentTitles,
          })
        : input.translate("replies.positionPlayingNowFallback")
    );
  }

  if (queuedRequests.length > 0) {
    const positions = queuedRequests
      .map((item) => item.position)
      .filter((position): position is number => position != null)
      .map((position) => `#${position}`);
    parts.push(
      positions.length > 0
        ? input.translate("replies.positionQueuedAt", {
            positions: positions.join(", "),
          })
        : input.translate("replies.positionQueuedFallback")
    );
  }

  return input.translate("replies.positionSummary", {
    mention: mention(input.login),
    count: activeRequests.length,
    parts: parts.join(" and "),
  });
}

function getKindLabel(kind: "regular" | "vip" | "all", translate: Translate) {
  switch (kind) {
    case "regular":
      return translate("labels.regularRequest");
    case "vip":
      return translate("labels.vipRequest");
    default:
      return translate("labels.request");
  }
}

function getMissingRequiredPathsText(input: {
  song: SongSearchResult;
  settings: Pick<
    EventSubChatState["settings"],
    "requiredPathsJson" | "requiredPathsMatchMode"
  >;
  translate: Translate;
}) {
  return formatPathList(
    getMissingRequiredPaths({
      song: input.song,
      settings: input.settings,
    }),
    input.translate
  );
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
  const { t } = getServerTranslation(state.settings.defaultLocale, "bot");

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
        message: t("replies.vipPermissionDenied"),
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
        message: t("replies.addVipUsage"),
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
        message: t("replies.invalidVipAmount"),
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
      message: t("replies.grantedVipTokens", {
        count: grantAmount,
        countText: formatVipTokenCount(grantAmount),
        login: resolvedTarget?.login ?? targetLogin,
      }),
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "remove") {
    const effectiveRequester = await getEffectiveRequester(env, deps, event, {
      targetLogin: parsed.targetLogin,
      translate: t,
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
        message: t("replies.removeUsage", {
          commandPrefix: state.settings.commandPrefix,
        }),
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
      const kindLabel = getKindLabel(kind, t);

      await deps.sendChatReply(env, {
        channelId: channel.id,
        broadcasterUserId: channel.twitchChannelId,
        message:
          removedCount > 0
            ? t("replies.removeSuccess", {
                mention: mention(effectiveRequester.requester.login),
                count: removedCount,
                kindLabel,
              })
            : t("replies.removeEmpty", {
                mention: mention(effectiveRequester.requester.login),
                kind,
                kindLabel,
              }),
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
        message: t("replies.removeFailed", {
          mention: mention(event.chatterLogin),
        }),
      });
      return { body: "Remove failed", status: 202 };
    }
  }

  const effectiveRequester = await getEffectiveRequester(env, deps, event, {
    targetLogin: parsed.targetLogin,
    translate: t,
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
        translate: t,
      }),
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "search") {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: buildSearchMessage(env.APP_URL, t),
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
        state.blacklistSongGroups,
        t
      ),
    });
    return { body: "Accepted", status: 202 };
  }

  if (parsed.command === "setlist") {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: buildSetlistMessage(state.setlistArtists, t),
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
        translate: t,
      }),
    });
    return { body: "Accepted", status: 202 };
  }

  if (!state.settings.requestsEnabled) {
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: t("replies.requestsDisabledNow"),
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
      message: t("replies.vipBalanceAvailable", {
        mention: mention(requesterIdentity.login),
        count: availableCount,
        countText: formatVipTokenCount(availableCount),
      }),
    });
    return { body: "Accepted", status: 202 };
  }

  const requesterAccess = isRequesterAllowed(state.settings, requesterContext);
  if (!requesterAccess.allowed) {
    const requesterAccessReasonCode =
      "reasonCode" in requesterAccess ? requesterAccess.reasonCode : undefined;
    await deps.createRequestLog(env, {
      channelId: channel.id,
      twitchMessageId: event.messageId,
      twitchUserId: requesterIdentity.twitchUserId,
      requesterLogin: requesterIdentity.login,
      requesterDisplayName: requesterIdentity.displayName,
      rawMessage: event.rawMessage,
      normalizedQuery: parsed.query,
      outcome: "rejected",
      outcomeReason: requesterAccessReasonCode ?? requesterAccess.reason,
    });
    await deps.sendChatReply(env, {
      channelId: channel.id,
      broadcasterUserId: channel.twitchChannelId,
      message: getLocalizedReasonText({
        reason: requesterAccess.reason,
        reasonCode: requesterAccessReasonCode,
        translate: t,
      }),
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
      message: t("replies.noActiveRequestToEdit", {
        mention: mention(requesterIdentity.login),
      }),
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
      const message = t("replies.timeWindowLimit", {
        seconds: timeWindow.periodSeconds,
      });
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
  // Subscriber VIP automation is handled by dedicated support-event flows.
  // Keep this disabled here so VIP redemption does not quietly mint tokens,
  // especially for renewal cases that Twitch does not expose automatically.
  const canAutoGrantVipToken = false;

  if (
    isVipCommand &&
    !hasRedeemableVipToken(vipTokenBalance?.availableCount ?? 0) &&
    !canAutoGrantVipToken
  ) {
    const balanceSuffix = vipTokenBalance
      ? t("replies.vipBalanceSuffix", {
          count: vipTokenBalance.availableCount,
          countText: formatVipTokenCount(vipTokenBalance.availableCount),
        })
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
      message: t("replies.notEnoughVipTokens", {
        balanceSuffix,
      }),
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
      message: t("replies.requestQueryMissing", {
        mention: mention(requesterIdentity.login),
      }),
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
      message: t("replies.songLookupFailed", {
        mention: mention(requesterIdentity.login),
      }),
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
          requestedPaths,
          translate: t,
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
          requestedPaths,
          translate: t,
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
        message: t("replies.randomNotFound", {
          mention: mention(requesterIdentity.login),
          query: unmatchedQuery,
        }),
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
          requestedPaths,
          translate: t,
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
          ? t("replies.choiceAlreadyActive", {
              mention: mention(requesterIdentity.login),
            })
          : t("replies.songAlreadyActive", {
              mention: mention(requesterIdentity.login),
            }),
    });
    return { body: "Rejected", status: 202 };
  }

  if (
    Number.isFinite(activeLimit) &&
    effectiveActiveCount >= activeLimit &&
    !existingMatchingRequest
  ) {
    const message = t("replies.activeRequestLimit", {
      count: activeLimit,
    });
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
      message: t("replies.duplicateWindow", {
        mention: mention(requesterIdentity.login),
      }),
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
        message: t("replies.playlistFull", {
          mention: mention(requesterIdentity.login),
        }),
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
                translate: t,
              })}`
            : isVipCommand
              ? t("replies.existingSongVip", {
                  mention: mention(requesterIdentity.login),
                  song: firstMatch
                    ? formatSongForReply(firstMatch)
                    : unmatchedQuery,
                  suffix:
                    existingMatchingRequest.status === "current"
                      ? "."
                      : " and will play next.",
                })
              : t("replies.existingSongRegular", {
                  mention: mention(requesterIdentity.login),
                  song: firstMatch
                    ? formatSongForReply(firstMatch)
                    : unmatchedQuery,
                }),
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
                    translate: t,
                  }
                )}`
              : !firstMatch
                ? t("replies.unmatchedAdded", {
                    mention: mention(requesterIdentity.login),
                    query: unmatchedQuery,
                    playlistUrlMessage: buildChannelPlaylistMessage(
                      env.APP_URL,
                      channel.slug,
                      t
                    ),
                  })
                : warningCode === "missing_required_paths"
                  ? t("replies.missingRequiredPathsAdded", {
                      mention: mention(requesterIdentity.login),
                      song: formatSongForReply(firstMatch),
                      paths: getMissingRequiredPathsText({
                        song: firstMatch,
                        settings: state.settings,
                        translate: t,
                      }),
                    })
                  : isVipCommand
                    ? t("replies.vipSongAdded", {
                        mention: mention(requesterIdentity.login),
                        song: formatSongForReply(firstMatch),
                      })
                    : t("replies.songAdded", {
                        mention: mention(requesterIdentity.login),
                        song: formatSongForReply(firstMatch),
                      }),
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
              translate: t,
            })}`
          : !firstMatch
            ? t("replies.unmatchedAdded", {
                mention: mention(requesterIdentity.login),
                query: unmatchedQuery,
                playlistUrlMessage: buildChannelPlaylistMessage(
                  env.APP_URL,
                  channel.slug,
                  t
                ),
              })
            : warningCode === "missing_required_paths"
              ? t("replies.missingRequiredPathsAdded", {
                  mention: mention(requesterIdentity.login),
                  song: formatSongForReply(firstMatch),
                  paths: getMissingRequiredPathsText({
                    song: firstMatch,
                    settings: state.settings,
                    translate: t,
                  }),
                })
              : isVipCommand
                ? t("replies.vipSongAdded", {
                    mention: mention(requesterIdentity.login),
                    song: formatSongForReply(firstMatch),
                  })
                : t("replies.songAdded", {
                    mention: mention(requesterIdentity.login),
                    song: formatSongForReply(firstMatch),
                  }),
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
          ? t("replies.choiceAddFailed", {
              mention: mention(requesterIdentity.login),
            })
          : firstMatch
            ? t("replies.songAddFailedMatched", {
                mention: mention(requesterIdentity.login),
              })
            : t("replies.songAddFailedUnmatched", {
                mention: mention(requesterIdentity.login),
              }),
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
    translate: Translate;
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
      message: input.translate("replies.targetPermissionDenied"),
    };
  }

  const resolved = await deps.resolveTwitchUserByLogin(env, targetLogin);
  if (!resolved) {
    return {
      allowed: false as const,
      message: input.translate("replies.twitchUserNotFound", {
        login: targetLogin,
      }),
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
