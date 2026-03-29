// Route: Returns the current list of live channels known to the app.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getLiveChannels } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { getAppAccessToken, searchTwitchChannels } from "~/lib/twitch/api";
import { json } from "~/lib/utils";

const FEATURED_DEMO_LOGIN = "younggun";
const ROCKSMITH_TAG = "rocksmith";
const ROCKSMITH_SEARCH_LIMIT = 24;
const ROCKSMITH_DEMO_RESULTS_LIMIT = 6;

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
              first: ROCKSMITH_SEARCH_LIMIT,
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
    ...channels
      .filter((channel) => hasRocksmithTag(channel))
      .slice(0, ROCKSMITH_DEMO_RESULTS_LIMIT)
      .map((channel) => toRocksmithDemoChannel(channel)),
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
  const channels = await searchTwitchChannels({
    env: input.env,
    accessToken: input.accessToken,
    query: FEATURED_DEMO_LOGIN,
    first: 20,
  });

  const featuredChannel = channels.find((channel) => {
    const login = channel.broadcaster_login.trim().toLowerCase();

    return (
      login === FEATURED_DEMO_LOGIN &&
      channel.is_live === true &&
      hasRocksmithTag(channel)
    );
  });

  if (!featuredChannel) {
    return null;
  }

  const login = featuredChannel.broadcaster_login.trim().toLowerCase();

  return {
    id: `rocksmith-${featuredChannel.id}`,
    slug: login,
    displayName: featuredChannel.display_name,
    login,
    streamTitle: featuredChannel.title || featuredChannel.game_name || null,
    streamThumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-640x360.jpg`,
    currentItem: null,
    nextItem: null,
  } satisfies HomeLiveChannel;
}

function hasRocksmithTag(
  channel: Awaited<ReturnType<typeof searchTwitchChannels>>[number]
) {
  return (channel.tags ?? []).some(
    (tag) => tag.trim().toLowerCase() === ROCKSMITH_TAG
  );
}
