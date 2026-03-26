import { withMonitor, withSentry } from "@sentry/cloudflare";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  createPlayedSong,
  getBotAuthorization,
  getChannelBlacklistByChannelId,
} from "~/lib/db/repositories";
import * as schema from "~/lib/db/schema";
import {
  auditLogs,
  channelSettings,
  channels,
  playlistItems,
  playlists,
  requestLogs,
  twitchAuthorizations,
  users,
} from "~/lib/db/schema";
import { assertDatabaseSchemaCurrent } from "~/lib/db/schema-version";
import type { BackendEnv } from "~/lib/env";
import type {
  AddRequestInput,
  ChangeRequestKindInput,
  ChooseVersionInput,
  ClearPlaylistInput,
  DeleteItemInput,
  ManualAddInput,
  MarkPlayedInput,
  PlaylistCoordinator,
  PlaylistMutationResult,
  RemoveRequestsInput,
  ReorderItemsInput,
  ResetSessionInput,
  RestorePlayedInput,
  SetCurrentInput,
  ShuffleNextInput,
  ShufflePlaylistInput,
} from "~/lib/playlist/types";
import { getRequiredPathsWarning, isSongAllowed } from "~/lib/request-policy";
import { getSentryD1Database, getSentryOptions } from "~/lib/sentry";
import {
  getAppAccessToken,
  getTwitchUserByLogin,
  sendChatReply,
} from "~/lib/twitch/api";
import { reconcileChannelBotState } from "~/lib/twitch/bot";
import { createId, json, normalizeSongSourceUrl } from "~/lib/utils";

function getDb(env: BackendEnv) {
  return drizzle(getSentryD1Database(env), { schema });
}

type ReplyQueueMessage = {
  channelId: string;
  broadcasterUserId: string;
  message: string;
};

interface PlaylistStreamClient {
  id: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
}

type MutationPayload = Record<string, unknown>;

type PlaylistCandidate = {
  id: string;
  groupedProjectId?: number;
  authorId?: number;
  title: string;
  artist?: string;
  album?: string;
  creator?: string;
  tuning?: string;
  parts?: string[];
  durationText?: string;
  downloads?: number;
  sourceUrl?: string;
  sourceId?: number;
};

function getMutationTraceId(payload: MutationPayload) {
  return typeof payload.traceId === "string" && payload.traceId.length > 0
    ? payload.traceId
    : crypto.randomUUID();
}

function summarizeMutationPayload(payload: MutationPayload) {
  const action =
    typeof payload.action === "string" ? payload.action : undefined;

  return {
    action,
    channelId:
      typeof payload.channelId === "string" ? payload.channelId : undefined,
    actorUserId:
      typeof payload.actorUserId === "string" ? payload.actorUserId : undefined,
    itemId: typeof payload.itemId === "string" ? payload.itemId : undefined,
    requesterLogin:
      typeof payload.requesterLogin === "string"
        ? payload.requesterLogin
        : undefined,
    requesterTwitchUserId:
      typeof payload.requesterTwitchUserId === "string"
        ? payload.requesterTwitchUserId
        : undefined,
    requesterDisplayName:
      typeof payload.requesterDisplayName === "string"
        ? payload.requesterDisplayName
        : undefined,
    songId: typeof payload.songId === "string" ? payload.songId : undefined,
    title: typeof payload.title === "string" ? payload.title : undefined,
    kind: typeof payload.kind === "string" ? payload.kind : undefined,
    requestKind:
      typeof payload.requestKind === "string" ? payload.requestKind : undefined,
  };
}

function logPlaylistWorkerStep(
  message: string,
  input: {
    traceId: string;
    channelId?: string;
    extra?: Record<string, unknown>;
  }
) {
  console.info(message, {
    traceId: input.traceId,
    channelId: input.channelId ?? null,
    ...(input.extra ?? {}),
  });
}

class D1PlaylistCoordinator implements PlaylistCoordinator {
  constructor(
    private state: DurableObjectState,
    private env: BackendEnv,
    private onPlaylistChanged?: (channelId: string) => Promise<void>
  ) {}

