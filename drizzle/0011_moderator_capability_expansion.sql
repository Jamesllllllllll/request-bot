ALTER TABLE `channel_settings`
ADD `moderator_can_manage_blocked_chatters` integer DEFAULT false NOT NULL;

ALTER TABLE `channel_settings`
ADD `moderator_can_view_vip_tokens` integer DEFAULT false NOT NULL;
