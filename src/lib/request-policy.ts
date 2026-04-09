import {
  type BlacklistedArtist,
  type BlacklistedCharter,
  type BlacklistedSongGroup,
  type BlacklistedSongVersion,
  getBlacklistReasonCodes,
} from "./channel-blacklist";
import { normalizePathOptions } from "./channel-options";
import type { SongSearchResult } from "./song-search/types";
import { formatVipTokenCostLabel } from "./vip-token-duration-thresholds";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const requestPathModifierOptions = [
  "guitar",
  "lead",
  "rhythm",
  "bass",
] as const;
export const legacyRequestPathModifierOptions = [
  "lead",
  "rhythm",
  "bass",
] as const;

export type RequestPathModifierOption =
  (typeof requestPathModifierOptions)[number];

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

function getNormalizedSongTunings(tuning: string | undefined | null) {
  const normalized = tuning
    ?.split("|")
    .map((entry) => normalize(entry))
    .filter(Boolean);

  return normalized && normalized.length > 0 ? normalized : [];
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
  vipRequestCooldownEnabled?: boolean;
  vipRequestCooldownMinutes?: number;
  blacklistEnabled: boolean;
  letSetlistBypassBlacklist: boolean;
  setlistEnabled: boolean;
  subscribersMustFollowSetlist: boolean;
  autoGrantVipTokenToSubscribers: boolean;
  allowRequestPathModifiers: boolean;
  allowedRequestPathsJson?: string | null;
  requestPathModifierVipTokenCost?: number | null;
  requestPathModifierUsesVipPriority?: boolean | null;
  vipTokenDurationThresholdsJson?: string | null;
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

export function getRequiredPathsSetting(
  settings: Pick<ChannelRequestSettings, "requiredPathsJson">
) {
  return normalizePathOptions(getArraySetting(settings.requiredPathsJson));
}

export function normalizeRequestPathModifier(
  value: string | null | undefined
): RequestPathModifierOption | null {
  const normalized = normalize(value);
  return requestPathModifierOptions.includes(
    normalized as RequestPathModifierOption
  )
    ? (normalized as RequestPathModifierOption)
    : null;
}

export function normalizeAllowedRequestPaths(
  paths: Array<string | null | undefined> | null | undefined
) {
  const normalized = new Set<RequestPathModifierOption>();

  for (const path of paths ?? []) {
    const normalizedPath = normalizeRequestPathModifier(path);
    if (normalizedPath) {
      normalized.add(normalizedPath);
    }
  }

  return requestPathModifierOptions.filter((path) => normalized.has(path));
}

export function getAllowedRequestPathsSetting(
  settings: Pick<
    ChannelRequestSettings,
    "allowRequestPathModifiers" | "allowedRequestPathsJson"
  >
) {
  if (!settings.allowRequestPathModifiers) {
    return [];
  }

  const configured = normalizeAllowedRequestPaths(
    getArraySetting(settings.allowedRequestPathsJson)
  );

  if (configured.length > 0) {
    return configured;
  }

  return settings.allowedRequestPathsJson == null
    ? [...legacyRequestPathModifierOptions]
    : [];
}

export function normalizeRequestPathModifierVipTokenCost(
  value: number | null | undefined
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export function getRequiredVipTokenCostForRequestedPaths(input: {
  requestedPaths: string[];
  settings: Pick<
    ChannelRequestSettings,
    | "allowRequestPathModifiers"
    | "allowedRequestPathsJson"
    | "requestPathModifierVipTokenCost"
  >;
}) {
  const allowedRequestPaths = getAllowedRequestPathsSetting(input.settings);
  const matchedRequestedPaths = normalizeAllowedRequestPaths(
    input.requestedPaths
  ).filter((path) => allowedRequestPaths.includes(path));

  if (matchedRequestedPaths.length === 0) {
    return 0;
  }

  return normalizeRequestPathModifierVipTokenCost(
    input.settings.requestPathModifierVipTokenCost
  );
}

export function isRequesterAllowed(
  settings: ChannelRequestSettings,
  requester: RequesterContext
) {
  if (!settings.requestsEnabled) {
    return {
      allowed: false,
      reason: "Requests are disabled for this channel.",
      reasonCode: "requests_disabled",
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
        reasonCode: "vip_requests_disabled",
      };
    }
    return { allowed: true };
  }

  if (requester.isSubscriber) {
    if (!settings.allowSubscribersToRequest) {
      return {
        allowed: false,
        reason: "Subscriber requests are disabled in this channel.",
        reasonCode: "subscriber_requests_disabled",
      };
    }
    return { allowed: true };
  }

  if (!settings.allowAnyoneToRequest) {
    return {
      allowed: false,
      reason: "Only subscribers or VIPs can request songs right now.",
      reasonCode: "subscriber_or_vip_only",
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
      reasonCode: "only_official_dlc",
    };
  }

  if (allowedTunings.length > 0) {
    const songTunings = getNormalizedSongTunings(input.song.tuning);
    const normalizedAllowedTunings = new Set(
      allowedTunings.map((entry) => normalize(entry))
    );
    const allowed =
      songTunings.length > 0 &&
      songTunings.every((entry) => normalizedAllowedTunings.has(entry));

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
  const requiredPaths = getRequiredPathsSetting(input.settings);
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
  const requiredPaths = getRequiredPathsSetting(input.settings);
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
    songSupportsRequestedPath(songParts, path)
  );
}

export function songSupportsRequestedPath(
  songParts: string[] | null | undefined,
  requestedPath: string
) {
  const normalizedSongParts = (songParts ?? []).map((part) => normalize(part));
  const normalizedRequestedPath = normalize(requestedPath);

  if (normalizedRequestedPath === "guitar") {
    return (
      normalizedSongParts.includes("lead") ||
      normalizedSongParts.includes("rhythm")
    );
  }

  return normalizedSongParts.includes(normalizedRequestedPath);
}

export function formatPathLabel(path: string) {
  return formatLocalizedPathLabel(path);
}

export function formatLocalizedPathLabel(path: string, translate?: Translate) {
  switch (normalize(path)) {
    case "guitar":
      return translate?.("paths.guitar") ?? "Guitar";
    case "lead":
      return translate?.("paths.lead") ?? "Lead";
    case "rhythm":
      return translate?.("paths.rhythm") ?? "Rhythm";
    case "bass":
      return translate?.("paths.bass") ?? "Bass";
    default:
      return path.trim();
  }
}

export function formatPathList(paths: string[], translate?: Translate) {
  return paths
    .map((path) => formatLocalizedPathLabel(path, translate))
    .join(", ");
}

export function formatRequestPathModifierTokens(paths: string[]) {
  return normalizeAllowedRequestPaths(paths)
    .map((path) => `*${path}`)
    .join(", ");
}

export function buildHowMessage(input: {
  commandPrefix: string;
  appUrl: string;
  channelSlug?: string;
  allowRequestPathModifiers?: boolean;
  allowedRequestPaths?: string[];
  requestPathModifierVipTokenCost?: number | null;
  translate?: Translate;
}) {
  const normalized = normalizeCommandPrefix(input.commandPrefix);
  const configuredAllowedRequestPaths = normalizeAllowedRequestPaths(
    input.allowedRequestPaths
  );
  const requestPathModifiersEnabled =
    input.allowRequestPathModifiers ?? configuredAllowedRequestPaths.length > 0;
  const allowedRequestPaths = !requestPathModifiersEnabled
    ? []
    : configuredAllowedRequestPaths.length > 0
      ? configuredAllowedRequestPaths
      : input.allowedRequestPaths === undefined
        ? [...legacyRequestPathModifierOptions]
        : [];
  const parts = [
    input.translate?.("commands.how.commands", {
      commandPrefix: normalized,
    }) ??
      `Commands: ${normalized}sr artist - song; ${normalized}sr artist *random; ${normalized}sr artist *choice; ${normalized}vip; ${normalized}vip artist - song; ${normalized}vip artist - song *2; ${normalized}edit #2 artist - song; ${normalized}remove reg|vip|all; ${normalized}position.`,
  ];
  if (allowedRequestPaths.length > 0) {
    const requiredVipTokenCost = normalizeRequestPathModifierVipTokenCost(
      input.requestPathModifierVipTokenCost
    );
    const modifiers = formatRequestPathModifierTokens(allowedRequestPaths);
    parts.push(
      requiredVipTokenCost > 0
        ? (input.translate?.("commands.how.partRequestsVip", {
            commandPrefix: normalized,
            countText: formatVipTokenCostLabel(requiredVipTokenCost),
            modifiers,
          }) ??
            `Part requests: add ${modifiers} to ${normalized}sr, ${normalized}vip, or ${normalized}edit. They require ${formatVipTokenCostLabel(requiredVipTokenCost)}.`)
        : (input.translate?.("commands.how.partRequests", {
            commandPrefix: normalized,
            modifiers,
          }) ??
            `Part requests: add ${modifiers} to ${normalized}sr, ${normalized}vip, or ${normalized}edit.`)
    );
  }

  const root = input.appUrl.replace(/\/+$/, "");
  const slug = input.channelSlug?.replace(/^\/+|\/+$/g, "") ?? "";
  parts.push(
    input.translate?.("commands.how.browse", {
      url: slug ? `${root}/${slug}` : `${root}/search`,
    }) ??
      `Browse the track list and request songs here: ${slug ? `${root}/${slug}` : `${root}/search`}`
  );
  return parts.join(" ");
}

export function buildSearchMessage(appUrl: string, translate?: Translate) {
  const root = appUrl.replace(/\/+$/, "");
  return (
    translate?.("commands.search", {
      url: `${root}/search`,
    }) ?? `Search the song database here: ${root}/search`
  );
}

export function buildChannelPlaylistMessage(
  appUrl: string,
  channelSlug: string,
  translate?: Translate
) {
  const root = appUrl.replace(/\/+$/, "");
  const slug = channelSlug.replace(/^\/+|\/+$/g, "");
  return (
    translate?.("commands.channelPlaylist", {
      url: `${root}/${slug}`,
    }) ?? `You can edit or search the song database here: ${root}/${slug}`
  );
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
  }> = [],
  translate?: Translate
) {
  if (
    artists.length === 0 &&
    charters.length === 0 &&
    songs.length === 0 &&
    songGroups.length === 0
  ) {
    return (
      translate?.("commands.blacklist.empty") ??
      "No blacklisted artists, charters, songs, or versions."
    );
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
  return (
    translate?.("commands.blacklist.summary", {
      artists: artistText,
      charters: charterText,
      songs: songGroupText,
      versions: songText,
    }) ??
    `Artists: ${artistText}. Charters: ${charterText}. Songs: ${songGroupText}. Versions: ${songText}.`
  );
}

export function buildSetlistMessage(
  artists: Array<{ artistId?: number | null; artistName: string }>,
  translate?: Translate
) {
  if (artists.length === 0) {
    return translate?.("commands.setlist.empty") ?? "No setlist artists.";
  }

  const artistText = artists.length
    ? artists
        .slice(0, 8)
        .map((entry) => entry.artistName)
        .join(", ")
    : "none";
  return (
    translate?.("commands.setlist.summary", {
      artists: artistText,
    }) ?? `Artists: ${artistText}.`
  );
}

export function normalizeCommandPrefix(commandPrefix: string) {
  const trimmed = commandPrefix.trim();
  if (!trimmed) {
    return "!";
  }

  const prefixOnly = trimmed.match(/^[^a-z0-9]+/i)?.[0];
  return prefixOnly && prefixOnly.length > 0 ? prefixOnly : trimmed;
}
