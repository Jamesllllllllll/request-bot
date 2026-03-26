# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.2] - 2026-03-26

### Added
- Whole-song blacklist groups alongside exact version blacklists, with moderation controls for artists, charters, songs, and specific versions.
- Home page demo cards that can show Rocksmith-tagged Twitch streams with `Open playlist` and `Watch on Twitch` actions.

### Changed
- Playlist manager blacklist actions now identify the queued version more clearly and distinguish queued-version blocking from whole-song blocking.
- Public and dashboard blacklist displays now separate songs from versions, and request filtering respects both types of blacklist.
- The README now summarizes the current app surfaces and contributor workflow more clearly.

## [0.1.1] - 2026-03-22

### Added
- Shared bot reconnect controls for admins, including the ability to replace the connected bot account safely.
- VIP token management from both chat commands and the dashboard, with Twitch user lookup, chatter-aware search, and an editable token table in the app.
- Automatic VIP token rewards for Twitch-native support events, including gifted subs, gifted-sub recipients, and cheers with configurable conversion rules.
- Public playlist messaging that shows viewers how they can earn VIP tokens when a channel has support-based VIP rewards enabled.
- Public played-history search.
- Charter blacklisting, including exact charter matching and clearer handling when only some song versions are blocked.
- Richer sample catalog metadata for artists, charters, tunings, and future filtering work.
- Production-ready Sentry scaffolding for the Cloudflare app and backend workers, with DSN-based opt-in for local development and Cloudflare-managed secrets for deployed environments.
- GitHub issue templates, a pull request template, and a repository `CODE_OF_CONDUCT.md`.

### Changed
- Bot replies now use Twitch's bot-badge-compatible reply path, and the app prompts broadcasters to reconnect Twitch if required permissions are missing.
- Broadcaster login now requests the Twitch permissions needed for chatter-aware moderation and bot-badged replies.
- Broadcaster login now also requests the Twitch permissions needed for gifted-sub and cheer-based VIP token automation.
- The app header and settings pages now surface Twitch reauthorization more clearly when a reconnect is required.
- VIP token balances now support fractional values, including partial token grants and clearer balance handling when a viewer has less than one full VIP token remaining.
- Existing requests can now be converted between regular and VIP from chat and from the playlist manager without creating duplicate playlist entries.
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
- Duplicate EventSub deliveries for cheers and gifted-sub automation no longer double-grant VIP tokens.
- Twitch reply handling now distinguishes between accepted API requests and messages that Twitch actually sent to chat.
- Bot/account status screens now show the real connected bot identity instead of only the configured bot name.
- VIP request upgrade and downgrade replies now clearly state when a token was used or refunded, and dashboard-triggered request kind changes follow the same token logic and bot reply flow as chat commands.
- Production deployment config regeneration now stays in sync after remote migrations.

## [0.1.0] - 2026-03-18

### Added
- Initial public release of the Twitch request bot with playlist management, dashboard controls, and Cloudflare-backed deployment support.
