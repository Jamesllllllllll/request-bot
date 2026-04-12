import { describe, expect, it } from "vitest";
import {
  toPlaylistClientChannel,
  toPublicBlacklistArtist,
  toPublicBlacklistCharter,
  toPublicBlacklistSong,
  toPublicBlacklistSongGroup,
  toPublicPlayedSong,
  toPublicPlaylistItem,
  toPublicPlaylistSettings,
  toPublicSetlistArtist,
} from "~/lib/playlist/public-response";

describe("playlist public response helpers", () => {
  it("returns only client-safe channel fields", () => {
    const result = toPlaylistClientChannel({
      id: "chn_123",
      ownerUserId: "usr_123",
      twitchChannelId: "tw_123",
      slug: "jimmy-pants",
      login: "jimmy_pants_",
      displayName: "Jimmy_Pants_",
      isLive: false,
      botEnabled: true,
      botReadyState: "active_offline_testing",
      createdAt: 1,
      updatedAt: 2,
    });

    expect(result).toEqual({
      slug: "jimmy-pants",
      login: "jimmy_pants_",
      displayName: "Jimmy_Pants_",
      isLive: false,
      botReadyState: "active_offline_testing",
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("ownerUserId");
    expect(result).not.toHaveProperty("twitchChannelId");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
  });

  it("returns only the public playlist settings needed by the viewer page", () => {
    const result = toPublicPlaylistSettings({
      botChannelEnabled: true,
      requestsEnabled: false,
      blacklistEnabled: true,
      setlistEnabled: false,
      letSetlistBypassBlacklist: false,
      subscribersMustFollowSetlist: false,
      allowRequestPathModifiers: true,
      allowedRequestPaths: ["lead"],
      requestPathModifierVipTokenCost: 2,
      requestPathModifierVipTokenCosts: {
        guitar: 0,
        lead: 2,
        rhythm: 2,
        bass: 1,
      },
      requestPathModifierUsesVipPriority: true,
      requiredPathsJson: '["lead"]',
      vipTokenDurationThresholdsJson: "[]",
      requiredPathsMatchMode: "any",
      autoGrantVipTokenToSubscribers: true,
      autoGrantVipTokensForSharedSubRenewalMessage: true,
      autoGrantVipTokensToSubGifters: true,
      autoGrantVipTokensToGiftRecipients: true,
      autoGrantVipTokensForCheers: true,
      cheerBitsPerVipToken: 200,
      cheerMinimumTokenPercent: 25,
      autoGrantVipTokensForRaiders: true,
      raidMinimumViewerCount: 1,
      autoGrantVipTokensForStreamElementsTips: true,
      streamElementsTipAmountPerVipToken: 5,
      canManageRequests: false,
      canManageBlacklist: false,
      canManageSetlist: false,
      canManageBlockedChatters: false,
      canViewVipTokens: false,
      canManageVipTokens: false,
      showPlaylistPositions: false,
      showPickOrderBadges: true,
    });

    expect(result).toEqual({
      botChannelEnabled: true,
      requestsEnabled: false,
      blacklistEnabled: true,
      setlistEnabled: false,
      letSetlistBypassBlacklist: false,
      subscribersMustFollowSetlist: false,
      allowRequestPathModifiers: true,
      allowedRequestPaths: ["lead"],
      requestPathModifierVipTokenCost: 2,
      requestPathModifierVipTokenCosts: {
        guitar: 0,
        lead: 2,
        rhythm: 2,
        bass: 1,
      },
      requestPathModifierUsesVipPriority: true,
      requiredPathsJson: '["lead"]',
      vipTokenDurationThresholdsJson: "[]",
      requiredPathsMatchMode: "any",
      autoGrantVipTokenToSubscribers: true,
      autoGrantVipTokensForSharedSubRenewalMessage: true,
      autoGrantVipTokensToSubGifters: true,
      autoGrantVipTokensToGiftRecipients: true,
      autoGrantVipTokensForCheers: true,
      cheerBitsPerVipToken: 200,
      cheerMinimumTokenPercent: 25,
      autoGrantVipTokensForRaiders: true,
      raidMinimumViewerCount: 1,
      autoGrantVipTokensForStreamElementsTips: true,
      streamElementsTipAmountPerVipToken: 5,
      showPlaylistPositions: false,
      showPickOrderBadges: true,
    });
    expect(result).not.toHaveProperty("canManageRequests");
    expect(result).not.toHaveProperty("canViewVipTokens");
    expect(result).toHaveProperty("autoGrantVipTokensForCheers", true);
    expect(result).toHaveProperty("streamElementsTipAmountPerVipToken", 5);
  });

  it("returns only public playlist item fields", () => {
    const result = toPublicPlaylistItem({
      id: "pli_123",
      playlistId: "pl_123",
      channelId: "chn_123",
      songId: "cat_123",
      songTitle: "Whips-A-Swinging",
      songArtist: "Cruel Force",
      songAlbum: "Savage Gods",
      songCreator: "Manch",
      songTuning: "E Standard",
      songPartsJson: '["lead"]',
      songDurationText: "4:11",
      songCatalogSourceId: 99083,
      songGroupedProjectId: 100,
      songArtistId: 200,
      songCharterId: 300,
      songSource: "library",
      songUrl: "https://example.com/song",
      requestedQuery: "whips",
      warningCode: "streamer_choice",
      warningMessage: "hidden",
      candidateMatchesJson: "[]",
      status: "queued",
      requestedByTwitchUserId: "172957013",
      requestedByLogin: "jimmy_pants_",
      requestedByDisplayName: "Jimmy_Pants_",
      requesterChatBadgesJson: null,
      requesterChatBadges: [],
      requestMessageId: "msg_123",
      requestKind: "regular",
      vipTokenCost: 1,
      position: 1,
      regularPosition: 1,
      editedAt: 10,
      createdAt: 9,
      updatedAt: 11,
      songSourceUpdatedAt: 8,
      songDownloads: 31,
    });

    expect(result).toEqual({
      id: "pli_123",
      position: 1,
      songId: "cat_123",
      songTitle: "Whips-A-Swinging",
      songArtist: "Cruel Force",
      songAlbum: "Savage Gods",
      songCreator: "Manch",
      songCatalogSourceId: 99083,
      songGroupedProjectId: 100,
      songArtistId: 200,
      songCharterId: 300,
      songSourceUpdatedAt: 8,
      requestedByTwitchUserId: "172957013",
      requestedByLogin: "jimmy_pants_",
      requestedByDisplayName: "Jimmy_Pants_",
      requesterChatBadges: [],
      requestKind: "regular",
      vipTokenCost: 1,
      requestedQuery: "whips",
      status: "queued",
      createdAt: 9,
      editedAt: 10,
      warningCode: "streamer_choice",
    });
    expect(result).not.toHaveProperty("playlistId");
    expect(result).not.toHaveProperty("channelId");
    expect(result).not.toHaveProperty("songTuning");
    expect(result).not.toHaveProperty("songPartsJson");
    expect(result).not.toHaveProperty("songDurationText");
    expect(result).not.toHaveProperty("songSource");
    expect(result).not.toHaveProperty("songUrl");
    expect(result).not.toHaveProperty("warningMessage");
    expect(result).not.toHaveProperty("candidateMatchesJson");
    expect(result).not.toHaveProperty("requestMessageId");
    expect(result).not.toHaveProperty("regularPosition");
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).not.toHaveProperty("songDownloads");
  });

  it("returns only public played-song and rules fields", () => {
    const playedSong = toPublicPlayedSong({
      id: "psong_123",
      channelId: "chn_123",
      playlistItemId: "pli_123",
      songTitle: "Whips-A-Swinging",
      requestedByTwitchUserId: "172957013",
      requestedByLogin: "jimmy_pants_",
      requestedAt: 4,
      playedAt: 5,
      createdAt: 6,
    });
    const blacklistArtist = toPublicBlacklistArtist({
      channelId: "chn_123",
      artistId: 424,
      artistName: "The Offspring",
      createdAt: 7,
    });
    const blacklistCharter = toPublicBlacklistCharter({
      channelId: "chn_123",
      charterId: 2638,
      charterName: "Hikikomori",
      createdAt: 7,
    });
    const blacklistSong = toPublicBlacklistSong({
      channelId: "chn_123",
      songId: 99077,
      songTitle: "Before the Throne of God Above",
      artistId: null,
      artistName: "Sovereign Grace Music",
      createdAt: 7,
    });
    const blacklistSongGroup = toPublicBlacklistSongGroup({
      channelId: "chn_123",
      groupedProjectId: 1234,
      songTitle: "Song Group",
      artistId: 55,
      artistName: "Artist",
      createdAt: 7,
    });
    const setlistArtist = toPublicSetlistArtist({
      channelId: "chn_123",
      artistId: 424,
      artistName: "The Offspring",
      createdAt: 7,
    });

    expect(playedSong).toEqual({
      requestedByTwitchUserId: "172957013",
      requestedByLogin: "jimmy_pants_",
      requestedAt: 4,
      playedAt: 5,
      createdAt: 6,
    });
    expect(playedSong).not.toHaveProperty("id");
    expect(playedSong).not.toHaveProperty("channelId");
    expect(playedSong).not.toHaveProperty("playlistItemId");

    expect(blacklistArtist).toEqual({
      artistId: 424,
      artistName: "The Offspring",
    });
    expect(blacklistArtist).not.toHaveProperty("channelId");
    expect(blacklistArtist).not.toHaveProperty("createdAt");

    expect(blacklistCharter).toEqual({
      charterId: 2638,
      charterName: "Hikikomori",
    });
    expect(blacklistSong).toEqual({
      songId: 99077,
      songTitle: "Before the Throne of God Above",
      artistName: "Sovereign Grace Music",
    });
    expect(blacklistSongGroup).toEqual({
      groupedProjectId: 1234,
      songTitle: "Song Group",
      artistId: 55,
      artistName: "Artist",
    });
    expect(setlistArtist).toEqual({
      artistId: 424,
      artistName: "The Offspring",
    });
  });
});
