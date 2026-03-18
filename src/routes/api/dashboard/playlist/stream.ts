// Route: Streams dashboard playlist updates for the active managed channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import { getDashboardChannelAccess } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";

export const Route = createFileRoute("/api/dashboard/playlist/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const userId = await getSessionUserId(request, runtimeEnv);
        if (!userId) {
          return new Response("Unauthorized", { status: 401 });
        }

        const requestedSlug =
          new URL(request.url).searchParams.get("channel") ?? null;
        const access = await getDashboardChannelAccess(
          runtimeEnv,
          userId,
          requestedSlug
        );
        if (!access) {
          return new Response("Unauthorized", { status: 401 });
        }

        return callBackend(
          runtimeEnv,
          `/internal/playlist/stream?channelId=${encodeURIComponent(access.channel.id)}`,
          {
            method: "GET",
          }
        );
      },
    },
  },
});
