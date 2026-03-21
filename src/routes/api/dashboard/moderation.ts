// Route: Reads and updates moderation rules for the active dashboard channel.
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getSessionUserId } from "~/lib/auth/session.server";
import {
  addBlacklistedArtist,
  addBlacklistedCharter,
  addBlacklistedSong,
  addBlockedUser,
  addSetlistArtist,
  createAuditLog,
  getDashboardState,
  grantVipToken,
  removeBlacklistedArtist,
  removeBlacklistedCharter,
  removeBlacklistedSong,
  removeSetlistArtist,
  revokeVipToken,
} from "~/lib/db/repositories";
import type { AppEnv } from "~/lib/env";
import { json } from "~/lib/utils";
import { moderationActionSchema } from "~/lib/validation";

async function requireDashboardState(request: Request, runtimeEnv: AppEnv) {
  const userId = await getSessionUserId(request, runtimeEnv);
  if (!userId) {
    return null;
  }

  return getDashboardState(runtimeEnv, userId);
}

export const Route = createFileRoute("/api/dashboard/moderation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireDashboardState(request, runtimeEnv);
        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        return json({
          settings: {
            blacklistEnabled: state.settings?.blacklistEnabled ?? false,
          },
          blocks: state.blocks,
          blacklistArtists: state.blacklistArtists,
          blacklistCharters: state.blacklistCharters,
          blacklistSongs: state.blacklistSongs,
          setlistArtists: state.setlistArtists,
          vipTokens: state.vipTokens,
        });
      },
      POST: async ({ request }) => {
        const runtimeEnv = env as AppEnv;
        const state = await requireDashboardState(request, runtimeEnv);
        if (!state) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = moderationActionSchema.parse(await request.json());

        switch (body.action) {
          case "blockUser":
            await addBlockedUser(runtimeEnv, {
              channelId: state.channel.id,
              createdByUserId: state.channel.ownerUserId,
              twitchUserId: body.twitchUserId,
              login: body.login,
              displayName: body.displayName,
              reason: body.reason,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.channel.ownerUserId,
              actorType: "owner",
              action: "block_user",
              entityType: "blocked_user",
              entityId: body.twitchUserId,
              payloadJson: JSON.stringify(body),
            });
            break;
          case "addBlacklistedArtist":
            await addBlacklistedArtist(runtimeEnv, {
              channelId: state.channel.id,
              artistId: body.artistId,
              artistName: body.artistName,
            });
            break;
          case "removeBlacklistedArtist":
            await removeBlacklistedArtist(
              runtimeEnv,
              state.channel.id,
              body.artistId
            );
            break;
          case "addBlacklistedCharter":
            await addBlacklistedCharter(runtimeEnv, {
              channelId: state.channel.id,
              charterId: body.charterId,
              charterName: body.charterName,
            });
            break;
          case "removeBlacklistedCharter":
            await removeBlacklistedCharter(
              runtimeEnv,
              state.channel.id,
              body.charterId
            );
            break;
          case "addBlacklistedSong":
            await addBlacklistedSong(runtimeEnv, {
              channelId: state.channel.id,
              songId: body.songId,
              songTitle: body.songTitle,
              artistId: body.artistId ?? null,
              artistName: body.artistName ?? null,
            });
            break;
          case "removeBlacklistedSong":
            await removeBlacklistedSong(
              runtimeEnv,
              state.channel.id,
              body.songId
            );
            break;
          case "addSetlistArtist":
            await addSetlistArtist(runtimeEnv, {
              channelId: state.channel.id,
              artistId: body.artistId,
              artistName: body.artistName,
            });
            break;
          case "removeSetlistArtist":
            await removeSetlistArtist(
              runtimeEnv,
              state.channel.id,
              body.artistId
            );
            break;
          case "addVipToken":
            await grantVipToken(runtimeEnv, {
              channelId: state.channel.id,
              login: body.login,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.channel.ownerUserId,
              actorType: "owner",
              action: "grant_vip_token",
              entityType: "vip_token",
              entityId: body.login,
              payloadJson: JSON.stringify(body),
            });
            break;
          case "removeVipToken":
            await revokeVipToken(runtimeEnv, {
              channelId: state.channel.id,
              login: body.login,
            });
            await createAuditLog(runtimeEnv, {
              channelId: state.channel.id,
              actorUserId: state.channel.ownerUserId,
              actorType: "owner",
              action: "revoke_vip_token",
              entityType: "vip_token",
              entityId: body.login,
              payloadJson: JSON.stringify(body),
            });
            break;
        }

        return json({ ok: true });
      },
    },
  },
});
