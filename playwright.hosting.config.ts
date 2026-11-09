import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/hosting-e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5175/futable/",
    trace: "retain-on-failure",
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
    env: { SITE_BASE_PATH: "/futable/" },
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175",
    url: "http://127.0.0.1:5175/futable/",
    reuseExistingServer: false,
  },
});
