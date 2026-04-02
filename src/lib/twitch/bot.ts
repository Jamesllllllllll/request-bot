import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  deleteEventSubSubscriptionRecord,
  getActiveBroadcasterAuthorizationForChannel,
  getBotAuthorization,
  getChannelById,
  getChannelSettingsByChannelId,
  getEventSubSubscription,
  parseAuthorizationScopes,
  setBotEnabled,
  setChannelLiveState,
  setTwitchChannelPointRewardId,
  upsertEventSubSubscription,
} from "~/lib/db/repositories";
import * as schema from "~/lib/db/schema";
import type { AppEnv, BackendEnv } from "~/lib/env";
import { getSentryD1Database } from "~/lib/sentry";
import {
  createCustomReward,
  createEventSubSubscription,
  deleteEventSubSubscription,
  getAppAccessToken,
  getLiveStream,
  listEventSubSubscriptions,
  TwitchApiError,
  updateCustomReward,
} from "~/lib/twitch/api";
import {
  getChannelPointRewardSetupIssue,
  getChannelPointRewardWarningCode,
} from "~/lib/twitch/channel-point-reward-warnings";
import {
  buildVipTokenChannelPointRewardDefinition,
  channelPointRewardManageScope,
  vipTokenChannelPointRewardSubscriptionType,
} from "~/lib/twitch/channel-point-rewards";
import { createId } from "~/lib/utils";

type RuntimeEnv = AppEnv | BackendEnv;

const STREAM_ONLINE = "stream.online";
const STREAM_OFFLINE = "stream.offline";
const CHAT_MESSAGE = "channel.chat.message";
const CHANNEL_SUBSCRIPTION_GIFT = "channel.subscription.gift";
const CHANNEL_SUBSCRIBE = "channel.subscribe";
const CHANNEL_SUBSCRIPTION_MESSAGE = "channel.subscription.message";
const CHANNEL_CHEER = "channel.cheer";
const CHANNEL_POINT_REWARD_REDEMPTION =
  vipTokenChannelPointRewardSubscriptionType;
const CHANNEL_RAID = "channel.raid";

type ChannelBotWarningCode =
  | "channel_point_reward_affiliate_or_partner_required"
  | "channel_point_reward_reward_limit_reached"
  | "channel_point_reward_reward_not_app_owned"
  | "channel_point_reward_reward_title_conflict"
  | "channel_point_reward_setup_failed";

export const twitchBotScopes = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
] as const;

const requiredBroadcasterBotScopes = [
  "channel:bot",
  "channel:read:subscriptions",
  "bits:read",
] as const;

function asAppEnv(env: RuntimeEnv) {
  return env as unknown as AppEnv;
}

function getDb(env: RuntimeEnv) {
  return drizzle(getSentryD1Database(env), { schema });
}

function getRequiredBroadcasterBotScopes(input?: {
  enableChannelPointRewards?: boolean;
}) {
  return [
    ...requiredBroadcasterBotScopes,
    ...(input?.enableChannelPointRewards
      ? [channelPointRewardManageScope]
      : []),
  ];
}

function hasRequiredBroadcasterBotScopes(
  scopesJson: string,
  input?: {
    enableChannelPointRewards?: boolean;
  }
) {
  const scopes = new Set(parseAuthorizationScopes(scopesJson));
  return getRequiredBroadcasterBotScopes(input).every((scope) =>
    scopes.has(scope)
  );
}

function hasChannelPointRewardManageScope(scopesJson: string) {
  return parseAuthorizationScopes(scopesJson).includes(
    channelPointRewardManageScope
  );
}

async function ensureSubscription(input: {
  env: RuntimeEnv;
  appAccessToken: string;
  channelId: string;
  subscriptionType:
    | typeof STREAM_ONLINE
    | typeof STREAM_OFFLINE
    | typeof CHAT_MESSAGE
    | typeof CHANNEL_SUBSCRIPTION_GIFT
    | typeof CHANNEL_SUBSCRIBE
    | typeof CHANNEL_SUBSCRIPTION_MESSAGE
    | typeof CHANNEL_CHEER
    | typeof CHANNEL_POINT_REWARD_REDEMPTION
    | typeof CHANNEL_RAID;
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
    | typeof CHAT_MESSAGE
    | typeof CHANNEL_SUBSCRIPTION_GIFT
    | typeof CHANNEL_SUBSCRIBE
    | typeof CHANNEL_SUBSCRIPTION_MESSAGE
    | typeof CHANNEL_CHEER
    | typeof CHANNEL_POINT_REWARD_REDEMPTION
    | typeof CHANNEL_RAID;
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
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_GIFT,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIBE,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_MESSAGE,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_CHEER,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_POINT_REWARD_REDEMPTION,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_RAID,
    }),
  ]);
}

