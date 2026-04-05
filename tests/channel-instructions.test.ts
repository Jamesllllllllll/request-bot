import { describe, expect, it } from "vitest";
import {
  buildChannelInstructions,
  type ChannelInstructionsSettings,
} from "~/lib/channel-instructions";

const baseSettings: ChannelInstructionsSettings = {
  requestsEnabled: true,
  allowAnyoneToRequest: true,
  allowSubscribersToRequest: true,
  allowVipsToRequest: true,
  allowRequestPathModifiers: false,
  allowedRequestPaths: [],
  requestPathModifierVipTokenCost: 0,
  requestPathModifierUsesVipPriority: true,
  autoGrantVipTokenToSubscribers: false,
  autoGrantVipTokensForSharedSubRenewalMessage: false,
  autoGrantVipTokensToSubGifters: false,
  autoGrantVipTokensToGiftRecipients: false,
  autoGrantVipTokensForCheers: false,
  autoGrantVipTokensForChannelPointRewards: false,
  autoGrantVipTokensForRaiders: false,
  autoGrantVipTokensForStreamElementsTips: false,
  cheerBitsPerVipToken: 200,
  channelPointRewardCost: 1000,
  raidMinimumViewerCount: 5,
  streamElementsTipAmountPerVipToken: 5,
  vipTokenDurationThresholds: [],
  commandPrefix: "!sr",
};

describe("buildChannelInstructions", () => {
  it("describes VIP priority path modifiers and sorted long-song costs", () => {
    const instructions = buildChannelInstructions({
      channelSlug: "tester",
      settings: {
        ...baseSettings,
        allowRequestPathModifiers: true,
        allowedRequestPaths: ["guitar", "bass"],
        requestPathModifierVipTokenCost: 2,
        requestPathModifierUsesVipPriority: true,
        autoGrantVipTokenToSubscribers: true,
        autoGrantVipTokensForCheers: true,
        vipTokenDurationThresholds: [
          {
            minimumDurationMinutes: 11,
            tokenCost: 3,
          },
          {
            minimumDurationMinutes: 7,
            tokenCost: 1,
          },
        ],
      },
    });

    expect(instructions).toContain("Playlist: https://rocklist.live/tester");
    expect(instructions).toContain("Use !sr artist - song to request a song.");
    expect(instructions).toContain(
      "Use !edit artist - song to change your current request."
    );
    expect(instructions).toContain(
      "Use !vip artist - song to make a request VIP and move it to the top."
    );
    expect(instructions).toContain("Songs over 7 minutes require 1 VIP token.");
    expect(instructions).toContain(
      "Songs over 11 minutes require 3 VIP tokens."
    );
    expect(instructions).toContain(
      "Add *guitar, *bass to !vip artist - song when the song includes a matching part. Choosing a part costs 2 VIP tokens and uses VIP priority."
    );
    expect(instructions).toContain("Give 1 VIP token for a new paid sub");
    expect(instructions).toContain("Cheers: 1 VIP token per 200 bits.");
  });

  it("describes non-priority paid path choices and no automatic rewards", () => {
    const instructions = buildChannelInstructions({
      channelSlug: "subscriber-channel",
      settings: {
        ...baseSettings,
        allowAnyoneToRequest: false,
        allowSubscribersToRequest: true,
        allowVipsToRequest: true,
        allowRequestPathModifiers: true,
        allowedRequestPaths: ["bass"],
        requestPathModifierVipTokenCost: 1,
        requestPathModifierUsesVipPriority: false,
      },
    });

    expect(instructions).toContain(
      "Requests are open to subscribers and channel VIPs."
    );
    expect(instructions).toContain(
      "Add *bass to !sr, !vip, or !edit when the song includes a matching part. Choosing a part costs 1 VIP token."
    );
    expect(instructions).toContain(
      "Use !vip as well if you want the request to play next."
    );
    expect(instructions).toContain(
      "VIP tokens are not awarded automatically right now."
    );
  });

  it("hides path instructions when the parent modifier toggle is off", () => {
    const instructions = buildChannelInstructions({
      channelSlug: "bass-channel",
      settings: {
        ...baseSettings,
        allowRequestPathModifiers: false,
        allowedRequestPaths: ["bass"],
        requestPathModifierVipTokenCost: 1,
      },
    });

    expect(instructions).not.toContain("Add *bass");
  });
});
