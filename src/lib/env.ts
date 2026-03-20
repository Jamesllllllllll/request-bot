export interface AppEnv {
  APP_URL: string;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  BACKEND_SERVICE: Fetcher;
  TWITCH_REPLY_QUEUE: Queue;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
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
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_EVENTSUB_SECRET: string;
  TWITCH_BOT_USERNAME: string;
  ADMIN_TWITCH_USER_IDS?: string;
}
