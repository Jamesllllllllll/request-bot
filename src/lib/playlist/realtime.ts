export const playlistStreamNotifyReasons = [
  "playlist",
  "requests",
  "settings",
  "stream-status",
  "blacklist",
  "setlist",
  "blocks",
  "vip-tokens",
  "favorites",
  "chat-activity",
] as const;

export type PlaylistStreamNotifyReason =
  (typeof playlistStreamNotifyReasons)[number];

export type ExtensionPlaylistPubSubMessage = {
  type: "playlist.invalidate";
  reason: PlaylistStreamNotifyReason;
  emittedAt: number;
};

const playlistStreamNotifyReasonSet = new Set<string>(
  playlistStreamNotifyReasons
);

export function isPlaylistStreamNotifyReason(
  value: unknown
): value is PlaylistStreamNotifyReason {
  return typeof value === "string" && playlistStreamNotifyReasonSet.has(value);
}

export function createExtensionPlaylistPubSubMessage(
  reason: PlaylistStreamNotifyReason,
  emittedAt = Date.now()
): ExtensionPlaylistPubSubMessage {
  return {
    type: "playlist.invalidate",
    reason,
    emittedAt,
  };
}

export function parseExtensionPlaylistPubSubMessage(
  value: string
): ExtensionPlaylistPubSubMessage | null {
  try {
    const parsed = JSON.parse(value) as Partial<ExtensionPlaylistPubSubMessage>;

    if (
      parsed?.type !== "playlist.invalidate" ||
      !isPlaylistStreamNotifyReason(parsed.reason) ||
      typeof parsed.emittedAt !== "number" ||
      !Number.isFinite(parsed.emittedAt)
    ) {
      return null;
    }

    return {
      type: parsed.type,
      reason: parsed.reason,
      emittedAt: parsed.emittedAt,
    };
  } catch {
    return null;
  }
}
