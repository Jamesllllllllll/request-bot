ALTER TABLE channel_settings
ADD COLUMN allowed_request_paths_json TEXT NOT NULL DEFAULT '[]';

UPDATE channel_settings
SET allowed_request_paths_json = '["lead","rhythm","bass"]'
WHERE allow_request_path_modifiers = 1
  AND allowed_request_paths_json = '[]';
