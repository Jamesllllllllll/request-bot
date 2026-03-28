import {
  consumeSearchRateLimit,
  getChannelBlacklistByChannelId,
  getChannelByTwitchChannelId,
  getChannelSettingsByChannelId,
  getExtensionPanelPlaylistByChannelId,
  getUserByTwitchUserId,
  getVipTokenBalance,
  searchCatalogSongs as searchCatalogSongsInDb,
  upsertUserProfile,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getAppAccessToken, getTwitchUserById } from "~/lib/twitch/api";
import type { ExtensionAuthContext } from "./extension-auth";
import {
  canPerformPlaylistMutationAction,
  getForbiddenPlaylistMutationMessage,
  loadPlaylistManagementStateForAccess,
  performPlaylistMutation,
} from "./playlist-management";
import {
  getViewerRequestStateForChannelViewer,
  performViewerRequestMutationForChannelViewer,
  type ViewerIdentity,
  type ViewerRequestMutationInput,
} from "./viewer-request";

type ExtensionSearchInput = {
  query: string;
  page: number;
  pageSize: number;
};

type ExtensionTraceContext = {
  traceId?: string;
};

type SharedCatalogSearchResponse = {
  results: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  hasNextPage?: boolean;
};

type ExtensionPlaylistMutationInput =
  | { action: "setCurrent"; itemId: string }
  | { action: "markPlayed"; itemId: string }
  | { action: "deleteItem"; itemId: string }
  | {
      action: "changeRequestKind";
      itemId: string;
      requestKind: "regular" | "vip";
    }
  | { action: "shufflePlaylist" }
  | {
      action: "reorderItems";
      orderedItemIds: string[];
    };

type ExtensionPanelManagement = {
  accessRole: "owner" | "moderator" | "viewer";
  actorUserId: string | null;
  permissions: {
    canManageRequests: boolean;
    canManageBlacklist: boolean;
    canManageSetlist: boolean;
    canManageBlockedChatters: boolean;
    canViewVipTokens: boolean;
    canManageVipTokens: boolean;
    canManageTags: boolean;
  };
};

type ExtensionPanelLiveState = {
  playlist: {
    currentItemId: string | null;
    items: Array<Record<string, unknown>>;
  };
  viewer: {
    profile: null | {
      twitchUserId: string;
      login: string;
      displayName: string;
      profileImageUrl?: string | null;
      vipTokensAvailable: number;
    };
    activeRequests: Array<Record<string, unknown>>;
    canVipRequest: boolean;
    canEditOwnRequest: boolean;
    canRemoveOwnRequest: boolean;
  };
};

function getEmptyExtensionPanelManagement(): ExtensionPanelManagement {
  return {
    accessRole: "viewer",
    actorUserId: null,
    permissions: {
      canManageRequests: false,
      canManageBlacklist: false,
      canManageSetlist: false,
      canManageBlockedChatters: false,
      canViewVipTokens: false,
      canManageVipTokens: false,
      canManageTags: false,
    },
  };
}

export class ExtensionPanelError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ExtensionPanelError";
  }
}

const extensionBootstrapSlowMs = 1000;
const extensionStateSlowMs = 750;

function createExtensionStageTimer() {
  const stageDurations: Record<string, number> = {};

  return {
    stageDurations,
    async measure<T>(stage: string, operation: () => Promise<T>) {
      const startedAt = Date.now();

      try {
        return await operation();
      } finally {
        stageDurations[stage] = Date.now() - startedAt;
      }
    },
  };
}

