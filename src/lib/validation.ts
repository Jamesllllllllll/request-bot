import { z } from "zod";
import { pathOptions, tuningOptions } from "./channel-options";
import { supportedLocales } from "./i18n/locales";
import { defaultChannelPointRewardCost } from "./twitch/channel-point-rewards";

const searchSortSchema = z.enum([
  "relevance",
  "artist",
  "title",
  "album",
  "creator",
  "tuning",
  "duration",
  "downloads",
  "updated",
]);
const searchFieldSchema = z.enum([
  "any",
  "title",
  "artist",
  "album",
  "creator",
]);
const vipTokenDurationThresholdSchema = z.object({
  minimumDurationMinutes: z.number().min(0.01).max(600),
  tokenCost: z.number().int().min(1).max(100),
});
const vipTokenCostSchema = z.number().int().min(1).max(100);

export const searchInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    channelSlug: z.string().trim().max(100).optional(),
    showBlacklisted: z
      .preprocess(
        (value) =>
          value === undefined
            ? undefined
            : value === true || value === "true"
              ? true
              : value === false || value === "false"
                ? false
                : value,
        z.boolean().optional()
      )
      .default(false),
    field: searchFieldSchema.default("any"),
    title: z.string().trim().max(200).optional(),
    artist: z.string().trim().max(200).optional(),
    album: z.string().trim().max(200).optional(),
    creator: z.string().trim().max(200).optional(),
    tuning: z.array(z.string().trim().max(200)).max(50).optional(),
    parts: z.array(z.enum(pathOptions)).max(pathOptions.length).optional(),
    partsMatchMode: z.enum(["any", "all"]).default("any"),
    year: z
      .array(z.coerce.number().int().min(1900).max(2100))
      .max(200)
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    sortBy: searchSortSchema.default("relevance"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .superRefine((input, ctx) => {
    if (input.query && input.query.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Search terms must be at least 3 characters.",
        path: ["query"],
      });
    }
  });

export const moderationInputSchema = z.object({
  twitchUserId: z.string().min(1),
  login: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  reason: z.string().trim().max(300).optional(),
});

export const moderationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("blockUser"),
    twitchUserId: z.string().min(1),
    login: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("removeBlockedUser"),
    twitchUserId: z.string().min(1),
  }),
  z.object({
    action: z.literal("addBlacklistedArtist"),
    artistId: z.number().int().positive(),
    artistName: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("removeBlacklistedArtist"),
    artistId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("addBlacklistedCharter"),
    charterId: z.number().int().positive(),
    charterName: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("removeBlacklistedCharter"),
    charterId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("addBlacklistedSong"),
    songId: z.number().int().positive(),
    songTitle: z.string().trim().min(1).max(200),
    artistId: z.number().int().positive().nullable().optional(),
    artistName: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("addBlacklistedSongGroup"),
    groupedProjectId: z.number().int().positive(),
    songTitle: z.string().trim().min(1).max(200),
    artistId: z.number().int().positive().nullable().optional(),
    artistName: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("removeBlacklistedSong"),
    songId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("removeBlacklistedSongGroup"),
    groupedProjectId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("addSetlistArtist"),
    artistId: z.number().int().positive(),
    artistName: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("removeSetlistArtist"),
    artistId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("addVipToken"),
    login: z.string().trim().min(1).max(50),
    displayName: z.string().trim().min(1).max(100).optional(),
    twitchUserId: z.string().trim().min(1).max(50).optional(),
  }),
  z.object({
    action: z.literal("removeVipToken"),
    login: z.string().trim().min(1).max(50),
  }),
  z.object({
    action: z.literal("setVipTokenCount"),
    login: z.string().trim().min(1).max(50),
    count: z.number().min(0).max(999),
  }),
]);

