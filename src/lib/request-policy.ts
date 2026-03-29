import {
  type BlacklistedArtist,
  type BlacklistedCharter,
  type BlacklistedSongGroup,
  type BlacklistedSongVersion,
  getBlacklistReasonCodes,
} from "./channel-blacklist";
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
  allowRequestPathModifiers: boolean;
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

export function getRequiredPathsMatchMode(
  value: string | null | undefined
): "any" | "all" {
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
  blacklistArtists: BlacklistedArtist[];
  blacklistCharters: BlacklistedCharter[];
  blacklistSongs: BlacklistedSongVersion[];
  blacklistSongGroups: BlacklistedSongGroup[];
  setlistArtists: Array<{ artistId?: number | null; artistName: string }>;
  requester: RequesterContext;
  allowBlacklistOverride?: boolean;
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
        reasonCode: "disallowed_tuning",
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
        reasonCode: "artist_not_in_setlist",
      };
    }
  }

  if (input.settings.blacklistEnabled) {
    const reasonCodes = getBlacklistReasonCodes(
      {
        songCatalogSourceId: input.song.sourceId ?? null,
        songGroupedProjectId: input.song.groupedProjectId ?? null,
        songArtistId: input.song.artistId ?? null,
        songArtist: input.song.artist ?? null,
        songCharterId: input.song.authorId ?? null,
        songCreator: input.song.creator ?? null,
      },
      {
        artists: input.blacklistArtists,
        charters: input.blacklistCharters,
        songs: input.blacklistSongs,
        songGroups: input.blacklistSongGroups,
      }
    );
    const charterBlocked = reasonCodes.includes("charter_blacklist")
      ? (input.blacklistCharters.find(
          (entry) =>
            input.song.authorId != null &&
            entry.charterId === input.song.authorId
        ) ?? null)
      : null;
    const bypass =
      input.allowBlacklistOverride ||
      (input.settings.letSetlistBypassBlacklist && inSetlist);

    if (!bypass && reasonCodes.length > 0) {
      const versionBlocked = reasonCodes.includes("version_blacklist");
      const songBlocked = reasonCodes.includes("song_blacklist");
      return {
        allowed: false,
        reason: charterBlocked
          ? `${charterBlocked.charterName} is blacklisted in this channel.`
          : versionBlocked
            ? "That version is blocked in this channel."
            : "That song is blocked in this channel.",
        reasonCode: charterBlocked
          ? "charter_blacklist"
          : versionBlocked
            ? "version_blacklist"
            : songBlocked
              ? "song_blacklist"
              : "artist_blacklist",
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

export function songMatchesRequestedPaths(input: {
  song: SongSearchResult | { parts?: string[] | null };
  requestedPaths: string[];
}) {
  if (input.requestedPaths.length === 0) {
    return true;
  }

  const songParts = (input.song.parts ?? []).map((part) => normalize(part));
  return input.requestedPaths.every((path) =>
    songParts.includes(normalize(path))
  );
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
  channelSlug?: string;
  allowRequestPathModifiers?: boolean;
}) {
  const normalized = normalizeCommandPrefix(input.commandPrefix);
  const parts = [
    `Commands: ${normalized}sr artist - song; ${normalized}sr artist *random; ${normalized}sr artist *choice; ${normalized}vip; ${normalized}vip artist - song; ${normalized}edit artist - song; ${normalized}remove reg|vip|all; ${normalized}position.`,
  ];
  if (input.allowRequestPathModifiers) {
    parts.push(
      `Bass requests: add *bass to ${normalized}sr, ${normalized}vip, or ${normalized}edit.`
    );
  }

  const root = input.appUrl.replace(/\/+$/, "");
  const slug = input.channelSlug?.replace(/^\/+|\/+$/g, "") ?? "";
  parts.push(
    `Browse the track list and request songs here: ${slug ? `${root}/${slug}` : `${root}/search`}`
  );
  return parts.join(" ");
}

export function buildSearchMessage(appUrl: string) {
  const root = appUrl.replace(/\/+$/, "");
  return `Search the song database here: ${root}/search`;
}

export function buildChannelPlaylistMessage(
  appUrl: string,
  channelSlug: string
) {
  const root = appUrl.replace(/\/+$/, "");
  const slug = channelSlug.replace(/^\/+|\/+$/g, "");
  return `You can edit or search the song database here: ${root}/${slug}`;
}

export function buildBlacklistMessage(
  artists: Array<{ artistId?: number; artistName: string }>,
  charters: Array<{ charterId?: number; charterName: string }>,
  songs: Array<{
    songId?: number;
    songTitle: string;
    artistName?: string | null;
  }>,
  songGroups: Array<{
    groupedProjectId?: number;
    songTitle: string;
    artistName?: string | null;
  }> = []
) {
  if (
    artists.length === 0 &&
    charters.length === 0 &&
    songs.length === 0 &&
    songGroups.length === 0
  ) {
    return "No blacklisted artists, charters, songs, or versions.";
  }

  const artistText = artists.length
    ? artists
        .slice(0, 5)
        .map((entry) => entry.artistName)
        .join(", ")
    : "none";
  const charterText = charters.length
    ? charters
        .slice(0, 5)
        .map((entry) => entry.charterName)
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
  const songGroupText = songGroups.length
    ? songGroups
        .slice(0, 5)
        .map((entry) =>
          entry.artistName
            ? `${entry.songTitle} - ${entry.artistName}`
            : entry.songTitle
        )
        .join(", ")
    : "none";
  return `Artists: ${artistText}. Charters: ${charterText}. Songs: ${songGroupText}. Versions: ${songText}.`;
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
