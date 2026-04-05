import { describe, expect, it } from "vitest";
import {
  buildAdminChatSubscriptionCleanupPlan,
  getEventSubChannelTwitchId,
  summarizeAdminEventSubSubscriptions,
} from "~/lib/twitch/eventsub-dashboard";

describe("eventsub dashboard helpers", () => {
  it("resolves the channel id from broadcaster and raid conditions", () => {
    expect(
      getEventSubChannelTwitchId({
        id: "sub-1",
        status: "enabled",
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: "broadcaster-1",
          user_id: "bot-1",
        },
        created_at: "2026-01-01T00:00:00Z",
        transport: {
          method: "webhook",
          callback: "https://example.com/api/eventsub",
        },
        cost: 0,
      })
    ).toBe("broadcaster-1");

    expect(
      getEventSubChannelTwitchId({
        id: "sub-2",
        status: "enabled",
        type: "channel.raid",
        version: "1",
        condition: {
          to_broadcaster_user_id: "broadcaster-2",
        },
        created_at: "2026-01-01T00:00:00Z",
        transport: {
          method: "webhook",
          callback: "https://example.com/api/eventsub",
        },
        cost: 0,
      })
    ).toBe("broadcaster-2");
  });

  it("groups live chat subscriptions per channel and flags duplicates", () => {
    const summary = summarizeAdminEventSubSubscriptions({
      subscriptions: [
        {
          id: "chat-1",
          status: "enabled",
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: "broadcaster-1",
            user_id: "bot-1",
          },
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://example.com/api/eventsub",
          },
          cost: 0,
        },
        {
          id: "chat-2",
          status: "enabled",
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: "broadcaster-1",
            user_id: "bot-1",
          },
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://example.com/api/eventsub",
          },
          cost: 0,
        },
        {
          id: "support-1",
          status: "enabled",
          type: "channel.cheer",
          version: "1",
          condition: {
            broadcaster_user_id: "broadcaster-1",
          },
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://example.com/api/eventsub",
          },
          cost: 0,
        },
        {
          id: "chat-3",
          status: "enabled",
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: "broadcaster-2",
            user_id: "bot-1",
          },
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://example.com/api/eventsub",
          },
          cost: 0,
        },
      ],
      channelsByTwitchId: new Map([
        [
          "broadcaster-1",
          {
            id: "channel-1",
            twitchChannelId: "broadcaster-1",
            displayName: "Jimmy Pants",
            login: "jimmy_pants_",
            botReadyState: "active",
          },
        ],
        [
          "broadcaster-2",
          {
            id: "channel-2",
            twitchChannelId: "broadcaster-2",
            displayName: "Second Channel",
            login: "second_channel",
            botReadyState: "active",
          },
        ],
      ]),
    });

    expect(summary.totalRemoteSubscriptions).toBe(4);
    expect(summary.totalChatSubscriptions).toBe(3);
    expect(summary.channelsWithChatSubscription).toBe(2);
    expect(summary.channelsWithDuplicateChatSubscriptions).toBe(1);
    expect(summary.channels[0]).toMatchObject({
      channelId: "channel-1",
      displayName: "Jimmy Pants",
      chatSubscriptionCount: 2,
      totalSubscriptionCount: 3,
      duplicateChatSubscriptions: true,
      chatSubscriptionIds: ["chat-1", "chat-2"],
      chatBotUserIds: ["bot-1"],
      chatCallbacks: ["https://example.com/api/eventsub"],
    });
    expect(summary.channels[1]).toMatchObject({
      channelId: "channel-2",
      displayName: "Second Channel",
      chatSubscriptionCount: 1,
      totalSubscriptionCount: 1,
      duplicateChatSubscriptions: false,
      chatCallbacks: ["https://example.com/api/eventsub"],
    });
  });

  it("builds a safe cleanup plan for the current callback only", () => {
    const plan = buildAdminChatSubscriptionCleanupPlan({
      subscriptions: [
        {
          id: "chat-current-1",
          status: "enabled",
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: "broadcaster-1",
            user_id: "bot-1",
          },
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://dev.example.com/api/eventsub",
          },
          cost: 0,
        },
        {
          id: "chat-current-2",
          status: "enabled",
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: "broadcaster-1",
            user_id: "bot-1",
          },
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://dev.example.com/api/eventsub",
          },
          cost: 0,
        },
        {
          id: "chat-other-callback",
          status: "enabled",
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: "broadcaster-1",
            user_id: "bot-1",
          },
          created_at: "2026-01-01T00:00:00Z",
          transport: {
            method: "webhook",
            callback: "https://prod.example.com/api/eventsub",
          },
          cost: 0,
        },
      ],
      broadcasterUserId: "broadcaster-1",
      currentCallbackUrl: "https://dev.example.com/api/eventsub",
      currentBotUserId: "bot-1",
      shouldKeepCurrentCallbackSubscription: true,
    });

    expect(plan).toEqual({
      keepSubscriptionId: "chat-current-1",
      deleteSubscriptionIds: ["chat-current-2"],
      untouchedOtherCallbackSubscriptionIds: ["chat-other-callback"],
      currentCallbackSubscriptionIds: ["chat-current-1", "chat-current-2"],
      matchingCurrentCallbackSubscriptionIds: [
        "chat-current-1",
        "chat-current-2",
      ],
      otherCallbackSubscriptionIds: ["chat-other-callback"],
      totalChannelChatSubscriptions: 3,
      requiresReconcile: false,
    });
  });
});
