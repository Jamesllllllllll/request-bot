// Route: Completes the primary Twitch OAuth flow for signed-in app users.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  buildSessionCookie,
  clearOauthStateCookie,
  createSession,
  verifyOauthState,
} from "~/lib/auth/session.server";
import { notifyPlaylistStream } from "~/lib/backend";
import {
  saveTwitchAuthorization,
  upsertUserAndChannel,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { exchangeCodeForToken, getTwitchUser } from "~/lib/twitch/api";
import { reconcileChannelBotState } from "~/lib/twitch/bot";

export const Route = createFileRoute("/auth/twitch/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code || !state) {
          return new Response("Missing code or state", { status: 400 });
        }

        const separatorIndex = state.indexOf(":");
        const rawState =
          separatorIndex === -1 ? state : state.slice(0, separatorIndex);
        const redirectToRaw =
          separatorIndex === -1 ? undefined : state.slice(separatorIndex + 1);
        const stateIsValid = await verifyOauthState(
          request,
          runtimeEnv,
          rawState
        );
        if (!stateIsValid) {
          return new Response("Invalid state", { status: 400 });
        }

        const token = await exchangeCodeForToken(
          runtimeEnv,
          code,
          `${runtimeEnv.APP_URL}/auth/twitch/callback`
        );
        const twitchUser = await getTwitchUser(runtimeEnv, token.access_token);
        const { user, channel } = await upsertUserAndChannel(runtimeEnv, {
          twitchUserId: twitchUser.id,
          login: twitchUser.login,
          displayName: twitchUser.display_name,
          profileImageUrl: twitchUser.profile_image_url,
        });

        await saveTwitchAuthorization(runtimeEnv, {
          authorizationType: "broadcaster",
          userId: user.id,
          channelId: channel.id,
          twitchUserId: twitchUser.id,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          tokenType: token.token_type,
          scopes: token.scope ?? [],
          expiresAt: token.expires_in
            ? Date.now() + token.expires_in * 1000
            : undefined,
        });

        try {
          await reconcileChannelBotState(runtimeEnv, channel.id, {
            refreshLiveState: true,
          });
        } catch (error) {
          console.error(
            "Bot state reconcile failed after broadcaster auth callback",
            {
              channelId: channel.id,
              twitchUserId: twitchUser.id,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }

        await notifyPlaylistStream(runtimeEnv, {
          channelId: channel.id,
          reason: "stream-status",
        });

        const sessionId = await createSession(runtimeEnv, user.id);
        const requestedRedirect = redirectToRaw
          ? decodeURIComponent(redirectToRaw)
          : "/dashboard";
        const redirectTarget =
          requestedRedirect.startsWith("/") &&
          !requestedRedirect.startsWith("//")
            ? requestedRedirect
            : "/dashboard";

        const headers = new Headers();
        headers.set("location", redirectTarget);
        headers.append("set-cookie", buildSessionCookie(sessionId, runtimeEnv));
        headers.append("set-cookie", clearOauthStateCookie(runtimeEnv));

        return new Response(null, {
          status: 302,
          headers,
        });
      },
    },
  },
});
