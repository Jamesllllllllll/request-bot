# Web Viewer Requests Implementation Plan

## Goal

Let signed-in viewers add and manage their own song requests directly from a streamer's public playlist page (`/$slug`).

The website flow should:

- keep playlist viewing public
- let signed-in viewers request songs without chat commands
- show the signed-in viewer's current request state
- show the viewer's Request Bot VIP token balance for the active channel
- support both `Add` and `Add VIP`
- become the shared backend foundation for the later Twitch panel extension

## Why this should ship before the panel extension

The Twitch panel extension needs a server-side request system that is not tied to chat commands. Shipping the website flow first gives Request Bot a clean foundation under app-controlled auth before Twitch Extension JWT auth is layered on top.

This step should prove:

- viewer ownership and auth rules outside chat
- VIP token spending outside chat
- reusable add/edit/remove request orchestration
- viewer request-state shaping for UI

## Current codebase state

## Public channel route already has most of the UI shell

`src/routes/$slug/index.tsx` already:

- fetches `/api/channel/$slug/playlist`
- fetches `/api/session`
- computes `currentViewer`
- renders `SongSearchPanel`
- supports custom search-result actions for managers

Current limitation:

- non-managers are still told to copy the request command and use Twitch chat

## Search UI is already extensible

`src/components/song-search-panel.tsx` already supports:

- custom result-state handling
- custom `renderActions`
- channel-aware search filtering

That means viewer `Add` and `Add VIP` buttons can be added without replacing the existing search surface.

## Existing POST route is not the right viewer mutation surface

`src/routes/api/channel/$slug/playlist/route.ts` currently:

- allows anonymous and signed-in reads
- restricts POST mutations to owner/moderator management via `requirePlaylistManagementState`

That route should stay management-focused. Viewer request writes should use a separate route family with viewer-specific auth and payload rules.

## Existing backend mutation primitives are reusable

The backend already has queue mutation primitives in `src/workers/backend/index.ts` for:

- add request
- remove requests
- change request kind

Those should remain the durable queue mutation layer.

## Existing request rules are still chat-coupled

`src/lib/eventsub/chat-message.ts` currently owns:

- requester eligibility checks
- active-request limits
- duplicate-window checks
- queue-size checks
- blacklist and setlist checks
- required-path warnings
- VIP token checks and consumption
- edit/remove behavior

That logic must be extracted before the website and panel can share behavior cleanly.

## Product scope

## MVP

- Signed-in viewer CTA on `/$slug`
- Viewer identity card with avatar and login
- Viewer VIP token balance for the current channel
- `Add` button on eligible search results
- `Add VIP` button on eligible search results
- Active request summary for the signed-in viewer
- Edit own request
- Remove own request
- Shared request-policy service used by chat and website

## Explicit non-goals for MVP

- Requesting for other viewers from the public page
- Exact version picker
- Bits-backed VIP purchases
- Twitch Extension auth or panel packaging
- Replacing owner/moderator playlist management flows

## Target architecture

## High-level model

- Anonymous viewers can still browse the playlist and search.
- Signed-in viewers use the existing Request Bot session cookie.
- Viewer-specific request state is fetched separately from the public playlist payload.
- Viewer request writes go through viewer-specific routes under the channel slug.
- Viewer routes resolve the signed-in Request Bot user, then map that user to the request owner identity.
- Shared request service validates policy and calls the existing backend queue mutation primitives.

## Shared service extraction

Create a transport-agnostic server module:

- `src/lib/server/viewer-request-service.ts`

This module should own:

- resolving the effective requester from app session identity
- loading the current channel request state needed for evaluation
- policy checks for regular and VIP requests
- current active request lookup
- add/edit/remove orchestration
- VIP token balance checks and token consumption
- viewer-facing rejection reasons

Callers:

- chat/EventSub
- website viewer-request routes
- later Twitch panel routes

## Viewer request state builder

Create a separate state helper:

- `src/lib/server/viewer-request-state.ts`

Responsibilities:

- resolve the signed-in viewer for a specific channel
- load the viewer's active queued/current requests
- load the viewer's current VIP token balance for that channel
- compute request capabilities:
  - `canAddRegular`
  - `canAddVip`
  - `canEditOwnRequest`
  - `canRemoveOwnRequest`
- surface blocking reasons for UI

This state shape should later inform the panel extension bootstrap response.

## API design

## `GET /api/channel/$slug/viewer-request-state`

Purpose:

- return viewer-specific request state for the signed-in user on the current channel

Auth:

- requires a valid Request Bot session

Response should include:

- viewer identity:
  - Twitch user ID
  - login
  - display name
  - profile image URL
- current active request summary
- VIP token balance for the channel
- capabilities:
  - `canAddRegular`
  - `canAddVip`
  - `canEditOwnRequest`
  - `canRemoveOwnRequest`
- any blocking reason that should be shown before a write attempt

Why a separate route:

- `GET /api/channel/$slug/playlist` should stay the public read model
- viewer request state changes more often after mutations
- the same concept maps cleanly to a later panel `bootstrap` response

## `POST /api/channel/$slug/viewer-request`

Purpose:

- add a viewer-owned request

Auth:

- requires a valid Request Bot session

Payload:

- `songId`
- `requestKind`: `regular` or `vip`

Server behavior:

- resolve the signed-in user from session
- resolve the channel from slug
- load the catalog song on the server from `songId`
- run the shared viewer-request service
- call the backend add-request primitive if allowed

Important:

- do not trust client-supplied requester identity
- do not trust client-supplied song metadata when a stable catalog `songId` exists

## `POST /api/channel/$slug/viewer-request/edit`

Purpose:

- replace the viewer's current active request

Payload:

- `songId`
- `requestKind`

Server behavior:

- resolve viewer identity from session
- resolve the selected catalog song on the server
- apply shared edit semantics

## `POST /api/channel/$slug/viewer-request/remove`

Purpose:

- remove the signed-in viewer's own active request(s)

Payload:

- optional `kind`: `regular`, `vip`, or `all`

Server behavior:

- resolve viewer identity from session
- remove only requests owned by that viewer's Twitch user ID

## Request policy plan

## Regular requests

Website viewer requests should match the same core rules already enforced in chat:

- requests enabled/disabled
- allow-anyone gate
- active-request limits
- duplicate window
- max queue size
- blacklist and setlist rules
- required-path warnings

## VIP requests

Website viewer requests should support internal Request Bot VIP tokens in MVP:

- show balance on the page
- allow `Add VIP` only when a spendable token exists
- consume a token only after a successful VIP mutation
- refund or avoid consumption when the mutation fails
- preserve the same VIP behavior that later panel routes will use

## Subscriber and Twitch role parity

This foundation should be written so server-side requester context can later include subscriber-aware or Twitch-role-aware checks if needed, but that should not block the initial web viewer flow.

## UI plan

## Channel page viewer summary

Add a viewer summary card to `src/routes/$slug/index.tsx` for signed-in viewers.

Recommended content:

- profile avatar
- display name and login
- VIP token balance for this channel
- current active request summary
- edit/remove controls

For signed-out viewers, show:

- a clear sign-in CTA
- redirect back to `/$slug` after Twitch auth

## Search results actions

Use `SongSearchPanel` custom `renderActions` on the public channel page for signed-in viewers.

Recommended button behavior:

- no active request:
  - `Add`
  - `Add VIP`
- active request present:
  - keep the same action area but switch to edit semantics internally or via explicit labels if that tests better

Disabled states should explain:

- not signed in
- requests disabled
- no VIP tokens
- queue full
- active-request limit reached
- blacklisted result

## Playlist and viewer-state refresh strategy

After successful add/edit/remove:

- invalidate `["channel-playlist", slug]`
- invalidate `["channel-viewer-request-state", slug]`

Polling:

- keep existing playlist polling
- viewer request state can poll more lightly or only revalidate on focus and after writes

