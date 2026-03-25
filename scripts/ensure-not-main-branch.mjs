import { spawnSync } from "node:child_process";

const bypassValue = process.env.ALLOW_MAIN_COMMIT;

if (bypassValue === "1" || bypassValue === "true") {
  process.exit(0);
}

const result = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
  encoding: "utf8",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

// Detached HEAD is not the normal contributor flow, but it is also not `main`.
if (result.status !== 0) {
  process.exit(0);
}

const branchName = result.stdout.trim();

if (branchName !== "main") {
  process.exit(0);
}

console.error("Committing on `main` is blocked in this repo.");
console.error("Create a feature branch first, for example:");
console.error("  git switch -c feature/my-change");
console.error("");
console.error("If you intentionally need to bypass this once, set `ALLOW_MAIN_COMMIT=1` for that commit.");
process.exit(1);
