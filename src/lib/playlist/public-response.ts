import type { RequestPathModifierVipTokenCosts } from "~/lib/request-policy";
import type { RequesterChatBadge } from "~/lib/twitch/chat-badges";

export type PlaylistClientChannel = {
  slug: string;
  login?: string;
  displayName: string;
  isLive: boolean;
  botReadyState?: string | null;
};

export function toPlaylistClientChannel(
  channel: PlaylistClientChannel & Record<string, unknown>
) {
  return {
    slug: channel.slug,
    ...(typeof channel.login === "string" ? { login: channel.login } : {}),
    displayName: channel.displayName,
    isLive: channel.isLive,
    botReadyState: channel.botReadyState ?? null,
  } satisfies PlaylistClientChannel;
}

export type PublicPlaylistSettings = {
  botChannelEnabled: boolean;
  requestsEnabled: boolean;
  blacklistEnabled: boolean;
  setlistEnabled: boolean;
  letSetlistBypassBlacklist: boolean;
  subscribersMustFollowSetlist: boolean;
  allowRequestPathModifiers: boolean;
  allowedRequestPaths: string[];
  requestPathModifierVipTokenCost: number;
  requestPathModifierVipTokenCosts: RequestPathModifierVipTokenCosts;
  requestPathModifierUsesVipPriority: boolean;
  requiredPathsJson: string;
  vipTokenDurationThresholdsJson: string;
  requiredPathsMatchMode: string;
  autoGrantVipTokenToSubscribers: boolean;
  autoGrantVipTokensForSharedSubRenewalMessage: boolean;
  autoGrantVipTokensToSubGifters: boolean;
  autoGrantVipTokensToGiftRecipients: boolean;
  autoGrantVipTokensForCheers: boolean;
  cheerBitsPerVipToken: number;
  cheerMinimumTokenPercent: number;
  autoGrantVipTokensForRaiders: boolean;
  raidMinimumViewerCount: number;
  autoGrantVipTokensForStreamElementsTips: boolean;
  streamElementsTipAmountPerVipToken: number;
  showPlaylistPositions: boolean;
  showPickOrderBadges: boolean;
};

export function toPublicPlaylistSettings(
  settings: PublicPlaylistSettings & Record<string, unknown>
) {
  return {
    botChannelEnabled: settings.botChannelEnabled,
    requestsEnabled: settings.requestsEnabled,
    blacklistEnabled: settings.blacklistEnabled,
    setlistEnabled: settings.setlistEnabled,
    letSetlistBypassBlacklist: settings.letSetlistBypassBlacklist,
    subscribersMustFollowSetlist: settings.subscribersMustFollowSetlist,
    allowRequestPathModifiers: settings.allowRequestPathModifiers,
    allowedRequestPaths: settings.allowedRequestPaths,
    requestPathModifierVipTokenCost: settings.requestPathModifierVipTokenCost,
    requestPathModifierVipTokenCosts: settings.requestPathModifierVipTokenCosts,
    requestPathModifierUsesVipPriority:
      settings.requestPathModifierUsesVipPriority,
    requiredPathsJson: settings.requiredPathsJson,
    vipTokenDurationThresholdsJson: settings.vipTokenDurationThresholdsJson,
    requiredPathsMatchMode: settings.requiredPathsMatchMode,
    autoGrantVipTokenToSubscribers: settings.autoGrantVipTokenToSubscribers,
    autoGrantVipTokensForSharedSubRenewalMessage:
      settings.autoGrantVipTokensForSharedSubRenewalMessage,
    autoGrantVipTokensToSubGifters: settings.autoGrantVipTokensToSubGifters,
    autoGrantVipTokensToGiftRecipients:
      settings.autoGrantVipTokensToGiftRecipients,
    autoGrantVipTokensForCheers: settings.autoGrantVipTokensForCheers,
    cheerBitsPerVipToken: settings.cheerBitsPerVipToken,
    cheerMinimumTokenPercent: settings.cheerMinimumTokenPercent,
    autoGrantVipTokensForRaiders: settings.autoGrantVipTokensForRaiders,
    raidMinimumViewerCount: settings.raidMinimumViewerCount,
    autoGrantVipTokensForStreamElementsTips:
      settings.autoGrantVipTokensForStreamElementsTips,
    streamElementsTipAmountPerVipToken:
      settings.streamElementsTipAmountPerVipToken,
    showPlaylistPositions: settings.showPlaylistPositions,
    showPickOrderBadges: settings.showPickOrderBadges,
  } satisfies PublicPlaylistSettings;
}

