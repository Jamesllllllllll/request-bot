ALTER TABLE `channel_settings`
ADD `vip_request_cooldown_enabled` integer DEFAULT 0 NOT NULL;

ALTER TABLE `channel_settings`
ADD `vip_request_cooldown_minutes` integer DEFAULT 0 NOT NULL;

CREATE TABLE `vip_request_cooldowns` (
  `channel_id` text NOT NULL,
  `normalized_login` text NOT NULL,
  `twitch_user_id` text,
  `login` text NOT NULL,
  `display_name` text,
  `source_item_id` text NOT NULL,
  `cooldown_started_at` integer NOT NULL,
  `cooldown_expires_at` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  PRIMARY KEY(`channel_id`, `normalized_login`),
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `vip_request_cooldowns_channel_user_idx`
ON `vip_request_cooldowns` (`channel_id`, `twitch_user_id`);

CREATE INDEX `vip_request_cooldowns_channel_source_idx`
ON `vip_request_cooldowns` (`channel_id`, `source_item_id`);
