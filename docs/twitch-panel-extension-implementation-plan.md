# Twitch Panel Extension Implementation Plan

## Goal

Build a Twitch panel extension that lets viewers:

- view the current playlist for the channel they are watching
- search songs from within Twitch
- add a regular song request without using chat commands
- spend an existing Request Bot VIP token to add a VIP request
- edit their own active request
- remove their own active request

The panel should reuse as much of the current Request Bot backend, playlist model, and request-policy logic as possible. It should build on the same shared viewer-request service that powers website viewer requests.

## Foundational dependency

Before the panel is implemented, Request Bot should support signed-in viewer requests on the website channel page (`/$slug`).

Why this should come first:

- it establishes the first non-chat viewer write path using app-owned auth
- it forces extraction of shared request-policy logic out of `src/lib/eventsub/chat-message.ts`
- it gives the panel a proven request-state model to reuse
- it avoids making the panel extension the first place where viewer add/edit/remove behavior is defined

The panel should be treated as the Twitch-native transport and UI layer on top of that shared foundation, not as a separate request system.

## Official Twitch docs reviewed

Reviewed on March 26, 2026.

- Extensions Reference: <https://dev.twitch.tv/docs/extensions/reference/>
- Building Extensions: <https://dev.twitch.tv/docs/extensions/building/>
- Using the Twitch API in an Extension Front End: <https://dev.twitch.tv/docs/extensions/frontend-api-usage/>
- Life Cycle Management: <https://dev.twitch.tv/docs/extensions/life-cycle>
- Submission Best Practices: <https://dev.twitch.tv/docs/extensions/submission-best-practices/>
- Guidelines and Policies: <https://dev.twitch.tv/docs/extensions/guidelines-and-policies>
- Twitch API Reference: <https://dev.twitch.tv/docs/api/reference>
- Required Technical Background: <https://dev.twitch.tv/docs/extensions/required-technical-background/>
- Bits in Extensions: <https://dev.twitch.tv/extensions/bits/>

## Key Twitch constraints and product implications

### 1. The panel has native channel context

`window.Twitch.ext.onAuthorized` provides the active channel context and extension JWT.

Implication:

- the panel does not need the website's normal session login flow to identify the active channel
- the panel should derive channel identity from Twitch context, not client-entered slugs

### 2. Viewer writes require identity sharing

Twitch requires viewers to share their identity before an extension lets them submit user content.

Implication:

- playlist viewing can stay public
- add, VIP add, edit, and remove-my-request must require linked identity
- queue rows must clearly display requester attribution

### 3. The extension front end must not be trusted for privileged actions

Twitch recommends validating the extension JWT server-side before granting privileged access.

Implication:

- all panel write endpoints must verify the Twitch Extension JWT
- the panel must never be trusted to supply its own viewer ID, role, or channel ID

### 4. This feature requires an EBS

The panel needs authenticated writes, request-policy enforcement, and server-verified viewer/channel identity.

Implication:

- Request Bot needs an extension-specific backend layer
- the existing app worker is the natural place to host those EBS endpoints

### 5. Viewing is public; write permissions are evaluated server-side

Any viewer should be able to open the panel and read the playlist. Write actions are different and must be evaluated with verified linked identity plus server-side request policy.

Implication:

- unlinked viewers can always browse
- linked viewers can write only when channel policy allows it
- internal Request Bot VIP token balance should be checked on the server before allowing a VIP request
- if subscriber-aware request gates are needed later, they must also be validated on the server

### 6. Off-site linking cannot be the core workflow

The panel cannot depend on sending viewers away from Twitch for the main request flow.

Implication:

- the panel must implement the core read/search/request flow directly
- links back to the full website should stay optional and secondary

### 7. Extension packaging and review add extra constraints

Twitch requires the helper script on extension HTML, a hosted build artifact, disclosed fetched URLs, and review approval before public release.

Implication:

- the extension front end should be built as a separate artifact from the main website
- packaging, hosted test, and review prep are part of the implementation plan

### 8. Bits in Extensions are possible, but not required for MVP

Twitch exposes Bits helpers for extensions, including panels.

Implication:

- a Bits-backed VIP request purchase flow is feasible later
- it should not block the core linked-identity panel MVP

