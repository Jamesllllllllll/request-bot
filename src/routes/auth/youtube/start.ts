import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  createOauthStateCookie,
  getSessionUserId,
} from "~/lib/auth/session.server";
import type { AppEnv } from "~/lib/env";
import { isYouTubeConfigured, youtubeOAuthScopes } from "~/lib/youtube/api";

export const Route = createFileRoute("/auth/youtube/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const userId = await getSessionUserId(request, runtimeEnv);

        if (!userId) {
          return new Response("You need to sign in first.", { status: 401 });
        }

        if (!isYouTubeConfigured(runtimeEnv)) {
          return new Response("YouTube OAuth is not configured.", {
            status: 503,
          });
        }

        const { state, cookie } = await createOauthStateCookie(runtimeEnv);
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        const redirectTo =
          new URL(request.url).searchParams.get("redirectTo") ??
          "/dashboard/settings";

        url.searchParams.set("client_id", runtimeEnv.YOUTUBE_CLIENT_ID ?? "");
        url.searchParams.set(
          "redirect_uri",
          `${runtimeEnv.APP_URL}/auth/youtube/callback`
        );
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", youtubeOAuthScopes.join(" "));
        url.searchParams.set("access_type", "offline");
        url.searchParams.set("include_granted_scopes", "true");
        url.searchParams.set("prompt", "consent");
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
