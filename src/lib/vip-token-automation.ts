import { formatVipTokenCount, normalizeVipTokenCount } from "~/lib/vip-tokens";

export interface VipTokenAutomationSettingsLike {
  autoGrantVipTokenToSubscribers?: boolean | null;
  autoGrantVipTokensForSharedSubRenewalMessage?: boolean | null;
  autoGrantVipTokensToSubGifters?: boolean | null;
  autoGrantVipTokensToGiftRecipients?: boolean | null;
  autoGrantVipTokensForCheers?: boolean | null;
  cheerBitsPerVipToken?: number | null;
  cheerMinimumTokenPercent?: number | null;
  autoGrantVipTokensForRaiders?: boolean | null;
  raidMinimumViewerCount?: number | null;
  autoGrantVipTokensForStreamElementsTips?: boolean | null;
  streamElementsTipAmountPerVipToken?: number | null;
}

export function getVipTokenAutomationDetails(
  input: VipTokenAutomationSettingsLike
) {
  const earningRules: string[] = [];
  const notes: string[] = [];

  if (input.autoGrantVipTokenToSubscribers) {
    earningRules.push("New paid sub = 1 VIP token");
  }

  if (input.autoGrantVipTokensForSharedSubRenewalMessage) {
    earningRules.push("Shared sub renewal message = 1 VIP token");
  }

  if (input.autoGrantVipTokensToSubGifters) {
    earningRules.push("Gift 1 sub = 1 VIP token to the gifter");
  }

  if (input.autoGrantVipTokensToGiftRecipients) {
    earningRules.push("Receive a gifted sub = 1 VIP token");
  }

  if (input.autoGrantVipTokensForCheers) {
    const bitsPerVipToken = normalizePositiveNumber(input.cheerBitsPerVipToken);
    if (bitsPerVipToken != null) {
      earningRules.push(
        `Cheer ${formatNumber(bitsPerVipToken)} bits = 1 VIP token`
      );
      const minimumBits = Math.ceil(
        bitsPerVipToken *
          (normalizeCheerMinimumPercent(input.cheerMinimumTokenPercent) / 100)
      );
      const minimumTokenCount = normalizeVipTokenCount(
        minimumBits / bitsPerVipToken
      );
      earningRules.push(
        `Minimum cheer: ${formatNumber(minimumBits)} bits = ${formatVipTokenCount(minimumTokenCount)} VIP token${minimumTokenCount === 1 ? "" : "s"}.`
      );
    }
  }

  if (input.autoGrantVipTokensForRaiders) {
    const minimumRaidViewerCount = normalizeRaidMinimumViewerCount(
      input.raidMinimumViewerCount
    );
    earningRules.push(
      minimumRaidViewerCount > 1
        ? `Raid with ${formatNumber(minimumRaidViewerCount)}+ viewers = 1 VIP token`
        : "Raid this channel = 1 VIP token"
    );
  }

  if (input.autoGrantVipTokensForStreamElementsTips) {
    const amountPerVipToken = normalizePositiveNumber(
      input.streamElementsTipAmountPerVipToken
    );
    if (amountPerVipToken != null) {
      earningRules.push(
        `StreamElements tip ${formatCurrency(amountPerVipToken)} = 1 VIP token`
      );
    }
  }

  return {
    earningRules,
    notes,
  };
}

export function getVipTokenRedemptionDescription() {
  return "Spend 1 VIP token for your song to be placed at the top of the playlist.";
}

export function getVipTokenRedemptionDetails() {
  return {
    summary:
      "Spend 1 VIP token for your song to be placed at the top of the playlist.",
    uses: [],
  };
}

function normalizePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeCheerMinimumPercent(value: number | null | undefined) {
  return value === 50 || value === 75 || value === 100 ? value : 25;
}

function normalizeRaidMinimumViewerCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 1
    ? Math.floor(value)
    : 1;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
