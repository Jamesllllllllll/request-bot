# Bot Operations

## What exists

### Bot model

The app treats the Twitch bot as a separate shared account from the broadcaster:

- The streamer signs into the app with their own Twitch account.
- An admin signs the shared bot account into the app once.
- Each streamer can opt their own channel into bot presence from Dashboard Settings.
- When an opted-in streamer goes live, the app activates the bot in that channel by ensuring the `channel.chat.message` EventSub subscription exists for that broadcaster + bot user pair.
- When the streamer goes offline, the app removes that chat subscription so the bot is inactive in the channel.

This is the EventSub/API equivalent of "join when live, leave when offline."

### Bot status

On a streamer's Settings page, the bot can report:

- `Disabled`: the streamer has not opted their channel into the bot
- `Bot auth required`: the shared bot account has not been connected yet
- `Broadcaster auth required`: the streamer needs to reconnect their Twitch account
- `Waiting to go live`: the channel is opted in and ready, but not live
- `Active`: the channel is live and the bot's chat subscription is active
- `Subscription error`: Twitch rejected one of the EventSub subscriptions

`channels.botEnabled` is the current active-in-chat state.
`channel_settings.bot_channel_enabled` is the streamer's desired opt-in state.

### Required setup

1. Ensure `.env` contains:

```env
APP_URL=https://your-public-dev-url.example
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_EVENTSUB_SECRET=...
SESSION_SECRET=...
ADMIN_TWITCH_USER_IDS=your_main_twitch_user_id
TWITCH_BOT_USERNAME=Pants_Bot_
TWITCH_SCOPES=openid user:read:moderated_channels moderator:read:chatters channel:bot
```

For local development, `TWITCH_BOT_USERNAME` should usually be your dedicated test bot account. Production should keep its own bot username in deployed env or secrets. The app enforces that the connected bot login matches `TWITCH_BOT_USERNAME`, so changing bot accounts locally requires changing local `.env` first.

`TWITCH_SCOPES` belongs to the broadcaster login flow, not the bot login flow. It should include `channel:bot` so chat replies can use Twitch's bot badge path. If a broadcaster connected before `channel:bot` was present, they need to reconnect Twitch.

2. Make sure your Twitch developer application has both redirect URIs registered:

- `${APP_URL}/auth/twitch/callback`
- `${APP_URL}/auth/twitch/bot/callback`

3. Apply the latest local or remote D1 migration:

```bash
npm run db:migrate
```

4. Start the app and log in with your broadcaster account.
5. Go to `/dashboard/admin` as your admin user and click `Connect bot account`.
6. Complete that OAuth flow while logged into the Twitch bot account named in `TWITCH_BOT_USERNAME`.
7. Go to `/dashboard/settings` for your streamer account and enable `Enable bot for my channel`, then save.
8. Go live on Twitch.
9. Confirm the Settings page changes to `Active`.
10. Send a chat request like:

```text
!sr cherub rock
```

### Reply behavior

- Replies are sent with the bot account's user token, not the broadcaster token.
- If Twitch returns `401` while sending chat, the backend refreshes the bot token once and retries automatically.
- Testing against the same broadcaster in both production and local/tunnel environments can cause both environments to receive and process the same chat command.

### Local vs production warning

If a streamer or moderator tests bot commands on a channel that is connected in the live app while a local tunnel/dev environment is also connected for that same broadcaster, cross-environment behavior can become confusing.

There are two different cases:

- same broadcaster + same bot account:
  local and production compete for the same `channel.chat.message` subscription, so one environment can effectively take over chat handling from the other
- same broadcaster + different bot accounts:
  Twitch can allow both subscriptions, so both environments can receive commands from that same channel and both may reply

For safe bot testing:

- use a dedicated test broadcaster/channel whenever possible
- use a dedicated test bot account for local development
- set local `.env` `TWITCH_BOT_USERNAME` to that test bot account before reconnecting the bot
- do not sign a production broadcaster into the local environment
- avoid keeping both production and local EventSub subscriptions active for the same broadcaster

### Current limits

- The bot account is shared globally across channels.
- Bot disconnect/reconnect is managed from the admin dashboard rather than a dedicated bot management page.
- Existing EventSub subscriptions are tracked locally in D1. If a remote subscription is deleted manually in Twitch, the next reconcile pass may need another save/login/live cycle to recreate it.

## What can be added later

- A dedicated bot management page instead of admin-only controls.
- Stronger operator diagnostics for subscription drift and reply failures.
- Automatic recovery sweeps for enabled channels.
