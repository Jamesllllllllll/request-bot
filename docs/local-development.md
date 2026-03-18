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
- dashboard UI
- playlist management flows

To exercise Twitch login, EventSub, and bot replies, fill in the Twitch-related values in `.env`.

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
credentials-file: ~/.cloudflared/tunnel-credentials.json

ingress:
  - hostname: dev.example.com
    service: http://localhost:9000
  - service: http_status:404
```

Windows example:

```yaml
tunnel: <your-tunnel-id>
credentials-file: ~/.cloudflared/tunnel-credentials.json

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
  - `VITE_ALLOWED_HOSTS=dev.example.com` if Vite blocks the hostname
- Twitch app redirect URIs
  - `https://dev.example.com/auth/twitch/callback`
  - `https://dev.example.com/auth/twitch/bot/callback`

#### ngrok

As an alternative:

```bash
ngrok http 9000
```

Use the generated HTTPS URL for:

- `APP_URL`
- Twitch redirect URI base

If the ngrok URL changes, update both `.env` and the Twitch app redirect URIs.

### Daily commands

Lint:

```bash
npm run lint
```

Typecheck:

```bash
npm run typecheck
```

Tests:

```bash
npm run test
```

Production build:

```bash
npm run build
```

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
