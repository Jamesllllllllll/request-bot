import { decodeHtmlEntities } from "~/lib/utils";

export const ROCK_SNIFFER_ADDON_ID = "rocklist_live_connector";
export type RockSnifferAddonRelease = {
  version: string;
  releasedAt: string;
  filename: string;
};

const ROCK_SNIFFER_ADDON_RELEASES: RockSnifferAddonRelease[] = [
  {
    version: "2026-04-17-1836",
    releasedAt: "2026-04-17-1836",
    filename: `${ROCK_SNIFFER_ADDON_ID}-2026-04-17-1836.zip`,
  },
  {
    version: "2026-04-17-1806",
    releasedAt: "2026-04-17-1806",
    filename: `${ROCK_SNIFFER_ADDON_ID}-2026-04-17-1806.zip`,
  },
  {
    version: "2026-04-17-1726",
    releasedAt: "2026-04-17-1726",
    filename: `${ROCK_SNIFFER_ADDON_ID}-2026-04-17-1726.zip`,
  },
  {
    version: "2026-04-17-1646",
    releasedAt: "2026-04-17-1646",
    filename: `${ROCK_SNIFFER_ADDON_ID}-2026-04-17-1646.zip`,
  },
  {
    version: "2026-04-17-1614",
    releasedAt: "2026-04-17-1614",
    filename: `${ROCK_SNIFFER_ADDON_ID}-2026-04-17-1614.zip`,
  },
  {
    version: "2026-04-17",
    releasedAt: "2026-04-17",
    filename: `${ROCK_SNIFFER_ADDON_ID}-2026-04-17.zip`,
  },
];

export const LATEST_ROCK_SNIFFER_ADDON_RELEASE = ROCK_SNIFFER_ADDON_RELEASES[0];
export const ROCK_SNIFFER_ADDON_PACKAGE_DATE =
  LATEST_ROCK_SNIFFER_ADDON_RELEASE.version;
export const ROCK_SNIFFER_ADDON_DOWNLOAD_FILENAME =
  LATEST_ROCK_SNIFFER_ADDON_RELEASE.filename;
export const ROCK_SNIFFER_ADDON_DOWNLOAD_PATH = `/rocksniffer-addon/${ROCK_SNIFFER_ADDON_DOWNLOAD_FILENAME}`;

type NullableString = string | null | undefined;

export type RockSnifferSongStartedEvent = {
  event: "songStarted";
  observedAt: number | null;
  song: {
    id: string | null;
    title: string;
    artist: string;
    album: string | null;
    arrangement: string | null;
    tuning: string | null;
    lengthSeconds: number | null;
  };
};

export type RockSnifferPlaylistItem = {
  id: string;
  songTitle: NullableString;
  songArtist: NullableString;
  status: "queued" | "current" | string;
};

export type RockSnifferPlaylistMatchResult =
  | {
      status: "no_match";
    }
  | {
      status: "ambiguous";
      matches: RockSnifferPlaylistItem[];
    }
  | {
      status: "already_current";
      item: RockSnifferPlaylistItem;
    }
  | {
      status: "matched";
      item: RockSnifferPlaylistItem;
    };

export type RockSnifferRelayPlan =
  | {
      status: "no_match";
    }
  | {
      status: "ambiguous";
      matches: RockSnifferPlaylistItem[];
    }
  | {
      status: "already_current";
      item: RockSnifferPlaylistItem;
    }
  | {
      status: "set_current";
      item: RockSnifferPlaylistItem;
    }
  | {
      status: "mark_played_then_set_current";
      currentItem: RockSnifferPlaylistItem;
      item: RockSnifferPlaylistItem;
    };

function parseOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

