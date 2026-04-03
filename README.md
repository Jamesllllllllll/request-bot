# RockList.Live

RockList.Live is a Twitch song request app for music and Rocksmith streams. Viewers browse public playlists, sign in with Twitch, and add or manage their own requests from channel pages. Streamers and moderators manage request rules, queue behavior, VIP token rewards, overlays, and channel access from the dashboard and Twitch panel.

It runs on TanStack Start, Cloudflare Workers, D1, Durable Objects, Queues, KV, and TypeScript.

## Documentation

- [CONTRIBUTING.md](/CONTRIBUTING.md)
- [docs/local-development.md](/docs/local-development.md)
- [docs/deployment-workflow.md](/docs/deployment-workflow.md)
- [docs/bot-operations.md](/docs/bot-operations.md)
- [docs/README.md](/docs/README.md)

## What The App Includes

### Viewer Experience

- Home page cards for live channels, plus a demo mode that shows Rocksmith-tagged Twitch streams with `Watch on Twitch` and `Open playlist` actions
- Song search with direct viewer request actions, custom artist requests, copyable chat commands, catalog metadata, caching, and D1-backed rate limiting
- Public channel pages with playlist, played history, signed-in viewer request controls, live/request status badges, VIP token balance/help, and request timestamps

### Streamer And Moderator Tools

- Dashboard pages for account access, owner settings, admin controls, playlist management, and richer moderator tools
- Channel rules with setlists plus distinct artist, charter, song, and version blacklists
- Multi-version playlist metadata with version tables, download actions, and whole-song or version-specific moderation flows
- OBS-ready stream overlay settings with live preview, chroma-key background controls, and album/creator display toggles

### Twitch And Reward Automation

- Twitch panel extension with playlist viewing, viewer request actions, and owner/moderator controls for play-now, reorder, remove, request-type changes, and other queue actions
- Shared bot-account OAuth, per-channel bot opt-in, and live-aware EventSub subscription management
- VIP token tracking with manual grants plus automatic rewards for new subs, shared resub messages, gifted subs, gift recipients, cheers, app-owned channel point rewards, raids, and StreamElements tips

### Platform And Quality

- Internationalization support for localized website and Twitch panel UI, plus owner-controlled bot reply locales with English as the default
- Durable Object playlist serialization, Queue-based reply delivery, and Cloudflare-backed persistence
- Vitest, Playwright, and GitHub Actions verification

## Shared Bot Account

The app supports a shared Twitch bot account:

- broadcasters sign in with `/auth/twitch/start`
- an admin signs the shared bot in with `/auth/twitch/bot/start`
- streamers opt their own channel into bot presence from Dashboard Settings
- the app keeps `stream.online` and `stream.offline` subscriptions for opted-in channels
- when a channel is live, the app ensures `channel.chat.message` is subscribed for the broadcaster + bot-user pair
- when VIP token automation is enabled, the app also manages the Twitch EventSub subscriptions needed for sub, gift, cheer, and raid reward flows
- when a channel goes offline, the chat subscription is removed

Detailed operator notes live in [docs/bot-operations.md](/docs/bot-operations.md).

## Local development

### Prerequisites

- Node 22+
- npm
- Wrangler installed through the repo dependencies
- Wrangler authenticated locally

Check Wrangler auth:

```bash
npx wrangler whoami
```

If needed:

```bash
npx wrangler login
```

### 1. Copy the environment file

```bash
cp .env.example .env
```

`.env.example`:

```env
APP_URL=http://localhost:9000
VITE_TWITCH_EXTENSION_API_BASE_URL=
SENTRY_ENVIRONMENT=development
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=
TWITCH_CLIENT_ID=
TWITCH_EXTENSION_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_TOKEN_ENCRYPTION_SECRET=
INTERNAL_API_SECRET=
TWITCH_EVENTSUB_SECRET=local-dev-eventsub-secret
TWITCH_EXTENSION_SECRET=
SESSION_SECRET=local-dev-session-secret
TWITCH_BOT_USERNAME=requestbot
TWITCH_SCOPES=openid user:read:moderated_channels moderator:read:chatters channel:bot channel:read:subscriptions bits:read channel:manage:redemptions
ADMIN_TWITCH_USER_IDS=
VITE_ALLOWED_HOSTS=
```

