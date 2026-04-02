import {
  claimEventSubDelivery,
  createAuditLog,
  getChannelSettingsByChannelId,
  grantVipToken,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { formatCurrency, formatNumber } from "~/lib/i18n/format";
import type { AppLocale } from "~/lib/i18n/locales";
import { getServerTranslation } from "~/lib/i18n/server";
import { normalizeVipTokenCount } from "~/lib/vip-tokens";

export interface StreamElementsTipChannel {
  id: string;
  ownerUserId: string;
  twitchChannelId: string;
  slug: string;
}

export interface StreamElementsTipSettings {
  defaultLocale: string;
  autoGrantVipTokensForStreamElementsTips: boolean;
  streamElementsTipAmountPerVipToken: number;
}

export interface StreamElementsTipPayload {
  deliveryId: string | null;
  rawLogin: string | null;
  login: string | null;
  displayName: string | null;
  amount: number;
  currency: string | null;
  message: string | null;
  provider: string | null;
  status: string | null;
  approved: string | null;
  raw: Record<string, unknown>;
}

export interface StreamElementsTipDependencies {
  getChannelSettingsByChannelId(
    env: AppEnv,
    channelId: string
  ): Promise<StreamElementsTipSettings | null>;
  claimDelivery(
    env: AppEnv,
    input: { channelId: string; deliveryId: string }
  ): Promise<boolean>;
  grantVipToken(
    env: AppEnv,
    input: {
      channelId: string;
      login: string;
      displayName?: string | null;
      count?: number;
    }
  ): Promise<unknown>;
  createAuditLog(env: AppEnv, input: Record<string, unknown>): Promise<unknown>;
  sendChatReply(
    env: AppEnv,
    input: { channelId: string; broadcasterUserId: string; message: string }
  ): Promise<unknown>;
}

type StreamElementsTipResult =
  | { body: "Accepted"; status: 202 }
  | { body: "Ignored"; status: 202 }
  | { body: "Duplicate"; status: 202 };

const TWITCH_LOGIN_PATTERN = /^[a-z0-9_]{2,25}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeTwitchLogin(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/^@+/, "").trim().toLowerCase();
  return TWITCH_LOGIN_PATTERN.test(normalized) ? normalized : null;
}

function mention(login: string) {
  return `@${login}`;
}

function formatTokenCount(locale: AppLocale, count: number) {
  return formatNumber(locale, normalizeVipTokenCount(count), {
    maximumFractionDigits: 2,
  });
}

