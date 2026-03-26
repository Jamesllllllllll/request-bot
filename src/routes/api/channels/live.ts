// Route: Returns the current list of live channels known to the app.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getLiveChannels } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getAppAccessToken, searchTwitchChannels } from "~/lib/twitch/api";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/channels/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const url = new URL(request.url);

        if (url.searchParams.get("source") === "rocksmith") {
          try {
            const appToken = await getAppAccessToken(runtimeEnv);
            const twitchChannels = await searchTwitchChannels({
              env: runtimeEnv,
              accessToken: appToken.access_token,
              query: "Rocksmith",
              first: 6,
              liveOnly: true,
            });

            return json({
              channels: toRocksmithDemoChannels(twitchChannels),
            });
          } catch (error) {
            console.error("Failed to fetch Rocksmith demo channels", {
              error: error instanceof Error ? error.message : String(error),
            });

            return json(
              { error: "Failed to fetch Rocksmith channels.", channels: [] },
              { status: 502 }
            );
          }
        }

        const channels = await getLiveChannels(runtimeEnv);
        return json({ channels });
      },
    },
  },
});

function toRocksmithDemoChannels(
  channels: Awaited<ReturnType<typeof searchTwitchChannels>>
) {
  const seenLogins = new Set<string>();

  return channels
    .filter((channel) => {
      const login = channel.broadcaster_login.trim().toLowerCase();
      if (!login || seenLogins.has(login)) {
        return false;
      }

      seenLogins.add(login);
      return true;
    })
    .map((channel) => {
      const login = channel.broadcaster_login.trim().toLowerCase();

      return {
        id: `rocksmith-${channel.id}`,
        slug: login,
        displayName: channel.display_name,
        login,
        playlistHref: `https://rsplaylist.com/playlist/${encodeURIComponent(channel.display_name || login)}/`,
        playlistExternal: true,
        streamTitle: channel.title ?? channel.game_name ?? null,
        streamThumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-640x360.jpg`,
        currentItem: null,
        nextItem: null,
      };
    });
}
