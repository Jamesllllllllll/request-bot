import { getSessionUserId } from "~/lib/auth/session.server";
import { getViewerState } from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import type { AppLocale } from "~/lib/i18n/locales";
import { resolveRequestLocale } from "~/lib/i18n/server";

export type ViewerSessionData = {
  locale: AppLocale;
  viewer: null | {
    user: {
      twitchUserId: string;
      displayName: string;
      login: string;
      profileImageUrl?: string | null;
      isAdmin?: boolean;
      preferredLocale?: string | null;
    };
    channel: {
      slug: string;
    } | null;
    manageableChannels?: Array<{
      slug: string;
      displayName: string;
      login: string;
      isLive: boolean;
    }>;
    needsBroadcasterScopeReconnect?: boolean;
    needsModeratorScopeReconnect?: boolean;
  };
};

export async function getViewerSessionData(
  request: Request,
  runtimeEnv: AppEnv
) {
  const userId = await getSessionUserId(request, runtimeEnv);

  if (!userId) {
    return {
      locale: resolveRequestLocale(request, runtimeEnv),
      viewer: null,
    } satisfies ViewerSessionData;
  }

  const viewer = await getViewerState(runtimeEnv, userId);
  const locale = resolveRequestLocale(
    request,
    runtimeEnv,
    viewer?.user.preferredLocale
  );

  return {
    locale,
    viewer: viewer
      ? {
          user: {
            twitchUserId: viewer.user.twitchUserId,
            displayName: viewer.user.displayName,
            login: viewer.user.login,
            profileImageUrl: viewer.user.profileImageUrl,
            isAdmin: viewer.user.isAdmin,
            preferredLocale: viewer.user.preferredLocale,
          },
          channel: viewer.channel ? { slug: viewer.channel.slug } : null,
          manageableChannels: viewer.manageableChannels.map((channel) => ({
            slug: channel.slug,
            displayName: channel.displayName,
            login: channel.login,
            isLive: channel.isLive,
          })),
          needsBroadcasterScopeReconnect: viewer.needsBroadcasterScopeReconnect,
          needsModeratorScopeReconnect: viewer.needsModeratorScopeReconnect,
        }
      : null,
  } satisfies ViewerSessionData;
}
