# Contributing

## Workflow

1. Create a branch from `main`.
2. Make changes locally.
3. Run:

```bash
npm install
npm run db:bootstrap:local
npm run lint
npm run typecheck
npm run test
npm run build
```

4. Open a pull request.
5. Wait for CI to pass.
6. Review the preview deployment if one is enabled for the repository.
7. Merge to `main`.

Merges to `main` are intended to trigger a production deploy.

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
- If a change affects Twitch auth, EventSub, playlist mutations, or migrations, call that out in the PR description.
- If a change affects deployment or Cloudflare bindings, update the docs in the same PR.

## Before enabling open contributions

Recommended repository settings:

- protect `main`
- require pull requests for merge
- require the CI workflow to pass
- require at least one review before merge
- restrict direct pushes to `main`
