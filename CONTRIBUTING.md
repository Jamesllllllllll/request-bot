# Contributing

## Workflow

1. Create a branch from `main`.
2. Install dependencies and bootstrap the local database:

```bash
npm install
npm run db:bootstrap:local
```

3. Make changes locally.
4. Commit normally. Husky runs the routine local checks for you:

- on commit: block commits on `main` with a friendly branch-switch reminder
- on commit: staged-file Biome fixes/checks
- on push: generated-file verification, typecheck, and tests

5. If you want to run the same push-time validation manually before pushing, use:

```bash
npm run check:prepush
```

6. Only run extra checks when the change needs them:

- run `npm run build` if the change affects deployment/build behavior or you want an extra production sanity check
- run `npm run test:e2e` if you changed user-facing flows or browser interactions
- run `npm run lint` manually if you want the compact full-repo Biome pass outside the staged-file hook
- run `npm run lint:full` if you want Biome's detailed inline diagnostics and formatter diffs

7. Open a pull request.
8. Wait for CI to pass.
9. Review the preview deployment if one is enabled for the repository.
10. Merge to `main`.

Merges to `main` are intended to trigger a production deploy.

## Day-to-day local checks

Most contributors should not need to run `format`, `lint`, `test`, and `typecheck` manually before every commit.

Use this default path instead:

```bash
git add <files>
git commit
git push
```

If a hook fails:

- fix the reported issue and retry
- or run `npm run check:prepush` yourself to reproduce the push-time gate before pushing again
- if the branch guard blocks a commit on `main`, switch to a feature branch before committing

## Releases

- Keep [CHANGELOG.md](/C:/Users/james/Documents/Projects/request-bot/CHANGELOG.md) and [package.json](/C:/Users/james/Documents/Projects/request-bot/package.json) in sync when preparing a release PR.
- Use `0.x.x` for normal minor/patch releases while the project is still pre-`1.0`.
- If the release is a major milestone or materially changes the product scope, bump the middle digit such as `0.2.0`.
- Otherwise, use a patch release such as `0.1.1`.
- Ask explicitly which release level is intended if it is not obvious from the scope of the work.

## Local development

Start here:

- [README.md](/C:/Users/james/Documents/Projects/request-bot/README.md)
- [docs/local-development.md](/C:/Users/james/Documents/Projects/request-bot/docs/local-development.md)

## Database changes

- Put schema changes in [src/lib/db/schema.ts](/C:/Users/james/Documents/Projects/request-bot/src/lib/db/schema.ts)
- Generate or add the matching SQL migration in [drizzle](/C:/Users/james/Documents/Projects/request-bot/drizzle)
- Run `npm run db:migrate`
- Do not leave the code expecting a schema change that is not represented by a migration

The app checks the latest applied migration at runtime and fails early if the local database is behind.

## Pull request expectations

- Keep changes focused.
- Include tests when you change behavior.
- Do not rely on CI as your first feedback loop. Use the commit/push hooks, or run `npm run check:prepush` manually before opening the PR.
- If a change affects Twitch auth, EventSub, playlist mutations, or migrations, call that out in the PR description.
- If a change affects deployment or Cloudflare bindings, update the docs in the same PR.

## Before enabling open contributions

Recommended repository settings:

- protect `main`
- require pull requests for merge
- require the CI workflow to pass
- require at least one review before merge
- restrict direct pushes to `main`
