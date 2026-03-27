import type { AppEnv } from "~/lib/env";
import type {
  EventSubChatMessageEvent,
  EventSubCheerEvent,
  EventSubStreamOfflineEvent,
  EventSubStreamOnlineEvent,
  EventSubSubscribeEvent,
  EventSubSubscriptionGiftEvent,
  TwitchBroadcasterSubscriptionsResponse,
  TwitchChannelSearchResponse,
  TwitchChattersResponse,
  TwitchEventSubCreateResponse,
  TwitchEventSubListResponse,
  TwitchModeratedChannelsResponse,
  TwitchStreamsResponse,
  TwitchTokenResponse,
  TwitchUserResponse,
} from "./types";

const twitchBaseUrl = "https://api.twitch.tv/helix";
const oauthBaseUrl = "https://id.twitch.tv/oauth2";
const retryableTwitchStatuses = new Set([429, 500, 502, 503, 504]);

type TwitchClientEnv = Pick<AppEnv, "TWITCH_CLIENT_ID">;

export class TwitchApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "TwitchApiError";
  }
}

function authHeaders(env: TwitchClientEnv, accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": env.TWITCH_CLIENT_ID,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
}

async function fetchWithRetry(input: {
  url: string | URL;
  init?: RequestInit;
  maxRetries?: number;
  baseDelayMs?: number;
}) {
  const maxRetries = input.maxRetries ?? 3;
  const baseDelayMs = input.baseDelayMs ?? 500;
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(input.url, input.init);
      lastResponse = response;

      if (
        response.ok ||
        !retryableTwitchStatuses.has(response.status) ||
        attempt === maxRetries
      ) {
        return response;
      }

      const retryAfterMs =
        parseRetryAfterMs(response.headers.get("retry-after")) ??
        baseDelayMs * 2 ** attempt;
      await sleep(retryAfterMs);
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Twitch request failed");
}

export async function exchangeCodeForToken(
  env: AppEnv,
  code: string,
  redirectUri: string
) {
  const response = await fetch(`${oauthBaseUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Twitch token exchange failed: ${response.status} ${errorBody}`
    );
  }

  return (await response.json()) as TwitchTokenResponse;
}

