import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";
import {
  type EventSubChatDependencies,
  processEventSubChatMessage,
} from "~/lib/eventsub/chat-message";
import type { NormalizedChatEvent, ParsedChatCommand } from "~/lib/requests";
import type { SongSearchResult } from "~/lib/song-search/types";

function createEvent(
  overrides: Partial<NormalizedChatEvent> = {}
): NormalizedChatEvent {
  return {
    broadcasterTwitchUserId: "broadcaster-1",
    broadcasterLogin: "streamer",
    broadcasterDisplayName: "Streamer",
    chatterTwitchUserId: "viewer-1",
    chatterLogin: "viewer_one",
    chatterDisplayName: "Viewer One",
    messageId: "msg-1",
    rawMessage: "!sr song:12345",
    badges: [],
    isBroadcaster: false,
    isModerator: false,
    isVip: false,
    isSubscriber: false,
    ...overrides,
  };
}

function createParsed(
  overrides: Partial<ParsedChatCommand> = {}
): ParsedChatCommand {
  return {
    command: "sr",
    query: "song:12345",
    ...overrides,
  };
}

function createSong(
  overrides: Partial<SongSearchResult> = {}
): SongSearchResult {
  return {
    id: "song-1",
    artistId: 77,
    authorId: 101,
    title: "Cherub Rock",
    artist: "The Smashing Pumpkins",
    album: "Siamese Dream",
    creator: "charter",
    tuning: "Eb Standard",
    parts: ["lead", "rhythm"],
    durationText: "4:58",
    sourceId: 12345,
    source: "library",
    sourceUrl: "https://example.com/songs/12345",
    ...overrides,
  };
}

function createState(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      defaultLocale: "en",
      requestsEnabled: true,
      allowAnyoneToRequest: true,
      allowSubscribersToRequest: true,
      allowVipsToRequest: true,
      onlyOfficialDlc: false,
      allowedTuningsJson: "[]",
      requiredPathsJson: "[]",
      maxQueueSize: 100,
      maxViewerRequestsAtOnce: 1,
      maxSubscriberRequestsAtOnce: 1,
      maxVipViewerRequestsAtOnce: 1,
      maxVipSubscriberRequestsAtOnce: 1,
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
      allowRequestPathModifiers: false,
      requestPathModifierVipTokenCost: 0,
      commandPrefix: "!",
      moderatorCanManageVipTokens: false,
      duplicateWindowSeconds: 900,
      vipTokenDurationThresholdsJson: "[]",
      vipRequestCooldownEnabled: false,
      vipRequestCooldownMinutes: 0,
      ...overrides,
    },
    blacklistArtists: [],
    blacklistCharters: [],
    blacklistSongs: [],
    setlistArtists: [],
    logs: [],
    items: [],
    ...overrides,
  };
}

