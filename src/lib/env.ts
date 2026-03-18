export interface AppEnv {
  APP_URL: string;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  BACKEND_SERVICE: Fetcher;
  TWITCH_REPLY_QUEUE: Queue;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_EVENTSUB_SECRET: string;
  TWITCH_BOT_USERNAME: string;
  TWITCH_SCOPES: string;
  SESSION_SECRET: string;
  ADMIN_TWITCH_USER_IDS?: string;
}

export interface BackendEnv {
  APP_URL: string;
  DB: D1Database;
  CHANNEL_PLAYLIST_DO: DurableObjectNamespace;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_EVENTSUB_SECRET: string;
  TWITCH_BOT_USERNAME: string;
  ADMIN_TWITCH_USER_IDS?: string;
}
