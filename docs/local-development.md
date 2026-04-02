# Local Development

## What exists

### Prerequisites

- Node 22+
- npm
- Wrangler authenticated locally

Check auth:

```bash
npx wrangler whoami
```

### Setup

1. Install dependencies:

```bash
npm install
```

`npm install` also installs the repo's Git hooks through Husky.
Those hooks run:

- on commit: block commits on `main` and remind you to switch to a feature branch
- on commit: staged-file Biome fixes/checks
- on push: generated-file checks, `tsc --noEmit`, and tests without rewriting generated files

2. Copy and fill in environment values:

```bash
cp .env.example .env
```

`APP_URL` is used to derive the default Vite `server.allowedHosts` entry. If you need extra hostnames during local development, set `VITE_ALLOWED_HOSTS` to a comma-separated list.

For deployment, use a separate file:

```bash
cp .env.deploy.example .env.deploy
```

Use:

- `.env` for local development and your tunnel/ngrok URL
- `.env.deploy` for Cloudflare deployment values and the deployed app URL
- the GitHub Actions `APP_URL` repository secret is separate again and should use the deployed public URL, not the local tunnel URL

3. Bootstrap the local D1 database:

```bash
npm run db:bootstrap:local
```

4. Start the app:

```bash
npm run dev
```

`db:bootstrap:local` resets the local D1 state, applies migrations, and loads the bundled sample catalog seed.
`predev` runs migrations automatically, so once the sample seed is loaded the schema stays current.

### What works with the sample catalog

- public pages
- search
- account/settings UI
- playlist management flows

To exercise Twitch login, EventSub, and bot replies, fill in the Twitch-related values in `.env`.

For local bot testing, set `TWITCH_BOT_USERNAME` in `.env` to your dedicated test bot account, not the production bot account. The bot OAuth callback only accepts the username configured in local env, so if you want to connect `jimmy_test_bot_` locally, your local `.env` must also say `TWITCH_BOT_USERNAME=jimmy_test_bot_`.

Keep the production bot username only in production secrets or deployed env. Do not point local development at the production bot account unless you intentionally want local testing to use the live bot identity.

`TWITCH_SCOPES` applies to the broadcaster's main app login, not the shared bot login. It needs `channel:bot` so bot replies can use Twitch's bot badge path, `moderator:read:chatters` for the chatter-first VIP lookup flow, `channel:read:subscriptions` and `bits:read` for VIP token automation, and `channel:manage:redemptions` for the native channel point reward flow.

If you want to test the native channel point reward flow locally, use a Twitch Affiliate or Partner channel. Twitch does not allow custom rewards on channels without channel points.

### Important local testing warning

Do not test bot commands against a channel that is also connected in the live app unless you intentionally want both environments to react.

There are two different failure modes:

#### Same broadcaster + same bot account in local and production

This does not usually create duplicate chat handling.

Instead, it creates a subscription ownership conflict. Twitch treats `channel.chat.message` subscriptions as unique by event type plus condition, and the condition includes both the broadcaster ID and bot user ID. If local and production both try to use the same broadcaster with the same bot account, one environment can end up owning the subscription and the other can fail or appear to stop receiving chat events.

That means local testing can still interfere with production, even if both environments do not reply at the same time.

#### Same broadcaster + different bot accounts in local and production

This is the more dangerous case for duplicate behavior.

Because the bot user ID is different, Twitch can allow both subscriptions at once. Then a single chat command in that broadcaster's channel can be seen by both environments:

- once by production
- once by local development

That can cause:

- duplicate bot replies in chat
- duplicated side effects if both environments act on the same command
- confusing logs where both environments appear to handle the same message

Recommended practice:

- use a separate test broadcaster/channel for local bot testing
- use a separate test bot account for local bot testing
- set local `.env` `TWITCH_BOT_USERNAME` to the test bot account username
- do not connect a production broadcaster to local development
- keep only one active EventSub webhook subscription for a given broadcaster when you are debugging command behavior
- do not leave a local tunnel subscription active while also testing the same channel in production

### Public HTTPS for local Twitch testing

`localhost` is enough for basic Twitch OAuth testing, but full local testing for this app works better with a public HTTPS URL because Twitch webhooks need a reachable callback target.

#### Cloudflare Tunnel

Install `cloudflared`, then authenticate:

```bash
cloudflared login
```

Create a named tunnel:

```bash
cloudflared tunnel create request-bot-dev
```