function createDeps(
  overrides: Partial<EventSubChatDependencies> = {}
): EventSubChatDependencies {
  return {
    getChannelByLogin: vi.fn().mockResolvedValue({
      id: "channel-1",
      ownerUserId: "owner-1",
      twitchChannelId: "broadcaster-1",
      slug: "streamer",
    }),
    claimEventSubDelivery: vi.fn().mockResolvedValue(true),
    getRequestLogByMessageId: vi.fn().mockResolvedValue(null),
    getDashboardState: vi.fn().mockResolvedValue(createState()),
    countActiveRequestsForUser: vi.fn().mockResolvedValue(0),
    countAcceptedRequestsInPeriod: vi.fn().mockResolvedValue(0),
    isBlockedUser: vi.fn().mockResolvedValue(false),
    getVipTokenBalance: vi.fn().mockResolvedValue(null),
    getVipRequestCooldown: vi.fn().mockResolvedValue(null),
    grantVipToken: vi.fn().mockResolvedValue(undefined),
    consumeVipToken: vi.fn().mockResolvedValue({
      availableCount: 0,
    }),
    getCatalogSongBySourceId: vi.fn().mockResolvedValue(createSong()),
    searchSongs: vi.fn().mockResolvedValue({ results: [createSong()] }),
    resolveTwitchUserByLogin: vi.fn().mockResolvedValue(null),
    addRequestToPlaylist: vi.fn().mockResolvedValue({
      ok: true,
      playlistId: "playlist-1",
      changedItemId: "item-1",
      currentItemId: "item-1",
      message: "Request added",
    }),
    removeRequestsFromPlaylist: vi.fn().mockResolvedValue({
      ok: true,
      playlistId: "playlist-1",
      message: "Removed 1 request",
    }),
    changeRequestKind: vi.fn().mockResolvedValue({
      ok: true,
      playlistId: "playlist-1",
      changedItemId: "item-1",
      message: "Request changed",
    }),
    editRequest: vi.fn().mockResolvedValue({
      ok: true,
      playlistId: "playlist-1",
      changedItemId: "item-1",
      message: "Request edited",
    }),
    createRequestLog: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    sendChatReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("processEventSubChatMessage", () => {
  const env = {
    APP_URL: "https://example.com",
  } as AppEnv;

  it("adds an exact song-id request to the playlist and queues a confirmation reply", async () => {
    const deps = createDeps();
    const result = await processEventSubChatMessage({
      env,
      event: createEvent(),
      parsed: createParsed(),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.getCatalogSongBySourceId).toHaveBeenCalledWith(env, 12345);
    expect(deps.searchSongs).not.toHaveBeenCalled();
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        prioritizeNext: false,
        requestKind: "regular",
        song: expect.objectContaining({
          cdlcId: 12345,
          title: "Cherub Rock",
        }),
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          'your song "The Smashing Pumpkins - Cherub Rock" has been added to the playlist.'
        ),
      })
    );
  });

  it("queues a confirmation reply when the broadcaster requests a song for themself", async () => {
    const deps = createDeps();

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr song:12345",
        chatterTwitchUserId: "broadcaster-1",
        chatterLogin: "streamer",
        chatterDisplayName: "Streamer",
        isBroadcaster: true,
      }),
      parsed: createParsed(),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        requestedByTwitchUserId: "broadcaster-1",
        requestedByLogin: "streamer",
        requestedByDisplayName: "Streamer",
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          '@streamer your song "The Smashing Pumpkins - Cherub Rock" has been added to the playlist.'
        ),
      })
    );
  });

  it("ignores blocked users before attempting playlist mutation", async () => {
    const deps = createDeps({
      isBlockedUser: vi.fn().mockResolvedValue(true),
    });
    const result = await processEventSubChatMessage({
      env,
      event: createEvent(),
      parsed: createParsed(),
      deps,
    });

    expect(result.body).toBe("Blocked");
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.createRequestLog).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        outcome: "blocked",
        outcomeReason: "user_blocked",
      })
    );
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });

  it("ignores duplicate chat deliveries before processing the command", async () => {
    const deps = createDeps({
      claimEventSubDelivery: vi.fn().mockResolvedValue(false),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent(),
      parsed: createParsed(),
      deps,
    });

    expect(result).toEqual({
      body: "Duplicate",
      status: 202,
    });
    expect(deps.getRequestLogByMessageId).not.toHaveBeenCalled();
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });

  it("ignores informational bot commands from blocked users", async () => {
    const deps = createDeps({
      isBlockedUser: vi.fn().mockResolvedValue(true),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!how",
      }),
      parsed: createParsed({
        command: "how",
        query: undefined,
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Blocked",
      status: 202,
    });
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });

  it("consumes a VIP token and inserts the request as next up", async () => {
    const deps = createDeps({
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 1,
        autoSubscriberGranted: false,
      }),
    });
    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip song:12345",
      }),
      parsed: createParsed({
        command: "vip",
      }),
      deps,
    });

    expect(result.body).toBe("Accepted");
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        prioritizeNext: true,
        requestKind: "vip",
      })
    );
    expect(deps.consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining("will play next"),
      })
    );
  });

  it("allows redeeming one VIP request from a fractional balance", async () => {
    const deps = createDeps({
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 1.5,
        autoSubscriberGranted: false,
      }),
      consumeVipToken: vi.fn().mockResolvedValue({
        availableCount: 0.5,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip song:12345",
      }),
      parsed: createParsed({
        command: "vip",
      }),
      deps,
    });

    expect(result.body).toBe("Accepted");
    expect(deps.consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
      })
    );
  });

  it("rejects VIP redemption when the remaining balance is below one token", async () => {
    const deps = createDeps({
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 0.5,
        autoSubscriberGranted: false,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip song:12345",
      }),
      parsed: createParsed({
        command: "vip",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.consumeVipToken).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "@viewer_one you need 1 VIP token for this VIP request. You have 0.5 VIP tokens available.",
      })
    );
  });

  it("adds a regular request when the song duration requires VIP tokens", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          vipTokenDurationThresholdsJson: JSON.stringify([
            {
              minimumDurationMinutes: 7,
              tokenCost: 1,
            },
            {
              minimumDurationMinutes: 9,
              tokenCost: 2,
            },
          ]),
        })
      ),
      getCatalogSongBySourceId: vi.fn().mockResolvedValue(
        createSong({
          durationText: "9:30",
        })
      ),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 2,
        autoSubscriberGranted: false,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent(),
      parsed: createParsed(),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        requestKind: "regular",
        vipTokenCost: 2,
      })
    );
    expect(deps.consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
        count: 2,
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          '@viewer_one your song "The Smashing Pumpkins - Cherub Rock" has been added to the playlist for 2 VIP tokens.',
      })
    );
  });

  it("adds a regular request when choosing a part requires VIP tokens", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          allowRequestPathModifiers: true,
          requestPathModifierVipTokenCost: 2,
        })
      ),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 2,
        autoSubscriberGranted: false,
      }),
      searchSongs: vi.fn().mockResolvedValue({
        results: [
          createSong({
            id: "song-bass",
            parts: ["bass"],
            sourceId: 22222,
          }),
        ],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock *bass",
      }),
      parsed: createParsed({
        query: "cherub rock *bass",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        requestKind: "regular",
        vipTokenCost: 2,
        song: expect.objectContaining({
          requestedQuery: "cherub rock *bass",
        }),
      })
    );
    expect(deps.consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
        count: 2,
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          '@viewer_one your song "The Smashing Pumpkins - Cherub Rock" has been added to the playlist for 2 VIP tokens.',
      })
    );
  });

  it("adds a regular request when duration and a requested part both add VIP cost", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          allowRequestPathModifiers: true,
          allowedRequestPathsJson: '["bass"]',
          requestPathModifierVipTokenCost: 1,
          requestPathModifierGuitarVipTokenCost: 0,
          requestPathModifierLeadVipTokenCost: 0,
          requestPathModifierRhythmVipTokenCost: 0,
          requestPathModifierBassVipTokenCost: 1,
          requestPathModifierUsesVipPriority: true,
          vipTokenDurationThresholdsJson: JSON.stringify([
            {
              minimumDurationMinutes: 7,
              tokenCost: 1,
            },
            {
              minimumDurationMinutes: 9,
              tokenCost: 2,
            },
          ]),
        })
      ),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 3,
        autoSubscriberGranted: false,
      }),
      getCatalogSongBySourceId: vi.fn().mockResolvedValue(
        createSong({
          parts: ["bass"],
          durationText: "9:30",
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr song:12345 *bass",
      }),
      parsed: createParsed({
        query: "song:12345 *bass",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        requestKind: "regular",
        vipTokenCost: 3,
        song: expect.objectContaining({
          requestedQuery: "song:12345 *bass",
        }),
      })
    );
    expect(deps.consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
        count: 3,
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          '@viewer_one your song "The Smashing Pumpkins - Cherub Rock" has been added to the playlist for 3 VIP tokens.',
      })
    );
  });

  it("consumes multiple VIP tokens when a song duration requires it", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          vipTokenDurationThresholdsJson: JSON.stringify([
            {
              minimumDurationMinutes: 7,
              tokenCost: 1,
            },
            {
              minimumDurationMinutes: 9,
              tokenCost: 2,
            },
          ]),
        })
      ),
      getCatalogSongBySourceId: vi.fn().mockResolvedValue(
        createSong({
          durationText: "9:30",
        })
      ),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 3,
        autoSubscriberGranted: false,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip song:12345",
      }),
      parsed: createParsed({
        command: "vip",
      }),
      deps,
    });

    expect(result.body).toBe("Accepted");
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        requestKind: "vip",
        vipTokenCost: 3,
      })
    );
    expect(deps.consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
        count: 3,
      })
    );
  });

  it("updates an existing VIP request when the VIP token cost increases", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          vipTokenDurationThresholdsJson: JSON.stringify([
            {
              minimumDurationMinutes: 7,
              tokenCost: 1,
            },
            {
              minimumDurationMinutes: 9,
              tokenCost: 2,
            },
          ]),
          items: [
            {
              id: "item-1",
              songId: "song-1",
              songTitle: "Cherub Rock",
              status: "queued",
              requestKind: "vip",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
              vipTokenCost: 1,
            },
          ],
        })
      ),
      getCatalogSongBySourceId: vi.fn().mockResolvedValue(
        createSong({
          durationText: "9:30",
        })
      ),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 2,
        autoSubscriberGranted: false,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip song:12345",
      }),
      parsed: createParsed({
        command: "vip",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.changeRequestKind).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      itemId: "item-1",
      requestKind: "vip",
      vipTokenCost: 3,
    });
    expect(deps.consumeVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
        count: 2,
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          '@viewer_one the VIP token cost for your request "The Smashing Pumpkins - Cherub Rock" is now 3 VIP tokens. Spent 2 VIP tokens.',
      })
    );
  });

  it("rejects another VIP request while a VIP cooldown is active", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          vipRequestCooldownEnabled: true,
          vipRequestCooldownMinutes: 5,
          maxVipViewerRequestsAtOnce: 2,
          items: [
            {
              id: "item-vip",
              songId: "song-1",
              songTitle: "Cherub Rock",
              status: "queued",
              requestKind: "vip",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
              vipTokenCost: 1,
            },
          ],
        })
      ),
      countActiveRequestsForUser: vi.fn().mockResolvedValue(1),
      getVipRequestCooldown: vi.fn().mockResolvedValue({
        sourceItemId: "item-vip",
        cooldownExpiresAt: Date.now() + 5 * 60_000,
      }),
      getCatalogSongBySourceId: vi.fn().mockResolvedValue(
        createSong({
          id: "song-2",
          sourceId: 54321,
          title: "Everlong",
          artist: "Foo Fighters",
        })
      ),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 2,
        autoSubscriberGranted: false,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip song:54321",
      }),
      parsed: createParsed({
        command: "vip",
        query: "song:54321",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining("before using another VIP request"),
      })
    );
    expect(deps.createRequestLog).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        outcomeReason: "vip_request_cooldown",
      })
    );
  });

  it("allows a regular request while a VIP cooldown is active", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          vipRequestCooldownEnabled: true,
          vipRequestCooldownMinutes: 5,
          maxViewerRequestsAtOnce: 2,
          items: [
            {
              id: "item-vip",
              songId: "song-1",
              songTitle: "Cherub Rock",
              status: "queued",
              requestKind: "vip",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
              vipTokenCost: 1,
            },
          ],
        })
      ),
      countActiveRequestsForUser: vi.fn().mockResolvedValue(1),
      getVipRequestCooldown: vi.fn().mockResolvedValue({
        sourceItemId: "item-vip",
        cooldownExpiresAt: Date.now() + 5 * 60_000,
      }),
      getCatalogSongBySourceId: vi.fn().mockResolvedValue(
        createSong({
          id: "song-2",
          sourceId: 54321,
          title: "Everlong",
          artist: "Foo Fighters",
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr song:54321",
      }),
      parsed: createParsed({
        command: "sr",
        query: "song:54321",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        requestKind: "regular",
        song: expect.objectContaining({
          title: "Everlong",
          artist: "Foo Fighters",
        }),
      })
    );
  });

  it("allows editing the same VIP request during its cooldown", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          vipRequestCooldownEnabled: true,
          vipRequestCooldownMinutes: 5,
          items: [
            {
              id: "item-vip",
              songId: "song-1",
              songTitle: "Cherub Rock",
              status: "queued",
              position: 2,
              requestKind: "vip",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
              vipTokenCost: 1,
            },
          ],
        })
      ),
      countActiveRequestsForUser: vi.fn().mockResolvedValue(1),
      getVipRequestCooldown: vi.fn().mockResolvedValue({
        sourceItemId: "item-vip",
        cooldownExpiresAt: Date.now() + 5 * 60_000,
      }),
      getCatalogSongBySourceId: vi.fn().mockResolvedValue(
        createSong({
          id: "song-2",
          sourceId: 54321,
          title: "Everlong",
          artist: "Foo Fighters",
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!edit #2 song:54321",
      }),
      parsed: createParsed({
        command: "edit",
        query: "song:54321",
        itemPosition: 2,
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.editRequest).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        itemId: "item-vip",
        requestKind: "vip",
        song: expect.objectContaining({
          title: "Everlong",
          artist: "Foo Fighters",
        }),
      })
    );
  });

  it("uses the channel default locale for bot replies when translations are available", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          defaultLocale: "es",
          requestsEnabled: false,
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent(),
      parsed: createParsed(),
      deps,
    });

    expect(result).toEqual({
      body: "Ignored",
      status: 202,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Las solicitudes están desactivadas para este canal en este momento.",
      })
    );
  });

  it("removes only the caller's requested items from the current channel playlist", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          items: [
            {
              id: "item-vip",
              songId: "song-1",
              status: "queued",
              requestKind: "vip",
              vipTokenCost: 2,
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
          ],
        })
      ),
      removeRequestsFromPlaylist: vi.fn().mockResolvedValue({
        ok: true,
        playlistId: "playlist-1",
        message: "Removed 1 request",
      }),
    });
    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!remove vip",
      }),
      parsed: createParsed({
        command: "remove",
        query: "vip",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.removeRequestsFromPlaylist).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      requesterTwitchUserId: "viewer-1",
      requesterLogin: "viewer_one",
      actorUserId: null,
      kind: "vip",
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.grantVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
        count: 2,
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "@viewer_one removed 1 VIP request from this playlist.",
      })
    );
  });

  it("lets a moderator add a request on behalf of another viewer while enforcing that viewer's limits", async () => {
    const deps = createDeps({
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
      countActiveRequestsForUser: vi.fn().mockResolvedValue(1),
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          maxViewerRequestsAtOnce: 1,
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        chatterTwitchUserId: "mod-1",
        chatterLogin: "mod_user",
        chatterDisplayName: "Mod User",
        isModerator: true,
        rawMessage: "!sr cherub rock @viewer_two",
      }),
      parsed: createParsed({
        command: "sr",
        query: "cherub rock",
        targetLogin: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "You already have 1 active request in the playlist.",
      })
    );
  });

  it("lets a moderator remove requests on behalf of another viewer", async () => {
    const deps = createDeps({
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        chatterTwitchUserId: "mod-1",
        chatterLogin: "mod_user",
        chatterDisplayName: "Mod User",
        isModerator: true,
        rawMessage: "!remove all @viewer_two",
      }),
      parsed: createParsed({
        command: "remove",
        query: "all",
        targetLogin: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.removeRequestsFromPlaylist).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      requesterTwitchUserId: "viewer-2",
      requesterLogin: "viewer_two",
      actorUserId: null,
      kind: "all",
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "@viewer_two removed 1 request from this playlist.",
      })
    );
  });

  it("deduplicates a redelivered remove command after the first success log is written", async () => {
    let hasLoggedMessage = false;
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          items: [
            {
              id: "item-1",
              songId: "song-1",
              status: "queued",
              requestKind: "regular",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
          ],
        })
      ),
      getRequestLogByMessageId: vi
        .fn()
        .mockImplementation(async () =>
          hasLoggedMessage ? { id: "log-1" } : null
        ),
      createRequestLog: vi.fn().mockImplementation(async () => {
        hasLoggedMessage = true;
      }),
      removeRequestsFromPlaylist: vi.fn().mockResolvedValue({
        ok: true,
        playlistId: "playlist-1",
        message: "Removed 1 request",
      }),
    });

    const event = createEvent({
      rawMessage: "!remove all",
      messageId: "msg-remove-1",
    });
    const parsed = createParsed({
      command: "remove",
      query: "all",
    });

    const firstResult = await processEventSubChatMessage({
      env,
      event,
      parsed,
      deps,
    });
    const secondResult = await processEventSubChatMessage({
      env,
      event,
      parsed,
      deps,
    });

    expect(firstResult).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(secondResult).toEqual({
      body: "Duplicate",
      status: 202,
    });
    expect(deps.removeRequestsFromPlaylist).toHaveBeenCalledTimes(1);
    expect(deps.sendChatReply).toHaveBeenCalledTimes(1);
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "@viewer_one removed 1 request from this playlist.",
      })
    );
  });

  it("edits another viewer's request when invoked by a moderator", async () => {
    const deps = createDeps({
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
      countActiveRequestsForUser: vi.fn().mockResolvedValue(1),
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          items: [
            {
              id: "item-queued",
              songId: "song-old",
              status: "queued",
              requestKind: "regular",
              requestedByTwitchUserId: "viewer-2",
              requestedByLogin: "viewer_two",
              requestedByDisplayName: "Viewer Two",
            },
          ],
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        chatterTwitchUserId: "mod-1",
        chatterLogin: "mod_user",
        chatterDisplayName: "Mod User",
        isModerator: true,
        rawMessage: "!edit mayonaise @viewer_two",
      }),
      parsed: createParsed({
        command: "edit",
        query: "mayonaise",
        targetLogin: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.editRequest).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      itemId: "item-queued",
      requestKind: "regular",
      vipTokenCost: 0,
      song: expect.objectContaining({
        id: "song-1",
        title: "Cherub Rock",
      }),
    });
    expect(deps.removeRequestsFromPlaylist).not.toHaveBeenCalled();
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
  });

  it("rejects edit when the target viewer has no active request", async () => {
    const deps = createDeps({
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
      countActiveRequestsForUser: vi.fn().mockResolvedValue(0),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        chatterTwitchUserId: "mod-1",
        chatterLogin: "mod_user",
        chatterDisplayName: "Mod User",
        isModerator: true,
        rawMessage: "!edit mayonaise @viewer_two",
      }),
      parsed: createParsed({
        command: "edit",
        query: "mayonaise",
        targetLogin: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.removeRequestsFromPlaylist).not.toHaveBeenCalled();
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "@viewer_two there is no active request to edit in this playlist.",
      })
    );
  });

  it("requires a playlist position when the viewer has multiple queued requests", async () => {
    const deps = createDeps({
      countActiveRequestsForUser: vi.fn().mockResolvedValue(2),
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          items: [
            {
              id: "item-2",
              songId: "song-old-1",
              status: "queued",
              position: 2,
              requestKind: "regular",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
            {
              id: "item-4",
              songId: "song-old-2",
              status: "queued",
              position: 4,
              requestKind: "vip",
              vipTokenCost: 2,
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
          ],
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!edit mayonaise",
      }),
      parsed: createParsed({
        command: "edit",
        query: "mayonaise",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.editRequest).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "@viewer_one you have multiple queued requests. Use !edit #<position> artist - song.",
      })
    );
  });

  it("edits the queued request at the requested playlist position", async () => {
    const deps = createDeps({
      countActiveRequestsForUser: vi.fn().mockResolvedValue(2),
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          items: [
            {
              id: "item-2",
              songId: "song-old-1",
              status: "queued",
              position: 2,
              requestKind: "regular",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
            {
              id: "item-4",
              songId: "song-old-2",
              status: "queued",
              position: 4,
              requestKind: "vip",
              vipTokenCost: 2,
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
          ],
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!edit #4 mayonaise",
      }),
      parsed: createParsed({
        command: "edit",
        query: "mayonaise",
        itemPosition: 4,
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.editRequest).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        itemId: "item-4",
        requestKind: "vip",
        vipTokenCost: 1,
      })
    );
    expect(deps.removeRequestsFromPlaylist).not.toHaveBeenCalled();
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.grantVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
        count: 1,
      })
    );
  });

  it("builds a channel-aware how reply", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue({
        ...createState(),
        blacklistArtists: [{ artistName: "Chevelle" }],
        blacklistCharters: [{ charterName: "Frif" }],
        blacklistSongs: [{ songTitle: "The Red" }],
        setlistArtists: [{ artistName: "Smashing Pumpkins" }],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!how",
      }),
      parsed: createParsed({
        command: "how",
        query: undefined,
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Commands: !sr artist - song; !sr artist *random; !sr artist *choice; !vip; !vip artist - song; !edit #2 artist - song; !remove reg|vip|all; !position. VIP requests: !vip adds 1 VIP token and plays next. Browse the track list and request songs here: https://example.com/streamer",
      })
    );
  });

  it("includes arrangement modifier help when enabled", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          allowRequestPathModifiers: true,
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!how",
      }),
      parsed: createParsed({
        command: "how",
        query: undefined,
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining("*bass"),
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.not.stringContaining("*guitar"),
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.not.stringContaining("*lyrics"),
      })
    );
  });

  it("reports the caller's request positions", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue({
        ...createState(),
        items: [
          {
            id: "item-current",
            songId: "song-1",
            songTitle: "Cherub Rock",
            status: "current",
            requestKind: "regular",
            requestedByTwitchUserId: "viewer-1",
            requestedByLogin: "viewer_one",
            requestedByDisplayName: "Viewer One",
            position: 1,
          },
          {
            id: "item-next",
            songId: "song-2",
            songTitle: "The Pretender",
            status: "queued",
            requestKind: "vip",
            requestedByTwitchUserId: "viewer-1",
            requestedByLogin: "viewer_one",
            requestedByDisplayName: "Viewer One",
            position: 2,
          },
        ],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!position",
      }),
      parsed: createParsed({
        command: "position",
        query: undefined,
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "@viewer_one your requests are playing now: Cherub Rock and queued at #2.",
      })
    );
  });

  it("rejects songs when the matched charter is blacklisted", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue({
        ...createState({
          blacklistEnabled: true,
        }),
        blacklistCharters: [{ charterId: 101, charterName: "charter" }],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent(),
      parsed: createParsed(),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "@viewer_one I cannot add that song to the playlist.",
      })
    );
  });

  it("adds a random matched song from chat modifiers", async () => {
    const deps = createDeps({
      searchSongs: vi.fn().mockResolvedValue({
        results: [createSong({ title: "Holiday", artist: "Green Day" })],
        total: 1,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr Green Day *random",
      }),
      parsed: createParsed({
        command: "sr",
        query: "Green Day *random",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        requestKind: "regular",
        song: expect.objectContaining({
          title: "Holiday",
          artist: "Green Day",
        }),
      })
    );
  });

  it("adds a streamer choice request from chat modifiers", async () => {
    const deps = createDeps({
      searchSongs: vi.fn().mockResolvedValue({
        results: [createSong({ artist: "Extreme", title: "More Than Words" })],
        total: 1,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr Extreme *choice",
      }),
      parsed: createParsed({
        command: "sr",
        query: "Extreme *choice",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        song: expect.objectContaining({
          title: "Streamer choice",
          source: "choice",
          requestedQuery: "Extreme",
          warningCode: "streamer_choice",
        }),
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          'streamer choice request for "Extreme" has been added'
        ),
      })
    );
  });

  it("falls through to the first allowed search candidate when an earlier charter is blacklisted", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue({
        ...createState({
          blacklistEnabled: true,
        }),
        blacklistCharters: [{ charterId: 101, charterName: "charter" }],
      }),
      searchSongs: vi.fn().mockResolvedValue({
        results: [
          createSong({
            id: "song-blocked",
            authorId: 101,
            creator: "charter",
            sourceId: 11111,
          }),
          createSong({
            id: "song-allowed",
            authorId: 202,
            creator: "other-charter",
            sourceId: 22222,
          }),
        ],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock",
      }),
      parsed: createParsed({
        query: "cherub rock",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        song: expect.objectContaining({
          id: "song-allowed",
          cdlcId: 22222,
          title: "Cherub Rock",
          creator: "other-charter",
          candidateMatchesJson: expect.any(String),
        }),
      })
    );

    const addCall = vi.mocked(deps.addRequestToPlaylist).mock.calls[0]?.[1];
    const candidates = JSON.parse(
      addCall?.song.candidateMatchesJson ?? "[]"
    ) as Array<{ id: string; authorId?: number }>;
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "song-blocked",
      "song-allowed",
    ]);
    expect(candidates.map((candidate) => candidate.authorId)).toEqual([
      101, 202,
    ]);
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          'your song "The Smashing Pumpkins - Cherub Rock" has been added to the playlist.'
        ),
      })
    );
  });

  it("rejects search requests when every matched version is by a blacklisted charter", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue({
        ...createState({
          blacklistEnabled: true,
        }),
        blacklistCharters: [{ charterId: 101, charterName: "charter" }],
      }),
      searchSongs: vi.fn().mockResolvedValue({
        results: [
          createSong({
            id: "song-blocked-1",
            authorId: 101,
            sourceId: 11111,
          }),
          createSong({
            id: "song-blocked-2",
            authorId: 101,
            sourceId: 22222,
          }),
        ],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock",
      }),
      parsed: createParsed({
        query: "cherub rock",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "@viewer_one I cannot add that song to the playlist.",
      })
    );
  });

  it("rejects targeting another viewer when the chatter is not a moderator or broadcaster", async () => {
    const deps = createDeps();

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock @viewer_two",
      }),
      parsed: createParsed({
        command: "sr",
        query: "cherub rock",
        targetLogin: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Only the broadcaster or a moderator can request for someone else.",
      })
    );
  });

  it("allows moderators to override blacklist matches when requesting for another viewer", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          blacklistEnabled: true,
          blacklistCharters: [{ charterId: 101, charterName: "charter" }],
        })
      ),
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
      searchSongs: vi.fn().mockResolvedValue({
        results: [createSong({ authorId: 101, creator: "charter" })],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        chatterTwitchUserId: "mod-1",
        chatterLogin: "mod_one",
        chatterDisplayName: "Mod One",
        isModerator: true,
        rawMessage: "!sr cherub rock @viewer_two",
      }),
      parsed: createParsed({
        command: "sr",
        query: "cherub rock",
        targetLogin: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        requestedByTwitchUserId: "viewer-2",
        requestedByLogin: "viewer_two",
        requestedByDisplayName: "Viewer Two",
        song: expect.objectContaining({
          title: "Cherub Rock",
          creator: "charter",
        }),
      })
    );
  });

  it("adds an unmatched request to the playlist with a warning", async () => {
    const deps = createDeps({
      searchSongs: vi.fn().mockResolvedValue({ results: [] }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr smashing pumpkins zro",
      }),
      parsed: createParsed({
        query: "smashing pumpkins zro",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        song: expect.objectContaining({
          title: "smashing pumpkins zro",
          source: "unmatched",
          warningCode: "no_song_match",
          warningMessage:
            'No matching track found for "smashing pumpkins zro".',
        }),
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          'there was no matching track found for "smashing pumpkins zro", but I added it anyway. You can edit or search the song database here: https://example.com/streamer'
        ),
      })
    );
  });

  it("uses the channel slug in the unmatched request reply link", async () => {
    const deps = createDeps({
      getChannelByLogin: vi.fn().mockResolvedValue({
        id: "channel-1",
        ownerUserId: "owner-1",
        twitchChannelId: "broadcaster-1",
        slug: "streamer-name",
      }),
      searchSongs: vi.fn().mockResolvedValue({
        results: [],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        broadcasterLogin: "streamer_name",
        rawMessage: "!sr smashing pumpkins zro",
      }),
      parsed: createParsed({
        query: "smashing pumpkins zro",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining("https://example.com/streamer-name"),
      })
    );
  });

  it("adds a matched request with a warning when required paths are missing", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          requiredPathsJson: '["lead","bass"]',
          requiredPathsMatchMode: "all",
        })
      ),
      searchSongs: vi.fn().mockResolvedValue({
        results: [createSong({ parts: ["bass"] })],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock",
      }),
      parsed: createParsed({
        query: "cherub rock",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        song: expect.objectContaining({
          title: "Cherub Rock",
          warningCode: "missing_required_paths",
          warningMessage: "Missing required paths: Lead.",
        }),
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          "has been added to the playlist, but it is missing required paths: Lead."
        ),
      })
    );
  });

  it("filters requests to the requested arrangement when path modifiers are enabled", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          allowRequestPathModifiers: true,
        })
      ),
      searchSongs: vi.fn().mockResolvedValue({
        results: [
          createSong({
            id: "song-lead",
            parts: ["lead"],
            sourceId: 11111,
          }),
          createSong({
            id: "song-bass",
            parts: ["bass"],
            sourceId: 22222,
          }),
        ],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock *bass",
      }),
      parsed: createParsed({
        query: "cherub rock *bass",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        song: expect.objectContaining({
          id: "song-bass",
          cdlcId: 22222,
          requestedQuery: "cherub rock *bass",
        }),
      })
    );
  });

  it("updates an existing request when the requested part changes", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          allowRequestPathModifiers: true,
          requestPathModifierVipTokenCost: 1,
          items: [
            {
              id: "item-1",
              songId: "song-bass",
              songTitle: "Cherub Rock",
              status: "queued",
              requestKind: "regular",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
              requestedQuery: "cherub rock",
            },
          ],
        })
      ),
      searchSongs: vi.fn().mockResolvedValue({
        results: [
          createSong({
            id: "song-bass",
            parts: ["lead", "bass"],
            sourceId: 22222,
          }),
        ],
      }),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 2,
        autoSubscriberGranted: false,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip cherub rock *bass",
      }),
      parsed: createParsed({
        command: "vip",
        query: "cherub rock *bass",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.changeRequestKind).not.toHaveBeenCalled();
    expect(deps.editRequest).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        itemId: "item-1",
        requestKind: "vip",
        vipTokenCost: 2,
        song: expect.objectContaining({
          id: "song-bass",
          requestedQuery: "cherub rock *bass",
        }),
      })
    );
  });

  it("stores candidate matches when search returns multiple plausible songs", async () => {
    const deps = createDeps({
      searchSongs: vi.fn().mockResolvedValue({
        results: [
          createSong(),
          createSong({
            id: "song-2",
            creator: "second-charter",
            downloads: 123,
            sourceId: 23456,
          }),
        ],
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock",
      }),
      parsed: createParsed({
        query: "cherub rock",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        song: expect.objectContaining({
          title: "Cherub Rock",
          candidateMatchesJson: expect.any(String),
        }),
      })
    );

    const addCall = vi.mocked(deps.addRequestToPlaylist).mock.calls[0]?.[1];
    const candidates = JSON.parse(
      addCall?.song.candidateMatchesJson ?? "[]"
    ) as Array<{ id: string; authorId?: number }>;
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "song-1",
      "song-2",
    ]);
    expect(candidates.map((candidate) => candidate.authorId)).toEqual([
      101, 101,
    ]);
  });

  it("lets the broadcaster grant a VIP token from chat", async () => {
    const deps = createDeps({
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: '!addvip "@viewer_two"',
        isBroadcaster: true,
        chatterTwitchUserId: "broadcaster-1",
        chatterLogin: "streamer",
        chatterDisplayName: "Streamer",
      }),
      parsed: createParsed({
        command: "addvip",
        query: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_two",
      displayName: "Viewer Two",
      twitchUserId: "viewer-2",
      count: 1,
    });
  });

  it("lets the broadcaster grant a decimal VIP token amount from chat", async () => {
    const deps = createDeps({
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!addvip viewer_two 1.25",
        isBroadcaster: true,
        chatterTwitchUserId: "broadcaster-1",
        chatterLogin: "streamer",
        chatterDisplayName: "Streamer",
      }),
      parsed: createParsed({
        command: "addvip",
        query: "viewer_two",
        amount: 1.25,
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_two",
      displayName: "Viewer Two",
      twitchUserId: "viewer-2",
      count: 1.25,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "Granted 1.25 VIP tokens to viewer_two.",
      })
    );
  });

  it("lets allowed moderators grant a VIP token from chat", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          moderatorCanManageVipTokens: true,
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!addvip viewer_two",
        isModerator: true,
      }),
      parsed: createParsed({
        command: "addvip",
        query: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_two",
      })
    );
  });

  it("upgrades an existing regular request to VIP instead of adding a duplicate", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          items: [
            {
              id: "item-1",
              songId: "song-1",
              status: "queued",
              requestKind: "regular",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
          ],
        })
      ),
      getVipTokenBalance: vi.fn().mockResolvedValue({
        availableCount: 1,
        autoSubscriberGranted: false,
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!vip cherub rock",
      }),
      parsed: createParsed({
        command: "vip",
        query: "cherub rock",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.changeRequestKind).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      itemId: "item-1",
      requestKind: "vip",
      vipTokenCost: 1,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.consumeVipToken).toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          'your existing request "The Smashing Pumpkins - Cherub Rock" is now a VIP request'
        ),
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining("and will play next."),
      })
    );
  });

  it("downgrades an existing VIP request to regular and refunds the token", async () => {
    const deps = createDeps({
      getDashboardState: vi.fn().mockResolvedValue(
        createState({
          items: [
            {
              id: "item-1",
              songId: "song-1",
              status: "queued",
              requestKind: "vip",
              requestedByTwitchUserId: "viewer-1",
              requestedByLogin: "viewer_one",
              requestedByDisplayName: "Viewer One",
            },
          ],
        })
      ),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!sr cherub rock",
      }),
      parsed: createParsed({
        command: "sr",
        query: "cherub rock",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.changeRequestKind).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      itemId: "item-1",
      requestKind: "regular",
      vipTokenCost: 0,
    });
    expect(deps.addRequestToPlaylist).not.toHaveBeenCalled();
    expect(deps.grantVipToken).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        channelId: "channel-1",
        login: "viewer_one",
      })
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.stringContaining(
          'your existing VIP request "The Smashing Pumpkins - Cherub Rock" is now a regular request again.'
        ),
      })
    );
  });

  it("rejects moderators without VIP token management permission", async () => {
    const deps = createDeps();

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!addvip viewer_two",
        isModerator: true,
      }),
      parsed: createParsed({
        command: "addvip",
        query: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Rejected",
      status: 202,
    });
    expect(deps.grantVipToken).not.toHaveBeenCalled();
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Only the broadcaster or an allowed moderator can grant VIP tokens.",
      })
    );
  });

  it("ignores duplicate addvip messages by Twitch message id", async () => {
    const deps = createDeps({
      getRequestLogByMessageId: vi.fn().mockResolvedValue({
        id: "rlog-1",
      }),
    });

    const result = await processEventSubChatMessage({
      env,
      event: createEvent({
        rawMessage: "!addvip viewer_two",
      }),
      parsed: createParsed({
        command: "addvip",
        query: "viewer_two",
      }),
      deps,
    });

    expect(result).toEqual({
      body: "Duplicate",
      status: 202,
    });
    expect(deps.grantVipToken).not.toHaveBeenCalled();
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });
});