export const settingsInputSchema = z
  .object({
    defaultLocale: z.enum(supportedLocales),
    botChannelEnabled: z.boolean(),
    moderatorCanManageRequests: z.boolean(),
    moderatorCanManageBlacklist: z.boolean(),
    moderatorCanManageSetlist: z.boolean(),
    moderatorCanManageBlockedChatters: z.boolean(),
    moderatorCanViewVipTokens: z.boolean(),
    moderatorCanManageVipTokens: z.boolean(),
    moderatorCanManageTags: z.boolean(),
    requestsEnabled: z.boolean(),
    allowAnyoneToRequest: z.boolean(),
    allowSubscribersToRequest: z.boolean(),
    allowVipsToRequest: z.boolean(),
    onlyOfficialDlc: z.boolean(),
    allowedTunings: z.array(z.enum(tuningOptions)).max(tuningOptions.length),
    requiredPaths: z.array(z.enum(pathOptions)).max(pathOptions.length),
    requiredPathsMatchMode: z.enum(["any", "all"]),
    maxQueueSize: z.number().int().min(1).max(1000),
    maxViewerRequestsAtOnce: z.number().int().min(1).max(20),
    maxSubscriberRequestsAtOnce: z.number().int().min(1).max(20),
    maxVipViewerRequestsAtOnce: z.number().int().min(1).max(20),
    maxVipSubscriberRequestsAtOnce: z.number().int().min(1).max(20),
    limitRegularRequestsEnabled: z.boolean(),
    regularRequestsPerPeriod: z.number().int().min(1).max(100),
    regularRequestPeriodSeconds: z.number().int().min(0).max(86400),
    limitVipRequestsEnabled: z.boolean(),
    vipRequestsPerPeriod: z.number().int().min(1).max(100),
    vipRequestPeriodSeconds: z.number().int().min(0).max(86400),
    vipRequestCooldownEnabled: z.boolean(),
    vipRequestCooldownMinutes: z.number().int().min(0).max(10080),
    blacklistEnabled: z.boolean(),
    letSetlistBypassBlacklist: z.boolean(),
    setlistEnabled: z.boolean(),
    subscribersMustFollowSetlist: z.boolean(),
    autoGrantVipTokenToSubscribers: z.boolean(),
    autoGrantVipTokensForSharedSubRenewalMessage: z.boolean(),
    autoGrantVipTokensToSubGifters: z.boolean(),
    autoGrantVipTokensToGiftRecipients: z.boolean(),
    autoGrantVipTokensForCheers: z.boolean(),
    autoGrantVipTokensForChannelPointRewards: z.boolean(),
    autoGrantVipTokensForRaiders: z.boolean(),
    autoGrantVipTokensForStreamElementsTips: z.boolean(),
    allowRequestPathModifiers: z.boolean(),
    cheerBitsPerVipToken: z.number().int().min(1).max(100_000),
    channelPointRewardCost: z
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .default(defaultChannelPointRewardCost),
    vipTokenDurationThresholds: z
      .array(vipTokenDurationThresholdSchema)
      .max(12)
      .default([]),
    cheerMinimumTokenPercent: z.union([
      z.literal(25),
      z.literal(50),
      z.literal(75),
      z.literal(100),
    ]),
    raidMinimumViewerCount: z.number().int().min(1).max(100_000),
    streamElementsTipAmountPerVipToken: z.number().min(0.01).max(100_000),
    duplicateWindowSeconds: z.number().int().min(0).max(86400),
    showPlaylistPositions: z.boolean(),
    showPickOrderBadges: z.boolean(),
    commandPrefix: z.string().trim().min(2).max(12),
  })
  .superRefine((input, ctx) => {
    if (
      input.allowAnyoneToRequest &&
      (!input.allowSubscribersToRequest || !input.allowVipsToRequest)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Subscriber and VIP requests must stay enabled when anyone can request.",
        path: ["allowAnyoneToRequest"],
      });
    }

    if (
      input.autoGrantVipTokensForCheers &&
      input.cheerBitsPerVipToken * (input.cheerMinimumTokenPercent / 100) < 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cheer minimum threshold must grant at least 0.25 tokens.",
        path: ["cheerMinimumTokenPercent"],
      });
    }

    if (input.moderatorCanManageVipTokens && !input.moderatorCanViewVipTokens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Moderators must be allowed to view VIP tokens before they can manage them.",
        path: ["moderatorCanManageVipTokens"],
      });
    }

    if (
      input.vipRequestCooldownEnabled &&
      input.vipRequestCooldownMinutes <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set a VIP request cooldown longer than 0 minutes.",
        path: ["vipRequestCooldownMinutes"],
      });
    }
  });

export type SettingsInputData = z.infer<typeof settingsInputSchema>;

export const overlaySettingsInputSchema = z.object({
  overlayShowCreator: z.boolean(),
  overlayShowAlbum: z.boolean(),
  overlayAnimateNowPlaying: z.boolean(),
  overlayAccentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  overlayVipColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  overlayTextColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  overlayMutedTextColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  overlayPanelColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  overlayBackgroundColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  overlayBorderColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  overlayBackgroundOpacity: z.number().int().min(0).max(100),
  overlayCornerRadius: z.number().int().min(0).max(40),
  overlayItemGap: z.number().int().min(0).max(32),
  overlayItemPadding: z.number().int().min(8).max(32),
  overlayTitleFontSize: z.number().int().min(16).max(48),
  overlayMetaFontSize: z.number().int().min(10).max(24),
});

export type OverlaySettingsInputData = z.infer<
  typeof overlaySettingsInputSchema
>;

export const artistListItemSchema = z.object({
  artistId: z.number().int().positive(),
  artistName: z.string().trim().min(1).max(200),
});

export const songListItemSchema = z.object({
  songId: z.number().int().positive(),
  songTitle: z.string().trim().min(1).max(200),
  artistId: z.number().int().positive().nullable().optional(),
  artistName: z.string().trim().min(1).max(200).optional(),
});

