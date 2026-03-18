// Route: Completes the admin-only Twitch OAuth flow for the shared bot account.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  clearOauthStateCookie,
  getSessionUserId,
  verifyOauthState,
} from "~/lib/auth/session.server";
import { getUserById, saveTwitchAuthorization } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { exchangeCodeForToken, getTwitchUser } from "~/lib/twitch/api";
import {
  isBotAuthorizationForConfiguredUser,
  reconcileAllEnabledChannels,
} from "~/lib/twitch/bot";

export const Route = createFileRoute("/auth/twitch/bot/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const sessionUserId = await getSessionUserId(request, runtimeEnv);
        if (!sessionUserId) {
          return new Response("Unauthorized", { status: 401 });
        }

        const adminUser = await getUserById(runtimeEnv, sessionUserId);
        if (!adminUser?.isAdmin) {
          return new Response("Forbidden", { status: 403 });
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code || !state) {
          return new Response("Missing code or state", { status: 400 });
        }

        const [rawState, redirectToRaw] = state.split(":");
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
          `${runtimeEnv.APP_URL}/auth/twitch/bot/callback`
        );
        const twitchUser = await getTwitchUser(runtimeEnv, token.access_token);

        if (
          !(await isBotAuthorizationForConfiguredUser(
            runtimeEnv,
            twitchUser.login
          ))
        ) {
          return new Response(
            `This callback must be completed with the configured bot account (${runtimeEnv.TWITCH_BOT_USERNAME}).`,
            { status: 400 }
          );
        }

        await saveTwitchAuthorization(runtimeEnv, {
          authorizationType: "bot",
          userId: adminUser.id,
          channelId: null,
          twitchUserId: twitchUser.id,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          tokenType: token.token_type,
          scopes: token.scope ?? [],
          expiresAt: token.expires_in
            ? Date.now() + token.expires_in * 1000
            : undefined,
        });

        await reconcileAllEnabledChannels(runtimeEnv);

        const requestedRedirect = redirectToRaw
          ? decodeURIComponent(redirectToRaw)
          : "/dashboard/admin";
        const redirectTarget =
          requestedRedirect.startsWith("/") &&
          !requestedRedirect.startsWith("//")
            ? requestedRedirect
            : "/dashboard/admin";

        return new Response(null, {
          status: 302,
          headers: {
            location: redirectTarget,
            "set-cookie": clearOauthStateCookie(runtimeEnv),
          },
        });
      },
    },
  },
});
