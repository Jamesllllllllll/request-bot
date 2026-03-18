import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const sourceRoots = ["src", "tests"];
const includeExtensions = new Set([".ts", ".tsx", ".js", ".json", ".jsonc"]);
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

function collectFiles(dirPath, results) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      collectFiles(fullPath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === "routeTree.gen.ts") {
      continue;
    }

    if (!includeExtensions.has(path.extname(entry.name))) {
      continue;
    }

    results.push(fullPath);
  }
}

const files = [];
for (const root of sourceRoots) {
  const fullRoot = path.join(repoRoot, root);
  if (existsSync(fullRoot) && statSync(fullRoot).isDirectory()) {
    collectFiles(fullRoot, files);
  }
}

for (const file of explicitFiles) {
  const fullPath = path.join(repoRoot, file);
  if (existsSync(fullPath) && statSync(fullPath).isFile()) {
    files.push(fullPath);
  }
}

const mode = process.argv[2] ?? "check";
const modeArgs =
  mode === "check"
    ? []
    : mode === "check-write"
      ? ["--write"]
      : mode === "format-write"
        ? ["format", "--write"]
        : null;

if (!modeArgs) {
  console.error(`Unknown biome mode: ${mode}`);
  process.exit(1);
}

const commandArgs =
  mode === "format-write"
    ? [...modeArgs, "--files-ignore-unknown=true", ...files]
    : ["check", ...modeArgs, "--files-ignore-unknown=true", ...files];

const result = spawnSync("npx", ["--no-install", "biome", ...commandArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
