import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const allowedHosts = new Set<string>();
  const appUrl = env.APP_URL?.trim();

  if (appUrl) {
    try {
      allowedHosts.add(new URL(appUrl).hostname);
    } catch {
      // Ignore invalid APP_URL values here; runtime config will fail separately.
    }
  }

  const extraAllowedHosts = env.VITE_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  for (const host of extraAllowedHosts ?? []) {
    allowedHosts.add(host);
  }

  return {
    resolve: {
      alias: {
        "~": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    plugins: [
      tanstackStart(),
      react(),
      cloudflare({
        viteEnvironment: { name: "ssr" },
        auxiliaryWorkers: [{ configPath: "./wrangler.aux.jsonc" }],
      }),
    ],
    server: {
      allowedHosts: [...allowedHosts],
    },
  };
});
