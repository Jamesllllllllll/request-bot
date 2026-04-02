import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/db/repositories", () => ({
  consumeSearchRateLimit: vi.fn(),
  getChannelBlacklistByChannelId: vi.fn(),
  getChannelByTwitchChannelId: vi.fn(),
  getChannelSettingsByChannelId: vi.fn(),
  getExtensionPanelPlaylistByChannelId: vi.fn(),
  getUserByTwitchUserId: vi.fn(),
  getVipTokenBalance: vi.fn(),
  searchCatalogSongs: vi.fn(),
  upsertUserProfile: vi.fn(),
}));

vi.mock("~/lib/twitch/api", () => ({
  getAppAccessToken: vi.fn(),
  getTwitchUserById: vi.fn(),
}));

vi.mock("~/lib/server/playlist-management", () => ({
  canPerformPlaylistMutationAction: vi.fn(),
  getForbiddenPlaylistMutationMessage: vi.fn(),
  loadPlaylistManagementStateForAccess: vi.fn(),
  performPlaylistMutation: vi.fn(),
}));

vi.mock("~/lib/server/viewer-request", () => ({
  getViewerRequestStateForChannelViewer: vi.fn(),
  performViewerRequestMutationForChannelViewer: vi.fn(),
}));

import {
  consumeSearchRateLimit,
  getChannelBlacklistByChannelId,
  getChannelByTwitchChannelId,
  getChannelSettingsByChannelId,
  getExtensionPanelPlaylistByChannelId,
  getUserByTwitchUserId,
  getVipTokenBalance,
  searchCatalogSongs,
  upsertUserProfile,
} from "~/lib/db/repositories";
import {
  ExtensionPanelError,
  getExtensionBootstrapState,
  getExtensionPanelState,
  performExtensionPlaylistMutation,
  performExtensionViewerRequestMutation,
  searchExtensionCatalog,
} from "~/lib/server/extension-panel";
import {
  canPerformPlaylistMutationAction,
  getForbiddenPlaylistMutationMessage,
  loadPlaylistManagementStateForAccess,
  performPlaylistMutation,
} from "~/lib/server/playlist-management";
import {
  getViewerRequestStateForChannelViewer,
  performViewerRequestMutationForChannelViewer,
} from "~/lib/server/viewer-request";
import { getAppAccessToken, getTwitchUserById } from "~/lib/twitch/api";

