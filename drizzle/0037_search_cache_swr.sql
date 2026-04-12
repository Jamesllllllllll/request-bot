ALTER TABLE search_cache
ADD COLUMN version_token text NOT NULL DEFAULT '';

ALTER TABLE search_cache
ADD COLUMN fresh_until integer NOT NULL DEFAULT 0;

ALTER TABLE search_cache
ADD COLUMN stale_until integer NOT NULL DEFAULT 0;

ALTER TABLE search_cache
ADD COLUMN revalidating_at integer;

UPDATE search_cache
SET
  fresh_until = expires_at,
  stale_until = expires_at;
