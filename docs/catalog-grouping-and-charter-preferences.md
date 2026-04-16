# Catalog Grouping And Charter Preferences

## Version Grouping

RockList.Live uses the catalog metadata from CustomsForge as the primary source of chart version grouping.

When `grouped_project_id` is present on catalog rows, the app treats those charts as alternate versions of the same song for:

- playlist version selection
- song-group blacklists
- channel-scoped version handling in requests and management tools

Some catalog rows are not grouped upstream even though they are effectively alternate charts of the same song. In that case, RockList.Live uses a fallback grouping rule across grouped search results, request handling, and playlist version lists:

- same title
- same normalized artist name

Artist normalization is intentionally conservative. It currently:

- trims whitespace
- lowercases the name
- strips a leading `The `

That fallback keeps requester and streamer views aligned even when the upstream catalog does not provide a shared `grouped_project_id`.

The app now persists a canonical internal group assignment on each catalog row. New or updated catalog rows refresh that canonical grouping when they are imported, and existing rows can be backfilled with the catalog-group refresh task. Search and version expansion read the stored canonical grouping when it is present instead of recomputing the full fallback graph on every request.

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
2. stored canonical grouping that also bridges same-title and normalized-artist fallback matches when upstream grouping is missing

That keeps search results, request handling, and playlist version selection consistent while preserving a fuller version list for streamers and moderators.
