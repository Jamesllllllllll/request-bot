import { and, asc, desc, eq } from "drizzle-orm";
import type { z } from "zod";
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
import {
  blockedUsers,
  playedSongs,
  playlistItems,
  setlistArtists,
  vipTokens,
} from "~/lib/db/schema";
import {
  assertDatabaseSchemaCurrent,
  DatabaseSchemaOutOfDateError,
} from "~/lib/db/schema-version";
import type { AppEnv } from "~/lib/env";
import {
  ADD_REQUESTS_WHEN_LIVE_MESSAGE,
  areChannelRequestsOpen,
} from "~/lib/request-availability";
import { getArraySetting } from "~/lib/request-policy";
import { json } from "~/lib/utils";
import type { playlistMutationSchema } from "~/lib/validation";
import {
  formatVipTokenCostLabel,
  getRequiredVipTokenCostForSong,
  parseVipTokenDurationThresholds,
} from "~/lib/vip-token-duration-thresholds";
import { formatVipTokenCount, hasRedeemableVipToken } from "~/lib/vip-tokens";

type PlaylistMutation = z.infer<typeof playlistMutationSchema>;

function summarizePlaylistMutation(body: PlaylistMutation) {
  switch (body.action) {
    case "manualAdd":
      return {
        action: body.action,
        requesterLogin: body.requesterLogin ?? null,
        requesterTwitchUserId: body.requesterTwitchUserId ?? null,
        songId: body.songId,
        title: body.title,
        source: body.source,
        sourceId: body.sourceId ?? null,
      };
    case "deleteItem":
      return {
        action: body.action,
        itemId: body.itemId,
      };
    case "changeRequestKind":
      return {
        action: body.action,
        itemId: body.itemId,
        requestKind: body.requestKind,
      };
    default:
      return {
        action: body.action,
      };
  }
}

function logPlaylistMutationStep(
  message: string,
  input: {
    traceId: string;
    state: PlaylistManagementState;
    body: PlaylistMutation;
    extra?: Record<string, unknown>;
  }
) {
  console.info(message, {
    traceId: input.traceId,
    channelId: input.state.channel.id,
    channelSlug: input.state.channel.slug,
    accessRole: input.state.accessRole,
    actorUserId: input.state.actorUserId,
    ...summarizePlaylistMutation(input.body),
    ...(input.extra ?? {}),
  });
}

export type PlaylistManagementState = {
  channel: {
    id: string;
    slug: string;
    displayName: string;
    twitchChannelId: string;
    isLive: boolean;
    botReadyState?: string | null;
  };
  settings: Awaited<ReturnType<typeof getChannelSettingsByChannelId>>;
  playlist: unknown;
  items: Array<Record<string, unknown>>;
  playedSongs: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
  vipTokens: Array<Record<string, unknown>>;
  blacklistArtists: Array<{ artistId: number; artistName: string }>;
  blacklistCharters: Array<{ charterId: number; charterName: string }>;
  blacklistSongs: Array<{
    songId: number;
    songTitle: string;
    artistName?: string | null;
  }>;
  blacklistSongGroups: Array<{
    groupedProjectId: number;
    songTitle: string;
    artistId?: number | null;
    artistName?: string | null;
  }>;
  setlistArtists: Array<{ artistId: number; artistName: string }>;
  accessRole: "owner" | "moderator";
  actorUserId: string;
};

type PlaylistManagementAccess = NonNullable<
  Awaited<ReturnType<typeof getDashboardChannelAccess>>
>;

export async function requirePlaylistManagementState(
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

  return loadPlaylistManagementStateForAccess(runtimeEnv, access);
}