export async function getExtensionBootstrapState(input: {
  env: AppEnv;
  auth: ExtensionAuthContext;
  traceId?: string;
}) {
  const startedAt = Date.now();
  const timer = createExtensionStageTimer();

  try {
    const channel = await timer.measure("channelLookup", async () =>
      getChannelByTwitchChannelId(input.env, input.auth.channelId)
    );

    if (!channel) {
      const result = {
        connected: false,
        channel: null,
        playlist: {
          currentItemId: null,
          items: [],
        },
        viewer: {
          isLinked: input.auth.isLinked,
          opaqueUserId: input.auth.opaqueUserId,
          profile: null,
          activeRequests: [],
          canRequest: false,
          canVipRequest: false,
          canEditOwnRequest: false,
          canRemoveOwnRequest: false,
          access: {
            allowed: false,
            reason: "This Twitch channel has not connected RockList.Live yet.",
          },
        },
        management: getEmptyExtensionPanelManagement(),
        setup: {
          code: "channel_not_connected",
          message: "This Twitch channel has not connected RockList.Live yet.",
        },
      };

      logExtensionPanelRequestIfSlow({
        requestKind: "bootstrap",
        traceId: input.traceId,
        auth: input.auth,
        elapsedMs: Date.now() - startedAt,
        stageDurations: timer.stageDurations,
        channelId: null,
        connected: false,
      });

      return result;
    }

    const linkedViewer = input.auth.isLinked
      ? await timer.measure("viewerResolve", async () =>
          resolveLinkedViewerIdentity(input.env, input.auth.viewerUserId, {
            traceId: input.traceId,
          })
        )
      : null;
    const management = await timer.measure("managementAccess", async () =>
      resolveExtensionPanelManagement({
        env: input.env,
        auth: input.auth,
        channel,
        linkedViewer,
      })
    );

    const viewerState = linkedViewer
      ? await timer.measure("viewerRequestState", async () =>
          getViewerRequestStateForChannelViewer({
            env: input.env,
            channel,
            viewer: linkedViewer,
          })
        )
      : { viewer: null };

    const viewer = viewerState.viewer;
    const liveState = await timer.measure("liveState", async () =>
      getExtensionPanelLiveState({
        env: input.env,
        channel,
        linkedViewer,
      })
    );
    const canRequest = !!viewer?.access.allowed;

    const result = {
      connected: true,
      channel: {
        id: channel.id,
        slug: channel.slug,
        login: channel.login,
        displayName: channel.displayName,
        twitchChannelId: channel.twitchChannelId,
      },
      playlist: liveState.playlist,
      viewer: {
        isLinked: input.auth.isLinked,
        opaqueUserId: input.auth.opaqueUserId,
        profile: viewer
          ? {
              twitchUserId: viewer.twitchUserId,
              login: viewer.login,
              displayName: viewer.displayName,
              profileImageUrl: viewer.profileImageUrl ?? null,
              isSubscriber: viewer.isSubscriber,
              subscriptionVerified: viewer.subscriptionVerified,
              vipTokensAvailable: viewer.vipTokensAvailable,
              activeRequestLimit: viewer.activeRequestLimit,
            }
          : null,
        activeRequests: liveState.viewer.activeRequests,
        canRequest,
        canVipRequest: canRequest && liveState.viewer.canVipRequest,
        canEditOwnRequest: canRequest && liveState.viewer.canEditOwnRequest,
        canRemoveOwnRequest:
          input.auth.isLinked && liveState.viewer.canRemoveOwnRequest,
        access:
          viewer?.access ??
          ({
            allowed: false,
            reason: input.auth.isLinked
              ? "Viewer profile could not be resolved right now."
              : "Share Twitch identity to request songs.",
          } as const),
      },
      management,
      setup: null,
    };

    logExtensionPanelRequestIfSlow({
      requestKind: "bootstrap",
      traceId: input.traceId,
      auth: input.auth,
      elapsedMs: Date.now() - startedAt,
      stageDurations: timer.stageDurations,
      channelId: channel.id,
      connected: true,
    });

    return result;
  } catch (error) {
    console.error("Extension bootstrap state failed", {
      traceId: input.traceId ?? null,
      elapsedMs: Date.now() - startedAt,
      channelId: input.auth.channelId,
      viewerUserId: input.auth.viewerUserId ?? null,
      role: input.auth.role,
      isLinked: input.auth.isLinked,
      stageDurations: timer.stageDurations,
      error:
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unknown extension bootstrap state failure",
    });
    throw error;
  }
}

