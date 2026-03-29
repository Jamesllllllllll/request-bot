ALTER TABLE `channel_settings`
ADD `auto_grant_vip_tokens_for_streamelements_tips` integer DEFAULT false NOT NULL;

ALTER TABLE `channel_settings`
ADD `streamelements_tip_amount_per_vip_token` real DEFAULT 5 NOT NULL;

ALTER TABLE `channel_settings`
ADD `streamelements_tip_webhook_token` text DEFAULT '' NOT NULL;
