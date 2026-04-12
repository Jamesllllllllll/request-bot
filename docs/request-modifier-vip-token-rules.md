# Request Modifiers and VIP Token Rules

## Current shipped surfaces

- Streamers can already configure request-path modifiers in dashboard settings.
- Viewers can already choose a requested path in the website search UI on `/$slug`.
- Viewers can already choose a requested path in the Twitch panel extension.
- Search path filters and request-path modifiers are separate:
  - search path filters narrow the catalog results a viewer sees
  - request-path modifiers change the actual request that gets submitted

## Current shared rule model

- Duration thresholds can force a song to become VIP-only.
- A requested path can add a path-specific VIP token cost.
- The same planner is used by chat, the website, and the Twitch panel:
  - `src/lib/requested-paths.ts`
  - `src/lib/server/viewer-request.ts`

### `requestPathModifierUsesVipPriority = true`

- Any paid path selection becomes VIP-only.
- The total VIP cost is the higher of:
  - the song-duration VIP requirement
  - the requested-path VIP requirement
- This treats the path selection as using the normal VIP-priority lane instead of stacking another token on top.

### `requestPathModifierUsesVipPriority = false`

- A paid path can stay a regular request when no other rule forces VIP.
- The VIP total becomes additive:
  - base VIP request cost
  - plus any path cost
- If a duration rule already forces VIP, the request is still VIP-only, but the path cost can stack on top.

## Current behavior matrix

Assumptions used below:

- base VIP request cost = `1`
- long-song threshold example = `2`
- requested path example cost = `1`

| Scenario | `requestPathModifierUsesVipPriority` | Regular action | VIP action | Total VIP cost |
| --- | --- | --- | --- | --- |
| No duration rule, no path modifier | `true` or `false` | `Add` | `Add VIP` | `1` |
| No duration rule, bass path costs `1` | `true` | hidden | `VIP (1)` | `1` |
| No duration rule, bass path costs `1` | `false` | `Add (1)` | `Add VIP (2)` | `2` |
| Long song requires `2`, no path modifier | `true` or `false` | hidden | `VIP (2)` | `2` |
| Long song requires `2`, bass path costs `1` | `true` | hidden | `VIP (2)` | `2` |
| Long song requires `2`, bass path costs `1` | `false` | hidden | `VIP (3)` | `3` |

## UI direction now in code

- When a regular request is not valid, the viewer-facing request UI should not show a usable regular action.
- The panel now shows only the VIP action in that case.
- The website viewer action UI follows the same rule instead of presenting a dead-end regular option.

## Open product questions

- Should long-song cost and requested-path cost always stack, even when the channel says the path uses VIP priority?
- Should there be a separate extra token for queue priority itself, beyond the song rule and path rule?
- Should path selection stay a dropdown in the panel, or switch to compact chips when only a few paths are available?
- Do we ever want a regular request to pay path cost but still not consume the same premium lane as a VIP request?

## Suggested product framing

- Treat duration thresholds as the rule that decides whether a request must become premium.
- Treat requested-path cost as either:
  - a premium-lane selector
  - or an additive modifier
- Keep that distinction explicit in settings copy and viewer-facing helper text so streamers can predict the exact cost model.
