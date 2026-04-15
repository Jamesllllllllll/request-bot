import { and, desc, eq, gte } from "drizzle-orm";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import { getDb } from "~/lib/db/client";
import {
  type CatalogSearchInput,
  consumeVipToken,
  countAcceptedRequestsInPeriod,
  countActiveRequestsForUser,
  createRequestLog,
  getActiveBroadcasterAuthorizationForChannel,
  getCatalogSongById,
  getCatalogSongGroupRowsForSongId,
  getChannelBlacklistByChannelId,
  getChannelBySlug,
  getChannelPreferredChartersByChannelId,
  getChannelSettingsByChannelId,
  getPlaylistByChannelId,
  getUserById,
  getVipRequestCooldown,
  getVipTokenBalance,
  grantVipToken,
  isBlockedUser,
  parseAuthorizationScopes,
  searchCatalogSongs,
} from "~/lib/db/repositories";
import { requestLogs, setlistArtists } from "~/lib/db/schema";
import type { AppEnv } from "~/lib/env";
import {
  buildPlaylistCandidateMatchesFromCatalogSongs,
  buildPlaylistCandidateMatchesJson,
  getPreferredCharterSets,
} from "~/lib/playlist/candidate-matches";
import type { PlaylistMutationResult } from "~/lib/playlist/types";
import {
  ADD_REQUESTS_WHEN_LIVE_MESSAGE,
  areChannelRequestsOpen,
} from "~/lib/request-availability";
import {
  STREAMER_CHOICE_TITLE,
  STREAMER_CHOICE_WARNING_CODE,
} from "~/lib/request-modes";
import {
  formatPathLabel,
  getActiveRequestLimit,
  getAllowedRequestPathsSetting,
  getRateLimitWindow,
  getRequiredPathsMatchMode,
  getRequiredPathsSetting,
  getRequiredPathsWarning,
  isRequesterAllowed,
  isSongAllowed,
  type RequesterContext,
  songMatchesRequestedPaths,
} from "~/lib/request-policy";
import {
  buildRequestedPathQuery,
  getRequestVipTokenPlan,
  getStoredRequestedPaths,
  normalizeRequestedPath,
  type RequestPathOption,
  type RequestVipTokenPlanReason,
  requestedPathsMatch,
} from "~/lib/requested-paths";
import { parseStoredTuningIds } from "~/lib/tunings";
import { getBroadcasterSubscriptions, TwitchApiError } from "~/lib/twitch/api";
import type { RequesterChatBadge } from "~/lib/twitch/chat-badges";
import { createId, getErrorMessage } from "~/lib/utils";
import {
  formatVipRequestCooldownCountdown,
  getVipRequestCooldownCountdown,
  isVipRequestCooldownEnabled,
} from "~/lib/vip-request-cooldowns";
import {
  formatVipDurationThresholdMinutes,
  formatVipTokenCostLabel,
  parseVipTokenDurationThresholds,
} from "~/lib/vip-token-duration-thresholds";
import { hasRedeemableVipToken } from "~/lib/vip-tokens";

type ViewerRequestKind = "regular" | "vip";
type ViewerRemoveKind = ViewerRequestKind | "all";

export type ViewerRequestSource = "web" | "extension";

export type ViewerRequestMutationInput =
  | {
      action: "submit";
      songId: string;
      requestMode?: "catalog";
      query?: never;
      itemId?: string;
      requestKind: ViewerRequestKind;
      vipTokenCost?: number;
      requestedPath?: RequestPathOption;
      replaceExisting: boolean;
    }
  | {
      action: "submit";
      query: string;
      requestMode: "random" | "choice";
      songId?: never;
      requestKind: ViewerRequestKind;
      vipTokenCost?: number;
      replaceExisting: boolean;
      itemId?: string;
    }
  | {
      action: "submit";
      requestMode: "favorite";
      query?: never;
      songId?: never;
      requestKind: ViewerRequestKind;
      vipTokenCost?: number;
      replaceExisting: boolean;
      itemId?: string;
    }
  | {
      action: "remove";
      kind: ViewerRemoveKind;
      itemId?: string;
    };

type ViewerChannel = NonNullable<Awaited<ReturnType<typeof getChannelBySlug>>>;

export type ViewerIdentity = {
  userId?: string | null;
  twitchUserId: string;
  login: string;
  displayName: string;
  profileImageUrl?: string | null;
  preferredLocale?: string | null;
};

type ViewerChannelState = {
  channel: NonNullable<Awaited<ReturnType<typeof getChannelBySlug>>>;
  settings: NonNullable<
    Awaited<ReturnType<typeof getChannelSettingsByChannelId>>
  >;
  playlist: NonNullable<Awaited<ReturnType<typeof getPlaylistByChannelId>>>;
  blacklist: Awaited<ReturnType<typeof getChannelBlacklistByChannelId>>;
  preferredCharters: Awaited<
    ReturnType<typeof getChannelPreferredChartersByChannelId>
  >;
  setlist: Array<{ artistId?: number | null; artistName: string }>;
};

type SubscriptionResolution = {
  isSubscriber: boolean;
  verified: boolean;
};

type ViewerRequestAccess = {
  allowed: boolean;
  reason?: string;
};

type ViewerRequestContext = {
  viewer: ViewerIdentity;
  state: ViewerChannelState;
  requester: RequesterContext;
  subscription: SubscriptionResolution;
  access: ViewerRequestAccess;
  vipTokensAvailable: number;
  vipRequestCooldown: Awaited<ReturnType<typeof getVipRequestCooldown>> | null;
  activeRequestLimit: number | null;
  isBlocked: boolean;
};

type ViewerSongPayload = {
  id: string;
  title: string;
  authorId?: number;
  groupedProjectId?: number;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string;
  parts?: string[];
  durationText?: string;
  cdlcId?: number;
  source: string;
  sourceUrl?: string;
  requestedQuery?: string;
  warningCode?: string;
  warningMessage?: string;
  candidateMatchesJson?: string;
};

type CatalogSong = NonNullable<Awaited<ReturnType<typeof getCatalogSongById>>>;

export type ViewerRequestStatePayload = {
  viewer: null | {
    twitchUserId: string;
    login: string;
    displayName: string;
    profileImageUrl?: string | null;
    preferredLocale?: string | null;
    isSubscriber: boolean;
    subscriptionVerified: boolean;
    vipTokensAvailable: number;
    activeRequestLimit: number | null;
    access: ViewerRequestAccess;
  };
};

export class ViewerRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ViewerRequestError";
  }
}

const blockedViewerRequestReason =
  "You are blocked from requesting songs in this channel.";

function logViewerRequestContextStage(
  traceId: string | undefined,
  event: "started" | "completed",
  input: {
    stage: string;
    channelId: string;
    viewerTwitchUserId: string;
    durationMs?: number;
    resultSummary?: Record<string, unknown>;
  }
) {
  if (!traceId) {
    return;
  }

  console.info(`Viewer request context stage ${event}`, {
    traceId,
    stage: input.stage,
    channelId: input.channelId,
    viewerTwitchUserId: input.viewerTwitchUserId,
    durationMs: input.durationMs ?? null,
    ...(input.resultSummary ?? {}),
  });
}

async function measureViewerRequestContextStage<T>(
  traceId: string | undefined,
  input: {
    stage: string;
    channelId: string;
    viewerTwitchUserId: string;
    summarizeResult?: (result: T) => Record<string, unknown>;
    operation: () => Promise<T>;
  }
) {
  logViewerRequestContextStage(traceId, "started", input);
  const startedAt = Date.now();
  const result = await input.operation();
  logViewerRequestContextStage(traceId, "completed", {
    ...input,
    durationMs: Date.now() - startedAt,
    resultSummary: input.summarizeResult?.(result),
  });
  return result;
}

export async function getViewerRequestState(input: {
  env: AppEnv;
  request: Request;
  slug: string;
}): Promise<ViewerRequestStatePayload> {
  const channel = await getChannelBySlug(input.env, input.slug);
  if (!channel) {
    throw new ViewerRequestError(404, "Channel not found.");
  }

  const viewer = await resolveViewerIdentity(input.env, input.request);
  if (!viewer) {
    return { viewer: null };
  }

  return getViewerRequestStateForChannelViewer({
    env: input.env,
    channel,
    viewer,
  });
}

