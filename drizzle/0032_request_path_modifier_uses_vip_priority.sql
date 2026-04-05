ALTER TABLE channel_settings
ADD COLUMN request_path_modifier_uses_vip_priority INTEGER NOT NULL DEFAULT 1;
