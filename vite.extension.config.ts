import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./src/extension/panel", import.meta.url)),
  base: "./",
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
});
