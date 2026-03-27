import { and, desc, eq, gte } from "drizzle-orm";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import { getDb } from "~/lib/db/client";
import {
  consumeVipToken,
  countAcceptedRequestsInPeriod,
  countActiveRequestsForUser,
  createRequestLog,
  getActiveBroadcasterAuthorizationForChannel,
  getCatalogSongById,
  getChannelBlacklistByChannelId,
  getChannelBySlug,
  getChannelSettingsByChannelId,
  getPlaylistByChannelId,
  getUserById,
  getVipTokenBalance,
  grantVipToken,
  isBlockedUser,
  parseAuthorizationScopes,
} from "~/lib/db/repositories";
import { requestLogs, setlistArtists } from "~/lib/db/schema";
import type { AppEnv } from "~/lib/env";
import type { PlaylistMutationResult } from "~/lib/playlist/types";
import {
  getActiveRequestLimit,
  getRateLimitWindow,
  getRequiredPathsWarning,
  isRequesterAllowed,
  isSongAllowed,
  type RequesterContext,
} from "~/lib/request-policy";
import { getBroadcasterSubscriptions, TwitchApiError } from "~/lib/twitch/api";
import { getErrorMessage } from "~/lib/utils";
import { hasRedeemableVipToken } from "~/lib/vip-tokens";

type ViewerRequestKind = "regular" | "vip";
type ViewerRemoveKind = ViewerRequestKind | "all";

type ViewerRequestMutationInput =
  | {
      action: "submit";
      songId: string;
      requestKind: ViewerRequestKind;
      replaceExisting: boolean;
    }
  | {
      action: "remove";
      kind: ViewerRemoveKind;
    };

type ViewerIdentity = {
  userId: string;
  twitchUserId: string;
  login: string;
  displayName: string;
  profileImageUrl?: string | null;
};

type ViewerChannelState = {
  channel: NonNullable<Awaited<ReturnType<typeof getChannelBySlug>>>;
  settings: NonNullable<
    Awaited<ReturnType<typeof getChannelSettingsByChannelId>>
  >;
  playlist: NonNullable<Awaited<ReturnType<typeof getPlaylistByChannelId>>>;
  blacklist: Awaited<ReturnType<typeof getChannelBlacklistByChannelId>>;
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
  activeRequestLimit: number | null;
  isBlocked: boolean;
};

export type ViewerRequestStatePayload = {
  viewer: null | {
    twitchUserId: string;
    login: string;
    displayName: string;
    profileImageUrl?: string | null;
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

  const context = await loadViewerRequestContext(input.env, channel, viewer);
  return {
    viewer: {
      twitchUserId: context.viewer.twitchUserId,
      login: context.viewer.login,
      displayName: context.viewer.displayName,
      profileImageUrl: context.viewer.profileImageUrl,
      isSubscriber: context.subscription.isSubscriber,
      subscriptionVerified: context.subscription.verified,
      vipTokensAvailable: context.vipTokensAvailable,
      activeRequestLimit: context.activeRequestLimit,
      access: context.access,
    },
  };
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

  const context = await loadViewerRequestContext(input.env, channel, viewer);

  if (input.mutation.action === "remove") {
    return removeViewerRequests(input.env, context, input.mutation.kind);
  }

  return submitViewerRequest(input.env, context, input.mutation);
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
  } satisfies ViewerIdentity;
}

