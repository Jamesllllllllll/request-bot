# Channel-First Architecture Refactor Plan

## Goal

Refactor the application from a dashboard-centric model to a channel-first model where:

- The public channel playlist page (`/$slug`) is the primary application surface.
- The page behavior changes by role rather than by separate route families.
- Owner-only configuration moves into a smaller settings/account area.
- Moderator capabilities are explicitly configurable by the channel owner.
- Polling can be replaced later by a clean real-time solution, but that is not a prerequisite for the structural refactor.

## Desired Product Model

### Primary surfaces

1. Home / discovery
   - Shows current streamers/channels.
   - Lets users find and open a channel playlist quickly.
   - Uses a channel-first content layout:
     - one featured live channel card
     - smaller secondary live channel cards
   - Prioritizes loading for the featured live preview image.
   - Leaves secondary preview images lazy-loaded.
   - If Twitch exposes only size variants rather than explicit quality variants, prefer:
     - featured image with eager/high-priority loading
     - smaller card images with smaller requested dimensions and lazy loading

2. Channel playlist page (`/$slug`)
   - Logged out:
     - View queue and played history.
     - Search songs and get request guidance.
     - See public blacklist / public channel info.
   - Logged-in viewer:
     - Everything logged-out users can do.
     - Viewer-specific request affordances.
     - Personal request context where applicable.
   - Logged-in moderator / owner:
     - Queue controls.
     - Moderation panels gated by owner-configured permissions.
     - Same unified song-add experience with role-aware actions.

3. Owner settings area
   - Channel configuration.
   - Bot settings.
   - Overlay settings.
   - Moderator permission settings.
   - Channel policy settings.

4. Optional personal account area
   - Twitch connection / reauthorization.
   - User-level preferences.
   - Managed channel list if needed.

### Core principle

There should not be one UI for "dashboard playlist management" and another for "public playlist viewing." There should be a single canonical playlist surface with capability-driven controls.

## Current Architecture Problems

- Dashboard and public channel routes still split responsibility.
- Multiple route families expose overlapping channel-management concerns:
  - `src/routes/dashboard/*.tsx`
  - `src/routes/api/dashboard/*`
  - `src/routes/$slug/index.tsx`
  - `src/routes/api/channel/$slug/*`
- Navigation still carries dashboard-era assumptions:
  - dashboard sidebar sections
  - `/dashboard/playlist` compatibility route
  - dashboard moderation and overlay pages
- Access is mostly role-based, but not yet capability-based.
- Moderator access is not granular enough for future product requirements.
- Some management UI is still implemented as "dashboard components embedded into public route" rather than truly channel-first modules.

## Target Architecture

### Routing direction

#### Keep

- `src/routes/index.tsx`
- `src/routes/search.tsx`
- `src/routes/$slug/index.tsx`
- `src/routes/$slug/stream-playlist/$token.tsx`
- `src/routes/dashboard/settings.tsx` or equivalent owner settings route
- `src/routes/dashboard/admin.tsx` if admin remains distinct

#### Shrink or remove

- `src/routes/dashboard/playlist.tsx`
- `src/routes/dashboard/moderation.tsx`
- `src/routes/dashboard/overlay.tsx`
- `src/routes/dashboard/index.tsx`
- `src/routes/dashboard/route.tsx`

#### Eventual shape

- Minimal dashboard shell or no dashboard shell.
- If retained, dashboard should be settings/account-centric, not operations-centric.
- Operations happen on `/$slug`.

### Data/API direction

#### Channel-first APIs should become canonical

- `src/routes/api/channel/$slug/playlist/route.ts`
- `src/routes/api/channel/$slug/viewers.ts`
- `src/routes/api/channel/$slug/played/*`

#### Dashboard APIs to shrink, merge, or retire

- `src/routes/api/dashboard/playlist/route.ts`
- `src/routes/api/dashboard/moderation.ts`
- `src/routes/api/dashboard/overlay.ts`
- `src/routes/api/dashboard/settings.ts`

