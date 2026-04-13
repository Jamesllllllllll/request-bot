# Changelog

All notable changes to this project are documented here.

## [0.5.0] - 2026-04-13

### Added
- Channels can mark preferred charters so trusted chart versions rise to the top when viewers search and when streamers review versions on the playlist.
- The site footer now links to the open-source project, credits CustomsForge, and opens a readable in-app changelog dialog.

### Changed
- Playlist search and queue management are more mobile-friendly, with cleaner pagination, tighter action layouts, and better button alignment on smaller screens.
- Request buttons and modifier controls are clearer, with stronger VIP cost cues, simpler path selection, and better request cost feedback for viewers and managers.
- Search and playlist flows now keep alternate chart versions together more reliably, even when upstream grouping data is missing.
- Documentation now explains the current catalog grouping and charter preference behavior.

### Fixed
- Full-text search falls back cleanly when D1 rejects oversized MATCH queries, and the UI now shows friendly error messages instead of raw SQL details.
- Manual adds, viewer adds, and chart version switching now surface sibling chart versions more consistently in the playlist manager.

## [0.4.4] - 2026-04-12

### Changed
- Local verification now catches formatting problems earlier, including JSON and translation files.

### Fixed
- Formatting mistakes now fail before CI instead of only showing up after a push.

## [0.4.3] - 2026-04-12

### Changed
- Release notes and contributor guidance now follow clearer versioning rules.

### Fixed
- Old local file path examples were removed from the repo history and test data.

## [0.4.2] - 2026-04-12

### Changed
- Release and deployment steps are clearer and more consistent.

### Fixed
- CI no longer builds the standalone Twitch panel package when it is not needed.
- The unused dashboard panel preview route and preview copy were removed.

## [0.4.1] - 2026-04-12

### Fixed
- The Twitch panel CI build now uses the configured live app URL instead of a hardcoded domain.

## [0.4.0] - 2026-04-12

### Added
- Random favorite requests are available on the web and Twitch panel, and played history is more complete.
- German support was added, and translations were expanded across the website, Twitch panel, and bot replies.

### Changed
- Channel settings now use sidebar tabs with a shared save flow, clearer moderation sections, and integrated overlay editing.
- VIP token costs now behave the same way across chat, web, and panel, including duration rules, request modifiers, manager adds, and refunds.
- Search is faster and more consistent thanks to shared caching, better tuning handling, and aligned filters across settings, search, and results.
- Public and admin playlist views are clearer, with richer song details, smoother pagination, stronger VIP styling, and better blacklist handling.

### Fixed
- Twitch auth and token handling are more reliable.
- Viewer and moderator request screens now show VIP token costs and low-balance states more clearly before submit.
- Documentation better matches the current app and deployment flow.

## [0.3.1] - 2026-04-01

### Added
- Channels can choose the bot reply language, and the Twitch panel falls back to the channel language when a viewer has no saved preference.
- The site now includes a translation feedback prompt in the header and account settings.

### Changed
- VIP token help now uses more consistent localized wording across the public site and Twitch panel.
- More bot replies now follow the channel's selected language.

### Fixed
- Website language changes apply immediately again.

## [0.3.0] - 2026-04-01

### Added
- RockList.Live branding was rolled out across the app, with clearer deployment and domain guidance for the site and Twitch panel.
- The Twitch panel was refined for moderator workflows, tester access, and closer parity with the website.
- VIP token automation expanded to cover support events such as tips, resubs, and raids, with clearer dashboard controls and public messaging.
- The public playlist header gained clearer live status, request status, manager controls, and VIP token help.
- Website localization support was introduced for the main app.

### Changed
- Dashboard settings, playlist rows, and search were reorganized to be easier to scan on desktop and mobile.
- Public playlist and moderation tools now feel more consistent with the Twitch panel.
- Production error reporting is cleaner, while local development stays quieter.

### Fixed
- Search falls back more reliably when some full-text searches fail.
- Artist-based custom requests handle multi-word artist names correctly.
- Filtered browsing loads properly even with no text query.
- Tuning and playlist filter edge cases now follow channel settings more reliably.

## [0.2.0] - 2026-03-27

### Added
- Signed-in viewers can add, VIP, edit, and remove requests directly from public channel pages.
- The Twitch panel extension MVP added playlist viewing, linked-viewer request actions, VIP token balance, and compact moderation controls.
- The panel gained the backend support needed for hosted Twitch use.

### Changed
- Public playlist rows now show clearer request timing and stronger highlighting for a viewer's own requests.
- Public request controls are more compact and focused.
- Home page live-stream cards now show stream titles.

## [0.1.2] - 2026-03-26

### Added
- Whole-song blacklists were added alongside exact version blacklists, with moderation controls for artists, charters, songs, and specific versions.
- The home page gained demo live-channel cards with direct playlist and Twitch links.

### Changed
- Blacklist handling is clearer in the playlist manager, and public/dashboard blacklist displays separate whole songs from specific versions.
- Search and request filtering now respect both whole-song and exact-version blacklists.

## [0.1.1] - 2026-03-22

### Added
- Admins can reconnect the shared bot safely and replace the connected bot account when needed.
- VIP token management works from both chat commands and the dashboard, with Twitch user lookup and editable balances.
- VIP token rewards can be granted automatically for cheers, gifted subs, and related Twitch events.
- The public playlist now explains how viewers can earn VIP tokens when a channel enables support-based rewards.
- Public played-history search and charter blacklisting were added.

### Changed
- Bot replies now use Twitch's bot-badge-friendly reply path, and the app highlights missing reconnect permissions more clearly.
- Broadcaster login now requests the permissions needed for chatter lookup and support-based VIP automation.
- VIP balances now support fractional amounts.
- Existing requests can switch between regular and VIP without creating duplicates.
- Search, playlist, mobile layouts, and blacklist accuracy were refined across the app.

### Fixed
- Duplicate Twitch events no longer double-grant VIP tokens or send duplicate bot replies.
- Bot status screens now show the real connected bot identity.
- VIP upgrade and downgrade replies now explain token use and refunds more clearly.

## [0.1.0] - 2026-03-18

### Added
- Initial public release of RockList.Live with playlist management, dashboard controls, and Cloudflare-backed deployment support.
