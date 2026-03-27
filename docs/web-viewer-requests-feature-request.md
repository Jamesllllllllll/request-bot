# Feature Request: Signed-In Viewer Requests On Channel Playlist Pages

## Problem or use case

Request Bot already has the public channel playlist page at `/$slug`, but signed-in viewers still cannot add requests from within the app. The current experience tells non-managers to copy chat commands and use Twitch chat, even though the page already knows who the signed-in viewer is and already contains the channel-aware search UI.

This leaves a product gap for viewers who:

- are already on a streamer's playlist page and want to request from there
- want a normal sign-in-and-click flow instead of remembering chat commands
- want to see their current request state before submitting another song
- want to see their Request Bot VIP token balance for the current channel
- want to spend a VIP token directly from the website with an `Add VIP` action

This also leaves an architecture gap because the planned Twitch panel extension needs a non-chat viewer request foundation in the app before it adds Twitch-specific auth and packaging on top.

## Proposed solution

Add viewer-authenticated request flows to the public channel playlist page (`/$slug`).

The page should:

- prompt signed-out viewers to sign in with Twitch before submitting a request
- show the signed-in viewer's profile avatar and identity on the channel page
- show the viewer's current Request Bot VIP token balance for the viewed channel
- let the viewer add a regular request from search results
- let the viewer add a VIP request from search results when they have a spendable token
- show the viewer's current active request state
- let the viewer edit or remove their own active request
- enforce the same core request rules used by chat commands
- establish the shared server-side request service that the later Twitch panel extension will reuse

## Additional context

### Current code we can reuse

- Public channel page: `src/routes/$slug/index.tsx`
- Public playlist reads: `src/routes/api/channel/$slug/playlist/route.ts`
- Viewer session API: `src/routes/api/session.ts`
- Session-backed viewer helper: `src/lib/server/viewer.ts`
- Search UI with injected action rendering: `src/components/song-search-panel.tsx`
- Search API with channel-aware filtering: `src/routes/api/search/route.ts`
- Queue mutation primitives: `src/workers/backend/index.ts`
- Existing request behavior and VIP token handling: `src/lib/eventsub/chat-message.ts`
- Playlist mutation/auth helpers: `src/lib/server/playlist-management.ts`

### Existing app and docs already point toward this

- `src/routes/$slug/index.tsx` already fetches session state and computes a `currentViewer`
- `src/components/song-search-panel.tsx` already supports custom action rendering instead of chat-command copy buttons
- `docs/channel-first-architecture-plan.md` already calls for "viewer-specific request affordances" on `/$slug`

### Main technical gap

The app currently has no viewer-authenticated request mutation path outside chat.

Today:

- `GET /api/channel/$slug/playlist` supports anonymous and signed-in read access
- `POST /api/channel/$slug/playlist` is limited to owner/moderator playlist management actions
- viewer request logic is still coupled to the EventSub chat pipeline

### Why this should happen before the panel extension

This feature establishes:

- the first signed-in viewer write surface in the app
- the shared viewer-request service that panel endpoints should reuse
- the viewer request-state model that later panel bootstrap can mirror

### Acceptance criteria

- A signed-out viewer on `/$slug` sees a clear sign-in CTA for requesting songs.
- A signed-in viewer sees their profile identity on the page.
- A signed-in viewer sees their current VIP token balance for the viewed channel.
- A signed-in viewer can add a regular request from search results.
- A signed-in viewer with a spendable token can add a VIP request from search results.
- A signed-in viewer can edit or remove their own active request from the page.
- Request policy enforcement matches the shared request service used by chat.
- The implementation is documented so the Twitch panel extension can reuse the same server-side architecture later.

### Follow-up documentation

Implementation details live in:

- `docs/web-viewer-requests-implementation-plan.md`
