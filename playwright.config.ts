import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build (`npm run build`) served on
 * port 3000, backed by the local Supabase stack with the dev seed.
 * Hosts: *.localhost resolves to loopback in Chromium; the seeded custom
 * domains (*.test) are mapped to 127.0.0.1 below.
 */
const chromiumArgs = [
  "--host-resolver-rules=MAP roasters.test 127.0.0.1, MAP coffeehouse.test 127.0.0.1, MAP unknown-shop.test 127.0.0.1",
];

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
    launchOptions: { args: chromiumArgs },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { args: chromiumArgs } } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: { args: chromiumArgs } },
      // Lifecycle tests create data; run them once (desktop).
      testIgnore: /(management|storefront-design|catalog-admin|checkout|ai-ordering)\.spec\.ts/,
    },
    {
      name: "iphone-size",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: chromiumArgs },
      },
      testMatch: /storefront\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
