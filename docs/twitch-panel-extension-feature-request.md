# Feature Request: Twitch Panel Extension For Playlist Viewing And Viewer Song Requests

## Scope

RockList.Live includes a Twitch panel extension that gives viewers a Twitch-native request surface on the channel page.

The panel supports:

- read-only playlist viewing without identity sharing
- current queue and now-playing state
- linked viewer request actions:
  - add regular request
  - add VIP request
  - edit current request
  - remove own request
- linked viewer summary:
  - display name
  - VIP token balance for the active channel
  - current request count and limit
- requester attribution on playlist items
- owner and moderator playlist actions when the linked viewer has channel access:
  - play now
  - mark played
  - delete item
  - switch request kind between regular and VIP when VIP-token management is allowed

## Auth And Access Model

- The panel verifies the Twitch Extension JWT on the server.
- The active Twitch `channel_id` resolves the RockList.Live channel.
- The linked Twitch `user_id` resolves the same app user used by the website.
- Panel write actions require linked identity.
- Panel moderation actions require linked identity plus channel access for the current Twitch channel.
- Moderator access follows the channel's existing moderator capability settings in RockList.Live.

## MVP Experience

### Viewers

- open the panel on Twitch
- view the playlist without leaving Twitch
- share Twitch identity when they want to request songs
- search the catalog
- add, edit, or remove their own request
- spend existing RockList.Live VIP tokens from the panel

### Streamers And Moderators

- open the panel on the live channel page
- view the active queue
- use compact playlist actions directly from the panel when they have access for that channel
- rely on the same queue mutation rules and playlist state used by the main app

## Current Technical Shape

- Extension Backend Service routes live under `src/routes/api/extension`
- linked viewers resolve through `users.twitchUserId`
- playlist moderation uses the shared playlist-management service
- viewer request actions use the shared viewer-request service

## Recommended MVP Acceptance

- A connected channel can install the panel and load playlist state.
- Unlinked viewers can read the playlist.
- Linked viewers can add, edit, and remove their own requests.
- Linked viewers can see their VIP token balance for the current channel.
- Stream owners can manage the playlist from the panel.
- Twitch moderators can manage the playlist from the panel when the channel settings allow it.
- Request behavior matches the website and chat request policy.
- The panel is documented for Local Test, Hosted Test, and self-hosted deployment.

## Notes

- The panel identity-share flow and the website session are separate.
- Opening the website from the panel does not create a website app session by itself.
- Website sign-in still uses the normal Twitch OAuth flow on `rocklist.live`.