### 2. Fill the required environment values

For basic local development, set:

- `APP_URL=http://localhost:9000`
- `TWITCH_EVENTSUB_SECRET`
- `SESSION_SECRET`
- `INTERNAL_API_SECRET`
- `TWITCH_BOT_USERNAME`
- `TWITCH_SCOPES=openid user:read:moderated_channels moderator:read:chatters channel:bot channel:read:subscriptions bits:read channel:manage:redemptions`
- `VITE_ALLOWED_HOSTS=` if you need extra Vite hostnames
- `VITE_TWITCH_EXTENSION_API_BASE_URL=` if you want the standalone extension build to call a different app origin

To test Twitch sign-in, bot behavior, and EventSub locally, also set:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_TOKEN_ENCRYPTION_SECRET`
- `INTERNAL_API_SECRET`
- `ADMIN_TWITCH_USER_IDS`

To test the Twitch panel extension locally, also set:

- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_EXTENSION_SECRET`

For a fuller panel setup and testing flow, see [docs/twitch-panel-extension-local-test.md](/docs/twitch-panel-extension-local-test.md).

Use these Twitch values:

- `TWITCH_CLIENT_ID`: Twitch application client ID for website sign-in and app API access
- `TWITCH_EXTENSION_CLIENT_ID`: Twitch Extension client ID for the panel extension
- `TWITCH_EXTENSION_SECRET`: base64 shared secret from the Twitch Extensions developer console

If you build the panel as a standalone Twitch extension artifact, set `VITE_TWITCH_EXTENSION_API_BASE_URL` to the public app origin that should receive `/api/extension/*` requests. For local iteration this can be your tunnel URL; for production it should be your deployed app URL.

`ADMIN_TWITCH_USER_IDS` should contain the Twitch user ID for the admin account that is allowed to connect the shared bot account and access admin pages.

Broadcaster connections need `channel:bot`, `channel:read:subscriptions`, `bits:read`, and `channel:manage:redemptions` in `TWITCH_SCOPES`. If the connected Twitch account is missing those permissions, reconnect Twitch from the app so bot replies, VIP token automation, and app-owned channel point rewards can use them.

App-owned channel point rewards also require a Twitch Affiliate or Partner channel. Twitch rejects custom reward create/update calls for channels that do not have channel points.

Sentry stays off locally unless you explicitly set a DSN:

- `SENTRY_DSN`

If you want to test Sentry locally, use your own test DSN in `.env` and keep:

- `SENTRY_ENVIRONMENT=development`

Production should keep using the deployed Worker secret for `SENTRY_DSN`.

URL split:

- `.env` is for local development
- if you use a Cloudflare Tunnel or ngrok URL locally, set that URL in `.env` as `APP_URL`
- `.env.deploy` is for real Cloudflare deployments and should use the deployed public app URL, not the local tunnel URL

### 3. Install dependencies

```bash
npm install
```

### 4. Bootstrap the local database

```bash
npm run db:bootstrap:local
```

That does three things:

- resets the local D1 database state
- applies local D1 migrations
- seeds the bundled sample catalog

The bundled sample catalog is intended for local development and preview deployments.
`db:bootstrap:local` is destructive for local D1 data by design.

For day-to-day schema changes during local development, use:

```bash
npm run db:migrate
```

That applies any new checked-in Drizzle SQL migrations to your local D1 database without resetting local data.

### 5. Start the app

```bash
npm run dev
```

The dev server runs on:

```text
http://localhost:9000
```

The repo auto-runs local D1 migrations for `dev`, `test`, and `build`.

### Verification

`npm install` sets up Husky automatically. The standard flow is:

```bash
git commit
git push
```

On commit, the repo runs staged-file Biome fixes/checks. On push, it runs generated-file verification, typecheck, and tests.

Run the same push-time validation locally with:

```bash
npm run check:prepush
```

`npm run lint` uses a compact summary reporter. If you want Biome's full inline diagnostics, use `npm run lint:full`.

Run the full manual sequence only when you specifically want it:

```bash
npm run typecheck
npm run test
npm run format
npm run lint
npm run build
```

If you changed browser-driven flows, also run:

```bash
npm run test:e2e
```

### 6. Twitch application setup for local auth

If you want Twitch login to work locally, your Twitch developer application must include both redirect URIs:

