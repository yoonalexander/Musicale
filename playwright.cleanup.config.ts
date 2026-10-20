import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "page-cleanup.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure" },
  projects: [
    { name: "cleanup-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "cleanup-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    { command: "node tests/fixtures/page-cleanup-server.mjs", port: 55329 },
    {
      command:
        "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101/leaderboard",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55329",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-rendering-fixture",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3101",
        YOUTUBE_API_KEY: "",
      },
      timeout: 120000,
    },
  ],
});
