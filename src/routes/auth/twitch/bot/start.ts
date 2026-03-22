// Route: Starts the admin-only Twitch OAuth flow for the shared bot account.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  createOauthStateCookie,
  getSessionUserId,
} from "~/lib/auth/session.server";
import { getUserById } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { twitchBotScopes } from "~/lib/twitch/bot";

export const Route = createFileRoute("/auth/twitch/bot/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const sessionUserId = await getSessionUserId(request, runtimeEnv);

        if (!sessionUserId) {
          return new Response("Unauthorized", { status: 401 });
        }

        const user = await getUserById(runtimeEnv, sessionUserId);
        if (!user?.isAdmin) {
          return new Response("Forbidden", { status: 403 });
        }

        const { state, cookie } = await createOauthStateCookie(runtimeEnv);
        const url = new URL("https://id.twitch.tv/oauth2/authorize");

        url.searchParams.set("client_id", runtimeEnv.TWITCH_CLIENT_ID);
        url.searchParams.set(
          "redirect_uri",
          `${runtimeEnv.APP_URL}/auth/twitch/bot/callback`
        );
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", twitchBotScopes.join(" "));
        url.searchParams.set("force_verify", "true");
        url.searchParams.set(
          "state",
          `${state}:${encodeURIComponent("/dashboard/admin")}`
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
