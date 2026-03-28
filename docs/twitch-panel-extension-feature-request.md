# Twitch Panel Extension

RockList.Live includes a Twitch panel extension that keeps playlist viewing and viewer requests on the channel page.

## Viewer surface

- Viewers can read the playlist without identity sharing.
- Linked viewers can search the catalog, add regular requests, add VIP requests, edit the current request, and remove their own request.
- Blocked viewers can still view the playlist and search the catalog. Request actions stay unavailable.
- When the channel blacklist is enabled, blacklisted artists, charters, songs, and versions stay hidden in panel search.
- Channel search filters such as official-only, allowed tunings, and required parts stay active in panel search.
- The panel does not expose a toggle for showing blacklisted results.

## Owner and moderator surface

- Owners can manage the playlist from the panel.
- Moderators can manage the playlist when the channel settings allow those actions.
- Playlist actions use the same management service as the website.

## Shared services

- Viewer request actions use `src/lib/server/viewer-request.ts`.
- Playlist management actions use `src/lib/server/playlist-management.ts`.
- Search uses `src/lib/server/extension-panel.ts`.
