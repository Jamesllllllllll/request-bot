ALTER TABLE `channel_settings`
ADD `auto_grant_vip_tokens_for_raiders` integer DEFAULT false NOT NULL;

ALTER TABLE `channel_settings`
ADD `raid_minimum_viewer_count` integer DEFAULT 1 NOT NULL;
