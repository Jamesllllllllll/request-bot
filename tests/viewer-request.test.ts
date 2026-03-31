import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/auth/session.server", () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock("~/lib/backend", () => ({
  callBackend: vi.fn(),
}));

vi.mock("~/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("~/lib/db/repositories", () => ({
  consumeVipToken: vi.fn(),
  countAcceptedRequestsInPeriod: vi.fn(),
  countActiveRequestsForUser: vi.fn(),
  createRequestLog: vi.fn(),
  getActiveBroadcasterAuthorizationForChannel: vi.fn(),
  getCatalogSongById: vi.fn(),
  getChannelBlacklistByChannelId: vi.fn(),
  getChannelBySlug: vi.fn(),
  getChannelSettingsByChannelId: vi.fn(),
  getPlaylistByChannelId: vi.fn(),
  searchCatalogSongs: vi.fn(),
  getUserById: vi.fn(),
  getVipTokenBalance: vi.fn(),
  grantVipToken: vi.fn(),
  isBlockedUser: vi.fn(),
  parseAuthorizationScopes: vi.fn(),
}));

vi.mock("~/lib/twitch/api", () => ({
  getBroadcasterSubscriptions: vi.fn(),
  TwitchApiError: class MockTwitchApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly body?: string
    ) {
      super(message);
      this.name = "TwitchApiError";
    }
  },
}));

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
  searchCatalogSongs,
} from "~/lib/db/repositories";
import {
  getViewerRequestState,
  performViewerRequestMutation,
  ViewerRequestError,
} from "~/lib/server/viewer-request";
import { getBroadcasterSubscriptions } from "~/lib/twitch/api";