async function loadViewerRequestContext(
  env: AppEnv,
  channel: NonNullable<Awaited<ReturnType<typeof getChannelBySlug>>>,
  viewer: ViewerIdentity
): Promise<ViewerRequestContext> {
  const [
    settings,
    playlist,
    blacklist,
    setlist,
    blocked,
    subscription,
    balance,
  ] = await Promise.all([
    getChannelSettingsByChannelId(env, channel.id),
    getPlaylistByChannelId(env, channel.id),
    getChannelBlacklistByChannelId(env, channel.id),
    getDb(env).query.setlistArtists.findMany({
      where: eq(setlistArtists.channelId, channel.id),
    }),
    isBlockedUser(env, channel.id, viewer.twitchUserId),
    resolveViewerSubscription(env, channel.id, channel.twitchChannelId, viewer),
    getVipTokenBalance(env, {
      channelId: channel.id,
      login: viewer.login,
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
    isBroadcaster: false,
    isModerator: false,
    isVip: false,
    isSubscriber: subscription.isSubscriber,
  };

  const access = resolveViewerAccess({
    settings,
    requester,
    subscriptionVerified: subscription.verified,
    blocked,
  });

  const limit = getActiveRequestLimit(settings, requester);

  return {
    viewer,
    state: {
      channel,
      settings,
      playlist,
      blacklist,
      setlist,
    },
    requester,
    subscription,
    access,
    vipTokensAvailable: balance?.availableCount ?? 0,
    activeRequestLimit: Number.isFinite(limit) ? limit : null,
    isBlocked: blocked,
  };
}

function resolveViewerAccess(input: {
  settings: ViewerChannelState["settings"];
  requester: RequesterContext;
  subscriptionVerified: boolean;
  blocked: boolean;
}): ViewerRequestAccess {
  if (input.blocked) {
    return {
      allowed: false,
      reason: "You cannot add new requests in this channel.",
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

async function removeViewerRequests(
  env: AppEnv,
  context: ViewerRequestContext,
  kind: ViewerRemoveKind
) {
  const result = await removeRequestsFromPlaylist(env, {
    channelId: context.state.channel.id,
    requesterTwitchUserId: context.viewer.twitchUserId,
    requesterLogin: context.viewer.login,
    actorUserId: null,
    kind,
  });

  return {
    ok: true,
    message:
      result.message === "No matching requests found"
        ? "You do not have any matching active requests in this playlist."
        : `${result.message} from the playlist.`,
  };
}

async function submitViewerRequest(
  env: AppEnv,
  context: ViewerRequestContext,
  mutation: Extract<ViewerRequestMutationInput, { action: "submit" }>
) {
  if (!context.access.allowed) {
    throw new ViewerRequestError(
      403,
      context.access.reason ?? "You cannot request songs in this channel."
    );
  }

  const song = await getCatalogSongById(env, mutation.songId);
  if (!song) {
    throw new ViewerRequestError(404, "Song not found.");
  }

  const normalizedQuery = buildViewerQuery(song);
  const rawMessage = buildViewerRawMessage({
    replaceExisting: mutation.replaceExisting,
    requestKind: mutation.requestKind,
    query: normalizedQuery,
  });

  const existingActiveCount = await countActiveRequestsForUser(env, {
    channelId: context.state.channel.id,
    twitchUserId: context.viewer.twitchUserId,
  });

  const existingMatchingRequest =
    context.state.playlist.items.find(
      (item) =>
        item.songId === song.id &&
        item.requestedByTwitchUserId === context.viewer.twitchUserId &&
        (item.status === "queued" || item.status === "current")
    ) ?? null;

  const kindChangeOnly =
    existingMatchingRequest != null &&
    existingMatchingRequest.requestKind !== mutation.requestKind &&
    !mutation.replaceExisting;

  if (
    existingMatchingRequest &&
    existingMatchingRequest.requestKind === mutation.requestKind &&
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
      "That song is already in your active requests."
    );
  }

  const activeLimit = context.activeRequestLimit;
  const effectiveActiveCount = mutation.replaceExisting
    ? 0
    : existingActiveCount;

  if (
    activeLimit != null &&
    effectiveActiveCount >= activeLimit &&
    !kindChangeOnly
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

  if (
    mutation.requestKind === "vip" &&
    !hasRedeemableVipToken(context.vipTokensAvailable)
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
      "You do not have enough VIP tokens for a VIP request."
    );
  }

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

  const warningMessage = getRequiredPathsWarning({
    song,
    settings: context.state.settings,
  });
  const warningCode = warningMessage ? "missing_required_paths" : undefined;

  if (
    !kindChangeOnly &&
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

  if (!kindChangeOnly) {
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

  if (kindChangeOnly && existingMatchingRequest) {
    await changeRequestKindOnPlaylist(env, {
      channelId: context.state.channel.id,
      itemId: existingMatchingRequest.id,
      actorUserId: null,
      requestKind: mutation.requestKind,
    });

    await createViewerRequestLog(env, {
      context,
      rawMessage,
      normalizedQuery,
      song,
      outcome: "accepted",
      outcomeReason:
        mutation.requestKind === "vip"
          ? "vip_request_upgrade"
          : "vip_request_downgrade",
    });

    if (mutation.requestKind === "vip") {
      await consumeVipToken(env, {
        channelId: context.state.channel.id,
        login: context.viewer.login,
        displayName: context.viewer.displayName,
        twitchUserId: context.viewer.twitchUserId,
      });
    } else {
      await grantVipToken(env, {
        channelId: context.state.channel.id,
        login: context.viewer.login,
        displayName: context.viewer.displayName,
        twitchUserId: context.viewer.twitchUserId,
      });
    }

    return {
      ok: true,
      message:
        mutation.requestKind === "vip"
          ? existingMatchingRequest.status === "current"
            ? `Your request "${formatSong(song)}" is now marked as VIP.`
            : `Your request "${formatSong(song)}" is now marked as VIP and will play next.`
          : `Your request "${formatSong(song)}" is now a regular request again.`,
    };
  }

  if (mutation.replaceExisting && existingActiveCount > 0) {
    await removeRequestsFromPlaylist(env, {
      channelId: context.state.channel.id,
      requesterTwitchUserId: context.viewer.twitchUserId,
      requesterLogin: context.viewer.login,
      actorUserId: null,
      kind: "all",
    });
  }

  await addRequestToPlaylist(env, {
    channelId: context.state.channel.id,
    requestedByTwitchUserId: context.viewer.twitchUserId,
    requestedByLogin: context.viewer.login,
    requestedByDisplayName: context.viewer.displayName,
    prioritizeNext: mutation.requestKind === "vip",
    requestKind: mutation.requestKind,
    song: {
      id: song.id,
      title: song.title,
      authorId: song.authorId,
      groupedProjectId: song.groupedProjectId,
      artist: song.artist,
      album: song.album,
      creator: song.creator,
      tuning: song.tuning,
      parts: song.parts,
      durationText: song.durationText,
      cdlcId: song.sourceId,
      source: song.source,
      sourceUrl: song.sourceUrl,
      warningCode,
      warningMessage: warningMessage ?? undefined,
      candidateMatchesJson: JSON.stringify([
        {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          creator: song.creator,
          tuning: song.tuning,
          parts: song.parts ?? [],
          durationText: song.durationText,
          sourceId: song.sourceId,
        },
      ]),
    },
  });

  await createViewerRequestLog(env, {
    context,
    rawMessage,
    normalizedQuery,
    song,
    outcome: "accepted",
    outcomeReason:
      warningCode ?? (mutation.requestKind === "vip" ? "vip_request" : null),
  });

  if (mutation.requestKind === "vip") {
    await consumeVipToken(env, {
      channelId: context.state.channel.id,
      login: context.viewer.login,
      displayName: context.viewer.displayName,
      twitchUserId: context.viewer.twitchUserId,
    });
  }

  const baseMessage =
    mutation.requestKind === "vip"
      ? `Added "${formatSong(song)}" as a VIP request.`
      : `Added "${formatSong(song)}" to the playlist.`;

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
    song: NonNullable<Awaited<ReturnType<typeof getCatalogSongById>>>;
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
    matchedSongId: input.song.id,
    matchedSongTitle: input.song.title,
    matchedSongArtist: input.song.artist ?? null,
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
    prioritizeNext?: boolean;
    requestKind: ViewerRequestKind;
    song: {
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
      warningCode?: string;
      warningMessage?: string;
      candidateMatchesJson?: string;
    };
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
  }
) {
  return callPlaylistMutation(env, "/internal/playlist/mutate", {
    action: "changeRequestKind",
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

function buildViewerRawMessage(input: {
  replaceExisting: boolean;
  requestKind: ViewerRequestKind;
  query: string;
}) {
  return `web:${input.replaceExisting ? "edit" : "request"}:${input.requestKind}:${input.query}`;
}

function formatSong(
  song: Pick<
    NonNullable<Awaited<ReturnType<typeof getCatalogSongById>>>,
    "title" | "artist"
  >
) {
  return song.artist ? `${song.artist} - ${song.title}` : song.title;
}
