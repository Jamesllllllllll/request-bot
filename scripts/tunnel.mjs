import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaults = {
  tunnelId: "4ac1a27b-efe2-402a-a0ae-21ec35d61591",
  tunnelName: "request-bot-dev",
  tunnelHost: "dev.itsaunix.systems",
  localUrl: "http://localhost:9000",
};

const env = process.env;
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(`Starts the repo-local Cloudflare tunnel for HTTPS OAuth/dev testing.

Defaults:
- tunnel: ${defaults.tunnelName}
- hostname: ${defaults.tunnelHost}
- local origin: ${defaults.localUrl}

Override with:
- REQUEST_BOT_TUNNEL_ID
- REQUEST_BOT_TUNNEL_HOST
- REQUEST_BOT_TUNNEL_URL
- REQUEST_BOT_TUNNEL_CREDENTIALS_FILE
`);
  process.exit(0);
}

const tunnelId = env.REQUEST_BOT_TUNNEL_ID || defaults.tunnelId;
const tunnelHost = env.REQUEST_BOT_TUNNEL_HOST || defaults.tunnelHost;
const localUrl = env.REQUEST_BOT_TUNNEL_URL || defaults.localUrl;
const credentialsFile =
  env.REQUEST_BOT_TUNNEL_CREDENTIALS_FILE ||
  path.join(os.homedir(), ".cloudflared", `${tunnelId}.json`);

try {
  await access(credentialsFile);
} catch {
  console.error(
    `Cloudflare tunnel credentials file was not found at "${credentialsFile}".`
  );
  process.exit(1);
}

console.log(`Starting Cloudflare tunnel for ${tunnelHost} -> ${localUrl}`);

const child = spawn(
  "cloudflared",
  [
    "tunnel",
    "--config",
    os.platform() === "win32" ? "NUL" : "/dev/null",
    "run",
    "--credentials-file",
    credentialsFile,
    "--url",
    localUrl,
    tunnelId,
  ],
  {
    stdio: "inherit",
  }
);

child.on("error", (error) => {
  if ("code" in error && error.code === "ENOENT") {
    console.error("cloudflared is not installed or not on PATH.");
    process.exit(1);
  }

  console.error(
    `Failed to start cloudflared: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
