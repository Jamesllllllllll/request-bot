CREATE TABLE `channel_chatter_activity` (
	`channel_id` text NOT NULL,
	`twitch_user_id` text NOT NULL,
	`login` text NOT NULL,
	`display_name` text NOT NULL,
	`last_chat_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `twitch_user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `channel_chatter_activity_channel_last_chat_idx` ON `channel_chatter_activity` (`channel_id`,`last_chat_at`);
CREATE INDEX `channel_chatter_activity_channel_login_idx` ON `channel_chatter_activity` (`channel_id`,`login`);
