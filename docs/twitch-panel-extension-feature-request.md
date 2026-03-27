# Feature Request: Twitch Panel Extension For Playlist Viewing And Viewer Song Requests

## Problem or use case

Request Bot currently supports public playlist viewing, chat-command requests, and dashboard playlist management. It does not yet offer a Twitch-native request experience directly on the channel page.

This leaves a product gap for streamers and viewers who want:

- a Twitch-native queue surface that does not depend on OBS setup
- a way to browse the live playlist without leaving Twitch
- a way for viewers to search and submit requests without learning chat commands
- a way for viewers to edit or remove their own requests from Twitch
- a way for viewers to spend their existing Request Bot VIP tokens from Twitch

## Proposed solution

Add a Twitch panel extension that acts as a compact, channel-aware Request Bot client inside Twitch.

The panel extension should:

- render the current playlist and now-playing state for the active channel
- show requester attribution on queue items
- allow read-only access to queue state without requiring identity sharing
- prompt viewers to share Twitch identity before allowing write actions
- let identity-linked viewers search the channel catalog and add a regular song request
- let identity-linked viewers add a VIP request when they have a spendable Request Bot VIP token balance
- let identity-linked viewers edit their own active request
- let identity-linked viewers remove their own active request
- show the linked viewer's current request state and VIP token balance for that channel
- enforce the same core request-policy rules used by chat requests and website viewer requests
- keep broadcaster and moderator removal controls in the main app so extension-submitted content can still be moderated from existing tooling

## Additional context

### Foundation dependency

Website-based viewer requests on `/$slug` should ship before the panel extension. The panel should reuse the same shared viewer-request service, request-state model, and queue mutation rules instead of becoming the first non-chat write surface.

### Current code we can reuse

- Public playlist reads: `src/routes/api/channel/$slug/playlist/route.ts`
- Public playlist streaming: `src/routes/api/channel/$slug/playlist/stream.ts`
- Channel-aware search with blacklist filtering: `src/routes/api/search/route.ts`
- Public channel page composition: `src/routes/$slug/index.tsx`
- Queue mutation primitives: `src/workers/backend/index.ts`
- Existing add/remove/change request behavior: `src/lib/eventsub/chat-message.ts`
- Existing playlist/request policy helpers: `src/lib/request-policy.ts`
- Existing requester ownership model and VIP token persistence: `src/lib/db/schema.ts`

### Main technical requirements

- This feature requires an Extension Backend Service (EBS).
- All panel write actions must verify the Twitch Extension JWT on the server.
- The verified Twitch channel ID must resolve the current Request Bot channel.
- The verified linked Twitch user ID must resolve the viewer identity used for request ownership and VIP token balance checks.
- Request Bot VIP token spending should be supported from the panel MVP because token lookup and consumption already belong to app-owned data.

### Bits follow-up

Twitch supports Bits in Extensions for panels, so a later version could offer a Bits-backed VIP request purchase flow. That should be treated as a follow-up feature after the core linked-identity request flow is working.

### Twitch documentation that drives this request

- Extensions Reference: <https://dev.twitch.tv/docs/extensions/reference/>
- Building Extensions: <https://dev.twitch.tv/docs/extensions/building/>
- Using the Twitch API in an Extension Front End: <https://dev.twitch.tv/docs/extensions/frontend-api-usage/>
- Life Cycle Management: <https://dev.twitch.tv/docs/extensions/life-cycle>
- Submission Best Practices: <https://dev.twitch.tv/docs/extensions/submission-best-practices/>
- Guidelines and Policies: <https://dev.twitch.tv/docs/extensions/guidelines-and-policies>
- Twitch API Reference: <https://dev.twitch.tv/docs/api/reference>
- Bits in Extensions: <https://dev.twitch.tv/extensions/bits/>

### Acceptance criteria

- A Twitch panel extension can be installed on a connected Request Bot channel.
- The panel can load channel playlist state using the active Twitch channel context.
- Unlinked viewers can view the playlist without write access.
- Identity-linked viewers can add a regular request from the panel.
- Identity-linked viewers with spendable Request Bot VIP tokens can add a VIP request from the panel.
- Identity-linked viewers can edit or remove their own request from the panel.
- The panel shows the linked viewer's current VIP token balance for the active channel.
- Request policy enforcement matches the shared viewer-request service used by chat and the website.
- Queue rows clearly display the requester username.
- Broadcasters can remove extension-submitted content using existing channel management tools.
- The extension is documented, testable in Twitch hosted test, and review-ready.

### Follow-up documentation

Implementation details live in:

- `docs/twitch-panel-extension-implementation-plan.md`
