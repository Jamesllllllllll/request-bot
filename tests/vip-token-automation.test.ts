import { describe, expect, it } from "vitest";
import { getVipTokenAutomationDetails } from "~/lib/vip-token-automation";

describe("getVipTokenAutomationDetails", () => {
  it("keeps the minimum cheer line directly after the cheer conversion rule", () => {
    const details = getVipTokenAutomationDetails({
      autoGrantVipTokensForCheers: true,
      cheerBitsPerVipToken: 200,
      cheerMinimumTokenPercent: 25,
      autoGrantVipTokensForStreamElementsTips: true,
      streamElementsTipAmountPerVipToken: 5,
      autoGrantVipTokensForSharedSubRenewalMessage: true,
    });

    expect(details.earningRules).toEqual([
      "Shared sub renewal message = 1 VIP token",
      "Cheer 200 bits = 1 VIP token",
      "Minimum cheer: 50 bits = 0.25 VIP tokens.",
      "StreamElements tip $5 = 1 VIP token",
    ]);
  });
});
