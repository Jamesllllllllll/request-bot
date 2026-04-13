import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import {
  notifyPlaylistStream,
  type PlaylistStreamNotifyReason,
} from "~/lib/backend";
import {
  addBlacklistedArtist,
  addBlacklistedCharter,
  addBlacklistedSong,
  addBlacklistedSongGroup,
  addBlockedUser,
  addPreferredCharter,
  addSetlistArtist,
  createAuditLog,
  getVipTokenBalance,
  grantVipToken,
  removeBlacklistedArtist,
  removeBlacklistedCharter,
  removeBlacklistedSong,
  removeBlacklistedSongGroup,
  removeBlockedUser,
  removePreferredCharter,
  removeSetlistArtist,
  revokeVipToken,
  setVipTokenAvailableCount,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import {
  canManageChannelBlacklist,
  canManageChannelBlockedChatters,
  canManageChannelSetlist,
  canManageChannelVipTokens,
  requirePlaylistManagementState,
} from "~/lib/server/playlist-management";
import { json } from "~/lib/utils";
import { moderationActionSchema } from "~/lib/validation";
import { formatVipTokenCount } from "~/lib/vip-tokens";

function getActorType(accessRole: "owner" | "moderator") {
  return accessRole === "owner" ? "owner" : "moderator";
}

function getModerationNotifyReason(
  action: ReturnType<typeof moderationActionSchema.parse>["action"]
): PlaylistStreamNotifyReason {
  switch (action) {
    case "addBlacklistedArtist":
    case "removeBlacklistedArtist":
    case "addBlacklistedCharter":
    case "removeBlacklistedCharter":
    case "addPreferredCharter":
    case "removePreferredCharter":
    case "addBlacklistedSong":
    case "removeBlacklistedSong":
    case "addBlacklistedSongGroup":
    case "removeBlacklistedSongGroup":
      return "blacklist";
    case "addSetlistArtist":
    case "removeSetlistArtist":
      return "setlist";
    case "blockUser":
    case "removeBlockedUser":
      return "blocks";
    case "addVipToken":
    case "removeVipToken":
    case "setVipTokenCount":
      return "vip-tokens";
    default:
      return "settings";
  }
}

export const Route = createFileRoute("/api/channel/$slug/moderation")({
  server: {
    handlers: {
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

        const body = moderationActionSchema.parse(await request.json());
        const actorType = getActorType(state.accessRole);

        switch (body.action) {
          case "addBlacklistedArtist":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await addBlacklistedArtist(runtimeEnv, {
              channelId: state.channel.id,
              artistId: body.artistId,
              artistName: body.artistName,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "add_blacklisted_artist",
              entityType: "blacklisted_artist",
              entityId: String(body.artistId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeBlacklistedArtist":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await removeBlacklistedArtist(
              runtimeEnv,
              state.channel.id,
              body.artistId
            );
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "remove_blacklisted_artist",
              entityType: "blacklisted_artist",
              entityId: String(body.artistId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "addBlacklistedCharter":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await addBlacklistedCharter(runtimeEnv, {
              channelId: state.channel.id,
              charterId: body.charterId,
              charterName: body.charterName,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "add_blacklisted_charter",
              entityType: "blacklisted_charter",
              entityId: String(body.charterId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeBlacklistedCharter":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await removeBlacklistedCharter(
              runtimeEnv,
              state.channel.id,
              body.charterId
            );
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "remove_blacklisted_charter",
              entityType: "blacklisted_charter",
              entityId: String(body.charterId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "addPreferredCharter":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await addPreferredCharter(runtimeEnv, {
              channelId: state.channel.id,
              charterId: body.charterId,
              charterName: body.charterName,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "add_preferred_charter",
              entityType: "preferred_charter",
              entityId: String(body.charterId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removePreferredCharter":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await removePreferredCharter(
              runtimeEnv,
              state.channel.id,
              body.charterId
            );
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "remove_preferred_charter",
              entityType: "preferred_charter",
              entityId: String(body.charterId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "addBlacklistedSong":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await addBlacklistedSong(runtimeEnv, {
              channelId: state.channel.id,
              songId: body.songId,
              songTitle: body.songTitle,
              artistId: body.artistId ?? null,
              artistName: body.artistName ?? null,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "add_blacklisted_song",
              entityType: "blacklisted_song",
              entityId: String(body.songId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "addBlacklistedSongGroup":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await addBlacklistedSongGroup(runtimeEnv, {
              channelId: state.channel.id,
              groupedProjectId: body.groupedProjectId,
              songTitle: body.songTitle,
              artistId: body.artistId ?? null,
              artistName: body.artistName ?? null,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "add_blacklisted_song_group",
              entityType: "blacklisted_song_group",
              entityId: String(body.groupedProjectId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeBlacklistedSong":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await removeBlacklistedSong(
              runtimeEnv,
              state.channel.id,
              body.songId
            );
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "remove_blacklisted_song",
              entityType: "blacklisted_song",
              entityId: String(body.songId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeBlacklistedSongGroup":
            if (!canManageChannelBlacklist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await removeBlacklistedSongGroup(
              runtimeEnv,
              state.channel.id,
              body.groupedProjectId
            );
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "remove_blacklisted_song_group",
              entityType: "blacklisted_song_group",
              entityId: String(body.groupedProjectId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "addSetlistArtist":
            if (!canManageChannelSetlist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await addSetlistArtist(runtimeEnv, {
              channelId: state.channel.id,
              artistId: body.artistId,
              artistName: body.artistName,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "add_setlist_artist",
              entityType: "setlist_artist",
              entityId: String(body.artistId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeSetlistArtist":
            if (!canManageChannelSetlist(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await removeSetlistArtist(
              runtimeEnv,
              state.channel.id,
              body.artistId
            );
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "remove_setlist_artist",
              entityType: "setlist_artist",
              entityId: String(body.artistId),
              payloadJson: JSON.stringify(body),
            });
            break;
          case "blockUser":
            if (!canManageChannelBlockedChatters(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await addBlockedUser(runtimeEnv, {
              channelId: state.channel.id,
              createdByUserId: state.actorUserId,
              twitchUserId: body.twitchUserId,
              login: body.login,
              displayName: body.displayName,
              reason: body.reason,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "block_user",
              entityType: "blocked_user",
              entityId: body.twitchUserId,
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeBlockedUser":
            if (!canManageChannelBlockedChatters(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await removeBlockedUser(runtimeEnv, {
              channelId: state.channel.id,
              twitchUserId: body.twitchUserId,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "unblock_user",
              entityType: "blocked_user",
              entityId: body.twitchUserId,
              payloadJson: JSON.stringify(body),
            });
            break;
          case "addVipToken":
            if (!canManageChannelVipTokens(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await grantVipToken(runtimeEnv, {
              channelId: state.channel.id,
              login: body.login,
              displayName: body.displayName,
              twitchUserId: body.twitchUserId,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "grant_vip_token",
              entityType: "vip_token",
              entityId: body.login,
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeVipToken":
            if (!canManageChannelVipTokens(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            await revokeVipToken(runtimeEnv, {
              channelId: state.channel.id,
              login: body.login,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "revoke_vip_token",
              entityType: "vip_token",
              entityId: body.login,
              payloadJson: JSON.stringify(body),
            });
            break;
          case "setVipTokenCount": {
            if (!canManageChannelVipTokens(state)) {
              return json({ error: "Forbidden" }, { status: 403 });
            }
            const updatedToken = await setVipTokenAvailableCount(runtimeEnv, {
              channelId: state.channel.id,
              login: body.login,
              count: body.count,
            });
            const nextCount =
              updatedToken?.availableCount ??
              (
                await getVipTokenBalance(runtimeEnv, {
                  channelId: state.channel.id,
                  login: body.login,
                })
              )?.availableCount ??
              0;
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.actorUserId,
              actorType,
              action: "set_vip_token_count",
              entityType: "vip_token",
              entityId: body.login,
              payloadJson: JSON.stringify({
                ...body,
                savedCount: formatVipTokenCount(nextCount),
              }),
            });
            break;
          }
          default:
            return json(
              {
                error: "This moderation action still belongs to the dashboard.",
              },
              { status: 400 }
            );
        }

        await notifyPlaylistStream(runtimeEnv, {
          channelId: state.channel.id,
          reason: getModerationNotifyReason(body.action),
        });

        return json({ ok: true });
      },
    },
  },
});
