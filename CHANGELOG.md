# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Shared bot reconnect controls for admins, including the ability to replace the connected bot account safely.
- VIP token management from both chat commands and the dashboard, with Twitch user lookup, chatter-aware search, and an editable token table in the app.
- Public played-history search.
- Charter blacklisting, including exact charter matching and clearer handling when only some song versions are blocked.
- Richer sample catalog metadata for artists, charters, tunings, and future filtering work.
- Production-ready Sentry scaffolding for the Cloudflare app and backend workers, with DSN-based opt-in for local development and Cloudflare-managed secrets for deployed environments.
- GitHub issue templates, a pull request template, and a repository `CODE_OF_CONDUCT.md`.

### Changed
- Bot replies now use Twitch's bot-badge-compatible reply path, and the app prompts broadcasters to reconnect Twitch if required permissions are missing.
- Broadcaster login now requests the Twitch permissions needed for chatter-aware moderation and bot-badged replies.
- The app header and settings pages now surface Twitch reauthorization more clearly when a reconnect is required.
- Local-development guidance now strongly separates production bot/broadcaster usage from local testing and explains the risks of cross-environment chat handling.
- The moderation dashboard now supports faster Twitch username search with debouncing, in-chat prioritization, and clearer saved-state feedback for VIP tokens.
- Search results now show newer song versions first, and public search includes a dedicated `!edit` copy command.
- Public playlist, dashboard playlist, search, and home-page experiences have been refined for mobile screens and easier browsing.
- Blacklist and setlist management now use exact IDs instead of loose text matching, improving moderation accuracy.
- Public search now behaves more like a browsable catalog and shows clearer demo-database guidance.
- Simplified catalog song source URLs to always derive the Ignition download link from the song source ID instead of storing `source_url` in the database.
- Added a migration to remove the redundant `catalog_songs.source_url` column and updated the sample catalog seed to match the new schema.
- Tightened schema version checks so the app only accepts migrations that are actually present in the repo.
- Expanded deployment and environment documentation for Sentry configuration in local development and production.

### Fixed
- Duplicate EventSub deliveries for `!addvip` no longer grant multiple VIP tokens or queue duplicate bot replies.
- Twitch reply handling now distinguishes between accepted API requests and messages that Twitch actually sent to chat.
- Bot/account status screens now show the real connected bot identity instead of only the configured bot name.
- Production deployment config regeneration now stays in sync after remote migrations.

## [0.1.0] - 2026-03-18

### Added
- Initial public release of the Twitch request bot with playlist management, dashboard controls, and Cloudflare-backed deployment support.
