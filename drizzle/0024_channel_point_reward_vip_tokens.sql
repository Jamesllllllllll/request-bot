ALTER TABLE `channel_settings`
ADD `auto_grant_vip_tokens_for_channel_point_rewards` integer DEFAULT false NOT NULL;

ALTER TABLE `channel_settings`
ADD `channel_point_reward_cost` integer DEFAULT 1000 NOT NULL;

ALTER TABLE `channel_settings`
ADD `twitch_channel_point_reward_id` text DEFAULT '' NOT NULL;
