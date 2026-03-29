ALTER TABLE playlist_items
ADD COLUMN regular_position integer NOT NULL DEFAULT 1;

UPDATE playlist_items
SET regular_position = position;

CREATE UNIQUE INDEX playlist_items_playlist_regular_position_uidx
ON playlist_items (playlist_id, regular_position);
