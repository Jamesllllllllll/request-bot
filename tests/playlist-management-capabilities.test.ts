import { describe, expect, test } from "vitest";
import type { AppEnv } from "~/lib/env";
import {
  canManageChannelBlacklist,
  canManageChannelBlockedChatters,
  canManageChannelRequests,
  canManageChannelSetlist,
  canManageChannelVipTokens,
  canViewChannelVipTokens,
  getPlaylistManagementPageData,
  type PlaylistManagementState,
} from "~/lib/server/playlist-management";
import { settingsInputSchema } from "~/lib/validation";

function createState(
  overrides: Partial<PlaylistManagementState> = {}
): PlaylistManagementState {
  return {
    channel: {
      id: "chn_test",
      slug: "tester",
      displayName: "Tester",
      twitchChannelId: "tw_test",
      isLive: true,
    },
    settings: {
      moderatorCanManageRequests: false,
      moderatorCanManageBlacklist: false,
      moderatorCanManageSetlist: false,
      moderatorCanManageBlockedChatters: false,
      moderatorCanViewVipTokens: false,
      moderatorCanManageVipTokens: false,
    },
    playlist: null,
    items: [],
    playedSongs: [],
    vipTokens: [],
    blacklistArtists: [],
    blacklistCharters: [],
    blacklistSongs: [],
    setlistArtists: [],
    accessRole: "moderator",
    actorUserId: "usr_test",
    ...overrides,
  } as PlaylistManagementState;
}

describe("playlist management capabilities", () => {
  test("owner always has all capabilities", () => {
    const state = createState({
      accessRole: "owner",
      settings: undefined,
    });

    expect(canManageChannelRequests(state)).toBe(true);
    expect(canManageChannelBlacklist(state)).toBe(true);
    expect(canManageChannelSetlist(state)).toBe(true);
    expect(canManageChannelBlockedChatters(state)).toBe(true);
    expect(canViewChannelVipTokens(state)).toBe(true);
    expect(canManageChannelVipTokens(state)).toBe(true);
  });

  test("moderator capabilities are evaluated independently", () => {
    const state = createState({
      settings: {
        moderatorCanManageRequests: false,
        moderatorCanManageBlacklist: true,
        moderatorCanManageSetlist: false,
        moderatorCanManageBlockedChatters: true,
        moderatorCanViewVipTokens: true,
        moderatorCanManageVipTokens: false,
      } as PlaylistManagementState["settings"],
    });

    expect(canManageChannelRequests(state)).toBe(false);
    expect(canManageChannelBlacklist(state)).toBe(true);
    expect(canManageChannelSetlist(state)).toBe(false);
    expect(canManageChannelBlockedChatters(state)).toBe(true);
    expect(canViewChannelVipTokens(state)).toBe(true);
    expect(canManageChannelVipTokens(state)).toBe(false);
  });

  test("protected management page data keeps rich item fields for owners", async () => {
    const state = createState({
      accessRole: "owner",
      settings: {
        botChannelEnabled: true,
        requestsEnabled: true,
        blacklistEnabled: true,
        setlistEnabled: true,
        letSetlistBypassBlacklist: false,
        subscribersMustFollowSetlist: false,
        allowRequestPathModifiers: true,
        allowedRequestPathsJson: '["lead"]',
        requestPathModifierVipTokenCost: 2,
        requestPathModifierUsesVipPriority: true,
        requiredPathsJson: '["lead"]',
        vipTokenDurationThresholdsJson: "[]",
        requiredPathsMatchMode: "any",
        showPlaylistPositions: true,
        showPickOrderBadges: true,
      } as PlaylistManagementState["settings"],
      items: [
        {
          id: "pli_123",
          songTitle: "Neon Noir",
          songArtist: "VV",
          requestedByLogin: "viewer_one",
          requesterLastChatAt: 456,
          songDurationText: "3:49",
          songUrl: "https://example.com/song",
          songDownloads: 4284,
          warningMessage: "Needs lead path",
          candidateMatchesJson: JSON.stringify([
            { id: "alt_1", title: "Neon Noir" },
          ]),
          createdAt: 123,
          position: 1,
          status: "queued",
        },
      ],
      blocks: [
        {
          twitchUserId: "viewer-1",
          login: "viewer_one",
        },
      ],
      vipTokens: [
        {
          login: "viewer_one",
          availableCount: 3,
        },
      ],
    });

    const result = await getPlaylistManagementPageData({} as AppEnv, state);

    expect(result.accessRole).toBe("owner");
    expect(result.settings).toMatchObject({
      canManageRequests: true,
      canManageBlacklist: true,
      canManageSetlist: true,
      canManageBlockedChatters: true,
      canViewVipTokens: true,
      canManageVipTokens: true,
      allowedRequestPaths: ["lead"],
    });
    expect(result.items[0]).toMatchObject({
      id: "pli_123",
      requesterLastChatAt: 456,
      songDurationText: "3:49",
      songUrl: "https://example.com/song",
      warningMessage: "Needs lead path",
      candidateMatchesJson: expect.stringContaining("alt_1"),
    });
    expect(result.blocks).toEqual(state.blocks);
    expect(result.vipTokens).toEqual(state.vipTokens);
  });

  test("protected management page data hides gated lists for moderators without permission", async () => {
    const state = createState({
      settings: {
        moderatorCanManageRequests: true,
        moderatorCanManageBlacklist: false,
        moderatorCanManageSetlist: false,
        moderatorCanManageBlockedChatters: false,
        moderatorCanViewVipTokens: false,
        moderatorCanManageVipTokens: false,
      } as PlaylistManagementState["settings"],
      blocks: [
        {
          twitchUserId: "viewer-1",
        },
      ],
      vipTokens: [
        {
          login: "viewer_one",
          availableCount: 2,
        },
      ],
    });

    const result = await getPlaylistManagementPageData({} as AppEnv, state);

    expect(result.settings).toMatchObject({
      canManageRequests: true,
      canManageBlockedChatters: false,
      canViewVipTokens: false,
      canManageVipTokens: false,
    });
    expect(result.blocks).toEqual([]);
    expect(result.vipTokens).toEqual([]);
  });
});

