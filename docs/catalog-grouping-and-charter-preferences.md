# Catalog Grouping And Charter Preferences

## Version Grouping

RockList.Live uses the catalog metadata from CustomsForge as the primary source of chart version grouping.

When `grouped_project_id` is present on catalog rows, the app treats those charts as alternate versions of the same song for:

- playlist version selection
- song-group blacklists
- channel-scoped version handling in requests and management tools

Some catalog rows are not grouped upstream even though they are effectively alternate charts of the same song. In that case, RockList.Live uses a fallback grouping rule when it builds the version list for a playlist item:

- same title
- same normalized artist name

Artist normalization is intentionally conservative. It currently:

- trims whitespace
- lowercases the name
- strips a leading `The `

That fallback is used when a viewer or manager adds a song and the app needs to preserve alternate chart versions on the resulting playlist item. It helps cases like `The Smashing Pumpkins` and `Smashing Pumpkins` when the upstream catalog does not provide a shared `grouped_project_id`.

Search results still render chart-level rows. The app does not persist a separate internal canonical grouping table yet, so fallback grouping is computed at request and add time rather than stored as new catalog metadata.

## Preferred Charters

Each channel can keep a preferred-charter list in moderation rules.

Preferred charters affect channel-scoped ranking and version choice in these ways:

- channel search boosts preferred charters ahead of other matching charts
- playlist version tables sort preferred charts first
- version tables show a `Preferred` badge for matching charts
- owners and moderators can prefer or unprefer a charter directly from the versions table

Preferred-charter ranking is channel-specific. It does not change the base catalog and it does not create a separate chart version group by itself.

Preferred charters also do not override moderation rules. If a chart is blacklisted or blocked by channel rules, it still stays unavailable even if that charter is preferred.

## Current Scope

Today, the app uses two layers:

1. upstream catalog grouping from CustomsForge when it exists
2. request-time fallback grouping for same-title and normalized-artist matches when upstream grouping is missing

That gives the streamer a fuller version list when requests are added, while keeping search and moderation behavior predictable.
