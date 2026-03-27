# Deployment Workflow

## What exists

### Deployment shape

This repo deploys two Cloudflare Workers:

- `request-bot` for the app frontend and server routes
- `request-bot-backend` for playlist mutations, queue consumers, and scheduled work

The frontend Worker has a service binding to the backend Worker, so the backend deploys first.

### Prerequisites

- Cloudflare account
- Wrangler authenticated locally
- Node 22+
- npm

Check Wrangler auth:

```bash
npx wrangler whoami
```

If needed:

```bash
npx wrangler login
```

### Cloudflare resources to create

Create these resources once per environment:

- one D1 database
- one KV namespace
- one Queue

Create them with Wrangler:

```bash
npx wrangler d1 create request_bot
npx wrangler kv namespace create SESSION_KV
npx wrangler queues create twitch-reply-queue
```

Keep the command output. You will need:

- the D1 `database_id`
- the KV namespace `id`

### Keep committed Wrangler files as templates

The committed [wrangler.jsonc](/C:/Users/james/Documents/Projects/request-bot/wrangler.jsonc) and [wrangler.aux.jsonc](/C:/Users/james/Documents/Projects/request-bot/wrangler.aux.jsonc) keep placeholder IDs on purpose.

Do not commit your real Cloudflare resource IDs into those files.

This repo generates gitignored deploy configs in `.generated/` from `.env.deploy`.

The committed template files keep these stable values:

- frontend Worker name: `request-bot`
- backend Worker name: `request-bot-backend`
- frontend service binding: `BACKEND_SERVICE -> request-bot-backend`
- queue name: `twitch-reply-queue`

The Durable Object migration for `ChannelPlaylistDurableObject` is already declared in [wrangler.aux.jsonc](/C:/Users/james/Documents/Projects/request-bot/wrangler.aux.jsonc). You do not need to create it separately.

### Environment values

Set these in `.env.deploy` before a real deployment:

- `APP_URL`
- `SENTRY_ENVIRONMENT`
- `SENTRY_TRACES_SAMPLE_RATE` (optional)
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_SESSION_KV_ID`
- `TWITCH_CLIENT_ID`
- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_EVENTSUB_SECRET`
- `TWITCH_EXTENSION_SECRET`
- `SESSION_SECRET`
- `TWITCH_BOT_USERNAME`
- `ADMIN_TWITCH_USER_IDS`
- `VITE_TWITCH_EXTENSION_API_BASE_URL` when you build the standalone Twitch panel artifact

Use these Twitch values:

- `TWITCH_CLIENT_ID`: Twitch application client ID for website sign-in and app API access
- `TWITCH_EXTENSION_CLIENT_ID`: Twitch Extension client ID for the panel extension
- `TWITCH_EXTENSION_SECRET`: base64 shared secret from the Twitch Extensions developer console

The checked-in default broadcaster scope is:

```text
openid user:read:moderated_channels channel:bot
```

Notes:

- `.dev.vars` does not need to be committed. It is a generated local artifact used by the build/dev tooling.
- `.generated/` is gitignored and is where the deploy configs are written.
- `SESSION_KV`, `DB`, `TWITCH_REPLY_QUEUE`, `BACKEND_SERVICE`, and `CHANNEL_PLAYLIST_DO` are bindings, not secrets.
- local CLI deploys read `.env.deploy`
- GitHub Actions only need these repository values:
  - secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_SESSION_KV_ID`, `APP_URL`
  - variables: `TWITCH_BOT_USERNAME`, `TWITCH_SCOPES`
- Twitch and session secrets are set on the Cloudflare Workers with `wrangler secret put`, not as GitHub repository secrets for this deploy workflow

### Worker secrets

Set secrets per Worker with Wrangler.

Frontend Worker (`request-bot`) required secrets:

```bash
echo "<TWITCH_CLIENT_ID>" | npx wrangler secret put TWITCH_CLIENT_ID --config wrangler.jsonc
echo "<TWITCH_CLIENT_SECRET>" | npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.jsonc
echo "<TWITCH_EVENTSUB_SECRET>" | npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.jsonc
echo "<TWITCH_EXTENSION_SECRET>" | npx wrangler secret put TWITCH_EXTENSION_SECRET --config wrangler.jsonc
echo "<SESSION_SECRET>" | npx wrangler secret put SESSION_SECRET --config wrangler.jsonc
echo "<ADMIN_TWITCH_USER_IDS>" | npx wrangler secret put ADMIN_TWITCH_USER_IDS --config wrangler.jsonc
echo "<SENTRY_DSN>" | npx wrangler secret put SENTRY_DSN --config wrangler.jsonc
```

Backend Worker (`request-bot-backend`) required secrets:

```bash
echo "<TWITCH_CLIENT_ID>" | npx wrangler secret put TWITCH_CLIENT_ID --config wrangler.aux.jsonc
echo "<TWITCH_CLIENT_SECRET>" | npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.aux.jsonc
echo "<TWITCH_EVENTSUB_SECRET>" | npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.aux.jsonc
echo "<SENTRY_DSN>" | npx wrangler secret put SENTRY_DSN --config wrangler.aux.jsonc
```

Notes:

- if the Worker does not exist yet, `wrangler secret put` creates it before uploading the secret
- `SESSION_SECRET` is only needed by the frontend Worker because it signs and verifies sessions
- `TWITCH_EXTENSION_SECRET` is only needed by the frontend Worker because it verifies extension JWTs on `/api/extension/*`
- `SESSION_KV` is a KV binding, not a secret
- `TWITCH_BOT_USERNAME` and `TWITCH_SCOPES` are not secrets
- `TWITCH_EXTENSION_CLIENT_ID` and `VITE_TWITCH_EXTENSION_API_BASE_URL` are not secrets and belong in `.env.deploy`
- `ADMIN_TWITCH_USER_IDS` is only needed by the frontend Worker
- Sentry is enabled whenever `SENTRY_DSN` is present
- local development can use a personal test DSN in `.env`
- `SENTRY_DSN` should be set on both Workers so frontend/server routes and backend worker errors report to the same Sentry project
- `SENTRY_TRACES_SAMPLE_RATE` is optional and defaults to `0`
- release tagging uses Cloudflare Worker version metadata automatically, with `SENTRY_RELEASE` available as an override if you want one

### Initialize remote data

Apply migrations and load the bundled sample catalog:

```bash
npm run db:bootstrap:remote
```

That runs:

- remote D1 migrations
- sample catalog seed import

If you only need migrations:

```bash
npm run db:migrate:remote
```

Use the remote migration commands above for initial environment setup and deliberate operator-driven maintenance.
Once GitHub production deploys are enabled, normal production schema changes should land through pull requests and be migrated by CI after merge to `main`.

Remote-affecting npm scripts are blocked outside CI by default and print a helper that points contributors back to the local workflow.
If you intentionally need an operator-only override, run:

```bash
ALLOW_REMOTE_OPERATIONS=1 npm run db:migrate:remote
```

The same override applies to:

- `npm run db:seed:sample:remote`
- `npm run db:bootstrap:remote`
- `npm run deploy`

The sample seed works remotely without an explicit SQL transaction wrapper. Remote D1 rejects uploaded seed files that include `BEGIN TRANSACTION` / `COMMIT`.

### Local migrations for contributors

Contributors should apply schema changes to local D1 only:

```bash
npm run db:migrate
```

For a clean local rebuild with sample data:

```bash
npm run db:bootstrap:local
```

Use `db:migrate` for normal local schema updates.
Use `db:bootstrap:local` when you want to reset local state completely.

### Deploy from your machine

Preferred:

```bash
npm run deploy
```

`npm run deploy`:

1. builds the app
2. generates built deploy configs in `.generated/`
3. deploys the backend Worker
4. deploys the frontend Worker

The frontend Worker cannot be deployed directly from the source `wrangler.jsonc` file because its Worker entry is generated during `vite build`.

### Custom domain

The app works with the frontend Worker's `workers.dev` URL or a custom domain.

Use the deployed public app URL in `APP_URL`.

If you want a custom domain, attach it to the frontend Worker:

1. In the Cloudflare dashboard, open `Workers & Pages`.
2. Select the frontend Worker: `request-bot`.
3. Open `Settings` -> `Domains & Routes`.
4. Select `Add` -> `Custom Domain`.
5. Enter the hostname you use for the app, such as `rocklist.live`.
6. Wait for Cloudflare to finish DNS and certificate provisioning.

Use the same deployed app URL in every place that depends on the app origin:

- `.env.deploy`
  - `APP_URL=https://your-app.workers.dev` or `https://your-app.example.com`
- GitHub Actions production secret
  - `APP_URL=https://your-app.workers.dev` or `https://your-app.example.com`
- Twitch developer application redirect URIs
  - `https://your-app-host/auth/twitch/callback`
  - `https://your-app-host/auth/twitch/bot/callback`

If you build the standalone Twitch panel artifact, set:

- `VITE_TWITCH_EXTENSION_API_BASE_URL=https://your-app-host`

For the production Twitch panel rollout steps, use:

- [docs/twitch-panel-extension-beta-rollout-checklist.md](/docs/twitch-panel-extension-beta-rollout-checklist.md)

### Verify remote data

After `npm run db:bootstrap:remote`, confirm the sample catalog exists:

```bash
npx wrangler d1 execute request_bot --remote --config .generated/wrangler.production.jsonc --command "select count(*) as song_count from catalog_songs;"
```

### GitHub deployment workflow

This repo includes:

- CI on pull requests
- preview deploy workflow for pull requests
- production deploy workflow on push to `main`

#### GitHub secrets

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_SESSION_KV_ID`
- `APP_URL`

Optional:

- `CLOUDFLARE_WORKERS_SUBDOMAIN`

Add these repository variables:

- `TWITCH_BOT_USERNAME`
- `TWITCH_SCOPES`
- `SENTRY_ENVIRONMENT`

Use the deployed public URL here, not your local tunnel URL.

Where to find them:

- `CLOUDFLARE_ACCOUNT_ID`
  - Cloudflare dashboard
  - select the target account
  - copy `Account ID` from the account overview or Workers & Pages overview
- `CLOUDFLARE_API_TOKEN`
  - Cloudflare dashboard
  - profile icon → `My Profile`
  - `API Tokens`
  - `Create Token`
  - create a token scoped to the account you are deploying into
  - if deploys fail on `/workers/subdomain` or `/workers/scripts/.../schedules`, replace this token with a fresh one scoped to the same account as the D1/KV/Workers resources

CLI setup example:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_D1_DATABASE_ID
gh secret set CLOUDFLARE_SESSION_KV_ID
gh secret set APP_URL --body "https://your-production-url.example"
gh variable set TWITCH_BOT_USERNAME --body "your_bot_username"
gh variable set TWITCH_SCOPES --body "openid user:read:moderated_channels channel:bot"
gh variable set SENTRY_ENVIRONMENT --body "production"
```

#### Production deploy

The production workflow:

- runs lint, typecheck, tests, and build
- applies remote D1 migrations
- generates built production Wrangler configs
- deploys backend first
- deploys frontend second

Recommended practice:

- do not apply production D1 migrations from contributor machines
- let GitHub Actions apply remote migrations during the production deploy workflow after changes land on `main`

#### Preview deploys

The preview workflow:

- creates preview Worker names per PR
- rewrites service bindings so preview frontend talks to preview backend
- builds the app before generating preview deploy configs
- removes backend cron triggers from preview Workers
- removes backend queue consumers from preview Workers
- deploys both preview Workers

Important:

- preview Worker names are isolated
- D1, KV, and Queue resources are not automatically created per preview
- preview deployments do not register scheduled cron triggers, which avoids Cloudflare account cron limits for per-PR Workers
- preview deployments do not register queue consumers, which avoids conflicts with the single consumer attached to the shared queue
- use a dedicated staging resource set before relying on preview deploys for contributors

### First deployment checklist

1. `npx wrangler login`
2. Create D1, KV, and Queue
3. Copy `.env.deploy.example` to `.env.deploy`
4. Set `CLOUDFLARE_D1_DATABASE_ID` and `CLOUDFLARE_SESSION_KV_ID` in `.env.deploy`
5. Set Worker secrets with `wrangler secret put`
6. Set the other required `.env.deploy` values, including `APP_URL` and `SENTRY_ENVIRONMENT=production`
7. Run `npm run db:bootstrap:remote`
8. Run `npm run deploy`
9. If you want a custom domain, attach it to the frontend Worker `request-bot` and update `APP_URL`
10. Set the GitHub Actions `APP_URL` secret to the same deployed URL
11. Register the Twitch redirect URIs for `APP_URL`
12. Open the deployed `APP_URL` and test sign-in, dashboard, and search