export async function loadPlaylistManagementStateForAccess(
  runtimeEnv: AppEnv,
  access: PlaylistManagementAccess
) {
  if (access.accessRole === "owner") {
    const state = await getDashboardState(runtimeEnv, access.actorUserId);
    if (!state) {
      return null;
    }

    return {
      ...state,
      accessRole: access.accessRole,
      actorUserId: access.actorUserId,
    } satisfies PlaylistManagementState;
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
  const blockRows = await getDb(runtimeEnv).query.blockedUsers.findMany({
    where: eq(blockedUsers.channelId, access.channel.id),
    orderBy: [desc(blockedUsers.createdAt)],
  });
  const vipTokenRows = await getDb(runtimeEnv).query.vipTokens.findMany({
    where: eq(vipTokens.channelId, access.channel.id),
    orderBy: [asc(vipTokens.login)],
  });
  const setlistRows = await getDb(runtimeEnv).query.setlistArtists.findMany({
    where: eq(setlistArtists.channelId, access.channel.id),
    orderBy: [asc(setlistArtists.artistName)],
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
    blocks: blockRows,
    vipTokens: vipTokenRows,
    blacklistArtists: blacklist.blacklistArtists,
    blacklistCharters: blacklist.blacklistCharters,
    blacklistSongs: blacklist.blacklistSongs,
    blacklistSongGroups: blacklist.blacklistSongGroups,
    setlistArtists: setlistRows,
    accessRole: access.accessRole,
    actorUserId: access.actorUserId,
  } satisfies PlaylistManagementState;
}

export async function enrichPlaylistItems(
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
      songGroupedProjectId: catalogSong?.groupedProjectId ?? null,
      songArtistId: catalogSong?.artistId ?? null,
      songCharterId: catalogSong?.authorId ?? null,
      songUrl: item.songUrl ?? catalogSong?.sourceUrl ?? null,
      songSourceUpdatedAt: catalogSong?.sourceUpdatedAt ?? null,
      songDownloads: catalogSong?.downloads ?? null,
    };
  });
}

export function getPlaylistManagementResponseBody(
  state: PlaylistManagementState
) {
  return {
    channel: state.channel,
    playlist: state.playlist,
    items: state.items,
    playedSongs: state.playedSongs,
    blocks: state.blocks,
    vipTokens: state.vipTokens,
    blacklistArtists: state.blacklistArtists,
    blacklistCharters: state.blacklistCharters,
    blacklistSongs: state.blacklistSongs,
    blacklistSongGroups: state.blacklistSongGroups,
    setlistArtists: state.setlistArtists,
    accessRole: state.accessRole,
    requiredPaths: state.settings
      ? getArraySetting(state.settings.requiredPathsJson)
      : [],
  };
}

export function canManageChannelRequests(state: PlaylistManagementState) {
  return (
    state.accessRole === "owner" || !!state.settings?.moderatorCanManageRequests
  );
}

export function canManageChannelBlacklist(state: PlaylistManagementState) {
  return (
    state.accessRole === "owner" ||
    !!state.settings?.moderatorCanManageBlacklist
  );
}

export function canManageChannelSetlist(state: PlaylistManagementState) {
  return (
    state.accessRole === "owner" || !!state.settings?.moderatorCanManageSetlist
  );
}

export function canManageChannelBlockedChatters(
  state: PlaylistManagementState
) {
  return (
    state.accessRole === "owner" ||
    !!state.settings?.moderatorCanManageBlockedChatters
  );
}

export function canViewChannelVipTokens(state: PlaylistManagementState) {
  return (
    state.accessRole === "owner" ||
    !!state.settings?.moderatorCanViewVipTokens ||
    !!state.settings?.moderatorCanManageVipTokens
  );
}

export function canManageChannelVipTokens(state: PlaylistManagementState) {
  return (
    state.accessRole === "owner" ||
    !!state.settings?.moderatorCanManageVipTokens
  );
}