  private async getPlaylist(channelId: string) {
    const db = getDb(this.env);
    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.channelId, channelId),
    });

    if (!playlist) {
      throw new Error("Playlist not found");
    }

    const items = await db.query.playlistItems.findMany({
      where: eq(playlistItems.playlistId, playlist.id),
    });

    return { playlist, items };
  }

  private async notify(channelId: string) {
    console.info("Playlist notify start", {
      channelId,
      hasOnPlaylistChanged: Boolean(this.onPlaylistChanged),
    });
    if (this.onPlaylistChanged) {
      const notifyTask = (async () => {
        try {
          await this.onPlaylistChanged?.(channelId);
          console.info("Playlist notify background delivery complete", {
            channelId,
          });
        } catch (error) {
          console.error("Playlist notify background delivery failed", {
            channelId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      this.state.waitUntil(notifyTask);
    }
    console.info("Playlist notify queued", {
      channelId,
    });
  }

  private async audit(
    channelId: string,
    actorUserId: string | null,
    action: string,
    entityId: string,
    payload: unknown
  ) {
    await getDb(this.env)
      .insert(auditLogs)
      .values({
        id: createId("alog"),
        channelId,
        actorUserId,
        actorType: actorUserId ? "owner" : "system",
        action,
        entityType: "playlist_item",
        entityId,
        payloadJson: JSON.stringify(payload),
      });
  }

  private async reindexPlaylistItems(
    items: Array<{ id: string; position: number }>
  ) {
    const db = getDb(this.env);

    for (const item of items) {
      await db
        .update(playlistItems)
        .set({
          position: item.position + 1000,
          updatedAt: Date.now(),
        })
        .where(eq(playlistItems.id, item.id));
    }

    for (const [index, item] of items.entries()) {
      await db
        .update(playlistItems)
        .set({
          position: index + 1,
          updatedAt: Date.now(),
        })
        .where(eq(playlistItems.id, item.id));
    }
  }

  private async getUpdatedQueuedPositionsAfterKindChange(input: {
    items: Array<{
      id: string;
      position: number;
      status: string;
    }>;
    playlistCurrentItemId?: string | null;
    targetItemId: string;
    requestKind: "regular" | "vip";
  }) {
    const sortedItems = [...input.items].sort(
      (a, b) => a.position - b.position
    );
    const target = sortedItems.find((item) => item.id === input.targetItemId);
    if (!target) {
      throw new Error("Playlist item not found");
    }

    if (target.status === "current") {
      return sortedItems.map((item) => ({
        id: item.id,
        position: item.position,
      }));
    }

    const queued = sortedItems.filter((item) => item.status === "queued");
    const remainingQueued = queued.filter(
      (item) => item.id !== input.targetItemId
    );
    const currentItem = input.playlistCurrentItemId
      ? (sortedItems.find((item) => item.id === input.playlistCurrentItemId) ??
        null)
      : null;

    const reorderedQueued =
      input.requestKind === "vip"
        ? [target, ...remainingQueued]
        : [...remainingQueued, target];
    const queuedStartPosition = currentItem ? currentItem.position + 1 : 1;

    return reorderedQueued.map((item, index) => ({
      id: item.id,
      position: queuedStartPosition + index,
    }));
  }

  async addRequest(input: AddRequestInput): Promise<PlaylistMutationResult> {
    console.info("Playlist addRequest start", {
      channelId: input.channelId,
      requesterLogin: input.requestedByLogin ?? null,
      requesterTwitchUserId: input.requestedByTwitchUserId ?? null,
      songId: input.song.id,
      title: input.song.title,
      prioritizeNext: input.prioritizeNext ?? false,
      requestKind: input.requestKind ?? "regular",
      hasMessageId: Boolean(input.messageId),
    });
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);

    if (input.messageId) {
      const existing = await db.query.playlistItems.findFirst({
        where: and(
          eq(playlistItems.channelId, input.channelId),
          eq(playlistItems.requestMessageId, input.messageId)
        ),
      });

      if (existing) {
        console.info("Playlist addRequest duplicate by message id", {
          channelId: input.channelId,
          messageId: input.messageId,
          existingItemId: existing.id,
        });
        return {
          ok: true,
          duplicate: true,
          playlistId: playlist.id,
          currentItemId: playlist.currentItemId,
          changedItemId: existing.id,
          message: "Request already added",
        };
      }
    }

    const itemId = createId("pli");
    let nextPosition = items.length
      ? Math.max(...items.map((item) => item.position)) + 1
      : 1;

    if (input.prioritizeNext && playlist.currentItemId) {
      const currentItem =
        items.find((item) => item.id === playlist.currentItemId) ?? null;
      const queued = items
        .filter((item) => item.status === "queued")
        .sort((a, b) => a.position - b.position);

      if (currentItem) {
        for (const item of queued) {
          await db
            .update(playlistItems)
            .set({
              position: item.position + 1000,
              updatedAt: Date.now(),
            })
            .where(eq(playlistItems.id, item.id));
        }

        nextPosition = currentItem.position + 1;
        for (const [index, item] of queued.entries()) {
          await db
            .update(playlistItems)
            .set({
              position: currentItem.position + 2 + index,
              updatedAt: Date.now(),
            })
            .where(eq(playlistItems.id, item.id));
        }
      } else {
        nextPosition = 1;
      }
    }

    try {
      await db.insert(playlistItems).values({
        id: itemId,
        playlistId: playlist.id,
        channelId: input.channelId,
        songId: input.song.id,
        songTitle: input.song.title,
        songArtist: input.song.artist,
        songAlbum: input.song.album,
        songCreator: input.song.creator,
        songTuning: input.song.tuning,
        songPartsJson: JSON.stringify(input.song.parts ?? []),
        songDurationText: input.song.durationText,
        songCatalogSourceId: input.song.cdlcId ?? null,
        songSource: input.song.source,
        songUrl: input.song.sourceUrl,
        requestedQuery: input.song.requestedQuery ?? null,
        warningCode: input.song.warningCode ?? null,
        warningMessage: input.song.warningMessage ?? null,
        candidateMatchesJson: input.song.candidateMatchesJson ?? null,
        status: "queued",
        requestedByTwitchUserId: input.requestedByTwitchUserId,
        requestedByLogin: input.requestedByLogin,
        requestedByDisplayName: input.requestedByDisplayName,
        requestMessageId: input.messageId ?? null,
        requestKind: input.requestKind ?? "regular",
        position: nextPosition,
      });
    } catch (error) {
      if (!input.messageId) {
        throw error;
      }

      const duplicate = await db.query.playlistItems.findFirst({
        where: and(
          eq(playlistItems.channelId, input.channelId),
          eq(playlistItems.requestMessageId, input.messageId)
        ),
      });

      if (!duplicate) {
        throw error;
      }

      console.info("Playlist addRequest duplicate after insert race", {
        channelId: input.channelId,
        messageId: input.messageId,
        duplicateItemId: duplicate.id,
      });

      return {
        ok: true,
        duplicate: true,
        playlistId: playlist.id,
        currentItemId: playlist.currentItemId,
        changedItemId: duplicate.id,
        message: "Request already added",
      };
    }

    await this.audit(
      input.channelId,
      null,
      input.requestKind === "vip" ? "vip_request_added" : "request_added",
      itemId,
      input
    );
    await this.notify(input.channelId);

    console.info("Playlist addRequest complete", {
      channelId: input.channelId,
      itemId,
      playlistId: playlist.id,
      currentItemId: playlist.currentItemId,
    });

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: playlist.currentItemId,
      changedItemId: itemId,
      message: "Request added",
    };
  }

  async changeRequestKind(
    input: ChangeRequestKindInput
  ): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const target = items.find((item) => item.id === input.itemId);

    if (!target) {
      throw new Error("Playlist item not found");
    }

    if (target.requestKind === input.requestKind) {
      return {
        ok: true,
        playlistId: playlist.id,
        currentItemId: playlist.currentItemId,
        changedItemId: target.id,
        message: "Request already has that priority",
      };
    }

    const nextQueuedPositions =
      await this.getUpdatedQueuedPositionsAfterKindChange({
        items,
        playlistCurrentItemId: playlist.currentItemId,
        targetItemId: input.itemId,
        requestKind: input.requestKind,
      });

    await db
      .update(playlistItems)
      .set({
        requestKind: input.requestKind,
        updatedAt: Date.now(),
      })
      .where(eq(playlistItems.id, input.itemId));

    await this.reindexPlaylistItems(nextQueuedPositions);

    await this.audit(
      input.channelId,
      input.actorUserId,
      input.requestKind === "vip"
        ? "request_upgraded_to_vip"
        : "request_downgraded_to_regular",
      input.itemId,
      {
        requestKind: input.requestKind,
      }
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: playlist.currentItemId,
      changedItemId: input.itemId,
      message:
        input.requestKind === "vip"
          ? "Request upgraded to VIP"
          : "Request changed to regular",
    };
  }

  async manualAdd(input: ManualAddInput): Promise<PlaylistMutationResult> {
    console.info("Playlist manualAdd start", {
      channelId: input.channelId,
      actorUserId: input.actorUserId,
      requesterLogin: input.requesterLogin ?? null,
      requesterTwitchUserId: input.requesterTwitchUserId ?? null,
      requesterDisplayName: input.requesterDisplayName ?? null,
      songId: input.song.id,
      title: input.song.title,
      source: input.song.source,
      cdlcId: input.song.cdlcId ?? null,
    });
    const db = getDb(this.env);
    const channel = await getDb(this.env).query.channels.findFirst({
      where: eq(channels.id, input.channelId),
    });

    if (!channel) {
      throw new Error("Channel not found");
    }

    const requester = input.requesterLogin
      ? await resolveTwitchUserForRequester(this.env, {
          requesterLogin: input.requesterLogin,
          requesterTwitchUserId: input.requesterTwitchUserId,
          requesterDisplayName: input.requesterDisplayName,
        })
      : null;

    console.info("Playlist manualAdd requester resolved", {
      channelId: input.channelId,
      requesterLogin: input.requesterLogin ?? null,
      resolvedRequesterTwitchUserId: requester?.id ?? channel.twitchChannelId,
      resolvedRequesterLogin: requester?.login ?? channel.login,
      resolvedRequesterDisplayName:
        requester?.display_name ?? channel.displayName,
      resolvedFromExplicitRequester: Boolean(input.requesterLogin),
    });

    const settings = await db.query.channelSettings.findFirst({
      where: eq(channelSettings.channelId, input.channelId),
    });
    const blacklist = await getChannelBlacklistByChannelId(
      this.env as unknown as never,
      input.channelId
    );

    if (!settings) {
      throw new Error("Channel settings not found");
    }

    const songAllowed = isSongAllowed({
      song: {
        id: input.song.id,
        groupedProjectId: input.song.groupedProjectId,
        artistId: undefined,
        authorId: input.song.authorId,
        title: input.song.title,
        artist: input.song.artist,
        album: input.song.album,
        creator: input.song.creator,
        tuning: input.song.tuning,
        parts: input.song.parts,
        durationText: input.song.durationText,
        sourceId: input.song.cdlcId,
        source: input.song.source,
        sourceUrl: input.song.sourceUrl,
      },
      settings,
      blacklistArtists: blacklist.blacklistArtists,
      blacklistCharters: blacklist.blacklistCharters,
      blacklistSongs: blacklist.blacklistSongs,
      blacklistSongGroups: blacklist.blacklistSongGroups,
      setlistArtists: [],
      requester: {
        isBroadcaster: true,
        isModerator: false,
        isVip: false,
        isSubscriber: false,
      },
    });

    if (!songAllowed.allowed) {
      console.info("Playlist manualAdd rejected by policy", {
        channelId: input.channelId,
        songId: input.song.id,
        title: input.song.title,
        reason: songAllowed.reason ?? null,
      });
      throw new Error(songAllowed.reason ?? "That song is not allowed.");
    }

    console.info("Playlist manualAdd allowed by policy", {
      channelId: input.channelId,
      songId: input.song.id,
      title: input.song.title,
    });

    return this.addRequest({
      channelId: input.channelId,
      requestedByTwitchUserId: requester?.id ?? channel.twitchChannelId,
      requestedByLogin: requester?.login ?? channel.login,
      requestedByDisplayName: requester?.display_name ?? channel.displayName,
      requestKind: "regular",
      song: input.song,
    });
  }

  async removeRequests(
    input: RemoveRequestsInput
  ): Promise<PlaylistMutationResult> {
    console.info("Playlist removeRequests start", {
      channelId: input.channelId,
      actorUserId: input.actorUserId,
      requesterLogin: input.requesterLogin,
      requesterTwitchUserId: input.requesterTwitchUserId,
      kind: input.kind,
    });
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const removable = items
      .filter(
        (item) =>
          item.requestedByTwitchUserId === input.requesterTwitchUserId &&
          (item.status === "queued" || item.status === "current") &&
          (input.kind === "all" || item.requestKind === input.kind)
      )
      .sort((a, b) => a.position - b.position);

    if (removable.length === 0) {
      console.info("Playlist removeRequests found no matching items", {
        channelId: input.channelId,
        requesterTwitchUserId: input.requesterTwitchUserId,
        kind: input.kind,
      });
      return {
        ok: true,
        playlistId: playlist.id,
        currentItemId: playlist.currentItemId,
        message: "No matching requests found",
      };
    }

    const removedIds = new Set(removable.map((item) => item.id));
    for (const item of removable) {
      await db.delete(playlistItems).where(eq(playlistItems.id, item.id));
    }

    const remaining = items
      .filter((item) => !removedIds.has(item.id))
      .sort((a, b) => a.position - b.position);
    await this.reindexPlaylistItems(remaining);

    const removedSongIds = new Set(
      removable
        .map((item) => item.songId)
        .filter((songId): songId is string => Boolean(songId))
    );
    for (const songId of removedSongIds) {
      const stillOnPlaylist = remaining.some((item) => item.songId === songId);
      if (stillOnPlaylist) {
        continue;
      }

      await db
        .delete(requestLogs)
        .where(
          and(
            eq(requestLogs.channelId, input.channelId),
            eq(requestLogs.matchedSongId, songId),
            eq(requestLogs.outcome, "accepted")
          )
        );
    }

    const removedCurrentItem = playlist.currentItemId
      ? removedIds.has(playlist.currentItemId)
      : false;
    const nextCurrent = removedCurrentItem ? null : playlist.currentItemId;

    await db
      .update(playlists)
      .set({
        currentItemId: nextCurrent,
        updatedAt: Date.now(),
      })
      .where(eq(playlists.id, playlist.id));

    await this.audit(
      input.channelId,
      input.actorUserId,
      "remove_requests",
      input.requesterTwitchUserId,
      {
        kind: input.kind,
        requesterLogin: input.requesterLogin,
        removedCount: removable.length,
        removedItemIds: removable.map((item) => item.id),
      }
    );
    await this.notify(input.channelId);

    console.info("Playlist removeRequests complete", {
      channelId: input.channelId,
      requesterTwitchUserId: input.requesterTwitchUserId,
      removedCount: removable.length,
      removedCurrentItem,
      nextCurrent,
    });

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: nextCurrent,
      changedItemId: removable[0]?.id,
      message: `Removed ${removable.length} request${removable.length === 1 ? "" : "s"}`,
    };
  }

  async markPlayed(input: MarkPlayedInput) {
    return this.advanceItem(input.channelId, input.itemId, input.actorUserId);
  }

  async restorePlayed(
    input: RestorePlayedInput
  ): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const playedSong = await db.query.playedSongs.findFirst({
      where: and(
        eq(schema.playedSongs.channelId, input.channelId),
        eq(schema.playedSongs.id, input.playedSongId)
      ),
    });

    if (!playedSong) {
      throw new Error("Played song not found");
    }

    const nextPosition = items.length
      ? Math.max(...items.map((item) => item.position)) + 1
      : 1;
    const itemId = createId("pli");
    const createdAt = playedSong.requestedAt ?? Date.now();

    await db.insert(playlistItems).values({
      id: itemId,
      playlistId: playlist.id,
      channelId: input.channelId,
      songId: playedSong.songId,
      songTitle: playedSong.songTitle,
      songArtist: playedSong.songArtist,
      songAlbum: playedSong.songAlbum,
      songCreator: playedSong.songCreator,
      songTuning: playedSong.songTuning,
      songPartsJson: playedSong.songPartsJson,
      songDurationText: playedSong.songDurationText,
      songCatalogSourceId: playedSong.songCatalogSourceId,
      songSource: playedSong.songSource,
      songUrl: playedSong.songUrl,
      status: "queued",
      requestedByTwitchUserId: playedSong.requestedByTwitchUserId,
      requestedByLogin: playedSong.requestedByLogin,
      requestedByDisplayName: playedSong.requestedByDisplayName,
      requestKind: playedSong.requestKind,
      position: nextPosition,
      createdAt,
      updatedAt: Date.now(),
    });

    await db
      .delete(schema.playedSongs)
      .where(eq(schema.playedSongs.id, input.playedSongId));
    await db
      .update(playlists)
      .set({
        updatedAt: Date.now(),
      })
      .where(eq(playlists.id, playlist.id));

    await this.audit(
      input.channelId,
      input.actorUserId,
      "played_item_restored",
      itemId,
      {
        playedSongId: input.playedSongId,
      }
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: playlist.currentItemId,
      changedItemId: itemId,
      message: "Played request restored",
    };
  }

  private async advanceItem(
    channelId: string,
    itemId: string,
    actorUserId: string
  ) {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(channelId);
    const sorted = [...items].sort((a, b) => a.position - b.position);
    const current = sorted.find((item) => item.id === itemId);

    if (!current) {
      throw new Error("Playlist item not found");
    }

    await db.delete(playlistItems).where(eq(playlistItems.id, itemId));

    await createPlayedSong(this.env as unknown as never, {
      channelId,
      playlistItemId: current.id,
      songId: current.songId,
      songTitle: current.songTitle,
      songArtist: current.songArtist,
      songAlbum: current.songAlbum,
      songCreator: current.songCreator,
      songTuning: current.songTuning,
      songPartsJson: current.songPartsJson,
      songDurationText: current.songDurationText,
      songSource: current.songSource,
      songCatalogSourceId: current.songCatalogSourceId,
      songUrl: current.songUrl,
      requestedByTwitchUserId: current.requestedByTwitchUserId,
      requestedByLogin: current.requestedByLogin,
      requestedByDisplayName: current.requestedByDisplayName,
      requestKind: current.requestKind,
      requestedAt: current.createdAt,
      playedAt: Date.now(),
    });

    const remaining = sorted.filter((item) => item.id !== itemId);
    await this.reindexPlaylistItems(remaining);

    await db
      .update(playlists)
      .set({
        currentItemId:
          playlist.currentItemId === itemId ? null : playlist.currentItemId,
        updatedAt: Date.now(),
      })
      .where(eq(playlists.id, playlist.id));

    await this.audit(channelId, actorUserId, "item_played", itemId, {
      nextItemId: null,
    });
    await this.notify(channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId:
        playlist.currentItemId === itemId ? null : playlist.currentItemId,
      changedItemId: itemId,
      message: "Item played",
    };
  }

  async setCurrent(input: SetCurrentInput): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const target = items.find((item) => item.id === input.itemId);
    const sortedItems = [...items].sort((a, b) => a.position - b.position);

    if (!target) {
      throw new Error("Playlist item not found");
    }

    if (playlist.currentItemId && playlist.currentItemId !== input.itemId) {
      await db
        .update(playlistItems)
        .set({
          status: "queued",
          updatedAt: Date.now(),
        })
        .where(eq(playlistItems.id, playlist.currentItemId));
    }

    await db
      .update(playlistItems)
      .set({
        status: "current",
        updatedAt: Date.now(),
      })
      .where(eq(playlistItems.id, input.itemId));

    await db
      .update(playlists)
      .set({
        currentItemId: input.itemId,
        updatedAt: Date.now(),
      })
      .where(eq(playlists.id, playlist.id));

    const reorderedItems = [
      target,
      ...sortedItems.filter((item) => item.id !== input.itemId),
    ].map((item, index) => ({
      id: item.id,
      position: index + 1,
    }));
    await this.reindexPlaylistItems(reorderedItems);

    await this.audit(
      input.channelId,
      input.actorUserId,
      "set_current",
      input.itemId,
      {}
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: input.itemId,
      changedItemId: input.itemId,
      message: "Current song updated",
    };
  }

  async shuffleNext(input: ShuffleNextInput): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const queued = items.filter((item) => item.status === "queued");
    if (queued.length < 2) {
      return {
        ok: true,
        playlistId: playlist.id,
        currentItemId: playlist.currentItemId,
        message: "Nothing to shuffle",
      };
    }

    const selected = queued[Math.floor(Math.random() * queued.length)];
    const currentMin = Math.min(...queued.map((item) => item.position));
    const displaced = queued.find((item) => item.position === currentMin);

    if (!displaced) {
      throw new Error("Queued item not found");
    }

    await db
      .update(playlistItems)
      .set({ position: -1, updatedAt: Date.now() })
      .where(eq(playlistItems.id, selected.id));
    await db
      .update(playlistItems)
      .set({ position: selected.position, updatedAt: Date.now() })
      .where(eq(playlistItems.id, displaced.id));
    await db
      .update(playlistItems)
      .set({ position: displaced.position, updatedAt: Date.now() })
      .where(eq(playlistItems.id, selected.id));
    await this.audit(
      input.channelId,
      input.actorUserId,
      "shuffle_next",
      selected.id,
      { displacedItemId: displaced.id }
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: playlist.currentItemId,
      changedItemId: selected.id,
      message: "Shuffled next item",
    };
  }

  async shufflePlaylist(
    input: ShufflePlaylistInput
  ): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const current =
      items.find((item) => item.id === playlist.currentItemId) ?? null;
    const queued = items.filter((item) => item.id !== playlist.currentItemId);

    const shuffled = [...queued];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }

    const ordered = current ? [current, ...shuffled] : shuffled;

    for (const item of ordered) {
      await db
        .update(playlistItems)
        .set({
          position: item.position + 1000,
          updatedAt: Date.now(),
        })
        .where(eq(playlistItems.id, item.id));
    }

    for (const [index, item] of ordered.entries()) {
      await db
        .update(playlistItems)
        .set({
          position: index + 1,
          status: current && item.id === current.id ? "current" : "queued",
          updatedAt: Date.now(),
        })
        .where(eq(playlistItems.id, item.id));
    }

    await this.audit(
      input.channelId,
      input.actorUserId,
      "shuffle_playlist",
      playlist.id,
      {}
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: playlist.currentItemId,
      message: "Playlist shuffled",
    };
  }

  async reorderItems(
    input: ReorderItemsInput
  ): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const currentItem = playlist.currentItemId
      ? (items.find((item) => item.id === playlist.currentItemId) ?? null)
      : null;

    for (const item of items) {
      await db
        .update(playlistItems)
        .set({
          position: item.position + 1000,
          updatedAt: Date.now(),
        })
        .where(eq(playlistItems.id, item.id));
    }

    const orderedItemIds = currentItem
      ? [
          currentItem.id,
          ...input.orderedItemIds.filter((itemId) => itemId !== currentItem.id),
        ]
      : input.orderedItemIds;

    for (const [index, itemId] of orderedItemIds.entries()) {
      await db
        .update(playlistItems)
        .set({
          position: index + 1,
          updatedAt: Date.now(),
        })
        .where(eq(playlistItems.id, itemId));
    }

    await this.audit(
      input.channelId,
      input.actorUserId,
      "reorder_items",
      playlist.id,
      {
        orderedItemIds: input.orderedItemIds,
      }
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      message: "Reordered playlist",
    };
  }

  async deleteItem(input: DeleteItemInput): Promise<PlaylistMutationResult> {
    console.info("Playlist deleteItem start", {
      channelId: input.channelId,
      actorUserId: input.actorUserId,
      itemId: input.itemId,
    });
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    await db.delete(playlistItems).where(eq(playlistItems.id, input.itemId));

    const remaining = items
      .filter((item) => item.id !== input.itemId)
      .sort((a, b) => a.position - b.position);
    await this.reindexPlaylistItems(remaining);

    const nextCurrent =
      playlist.currentItemId === input.itemId ? null : playlist.currentItemId;

    await db
      .update(playlists)
      .set({
        currentItemId: nextCurrent,
        updatedAt: Date.now(),
      })
      .where(eq(playlists.id, playlist.id));

    await this.audit(
      input.channelId,
      input.actorUserId,
      "delete_item",
      input.itemId,
      {}
    );
    await this.notify(input.channelId);

    console.info("Playlist deleteItem complete", {
      channelId: input.channelId,
      itemId: input.itemId,
      nextCurrent,
    });

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: nextCurrent,
      changedItemId: input.itemId,
      message: "Deleted item",
    };
  }

  async chooseVersion(
    input: ChooseVersionInput
  ): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const { playlist, items } = await this.getPlaylist(input.channelId);
    const item = items.find((entry) => entry.id === input.itemId);

    if (!item) {
      throw new Error("Playlist item not found");
    }

    const settings = await db.query.channelSettings.findFirst({
      where: eq(channelSettings.channelId, input.channelId),
    });

    const blacklist = await getChannelBlacklistByChannelId(
      this.env as unknown as never,
      input.channelId
    );

    if (!settings) {
      throw new Error("Channel settings not found");
    }

    let candidates: PlaylistCandidate[] = [];
    try {
      const parsed = JSON.parse(item.candidateMatchesJson ?? "[]") as unknown;
      if (Array.isArray(parsed)) {
        candidates = parsed as PlaylistCandidate[];
      }
    } catch {
      candidates = [];
    }

    const candidate = candidates.find(
      (entry) => entry.id === input.candidateId
    );
    if (!candidate) {
      throw new Error("Candidate version not found");
    }

    const songAllowed = isSongAllowed({
      song: {
        id: candidate.id,
        groupedProjectId: candidate.groupedProjectId,
        authorId: candidate.authorId,
        title: candidate.title,
        artist: candidate.artist,
        album: candidate.album,
        creator: candidate.creator,
        tuning: candidate.tuning,
        parts: candidate.parts,
        durationText: candidate.durationText,
        sourceId: candidate.sourceId,
        source: "library",
        sourceUrl: candidate.sourceUrl,
      },
      settings,
      blacklistArtists: blacklist.blacklistArtists,
      blacklistCharters: blacklist.blacklistCharters,
      blacklistSongs: blacklist.blacklistSongs,
      blacklistSongGroups: blacklist.blacklistSongGroups,
      setlistArtists: [],
      requester: {
        isBroadcaster: false,
        isModerator: false,
        isVip: false,
        isSubscriber: false,
      },
    });

    if (!songAllowed.allowed) {
      throw new Error(songAllowed.reason ?? "That version is not allowed.");
    }

    const warningMessage = getRequiredPathsWarning({
      song: { parts: candidate.parts ?? [] },
      settings,
    });

    await db
      .update(playlistItems)
      .set({
        songId: candidate.id,
        songTitle: candidate.title,
        songArtist: candidate.artist ?? null,
        songAlbum: candidate.album ?? null,
        songCreator: candidate.creator ?? null,
        songTuning: candidate.tuning ?? null,
        songPartsJson: JSON.stringify(candidate.parts ?? []),
        songDurationText: candidate.durationText ?? null,
        songCatalogSourceId: candidate.sourceId ?? null,
        songUrl:
          normalizeSongSourceUrl({
            source: "library",
            sourceUrl: candidate.sourceUrl ?? null,
            sourceId: candidate.sourceId ?? null,
          }) ?? null,
        warningCode: warningMessage ? "missing_required_paths" : null,
        warningMessage,
        updatedAt: Date.now(),
      })
      .where(eq(playlistItems.id, input.itemId));

    await this.audit(
      input.channelId,
      input.actorUserId,
      "choose_version",
      input.itemId,
      {
        candidateId: candidate.id,
        sourceId: candidate.sourceId ?? null,
        warningCode: warningMessage ? "missing_required_paths" : null,
      }
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: playlist.currentItemId,
      changedItemId: input.itemId,
      message: "Version selected",
    };
  }

  async clearPlaylist(
    input: ClearPlaylistInput
  ): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.channelId, input.channelId),
    });

    if (!playlist) {
      throw new Error("Playlist not found");
    }

    await db
      .delete(playlistItems)
      .where(eq(playlistItems.playlistId, playlist.id));
    await db
      .update(playlists)
      .set({
        currentItemId: null,
        updatedAt: Date.now(),
      })
      .where(eq(playlists.id, playlist.id));

    await this.audit(
      input.channelId,
      input.actorUserId,
      "clear_playlist",
      playlist.id,
      {}
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: null,
      message: "Playlist cleared",
    };
  }

  async resetSession(
    input: ResetSessionInput
  ): Promise<PlaylistMutationResult> {
    const db = getDb(this.env);
    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.channelId, input.channelId),
    });

    if (!playlist) {
      throw new Error("Playlist not found");
    }

    await db
      .delete(playlistItems)
      .where(eq(playlistItems.playlistId, playlist.id));
    await db
      .update(playlists)
      .set({
        currentItemId: null,
        updatedAt: Date.now(),
      })
      .where(eq(playlists.id, playlist.id));

    await this.audit(
      input.channelId,
      input.actorUserId,
      "reset_session",
      playlist.id,
      {}
    );
    await this.notify(input.channelId);

    return {
      ok: true,
      playlistId: playlist.id,
      currentItemId: null,
      message: "Session reset; played history kept",
    };
  }
}

