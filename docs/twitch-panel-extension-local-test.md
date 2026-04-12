# Twitch Panel Extension Local Test

## Entry Points

Use either panel entry point:

- in-app route: `/extension/panel`
- standalone artifact build: `npm run build:extension:panel`

The in-app route is the fastest local UI path. The standalone build is the Hosted Test artifact path.

## Required Values

Add these values before testing the panel end to end:

- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_EXTENSION_SECRET`
- `VITE_TWITCH_EXTENSION_API_BASE_URL`

`VITE_TWITCH_EXTENSION_API_BASE_URL` should point at the app origin that serves `/api/extension/*`.

## Commands

Run the local app:

```bash
npm run dev
```

Build the standalone panel artifact:

```bash
npm run build:extension:panel
```

Build against a deployed app origin:

```bash
VITE_TWITCH_EXTENSION_API_BASE_URL=https://your-app-host npm run build:extension:panel
```

The built artifact is written to:

```text
dist/twitch-extension/panel
```

## Local Workflow

Without Twitch Local Test:

- open `/extension/panel`
- confirm the waiting state before Twitch authorization is available
- validate the local UI states and local API responses

With Twitch Local Test:

1. Run the app locally or through a tunnel.
2. Make `APP_URL` and `VITE_TWITCH_EXTENSION_API_BASE_URL` match the origin Twitch can reach.
3. Point the extension panel view at the app route or the built artifact URL.
4. Verify:

- unlinked viewers can read the queue
- linked viewers can search and submit requests
- blocked viewers stay read-only
- VIP token balances and request costs are shown
- edit and remove work for the linked viewer
- owner controls appear for the channel owner
- moderator controls follow the configured channel permissions

## Website Session Note

The panel identity-share flow does not create a normal website session.

The website recognizes the viewer only when the browser already has the standard RockList.Live session cookie. Otherwise the viewer still signs in through the normal website OAuth flow.
