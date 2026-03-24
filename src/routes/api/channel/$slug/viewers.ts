// Route: Returns current viewers for a managed channel playlist.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  getActiveBroadcasterAuthorizationForChannel,
  parseAuthorizationScopes,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { requirePlaylistManagementState } from "~/lib/server/playlist-management";
import { getChatters, TwitchApiError } from "~/lib/twitch/api";
import { json } from "~/lib/utils";

type ViewerMatch = {
  id: string;
  login: string;
  displayName: string;
};

async function searchCurrentChannelChatters(input: {
  runtimeEnv: AppEnv;
  accessToken: string;
  broadcasterUserId: string;
  moderatorUserId: string;
  query: string;
  limit: number;
}) {
  const matches: ViewerMatch[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  while (matches.length < input.limit && pageCount < 10) {
    const payload = await getChatters({
      env: input.runtimeEnv,
      accessToken: input.accessToken,
      broadcasterUserId: input.broadcasterUserId,
      moderatorUserId: input.moderatorUserId,
      first: 100,
      after: cursor,
    });

    for (const chatter of payload.data) {
      if (!chatter.user_login.startsWith(input.query)) {
        continue;
      }

      matches.push({
        id: chatter.user_id,
        login: chatter.user_login,
        displayName: chatter.user_name,
      });

      if (matches.length >= input.limit) {
        break;
      }
    }

    cursor = payload.pagination?.cursor;
    pageCount += 1;

    if (!cursor) {
      break;
    }
  }

  return matches;
}

export const Route = createFileRoute("/api/channel/$slug/viewers")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requirePlaylistManagementState(
          request,
          runtimeEnv,
          params.slug
        );

        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const query = (new URL(request.url).searchParams.get("query") ?? "")
          .trim()
          .replace(/^@+/, "")
          .toLowerCase();

        if (query.length < 2) {
          return json({
            users: [],
            needsChatterScopeReconnect: false,
          });
        }

        const broadcasterAuthorization =
          await getActiveBroadcasterAuthorizationForChannel(
            runtimeEnv,
            state.channel.id
          );
        const scopes = broadcasterAuthorization
          ? parseAuthorizationScopes(broadcasterAuthorization.scopes)
          : [];

        if (
          !broadcasterAuthorization ||
          !scopes.includes("moderator:read:chatters")
        ) {
          return json({
            users: [],
            needsChatterScopeReconnect: true,
          });
        }

        try {
          const users = await searchCurrentChannelChatters({
            runtimeEnv,
            accessToken: broadcasterAuthorization.accessTokenEncrypted,
            broadcasterUserId: state.channel.twitchChannelId,
            moderatorUserId: broadcasterAuthorization.twitchUserId,
            query,
            limit: 8,
          });

          return json({
            users,
            needsChatterScopeReconnect: false,
          });
        } catch (error) {
          const needsChatterScopeReconnect =
            error instanceof TwitchApiError &&
            (error.status === 401 || error.status === 403);

          console.error("Failed to search current channel chatters", {
            channelId: state.channel.id,
            twitchChannelId: state.channel.twitchChannelId,
            moderatorUserId: broadcasterAuthorization.twitchUserId,
            needsChatterScopeReconnect,
            error: error instanceof Error ? error.message : String(error),
          });

          return json({
            users: [],
            needsChatterScopeReconnect,
          });
        }
      },
    },
  },
});
