import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";
import type { EventSubSupportDependencies } from "~/lib/eventsub/support-events";
import {
  processEventSubChannelCheer,
  processEventSubChannelSubscribe,
  processEventSubSubscriptionGift,
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
      autoGrantVipTokensToSubGifters: true,
      autoGrantVipTokensToGiftRecipients: true,
      autoGrantVipTokensForCheers: true,
      cheerBitsPerVipToken: 200,
      cheerMinimumTokenPercent: 25,
    }),
    claimEventSubDelivery: vi.fn().mockResolvedValue(true),
    grantVipToken: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    sendChatReply: vi.fn().mockResolvedValue(undefined),
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

  it("ignores cheers below the configured minimum partial threshold", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        cheerBitsPerVipToken: 200,
        cheerMinimumTokenPercent: 25,
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
        autoGrantVipTokensToSubGifters: true,
        autoGrantVipTokensToGiftRecipients: true,
        autoGrantVipTokensForCheers: true,
        cheerBitsPerVipToken: 200,
        cheerMinimumTokenPercent: 25,
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
