import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Generator, getConfig } from "@tanstack/router-generator";

const repoRoot = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const checkMode = process.argv.includes("--check");

const config = getConfig(
  {
    routesDirectory: "./src/routes",
    generatedRouteTree: "./src/routeTree.gen.ts",
  },
  repoRoot
);

if (checkMode) {
  const actualOutputPath = config.generatedRouteTree;
  const parsedOutputPath = path.parse(actualOutputPath);
  const checkOutputPath = path.join(
    parsedOutputPath.dir,
    `${parsedOutputPath.name}.check${parsedOutputPath.ext}`
  );
  const generator = new Generator({
    config: {
      ...config,
      generatedRouteTree: checkOutputPath,
    },
    root: repoRoot,
  });

  try {
    await generator.run();

    const [actualContent, generatedContent] = await Promise.all([
      readFile(actualOutputPath, "utf8"),
      readFile(checkOutputPath, "utf8"),
    ]);

    if (actualContent !== generatedContent) {
      console.error(
        `Route tree is out of date. Run npm run routes:generate to update ${actualOutputPath}.`
      );
      process.exit(1);
    }

    console.log(`Verified ${actualOutputPath}`);
  } finally {
    await rm(checkOutputPath, { force: true });
  }
} else {
  const generator = new Generator({
    config,
    root: repoRoot,
  });

  await generator.run();
}
