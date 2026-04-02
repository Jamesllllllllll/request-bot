import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";
import type { EventSubSupportDependencies } from "~/lib/eventsub/support-events";
import {
  processEventSubChannelCheer,
  processEventSubChannelPointRewardRedemption,
  processEventSubChannelRaid,
  processEventSubChannelSubscribe,
  processEventSubSubscriptionGift,
  processEventSubSubscriptionMessage,
} from "~/lib/eventsub/support-events";

function createDeps(
  overrides: Partial<EventSubSupportDependencies> = {}
): EventSubSupportDependencies {
  return {
    getChannelByTwitchChannelId: vi.fn().mockResolvedValue({
      id: "channel-1",
      ownerUserId: "owner-1",
      twitchChannelId: "broadcaster-1",
    }),
    getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
      defaultLocale: "en",
      autoGrantVipTokenToSubscribers: true,
      autoGrantVipTokensForSharedSubRenewalMessage: true,
      autoGrantVipTokensToSubGifters: true,
      autoGrantVipTokensToGiftRecipients: true,
      autoGrantVipTokensForCheers: true,
      autoGrantVipTokensForChannelPointRewards: true,
      autoGrantVipTokensForRaiders: true,
      cheerBitsPerVipToken: 200,
      channelPointRewardCost: 1000,
      cheerMinimumTokenPercent: 25,
      raidMinimumViewerCount: 1,
      twitchChannelPointRewardId: "reward-1",
    }),
    claimEventSubDelivery: vi.fn().mockResolvedValue(true),
    grantVipToken: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    sendChatReply: vi.fn().mockResolvedValue(undefined),
    updateChannelPointRewardRedemptionStatus: vi
      .fn()
      .mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("support EventSub automation", () => {
  const env = {
    APP_URL: "https://example.com",
  } as AppEnv;

  it("grants one VIP token per gifted sub to the gifter", async () => {
    const deps = createDeps();

    const result = await processEventSubSubscriptionGift({
      env,
      deps,
      messageId: "msg-1",
      event: {
        user_id: "gifter-1",
        user_login: "gifter_one",
        user_name: "Gifter One",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        total: 5,
        tier: "1000",
        cumulative_total: 10,
        is_anonymous: false,
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "gifter_one",
      displayName: "Gifter One",
      twitchUserId: "gifter-1",
      count: 5,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "Added 5 VIP tokens to @gifter_one for gifting 5 subs.",
      })
    );
  });

  it("grants one VIP token to gifted sub recipients", async () => {
    const deps = createDeps();

    const result = await processEventSubChannelSubscribe({
      env,
      deps,
      messageId: "msg-2",
      event: {
        user_id: "viewer-1",
        user_login: "viewer_one",
        user_name: "Viewer One",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        tier: "1000",
        is_gift: true,
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_one",
      displayName: "Viewer One",
      twitchUserId: "viewer-1",
      count: 1,
    });
  });

  it("grants one VIP token for a new paid sub", async () => {
    const deps = createDeps();

    const result = await processEventSubChannelSubscribe({
      env,
      deps,
      messageId: "msg-2b",
      event: {
        user_id: "viewer-2",
        user_login: "viewer_two",
        user_name: "Viewer Two",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        tier: "1000",
        is_gift: false,
      },
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
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "Added 1 VIP token to @viewer_two for a new sub.",
      })
    );
  });

  it("grants one VIP token for a shared sub renewal message", async () => {
    const deps = createDeps();

    const result = await processEventSubSubscriptionMessage({
      env,
      deps,
      messageId: "msg-2c",
      event: {
        user_id: "viewer-3",
        user_login: "viewer_three",
        user_name: "Viewer Three",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        tier: "1000",
        cumulative_months: 6,
        streak_months: 6,
        duration_months: 6,
        message: {
          text: "Love the stream!",
        },
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_three",
      displayName: "Viewer Three",
      twitchUserId: "viewer-3",
      count: 1,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Added 1 VIP token to @viewer_three for sharing a sub renewal message.",
      })
    );
  });

  it("grants one VIP token to the streamer who raids the channel", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        defaultLocale: "en",
        autoGrantVipTokenToSubscribers: true,
        autoGrantVipTokensForSharedSubRenewalMessage: true,
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        autoGrantVipTokensForChannelPointRewards: true,
        autoGrantVipTokensForRaiders: true,
        cheerBitsPerVipToken: 200,
        channelPointRewardCost: 1000,
        cheerMinimumTokenPercent: 25,
        raidMinimumViewerCount: 10,
        twitchChannelPointRewardId: "reward-1",
      }),
    });

    const result = await processEventSubChannelRaid({
      env,
      deps,
      messageId: "msg-raid-1",
      event: {
        from_broadcaster_user_id: "raider-1",
        from_broadcaster_user_login: "raider_one",
        from_broadcaster_user_name: "Raider One",
        to_broadcaster_user_id: "broadcaster-1",
        to_broadcaster_user_login: "streamer",
        to_broadcaster_user_name: "Streamer",
        viewers: 27,
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "raider_one",
      displayName: "Raider One",
      twitchUserId: "raider-1",
      count: 1,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Added 1 VIP token to @raider_one for raiding with 27 viewers.",
      })
    );
  });

  it("ignores raids below the minimum configured size", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        defaultLocale: "en",
        autoGrantVipTokenToSubscribers: true,
        autoGrantVipTokensForSharedSubRenewalMessage: true,
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        autoGrantVipTokensForChannelPointRewards: true,
        autoGrantVipTokensForRaiders: true,
        cheerBitsPerVipToken: 200,
        channelPointRewardCost: 1000,
        cheerMinimumTokenPercent: 25,
        raidMinimumViewerCount: 10,
        twitchChannelPointRewardId: "reward-1",
      }),
    });

    const result = await processEventSubChannelRaid({
      env,
      deps,
      messageId: "msg-raid-2",
      event: {
        from_broadcaster_user_id: "raider-1",
        from_broadcaster_user_login: "raider_one",
        from_broadcaster_user_name: "Raider One",
        to_broadcaster_user_id: "broadcaster-1",
        to_broadcaster_user_login: "streamer",
        to_broadcaster_user_name: "Streamer",
        viewers: 5,
      },
    });

    expect(result).toEqual({
      body: "Ignored",
      status: 202,
    });
    expect(deps.grantVipToken).not.toHaveBeenCalled();
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });

  it("ignores cheers below the configured minimum partial threshold", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        defaultLocale: "en",
        autoGrantVipTokenToSubscribers: true,
        autoGrantVipTokensForSharedSubRenewalMessage: true,
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        autoGrantVipTokensForChannelPointRewards: true,
        autoGrantVipTokensForRaiders: true,
        cheerBitsPerVipToken: 200,
        channelPointRewardCost: 1000,
        cheerMinimumTokenPercent: 25,
        raidMinimumViewerCount: 1,
        twitchChannelPointRewardId: "reward-1",
      }),
    });

    const result = await processEventSubChannelCheer({
      env,
      deps,
      messageId: "msg-3",
      event: {
        is_anonymous: false,
        user_id: "viewer-1",
        user_login: "viewer_one",
        user_name: "Viewer One",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        message: "Cheer40",
        bits: 40,
      },
    });

    expect(result).toEqual({
      body: "Ignored",
      status: 202,
    });
    expect(deps.grantVipToken).not.toHaveBeenCalled();
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });

  it("grants proportional fractional VIP tokens for cheers above the threshold", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        defaultLocale: "en",
        autoGrantVipTokenToSubscribers: true,
        autoGrantVipTokensForSharedSubRenewalMessage: true,
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        autoGrantVipTokensForChannelPointRewards: true,
        autoGrantVipTokensForRaiders: true,
        cheerBitsPerVipToken: 200,
        channelPointRewardCost: 1000,
        cheerMinimumTokenPercent: 25,
        raidMinimumViewerCount: 1,
        twitchChannelPointRewardId: "reward-1",
      }),
    });

    const result = await processEventSubChannelCheer({
      env,
      deps,
      messageId: "msg-4",
      event: {
        is_anonymous: false,
        user_id: "viewer-1",
        user_login: "viewer_one",
        user_name: "Viewer One",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        message: "Cheer220",
        bits: 220,
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_one",
      displayName: "Viewer One",
      twitchUserId: "viewer-1",
      count: 1.1,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: "Added 1.1 VIP tokens to @viewer_one for cheering 220 bits.",
      })
    );
  });

  it("grants a VIP token and fulfills the app-owned channel point reward", async () => {
    const deps = createDeps();

    const result = await processEventSubChannelPointRewardRedemption({
      env,
      deps,
      messageId: "msg-cpr-1",
      event: {
        id: "redemption-1",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        user_id: "viewer-1",
        user_login: "viewer_one",
        user_name: "Viewer One",
        user_input: "",
        status: "unfulfilled",
        reward: {
          id: "reward-1",
          title: "RockList VIP Token",
          cost: 1000,
          prompt: "Redeem to add 1 VIP token to your RockList.Live balance.",
        },
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_one",
      displayName: "Viewer One",
      twitchUserId: "viewer-1",
      count: 1,
    });
    expect(deps.updateChannelPointRewardRedemptionStatus).toHaveBeenCalledWith(
      env,
      {
        channelId: "channel-1",
        broadcasterUserId: "broadcaster-1",
        rewardId: "reward-1",
        redemptionId: "redemption-1",
        status: "FULFILLED",
      }
    );
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Added 1 VIP token to @viewer_one for redeeming the RockList VIP Token channel point reward.",
      })
    );
  });

  it("cancels stale or disabled channel point reward redemptions", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        defaultLocale: "en",
        autoGrantVipTokenToSubscribers: true,
        autoGrantVipTokensForSharedSubRenewalMessage: true,
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        autoGrantVipTokensForChannelPointRewards: false,
        autoGrantVipTokensForRaiders: true,
        cheerBitsPerVipToken: 200,
        channelPointRewardCost: 1000,
        cheerMinimumTokenPercent: 25,
        raidMinimumViewerCount: 1,
        twitchChannelPointRewardId: "reward-1",
      }),
    });

    const result = await processEventSubChannelPointRewardRedemption({
      env,
      deps,
      messageId: "msg-cpr-2",
      event: {
        id: "redemption-2",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        user_id: "viewer-1",
        user_login: "viewer_one",
        user_name: "Viewer One",
        user_input: "",
        status: "unfulfilled",
        reward: {
          id: "reward-1",
          title: "RockList VIP Token",
          cost: 1000,
        },
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).not.toHaveBeenCalled();
    expect(deps.updateChannelPointRewardRedemptionStatus).toHaveBeenCalledWith(
      env,
      {
        channelId: "channel-1",
        broadcasterUserId: "broadcaster-1",
        rewardId: "reward-1",
        redemptionId: "redemption-2",
        status: "CANCELED",
      }
    );
  });

  it("localizes support event chat replies using the channel default locale", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        defaultLocale: "es",
        autoGrantVipTokenToSubscribers: true,
        autoGrantVipTokensForSharedSubRenewalMessage: true,
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        autoGrantVipTokensForChannelPointRewards: true,
        autoGrantVipTokensForRaiders: true,
        cheerBitsPerVipToken: 200,
        channelPointRewardCost: 1000,
        cheerMinimumTokenPercent: 25,
        raidMinimumViewerCount: 1,
        twitchChannelPointRewardId: "reward-1",
      }),
    });

    const result = await processEventSubChannelCheer({
      env,
      deps,
      messageId: "msg-4-es",
      event: {
        is_anonymous: false,
        user_id: "viewer-1",
        user_login: "viewer_one",
        user_name: "Viewer One",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        message: "Cheer220",
        bits: 220,
      },
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Se agregaron 1,1 tokens VIP a @viewer_one por enviar 220 bits.",
      })
    );
  });

  it("ignores duplicate automation deliveries", async () => {
    const deps = createDeps({
      claimEventSubDelivery: vi.fn().mockResolvedValue(false),
    });

    const result = await processEventSubSubscriptionGift({
      env,
      deps,
      messageId: "msg-5",
      event: {
        user_id: "gifter-1",
        user_login: "gifter_one",
        user_name: "Gifter One",
        broadcaster_user_id: "broadcaster-1",
        broadcaster_user_login: "streamer",
        broadcaster_user_name: "Streamer",
        total: 2,
        tier: "1000",
        cumulative_total: 2,
        is_anonymous: false,
      },
    });

    expect(result).toEqual({
      body: "Duplicate",
      status: 202,
    });
    expect(deps.grantVipToken).not.toHaveBeenCalled();
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });
});