export const playlistMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("markPlayed"), itemId: z.string() }),
  z.object({ action: z.literal("restorePlayed"), playedSongId: z.string() }),
  z.object({ action: z.literal("setCurrent"), itemId: z.string() }),
  z.object({ action: z.literal("returnToQueue"), itemId: z.string() }),
  z.object({ action: z.literal("deleteItem"), itemId: z.string() }),
  z.object({
    action: z.literal("changeRequestKind"),
    itemId: z.string(),
    requestKind: z.enum(["regular", "vip"]),
    vipTokenCost: vipTokenCostSchema.optional(),
  }),
  z.object({
    action: z.literal("chooseVersion"),
    itemId: z.string(),
    candidateId: z.string(),
  }),
  z.object({ action: z.literal("clearPlaylist") }),
  z.object({ action: z.literal("resetSession") }),
  z.object({ action: z.literal("shuffleNext") }),
  z.object({ action: z.literal("shufflePlaylist") }),
  z.object({
    action: z.literal("reorderItems"),
    orderedItemIds: z.array(z.string()).min(1),
  }),
  z.object({
    action: z.literal("manualAdd"),
    songId: z.string(),
    requesterLogin: z.string().trim().min(2).max(25).optional(),
    requesterTwitchUserId: z.string().trim().min(1).max(50).optional(),
    requesterDisplayName: z.string().trim().min(1).max(100).optional(),
    title: z.string().min(1),
    authorId: z.number().optional(),
    groupedProjectId: z.number().optional(),
    artist: z.string().optional(),
    album: z.string().optional(),
    creator: z.string().optional(),
    tuning: z.string().optional(),
    parts: z.array(z.string()).optional(),
    durationText: z.string().optional(),
    source: z.string(),
    sourceUrl: z.string().optional(),
    sourceId: z.number().optional(),
    candidateMatchesJson: z.string().optional(),
  }),
]);

const viewerSubmitCatalogSchema = z.object({
  action: z.literal("submit"),
  songId: z.string().trim().min(1).max(80),
  requestMode: z.literal("catalog").optional(),
  requestKind: z.enum(["regular", "vip"]),
  vipTokenCost: vipTokenCostSchema.optional(),
  replaceExisting: z.boolean().optional().default(false),
  itemId: z.string().trim().min(1).max(80).optional(),
});

const viewerSubmitSpecialSchema = z.object({
  action: z.literal("submit"),
  query: z.string().trim().min(2).max(200),
  requestMode: z.enum(["random", "choice"]),
  requestKind: z.enum(["regular", "vip"]),
  vipTokenCost: vipTokenCostSchema.optional(),
  replaceExisting: z.boolean().optional().default(false),
  itemId: z.string().trim().min(1).max(80).optional(),
});

const viewerRemoveRequestSchema = z.object({
  action: z.literal("remove"),
  kind: z.enum(["regular", "vip", "all"]).optional().default("all"),
  itemId: z.string().trim().min(1).max(80).optional(),
});

export const viewerRequestMutationSchema = z.union([
  viewerSubmitCatalogSchema,
  viewerSubmitSpecialSchema,
  viewerRemoveRequestSchema,
]);

export const extensionSearchInputSchema = z.object({
  query: z.string().trim().min(3).max(200),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(10),
});

export const extensionSubmitRequestSchema = z.union([
  z.object({
    songId: z.string().trim().min(1).max(80),
    requestMode: z.literal("catalog").optional(),
    requestKind: z.enum(["regular", "vip"]),
    vipTokenCost: vipTokenCostSchema.optional(),
    itemId: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    query: z.string().trim().min(2).max(200),
    requestMode: z.enum(["random", "choice"]),
    requestKind: z.enum(["regular", "vip"]),
    vipTokenCost: vipTokenCostSchema.optional(),
    itemId: z.string().trim().min(1).max(80).optional(),
  }),
]);

export const extensionRemoveRequestSchema = z.object({
  kind: z.enum(["regular", "vip", "all"]).optional().default("all"),
  itemId: z.string().trim().min(1).max(80).optional(),
});

export const extensionPlaylistMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setCurrent"),
    itemId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("returnToQueue"),
    itemId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("markPlayed"),
    itemId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("deleteItem"),
    itemId: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("manualAdd"),
    songId: z.string().trim().min(1).max(80),
    requesterLogin: z.string().trim().min(2).max(25).optional(),
    requesterTwitchUserId: z.string().trim().min(1).max(50).optional(),
    requesterDisplayName: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(200),
    authorId: z.number().int().positive().optional(),
    groupedProjectId: z.number().int().positive().optional(),
    artist: z.string().trim().min(1).max(200).optional(),
    album: z.string().trim().min(1).max(200).optional(),
    creator: z.string().trim().min(1).max(200).optional(),
    tuning: z.string().trim().min(1).max(200).optional(),
    parts: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    durationText: z.string().trim().min(1).max(20).optional(),
    source: z.string().trim().min(1).max(50),
    sourceUrl: z.string().url().optional(),
    sourceId: z.number().int().positive().optional(),
    candidateMatchesJson: z.string().trim().min(2).max(20_000).optional(),
  }),
  z.object({
    action: z.literal("changeRequestKind"),
    itemId: z.string().trim().min(1).max(80),
    requestKind: z.enum(["regular", "vip"]),
    vipTokenCost: vipTokenCostSchema.optional(),
  }),
  z.object({
    action: z.literal("shufflePlaylist"),
  }),
  z.object({
    action: z.literal("reorderItems"),
    orderedItemIds: z.array(z.string().trim().min(1).max(80)).min(1),
  }),
]);