## Product scope

## MVP

- Panel extension for viewers
- Read-only playlist and now-playing state
- Search within the channel-aware catalog
- Identity-share prompt for write actions
- Add regular request
- Add VIP request when the viewer has a spendable Request Bot VIP token
- Edit own active request
- Remove own active request
- Request attribution in queue rows
- Linked-viewer summary including current request and VIP token balance
- Broadcaster setup instructions in the website
- Hosted test and review-ready extension package

## Explicit non-goals for MVP

- Bits-backed VIP request purchase flow
- Moderator queue controls from the panel
- Broadcaster configuration UI inside the panel
- Replacing the website or dashboard with the panel
- Exact version-picking UI
- Twitch-native subscriber-role parity beyond what is needed for the initial request-policy rollout

## Existing code we should reuse

### Public data

- `src/routes/api/channel/$slug/playlist/route.ts`
- `src/routes/api/channel/$slug/playlist/stream.ts`
- `src/routes/api/search/route.ts`

### Queue mutation primitives

- `src/workers/backend/index.ts`
  - `addRequest`
  - `removeRequests`
  - `changeRequestKind`
  - internal playlist mutation endpoints

### Request rules and behavior

- `src/lib/eventsub/chat-message.ts`
- `src/lib/request-policy.ts`

### Persistence and identity

- `src/lib/db/schema.ts`
  - `channels.twitchChannelId`
  - `playlist_items.requestedByTwitchUserId`
  - `playlist_items.requestedByLogin`
  - `playlist_items.requestKind`
  - VIP token tables
- `src/lib/db/repositories.ts`

## Current gaps

### Missing shared viewer request service

`src/lib/eventsub/chat-message.ts` still owns most of the viewer request behavior:

- requester resolution
- active-request limits
- rate-limit windows
- duplicate-window checks
- search resolution
- blacklist and setlist checks
- required-path warnings
- VIP token handling
- edit/remove behavior

That logic needs to move into a reusable server module that can be called by chat, the website, and the panel.

### Missing website viewer-request foundation

The app currently supports:

- chat command submission
- owner/moderator playlist mutations

It does not yet support:

- viewer-authenticated request submission from the website
- viewer-authenticated request edit/remove via HTTP endpoints
- a shared viewer request state model that the panel can reuse

### Missing extension auth and EBS routes

There is currently no server utility for verifying Twitch Extension JWTs and no extension route family for bootstrap, search, and write actions.

## Target architecture

## High-level model

- The Twitch panel front end runs inside Twitch.
- The panel receives `auth.token` and `channelId` from the Twitch helper.
- The panel sends the extension JWT to Request Bot EBS endpoints.
- The app verifies the JWT, resolves the channel and linked viewer, and calls shared viewer-request services.
- Queue mutations continue to flow through the existing internal playlist Durable Object endpoints.

## Shared service layer

Create a transport-agnostic server module:

- `src/lib/server/viewer-request-service.ts`

This module should own:

- viewer request capability evaluation
- viewer request state assembly
- active request lookup
- search result resolution
- blacklist and setlist checks
- active-request limit checks
- duplicate-window checks
- max-queue-size checks
- required-path warnings
- VIP token balance checks and token consumption
- add/edit/remove orchestration

Callers:

- chat/EventSub flow
- website viewer-request routes
- panel extension routes

## Front-end architecture

Create a dedicated extension app instead of embedding the full website router.

Structure:

- `src/extension/panel/index.html`
- `src/extension/panel/main.tsx`
- `src/extension/panel/app.tsx`
- `src/extension/panel/lib/twitch-ext.ts`
- `src/extension/panel/components/*`

Why:

- the panel is a compact, single-purpose UI
- it has different auth semantics from the website
- it should not inherit website routing or session assumptions

## Backend architecture

Host EBS endpoints in the app worker so they can:

- access D1 and existing repositories
- resolve the Request Bot channel from the verified Twitch `channel_id`
- resolve the linked viewer from the verified Twitch `user_id`
- reuse the shared viewer-request service
- call the backend worker for playlist mutations

Route family:

