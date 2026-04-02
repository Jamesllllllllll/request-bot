import { describe, expect, it } from "vitest";
import { TwitchApiError } from "~/lib/twitch/api";
import {
  getChannelPointRewardSetupIssue,
  getChannelPointRewardWarningMessageFromWarnings,
} from "~/lib/twitch/channel-point-reward-warnings";
import {
  buildVipTokenChannelPointRewardDefinition,
  channelPointRewardManageScope,
  defaultChannelPointRewardCost,
  normalizeChannelPointRewardCost,
  vipTokenChannelPointRewardSubscriptionType,
  vipTokenChannelPointRewardTitle,
} from "~/lib/twitch/channel-point-rewards";

describe("channel point reward helpers", () => {
  it("normalizes invalid reward costs to the default", () => {
    expect(normalizeChannelPointRewardCost(undefined)).toBe(
      defaultChannelPointRewardCost
    );
    expect(normalizeChannelPointRewardCost(0)).toBe(1);
    expect(normalizeChannelPointRewardCost(1.9)).toBe(1);
    expect(normalizeChannelPointRewardCost(2_000_000)).toBe(1_000_000);
  });

  it("builds the app-owned VIP token reward definition", () => {
    expect(
      buildVipTokenChannelPointRewardDefinition({
        cost: 2500,
        enabled: true,
      })
    ).toEqual({
      title: vipTokenChannelPointRewardTitle,
      prompt: "Redeem to add 1 VIP token to your RockList.Live balance.",
      cost: 2500,
      isEnabled: true,
      shouldRedemptionsSkipRequestQueue: false,
    });
    expect(channelPointRewardManageScope).toBe("channel:manage:redemptions");
    expect(vipTokenChannelPointRewardSubscriptionType).toBe(
      "channel.channel_points_custom_reward_redemption.add"
    );
  });

  it("classifies Twitch eligibility and naming failures", () => {
    expect(
      getChannelPointRewardSetupIssue(
        new TwitchApiError(
          "Failed to create custom reward: 403",
          403,
          "The broadcaster is not a partner or affiliate."
        )
      )
    ).toBe("affiliate_or_partner_required");

    expect(
      getChannelPointRewardSetupIssue(
        new TwitchApiError(
          "Failed to create custom reward: 400",
          400,
          "The title must be unique amongst all of the broadcaster's custom rewards."
        )
      )
    ).toBe("reward_title_conflict");
  });

  it("returns a streamer-facing warning from reconcile warnings", () => {
    expect(
      getChannelPointRewardWarningMessageFromWarnings([
        "channel_point_reward_affiliate_or_partner_required",
      ])
    ).toContain("Affiliate or Partner");
  });
});
