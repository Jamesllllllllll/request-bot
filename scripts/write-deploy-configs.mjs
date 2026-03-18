import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const deployEnvPath = join(process.cwd(), ".env.deploy");

if (existsSync(deployEnvPath)) {
  const envContents = readFileSync(deployEnvPath, "utf8");

  for (const rawLine of envContents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) {
    throw new Error(
      "Expected arguments in the form --key value. Example: --mode preview --suffix pr-12 --app-url https://example.workers.dev"
    );
  }

  args.set(key.slice(2), value);
}

const mode = args.get("mode");
const suffix = args.get("suffix");
const appUrl = args.get("app-url") ?? process.env.APP_URL;
const artifact = args.get("artifact") ?? "source";
const d1DatabaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const sessionKvId = process.env.CLOUDFLARE_SESSION_KV_ID;
const twitchBotUsername = process.env.TWITCH_BOT_USERNAME;
const twitchScopes = process.env.TWITCH_SCOPES;

if (mode !== "preview" && mode !== "production") {
  throw new Error("`--mode` must be `preview` or `production`.");
}

if (artifact !== "source" && artifact !== "build") {
  throw new Error("`--artifact` must be `source` or `build`.");
}

if (!appUrl) {
  throw new Error(
    "`--app-url` is required. Set it explicitly or provide APP_URL in the environment."
  );
}

if (!d1DatabaseId) {
  throw new Error(
    "CLOUDFLARE_D1_DATABASE_ID is required to generate deploy configs."
  );
}

if (!sessionKvId) {
  throw new Error(
    "CLOUDFLARE_SESSION_KV_ID is required to generate deploy configs."
  );
}

if (mode === "preview" && !suffix) {
  throw new Error("`--suffix` is required in preview mode.");
}

const root = process.cwd();
const outputDir = join(root, ".generated");
mkdirSync(outputDir, { recursive: true });

const frontendConfigBasePath =
  artifact === "build"
    ? join(root, "dist", "server", "wrangler.json")
    : join(root, "wrangler.jsonc");
const backendConfigBasePath =
  artifact === "build"
    ? join(root, "dist", "request_bot_backend", "wrangler.json")
    : join(root, "wrangler.aux.jsonc");

const frontendConfig = JSON.parse(readFileSync(frontendConfigBasePath, "utf8"));
const backendConfig = JSON.parse(readFileSync(backendConfigBasePath, "utf8"));

const frontendName =
  mode === "preview" ? `${frontendConfig.name}-${suffix}` : frontendConfig.name;
const backendName =
  mode === "preview" ? `${backendConfig.name}-${suffix}` : backendConfig.name;

frontendConfig.name = frontendName;
backendConfig.name = backendName;
frontendConfig.assets = frontendConfig.assets
  ? {
      ...frontendConfig.assets,
      directory:
        artifact === "build"
          ? join(root, "dist", "server", frontendConfig.assets.directory)
          : join(root, frontendConfig.assets.directory),
    }
  : frontendConfig.assets;
frontendConfig.main =
  artifact === "build"
    ? join(root, "dist", "server", frontendConfig.main)
    : frontendConfig.main;
backendConfig.main =
  artifact === "build"
    ? join(root, "dist", "request_bot_backend", backendConfig.main)
    : join(root, backendConfig.main);

frontendConfig.d1_databases = (frontendConfig.d1_databases ?? []).map(
  (binding) =>
    binding.binding === "DB"
      ? {
          ...binding,
          database_id: d1DatabaseId,
          migrations_dir: join(root, binding.migrations_dir),
        }
      : binding
);
backendConfig.d1_databases = (backendConfig.d1_databases ?? []).map(
  (binding) =>
    binding.binding === "DB"
      ? {
          ...binding,
          database_id: d1DatabaseId,
          migrations_dir: join(root, binding.migrations_dir),
        }
      : binding
);
frontendConfig.kv_namespaces = (frontendConfig.kv_namespaces ?? []).map(
  (binding) =>
    binding.binding === "SESSION_KV" ? { ...binding, id: sessionKvId } : binding
);

frontendConfig.services = (frontendConfig.services ?? []).map((binding) =>
  binding.binding === "BACKEND_SERVICE"
    ? { ...binding, service: backendName }
    : binding
);
backendConfig.services = (backendConfig.services ?? []).map((binding) =>
  binding.binding === "APP_SERVICE"
    ? { ...binding, service: frontendName }
    : binding
);

frontendConfig.vars = {
  ...(frontendConfig.vars ?? {}),
  APP_URL: appUrl,
  ...(twitchBotUsername ? { TWITCH_BOT_USERNAME: twitchBotUsername } : {}),
  ...(twitchScopes ? { TWITCH_SCOPES: twitchScopes } : {}),
};
backendConfig.vars = {
  ...(backendConfig.vars ?? {}),
  APP_URL: appUrl,
  ...(twitchBotUsername ? { TWITCH_BOT_USERNAME: twitchBotUsername } : {}),
};

const suffixLabel = mode === "preview" ? "preview" : "production";
const frontendOutputPath = join(outputDir, `wrangler.${suffixLabel}.jsonc`);
const backendOutputPath = join(outputDir, `wrangler.aux.${suffixLabel}.jsonc`);

writeFileSync(frontendOutputPath, `${JSON.stringify(frontendConfig, null, 2)}\n`);
writeFileSync(backendOutputPath, `${JSON.stringify(backendConfig, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      frontendConfigPath: frontendOutputPath,
      backendConfigPath: backendOutputPath,
      frontendName,
      backendName,
      appUrl,
    },
    null,
    2
  )
);
