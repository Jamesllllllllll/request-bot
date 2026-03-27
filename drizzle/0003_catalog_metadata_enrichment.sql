-- Custom SQL migration file, put your code below! --
ALTER TABLE `catalog_songs`
ADD COLUMN `artist_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `author_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `grouped_project_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `tags_json` text;

ALTER TABLE `catalog_songs`
ADD COLUMN `genres_json` text;

ALTER TABLE `catalog_songs`
ADD COLUMN `subgenres_json` text;

ALTER TABLE `catalog_songs`
ADD COLUMN `lead_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `rhythm_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `bass_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `alt_lead_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `alt_rhythm_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `alt_bass_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `bonus_lead_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `bonus_rhythm_tuning_id` integer;

ALTER TABLE `catalog_songs`
ADD COLUMN `bonus_bass_tuning_id` integer;

CREATE INDEX `catalog_songs_artist_id_idx` ON `catalog_songs` (`artist_id`);
CREATE INDEX `catalog_songs_author_id_idx` ON `catalog_songs` (`author_id`);
