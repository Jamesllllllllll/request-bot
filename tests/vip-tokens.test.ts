import { describe, expect, it } from "vitest";
import {
  clampVipTokenCount,
  formatVipTokenCount,
  hasRedeemableVipToken,
  normalizeVipTokenCount,
  subtractVipTokenRedemption,
} from "~/lib/vip-tokens";

describe("vip token helpers", () => {
  it("normalizes fractional balances to two decimal places", () => {
    expect(normalizeVipTokenCount(1.555)).toBe(1.56);
    expect(normalizeVipTokenCount(0.004)).toBe(0);
  });

  it("formats balances without unnecessary trailing zeros", () => {
    expect(formatVipTokenCount(2)).toBe("2");
    expect(formatVipTokenCount(1.5)).toBe("1.5");
    expect(formatVipTokenCount(1.25)).toBe("1.25");
  });

  it("treats one full token as the redemption threshold", () => {
    expect(hasRedeemableVipToken(1)).toBe(true);
    expect(hasRedeemableVipToken(1.5)).toBe(true);
    expect(hasRedeemableVipToken(0.5)).toBe(false);
  });

  it("subtracts one token while preserving the remaining fractional balance", () => {
    expect(subtractVipTokenRedemption(1.5)).toBe(0.5);
    expect(subtractVipTokenRedemption(1)).toBe(0);
    expect(subtractVipTokenRedemption(0.5)).toBe(0);
  });

  it("clamps negative values to zero", () => {
    expect(clampVipTokenCount(-1)).toBe(0);
  });
});