export async function getTwitchUser(env: AppEnv, accessToken: string) {
  const response = await fetch(`${twitchBaseUrl}/users`, {
    headers: authHeaders(env, accessToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Twitch user: ${response.status}`);
  }

  const payload = (await response.json()) as TwitchUserResponse;
  const [user] = payload.data;

  if (!user) {
    throw new Error("Twitch user response was empty");
  }

  return user;
}

export async function getTwitchUserByLogin(input: {
  env: AppEnv;
  accessToken: string;
  login: string;
}) {
  const url = new URL(`${twitchBaseUrl}/users`);
  url.searchParams.set("login", input.login);

  const response = await fetchWithRetry({
    url,
    init: {
      headers: authHeaders(input.env, input.accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new TwitchApiError(
      `Failed to fetch Twitch user by login: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const payload = (await response.json()) as TwitchUserResponse;
  return payload.data[0] ?? null;
}

export async function getTwitchUserById(input: {
  env: AppEnv;
  accessToken: string;
  id: string;
}) {
  const url = new URL(`${twitchBaseUrl}/users`);
  url.searchParams.set("id", input.id);

  const response = await fetchWithRetry({
    url,
    init: {
      headers: authHeaders(input.env, input.accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new TwitchApiError(
      `Failed to fetch Twitch user by id: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const payload = (await response.json()) as TwitchUserResponse;
  return payload.data[0] ?? null;
}

export async function searchTwitchChannels(input: {
  env: AppEnv;
  accessToken: string;
  query: string;
  first?: number;
  liveOnly?: boolean;
}) {
  const url = new URL(`${twitchBaseUrl}/search/channels`);
  url.searchParams.set("query", input.query);
  url.searchParams.set("first", String(Math.min(input.first ?? 8, 100)));
  if (input.liveOnly) {
    url.searchParams.set("live_only", "true");
  }

  const response = await fetchWithRetry({
    url,
    init: {
      headers: authHeaders(input.env, input.accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new TwitchApiError(
      `Failed to search Twitch channels: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const payload = (await response.json()) as TwitchChannelSearchResponse;
  return payload.data;
}

export async function getChatters(input: {
  env: AppEnv;
  accessToken: string;
  broadcasterUserId: string;
  moderatorUserId: string;
  first?: number;
  after?: string;
}) {
  const url = new URL(`${twitchBaseUrl}/chat/chatters`);
  url.searchParams.set("broadcaster_id", input.broadcasterUserId);
  url.searchParams.set("moderator_id", input.moderatorUserId);
  url.searchParams.set("first", String(Math.min(input.first ?? 100, 1000)));
  if (input.after) {
    url.searchParams.set("after", input.after);
  }

  const response = await fetchWithRetry({
    url,
    init: {
      headers: authHeaders(input.env, input.accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new TwitchApiError(
      `Failed to fetch Twitch chatters: ${response.status}`,
      response.status,
      errorBody
    );
  }

  return (await response.json()) as TwitchChattersResponse;
}

export async function getBroadcasterSubscriptions(input: {
  env: AppEnv;
  accessToken: string;
  broadcasterUserId: string;
  userIds?: string[];
}) {
  const url = new URL(`${twitchBaseUrl}/subscriptions`);
  url.searchParams.set("broadcaster_id", input.broadcasterUserId);

  for (const userId of [...new Set(input.userIds ?? [])].slice(0, 100)) {
    url.searchParams.append("user_id", userId);
  }

  const response = await fetchWithRetry({
    url,
    init: {
      headers: authHeaders(input.env, input.accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new TwitchApiError(
      `Failed to fetch broadcaster subscriptions: ${response.status}`,
      response.status,
      errorBody
    );
  }

  return (await response.json()) as TwitchBroadcasterSubscriptionsResponse;
}

export async function getAppAccessToken(env: AppEnv) {
  const response = await fetchWithRetry({
    url: `${oauthBaseUrl}/token`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to create app token: ${response.status} ${errorBody}`
    );
  }

  return (await response.json()) as TwitchTokenResponse;
}

export async function refreshAccessToken(env: AppEnv, refreshToken: string) {
  const response = await fetchWithRetry({
    url: `${oauthBaseUrl}/token`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to refresh Twitch token: ${response.status} ${errorBody}`
    );
  }

  return (await response.json()) as TwitchTokenResponse;
}

export async function createEventSubSubscription(input: {
  env: AppEnv;
  appAccessToken: string;
  type:
    | "channel.chat.message"
    | "channel.cheer"
    | "channel.subscribe"
    | "channel.subscription.gift"
    | "stream.online"
    | "stream.offline";
  condition: Record<string, string>;
}) {
  const response = await fetch(`${twitchBaseUrl}/eventsub/subscriptions`, {
    method: "POST",
    headers: authHeaders(input.env, input.appAccessToken),
    body: JSON.stringify({
      type: input.type,
      version: "1",
      condition: input.condition,
      transport: {
        method: "webhook",
        callback: `${input.env.APP_URL}/api/eventsub`,
        secret: input.env.TWITCH_EVENTSUB_SECRET,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new TwitchApiError(
      `Failed to create EventSub subscription: ${response.status} ${errorBody}`,
      response.status,
      errorBody
    );
  }

  return (await response.json()) as TwitchEventSubCreateResponse;
}

export async function listEventSubSubscriptions(input: {
  env: AppEnv;
  appAccessToken: string;
  type?:
    | "channel.chat.message"
    | "channel.cheer"
    | "channel.subscribe"
    | "channel.subscription.gift"
    | "stream.online"
    | "stream.offline";
}) {
  const subscriptions: TwitchEventSubListResponse["data"] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${twitchBaseUrl}/eventsub/subscriptions`);
    if (input.type) {
      url.searchParams.set("type", input.type);
    }
    if (cursor) {
      url.searchParams.set("after", cursor);
    }

    const response = await fetch(url, {
      headers: authHeaders(input.env, input.appAccessToken),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new TwitchApiError(
        `Failed to list EventSub subscriptions: ${response.status} ${errorBody}`,
        response.status,
        errorBody
      );
    }

    const payload = (await response.json()) as TwitchEventSubListResponse;
    subscriptions.push(...payload.data);
    cursor = payload.pagination?.cursor ?? null;
  } while (cursor);

  return subscriptions;
}

export async function deleteEventSubSubscription(input: {
  env: AppEnv;
  appAccessToken: string;
  subscriptionId: string;
}) {
  const url = new URL(`${twitchBaseUrl}/eventsub/subscriptions`);
  url.searchParams.set("id", input.subscriptionId);

  const response = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(input.env, input.appAccessToken),
  });

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to delete EventSub subscription: ${response.status} ${errorBody}`
    );
  }
}

export async function getLiveStream(input: {
  env: AppEnv;
  appAccessToken: string;
  broadcasterUserId: string;
}) {
  const url = new URL(`${twitchBaseUrl}/streams`);
  url.searchParams.set("user_id", input.broadcasterUserId);

  const response = await fetch(url, {
    headers: authHeaders(input.env, input.appAccessToken),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch stream status: ${response.status} ${errorBody}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ id: string; type: string }>;
  };
  return payload.data?.[0] ?? null;
}

export async function getModeratedChannels(input: {
  env: AppEnv;
  accessToken: string;
  userId: string;
}) {
  const channels: TwitchModeratedChannelsResponse["data"] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${twitchBaseUrl}/moderation/channels`);
    url.searchParams.set("first", "100");
    url.searchParams.set("user_id", input.userId);
    if (cursor) {
      url.searchParams.set("after", cursor);
    }

    const response = await fetch(url, {
      headers: authHeaders(input.env, input.accessToken),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new TwitchApiError(
        `Failed to fetch moderated channels: ${response.status}`,
        response.status,
        errorBody
      );
    }

    const payload = (await response.json()) as TwitchModeratedChannelsResponse;
    channels.push(...payload.data);
    cursor = payload.pagination?.cursor ?? null;
  } while (cursor);

  return channels;
}

export async function getLiveStreams(input: {
  env: AppEnv;
  appAccessToken: string;
  broadcasterUserIds: string[];
}) {
  const streams: TwitchStreamsResponse["data"] = [];

  for (const userIdBatch of chunkArray(input.broadcasterUserIds, 100)) {
    if (!userIdBatch.length) {
      continue;
    }

    const url = new URL(`${twitchBaseUrl}/streams`);
    for (const userId of userIdBatch) {
      url.searchParams.append("user_id", userId);
    }

    const response = await fetch(url, {
      headers: authHeaders(input.env, input.appAccessToken),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new TwitchApiError(
        `Failed to fetch live streams: ${response.status}`,
        response.status,
        errorBody
      );
    }

    const payload = (await response.json()) as TwitchStreamsResponse;
    streams.push(...payload.data);
  }

  return streams;
}

export async function sendChatReply(input: {
  env: TwitchClientEnv;
  accessToken: string;
  broadcasterUserId: string;
  senderUserId: string;
  message: string;
}) {
  const response = await fetchWithRetry({
    url: `${twitchBaseUrl}/chat/messages`,
    init: {
      method: "POST",
      headers: authHeaders(input.env, input.accessToken),
      body: JSON.stringify({
        broadcaster_id: input.broadcasterUserId,
        sender_id: input.senderUserId,
        message: input.message,
      }),
    },
    maxRetries: 4,
    baseDelayMs: 750,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Failed to send chat reply: ${response.status}${errorBody ? ` ${errorBody}` : ""}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{
      message_id?: string;
      is_sent?: boolean;
      drop_reason?: {
        code?: string;
        message?: string;
      } | null;
    }>;
  };
  const result = payload.data?.[0];

  if (!result?.is_sent) {
    const dropCode = result?.drop_reason?.code;
    const dropMessage = result?.drop_reason?.message;
    throw new Error(
      `Chat reply accepted by Twitch API but not sent${dropCode || dropMessage ? `: ${dropCode ?? "unknown"}${dropMessage ? ` ${dropMessage}` : ""}` : "."}`
    );
  }

  return {
    messageId: result.message_id ?? null,
  };
}

export function isChatMessageEvent(
  payload: unknown
): payload is { event: EventSubChatMessageEvent } {
  return isEventType(payload, "channel.chat.message");
}

export function isStreamOnlineEvent(
  payload: unknown
): payload is { event: EventSubStreamOnlineEvent } {
  return isEventType(payload, "stream.online");
}

export function isStreamOfflineEvent(
  payload: unknown
): payload is { event: EventSubStreamOfflineEvent } {
  return isEventType(payload, "stream.offline");
}

export function isSubscriptionGiftEvent(
  payload: unknown
): payload is { event: EventSubSubscriptionGiftEvent } {
  return isEventType(payload, "channel.subscription.gift");
}

export function isChannelSubscribeEvent(
  payload: unknown
): payload is { event: EventSubSubscribeEvent } {
  return isEventType(payload, "channel.subscribe");
}

export function isChannelCheerEvent(
  payload: unknown
): payload is { event: EventSubCheerEvent } {
  return isEventType(payload, "channel.cheer");
}

function isEventType(payload: unknown, eventType: string) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("event" in payload) ||
    !("subscription" in payload)
  ) {
    return false;
  }

  const subscription = (payload as { subscription?: { type?: string } })
    .subscription;
  return subscription?.type === eventType;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
