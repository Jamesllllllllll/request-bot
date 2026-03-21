ALTER TABLE channel_settings
ADD COLUMN required_paths_match_mode text NOT NULL DEFAULT 'any';
