# Bot Operations

## Bot Model

RockList.Live uses a shared Twitch bot account that is separate from the broadcaster account.

- the streamer signs into the app with their own Twitch account
- an admin connects the shared bot account once
- each streamer opts their own channel into bot presence from channel settings
- when the opted-in channel goes live, the app ensures the `channel.chat.message` EventSub subscription exists for that broadcaster + bot user pair
- when the channel goes offline, the app removes that chat subscription

## Bot Status

The owner settings page can show:

- `Disabled`
- `Bot auth required`
- `Broadcaster auth required`
- `Waiting to go live`
- `Active`
- `Subscription error`

`channel_settings.bot_channel_enabled` is the owner preference.

`channels.botEnabled` is the current active-in-chat state.

## Required Setup

1. Fill in the Twitch-related values in [`.env.example`](../.env.example) or [`.env.deploy.example`](../.env.deploy.example).
2. Register both Twitch redirect URIs:

- `${APP_URL}/auth/twitch/callback`
- `${APP_URL}/auth/twitch/bot/callback`

3. Apply migrations:

```bash
npm run db:migrate
```

4. Sign in with the broadcaster account.
5. Open `/dashboard/admin` as an admin user.
6. Connect the shared bot account while logged into the Twitch account named in `TWITCH_BOT_USERNAME`.
7. Open `/dashboard/settings` for the channel owner and enable the bot for that channel.
8. Go live on Twitch and confirm the bot status changes to `Active`.

## Broadcaster Scopes

`TWITCH_SCOPES` belongs to the broadcaster app login, not the shared bot login.

The current default scope set is:

```text
openid user:read:moderated_channels moderator:read:chatters channel:bot channel:read:subscriptions bits:read channel:manage:redemptions
```

Those scopes support:

- bot-badged chat replies
- chatter-aware viewer lookup
- subscription and cheer VIP token automation
- app-owned channel point rewards

If the connected broadcaster account is missing those permissions, reconnect Twitch from the app.

## Channel Point Rewards

The app-owned channel point reward flow only works on Twitch Affiliate or Partner channels. Twitch rejects reward create or update calls on channels without channel points.

## Reply Behavior

- replies are sent with the bot account token, not the broadcaster token
- Twitch `401` send failures trigger one token refresh and one retry
- EventSub subscriptions are reconciled from the app instead of being treated as one-time manual setup

## Safe Local Testing

Do not test the same broadcaster in both local and production unless that overlap is intentional.

Two cases matter:

- same broadcaster + same bot account: one environment can take over the shared `channel.chat.message` subscription
- same broadcaster + different bot accounts: both environments can receive and act on the same chat command

Safe default:

- use a dedicated test broadcaster
- use a dedicated test bot account
- keep local `TWITCH_BOT_USERNAME` aligned with that test bot account
- avoid leaving both local and production subscriptions active for the same broadcaster

## Current Limits

- one shared bot account is used across channels
- bot connection management stays on the admin page
- EventSub subscription drift still relies on save, login, and live-state reconciliation instead of a dedicated health dashboard

## Related Docs

- [docs/local-development.md](local-development.md)
- [docs/deployment-workflow.md](deployment-workflow.md)
