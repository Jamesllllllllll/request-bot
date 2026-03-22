ALTER TABLE `channel_settings`
ADD `auto_grant_vip_tokens_to_sub_gifters` integer DEFAULT false NOT NULL;

ALTER TABLE `channel_settings`
ADD `auto_grant_vip_tokens_to_gift_recipients` integer DEFAULT false NOT NULL;

ALTER TABLE `channel_settings`
ADD `auto_grant_vip_tokens_for_cheers` integer DEFAULT false NOT NULL;

ALTER TABLE `channel_settings`
ADD `cheer_bits_per_vip_token` integer DEFAULT 200 NOT NULL;

ALTER TABLE `channel_settings`
ADD `cheer_minimum_token_percent` integer DEFAULT 25 NOT NULL;

CREATE TABLE IF NOT EXISTS `eventsub_deliveries` (
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`subscription_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`channel_id`, `message_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
