## UI Copy

- Treat normal app UI as end-user UI.
- Do not place development, build, deployment, testing, or setup instructions in normal user-facing screens.
- Keep commands, file paths, environment variables, route names, build artifacts, and implementation details in documentation or explicit developer-only views.
- Write UI copy around what the user can do in the product right now.
- Write UI copy in present tense.
- If a beta or testing action is intentionally exposed in the UI, keep the copy short and action-oriented without internal implementation details.

## Shipping Workflow

- When shipping a branch or preparing a commit, stage the full repo worktree with `git add -A` before committing.
- Do not rely on an already partially staged worktree unless the user explicitly says to exclude specific files.