function formatTipAmount(
  locale: AppLocale,
  amount: number,
  currency: string | null
) {
  if (currency) {
    try {
      return formatCurrency(locale, amount, currency.toUpperCase(), {
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return `${formatNumber(locale, amount, {
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })} ${currency.toUpperCase()}`;
    }
  }

  return formatNumber(locale, amount, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function extractEnvelope(input: Record<string, unknown>) {
  const topic = readString(input.topic);
  if (topic === "channel.tips" && isRecord(input.data)) {
    return input.data;
  }

  if (
    topic === "channel.activities" &&
    isRecord(input.data) &&
    readString(input.data.type)?.toLowerCase() === "tip"
  ) {
    return input.data;
  }

  return input;
}

export function parseStreamElementsTipPayload(
  input: unknown
): StreamElementsTipPayload | null {
  if (!isRecord(input)) {
    return null;
  }

  const envelope = extractEnvelope(input);
  const nestedData = isRecord(envelope.data) ? envelope.data : null;
  const donationCandidate = isRecord(envelope.donation)
    ? envelope.donation
    : nestedData && isRecord(nestedData.donation)
      ? nestedData.donation
      : null;
  const userCandidate =
    donationCandidate && isRecord(donationCandidate.user)
      ? donationCandidate.user
      : nestedData && isRecord(nestedData.user)
        ? nestedData.user
        : null;

  const rawLogin =
    readString(envelope.login) ??
    readString(envelope.username) ??
    readString(envelope.userLogin) ??
    readString(nestedData?.login) ??
    readString(nestedData?.username) ??
    readString(nestedData?.userLogin) ??
    readString(userCandidate?.login) ??
    readString(userCandidate?.username);
  const amount =
    readNumber(envelope.amount) ??
    readNumber(nestedData?.amount) ??
    readNumber(donationCandidate?.amount);

  if (amount == null || amount <= 0) {
    return null;
  }

  return {
    deliveryId:
      readString(envelope.eventId) ??
      readString(envelope.transactionId) ??
      readString(envelope._id) ??
      readString(envelope.id) ??
      readString(nestedData?.eventId) ??
      readString(nestedData?.transactionId) ??
      readString(nestedData?._id) ??
      readString(nestedData?.id),
    rawLogin,
    login: normalizeTwitchLogin(rawLogin),
    displayName:
      readString(envelope.displayName) ??
      readString(envelope.userName) ??
      readString(envelope.name) ??
      readString(nestedData?.displayName) ??
      readString(nestedData?.userName) ??
      readString(nestedData?.name) ??
      readString(userCandidate?.displayName) ??
      readString(userCandidate?.name) ??
      rawLogin,
    amount,
    currency:
      readString(envelope.currency) ??
      readString(nestedData?.currency) ??
      readString(donationCandidate?.currency),
    message:
      readString(envelope.message) ??
      readString(nestedData?.message) ??
      readString(donationCandidate?.message),
    provider:
      readString(envelope.provider) ??
      readString(nestedData?.provider) ??
      readString(donationCandidate?.provider),
    status: readString(envelope.status) ?? readString(nestedData?.status),
    approved: readString(envelope.approved) ?? readString(nestedData?.approved),
    raw: input,
  };
}

async function claimDeliveryIfNeeded(input: {
  env: AppEnv;
  deps: StreamElementsTipDependencies;
  channelId: string;
  deliveryId: string | null;
}) {
  if (!input.deliveryId) {
    return true;
  }

  return input.deps.claimDelivery(input.env, {
    channelId: input.channelId,
    deliveryId: input.deliveryId,
  });
}

export async function processStreamElementsTip(input: {
  env: AppEnv;
  deps: StreamElementsTipDependencies;
  channel: StreamElementsTipChannel;
  tip: StreamElementsTipPayload;
}): Promise<StreamElementsTipResult> {
  const settings = await input.deps.getChannelSettingsByChannelId(
    input.env,
    input.channel.id
  );
  if (!settings?.autoGrantVipTokensForStreamElementsTips) {
    return { body: "Ignored", status: 202 };
  }
  const { locale, t } = getServerTranslation(settings.defaultLocale, "bot");

  if (
    input.tip.status &&
    input.tip.status.toLowerCase() !== "success" &&
    input.tip.status.toLowerCase() !== "completed"
  ) {
    return { body: "Ignored", status: 202 };
  }

  if (
    input.tip.approved &&
    input.tip.approved.toLowerCase() !== "allowed" &&
    input.tip.approved.toLowerCase() !== "approved"
  ) {
    return { body: "Ignored", status: 202 };
  }

  if (!input.tip.login) {
    return { body: "Ignored", status: 202 };
  }

  const claimed = await claimDeliveryIfNeeded({
    env: input.env,
    deps: input.deps,
    channelId: input.channel.id,
    deliveryId: input.tip.deliveryId,
  });
  if (!claimed) {
    return { body: "Duplicate", status: 202 };
  }

  const tokenCount = normalizeVipTokenCount(
    input.tip.amount / settings.streamElementsTipAmountPerVipToken
  );
  if (tokenCount <= 0) {
    return { body: "Ignored", status: 202 };
  }

  await input.deps.grantVipToken(input.env, {
    channelId: input.channel.id,
    login: input.tip.login,
    displayName: input.tip.displayName ?? input.tip.login,
    count: tokenCount,
  });
  await input.deps.createAuditLog(input.env, {
    channelId: input.channel.id,
    actorUserId: input.channel.ownerUserId,
    actorType: "system",
    action: "auto_grant_vip_tokens_streamelements_tip",
    entityType: "vip_token",
    entityId: input.tip.login,
    payloadJson: JSON.stringify({
      source: "streamelements.tip",
      deliveryId: input.tip.deliveryId,
      rawLogin: input.tip.rawLogin,
      login: input.tip.login,
      amount: input.tip.amount,
      currency: input.tip.currency,
      provider: input.tip.provider,
      message: input.tip.message,
      amountPerVipToken: settings.streamElementsTipAmountPerVipToken,
      grantedTokenCount: tokenCount,
      raw: input.tip.raw,
    }),
  });
  await input.deps.sendChatReply(input.env, {
    channelId: input.channel.id,
    broadcasterUserId: input.channel.twitchChannelId,
    message: t("replies.autoGrantStreamElementsTip", {
      mention: mention(input.tip.login),
      count: tokenCount,
      countText: formatTokenCount(locale, tokenCount),
      amount: formatTipAmount(locale, input.tip.amount, input.tip.currency),
    }),
  });

  return { body: "Accepted", status: 202 };
}

export function createStreamElementsTipDependencies(): StreamElementsTipDependencies {
  return {
    getChannelSettingsByChannelId: async (env, channelId) => {
      const settings = await getChannelSettingsByChannelId(env, channelId);
      if (!settings) {
        return null;
      }

      return {
        defaultLocale: settings.defaultLocale,
        autoGrantVipTokensForStreamElementsTips:
          settings.autoGrantVipTokensForStreamElementsTips,
        streamElementsTipAmountPerVipToken:
          settings.streamElementsTipAmountPerVipToken,
      };
    },
    claimDelivery: async (env, input) =>
      claimEventSubDelivery(env, {
        channelId: input.channelId,
        messageId: input.deliveryId,
        subscriptionType: "streamelements.tip",
      }),
    grantVipToken,
    createAuditLog: async (env, input) => createAuditLog(env, input as never),
    sendChatReply: async (env, input) => env.TWITCH_REPLY_QUEUE.send(input),
  };
}