function createDbState(input?: {
  setlist?: Array<{ artistId?: number | null; artistName: string }>;
  recentLogs?: Array<Record<string, unknown>>;
}) {
  return {
    query: {
      setlistArtists: {
        findMany: vi.fn().mockResolvedValue(input?.setlist ?? []),
      },
      requestLogs: {
        findMany: vi.fn().mockResolvedValue(input?.recentLogs ?? []),
      },
    },
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("viewer request service", () => {
  const env = {} as AppEnv;
  const request = new Request("https://example.com/channel/streamer");

  const baseChannel = {
    id: "channel-1",
    slug: "streamer",
    login: "streamer",
    displayName: "Streamer",
    ownerUserId: "owner-1",
    twitchChannelId: "broadcaster-1",
    isLive: true,
  };

  const baseViewer = {
    id: "user-1",
    twitchUserId: "viewer-1",
    login: "viewer_one",
    displayName: "Viewer One",
    profileImageUrl: "https://example.com/viewer.png",
  };

  const baseSettings = {
    channelId: "channel-1",
    requestsEnabled: true,
    allowAnyoneToRequest: true,
    allowSubscribersToRequest: true,
    allowVipsToRequest: true,
    onlyOfficialDlc: false,
    allowedTuningsJson: "[]",
    requiredPathsJson: "[]",
    requiredPathsMatchMode: "any",
    maxQueueSize: 100,
    maxViewerRequestsAtOnce: 1,
    maxSubscriberRequestsAtOnce: 2,
    maxVipViewerRequestsAtOnce: 3,
    maxVipSubscriberRequestsAtOnce: 4,
    limitRegularRequestsEnabled: false,
    regularRequestsPerPeriod: 1,
    regularRequestPeriodSeconds: 0,
    limitVipRequestsEnabled: false,
    vipRequestsPerPeriod: 1,
    vipRequestPeriodSeconds: 0,
    blacklistEnabled: false,
    letSetlistBypassBlacklist: false,
    setlistEnabled: false,
    subscribersMustFollowSetlist: false,
    autoGrantVipTokenToSubscribers: false,
    duplicateWindowSeconds: 900,
    commandPrefix: "!",
  };

  const baseSong = {
    id: "song-1",
    groupedProjectId: 44,
    artistId: 77,
    authorId: 88,
    title: "Cherub Rock",
    artist: "The Smashing Pumpkins",
    album: "Siamese Dream",
    creator: "Charter",
    tuning: "Eb Standard",
    parts: ["lead", "rhythm"],
    durationText: "4:58",
    sourceId: 12345,
    downloads: 1000,
    source: "library",
    sourceUrl: "https://example.com/song/12345",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getSessionUserId).mockResolvedValue("user-1");
    vi.mocked(getChannelBySlug).mockResolvedValue(baseChannel as never);
    vi.mocked(getUserById).mockResolvedValue(baseViewer as never);
    vi.mocked(getChannelSettingsByChannelId).mockResolvedValue(
      baseSettings as never
    );
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [],
    } as never);
    vi.mocked(getChannelBlacklistByChannelId).mockResolvedValue({
      blacklistArtists: [],
      blacklistCharters: [],
      blacklistSongs: [],
      blacklistSongGroups: [],
    });
    vi.mocked(getVipTokenBalance).mockResolvedValue({
      availableCount: 2,
    } as never);
    vi.mocked(isBlockedUser).mockResolvedValue(false);
    vi.mocked(countActiveRequestsForUser).mockResolvedValue(0);
    vi.mocked(countAcceptedRequestsInPeriod).mockResolvedValue(0);
    vi.mocked(getCatalogSongById).mockResolvedValue(baseSong as never);
    vi.mocked(getActiveBroadcasterAuthorizationForChannel).mockResolvedValue(
      null
    );
    vi.mocked(parseAuthorizationScopes).mockReturnValue([]);
    vi.mocked(getBroadcasterSubscriptions).mockResolvedValue({
      data: [],
    } as never);
    vi.mocked(createRequestLog).mockResolvedValue(undefined);
    vi.mocked(consumeVipToken).mockResolvedValue({
      availableCount: 1,
      consumedCount: 1,
    } as never);
    vi.mocked(grantVipToken).mockResolvedValue({
      availableCount: 2,
      grantedCount: 2,
    } as never);
    vi.mocked(callBackend).mockResolvedValue(
      jsonResponse({
        ok: true,
        playlistId: "playlist-1",
        changedItemId: "item-1",
        currentItemId: null,
        message: "Request added",
      })
    );
    vi.mocked(getDb).mockReturnValue(createDbState() as never);
  });

  it("returns anonymous state when no session is present", async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);

    await expect(
      getViewerRequestState({
        env,
        request,
        slug: "streamer",
      })
    ).resolves.toEqual({
      viewer: null,
    });
  });

  it("returns viewer request state with verified subscriber access", async () => {
    vi.mocked(getActiveBroadcasterAuthorizationForChannel).mockResolvedValue({
      accessTokenEncrypted: "access-token",
      scopes: JSON.stringify(["channel:read:subscriptions"]),
      twitchUserId: "broadcaster-1",
    } as never);
    vi.mocked(parseAuthorizationScopes).mockReturnValue([
      "channel:read:subscriptions",
    ]);
    vi.mocked(getBroadcasterSubscriptions).mockResolvedValue({
      data: [
        {
          user_id: "viewer-1",
        },
      ],
    } as never);
    vi.mocked(getVipTokenBalance).mockResolvedValue({
      availableCount: 2.5,
    } as never);

    await expect(
      getViewerRequestState({
        env,
        request,
        slug: "streamer",
      })
    ).resolves.toEqual({
      viewer: {
        twitchUserId: "viewer-1",
        login: "viewer_one",
        displayName: "Viewer One",
        profileImageUrl: "https://example.com/viewer.png",
        isSubscriber: true,
        subscriptionVerified: true,
        vipTokensAvailable: 2.5,
        activeRequestLimit: 2,
        access: {
          allowed: true,
        },
      },
    });
  });

  it("returns blocked viewer access when the viewer is banned from requests", async () => {
    vi.mocked(isBlockedUser).mockResolvedValue(true);

    await expect(
      getViewerRequestState({
        env,
        request,
        slug: "streamer",
      })
    ).resolves.toEqual({
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
  });

  it("returns offline access when the channel is not live", async () => {
    vi.mocked(getChannelBySlug).mockResolvedValue({
      ...baseChannel,
      isLive: false,
    } as never);

    await expect(
      getViewerRequestState({
        env,
        request,
        slug: "streamer",
      })
    ).resolves.toEqual({
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
          reason: "You can add requests when the stream goes live.",
        },
      },
    });
  });

  it("rejects submit mutations while the channel is offline", async () => {
    vi.mocked(getChannelBySlug).mockResolvedValue({
      ...baseChannel,
      isLive: false,
    } as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "regular",
          replaceExisting: false,
        },
      })
    ).rejects.toMatchObject({
      status: 403,
      message: "You can add requests when the stream goes live.",
    });
  });

  it("allows requests while offline testing is enabled", async () => {
    vi.mocked(getChannelBySlug).mockResolvedValue({
      ...baseChannel,
      isLive: false,
      botReadyState: "active_offline_testing",
    } as never);

    await expect(
      getViewerRequestState({
        env,
        request,
        slug: "streamer",
      })
    ).resolves.toMatchObject({
      viewer: {
        access: {
          allowed: true,
        },
      },
    });
  });

  it("submits a regular request through the playlist backend", async () => {
    const result = await performViewerRequestMutation({
      env,
      request,
      slug: "streamer",
      mutation: {
        action: "submit",
        songId: "song-1",
        requestKind: "regular",
        replaceExisting: false,
      },
    });

    expect(result).toEqual({
      ok: true,
      message: 'Added "The Smashing Pumpkins - Cherub Rock" to the playlist.',
    });
    expect(callBackend).toHaveBeenCalledWith(
      env,
      "/internal/playlist/add-request",
      expect.objectContaining({
        method: "POST",
      })
    );

    const body = JSON.parse(
      String(vi.mocked(callBackend).mock.calls[0]?.[2]?.body)
    ) as Record<string, unknown>;

    expect(body).toMatchObject({
      channelId: "channel-1",
      requestedByTwitchUserId: "viewer-1",
      requestedByLogin: "viewer_one",
      requestKind: "regular",
      prioritizeNext: false,
    });
    expect(createRequestLog).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        outcome: "accepted",
        matchedSongId: "song-1",
      })
    );
  });

  it("uses artist search for random custom requests", async () => {
    vi.mocked(searchCatalogSongs)
      .mockResolvedValueOnce({
        results: [baseSong],
        total: 1,
        hiddenBlacklistedCount: 0,
        page: 1,
        pageSize: 1,
      } as never)
      .mockResolvedValueOnce({
        results: [baseSong],
        total: 1,
        hiddenBlacklistedCount: 0,
        page: 1,
        pageSize: 1,
      } as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
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
      message: 'Added "The Smashing Pumpkins - Cherub Rock" to the playlist.',
    });

    expect(searchCatalogSongs).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        query: "bruno mars",
        field: "artist",
        page: 1,
        pageSize: 1,
      })
    );
  });

  it("upgrades an existing matching request to VIP and consumes a token", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [
        {
          id: "item-1",
          songId: "song-1",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "regular",
        },
      ],
    } as never);

    const result = await performViewerRequestMutation({
      env,
      request,
      slug: "streamer",
      mutation: {
        action: "submit",
        songId: "song-1",
        requestKind: "vip",
        replaceExisting: false,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("now marked as VIP");
    expect(callBackend).toHaveBeenCalledWith(
      env,
      "/internal/playlist/mutate",
      expect.objectContaining({
        method: "POST",
      })
    );

    const body = JSON.parse(
      String(vi.mocked(callBackend).mock.calls[0]?.[2]?.body)
    ) as Record<string, unknown>;

    expect(body).toEqual({
      action: "changeRequestKind",
      channelId: "channel-1",
      itemId: "item-1",
      actorUserId: null,
      requestKind: "vip",
    });
    expect(consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
      })
    );
  });

  it("rejects a VIP request when the token is no longer available at consume time", async () => {
    vi.mocked(consumeVipToken).mockResolvedValue(null as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "vip",
          replaceExisting: false,
        },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "You do not have enough VIP tokens for a VIP request.",
    });

    expect(callBackend).not.toHaveBeenCalled();
    expect(createRequestLog).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        outcome: "rejected",
        outcomeReason: "vip_token_unavailable",
      })
    );
  });

  it("edits the existing request in place when replaceExisting is enabled for one active request", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [
        {
          id: "item-old",
          songId: "song-old",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "regular",
        },
      ],
    } as never);
    vi.mocked(countActiveRequestsForUser).mockResolvedValue(1);
    vi.mocked(callBackend).mockResolvedValue(
      jsonResponse({
        ok: true,
        playlistId: "playlist-1",
        changedItemId: "item-old",
        currentItemId: null,
        message: "Request edited",
      })
    );

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "regular",
          replaceExisting: true,
        },
      })
    ).resolves.toEqual({
      ok: true,
      message: 'Edited your request to "The Smashing Pumpkins - Cherub Rock".',
    });

    expect(callBackend).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callBackend).mock.calls[0]?.[1]).toBe(
      "/internal/playlist/mutate"
    );

    const body = JSON.parse(
      String(vi.mocked(callBackend).mock.calls[0]?.[2]?.body)
    ) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "editRequest",
      channelId: "channel-1",
      itemId: "item-old",
      actorUserId: null,
      requestKind: "regular",
      song: {
        id: "song-1",
        title: "Cherub Rock",
        artist: "The Smashing Pumpkins",
        requestedQuery: "song:12345",
      },
    });
  });

  it("edits the targeted request in place when replaceExisting is enabled with multiple active requests", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [
        {
          id: "item-old",
          songId: "song-old",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "regular",
        },
        {
          id: "item-target",
          songId: "song-target",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "vip",
        },
      ],
    } as never);
    vi.mocked(countActiveRequestsForUser).mockResolvedValue(2);
    vi.mocked(callBackend).mockResolvedValue(
      jsonResponse({
        ok: true,
        playlistId: "playlist-1",
        changedItemId: "item-target",
        currentItemId: null,
        message: "Request edited",
      })
    );

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "regular",
          replaceExisting: true,
          itemId: "item-target",
        },
      })
    ).resolves.toEqual({
      ok: true,
      message: 'Edited your request to "The Smashing Pumpkins - Cherub Rock".',
    });

    expect(callBackend).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callBackend).mock.calls[0]?.[1]).toBe(
      "/internal/playlist/mutate"
    );

    const body = JSON.parse(
      String(vi.mocked(callBackend).mock.calls[0]?.[2]?.body)
    ) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "editRequest",
      channelId: "channel-1",
      itemId: "item-target",
      actorUserId: null,
      requestKind: "regular",
      song: {
        id: "song-1",
        title: "Cherub Rock",
        artist: "The Smashing Pumpkins",
        requestedQuery: "song:12345",
      },
    });
  });

  it("rejects editing a current request in place when it is already playing", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: "item-current",
      },
      items: [
        {
          id: "item-current",
          songId: "song-old",
          requestedByTwitchUserId: "viewer-1",
          status: "current",
          requestKind: "regular",
        },
      ],
    } as never);
    vi.mocked(countActiveRequestsForUser).mockResolvedValue(1);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "regular",
          replaceExisting: true,
          itemId: "item-current",
        },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "That request is already playing and cannot be edited.",
    });

    expect(callBackend).not.toHaveBeenCalled();
  });

  it("refunds a reserved VIP token when a VIP add fails after reservation", async () => {
    vi.mocked(callBackend).mockRejectedValue(new Error("backend failed"));

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "vip",
          replaceExisting: false,
        },
      })
    ).rejects.toMatchObject({
      status: 500,
    });

    expect(consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
      })
    );
    expect(grantVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
      })
    );
  });

  it("removes and re-adds when replaceExisting is enabled with multiple active requests", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [
        {
          id: "item-old",
          songId: "song-old",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "regular",
        },
        {
          id: "item-old-2",
          songId: "song-old-2",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "vip",
        },
      ],
    } as never);
    vi.mocked(countActiveRequestsForUser).mockResolvedValue(2);
    vi.mocked(callBackend)
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          playlistId: "playlist-1",
          changedItemId: "item-old",
          currentItemId: null,
          message: "Removed 2 requests",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          playlistId: "playlist-1",
          changedItemId: "item-new",
          currentItemId: null,
          message: "Request added",
        })
      );

    await performViewerRequestMutation({
      env,
      request,
      slug: "streamer",
      mutation: {
        action: "submit",
        songId: "song-1",
        requestKind: "regular",
        replaceExisting: true,
      },
    });

    expect(callBackend).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callBackend).mock.calls[0]?.[1]).toBe(
      "/internal/playlist/remove-requests"
    );
    expect(vi.mocked(callBackend).mock.calls[1]?.[1]).toBe(
      "/internal/playlist/add-request"
    );
  });

  it("rejects VIP requests when the viewer lacks a full token", async () => {
    vi.mocked(getVipTokenBalance).mockResolvedValue({
      availableCount: 0.5,
    } as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "vip",
          replaceExisting: false,
        },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "You do not have enough VIP tokens for a VIP request.",
    });

    expect(callBackend).not.toHaveBeenCalled();
    expect(createRequestLog).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        outcome: "rejected",
        outcomeReason: "vip_token_unavailable",
      })
    );
  });

  it("rejects replacing the only active request when it is already playing", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: "item-current",
      },
      items: [
        {
          id: "item-current",
          songId: "song-old",
          requestedByTwitchUserId: "viewer-1",
          status: "current",
          requestKind: "regular",
        },
      ],
    } as never);
    vi.mocked(countActiveRequestsForUser).mockResolvedValue(1);
    vi.mocked(getCatalogSongById).mockResolvedValue({
      ...baseSong,
      id: "song-2",
      sourceId: 54321,
      title: "Everlong",
    } as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-2",
          requestKind: "regular",
          replaceExisting: true,
        },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "You already have 1 active request in this playlist.",
    });

    expect(callBackend).not.toHaveBeenCalled();
  });

  it("removes the viewer's active requests through the dedicated mutation", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [
        {
          id: "item-1",
          songId: "song-1",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "regular",
        },
        {
          id: "item-2",
          songId: "song-2",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "vip",
        },
      ],
    } as never);
    vi.mocked(callBackend).mockResolvedValue(
      jsonResponse({
        ok: true,
        playlistId: "playlist-1",
        changedItemId: "item-1",
        currentItemId: null,
        message: "Removed 2 requests",
      })
    );

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "remove",
          kind: "all",
        },
      })
    ).resolves.toEqual({
      ok: true,
      message: "Removed 2 requests from the playlist.",
    });

    expect(callBackend).toHaveBeenCalledWith(
      env,
      "/internal/playlist/remove-requests",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("does not remove a current viewer request through the dedicated mutation", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: "item-current",
      },
      items: [
        {
          id: "item-current",
          songId: "song-1",
          requestedByTwitchUserId: "viewer-1",
          status: "current",
          requestKind: "regular",
        },
      ],
    } as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "remove",
          kind: "all",
          itemId: "item-current",
        },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "That request is already playing and cannot be removed.",
    });

    expect(callBackend).not.toHaveBeenCalled();
  });

  it("does not remove the currently playing request when no queued requests match", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: "item-current",
      },
      items: [
        {
          id: "item-current",
          songId: "song-1",
          requestedByTwitchUserId: "viewer-1",
          status: "current",
          requestKind: "regular",
        },
      ],
    } as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "remove",
          kind: "all",
        },
      })
    ).resolves.toEqual({
      ok: true,
      message: "You do not have any matching queued requests in this playlist.",
    });

    expect(callBackend).not.toHaveBeenCalled();
  });

  it("removes a single viewer request when an item id is provided", async () => {
    vi.mocked(getPlaylistByChannelId).mockResolvedValue({
      playlist: {
        id: "playlist-1",
        currentItemId: null,
      },
      items: [
        {
          id: "item-1",
          songId: "song-1",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "regular",
        },
        {
          id: "item-2",
          songId: "song-2",
          requestedByTwitchUserId: "viewer-1",
          status: "queued",
          requestKind: "vip",
        },
      ],
    } as never);
    vi.mocked(callBackend).mockResolvedValue(
      jsonResponse({
        ok: true,
        playlistId: "playlist-1",
        changedItemId: "item-1",
        currentItemId: null,
        message: "Removed 1 request",
      })
    );

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "remove",
          kind: "all",
          itemId: "item-1",
        },
      })
    ).resolves.toEqual({
      ok: true,
      message: "Removed your request from the playlist.",
    });

    expect(callBackend).toHaveBeenCalledWith(
      env,
      "/internal/playlist/remove-requests",
      expect.objectContaining({
        method: "POST",
      })
    );

    const body = JSON.parse(
      String(vi.mocked(callBackend).mock.calls[0]?.[2]?.body)
    ) as Record<string, unknown>;

    expect(body).toMatchObject({
      channelId: "channel-1",
      requesterTwitchUserId: "viewer-1",
      requesterLogin: "viewer_one",
      actorUserId: null,
      kind: "all",
      itemId: "item-1",
    });
  });

  it("throws a viewer request error when the viewer is not allowed to request", async () => {
    vi.mocked(getChannelSettingsByChannelId).mockResolvedValue({
      ...baseSettings,
      allowAnyoneToRequest: false,
      allowSubscribersToRequest: false,
      allowVipsToRequest: false,
    } as never);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "regular",
          replaceExisting: false,
        },
      })
    ).rejects.toBeInstanceOf(ViewerRequestError);

    expect(callBackend).not.toHaveBeenCalled();
  });

  it("rejects blocked viewers before sending a playlist add mutation", async () => {
    vi.mocked(isBlockedUser).mockResolvedValue(true);

    await expect(
      performViewerRequestMutation({
        env,
        request,
        slug: "streamer",
        mutation: {
          action: "submit",
          songId: "song-1",
          requestKind: "regular",
          replaceExisting: false,
        },
      })
    ).rejects.toMatchObject({
      status: 403,
      message: "You are blocked from requesting songs in this channel.",
    });

    expect(callBackend).not.toHaveBeenCalled();
  });
});
