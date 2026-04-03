export type ChannelPointRewardEligibility = {
  isKnown: boolean;
  isSupported: boolean;
};

export const unknownChannelPointRewardEligibility: ChannelPointRewardEligibility =
  {
    isKnown: false,
    isSupported: false,
  };

export function getChannelPointRewardEligibility(
  broadcasterType: string | null | undefined
): ChannelPointRewardEligibility {
  const normalizedBroadcasterType = broadcasterType?.trim().toLowerCase() ?? "";

  return {
    isKnown: true,
    isSupported:
      normalizedBroadcasterType === "affiliate" ||
      normalizedBroadcasterType === "partner",
  };
}
