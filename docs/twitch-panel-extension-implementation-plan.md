# Twitch Panel Extension Implementation Plan

## Purpose

The Twitch panel extension acts as a compact Request Bot client inside Twitch. It lets viewers work with the active channel playlist without using chat commands, and it lets the channel owner or channel moderators perform core playlist actions directly from the panel.

## Current MVP Surface

### Viewer capabilities

- read the playlist without linking identity
- share Twitch identity from the panel
- search the channel-aware catalog
- add a regular request
- add a VIP request when the viewer has a spendable Request Bot VIP token
- edit the current request
- remove the current request
- view VIP token balance and current request usage for the active channel

### Owner and moderator capabilities

- view the current queue in the panel
- set a queued song as current
- mark the current song as played
- delete a playlist item
- switch a request between regular and VIP when the channel permissions allow VIP-token management

## Channel Access Model

- The panel trusts only the verified Twitch Extension JWT.
- The active `channel_id` resolves the Request Bot channel.
- The linked `user_id` resolves or creates the matching Request Bot user by `twitchUserId`.
- The panel resolves access for the current channel as one of:
  - `owner`
  - `moderator`
  - `viewer`
- Moderator access follows the channel's existing moderator capability settings.

## Shared Services

### Viewer request service

Viewer request actions go through the shared viewer-request service.

This keeps the same behavior for:

- request-policy checks
- duplicate checks
- queue-limit checks
- VIP-token spending
- add, edit, and remove behavior

### Playlist management service

Owner and moderator playlist actions go through the shared playlist-management service.

This keeps the same behavior for:

- playlist mutation permissions
- queue mutation calls into the backend worker
- request-kind changes
- audit and actor attribution

## API Surface

### Bootstrap and viewer request routes

- `GET /api/extension/bootstrap`
- `GET /api/extension/search`
- `POST /api/extension/request`
- `POST /api/extension/request/edit`
- `POST /api/extension/request/remove`

### Playlist management route

- `POST /api/extension/playlist`

Supported playlist actions:

- `setCurrent`
- `markPlayed`
- `deleteItem`
- `changeRequestKind`

## Front-End Surface

The panel UI lives in:

- `src/extension/panel/index.html`
- `src/extension/panel/main.tsx`
- `src/extension/panel/app.tsx`

The current panel UI includes:

- compact header with channel title and linked-viewer summary
- playlist and search tabs
- dense queue rows with requester attribution and timestamps
- linked-viewer request highlighting
- transient success and error notices
- loading skeletons during Twitch helper auth and bootstrap
- inline remove confirmation for viewer-owned requests
- compact moderation controls on playlist rows for authorized users

## Twitch Setup

The Twitch extension version should use:

- panel anchor
- request identity link enabled
- URL fetch allowlist for the app origin that serves `/api/extension/*`

Local Test can point at:

- the in-app route: `/extension/panel`
- or the standalone build artifact from `npm run build:extension:panel`

## Hosted Test And Review

The panel is ready for Local Test. Hosted Test and review still require the normal Twitch extension packaging and submission steps:

- upload the built panel artifact
- confirm final allowlists
- confirm reviewer-facing assets and text
- validate the Hosted Test install flow on real test channels

## Recommended MVP Rollout Checklist

Before broader tester rollout, validate these flows with real Twitch accounts:

- viewer, unlinked:
  - panel loads
  - playlist is readable
  - write actions require identity share
- viewer, linked:
  - search works
  - regular request works
  - VIP request works when balance is available
  - edit and remove work
- channel owner:
  - playlist actions appear
  - play now, mark played, delete, and request-kind changes work
- channel moderator:
  - playlist actions appear only when the channel settings allow them
  - actions use the correct capability gates

## Recommended Next Additions

These items fit well after the first tester rollout, but they are not required for the MVP request loop:

- optional link from the panel to the full playlist page on `rocklist.live`
- read-only blacklist and setlist visibility in the panel
- VIP token management tools in the panel
- blacklist and setlist management tools in the panel
- better cross-surface navigation between Twitch and the website

## Website Auth Note

The panel identity-share flow does not create a website session.

If the panel opens `rocklist.live` in a new window:

- the user is signed in on the website only when the browser already has the Request Bot session cookie
- otherwise the website still requires the normal Twitch OAuth flow

## Main Files

- `src/lib/server/extension-auth.ts`
- `src/lib/server/extension-panel.ts`
- `src/lib/server/viewer-request.ts`
- `src/lib/server/playlist-management.ts`
- `src/routes/api/extension/bootstrap.ts`
- `src/routes/api/extension/search.ts`
- `src/routes/api/extension/request.ts`
- `src/routes/api/extension/request/edit.ts`
- `src/routes/api/extension/request/remove.ts`
- `src/routes/api/extension/playlist.ts`
- `src/extension/panel/app.tsx`
- `docs/twitch-panel-extension-local-test.md`