export async function getExtensionPanelState(input: {
  env: AppEnv;
  auth: ExtensionAuthContext;
  traceId?: string;
}) {
  const startedAt = Date.now();
  const timer = createExtensionStageTimer();

  try {
    const channel = await timer.measure("channelLookup", async () =>
      requireConnectedChannel(input.env, input.auth.channelId)
    );
    const linkedViewer =
      input.auth.isLinked && input.auth.viewerUserId
        ? await timer.measure("viewerLookup", async () =>
            getExistingLinkedViewerIdentity(input.env, input.auth.viewerUserId)
          )
        : null;

    const result = await timer.measure("liveState", async () =>
      getExtensionPanelLiveState({
        env: input.env,
        channel,
        linkedViewer,
      })
    );

    logExtensionPanelRequestIfSlow({
      requestKind: "state",
      traceId: input.traceId,
      auth: input.auth,
      elapsedMs: Date.now() - startedAt,
      stageDurations: timer.stageDurations,
      channelId: channel.id,
      connected: true,
    });

    return result;
  } catch (error) {
    console.error("Extension state failed", {
      traceId: input.traceId ?? null,
      elapsedMs: Date.now() - startedAt,
      channelId: input.auth.channelId,
      viewerUserId: input.auth.viewerUserId ?? null,
      role: input.auth.role,
      isLinked: input.auth.isLinked,
      stageDurations: timer.stageDurations,
      error:
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unknown extension state failure",
    });
    throw error;
  }
}

export async function searchExtensionCatalog(input: {
  env: AppEnv;
  auth: ExtensionAuthContext;
  search: ExtensionSearchInput;
}) {
  const channel = await requireConnectedChannel(
    input.env,
    input.auth.channelId
  );
  const searchIdentity =
    input.auth.viewerUserId ?? input.auth.opaqueUserId ?? "anonymous";
  const rateLimit = await consumeSearchRateLimit(input.env, {
    rateLimitKey: `extension:${channel.id}:${searchIdentity}`,
  });

  if (!rateLimit.allowed) {
    throw new ExtensionPanelError(
      429,
      rateLimit.message ?? "Please wait before performing another search."
    );
  }

  const blacklist = await getChannelBlacklistByChannelId(input.env, channel.id);

  const results = (await searchCatalogSongsInDb(input.env, {
    query: input.search.query,
    page: input.search.page,
    pageSize: input.search.pageSize,
    sortBy: "updated",
    sortDirection: "desc",
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
  })) as SharedCatalogSearchResponse;

  return {
    items: results.results,
    total: results.total,
    page: results.page,
    pageSize: results.pageSize,
    totalPages:
      results.pageSize > 0 ? Math.ceil(results.total / results.pageSize) : 0,
  };
}

export async function performExtensionViewerRequestMutation(input: {
  env: AppEnv;
  auth: ExtensionAuthContext;
  mutation: ViewerRequestMutationInput;
}) {
  const channel = await requireConnectedChannel(
    input.env,
    input.auth.channelId
  );
  const viewer = await requireLinkedViewerIdentity(
    input.env,
    input.auth.viewerUserId
  );

  return performViewerRequestMutationForChannelViewer({
    env: input.env,
    channel,
    viewer,
    mutation: input.mutation,
    source: "extension",
  });
}

