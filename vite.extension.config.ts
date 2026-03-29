import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function normalizeBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/g, "");
  return normalized || null;
}

export default defineConfig(({ mode }) => {
  const repoRoot = fileURLToPath(new URL("./", import.meta.url));
  const panelRoot = fileURLToPath(
    new URL("./src/extension/panel", import.meta.url)
  );
  const env = loadEnv(mode, repoRoot, "");
  const extensionApiBaseUrl =
    normalizeBaseUrl(env.VITE_TWITCH_EXTENSION_API_BASE_URL) ??
    normalizeBaseUrl(env.APP_URL);

  if (!extensionApiBaseUrl) {
    throw new Error(
      "build:extension:panel requires VITE_TWITCH_EXTENSION_API_BASE_URL or APP_URL."
    );
  }

  // Force the hosted panel artifact to call the real app origin instead of
  // falling back to the Twitch CDN origin at runtime.
  return {
    root: panelRoot,
    envDir: repoRoot,
    base: "./",
    define: {
      "import.meta.env.VITE_TWITCH_EXTENSION_API_BASE_URL":
        JSON.stringify(extensionApiBaseUrl),
    },
    resolve: {
      alias: {
        "~": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    plugins: [react()],
    build: {
      outDir: fileURLToPath(
        new URL("./dist/twitch-extension/panel", import.meta.url)
      ),
      emptyOutDir: true,
    },
  };
});
