import {
  claimEventSubDelivery,
  createAuditLog,
  getChannelByTwitchChannelId,
  getChannelSettingsByChannelId,
  grantVipToken,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import type {
  EventSubCheerEvent,
  EventSubSubscribeEvent,
  EventSubSubscriptionGiftEvent,
} from "~/lib/twitch/types";
import { formatVipTokenCount, normalizeVipTokenCount } from "~/lib/vip-tokens";

export interface EventSubSupportChannel {
  id: string;
  ownerUserId: string;
  twitchChannelId: string;
}

export interface EventSubSupportSettings {
  autoGrantVipTokensToSubGifters: boolean;
  autoGrantVipTokensToGiftRecipients: boolean;
  autoGrantVipTokensForCheers: boolean;
  cheerBitsPerVipToken: number;
  cheerMinimumTokenPercent: 25 | 50 | 75 | 100;
}

export interface EventSubSupportDependencies {
  getChannelByTwitchChannelId(
    env: AppEnv,
    twitchChannelId: string
  ): Promise<EventSubSupportChannel | null>;
  getChannelSettingsByChannelId(
    env: AppEnv,
    channelId: string
  ): Promise<EventSubSupportSettings | null>;
  claimEventSubDelivery(
    env: AppEnv,
    input: {
      channelId: string;
      messageId: string;
      subscriptionType: string;
    }
  ): Promise<boolean>;
  grantVipToken(
    env: AppEnv,
    input: {
      channelId: string;
      login: string;
      displayName?: string | null;
      twitchUserId?: string | null;
      count?: number;
    }
  ): Promise<unknown>;
  createAuditLog(env: AppEnv, input: Record<string, unknown>): Promise<unknown>;
  sendChatReply(
    env: AppEnv,
    input: { channelId: string; broadcasterUserId: string; message: string }
  ): Promise<unknown>;
}

type EventSubSupportResult =
  | { body: "Accepted"; status: 202 }
  | { body: "Ignored"; status: 202 }
  | { body: "Duplicate"; status: 202 }
  | { body: "Channel not found"; status: 202 };

function formatPluralizedTokens(count: number) {
  const formatted = formatVipTokenCount(count);
  return `${formatted} VIP token${count === 1 ? "" : "s"}`;
}

function getCheerMinimumBits(settings: EventSubSupportSettings) {
  return Math.ceil(
    settings.cheerBitsPerVipToken * (settings.cheerMinimumTokenPercent / 100)
  );
}

async function claimDeliveryIfNeeded(input: {
  env: AppEnv;
  deps: EventSubSupportDependencies;
  channelId: string;
  messageId: string | null;
  subscriptionType: string;
}) {
  if (!input.messageId) {
    return true;
  }

  return input.deps.claimEventSubDelivery(input.env, {
    channelId: input.channelId,
    messageId: input.messageId,
    subscriptionType: input.subscriptionType,
  });
}

export async function processEventSubSubscriptionGift(input: {
  env: AppEnv;
  deps: EventSubSupportDependencies;
  messageId: string | null;
  event: EventSubSubscriptionGiftEvent;
}): Promise<EventSubSupportResult> {
  const channel = await input.deps.getChannelByTwitchChannelId(
    input.env,
    input.event.broadcaster_user_id
  );
  if (!channel) {
    return { body: "Channel not found", status: 202 };
  }

  const settings = await input.deps.getChannelSettingsByChannelId(
    input.env,
    channel.id
  );
  if (!settings?.autoGrantVipTokensToSubGifters) {
    return { body: "Ignored", status: 202 };
  }

  const claimed = await claimDeliveryIfNeeded({
    env: input.env,
    deps: input.deps,
    channelId: channel.id,
    messageId: input.messageId,
    subscriptionType: "channel.subscription.gift",
  });
  if (!claimed) {
    return { body: "Duplicate", status: 202 };
  }

  if (
    input.event.is_anonymous ||
    !input.event.user_id ||
    !input.event.user_login ||
    input.event.total <= 0
  ) {
    return { body: "Ignored", status: 202 };
  }

  const tokenCount = normalizeVipTokenCount(input.event.total);
  await input.deps.grantVipToken(input.env, {
    channelId: channel.id,
    login: input.event.user_login,
    displayName: input.event.user_name ?? input.event.user_login,
    twitchUserId: input.event.user_id,
    count: tokenCount,
  });
  await input.deps.createAuditLog(input.env, {
    channelId: channel.id,
    actorUserId: channel.ownerUserId,
    actorType: "system",
    action: "auto_grant_vip_tokens_sub_gifter",
    entityType: "vip_token",
    entityId: input.event.user_login,
    payloadJson: JSON.stringify({
      source: "channel.subscription.gift",
      twitchMessageId: input.messageId,
      login: input.event.user_login,
      twitchUserId: input.event.user_id,
      totalGiftedSubs: input.event.total,
      grantedTokenCount: tokenCount,
    }),
  });
  await input.deps.sendChatReply(input.env, {
    channelId: channel.id,
    broadcasterUserId: channel.twitchChannelId,
    message: `Added ${formatPluralizedTokens(tokenCount)} to @${input.event.user_login} for gifting ${input.event.total} sub${input.event.total === 1 ? "" : "s"}.`,
  });

  return { body: "Accepted", status: 202 };
}

export async function processEventSubChannelSubscribe(input: {
  env: AppEnv;
  deps: EventSubSupportDependencies;
  messageId: string | null;
  event: EventSubSubscribeEvent;
}): Promise<EventSubSupportResult> {
  const channel = await input.deps.getChannelByTwitchChannelId(
    input.env,
    input.event.broadcaster_user_id
  );
  if (!channel) {
    return { body: "Channel not found", status: 202 };
  }

  const settings = await input.deps.getChannelSettingsByChannelId(
    input.env,
    channel.id
  );
  if (!settings?.autoGrantVipTokensToGiftRecipients || !input.event.is_gift) {
    return { body: "Ignored", status: 202 };
  }

  const claimed = await claimDeliveryIfNeeded({
    env: input.env,
    deps: input.deps,
    channelId: channel.id,
    messageId: input.messageId,
    subscriptionType: "channel.subscribe",
  });
  if (!claimed) {
    return { body: "Duplicate", status: 202 };
  }

  await input.deps.grantVipToken(input.env, {
    channelId: channel.id,
    login: input.event.user_login,
    displayName: input.event.user_name,
    twitchUserId: input.event.user_id,
    count: 1,
  });
  await input.deps.createAuditLog(input.env, {
    channelId: channel.id,
    actorUserId: channel.ownerUserId,
    actorType: "system",
    action: "auto_grant_vip_tokens_gift_recipient",
    entityType: "vip_token",
    entityId: input.event.user_login,
    payloadJson: JSON.stringify({
      source: "channel.subscribe",
      twitchMessageId: input.messageId,
      login: input.event.user_login,
      twitchUserId: input.event.user_id,
      grantedTokenCount: 1,
      isGift: input.event.is_gift,
    }),
  });
  await input.deps.sendChatReply(input.env, {
    channelId: channel.id,
    broadcasterUserId: channel.twitchChannelId,
    message: `Added 1 VIP token to @${input.event.user_login} for receiving a gifted sub.`,
  });

  return { body: "Accepted", status: 202 };
}

export async function processEventSubChannelCheer(input: {
  env: AppEnv;
  deps: EventSubSupportDependencies;
  messageId: string | null;
  event: EventSubCheerEvent;
}): Promise<EventSubSupportResult> {
  const channel = await input.deps.getChannelByTwitchChannelId(
    input.env,
    input.event.broadcaster_user_id
  );
  if (!channel) {
    return { body: "Channel not found", status: 202 };
  }

  const settings = await input.deps.getChannelSettingsByChannelId(
    input.env,
    channel.id
  );
  if (!settings?.autoGrantVipTokensForCheers) {
    return { body: "Ignored", status: 202 };
  }

  const claimed = await claimDeliveryIfNeeded({
    env: input.env,
    deps: input.deps,
    channelId: channel.id,
    messageId: input.messageId,
    subscriptionType: "channel.cheer",
  });
  if (!claimed) {
    return { body: "Duplicate", status: 202 };
  }

  if (
    input.event.is_anonymous ||
    !input.event.user_id ||
    !input.event.user_login
  ) {
    return { body: "Ignored", status: 202 };
  }

  const minimumBits = getCheerMinimumBits(settings);
  if (input.event.bits < minimumBits) {
    return { body: "Ignored", status: 202 };
  }

  const tokenCount = normalizeVipTokenCount(
    input.event.bits / settings.cheerBitsPerVipToken
  );
  if (tokenCount <= 0) {
    return { body: "Ignored", status: 202 };
  }

  await input.deps.grantVipToken(input.env, {
    channelId: channel.id,
    login: input.event.user_login,
    displayName: input.event.user_name ?? input.event.user_login,
    twitchUserId: input.event.user_id,
    count: tokenCount,
  });
  await input.deps.createAuditLog(input.env, {
    channelId: channel.id,
    actorUserId: channel.ownerUserId,
    actorType: "system",
    action: "auto_grant_vip_tokens_cheer",
    entityType: "vip_token",
    entityId: input.event.user_login,
    payloadJson: JSON.stringify({
      source: "channel.cheer",
      twitchMessageId: input.messageId,
      login: input.event.user_login,
      twitchUserId: input.event.user_id,
      bits: input.event.bits,
      bitsPerVipToken: settings.cheerBitsPerVipToken,
      cheerMinimumTokenPercent: settings.cheerMinimumTokenPercent,
      grantedTokenCount: tokenCount,
    }),
  });
  await input.deps.sendChatReply(input.env, {
    channelId: channel.id,
    broadcasterUserId: channel.twitchChannelId,
    message: `Added ${formatPluralizedTokens(tokenCount)} to @${input.event.user_login} for cheering ${input.event.bits} bit${input.event.bits === 1 ? "" : "s"}.`,
  });

  return { body: "Accepted", status: 202 };
}

export function createEventSubSupportDependencies(): EventSubSupportDependencies {
  return {
    getChannelByTwitchChannelId: async (env, twitchChannelId) =>
      (await getChannelByTwitchChannelId(env, twitchChannelId)) ?? null,
    getChannelSettingsByChannelId: async (env, channelId) => {
      const settings = await getChannelSettingsByChannelId(env, channelId);
      if (!settings) {
        return null;
      }

      return {
        autoGrantVipTokensToSubGifters: settings.autoGrantVipTokensToSubGifters,
        autoGrantVipTokensToGiftRecipients:
          settings.autoGrantVipTokensToGiftRecipients,
        autoGrantVipTokensForCheers: settings.autoGrantVipTokensForCheers,
        cheerBitsPerVipToken: settings.cheerBitsPerVipToken,
        cheerMinimumTokenPercent:
          settings.cheerMinimumTokenPercent === 50 ||
          settings.cheerMinimumTokenPercent === 75 ||
          settings.cheerMinimumTokenPercent === 100
            ? settings.cheerMinimumTokenPercent
            : 25,
      };
    },
    claimEventSubDelivery,
    grantVipToken,
    createAuditLog: async (env, input) => createAuditLog(env, input as never),
    sendChatReply: async (env, input) => env.TWITCH_REPLY_QUEUE.send(input),
  };
}
