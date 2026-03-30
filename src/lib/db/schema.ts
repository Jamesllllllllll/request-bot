import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  twitchUserId: text("twitch_user_id").notNull().unique(),
  login: text("login").notNull(),
  displayName: text("display_name").notNull(),
  profileImageUrl: text("profile_image_url"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    twitchChannelId: text("twitch_channel_id").notNull().unique(),
    slug: text("slug").notNull().unique(),
    login: text("login").notNull(),
    displayName: text("display_name").notNull(),
    isLive: integer("is_live", { mode: "boolean" }).notNull().default(false),
    botEnabled: integer("bot_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    botReadyState: text("bot_ready_state").notNull().default("disconnected"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("channels_owner_idx").on(table.ownerUserId)]
);

export const channelSettings = sqliteTable("channel_settings", {
  channelId: text("channel_id")
    .primaryKey()
    .references(() => channels.id),
  botChannelEnabled: integer("bot_channel_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  adminForceBotWhileOffline: integer("admin_force_bot_while_offline", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  moderatorCanManageRequests: integer("moderator_can_manage_requests", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  moderatorCanManageBlacklist: integer("moderator_can_manage_blacklist", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  moderatorCanManageSetlist: integer("moderator_can_manage_setlist", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  moderatorCanManageBlockedChatters: integer(
    "moderator_can_manage_blocked_chatters",
    {
      mode: "boolean",
    }
  )
    .notNull()
    .default(false),
  moderatorCanViewVipTokens: integer("moderator_can_view_vip_tokens", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  moderatorCanManageVipTokens: integer("moderator_can_manage_vip_tokens", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  moderatorCanManageTags: integer("moderator_can_manage_tags", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  requestsEnabled: integer("requests_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  allowAnyoneToRequest: integer("allow_anyone_to_request", { mode: "boolean" })
    .notNull()
    .default(true),
  allowSubscribersToRequest: integer("allow_subscribers_to_request", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  allowVipsToRequest: integer("allow_vips_to_request", { mode: "boolean" })
    .notNull()
    .default(true),
  onlyOfficialDlc: integer("only_official_dlc", { mode: "boolean" })
    .notNull()
    .default(false),
  allowedTuningsJson: text("allowed_tunings_json").notNull().default("[]"),
  requiredPathsJson: text("required_paths_json").notNull().default("[]"),
  requiredPathsMatchMode: text("required_paths_match_mode")
    .notNull()
    .default("any"),
  maxQueueSize: integer("max_queue_size").notNull().default(250),
  maxViewerRequestsAtOnce: integer("max_viewer_requests_at_once")
    .notNull()
    .default(1),
  maxSubscriberRequestsAtOnce: integer("max_subscriber_requests_at_once")
    .notNull()
    .default(1),
  maxVipViewerRequestsAtOnce: integer("max_vip_viewer_requests_at_once")
    .notNull()
    .default(1),
  maxVipSubscriberRequestsAtOnce: integer("max_vip_subscriber_requests_at_once")
    .notNull()
    .default(1),
  limitRegularRequestsEnabled: integer("limit_regular_requests_enabled", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  regularRequestsPerPeriod: integer("regular_requests_per_period")
    .notNull()
    .default(1),
  regularRequestPeriodSeconds: integer("regular_request_period_seconds")
    .notNull()
    .default(0),
  limitVipRequestsEnabled: integer("limit_vip_requests_enabled", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  vipRequestsPerPeriod: integer("vip_requests_per_period").notNull().default(1),
  vipRequestPeriodSeconds: integer("vip_request_period_seconds")
    .notNull()
    .default(0),
  blacklistEnabled: integer("blacklist_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  letSetlistBypassBlacklist: integer("let_setlist_bypass_blacklist", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  setlistEnabled: integer("setlist_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  subscribersMustFollowSetlist: integer("subscribers_must_follow_setlist", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  autoGrantVipTokenToSubscribers: integer(
    "auto_grant_vip_token_to_subscribers",
    { mode: "boolean" }
  )
    .notNull()
    .default(false),
  autoGrantVipTokensForSharedSubRenewalMessage: integer(
    "auto_grant_vip_tokens_for_shared_sub_renewal_message",
    { mode: "boolean" }
  )
    .notNull()
    .default(false),
  autoGrantVipTokensToSubGifters: integer(
    "auto_grant_vip_tokens_to_sub_gifters",
    { mode: "boolean" }
  )
    .notNull()
    .default(false),
  autoGrantVipTokensToGiftRecipients: integer(
    "auto_grant_vip_tokens_to_gift_recipients",
    { mode: "boolean" }
  )
    .notNull()
    .default(false),
  autoGrantVipTokensForCheers: integer("auto_grant_vip_tokens_for_cheers", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  autoGrantVipTokensForRaiders: integer("auto_grant_vip_tokens_for_raiders", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  autoGrantVipTokensForStreamElementsTips: integer(
    "auto_grant_vip_tokens_for_streamelements_tips",
    {
      mode: "boolean",
    }
  )
    .notNull()
    .default(false),
  allowRequestPathModifiers: integer("allow_request_path_modifiers", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  cheerBitsPerVipToken: integer("cheer_bits_per_vip_token")
    .notNull()
    .default(200),
  cheerMinimumTokenPercent: integer("cheer_minimum_token_percent")
    .notNull()
    .default(25),
  raidMinimumViewerCount: integer("raid_minimum_viewer_count")
    .notNull()
    .default(1),
  streamElementsTipAmountPerVipToken: real(
    "streamelements_tip_amount_per_vip_token"
  )
    .notNull()
    .default(5),
  streamElementsTipWebhookToken: text("streamelements_tip_webhook_token")
    .notNull()
    .default(""),
  duplicateWindowSeconds: integer("duplicate_window_seconds")
    .notNull()
    .default(900),
  showPlaylistPositions: integer("show_playlist_positions", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  overlayAccessToken: text("overlay_access_token").notNull().default(""),
  overlayShowCreator: integer("overlay_show_creator", { mode: "boolean" })
    .notNull()
    .default(false),
  overlayShowAlbum: integer("overlay_show_album", { mode: "boolean" })
    .notNull()
    .default(false),
  overlayAnimateNowPlaying: integer("overlay_animate_now_playing", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  overlayAccentColor: text("overlay_accent_color").notNull().default("#cf7cff"),
  overlayVipColor: text("overlay_vip_color").notNull().default("#a855f7"),
  overlayTextColor: text("overlay_text_color").notNull().default("#f5f7fb"),
  overlayMutedTextColor: text("overlay_muted_text_color")
    .notNull()
    .default("#9aa4b2"),
  overlayPanelColor: text("overlay_panel_color").notNull().default("#0f1117"),
  overlayBackgroundColor: text("overlay_background_color")
    .notNull()
    .default("#05070d"),
  overlayBorderColor: text("overlay_border_color").notNull().default("#2a3140"),
  overlayBackgroundOpacity: integer("overlay_background_opacity")
    .notNull()
    .default(0),
  overlayCornerRadius: integer("overlay_corner_radius").notNull().default(22),
  overlayItemGap: integer("overlay_item_gap").notNull().default(12),
  overlayItemPadding: integer("overlay_item_padding").notNull().default(16),
  overlayTitleFontSize: integer("overlay_title_font_size")
    .notNull()
    .default(26),
  overlayMetaFontSize: integer("overlay_meta_font_size").notNull().default(14),
  commandPrefix: text("command_prefix").notNull().default("!sr"),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const channelOwnedOfficialDlcs = sqliteTable(
  "channel_owned_official_dlcs",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    sourceKey: text("source_key").notNull(),
    sourceAppId: text("source_app_id"),
    artistName: text("artist_name").notNull(),
    title: text("title").notNull(),
    albumName: text("album_name"),
    filePath: text("file_path"),
    arrangementsJson: text("arrangements_json").notNull().default("[]"),
    tuningsJson: text("tunings_json").notNull().default("[]"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("channel_owned_official_dlcs_channel_idx").on(table.channelId),
    uniqueIndex("channel_owned_official_dlcs_channel_source_uidx").on(
      table.channelId,
      table.sourceKey
    ),
    index("channel_owned_official_dlcs_artist_title_idx").on(
      table.channelId,
      table.artistName,
      table.title
    ),
  ]
);

export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .unique()
    .references(() => channels.id),
  currentItemId: text("current_item_id"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const playlistItems = sqliteTable(
  "playlist_items",
  {
    id: text("id").primaryKey(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    songId: text("song_id").notNull(),
    songTitle: text("song_title").notNull(),
    songArtist: text("song_artist"),
    songAlbum: text("song_album"),
    songCreator: text("song_creator"),
    songTuning: text("song_tuning"),
    songPartsJson: text("song_parts_json"),
    songDurationText: text("song_duration_text"),
    songCatalogSourceId: integer("song_catalog_source_id"),
    songSource: text("song_source").notNull(),
    songUrl: text("song_url"),
    requestedQuery: text("requested_query"),
    warningCode: text("warning_code"),
    warningMessage: text("warning_message"),
    candidateMatchesJson: text("candidate_matches_json"),
    status: text("status").notNull().default("queued"),
    requestedByTwitchUserId: text("requested_by_twitch_user_id"),
    requestedByLogin: text("requested_by_login"),
    requestedByDisplayName: text("requested_by_display_name"),
    requestMessageId: text("request_message_id"),
    requestKind: text("request_kind").notNull().default("regular"),
    position: integer("position").notNull(),
    regularPosition: integer("regular_position").notNull().default(1),
    editedAt: integer("edited_at"),
    playedAt: integer("played_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("playlist_items_playlist_position_uidx").on(
      table.playlistId,
      table.position
    ),
    uniqueIndex("playlist_items_playlist_regular_position_uidx").on(
      table.playlistId,
      table.regularPosition
    ),
    uniqueIndex("playlist_items_channel_message_uidx").on(
      table.channelId,
      table.requestMessageId
    ),
    index("playlist_items_channel_status_idx").on(
      table.channelId,
      table.status
    ),
  ]
);

export const blockedUsers = sqliteTable(
  "blocked_users",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    twitchUserId: text("twitch_user_id").notNull(),
    login: text("login"),
    displayName: text("display_name"),
    reason: text("reason"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.twitchUserId] })]
);

export const blacklistedArtists = sqliteTable(
  "blacklisted_artists",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    artistId: integer("artist_id").notNull(),
    artistName: text("artist_name").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.artistId] })]
);

export const blacklistedSongs = sqliteTable(
  "blacklisted_songs",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    songId: integer("song_id").notNull(),
    songTitle: text("song_title").notNull(),
    artistId: integer("artist_id"),
    artistName: text("artist_name"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.songId] })]
);

export const blacklistedSongGroups = sqliteTable(
  "blacklisted_song_groups",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    groupedProjectId: integer("grouped_project_id").notNull(),
    songTitle: text("song_title").notNull(),
    artistId: integer("artist_id"),
    artistName: text("artist_name"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.groupedProjectId] }),
  ]
);

export const blacklistedCharters = sqliteTable(
  "blacklisted_charters",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    charterId: integer("charter_id").notNull(),
    charterName: text("charter_name").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.charterId] })]
);

export const setlistArtists = sqliteTable(
  "setlist_artists",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    artistId: integer("artist_id").notNull(),
    artistName: text("artist_name").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.artistId] })]
);

