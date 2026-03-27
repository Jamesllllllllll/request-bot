import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const sourceRoots = ["src", "tests"];
const explicitFiles = [
  "package.json",
  "biome.json",
  "drizzle.config.ts",
  "playwright.config.ts",
  "postcss.config.js",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "wrangler.aux.jsonc",
  "wrangler.jsonc",
];

const mode = process.argv[2] ?? "check";
const requestedPaths = process.argv.slice(3);
const modeArgs =
  mode === "check"
    ? []
    : mode === "check-compact"
      ? ["--reporter", "summary", "--max-diagnostics", "10"]
    : mode === "check-write"
      ? ["--write"]
      : mode === "check-write-compact"
        ? ["--write", "--reporter", "summary", "--max-diagnostics", "10"]
      : mode === "format-write"
        ? ["format", "--write"]
        : null;

if (!modeArgs) {
  console.error(`Unknown biome mode: ${mode}`);
  process.exit(1);
}

const defaultPaths = [
  ...sourceRoots.filter((root) => {
    const fullRoot = path.join(repoRoot, root);
    return existsSync(fullRoot) && statSync(fullRoot).isDirectory();
  }),
  ...explicitFiles.filter((file) => {
    const fullPath = path.join(repoRoot, file);
    return existsSync(fullPath) && statSync(fullPath).isFile();
  }),
];

const targetPaths = requestedPaths.length > 0 ? requestedPaths : defaultPaths;
const commandArgs =
  mode === "format-write"
    ? [...modeArgs, "--files-ignore-unknown=true", ...targetPaths]
    : ["check", ...modeArgs, "--files-ignore-unknown=true", ...targetPaths];

const biomeEntrypoint = path.join(
  repoRoot,
  "node_modules",
  "@biomejs",
  "biome",
  "bin",
  "biome"
);

if (!existsSync(biomeEntrypoint)) {
  console.error("Biome entrypoint not found. Run npm install first.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [biomeEntrypoint, ...commandArgs], {
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
