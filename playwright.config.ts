import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./auth-setup.ts",
  // Parallel by default. Tests that mutate shared state (password-reset.spec.ts)
  // opt into serial mode via test.describe.configure({ mode: "serial" }).
  fullyParallel: true,
  // 2-minute total budget — CI workers=4 (typical 2-core runners cap real
  // parallelism); locally bumped to 8 for M1/M2 (cap rather than auto-detect
  // so behaviour is deterministic across machines).
  workers: process.env.CI ? 4 : 8,
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