- `src/routes/api/extension/bootstrap.ts`
- `src/routes/api/extension/search.ts`
- `src/routes/api/extension/request.ts`
- `src/routes/api/extension/request/edit.ts`
- `src/routes/api/extension/request/remove.ts`

## Authentication and authorization plan

## Incoming JWT verification

Add a server utility:

- `src/lib/server/extension-auth.ts`

Responsibilities:

- read the extension JWT
- verify it with the Twitch extension shared secret
- support secret rotation if needed
- parse and validate claims:
  - `channel_id`
  - `role`
  - `user_id`
  - `opaque_user_id`
  - `is_unlinked`
  - `exp`
- reject expired or malformed tokens

Return shape:

- `channelId`
- `viewerUserId`
- `opaqueUserId`
- `role`
- `isLinked`

## Viewer identity rules

### Read-only

Allow:

- linked viewers
- unlinked viewers
- logged-in or logged-out Twitch viewers

### Write actions

Require:

- valid verified extension JWT
- linked viewer identity
- channel mapping exists

Reject writes when:

- the viewer has not shared identity
- the channel is not connected in Request Bot
- the viewer is blocked by channel policy
- the viewer is trying to submit a VIP request without a spendable token

## Request kinds and VIP token handling

## Regular request

The panel should support standard viewer requests using the same request-policy service as chat and the website.

## VIP request

Panel MVP should support internal Request Bot VIP token spending:

- show the viewer's current balance in bootstrap state
- allow VIP request submission only when balance is positive
- consume a token on successful VIP submission
- refund or avoid consumption when the mutation fails
- reuse the same add/edit semantics that chat and website viewer requests use

## Bits-backed VIP purchase follow-up

Possible later flow:

- panel loads Bits SKUs with `twitch.ext.bits.getProducts()`
- viewer purchases a VIP request SKU with `useBits`
- backend verifies the transaction receipt
- verified purchase credits or directly spends a VIP request entitlement

This is a follow-up feature, not part of MVP.

## API plan

## `GET /api/extension/bootstrap`

Purpose:

- return the initial panel state in one authenticated call

Response should include:

- channel summary
- now playing
- playlist items
- linked/unlinked viewer state
- viewer active request summary
- viewer VIP token balance
- capabilities:
  - `canRequest`
  - `canVipRequest`
  - `canEditOwnRequest`
  - `canRemoveOwnRequest`
- any setup warning:
  - channel not connected
  - viewer must link identity
  - requests disabled

## `GET /api/extension/search`

Purpose:

- search songs for the active channel with channel blacklist awareness

Input:

- verified extension JWT
- query params:
  - `query`
  - `page`
  - `pageSize`

Behavior:

- verify JWT
- resolve channel from token
- perform channel-aware search using blacklist filters
- return only fields needed by the panel

## `POST /api/extension/request`

Purpose:

- add a request for the linked viewer

Payload:

- `songId`
- `requestKind`: `regular` or `vip`

Behavior:

- verify JWT
- require linked viewer
- resolve channel and requester
- resolve the selected catalog song on the server
- call the shared viewer-request service

## `POST /api/extension/request/edit`

Purpose:

- replace the linked viewer's active request

Payload:

- `songId`
- `requestKind`

Behavior:

- verify JWT
- require linked viewer
- apply the same shared edit rules as the website and chat flows

## `POST /api/extension/request/remove`

Purpose:

- remove the linked viewer's own active request(s)

Payload:

- optional `kind`: `regular`, `vip`, or `all`

Behavior:

- verify JWT
- require linked viewer
- remove only requests owned by the linked Twitch user ID

## Viewer flows

## Read-only viewer

1. Viewer opens the channel page.
2. Panel loads and receives Twitch auth context.
3. Panel calls `/api/extension/bootstrap`.
4. Backend verifies the JWT and resolves the channel.
5. Panel renders now playing, queue, requester names, and the sign-in/share-identity CTA if needed.

## Linked viewer adds a regular request

1. Viewer shares Twitch identity.
2. Panel refreshes bootstrap state.
3. Viewer searches for a song.
4. Viewer submits a regular request.
5. Backend verifies JWT, resolves the viewer, applies shared request rules, and calls the internal playlist add path.
6. Panel refreshes state and shows the result.

