DROP TABLE IF EXISTS setlist_artists;

CREATE TABLE setlist_artists (
  channel_id text NOT NULL REFERENCES channels(id),
  artist_id integer NOT NULL,
  artist_name text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (channel_id, artist_id)
);
