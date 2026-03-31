import type { CloudflareOptions } from "@sentry/cloudflare";
import { instrumentD1WithSentry } from "@sentry/cloudflare";

type SentryRuntimeEnv = {
  DB: D1Database;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  SENTRY_RELEASE?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
};

const instrumentedDatabases = new WeakMap<D1Database, D1Database>();

export function getSentryOptions(
  env: Pick<
    SentryRuntimeEnv,
    | "SENTRY_DSN"
    | "SENTRY_ENVIRONMENT"
    | "SENTRY_TRACES_SAMPLE_RATE"
    | "SENTRY_RELEASE"
    | "CF_VERSION_METADATA"
  >
): CloudflareOptions | undefined {
  if (!shouldEnableSentry(env)) {
    return undefined;
  }

  return {
    dsn: env.SENTRY_DSN,
    environment: getSentryEnvironment(env.SENTRY_ENVIRONMENT),
    release: getSentryRelease(env),
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
  };
}

export function getSentryD1Database(env: SentryRuntimeEnv) {
  if (!shouldEnableSentry(env)) {
    return env.DB;
  }

  const cached = instrumentedDatabases.get(env.DB);
  if (cached) {
    return cached;
  }

  const instrumented = instrumentD1WithSentry(env.DB);
  instrumentedDatabases.set(env.DB, instrumented);
  return instrumented;
}

function shouldEnableSentry(
  env: Pick<SentryRuntimeEnv, "SENTRY_DSN" | "SENTRY_ENVIRONMENT">
) {
  return (
    hasSentryDsn(env) &&
    getSentryEnvironment(env.SENTRY_ENVIRONMENT) !== "development"
  );
}

function hasSentryDsn(env: Pick<SentryRuntimeEnv, "SENTRY_DSN">) {
  return typeof env.SENTRY_DSN === "string" && env.SENTRY_DSN.length > 0;
}

function parseSampleRate(value?: string) {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return 0;
  }

  return parsed;
}

function getSentryRelease(
  env: Pick<SentryRuntimeEnv, "SENTRY_RELEASE" | "CF_VERSION_METADATA">
) {
  return (
    env.SENTRY_RELEASE ||
    env.CF_VERSION_METADATA?.id ||
    env.CF_VERSION_METADATA?.tag
  );
}

function getSentryEnvironment(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized || "development";
}
