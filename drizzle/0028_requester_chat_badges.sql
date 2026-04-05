ALTER TABLE playlist_items
ADD COLUMN requester_chat_badges_json text;

ALTER TABLE played_songs
ADD COLUMN requester_chat_badges_json text;
