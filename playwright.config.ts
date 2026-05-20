import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./auth-setup.ts",
  // Parallel by default. Tests that mutate shared state (password-reset.spec.ts)
  // opt into serial mode via test.describe.configure({ mode: "serial" }).
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined, // local: all cores; CI: 2 (one test account)
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    storageState: ".auth/user.json",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Real Chrome — bundled Chromium has subtle differences with React
        // controlled inputs on the reset-password form (fill doesn't flip the
        // submit button enabled state). Stays headless.
        channel: "chrome",
      },
    },
  ],
});
