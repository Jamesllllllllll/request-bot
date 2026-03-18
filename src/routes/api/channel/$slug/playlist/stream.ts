// Route: Streams public playlist updates for a single channel by slug.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { callBackend } from "~/lib/backend";
import {
  getChannelBySlug,
  getChannelSettingsByChannelId,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";

export const Route = createFileRoute("/api/channel/$slug/playlist/stream")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const runtimeEnv = env as AppEnv;
        const channel = await getChannelBySlug(runtimeEnv, params.slug);
        if (!channel) {
          return new Response("Channel not found", { status: 404 });
        }

        const settings = await getChannelSettingsByChannelId(
          runtimeEnv,
          channel.id
        );
        if (settings && !settings.publicPlaylistEnabled) {
          return new Response("Playlist is private", { status: 403 });
        }

        return callBackend(
          runtimeEnv,
          `/internal/playlist/stream?channelId=${encodeURIComponent(channel.id)}`,
          {
            method: "GET",
          }
        );
      },
    },
  },
});
