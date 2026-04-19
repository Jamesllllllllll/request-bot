import type { AppEnv } from "~/lib/env";

const youtubeApiBaseUrl = "https://www.googleapis.com/youtube/v3";
const googleOauthTokenUrl = "https://oauth2.googleapis.com/token";
const retryableYouTubeStatuses = new Set([429, 500, 502, 503, 504]);

export const youtubeOAuthScopes = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
] as const;

export type YouTubeTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export type YouTubeChannelIdentity = {
  channelId: string;
  title: string;
  customUrl: string | null;
  thumbnailUrl: string | null;
};

export type YouTubeActiveBroadcast = {
  id: string;
  title: string;
  liveChatId: string;
  publishedAt: string | null;
};

export type YouTubeChatMessagePreview = {
  id: string;
  authorDisplayName: string;
  authorChannelId: string | null;
  messageText: string;
  publishedAt: string | null;
  isOwner: boolean;
  isModerator: boolean;
  isSponsor: boolean;
};

type YouTubeClientEnv = Pick<
  AppEnv,
  "YOUTUBE_CLIENT_ID" | "YOUTUBE_CLIENT_SECRET"
>;

type RawYouTubeBroadcast = {
  id?: string;
  snippet?: {
    title?: string;
    liveChatId?: string;
    publishedAt?: string;
  };
};

type RawYouTubeChannel = {
  id?: string;
  snippet?: {
    title?: string;
    customUrl?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
};

type RawYouTubeChatMessage = {
  id?: string;
  snippet?: {
    authorChannelId?: string;
    displayMessage?: string;
    publishedAt?: string;
  };
  authorDetails?: {
    channelId?: string;
    displayName?: string;
    isChatOwner?: boolean;
    isChatModerator?: boolean;
    isChatSponsor?: boolean;
  };
};

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

export function isYouTubeConfigured(env: AppEnv) {
  return Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET);
}

export async function exchangeYouTubeCodeForToken(
  env: AppEnv,
  code: string,
  redirectUri: string
) {
  const clientConfig = getYouTubeClientConfig(env);
  const response = await fetchWithRetry({
    url: googleOauthTokenUrl,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientConfig.clientId,
        client_secret: clientConfig.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Failed to exchange YouTube code for token: ${response.status} ${errorBody}`
    );
  }

  return (await response.json()) as YouTubeTokenResponse;
}

export async function refreshYouTubeAccessToken(
  env: AppEnv,
  refreshToken: string
) {
  const clientConfig = getYouTubeClientConfig(env);
  const response = await fetchWithRetry({
    url: googleOauthTokenUrl,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientConfig.clientId,
        client_secret: clientConfig.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Failed to refresh YouTube token: ${response.status} ${errorBody}`
    );
  }

  return (await response.json()) as YouTubeTokenResponse;
}

export async function getOwnYouTubeChannel(accessToken: string) {
  const response = await fetchWithRetry({
    url: new URL(
      `${youtubeApiBaseUrl}/channels?part=id,snippet&mine=true&maxResults=1`
    ),
    init: {
      headers: authHeaders(accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new YouTubeApiError(
      `Failed to load YouTube channel identity: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const payload = (await response.json()) as {
    items?: RawYouTubeChannel[];
  };
  const channel = payload.items?.[0];

  if (!channel?.id || !channel.snippet?.title) {
    throw new Error(
      "Connected Google account does not expose a YouTube channel."
    );
  }

  return {
    channelId: channel.id,
    title: channel.snippet.title,
    customUrl: channel.snippet.customUrl ?? null,
    thumbnailUrl:
      channel.snippet.thumbnails?.high?.url ??
      channel.snippet.thumbnails?.medium?.url ??
      channel.snippet.thumbnails?.default?.url ??
      null,
  } satisfies YouTubeChannelIdentity;
}

export async function getActiveYouTubeBroadcast(
  accessToken: string
): Promise<YouTubeActiveBroadcast | null> {
  const url = new URL(`${youtubeApiBaseUrl}/liveBroadcasts`);
  url.searchParams.set("part", "id,snippet,status");
  url.searchParams.set("broadcastStatus", "active");
  url.searchParams.set("broadcastType", "all");
  url.searchParams.set("mine", "true");

  const response = await fetchWithRetry({
    url,
    init: {
      headers: authHeaders(accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new YouTubeApiError(
      `Failed to load active YouTube broadcasts: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const payload = (await response.json()) as {
    items?: RawYouTubeBroadcast[];
  };

  return selectActiveYouTubeBroadcast(payload.items ?? []);
}

export async function listYouTubeLiveChatMessages(
  accessToken: string,
  liveChatId: string
) {
  const url = new URL(`${youtubeApiBaseUrl}/liveChat/messages`);
  url.searchParams.set("part", "id,snippet,authorDetails");
  url.searchParams.set("liveChatId", liveChatId);
  url.searchParams.set("maxResults", "20");

  const response = await fetchWithRetry({
    url,
    init: {
      headers: authHeaders(accessToken),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new YouTubeApiError(
      `Failed to load YouTube live chat messages: ${response.status}`,
      response.status,
      errorBody
    );
  }

  const payload = (await response.json()) as {
    items?: RawYouTubeChatMessage[];
  };

  return (payload.items ?? [])
    .map((item) => {
      const authorDisplayName = item.authorDetails?.displayName?.trim();
      const messageText = item.snippet?.displayMessage?.trim();

      if (!item.id || !authorDisplayName || !messageText) {
        return null;
      }

      return {
        id: item.id,
        authorDisplayName,
        authorChannelId:
          item.authorDetails?.channelId ??
          item.snippet?.authorChannelId ??
          null,
        messageText,
        publishedAt: item.snippet?.publishedAt ?? null,
        isOwner: !!item.authorDetails?.isChatOwner,
        isModerator: !!item.authorDetails?.isChatModerator,
        isSponsor: !!item.authorDetails?.isChatSponsor,
      } satisfies YouTubeChatMessagePreview;
    })
    .filter((item): item is YouTubeChatMessagePreview => item !== null);
}

export async function sendYouTubeLiveChatMessage(
  accessToken: string,
  input: {
    liveChatId: string;
    messageText: string;
  }
) {
  const response = await fetchWithRetry({
    url: `${youtubeApiBaseUrl}/liveChat/messages?part=snippet`,
    init: {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        snippet: {
          liveChatId: input.liveChatId,
          type: "textMessageEvent",
          textMessageDetails: {
            messageText: input.messageText,
          },
        },
      }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new YouTubeApiError(
      `Failed to send YouTube live chat message: ${response.status}`,
      response.status,
      errorBody
    );
  }

  return (await response.json()) as {
    id?: string;
    snippet?: {
      displayMessage?: string;
      publishedAt?: string;
    };
  };
}

export function selectActiveYouTubeBroadcast(
  items: RawYouTubeBroadcast[]
): YouTubeActiveBroadcast | null {
  for (const item of items) {
    const id = item.id?.trim();
    const liveChatId = item.snippet?.liveChatId?.trim();

    if (!id || !liveChatId) {
      continue;
    }

    return {
      id,
      liveChatId,
      title: item.snippet?.title?.trim() || "Live broadcast",
      publishedAt: item.snippet?.publishedAt ?? null,
    };
  }

  return null;
}

function getYouTubeClientConfig(env: YouTubeClientEnv) {
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("YouTube OAuth is not configured.");
  }

  return {
    clientId,
    clientSecret,
  };
}

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
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
        !retryableYouTubeStatuses.has(response.status) ||
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
    : new Error("YouTube request failed");
}
