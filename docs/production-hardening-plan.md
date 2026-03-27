# Production Hardening Plan

## Goal

Keep RockList.Live available even when Twitch or Cloudflare components partially fail. Failures should degrade gracefully, surface clearly in the UI, and recover automatically when possible.

## What exists

### Current protections

- Friendly bot status labels are shown in the dashboard.
- Manual saves can surface warnings without hiding the primary action result.
- Bot activation and deactivation are tied to live state and settings.
- EventSub subscriptions are reconciled from the app instead of being treated as manual setup.
- Reply sending refreshes the bot token once on `401`.
- Local migration checks fail early when schema drift is detected.

## What can be added later

### Immediate priorities

#### 1. Friendly failure surfaces

- Return structured JSON errors from reconcile and repair flows.
- Show clear operator-facing warnings instead of raw exception text.
- Preserve successful writes even when follow-up background reconcile steps fail, but surface a warning immediately.

#### 2. Subscription resilience

- Reconcile subscriptions when:
  - streamer saves settings
  - stream goes online
  - stream goes offline
  - admin reconnects bot auth
- Store and surface the last subscription failure reason.
- Periodically re-verify enabled channels in case Twitch subscriptions drift or are deleted remotely.

#### 3. Reply pipeline resilience

- Never crash the whole queue worker on a single failed send.
- Retry transient Twitch send failures when safe:
  - token refresh on `401`
  - limited retry for `429` and `5xx`
- Keep failed replies visible in logs for operator review.

### Next engineering steps

#### A. Reliability data model

Add explicit operational state where useful:

- `channels.bot_status_message`
- `channels.last_bot_error_at`
- optional reply-delivery log table for failed outbound bot messages

#### B. Retry policy

Implement a small shared retry helper with:

- capped exponential backoff
- jitter
- retry classification for transient vs permanent failures

Use it for:

- Twitch EventSub subscription creation and deletion
- Twitch send-chat-message calls
- live-status fetch checks
- backend-to-backend calls where appropriate

#### C. Health and recovery

Add a lightweight admin health view showing:

- bot auth connected or disconnected
- channels in `subscription_error`
- channels waiting to go live
- count of recent failed reply deliveries

Add an admin action to:

- reconcile all enabled channels

#### D. Observability

Standardize structured logs for:

- bot reconcile start, complete, and fail
- EventSub duplicate handling
- queue reply delivery failures

Add correlation fields where possible:

- `channelId`
- `runId`
- `subscriptionType`
- `twitchSubscriptionId`
- `messageId`

### Suggested rollout order

1. Structured errors and user-friendly UI warnings
2. Retry helper for Twitch API and reply queue
3. Persisted operational error fields and admin health panel
4. Automatic reconcile sweep job

### Success criteria

- A failed Twitch subscription leaves the operator with a clear next step.
- Streamers see understandable bot state messages.
- Transient Twitch failures do not take the bot down.
- The queue keeps processing even when one reply fails.
