CREATE TABLE `channel_favorite_charts` (
	`channel_id` text NOT NULL,
	`catalog_song_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `catalog_song_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `channel_favorite_charts_channel_created_idx` ON `channel_favorite_charts` (`channel_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `channel_favorite_charts_song_idx` ON `channel_favorite_charts` (`catalog_song_id`);
