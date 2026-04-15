CREATE INDEX `catalog_songs_grouped_project_idx` ON `catalog_songs` (`grouped_project_id`);
CREATE INDEX `catalog_songs_grouping_fallback_idx` ON `catalog_songs` (
	CASE
		WHEN trim(lower(coalesce(`artist_name`, ''))) LIKE 'the %'
			THEN substr(trim(lower(coalesce(`artist_name`, ''))), 5)
		ELSE trim(lower(coalesce(`artist_name`, '')))
	END,
	trim(lower(coalesce(`title`, '')))
);
