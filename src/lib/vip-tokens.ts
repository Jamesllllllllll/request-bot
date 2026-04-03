export const VIP_TOKEN_PRECISION = 2;
export const VIP_TOKEN_REDEMPTION_COST = 1;

const VIP_TOKEN_MULTIPLIER = 10 ** VIP_TOKEN_PRECISION;

export function normalizeVipTokenCount(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * VIP_TOKEN_MULTIPLIER) / VIP_TOKEN_MULTIPLIER;
}

export function clampVipTokenCount(value: number) {
  return Math.max(0, normalizeVipTokenCount(value));
}

export function hasRedeemableVipToken(
  value: number,
  requiredCount = VIP_TOKEN_REDEMPTION_COST
) {
  return clampVipTokenCount(value) >= clampVipTokenCount(requiredCount);
}

export function subtractVipTokenRedemption(
  value: number,
  requiredCount = VIP_TOKEN_REDEMPTION_COST
) {
  return clampVipTokenCount(value - clampVipTokenCount(requiredCount));
}

export function formatVipTokenCount(value: number) {
  return clampVipTokenCount(value)
    .toFixed(VIP_TOKEN_PRECISION)
    .replace(/(?:\.0+|(\.\d*[1-9])0+)$/, "$1");
}
