import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  clearOauthStateCookie,
  getSessionUserId,
  verifyOauthState,
} from "~/lib/auth/session.server";
import {
  createAuditLog,
  getDashboardState,
  saveYouTubeAuthorization,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  exchangeYouTubeCodeForToken,
  getOwnYouTubeChannel,
  isYouTubeConfigured,
} from "~/lib/youtube/api";

export const Route = createFileRoute("/auth/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;

        if (!isYouTubeConfigured(runtimeEnv)) {
          return new Response("YouTube OAuth is not configured.", {
            status: 503,
          });
        }

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

        const userId = await getSessionUserId(request, runtimeEnv);
        if (!userId) {
          return new Response("You need to sign in first.", { status: 401 });
        }

        const dashboardState = await getDashboardState(runtimeEnv, userId);
        if (!dashboardState) {
          return new Response("Only the channel owner can connect YouTube.", {
            status: 403,
          });
        }

        const token = await exchangeYouTubeCodeForToken(
          runtimeEnv,
          code,
          `${runtimeEnv.APP_URL}/auth/youtube/callback`
        );
        const youtubeChannel = await getOwnYouTubeChannel(token.access_token);

        await saveYouTubeAuthorization(runtimeEnv, {
          userId,
          channelId: dashboardState.channel.id,
          youtubeChannelId: youtubeChannel.channelId,
          channelTitle: youtubeChannel.title,
          channelCustomUrl: youtubeChannel.customUrl,
          thumbnailUrl: youtubeChannel.thumbnailUrl,
          accessToken: token.access_token,
          refreshToken: token.refresh_token ?? null,
          tokenType: token.token_type,
          scopes: token.scope?.split(" ").filter(Boolean) ?? [],
          expiresAt: token.expires_in
            ? Date.now() + token.expires_in * 1000
            : null,
        });

        await createAuditLog(runtimeEnv, {
          channelId: dashboardState.channel.id,
          actorUserId: dashboardState.channel.ownerUserId,
          actorType: "owner",
          action: "connect_youtube_authorization",
          entityType: "youtube_authorization",
          entityId: youtubeChannel.channelId,
          payloadJson: JSON.stringify({
            youtubeChannelId: youtubeChannel.channelId,
            channelTitle: youtubeChannel.title,
          }),
        });

        const requestedRedirect = redirectToRaw
          ? decodeURIComponent(redirectToRaw)
          : "/dashboard/settings";
        const redirectTarget =
          requestedRedirect.startsWith("/") &&
          !requestedRedirect.startsWith("//")
            ? requestedRedirect
            : "/dashboard/settings";

        const headers = new Headers();
        headers.set("location", redirectTarget);
        headers.append("set-cookie", clearOauthStateCookie(runtimeEnv));

        return new Response(null, {
          status: 302,
          headers,
        });
      },
    },
  },
});
