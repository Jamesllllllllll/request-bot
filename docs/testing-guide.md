# Testing Guide

## Current Test Layers

RockList.Live relies on three layers:

1. Vitest for logic and route-level coverage
2. Playwright for browser workflows
3. Manual Twitch smoke checks for the flows that depend on real Twitch behavior

## Default Verification

Run the push-time gate with:

```bash
npm run check:prepush
```

That covers:

- generated-file checks
- i18n coverage
- typecheck
- Vitest

Run the full pre-PR ship gate with:

```bash
npm run check:ship
```

That adds formatting, lint, i18n coverage, and a production app build on top of the normal push-time gate.

## Extra Checks

Run these only when the change needs them:

- `npm run build` for deployment-sensitive work
- `npm run test:e2e` for browser flows
- `npm run lint` or `npm run lint:full` for a full-repo Biome pass

## Manual Smoke Areas

Manual verification still matters for:

- real Twitch OAuth
- real bot OAuth
- EventSub subscription creation
- chat reply delivery
- tunnel and public callback behavior
- hosted Twitch panel behavior

## Current High-Value Coverage Areas

- request parsing and request-policy rules
- viewer request mutations
- playlist management mutations
- Twitch EventSub request handling
- search filters and catalog rules
- settings save flows
