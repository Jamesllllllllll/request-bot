export type BlacklistedArtist = {
  artistId: number;
  artistName: string;
};

export type BlacklistedCharter = {
  charterId: number;
  charterName: string;
};

export type BlacklistedSongVersion = {
  songId: number;
  songTitle: string;
  artistName?: string | null;
};

export type BlacklistedSongGroup = {
  groupedProjectId: number;
  songTitle: string;
  artistId?: number | null;
  artistName?: string | null;
};

export type ChannelBlacklist = {
  artists: BlacklistedArtist[];
  charters: BlacklistedCharter[];
  songs: BlacklistedSongVersion[];
  songGroups: BlacklistedSongGroup[];
};

export type ChannelBlacklistReasonCode =
  | "version_blacklist"
  | "song_blacklist"
  | "artist_blacklist"
  | "charter_blacklist";

export function normalizeBlacklistValue(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function getBlacklistReasonCodes(
  item: {
    songCatalogSourceId?: number | null;
    songGroupedProjectId?: number | null;
    songArtistId?: number | null;
    songArtist?: string | null;
    songCharterId?: number | null;
    songCreator?: string | null;
  },
  blacklist: ChannelBlacklist
) {
  const reasons: ChannelBlacklistReasonCode[] = [];
  const artistName = normalizeBlacklistValue(item.songArtist);
  const creatorName = normalizeBlacklistValue(item.songCreator);
  const versionBlocked =
    item.songCatalogSourceId != null &&
    blacklist.songs.some((song) => song.songId === item.songCatalogSourceId);
  const songBlocked =
    item.songGroupedProjectId != null &&
    blacklist.songGroups.some(
      (song) => song.groupedProjectId === item.songGroupedProjectId
    );
  const artistBlocked =
    (item.songArtistId != null &&
      blacklist.artists.some(
        (artist) => artist.artistId === item.songArtistId
      )) ||
    (!!artistName &&
      blacklist.artists.some(
        (artist) => normalizeBlacklistValue(artist.artistName) === artistName
      ));
  const charterBlocked =
    (item.songCharterId != null &&
      blacklist.charters.some(
        (charter) => charter.charterId === item.songCharterId
      )) ||
    (!!creatorName &&
      blacklist.charters.some(
        (charter) =>
          normalizeBlacklistValue(charter.charterName) === creatorName
      ));

  if (versionBlocked) {
    reasons.push("version_blacklist");
  }

  if (songBlocked) {
    reasons.push("song_blacklist");
  }

  if (artistBlocked) {
    reasons.push("artist_blacklist");
  }

  if (charterBlocked) {
    reasons.push("charter_blacklist");
  }

  return reasons;
}

export function formatBlacklistReason(reason: ChannelBlacklistReasonCode) {
  switch (reason) {
    case "version_blacklist":
      return "Version blacklisted";
    case "song_blacklist":
      return "Song blacklisted";
    case "artist_blacklist":
      return "Artist blacklisted";
    case "charter_blacklist":
      return "Charter blacklisted";
  }
}

export function getBlacklistReasons(
  item: {
    songCatalogSourceId?: number | null;
    songGroupedProjectId?: number | null;
    songArtistId?: number | null;
    songArtist?: string | null;
    songCharterId?: number | null;
    songCreator?: string | null;
  },
  blacklist: ChannelBlacklist
) {
  return getBlacklistReasonCodes(item, blacklist).map(formatBlacklistReason);
}
