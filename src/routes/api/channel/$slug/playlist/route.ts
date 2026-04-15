// Route: Returns public playlist data for a single channel by slug.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { asc, eq } from "drizzle-orm";
import { isAbortError, throwIfAborted } from "~/lib/abort";
import { getSessionUserId } from "~/lib/auth/session.server";
import { getDb } from "~/lib/db/client";
import {
  getChannelBlacklistByChannelId,
  getChannelBySlug,
  getChannelChatterActivityForRequesters,
  getChannelPreferredChartersByChannelId,
  getChannelSettingsByChannelId,
  getPlaylistByChannelId,
  getSessionPlayedSongsByChannelId,
} from "~/lib/db/repositories";
import { setlistArtists } from "~/lib/db/schema";
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
  toPublicPreferredCharter,
  toPublicSetlistArtist,
} from "~/lib/playlist/public-response";
import { attachRequesterLastChatActivity } from "~/lib/playlist/requester-activity";
import {
  getAllowedRequestPathsSetting,
  getRequestPathModifierVipTokenCostsSetting,
} from "~/lib/request-policy";
import {
  canPerformPlaylistMutationAction,
  enrichPlaylistItems,
  getForbiddenPlaylistMutationMessage,
  performPlaylistMutation,
  requirePlaylistManagementState,
  toPlaylistMutationErrorResponse,
} from "~/lib/server/playlist-management";
import {
  createRequestStageTimer,
  registerAbortTrace,
  serializeErrorForLog,
} from "~/lib/server/request-tracing";
import { json } from "~/lib/utils";
import { playlistMutationSchema } from "~/lib/validation";

export const Route = createFileRoute("/api/channel/$slug/playlist")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtimeEnv = env as AppEnv;
        const traceId = crypto.randomUUID();
        const startedAt = Date.now();
        const timer = createRequestStageTimer();
        const traceContext = {
          traceId,
          slug: params.slug,
          path: `/api/channel/${params.slug}/playlist`,
        };

        console.info("Playlist request started", traceContext);
        const cleanupAbortTrace = registerAbortTrace(request.signal, () => {
          console.warn("Playlist request abort signaled", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
          });
        });

        try {
          throwIfAborted(request.signal);
          const channel = await timer.measure("getChannelBySlug", () =>
            getChannelBySlug(runtimeEnv, params.slug)
          );

          if (!channel) {
            console.warn("Playlist request channel not found", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
            });
            return json({ error: "Channel not found" }, { status: 404 });
          }

          const sessionUserId = await timer.measure("getSessionUserId", () =>
            getSessionUserId(request, runtimeEnv)
          );
          const accessRole =
            sessionUserId && channel.ownerUserId === sessionUserId
              ? "owner"
              : sessionUserId
                ? "viewer"
                : "anonymous";
          throwIfAborted(request.signal);
          const [
            playlist,
            playedRows,
            blacklist,
            preferredCharters,
            settings,
            setlistRows,
          ] = await timer.measure("loadPlaylistCoreData", () =>
            Promise.all([
              getPlaylistByChannelId(runtimeEnv, channel.id),
              getSessionPlayedSongsByChannelId(runtimeEnv, {
                channelId: channel.id,
                limit: 500,
                order: "desc",
              }),
              getChannelBlacklistByChannelId(runtimeEnv, channel.id),
              getChannelPreferredChartersByChannelId(runtimeEnv, channel.id),
              getChannelSettingsByChannelId(runtimeEnv, channel.id),
              getDb(runtimeEnv).query.setlistArtists.findMany({
                where: eq(setlistArtists.channelId, channel.id),
                orderBy: [asc(setlistArtists.artistName)],
              }),
            ])
          );
          const allowedRequestPaths = getAllowedRequestPathsSetting(
            settings ?? {
              allowRequestPathModifiers: false,
              allowedRequestPathsJson: "[]",
            }
          );
          throwIfAborted(request.signal);
          const enrichedItems = await timer.measure("enrichPlaylistItems", () =>
            enrichPlaylistItems(runtimeEnv, playlist?.items ?? [])
          );
          const playlistRequesterItems = enrichedItems as Array<{
            requestedByTwitchUserId?: string | null;
            requestedByLogin?: string | null;
          }>;
          throwIfAborted(request.signal);
          const activityRows = await timer.measure(
            "getRequesterLastChatActivity",
            () =>
              getChannelChatterActivityForRequesters(runtimeEnv, {
                channelId: channel.id,
                twitchUserIds: playlistRequesterItems
                  .map((item) =>
                    typeof item.requestedByTwitchUserId === "string"
                      ? item.requestedByTwitchUserId
                      : ""
                  )
                  .filter(Boolean),
                logins: playlistRequesterItems
                  .map((item) =>
                    typeof item.requestedByLogin === "string"
                      ? item.requestedByLogin
                      : ""
                  )
                  .filter(Boolean),
              })
          );
          throwIfAborted(request.signal);
          const publicItems = attachRequesterLastChatActivity(
            enrichedItems,
            activityRows
          ).map((item) =>
            toPublicPlaylistItem(
              item as unknown as Parameters<typeof toPublicPlaylistItem>[0]
            )
          );

          console.info("Playlist request completed", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
            accessRole,
            playlistItemCount: publicItems.length,
            playedSongCount: playedRows.length,
            blacklistArtistCount: blacklist.blacklistArtists.length,
            blacklistCharterCount: blacklist.blacklistCharters.length,
            preferredCharterCount: preferredCharters.length,
          });

          return json({
            channel: toPlaylistClientChannel(channel),
            accessRole,
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
              requestPathModifierVipTokenCosts:
                getRequestPathModifierVipTokenCostsSetting(settings ?? {}),
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
            preferredCharters: preferredCharters.map(toPublicPreferredCharter),
            blacklistSongs: blacklist.blacklistSongs.map(toPublicBlacklistSong),
            blacklistSongGroups: blacklist.blacklistSongGroups.map(
              toPublicBlacklistSongGroup
            ),
            setlistArtists: setlistRows.map(toPublicSetlistArtist),
            vipTokens: [],
            requiredPaths: [],
          });
        } catch (error) {
          if (isAbortError(error)) {
            console.warn("Playlist request aborted", {
              ...traceContext,
              elapsedMs: Date.now() - startedAt,
              stageDurations: timer.stageDurations,
              error: serializeErrorForLog(error),
            });
            return new Response(null, { status: 499 });
          }

          console.error("Playlist request failed", {
            ...traceContext,
            elapsedMs: Date.now() - startedAt,
            stageDurations: timer.stageDurations,
            error: serializeErrorForLog(error),
          });
          return toPlaylistMutationErrorResponse(error);
        } finally {
          cleanupAbortTrace();
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
