// Route: Returns the current list of live channels known to the app.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getLiveChannels } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  getAppAccessToken,
  getLiveStreams,
  getTwitchUserByLogin,
  searchTwitchChannels,
} from "~/lib/twitch/api";
import { json } from "~/lib/utils";

const FEATURED_DEMO_LOGIN = "younggun";

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
            const featuredChannel = await getFeaturedRocksmithDemoChannel({
              env: runtimeEnv,
              accessToken: appToken.access_token,
            });

            return json({
              channels: toRocksmithDemoChannels(
                twitchChannels,
                featuredChannel
              ),
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
  channels: Awaited<ReturnType<typeof searchTwitchChannels>>,
  featuredChannel?: HomeLiveChannel | null
) {
  const seenLogins = new Set<string>();
  const orderedChannels = [
    ...(featuredChannel ? [featuredChannel] : []),
    ...channels.map((channel) => toRocksmithDemoChannel(channel)),
  ];

  return orderedChannels.filter((channel) => {
    const login = channel.login.trim().toLowerCase();
    if (!login || seenLogins.has(login)) {
      return false;
    }

    seenLogins.add(login);
    return true;
  });
}

type HomeLiveChannel = {
  id: string;
  slug: string;
  displayName: string;
  login: string;
  playlistHref?: string | null;
  playlistExternal?: boolean;
  streamTitle?: string | null;
  streamThumbnailUrl?: string | null;
  currentItem?: {
    title: string;
    artist?: string | null;
  } | null;
  nextItem?: {
    title: string;
    artist?: string | null;
  } | null;
};

function toRocksmithDemoChannel(
  channel: Awaited<ReturnType<typeof searchTwitchChannels>>[number]
): HomeLiveChannel {
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
}

async function getFeaturedRocksmithDemoChannel(input: {
  env: AppEnv;
  accessToken: string;
}) {
  const user = await getTwitchUserByLogin({
    env: input.env,
    accessToken: input.accessToken,
    login: FEATURED_DEMO_LOGIN,
  });

  if (!user) {
    return null;
  }

  const [stream] = await getLiveStreams({
    env: input.env,
    appAccessToken: input.accessToken,
    broadcasterUserIds: [user.id],
  });

  if (!stream) {
    return null;
  }

  const login = user.login.trim().toLowerCase();

  return {
    id: `rocksmith-${user.id}`,
    slug: login,
    displayName: user.display_name || user.login,
    login,
    playlistHref: `https://rsplaylist.com/playlist/${encodeURIComponent(user.display_name || login)}/`,
    playlistExternal: true,
    streamTitle: stream.title || null,
    streamThumbnailUrl: stream.thumbnail_url
      ? stream.thumbnail_url
          .replace("{width}", "640")
          .replace("{height}", "360")
      : `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-640x360.jpg`,
    currentItem: null,
    nextItem: null,
  } satisfies HomeLiveChannel;
}
