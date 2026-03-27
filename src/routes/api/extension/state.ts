import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import type { AppEnv } from "~/lib/env";
import { requireExtensionAuthFromRequest } from "~/lib/server/extension-auth";
import {
  extensionCorsPreflight,
  getExtensionErrorStatus,
  toExtensionErrorResponse,
  withExtensionCors,
} from "~/lib/server/extension-http";
import { getExtensionPanelState } from "~/lib/server/extension-panel";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/extension/state")({
  server: {
    handlers: {
      OPTIONS: async () => extensionCorsPreflight(),
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const traceId = crypto.randomUUID();
        const startedAt = Date.now();
        let authMs: number | null = null;
        let auth: Awaited<
          ReturnType<typeof requireExtensionAuthFromRequest>
        > | null = null;

        try {
          const authStartedAt = Date.now();
          auth = await requireExtensionAuthFromRequest({
            env: runtimeEnv,
            request,
          });
          authMs = Date.now() - authStartedAt;

          const responseBody = await getExtensionPanelState({
            env: runtimeEnv,
            auth,
            traceId,
          });
          const elapsedMs = Date.now() - startedAt;

          if (elapsedMs >= 750) {
            console.info("Extension state request completed slowly", {
              traceId,
              elapsedMs,
              authMs,
              channelId: auth.channelId,
              role: auth.role,
              isLinked: auth.isLinked,
            });
          }

          return withExtensionCors(json(responseBody));
        } catch (error) {
          console.error("Extension state request failed", {
            traceId,
            elapsedMs: Date.now() - startedAt,
            authMs,
            status: getExtensionErrorStatus(error),
            origin: request.headers.get("origin"),
            channelId: auth?.channelId ?? null,
            role: auth?.role ?? null,
            isLinked: auth?.isLinked ?? null,
            error:
              error instanceof Error && error.message.trim()
                ? error.message
                : "Unknown extension state failure",
          });
          return toExtensionErrorResponse(error);
        }
      },
    },
  },
});