describe("settings capability validation", () => {
  test("rejects VIP token manage without VIP token view", () => {
    const result = settingsInputSchema.safeParse({
      botChannelEnabled: false,
      moderatorCanManageRequests: false,
      moderatorCanManageBlacklist: false,
      moderatorCanManageSetlist: false,
      moderatorCanManageBlockedChatters: false,
      moderatorCanViewVipTokens: false,
      moderatorCanManageVipTokens: true,
      moderatorCanManageTags: false,
      requestsEnabled: true,
      allowAnyoneToRequest: true,
      allowSubscribersToRequest: true,
      allowVipsToRequest: true,
      onlyOfficialDlc: false,
      allowedTunings: [],
      requiredPaths: [],
      requiredPathsMatchMode: "any",
      maxQueueSize: 250,
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
      autoGrantVipTokensForSharedSubRenewalMessage: false,
      autoGrantVipTokensToSubGifters: false,
      autoGrantVipTokensToGiftRecipients: false,
      autoGrantVipTokensForCheers: false,
      autoGrantVipTokensForRaiders: false,
      autoGrantVipTokensForStreamElementsTips: false,
      allowRequestPathModifiers: false,
      cheerBitsPerVipToken: 200,
      cheerMinimumTokenPercent: 25,
      raidMinimumViewerCount: 1,
      streamElementsTipAmountPerVipToken: 5,
      duplicateWindowSeconds: 900,
      showPlaylistPositions: false,
      showPickOrderBadges: false,
      commandPrefix: "!sr",
    });

    expect(result.success).toBe(false);
  });
});
