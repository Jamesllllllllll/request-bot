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

Use `VITE_ALLOWED_HOSTS` when you need extra local hostnames, and `VITE_TWITCH_EXTENSION_API_BASE_URL` when the standalone panel build needs a different app origin.

4. Bootstrap the local D1 database:

```bash
npm run db:bootstrap:local
```

That resets local D1, applies migrations, and seeds the bundled sample catalog.

5. Start the app:

```bash
npm run dev
```

The local app runs on:

```text
http://localhost:9000
```

## Day-To-Day Commands

- `npm run dev`
- `npm run db:migrate`
- `npm run check:prepush`
- `npm run check:ship`
- `npm run build`
- `npm run test:e2e`

Use `npm run db:migrate` for normal local schema updates.

Use `npm run db:bootstrap:local` only when you intentionally want to reset local data back to the bundled sample catalog.

## What Works With The Sample Catalog

- home page and channel pages
- search and filters
- settings and moderation UI
- playlist management flows
- Twitch panel UI against local data

Twitch sign-in, EventSub, bot replies, and hosted Twitch panel testing need valid Twitch credentials.

## Twitch Auth And Bot Testing

`TWITCH_SCOPES` applies to the broadcaster app login, not the shared bot login. The current default scope set is:

```text
openid user:read:moderated_channels moderator:read:chatters channel:bot channel:read:subscriptions bits:read channel:manage:redemptions
```

Use a dedicated local bot account in `TWITCH_BOT_USERNAME`. The bot OAuth callback only accepts the username configured in local env, so the local env and the connected bot account have to match.

If you test the native channel point reward flow locally, use a Twitch Affiliate or Partner channel. Twitch rejects custom reward calls on channels without channel points.

## Tunnel Testing

`localhost` is enough for basic OAuth testing. EventSub and Twitch panel hosted testing work better with a public HTTPS URL.

Cloudflare Tunnel flow:

```bash
cloudflared login
cloudflared tunnel create request-bot-dev
cloudflared tunnel route dns request-bot-dev dev.example.com
cloudflared tunnel run <your-tunnel-id>
```

Then set:

- `APP_URL=https://dev.example.com`
- `VITE_ALLOWED_HOSTS=dev.example.com` if Vite blocks the hostname
- `VITE_TWITCH_EXTENSION_API_BASE_URL=https://dev.example.com` for the standalone panel build

Also register these Twitch redirect URIs:

- `https://dev.example.com/auth/twitch/callback`
- `https://dev.example.com/auth/twitch/bot/callback`

`ngrok http 9000` is the simpler alternative when you do not need a stable hostname.

## Cross-Environment Warning

Do not test bot commands against the same broadcaster/channel in both local and production unless that overlap is intentional.

Two failure modes matter:

- same broadcaster + same bot account: one environment can effectively own the shared chat subscription
- same broadcaster + different bot accounts: both environments can receive and act on the same chat command

Safe default:

- use a separate test broadcaster
- use a separate test bot account
- do not keep local and production EventSub subscriptions active for the same broadcaster during debugging

## Verification

The default workflow is:

```bash
git add -A
git commit
git push
```

Stage the full worktree before every commit unless you intentionally need to exclude something.

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

## Related Docs

- [README.md](../README.md)
- [docs/bot-operations.md](bot-operations.md)
- [docs/twitch-panel-extension-local-test.md](twitch-panel-extension-local-test.md)
