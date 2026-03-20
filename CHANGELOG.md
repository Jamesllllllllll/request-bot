# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Production-ready Sentry scaffolding for the Cloudflare app and backend workers, with DSN-based opt-in for local development and Cloudflare-managed secrets for deployed environments.
- GitHub issue templates, a pull request template, and a repository `CODE_OF_CONDUCT.md`.

### Changed
- Simplified catalog song source URLs to always derive the Ignition download link from the song source ID instead of storing `source_url` in the database.
- Added a migration to remove the redundant `catalog_songs.source_url` column and updated the sample catalog seed to match the new schema.
- Tightened schema version checks so the app only accepts migrations that are actually present in the repo.
- Expanded deployment and environment documentation for Sentry configuration in local development and production.

## [0.1.0] - 2026-03-18

### Added
- Initial public release of the Twitch request bot with playlist management, dashboard controls, and Cloudflare-backed deployment support.
