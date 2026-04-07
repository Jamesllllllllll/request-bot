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
  toPlaylistClientChannel,
  toPublicBlacklistArtist,
  toPublicBlacklistCharter,
  toPublicBlacklistSong,
  toPublicBlacklistSongGroup,
  toPublicPlayedSong,
  toPublicPlaylistItem,
  toPublicPlaylistSettings,
  toPublicSetlistArtist,
} from "~/lib/playlist/public-response";
import { getAllowedRequestPathsSetting } from "~/lib/request-policy";
import {
  canPerformPlaylistMutationAction,
  enrichPlaylistItems,
  getForbiddenPlaylistMutationMessage,
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
          const allowedRequestPaths = getAllowedRequestPathsSetting(
            settings ?? {
              allowRequestPathModifiers: false,
              allowedRequestPathsJson: "[]",
            }
          );
          const publicItems = (
            await enrichPlaylistItems(runtimeEnv, playlist?.items ?? [])
          ).map((item) =>
            toPublicPlaylistItem(
              item as unknown as Parameters<typeof toPublicPlaylistItem>[0]
            )
          );

          return json({
            channel: toPlaylistClientChannel(channel),
            accessRole: sessionUserId ? "viewer" : "anonymous",
            settings: toPublicPlaylistSettings({
              botChannelEnabled: settings?.botChannelEnabled ?? false,
              requestsEnabled: settings?.requestsEnabled ?? true,
              blacklistEnabled: settings?.blacklistEnabled ?? false,
              setlistEnabled: settings?.setlistEnabled ?? false,
              letSetlistBypassBlacklist:
                settings?.letSetlistBypassBlacklist ?? false,
              subscribersMustFollowSetlist:
                settings?.subscribersMustFollowSetlist ?? false,
              allowRequestPathModifiers: allowedRequestPaths.length > 0,
              allowedRequestPaths,
              requestPathModifierVipTokenCost:
                settings?.requestPathModifierVipTokenCost ?? 0,
              requestPathModifierUsesVipPriority:
                settings?.requestPathModifierUsesVipPriority ?? true,
              requiredPathsJson: settings?.requiredPathsJson ?? "[]",
              vipTokenDurationThresholdsJson:
                settings?.vipTokenDurationThresholdsJson ?? "[]",
              requiredPathsMatchMode: settings?.requiredPathsMatchMode ?? "any",
              autoGrantVipTokenToSubscribers:
                settings?.autoGrantVipTokenToSubscribers ?? false,
              autoGrantVipTokensForSharedSubRenewalMessage:
                settings?.autoGrantVipTokensForSharedSubRenewalMessage ?? false,
              autoGrantVipTokensToSubGifters:
                settings?.autoGrantVipTokensToSubGifters ?? false,
              autoGrantVipTokensToGiftRecipients:
                settings?.autoGrantVipTokensToGiftRecipients ?? false,
              autoGrantVipTokensForCheers:
                settings?.autoGrantVipTokensForCheers ?? false,
              cheerBitsPerVipToken: settings?.cheerBitsPerVipToken ?? 200,
              cheerMinimumTokenPercent:
                settings?.cheerMinimumTokenPercent ?? 25,
              autoGrantVipTokensForRaiders:
                settings?.autoGrantVipTokensForRaiders ?? false,
              raidMinimumViewerCount: settings?.raidMinimumViewerCount ?? 1,
              autoGrantVipTokensForStreamElementsTips:
                settings?.autoGrantVipTokensForStreamElementsTips ?? false,
              streamElementsTipAmountPerVipToken:
                settings?.streamElementsTipAmountPerVipToken ?? 5,
              showPlaylistPositions: settings?.showPlaylistPositions ?? false,
              showPickOrderBadges: settings?.showPickOrderBadges ?? false,
            }),
            items: publicItems,
            playedSongs: playedRows.map(toPublicPlayedSong),
            blocks: [],
            blacklistArtists: blacklist.blacklistArtists.map(
              toPublicBlacklistArtist
            ),
            blacklistCharters: blacklist.blacklistCharters.map(
              toPublicBlacklistCharter
            ),
            blacklistSongs: blacklist.blacklistSongs.map(toPublicBlacklistSong),
            blacklistSongGroups: blacklist.blacklistSongGroups.map(
              toPublicBlacklistSongGroup
            ),
            setlistArtists: setlistRows.map(toPublicSetlistArtist),
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

          if (!canPerformPlaylistMutationAction(state, body.action)) {
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