export function canPerformPlaylistMutationAction(
  state: PlaylistManagementState,
  action: PlaylistMutation["action"]
) {
  switch (action) {
    case "markPlayed":
    case "restorePlayed":
    case "setCurrent":
    case "returnToQueue":
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

export function getForbiddenPlaylistMutationMessage(
  action: PlaylistMutation["action"]
) {
  if (action === "changeRequestKind") {
    return "You do not have permission to manage VIP request changes.";
  }

  return "You do not have permission to manage this channel playlist.";
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
  previousRequestKind: "regular" | "vip";
  nextRequestKind: "regular" | "vip";
  status: string;
  nextVipTokenCost: number;
  vipTokenDelta: number;
}) {
  if (
    input.previousRequestKind !== input.nextRequestKind &&
    input.nextRequestKind === "vip"
  ) {
    const nextPositionSuffix =
      input.status === "current" ? "." : " and will play next.";
    return `@${input.login} your request "${input.songTitle}" was upgraded to VIP for ${formatVipTokenCostLabel(input.nextVipTokenCost)}${nextPositionSuffix}`;
  }

  if (
    input.previousRequestKind !== input.nextRequestKind &&
    input.nextRequestKind === "regular"
  ) {
    return `@${input.login} your VIP request "${input.songTitle}" was changed back to a regular request. ${formatVipTokenCostLabel(Math.abs(input.vipTokenDelta))} ${Math.abs(input.vipTokenDelta) === 1 ? "was" : "were"} refunded.`;
  }

  return `@${input.login} the VIP token cost for your request "${input.songTitle}" is now ${formatVipTokenCostLabel(input.nextVipTokenCost)}.`;
}

function getStoredVipTokenCost(input: {
  requestKind?: string | null;
  vipTokenCost?: number | null;
}) {
  if (
    typeof input.vipTokenCost === "number" &&
    Number.isFinite(input.vipTokenCost) &&
    input.vipTokenCost > 0
  ) {
    return Math.trunc(input.vipTokenCost);
  }

  return input.requestKind === "vip" ? 1 : 0;
}

export async function performPlaylistMutation(
  runtimeEnv: AppEnv,
  state: PlaylistManagementState,
  body: PlaylistMutation
) {
  const traceId = crypto.randomUUID();
  logPlaylistMutationStep("Playlist mutation received", {
    traceId,
    state,
    body,
  });

  const currentItemId =
    state.items.find((item) => item.status === "current")?.id ?? null;
  const currentSongLockMessage =
    "Current songs can be marked played or returned to the queue.";

  if (
    body.action === "setCurrent" &&
    currentItemId &&
    currentItemId !== body.itemId
  ) {
    return json(
      {
        error: "Resolve the current song before playing another one.",
      },
      { status: 409 }
    );
  }

  if (
    (body.action === "deleteItem" || body.action === "chooseVersion") &&
    currentItemId === body.itemId
  ) {
    return json(
      {
        error: currentSongLockMessage,
      },
      { status: 409 }
    );
  }

  if (body.action === "manualAdd" && !areChannelRequestsOpen(state.channel)) {
    return json(
      {
        error: ADD_REQUESTS_WHEN_LIVE_MESSAGE,
      },
      { status: 409 }
    );
  }

  if (body.action === "changeRequestKind") {
    const item = await getDb(runtimeEnv).query.playlistItems.findFirst({
      where: and(
        eq(playlistItems.channelId, state.channel.id),
        eq(playlistItems.id, body.itemId)
      ),
    });

    if (!item) {
      return json({ error: "Playlist item not found." }, { status: 404 });
    }

    if (item.status === "current") {
      return json(
        {
          error: currentSongLockMessage,
        },
        { status: 409 }
      );
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

    const actorType = state.accessRole === "moderator" ? "moderator" : "owner";
    const songTitle = formatPlaylistItemReplyTitle(item);
    const currentVipTokenCost = getStoredVipTokenCost(item);
    const requiredVipTokenCost = getRequiredVipTokenCostForSong(
      {
        durationText: item.songDurationText,
      },
      parseVipTokenDurationThresholds(
        state.settings?.vipTokenDurationThresholdsJson
      )
    );
    const nextVipTokenCost =
      body.requestKind === "vip"
        ? Math.max(body.vipTokenCost ?? requiredVipTokenCost, 1)
        : 0;
    const vipTokenDelta = nextVipTokenCost - currentVipTokenCost;

    if (item.requestKind === body.requestKind && vipTokenDelta === 0) {
      logPlaylistMutationStep(
        "Playlist mutation skipped; request kind unchanged",
        {
          traceId,
          state,
          body,
          extra: {
            itemId: item.id,
          },
        }
      );
      return json({ ok: true });
    }

    if (vipTokenDelta > 0) {
      const balance = await getVipTokenBalance(runtimeEnv, {
        channelId: state.channel.id,
        login: item.requestedByLogin,
      });

      if (
        !balance ||
        !hasRedeemableVipToken(balance.availableCount, vipTokenDelta)
      ) {
        const availableCount = balance?.availableCount ?? 0;
        const formattedCount = formatVipTokenCount(availableCount);
        return json(
          {
            error: `@${item.requestedByLogin} does not have enough VIP tokens. They need ${formatVipTokenCostLabel(vipTokenDelta)} more. Current balance: ${formattedCount}.`,
          },
          { status: 400 }
        );
      }

      const consumed = await consumeVipToken(runtimeEnv, {
        channelId: state.channel.id,
        login: item.requestedByLogin,
        displayName: item.requestedByDisplayName,
        twitchUserId: item.requestedByTwitchUserId,
        count: vipTokenDelta,
      });

      if (!consumed) {
        return json(
          {
            error: `@${item.requestedByLogin} no longer has enough VIP tokens for this change.`,
          },
          { status: 409 }
        );
      }
    }

    logPlaylistMutationStep("Playlist mutation forwarding to backend", {
      traceId,
      state,
      body,
      extra: {
        path: "/internal/playlist/mutate",
      },
    });
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
          traceId,
          ...body,
          vipTokenCost: nextVipTokenCost,
        }),
      }
    );

    if (!response.ok) {
      if (vipTokenDelta > 0) {
        await grantVipToken(runtimeEnv, {
          channelId: state.channel.id,
          login: item.requestedByLogin,
          displayName: item.requestedByDisplayName,
          twitchUserId: item.requestedByTwitchUserId,
          count: vipTokenDelta,
        });
      }
      console.error("Playlist mutation backend call returned error", {
        traceId,
        channelId: state.channel.id,
        channelSlug: state.channel.slug,
        accessRole: state.accessRole,
        actorUserId: state.actorUserId,
        ...summarizePlaylistMutation(body),
        status: response.status,
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    try {
      if (vipTokenDelta < 0) {
        await grantVipToken(runtimeEnv, {
          channelId: state.channel.id,
          login: item.requestedByLogin,
          displayName: item.requestedByDisplayName,
          twitchUserId: item.requestedByTwitchUserId,
          count: Math.abs(vipTokenDelta),
        });
      }
    } catch (error) {
      await callBackend(runtimeEnv, "/internal/playlist/mutate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          channelId: state.channel.id,
          actorUserId: state.actorUserId,
          traceId,
          action: "changeRequestKind",
          itemId: item.id,
          requestKind: item.requestKind ?? "vip",
          vipTokenCost: currentVipTokenCost,
        }),
      });
      console.error("Playlist mutation post-backend refund step failed", {
        traceId,
        channelId: state.channel.id,
        channelSlug: state.channel.slug,
        accessRole: state.accessRole,
        actorUserId: state.actorUserId,
        ...summarizePlaylistMutation(body),
        itemId: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    void queuePlaylistReply(runtimeEnv, {
      channelId: state.channel.id,
      broadcasterUserId: state.channel.twitchChannelId,
      message: getRequestKindChangeReplyMessage({
        login: item.requestedByLogin,
        songTitle,
        previousRequestKind: item.requestKind === "vip" ? "vip" : "regular",
        nextRequestKind: body.requestKind,
        status: item.status,
        nextVipTokenCost,
        vipTokenDelta,
      }),
    });

    if (item.requestKind !== body.requestKind) {
      void logPlaylistRequestKindChange(runtimeEnv, {
        channelId: state.channel.id,
        actorUserId: state.actorUserId,
        actorType,
        action:
          body.requestKind === "vip"
            ? "upgrade_request_to_vip"
            : "downgrade_request_to_regular",
        itemId: item.id,
        requestKind: body.requestKind,
        requestedByLogin: item.requestedByLogin,
        songTitle,
      });
    }

    logPlaylistMutationStep("Playlist mutation completed", {
      traceId,
      state,
      body,
    });
    return json({ ok: true });
  }

  logPlaylistMutationStep("Playlist mutation forwarding to backend", {
    traceId,
    state,
    body,
    extra: {
      path: "/internal/playlist/mutate",
    },
  });
  const response = await callBackend(runtimeEnv, "/internal/playlist/mutate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channelId: state.channel.id,
      actorUserId: state.actorUserId,
      traceId,
      ...body,
    }),
  });

  console.info("Playlist mutation backend response received", {
    traceId,
    channelId: state.channel.id,
    channelSlug: state.channel.slug,
    accessRole: state.accessRole,
    actorUserId: state.actorUserId,
    ...summarizePlaylistMutation(body),
    status: response.status,
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function toPlaylistMutationErrorResponse(error: unknown) {
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
