# Twitch Panel Extension Local Test

## Panel entry points

Use either panel entry point:

- in-app panel route: `/extension/panel`
- standalone extension artifact build: `npm run build:extension:panel`

The in-app route is useful while building the UI inside the existing app shell and API environment. The standalone build is the artifact path for Twitch Hosted Test and review.

## Required environment values

Add these values before testing the Twitch panel flow:

- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_EXTENSION_SECRET`
- `VITE_TWITCH_EXTENSION_API_BASE_URL`

Notes:

- `TWITCH_EXTENSION_CLIENT_ID` is the Twitch Extension client ID from the Twitch developer console.
- `TWITCH_EXTENSION_SECRET` must be the base64 shared secret from the Twitch Extensions developer console.
- `VITE_TWITCH_EXTENSION_API_BASE_URL` should point at the app origin that serves the `/api/extension/*` endpoints.
- For local development, `VITE_TWITCH_EXTENSION_API_BASE_URL` can be a tunnel URL if Twitch cannot reach `localhost`.

## Useful commands

Run the app:

```bash
npm run dev
```

Build the standalone panel artifact:

```bash
npm run build:extension:panel
```

For any build that should call a deployed app origin, set the API base URL in the same shell before you build:

```bash
VITE_TWITCH_EXTENSION_API_BASE_URL=https://your-app-host npm run build:extension:panel
```

The built panel artifact is written to:

```text
dist/twitch-extension/panel
```

## Local workflow

Without Twitch Local Test:

- validate the backend contract with unit tests
- open the in-app route at `/extension/panel`
- let the route load the Twitch helper and wait for `onAuthorized`
- confirm the waiting state before Twitch provides panel authorization

With Twitch Local Test:

1. Run the app locally or expose it through a tunnel.
2. Make sure `APP_URL` and `VITE_TWITCH_EXTENSION_API_BASE_URL` match the origin that Twitch can reach.
3. Point the extension panel view to the app route or the built standalone artifact URL.
4. Open Twitch Local Test and confirm:
   - bootstrap succeeds
   - unlinked viewers can read the queue
   - linked viewers can search and submit requests
   - VIP token balance is shown
   - edit/remove works for the linked viewer
   - channel owners can use playlist actions from the panel
   - channel moderators can use playlist actions when the channel settings allow them

## Website auth note

Opening the website from the panel does not create a website session.

The website recognizes the viewer only when the browser already has the normal RockList.Live session cookie. Otherwise the viewer still signs in through the website Twitch OAuth flow.

## After Local Test

- package the final hosted panel artifact for Twitch Hosted Test
- rebuild and re-upload the Hosted Test zip whenever panel code or `VITE_TWITCH_EXTENSION_API_BASE_URL` changes
- add review-prep notes for fetched URLs and enabled capabilities
- validate the full identity-share flow with a real extension registration