export async function performViewerRequestMutation(input: {
  env: AppEnv;
  request: Request;
  slug: string;
  mutation: ViewerRequestMutationInput;
}) {
  const channel = await getChannelBySlug(input.env, input.slug);
  if (!channel) {
    throw new ViewerRequestError(404, "Channel not found.");
  }

  const viewer = await resolveViewerIdentity(input.env, input.request);
  if (!viewer) {
    throw new ViewerRequestError(401, "Sign in with Twitch to request songs.");
  }

  return performViewerRequestMutationForChannelViewer({
    env: input.env,
    channel,
    viewer,
    mutation: input.mutation,
    source: "web",
  });
}

async function resolveViewerIdentity(env: AppEnv, request: Request) {
  const sessionUserId = await getSessionUserId(request, env);
  if (!sessionUserId) {
    return null;
  }

  const user = await getUserById(env, sessionUserId);
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    twitchUserId: user.twitchUserId,
    login: user.login,
    displayName: user.displayName,
    profileImageUrl: user.profileImageUrl,
    preferredLocale: user.preferredLocale,
  } satisfies ViewerIdentity;
}

export async function getViewerRequestStateForChannelViewer(input: {
  env: AppEnv;
  channel: ViewerChannel;
  viewer: ViewerIdentity;
  traceId?: string;
  requesterOverride?: Partial<
    Pick<RequesterContext, "isBroadcaster" | "isModerator">
  >;
  ignoreRequestsDisabled?: boolean;
}): Promise<ViewerRequestStatePayload> {
  const startedAt = Date.now();
  const context = await loadViewerRequestContext(
    input.env,
    input.channel,
    input.viewer,
    {
      traceId: input.traceId,
      requesterOverride: input.requesterOverride,
      ignoreRequestsDisabled: input.ignoreRequestsDisabled,
    }
  );

  if (input.traceId) {
    console.info("Viewer request state completed", {
      traceId: input.traceId,
      channelId: input.channel.id,
      viewerTwitchUserId: input.viewer.twitchUserId,
      elapsedMs: Date.now() - startedAt,
      accessAllowed: context.access.allowed,
      isSubscriber: context.subscription.isSubscriber,
      subscriptionVerified: context.subscription.verified,
      vipTokensAvailable: context.vipTokensAvailable,
      activeRequestLimit: context.activeRequestLimit,
    });
  }

  return {
    viewer: {
      twitchUserId: context.viewer.twitchUserId,
      login: context.viewer.login,
      displayName: context.viewer.displayName,
      profileImageUrl: context.viewer.profileImageUrl,
      preferredLocale: context.viewer.preferredLocale,
      isSubscriber: context.subscription.isSubscriber,
      subscriptionVerified: context.subscription.verified,
      vipTokensAvailable: context.vipTokensAvailable,
      activeRequestLimit: context.activeRequestLimit,
      access: context.access,
    },
  };
}

export async function performViewerRequestMutationForChannelViewer(input: {
  env: AppEnv;
  channel: ViewerChannel;
  viewer: ViewerIdentity;
  mutation: ViewerRequestMutationInput;
  source?: ViewerRequestSource;
  traceId?: string;
  requesterOverride?: Partial<
    Pick<RequesterContext, "isBroadcaster" | "isModerator">
  >;
  ignoreRequestsDisabled?: boolean;
}) {
  const context = await loadViewerRequestContext(
    input.env,
    input.channel,
    input.viewer,
    {
      traceId: input.traceId,
      requesterOverride: input.requesterOverride,
      ignoreRequestsDisabled: input.ignoreRequestsDisabled,
    }
  );

  if (input.mutation.action === "remove") {
    return removeViewerRequests(input.env, context, {
      kind: input.mutation.kind,
      itemId: input.mutation.itemId,
    });
  }

  return submitViewerRequest(input.env, context, input.mutation, {
    source: input.source ?? "web",
  });
}

async function loadViewerRequestContext(
  env: AppEnv,
  channel: ViewerChannel,
  viewer: ViewerIdentity,
  options?: {
    traceId?: string;
    requesterOverride?: Partial<
      Pick<RequesterContext, "isBroadcaster" | "isModerator">
    >;
    ignoreRequestsDisabled?: boolean;
  }
): Promise<ViewerRequestContext> {
  const startedAt = Date.now();
  const traceId = options?.traceId;

  if (traceId) {
    console.info("Viewer request context started", {
      traceId,
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
    });
  }

  const [
    settings,
    playlist,
    blacklist,
    preferredCharters,
    setlist,
    blocked,
    subscription,
    balance,
    vipRequestCooldown,
  ] = await Promise.all([
    measureViewerRequestContextStage(traceId, {
      stage: "getChannelSettingsByChannelId",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        found: result != null,
      }),
      operation: () => getChannelSettingsByChannelId(env, channel.id),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "getPlaylistByChannelId",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        found: result != null,
        itemCount: result?.items.length ?? null,
      }),
      operation: () => getPlaylistByChannelId(env, channel.id),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "getChannelBlacklistByChannelId",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        blacklistedSongCount: result.blacklistSongs.length,
        blacklistedArtistCount: result.blacklistArtists.length,
        blacklistedCharterCount: result.blacklistCharters.length,
        blacklistedSongGroupCount: result.blacklistSongGroups.length,
      }),
      operation: () => getChannelBlacklistByChannelId(env, channel.id),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "getChannelPreferredChartersByChannelId",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        preferredCharterCount: result.length,
      }),
      operation: () => getChannelPreferredChartersByChannelId(env, channel.id),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "getSetlistArtists",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        setlistArtistCount: result.length,
      }),
      operation: () =>
        getDb(env).query.setlistArtists.findMany({
          where: eq(setlistArtists.channelId, channel.id),
        }),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "isBlockedUser",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        blocked: result,
      }),
      operation: () => isBlockedUser(env, channel.id, viewer.twitchUserId),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "resolveViewerSubscription",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        isSubscriber: result.isSubscriber,
        verified: result.verified,
      }),
      operation: () =>
        resolveViewerSubscription(
          env,
          channel.id,
          channel.twitchChannelId,
          viewer
        ),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "getVipTokenBalance",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        vipTokensAvailable: result?.availableCount ?? 0,
      }),
      operation: () =>
        getVipTokenBalance(env, {
          channelId: channel.id,
          login: viewer.login,
        }),
    }),
    measureViewerRequestContextStage(traceId, {
      stage: "getVipRequestCooldown",
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      summarizeResult: (result) => ({
        cooldownActive: result != null,
      }),
      operation: () =>
        getVipRequestCooldown(env, {
          channelId: channel.id,
          login: viewer.login,
        }),
    }),
  ]);

  if (!settings) {
    throw new ViewerRequestError(
      500,
      "Channel settings are unavailable right now."
    );
  }

  if (!playlist) {
    throw new ViewerRequestError(500, "Playlist is unavailable right now.");
  }

  const requester: RequesterContext = {
    isBroadcaster:
      options?.requesterOverride?.isBroadcaster ??
      (viewer.userId === channel.ownerUserId ||
        viewer.twitchUserId === channel.twitchChannelId),
    isModerator: options?.requesterOverride?.isModerator ?? false,
    isVip: false,
    isSubscriber: subscription.isSubscriber,
  };
  const accessSettings = options?.ignoreRequestsDisabled
    ? { ...settings, requestsEnabled: true }
    : settings;

  const access = resolveViewerAccess({
    requestsOpen: areChannelRequestsOpen(channel),
    settings: accessSettings,
    requester,
    subscriptionVerified: subscription.verified,
    blocked,
  });

  const limit = getActiveRequestLimit(settings, requester);

  if (traceId) {
    console.info("Viewer request context completed", {
      traceId,
      channelId: channel.id,
      viewerTwitchUserId: viewer.twitchUserId,
      elapsedMs: Date.now() - startedAt,
      accessAllowed: access.allowed,
      blocked,
      isSubscriber: subscription.isSubscriber,
      subscriptionVerified: subscription.verified,
      vipTokensAvailable: balance?.availableCount ?? 0,
      activeRequestLimit: Number.isFinite(limit) ? limit : null,
      playlistItemCount: playlist.items.length,
    });
  }

  return {
    viewer,
    state: {
      channel,
      settings,
      playlist,
      blacklist,
      preferredCharters,
      setlist,
    },
    requester,
    subscription,
    access,
    vipTokensAvailable: balance?.availableCount ?? 0,
    vipRequestCooldown,
    activeRequestLimit: Number.isFinite(limit) ? limit : null,
    isBlocked: blocked,
  };
}

