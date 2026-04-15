# Community Homepage Plan

## Goal

Make the home page feel like an active Rocksmith community instead of just a product landing page.

The tone should stay celebratory and discovery-focused:

- help viewers find active streamers quickly
- help streamers feel momentum in their request flow
- avoid turning the page into a hard leaderboard

## Shipped MVP

This pass adds a lightweight public community surface on the home page:

- show all live RockList.Live channels instead of cutting the page off after a small fixed set
- show the current song or next queued request on every live channel card
- show `played today` counts on each live channel card
- add a `Community pulse` section with:
  - requests played today
  - requesters active today
  - songs in rotation today
  - channels active today
- add `Most played today` and `Artists in rotation` lists

## Why This MVP Works

- It uses data the app already exposes publicly through live channels and played-song history.
- It adds movement and energy to the homepage without asking streamers to configure anything new.
- It gives viewers a reason to browse beyond a single featured channel.

## Good Next Expansions

### Time ranges

- add `Today / 7d / 30d` toggles to the public community module
- keep `Today` as the default homepage view, and move heavier history to a dedicated community page later

### Live discovery modules

- `Now on stream`: a compact strip of the songs currently being played across live channels
- `Freshly played`: the most recent completed songs from live channels
- `Busy rooms`: channels with the most songs played today, framed as activity rather than ranking

### Viewer-energy modules

- `Requesters active today`: highlight how many distinct viewers participated
- `First requests today`: celebrate newcomers joining the queue
- `Returners`: light-touch recognition for viewers who keep showing up without creating a public leaderboard

### Channel momentum modules

- songs played this stream
- current queue depth
- how long the streamer has been live
- whether the queue is moving quickly right now

### Community flavor modules

- top artists this week
- most requested artists this week
- genre or tuning waves when the catalog metadata makes that feel reliable
- rotating highlights like `Acoustic hour`, `Bass-heavy night`, or `Throwback rotation` when enough signals exist

## Guardrails

- keep public stats limited to data that is already intentionally public
- prefer “activity” and “discovery” framing over channel-vs-channel competition
- avoid cluttering live channel cards with too many numbers
- keep the home page fast even when many channels are live

## Suggested Follow-up Split

1. Home page community pulse and unlimited live channel discovery
2. Dedicated `/community` or `/stats` page with time-range filters
3. Private dashboard analytics for streamers
4. Optional richer public channel modules on `/slug`
