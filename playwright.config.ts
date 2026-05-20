import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * Environment + browser selection.
 *
 * Environment (base URL):
 *   - `TEST_ENV=dev|staging|prod` — auto-resolves to the right base URL.
 *     Defaults to `dev` when unset.
 *   - `BASE_URL=<url>` — explicit override; wins over `TEST_ENV`.
 *
 * Browsers:
 *   - Default: chromium only (~1 min).
 *   - `CROSS_BROWSER=1` — adds firefox + webkit projects (~3× wall-clock).
 *     Browsers are gated rather than always-on to keep the 2-min budget for
 *     normal runs. Pick a single project with `--project=firefox` at run time.
 */

type Env = "dev" | "staging" | "prod";

const ENV_URLS: Record<Env, string> = {
  dev: "https://dev.investown.net",
  staging: "https://staging.investown.net",
  prod: "https://www.investown.net",
};

function resolveBaseURL(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const env = (process.env.TEST_ENV ?? "dev") as Env;
  if (!(env in ENV_URLS)) {
    throw new Error(
      `Invalid TEST_ENV "${env}". Use one of: ${Object.keys(ENV_URLS).join(", ")}`,
    );
  }
  return ENV_URLS[env];
}

// Resolve once and pin to process.env so auth-setup.ts (which reads
// process.env.BASE_URL directly when creating the browser context) picks up
// the same URL without needing its own resolver.
const BASE_URL = resolveBaseURL();
process.env.BASE_URL = BASE_URL;

type ProjectConfig = NonNullable<
  Parameters<typeof defineConfig>[0]["projects"]
>[number];

const projects: ProjectConfig[] = [
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
];

if (process.env.CROSS_BROWSER) {
  projects.push(
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  );
}

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
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    storageState: ".auth/user.json",
  },
  projects,
});
