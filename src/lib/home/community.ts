export type HomeLiveChannelQueueItem = {
  title: string;
  artist?: string | null;
};

export type HomeLiveChannel = {
  id: string;
  slug: string;
  displayName: string;
  login: string;
  playlistHref?: string | null;
  playlistExternal?: boolean;
  streamTitle?: string | null;
  streamThumbnailUrl?: string | null;
  playedTodayCount: number;
  currentItem?: HomeLiveChannelQueueItem | null;
  nextItem?: HomeLiveChannelQueueItem | null;
};

export type HomeCommunitySongTrend = {
  title: string;
  artist?: string | null;
  playCount: number;
  channelCount: number;
};

export type HomeCommunityArtistTrend = {
  artist: string;
  playCount: number;
  songCount: number;
};

export type HomeCommunityStats = {
  requestsPlayedToday: number;
  activeRequestersToday: number;
  uniqueSongsToday: number;
  activeChannelsToday: number;
  topSongsToday: HomeCommunitySongTrend[];
  topArtistsToday: HomeCommunityArtistTrend[];
};

export type HomeLiveChannelsResponse = {
  channels: HomeLiveChannel[];
  community: HomeCommunityStats | null;
};

export function getUtcDayStart(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}
