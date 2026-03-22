import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  deleteEventSubSubscriptionRecord,
  getAuthorizationForChannel,
  getBotAuthorization,
  getChannelById,
  getChannelSettingsByChannelId,
  getEventSubSubscription,
  parseAuthorizationScopes,
  setBotEnabled,
  setChannelLiveState,
  upsertEventSubSubscription,
} from "~/lib/db/repositories";
import * as schema from "~/lib/db/schema";
import type { AppEnv, BackendEnv } from "~/lib/env";
import { getSentryD1Database } from "~/lib/sentry";
import {
  createEventSubSubscription,
  deleteEventSubSubscription,
  getAppAccessToken,
  getLiveStream,
  listEventSubSubscriptions,
  TwitchApiError,
} from "~/lib/twitch/api";
import { createId } from "~/lib/utils";

type RuntimeEnv = AppEnv | BackendEnv;

const STREAM_ONLINE = "stream.online";
const STREAM_OFFLINE = "stream.offline";
const CHAT_MESSAGE = "channel.chat.message";

export const twitchBotScopes = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
] as const;

const requiredBroadcasterBotScopes = ["channel:bot"] as const;

function asAppEnv(env: RuntimeEnv) {
  return env as unknown as AppEnv;
}

function getDb(env: RuntimeEnv) {
  return drizzle(getSentryD1Database(env), { schema });
}

function hasRequiredBroadcasterBotScopes(scopesJson: string) {
  const scopes = new Set(parseAuthorizationScopes(scopesJson));
  return requiredBroadcasterBotScopes.every((scope) => scopes.has(scope));
}

async function ensureSubscription(input: {
  env: RuntimeEnv;
  appAccessToken: string;
  channelId: string;
  subscriptionType:
    | typeof STREAM_ONLINE
    | typeof STREAM_OFFLINE
    | typeof CHAT_MESSAGE;
  condition: Record<string, string>;
}) {
  const runtimeEnv = asAppEnv(input.env);
  const existing = await getEventSubSubscription(
    runtimeEnv,
    input.channelId,
    input.subscriptionType
  );

  if (existing) {
    await upsertEventSubSubscription(runtimeEnv, {
      channelId: input.channelId,
      subscriptionType: input.subscriptionType,
      twitchSubscriptionId: existing.twitchSubscriptionId,
      status: "enabled",
      errorMessage: null,
      lastVerifiedAt: Date.now(),
    });
    return existing;
  }

  let created: Awaited<ReturnType<typeof createEventSubSubscription>>;
  try {
    created = await createEventSubSubscription({
      env: runtimeEnv,
      appAccessToken: input.appAccessToken,
      type: input.subscriptionType,
      condition: input.condition,
    });
  } catch (error) {
    if (
      error instanceof TwitchApiError &&
      error.status === 409 &&
      error.body?.includes("subscription already exists")
    ) {
      const remoteSubscriptions = await listEventSubSubscriptions({
        env: runtimeEnv,
        appAccessToken: input.appAccessToken,
        type: input.subscriptionType,
      });
      const existingRemote = remoteSubscriptions.find((subscription) => {
        if (subscription.type !== input.subscriptionType) {
          return false;
        }

        const conditionMatches = Object.entries(input.condition).every(
          ([key, value]) => subscription.condition?.[key] === value
        );
        const callbackMatches =
          subscription.transport?.callback ===
          `${runtimeEnv.APP_URL}/api/eventsub`;

        return conditionMatches && callbackMatches;
      });

      if (!existingRemote) {
        throw error;
      }

      await upsertEventSubSubscription(runtimeEnv, {
        id: createId("esub"),
        channelId: input.channelId,
        subscriptionType: input.subscriptionType,
        twitchSubscriptionId: existingRemote.id,
        status: existingRemote.status,
        errorMessage: null,
        lastVerifiedAt: Date.now(),
      });

      return existingRemote;
    }

    throw error;
  }

  const subscription = created.data[0];
  if (!subscription) {
    throw new Error(
      `Twitch did not return a subscription id for ${input.subscriptionType}`
    );
  }

  await upsertEventSubSubscription(runtimeEnv, {
    id: createId("esub"),
    channelId: input.channelId,
    subscriptionType: input.subscriptionType,
    twitchSubscriptionId: subscription.id,
    status: subscription.status,
    errorMessage: null,
    lastVerifiedAt: Date.now(),
  });

  return subscription;
}

