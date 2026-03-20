import { withSentry } from "@sentry/cloudflare";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import type { AppEnv } from "~/lib/env";
import { getSentryOptions } from "~/lib/sentry";

const appHandler = createStartHandler(defaultStreamHandler);

export default withSentry<AppEnv>((env) => getSentryOptions(env), {
  async fetch(request, env, ctx) {
    void env;
    void ctx;
    return appHandler(request);
  },
} satisfies ExportedHandler<AppEnv>);
