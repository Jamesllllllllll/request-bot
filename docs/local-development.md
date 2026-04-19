# Local Development

## Prerequisites

- Node 22+
- npm
- Wrangler authenticated locally

Check Wrangler auth:

```bash
npx wrangler whoami
```

## Setup

1. Install dependencies:

```bash
npm install
```

`npm install` also installs the repo Git hooks through Husky.

2. Copy the local env file:

```bash
cp .env.example .env
```

3. Fill in the values you need in [`.env.example`](../.env.example).

Minimum local browsing setup:

- `APP_URL=http://localhost:9000`
- `INTERNAL_API_SECRET`
- `TWITCH_EVENTSUB_SECRET`
- `SESSION_SECRET`

Add these when you test Twitch auth, EventSub, bot flows, or the panel:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_TOKEN_ENCRYPTION_SECRET`
- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_EXTENSION_SECRET`
- `ADMIN_TWITCH_USER_IDS`
- `TWITCH_BOT_USERNAME`

Add these when you test the YouTube chat connection:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_TOKEN_ENCRYPTION_SECRET`

Use `VITE_ALLOWED_HOSTS` when you need extra local hostnames, and `VITE_TWITCH_EXTENSION_API_BASE_URL` when the standalone panel build needs a different app origin.

4. Bootstrap the app database:

```bash
npm run db:bootstrap:local
```

That resets D1, applies migrations, and prepares the app database.

5. Start the app:

```bash
npm run dev
```

The local app runs on:

```text
http://localhost:9000
```

For this repo, treat `http://localhost:9000` as the default existing dev app. Before starting another server or changing ports, first confirm whether the app is already running there.

## Day-To-Day Commands

- `npm run dev`
- `npm run tunnel`
- `npm run db:migrate`
- `npm run check:prepush`
- `npm run check:ship`
- `npm run build`
- `npm run test:e2e`

Use `npm run db:migrate` for normal local schema updates.

Use `npm run db:bootstrap:local` only when you intentionally want to reset the app database.

## What Works Locally

- home page and channel pages
- search and filters
- settings and moderation UI
- playlist management flows
- Twitch panel UI

Twitch sign-in, EventSub, bot replies, and hosted Twitch panel testing need valid Twitch credentials.

## Twitch Auth And Bot Testing

`TWITCH_SCOPES` applies to the broadcaster app login, not the shared bot login. The current default scope set is:

```text
openid user:read:moderated_channels moderator:read:chatters channel:bot channel:read:subscriptions bits:read channel:manage:redemptions
```

Use a dedicated local bot account in `TWITCH_BOT_USERNAME`. The bot OAuth callback only accepts the username configured in local env, so the local env and the connected bot account have to match.

If you test the native channel point reward flow locally, use a Twitch Affiliate or Partner channel. Twitch rejects custom reward calls on channels without channel points.

## Tunnel Testing

`localhost` is enough for basic local browsing, but Twitch auth and callback testing work better through the existing public HTTPS tunnel:

```text
https://dev.itsaunix.systems
```

Use that tunnel first for sign-in and other auth-sensitive browser checks.

EventSub and Twitch panel hosted testing also work better with a public HTTPS URL.

Start the existing tunnel with:

```bash
npm run tunnel
```

That script points `https://dev.itsaunix.systems` at `http://localhost:9000` using the repo-local Cloudflare tunnel defaults and the credentials file under your local `.cloudflared` folder.

Override the defaults with:

- `REQUEST_BOT_TUNNEL_ID`
- `REQUEST_BOT_TUNNEL_HOST`
- `REQUEST_BOT_TUNNEL_URL`
- `REQUEST_BOT_TUNNEL_CREDENTIALS_FILE`

If you need to recreate the tunnel yourself, then set:

- `APP_URL=https://dev.itsaunix.systems`
- `VITE_ALLOWED_HOSTS=dev.itsaunix.systems` if Vite blocks the hostname
- `VITE_TWITCH_EXTENSION_API_BASE_URL=https://dev.itsaunix.systems` for the standalone panel build

Also register these Twitch redirect URIs:

- `https://dev.itsaunix.systems/auth/twitch/callback`
- `https://dev.itsaunix.systems/auth/twitch/bot/callback`

If you test the YouTube chat connection through the tunnel, also register:

- `https://dev.itsaunix.systems/auth/youtube/callback`

`ngrok http 9000` is the simpler alternative when you do not need a stable hostname.

Do not start a second local dev server on another port unless `http://localhost:9000` and `https://dev.itsaunix.systems` are both unavailable or you intentionally need a separate instance.

## Cross-Environment Warning

Do not test bot commands against the same broadcaster/channel in both local and production unless that overlap is intentional.

Two failure modes matter:

- same broadcaster + same bot account: one environment can effectively own the shared chat subscription
- same broadcaster + different bot accounts: both environments can receive and act on the same chat command

Safe default:

- use a separate test broadcaster
- use a separate test bot account
- do not keep local and production EventSub subscriptions active for the same broadcaster during debugging

## YouTube Chat Testing

The current YouTube test flow is intentionally narrow:

- connect your own YouTube channel from dashboard settings
- let the app detect your active YouTube live broadcast
- verify that chat can be read and that a manual test message can be posted

For Google OAuth setup during testing:

- enable the YouTube Data API in your Google Cloud project
- create a web OAuth client
- add `https://dev.itsaunix.systems/auth/youtube/callback` as an authorized redirect URI
- keep the OAuth consent screen in Testing while you validate the flow locally
- add the Google account you use for testing as a test user if needed

## Verification

The default workflow is:

```bash
git switch -c codex/my-change
git add -A
git commit
git push
```

Do not commit or push on `main`. If you start on `main`, create a feature branch first. Stage the full worktree before every commit unless you intentionally need to exclude something.

Run the push-time gate yourself with:

```bash
npm run check:prepush
```

Run extra checks only when they fit the change:

- `npm run lint`
- `npm run lint:full`
- `npm run check:ship`
- `npm run build`
- `npm run test:e2e`

The repo hooks already run staged Biome fixes/checks on commit, including staged JSON under `src`, `tests`, and `scripts`, and they run generated-file checks, i18n coverage, lint, typecheck, and tests on push.

## Related Docs

- [README.md](../README.md)
- [docs/bot-operations.md](bot-operations.md)
- [docs/twitch-panel-extension-local-test.md](twitch-panel-extension-local-test.md)
