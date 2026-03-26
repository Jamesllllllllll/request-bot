import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  getActiveBroadcasterAuthorizationForUser,
  parseAuthorizationScopes,
  searchCatalogArtistsForBlacklist,
  searchCatalogChartersForBlacklist,
  searchCatalogSongGroupsForBlacklist,
  searchCatalogSongsForBlacklist,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  canManageChannelBlacklist,
  canManageChannelBlockedChatters,
  canManageChannelSetlist,
  canManageChannelVipTokens,
  canViewChannelVipTokens,
  requirePlaylistManagementState,
} from "~/lib/server/playlist-management";
import {
  getAppAccessToken,
  getChatters,
  searchTwitchChannels,
} from "~/lib/twitch/api";
import { json } from "~/lib/utils";

function normalizeTwitchLogin(query: string) {
  return query.trim().replace(/^@+/, "").toLowerCase();
}

type TwitchSearchUser = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
  isCurrentChatter?: boolean;
};

async function searchCurrentChannelChatters(input: {
  runtimeEnv: AppEnv;
  accessToken: string;
  broadcasterUserId: string;
  moderatorUserId: string;
  query: string;
  limit: number;
}) {
  const matches: TwitchSearchUser[] = [];
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
        isCurrentChatter: true,
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

export const Route = createFileRoute("/api/channel/$slug/moderation/search")({
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

        const userId = await getSessionUserId(request, runtimeEnv);
        if (!userId) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const rawQuery = url.searchParams.get("query") ?? "";
        const type = url.searchParams.get("type");
        const query =
          type === "twitch-user"
            ? normalizeTwitchLogin(rawQuery)
            : rawQuery.trim();

        const minimumQueryLength = type === "twitch-user" ? 4 : 2;

        if (query.length < minimumQueryLength) {
          return json({
            artists: [],
            charters: [],
            songs: [],
            songVersions: [],
            users: [],
          });
        }

        const canBlacklist = canManageChannelBlacklist(state);
        const canSetlist = canManageChannelSetlist(state);
        const canManageBlockedChatters = canManageChannelBlockedChatters(state);
        const canTouchVipTokens =
          canViewChannelVipTokens(state) || canManageChannelVipTokens(state);

        if (type === "twitch-user") {
          if (!canManageBlockedChatters && !canTouchVipTokens) {
            return json({ error: "Forbidden" }, { status: 403 });
          }

          let chatterUsers: TwitchSearchUser[] = [];
          let needsChatterScopeReconnect = false;
          const broadcasterAuthorization =
            await getActiveBroadcasterAuthorizationForUser(runtimeEnv, userId);
          const authorizationScopes = broadcasterAuthorization
            ? parseAuthorizationScopes(broadcasterAuthorization.scopes)
            : [];

          if (
            broadcasterAuthorization &&
            state.channel.twitchChannelId &&
            authorizationScopes.includes("moderator:read:chatters")
          ) {
            try {
              chatterUsers = await searchCurrentChannelChatters({
                runtimeEnv,
                accessToken: broadcasterAuthorization.accessTokenEncrypted,
                broadcasterUserId: state.channel.twitchChannelId,
                moderatorUserId: broadcasterAuthorization.twitchUserId,
                query,
                limit: 8,
              });
            } catch (error) {
              console.error("Failed to search current channel chatters", {
                channelId: state.channel.id,
                twitchChannelId: state.channel.twitchChannelId,
                moderatorTwitchUserId: broadcasterAuthorization?.twitchUserId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          } else if (broadcasterAuthorization) {
            needsChatterScopeReconnect = true;
          }

          const token = await getAppAccessToken(runtimeEnv);
          const globalUsers = await searchTwitchChannels({
            env: runtimeEnv,
            accessToken: token.access_token,
            query,
            first: 8,
          });
          const users =
            chatterUsers.length > 0
              ? chatterUsers
              : globalUsers.map((user) => ({
                  id: user.id,
                  login: user.broadcaster_login,
                  displayName: user.display_name,
                  profileImageUrl: user.thumbnail_url,
                }));

          return json({
            users,
            needsChatterScopeReconnect,
            preferredSource: chatterUsers.length ? "chatters" : "global",
          });
        }

        if (type === "artist") {
          if (!canBlacklist && !canSetlist) {
            return json({ error: "Forbidden" }, { status: 403 });
          }

          return json({
            artists: await searchCatalogArtistsForBlacklist(runtimeEnv, {
              query,
            }),
          });
        }

        if (type === "charter") {
          if (!canBlacklist) {
            return json({ error: "Forbidden" }, { status: 403 });
          }

          return json({
            charters: await searchCatalogChartersForBlacklist(runtimeEnv, {
              query,
            }),
          });
        }

        if (type === "song-version") {
          if (!canBlacklist) {
            return json({ error: "Forbidden" }, { status: 403 });
          }

          return json({
            songVersions: await searchCatalogSongsForBlacklist(runtimeEnv, {
              query,
            }),
          });
        }

        if (type === "song") {
          if (!canBlacklist) {
            return json({ error: "Forbidden" }, { status: 403 });
          }

          return json({
            songs: await searchCatalogSongGroupsForBlacklist(runtimeEnv, {
              query,
            }),
          });
        }

        return json(
          { error: "Unknown moderation search type." },
          { status: 400 }
        );
      },
    },
  },
});
