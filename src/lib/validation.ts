import { z } from "zod";
import { pathOptions, tuningOptions } from "./channel-options";

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

export const searchInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    field: searchFieldSchema.default("any"),
    title: z.string().trim().max(200).optional(),
    artist: z.string().trim().max(200).optional(),
    album: z.string().trim().max(200).optional(),
    creator: z.string().trim().max(200).optional(),
    tuning: z.array(z.string().trim().max(200)).max(50).optional(),
    parts: z.array(z.enum(pathOptions)).max(pathOptions.length).optional(),
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
    const hasCoreText = !!(
      input.query ||
      input.title ||
      input.artist ||
      input.album ||
      input.creator
    );

    if (input.query && input.query.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Search terms must be at least 3 characters.",
        path: ["query"],
      });
    }

    if (
      !hasCoreText &&
      ((input.tuning && input.tuning.length > 0) ||
        (input.parts && input.parts.length > 0) ||
        (input.year && input.year.length > 0))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a title, artist, album, or creator.",
        path: ["title"],
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
    action: z.literal("removeBlacklistedSong"),
    songId: z.number().int().positive(),
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
  }),
  z.object({
    action: z.literal("removeVipToken"),
    login: z.string().trim().min(1).max(50),
  }),
]);

export const settingsInputSchema = z
  .object({
    botChannelEnabled: z.boolean(),
    moderatorCanManageRequests: z.boolean(),
    moderatorCanManageBlacklist: z.boolean(),
    moderatorCanManageSetlist: z.boolean(),
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
    blacklistEnabled: z.boolean(),
    letSetlistBypassBlacklist: z.boolean(),
    setlistEnabled: z.boolean(),
    subscribersMustFollowSetlist: z.boolean(),
    autoGrantVipTokenToSubscribers: z.boolean(),
    duplicateWindowSeconds: z.number().int().min(0).max(86400),
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
  z.object({ action: z.literal("deleteItem"), itemId: z.string() }),
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
    title: z.string().min(1),
    authorId: z.number().optional(),
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
