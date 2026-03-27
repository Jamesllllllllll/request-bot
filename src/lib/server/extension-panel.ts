import {
  consumeSearchRateLimit,
  getChannelBlacklistByChannelId,
  getChannelByTwitchChannelId,
  getChannelSettingsByChannelId,
  getPlaylistByChannelId,
  getUserByTwitchUserId,
  searchCatalogSongs as searchCatalogSongsInDb,
  upsertUserProfile,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getAppAccessToken, getTwitchUserById } from "~/lib/twitch/api";
import type { ExtensionAuthContext } from "./extension-auth";
import {
  canPerformPlaylistMutationAction,
  enrichPlaylistItems,
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

export async function getExtensionBootstrapState(input: {
  env: AppEnv;
  auth: ExtensionAuthContext;
}) {
  const channel = await getChannelByTwitchChannelId(
    input.env,
    input.auth.channelId
  );

  if (!channel) {
    return {
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
  }

  const playlist = await getPlaylistByChannelId(input.env, channel.id);
  const items = (await enrichPlaylistItems(
    input.env,
    playlist?.items ?? []
  )) as Array<Record<string, unknown>>;
  const linkedViewer = input.auth.isLinked
    ? await resolveLinkedViewerIdentity(input.env, input.auth.viewerUserId)
    : null;
  const management = await resolveExtensionPanelManagement({
    env: input.env,
    auth: input.auth,
    channel,
    linkedViewer,
  });

  const viewerState = linkedViewer
    ? await getViewerRequestStateForChannelViewer({
        env: input.env,
        channel,
        viewer: linkedViewer,
      })
    : { viewer: null };

  const activeRequests = linkedViewer
    ? items.filter(
        (item) =>
          item.requestedByTwitchUserId === linkedViewer.twitchUserId &&
          (item.status === "queued" || item.status === "current")
      )
    : [];

  const viewer = viewerState.viewer;
  const canRequest = !!viewer?.access.allowed;
  const canEditOwnRequest = canRequest && activeRequests.length === 1;

  return {
    connected: true,
    channel: {
      id: channel.id,
      slug: channel.slug,
      login: channel.login,
      displayName: channel.displayName,
      twitchChannelId: channel.twitchChannelId,
    },
    playlist: {
      currentItemId:
        items.find((item) => item.status === "current")?.id ??
        playlist?.playlist.currentItemId ??
        null,
      items,
    },
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
      activeRequests,
      canRequest,
      canVipRequest: canRequest && (viewer?.vipTokensAvailable ?? 0) >= 1,
      canEditOwnRequest,
      canRemoveOwnRequest: input.auth.isLinked && activeRequests.length > 0,
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
  viewerUserId: string | null
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
