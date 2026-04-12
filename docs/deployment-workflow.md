# Deployment Workflow

## Deployment Shape

This repo deploys two Workers:

- `request-bot`
- `request-bot-backend`

The frontend Worker binds to the backend Worker, so deploy the backend first.

## Prerequisites

- Cloudflare account
- Wrangler authenticated locally
- Node 22+
- npm

Check Wrangler auth:

```bash
npx wrangler whoami
```

## Cloudflare Resources

Create these once per environment:

- one D1 database
- one KV namespace
- one Queue

Create them with Wrangler:

```bash
npx wrangler d1 create request_bot
npx wrangler kv namespace create SESSION_KV
npx wrangler queues create twitch-reply-queue
```

Keep the returned D1 database ID and KV namespace ID.

The committed [wrangler.jsonc](../wrangler.jsonc) and [wrangler.aux.jsonc](../wrangler.aux.jsonc) stay as templates with placeholder IDs. Real deploy configs are generated into gitignored [`.generated`](../.generated).

## Deploy Environment Values

Copy the deploy template:

```bash
cp .env.deploy.example .env.deploy
```

Fill in:

- `APP_URL`
- `SENTRY_ENVIRONMENT`
- `SENTRY_TRACES_SAMPLE_RATE` when needed
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_SESSION_KV_ID`
- `TWITCH_CLIENT_ID`
- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_TOKEN_ENCRYPTION_SECRET`
- `INTERNAL_API_SECRET`
- `TWITCH_EVENTSUB_SECRET`
- `TWITCH_EXTENSION_SECRET`
- `SESSION_SECRET`
- `ADMIN_TWITCH_USER_IDS`
- `TWITCH_BOT_USERNAME`
- `TWITCH_SCOPES`
- `VITE_TWITCH_EXTENSION_API_BASE_URL` when you build the standalone Twitch panel artifact

Use the deployed public app URL for `APP_URL` and for `VITE_TWITCH_EXTENSION_API_BASE_URL` when the panel talks back to that same deployed app.

## Worker Secrets

Set frontend Worker secrets:

```bash
echo "<TWITCH_CLIENT_ID>" | npx wrangler secret put TWITCH_CLIENT_ID --config wrangler.jsonc
echo "<TWITCH_CLIENT_SECRET>" | npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.jsonc
echo "<TWITCH_TOKEN_ENCRYPTION_SECRET>" | npx wrangler secret put TWITCH_TOKEN_ENCRYPTION_SECRET --config wrangler.jsonc
echo "<INTERNAL_API_SECRET>" | npx wrangler secret put INTERNAL_API_SECRET --config wrangler.jsonc
echo "<TWITCH_EVENTSUB_SECRET>" | npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.jsonc
echo "<TWITCH_EXTENSION_SECRET>" | npx wrangler secret put TWITCH_EXTENSION_SECRET --config wrangler.jsonc
echo "<SESSION_SECRET>" | npx wrangler secret put SESSION_SECRET --config wrangler.jsonc
echo "<ADMIN_TWITCH_USER_IDS>" | npx wrangler secret put ADMIN_TWITCH_USER_IDS --config wrangler.jsonc
echo "<SENTRY_DSN>" | npx wrangler secret put SENTRY_DSN --config wrangler.jsonc
```

Set backend Worker secrets:

```bash
echo "<TWITCH_CLIENT_ID>" | npx wrangler secret put TWITCH_CLIENT_ID --config wrangler.aux.jsonc
echo "<TWITCH_CLIENT_SECRET>" | npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.aux.jsonc
echo "<TWITCH_TOKEN_ENCRYPTION_SECRET>" | npx wrangler secret put TWITCH_TOKEN_ENCRYPTION_SECRET --config wrangler.aux.jsonc
echo "<INTERNAL_API_SECRET>" | npx wrangler secret put INTERNAL_API_SECRET --config wrangler.aux.jsonc
echo "<TWITCH_EVENTSUB_SECRET>" | npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.aux.jsonc
echo "<SENTRY_DSN>" | npx wrangler secret put SENTRY_DSN --config wrangler.aux.jsonc
```

## Remote Database Setup

Initialize the remote D1 database and the bundled sample catalog:

```bash
npm run db:bootstrap:remote
```

Apply only migrations when the seed is already in place:

```bash
npm run db:migrate:remote
```

Remote-affecting scripts are blocked outside CI by default. Use `ALLOW_REMOTE_OPERATIONS=1` only for deliberate operator-driven maintenance.

## Deploy

Preferred deploy path:

```bash
npm run deploy
```

That flow:

1. builds the app
2. generates deploy configs in `.generated/`
3. deploys the backend Worker
4. deploys the frontend Worker

## Custom Domain And Twitch Redirects

The app works on the frontend Worker `workers.dev` URL or on a custom domain.

Use the same final app URL in all of these places:

- `.env.deploy` `APP_URL`
- GitHub Actions `APP_URL` secret
- Twitch redirect URIs
- `VITE_TWITCH_EXTENSION_API_BASE_URL` for the standalone panel artifact

Twitch redirect URIs:

- `https://your-app-host/auth/twitch/callback`
- `https://your-app-host/auth/twitch/bot/callback`

If you use a custom domain, attach it to the frontend Worker in Cloudflare `Workers & Pages -> request-bot -> Settings -> Domains & Routes`.

## GitHub Actions

The repo includes:

- CI on pull requests
- preview deploys on pull requests
- production deploys on push to `main`

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_SESSION_KV_ID`
- `APP_URL`

Required GitHub repository variables:

- `TWITCH_BOT_USERNAME`
- `TWITCH_SCOPES`
- `SENTRY_ENVIRONMENT`

Optional:

- `CLOUDFLARE_WORKERS_SUBDOMAIN`

Production deploys apply remote D1 migrations and then deploy the backend and frontend Workers.

Preview deploys create isolated Worker names, but they do not provision dedicated D1, KV, or Queue resources and they do not register cron triggers or queue consumers.

## Twitch Panel Hosted Test

Build and package the standalone panel artifact locally when you need a fresh Twitch upload:

```bash
npm run build:extension:package
```

When the panel talks to a deployed app origin, set the API base URL in the same shell before building:

```bash
VITE_TWITCH_EXTENSION_API_BASE_URL=https://your-app-host npm run build:extension:package
```

The zip lands under:

```text
output/twitch-extension/request-bot-panel-YYYYMMDD-HHmmss.zip
```

The zip contains the contents of `dist/twitch-extension/panel` directly, so `index.html`, `assets`, and `backgrounds` sit at the archive root.

For the full hosted-test rollout checklist, use [docs/twitch-panel-extension-beta-rollout-checklist.md](twitch-panel-extension-beta-rollout-checklist.md).
