import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3000";
const smoke = process.env.RUN_SMOKE === "1";

export default defineConfig({
  testDir: "e2e",
  // The specs share one database.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // @smoke hits the real model and only runs when asked for.
  grepInvert: smoke ? undefined : /@smoke/,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev",
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { MOCK_LLM: smoke ? "0" : "1" },
      },
});
