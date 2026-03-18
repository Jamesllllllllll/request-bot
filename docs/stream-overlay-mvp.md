# Stream Overlay MVP

## Goal

Give streamers a private browser-source URL they can paste directly into OBS, then let them style that overlay inside the app without installing a plugin.

## What exists

### Current overlay product

- private overlay URL per channel
- in-app overlay editor for logged-in channel owners
- live preview in the dashboard
- live playlist updates on the overlay through SSE
- adjustable playlist background color and opacity

### Why this approach first

The browser-source URL is the lowest-friction path:

- no OBS plugin install
- no cross-platform plugin maintenance
- no OBS version compatibility burden
- easy to copy and paste into a browser source
- already compatible with the app's current live playlist update model

An OBS plugin may make sense later, but it should wrap a stable overlay URL product rather than become the first implementation.

### Owner workflow

The channel owner can open `Dashboard -> Overlay` and:

- preview the overlay live against the current playlist
- change the current set of theme controls
- copy the private overlay URL
- regenerate the private overlay URL token

### Private overlay URL

Each channel gets a tokenized overlay route:

`/{slug}/stream-playlist/{token}`

This route is intended for OBS browser sources. It is not linked publicly.

The token can be regenerated from the dashboard, which invalidates the previous URL.

### Live updates

The overlay uses the same playlist SSE model as the dashboard and public playlist pages.

That means:

- new requests appear live
- reordering and current-song changes appear live
- marking songs played or skipped appears live

### Current theme controls

The current implementation supports:

- animate now playing
- accent color
- VIP badge color
- text color
- muted text color
- request item background color
- playlist background color
- playlist background opacity
- border color
- corner radius
- item gap
- item padding
- title font size
- meta font size

### Current playlist item layout

- configurable page background opacity
- up to five visible playlist rows
- fade on the final visible row when more items exist
- song title and artist on one line
- requester name below
- pick badges below requester
- record badge at the left
- VIP tag when applicable

## Technical design

### Persistence

Overlay settings are stored on `channel_settings`.

This keeps them colocated with other per-channel presentation and behavior settings.

### Access control

The overlay is not protected by normal session auth. Instead it uses a private tokenized URL.

Server-side access rules:

- dashboard overlay configuration requires an authenticated owner session
- overlay rendering requires a valid `{slug}` + `{token}` pair
- if the overlay is disabled, the private route does not render useful content

### Rendering model

A shared overlay component is used for both:

- the dashboard preview
- the private browser-source route

That keeps the preview honest. If the preview looks right, the OBS route should look the same.

### Live transport

The overlay does not introduce a new transport model.

It reuses:

- initial JSON fetch
- SSE playlist stream

This is simpler than adding WebSockets or a separate overlay-specific event system.

## What can be added later

### Product direction

- keep the overlay as a dedicated URL rather than an OBS plugin first
- make the URL private and tokenized
- make the editor interactive enough that streamers can style the overlay without touching CSS
- add true transparent scenes if the product returns to that requirement
- update the overlay route live while the streamer edits theme settings

### Visual direction

- dark-only presentation
- minimal, polished, music-oriented feel
- not cheesy
- dense enough for live use
- readable at a glance
- strong hierarchy for now playing vs queue

### Possible visual evolutions

- alternate overlay presets
- compact mode / broadcast mode
- stronger VIP treatment
- more animation controls
- typography presets
- edge glow / noise / glass intensity controls

### Possible next steps

#### High-value next steps

1. Add live theme updates to the overlay route without requiring refresh.
2. Add layout presets:
   - compact stack
   - now playing + queue
   - bottom dock
   - side rail
3. Add a dedicated `Overlay` card to the dashboard overview with copy/open actions.
4. Add safer overlay token rotation UX with confirmation and "copied new URL" flow.
5. Add a sample preview mode so streamers can style the overlay even with an empty playlist.

#### Product-quality next steps

1. Allow multiple saved overlay themes per channel.
2. Add theme presets with sensible defaults.
3. Add advanced typography controls:
   - title weight
   - uppercase toggles
   - letter spacing
4. Add per-element visibility controls:
   - status badge
   - duration
   - tuning
   - creator
   - requester
5. Add overlay-specific zebra density and row height controls.

#### Operational next steps

1. Log overlay token regenerations in audit history.
2. Add a "last overlay access" metric if useful.
3. Add guardrails for excessive failed token requests if abuse ever matters.

### Plugin exploration

Only consider the OBS plugin path after:

- the URL-based overlay is stable
- the theme system is mature enough
- streamers are using it consistently
- the maintenance cost is justified

### Non-goals

These stay out of scope until the overlay URL product is stable:

- multiple overlays per channel
- custom CSS editors
- plugin installation flow
- general-public access to the private overlay
- a full visual theme engine with arbitrary layout composition
