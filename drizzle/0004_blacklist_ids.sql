-- Replace legacy text-based blacklist tables with exact ID-based tables.
-- Existing text matches are not migrated because they are ambiguous by design.

ALTER TABLE `blacklisted_artists` RENAME TO `blacklisted_artists_legacy`;

CREATE TABLE `blacklisted_artists` (
  `channel_id` text NOT NULL,
  `artist_id` integer NOT NULL,
  `artist_name` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY(`channel_id`, `artist_id`),
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);

DROP TABLE `blacklisted_artists_legacy`;

ALTER TABLE `blacklisted_songs` RENAME TO `blacklisted_songs_legacy`;

CREATE TABLE `blacklisted_songs` (
  `channel_id` text NOT NULL,
  `song_id` integer NOT NULL,
  `song_title` text NOT NULL,
  `artist_id` integer,
  `artist_name` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY(`channel_id`, `song_id`),
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);

DROP TABLE `blacklisted_songs_legacy`;
