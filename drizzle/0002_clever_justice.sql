ALTER TABLE `played_songs`
ADD COLUMN `request_kind` text NOT NULL DEFAULT 'regular';