async function removeVipAutomationSubscriptions(input: {
  env: RuntimeEnv;
  appAccessToken: string;
  channelId: string;
}) {
  await Promise.all([
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_GIFT,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIBE,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_MESSAGE,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_CHEER,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_POINT_REWARD_REDEMPTION,
    }),
    removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_RAID,
    }),
  ]);
}

async function syncVipTokenChannelPointReward(input: {
  env: RuntimeEnv;
  channelId: string;
  broadcasterUserId: string;
  broadcasterAccessToken: string;
  currentRewardId: string;
  cost: number;
  enabled: boolean;
}) {
  const definition = buildVipTokenChannelPointRewardDefinition({
    cost: input.cost,
    enabled: input.enabled,
  });

  const existingRewardId = input.currentRewardId.trim();
  if (!existingRewardId && !input.enabled) {
    return null;
  }

  const updateExistingReward = async (rewardId: string) =>
    updateCustomReward({
      env: asAppEnv(input.env),
      accessToken: input.broadcasterAccessToken,
      broadcasterUserId: input.broadcasterUserId,
      rewardId,
      title: definition.title,
      prompt: definition.prompt,
      cost: definition.cost,
      isEnabled: definition.isEnabled,
      shouldRedemptionsSkipRequestQueue:
        definition.shouldRedemptionsSkipRequestQueue,
    });

  if (existingRewardId) {
    const updatedReward = await updateExistingReward(existingRewardId);
    if (updatedReward) {
      return updatedReward.id;
    }

    await setTwitchChannelPointRewardId(
      asAppEnv(input.env),
      input.channelId,
      ""
    );
    if (!input.enabled) {
      return null;
    }
  }

  if (!input.enabled) {
    return null;
  }

  const createdReward = await createCustomReward({
    env: asAppEnv(input.env),
    accessToken: input.broadcasterAccessToken,
    broadcasterUserId: input.broadcasterUserId,
    title: definition.title,
    prompt: definition.prompt,
    cost: definition.cost,
    isEnabled: definition.isEnabled,
    shouldRedemptionsSkipRequestQueue:
      definition.shouldRedemptionsSkipRequestQueue,
  });

  if (!createdReward) {
    throw new Error("Twitch did not return a custom reward.");
  }

  await setTwitchChannelPointRewardId(
    asAppEnv(input.env),
    input.channelId,
    createdReward.id
  );

  return createdReward.id;
}

async function disableVipTokenChannelPointRewardIfPossible(input: {
  env: RuntimeEnv;
  channelId: string;
  broadcasterUserId: string;
  broadcasterAuth: {
    accessTokenEncrypted: string;
    scopes: string;
  } | null;
  settings:
    | {
        autoGrantVipTokensForChannelPointRewards: boolean;
        channelPointRewardCost: number;
        twitchChannelPointRewardId: string;
      }
    | null
    | undefined;
}) {
  if (
    !input.broadcasterAuth ||
    !input.settings?.twitchChannelPointRewardId ||
    !hasChannelPointRewardManageScope(input.broadcasterAuth.scopes)
  ) {
    return;
  }

  await syncVipTokenChannelPointReward({
    env: input.env,
    channelId: input.channelId,
    broadcasterUserId: input.broadcasterUserId,
    broadcasterAccessToken: input.broadcasterAuth.accessTokenEncrypted,
    currentRewardId: input.settings.twitchChannelPointRewardId,
    cost: input.settings.channelPointRewardCost,
    enabled: false,
  });
}

