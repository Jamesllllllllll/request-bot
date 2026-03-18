# Testing Plan

## Goal

Build confidence in the Twitch song request flow without depending on a real live stream for every test run.

## What exists

### Current testing approach

Use a layered strategy:

1. Vitest for fast logic and integration-style tests
2. Playwright for browser workflows
3. Manual Twitch smoke checks for real-world verification

### Current priorities

#### Highest-value Vitest coverage

These are the first automated checks worth investing in:

- `stream.online` webhook transitions the bot toward active state
- `stream.offline` webhook transitions the bot toward waiting or offline state
- `!sr song:12345` resolves an exact song id
- `!sr artist - title` ranking picks the intended match
- blocked users are rejected
- duplicate cooldown is enforced
- queue full is rejected
- settings save returns a friendly warning if reconcile fails

#### Highest-value Playwright coverage

- public home page renders live channels and playlist links
- search page debounce and empty-state behavior
- dashboard settings save flow shows success or warning messages
- moderation page can grant or remove VIP tokens
- playlist page reflects live updates and management actions

#### Manual smoke tests

Keep these as manual checks, not core CI blockers:

- real Twitch OAuth
- real bot OAuth
- real EventSub subscription creation
- real chat reply delivery
- real tunnel or public callback behavior

### What not to over-invest in

- full real Twitch live-channel automation
- tests that depend on real cron timing

## What can be added later

### Recommended roadmap

#### Phase 1: Fast logic coverage

Add and keep green:

- command parsing tests
- request-policy tests
- EventSub signature verification tests
- search query normalization and ranking helper tests

#### Phase 2: Route-level integration tests

Refactor the EventSub request path into testable functions so we can:

- inject a mocked chat payload
- mock Twitch API dependencies
- stub DB or repository calls
- assert playlist mutation intent
- assert queued reply messages

This should become the most important automated test path in the project.

#### Phase 3: Browser workflow tests

Use Playwright for:

- settings form save
- moderation UI
- playlist owner actions
- public playlist rendering

Prefer mocked or session-seeded auth over real Twitch login in CI.

### Most valuable single automated test

Post a mocked `channel.chat.message` payload containing `!sr ...`, then assert:

- the request is accepted
- the right song match is selected
- a playlist mutation is triggered
- a Twitch reply is queued

That single path covers the core product promise better than almost any other test.

### Immediate next testing task

To unlock those route-level tests cleanly, extract the EventSub request handler into a small service module that accepts:

- normalized event input
- channel or settings state
- repository helpers
- backend call function
- queue send function

Then test that service directly with Vitest.
