# Web Viewer Requests

RockList.Live lets viewers request songs directly from a channel playlist page at `/$slug`.

## Viewer experience

- Playlist viewing stays public.
- Signed-in viewers see their Twitch identity, VIP token balance, and active request state for the current channel.
- Signed-in viewers can add a regular request or a VIP request from search results when channel rules allow it.
- When the channel enables request-path modifiers, signed-in viewers can choose a path before submitting a request.
- Signed-in viewers can replace or remove their own active requests.
- Blocked viewers can still sign in, browse the playlist, search the catalog, and copy the request commands. Request buttons stay unavailable.

## Search and request rules

- Viewer requests use the same shared request-policy service as chat requests and extension requests.
- Channel blacklist rules hide blocked results by default when the blacklist is enabled.
- The website can reveal blacklisted results with the public `Show blacklisted songs` toggle.
- Channel request filters such as official-only, allowed tunings, and required parts stay active during search and submit checks.
- Viewer requests still run server-side validation for request limits, VIP token balance, setlist rules, queue limits, and blocked-requester checks.
- Detailed path-modifier and VIP-token combinations live in `docs/request-modifier-vip-token-rules.md`.

## Main surfaces

- Public page UI: `src/routes/$slug/index.tsx`
- Viewer request service: `src/lib/server/viewer-request.ts`
- Shared request policy: `src/lib/request-policy.ts`
- Viewer request route: `src/routes/api/channel/$slug/viewer-request.ts`