### UI/module direction

Extract capability-oriented channel modules rather than dashboard pages:

- `ChannelPlaylistView`
- `ChannelQueueManagement`
- `ChannelBlacklistManagement`
- `ChannelBlockedChattersManagement`
- `ChannelVipTokenPanel`
- `ChannelOwnerSettings`
- `ChannelModeratorCapabilitySettings`

These should be composable into `/$slug` and owner settings routes without importing "dashboard page" concepts.

## Permission Model Refactor

### Current model

- `anonymous`
- `viewer`
- `moderator`
- `owner`

### Target model

Keep the role model, but add capability flags controlled by the owner.

Suggested capabilities:

- `can_manage_queue`
- `can_manage_blacklist`
- `can_manage_blocked_chatters`
- `can_manage_vip_tokens`
- `can_view_vip_tokens`
- `can_manage_played_history`
- `can_manage_request_priority`
- `can_manage_session_reset`
- `can_manage_overlay`

### Product rules

- Owner always has all capabilities.
- Moderator gets only the capabilities the owner enables.
- Viewer never gets moderator capabilities.
- Read-only capability should be supported where management is too broad.
- VIP tokens should explicitly support:
  - hidden
  - read-only
  - manage

## Proposed Delivery Phases

## Phase 0: Stabilize The Current Branch

- [x] Keep useful backend instrumentation while we refactor.
- [x] Avoid coupling this phase to SSE reliability work.

## Phase 1: Define The New Navigation Model

- [x] Decide whether dashboard remains as a shell or becomes a small settings area.
- [x] Reduce dashboard navigation to:
  - [x] settings
  - [x] admin (if applicable)
  - [x] optional account/manage channels page
- [x] Remove dashboard nav items that point to operational channel views.
- [x] Ensure all playlist-management entry points navigate directly to `/$slug`.
- [x] Rework homepage live channel cards into:
  - [x] one featured live card
  - [x] smaller secondary cards
  - [x] prioritized featured image loading
  - [x] lazy-loaded secondary previews
- [x] Move overlay configuration into owner settings instead of a separate primary dashboard destination.

## Phase 2: Formalize Capability Settings

- [x] Design the current channel settings schema for moderator capabilities.
- [x] Add database fields or structured settings storage for current capability flags.
- [x] Add validation/types for current capability flags.
- [x] Expose owner-only API endpoints for updating current capability settings.
- [x] Add server-side capability evaluation helpers.
- [x] Expand the capability model beyond the current booleans.
- [x] Add blocked-chatter and VIP-token visibility/manage capability splits.
- [x] Add tests for capability enforcement across owner, moderator, viewer, and anonymous states.

## Phase 3: Break Dashboard Concepts Out Of The Public Route

- [x] Stop treating `PlaylistManagementSurface` as a dashboard page reused in public.
- [x] Extract role-aware channel management components from dashboard files.
- [x] Move shared logic into channel-focused modules under `src/components` or `src/features`.
- [x] Make `/$slug` the canonical composition point for:
  - [x] public queue
  - [x] viewer actions
  - [x] moderator controls
  - [x] owner controls

## Phase 4: Collapse Dashboard Playlist And Moderation Pages

- [x] Remove operational use of `src/routes/dashboard/playlist.tsx`.
- [x] Move moderation controls from `src/routes/dashboard/moderation.tsx` to `/$slug`.
- [x] Move any overlay operational shortcuts that belong to channel management into owner settings or channel tools.
- [x] Delete old operational dashboard routes once no navigation or API paths depend on them.

## Phase 5: Rework Owner Settings Area

- [x] Create a smaller owner-focused settings IA.
- [x] Group settings by concern:
  - [x] bot / Twitch
  - [x] request policy
  - [x] overlay
  - [x] moderator permissions
  - [x] VIP token rules
- [x] Ensure mods never see owner-only settings.

## Phase 6: Simplify APIs Around Channel Scope

