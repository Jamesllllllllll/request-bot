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
  canPerformPlaylistMutationAction,
  canViewChannelVipTokens,
  enrichPlaylistItems,
  getForbiddenPlaylistMutationMessage,
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
                requestsEnabled:
                  managementState.settings?.requestsEnabled ?? true,
                blacklistEnabled:
                  managementState.settings?.blacklistEnabled ?? false,
                setlistEnabled:
                  managementState.settings?.setlistEnabled ?? false,
                letSetlistBypassBlacklist:
                  managementState.settings?.letSetlistBypassBlacklist ?? false,
                subscribersMustFollowSetlist:
                  managementState.settings?.subscribersMustFollowSetlist ??
                  false,
                requiredPathsJson:
                  managementState.settings?.requiredPathsJson ?? "[]",
                vipTokenDurationThresholdsJson:
                  managementState.settings?.vipTokenDurationThresholdsJson ??
                  "[]",
                requiredPathsMatchMode:
                  managementState.settings?.requiredPathsMatchMode ?? "any",
                canManageRequests: canManageChannelRequests(managementState),
                canManageBlacklist: canManageChannelBlacklist(managementState),
                canManageSetlist: canManageChannelSetlist(managementState),
                canManageBlockedChatters,
                canViewVipTokens,
                canManageVipTokens: canManageChannelVipTokens(managementState),
                autoGrantVipTokenToSubscribers:
                  managementState.settings?.autoGrantVipTokenToSubscribers ??
                  false,
                autoGrantVipTokensForSharedSubRenewalMessage:
                  managementState.settings
                    ?.autoGrantVipTokensForSharedSubRenewalMessage ?? false,
                autoGrantVipTokensToSubGifters:
                  managementState.settings?.autoGrantVipTokensToSubGifters ??
                  false,
                autoGrantVipTokensToGiftRecipients:
                  managementState.settings
                    ?.autoGrantVipTokensToGiftRecipients ?? false,
                autoGrantVipTokensForCheers:
                  managementState.settings?.autoGrantVipTokensForCheers ??
                  false,
                autoGrantVipTokensForRaiders:
                  managementState.settings?.autoGrantVipTokensForRaiders ??
                  false,
                cheerBitsPerVipToken:
                  managementState.settings?.cheerBitsPerVipToken ?? 200,
                cheerMinimumTokenPercent:
                  managementState.settings?.cheerMinimumTokenPercent ?? 25,
                raidMinimumViewerCount:
                  managementState.settings?.raidMinimumViewerCount ?? 1,
                autoGrantVipTokensForStreamElementsTips:
                  managementState.settings
                    ?.autoGrantVipTokensForStreamElementsTips ?? false,
                streamElementsTipAmountPerVipToken:
                  managementState.settings
                    ?.streamElementsTipAmountPerVipToken ?? 5,
                showPlaylistPositions:
                  managementState.settings?.showPlaylistPositions ?? false,
                showPickOrderBadges:
                  managementState.settings?.showPickOrderBadges ?? false,
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
              requestsEnabled: settings?.requestsEnabled ?? true,
              blacklistEnabled: settings?.blacklistEnabled ?? false,
              setlistEnabled: settings?.setlistEnabled ?? false,
              letSetlistBypassBlacklist:
                settings?.letSetlistBypassBlacklist ?? false,
              subscribersMustFollowSetlist:
                settings?.subscribersMustFollowSetlist ?? false,
              requiredPathsJson: settings?.requiredPathsJson ?? "[]",
              vipTokenDurationThresholdsJson:
                settings?.vipTokenDurationThresholdsJson ?? "[]",
              requiredPathsMatchMode: settings?.requiredPathsMatchMode ?? "any",
              canManageRequests: false,
              canManageBlacklist: false,
              canManageSetlist: false,
              canManageBlockedChatters: false,
              canViewVipTokens: false,
              canManageVipTokens: false,
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
            },
            items: await enrichPlaylistItems(runtimeEnv, playlist?.items ?? []),
            playedSongs: playedRows,
            blocks: [],
            blacklistArtists: blacklist.blacklistArtists,
            blacklistCharters: blacklist.blacklistCharters,
            blacklistSongs: blacklist.blacklistSongs,
            blacklistSongGroups: blacklist.blacklistSongGroups,
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
