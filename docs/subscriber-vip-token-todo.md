# Subscriber VIP Token TODO

## Current state

The `Auto grant one VIP token to subscribers` setting is intentionally disabled in the UI and ignored in runtime request handling.

The previous implementation granted a subscriber one automatic VIP token the first time they used a VIP request in a channel, then marked that subscriber as permanently auto-granted for that channel.

That behavior is not correct for the intended product requirement.

## Intended behavior

Subscribers should receive one VIP token for each subscription renewal period.

In practice, that likely means:

- one token when a subscription first starts
- one token for each monthly renewal after that
- no duplicate token grants within the same renewal period

## Open implementation questions

- How should gift subs be handled?
- How should advance multi-month subscriptions be handled?
- Should Prime subscriptions behave the same way as paid subscriptions?
- Should the token be granted immediately on Twitch subscription events, or lazily on first VIP request during the eligible renewal period?
- What source of truth should be used to determine the current subscriber renewal period?

## Likely implementation direction

- listen for or reconcile Twitch subscription lifecycle data
- persist enough subscription-period metadata per user per channel to know whether the current period has already received its token
- separate `manual` VIP grants from `subscriber renewal` VIP grants in storage and audit trails
- only auto-grant when the current renewal period has not already been awarded

## Related code

- Runtime request handling: [chat-message.ts](repo/src/lib/eventsub/chat-message.ts)
- VIP token persistence: [repositories.ts](repo/src/lib/db/repositories.ts)
- Settings UI: [settings.tsx](repo/src/routes/dashboard/settings.tsx)