export function parseRockSnifferSongStartedEvent(
  payload: unknown
): RockSnifferSongStartedEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const eventPayload = payload as Record<string, unknown>;
  if (eventPayload.event !== "songStarted") {
    return null;
  }

  const rawSong = eventPayload.song;
  if (!rawSong || typeof rawSong !== "object") {
    return null;
  }

  const song = rawSong as Record<string, unknown>;
  const title = parseOptionalString(song.title);
  const artist = parseOptionalString(song.artist);

  if (!title || !artist) {
    return null;
  }

  return {
    event: "songStarted",
    observedAt: parseOptionalNumber(eventPayload.observedAt),
    song: {
      id: parseOptionalString(song.id),
      title,
      artist,
      album: parseOptionalString(song.album),
      arrangement: parseOptionalString(song.arrangement),
      tuning: parseOptionalString(song.tuning),
      lengthSeconds: parseOptionalNumber(song.lengthSeconds),
    },
  };
}

export function normalizeRockSnifferMatchValue(value: NullableString) {
  return decodeHtmlEntities(value)
    .replace(/&([a-z])(?:acute|grave|uml|tilde|circ|cedil|ring|slash);/gi, "$1")
    .replace(/&(ae|oe)lig;/gi, "$1")
    .replace(/&szlig;/gi, "ss")
    .replace(/&[a-z]+;/gi, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildSongMatchKey(input: {
  title: NullableString;
  artist: NullableString;
}) {
  const normalizedTitle = normalizeRockSnifferMatchValue(input.title);
  const normalizedArtist = normalizeRockSnifferMatchValue(input.artist);

  if (!normalizedTitle || !normalizedArtist) {
    return null;
  }

  return `${normalizedArtist}::${normalizedTitle}`;
}

export function findRockSnifferPlaylistMatch(
  items: RockSnifferPlaylistItem[],
  input: {
    title: string;
    artist: string;
  }
): RockSnifferPlaylistMatchResult {
  const expectedKey = buildSongMatchKey(input);

  if (!expectedKey) {
    return { status: "no_match" };
  }

  const matches = items.filter((item) => {
    return (
      (item.status === "queued" || item.status === "current") &&
      buildSongMatchKey({
        title: item.songTitle,
        artist: item.songArtist,
      }) === expectedKey
    );
  });

  if (matches.length === 0) {
    return { status: "no_match" };
  }

  const currentMatch = matches.find((item) => item.status === "current");
  if (currentMatch) {
    return {
      status: "already_current",
      item: currentMatch,
    };
  }

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      matches,
    };
  }

  return {
    status: "matched",
    item: matches[0],
  };
}

export function resolveRockSnifferRelayPlan(input: {
  items: RockSnifferPlaylistItem[];
  match: RockSnifferPlaylistMatchResult;
}): RockSnifferRelayPlan {
  const match = input.match;

  if (match.status === "no_match") {
    return match;
  }

  if (match.status === "ambiguous") {
    return match;
  }

  if (match.status === "already_current") {
    return match;
  }

  const currentItem = input.items.find(
    (item) => item.status === "current" && item.id !== match.item.id
  );

  if (currentItem) {
    return {
      status: "mark_played_then_set_current",
      currentItem,
      item: match.item,
    };
  }

  return {
    status: "set_current",
    item: match.item,
  };
}

export function buildRockSnifferRelayUrl(
  appUrl: string,
  channelSlug: string,
  token: string
) {
  return `${appUrl}/api/integrations/rocksniffer/${channelSlug}/${token}/events`;
}

export function buildRockSnifferAddonDownloadUrl(appUrl: string) {
  return `${appUrl}${ROCK_SNIFFER_ADDON_DOWNLOAD_PATH}`;
}

export function getRockSnifferAddonReleases() {
  return ROCK_SNIFFER_ADDON_RELEASES.map((release) => ({ ...release }));
}

export function buildRockSnifferAddonManifest(appUrl: string) {
  return {
    latest: {
      ...LATEST_ROCK_SNIFFER_ADDON_RELEASE,
      downloadUrl: buildRockSnifferAddonDownloadUrl(appUrl),
    },
  };
}
