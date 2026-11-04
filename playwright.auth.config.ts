import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/auth-e2e",
  use: {
    baseURL: "http://127.0.0.1:5175",
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort",
    url: "http://127.0.0.1:5175",
    env: {
      VITE_SUPABASE_URL: "https://auth.liga.test",
      VITE_SUPABASE_ANON_KEY: "test-public-key",
    },
    reuseExistingServer: false,
  },
});