function resolveViewerAccess(input: {
  requestsOpen: boolean;
  settings: ViewerChannelState["settings"];
  requester: RequesterContext;
  subscriptionVerified: boolean;
  blocked: boolean;
}): ViewerRequestAccess {
  if (input.blocked) {
    return {
      allowed: false,
      reason: blockedViewerRequestReason,
    };
  }

  if (!input.requestsOpen) {
    return {
      allowed: false,
      reason: ADD_REQUESTS_WHEN_LIVE_MESSAGE,
    };
  }

  const access = isRequesterAllowed(input.settings, input.requester);
  if (access.allowed) {
    return { allowed: true };
  }

  if (
    !input.subscriptionVerified &&
    !input.settings.allowAnyoneToRequest &&
    input.settings.allowSubscribersToRequest &&
    !input.requester.isSubscriber
  ) {
    return {
      allowed: false,
      reason:
        "Subscriber verification is temporarily unavailable for this channel.",
    };
  }

  return {
    allowed: false,
    reason: access.reason ?? "You cannot request songs in this channel.",
  };
}

async function resolveViewerSubscription(
  env: AppEnv,
  channelId: string,
  broadcasterUserId: string,
  viewer: ViewerIdentity
): Promise<SubscriptionResolution> {
  const authorization = await getActiveBroadcasterAuthorizationForChannel(
    env,
    channelId
  );
  if (!authorization) {
    return { isSubscriber: false, verified: false };
  }

  const scopes = parseAuthorizationScopes(authorization.scopes);
  if (!scopes.includes("channel:read:subscriptions")) {
    return { isSubscriber: false, verified: false };
  }

  try {
    const response = await getBroadcasterSubscriptions({
      env,
      accessToken: authorization.accessTokenEncrypted,
      broadcasterUserId,
      userIds: [viewer.twitchUserId],
    });

    return {
      isSubscriber: response.data.some(
        (entry) => entry.user_id === viewer.twitchUserId
      ),
      verified: true,
    };
  } catch (error) {
    const status = error instanceof TwitchApiError ? error.status : undefined;

    console.error("Failed to verify viewer subscription status", {
      channelId,
      broadcasterUserId,
      viewerTwitchUserId: viewer.twitchUserId,
      status: status ?? null,
      error: error instanceof Error ? error.message : String(error),
    });

    return { isSubscriber: false, verified: false };
  }
}

function buildViewerCatalogSearchInput(input: {
  context: ViewerRequestContext;
  query: string;
  page: number;
  pageSize: number;
  field?: CatalogSearchInput["field"];
  favoriteChannelId?: string;
}): CatalogSearchInput {
  const blacklistFilters = input.context.state.settings.blacklistEnabled
    ? {
        excludeSongIds: input.context.state.blacklist.blacklistSongs.map(
          (song) => song.songId
        ),
        excludeGroupedProjectIds:
          input.context.state.blacklist.blacklistSongGroups.map(
            (song) => song.groupedProjectId
          ),
        excludeArtistIds: input.context.state.blacklist.blacklistArtists.map(
          (artist) => artist.artistId
        ),
        excludeArtistNames: input.context.state.blacklist.blacklistArtists.map(
          (artist) => artist.artistName
        ),
        excludeAuthorIds: input.context.state.blacklist.blacklistCharters.map(
          (charter) => charter.charterId
        ),
        excludeCreatorNames:
          input.context.state.blacklist.blacklistCharters.map(
            (charter) => charter.charterName
          ),
      }
    : {};

  return {
    query: input.query,
    field: input.field ?? (input.query.trim().length > 0 ? "artist" : "any"),
    page: input.page,
    pageSize: input.pageSize,
    sortBy: "relevance" as const,
    sortDirection: "desc" as const,
    favoriteChannelId: input.favoriteChannelId,
    restrictToOfficial: !!input.context.state.settings.onlyOfficialDlc,
    allowedTuningsFilter: parseStoredTuningIds(
      input.context.state.settings.allowedTuningsJson
    ),
    preferredAuthorIds: input.context.state.preferredCharters.map(
      (charter) => charter.charterId
    ),
    preferredCreatorNames: input.context.state.preferredCharters.map(
      (charter) => charter.charterName
    ),
    requiredPartsFilter: getRequiredPathsSetting(input.context.state.settings),
    requiredPartsFilterMatchMode: getRequiredPathsMatchMode(
      input.context.state.settings.requiredPathsMatchMode
    ),
    ...blacklistFilters,
  };
}

function buildViewerChoiceSongPayload(
  requestedText: string
): ViewerSongPayload {
  return {
    id: createId("rqm"),
    title: STREAMER_CHOICE_TITLE,
    source: "choice",
    requestedQuery: requestedText,
    warningCode: STREAMER_CHOICE_WARNING_CODE,
  };
}

function findViewerMatchingChoiceRequest(input: {
  context: ViewerRequestContext;
  requestedText: string;
  excludeItemId?: string | null;
}) {
  const normalizedRequestedText = input.requestedText.trim().toLowerCase();

  return (
    input.context.state.playlist.items.find(
      (item) =>
        item.requestedByTwitchUserId === input.context.viewer.twitchUserId &&
        item.warningCode === STREAMER_CHOICE_WARNING_CODE &&
        item.id !== input.excludeItemId &&
        item.requestedQuery?.trim().toLowerCase() === normalizedRequestedText &&
        (item.status === "queued" || item.status === "current")
    ) ?? null
  );
}

function formatViewerChoiceRequest(input: {
  requestedText: string;
  requestKind: ViewerRequestKind;
  vipTokenCost?: number;
  status?: string | null;
  existing?: boolean;
  editing?: boolean;
}) {
  const vipTokenCostSuffix = getVipTokenCostMessageSuffix(input.vipTokenCost);

  if (input.editing) {
    return input.requestKind === "vip"
      ? `Edited your request to streamer choice "${input.requestedText}" as a VIP request${vipTokenCostSuffix}.`
      : `Edited your request to streamer choice "${input.requestedText}".`;
  }

  if (input.requestKind === "vip") {
    const nextPositionSuffix =
      input.status === "current" ? "." : " and will play next.";

    return input.existing
      ? `Your streamer choice request "${input.requestedText}" is now marked as VIP${vipTokenCostSuffix}${nextPositionSuffix}`
      : `Added streamer choice "${input.requestedText}" as a VIP request${vipTokenCostSuffix}${nextPositionSuffix}`;
  }

  return input.existing
    ? `Your streamer choice request "${input.requestedText}" is now a regular request again.`
    : `Added streamer choice "${input.requestedText}" to the playlist.`;
}

async function resolveViewerRandomSong(
  env: AppEnv,
  context: ViewerRequestContext,
  input: {
    query: string;
    field?: CatalogSearchInput["field"];
    favoriteChannelId?: string;
  }
) {
  const filteredSearch = await searchCatalogSongs(
    env,
    buildViewerCatalogSearchInput({
      context,
      query: input.query,
      page: 1,
      pageSize: 1,
      field: input.field,
      favoriteChannelId: input.favoriteChannelId,
    })
  );
  const filteredTotal = Math.max(
    0,
    filteredSearch.total ?? filteredSearch.results.length
  );
  const attemptedPages = new Set<number>();

  const attemptLimit = Math.min(filteredTotal, 12);
  while (attemptedPages.size < attemptLimit) {
    const nextPage = Math.floor(Math.random() * filteredTotal) + 1;
    if (attemptedPages.has(nextPage)) {
      continue;
    }

    attemptedPages.add(nextPage);
    const randomPage = await searchCatalogSongs(
      env,
      buildViewerCatalogSearchInput({
        context,
        query: input.query,
        page: nextPage,
        pageSize: 1,
        field: input.field,
        favoriteChannelId: input.favoriteChannelId,
      })
    );
    const candidate = randomPage.results[0] ?? null;
    if (!candidate) {
      continue;
    }

    const songAllowed = isSongAllowed({
      song: candidate,
      settings: context.state.settings,
      blacklistArtists: context.state.blacklist.blacklistArtists,
      blacklistCharters: context.state.blacklist.blacklistCharters,
      blacklistSongs: context.state.blacklist.blacklistSongs,
      blacklistSongGroups: context.state.blacklist.blacklistSongGroups,
      setlistArtists: context.state.setlist,
      requester: context.requester,
    });
    if (songAllowed.allowed) {
      return candidate;
    }
  }

  if (filteredTotal > 0) {
    const fallbackSearch = await searchCatalogSongs(
      env,
      buildViewerCatalogSearchInput({
        context,
        query: input.query,
        page: 1,
        pageSize: Math.min(filteredTotal, 25),
        field: input.field,
        favoriteChannelId: input.favoriteChannelId,
      })
    );
    const allowedResults = fallbackSearch.results.filter(
      (song) =>
        isSongAllowed({
          song,
          settings: context.state.settings,
          blacklistArtists: context.state.blacklist.blacklistArtists,
          blacklistCharters: context.state.blacklist.blacklistCharters,
          blacklistSongs: context.state.blacklist.blacklistSongs,
          blacklistSongGroups: context.state.blacklist.blacklistSongGroups,
          setlistArtists: context.state.setlist,
          requester: context.requester,
        }).allowed
    );

    if (allowedResults.length > 0) {
      return (
        allowedResults[Math.floor(Math.random() * allowedResults.length)] ??
        allowedResults[0]
      );
    }
  }

  return null;
}