async function removeSubscription(input: {
  env: RuntimeEnv;
  appAccessToken: string;
  channelId: string;
  subscriptionType:
    | typeof STREAM_ONLINE
    | typeof STREAM_OFFLINE
    | typeof CHAT_MESSAGE;
}) {
  const runtimeEnv = asAppEnv(input.env);
  const existing = await getEventSubSubscription(
    runtimeEnv,
    input.channelId,
    input.subscriptionType
  );

  if (!existing) {
    return;
  }

  await deleteEventSubSubscription({
    env: runtimeEnv,
    appAccessToken: input.appAccessToken,
    subscriptionId: existing.twitchSubscriptionId,
  });
  await deleteEventSubSubscriptionRecord(
    runtimeEnv,
    input.channelId,
    input.subscriptionType
  );
}

async function ensureLifecycleSubscriptions(input: {
  env: RuntimeEnv;
  appAccessToken: string;
  channelId: string;
  broadcasterUserId: string;
}) {
  await ensureSubscription({
    env: input.env,
    appAccessToken: input.appAccessToken,
    channelId: input.channelId,
    subscriptionType: STREAM_ONLINE,
    condition: {
      broadcaster_user_id: input.broadcasterUserId,
    },
  });

  await ensureSubscription({
    env: input.env,
    appAccessToken: input.appAccessToken,
    channelId: input.channelId,
    subscriptionType: STREAM_OFFLINE,
    condition: {
      broadcaster_user_id: input.broadcasterUserId,
    },
  });
}

async function removeAllSubscriptions(input: {
  env: RuntimeEnv;
  appAccessToken: string;
  channelId: string;
}) {
  await Promise.all([
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: STREAM_ONLINE,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: STREAM_OFFLINE,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHAT_MESSAGE,
    }),
  ]);
}

export async function reconcileChannelBotState(
  env: RuntimeEnv,
  channelId: string,
  options?: { refreshLiveState?: boolean }
) {
  const runtimeEnv = asAppEnv(env);
  const [channel, settings, broadcasterAuth, botAuth] = await Promise.all([
    getChannelById(runtimeEnv, channelId),
    getChannelSettingsByChannelId(runtimeEnv, channelId),
    getAuthorizationForChannel(runtimeEnv, channelId),
    getBotAuthorization(runtimeEnv),
  ]);

  if (!channel || !settings) {
    throw new Error("Channel not found");
  }

  const appToken = await getAppAccessToken(runtimeEnv);

  if (!settings.botChannelEnabled) {
    await removeAllSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId,
    });
    await setBotEnabled(runtimeEnv, channelId, false, "disabled");
    return { ok: true, state: "disabled" as const };
  }

  if (!broadcasterAuth) {
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await setBotEnabled(
      runtimeEnv,
      channelId,
      false,
      "broadcaster_auth_required"
    );
    return { ok: true, state: "broadcaster_auth_required" as const };
  }

  if (!hasRequiredBroadcasterBotScopes(broadcasterAuth.scopes)) {
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await setBotEnabled(
      runtimeEnv,
      channelId,
      false,
      "broadcaster_auth_required"
    );
    return { ok: true, state: "broadcaster_auth_required" as const };
  }

  try {
    await ensureLifecycleSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      broadcasterUserId: channel.twitchChannelId,
    });
  } catch (error) {
    await setBotEnabled(runtimeEnv, channelId, false, "subscription_error");
    throw error;
  }

  let isLive = channel.isLive;
  if (options?.refreshLiveState) {
    const liveStream = await getLiveStream({
      env: runtimeEnv,
      appAccessToken: appToken.access_token,
      broadcasterUserId: channel.twitchChannelId,
    });
    isLive = !!liveStream;
    await setChannelLiveState(runtimeEnv, channelId, isLive);
  }

  const allowOfflineTesting = settings.adminForceBotWhileOffline;

  if (!botAuth) {
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await setBotEnabled(runtimeEnv, channelId, false, "bot_auth_required");
    return { ok: true, state: "bot_auth_required" as const };
  }

  if (!isLive && !allowOfflineTesting) {
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await setBotEnabled(runtimeEnv, channelId, false, "waiting_for_live");
    return { ok: true, state: "waiting_for_live" as const };
  }

  try {
    await ensureSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
      condition: {
        broadcaster_user_id: channel.twitchChannelId,
        user_id: botAuth.twitchUserId,
      },
    });
  } catch (error) {
    await setBotEnabled(runtimeEnv, channelId, false, "subscription_error");
    throw error;
  }

  const readyState = isLive ? "active" : "active_offline_testing";
  await setBotEnabled(runtimeEnv, channelId, true, readyState);
  return { ok: true, state: readyState as "active" | "active_offline_testing" };
}

