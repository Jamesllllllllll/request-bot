export const channelPointRewardManageScope = "channel:manage:redemptions";

export const vipTokenChannelPointRewardSubscriptionType =
  "channel.channel_points_custom_reward_redemption.add";

export const vipTokenChannelPointRewardTitle = "RockList VIP Token";

export const vipTokenChannelPointRewardPrompt =
  "Redeem to add 1 VIP token to your RockList.Live balance.";

export const defaultChannelPointRewardCost = 1000;

export function normalizeChannelPointRewardCost(
  value: number | null | undefined
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultChannelPointRewardCost;
  }

  return Math.min(1_000_000, Math.max(1, Math.floor(value)));
}

export function buildVipTokenChannelPointRewardDefinition(input: {
  cost: number;
  enabled: boolean;
}) {
  return {
    title: vipTokenChannelPointRewardTitle,
    prompt: vipTokenChannelPointRewardPrompt,
    cost: normalizeChannelPointRewardCost(input.cost),
    isEnabled: input.enabled,
    shouldRedemptionsSkipRequestQueue: false,
  };
}