export const vipTokens = sqliteTable(
  "vip_tokens",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    normalizedLogin: text("normalized_login").notNull(),
    twitchUserId: text("twitch_user_id"),
    login: text("login").notNull(),
    displayName: text("display_name"),
    availableCount: real("available_count").notNull().default(0),
    grantedCount: real("granted_count").notNull().default(0),
    consumedCount: real("consumed_count").notNull().default(0),
    autoSubscriberGranted: integer("auto_subscriber_granted", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    lastGrantedAt: integer("last_granted_at"),
    lastConsumedAt: integer("last_consumed_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.normalizedLogin] }),
    index("vip_tokens_channel_user_idx").on(
      table.channelId,
      table.twitchUserId
    ),
  ]
);

export const requestLogs = sqliteTable(
  "request_logs",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    twitchMessageId: text("twitch_message_id"),
    twitchUserId: text("twitch_user_id"),
    requesterLogin: text("requester_login"),
    requesterDisplayName: text("requester_display_name"),
    rawMessage: text("raw_message").notNull(),
    normalizedQuery: text("normalized_query"),
    matchedSongId: text("matched_song_id"),
    matchedSongTitle: text("matched_song_title"),
    matchedSongArtist: text("matched_song_artist"),
    outcome: text("outcome").notNull(),
    outcomeReason: text("outcome_reason"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("request_logs_channel_created_idx").on(
      table.channelId,
      table.createdAt
    ),
  ]
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    payloadJson: text("payload_json"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("audit_logs_channel_action_idx").on(
      table.channelId,
      table.action,
      table.createdAt
    ),
  ]
);

export const playedSongs = sqliteTable(
  "played_songs",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    playlistItemId: text("playlist_item_id"),
    songId: text("song_id").notNull(),
    songTitle: text("song_title").notNull(),
    songArtist: text("song_artist"),
    songAlbum: text("song_album"),
    songCreator: text("song_creator"),
    songTuning: text("song_tuning"),
    songPartsJson: text("song_parts_json"),
    songDurationText: text("song_duration_text"),
    songSource: text("song_source").notNull(),
    songCatalogSourceId: integer("song_catalog_source_id"),
    songUrl: text("song_url"),
    requestedByTwitchUserId: text("requested_by_twitch_user_id"),
    requestedByLogin: text("requested_by_login"),
    requestedByDisplayName: text("requested_by_display_name"),
    requestKind: text("request_kind").notNull().default("regular"),
    requestedAt: integer("requested_at"),
    playedAt: integer("played_at").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("played_songs_channel_played_idx").on(
      table.channelId,
      table.playedAt
    ),
  ]
);