async function reconcileVipAutomationSubscriptions(input: {
  env: RuntimeEnv;
  appAccessToken: string;
  channelId: string;
  broadcasterUserId: string;
  broadcasterAccessToken: string;
  enableNewSubscriberTokens: boolean;
  enableGiftGifterTokens: boolean;
  enableGiftRecipientTokens: boolean;
  enableSharedSubRenewalMessageTokens: boolean;
  enableCheerTokens: boolean;
  enableChannelPointRewardTokens: boolean;
  channelPointRewardCost: number;
  currentChannelPointRewardId: string;
  enableRaidTokens: boolean;
}) {
  const warnings: ChannelBotWarningCode[] = [];

  if (input.enableGiftGifterTokens) {
    await ensureSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_GIFT,
      condition: {
        broadcaster_user_id: input.broadcasterUserId,
      },
    });
  } else {
    await removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_GIFT,
    });
  }

  if (input.enableNewSubscriberTokens || input.enableGiftRecipientTokens) {
    await ensureSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIBE,
      condition: {
        broadcaster_user_id: input.broadcasterUserId,
      },
    });
  } else {
    await removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIBE,
    });
  }

  if (input.enableSharedSubRenewalMessageTokens) {
    await ensureSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_MESSAGE,
      condition: {
        broadcaster_user_id: input.broadcasterUserId,
      },
    });
  } else {
    await removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_SUBSCRIPTION_MESSAGE,
    });
  }

  if (input.enableCheerTokens) {
    await ensureSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_CHEER,
      condition: {
        broadcaster_user_id: input.broadcasterUserId,
      },
    });
  } else {
    await removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_CHEER,
    });
  }

  if (input.enableChannelPointRewardTokens) {
    try {
      const rewardId = await syncVipTokenChannelPointReward({
        env: input.env,
        channelId: input.channelId,
        broadcasterUserId: input.broadcasterUserId,
        broadcasterAccessToken: input.broadcasterAccessToken,
        currentRewardId: input.currentChannelPointRewardId,
        cost: input.channelPointRewardCost,
        enabled: true,
      });

      if (!rewardId) {
        throw new Error("Twitch did not return a channel point reward id.");
      }

      if (rewardId !== input.currentChannelPointRewardId.trim()) {
        await removeSubscription({
          env: input.env,
          appAccessToken: input.appAccessToken,
          channelId: input.channelId,
          subscriptionType: CHANNEL_POINT_REWARD_REDEMPTION,
        });
      }

      await ensureSubscription({
        env: input.env,
        appAccessToken: input.appAccessToken,
        channelId: input.channelId,
        subscriptionType: CHANNEL_POINT_REWARD_REDEMPTION,
        condition: {
          broadcaster_user_id: input.broadcasterUserId,
          reward_id: rewardId,
        },
      });
    } catch (error) {
      const issue = getChannelPointRewardSetupIssue(error);
      const warningCode =
        getChannelPointRewardWarningCode(error) ??
        "channel_point_reward_setup_failed";

      console.error("Failed to sync VIP token channel point reward", {
        channelId: input.channelId,
        broadcasterUserId: input.broadcasterUserId,
        issue,
        error: error instanceof Error ? error.message : String(error),
      });

      await removeSubscription({
        env: input.env,
        appAccessToken: input.appAccessToken,
        channelId: input.channelId,
        subscriptionType: CHANNEL_POINT_REWARD_REDEMPTION,
      });

      warnings.push(warningCode);
    }
  } else {
    try {
      await syncVipTokenChannelPointReward({
        env: input.env,
        channelId: input.channelId,
        broadcasterUserId: input.broadcasterUserId,
        broadcasterAccessToken: input.broadcasterAccessToken,
        currentRewardId: input.currentChannelPointRewardId,
        cost: input.channelPointRewardCost,
        enabled: false,
      });
    } catch (error) {
      const issue = getChannelPointRewardSetupIssue(error);

      console.error("Failed to disable VIP token channel point reward", {
        channelId: input.channelId,
        broadcasterUserId: input.broadcasterUserId,
        issue,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_POINT_REWARD_REDEMPTION,
    });
  }

  if (input.enableRaidTokens) {
    await ensureSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_RAID,
      condition: {
        to_broadcaster_user_id: input.broadcasterUserId,
      },
    });
  } else {
    await removeSubscription({
      env: input.env,
      appAccessToken: input.appAccessToken,
      channelId: input.channelId,
      subscriptionType: CHANNEL_RAID,
    });
  }

  return warnings;
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
    getActiveBroadcasterAuthorizationForChannel(runtimeEnv, channelId),
    getBotAuthorization(runtimeEnv),
  ]);

  if (!channel || !settings) {
    throw new Error("Channel not found");
  }

  const appToken = await getAppAccessToken(runtimeEnv);

  if (!settings.botChannelEnabled) {
    await disableVipTokenChannelPointRewardIfPossible({
      env,
      channelId,
      broadcasterUserId: channel.twitchChannelId,
      broadcasterAuth,
      settings,
    });
    await removeAllSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId,
    });
    await setBotEnabled(runtimeEnv, channelId, false, "disabled");
    return { ok: true, state: "disabled" as const, warnings: [] };
  }

  if (!broadcasterAuth) {
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await removeVipAutomationSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId,
    });
    await setBotEnabled(
      runtimeEnv,
      channelId,
      false,
      "broadcaster_auth_required"
    );
    return {
      ok: true,
      state: "broadcaster_auth_required" as const,
      warnings: [],
    };
  }

  if (
    !hasRequiredBroadcasterBotScopes(broadcasterAuth.scopes, {
      enableChannelPointRewards:
        settings.autoGrantVipTokensForChannelPointRewards,
    })
  ) {
    await disableVipTokenChannelPointRewardIfPossible({
      env,
      channelId,
      broadcasterUserId: channel.twitchChannelId,
      broadcasterAuth,
      settings,
    });
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await removeVipAutomationSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId,
    });
    await setBotEnabled(
      runtimeEnv,
      channelId,
      false,
      "broadcaster_auth_required"
    );
    return {
      ok: true,
      state: "broadcaster_auth_required" as const,
      warnings: [],
    };
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

  let warnings: ChannelBotWarningCode[] = [];

  try {
    warnings = await reconcileVipAutomationSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      broadcasterUserId: channel.twitchChannelId,
      broadcasterAccessToken: broadcasterAuth.accessTokenEncrypted,
      enableNewSubscriberTokens: settings.autoGrantVipTokenToSubscribers,
      enableGiftGifterTokens: settings.autoGrantVipTokensToSubGifters,
      enableGiftRecipientTokens: settings.autoGrantVipTokensToGiftRecipients,
      enableSharedSubRenewalMessageTokens:
        settings.autoGrantVipTokensForSharedSubRenewalMessage,
      enableCheerTokens: settings.autoGrantVipTokensForCheers,
      enableChannelPointRewardTokens:
        settings.autoGrantVipTokensForChannelPointRewards,
      channelPointRewardCost: settings.channelPointRewardCost,
      currentChannelPointRewardId: settings.twitchChannelPointRewardId,
      enableRaidTokens: settings.autoGrantVipTokensForRaiders,
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
    await disableVipTokenChannelPointRewardIfPossible({
      env,
      channelId,
      broadcasterUserId: channel.twitchChannelId,
      broadcasterAuth,
      settings,
    });
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await removeVipAutomationSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId,
    });
    await setBotEnabled(runtimeEnv, channelId, false, "bot_auth_required");
    return {
      ok: true,
      state: "bot_auth_required" as const,
      warnings,
    };
  }

  if (!isLive && !allowOfflineTesting) {
    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId,
      subscriptionType: CHAT_MESSAGE,
    });
    await setBotEnabled(runtimeEnv, channelId, false, "waiting_for_live");
    return {
      ok: true,
      state: "waiting_for_live" as const,
      warnings,
    };
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
  return {
    ok: true,
    state: readyState as "active" | "active_offline_testing",
    warnings,
  };
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
    const [channelRecord, settings, broadcasterAuth] = await Promise.all([
      getChannelById(runtimeEnv, channel.id),
      getChannelSettingsByChannelId(runtimeEnv, channel.id),
      getActiveBroadcasterAuthorizationForChannel(runtimeEnv, channel.id),
    ]);

    if (channelRecord) {
      await disableVipTokenChannelPointRewardIfPossible({
        env,
        channelId: channel.id,
        broadcasterUserId: channelRecord.twitchChannelId,
        broadcasterAuth,
        settings,
      });
    }

    await removeSubscription({
      env,
      appAccessToken: appToken.access_token,
      channelId: channel.id,
      subscriptionType: CHAT_MESSAGE,
    });
    await removeVipAutomationSubscriptions({
      env,
      appAccessToken: appToken.access_token,
      channelId: channel.id,
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
