import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/backend", () => ({
  callBackend: vi.fn(),
}));

vi.mock("~/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("~/lib/db/repositories", () => ({
  consumeVipToken: vi.fn(),
  createAuditLog: vi.fn(),
  getCatalogSongsByIds: vi.fn().mockResolvedValue([]),
  getChannelBlacklistByChannelId: vi.fn().mockResolvedValue({
    blacklistArtists: [],
    blacklistCharters: [],
    blacklistSongs: [],
    blacklistSongGroups: [],
  }),
  getChannelPreferredChartersByChannelId: vi.fn().mockResolvedValue([]),
  getChannelSettingsByChannelId: vi.fn(),
  getDashboardChannelAccess: vi.fn(),
  getDashboardState: vi.fn(),
  getPlaylistByChannelId: vi.fn(),
  getVipTokenBalance: vi.fn(),
  grantVipToken: vi.fn(),
  updateChannelBotEnabled: vi.fn(),
}));

import { callBackend } from "~/lib/backend";
import { getDb } from "~/lib/db/client";
import {
  consumeVipToken,
  getVipTokenBalance,
  grantVipToken,
} from "~/lib/db/repositories";
import {
  type PlaylistManagementState,
  performPlaylistMutation,
} from "~/lib/server/playlist-management";

function createState(
  overrides: Partial<PlaylistManagementState> = {}
): PlaylistManagementState {
  return {
    channel: {
      id: "channel-1",
      slug: "streamer",
      displayName: "Streamer",
      twitchChannelId: "owner-1",
      isLive: true,
    },
    settings: {
      vipTokenDurationThresholdsJson: JSON.stringify([
        {
          minimumDurationMinutes: 7,
          tokenCost: 1,
        },
      ]),
      requestPathModifierVipTokenCost: 0,
      requestPathModifierUsesVipPriority: true,
      moderatorCanManageRequests: true,
      moderatorCanManageVipTokens: true,
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
    actorUserId: "actor-1",
    ...overrides,
  } satisfies PlaylistManagementState;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("playlist management VIP token handling", () => {
  const env = {} as AppEnv;
  const findPlaylistItem = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    findPlaylistItem.mockReset();
    vi.mocked(getDb).mockReturnValue({
      query: {
        playlistItems: {
          findFirst: findPlaylistItem,
        },
      },
    } as never);
    vi.mocked(callBackend).mockResolvedValue(jsonResponse({ ok: true }));
    vi.mocked(getVipTokenBalance).mockResolvedValue({
      login: "viewer_one",
      availableCount: 5,
    } as never);
    vi.mocked(consumeVipToken).mockResolvedValue(true as never);
    vi.mocked(grantVipToken).mockResolvedValue({} as never);
  });

  it("does not charge the owner when they add a request for themselves", async () => {
    const response = await performPlaylistMutation(env, createState(), {
      action: "manualAdd",
      songId: "song-1",
      requesterLogin: "streamer",
      requesterTwitchUserId: "owner-1",
      requesterDisplayName: "Streamer",
      title: "Long Song",
      durationText: "7:30",
      source: "library",
    });

    expect(response.status).toBe(200);
    expect(getVipTokenBalance).not.toHaveBeenCalled();
    expect(consumeVipToken).not.toHaveBeenCalled();

    const backendPayload = JSON.parse(
      String(vi.mocked(callBackend).mock.calls[0]?.[2]?.body)
    ) as { vipTokenCost?: number };
    expect(backendPayload.vipTokenCost).toBe(0);
  });

  it("charges a moderator when they add a long song for themselves", async () => {
    const response = await performPlaylistMutation(
      env,
      createState({
        accessRole: "moderator",
      }),
      {
        action: "manualAdd",
        songId: "song-1",
        requesterLogin: "mod_user",
        requesterTwitchUserId: "mod-1",
        requesterDisplayName: "Mod User",
        title: "Long Song",
        durationText: "7:30",
        source: "library",
      }
    );

    expect(response.status).toBe(200);
    expect(getVipTokenBalance).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "mod_user",
    });
    expect(consumeVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "mod_user",
      displayName: "Mod User",
      twitchUserId: "mod-1",
      count: 1,
    });

    const backendPayload = JSON.parse(
      String(vi.mocked(callBackend).mock.calls[0]?.[2]?.body)
    ) as { vipTokenCost?: number };
    expect(backendPayload.vipTokenCost).toBe(1);
  });

  it("refunds reserved tokens when adding for another user fails", async () => {
    vi.mocked(callBackend).mockResolvedValue(
      jsonResponse({ error: "backend failed" }, 500)
    );

    const response = await performPlaylistMutation(env, createState(), {
      action: "manualAdd",
      songId: "song-1",
      requesterLogin: "viewer_one",
      requesterTwitchUserId: "viewer-1",
      requesterDisplayName: "Viewer One",
      title: "Long Song",
      durationText: "7:30",
      source: "library",
    });

    expect(response.status).toBe(500);
    expect(consumeVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_one",
      displayName: "Viewer One",
      twitchUserId: "viewer-1",
      count: 1,
    });
    expect(grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_one",
      displayName: "Viewer One",
      twitchUserId: "viewer-1",
      count: 1,
    });
  });

  it("refunds stored VIP tokens to the original requester when a request is deleted", async () => {
    findPlaylistItem.mockResolvedValue({
      id: "item-1",
      requestedByLogin: "viewer_one",
      requestedByDisplayName: "Viewer One",
      requestedByTwitchUserId: "viewer-1",
      requestKind: "regular",
      vipTokenCost: 2,
    });

    const response = await performPlaylistMutation(env, createState(), {
      action: "deleteItem",
      itemId: "item-1",
    });

    expect(response.status).toBe(200);
    expect(grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_one",
      displayName: "Viewer One",
      twitchUserId: "viewer-1",
      count: 2,
    });
  });
});