describe("extension panel service", () => {
  const env = {} as AppEnv;
  const auth = {
    token: "jwt",
    channelId: "twitch-channel-1",
    role: "viewer" as const,
    viewerUserId: "viewer-1",
    opaqueUserId: "Uopaque-viewer",
    isLinked: true,
    exp: Math.floor(Date.now() / 1000) + 300,
  };

  const baseChannel = {
    id: "channel-1",
    slug: "streamer",
    login: "streamer",
    displayName: "Streamer",
    ownerUserId: "owner-1",
    twitchChannelId: "twitch-channel-1",
    isLive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getChannelByTwitchChannelId).mockResolvedValue(
      baseChannel as never
    );
    vi.mocked(getExtensionPanelPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: "item-current",
      },
      items: [
        {
          id: "item-current",
          songId: "song-1",
          requestedByTwitchUserId: "viewer-1",
          songTitle: "Song One",
          status: "current",
          requestKind: "regular",
        },
      ],
    } as never);
    vi.mocked(getUserByTwitchUserId).mockResolvedValue({
      id: "user-1",
      twitchUserId: "viewer-1",
      login: "viewer_one",
      displayName: "Viewer One",
      profileImageUrl: "https://example.com/viewer.png",
      preferredLocale: "fr",
    } as never);
    vi.mocked(getViewerRequestStateForChannelViewer).mockResolvedValue({
      viewer: {
        twitchUserId: "viewer-1",
        login: "viewer_one",
        displayName: "Viewer One",
        profileImageUrl: "https://example.com/viewer.png",
        preferredLocale: "fr",
        isSubscriber: false,
        subscriptionVerified: false,
        vipTokensAvailable: 2,
        activeRequestLimit: 1,
        access: {
          allowed: true,
        },
      },
    });
    vi.mocked(consumeSearchRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
    } as never);
    vi.mocked(getChannelBlacklistByChannelId).mockResolvedValue({
      blacklistArtists: [{ artistId: 1, artistName: "Blocked Artist" }],
      blacklistCharters: [{ charterId: 2, charterName: "Blocked Charter" }],
      blacklistSongs: [{ songId: 3, songTitle: "Blocked Song" }],
      blacklistSongGroups: [
        { groupedProjectId: 4, songTitle: "Blocked Group" },
      ],
    } as never);
    vi.mocked(searchCatalogSongs).mockResolvedValue({
      results: [],
      total: 0,
      page: 1,
      pageSize: 10,
      hasNextPage: false,
    } as never);
    vi.mocked(getVipTokenBalance).mockResolvedValue({
      availableCount: 2,
    } as never);
    vi.mocked(performViewerRequestMutationForChannelViewer).mockResolvedValue({
      ok: true,
      message: "Added request.",
    } as never);
    vi.mocked(getAppAccessToken).mockResolvedValue({
      access_token: "app-token",
      token_type: "bearer",
    } as never);
    vi.mocked(getTwitchUserById).mockResolvedValue({
      id: "viewer-1",
      login: "viewer_one",
      display_name: "Viewer One",
      profile_image_url: "https://example.com/viewer.png",
    } as never);
    vi.mocked(upsertUserProfile).mockResolvedValue({
      id: "user-1",
      twitchUserId: "viewer-1",
      login: "viewer_one",
      displayName: "Viewer One",
      profileImageUrl: "https://example.com/viewer.png",
      preferredLocale: "fr",
    } as never);
    vi.mocked(getChannelSettingsByChannelId).mockResolvedValue({
      defaultLocale: "es",
      blacklistEnabled: true,
      showPlaylistPositions: true,
      moderatorCanManageRequests: true,
      moderatorCanManageBlacklist: false,
      moderatorCanManageSetlist: false,
      moderatorCanManageBlockedChatters: false,
      moderatorCanViewVipTokens: false,
      moderatorCanManageVipTokens: true,
      moderatorCanManageTags: false,
    } as never);
    vi.mocked(canPerformPlaylistMutationAction).mockReturnValue(true);
    vi.mocked(getForbiddenPlaylistMutationMessage).mockReturnValue(
      "You do not have permission to manage this channel playlist."
    );
    vi.mocked(loadPlaylistManagementStateForAccess).mockResolvedValue({
      channel: baseChannel,
      settings: {
        moderatorCanManageRequests: true,
        moderatorCanManageVipTokens: true,
      },
      playlist: {},
      items: [],
      playedSongs: [],
      blocks: [],
      vipTokens: [],
      blacklistArtists: [],
      blacklistCharters: [],
      blacklistSongs: [],
      blacklistSongGroups: [],
      setlistArtists: [],
      accessRole: "moderator",
      actorUserId: "user-1",
    } as never);
    vi.mocked(performPlaylistMutation).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }) as never
    );
  });

  it("returns a setup state when the channel is not connected", async () => {
    vi.mocked(getChannelByTwitchChannelId).mockResolvedValue(null as never);

    await expect(
      getExtensionBootstrapState({
        env,
        auth: {
          ...auth,
          isLinked: false,
          viewerUserId: null,
          opaqueUserId: "Aanon-viewer",
        },
      })
    ).resolves.toMatchObject({
      connected: false,
      setup: {
        code: "channel_not_connected",
      },
      viewer: {
        isLinked: false,
        canRequest: false,
      },
    });
  });

  it("returns linked viewer bootstrap state with capabilities", async () => {
    await expect(
      getExtensionBootstrapState({
        env,
        auth,
      })
    ).resolves.toMatchObject({
      connected: true,
      channel: {
        slug: "streamer",
        isLive: true,
      },
      settings: {
        defaultLocale: "es",
        showPlaylistPositions: true,
      },
      playlist: {
        currentItemId: "item-current",
      },
      viewer: {
        isLinked: true,
        profile: {
          preferredLocale: "fr",
        },
        canRequest: true,
        canVipRequest: true,
        canEditOwnRequest: false,
        canRemoveOwnRequest: false,
      },
      management: {
        accessRole: "viewer",
        permissions: {
          canManageRequests: false,
        },
      },
    });
    vi.mocked(getVipTokenBalance).mockResolvedValue({
      availableCount: 2,
    } as never);
  });

  it("returns moderator management permissions from the extension role", async () => {
    await expect(
      getExtensionBootstrapState({
        env,
        auth: {
          ...auth,
          role: "moderator",
        },
      })
    ).resolves.toMatchObject({
      management: {
        accessRole: "moderator",
        actorUserId: "user-1",
        permissions: {
          canManageRequests: true,
          canManageVipTokens: true,
          canManageBlacklist: false,
        },
      },
    });

    expect(getViewerRequestStateForChannelViewer).toHaveBeenCalledWith({
      env,
      channel: baseChannel,
      viewer: expect.objectContaining({
        twitchUserId: "viewer-1",
      }),
      requesterOverride: {
        isModerator: true,
      },
      ignoreRequestsDisabled: true,
    });
  });

  it("disables viewer request actions in bootstrap when the viewer is blocked", async () => {
    vi.mocked(getViewerRequestStateForChannelViewer).mockResolvedValue({
      viewer: {
        twitchUserId: "viewer-1",
        login: "viewer_one",
        displayName: "Viewer One",
        profileImageUrl: "https://example.com/viewer.png",
        isSubscriber: false,
        subscriptionVerified: false,
        vipTokensAvailable: 2,
        activeRequestLimit: 1,
        access: {
          allowed: false,
          reason: "You are blocked from requesting songs in this channel.",
        },
      },
    });

    await expect(
      getExtensionBootstrapState({
        env,
        auth,
      })
    ).resolves.toMatchObject({
      viewer: {
        canRequest: false,
        canVipRequest: false,
        access: {
          allowed: false,
          reason: "You are blocked from requesting songs in this channel.",
        },
      },
    });
  });

  it("returns lightweight live state for polling refreshes", async () => {
    await expect(
      getExtensionPanelState({
        env,
        auth,
      })
    ).resolves.toMatchObject({
      channel: {
        isLive: true,
      },
      settings: {
        defaultLocale: "es",
        showPlaylistPositions: true,
      },
      playlist: {
        currentItemId: "item-current",
      },
      viewer: {
        activeRequests: [
          expect.objectContaining({
            id: "item-current",
          }),
        ],
        canVipRequest: true,
        canEditOwnRequest: false,
        canRemoveOwnRequest: false,
        profile: {
          twitchUserId: "viewer-1",
          displayName: "Viewer One",
          preferredLocale: "fr",
          vipTokensAvailable: 2,
        },
      },
    });
  });

  it("keeps viewer edit capability when multiple active requests are present", async () => {
    vi.mocked(getExtensionPanelPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [
        {
          id: "item-1",
          songId: "song-1",
          requestedByTwitchUserId: "viewer-1",
          songTitle: "Song One",
          status: "queued",
          requestKind: "regular",
        },
        {
          id: "item-2",
          songId: "song-2",
          requestedByTwitchUserId: "viewer-1",
          songTitle: "Song Two",
          status: "queued",
          requestKind: "vip",
        },
      ],
    } as never);

    await expect(
      getExtensionPanelState({
        env,
        auth,
      })
    ).resolves.toMatchObject({
      viewer: {
        activeRequests: [
          expect.objectContaining({
            id: "item-1",
          }),
          expect.objectContaining({
            id: "item-2",
          }),
        ],
        canEditOwnRequest: true,
        canRemoveOwnRequest: true,
      },
    });
  });

  it("hydrates a missing linked viewer from Twitch", async () => {
    vi.mocked(getUserByTwitchUserId).mockResolvedValue(null as never);

    await getExtensionBootstrapState({
      env,
      auth,
    });

    expect(getAppAccessToken).toHaveBeenCalledWith(env);
    expect(getTwitchUserById).toHaveBeenCalledWith({
      env,
      accessToken: "app-token",
      id: "viewer-1",
    });
    expect(upsertUserProfile).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        twitchUserId: "viewer-1",
        login: "viewer_one",
      })
    );
  });

  it("passes blacklist exclusions through extension search", async () => {
    await expect(
      searchExtensionCatalog({
        env,
        auth,
        search: {
          query: "cherub",
          page: 1,
          pageSize: 10,
        },
      })
    ).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    expect(searchCatalogSongs).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        query: "cherub",
        excludeSongIds: [3],
        excludeGroupedProjectIds: [4],
        excludeArtistIds: [1],
        excludeAuthorIds: [2],
      })
    );
  });

  it("passes channel request filters through extension search", async () => {
    vi.mocked(getChannelSettingsByChannelId).mockResolvedValue({
      onlyOfficialDlc: true,
      allowedTuningsJson: '["E Standard","Drop D"]',
      requiredPathsJson: '["lead","voice"]',
      requiredPathsMatchMode: "all",
    } as never);

    await searchExtensionCatalog({
      env,
      auth,
      search: {
        query: "cherub",
        page: 1,
        pageSize: 10,
      },
    });

    expect(searchCatalogSongs).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        restrictToOfficial: true,
        allowedTuningsFilter: ["E Standard", "Drop D"],
        requiredPartsFilter: ["lead", "voice"],
        requiredPartsFilterMatchMode: "all",
      })
    );
  });

  it("skips blacklist exclusions when blacklist rules are off", async () => {
    vi.mocked(getChannelSettingsByChannelId).mockResolvedValue({
      blacklistEnabled: false,
    } as never);

    await searchExtensionCatalog({
      env,
      auth,
      search: {
        query: "cherub",
        page: 1,
        pageSize: 10,
      },
    });

    const searchInput = vi.mocked(searchCatalogSongs).mock.calls.at(-1)?.[1];

    expect(searchInput).not.toHaveProperty("excludeSongIds");
    expect(searchInput).not.toHaveProperty("excludeGroupedProjectIds");
    expect(searchInput).not.toHaveProperty("excludeArtistIds");
    expect(searchInput).not.toHaveProperty("excludeArtistNames");
    expect(searchInput).not.toHaveProperty("excludeAuthorIds");
    expect(searchInput).not.toHaveProperty("excludeCreatorNames");
  });

  it("maps shared search results into panel items", async () => {
    vi.mocked(searchCatalogSongs).mockResolvedValue({
      results: [
        {
          id: "song-1",
          title: "Cherub Rock",
          artist: "Smashing Pumpkins",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      hasNextPage: false,
    } as never);

    await expect(
      searchExtensionCatalog({
        env,
        auth,
        search: {
          query: "cherub",
          page: 1,
          pageSize: 10,
        },
      })
    ).resolves.toEqual({
      items: [
        {
          id: "song-1",
          title: "Cherub Rock",
          artist: "Smashing Pumpkins",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });

  it("delegates extension mutations into the shared viewer-request service", async () => {
    await expect(
      performExtensionViewerRequestMutation({
        env,
        auth,
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "vip",
          replaceExisting: true,
          itemId: "item-1",
        },
      })
    ).resolves.toEqual({
      ok: true,
      message: "Added request.",
    });

    expect(performViewerRequestMutationForChannelViewer).toHaveBeenCalledWith({
      env,
      channel: baseChannel,
      viewer: expect.objectContaining({
        twitchUserId: "viewer-1",
      }),
      mutation: {
        action: "submit",
        songId: "song-1",
        requestKind: "vip",
        replaceExisting: true,
        itemId: "item-1",
      },
      source: "extension",
      requesterOverride: undefined,
      ignoreRequestsDisabled: false,
    });
  });

  it("passes moderator request overrides into extension viewer mutations", async () => {
    await expect(
      performExtensionViewerRequestMutation({
        env,
        auth: {
          ...auth,
          role: "moderator",
        },
        mutation: {
          action: "submit",
          query: "bruno mars",
          requestMode: "random",
          requestKind: "regular",
          replaceExisting: false,
        },
      })
    ).resolves.toEqual({
      ok: true,
      message: "Added request.",
    });

    expect(performViewerRequestMutationForChannelViewer).toHaveBeenCalledWith({
      env,
      channel: baseChannel,
      viewer: expect.objectContaining({
        twitchUserId: "viewer-1",
      }),
      mutation: {
        action: "submit",
        query: "bruno mars",
        requestMode: "random",
        requestKind: "regular",
        replaceExisting: false,
      },
      source: "extension",
      requesterOverride: {
        isModerator: true,
      },
      ignoreRequestsDisabled: true,
    });
  });

  it("rejects write actions for unlinked viewers", async () => {
    await expect(
      performExtensionViewerRequestMutation({
        env,
        auth: {
          ...auth,
          viewerUserId: null,
          isLinked: false,
        },
        mutation: {
          action: "remove",
          kind: "all",
        },
      })
    ).rejects.toBeInstanceOf(ExtensionPanelError);

    expect(performViewerRequestMutationForChannelViewer).not.toHaveBeenCalled();
  });

  it.each([
    {
      mutation: {
        action: "setCurrent" as const,
        itemId: "item-current",
      },
    },
    {
      mutation: {
        action: "returnToQueue" as const,
        itemId: "item-current",
      },
    },
    {
      mutation: {
        action: "markPlayed" as const,
        itemId: "item-current",
      },
    },
    {
      mutation: {
        action: "changeRequestKind" as const,
        itemId: "item-current",
        requestKind: "vip" as const,
      },
    },
    {
      mutation: {
        action: "deleteItem" as const,
        itemId: "item-current",
      },
    },
  ])("delegates playlist management mutation $mutation.action for moderators", async ({
    mutation,
  }) => {
    const response = await performExtensionPlaylistMutation({
      env,
      auth: {
        ...auth,
        role: "moderator",
      },
      mutation,
    });

    expect(loadPlaylistManagementStateForAccess).toHaveBeenCalledWith(env, {
      channel: baseChannel,
      accessRole: "moderator",
      actorUserId: "user-1",
    });
    expect(canPerformPlaylistMutationAction).toHaveBeenCalledWith(
      expect.anything(),
      mutation.action
    );
    expect(performPlaylistMutation).toHaveBeenCalledWith(
      env,
      expect.anything(),
      mutation
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects playlist management mutations for plain viewers", async () => {
    await expect(
      performExtensionPlaylistMutation({
        env,
        auth,
        mutation: {
          action: "deleteItem",
          itemId: "item-current",
        },
      })
    ).rejects.toMatchObject({
      status: 403,
    });

    expect(performPlaylistMutation).not.toHaveBeenCalled();
  });
});