## Linked viewer adds a VIP request

1. Bootstrap reports a positive VIP token balance.
2. Viewer submits a VIP request.
3. Backend verifies JWT, re-checks the token balance, applies request policy, and consumes a token only when the request succeeds.
4. Panel refreshes the queue and the updated balance.

## Linked viewer edits or removes their request

1. Bootstrap includes the viewer's current active request summary.
2. Viewer chooses edit or remove.
3. Backend verifies ownership using the linked Twitch user ID from the JWT.
4. Shared viewer-request service performs the mutation.
5. Panel refreshes bootstrap and queue state.

## Broadcaster setup flow

1. Broadcaster connects Request Bot on the website.
2. Broadcaster installs the panel extension in Twitch.
3. The panel resolves the channel through `channels.twitchChannelId`.
4. If the channel is not connected in Request Bot, the panel shows a setup state instead of failing.

## Real-time strategy

## MVP

Use polling first.

Approach:

- bootstrap on load
- poll bootstrap every 5 seconds while visible
- re-fetch immediately after successful mutations

Why:

- simpler than extension-specific PubSub for day one
- easier to reason about in hosted test and review
- matches the current app's stable polling model

## Later

After MVP is stable, consider:

- reusing the current playlist stream if extension-hosted fetch behavior is reliable enough
- or adopting Twitch extension PubSub for panel updates

## Website setup work

Add owner-facing setup guidance in the website.

Additions:

- a settings section that explains:
  - what the panel does
  - what viewer identity sharing does
  - how VIP token spending works in the panel
  - how to install and test the panel
  - how hosted test differs from public release

Potential future route:

- `src/routes/dashboard/settings.tsx`
  - new `Twitch panel extension` section

## File-level implementation checklist

## New server utilities

- [ ] `src/lib/server/extension-auth.ts`
- [ ] `src/lib/server/viewer-request-service.ts`
- [ ] `src/lib/server/viewer-request-state.ts`
- [ ] `src/lib/server/viewer-request-types.ts`

## New API routes

- [ ] `src/routes/api/extension/bootstrap.ts`
- [ ] `src/routes/api/extension/search.ts`
- [ ] `src/routes/api/extension/request.ts`
- [ ] `src/routes/api/extension/request/edit.ts`
- [ ] `src/routes/api/extension/request/remove.ts`

## Existing server files to refactor

- [ ] `src/lib/eventsub/chat-message.ts`
- [ ] `src/lib/request-policy.ts`
- [ ] `src/lib/db/repositories.ts`
- [ ] `src/workers/backend/index.ts`

## New extension front-end files

- [ ] `src/extension/panel/index.html`
- [ ] `src/extension/panel/main.tsx`
- [ ] `src/extension/panel/app.tsx`
- [ ] `src/extension/panel/lib/twitch-ext.ts`
- [ ] `src/extension/panel/components/*`

## Build and packaging

- [ ] separate Vite entry or build config for extension assets
- [ ] generated extension artifact directory
- [ ] review checklist for fetched URLs and enabled Twitch capabilities

## Suggested implementation phases

## Phase 0: Ship website viewer requests first

- [ ] implement signed-in viewer request flows on `/$slug`
- [ ] extract shared viewer-request service from chat logic
- [ ] define the shared viewer request state DTO that panel bootstrap will reuse

## Phase 1: Extension auth foundation

- [ ] add shared secret storage to environment management
- [ ] add JWT verification utility
- [ ] add tests for linked, unlinked, expired, and malformed tokens

## Phase 2: Extension read APIs

- [ ] implement bootstrap endpoint
- [ ] implement extension search endpoint
- [ ] add channel-not-connected setup state

## Phase 3: Extension write APIs

- [ ] implement add regular request
- [ ] implement add VIP request
- [ ] implement edit request
- [ ] implement remove own request
- [ ] add audit and request-log attribution for extension-origin actions

## Phase 4: Panel front end

- [ ] add helper bootstrap and auth refresh handling
- [ ] add identity-share CTA
- [ ] add queue list and now-playing view
- [ ] add viewer summary card with VIP token balance
- [ ] add search results and submit flow
- [ ] add active-request edit/remove controls
- [ ] add setup and error states

