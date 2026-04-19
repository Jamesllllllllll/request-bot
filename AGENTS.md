## UI Copy

- Treat normal app UI as end-user UI.
- Do not place development, build, deployment, testing, or setup instructions in normal user-facing screens.
- Keep commands, file paths, environment variables, route names, build artifacts, and implementation details in documentation or explicit developer-only views.
- Write UI copy around what the user can do in the product right now.
- Write UI copy in present tense.
- If a beta or testing action is intentionally exposed in the UI, keep the copy short and action-oriented without internal implementation details.

## Public Release Copy

- Treat `CHANGELOG.md` as public end-user copy. It is shown inside the app, so write it for a broad audience.
- Write changelog entries in plain language around visible improvements, new capabilities, and user-facing fixes.
- Do not describe internal debugging, implementation mistakes, infrastructure failures, or engineering process details unless they matter directly to users.
- Avoid technical internals such as SQL, database query behavior, CI, hooks, migration mechanics, deployment plumbing, or exact failure modes in public changelog entries.
- If a change is mostly internal, summarize the user-facing benefit or omit it from the public changelog.

## Catalog References

- Do not use specific song titles, artist names, chart examples, or catalog contents as public examples in UI copy, documentation, or repo instructions unless the user explicitly asks for them.
- Keep public-facing copy neutral about catalog contents and focus on product behavior instead of example entries.

## GitHub Issues

- Keep GitHub issue writing very concise.
- Use informal, conversational language instead of formal product-spec language.
- Preserve the existing issue template or heading structure when rewriting an issue unless there is a clear reason to change it.
- Keep issue comments short and practical.

## Runtime And Browser Checks

- For this repo, assume the app is normally already running at `http://localhost:9000`.
- Before starting another dev server, first check the existing app at `http://localhost:9000`.
- For auth-sensitive browser flows, use `https://dev.itsaunix.systems` first because Twitch login and callback flows depend on the public HTTPS tunnel.
- Do not start a second local dev server on another port unless `http://localhost:9000` and `https://dev.itsaunix.systems` are both unavailable or the user explicitly asks for a separate server.

## Shipping Workflow

- Never commit directly to `main`.
- Never push directly to `main`.
- If work starts on `main`, create a feature branch before staging, committing, or pushing. Do not use hook bypasses or one-off environment variables to commit on `main`.
- When shipping a branch or preparing a commit, stage the full repo worktree with `git add -A` before committing.
- Do not rely on an already partially staged worktree unless the user explicitly says to exclude specific files.
- When a branch is intended to merge into `main`, update the release version in `package.json` and `package-lock.json` and add a matching top changelog entry in `CHANGELOG.md`.
- Use a real semver release heading for shipped work. Do not leave shipped changes under an `Unreleased` section.
- Choose the version bump deliberately: patch for routine shipped work and fixes, minor for materially expanded shipped scope, major for intentional breaking release boundaries.
