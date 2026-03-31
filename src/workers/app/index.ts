import { withSentry } from "@sentry/cloudflare";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import type { AppEnv } from "~/lib/env";
import { getSentryOptions } from "~/lib/sentry";

const appHandler = createStartHandler(defaultStreamHandler);

const rawHandler = {
  async fetch(request, env, ctx) {
    void env;
    void ctx;
    return appHandler(request);
  },
} satisfies ExportedHandler<AppEnv>;

const sentryHandler = withSentry<AppEnv>((env) => getSentryOptions(env), {
  async fetch(request, env, ctx) {
    return rawHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<AppEnv>);

export default {
  async fetch(request, env, ctx) {
    if (!getSentryOptions(env)) {
      return rawHandler.fetch(request, env, ctx);
    }

    const sentryFetch = sentryHandler.fetch;
    if (!sentryFetch) {
      return rawHandler.fetch(request, env, ctx);
    }

    return sentryFetch(request, env, ctx);
  },
} satisfies ExportedHandler<AppEnv>;
