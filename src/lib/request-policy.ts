import type { SongSearchResult } from "./song-search/types";

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

export interface ChannelRequestSettings {
  requestsEnabled: boolean;
  allowAnyoneToRequest: boolean;
  allowSubscribersToRequest: boolean;
  allowVipsToRequest: boolean;
  onlyOfficialDlc: boolean;
  allowedTuningsJson: string;
  requiredPathsJson: string;
  requiredPathsMatchMode?: string | null;
  maxQueueSize: number;
  maxViewerRequestsAtOnce: number;
  maxSubscriberRequestsAtOnce: number;
  maxVipViewerRequestsAtOnce: number;
  maxVipSubscriberRequestsAtOnce: number;
  limitRegularRequestsEnabled: boolean;
  regularRequestsPerPeriod: number;
  regularRequestPeriodSeconds: number;
  limitVipRequestsEnabled: boolean;
  vipRequestsPerPeriod: number;
  vipRequestPeriodSeconds: number;
  blacklistEnabled: boolean;
  letSetlistBypassBlacklist: boolean;
  setlistEnabled: boolean;
  subscribersMustFollowSetlist: boolean;
  autoGrantVipTokenToSubscribers: boolean;
  commandPrefix: string;
}

export interface RequesterContext {
  isBroadcaster: boolean;
  isModerator: boolean;
  isVip: boolean;
  isSubscriber: boolean;
}

