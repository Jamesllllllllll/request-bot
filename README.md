# RockList.Live

RockList.Live is a Twitch song request app for music and Rocksmith streams. Viewers browse a channel playlist, search the catalog, and request songs from the web, chat, or Twitch panel. Streamers and moderators manage queue rules, moderation, VIP tokens, overlays, and bot behavior from the same channel-first app.

## Current Product Surface

- Public channel pages at `/$slug` with playlist, played history, search, request actions, blacklist visibility, and viewer request state
- Channel management on the same page for owners and moderators, including queue actions, moderation, VIP token handling, and request editing
- Owner settings for request policy, moderator permissions, VIP token automation, Twitch and bot setup, and stream overlay configuration
- Twitch panel extension for playlist viewing, linked viewer requests, and role-aware moderation controls
- Shared Twitch bot account with channel opt-in, EventSub reconciliation, chat command handling, and VIP token automation
- Localized website, panel, and bot copy

## Stack

- TanStack Start
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Durable Objects
- Cloudflare Queues
- Cloudflare KV
- TypeScript

## Quick Start

```bash
npm install
cp .env.example .env
npm run db:bootstrap:local
npm run dev
```

The local app runs on:

```text
http://localhost:9000
```

Use the bundled sample catalog for normal local development. For Twitch auth, EventSub, bot flows, or panel testing, fill in the Twitch-related values in [`.env.example`](.env.example) and follow [docs/local-development.md](docs/local-development.md).

## Verification

The default contributor path is:

```bash
git add <files>
git commit
git push
```

The repo hooks run staged Biome checks on commit and generated-file checks, typecheck, and tests on push.

Run the same push-time gate manually with:

```bash
npm run check:prepush
```

Run extra commands only when the change needs them:

- `npm run build`
- `npm run test:e2e`
- `npm run lint`
- `npm run lint:full`

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/local-development.md](docs/local-development.md)
- [docs/deployment-workflow.md](docs/deployment-workflow.md)
- [docs/bot-operations.md](docs/bot-operations.md)
- [docs/request-modifier-vip-token-rules.md](docs/request-modifier-vip-token-rules.md)
- [docs/stream-overlay.md](docs/stream-overlay.md)
- [docs/testing-guide.md](docs/testing-guide.md)
- [docs/README.md](docs/README.md)

## Deployment Summary

The app deploys as two Workers:

- `request-bot`
- `request-bot-backend`

Use [docs/deployment-workflow.md](docs/deployment-workflow.md) for the full setup, secret, migration, and GitHub Actions flow.
