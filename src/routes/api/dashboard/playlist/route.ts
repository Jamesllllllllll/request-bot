// Route: Reads and mutates playlist state for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { and, asc, desc, eq } from "drizzle-orm";
import { getSessionUserId } from "~/lib/auth/session.server";
import { callBackend } from "~/lib/backend";
import { getDb } from "~/lib/db/client";
import {
  consumeVipToken,
  createAuditLog,
  getCatalogSongsByIds,
  getChannelBlacklistByChannelId,
  getChannelSettingsByChannelId,
  getDashboardChannelAccess,
  getDashboardState,
  getPlaylistByChannelId,
  getVipTokenBalance,
  grantVipToken,
} from "~/lib/db/repositories";
import { playedSongs, playlistItems, vipTokens } from "~/lib/db/schema";
import {
  assertDatabaseSchemaCurrent,
  DatabaseSchemaOutOfDateError,
} from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import { getArraySetting } from "~/lib/request-policy";
import { json } from "~/lib/utils";
import { playlistMutationSchema } from "~/lib/validation";
import { formatVipTokenCount, hasRedeemableVipToken } from "~/lib/vip-tokens";

async function requireDashboardState(
  request: Request,
  runtimeEnv: AppEnv,
  requestedSlug?: string | null
) {
  await assertDatabaseSchemaCurrent(runtimeEnv);
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  const access = await getDashboardChannelAccess(
    runtimeEnv,
    userId,
    requestedSlug
  );
  if (!access) {
    return null;
  }

  if (access.accessRole === "owner") {
    const state = await getDashboardState(runtimeEnv, userId);
    if (!state) {
      return null;
    }

    return {
      ...state,
      accessRole: access.accessRole,
      actorUserId: access.actorUserId,
    };
  }

  const playlistState = await getPlaylistByChannelId(
    runtimeEnv,
    access.channel.id
  );
  const settings = await getChannelSettingsByChannelId(
    runtimeEnv,
    access.channel.id
  );
  const playedRows = await getDb(runtimeEnv).query.playedSongs.findMany({
    where: eq(playedSongs.channelId, access.channel.id),
    orderBy: [desc(playedSongs.playedAt)],
    limit: 100,
  });
  const vipTokenRows = await getDb(runtimeEnv).query.vipTokens.findMany({
    where: eq(vipTokens.channelId, access.channel.id),
    orderBy: [asc(vipTokens.login)],
  });
  const blacklist = await getChannelBlacklistByChannelId(
    runtimeEnv,
    access.channel.id
  );
  if (!playlistState) {
    return null;
  }

  return {
    channel: access.channel,
    settings,
    playlist: playlistState.playlist,
    items: playlistState.items,
    playedSongs: playedRows,
    vipTokens: vipTokenRows,
    blacklistArtists: blacklist.blacklistArtists,
    blacklistCharters: blacklist.blacklistCharters,
    blacklistSongs: blacklist.blacklistSongs,
    accessRole: access.accessRole,
    actorUserId: access.actorUserId,
  };
}

async function enrichPlaylistItems(
  runtimeEnv: AppEnv,
  items: Array<Record<string, unknown>>
) {
  const songIds = items
    .map((item) => (typeof item.songId === "string" ? item.songId : null))
    .filter((songId): songId is string => Boolean(songId));

  const catalogSongs = await getCatalogSongsByIds(runtimeEnv, songIds);
  const catalogById = new Map(catalogSongs.map((song) => [song.id, song]));

  return items.map((item) => {
    const songId = typeof item.songId === "string" ? item.songId : null;
    const catalogSong = songId ? catalogById.get(songId) : null;

    return {
      ...item,
      songCatalogSourceId:
        item.songCatalogSourceId ?? catalogSong?.sourceId ?? null,
      songUrl: item.songUrl ?? catalogSong?.sourceUrl ?? null,
      songSourceUpdatedAt: catalogSong?.sourceUpdatedAt ?? null,
      songDownloads: catalogSong?.downloads ?? null,
    };
  });
}

