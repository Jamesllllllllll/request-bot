import {
  claimEventSubDelivery,
  getChannelByTwitchChannelId,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  markChannelLiveAndReconcile,
  markChannelOfflineAndReconcile,
} from "~/lib/twitch/bot";
import type {
  EventSubStreamOfflineEvent,
  EventSubStreamOnlineEvent,
} from "~/lib/twitch/types";

export interface EventSubStreamLifecycleDependencies {
  getChannelByTwitchChannelId(
    env: AppEnv,
    twitchChannelId: string
  ): Promise<{ id: string } | null>;
  claimEventSubDelivery(
    env: AppEnv,
    input: {
      channelId: string;
      messageId: string;
      subscriptionType: string;
    }
  ): Promise<boolean>;
  markChannelLiveAndReconcile(
    env: AppEnv,
    twitchChannelId: string
  ): Promise<unknown>;
  markChannelOfflineAndReconcile(
    env: AppEnv,
    twitchChannelId: string
  ): Promise<unknown>;
}

type EventSubStreamLifecycleResult =
  | { body: "Accepted"; status: 202 }
  | { body: "Duplicate"; status: 202 }
  | { body: "Channel not found"; status: 202 };

async function claimLifecycleDelivery(input: {
  env: AppEnv;
  deps: EventSubStreamLifecycleDependencies;
  twitchChannelId: string;
  messageId: string | null;
  subscriptionType: "stream.online" | "stream.offline";
}) {
  if (!input.messageId) {
    return { duplicate: false, channelId: null };
  }

  const channel = await input.deps.getChannelByTwitchChannelId(
    input.env,
    input.twitchChannelId
  );
  if (!channel) {
    return { duplicate: false, channelId: null, missingChannel: true };
  }

  const claimed = await input.deps.claimEventSubDelivery(input.env, {
    channelId: channel.id,
    messageId: input.messageId,
    subscriptionType: input.subscriptionType,
  });

  return {
    duplicate: !claimed,
    channelId: channel.id,
    missingChannel: false,
  };
}

export async function processEventSubStreamOnline(input: {
  env: AppEnv;
  deps: EventSubStreamLifecycleDependencies;
  messageId: string | null;
  event: EventSubStreamOnlineEvent;
}): Promise<EventSubStreamLifecycleResult> {
  const delivery = await claimLifecycleDelivery({
    env: input.env,
    deps: input.deps,
    twitchChannelId: input.event.broadcaster_user_id,
    messageId: input.messageId,
    subscriptionType: "stream.online",
  });

  if (delivery.missingChannel) {
    return { body: "Channel not found", status: 202 };
  }

  if (delivery.duplicate) {
    return { body: "Duplicate", status: 202 };
  }

  await input.deps.markChannelLiveAndReconcile(
    input.env,
    input.event.broadcaster_user_id
  );
  return { body: "Accepted", status: 202 };
}

export async function processEventSubStreamOffline(input: {
  env: AppEnv;
  deps: EventSubStreamLifecycleDependencies;
  messageId: string | null;
  event: EventSubStreamOfflineEvent;
}): Promise<EventSubStreamLifecycleResult> {
  const delivery = await claimLifecycleDelivery({
    env: input.env,
    deps: input.deps,
    twitchChannelId: input.event.broadcaster_user_id,
    messageId: input.messageId,
    subscriptionType: "stream.offline",
  });

  if (delivery.missingChannel) {
    return { body: "Channel not found", status: 202 };
  }

  if (delivery.duplicate) {
    return { body: "Duplicate", status: 202 };
  }

  await input.deps.markChannelOfflineAndReconcile(
    input.env,
    input.event.broadcaster_user_id
  );
  return { body: "Accepted", status: 202 };
}

export function createEventSubStreamLifecycleDependencies(): EventSubStreamLifecycleDependencies {
  return {
    getChannelByTwitchChannelId: async (env, twitchChannelId) =>
      (await getChannelByTwitchChannelId(env, twitchChannelId)) ?? null,
    claimEventSubDelivery,
    markChannelLiveAndReconcile,
    markChannelOfflineAndReconcile,
  };
}
