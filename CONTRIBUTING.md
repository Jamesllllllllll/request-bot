# Contributing

## Workflow

1. Branch from `main`.
2. Install dependencies and bootstrap local data:

```bash
npm install
npm run db:bootstrap:local
```

3. Make the change.
4. Commit and push normally:

```bash
git add -A
git commit
git push
```

Stage the full worktree before every commit unless you intentionally need to exclude something. If a file should stay out of the commit, make that explicit instead of relying on a partially staged worktree.

The repo hooks handle the default checks:

- `pre-commit`: blocks commits on `main` and runs staged-file Biome fixes/checks
- `pre-push`: runs generated-file checks, typecheck, and tests

If you want the push-time gate before pushing, run:

```bash
npm run check:prepush
```

Run extra checks only when the change needs them:

- `npm run build` for deployment-sensitive changes
- `npm run test:e2e` for browser flows
- `npm run lint` or `npm run lint:full` for a full-repo Biome pass
- `npm run check:ship` for the full pre-PR ship flow
- `npm run build:extension:package` when the change affects the Twitch-uploaded panel UI or panel static assets

## Codex Ship Flow

Use this trigger when you want Codex to run the full branch shipping workflow:

```text
Use $request-bot-ship to ship this branch.
```

That flow runs the repo ship checks, packages the Twitch panel artifact locally when the change affects the Twitch-uploaded panel UI or panel static assets, stages the full worktree with `git add -A`, commits it, pushes it, opens the PR, waits for checks, and merges only after checks pass.

## Commit Messages

Use this format:

- imperative present tense
- one short subject line
- no trailing period
- summarize the primary outcome

Examples:

- `Refine ship workflow and docs`
- `Add panel packaging and release checks`

## Pull Requests

- Keep the scope focused.
- Add or update tests when behavior changes.
- Update docs in the same PR when the workflow, setup, deploy path, or product behavior changes.
- Call out migrations, Twitch auth changes, EventSub changes, queue mutations, or Cloudflare binding changes in the PR description.

## Database Changes

- Update [schema.ts](src/lib/db/schema.ts)
- Add the matching SQL migration under [drizzle](drizzle)
- Run:

```bash
npm run db:migrate
```

Do not leave code that expects a schema change without a checked-in migration.

## Releases

- Keep [CHANGELOG.md](CHANGELOG.md) and [package.json](package.json) aligned when preparing a release.
- Use `0.x.x` while the app is still pre-`1.0`.
- Use a patch release for routine shipped work.
- Use a minor release when the shipped product scope expands materially.

## Start Here

- [README.md](README.md)
- [docs/local-development.md](docs/local-development.md)
- [docs/deployment-workflow.md](docs/deployment-workflow.md)