class ChannelPlaylistDurableObjectBase {
  private coordinator: D1PlaylistCoordinator;
  private streamClients = new Set<PlaylistStreamClient>();

  constructor(
    private state: DurableObjectState,
    private env: BackendEnv
  ) {
    this.coordinator = new D1PlaylistCoordinator(
      state,
      env,
      async (channelId) => {
        await this.broadcastSnapshot(channelId);
      }
    );
  }

  private async getSnapshot(channelId: string) {
    const db = getDb(this.env);
    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.channelId, channelId),
    });

    if (!playlist) {
      throw new Error("Playlist not found");
    }

    const [items, playedSongs] = await Promise.all([
      db.query.playlistItems.findMany({
        where: eq(playlistItems.playlistId, playlist.id),
      }),
      db.query.playedSongs.findMany({
        where: eq(schema.playedSongs.channelId, channelId),
        orderBy: [schema.playedSongs.playedAt],
        limit: 100,
      }),
    ]);

    return {
      playlist,
      items: items.sort((a, b) => a.position - b.position),
      playedSongs: [...playedSongs].sort((a, b) => b.playedAt - a.playedAt),
    };
  }

  private async broadcastSnapshot(channelId: string) {
    console.info("Playlist broadcast start", {
      channelId,
      clientCount: this.streamClients.size,
    });
    if (!this.streamClients.size) {
      console.info("Playlist broadcast skipped; no stream clients", {
        channelId,
      });
      return;
    }

    const payload = `event: playlist\ndata: ${JSON.stringify(await this.getSnapshot(channelId))}\n\n`;
    const encoded = new TextEncoder().encode(payload);

    await Promise.all(
      [...this.streamClients].map(async (client) => {
        try {
          await client.writer.write(encoded);
        } catch {
          this.streamClients.delete(client);
          await client.writer.close().catch(() => {});
        }
      })
    );

    console.info("Playlist broadcast complete", {
      channelId,
      remainingClientCount: this.streamClients.size,
    });
  }

  private async handleStream(request: Request) {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId) {
      return new Response("Missing channelId", { status: 400 });
    }

    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const client: PlaylistStreamClient = {
      id: createId("stream"),
      writer,
    };

    this.streamClients.add(client);

    const removeClient = async () => {
      this.streamClients.delete(client);
      await writer.close().catch(() => {});
    };

    request.signal.addEventListener(
      "abort",
      () => {
        this.state.waitUntil(removeClient());
      },
      { once: true }
    );

    await writer.write(
      new TextEncoder().encode(
        `event: playlist\ndata: ${JSON.stringify(await this.getSnapshot(channelId))}\n\n`
      )
    );

    return new Response(stream.readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const payload =
      request.method === "POST"
        ? ((await request.json()) as MutationPayload)
        : {};
    const traceId = getMutationTraceId(payload);

    logPlaylistWorkerStep("Playlist DO request received", {
      traceId,
      channelId:
        typeof payload.channelId === "string" ? payload.channelId : undefined,
      extra: {
        path: url.pathname,
        method: request.method,
        ...summarizeMutationPayload(payload),
      },
    });

    switch (url.pathname) {
      case "/add-request":
        return json(
          await this.coordinator.addRequest(
            payload as unknown as AddRequestInput
          )
        );
      case "/mutate":
        return json(await handleMutation(this.coordinator, payload, traceId));
      case "/stream":
        return this.handleStream(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }
}

export class ChannelPlaylistDurableObject extends ChannelPlaylistDurableObjectBase {}

async function handleMutation(
  coordinator: PlaylistCoordinator,
  payload: MutationPayload,
  traceId: string
) {
  logPlaylistWorkerStep("Playlist mutation dispatch start", {
    traceId,
    channelId:
      typeof payload.channelId === "string" ? payload.channelId : undefined,
    extra: summarizeMutationPayload(payload),
  });

  try {
    switch (payload.action) {
      case "markPlayed":
        return await coordinator.markPlayed(
          payload as unknown as MarkPlayedInput
        );
      case "restorePlayed":
        return await coordinator.restorePlayed(
          payload as unknown as RestorePlayedInput
        );
      case "setCurrent":
        return await coordinator.setCurrent(
          payload as unknown as SetCurrentInput
        );
      case "shuffleNext":
        return await coordinator.shuffleNext(
          payload as unknown as ShuffleNextInput
        );
      case "shufflePlaylist":
        return await coordinator.shufflePlaylist(
          payload as unknown as ShufflePlaylistInput
        );
      case "reorderItems":
        return await coordinator.reorderItems(
          payload as unknown as ReorderItemsInput
        );
      case "removeRequests":
        return await coordinator.removeRequests(
          payload as unknown as RemoveRequestsInput
        );
      case "changeRequestKind":
        return await coordinator.changeRequestKind(
          payload as unknown as ChangeRequestKindInput
        );
      case "deleteItem":
        return await coordinator.deleteItem(
          payload as unknown as DeleteItemInput
        );
      case "chooseVersion":
        return await coordinator.chooseVersion(
          payload as unknown as ChooseVersionInput
        );
      case "clearPlaylist":
        return await coordinator.clearPlaylist(
          payload as unknown as ClearPlaylistInput
        );
      case "resetSession":
        return await coordinator.resetSession(
          payload as unknown as ResetSessionInput
        );
      case "manualAdd":
        return await coordinator.manualAdd({
          channelId: String(payload.channelId),
          actorUserId: String(payload.actorUserId),
          requesterLogin:
            typeof payload.requesterLogin === "string"
              ? payload.requesterLogin
              : undefined,
          requesterTwitchUserId:
            typeof payload.requesterTwitchUserId === "string"
              ? payload.requesterTwitchUserId
              : undefined,
          requesterDisplayName:
            typeof payload.requesterDisplayName === "string"
              ? payload.requesterDisplayName
              : undefined,
          song: payload.song ?? {
            id: String(payload.songId),
            title: String(payload.title),
            groupedProjectId:
              typeof payload.groupedProjectId === "number"
                ? payload.groupedProjectId
                : undefined,
            artist: payload.artist,
            album: payload.album,
            creator: payload.creator,
            tuning: payload.tuning,
            parts: payload.parts,
            durationText: payload.durationText,
            cdlcId: payload.sourceId,
            source: String(payload.source),
            sourceUrl: payload.sourceUrl,
          },
        } as unknown as ManualAddInput);
      default:
        throw new Error("Unknown mutation");
    }
  } catch (error) {
    console.error("Playlist mutation dispatch failed", {
      traceId,
      ...summarizeMutationPayload(payload),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    logPlaylistWorkerStep("Playlist mutation dispatch finished", {
      traceId,
      channelId:
        typeof payload.channelId === "string" ? payload.channelId : undefined,
      extra: {
        action: typeof payload.action === "string" ? payload.action : null,
      },
    });
  }
}

async function sendReply(
  env: BackendEnv,
  messageBody: { channelId: string; broadcasterUserId: string; message: string }
) {
  const db = getDb(env);
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, messageBody.channelId),
  });

  if (!channel) {
    return;
  }

  const auth = await db.query.twitchAuthorizations.findFirst({
    where: eq(twitchAuthorizations.channelId, channel.id),
  });

  const botAuth = await getBotAuthorization(env as unknown as never);

  if (!auth || !botAuth || !channel.botEnabled) {
    return;
  }

  const appToken = await getAppAccessToken(env as unknown as never);
  const result = await sendChatReply({
    env,
    accessToken: appToken.access_token,
    broadcasterUserId: messageBody.broadcasterUserId,
    senderUserId: botAuth.twitchUserId,
    message: messageBody.message,
  });
  return result;
}

