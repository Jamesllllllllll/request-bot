import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  use: {
    baseURL: "http://localhost:9100",
    headless: true,
  },
  webServer: {
    command: "npm run predev && npx vite dev --port 9100 --strictPort",
    url: "http://localhost:9100",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