export function getArraySetting(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

export function getRequiredPathsMatchMode(value: string | null | undefined) {
  return value === "all" ? "all" : "any";
}

export function isRequesterAllowed(
  settings: ChannelRequestSettings,
  requester: RequesterContext
) {
  if (!settings.requestsEnabled) {
    return {
      allowed: false,
      reason: "Requests are disabled for this channel.",
    };
  }

  if (requester.isBroadcaster || requester.isModerator) {
    return { allowed: true };
  }

  if (requester.isVip) {
    if (!settings.allowVipsToRequest) {
      return {
        allowed: false,
        reason: "VIP requests are disabled in this channel.",
      };
    }
    return { allowed: true };
  }

  if (requester.isSubscriber) {
    if (!settings.allowSubscribersToRequest) {
      return {
        allowed: false,
        reason: "Subscriber requests are disabled in this channel.",
      };
    }
    return { allowed: true };
  }

  if (!settings.allowAnyoneToRequest) {
    return {
      allowed: false,
      reason: "Only subscribers or VIPs can request songs right now.",
    };
  }

  return { allowed: true };
}

export function getActiveRequestLimit(
  settings: ChannelRequestSettings,
  requester: RequesterContext
) {
  if (requester.isBroadcaster || requester.isModerator) {
    return Number.POSITIVE_INFINITY;
  }

  if (requester.isVip && requester.isSubscriber) {
    return settings.maxVipSubscriberRequestsAtOnce;
  }

  if (requester.isVip) {
    return settings.maxVipViewerRequestsAtOnce;
  }

  if (requester.isSubscriber) {
    return settings.maxSubscriberRequestsAtOnce;
  }

  return settings.maxViewerRequestsAtOnce;
}

export function getRateLimitWindow(
  settings: ChannelRequestSettings,
  requester: RequesterContext
) {
  if (requester.isBroadcaster || requester.isModerator) {
    return null;
  }

  if (requester.isVip) {
    if (
      !settings.limitVipRequestsEnabled ||
      settings.vipRequestPeriodSeconds <= 0
    ) {
      return null;
    }

    return {
      limit: settings.vipRequestsPerPeriod,
      periodSeconds: settings.vipRequestPeriodSeconds,
    };
  }

  if (
    !settings.limitRegularRequestsEnabled ||
    settings.regularRequestPeriodSeconds <= 0
  ) {
    return null;
  }

  return {
    limit: settings.regularRequestsPerPeriod,
    periodSeconds: settings.regularRequestPeriodSeconds,
  };
}

export function isSongAllowed(input: {
  song: SongSearchResult;
  settings: ChannelRequestSettings;
  blacklistArtists: Array<{ artistId: number; artistName: string }>;
  blacklistSongs: Array<{
    songId: number;
    songTitle: string;
    artistName?: string | null;
  }>;
  setlistArtists: Array<{ artistId?: number | null; artistName: string }>;
  requester: RequesterContext;
}) {
  const allowedTunings = getArraySetting(input.settings.allowedTuningsJson);
  const setlistArtistIds = input.setlistArtists
    .map((entry) => entry.artistId)
    .filter((entry): entry is number => entry != null);
  const inSetlist =
    setlistArtistIds.length > 0 &&
    input.song.artistId != null &&
    setlistArtistIds.includes(input.song.artistId);

  if (input.settings.onlyOfficialDlc && input.song.source !== "official") {
    return {
      allowed: false,
      reason: "Only official DLC requests are allowed.",
    };
  }

  if (allowedTunings.length > 0) {
    const songTuning = normalize(input.song.tuning);
    const allowed = allowedTunings.some(
      (entry) => normalize(entry) === songTuning
    );
    if (!allowed) {
      return {
        allowed: false,
        reason: "That song's tuning is not allowed in this channel.",
      };
    }
  }

  if (input.settings.setlistEnabled) {
    const shouldApplySetlist =
      !input.requester.isSubscriber ||
      input.settings.subscribersMustFollowSetlist;
    if (shouldApplySetlist && setlistArtistIds.length > 0 && !inSetlist) {
      return {
        allowed: false,
        reason: "That artist is not in the current setlist.",
      };
    }
  }

  if (input.settings.blacklistEnabled) {
    const artistBlocked = input.blacklistArtists.some(
      (entry) =>
        input.song.artistId != null && entry.artistId === input.song.artistId
    );
    const songBlocked = input.blacklistSongs.some(
      (entry) =>
        input.song.sourceId != null && entry.songId === input.song.sourceId
    );
    const bypass = input.settings.letSetlistBypassBlacklist && inSetlist;

    if (!bypass && (artistBlocked || songBlocked)) {
      return {
        allowed: false,
        reason: "That song is blocked in this channel.",
      };
    }
  }

  return { allowed: true };
}

export function getMissingRequiredPaths(input: {
  song: SongSearchResult | { parts?: string[] | null };
  settings: Pick<
    ChannelRequestSettings,
    "requiredPathsJson" | "requiredPathsMatchMode"
  >;
}) {
  const requiredPaths = getArraySetting(input.settings.requiredPathsJson);
  if (requiredPaths.length === 0) {
    return [];
  }

  const parts = (input.song.parts ?? []).map((part) => normalize(part));
  const matchMode = getRequiredPathsMatchMode(
    input.settings.requiredPathsMatchMode
  );

  if (matchMode === "any") {
    return requiredPaths.some((requiredPath) =>
      parts.includes(normalize(requiredPath))
    )
      ? []
      : requiredPaths;
  }

  return requiredPaths.filter(
    (requiredPath) => !parts.includes(normalize(requiredPath))
  );
}

export function getRequiredPathsWarning(input: {
  song: SongSearchResult | { parts?: string[] | null };
  settings: Pick<
    ChannelRequestSettings,
    "requiredPathsJson" | "requiredPathsMatchMode"
  >;
}) {
  const requiredPaths = getArraySetting(input.settings.requiredPathsJson);
  if (requiredPaths.length === 0) {
    return null;
  }

  const missingRequiredPaths = getMissingRequiredPaths(input);
  if (missingRequiredPaths.length === 0) {
    return null;
  }

  const matchMode = getRequiredPathsMatchMode(
    input.settings.requiredPathsMatchMode
  );

  if (matchMode === "any") {
    return `Requires one of: ${formatPathList(requiredPaths)}.`;
  }

  return `Missing required paths: ${formatPathList(missingRequiredPaths)}.`;
}

export function formatPathLabel(path: string) {
  switch (normalize(path)) {
    case "lead":
      return "Lead";
    case "rhythm":
      return "Rhythm";
    case "bass":
      return "Bass";
    case "voice":
    case "vocals":
      return "Lyrics";
    default:
      return path.trim();
  }
}

export function formatPathList(paths: string[]) {
  return paths.map((path) => formatPathLabel(path)).join(", ");
}

export function buildHowMessage(input: {
  commandPrefix: string;
  appUrl: string;
  blacklistArtists: Array<{ artistId?: number; artistName: string }>;
  blacklistSongs: Array<{
    songId?: number;
    songTitle: string;
    artistName?: string | null;
  }>;
  setlistArtists: Array<{ artistId?: number | null; artistName: string }>;
}) {
  const normalized = normalizeCommandPrefix(input.commandPrefix);
  const parts = [
    `Commands: ${normalized}sr artist, song; ${normalized}sr song; ${normalized}vip artist, song; ${normalized}edit artist, song; ${normalized}remove reg; ${normalized}remove vip; ${normalized}remove all.`,
  ];

  if (input.blacklistArtists.length > 0 || input.blacklistSongs.length > 0) {
    parts.push(
      `${normalized}blacklist: ${buildBlacklistMessage(
        input.blacklistArtists,
        input.blacklistSongs
      )}`
    );
  }

  if (input.setlistArtists.length > 0) {
    parts.push(
      `${normalized}setlist: ${buildSetlistMessage(input.setlistArtists)}`
    );
  }

  parts.push(
    `Search for songs to request: ${input.appUrl.replace(/\/+$/, "")}/search`
  );
  return parts.join(" ");
}

export function buildSearchMessage(appUrl: string) {
  const root = appUrl.replace(/\/+$/, "");
  return `Search the song database here: ${root}/search`;
}

export function buildBlacklistMessage(
  artists: Array<{ artistId?: number; artistName: string }>,
  songs: Array<{
    songId?: number;
    songTitle: string;
    artistName?: string | null;
  }>
) {
  if (artists.length === 0 && songs.length === 0) {
    return "No blacklisted artists or songs.";
  }

  const artistText = artists.length
    ? artists
        .slice(0, 5)
        .map((entry) => entry.artistName)
        .join(", ")
    : "none";
  const songText = songs.length
    ? songs
        .slice(0, 5)
        .map((entry) =>
          entry.artistName
            ? `${entry.songTitle} - ${entry.artistName}`
            : entry.songTitle
        )
        .join(", ")
    : "none";
  return `Artists: ${artistText}. Songs: ${songText}.`;
}

export function buildSetlistMessage(
  artists: Array<{ artistId?: number | null; artistName: string }>
) {
  if (artists.length === 0) {
    return "No setlist artists.";
  }

  const artistText = artists.length
    ? artists
        .slice(0, 8)
        .map((entry) => entry.artistName)
        .join(", ")
    : "none";
  return `Artists: ${artistText}.`;
}

export function normalizeCommandPrefix(commandPrefix: string) {
  const trimmed = commandPrefix.trim();
  if (!trimmed) {
    return "!";
  }

  const prefixOnly = trimmed.match(/^[^a-z0-9]+/i)?.[0];
  return prefixOnly && prefixOnly.length > 0 ? prefixOnly : trimmed;
}