async function queuePlaylistReply(
  runtimeEnv: AppEnv,
  input: {
    channelId: string;
    broadcasterUserId: string;
    message: string;
  }
) {
  try {
    await runtimeEnv.TWITCH_REPLY_QUEUE.send(input);
  } catch (error) {
    console.error("Failed to queue playlist Twitch reply", {
      channelId: input.channelId,
      broadcasterUserId: input.broadcasterUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function logPlaylistRequestKindChange(
  runtimeEnv: AppEnv,
  input: {
    channelId: string;
    actorUserId: string;
    actorType: "owner" | "moderator";
    action: "upgrade_request_to_vip" | "downgrade_request_to_regular";
    itemId: string;
    requestKind: "regular" | "vip";
    requestedByLogin: string;
    songTitle: string;
  }
) {
  try {
    await createAuditLog(runtimeEnv, {
      channelId: input.channelId,
      actorUserId: input.actorUserId,
      actorType: input.actorType,
      action: input.action,
      entityType: "playlist_item",
      entityId: input.itemId,
      payloadJson: JSON.stringify({
        requestKind: input.requestKind,
        requestedByLogin: input.requestedByLogin,
        songTitle: input.songTitle,
      }),
    });
  } catch (error) {
    console.error("Failed to write playlist request-kind audit log", {
      channelId: input.channelId,
      itemId: input.itemId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function formatPlaylistItemReplyTitle(item: {
  songArtist?: string | null;
  songTitle: string;
}) {
  return item.songArtist
    ? `${item.songArtist} - ${item.songTitle}`
    : item.songTitle;
}

function getRequestKindChangeReplyMessage(input: {
  login: string;
  songTitle: string;
  nextRequestKind: "regular" | "vip";
  status: string;
}) {
  if (input.nextRequestKind === "vip") {
    const nextPositionSuffix =
      input.status === "current" ? "." : " and will play next.";
    return `@${input.login} your request "${input.songTitle}" was upgraded to VIP${nextPositionSuffix}`;
  }

  return `@${input.login} your VIP request "${input.songTitle}" was changed back to a regular request. 1 VIP token was refunded.`;
}

export const Route = createFileRoute("/api/dashboard/playlist")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        try {
          const requestedSlug =
            new URL(request.url).searchParams.get("channel") ?? null;
          const state = await requireDashboardState(
            request,
            runtimeEnv,
            requestedSlug
          );
          if (!state) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }

          return json({
            channel: state.channel,
            playlist: state.playlist,
            items: await enrichPlaylistItems(runtimeEnv, state.items),
            playedSongs: state.playedSongs,
            vipTokens: state.vipTokens,
            blacklistArtists: state.blacklistArtists,
            blacklistCharters: state.blacklistCharters,
            blacklistSongs: state.blacklistSongs,
            accessRole: state.accessRole,
            requiredPaths: state.settings
              ? getArraySetting(state.settings.requiredPathsJson)
              : [],
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load the playlist.";
          const status =
            error instanceof DatabaseSchemaOutOfDateError ? 503 : 500;

          return json({ error: message }, { status });
        }
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const requestedSlug =
          new URL(request.url).searchParams.get("channel") ?? null;
        const state = await requireDashboardState(
          request,
          runtimeEnv,
          requestedSlug
        );
        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const body = playlistMutationSchema.parse(await request.json());

          if (body.action === "changeRequestKind") {
            const item = await getDb(runtimeEnv).query.playlistItems.findFirst({
              where: and(
                eq(playlistItems.channelId, state.channel.id),
                eq(playlistItems.id, body.itemId)
              ),
            });

            if (!item) {
              return json(
                { error: "Playlist item not found." },
                { status: 404 }
              );
            }

            if (item.requestKind === body.requestKind) {
              return json({ ok: true });
            }

            if (!item.requestedByLogin) {
              return json(
                {
                  error:
                    "This request has no requester username, so it cannot be switched between regular and VIP.",
                },
                { status: 400 }
              );
            }

            const actorType =
              state.accessRole === "moderator" ? "moderator" : "owner";
            const songTitle = formatPlaylistItemReplyTitle(item);

            if (body.requestKind === "vip") {
              const balance = await getVipTokenBalance(runtimeEnv, {
                channelId: state.channel.id,
                login: item.requestedByLogin,
              });

              if (!balance || !hasRedeemableVipToken(balance.availableCount)) {
                const availableCount = balance?.availableCount ?? 0;
                const formattedCount = formatVipTokenCount(availableCount);
                return json(
                  {
                    error: `@${item.requestedByLogin} does not have enough VIP tokens. Current balance: ${formattedCount}.`,
                  },
                  { status: 400 }
                );
              }

              await consumeVipToken(runtimeEnv, {
                channelId: state.channel.id,
                login: item.requestedByLogin,
                displayName: item.requestedByDisplayName,
                twitchUserId: item.requestedByTwitchUserId,
              });

              try {
                const response = await callBackend(
                  runtimeEnv,
                  "/internal/playlist/mutate",
                  {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                    },
                    body: JSON.stringify({
                      channelId: state.channel.id,
                      actorUserId: state.actorUserId,
                      ...body,
                    }),
                  }
                );

                if (!response.ok) {
                  throw new Error(await response.text());
                }
              } catch (error) {
                await grantVipToken(runtimeEnv, {
                  channelId: state.channel.id,
                  login: item.requestedByLogin,
                  displayName: item.requestedByDisplayName,
                  twitchUserId: item.requestedByTwitchUserId,
                });
                throw error;
              }

              void queuePlaylistReply(runtimeEnv, {
                channelId: state.channel.id,
                broadcasterUserId: state.channel.twitchChannelId,
                message: getRequestKindChangeReplyMessage({
                  login: item.requestedByLogin,
                  songTitle,
                  nextRequestKind: "vip",
                  status: item.status,
                }),
              });

              void logPlaylistRequestKindChange(runtimeEnv, {
                channelId: state.channel.id,
                actorUserId: state.actorUserId,
                actorType,
                action: "upgrade_request_to_vip",
                itemId: item.id,
                requestKind: body.requestKind,
                requestedByLogin: item.requestedByLogin,
                songTitle,
              });

              return json({ ok: true });
            }

            const response = await callBackend(
              runtimeEnv,
              "/internal/playlist/mutate",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  channelId: state.channel.id,
                  actorUserId: state.actorUserId,
                  ...body,
                }),
              }
            );

            if (!response.ok) {
              return new Response(await response.text(), {
                status: response.status,
                headers: {
                  "content-type": "application/json; charset=utf-8",
                },
              });
            }

            try {
              await grantVipToken(runtimeEnv, {
                channelId: state.channel.id,
                login: item.requestedByLogin,
                displayName: item.requestedByDisplayName,
                twitchUserId: item.requestedByTwitchUserId,
              });
            } catch (error) {
              await callBackend(runtimeEnv, "/internal/playlist/mutate", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  channelId: state.channel.id,
                  actorUserId: state.actorUserId,
                  action: "changeRequestKind",
                  itemId: item.id,
                  requestKind: item.requestKind ?? "vip",
                }),
              });
              throw error;
            }

            void queuePlaylistReply(runtimeEnv, {
              channelId: state.channel.id,
              broadcasterUserId: state.channel.twitchChannelId,
              message: getRequestKindChangeReplyMessage({
                login: item.requestedByLogin,
                songTitle,
                nextRequestKind: "regular",
                status: item.status,
              }),
            });

            void logPlaylistRequestKindChange(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "downgrade_request_to_regular",
              itemId: item.id,
              requestKind: body.requestKind,
              requestedByLogin: item.requestedByLogin,
              songTitle,
            });

            return json({ ok: true });
          }

          const response = await callBackend(
            runtimeEnv,
            "/internal/playlist/mutate",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                channelId: state.channel.id,
                actorUserId: state.actorUserId,
                ...body,
              }),
            }
          );

          return new Response(await response.text(), {
            status: response.status,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Playlist update failed.";

          if (
            error instanceof DatabaseSchemaOutOfDateError ||
            message.includes("no column named request_kind")
          ) {
            return json(
              {
                error: message,
              },
              { status: 503 }
            );
          }

          return json(
            {
              error: message,
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
