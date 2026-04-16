ALTER TABLE `catalog_songs`
  ADD COLUMN `canonical_group_key` text;

ALTER TABLE `catalog_songs`
  ADD COLUMN `canonical_grouping_source` text;

CREATE INDEX `catalog_songs_canonical_group_idx`
  ON `catalog_songs` (`canonical_group_key`);

CREATE INDEX `catalog_songs_canonical_group_source_idx`
  ON `catalog_songs` (`canonical_grouping_source`);
