import type { TwitchEventSubListResponse } from "~/lib/twitch/types";

type EventSubSubscription = TwitchEventSubListResponse["data"][number];

type ChannelLookup = {
  id: string;
  twitchChannelId: string;
  displayName: string;
  login: string;
  botReadyState?: string | null;
};

export type AdminEventSubChannelSummary = {
  channelId: string | null;
  twitchChannelId: string;
  displayName: string;
  login: string | null;
  botReadyState: string | null;
  totalSubscriptionCount: number;
  chatSubscriptionCount: number;
  duplicateChatSubscriptions: boolean;
  chatSubscriptionIds: string[];
  chatBotUserIds: string[];
  chatCallbacks: string[];
};

export type AdminChatSubscriptionCleanupPlan = {
  keepSubscriptionId: string | null;
  deleteSubscriptionIds: string[];
  untouchedOtherCallbackSubscriptionIds: string[];
  currentCallbackSubscriptionIds: string[];
  matchingCurrentCallbackSubscriptionIds: string[];
  otherCallbackSubscriptionIds: string[];
  totalChannelChatSubscriptions: number;
  requiresReconcile: boolean;
};

export function getEventSubChannelTwitchId(subscription: EventSubSubscription) {
  const broadcasterUserId = subscription.condition?.broadcaster_user_id;
  if (typeof broadcasterUserId === "string" && broadcasterUserId.length > 0) {
    return broadcasterUserId;
  }

  const targetBroadcasterUserId =
    subscription.condition?.to_broadcaster_user_id;
  if (
    typeof targetBroadcasterUserId === "string" &&
    targetBroadcasterUserId.length > 0
  ) {
    return targetBroadcasterUserId;
  }

  return null;
}

export function summarizeAdminEventSubSubscriptions(input: {
  subscriptions: EventSubSubscription[];
  channelsByTwitchId: Map<string, ChannelLookup>;
}) {
  const summaries = new Map<string, AdminEventSubChannelSummary>();

  for (const subscription of input.subscriptions) {
    const twitchChannelId = getEventSubChannelTwitchId(subscription);
    if (!twitchChannelId) {
      continue;
    }

    const channel = input.channelsByTwitchId.get(twitchChannelId);
    const summary =
      summaries.get(twitchChannelId) ??
      ({
        channelId: channel?.id ?? null,
        twitchChannelId,
        displayName: channel?.displayName ?? `Channel ${twitchChannelId}`,
        login: channel?.login ?? null,
        botReadyState: channel?.botReadyState ?? null,
        totalSubscriptionCount: 0,
        chatSubscriptionCount: 0,
        duplicateChatSubscriptions: false,
        chatSubscriptionIds: [],
        chatBotUserIds: [],
        chatCallbacks: [],
      } satisfies AdminEventSubChannelSummary);

    summary.totalSubscriptionCount += 1;

    if (subscription.type === "channel.chat.message") {
      summary.chatSubscriptionCount += 1;
      summary.chatSubscriptionIds.push(subscription.id);

      const chatBotUserId = subscription.condition?.user_id;
      if (
        typeof chatBotUserId === "string" &&
        chatBotUserId.length > 0 &&
        !summary.chatBotUserIds.includes(chatBotUserId)
      ) {
        summary.chatBotUserIds.push(chatBotUserId);
      }

      const callbackUrl = subscription.transport?.callback;
      if (
        typeof callbackUrl === "string" &&
        callbackUrl.length > 0 &&
        !summary.chatCallbacks.includes(callbackUrl)
      ) {
        summary.chatCallbacks.push(callbackUrl);
      }
    }

    summaries.set(twitchChannelId, summary);
  }

  const channels = [...summaries.values()]
    .filter((summary) => summary.chatSubscriptionCount > 0)
    .map((summary) => ({
      ...summary,
      duplicateChatSubscriptions: summary.chatSubscriptionCount > 1,
    }))
    .sort((left, right) => {
      if (
        Number(right.duplicateChatSubscriptions) !==
        Number(left.duplicateChatSubscriptions)
      ) {
        return (
          Number(right.duplicateChatSubscriptions) -
          Number(left.duplicateChatSubscriptions)
        );
      }

      if (right.chatSubscriptionCount !== left.chatSubscriptionCount) {
        return right.chatSubscriptionCount - left.chatSubscriptionCount;
      }

      if (right.totalSubscriptionCount !== left.totalSubscriptionCount) {
        return right.totalSubscriptionCount - left.totalSubscriptionCount;
      }

      return left.displayName.localeCompare(right.displayName);
    });

  return {
    totalRemoteSubscriptions: input.subscriptions.length,
    totalChatSubscriptions: channels.reduce(
      (count, summary) => count + summary.chatSubscriptionCount,
      0
    ),
    channelsWithChatSubscription: channels.length,
    channelsWithDuplicateChatSubscriptions: channels.filter(
      (summary) => summary.duplicateChatSubscriptions
    ).length,
    channels,
  };
}

export function buildAdminChatSubscriptionCleanupPlan(input: {
  subscriptions: EventSubSubscription[];
  broadcasterUserId: string;
  currentCallbackUrl: string;
  currentBotUserId: string | null;
  shouldKeepCurrentCallbackSubscription: boolean;
}) {
  const channelChatSubscriptions = input.subscriptions.filter(
    (subscription) =>
      subscription.type === "channel.chat.message" &&
      subscription.condition?.broadcaster_user_id === input.broadcasterUserId
  );
  const currentCallbackSubscriptions = channelChatSubscriptions.filter(
    (subscription) =>
      subscription.transport?.callback === input.currentCallbackUrl
  );
  const otherCallbackSubscriptions = channelChatSubscriptions.filter(
    (subscription) =>
      subscription.transport?.callback !== input.currentCallbackUrl
  );
  const matchingCurrentCallbackSubscriptions =
    currentCallbackSubscriptions.filter(
      (subscription) =>
        input.currentBotUserId != null &&
        subscription.condition?.user_id === input.currentBotUserId
    );
  const keepSubscriptionId = input.shouldKeepCurrentCallbackSubscription
    ? (matchingCurrentCallbackSubscriptions[0]?.id ?? null)
    : null;

  return {
    keepSubscriptionId,
    deleteSubscriptionIds: currentCallbackSubscriptions
      .filter((subscription) => subscription.id !== keepSubscriptionId)
      .map((subscription) => subscription.id),
    untouchedOtherCallbackSubscriptionIds: otherCallbackSubscriptions.map(
      (subscription) => subscription.id
    ),
    currentCallbackSubscriptionIds: currentCallbackSubscriptions.map(
      (subscription) => subscription.id
    ),
    matchingCurrentCallbackSubscriptionIds:
      matchingCurrentCallbackSubscriptions.map(
        (subscription) => subscription.id
      ),
    otherCallbackSubscriptionIds: otherCallbackSubscriptions.map(
      (subscription) => subscription.id
    ),
    totalChannelChatSubscriptions: channelChatSubscriptions.length,
    requiresReconcile:
      input.shouldKeepCurrentCallbackSubscription && keepSubscriptionId == null,
  } satisfies AdminChatSubscriptionCleanupPlan;
}
