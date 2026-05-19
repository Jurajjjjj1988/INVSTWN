import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
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
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Sign-up tests are UI smoke only (no submit → no reCaptcha v3 challenge).
      // Sign-in + password-reset don't hit reCaptcha v3. Bundled Chromium headless is fine.
    },
  ],
});
