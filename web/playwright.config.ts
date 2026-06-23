import { defineConfig, devices } from "@playwright/test";

const WEB_BASE_URL = process.env.PLAYWRIGHT_WEB_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: "html",
  use: {
    baseURL: WEB_BASE_URL,
    trace: "on-first-retry",
    extraHTTPHeaders: {
      "X-Campus-Code": "DEMO",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm dev",
      url: WEB_BASE_URL,
      reuseExistingServer: !process.env.CI,
      cwd: "./web",
    },
  ],
});
