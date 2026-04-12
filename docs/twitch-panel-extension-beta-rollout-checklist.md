# Twitch Panel Extension Beta Rollout Checklist

## 1. Choose The Production App Origin

Use one public app origin for the website and the panel API:

- the frontend Worker `workers.dev` URL
- or a custom domain such as `https://rocklist.live`

## 2. Set The Production App URL

Set the same app URL in:

- `.env.deploy` `APP_URL`
- GitHub Actions `APP_URL` secret
- `VITE_TWITCH_EXTENSION_API_BASE_URL` when you build the standalone panel artifact

## 3. Deploy Production

```bash
npm run deploy
```

Confirm the site loads on the final app origin before you update the Twitch extension settings.

## 4. Set Worker Secrets

Make sure the frontend Worker has:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_EVENTSUB_SECRET`
- `TWITCH_EXTENSION_SECRET`
- `SESSION_SECRET`
- `ADMIN_TWITCH_USER_IDS`
- `SENTRY_DSN` when Sentry is enabled

Make sure the backend Worker has:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_EVENTSUB_SECRET`
- `SENTRY_DSN` when Sentry is enabled

## 5. Update Twitch

Website app redirect URIs:

- `https://your-app-host/auth/twitch/callback`
- `https://your-app-host/auth/twitch/bot/callback`

Twitch extension settings:

- `Request Identity Link`: enabled
- `Allowlist for URL Fetching Domains`: `https://your-app-host`

## 6. Build And Upload The Hosted Test Artifact

```bash
VITE_TWITCH_EXTENSION_API_BASE_URL=https://your-app-host npm run build:extension:panel
```

Upload:

```text
dist/twitch-extension/panel
```

Hosted Test asset paths:

- `Panel Viewer Path`: `index.html`
- `Config Path`: `index.html`

## 7. Add Tester Access

Add the intended beta accounts to the Twitch extension `Testing Account Allowlist`.

## 8. Verify The Beta Flows

- unlinked viewer: playlist and search load, write actions require identity share
- linked viewer: add, VIP add, edit, and remove work
- owner: queue moderation controls appear and work
- moderator: controls follow the channel’s moderator permission settings

If a production panel request fails, check the frontend Worker logs for panel bootstrap and state traces.
