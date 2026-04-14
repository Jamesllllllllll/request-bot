import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/backend", () => ({
  callBackend: vi.fn(),
}));

import { callBackend } from "~/lib/backend";
import {
  type PlaylistManagementState,
  performPlaylistMutation,
} from "~/lib/server/playlist-management";

describe("playlist management live gating", () => {
  const env = {} as AppEnv;

  const state: PlaylistManagementState = {
    channel: {
      id: "channel-1",
      slug: "streamer",
      displayName: "Streamer",
      twitchChannelId: "twitch-channel-1",
      isLive: false,
    },
    settings: {
      moderatorCanManageRequests: true,
      moderatorCanManageBlacklist: false,
      moderatorCanManageSetlist: false,
      moderatorCanManageBlockedChatters: false,
      moderatorCanViewVipTokens: false,
      moderatorCanManageVipTokens: false,
    } as PlaylistManagementState["settings"],
    playlist: null,
    items: [],
    playedSongs: [],
    blocks: [],
    vipTokens: [],
    blacklistArtists: [],
    blacklistCharters: [],
    preferredCharters: [],
    blacklistSongs: [],
    blacklistSongGroups: [],
    setlistArtists: [],
    accessRole: "owner",
    actorUserId: "user-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects manual adds while the channel is offline", async () => {
    const response = await performPlaylistMutation(env, state, {
      action: "manualAdd",
      songId: "song-1",
      requesterLogin: "viewer_one",
      title: "Signal Bloom",
      source: "library",
    });

    await expect(response.json()).resolves.toEqual({
      error: "You can add requests when the stream goes live.",
    });
    expect(response.status).toBe(409);
    expect(callBackend).not.toHaveBeenCalled();
  });

  it("allows manual adds while offline testing is enabled", async () => {
    vi.mocked(callBackend).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, message: "Added request." }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    );

    const response = await performPlaylistMutation(
      env,
      {
        ...state,
        channel: {
          ...state.channel,
          botReadyState: "active_offline_testing",
        },
      },
      {
        action: "manualAdd",
        songId: "song-1",
        requesterLogin: "viewer_one",
        title: "Signal Bloom",
        source: "library",
      }
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      message: "Added request.",
    });
    expect(response.status).toBe(200);
    expect(callBackend).toHaveBeenCalled();
  });
});
