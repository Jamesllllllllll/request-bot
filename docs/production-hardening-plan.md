# Production Hardening Backlog

## Goal

Keep RockList.Live available when Twitch or Cloudflare components partially fail. Failures should degrade gracefully, surface clearly in the UI, and recover automatically when possible.

## Current Protections

- bot status is surfaced in owner settings
- settings saves can return warnings without hiding the primary save result
- EventSub subscriptions are reconciled from the app
- reply sending refreshes the bot token once on `401`
- schema drift fails fast during local startup

## Next Priorities

### Friendly Failure Surfaces

- return structured errors from reconcile and repair flows
- keep successful writes visible even when follow-up reconcile work fails
- show clear operator-facing warnings instead of raw exception text

### Subscription Resilience

- keep reconciling on settings saves and live-state changes
- persist the last subscription failure reason
- add a periodic verification path for enabled channels

### Reply Pipeline Resilience

- classify transient vs permanent Twitch send failures
- retry safe transient failures such as `429` and `5xx`
- keep failed outbound replies visible in logs or an operator view

### Health Visibility

- add an admin health view for bot auth state, subscription errors, and recent reply failures
- add a reconcile-all-enabled-channels action