## Recommended file changes

## New server utilities

- [ ] `src/lib/server/viewer-request-service.ts`
- [ ] `src/lib/server/viewer-request-state.ts`
- [ ] `src/lib/server/viewer-request-types.ts`

## New API routes

- [ ] `src/routes/api/channel/$slug/viewer-request-state.ts`
- [ ] `src/routes/api/channel/$slug/viewer-request.ts`
- [ ] `src/routes/api/channel/$slug/viewer-request/edit.ts`
- [ ] `src/routes/api/channel/$slug/viewer-request/remove.ts`

## Existing files to refactor

- [ ] `src/lib/eventsub/chat-message.ts`
- [ ] `src/routes/$slug/index.tsx`
- [ ] `src/routes/api/channel/$slug/playlist/route.ts`
- [ ] `src/components/song-search-panel.tsx`
- [ ] `src/lib/db/repositories.ts`
- [ ] `src/workers/backend/index.ts`

## Suggested implementation phases

## Phase 1: Extract shared request logic

- [ ] move add/edit/remove request behavior out of `chat-message.ts`
- [ ] create shared service APIs for website and future panel callers
- [ ] keep chat behavior unchanged while swapping the implementation underneath

## Phase 2: Add viewer request state route

- [ ] implement `GET /api/channel/$slug/viewer-request-state`
- [ ] include profile image URL, active request summary, and VIP token balance
- [ ] define the shared capability fields the UI will consume

## Phase 3: Add viewer write routes

- [ ] implement add regular request
- [ ] implement add VIP request
- [ ] implement edit request
- [ ] implement remove own request
- [ ] ensure all routes derive requester identity from session, not the client body

## Phase 4: Add channel page UI

- [ ] add signed-out request CTA
- [ ] add signed-in viewer summary card
- [ ] add `Add` and `Add VIP` buttons to search results
- [ ] add active request edit/remove affordances
- [ ] add optimistic pending states and clear failure messages

## Phase 5: Align with panel needs

- [ ] confirm the viewer request state DTO is reusable for panel bootstrap
- [ ] confirm the shared service accepts a generic caller context so panel auth can plug in later
- [ ] document which parts will be reused unchanged by the panel implementation

## Testing plan

## Unit tests

- shared viewer request service:
  - add regular request
  - add VIP request with available balance
  - reject VIP request with zero balance
  - edit own request
  - remove own request
  - duplicate-window rejection
  - active-request-limit rejection
  - queue-full rejection
  - blacklist rejection

## Integration tests

- `viewer-request-state` returns the right state for:
  - signed-out viewer
  - signed-in viewer with no active request
  - signed-in viewer with an active request
  - signed-in viewer with VIP balance
- write routes mutate only the signed-in viewer's own requests
- VIP token balance updates correctly after a successful VIP request

## Manual UI checklist

- signed-out viewer sees login CTA on `/$slug`
- signed-in viewer sees avatar and identity
- signed-in viewer sees channel-specific VIP token balance
- `Add` works for allowed songs
- `Add VIP` works only with available balance
- edit updates the viewer's own request
- remove deletes only the viewer's own request
- playlist and viewer-state refresh correctly after writes

## Risks and mitigations

## Risk: Website flow and chat flow diverge

Mitigation:

- extract shared request logic before building the website-only handlers
- make both transports call the same server module

## Risk: Viewer write routes accidentally trust client-supplied identity

Mitigation:

- derive requester identity only from the signed-in session
- resolve song details on the server from `songId`

## Risk: VIP token spending becomes inconsistent

Mitigation:

- centralize token checks and consumption in the shared service
- cover success and failure paths with tests

## Definition of done

- Signed-in viewers can add a regular request from `/$slug`.
- Signed-in viewers with a token can add a VIP request from `/$slug`.
- Signed-in viewers can edit or remove their own request.
- The page shows viewer identity and channel-specific VIP token balance.
- The shared request service is no longer chat-only.
- The resulting service and state model are ready to be reused by the Twitch panel extension.
