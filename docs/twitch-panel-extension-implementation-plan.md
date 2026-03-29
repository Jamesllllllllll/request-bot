# Twitch Panel Extension Architecture

## Auth and channel resolution

- The panel verifies the Twitch Extension JWT on the server.
- `channel_id` resolves the RockList.Live channel.
- Linked `user_id` resolves the matching RockList.Live user profile.
- Access resolves as `owner`, `moderator`, or `viewer` for the active channel.

## API surface

- `GET /api/extension/bootstrap`
- `GET /api/extension/search`
- `POST /api/extension/request`
- `POST /api/extension/request/edit`
- `POST /api/extension/request/remove`
- `POST /api/extension/playlist`

## Shared behavior

- `src/lib/server/extension-panel.ts` shapes bootstrap, live state, search, viewer request calls, and playlist management calls.
- `src/lib/server/viewer-request.ts` enforces blocked-requester rules, request ownership, VIP token rules, and shared request policy checks.
- `src/lib/request-policy.ts` applies blacklist, setlist, queue, and request-limit checks.
- `src/lib/server/playlist-management.ts` enforces owner and moderator playlist permissions.

## Search and request rules

- The panel search applies channel request filters such as official-only, allowed tunings, and required parts.
- The panel hides blacklisted search results when the channel blacklist is enabled.
- The panel keeps playlist viewing available without identity sharing.
- The panel requires linked identity for viewer request writes.
- The panel keeps blocked viewers in a read-only request state.
