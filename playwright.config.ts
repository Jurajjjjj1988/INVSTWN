import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
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
