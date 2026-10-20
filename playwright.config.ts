import { defineConfig, devices } from "@playwright/test";
// @ts-expect-error Small Node-only test helper has no declaration file.
import { localAppEnv } from "./tests/local-env.mjs";

export default defineConfig({
  testDir: "./tests/browser",
  testIgnore: "page-cleanup.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    ...(process.platform !== "win32" ||
    process.env.MUSICALE_INCLUDE_FIREFOX === "1"
      ? [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }]
      : []),
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "node --import ./tests/catalog-fetch-fixture.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: { ...localAppEnv(), YOUTUBE_API_KEY: "musicale-browser-fixture" },
    timeout: 45000,
  },
});
