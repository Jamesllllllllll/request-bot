DROP TRIGGER IF EXISTS `catalog_song_fts_delete`;

CREATE TRIGGER `catalog_song_fts_delete` AFTER DELETE ON `catalog_songs` BEGIN
  DELETE FROM `catalog_song_fts` WHERE rowid = old.rowid;
END;

DROP TRIGGER IF EXISTS `catalog_song_fts_update`;

CREATE TRIGGER `catalog_song_fts_update` AFTER UPDATE ON `catalog_songs` BEGIN
  DELETE FROM `catalog_song_fts` WHERE rowid = old.rowid;
  INSERT INTO `catalog_song_fts` (
    rowid,
    song_id,
    title,
    artist_name,
    album_name,
    creator_name,
    genre_name,
    subgenre_name,
    tuning_summary,
    parts_summary,
    artists_ft
  ) VALUES (
    new.rowid,
    new.id,
    new.title,
    new.artist_name,
    coalesce(new.album_name, ''),
    coalesce(new.creator_name, ''),
    coalesce(new.genre_name, ''),
    coalesce(new.subgenre_name, ''),
    coalesce(new.tuning_summary, ''),
    coalesce(new.parts_json, '[]'),
    coalesce(new.artists_ft_json, '[]')
  );
END;