export type PublicPlaylistItem = {
  id: string;
  position?: number | null;
  songId?: string | null;
  songTitle: string;
  songArtist?: string | null;
  songAlbum?: string | null;
  songCreator?: string | null;
  songCatalogSourceId?: number | null;
  songGroupedProjectId?: number | null;
  songArtistId?: number | null;
  songCharterId?: number | null;
  songSourceUpdatedAt?: number | null;
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedByDisplayName?: string | null;
  requesterChatBadges?: RequesterChatBadge[] | null;
  requestKind?: "regular" | "vip" | null;
  vipTokenCost?: number | null;
  requestedQuery?: string | null;
  status: string;
  createdAt?: number | null;
  editedAt?: number | null;
  warningCode?: string | null;
};

export function toPublicPlaylistItem(
  item: PublicPlaylistItem & Record<string, unknown>
) {
  return {
    id: item.id,
    position: item.position,
    songId: item.songId,
    songTitle: item.songTitle,
    songArtist: item.songArtist,
    songAlbum: item.songAlbum,
    songCreator: item.songCreator,
    songCatalogSourceId: item.songCatalogSourceId,
    songGroupedProjectId: item.songGroupedProjectId,
    songArtistId: item.songArtistId,
    songCharterId: item.songCharterId,
    songSourceUpdatedAt: item.songSourceUpdatedAt,
    requestedByTwitchUserId: item.requestedByTwitchUserId,
    requestedByLogin: item.requestedByLogin,
    requestedByDisplayName: item.requestedByDisplayName,
    requesterChatBadges: item.requesterChatBadges,
    requestKind: item.requestKind,
    vipTokenCost: item.vipTokenCost,
    requestedQuery: item.requestedQuery,
    status: item.status,
    createdAt: item.createdAt,
    editedAt: item.editedAt,
    warningCode: item.warningCode,
  } satisfies PublicPlaylistItem;
}

export type PublicPlayedSong = {
  requestedByTwitchUserId?: string | null;
  requestedByLogin?: string | null;
  requestedAt?: number | null;
  playedAt?: number | null;
  createdAt?: number | null;
};

export function toPublicPlayedSong(
  song: PublicPlayedSong & Record<string, unknown>
) {
  return {
    requestedByTwitchUserId: song.requestedByTwitchUserId,
    requestedByLogin: song.requestedByLogin,
    requestedAt: song.requestedAt,
    playedAt: song.playedAt,
    createdAt: song.createdAt,
  } satisfies PublicPlayedSong;
}

export type PublicBlacklistArtist = {
  artistId: number;
  artistName: string;
};

export function toPublicBlacklistArtist(
  artist: PublicBlacklistArtist & Record<string, unknown>
) {
  return {
    artistId: artist.artistId,
    artistName: artist.artistName,
  } satisfies PublicBlacklistArtist;
}

export type PublicBlacklistCharter = {
  charterId: number;
  charterName: string;
};

export function toPublicBlacklistCharter(
  charter: PublicBlacklistCharter & Record<string, unknown>
) {
  return {
    charterId: charter.charterId,
    charterName: charter.charterName,
  } satisfies PublicBlacklistCharter;
}

export type PublicPreferredCharter = {
  charterId: number;
  charterName: string;
};

export function toPublicPreferredCharter(
  charter: PublicPreferredCharter & Record<string, unknown>
) {
  return {
    charterId: charter.charterId,
    charterName: charter.charterName,
  } satisfies PublicPreferredCharter;
}

export type PublicBlacklistSong = {
  songId: number;
  songTitle: string;
  artistName?: string | null;
};

export function toPublicBlacklistSong(
  song: PublicBlacklistSong & Record<string, unknown>
) {
  return {
    songId: song.songId,
    songTitle: song.songTitle,
    artistName: song.artistName,
  } satisfies PublicBlacklistSong;
}

export type PublicBlacklistSongGroup = {
  groupedProjectId: number;
  songTitle: string;
  artistId?: number | null;
  artistName?: string | null;
};

export function toPublicBlacklistSongGroup(
  songGroup: PublicBlacklistSongGroup & Record<string, unknown>
) {
  return {
    groupedProjectId: songGroup.groupedProjectId,
    songTitle: songGroup.songTitle,
    artistId: songGroup.artistId,
    artistName: songGroup.artistName,
  } satisfies PublicBlacklistSongGroup;
}

export type PublicSetlistArtist = {
  artistId: number;
  artistName: string;
};

export function toPublicSetlistArtist(
  artist: PublicSetlistArtist & Record<string, unknown>
) {
  return {
    artistId: artist.artistId,
    artistName: artist.artistName,
  } satisfies PublicSetlistArtist;
}