- `http://localhost:9000/auth/twitch/callback`
- `http://localhost:9000/auth/twitch/bot/callback`

Use the same Twitch application values in `.env`:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

### 7. Public HTTPS URL for full local Twitch testing

`localhost` is enough for basic Twitch OAuth testing, but full local testing for this app is easier with a public HTTPS URL because EventSub/webhook flows need a reachable callback.

Primary option: Cloudflare Tunnel with a stable subdomain.

Install `cloudflared`, then authenticate:

```bash
cloudflared login
```

Create a named tunnel:

```bash
cloudflared tunnel create request-bot-dev
```

Create a DNS route for your dev hostname:

```bash
cloudflared tunnel route dns request-bot-dev dev.example.com
```

If that command tries to create the record in the wrong zone, or fails because you manage multiple domains in Cloudflare, create the DNS record manually in the correct zone instead:

- type: `CNAME`
- name: `dev`
- target: `<your-tunnel-id>.cfargotunnel.com`
- proxied: `On`

Example:

```text
dev.example.com -> 4ac1a27b-efe2-402a-a0ae-21ec35d61591.cfargotunnel.com
```

This manual DNS setup is the safer option when the hostname belongs to a different Cloudflare zone than the one `cloudflared` picks automatically.

Create `~/.cloudflared/config.yml` on macOS/Linux, or `%USERPROFILE%\.cloudflared\config.yml` on Windows:

```yaml
tunnel: <your-tunnel-id>
credentials-file: ~/.cloudflared/tunnel-credentials.json

ingress:
  - hostname: dev.example.com
    service: http://localhost:9000
  - service: http_status:404
```

Run the tunnel:

```bash
cloudflared tunnel run <your-tunnel-id>
```

Then update:

- `.env`:
  - `APP_URL=https://dev.example.com`
  - `VITE_ALLOWED_HOSTS=dev.example.com` if needed
- Twitch redirect URIs:
  - `https://dev.example.com/auth/twitch/callback`
  - `https://dev.example.com/auth/twitch/bot/callback`

Alternative: ngrok.

Install ngrok, then run:

```bash
ngrok http 9000
```

Use the generated `https://...ngrok-free.app` URL as:

- `APP_URL`
- Twitch redirect URI base

For ngrok, remember:

- the URL may change between runs unless you use a reserved domain
- when the URL changes, update both `.env` and the Twitch app redirect URIs

### 8. Local bot setup

To test the shared bot flow locally:

1. Sign in with your streamer account at `/auth/twitch/start`.
2. Open `/dashboard/admin` as an admin user.
3. Connect the shared bot account from the admin page.
4. Complete the bot OAuth flow while logged into the Twitch account named in `TWITCH_BOT_USERNAME`.
5. Open `/dashboard/settings` for the streamer account and enable the bot for that channel.

Your Twitch bot account is separate from the streamer login. Regular users do not need bot-level scopes. The bot authorization flow is admin-only.

### What works without Twitch credentials

Without Twitch credentials in `.env`, contributors can run and review:

- homepage
- search
- public playlist pages
- most dashboard UI using the local data

Twitch sign-in, EventSub, and bot replies require valid Twitch app credentials.

For the expanded local setup notes, see [docs/local-development.md](/docs/local-development.md).

## Verification

```bash
npm run check:prepush
```

For extra confidence on deploy-sensitive changes, also run `npm run build`.

## Cloudflare Deploy

High-level deploy flow:

1. Create the Cloudflare resources.
2. Configure local deploy values in `.env.deploy`, including the deployed `APP_URL`.
3. Set Worker secrets with `wrangler secret put`.
4. Bootstrap remote D1.
5. Deploy the backend and frontend Workers.
6. Optionally attach a custom domain to the frontend Worker.
7. Register the Twitch redirect URIs for `APP_URL`.
8. Configure GitHub Actions secrets and variables if you want automatic deploys.

The detailed deploy guide lives in [docs/deployment-workflow.md](/docs/deployment-workflow.md).

Use these config templates for the first remote deploy:

- [wrangler.jsonc](/wrangler.jsonc)
- [wrangler.aux.jsonc](/wrangler.aux.jsonc)

Minimum resources:

- one D1 database
- one KV namespace
- one Queue
- the two Workers in this repo:
  - `request-bot`
  - `request-bot-backend`