export async function performExtensionPlaylistMutation(input: {
  env: AppEnv;
  auth: ExtensionAuthContext;
  mutation: ExtensionPlaylistMutationInput;
}) {
  const channel = await requireConnectedChannel(
    input.env,
    input.auth.channelId
  );
  const linkedViewer = await requireLinkedViewerIdentity(
    input.env,
    input.auth.viewerUserId
  );
  const management = await resolveExtensionPanelManagement({
    env: input.env,
    auth: input.auth,
    channel,
    linkedViewer,
  });

  if (management.accessRole === "viewer" || !management.actorUserId) {
    throw new ExtensionPanelError(
      403,
      "You do not have permission to manage this channel playlist."
    );
  }

  const state = await loadPlaylistManagementStateForAccess(input.env, {
    channel,
    accessRole: management.accessRole,
    actorUserId: management.actorUserId,
  });
  if (!state) {
    throw new ExtensionPanelError(
      404,
      "Channel management state could not be loaded right now."
    );
  }

  if (!canPerformPlaylistMutationAction(state, input.mutation.action)) {
    throw new ExtensionPanelError(
      403,
      getForbiddenPlaylistMutationMessage(input.mutation.action)
    );
  }

  return performPlaylistMutation(input.env, state, input.mutation);
}

async function requireConnectedChannel(env: AppEnv, twitchChannelId: string) {
  const channel = await getChannelByTwitchChannelId(env, twitchChannelId);
  if (!channel) {
    throw new ExtensionPanelError(
      404,
      "This Twitch channel has not connected RockList.Live yet."
    );
  }

  return channel;
}

async function getExtensionPanelLiveState(input: {
  env: AppEnv;
  channel: NonNullable<Awaited<ReturnType<typeof getChannelByTwitchChannelId>>>;
  linkedViewer: ViewerIdentity | null;
}): Promise<ExtensionPanelLiveState> {
  const playlist = await getExtensionPanelPlaylistByChannelId(
    input.env,
    input.channel.id
  );
  const items = (playlist?.items ?? []) as Array<Record<string, unknown>>;
  const activeRequests = input.linkedViewer
    ? items.filter(
        (item) =>
          item.requestedByTwitchUserId === input.linkedViewer?.twitchUserId &&
          (item.status === "queued" || item.status === "current")
      )
    : [];
  const vipTokenBalance = input.linkedViewer
    ? await getVipTokenBalance(input.env, {
        channelId: input.channel.id,
        login: input.linkedViewer.login,
      })
    : null;
  const vipTokensAvailable = vipTokenBalance?.availableCount ?? 0;
  const currentItem = items.find((item) => item.status === "current");
  const currentItemId =
    currentItem && typeof currentItem.id === "string"
      ? currentItem.id
      : (playlist?.playlist.currentItemId ?? null);

  return {
    playlist: {
      currentItemId,
      items,
    },
    viewer: {
      profile: input.linkedViewer
        ? {
            twitchUserId: input.linkedViewer.twitchUserId,
            login: input.linkedViewer.login,
            displayName: input.linkedViewer.displayName,
            profileImageUrl: input.linkedViewer.profileImageUrl ?? null,
            vipTokensAvailable,
          }
        : null,
      activeRequests,
      canVipRequest: vipTokensAvailable >= 1,
      canEditOwnRequest: activeRequests.length === 1,
      canRemoveOwnRequest: activeRequests.length > 0,
    },
  };
}

async function requireLinkedViewerIdentity(
  env: AppEnv,
  viewerUserId: string | null
) {
  if (!viewerUserId) {
    throw new ExtensionPanelError(
      401,
      "Share Twitch identity to manage requests from the panel."
    );
  }

  const viewer = await resolveLinkedViewerIdentity(env, viewerUserId);
  if (!viewer) {
    throw new ExtensionPanelError(
      404,
      "Viewer profile could not be resolved right now."
    );
  }

  return viewer;
}

async function getExistingLinkedViewerIdentity(
  env: AppEnv,
  viewerUserId: string | null
): Promise<ViewerIdentity | null> {
  if (!viewerUserId) {
    return null;
  }

  const user = await getUserByTwitchUserId(env, viewerUserId);
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    twitchUserId: user.twitchUserId,
    login: user.login,
    displayName: user.displayName,
    profileImageUrl: user.profileImageUrl,
  };
}

