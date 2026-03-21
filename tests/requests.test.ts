import { describe, expect, it } from "vitest";
import {
  buildHowMessage,
  getActiveRequestLimit,
  getRateLimitWindow,
  isRequesterAllowed,
  isSongAllowed,
  normalizeCommandPrefix,
} from "~/lib/request-policy";
import {
  normalizeChatEvent,
  parseChatCommand,
  parseSongRequest,
} from "~/lib/requests";

describe("parseSongRequest", () => {
  it("parses !sr commands", () => {
    expect(parseSongRequest("!sr cherub rock")).toEqual({
      command: "!sr",
      query: "cherub rock",
    });
  });

  it("ignores non-command messages", () => {
    expect(parseSongRequest("hello")).toBeNull();
  });
});

describe("parseChatCommand", () => {
  it("parses vip requests", () => {
    expect(parseChatCommand("!vip cherub rock")).toEqual({
      command: "vip",
      query: "cherub rock",
    });
  });

  it("parses addvip commands", () => {
    expect(parseChatCommand("!addvip viewer_one")).toEqual({
      command: "addvip",
      query: "viewer_one",
    });
  });
});

describe("normalizeChatEvent", () => {
  it("normalizes Twitch chat event payloads", () => {
    expect(
      normalizeChatEvent({
        broadcaster_user_id: "1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        chatter_user_id: "2",
        chatter_user_login: "viewer",
        chatter_user_name: "Viewer",
        message_id: "abc",
        message: { text: "!sr song" },
      })
    ).toMatchObject({
      broadcasterLogin: "streamer",
      chatterLogin: "viewer",
      rawMessage: "!sr song",
    });
  });
});

describe("request policy", () => {
  const baseSettings = {
    requestsEnabled: true,
    allowAnyoneToRequest: true,
    allowSubscribersToRequest: true,
    allowVipsToRequest: true,
    onlyOfficialDlc: false,
    allowedTuningsJson: "[]",
    requiredPathsJson: "[]",
    maxQueueSize: 250,
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
    commandPrefix: "!sr",
  } as const;

  it("normalizes the command prefix to the symbol-only prefix", () => {
    expect(normalizeCommandPrefix("!sr")).toBe("!");
    expect(normalizeCommandPrefix("!!requests")).toBe("!!");
  });

  it("includes vip help in the command list", () => {
    const message = buildHowMessage({
      commandPrefix: "!sr",
      appUrl: "https://example.com",
      blacklistArtists: [],
      blacklistCharters: [],
      blacklistSongs: [],
      setlistArtists: [],
    });

    expect(message).toContain("!vip artist, song");
    expect(message).toContain("!edit artist, song");
    expect(message).toContain("https://example.com/search");
  });

  it("rejects viewers when only subscribers or VIPs are allowed", () => {
    expect(
      isRequesterAllowed(
        {
          ...baseSettings,
          allowAnyoneToRequest: false,
        },
        {
          isBroadcaster: false,
          isModerator: false,
          isVip: false,
          isSubscriber: false,
        }
      )
    ).toEqual({
      allowed: false,
      reason: "Only subscribers or VIPs can request songs right now.",
    });
  });

  it("uses VIP-specific active request limits", () => {
    expect(
      getActiveRequestLimit(baseSettings, {
        isBroadcaster: false,
        isModerator: false,
        isVip: true,
        isSubscriber: false,
      })
    ).toBe(3);
  });

  it("uses VIP rate limit windows when enabled", () => {
    expect(
      getRateLimitWindow(
        {
          ...baseSettings,
          limitVipRequestsEnabled: true,
          vipRequestsPerPeriod: 2,
          vipRequestPeriodSeconds: 120,
        },
        {
          isBroadcaster: false,
          isModerator: false,
          isVip: true,
          isSubscriber: false,
        }
      )
    ).toEqual({
      limit: 2,
      periodSeconds: 120,
    });
  });

  it("blocks artists and songs by exact IDs", () => {
    expect(
      isSongAllowed({
        song: {
          id: "song-1",
          sourceId: 12345,
          artistId: 777,
          title: "Heroes",
          artist: "David Bowie",
          source: "library",
        },
        settings: {
          ...baseSettings,
          blacklistEnabled: true,
        },
        blacklistArtists: [{ artistId: 777, artistName: "David Bowie" }],
        blacklistCharters: [],
        blacklistSongs: [],
        setlistArtists: [],
        requester: {
          isBroadcaster: false,
          isModerator: false,
          isVip: false,
          isSubscriber: false,
        },
      })
    ).toEqual({
      allowed: false,
      reason: "That song is blocked in this channel.",
    });

    expect(
      isSongAllowed({
        song: {
          id: "song-2",
          sourceId: 67890,
          artistId: 888,
          title: "Heroes",
          artist: "Other Artist",
          source: "library",
        },
        settings: {
          ...baseSettings,
          blacklistEnabled: true,
        },
        blacklistArtists: [],
        blacklistCharters: [],
        blacklistSongs: [
          { songId: 67890, songTitle: "Heroes", artistName: "Other Artist" },
        ],
        setlistArtists: [],
        requester: {
          isBroadcaster: false,
          isModerator: false,
          isVip: false,
          isSubscriber: false,
        },
      })
    ).toEqual({
      allowed: false,
      reason: "That song is blocked in this channel.",
    });
  });

  it("blocks charter matches by exact charter ID", () => {
    expect(
      isSongAllowed({
        song: {
          id: "song-3",
          sourceId: 24680,
          artistId: 999,
          authorId: 555,
          title: "Song",
          artist: "Artist",
          creator: "Charter Name",
          source: "library",
        },
        settings: {
          ...baseSettings,
          blacklistEnabled: true,
        },
        blacklistArtists: [],
        blacklistCharters: [{ charterId: 555, charterName: "Charter Name" }],
        blacklistSongs: [],
        setlistArtists: [],
        requester: {
          isBroadcaster: false,
          isModerator: false,
          isVip: false,
          isSubscriber: false,
        },
      })
    ).toEqual({
      allowed: false,
      reason: "Charter Name is blacklisted in this channel.",
    });
  });
});
