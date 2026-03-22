// Route: Starts the primary Twitch OAuth flow for signed-in app users.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createOauthStateCookie } from "~/lib/auth/session.server";
import type { AppEnv } from "~/lib/env";

const requiredBroadcasterScopes = [
  "openid",
  "user:read:moderated_channels",
  "moderator:read:chatters",
  "channel:bot",
  "channel:read:subscriptions",
  "bits:read",
] as const;

function getBroadcasterScopes(env: AppEnv) {
  return [
    ...new Set([
      ...env.TWITCH_SCOPES.split(/\s+/).filter(Boolean),
      ...requiredBroadcasterScopes,
    ]),
  ].join(" ");
}

export const Route = createFileRoute("/auth/twitch/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const { state, cookie } = await createOauthStateCookie(runtimeEnv);
        const url = new URL("https://id.twitch.tv/oauth2/authorize");
        const redirectTo =
          new URL(request.url).searchParams.get("redirectTo") ?? "/dashboard";

        url.searchParams.set("client_id", runtimeEnv.TWITCH_CLIENT_ID);
        url.searchParams.set(
          "redirect_uri",
          `${runtimeEnv.APP_URL}/auth/twitch/callback`
        );
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", getBroadcasterScopes(runtimeEnv));
        url.searchParams.set(
          "state",
          `${state}:${encodeURIComponent(redirectTo)}`
        );

        return new Response(null, {
          status: 302,
          headers: {
            location: url.toString(),
            "set-cookie": cookie,
          },
        });
      },
    },
  },
});