async function resolveExtensionPanelManagement(input: {
  env: AppEnv;
  auth: ExtensionAuthContext;
  channel: Awaited<ReturnType<typeof getChannelByTwitchChannelId>>;
  linkedViewer: ViewerIdentity | null;
}): Promise<ExtensionPanelManagement> {
  const { auth, channel, env, linkedViewer } = input;

  if (!channel || !linkedViewer) {
    return getEmptyExtensionPanelManagement();
  }

  if (
    auth.role === "broadcaster" ||
    linkedViewer.userId === channel.ownerUserId ||
    linkedViewer.twitchUserId === channel.twitchChannelId
  ) {
    return {
      accessRole: "owner",
      actorUserId: linkedViewer.userId ?? null,
      permissions: {
        canManageRequests: true,
        canManageBlacklist: true,
        canManageSetlist: true,
        canManageBlockedChatters: true,
        canViewVipTokens: true,
        canManageVipTokens: true,
        canManageTags: true,
      },
    };
  }

  if (auth.role !== "moderator") {
    return getEmptyExtensionPanelManagement();
  }

  const settings = await getChannelSettingsByChannelId(env, channel.id);

  return {
    accessRole: "moderator",
    actorUserId: linkedViewer.userId ?? null,
    permissions: {
      canManageRequests: !!settings?.moderatorCanManageRequests,
      canManageBlacklist: !!settings?.moderatorCanManageBlacklist,
      canManageSetlist: !!settings?.moderatorCanManageSetlist,
      canManageBlockedChatters: !!settings?.moderatorCanManageBlockedChatters,
      canViewVipTokens:
        !!settings?.moderatorCanViewVipTokens ||
        !!settings?.moderatorCanManageVipTokens,
      canManageVipTokens: !!settings?.moderatorCanManageVipTokens,
      canManageTags: !!settings?.moderatorCanManageTags,
    },
  };
}

async function resolveLinkedViewerIdentity(
  env: AppEnv,
  viewerUserId: string | null,
  trace?: ExtensionTraceContext
): Promise<ViewerIdentity | null> {
  if (!viewerUserId) {
    return null;
  }

  const existingUser = await getUserByTwitchUserId(env, viewerUserId);
  if (existingUser) {
    return {
      userId: existingUser.id,
      twitchUserId: existingUser.twitchUserId,
      login: existingUser.login,
      displayName: existingUser.displayName,
      profileImageUrl: existingUser.profileImageUrl,
    };
  }

  console.info("Extension linked viewer resolving via Twitch API", {
    traceId: trace?.traceId ?? null,
    viewerUserId,
  });

  const appAccessToken = await getAppAccessToken(env);
  const twitchUser = await getTwitchUserById({
    env,
    accessToken: appAccessToken.access_token,
    id: viewerUserId,
  });

  if (!twitchUser) {
    return null;
  }

  const user = await upsertUserProfile(env, {
    twitchUserId: twitchUser.id,
    login: twitchUser.login,
    displayName: twitchUser.display_name,
    profileImageUrl: twitchUser.profile_image_url,
  });

  return {
    userId: user.id,
    twitchUserId: user.twitchUserId,
    login: user.login,
    displayName: user.displayName,
    profileImageUrl: user.profileImageUrl,
  };
}

function logExtensionPanelRequestIfSlow(input: {
  requestKind: "bootstrap" | "state";
  traceId?: string;
  auth: ExtensionAuthContext;
  elapsedMs: number;
  stageDurations: Record<string, number>;
  channelId: string | null;
  connected: boolean;
}) {
  const slowThreshold =
    input.requestKind === "bootstrap"
      ? extensionBootstrapSlowMs
      : extensionStateSlowMs;

  if (input.elapsedMs < slowThreshold) {
    return;
  }

  console.info(`Extension ${input.requestKind} completed slowly`, {
    traceId: input.traceId ?? null,
    elapsedMs: input.elapsedMs,
    channelId: input.channelId,
    twitchChannelId: input.auth.channelId,
    viewerUserId: input.auth.viewerUserId ?? null,
    role: input.auth.role,
    isLinked: input.auth.isLinked,
    connected: input.connected,
    stageDurations: input.stageDurations,
  });
}
