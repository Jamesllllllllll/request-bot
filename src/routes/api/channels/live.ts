// Route: Returns the current list of live channels known to the app.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getLiveChannels } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  getAppAccessToken,
  getLiveStreams,
  getTwitchUsersByLogins,
  searchTwitchChannels,
} from "~/lib/twitch/api";
import { ROCKSMITH_DEMO_LOGINS } from "~/lib/twitch/rocksmith-demo-logins";
import { json } from "~/lib/utils";

const FEATURED_DEMO_LOGIN = "younggun";
const ROCKSMITH_TAGS = new Set(["rocksmith", "rocksmith2014"]);
const ROCKSMITH_SEARCH_LIMIT = 100;
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
            const [curatedChannels, twitchChannels] = await Promise.all([
              getCuratedRocksmithDemoChannels({
                env: runtimeEnv,
                accessToken: appToken.access_token,
              }),
              searchTwitchChannels({
                env: runtimeEnv,
                accessToken: appToken.access_token,
                query: "Rocksmith",
                first: ROCKSMITH_SEARCH_LIMIT,
                liveOnly: true,
              }),
            ]);

            return json({
              channels: toRocksmithDemoChannels(
                curatedChannels,
                twitchChannels
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
  curatedChannels: HomeLiveChannel[],
  channels: Awaited<ReturnType<typeof searchTwitchChannels>>
) {
  const seenLogins = new Set<string>();
  const dedupedChannels = [
    ...curatedChannels,
    ...channels
      .filter((channel) => hasRocksmithTag(channel))
      .map((channel) => toRocksmithDemoChannel(channel)),
  ].filter((channel) => {
    const login = normalizeLogin(channel.login);
    if (!login || seenLogins.has(login)) {
      return false;
    }

    seenLogins.add(login);
    return true;
  });

  const featuredIndex = dedupedChannels.findIndex(
    (channel) => normalizeLogin(channel.login) === FEATURED_DEMO_LOGIN
  );

  if (featuredIndex > 0) {
    const [featuredChannel] = dedupedChannels.splice(featuredIndex, 1);
    dedupedChannels.unshift(featuredChannel);
  }

  return dedupedChannels.slice(0, ROCKSMITH_DEMO_RESULTS_LIMIT);
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
  const login = normalizeLogin(channel.broadcaster_login);

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

async function getCuratedRocksmithDemoChannels(input: {
  env: AppEnv;
  accessToken: string;
}) {
  const users = await getTwitchUsersByLogins({
    env: input.env,
    accessToken: input.accessToken,
    logins: [...ROCKSMITH_DEMO_LOGINS],
  });
  const liveStreams = await getLiveStreams({
    env: input.env,
    appAccessToken: input.accessToken,
    broadcasterUserIds: users.map((user) => user.id),
  });
  const liveStreamsByLogin = new Map(
    liveStreams.map((stream) => [normalizeLogin(stream.user_login), stream])
  );

  return ROCKSMITH_DEMO_LOGINS.map((login) => liveStreamsByLogin.get(login))
    .filter((stream) => stream != null)
    .map((stream) => toRocksmithDemoChannelFromLiveStream(stream));
}

function toRocksmithDemoChannelFromLiveStream(
  stream: Awaited<ReturnType<typeof getLiveStreams>>[number]
): HomeLiveChannel {
  const login = normalizeLogin(stream.user_login);

  return {
    id: `rocksmith-${stream.user_id}`,
    slug: login,
    displayName: stream.user_name,
    login,
    streamTitle: stream.title ?? null,
    streamThumbnailUrl: stream.thumbnail_url
      .replace("{width}", "640")
      .replace("{height}", "360"),
    currentItem: null,
    nextItem: null,
  };
}

function hasRocksmithTag(
  channel: Awaited<ReturnType<typeof searchTwitchChannels>>[number]
) {
  return (channel.tags ?? []).some((tag) =>
    ROCKSMITH_TAGS.has(tag.trim().toLowerCase())
  );
}

function normalizeLogin(login: string) {
  return login.trim().toLowerCase();
}