const backendHandler = {
  async fetch(request: Request, env: BackendEnv) {
    await assertDatabaseSchemaCurrent(env);
    const url = new URL(request.url);

    if (
      url.pathname === "/internal/playlist/add-request" &&
      request.method === "POST"
    ) {
      const payload = (await request.json()) as MutationPayload;
      const id = env.CHANNEL_PLAYLIST_DO.idFromName(String(payload.channelId));
      const stub = env.CHANNEL_PLAYLIST_DO.get(id);
      return stub.fetch("https://do/add-request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    if (
      url.pathname === "/internal/playlist/mutate" &&
      request.method === "POST"
    ) {
      const payload = (await request.json()) as MutationPayload;
      const id = env.CHANNEL_PLAYLIST_DO.idFromName(String(payload.channelId));
      const stub = env.CHANNEL_PLAYLIST_DO.get(id);
      return stub.fetch("https://do/mutate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    if (
      url.pathname === "/internal/playlist/remove-requests" &&
      request.method === "POST"
    ) {
      const payload = (await request.json()) as MutationPayload;
      const id = env.CHANNEL_PLAYLIST_DO.idFromName(String(payload.channelId));
      const stub = env.CHANNEL_PLAYLIST_DO.get(id);
      return stub.fetch("https://do/mutate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "removeRequests",
          ...payload,
        }),
      });
    }

    if (
      url.pathname === "/internal/playlist/stream" &&
      request.method === "GET"
    ) {
      const channelId = url.searchParams.get("channelId");
      if (!channelId) {
        return new Response("Missing channelId", { status: 400 });
      }

      const id = env.CHANNEL_PLAYLIST_DO.idFromName(channelId);
      const stub = env.CHANNEL_PLAYLIST_DO.get(id);
      return stub.fetch(
        `https://do/stream?channelId=${encodeURIComponent(channelId)}`
      );
    }

    if (
      url.pathname === "/internal/twitch/user-by-login" &&
      request.method === "GET"
    ) {
      const login = url.searchParams.get("login")?.trim();
      if (!login) {
        return json({ error: "Missing login" }, { status: 400 });
      }

      const user = await resolveTwitchUserForRequester(env, {
        requesterLogin: login,
      });
      return json({
        user: user
          ? {
              twitchUserId: user.id,
              login: user.login,
              displayName: user.display_name,
            }
          : null,
      });
    }

    if (
      url.pathname === "/internal/bot/reconcile" &&
      request.method === "POST"
    ) {
      const payload = (await request.json()) as {
        channelId: string;
        refreshLiveState?: boolean;
      };
      const result = await reconcileChannelBotState(env, payload.channelId, {
        refreshLiveState: payload.refreshLiveState ?? true,
      });
      return json(result);
    }

    return new Response("Not found", { status: 404 });
  },
  async queue(batch: MessageBatch<ReplyQueueMessage>, env: BackendEnv) {
    await assertDatabaseSchemaCurrent(env);
    for (const message of batch.messages) {
      try {
        const result = await sendReply(env, message.body);
        console.info("Queue reply delivered", {
          channelId: message.body.channelId,
          broadcasterUserId: message.body.broadcasterUserId,
          messageId: result?.messageId ?? null,
        });
        message.ack();
      } catch (error) {
        console.error("Queue reply delivery failed", {
          channelId: message.body.channelId,
          broadcasterUserId: message.body.broadcasterUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: BackendEnv) {
    await withMonitor("request-bot-backend-scheduled", async () => {
      await assertDatabaseSchemaCurrent(env);
    });
  },
} satisfies ExportedHandler<BackendEnv, ReplyQueueMessage>;

export default withSentry<BackendEnv, ReplyQueueMessage>(
  (env) => getSentryOptions(env),
  backendHandler
);

async function resolveTwitchUserForRequester(
  env: BackendEnv,
  input: {
    requesterLogin: string;
    requesterTwitchUserId?: string;
    requesterDisplayName?: string;
  }
) {
  const db = getDb(env);
  const normalizedLogin = input.requesterLogin.trim().toLowerCase();

  console.info("Playlist requester lookup start", {
    requesterLogin: input.requesterLogin,
    normalizedLogin,
    hasRequesterTwitchUserId: Boolean(input.requesterTwitchUserId),
    hasRequesterDisplayName: Boolean(input.requesterDisplayName),
  });

  const localChannel = await db.query.channels.findFirst({
    where: eq(channels.login, normalizedLogin),
  });
  if (localChannel) {
    console.info("Playlist requester lookup matched local channel", {
      requesterLogin: input.requesterLogin,
      normalizedLogin,
      resolvedTwitchUserId: localChannel.twitchChannelId,
    });
    return {
      id: localChannel.twitchChannelId,
      login: localChannel.login,
      display_name: localChannel.displayName,
    };
  }

  const localUser = await db.query.users.findFirst({
    where: eq(users.login, normalizedLogin),
  });
  if (localUser) {
    console.info("Playlist requester lookup matched local user", {
      requesterLogin: input.requesterLogin,
      normalizedLogin,
      resolvedTwitchUserId: localUser.twitchUserId,
    });
    return {
      id: localUser.twitchUserId,
      login: localUser.login,
      display_name: localUser.displayName,
    };
  }

  if (input.requesterTwitchUserId && input.requesterDisplayName) {
    console.info("Playlist requester lookup used provided identity", {
      requesterLogin: input.requesterLogin,
      normalizedLogin,
      resolvedTwitchUserId: input.requesterTwitchUserId,
    });
    return {
      id: input.requesterTwitchUserId,
      login: normalizedLogin,
      display_name: input.requesterDisplayName,
    };
  }

  console.info("Playlist requester lookup falling back to Twitch API", {
    requesterLogin: input.requesterLogin,
    normalizedLogin,
  });
  const appToken = await getAppAccessToken(env as unknown as never);
  const user = await getTwitchUserByLogin({
    env: env as unknown as never,
    accessToken: appToken.access_token,
    login: input.requesterLogin,
  });

  console.info("Playlist requester lookup Twitch API result", {
    requesterLogin: input.requesterLogin,
    normalizedLogin,
    foundUser: Boolean(user),
    resolvedTwitchUserId: user?.id ?? null,
  });
  return user;
}
