PRAGMA foreign_keys=OFF;

CREATE TABLE `__new_vip_tokens` (
	`channel_id` text NOT NULL,
	`normalized_login` text NOT NULL,
	`twitch_user_id` text,
	`login` text NOT NULL,
	`display_name` text,
	`available_count` real DEFAULT 0 NOT NULL,
	`granted_count` real DEFAULT 0 NOT NULL,
	`consumed_count` real DEFAULT 0 NOT NULL,
	`auto_subscriber_granted` integer DEFAULT false NOT NULL,
	`last_granted_at` integer,
	`last_consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `normalized_login`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);

INSERT INTO `__new_vip_tokens` (
	`channel_id`,
	`normalized_login`,
	`twitch_user_id`,
	`login`,
	`display_name`,
	`available_count`,
	`granted_count`,
	`consumed_count`,
	`auto_subscriber_granted`,
	`last_granted_at`,
	`last_consumed_at`,
	`created_at`,
	`updated_at`
)
SELECT
	`channel_id`,
	`normalized_login`,
	`twitch_user_id`,
	`login`,
	`display_name`,
	`available_count`,
	`granted_count`,
	`consumed_count`,
	`auto_subscriber_granted`,
	`last_granted_at`,
	`last_consumed_at`,
	`created_at`,
	`updated_at`
FROM `vip_tokens`;

DROP TABLE `vip_tokens`;

ALTER TABLE `__new_vip_tokens` RENAME TO `vip_tokens`;

CREATE INDEX `vip_tokens_channel_user_idx` ON `vip_tokens` (`channel_id`,`twitch_user_id`);

PRAGMA foreign_keys=ON;
