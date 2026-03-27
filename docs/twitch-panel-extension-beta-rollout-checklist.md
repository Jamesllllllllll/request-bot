# Twitch Panel Extension Beta Rollout Checklist

## 1. Choose the final app origin

Use one public app origin for the beta:

- the frontend Worker's `workers.dev` URL
- or a custom domain such as `https://rocklist.live`

Use the same origin everywhere that depends on the app URL.

If you plan to use a custom domain, attach it before you update Twitch settings so the panel and website keep one stable origin.

## 2. Set the production app URL

Set the production app URL in:

- `.env.deploy`
  - `APP_URL=https://your-app-host`
- GitHub Actions production secret
  - `APP_URL=https://your-app-host`

If you build the standalone panel artifact, also set:

- `VITE_TWITCH_EXTENSION_API_BASE_URL=https://your-app-host`

## 3. Attach the custom domain if you use one

If you use a custom domain:

1. Open `Workers & Pages` in Cloudflare.
2. Select the frontend Worker: `request-bot`.
3. Open `Settings` -> `Domains & Routes`.
4. Add the hostname for the app, such as `rocklist.live`.
5. Wait for DNS and certificate provisioning to finish.

The backend Worker does not need a public domain.

## 4. Deploy production

Deploy the production app and backend:

```bash
npm run deploy
```

Confirm the site loads on the final app origin before you update Twitch settings.

## 5. Set production Worker secrets

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

## 6. Update the Twitch developer application

In the Twitch developer console for the website app, set the OAuth redirect URLs for the final app origin:

- `https://your-app-host/auth/twitch/callback`
- `https://your-app-host/auth/twitch/bot/callback`

## 7. Update the Twitch extension version

In the Twitch Extensions console, use the final production app origin for the panel:

- `Request Identity Link`: enabled
- `Allowlist for URL Fetching Domains`: `https://your-app-host`

Keep `Chat Capabilities` disabled unless the panel sends extension chat messages.

## 8. Move the panel from Local Test to Hosted Test

Build the hosted panel files:

```bash
npm run build:extension:panel
```

Upload the contents of:

```text
dist/twitch-extension/panel
```

Set the Hosted Test asset paths for the panel version:

- `Panel Viewer Path`: `index.html`
- `Config Path`: `index.html`
- `Live Config Path`: leave blank unless you add a live config surface

Use Hosted Test for beta channels that should load the production panel without your local dev server or tunnel.

## 9. Set tester access

Add beta channels to:

- `Testing Account Allowlist`

If the version stays unreleased, only accounts on the testing allowlist can install and use the panel in testing mode.

## 10. Verify the beta flows

Verify these paths on the Hosted Test build:

- viewer, unlinked:
  - playlist loads
  - search loads
  - write actions require identity share
- viewer, linked:
  - add request works
  - add VIP request works when a VIP token is available
  - edit current request works
  - remove current request works
- channel owner:
  - playlist moderation controls appear
  - set current, mark played, delete item, and request-kind changes work
- channel moderator:
  - playlist moderation controls follow the channel's moderator capability settings

## 11. Keep the website login expectation clear

The panel identity-share flow does not create a website session.

Opening the website from the panel uses the normal website auth state:

- the website recognizes the user when the browser already has the RockList.Live session cookie
- otherwise the website still requires the normal Twitch OAuth flow
