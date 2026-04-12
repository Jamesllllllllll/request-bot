# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.4.1] - 2026-04-12

### Fixed
- CI now builds the standalone Twitch panel artifact with the configured production app URL from GitHub repo configuration instead of a hardcoded domain.

## [0.4.0] - 2026-04-12

### Added
- Random favorite requests on the web and Twitch panel, plus lyrics metadata and richer public played-history coverage. (#79, #80, #81, #82)
- German locale support and a full translation sweep across the web app, Twitch panel, and bot replies. (#82)

### Changed
- Channel settings now use a sidebar-tab layout with a shared save flow, clearer moderation sections, integrated overlay editing, and more consistent field grouping. (#70, #82)
- VIP token pricing now uses one additive model across chat, web, and panel for duration rules, request modifiers, manager adds, and refunds. (#82)
- Channel search now uses versioned shared caching, normalized tuning IDs, and aligned tuning filters across settings, search, and displayed results. (#66, #78, #82)
- Public and admin playlist views now show richer song metadata, smoother pagination, stronger VIP styling, sorted public rules lists, and clearer version-level blacklist handling. (#73, #78, #82)

### Fixed
- Twitch auth and token handling now follow the latest security remediation pass. (#71)
- Viewer and moderator request surfaces now show correct VIP-token costs and insufficient-balance states before submit. (#67, #82)
- Documentation now reflects the current app flow, current deploy workflow, and the active docs set instead of older feature plans. (#82)

## [0.3.1] - 2026-04-01

### Added
- Owner-controlled channel language for bot replies, with Twitch panel fallback to the channel default when a viewer has no linked or local language preference.
- A non-English translation feedback prompt in the website header and account settings.

### Changed
- Twitch panel and public VIP-token help now share localized VIP automation copy and locale-aware amount formatting.
- More support-event and StreamElements bot replies now respect the channel's configured bot language instead of always replying in English.

### Fixed
- Website language changes now apply immediately again instead of briefly reverting or waiting for the background locale save to finish.

## [0.3.0] - 2026-04-01

### Added
- RockList.Live branding updates across the app and docs, plus clearer deployment/domain guidance for the public site and Twitch panel.
- Twitch panel extension refinements for moderator workflows, tester access, request actions, and closer parity with the web playlist manager.
- Expanded VIP token automation, including StreamElements tip rewards, shared resub-message rewards, raid rewards, relay URL setup, clearer public messaging, and richer dashboard configuration.
- Public playlist header controls for live status, request status, manager request toggling, VIP token balance/help, and tighter custom-request flows.
- Multi-version playlist-management helpers and tests to support richer version tables, download actions, and moderation controls across web and panel surfaces.
- Website internationalization scaffolding and locale support for the main app.

### Changed
- Dashboard settings were reorganized with clearer heading hierarchy, collapsible filter sections, compact VIP automation cards, improved notices, and cleaner owner/moderator controls.
- Playlist management rows were redesigned for desktop and mobile, including better action grouping, version-table presentation, compact metadata, and touch-friendly reorder controls.
- Public search now behaves more like a filtered catalog by default, with compact applied-filter summaries, better preferred-path messaging, and clearer request warnings.
- Public playlist and moderator surfaces now align more closely with the Twitch panel, including request actions, blacklist flows, and version-aware song management.
- Sentry handling was tightened so local development disables runtime capture cleanly, while production tracing now includes Twitch chat reply timing spans.

### Fixed
- Catalog search now falls back cleanly when FTS `MATCH` fails instead of returning a server error for some artist searches.
- Artist-based custom requests now use artist search correctly, including multi-word artist names such as `Bruno Mars`.
- Search validation once again allows filtered browsing with no text query, so playlist pages load their filtered song catalog on first open.
- Multi-tuning request checks no longer reject songs incorrectly when all listed tunings are allowed, and several playlist/search filter edge cases now respect the current channel settings more reliably.
- The local max playlist size default is now consistent at `50`, avoiding local resets back to the older `250` default.

## [0.2.0] - 2026-03-27

### Added
- Signed-in viewer request flows on public channel pages, including add, VIP add, edit, and remove actions with shared request-policy enforcement.
- Twitch panel extension MVP with playlist viewing, linked-viewer request actions, VIP token balance, and compact playlist moderation controls for channel owners and moderators.
- Extension JWT verification, extension API routes, and standalone panel build support.
- Panel Local Test and beta-rollout documentation for self-hosted deployments and Twitch setup.

### Changed
- Public playlist rows now show clearer request timing and viewer-owned request highlighting.
- Public channel request UI is more compact and focused on direct request actions.
- Homepage live-stream cards now show stream titles for both featured and secondary live channels.
- Deployment and setup docs now cover Twitch extension client configuration, extension secrets, and production/custom-domain routing for the panel.

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
- Initial public release of RockList.Live with playlist management, dashboard controls, and Cloudflare-backed deployment support.
