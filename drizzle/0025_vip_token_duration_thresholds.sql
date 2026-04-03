ALTER TABLE `channel_settings`
ADD `vip_token_duration_thresholds_json` text DEFAULT '[]' NOT NULL;

ALTER TABLE `playlist_items`
ADD `vip_token_cost` integer DEFAULT 0 NOT NULL;

UPDATE `playlist_items`
SET `vip_token_cost` = CASE
  WHEN `request_kind` = 'vip' THEN 1
  ELSE 0
END;

ALTER TABLE `played_songs`
ADD `vip_token_cost` integer DEFAULT 0 NOT NULL;

UPDATE `played_songs`
SET `vip_token_cost` = CASE
  WHEN `request_kind` = 'vip' THEN 1
  ELSE 0
END;