Use Wrangler to create the resources:

```bash
npx wrangler login
npx wrangler d1 create request_bot
npx wrangler kv namespace create SESSION_KV
npx wrangler queues create twitch-reply-queue
```

Keep the returned D1 and KV IDs for `.env.deploy`.
The committed Wrangler files stay as templates with placeholder IDs.

Set Worker secrets with Wrangler:

Frontend Worker:

```bash
echo "<TWITCH_CLIENT_ID>" | npx wrangler secret put TWITCH_CLIENT_ID --config wrangler.jsonc
echo "<TWITCH_CLIENT_SECRET>" | npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.jsonc
echo "<TWITCH_TOKEN_ENCRYPTION_SECRET>" | npx wrangler secret put TWITCH_TOKEN_ENCRYPTION_SECRET --config wrangler.jsonc
echo "<TWITCH_EVENTSUB_SECRET>" | npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.jsonc
echo "<TWITCH_EXTENSION_SECRET>" | npx wrangler secret put TWITCH_EXTENSION_SECRET --config wrangler.jsonc
echo "<SESSION_SECRET>" | npx wrangler secret put SESSION_SECRET --config wrangler.jsonc
echo "<ADMIN_TWITCH_USER_IDS>" | npx wrangler secret put ADMIN_TWITCH_USER_IDS --config wrangler.jsonc
echo "<SENTRY_DSN>" | npx wrangler secret put SENTRY_DSN --config wrangler.jsonc
```

Set these non-secret panel values in `.env.deploy`:

- `TWITCH_EXTENSION_CLIENT_ID`
- `VITE_TWITCH_EXTENSION_API_BASE_URL`

Backend Worker:

```bash
echo "<TWITCH_CLIENT_ID>" | npx wrangler secret put TWITCH_CLIENT_ID --config wrangler.aux.jsonc
echo "<TWITCH_CLIENT_SECRET>" | npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.aux.jsonc
echo "<TWITCH_TOKEN_ENCRYPTION_SECRET>" | npx wrangler secret put TWITCH_TOKEN_ENCRYPTION_SECRET --config wrangler.aux.jsonc
echo "<TWITCH_EVENTSUB_SECRET>" | npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.aux.jsonc
echo "<SENTRY_DSN>" | npx wrangler secret put SENTRY_DSN --config wrangler.aux.jsonc
```

If the Worker does not exist yet, `wrangler secret put` creates it and uploads the secret.

Copy the deploy env template:

```bash
cp .env.deploy.example .env.deploy
```

Add the returned D1 and KV IDs to `.env.deploy` instead of editing the committed Wrangler files:

```env
CLOUDFLARE_D1_DATABASE_ID=<d1 database id>
CLOUDFLARE_SESSION_KV_ID=<kv namespace id>
SENTRY_ENVIRONMENT=production
# Optional
SENTRY_TRACES_SAMPLE_RATE=0.1
```

Use:

- `.env` for local development and your tunnel/ngrok URL
- `.env.deploy` for Cloudflare deployment values and the deployed app URL
- the GitHub Actions `APP_URL` repository secret must also use the deployed public app URL, not the local tunnel URL

GitHub Actions does not use a checked-in `.env.deploy` file. The deploy workflows read:

- repository secrets for Cloudflare IDs and tokens
- the repository `APP_URL` secret for the deployed public URL
- repository variables for non-secret runtime values such as `TWITCH_BOT_USERNAME`, `TWITCH_SCOPES`, `SENTRY_ENVIRONMENT`, and optionally `SENTRY_TRACES_SAMPLE_RATE`

The repo generates gitignored deploy configs in `.generated/` from `.env.deploy`, so your real Cloudflare IDs stay out of tracked files.

Sentry runtime notes:

- events are sent whenever `SENTRY_DSN` is present
- local development should use your own test Sentry DSN in `.env`
- the DSN should be set as a Cloudflare Worker secret on both deployed Workers
- release tagging uses the Worker version metadata binding automatically, with `SENTRY_RELEASE` as an optional override
- D1 access is instrumented automatically when Sentry is enabled

Seed the remote D1 database with the bundled catalog:

```bash
npm run db:bootstrap:remote
```

