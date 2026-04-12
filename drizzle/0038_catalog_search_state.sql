CREATE TABLE catalog_search_state (
  scope text PRIMARY KEY NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_at integer NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO catalog_search_state (scope, version, updated_at)
VALUES ('catalog', 0, unixepoch() * 1000)
ON CONFLICT(scope) DO NOTHING;
