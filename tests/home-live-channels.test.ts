import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("~/lib/twitch/api", async () => {
  const actual =
    await vi.importActual<typeof import("~/lib/twitch/api")>(
      "~/lib/twitch/api"
    );

  return {
    ...actual,
    getAppAccessToken: vi.fn(),
    getLiveStreams: vi.fn(),
  };
});

import { getDb } from "~/lib/db/client";
import { getHomeLiveChannels } from "~/lib/db/repositories";
import { getAppAccessToken, getLiveStreams } from "~/lib/twitch/api";

describe("getHomeLiveChannels", () => {
  const env = {} as AppEnv;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns community stats and played-today counts for live channels", async () => {
    const findChannels = vi.fn().mockResolvedValue([
      {
        id: "channel-1",
        slug: "alpha",
        displayName: "Alpha",
        login: "alpha",
        twitchChannelId: "tw-1",
      },
      {
        id: "channel-2",
        slug: "bravo",
        displayName: "Bravo",
        login: "bravo",
        twitchChannelId: "tw-2",
      },
    ]);
    const findPlaylists = vi.fn().mockResolvedValue([
      {
        id: "playlist-1",
        channelId: "channel-1",
      },
      {
        id: "playlist-2",
        channelId: "channel-2",
      },
    ]);
    const findPlaylistItems = vi.fn().mockResolvedValue([
      {
        playlistId: "playlist-1",
        status: "current",
        position: 1,
        songTitle: "Signal Bloom",
        songArtist: "The Example Band",
      },
      {
        playlistId: "playlist-1",
        status: "queued",
        position: 2,
        songTitle: "Night Drive",
        songArtist: "Future Echo",
      },
      {
        playlistId: "playlist-2",
        status: "queued",
        position: 1,
        songTitle: "Static Hearts",
        songArtist: "Silver Glow",
      },
    ]);
    const dbAll = vi
      .fn()
      .mockResolvedValueOnce([
        {
          requestsPlayedToday: 14,
          activeRequestersToday: 9,
          uniqueSongsToday: 11,
          activeChannelsToday: 4,
        },
      ])
      .mockResolvedValueOnce([
        {
          title: "Signal Bloom",
          artist: "The Example Band",
          playCount: 4,
          channelCount: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          artist: "The Example Band",
          playCount: 6,
          songCount: 3,
        },
      ])
      .mockResolvedValueOnce([
        {
          channelId: "channel-1",
          playedTodayCount: 5,
        },
        {
          channelId: "channel-2",
          playedTodayCount: 2,
        },
      ]);

    vi.mocked(getDb).mockReturnValue({
      all: dbAll,
      query: {
        channels: {
          findMany: findChannels,
        },
        playlists: {
          findMany: findPlaylists,
        },
        playlistItems: {
          findMany: findPlaylistItems,
        },
      },
    } as never);
    vi.mocked(getAppAccessToken).mockResolvedValue({
      access_token: "app-token",
    } as never);
    vi.mocked(getLiveStreams).mockResolvedValue([
      {
        user_id: "tw-1",
        title: "Alpha is live",
        thumbnail_url:
          "https://static-cdn.jtvnw.net/previews/live_user_alpha-{width}x{height}.jpg",
      },
      {
        user_id: "tw-2",
        title: "Bravo is live",
        thumbnail_url:
          "https://static-cdn.jtvnw.net/previews/live_user_bravo-{width}x{height}.jpg",
      },
    ] as never);

    await expect(getHomeLiveChannels(env)).resolves.toEqual({
      channels: [
        {
          id: "channel-1",
          slug: "alpha",
          displayName: "Alpha",
          login: "alpha",
          streamTitle: "Alpha is live",
          streamThumbnailUrl:
            "https://static-cdn.jtvnw.net/previews/live_user_alpha-640x360.jpg",
          playedTodayCount: 5,
          currentItem: {
            title: "Signal Bloom",
            artist: "The Example Band",
          },
          nextItem: {
            title: "Night Drive",
            artist: "Future Echo",
          },
        },
        {
          id: "channel-2",
          slug: "bravo",
          displayName: "Bravo",
          login: "bravo",
          streamTitle: "Bravo is live",
          streamThumbnailUrl:
            "https://static-cdn.jtvnw.net/previews/live_user_bravo-640x360.jpg",
          playedTodayCount: 2,
          currentItem: null,
          nextItem: {
            title: "Static Hearts",
            artist: "Silver Glow",
          },
        },
      ],
      community: {
        requestsPlayedToday: 14,
        activeRequestersToday: 9,
        uniqueSongsToday: 11,
        activeChannelsToday: 4,
        topSongsToday: [
          {
            title: "Signal Bloom",
            artist: "The Example Band",
            playCount: 4,
            channelCount: 2,
          },
        ],
        topArtistsToday: [
          {
            artist: "The Example Band",
            playCount: 6,
            songCount: 3,
          },
        ],
      },
    });
  });

  it("does not cap the live channel list to a small fixed homepage count", async () => {
    const channels = Array.from({ length: 55 }, (_, index) => ({
      id: `channel-${index + 1}`,
      slug: `streamer-${index + 1}`,
      displayName: `Streamer ${index + 1}`,
      login: `streamer_${index + 1}`,
      twitchChannelId: `tw-${index + 1}`,
    }));

    vi.mocked(getDb).mockReturnValue({
      all: vi
        .fn()
        .mockResolvedValueOnce([
          {
            requestsPlayedToday: 0,
            activeRequestersToday: 0,
            uniqueSongsToday: 0,
            activeChannelsToday: 0,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      query: {
        channels: {
          findMany: vi.fn().mockResolvedValue(channels),
        },
        playlists: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        playlistItems: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    } as never);
    vi.mocked(getAppAccessToken).mockResolvedValue({
      access_token: "app-token",
    } as never);
    vi.mocked(getLiveStreams).mockResolvedValue(
      channels.map((channel, index) => ({
        user_id: channel.twitchChannelId,
        title: `Live ${index + 1}`,
        thumbnail_url: `https://static-cdn.jtvnw.net/previews/live_user_${channel.login}-{width}x{height}.jpg`,
      })) as never
    );

    const result = await getHomeLiveChannels(env);

    expect(result.channels).toHaveLength(55);
    expect(result.channels[54]).toMatchObject({
      slug: "streamer-55",
      playedTodayCount: 0,
    });
  });
});