export const twitchAuthorizations = sqliteTable(
  "twitch_authorizations",
  {
    id: text("id").primaryKey(),
    authorizationType: text("authorization_type")
      .notNull()
      .default("broadcaster"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    channelId: text("channel_id").references(() => channels.id),
    twitchUserId: text("twitch_user_id").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    scopes: text("scopes").notNull(),
    tokenType: text("token_type").notNull(),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("twitch_authorizations_type_user_uidx").on(
      table.authorizationType,
      table.twitchUserId
    ),
    index("twitch_authorizations_twitch_user_idx").on(table.twitchUserId),
    uniqueIndex("twitch_authorizations_user_channel_uidx").on(
      table.userId,
      table.channelId
    ),
  ]
);

export const eventSubSubscriptions = sqliteTable(
  "eventsub_subscriptions",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    subscriptionType: text("subscription_type").notNull(),
    twitchSubscriptionId: text("twitch_subscription_id").notNull().unique(),
    status: text("status").notNull().default("enabled"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastVerifiedAt: integer("last_verified_at"),
  },
  (table) => [
    uniqueIndex("eventsub_subscriptions_channel_type_uidx").on(
      table.channelId,
      table.subscriptionType
    ),
  ]
);

export const eventSubDeliveries = sqliteTable(
  "eventsub_deliveries",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    messageId: text("message_id").notNull(),
    subscriptionType: text("subscription_type").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.messageId] })]
);

