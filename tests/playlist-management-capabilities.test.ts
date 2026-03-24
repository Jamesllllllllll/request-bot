import { describe, expect, test } from "vitest";
import {
  canManageChannelBlacklist,
  canManageChannelBlockedChatters,
  canManageChannelRequests,
  canManageChannelSetlist,
  canManageChannelVipTokens,
  canViewChannelVipTokens,
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
      autoGrantVipTokensToSubGifters: false,
      autoGrantVipTokensToGiftRecipients: false,
      autoGrantVipTokensForCheers: false,
      cheerBitsPerVipToken: 200,
      cheerMinimumTokenPercent: 25,
      duplicateWindowSeconds: 900,
      commandPrefix: "!sr",
    });

    expect(result.success).toBe(false);
  });
});