async function resolveViewerChoiceAvailability(
  env: AppEnv,
  context: ViewerRequestContext,
  query: string
) {
  const filteredSearch = await searchCatalogSongs(
    env,
    buildViewerCatalogSearchInput({
      context,
      query,
      page: 1,
      pageSize: 1,
    })
  );

  if ((filteredSearch.total ?? filteredSearch.results.length) > 0) {
    return {
      allowed: true,
      reason: null,
    };
  }

  const rawSearch = await searchCatalogSongs(env, {
    query,
    page: 1,
    pageSize: 5,
    sortBy: "relevance",
    sortDirection: "desc",
  });

  for (const result of rawSearch.results) {
    const songAllowed = isSongAllowed({
      song: result,
      settings: context.state.settings,
      blacklistArtists: context.state.blacklist.blacklistArtists,
      blacklistCharters: context.state.blacklist.blacklistCharters,
      blacklistSongs: context.state.blacklist.blacklistSongs,
      blacklistSongGroups: context.state.blacklist.blacklistSongGroups,
      setlistArtists: context.state.setlist,
      requester: context.requester,
    });

    if (songAllowed.allowed) {
      return {
        allowed: true,
        reason: null,
      };
    }

    return {
      allowed: false,
      reason: songAllowed.reason ?? "That song is not allowed in this channel.",
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

async function removeViewerRequests(
  env: AppEnv,
  context: ViewerRequestContext,
  input: {
    kind: ViewerRemoveKind;
    itemId?: string;
  }
) {
  const queuedRequests = context.state.playlist.items.filter(
    (item) =>
      item.requestedByTwitchUserId === context.viewer.twitchUserId &&
      item.status === "queued" &&
      (input.kind === "all" || item.requestKind === input.kind)
  );

  if (input.itemId) {
    const target = context.state.playlist.items.find(
      (item) =>
        item.id === input.itemId &&
        item.requestedByTwitchUserId === context.viewer.twitchUserId &&
        (item.status === "queued" || item.status === "current")
    );

    if (!target) {
      throw new ViewerRequestError(
        404,
        "That request is no longer in the playlist."
      );
    }

    if (target.status === "current") {
      throw new ViewerRequestError(
        409,
        "That request is already playing and cannot be removed."
      );
    }
  } else if (queuedRequests.length === 0) {
    return {
      ok: true,
      message: "You do not have any matching queued requests in this playlist.",
    };
  }

  const removableQueuedRequests = queuedRequests.filter(
    (item) =>
      (!input.itemId || item.id === input.itemId) && item.status === "queued"
  );
  const refundableVipTokenCount = removableQueuedRequests.reduce(
    (total, item) => total + getStoredVipTokenCost(item),
    0
  );

  const result = await removeRequestsFromPlaylist(env, {
    channelId: context.state.channel.id,
    requesterTwitchUserId: context.viewer.twitchUserId,
    requesterLogin: context.viewer.login,
    actorUserId: null,
    kind: input.kind,
    itemId: input.itemId,
  });

  if (refundableVipTokenCount > 0) {
    try {
      await grantVipToken(env, {
        channelId: context.state.channel.id,
        login: context.viewer.login,
        displayName: context.viewer.displayName,
        twitchUserId: context.viewer.twitchUserId,
        count: refundableVipTokenCount,
      });
    } catch (error) {
      console.error(
        "Failed to refund VIP tokens after removing viewer request",
        {
          channelId: context.state.channel.id,
          viewerTwitchUserId: context.viewer.twitchUserId,
          login: context.viewer.login,
          refundableVipTokenCount,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      throw new ViewerRequestError(
        500,
        "The request was removed, but the VIP token refund could not be completed. Refresh and check your balance."
      );
    }
  }

  return {
    ok: true,
    message:
      result.message === "No matching requests found"
        ? "You do not have any matching queued requests in this playlist."
        : input.itemId
          ? "Removed your request from the playlist."
          : `${result.message} from the playlist.`,
  };
}

async function submitViewerRequest(
  env: AppEnv,
  context: ViewerRequestContext,
  mutation: Extract<ViewerRequestMutationInput, { action: "submit" }>,
  options?: {
    source?: ViewerRequestSource;
  }
) {
  if (!context.access.allowed) {
    throw new ViewerRequestError(
      403,
      context.access.reason ?? "You cannot request songs in this channel."
    );
  }

  const requestMode = mutation.requestMode ?? "catalog";
  const requestedText =
    typeof mutation.query === "string" ? mutation.query.trim() : undefined;
  const allowedRequestPaths = getAllowedRequestPathsSetting(
    context.state.settings
  );
  const requestedPath =
    requestMode === "catalog" && "requestedPath" in mutation
      ? normalizeRequestedPath(mutation.requestedPath ?? null)
      : null;
  if (requestedPath && !allowedRequestPaths.includes(requestedPath)) {
    throw new ViewerRequestError(
      409,
      "That part is not enabled for this channel."
    );
  }
  const requestedPaths = requestedPath ? [requestedPath] : [];

  if (
    (requestMode === "choice" || requestMode === "random") &&
    !requestedText
  ) {
    throw new ViewerRequestError(
      400,
      "Add an artist or song before using that request option."
    );
  }
  const specialRequestText = requestedText ?? "";

  let song: CatalogSong | null = null;
  let normalizedQuery = "";
  let warningCode: string | undefined;
  let warningMessage: string | undefined;

  if (requestMode === "catalog") {
    const requestedSongId = "songId" in mutation ? mutation.songId : null;
    if (!requestedSongId) {
      throw new ViewerRequestError(400, "Song not found.");
    }

    song = await getCatalogSongById(env, requestedSongId);
    if (!song) {
      throw new ViewerRequestError(404, "Song not found.");
    }

    if (
      requestedPaths.length > 0 &&
      !songMatchesRequestedPaths({
        song,
        requestedPaths,
      })
    ) {
      throw new ViewerRequestError(
        409,
        getRequestedPathMismatchMessage(requestedPaths)
      );
    }

    normalizedQuery = buildViewerQuery(song);
  } else if (requestMode === "random") {
    song = await resolveViewerRandomSong(env, context, {
      query: specialRequestText,
      field: "artist",
    });
    if (!song) {
      throw new ViewerRequestError(
        409,
        `I couldn't find an allowed random match for "${specialRequestText}".`
      );
    }

    normalizedQuery = specialRequestText;
  } else if (requestMode === "favorite") {
    song = await resolveViewerRandomSong(env, context, {
      query: "",
      favoriteChannelId: context.state.channel.id,
    });
    if (!song) {
      throw new ViewerRequestError(
        409,
        "I couldn't find an allowed favorite from this channel."
      );
    }

    normalizedQuery = "favorite";
  } else {
    const choiceAvailability = await resolveViewerChoiceAvailability(
      env,
      context,
      specialRequestText
    );

    if (!choiceAvailability.allowed) {
      throw new ViewerRequestError(
        409,
        choiceAvailability.reason ??
          "That streamer choice is not allowed in this channel."
      );
    }

    normalizedQuery = specialRequestText;
    warningCode = STREAMER_CHOICE_WARNING_CODE;
  }

  const rawMessage = buildViewerRawMessage({
    source: options?.source ?? "web",
    replaceExisting: mutation.replaceExisting,
    requestKind: mutation.requestKind,
    vipTokenCost: mutation.vipTokenCost,
    query: normalizedQuery,
    requestedPath,
    requestMode,
  });
  const vipTokenDurationThresholds = parseVipTokenDurationThresholds(
    context.state.settings.vipTokenDurationThresholdsJson
  );
  const requestVipTokenPlan = getRequestVipTokenPlan({
    requestKind: mutation.requestKind,
    explicitVipTokenCost: mutation.vipTokenCost,
    song,
    requestedPaths,
    thresholds: vipTokenDurationThresholds,
    settings: context.state.settings,
  });
  const nextVipTokenCost = requestVipTokenPlan.totalVipTokenCost;
  const candidateMatchesJson =
    requestMode === "catalog" && song
      ? await buildViewerCandidateMatchesJson({
          env,
          channelId: context.state.channel.id,
          song,
        })
      : undefined;

  const existingActiveCount = await countActiveRequestsForUser(env, {
    channelId: context.state.channel.id,
    twitchUserId: context.viewer.twitchUserId,
  });
  const existingActiveRequests = context.state.playlist.items.filter(
    (item) =>
      item.requestedByTwitchUserId === context.viewer.twitchUserId &&
      (item.status === "queued" || item.status === "current")
  );
  const existingQueuedRequests = existingActiveRequests.filter(
    (item) => item.status === "queued"
  );
  const existingCurrentRequests = existingActiveRequests.filter(
    (item) => item.status === "current"
  );
  let editableExistingRequest: (typeof existingActiveRequests)[number] | null =
    null;

  if (mutation.replaceExisting && mutation.itemId) {
    const requestedItem =
      existingActiveRequests.find((item) => item.id === mutation.itemId) ??
      null;

    if (requestedItem?.status === "current") {
      throw new ViewerRequestError(
        409,
        "That request is already playing and cannot be edited."
      );
    }

    editableExistingRequest =
      existingQueuedRequests.find((item) => item.id === mutation.itemId) ??
      null;

    if (!editableExistingRequest) {
      throw new ViewerRequestError(
        404,
        "That request is no longer in the playlist."
      );
    }
  } else if (
    mutation.replaceExisting &&
    existingActiveCount === 1 &&
    existingQueuedRequests.length === 1
  ) {
    editableExistingRequest = existingQueuedRequests[0] ?? null;
  }

  const existingMatchingRequest =
    requestMode === "choice"
      ? findViewerMatchingChoiceRequest({
          context,
          requestedText: requestedText ?? "",
        })
      : song
        ? (context.state.playlist.items.find(
            (item) =>
              item.songId === song.id &&
              item.requestedByTwitchUserId === context.viewer.twitchUserId &&
              (item.status === "queued" || item.status === "current")
          ) ?? null)
        : null;
  const matchingRequestStoredVipTokenCost = existingMatchingRequest
    ? getStoredVipTokenCost(existingMatchingRequest)
    : 0;
  const existingMatchingRequestPaths = existingMatchingRequest
    ? getStoredRequestedPaths(existingMatchingRequest)
    : [];
  const matchingRequestHasSameRequestedPaths = requestedPathsMatch(
    existingMatchingRequestPaths,
    requestedPaths
  );
  const existingRequestNeedsSongRewrite =
    requestMode !== "choice" && !matchingRequestHasSameRequestedPaths;
  const kindChangeOnly =
    existingMatchingRequest != null &&
    existingMatchingRequest.requestKind !== mutation.requestKind &&
    !mutation.replaceExisting;
  const vipTokenCostChangeOnly =
    existingMatchingRequest != null &&
    existingMatchingRequest.requestKind === mutation.requestKind &&
    matchingRequestStoredVipTokenCost !== nextVipTokenCost &&
    !mutation.replaceExisting;
  const requestedPathsChangeOnly =
    existingMatchingRequest != null &&
    existingMatchingRequest.requestKind === mutation.requestKind &&
    matchingRequestStoredVipTokenCost === nextVipTokenCost &&
    !matchingRequestHasSameRequestedPaths &&
    !mutation.replaceExisting;
  const updateExistingMatchingRequest =
    kindChangeOnly || vipTokenCostChangeOnly || requestedPathsChangeOnly;
  const editTarget = editableExistingRequest;
  const editInPlace = editTarget != null;
  const matchingDifferentExistingRequest = editTarget
    ? requestMode === "choice"
      ? findViewerMatchingChoiceRequest({
          context,
          requestedText: requestedText ?? "",
          excludeItemId: editTarget.id,
        })
      : song
        ? (context.state.playlist.items.find(
            (item) =>
              item.songId === song.id &&
              item.requestedByTwitchUserId === context.viewer.twitchUserId &&
              item.id !== editTarget.id &&
              (item.status === "queued" || item.status === "current")
          ) ?? null)
        : null
    : null;
  const editingSameChoice =
    editTarget != null &&
    requestMode === "choice" &&
    editTarget.warningCode === STREAMER_CHOICE_WARNING_CODE &&
    editTarget.requestedQuery?.trim().toLowerCase() ===
      requestedText?.trim().toLowerCase();
  const editingSameSong =
    editTarget != null && song != null && editTarget.songId === song.id;
  const editTargetHasSameRequestedPaths =
    editTarget == null
      ? true
      : requestedPathsMatch(
          getStoredRequestedPaths(editTarget),
          requestedPaths
        );
  const editingSameResolvedRequest = editingSameSong || editingSameChoice;
  const editTargetStoredVipTokenCost = editTarget
    ? getStoredVipTokenCost(editTarget)
    : 0;
  const previousVipTokenCost = editTarget
    ? editTargetStoredVipTokenCost
    : updateExistingMatchingRequest && existingMatchingRequest
      ? matchingRequestStoredVipTokenCost
      : 0;
  const replacedQueuedVipTokenCost =
    mutation.replaceExisting && !editInPlace && !updateExistingMatchingRequest
      ? existingQueuedRequests.reduce(
          (total, item) => total + getStoredVipTokenCost(item),
          0
        )
      : 0;
  const vipTokenDelta =
    nextVipTokenCost -
    (updateExistingMatchingRequest || editInPlace
      ? previousVipTokenCost
      : replacedQueuedVipTokenCost);

  if (matchingDifferentExistingRequest) {
    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "existing_request_same_song",
    });

    throw new ViewerRequestError(
      409,
      requestMode === "choice"
        ? "That streamer choice is already in your active requests."
        : "That song is already in your active requests."
    );
  }

  if (
    existingMatchingRequest &&
    existingMatchingRequest.requestKind === mutation.requestKind &&
    matchingRequestStoredVipTokenCost === nextVipTokenCost &&
    matchingRequestHasSameRequestedPaths &&
    !mutation.replaceExisting
  ) {
    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "existing_request_same_song",
    });

    throw new ViewerRequestError(
      409,
      requestMode === "choice"
        ? "That streamer choice is already in your active requests."
        : "That song is already in your active requests."
    );
  }

  if (
    updateExistingMatchingRequest &&
    existingMatchingRequest &&
    existingMatchingRequest.status === "current"
  ) {
    throw new ViewerRequestError(
      409,
      "That request is already playing and cannot be changed."
    );
  }

  if (
    editTarget &&
    editingSameResolvedRequest &&
    editTarget.requestKind === mutation.requestKind &&
    editTargetStoredVipTokenCost === nextVipTokenCost &&
    (requestMode === "choice"
      ? editingSameChoice
      : editTargetHasSameRequestedPaths)
  ) {
    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "existing_request_same_song",
    });

    throw new ViewerRequestError(
      409,
      requestMode === "choice"
        ? "That streamer choice is already your current request."
        : "That song is already your current request."
    );
  }

  const activeLimit = context.activeRequestLimit;
  const effectiveActiveCount = editInPlace
    ? 0
    : mutation.replaceExisting
      ? existingCurrentRequests.length
      : existingActiveCount;

  if (
    activeLimit != null &&
    effectiveActiveCount >= activeLimit &&
    !updateExistingMatchingRequest
  ) {
    const message = `You already have ${activeLimit} active request${activeLimit === 1 ? "" : "s"} in this playlist.`;
    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "active_request_limit",
    });
    throw new ViewerRequestError(409, message);
  }

  const rateLimitWindow = getRateLimitWindow(
    context.state.settings,
    context.requester
  );
  if (rateLimitWindow) {
    const acceptedInWindow = await countAcceptedRequestsInPeriod(env, {
      channelId: context.state.channel.id,
      twitchUserId: context.viewer.twitchUserId,
      since: Date.now() - rateLimitWindow.periodSeconds * 1000,
    });

    if (acceptedInWindow >= rateLimitWindow.limit) {
      await createViewerRequestLog(env, {
        context,
        rawMessage,
        normalizedQuery,
        song,
        outcome: "rejected",
        outcomeReason: "time_window_limit",
      });

      throw new ViewerRequestError(
        429,
        `You have reached the request limit for the next ${rateLimitWindow.periodSeconds} seconds.`
      );
    }
  }

  const cooldownSourceItemId = context.vipRequestCooldown?.sourceItemId ?? null;
  const canBypassVipRequestCooldown =
    cooldownSourceItemId != null &&
    ((updateExistingMatchingRequest &&
      existingMatchingRequest?.id === cooldownSourceItemId) ||
      editTarget?.id === cooldownSourceItemId ||
      (mutation.replaceExisting &&
        !editInPlace &&
        !updateExistingMatchingRequest &&
        existingQueuedRequests.some(
          (item) => item.id === cooldownSourceItemId
        )));

  if (
    mutation.requestKind === "vip" &&
    isVipRequestCooldownEnabled(context.state.settings) &&
    context.vipRequestCooldown &&
    !canBypassVipRequestCooldown
  ) {
    const countdown = getVipRequestCooldownCountdown(
      context.vipRequestCooldown.cooldownExpiresAt
    );

    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "vip_request_cooldown",
    });

    throw new ViewerRequestError(
      409,
      getViewerVipRequestCooldownMessage(countdown)
    );
  }

  if (
    vipTokenDelta > 0 &&
    !hasRedeemableVipToken(context.vipTokensAvailable, vipTokenDelta)
  ) {
    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "vip_token_unavailable",
    });

    throw new ViewerRequestError(
      409,
      getVipTokenShortageMessage({
        requestKind: mutation.requestKind,
        requestedVipTokenCost: nextVipTokenCost,
        additionalVipTokenCost: vipTokenDelta,
        availableVipTokens: context.vipTokensAvailable,
        reasons: requestVipTokenPlan.vipTokenReasons,
      })
    );
  }

  if (song) {
    const songAllowed = isSongAllowed({
      song,
      settings: context.state.settings,
      blacklistArtists: context.state.blacklist.blacklistArtists,
      blacklistCharters: context.state.blacklist.blacklistCharters,
      blacklistSongs: context.state.blacklist.blacklistSongs,
      blacklistSongGroups: context.state.blacklist.blacklistSongGroups,
      setlistArtists: context.state.setlist,
      requester: context.requester,
    });

    if (!songAllowed.allowed) {
      await createViewerRequestLog(env, {
        context,
        rawMessage,
        normalizedQuery,
        song,
        outcome: "rejected",
        outcomeReason:
          songAllowed.reasonCode ?? songAllowed.reason ?? "song_not_allowed",
      });

      throw new ViewerRequestError(
        409,
        songAllowed.reason ?? "That song is not allowed in this channel."
      );
    }

    const requiredPathsWarning = getRequiredPathsWarning({
      song,
      settings: context.state.settings,
    });
    if (requiredPathsWarning) {
      if (editingSameResolvedRequest) {
        warningMessage = requiredPathsWarning;
        warningCode = "missing_required_paths";
      } else {
        await createViewerRequestLog(env, {
          context,
          rawMessage,
          normalizedQuery,
          song,
          outcome: "rejected",
          outcomeReason: "missing_required_paths",
        });

        throw new ViewerRequestError(409, requiredPathsWarning);
      }
    }
  }

  if (
    song &&
    !updateExistingMatchingRequest &&
    !editingSameResolvedRequest &&
    context.state.settings.duplicateWindowSeconds > 0 &&
    (await wasSongRequestedRecently(env, {
      channelId: context.state.channel.id,
      songId: song.id,
      since: Date.now() - context.state.settings.duplicateWindowSeconds * 1000,
    }))
  ) {
    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "duplicate_window",
    });

    throw new ViewerRequestError(
      409,
      "That song was requested too recently. Please wait before requesting it again."
    );
  }

  if (!updateExistingMatchingRequest && !editInPlace) {
    const queueCount = context.state.playlist.items.length;
    const effectiveQueueCount = mutation.replaceExisting
      ? Math.max(0, queueCount - existingActiveCount)
      : queueCount;

    if (effectiveQueueCount >= context.state.settings.maxQueueSize) {
      await createViewerRequestLog(env, {
        context,
        rawMessage,
        normalizedQuery,
        song,
        outcome: "rejected",
        outcomeReason: "max_queue_size",
      });

      throw new ViewerRequestError(409, "The playlist is full right now.");
    }
  }

  const reserveVipToken = async () => {
    if (vipTokenDelta <= 0) {
      return false;
    }

    const reserved = await consumeVipToken(env, {
      channelId: context.state.channel.id,
      login: context.viewer.login,
      displayName: context.viewer.displayName,
      twitchUserId: context.viewer.twitchUserId,
      count: vipTokenDelta,
    });

    if (reserved) {
      return true;
    }

    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "rejected",
      outcomeReason: "vip_token_unavailable",
    });

    throw new ViewerRequestError(
      409,
      getVipTokenShortageMessage({
        requestKind: mutation.requestKind,
        requestedVipTokenCost: nextVipTokenCost,
        additionalVipTokenCost: vipTokenDelta,
        availableVipTokens: context.vipTokensAvailable,
        reasons: requestVipTokenPlan.vipTokenReasons,
      })
    );
  };

  const refundReservedVipToken = async () => {
    if (vipTokenDelta <= 0) {
      return;
    }

    try {
      await grantVipToken(env, {
        channelId: context.state.channel.id,
        login: context.viewer.login,
        displayName: context.viewer.displayName,
        twitchUserId: context.viewer.twitchUserId,
        count: vipTokenDelta,
      });
    } catch (error) {
      console.error(
        "Failed to refund reserved VIP token after mutation error",
        {
          channelId: context.state.channel.id,
          viewerTwitchUserId: context.viewer.twitchUserId,
          login: context.viewer.login,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      throw new ViewerRequestError(
        500,
        "The request failed after reserving a VIP token. Refresh the panel and confirm your token balance."
      );
    }
  };

  if (updateExistingMatchingRequest && existingMatchingRequest) {
    const vipReserved = await reserveVipToken();

    try {
      if (existingRequestNeedsSongRewrite) {
        await editRequestOnPlaylist(env, {
          channelId: context.state.channel.id,
          itemId: existingMatchingRequest.id,
          actorUserId: null,
          requestKind: mutation.requestKind,
          vipTokenCost: nextVipTokenCost,
          song: buildViewerSongPayload({
            song: song as CatalogSong,
            requestedQuery: buildRequestedPathQuery(requestedPaths),
            warningCode,
            warningMessage,
            candidateMatchesJson,
          }),
        });
      } else {
        await changeRequestKindOnPlaylist(env, {
          channelId: context.state.channel.id,
          itemId: existingMatchingRequest.id,
          actorUserId: null,
          requestKind: mutation.requestKind,
          vipTokenCost: nextVipTokenCost,
        });
      }
    } catch (error) {
      if (vipReserved) {
        await refundReservedVipToken();
      }
      throw error;
    }

    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "accepted",
      outcomeReason:
        existingRequestNeedsSongRewrite ||
        requestedPathsChangeOnly ||
        vipTokenCostChangeOnly
          ? (warningCode ?? "request_edited")
          : mutation.requestKind === "vip"
            ? "vip_request_upgrade"
            : "vip_request_downgrade",
    });

    if (vipTokenDelta < 0) {
      await grantVipToken(env, {
        channelId: context.state.channel.id,
        login: context.viewer.login,
        displayName: context.viewer.displayName,
        twitchUserId: context.viewer.twitchUserId,
        count: Math.abs(vipTokenDelta),
      });
    }

    return {
      ok: true,
      message: [
        requestMode === "choice"
          ? formatViewerChoiceRequest({
              requestedText: specialRequestText,
              requestKind: mutation.requestKind,
              vipTokenCost: nextVipTokenCost,
              status: existingMatchingRequest.status,
              existing: true,
            })
          : existingRequestNeedsSongRewrite &&
              existingMatchingRequest.requestKind === mutation.requestKind
            ? mutation.requestKind === "vip"
              ? existingMatchingRequest.status === "current"
                ? `Updated your VIP request to "${formatCatalogRequestTarget(
                    song as CatalogSong,
                    requestedPaths
                  )}"${getVipTokenCostMessageSuffix(nextVipTokenCost)}.`
                : `Updated your VIP request to "${formatCatalogRequestTarget(
                    song as CatalogSong,
                    requestedPaths
                  )}"${getVipTokenCostMessageSuffix(nextVipTokenCost)} and it will stay next.`
              : `Updated your request to "${formatCatalogRequestTarget(
                  song as CatalogSong,
                  requestedPaths
                )}"${getVipTokenCostMessageSuffix(nextVipTokenCost)}.`
            : mutation.requestKind === "vip"
              ? existingMatchingRequest.status === "current"
                ? `Your request "${formatCatalogRequestTarget(
                    song as CatalogSong,
                    requestedPaths
                  )}" is now marked as VIP${getVipTokenCostMessageSuffix(nextVipTokenCost)}.`
                : `Your request "${formatCatalogRequestTarget(
                    song as CatalogSong,
                    requestedPaths
                  )}" is now marked as VIP${getVipTokenCostMessageSuffix(nextVipTokenCost)} and will play next.`
              : `Your request "${formatCatalogRequestTarget(
                  song as CatalogSong,
                  requestedPaths
                )}" is now a regular request again${getVipTokenCostMessageSuffix(
                  nextVipTokenCost
                )}.`,
        getVipTokenDeltaMessage(vipTokenDelta),
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  if (editInPlace && editableExistingRequest) {
    const vipReserved = await reserveVipToken();

    try {
      await editRequestOnPlaylist(env, {
        channelId: context.state.channel.id,
        itemId: editableExistingRequest.id,
        actorUserId: null,
        requestKind: mutation.requestKind,
        vipTokenCost: nextVipTokenCost,
        song:
          requestMode === "choice"
            ? buildViewerChoiceSongPayload(specialRequestText)
            : buildViewerSongPayload({
                song: song as CatalogSong,
                requestedQuery: buildRequestedPathQuery(requestedPaths),
                warningCode,
                warningMessage,
                candidateMatchesJson,
              }),
      });
    } catch (error) {
      if (vipReserved) {
        await refundReservedVipToken();
      }
      throw error;
    }

    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "accepted",
      outcomeReason: warningCode ?? "request_edited",
    });

    if (vipTokenDelta < 0) {
      await grantVipToken(env, {
        channelId: context.state.channel.id,
        login: context.viewer.login,
        displayName: context.viewer.displayName,
        twitchUserId: context.viewer.twitchUserId,
        count: Math.abs(vipTokenDelta),
      });
    }

    const baseMessage =
      requestMode === "choice"
        ? formatViewerChoiceRequest({
            requestedText: specialRequestText,
            requestKind: mutation.requestKind,
            vipTokenCost: nextVipTokenCost,
            editing: true,
          })
        : mutation.requestKind === "vip"
          ? `Edited your request to "${formatCatalogRequestTarget(
              song as CatalogSong,
              requestedPaths
            )}" as a VIP request${getVipTokenCostMessageSuffix(nextVipTokenCost)}.`
          : `Edited your request to "${formatCatalogRequestTarget(
              song as CatalogSong,
              requestedPaths
            )}"${getVipTokenCostMessageSuffix(nextVipTokenCost)}.`;

    return {
      ok: true,
      message: [
        baseMessage,
        getVipTokenDeltaMessage(vipTokenDelta),
        warningMessage,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  if (mutation.replaceExisting && existingQueuedRequests.length > 0) {
    await removeRequestsFromPlaylist(env, {
      channelId: context.state.channel.id,
      requesterTwitchUserId: context.viewer.twitchUserId,
      requesterLogin: context.viewer.login,
      actorUserId: null,
      kind: "all",
    });
  }

  const vipReserved = await reserveVipToken();

  try {
    await addRequestToPlaylist(env, {
      channelId: context.state.channel.id,
      requestedByTwitchUserId: context.viewer.twitchUserId,
      requestedByLogin: context.viewer.login,
      requestedByDisplayName: context.viewer.displayName,
      prioritizeNext: mutation.requestKind === "vip",
      requestKind: mutation.requestKind,
      vipTokenCost: nextVipTokenCost,
      song:
        requestMode === "choice"
          ? buildViewerChoiceSongPayload(specialRequestText)
          : buildViewerSongPayload({
              song: song as CatalogSong,
              requestedQuery: buildRequestedPathQuery(requestedPaths),
              warningCode,
              warningMessage,
              candidateMatchesJson,
            }),
    });
  } catch (error) {
    if (vipReserved) {
      await refundReservedVipToken();
    }
    throw error;
  }

  await createViewerRequestLog(env, {
    context,
    rawMessage,
    normalizedQuery,
    song,
    outcome: "accepted",
    outcomeReason:
      warningCode ?? (mutation.requestKind === "vip" ? "vip_request" : null),
  });

  if (vipTokenDelta < 0) {
    await grantVipToken(env, {
      channelId: context.state.channel.id,
      login: context.viewer.login,
      displayName: context.viewer.displayName,
      twitchUserId: context.viewer.twitchUserId,
      count: Math.abs(vipTokenDelta),
    });
  }

  const baseMessage =
    requestMode === "choice"
      ? formatViewerChoiceRequest({
          requestedText: specialRequestText,
          requestKind: mutation.requestKind,
          vipTokenCost: nextVipTokenCost,
        })
      : mutation.requestKind === "vip"
        ? `Added "${formatCatalogRequestTarget(
            song as CatalogSong,
            requestedPaths
          )}" as a VIP request${getVipTokenCostMessageSuffix(nextVipTokenCost)}.`
        : `Added "${formatCatalogRequestTarget(
            song as CatalogSong,
            requestedPaths
          )}" to the playlist${getVipTokenCostMessageSuffix(nextVipTokenCost)}.`;

  return {
    ok: true,
    message: warningMessage ? `${baseMessage} ${warningMessage}` : baseMessage,
  };
}

async function wasSongRequestedRecently(
  env: AppEnv,
  input: {
    channelId: string;
    songId: string;
    since: number;
  }
) {
  const recentLogs = await getDb(env).query.requestLogs.findMany({
    where: and(
      eq(requestLogs.channelId, input.channelId),
      eq(requestLogs.outcome, "accepted"),
      eq(requestLogs.matchedSongId, input.songId),
      gte(requestLogs.createdAt, input.since)
    ),
    orderBy: [desc(requestLogs.createdAt)],
    limit: 1,
  });

  return recentLogs.length > 0;
}

async function createViewerRequestLog(
  env: AppEnv,
  input: {
    context: ViewerRequestContext;
    rawMessage: string;
    normalizedQuery: string;
    song: Pick<CatalogSong, "id" | "title" | "artist"> | null;
    outcome: "accepted" | "rejected";
    outcomeReason?: string | null;
  }
) {
  await createRequestLog(env, {
    channelId: input.context.state.channel.id,
    twitchMessageId: null,
    twitchUserId: input.context.viewer.twitchUserId,
    requesterLogin: input.context.viewer.login,
    requesterDisplayName: input.context.viewer.displayName,
    rawMessage: input.rawMessage,
    normalizedQuery: input.normalizedQuery,
    matchedSongId: input.song?.id ?? null,
    matchedSongTitle: input.song?.title ?? null,
    matchedSongArtist: input.song?.artist ?? null,
    outcome: input.outcome,
    outcomeReason: input.outcomeReason ?? null,
  });
}

async function addRequestToPlaylist(
  env: AppEnv,
  input: {
    channelId: string;
    requestedByTwitchUserId: string;
    requestedByLogin: string;
    requestedByDisplayName: string;
    requesterChatBadges?: RequesterChatBadge[];
    prioritizeNext?: boolean;
    requestKind: ViewerRequestKind;
    vipTokenCost?: number;
    song: ViewerSongPayload;
  }
) {
  return callPlaylistMutation(env, "/internal/playlist/add-request", input);
}

async function removeRequestsFromPlaylist(
  env: AppEnv,
  input: {
    channelId: string;
    requesterTwitchUserId: string;
    requesterLogin: string;
    actorUserId: string | null;
    kind: ViewerRemoveKind;
    itemId?: string;
  }
) {
  return callPlaylistMutation(env, "/internal/playlist/remove-requests", input);
}

async function changeRequestKindOnPlaylist(
  env: AppEnv,
  input: {
    channelId: string;
    itemId: string;
    actorUserId: string | null;
    requestKind: ViewerRequestKind;
    vipTokenCost?: number;
  }
) {
  return callPlaylistMutation(env, "/internal/playlist/mutate", {
    action: "changeRequestKind",
    ...input,
  });
}

async function editRequestOnPlaylist(
  env: AppEnv,
  input: {
    channelId: string;
    itemId: string;
    actorUserId: string | null;
    requestKind: ViewerRequestKind;
    vipTokenCost?: number;
    song: ViewerSongPayload;
  }
) {
  return callPlaylistMutation(env, "/internal/playlist/mutate", {
    action: "editRequest",
    ...input,
  });
}

async function callPlaylistMutation(
  env: AppEnv,
  pathname: string,
  payload: Record<string, unknown>
): Promise<PlaylistMutationResult> {
  try {
    const response = await callBackend(env, pathname, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as PlaylistMutationResult;
  } catch (error) {
    throw new ViewerRequestError(
      500,
      getErrorMessage(error, "The playlist could not be updated right now.")
    );
  }
}

function buildViewerQuery(
  song: NonNullable<Awaited<ReturnType<typeof getCatalogSongById>>>
) {
  if (song.sourceId != null) {
    return `song:${song.sourceId}`;
  }

  return `id:${song.id}`;
}

async function buildViewerCandidateMatchesJson(input: {
  env: AppEnv;
  channelId: string;
  song: NonNullable<Awaited<ReturnType<typeof getCatalogSongById>>>;
}) {
  const candidateSongs = await getCatalogSongGroupRowsForSongId(
    input.env,
    input.song.id
  );
  if (candidateSongs.length <= 1) {
    return undefined;
  }

  const preferredCharters = await getChannelPreferredChartersByChannelId(
    input.env,
    input.channelId
  );
  const preferredCharterSets = getPreferredCharterSets(preferredCharters);

  return buildPlaylistCandidateMatchesJson(
    buildPlaylistCandidateMatchesFromCatalogSongs({
      songs: candidateSongs,
      preferredCharterIds: preferredCharterSets.ids,
      preferredCharterNames: preferredCharterSets.names,
    })
  );
}

function buildViewerRawMessage(input: {
  source: ViewerRequestSource;
  replaceExisting: boolean;
  requestKind: ViewerRequestKind;
  vipTokenCost?: number;
  query: string;
  requestedPath?: RequestPathOption | null;
  requestMode?: "catalog" | "random" | "favorite" | "choice";
}) {
  const requestedPathSuffix = input.requestedPath
    ? ` *${input.requestedPath}`
    : "";
  const vipTokenCostSuffix =
    input.requestKind === "vip" && (input.vipTokenCost ?? 1) > 1
      ? ` *${input.vipTokenCost}`
      : "";

  return `${input.source}:${input.replaceExisting ? "edit" : "request"}:${input.requestKind}:${input.requestMode ?? "catalog"}:${input.query}${requestedPathSuffix}${vipTokenCostSuffix}`;
}

function buildViewerSongPayload(input: {
  song: NonNullable<Awaited<ReturnType<typeof getCatalogSongById>>>;
  requestedQuery?: string | null;
  warningCode?: string | null;
  warningMessage?: string | null;
  candidateMatchesJson?: string;
}): ViewerSongPayload {
  return {
    id: input.song.id,
    title: input.song.title,
    authorId: input.song.authorId ?? undefined,
    groupedProjectId: input.song.groupedProjectId ?? undefined,
    artist: input.song.artist ?? undefined,
    album: input.song.album ?? undefined,
    creator: input.song.creator ?? undefined,
    tuning: input.song.tuning ?? undefined,
    parts: Array.isArray(input.song.parts) ? input.song.parts : undefined,
    durationText: input.song.durationText ?? undefined,
    cdlcId: input.song.sourceId ?? undefined,
    source: input.song.source,
    sourceUrl: input.song.sourceUrl ?? undefined,
    requestedQuery: input.requestedQuery ?? undefined,
    warningCode: input.warningCode ?? undefined,
    warningMessage: input.warningMessage ?? undefined,
    candidateMatchesJson: input.candidateMatchesJson,
  };
}

function formatCatalogRequestTarget(
  song: CatalogSong,
  requestedPaths: string[]
) {
  if (requestedPaths.length === 0) {
    return formatSong(song);
  }

  return `${formatSong(song)} (${requestedPaths
    .map((path) => formatPathLabel(path))
    .join(", ")})`;
}

function getRequestedPathMismatchMessage(requestedPaths: string[]) {
  const formattedPaths = requestedPaths.map((path) => formatPathLabel(path));

  return `That song does not include the requested part${formattedPaths.length === 1 ? "" : "s"}: ${formattedPaths.join(", ")}.`;
}

function getStoredVipTokenCost(input: {
  requestKind?: string | null;
  vipTokenCost?: number | null;
}) {
  if (
    typeof input.vipTokenCost === "number" &&
    Number.isFinite(input.vipTokenCost) &&
    input.vipTokenCost >= 0
  ) {
    return Math.trunc(input.vipTokenCost);
  }

  return input.requestKind === "vip" ? 1 : 0;
}

function getVipTokenCostMessageSuffix(vipTokenCost?: number | null) {
  if (vipTokenCost == null || vipTokenCost <= 0) {
    return "";
  }

  return ` for ${formatVipTokenCostLabel(vipTokenCost)}`;
}

function getVipTokenDeltaMessage(vipTokenDelta: number) {
  if (vipTokenDelta > 0) {
    return `Spent ${formatVipTokenCostLabel(vipTokenDelta)}.`;
  }

  if (vipTokenDelta < 0) {
    return `Refunded ${formatVipTokenCostLabel(Math.abs(vipTokenDelta))}.`;
  }

  return "";
}

function getVipTokenReasonMessages(reasons: RequestVipTokenPlanReason[]) {
  return reasons
    .filter((reason) => reason.type !== "base_vip")
    .map((reason) => {
      switch (reason.type) {
        case "duration":
          return `Songs over ${formatVipDurationThresholdMinutes(reason.minimumDurationMinutes)} minutes cost ${formatVipTokenCostLabel(reason.cost)}.`;
        case "requested_path":
          return `${formatPathLabel(reason.path)} requests cost ${formatVipTokenCostLabel(reason.cost)}.`;
        case "explicit_vip":
          return `This VIP request is set to ${formatVipTokenCostLabel(reason.cost)}.`;
      }

      return "";
    });
}

function getVipTokenShortageMessage(input: {
  requestKind: ViewerRequestKind;
  requestedVipTokenCost: number;
  additionalVipTokenCost: number;
  availableVipTokens: number;
  reasons: RequestVipTokenPlanReason[];
}) {
  const reasonText = getVipTokenReasonMessages(input.reasons).join(" ");

  if (input.additionalVipTokenCost > 0 && input.requestedVipTokenCost > 0) {
    if (input.requestedVipTokenCost === input.additionalVipTokenCost) {
      return `You need ${formatVipTokenCostLabel(input.requestedVipTokenCost)} for this ${input.requestKind === "vip" ? "VIP request" : "request"}.${reasonText ? ` ${reasonText}` : ""} You currently have ${input.availableVipTokens}.`;
    }

    return `You need ${formatVipTokenCostLabel(input.additionalVipTokenCost)} more for this change to ${formatVipTokenCostLabel(input.requestedVipTokenCost)}.${reasonText ? ` ${reasonText}` : ""} You currently have ${input.availableVipTokens}.`;
  }

  return "You do not have enough VIP tokens for this request.";
}

function getViewerVipRequestCooldownMessage(
  countdown: ReturnType<typeof getVipRequestCooldownCountdown>
) {
  if (!countdown) {
    return "Wait a little longer before adding another VIP request.";
  }

  return `Wait ${formatVipRequestCooldownCountdown(countdown)} before adding another VIP request.`;
}

function formatSong(
  song: Pick<
    NonNullable<Awaited<ReturnType<typeof getCatalogSongById>>>,
    "title" | "artist"
  >
) {
  return song.artist ? `${song.artist} - ${song.title}` : song.title;
}