Create a DNS route:

```bash
cloudflared tunnel route dns request-bot-dev dev.example.com
```

If `cloudflared tunnel route dns` uses the wrong zone or you manage multiple domains in Cloudflare, create the DNS record manually in the correct zone instead:

- type: `CNAME`
- name: `dev`
- target: `<your-tunnel-id>.cfargotunnel.com`
- proxied: `On`

Example:

```text
dev.example.com -> 4ac1a27b-efe2-402a-a0ae-21ec35d61591.cfargotunnel.com
```

This is often the easiest fix when the hostname belongs to a different zone than the one `cloudflared` tries to use automatically.

Create `~/.cloudflared/config.yml` on macOS/Linux, or `%USERPROFILE%\.cloudflared\config.yml` on Windows:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/<you>/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: dev.example.com
    service: http://localhost:9000
  - service: http_status:404
```

Windows example:

```yaml
tunnel: <your-tunnel-id>
credentials-file: C:\Users\<you>\.cloudflared\<your-tunnel-id>.json

ingress:
  - hostname: dev.example.com
    service: http://localhost:9000
  - service: http_status:404
```

Run it:

```bash
cloudflared tunnel run <your-tunnel-id>
```

Then update:

- `.env`
  - `APP_URL=https://dev.example.com`
  - `VITE_TWITCH_EXTENSION_API_BASE_URL=https://dev.example.com` for the standalone panel build
  - `VITE_ALLOWED_HOSTS=dev.example.com` if Vite blocks the hostname
  - `TWITCH_EXTENSION_CLIENT_ID=<your-extension-client-id>` for panel setup
- Twitch app redirect URIs
  - `https://dev.example.com/auth/twitch/callback`
  - `https://dev.example.com/auth/twitch/bot/callback`

Before testing chat commands through the tunnel, make sure the same broadcaster is not still actively subscribed to the production EventSub callback unless that is intentional.

#### ngrok

As an alternative:

```bash
ngrok http 9000
```

Use the generated HTTPS URL for:

- `APP_URL`
- Twitch redirect URI base

If the ngrok URL changes, update both `.env` and the Twitch app redirect URIs.

### Verification before commit

The default contributor path is:

1. Commit normally.
2. Let the `pre-commit` hook block commits on `main` and run staged-file Biome fixes/checks.
3. Push normally.
4. Let the `pre-push` hook run generated-file verification, typecheck, and tests.

If you want to run the same push-time gate manually before pushing, use:

```bash
npm run check:prepush
```

You usually do not need to run `format`, `lint`, `test`, and `typecheck` manually in sequence.

Run these extra commands only when they fit the change:

1. Full-repo Biome pass:

```bash
npm run lint
```

If you want Biome's full detailed output instead of the compact summary:

```bash
npm run lint:full
```

2. Production build sanity check:

```bash
npm run build
```

3. Browser flow coverage:

```bash
npm run test:e2e
```

If you need the old manual verification path, run:

1. Typecheck:

```bash
npm run typecheck
```

2. Tests:

```bash
npm run test
```

3. Format:

```bash
npm run format
```

4. Lint:

```bash
npm run lint
```

5. Production build:

```bash
npm run build
```

If you changed browser-driven behavior or UI flows, also run:

```bash
npm run test:e2e
```

Why `format` before `lint` in the manual path:

- Biome lint is much less noisy after formatting first
- AI-generated edits often introduce avoidable formatting drift
- running `npm run format` first catches a large class of pre-commit issues cheaply

### Cloudflare deploy inputs

`npm run deploy` and `npm run db:bootstrap:remote` read deployment values from `.env.deploy`, not `.env`.

That keeps local tunnel settings separate from deployed app settings.

### Common issues

#### Local database out of date

The app fails early with a message telling you to run:

```bash
npm run db:migrate
```

If that happens, rerun migrations and restart the dev server.

#### Reset local data to the bundled sample catalog

If you want to restore the default local dataset:

```bash
npm run db:bootstrap:local
```

#### Fresh migration issues

CI includes a test that builds a fresh SQLite database from the migration files and verifies a manual playlist insert. If a migration works only on an existing local database but not from scratch, that test should fail.

## What can be added later

- A single-command local setup that also validates Twitch credentials and tunnel configuration.
- A container-first development workflow if contributors need a standardized environment.
- More automated local smoke checks for OAuth, EventSub, and bot reply behavior.
