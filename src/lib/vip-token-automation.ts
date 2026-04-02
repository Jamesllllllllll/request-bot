import { formatCurrency, formatNumber } from "~/lib/i18n/format";
import { type AppLocale, defaultLocale } from "~/lib/i18n/locales";
import { formatVipTokenCount, normalizeVipTokenCount } from "~/lib/vip-tokens";

export interface VipTokenAutomationSettingsLike {
  autoGrantVipTokenToSubscribers?: boolean | null;
  autoGrantVipTokensForSharedSubRenewalMessage?: boolean | null;
  autoGrantVipTokensToSubGifters?: boolean | null;
  autoGrantVipTokensToGiftRecipients?: boolean | null;
  autoGrantVipTokensForCheers?: boolean | null;
  cheerBitsPerVipToken?: number | null;
  cheerMinimumTokenPercent?: number | null;
  autoGrantVipTokensForChannelPointRewards?: boolean | null;
  autoGrantVipTokensForRaiders?: boolean | null;
  raidMinimumViewerCount?: number | null;
  autoGrantVipTokensForStreamElementsTips?: boolean | null;
  streamElementsTipAmountPerVipToken?: number | null;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function getVipTokenAutomationDetails(
  input: VipTokenAutomationSettingsLike,
  options?: {
    locale?: AppLocale;
    translate?: Translate;
  }
) {
  const locale = options?.locale ?? defaultLocale;
  const translate = options?.translate;
  const earningRules: string[] = [];
  const notes: string[] = [];

  if (input.autoGrantVipTokenToSubscribers) {
    earningRules.push(
      translate?.("vip.ruleNewPaidSub") ?? "New paid sub = 1 VIP token"
    );
  }

  if (input.autoGrantVipTokensForSharedSubRenewalMessage) {
    earningRules.push(
      translate?.("vip.ruleSharedSubRenewal") ??
        "Shared sub renewal message = 1 VIP token"
    );
  }

  if (input.autoGrantVipTokensToSubGifters) {
    earningRules.push(
      translate?.("vip.ruleGiftSub") ?? "Gift 1 sub = 1 VIP token to the gifter"
    );
  }

  if (input.autoGrantVipTokensToGiftRecipients) {
    earningRules.push(
      translate?.("vip.ruleGiftRecipient") ??
        "Receive a gifted sub = 1 VIP token"
    );
  }

  if (input.autoGrantVipTokensForCheers) {
    const bitsPerVipToken = normalizePositiveNumber(input.cheerBitsPerVipToken);
    if (bitsPerVipToken != null) {
      const formattedBitsPerVipToken = formatNumber(locale, bitsPerVipToken, {
        maximumFractionDigits: 2,
      });
      earningRules.push(
        translate?.("vip.ruleCheer", {
          bits: formattedBitsPerVipToken,
        }) ?? `Cheer ${formattedBitsPerVipToken} bits = 1 VIP token`
      );
      const minimumBits = Math.ceil(
        bitsPerVipToken *
          (normalizeCheerMinimumPercent(input.cheerMinimumTokenPercent) / 100)
      );
      const minimumTokenCount = normalizeVipTokenCount(
        minimumBits / bitsPerVipToken
      );
      const formattedMinimumBits = formatNumber(locale, minimumBits, {
        maximumFractionDigits: 2,
      });
      const formattedMinimumTokenCount = formatNumber(
        locale,
        minimumTokenCount,
        {
          maximumFractionDigits: 2,
        }
      );
      earningRules.push(
        translate?.("vip.ruleMinimumCheer", {
          bits: formattedMinimumBits,
          tokens: formattedMinimumTokenCount,
          count: minimumTokenCount,
        }) ??
          `Minimum cheer: ${formattedMinimumBits} bits = ${formatVipTokenCount(minimumTokenCount)} VIP token${minimumTokenCount === 1 ? "" : "s"}.`
      );
    }
  }

  if (input.autoGrantVipTokensForChannelPointRewards) {
    earningRules.push(
      translate?.("vip.ruleChannelPoints") ??
        "Redeem the channel point reward = 1 VIP token"
    );
  }

  if (input.autoGrantVipTokensForRaiders) {
    const minimumRaidViewerCount = normalizeRaidMinimumViewerCount(
      input.raidMinimumViewerCount
    );
    earningRules.push(
      minimumRaidViewerCount > 1
        ? (translate?.("vip.ruleRaidMultiple", {
            viewers: formatNumber(locale, minimumRaidViewerCount, {
              maximumFractionDigits: 2,
            }),
          }) ??
            `Raid with ${formatNumber(locale, minimumRaidViewerCount, {
              maximumFractionDigits: 2,
            })}+ viewers = 1 VIP token`)
        : (translate?.("vip.ruleRaidSingle") ??
            "Raid this channel = 1 VIP token")
    );
  }

  if (input.autoGrantVipTokensForStreamElementsTips) {
    const amountPerVipToken = normalizePositiveNumber(
      input.streamElementsTipAmountPerVipToken
    );
    if (amountPerVipToken != null) {
      const formattedTipAmount = formatCurrency(
        locale,
        amountPerVipToken,
        "USD",
        {
          minimumFractionDigits: Number.isInteger(amountPerVipToken) ? 0 : 2,
          maximumFractionDigits: 2,
        }
      );
      earningRules.push(
        translate?.("vip.ruleTip", {
          amount: formattedTipAmount,
        }) ?? `StreamElements tip ${formattedTipAmount} = 1 VIP token`
      );
    }
  }

  return {
    earningRules,
    notes,
  };
}

export function getVipTokenRedemptionDescription(translate?: Translate) {
  return (
    translate?.("vip.redemptionDescription") ??
    "Spend 1 VIP token for your song to be placed at the top of the playlist."
  );
}

export function getVipTokenRedemptionDetails(translate?: Translate) {
  return {
    summary: getVipTokenRedemptionDescription(translate),
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