export async function markChannelLiveAndReconcile(
  env: RuntimeEnv,
  broadcasterUserId: string
) {
  const db = getDb(env);
  const channel = await db.query.channels.findFirst({
    where: eq(schema.channels.twitchChannelId, broadcasterUserId),
  });

  if (!channel) {
    return null;
  }

  await setChannelLiveState(asAppEnv(env), channel.id, true);
  await reconcileChannelBotState(env, channel.id, { refreshLiveState: false });
  return channel;
}

export async function markChannelOfflineAndReconcile(
  env: RuntimeEnv,
  broadcasterUserId: string
) {
  const db = getDb(env);
  const channel = await db.query.channels.findFirst({
    where: eq(schema.channels.twitchChannelId, broadcasterUserId),
  });

  if (!channel) {
    return null;
  }

  await setChannelLiveState(asAppEnv(env), channel.id, false);
  await reconcileChannelBotState(env, channel.id, { refreshLiveState: false });
  return channel;
}

export async function isBotAuthorizationForConfiguredUser(
  env: RuntimeEnv,
  twitchLogin: string
) {
  return twitchLogin.toLowerCase() === env.TWITCH_BOT_USERNAME.toLowerCase();
}

export async function disconnectBotAuthFromReplies(env: RuntimeEnv) {
  const runtimeEnv = asAppEnv(env);
  const appToken = await getAppAccessToken(runtimeEnv);
  const db = getDb(env);
  const enabledChannels = await db
    .select({
      id: schema.channels.id,
    })
    .from(schema.channels)
    .innerJoin(
      schema.channelSettings,
      eq(schema.channelSettings.channelId, schema.channels.id)
    )
    .where(eq(schema.channelSettings.botChannelEnabled, true));

  for (const channel of enabledChannels) {
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId: channel.id,
      subscriptionType: CHAT_MESSAGE,
    });
    await setBotEnabled(runtimeEnv, channel.id, false, "bot_auth_required");
  }
}

export async function getBotAuthStatus(env: RuntimeEnv) {
  const botAuth = await getBotAuthorization(asAppEnv(env));

  return {
    connected: !!botAuth,
    twitchUserId: botAuth?.twitchUserId ?? null,
  };
}

export async function reconcileAllEnabledChannels(env: RuntimeEnv) {
  const db = getDb(env);
  const channelsToReconcile = await db
    .select({
      channelId: schema.channels.id,
    })
    .from(schema.channels)
    .innerJoin(
      schema.channelSettings,
      eq(schema.channelSettings.channelId, schema.channels.id)
    )
    .where(eq(schema.channelSettings.botChannelEnabled, true));

  for (const entry of channelsToReconcile) {
    try {
      await reconcileChannelBotState(env, entry.channelId, {
        refreshLiveState: true,
      });
    } catch (error) {
      console.error("Bot reconcile failed for channel", {
        channelId: entry.channelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
