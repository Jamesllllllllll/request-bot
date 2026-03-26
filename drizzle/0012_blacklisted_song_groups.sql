CREATE TABLE IF NOT EXISTS `blacklisted_song_groups` (
  `channel_id` text NOT NULL,
  `grouped_project_id` integer NOT NULL,
  `song_title` text NOT NULL,
  `artist_id` integer,
  `artist_name` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  PRIMARY KEY(`channel_id`, `grouped_project_id`),
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
