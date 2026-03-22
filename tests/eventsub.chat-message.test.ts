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
      commandPrefix: "!",
      moderatorCanManageVipTokens: false,
      duplicateWindowSeconds: 900,
      ...overrides,
    },
    blacklistArtists: [],
    blacklistCharters: [],
    blacklistSongs: [],
    setlistArtists: [],
    logs: [],
    items: [],
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
    }),
    getRequestLogByMessageId: vi.fn().mockResolvedValue(null),
    getDashboardState: vi.fn().mockResolvedValue(createState()),
    countActiveRequestsForUser: vi.fn().mockResolvedValue(0),
    countAcceptedRequestsInPeriod: vi.fn().mockResolvedValue(0),
    isBlockedUser: vi.fn().mockResolvedValue(false),
    getVipTokenBalance: vi.fn().mockResolvedValue(null),
    grantVipToken: vi.fn().mockResolvedValue(undefined),
    consumeVipToken: vi.fn().mockResolvedValue(undefined),
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

  it("rejects blocked users before attempting playlist mutation", async () => {
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
          "You do not have enough VIP tokens for this channel. You have 0.5.",
      })
    );
  });

  it("removes only the caller's requested items from the current channel playlist", async () => {
    const deps = createDeps();
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

  it("edits another viewer's request when invoked by a moderator", async () => {
    const deps = createDeps({
      resolveTwitchUserByLogin: vi.fn().mockResolvedValue({
        twitchUserId: "viewer-2",
        login: "viewer_two",
        displayName: "Viewer Two",
      }),
      countActiveRequestsForUser: vi.fn().mockResolvedValue(1),
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
    expect(deps.removeRequestsFromPlaylist).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      requesterTwitchUserId: "viewer-2",
      requesterLogin: "viewer_two",
      actorUserId: null,
      kind: "all",
    });
    expect(deps.addRequestToPlaylist).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        requestedByTwitchUserId: "viewer-2",
        requestedByLogin: "viewer_two",
        requestedByDisplayName: "Viewer Two",
      })
    );
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
          "Commands: !sr artist, song; !sr song; !vip artist, song; !edit artist, song; !remove reg; !remove vip; !remove all. !blacklist: Artists: Chevelle. Charters: Frif. Songs: The Red. !setlist: Artists: Smashing Pumpkins. Search for songs to request: https://example.com/search",
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
          'no matching track was found for "smashing pumpkins zro"'
        ),
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
    });
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
