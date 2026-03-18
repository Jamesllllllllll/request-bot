import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/start-server-core";
import { getSessionUserId } from "~/lib/auth/session.server";
import { getViewerState } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";

export type ViewerSessionData = {
  viewer: null | {
    user: {
      displayName: string;
      login: string;
      profileImageUrl?: string | null;
      isAdmin?: boolean;
    };
    channel: {
      slug: string;
    } | null;
  };
};

export const getViewerSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const runtimeEnv = env as AppEnv;
    const request = getRequest();
    const userId = await getSessionUserId(request, runtimeEnv);

    if (!userId) {
      return { viewer: null } satisfies ViewerSessionData;
    }

    const viewer = await getViewerState(runtimeEnv, userId);
    return {
      viewer: viewer
        ? {
            user: {
              displayName: viewer.user.displayName,
              login: viewer.user.login,
              profileImageUrl: viewer.user.profileImageUrl,
              isAdmin: viewer.user.isAdmin,
            },
            channel: viewer.channel ? { slug: viewer.channel.slug } : null,
          }
        : null,
    } satisfies ViewerSessionData;
  }
);
