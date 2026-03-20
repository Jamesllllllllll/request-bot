import { execSync } from "node:child_process";

const operations = {
  "db:migrate:remote": {
    localAlternative: "npm run db:migrate",
    commands: [
      "npm run deploy:prepare:source",
      "wrangler d1 migrations apply request_bot --remote --config .generated/wrangler.production.jsonc",
    ],
  },
  "db:seed:sample:remote": {
    localAlternative: "npm run db:seed:sample:local",
    commands: [
      "npm run deploy:prepare:source",
      "wrangler d1 execute request_bot --remote --config .generated/wrangler.production.jsonc --file data/sample-catalog.sql",
    ],
  },
  "db:bootstrap:remote": {
    localAlternative: "npm run db:bootstrap:local",
    commands: [
      "npm run deploy:prepare:source",
      "wrangler d1 migrations apply request_bot --remote --config .generated/wrangler.production.jsonc",
      "wrangler d1 execute request_bot --remote --config .generated/wrangler.production.jsonc --file data/sample-catalog.sql",
    ],
  },
  "deploy:backend": {
    localAlternative: null,
    commands: ["wrangler deploy --config .generated/wrangler.aux.production.jsonc"],
  },
  "deploy:frontend": {
    localAlternative: null,
    commands: ["wrangler deploy --config .generated/wrangler.production.jsonc"],
  },
  deploy: {
    localAlternative: null,
    commands: [
      "npm run build",
      "npm run deploy:prepare",
      "wrangler deploy --config .generated/wrangler.aux.production.jsonc",
      "wrangler deploy --config .generated/wrangler.production.jsonc",
    ],
  },
};

const operationName = process.argv[2];

if (!operationName || !(operationName in operations)) {
  console.error("Unknown remote operation.");
  process.exit(1);
}

const operation = operations[operationName];
const inCi =
  process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const allowOverride = process.env.ALLOW_REMOTE_OPERATIONS === "1";

if (!inCi && !allowOverride) {
  console.error("");
  console.error(`Remote operation "${operationName}" is blocked outside CI.`);
  console.error("");

  if (operation.localAlternative) {
    console.error("Use this instead for local development:");
    console.error(`  ${operation.localAlternative}`);
    console.error("");
  }

  console.error(
    "Production migrations and deploys are handled by GitHub Actions"
  );
  console.error("when changes are merged to main.");
  console.error("");
  console.error(
    "If you intentionally need a maintainer override, rerun with:"
  );
  console.error(`  ALLOW_REMOTE_OPERATIONS=1 npm run ${operationName}`);
  console.error("");
  process.exit(1);
}

for (const command of operation.commands) {
  execSync(command, {
    stdio: "inherit",
  });
}