With GitHub production deploys enabled, production schema changes go through pull requests and merge to `main`.
The production GitHub Actions workflow applies remote D1 migrations and deploys the Workers. Contributors run local migrations during development.

Remote-affecting npm scripts are guarded and exit with a helper message outside CI.
That includes:

- `npm run db:migrate:remote`
- `npm run db:seed:sample:remote`
- `npm run db:bootstrap:remote`
- `npm run deploy`

If you intentionally need an operator-only override for maintenance, rerun them with `ALLOW_REMOTE_OPERATIONS=1`.

Deploy with the repo script:

```bash
npm run deploy
```

`npm run deploy` builds the app first, generates gitignored deploy configs in `.generated/`, then deploys backend first and frontend second.

The app works with the frontend Worker's `workers.dev` URL or a custom domain.

If you want a custom domain after the first deploy:

1. Open `Workers & Pages` in Cloudflare.
2. Select the frontend Worker: `request-bot`.
3. Open `Settings` -> `Domains & Routes`.
4. Select `Add` -> `Custom Domain`.
5. Enter the hostname you use for the app.

Use the same URL in:

- `.env.deploy` `APP_URL`
- the GitHub Actions `APP_URL` secret
- Twitch redirect URIs:
  - `https://your-app-host/auth/twitch/callback`
  - `https://your-app-host/auth/twitch/bot/callback`

If you build the standalone Twitch panel artifact, set `VITE_TWITCH_EXTENSION_API_BASE_URL` to the same app URL.

Verify the sample catalog with:

```bash
npx wrangler d1 execute request_bot --remote --config .generated/wrangler.production.jsonc --command "select count(*) as song_count from catalog_songs;"
```

## GitHub And CI/CD

Once the repo is on GitHub, `main` can deploy automatically through the included GitHub Actions workflows.

Production deploys from GitHub Actions apply remote D1 migrations and then deploy the backend and frontend Workers.
The remote migration script is blocked outside CI by default so normal contributor workflows stay local-only.

To enable GitHub deploys:

1. Create the GitHub repository.
2. Create the Cloudflare resources and store the D1/KV IDs in gitignored `.env.deploy` or deployment environment variables.
3. Add GitHub secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_D1_DATABASE_ID`
   - `CLOUDFLARE_SESSION_KV_ID`
   - `APP_URL`
4. Use the deployed public app URL for the `APP_URL` repository secret.
5. Add GitHub variables:
   - `TWITCH_BOT_USERNAME`
   - `TWITCH_SCOPES`
6. Optionally add `CLOUDFLARE_WORKERS_SUBDOMAIN` for preview deploy comments.
7. Protect `main` and require CI for merges.

Find the Cloudflare values here:

- `CLOUDFLARE_ACCOUNT_ID`
  - Cloudflare dashboard
  - select your account
  - copy `Account ID` from the account overview / Workers & Pages overview
- `CLOUDFLARE_API_TOKEN`
  - Cloudflare dashboard
  - profile icon → `My Profile`
  - `API Tokens`
  - `Create Token`
  - create a token scoped to the account you are deploying into

Store those in GitHub Actions:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_D1_DATABASE_ID
gh secret set CLOUDFLARE_SESSION_KV_ID
gh secret set APP_URL --body "https://your-app-host"
gh variable set TWITCH_BOT_USERNAME --body "your_bot_username"
gh variable set TWITCH_SCOPES --body "openid user:read:moderated_channels moderator:read:chatters channel:bot channel:read:subscriptions bits:read channel:manage:redemptions"
```

For the full deploy and GitHub workflow details, use [docs/deployment-workflow.md](/docs/deployment-workflow.md).

## Recommended Codespaces secrets

Set these as Codespaces repository secrets or add them to `.env` inside the Codespace:

- `APP_URL`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_SESSION_KV_ID`
- `TWITCH_CLIENT_ID`
- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_TOKEN_ENCRYPTION_SECRET`
- `TWITCH_EVENTSUB_SECRET`
- `TWITCH_EXTENSION_SECRET`
- `SESSION_SECRET`
- `VITE_TWITCH_EXTENSION_API_BASE_URL`
- `TWITCH_BOT_USERNAME`
- `ADMIN_TWITCH_USER_IDS`
- `TWITCH_SCOPES`

For local development in this repo, the default app URL is `http://localhost:9000`.
