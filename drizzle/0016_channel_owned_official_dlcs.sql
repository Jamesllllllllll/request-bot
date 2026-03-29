CREATE TABLE channel_owned_official_dlcs (
  id text PRIMARY KEY NOT NULL,
  channel_id text NOT NULL REFERENCES channels(id),
  source_key text NOT NULL,
  source_app_id text,
  artist_name text NOT NULL,
  title text NOT NULL,
  album_name text,
  file_path text,
  arrangements_json text NOT NULL DEFAULT '[]',
  tunings_json text NOT NULL DEFAULT '[]',
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX channel_owned_official_dlcs_channel_idx
ON channel_owned_official_dlcs (channel_id);

CREATE UNIQUE INDEX channel_owned_official_dlcs_channel_source_uidx
ON channel_owned_official_dlcs (channel_id, source_key);

CREATE INDEX channel_owned_official_dlcs_artist_title_idx
ON channel_owned_official_dlcs (channel_id, artist_name, title);
