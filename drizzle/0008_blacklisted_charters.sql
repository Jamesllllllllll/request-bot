CREATE TABLE IF NOT EXISTS `blacklisted_charters` (
	`channel_id` text NOT NULL,
	`charter_id` integer NOT NULL,
	`charter_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `charter_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
