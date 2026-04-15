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
import { getExtensionBootstrapState } from "~/lib/server/extension-panel";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/extension/bootstrap")({
  server: {
    handlers: {
      OPTIONS: async () => extensionCorsPreflight(),
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const traceId = crypto.randomUUID();
        const startedAt = Date.now();
        const refreshCause =
          request.headers.get("x-extension-refresh-cause") ?? "unknown";
        let authMs: number | null = null;
        let auth: Awaited<
          ReturnType<typeof requireExtensionAuthFromRequest>
        > | null = null;

        console.info("Extension bootstrap request received", {
          traceId,
          origin: request.headers.get("origin"),
          refreshCause,
        });

        try {
          const authStartedAt = Date.now();
          auth = await requireExtensionAuthFromRequest({
            env: runtimeEnv,
            request,
          });
          authMs = Date.now() - authStartedAt;

          const responseBody = await getExtensionBootstrapState({
            env: runtimeEnv,
            auth,
            traceId,
          });
          const elapsedMs = Date.now() - startedAt;

          console.info("Extension bootstrap request completed", {
            traceId,
            elapsedMs,
            authMs,
            refreshCause,
            channelId: auth.channelId,
            role: auth.role,
            isLinked: auth.isLinked,
            connected: responseBody.connected,
            playlistItemCount: responseBody.playlist.items.length,
            currentItemId: responseBody.playlist.currentItemId,
            requestsEnabled: responseBody.settings.requestsEnabled,
            isLive: responseBody.channel?.isLive ?? null,
          });

          if (elapsedMs >= 1000) {
            console.info("Extension bootstrap request completed slowly", {
              traceId,
              elapsedMs,
              authMs,
              refreshCause,
              channelId: auth.channelId,
              role: auth.role,
              isLinked: auth.isLinked,
            });
          }

          return withExtensionCors(json(responseBody));
        } catch (error) {
          console.error("Extension bootstrap request failed", {
            traceId,
            elapsedMs: Date.now() - startedAt,
            authMs,
            status: getExtensionErrorStatus(error),
            origin: request.headers.get("origin"),
            refreshCause,
            channelId: auth?.channelId ?? null,
            role: auth?.role ?? null,
            isLinked: auth?.isLinked ?? null,
            error:
              error instanceof Error && error.message.trim()
                ? error.message
                : "Unknown extension bootstrap failure",
          });
          return toExtensionErrorResponse(error);
        }
      },
    },
  },
});