export const catalogSongs = sqliteTable(
  "catalog_songs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull().default("library"),
    sourceSongId: integer("source_song_id").notNull(),
    artistId: integer("artist_id"),
    title: text("title").notNull(),
    artistName: text("artist_name").notNull(),
    albumName: text("album_name"),
    authorId: integer("author_id"),
    creatorName: text("creator_name"),
    groupedProjectId: integer("grouped_project_id"),
    artistsFtJson: text("artists_ft_json"),
    tagsJson: text("tags_json"),
    genresJson: text("genres_json"),
    subgenresJson: text("subgenres_json"),
    genreName: text("genre_name"),
    subgenreName: text("subgenre_name"),
    tuningSummary: text("tuning_summary"),
    leadTuningId: integer("lead_tuning_id"),
    leadTuningName: text("lead_tuning_name"),
    rhythmTuningId: integer("rhythm_tuning_id"),
    rhythmTuningName: text("rhythm_tuning_name"),
    bassTuningId: integer("bass_tuning_id"),
    bassTuningName: text("bass_tuning_name"),
    altLeadTuningId: integer("alt_lead_tuning_id"),
    altRhythmTuningId: integer("alt_rhythm_tuning_id"),
    altBassTuningId: integer("alt_bass_tuning_id"),
    bonusLeadTuningId: integer("bonus_lead_tuning_id"),
    bonusRhythmTuningId: integer("bonus_rhythm_tuning_id"),
    bonusBassTuningId: integer("bonus_bass_tuning_id"),
    partsJson: text("parts_json").notNull().default("[]"),
    platformsJson: text("platforms_json"),
    durationText: text("duration_text"),
    durationSeconds: integer("duration_seconds"),
    year: integer("year"),
    versionText: text("version_text"),
    downloads: integer("downloads").notNull().default(0),
    views: integer("views").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    reportsCount: integer("reports_count").notNull().default(0),
    collectedCount: integer("collected_count").notNull().default(0),
    hasLyrics: integer("has_lyrics", { mode: "boolean" })
      .notNull()
      .default(false),
    hasLead: integer("has_lead", { mode: "boolean" }).notNull().default(false),
    hasRhythm: integer("has_rhythm", { mode: "boolean" })
      .notNull()
      .default(false),
    hasBass: integer("has_bass", { mode: "boolean" }).notNull().default(false),
    hasVocals: integer("has_vocals", { mode: "boolean" })
      .notNull()
      .default(false),
    hasBonusArrangements: integer("has_bonus_arrangements", { mode: "boolean" })
      .notNull()
      .default(false),
    hasAlternateArrangements: integer("has_alternate_arrangements", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    isDisabled: integer("is_disabled", { mode: "boolean" })
      .notNull()
      .default(false),
    isAbandoned: integer("is_abandoned", { mode: "boolean" })
      .notNull()
      .default(false),
    isTrending: integer("is_trending", { mode: "boolean" })
      .notNull()
      .default(false),
    filePcAvailable: integer("file_pc_available", { mode: "boolean" })
      .notNull()
      .default(false),
    fileMacAvailable: integer("file_mac_available", { mode: "boolean" })
      .notNull()
      .default(false),
    albumArtUrl: text("album_art_url"),
    sourceCreatedAt: integer("source_created_at"),
    sourceUpdatedAt: integer("source_updated_at"),
    firstSeenAt: integer("first_seen_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastSeenAt: integer("last_seen_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("catalog_songs_source_song_uidx").on(
      table.source,
      table.sourceSongId
    ),
    index("catalog_songs_artist_id_idx").on(table.artistId),
    index("catalog_songs_author_id_idx").on(table.authorId),
    index("catalog_songs_artist_title_idx").on(table.artistName, table.title),
    index("catalog_songs_creator_idx").on(table.creatorName),
    index("catalog_songs_source_updated_idx").on(table.sourceUpdatedAt),
    index("catalog_songs_downloads_idx").on(table.downloads),
  ]
);

export const searchCache = sqliteTable("search_cache", {
  cacheKey: text("cache_key").primaryKey(),
  responseJson: text("response_json").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  lastAccessedAt: integer("last_accessed_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const searchRateLimits = sqliteTable("search_rate_limits", {
  rateLimitKey: text("rate_limit_key").primaryKey(),
  requestCount: integer("request_count").notNull().default(0),
  windowStartedAt: integer("window_started_at").notNull(),
  cooldownUntil: integer("cooldown_until"),
  violationCount: integer("violation_count").notNull().default(0),
  lastSeenAt: integer("last_seen_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type UserInsert = typeof users.$inferInsert;
export type ChannelInsert = typeof channels.$inferInsert;
export type ChannelSettingsInsert = typeof channelSettings.$inferInsert;
export type ChannelOwnedOfficialDlcInsert =
  typeof channelOwnedOfficialDlcs.$inferInsert;
export type PlaylistInsert = typeof playlists.$inferInsert;
export type PlaylistItemInsert = typeof playlistItems.$inferInsert;
export type BlockedUserInsert = typeof blockedUsers.$inferInsert;
export type BlacklistedArtistInsert = typeof blacklistedArtists.$inferInsert;
export type BlacklistedSongInsert = typeof blacklistedSongs.$inferInsert;
export type BlacklistedSongGroupInsert =
  typeof blacklistedSongGroups.$inferInsert;
export type BlacklistedCharterInsert = typeof blacklistedCharters.$inferInsert;
export type SetlistArtistInsert = typeof setlistArtists.$inferInsert;
export type VipTokenInsert = typeof vipTokens.$inferInsert;
export type RequestLogInsert = typeof requestLogs.$inferInsert;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
export type PlayedSongInsert = typeof playedSongs.$inferInsert;
export type TwitchAuthorizationInsert =
  typeof twitchAuthorizations.$inferInsert;
export type EventSubSubscriptionInsert =
  typeof eventSubSubscriptions.$inferInsert;
export type EventSubDeliveryInsert = typeof eventSubDeliveries.$inferInsert;
export type CatalogSongInsert = typeof catalogSongs.$inferInsert;
export type SearchCacheInsert = typeof searchCache.$inferInsert;
