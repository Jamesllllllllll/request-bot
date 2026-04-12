# Stream Overlay

## Current Product Surface

RockList.Live includes a private browser-source overlay for each channel.

Owners configure it from `/dashboard/settings`, preview it live in the app, and paste the private URL into OBS or another browser-source-capable streaming tool.

## Overlay URL

Each channel has a tokenized overlay route:

```text
/{slug}/stream-playlist/{token}
```

The overlay URL is not part of the public navigation. Owners can rotate the token from settings, which invalidates the previous URL.

## Current Controls

The owner settings UI currently includes:

- title, creator, and album visibility
- now-playing animation
- accent, VIP, text, muted-text, panel, background, and border colors
- background opacity
- corner radius
- item gap and padding
- title and metadata font sizes

## Rendering Model

The settings preview and the private overlay route use the same overlay component. If the preview looks right in settings, the browser-source route should match it.

## Live Updates

The overlay follows the live playlist state, so queue changes, reorder changes, and played-state changes are reflected without treating the overlay as a separate product surface.
