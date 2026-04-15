// Route: Returns the current list of live channels known to the app.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { isAbortError, throwIfAborted } from "~/lib/abort";
import { getHomeLiveChannels } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import type {
  HomeLiveChannel,
  HomeLiveChannelsResponse,
} from "~/lib/home/community";
import {
  createRequestStageTimer,
  registerAbortTrace,
  serializeErrorForLog,
} from "~/lib/server/request-tracing";
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

export const Route = createFileRoute("/api/channels/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const traceId = crypto.randomUUID();
        const startedAt = Date.now();
        const timer = createRequestStageTimer();
        const url = new URL(request.url);
        const source = url.searchParams.get("source");
        const traceContext = {
          traceId,
          path: url.pathname,
          source,
        };

        console.info("Live channels request started", traceContext);
        const cleanupAbortTrace = registerAbortTrace(request.signal, () => {
          console.warn("Live channels request abort signaled", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
          });
        });

        if (source === "rocksmith") {
          try {
            throwIfAborted(request.signal);
            const appToken = await timer.measure("getAppAccessToken", () =>
              getAppAccessToken(runtimeEnv)
            );
            const [curatedChannels, twitchChannels] = await timer.measure(
              "loadRocksmithChannels",
              () =>
                Promise.all([
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
                ])
            );
            throwIfAborted(request.signal);
            const responseBody = {
              channels: toRocksmithDemoChannels(
                curatedChannels,
                twitchChannels
              ),
              community: null,
            } satisfies HomeLiveChannelsResponse;

            console.info("Live channels request completed", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
              channelCount: responseBody.channels.length,
            });

            return json(responseBody);
          } catch (error) {
            if (isAbortError(error)) {
              console.warn("Live channels request aborted", {
                ...traceContext,
                elapsedMs: Date.now() - startedAt,
                stageDurations: timer.stageDurations,
                error: serializeErrorForLog(error),
              });
              return new Response(null, { status: 499 });
            }

            console.error("Failed to fetch Rocksmith demo channels", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
              error: serializeErrorForLog(error),
            });

            return json(
              {
                error: "Failed to fetch Rocksmith channels.",
                channels: [],
                community: null,
              } satisfies HomeLiveChannelsResponse & { error: string },
              { status: 502 }
            );
          } finally {
            cleanupAbortTrace();
          }
        }

        try {
          throwIfAborted(request.signal);
          const responseBody = await timer.measure("getHomeLiveChannels", () =>
            getHomeLiveChannels(runtimeEnv)
          );
          throwIfAborted(request.signal);

          console.info("Live channels request completed", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
            channelCount: responseBody.channels.length,
            hasCommunity: responseBody.community != null,
          });

          return json(responseBody);
        } catch (error) {
          if (isAbortError(error)) {
            console.warn("Live channels request aborted", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
              error: serializeErrorForLog(error),
            });
            return new Response(null, { status: 499 });
          }

          console.error("Live channels request failed", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
            error: serializeErrorForLog(error),
          });
          throw error;
        } finally {
          cleanupAbortTrace();
        }
      },
    },
  },
});

export function toRocksmithDemoChannels(
  curatedChannels: HomeLiveChannel[],
  channels: Awaited<ReturnType<typeof searchTwitchChannels>>
) {
  const seenLogins = new Set<string>();
  const dedupedChannels = [
    ...curatedChannels,
    ...channels
      .filter((channel) => isEligibleRocksmithDemoSearchChannel(channel))
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

  return dedupedChannels;
}

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
    playedTodayCount: 0,
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
    liveStreams
      .filter((stream) => hasAllowedRocksmithCategory(stream.game_name))
      .map((stream) => [normalizeLogin(stream.user_login), stream])
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
    playedTodayCount: 0,
    currentItem: null,
    nextItem: null,
  };
}

export function isEligibleRocksmithDemoSearchChannel(
  channel: Awaited<ReturnType<typeof searchTwitchChannels>>[number]
) {
  return (
    hasRocksmithTag(channel) && hasAllowedRocksmithCategory(channel.game_name)
  );
}

function hasRocksmithTag(
  channel: Awaited<ReturnType<typeof searchTwitchChannels>>[number]
) {
  return (channel.tags ?? []).some((tag) =>
    ROCKSMITH_TAGS.has(tag.trim().toLowerCase())
  );
}

export function hasAllowedRocksmithCategory(gameName?: string | null) {
  const normalizedCategory = normalizeCategoryName(gameName);
  return (
    normalizedCategory === "music" || normalizedCategory.startsWith("rocksmith")
  );
}

function normalizeCategoryName(gameName?: string | null) {
  return (gameName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLogin(login: string) {
  return login.trim().toLowerCase();
}
