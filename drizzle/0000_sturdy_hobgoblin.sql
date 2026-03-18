CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`actor_user_id` text,
	`actor_type` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_channel_action_idx` ON `audit_logs` (`channel_id`,`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `blacklisted_artists` (
	`channel_id` text NOT NULL,
	`artist_name` text NOT NULL,
	`normalized_artist_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `normalized_artist_name`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `blacklisted_songs` (
	`channel_id` text NOT NULL,
	`song_title` text NOT NULL,
	`normalized_song_title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `normalized_song_title`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `blocked_users` (
	`channel_id` text NOT NULL,
	`twitch_user_id` text NOT NULL,
	`login` text,
	`display_name` text,
	`reason` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `twitch_user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'library' NOT NULL,
	`source_song_id` integer NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`artist_name` text NOT NULL,
	`album_name` text,
	`creator_name` text,
	`artists_ft_json` text,
	`genre_name` text,
	`subgenre_name` text,
	`tuning_summary` text,
	`lead_tuning_name` text,
	`rhythm_tuning_name` text,
	`bass_tuning_name` text,
	`parts_json` text DEFAULT '[]' NOT NULL,
	`platforms_json` text,
	`duration_text` text,
	`duration_seconds` integer,
	`year` integer,
	`version_text` text,
	`downloads` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`comments_count` integer DEFAULT 0 NOT NULL,
	`reports_count` integer DEFAULT 0 NOT NULL,
	`collected_count` integer DEFAULT 0 NOT NULL,
	`has_lyrics` integer DEFAULT false NOT NULL,
	`has_lead` integer DEFAULT false NOT NULL,
	`has_rhythm` integer DEFAULT false NOT NULL,
	`has_bass` integer DEFAULT false NOT NULL,
	`has_vocals` integer DEFAULT false NOT NULL,
	`has_bonus_arrangements` integer DEFAULT false NOT NULL,
	`has_alternate_arrangements` integer DEFAULT false NOT NULL,
	`is_disabled` integer DEFAULT false NOT NULL,
	`is_abandoned` integer DEFAULT false NOT NULL,
	`is_trending` integer DEFAULT false NOT NULL,
	`file_pc_available` integer DEFAULT false NOT NULL,
	`file_mac_available` integer DEFAULT false NOT NULL,
	`album_art_url` text,
	`source_created_at` integer,
	`source_updated_at` integer,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_songs_source_song_uidx` ON `catalog_songs` (`source`,`source_song_id`);--> statement-breakpoint
CREATE INDEX `catalog_songs_artist_title_idx` ON `catalog_songs` (`artist_name`,`title`);--> statement-breakpoint
CREATE INDEX `catalog_songs_creator_idx` ON `catalog_songs` (`creator_name`);--> statement-breakpoint
CREATE INDEX `catalog_songs_source_updated_idx` ON `catalog_songs` (`source_updated_at`);--> statement-breakpoint
CREATE INDEX `catalog_songs_downloads_idx` ON `catalog_songs` (`downloads`);--> statement-breakpoint
CREATE TABLE `channel_settings` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`bot_channel_enabled` integer DEFAULT false NOT NULL,
	`admin_force_bot_while_offline` integer DEFAULT false NOT NULL,
	`moderator_can_manage_requests` integer DEFAULT false NOT NULL,
	`moderator_can_manage_blacklist` integer DEFAULT false NOT NULL,
	`moderator_can_manage_setlist` integer DEFAULT false NOT NULL,
	`moderator_can_manage_vip_tokens` integer DEFAULT false NOT NULL,
	`moderator_can_manage_tags` integer DEFAULT false NOT NULL,
	`requests_enabled` integer DEFAULT true NOT NULL,
	`allow_anyone_to_request` integer DEFAULT true NOT NULL,
	`allow_subscribers_to_request` integer DEFAULT true NOT NULL,
	`allow_vips_to_request` integer DEFAULT true NOT NULL,
	`only_official_dlc` integer DEFAULT false NOT NULL,
	`allowed_tunings_json` text DEFAULT '[]' NOT NULL,
	`required_paths_json` text DEFAULT '[]' NOT NULL,
	`max_queue_size` integer DEFAULT 250 NOT NULL,
	`max_viewer_requests_at_once` integer DEFAULT 1 NOT NULL,
	`max_subscriber_requests_at_once` integer DEFAULT 1 NOT NULL,
	`max_vip_viewer_requests_at_once` integer DEFAULT 1 NOT NULL,
	`max_vip_subscriber_requests_at_once` integer DEFAULT 1 NOT NULL,
	`limit_regular_requests_enabled` integer DEFAULT false NOT NULL,
	`regular_requests_per_period` integer DEFAULT 1 NOT NULL,
	`regular_request_period_seconds` integer DEFAULT 0 NOT NULL,
	`limit_vip_requests_enabled` integer DEFAULT false NOT NULL,
	`vip_requests_per_period` integer DEFAULT 1 NOT NULL,
	`vip_request_period_seconds` integer DEFAULT 0 NOT NULL,
	`blacklist_enabled` integer DEFAULT false NOT NULL,
	`let_setlist_bypass_blacklist` integer DEFAULT false NOT NULL,
	`setlist_enabled` integer DEFAULT false NOT NULL,
	`subscribers_must_follow_setlist` integer DEFAULT false NOT NULL,
	`auto_grant_vip_token_to_subscribers` integer DEFAULT false NOT NULL,
	`duplicate_window_seconds` integer DEFAULT 900 NOT NULL,
	`public_playlist_enabled` integer DEFAULT true NOT NULL,
	`overlay_access_token` text DEFAULT '' NOT NULL,
	`overlay_show_creator` integer DEFAULT false NOT NULL,
	`overlay_show_album` integer DEFAULT false NOT NULL,
	`overlay_animate_now_playing` integer DEFAULT true NOT NULL,
	`overlay_accent_color` text DEFAULT '#cf7cff' NOT NULL,
	`overlay_vip_color` text DEFAULT '#a855f7' NOT NULL,
	`overlay_text_color` text DEFAULT '#f5f7fb' NOT NULL,
	`overlay_muted_text_color` text DEFAULT '#9aa4b2' NOT NULL,
	`overlay_panel_color` text DEFAULT '#0f1117' NOT NULL,
	`overlay_background_color` text DEFAULT '#05070d' NOT NULL,
	`overlay_border_color` text DEFAULT '#2a3140' NOT NULL,
	`overlay_background_opacity` integer DEFAULT 0 NOT NULL,
	`overlay_corner_radius` integer DEFAULT 22 NOT NULL,
	`overlay_item_gap` integer DEFAULT 12 NOT NULL,
	`overlay_item_padding` integer DEFAULT 16 NOT NULL,
	`overlay_title_font_size` integer DEFAULT 26 NOT NULL,
	`overlay_meta_font_size` integer DEFAULT 14 NOT NULL,
	`command_prefix` text DEFAULT '!sr' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`twitch_channel_id` text NOT NULL,
	`slug` text NOT NULL,
	`login` text NOT NULL,
	`display_name` text NOT NULL,
	`is_live` integer DEFAULT false NOT NULL,
	`bot_enabled` integer DEFAULT false NOT NULL,
	`bot_ready_state` text DEFAULT 'disconnected' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_twitch_channel_id_unique` ON `channels` (`twitch_channel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_slug_unique` ON `channels` (`slug`);--> statement-breakpoint
CREATE INDEX `channels_owner_idx` ON `channels` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `eventsub_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`subscription_type` text NOT NULL,
	`twitch_subscription_id` text NOT NULL,
	`status` text DEFAULT 'enabled' NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_verified_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eventsub_subscriptions_twitch_subscription_id_unique` ON `eventsub_subscriptions` (`twitch_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `eventsub_subscriptions_channel_type_uidx` ON `eventsub_subscriptions` (`channel_id`,`subscription_type`);--> statement-breakpoint
CREATE TABLE `played_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`playlist_item_id` text,
	`song_id` text NOT NULL,
	`song_title` text NOT NULL,
	`song_artist` text,
	`song_album` text,
	`song_creator` text,
	`song_tuning` text,
	`song_parts_json` text,
	`song_duration_text` text,
	`song_source` text NOT NULL,
	`song_catalog_source_id` integer,
	`song_url` text,
	`requested_by_twitch_user_id` text,
	`requested_by_login` text,
	`requested_by_display_name` text,
	`requested_at` integer,
	`played_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `played_songs_channel_played_idx` ON `played_songs` (`channel_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `playlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`song_id` text NOT NULL,
	`song_title` text NOT NULL,
	`song_artist` text,
	`song_album` text,
	`song_creator` text,
	`song_tuning` text,
	`song_parts_json` text,
	`song_duration_text` text,
	`song_catalog_source_id` integer,
	`song_source` text NOT NULL,
	`song_url` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`requested_by_twitch_user_id` text,
	`requested_by_login` text,
	`requested_by_display_name` text,
	`request_message_id` text,
	`requested_query` text,
	`request_kind` text DEFAULT 'regular' NOT NULL,
	`warning_code` text,
	`warning_message` text,
	`candidate_matches_json` text,
	`position` integer NOT NULL,
	`played_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_items_playlist_position_uidx` ON `playlist_items` (`playlist_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_items_channel_message_uidx` ON `playlist_items` (`channel_id`,`request_message_id`);--> statement-breakpoint
CREATE INDEX `playlist_items_channel_status_idx` ON `playlist_items` (`channel_id`,`status`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`current_item_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlists_channel_id_unique` ON `playlists` (`channel_id`);--> statement-breakpoint
CREATE TABLE `request_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`twitch_message_id` text,
	`twitch_user_id` text,
	`requester_login` text,
	`requester_display_name` text,
	`raw_message` text NOT NULL,
	`normalized_query` text,
	`matched_song_id` text,
	`matched_song_title` text,
	`matched_song_artist` text,
	`outcome` text NOT NULL,
	`outcome_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `request_logs_channel_created_idx` ON `request_logs` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `search_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`response_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_accessed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_rate_limits` (
	`rate_limit_key` text PRIMARY KEY NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL,
	`cooldown_until` integer,
	`violation_count` integer DEFAULT 0 NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setlist_artists` (
	`channel_id` text NOT NULL,
	`artist_name` text NOT NULL,
	`normalized_artist_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `normalized_artist_name`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `twitch_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`authorization_type` text DEFAULT 'broadcaster' NOT NULL,
	`user_id` text NOT NULL,
	`channel_id` text,
	`twitch_user_id` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`refresh_token_encrypted` text,
	`scopes` text NOT NULL,
	`token_type` text NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `twitch_authorizations_type_user_uidx` ON `twitch_authorizations` (`authorization_type`,`twitch_user_id`);--> statement-breakpoint
CREATE INDEX `twitch_authorizations_twitch_user_idx` ON `twitch_authorizations` (`twitch_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `twitch_authorizations_user_channel_uidx` ON `twitch_authorizations` (`user_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`twitch_user_id` text NOT NULL,
	`login` text NOT NULL,
	`display_name` text NOT NULL,
	`profile_image_url` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_twitch_user_id_unique` ON `users` (`twitch_user_id`);--> statement-breakpoint
CREATE TABLE `vip_tokens` (
	`channel_id` text NOT NULL,
	`normalized_login` text NOT NULL,
	`twitch_user_id` text,
	`login` text NOT NULL,
	`display_name` text,
	`available_count` integer DEFAULT 0 NOT NULL,
	`granted_count` integer DEFAULT 0 NOT NULL,
	`consumed_count` integer DEFAULT 0 NOT NULL,
	`auto_subscriber_granted` integer DEFAULT false NOT NULL,
	`last_granted_at` integer,
	`last_consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `normalized_login`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vip_tokens_channel_user_idx` ON `vip_tokens` (`channel_id`,`twitch_user_id`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `catalog_song_fts` USING fts5(
	`song_id` UNINDEXED,
	`title`,
	`artist_name`,
	`album_name`,
	`creator_name`,
	`genre_name`,
	`subgenre_name`,
	`tuning_summary`,
	`parts_summary`,
	`artists_ft`,
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `catalog_song_fts_insert` AFTER INSERT ON `catalog_songs` BEGIN
  INSERT INTO catalog_song_fts (
    rowid,
    song_id,
    title,
    artist_name,
    album_name,
    creator_name,
    genre_name,
    subgenre_name,
    tuning_summary,
    parts_summary,
    artists_ft
  ) VALUES (
    new.rowid,
    new.id,
    new.title,
    new.artist_name,
    coalesce(new.album_name, ''),
    coalesce(new.creator_name, ''),
    coalesce(new.genre_name, ''),
    coalesce(new.subgenre_name, ''),
    coalesce(new.tuning_summary, ''),
    coalesce(new.parts_json, '[]'),
    coalesce(new.artists_ft_json, '[]')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `catalog_song_fts_delete` AFTER DELETE ON `catalog_songs` BEGIN
  INSERT INTO catalog_song_fts(catalog_song_fts, rowid, song_id, title, artist_name, album_name, creator_name, genre_name, subgenre_name, tuning_summary, parts_summary, artists_ft)
  VALUES('delete', old.rowid, old.id, old.title, old.artist_name, coalesce(old.album_name, ''), coalesce(old.creator_name, ''), coalesce(old.genre_name, ''), coalesce(old.subgenre_name, ''), coalesce(old.tuning_summary, ''), coalesce(old.parts_json, '[]'), coalesce(old.artists_ft_json, '[]'));
END;
--> statement-breakpoint
CREATE TRIGGER `catalog_song_fts_update` AFTER UPDATE ON `catalog_songs` BEGIN
  INSERT INTO catalog_song_fts(catalog_song_fts, rowid, song_id, title, artist_name, album_name, creator_name, genre_name, subgenre_name, tuning_summary, parts_summary, artists_ft)
  VALUES('delete', old.rowid, old.id, old.title, old.artist_name, coalesce(old.album_name, ''), coalesce(old.creator_name, ''), coalesce(old.genre_name, ''), coalesce(old.subgenre_name, ''), coalesce(old.tuning_summary, ''), coalesce(old.parts_json, '[]'), coalesce(old.artists_ft_json, '[]'));
  INSERT INTO catalog_song_fts (
    rowid,
    song_id,
    title,
    artist_name,
    album_name,
    creator_name,
    genre_name,
    subgenre_name,
    tuning_summary,
    parts_summary,
    artists_ft
  ) VALUES (
    new.rowid,
    new.id,
    new.title,
    new.artist_name,
    coalesce(new.album_name, ''),
    coalesce(new.creator_name, ''),
    coalesce(new.genre_name, ''),
    coalesce(new.subgenre_name, ''),
    coalesce(new.tuning_summary, ''),
    coalesce(new.parts_json, '[]'),
    coalesce(new.artists_ft_json, '[]')
  );
END;
