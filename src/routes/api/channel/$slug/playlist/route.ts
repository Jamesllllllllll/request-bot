// Route: Returns public playlist data for a single channel by slug.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { asc, desc, eq } from "drizzle-orm";
import { getSessionUserId } from "~/lib/auth/session.server";
import { getDb } from "~/lib/db/client";
import {
  getChannelBlacklistByChannelId,
  getChannelBySlug,
  getChannelSettingsByChannelId,
  getPlaylistByChannelId,
} from "~/lib/db/repositories";
import { playedSongs, setlistArtists } from "~/lib/db/schema";
import type { AppEnv } from "~/lib/env";
import {
  canManageChannelBlacklist,
  canManageChannelBlockedChatters,
  canManageChannelRequests,
  canManageChannelSetlist,
  canManageChannelVipTokens,
  canViewChannelVipTokens,
  enrichPlaylistItems,
  getPlaylistManagementResponseBody,
  performPlaylistMutation,
  requirePlaylistManagementState,
  toPlaylistMutationErrorResponse,
} from "~/lib/server/playlist-management";
import { json } from "~/lib/utils";
import { playlistMutationSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/channel/$slug/playlist")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const channel = await getChannelBySlug(runtimeEnv, params.slug);

        if (!channel) {
          return json({ error: "Channel not found" }, { status: 404 });
        }

        try {
          const sessionUserId = await getSessionUserId(request, runtimeEnv);
          const managementState = sessionUserId
            ? await requirePlaylistManagementState(
                request,
                runtimeEnv,
                params.slug
              )
            : null;

          if (managementState) {
            const canManageBlockedChatters =
              canManageChannelBlockedChatters(managementState);
            const canViewVipTokens = canViewChannelVipTokens(managementState);

            return json({
              ...getPlaylistManagementResponseBody(managementState),
              blocks: canManageBlockedChatters ? managementState.blocks : [],
              settings: {
                blacklistEnabled:
                  managementState.settings?.blacklistEnabled ?? false,
                setlistEnabled:
                  managementState.settings?.setlistEnabled ?? false,
                letSetlistBypassBlacklist:
                  managementState.settings?.letSetlistBypassBlacklist ?? false,
                subscribersMustFollowSetlist:
                  managementState.settings?.subscribersMustFollowSetlist ??
                  false,
                canManageRequests: canManageChannelRequests(managementState),
                canManageBlacklist: canManageChannelBlacklist(managementState),
                canManageSetlist: canManageChannelSetlist(managementState),
                canManageBlockedChatters,
                canViewVipTokens,
                canManageVipTokens: canManageChannelVipTokens(managementState),
                autoGrantVipTokensToSubGifters:
                  managementState.settings?.autoGrantVipTokensToSubGifters ??
                  false,
                autoGrantVipTokensToGiftRecipients:
                  managementState.settings
                    ?.autoGrantVipTokensToGiftRecipients ?? false,
                autoGrantVipTokensForCheers:
                  managementState.settings?.autoGrantVipTokensForCheers ??
                  false,
                cheerBitsPerVipToken:
                  managementState.settings?.cheerBitsPerVipToken ?? 200,
              },
              items: await enrichPlaylistItems(
                runtimeEnv,
                managementState.items
              ),
              vipTokens: canViewVipTokens ? managementState.vipTokens : [],
            });
          }

          const [playlist, playedRows, blacklist, settings, setlistRows] =
            await Promise.all([
              getPlaylistByChannelId(runtimeEnv, channel.id),
              getDb(runtimeEnv).query.playedSongs.findMany({
                where: eq(playedSongs.channelId, channel.id),
                orderBy: [desc(playedSongs.playedAt)],
                limit: 500,
              }),
              getChannelBlacklistByChannelId(runtimeEnv, channel.id),
              getChannelSettingsByChannelId(runtimeEnv, channel.id),
              getDb(runtimeEnv).query.setlistArtists.findMany({
                where: eq(setlistArtists.channelId, channel.id),
                orderBy: [asc(setlistArtists.artistName)],
              }),
            ]);

          return json({
            channel,
            accessRole: sessionUserId ? "viewer" : "anonymous",
            settings: {
              blacklistEnabled: settings?.blacklistEnabled ?? false,
              setlistEnabled: settings?.setlistEnabled ?? false,
              letSetlistBypassBlacklist:
                settings?.letSetlistBypassBlacklist ?? false,
              subscribersMustFollowSetlist:
                settings?.subscribersMustFollowSetlist ?? false,
              canManageRequests: false,
              canManageBlacklist: false,
              canManageSetlist: false,
              canManageBlockedChatters: false,
              canViewVipTokens: false,
              canManageVipTokens: false,
              autoGrantVipTokensToSubGifters:
                settings?.autoGrantVipTokensToSubGifters ?? false,
              autoGrantVipTokensToGiftRecipients:
                settings?.autoGrantVipTokensToGiftRecipients ?? false,
              autoGrantVipTokensForCheers:
                settings?.autoGrantVipTokensForCheers ?? false,
              cheerBitsPerVipToken: settings?.cheerBitsPerVipToken ?? 200,
            },
            items: playlist?.items ?? [],
            playedSongs: playedRows,
            blocks: [],
            blacklistArtists: blacklist.blacklistArtists,
            blacklistCharters: blacklist.blacklistCharters,
            blacklistSongs: blacklist.blacklistSongs,
            setlistArtists: setlistRows,
            vipTokens: [],
            requiredPaths: [],
          });
        } catch (error) {
          return toPlaylistMutationErrorResponse(error);
        }
      },
      POST: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requirePlaylistManagementState(
          request,
          runtimeEnv,
          params.slug
        );
        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const body = playlistMutationSchema.parse(await request.json());

          if (!canPerformPlaylistMutation(state, body.action)) {
            return json(
              {
                error: getForbiddenPlaylistMutationMessage(body.action),
              },
              { status: 403 }
            );
          }

          return performPlaylistMutation(runtimeEnv, state, body);
        } catch (error) {
          return toPlaylistMutationErrorResponse(error);
        }
      },
    },
  },
});

function canPerformPlaylistMutation(
  state: Awaited<ReturnType<typeof requirePlaylistManagementState>>,
  action: ReturnType<typeof playlistMutationSchema.parse>["action"]
) {
  if (!state) {
    return false;
  }

  switch (action) {
    case "markPlayed":
    case "restorePlayed":
    case "setCurrent":
    case "deleteItem":
    case "chooseVersion":
    case "clearPlaylist":
    case "resetSession":
    case "shuffleNext":
    case "shufflePlaylist":
    case "reorderItems":
    case "manualAdd":
      return canManageChannelRequests(state);
    case "changeRequestKind":
      return (
        canManageChannelRequests(state) && canManageChannelVipTokens(state)
      );
    default:
      return false;
  }
}

function getForbiddenPlaylistMutationMessage(
  action: ReturnType<typeof playlistMutationSchema.parse>["action"]
) {
  if (action === "changeRequestKind") {
    return "You do not have permission to manage VIP request changes.";
  }

  return "You do not have permission to manage this channel playlist.";
}