- [x] Audit all `/api/dashboard/*` routes.
- [x] Move channel-scoped operations under `/api/channel/$slug/*`.
- [x] Reserve dashboard/account APIs for owner/account settings only.
- [x] Remove dashboard aliases once callers are migrated.

## Phase 7: Real-Time Revisit

- [ ] After the structural refactor, revisit SSE as a separate effort.
- [ ] Implement a minimal, validated SSE proof first.
- [ ] Add immediate ready event and heartbeat.
- [ ] Validate local dev, tunnel, and deployed dev before removing polling.

## Concrete File-Level Migration Checklist

### Navigation and route structure

- [x] Refactor `src/routes/dashboard/route.tsx`
- [x] Refactor `src/routes/dashboard/index.tsx`
- [x] Decide fate of `src/routes/dashboard/playlist.tsx`
- [x] Decide fate of `src/routes/dashboard/moderation.tsx`
- [x] Decide fate of `src/routes/dashboard/overlay.tsx`
- [x] Refactor active-state logic in `src/routes/__root.tsx`

### Public channel page

- [~] Refactor `src/routes/$slug/index.tsx` into smaller channel-focused sections
- [~] Separate view-only, viewer, moderator, and owner fragments
- [x] Remove any remaining dashboard-specific assumptions from channel page composition

### APIs

- [~] Audit `src/routes/api/channel/$slug/playlist/route.ts`
- [ ] Audit `src/routes/api/channel/$slug/viewers.ts`
- [x] Add `src/routes/api/channel/$slug/moderation.ts`
- [x] Add `src/routes/api/channel/$slug/moderation/search.ts`
- [x] Audit `src/routes/api/dashboard/playlist/route.ts`
- [x] Audit `src/routes/api/dashboard/moderation.ts`
- [x] Audit `src/routes/api/dashboard/overlay.ts`
- [x] Audit `src/routes/api/dashboard/settings.ts`

### Shared logic and permissions

- [x] Extend `src/lib/server/playlist-management.ts`
- [x] Introduce capability evaluation helpers
- [x] Add owner-configurable moderator capability settings
- [x] Add tests for role + capability combinations

## Suggested Implementation Order

1. Navigation simplification
2. Capability schema and server-side authorization
3. Channel page component decomposition
4. Migrate moderation tools into `/$slug`
5. Reduce dashboard to settings/account
6. Delete obsolete dashboard routes/APIs
7. Revisit SSE

## Things We Can Probably Delete By The End

- Dashboard playlist page as an operational surface
- Dashboard moderation page as an operational surface
- Dashboard overlay page if overlay becomes owner settings only
- Dashboard playlist bridge logic
- Dashboard-specific playlist streaming path if channel-scoped real-time is sufficient

## Things We Should Not Delete Prematurely

- Polling until real-time is proven stable
- Owner settings routes before the replacement IA exists
- Any API aliases still actively used by existing views
- Helpful backend logging until the refactor stabilizes

## Definition Of Done

- [x] `/$slug` is the canonical playlist and moderation surface.
- [x] Logged-out, viewer, moderator, and owner experiences are all role/capability variants of the same route.
- [x] Dashboard is settings/account oriented or removed entirely.
- [x] Moderator abilities are owner-configurable and enforced server-side.
- [x] Old dashboard operational pages are deleted.
- [x] Polling remains acceptable until SSE is validated separately.

## Immediate Next Slice

Start with navigation and IA, not permissions storage.

- [x] Remove dashboard operational navigation items except settings/admin.
- [x] Decide whether `/dashboard` becomes a settings landing page or a simple channel/account hub.
- [x] Rename or replace dashboard language so users are guided toward channel pages, not dashboard tools.
- [x] Identify which sections from dashboard moderation belong on `/$slug` first.
- [x] Move blacklist and setlist management onto `/$slug`.
- [x] Move blocked chatters and VIP token management onto `/$slug` or into owner settings.
- [x] Improve homepage live channel presentation with featured + secondary card hierarchy.
- [ ] Collapse or redirect remaining operational dashboard routes once their replacements are ready.
