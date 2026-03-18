// Route: Returns the signed-in viewer session and accessible channel context.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import { getViewerState } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const userId = await getSessionUserId(request, runtimeEnv);

        if (!userId) {
          return json({ viewer: null });
        }

        const viewer = await getViewerState(runtimeEnv, userId);
        return json({
          viewer: viewer
            ? {
                user: {
                  displayName: viewer.user.displayName,
                  login: viewer.user.login,
                  profileImageUrl: viewer.user.profileImageUrl,
                  isAdmin: viewer.user.isAdmin,
                },
                channel: viewer.channel ? { slug: viewer.channel.slug } : null,
                manageableChannels: viewer.manageableChannels.map(
                  (channel) => ({
                    slug: channel.slug,
                    displayName: channel.displayName,
                    login: channel.login,
                    isLive: channel.isLive,
                  })
                ),
                needsModeratorScopeReconnect:
                  viewer.needsModeratorScopeReconnect,
              }
            : null,
        });
      },
    },
  },
});