## Phase 5: Broadcaster setup UX

- [ ] add owner-facing setup docs in the website
- [ ] add installation checklist
- [ ] document hosted test flow

## Phase 6: Testing and review hardening

- [ ] unit tests for JWT verification
- [ ] unit tests for shared viewer-request service
- [ ] integration tests for extension endpoints
- [ ] manual Twitch hosted-test runbook
- [ ] review notes for fetched URLs and enabled capabilities

## Phase 7: Hosted test, review, and rollout

- [ ] upload hosted test extension build
- [ ] validate channel mapping and identity-share flow
- [ ] validate regular and VIP request submission with real Twitch identities
- [ ] validate install on connected and unconnected channels
- [ ] prepare review guide and changelog

## Phase 8: Bits follow-up

- [ ] define a VIP purchase SKU model
- [ ] add receipt verification
- [ ] decide whether Bits credits tokens or buys a one-time VIP request directly

## Testing plan

## Unit tests

- JWT verification:
  - linked viewer
  - unlinked viewer
  - expired token
  - invalid signature
- viewer request service:
  - add regular request
  - add VIP request with available token
  - reject VIP request with zero balance
  - edit own request
  - remove own request
  - duplicate-window rejection
  - active-request-limit rejection
  - blocked-user rejection
  - queue-full rejection

## Integration tests

- bootstrap endpoint returns correct state for:
  - connected channel
  - unconnected channel
  - linked viewer
  - unlinked viewer
- request add/edit/remove endpoints mutate queue correctly
- VIP token balance updates correctly after a successful VIP request
- extension-origin audit/request logs are recorded

## Manual Twitch test checklist

- local/helper boot works
- hosted test boot works
- identity-share prompt works
- linked viewer ID reaches the backend correctly
- unlinked viewer cannot submit
- VIP token balance is shown correctly
- regular request succeeds when allowed
- VIP request succeeds only when balance is available
- queue rows show requester identity
- broadcaster can still remove extension-submitted requests from the main app

## Review and compliance checklist

- [ ] Write actions require linked Twitch identity
- [ ] Submitted content clearly shows submitter username
- [ ] Broadcaster can remove extension-submitted content
- [ ] Core flow does not depend on off-site links
- [ ] All fetched URLs are documented for Twitch review
- [ ] Extension helper is included correctly in extension HTML
- [ ] Hosted test setup notes are prepared for review

## Risks and mitigations

## Risk: Request parity diverges from chat and website

Mitigation:

- extract shared viewer-request logic before panel-specific behavior
- make chat, website, and panel call the same service

## Risk: VIP token spending becomes inconsistent across surfaces

Mitigation:

- centralize token balance checks and consumption in the shared service
- avoid panel-only token logic
- test add, edit, refund, and failure paths together

## Risk: Twitch review rejects weak moderation posture

Mitigation:

- require identity linking for writes
- display requester attribution prominently
- document existing broadcaster removal tooling
- keep off-site links out of the core request flow

## Risk: Extension build and deploy process becomes tangled with the website

Mitigation:

- keep a separate extension front-end entry
- keep packaging and review steps explicit in repo docs

## MVP acceptance criteria

- Panel can render queue state on a connected channel.
- Unlinked viewers can read but cannot write.
- Linked viewers can add a regular request.
- Linked viewers with a spendable token can add a VIP request.
- Linked viewers can edit their own active request.
- Linked viewers can remove their own active request.
- Panel shows the linked viewer's current VIP token balance.
- Queue rows clearly show requester identity.
- Website and panel viewer-request rules match because they call the same shared service.
- Broadcasters can remove extension-submitted requests using existing Request Bot controls.
- Extension can pass hosted test with documented setup.

## Stretch goals after MVP

- Bits-backed VIP request purchase flow
- subscriber-gated parity if channel policy needs it
- live updates beyond polling
- exact version picker
- panel theme settings

## Source notes

These plan decisions were based on official Twitch docs plus the current Request Bot codebase. The following are engineering choices rather than Twitch requirements:

- shipping website viewer requests before the panel
- polling first instead of starting with Twitch PubSub
- treating Bits-backed VIP purchase as a follow-up instead of MVP
