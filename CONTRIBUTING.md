# Contributing

## Welcome

Playwright + TypeScript E2E suite for `dev.investown.net`. Covers sign-in, sign-up, forgot/reset password, and the `/user` profile portal. This doc is the handover guide for the next maintainer — read it before touching anything.

## Quick start (5-minute setup)

1. Clone the repo:
   ```bash
   git clone https://github.com/Jurajjjjj1988/INVSTWN.git investown-tests
   cd investown-tests
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install the browser:
   ```bash
   npx playwright install chromium
   ```
4. Sign up at https://mailsac.com (free), then `Account -> API Keys -> Generate`. Free tier = 1500 calls / month. Mark the inbox you will use as **Private** in the mailsac UI so reset links are not world-readable.
5. Sign up on https://dev.investown.net/sign-up with your mailsac inbox as the email. Set a password, verify SMS, complete the form. This is your seed account.
6. Configure env:
   ```bash
   cp .env.example .env
   # Fill INVESTOWN_EMAIL, INVESTOWN_PASSWORD, INVESTOWN_PHONE, MAILSAC_API_KEY
   ```
7. Verify the setup compiles:
   ```bash
   npm run typecheck
   ```
8. Run the suite:
   ```bash
   npm test
   ```

If `npm test` is green, you are done.

## Project conventions

- **Selectors**: `getByRole`, `getByLabel`, `getByText`, `getByTestId`, `getByPlaceholder` only. No `.nth()`, no CSS classes, no XPath. See `pages/sign-in.page.ts` for the canonical shape.
- **No `any`**: TypeScript strict mode. Use real types or `unknown` + narrowing.
- **No hard waits**: no `waitForTimeout`, `setTimeout`, `sleep`. Use Playwright auto-waiting or `waitForURL` / `waitFor({ state })`.
- **Test naming**: imperative and descriptive — `"login with wrong password shows error and stays on sign-in"`. Not `"login test 1"`.
- **Tags**: every test gets at least one outcome tag and at least one topic tag.
  - Outcome: `@positive`, `@negative`, `@edge`, `@security`
  - Topic: `@auth`, `@password`, `@notifications`, `@profile`, ...
  - Tag syntax: `test("name", { tag: ["@positive", "@auth"] }, async ({ ... }) => { ... })`.
- **Commits**: NO Claude / AI attribution. Author email must be `juraj.kapusansky@gmail.com` for handover commits (matches the GitHub account `Jurajjjjj1988`).
- **POM pattern**: one file per page under `pages/`, exposed via the fixture in `fixtures/pages.fixture.ts`. `readonly Locator` declared in the constructor, public methods documented with JSDoc, no test logic inside POMs.

## How to add a new test

Example: add a test that checks the "Languages" toggle on `/user/languages` is hidden when feature flag X is off.

1. **Locate the section.** It lives in `tests/profile.spec.ts` (profile portal coverage). Check whether a POM for that page already exists in `pages/`. For `/user/*` the POM is `pages/profile.page.ts`.
2. **Extend the POM** (do not duplicate). Add a `readonly Locator` field, expose a public method with JSDoc. Stable selector only.
3. **Add mocks** in `data/profile-mocks.ts` if the test is API-driven. Layer overrides on top of `setupProfileBaseline(page)` — last-registered `page.route()` wins.
4. **Write the spec** in `tests/<feature>.spec.ts`. Use the fixture: `import { test, expect } from "../fixtures/pages.fixture.js"`.
5. **Tag** it: `{ tag: ["@negative", "@profile"] }`.
6. **Run locally**:
   ```bash
   npx playwright test --grep "test name"
   npx playwright test profile.spec.ts --headed
   ```
7. **Open a PR** against `main`. CI (typecheck + e2e) gates the merge.

## Things NOT to break

- **`auth-setup.ts`** runs **once** as `globalSetup`. It does a real UI login and writes `.auth/user.json`. Every profile test inherits that storage state. Break this and the entire suite collapses.
- **`.env`** values are read both at runtime AND by `globalSetup`. Empty / invalid values crash the whole run before a single test starts. Always run `npm run typecheck` after editing `.env`.
- **`auth/current-password.json`** is **not** `.auth/user.json` — different file, different purpose. It tracks the _current_ seed password (rotated by `tests/password-reset.spec.ts`) so `sign-in.spec.ts` can still log in after a reset run. Do not delete it manually during a run. Read `helpers/credentials.ts` first.
- **Mailsac inbox** must stay **Private** in the mailsac UI. Public = anyone who knows the inbox name can read reset links and hijack the account.
- **`helpers/cognito.ts`** is the hybrid UI + API password reset. The Cognito `ClientId` comes from `INVESTOWN_COGNITO_CLIENT_ID` in `.env`. Do not hardcode it. Do not point it at a different region without checking the user pool.
- **`tests/sign-in.spec.ts` + `tests/password-reset.spec.ts`** opt into `mode: "serial"` because they share the single seed account and Investown rate-limits per account. Do not remove the serial config unless you are seeding a second account.

## Troubleshooting

- **Submit button stays disabled after `fill()`** — React Hook Form with `mode: "onBlur"` does not validate on `input` events. See [Playwright #15813](https://github.com/microsoft/playwright/issues/15813). Workaround: `fill() + dispatchEvent("blur")`. Canonical example: `pages/sign-in.page.ts` (`fillEmail`, `fillPassword`).
- **Mailsac body is empty / JSON-only** — `/api/addresses/{inbox}/messages/{id}` returns metadata only. Raw HTML body lives on `/api/dirty/{inbox}/{id}`. See `helpers/mailsac.ts` `fetchBodyHtml`.
- **Sign-up redirects to sign-in before the form renders** — reCaptcha v3 blocks bundled Chromium. `playwright.config.ts` already sets `channel: "chrome"` to use real Chrome. If you still get redirected, the dev team must enable a test reCaptcha key for `dev.investown.net`.
- **`login with valid credentials` flake** — login can land on `/dashboard` OR on a "Last step" SMS 2FA page. Both prove credentials are correct. The test asserts on either — do not tighten it to only `/dashboard` or you will hit false negatives.
- **`MAILSAC_API_KEY` 401 / 403** — free-tier quota is 1500 calls / month; check the mailsac dashboard. Auth errors fail fast in `helpers/mailsac.ts` (no infinite polling).
- **`auth/current-password.json` missing on a clean clone** — expected. `helpers/credentials.ts` falls back to `INVESTOWN_PASSWORD` from `.env`. The file is populated the first time `password-reset.spec.ts` runs.

## CI / GitHub Actions

`.github/workflows/e2e.yml` runs on every PR to `main` and on every push to `main`. Two jobs:

- **`typecheck`** — `npm ci` + `npm run typecheck` (`playwright test --list`). ~30s. Catches type errors before browsers boot.
- **`e2e`** — depends on `typecheck`. Installs Chrome (cached), runs `npm test` with `CI=true` (which sets `workers: 4`). Uploads `playwright-report/` on every run, `test-results/` (traces, screenshots, videos) only on failure.

**Required GitHub secrets** (`Settings -> Secrets and variables -> Actions`):

- `INVESTOWN_EMAIL`
- `INVESTOWN_PASSWORD`
- `INVESTOWN_PHONE`
- `MAILSAC_API_KEY`
- `BASE_URL`
- `INVESTOWN_COGNITO_CLIENT_ID`

Non-secret vars (`INVESTOWN_FIRST_NAME`, `INVESTOWN_LAST_NAME`, `INVESTOWN_COGNITO_URL`) are inlined in the workflow.

**Debugging a failed CI run**: open the run on GitHub, scroll to `Artifacts`, download `playwright-report`, open `index.html` locally. For deeper investigation (DOM snapshots, video) download `test-results`.

## Where to get help

- Playwright docs: https://playwright.dev/docs/intro
- Mailsac API docs: https://docs.mailsac.com/
- Cognito `ConfirmForgotPassword`: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ConfirmForgotPassword.html
- Original author: juraj.kapusansky@gmail.com
