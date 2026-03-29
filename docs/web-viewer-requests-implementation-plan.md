# Web Viewer Requests Architecture

## Current flow

- `GET /api/channel/$slug/playlist` returns the public playlist read model plus channel rule state for the page.
- `GET /api/channel/$slug/viewer-request` returns the signed-in viewer request state for the same channel.
- `POST /api/channel/$slug/viewer-request` handles submit and remove actions for the signed-in viewer.
- `src/lib/server/viewer-request.ts` resolves the effective viewer, loads request state, and performs the shared mutation flow.
- `src/lib/request-policy.ts` evaluates requester access, blacklist and setlist rules, request limits, and channel search filters.

## Request access

- Playlist viewing stays public for everyone.
- Signed-in viewers mutate only their own requests.
- Blocked viewers receive read-only access to the page and the search surface.
- Owner and moderator playlist management continues to use `src/lib/server/playlist-management.ts`.

## Search behavior

- Search uses `src/routes/api/search/route.ts`.
- Blacklisted artists, charters, songs, and versions hide by default only when the channel blacklist is enabled.
- The website can reveal blacklisted search results with the `Show blacklisted songs` toggle.
- Search filters stay aligned with submit-time policy checks.

## UI behavior

- The page shows request buttons only when the signed-in viewer has request access.
- Signed-out viewers and blocked viewers keep the search surface and command-copy actions.
- Active request state, remove actions, and VIP token balance refresh with the playlist after viewer mutations.
