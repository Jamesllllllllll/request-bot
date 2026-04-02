import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "~/lib/env";
import type { StreamElementsTipDependencies } from "~/lib/streamelements/tips";
import {
  parseStreamElementsTipPayload,
  processStreamElementsTip,
} from "~/lib/streamelements/tips";

function createDeps(
  overrides: Partial<StreamElementsTipDependencies> = {}
): StreamElementsTipDependencies {
  return {
    getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
      defaultLocale: "en",
      autoGrantVipTokensForStreamElementsTips: true,
      streamElementsTipAmountPerVipToken: 5,
    }),
    claimDelivery: vi.fn().mockResolvedValue(true),
    grantVipToken: vi.fn().mockResolvedValue(undefined),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    sendChatReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("StreamElements tip automation", () => {
  const env = {
    APP_URL: "https://example.com",
  } as AppEnv;
  const channel = {
    id: "channel-1",
    ownerUserId: "owner-1",
    twitchChannelId: "broadcaster-1",
    slug: "streamer",
  };

  it("parses a raw channel.tips payload", () => {
    const parsed = parseStreamElementsTipPayload({
      id: "relay-msg-1",
      topic: "channel.tips",
      data: {
        donation: {
          user: {
            username: "viewer_one",
          },
          amount: 25,
          currency: "USD",
          message: "Great stream",
        },
        _id: "tip-1",
        transactionId: "txn-1",
        provider: "paypal",
        approved: "allowed",
        status: "success",
      },
    });

    expect(parsed).toEqual({
      deliveryId: "txn-1",
      rawLogin: "viewer_one",
      login: "viewer_one",
      displayName: "viewer_one",
      amount: 25,
      currency: "USD",
      message: "Great stream",
      provider: "paypal",
      status: "success",
      approved: "allowed",
      raw: expect.any(Object),
    });
  });

  it("grants proportional VIP tokens for a successful tip", async () => {
    const deps = createDeps();
    const tip = parseStreamElementsTipPayload({
      topic: "channel.tips",
      data: {
        donation: {
          user: {
            username: "viewer_one",
          },
          amount: 25,
          currency: "USD",
        },
        transactionId: "txn-2",
        approved: "allowed",
        status: "success",
      },
    });

    expect(tip).not.toBeNull();
    if (!tip) {
      throw new Error("Expected a valid StreamElements tip payload.");
    }

    const result = await processStreamElementsTip({
      env,
      deps,
      channel,
      tip,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.grantVipToken).toHaveBeenCalledWith(env, {
      channelId: "channel-1",
      login: "viewer_one",
      displayName: "viewer_one",
      count: 5,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Added 5 VIP tokens to @viewer_one for a $25 StreamElements tip.",
      })
    );
  });

  it("localizes StreamElements tip replies using the channel default locale", async () => {
    const deps = createDeps({
      getChannelSettingsByChannelId: vi.fn().mockResolvedValue({
        defaultLocale: "es",
        autoGrantVipTokensForStreamElementsTips: true,
        streamElementsTipAmountPerVipToken: 5,
      }),
    });
    const tip = parseStreamElementsTipPayload({
      topic: "channel.tips",
      data: {
        donation: {
          user: {
            username: "viewer_one",
          },
          amount: 25,
          currency: "USD",
        },
        transactionId: "txn-2-es",
        approved: "allowed",
        status: "success",
      },
    });

    expect(tip).not.toBeNull();
    if (!tip) {
      throw new Error("Expected a valid StreamElements tip payload.");
    }

    const result = await processStreamElementsTip({
      env,
      deps,
      channel,
      tip,
    });

    expect(result).toEqual({
      body: "Accepted",
      status: 202,
    });
    expect(deps.sendChatReply).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message:
          "Se agregaron 5 tokens VIP a @viewer_one por una propina de StreamElements de 25 US$.",
      })
    );
  });

  it("ignores tips when the username is not Twitch-compatible", async () => {
    const deps = createDeps();
    const tip = parseStreamElementsTipPayload({
      username: "Viewer One",
      amount: 10,
      currency: "USD",
      eventId: "tip-3",
    });

    expect(tip).not.toBeNull();
    expect(tip?.login).toBeNull();
    if (!tip) {
      throw new Error("Expected a valid StreamElements tip payload.");
    }

    const result = await processStreamElementsTip({
      env,
      deps,
      channel,
      tip,
    });

    expect(result).toEqual({
      body: "Ignored",
      status: 202,
    });
    expect(deps.claimDelivery).not.toHaveBeenCalled();
    expect(deps.grantVipToken).not.toHaveBeenCalled();
  });

  it("ignores duplicate tip deliveries", async () => {
    const deps = createDeps({
      claimDelivery: vi.fn().mockResolvedValue(false),
    });
    const tip = parseStreamElementsTipPayload({
      username: "viewer_one",
      amount: 10,
      currency: "USD",
      eventId: "tip-4",
    });

    expect(tip).not.toBeNull();
    if (!tip) {
      throw new Error("Expected a valid StreamElements tip payload.");
    }

    const result = await processStreamElementsTip({
      env,
      deps,
      channel,
      tip,
    });

    expect(result).toEqual({
      body: "Duplicate",
      status: 202,
    });
    expect(deps.grantVipToken).not.toHaveBeenCalled();
    expect(deps.sendChatReply).not.toHaveBeenCalled();
  });
});
