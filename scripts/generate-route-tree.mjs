import path from "node:path";
import { fileURLToPath } from "node:url";
import { Generator, getConfig } from "@tanstack/router-generator";

const repoRoot = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = getConfig(
  {
    routesDirectory: "./src/routes",
    generatedRouteTree: "./src/routeTree.gen.ts",
  },
  repoRoot
);

const generator = new Generator({
  config,
  root: repoRoot,
});

await generator.run();
