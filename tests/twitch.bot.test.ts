import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";

vi.mock("~/lib/db/repositories", () => ({
  deleteEventSubSubscriptionRecord: vi.fn(),
  getActiveBroadcasterAuthorizationForChannel: vi.fn(),
  getBotAuthorization: vi.fn(),
  getChannelById: vi.fn(),
  getChannelSettingsByChannelId: vi.fn(),
  getEventSubSubscription: vi.fn(),
  parseAuthorizationScopes: vi.fn(),
  setBotEnabled: vi.fn(),
  setChannelLiveState: vi.fn(),
  setTwitchChannelPointRewardId: vi.fn(),
  upsertEventSubSubscription: vi.fn(),
}));

vi.mock("~/lib/twitch/api", () => ({
  createCustomReward: vi.fn(),
  createEventSubSubscription: vi.fn(),
  deleteEventSubSubscription: vi.fn(),
  getAppAccessToken: vi.fn(),
  getLiveStream: vi.fn(),
  listEventSubSubscriptions: vi.fn(),
  updateCustomReward: vi.fn(),
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

import {
  deleteEventSubSubscriptionRecord,
  getActiveBroadcasterAuthorizationForChannel,
  getBotAuthorization,
  getChannelById,
  getChannelSettingsByChannelId,
  getEventSubSubscription,
  parseAuthorizationScopes,
  setBotEnabled,
  setChannelLiveState,
  setTwitchChannelPointRewardId,
  upsertEventSubSubscription,
} from "~/lib/db/repositories";
import {
  createCustomReward,
  createEventSubSubscription,
  deleteEventSubSubscription,
  getAppAccessToken,
  getLiveStream,
  listEventSubSubscriptions,
  TwitchApiError,
  updateCustomReward,
} from "~/lib/twitch/api";
import { reconcileChannelBotState } from "~/lib/twitch/bot";

describe("twitch bot reconcile", () => {
  const env = {
    APP_URL: "https://example.com",
    TWITCH_CLIENT_ID: "client-id",
    TWITCH_EVENTSUB_SECRET: "eventsub-secret",
  } as AppEnv;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getChannelById).mockResolvedValue({
      id: "channel-1",
      twitchChannelId: "broadcaster-1",
      isLive: true,
    } as never);
    vi.mocked(getChannelSettingsByChannelId).mockResolvedValue({
      botChannelEnabled: true,
      adminForceBotWhileOffline: false,
      autoGrantVipTokenToSubscribers: false,
      autoGrantVipTokensForSharedSubRenewalMessage: false,
      autoGrantVipTokensToSubGifters: false,
      autoGrantVipTokensToGiftRecipients: false,
      autoGrantVipTokensForCheers: false,
      autoGrantVipTokensForChannelPointRewards: true,
      autoGrantVipTokensForRaiders: false,
      channelPointRewardCost: 1000,
      twitchChannelPointRewardId: "",
    } as never);
    vi.mocked(getActiveBroadcasterAuthorizationForChannel).mockResolvedValue({
      accessTokenEncrypted: "broadcaster-token",
      scopes: JSON.stringify([
        "channel:bot",
        "channel:read:subscriptions",
        "bits:read",
        "channel:manage:redemptions",
      ]),
    } as never);
    vi.mocked(getBotAuthorization).mockResolvedValue({
      twitchUserId: "bot-1",
    } as never);
    vi.mocked(parseAuthorizationScopes).mockImplementation((scopesJson) =>
      JSON.parse(scopesJson)
    );
    vi.mocked(getAppAccessToken).mockResolvedValue({
      access_token: "app-token",
    } as never);
    vi.mocked(getEventSubSubscription).mockResolvedValue(undefined);
    vi.mocked(createEventSubSubscription).mockResolvedValue({
      data: [
        {
          id: "sub-1",
          status: "enabled",
          type: "stream.online",
          version: "1",
          condition: {},
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://example.com/api/eventsub",
          },
          cost: 0,
        },
      ],
      total: 1,
      total_cost: 0,
      max_total_cost: 10_000,
    } as never);
    vi.mocked(listEventSubSubscriptions).mockResolvedValue([]);
    vi.mocked(deleteEventSubSubscription).mockResolvedValue(undefined);
    vi.mocked(updateCustomReward).mockResolvedValue(null);
    vi.mocked(getLiveStream).mockResolvedValue({
      id: "live-1",
      type: "live",
    } as never);
    vi.mocked(upsertEventSubSubscription).mockResolvedValue(undefined);
    vi.mocked(deleteEventSubSubscriptionRecord).mockResolvedValue(undefined);
    vi.mocked(setTwitchChannelPointRewardId).mockResolvedValue(undefined);
    vi.mocked(setChannelLiveState).mockResolvedValue(undefined);
    vi.mocked(setBotEnabled).mockResolvedValue(undefined);
  });

  it("keeps the bot active when channel point rewards are unavailable", async () => {
    vi.mocked(createCustomReward).mockRejectedValue(
      new TwitchApiError(
        "Failed to create custom reward: 403",
        403,
        "The broadcaster is not a partner or affiliate."
      )
    );

    const result = await reconcileChannelBotState(env, "channel-1", {
      refreshLiveState: false,
    });

    expect(result).toEqual({
      ok: true,
      state: "active",
      warnings: ["channel_point_reward_affiliate_or_partner_required"],
    });
    expect(setBotEnabled).toHaveBeenLastCalledWith(
      env,
      "channel-1",
      true,
      "active"
    );
    expect(
      vi
        .mocked(setBotEnabled)
        .mock.calls.some(
          ([, , enabled, state]) =>
            enabled === false && state === "subscription_error"
        )
    ).toBe(false);
  });
});
