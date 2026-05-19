# Investown E2E Tests

Playwright + TypeScript test suite for `dev.investown.net`.

## What is covered

| Test file                                 | Scope                                                                              | Status                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| `tests/sign-in.spec.ts`                   | Login: form, valid/invalid creds, forgot link, empty/malformed email, non-existent | ✅ **8 tests pass** (serial)            |
| `tests/forgot-password.spec.ts`           | Forgot-password: empty + malformed email + non-existent (security)                 | ✅ 2 pass + 1 `test.fixme` (rate-limit) |
| `tests/password-reset.spec.ts`            | Full E2E reset (request → mail via API → click link → set password)                | ⚠️ `test.fixme` (rate-limited)          |
| `tests/reset-password-validation.spec.ts` | Password policy rules (length, case, digit, confirm mismatch)                      | ⚠️ `describe.fixme` (rate-limited)      |
| `tests/sign-up.spec.ts`                   | Sign-up UI smoke (form, navigation, validation)                                    | ⏸️ `describe.skip` (reCaptcha v3)       |

## What is NOT automated — and why

Three platform-side blockers, all documented in the test files:

1. **Full sign-up flow with SMS OTP verification** (`sign-up.spec.ts` — `test.describe.skip`)
   Investown reCaptcha v3 redirects headless bundled Chromium to sign-in before the form renders. Real Chrome (`channel: 'chrome'`) works but disturbs the user during runs. Documented for when a test reCaptcha key is available.
2. **Full password-reset E2E** (`password-reset.spec.ts` — `test.fixme`)
   Investown rate-limits the password-reset endpoint per account. Re-running within ~30 min causes the mail to never arrive. Code is complete; needs a dedicated test account per run or longer cool-down.
3. **Post-login SMS 2FA verification**
   KYC compliance control — not bypassable client-side. Sign-in test handles the branching (lands on dashboard OR "Last step" 2FA page — both prove login succeeded).

### Reset-password POM — React Hook Form fix (preserved)

`pages/reset-password.page.ts` `setNewPassword()` uses `pressSequentially({ delay: 30 }) + press('Tab')` instead of `fill()`. Investown's reset form uses React Hook Form with `mode: 'onBlur'` — plain `fill()` emits `input` but not `blur`, RHF validators don't run, submit button stays disabled. See [Playwright #15813](https://github.com/microsoft/playwright/issues/15813). The fix is preserved; full E2E will pass once the per-account password-reset rate-limit decays (~30+ min between runs).

**To unblock locally:**

- Wait ≥30 min after the last reset request on the test account, OR
- Sign up a fresh account (new testmail alias + new UK number), update `.env`, re-enable the `fixme`'d tests.

Industry-standard approaches:

1. **Manual one-time signup + saved auth state** (this project's approach) — sign up by hand, save `auth/current-password.json`, all tests use the seeded account.
2. **Request test reCaptcha key + 2FA bypass from the platform team** — production-grade path for serious QA.
3. **Real SIM + Android SMS Gateway** (paid setup) — only if you really need automated signup.

## Setup

```bash
npm install
npx playwright install chromium

cp .env.example .env
# Fill in TESTMAIL_API_KEY and TESTMAIL_NAMESPACE (sign up free at testmail.app)
```

## Test account

Pre-verified seed account on `dev.investown.net` (staging only, no real money).

| Field            | Value                                 |
| ---------------- | ------------------------------------- |
| Email            | `a6ncd.investown2@inbox.testmail.app` |
| Initial password | _see `INVESTOWN_PASSWORD` in `.env`_  |
| Name             | `TESTER TEST`                         |
| Phone            | `+447481762285` (UK temp-number.com)  |

> ⚠️ Staging only. Email inbox is public to anyone with the testmail.app namespace; never reuse this password elsewhere.

## Password drift — how it's handled

Every full `password-reset.spec.ts` run **changes the account password**. Without handling, subsequent runs would fail because `.env` would have a stale password.

**Solution:** the reset test resets the password to a **known value** (from `.env`) and persists it to `auth/current-password.json`. `sign-in.spec.ts` reads from that file via `helpers/credentials.ts` (falls back to `.env` if file doesn't exist).

```
.env (INVESTOWN_PASSWORD)
  ↓ fallback if file missing
auth/current-password.json (written by password-reset.spec.ts)
  ↓ read by
sign-in.spec.ts → loadCurrentPassword()
```

This makes the suite **idempotent** — runs in any order produce the same final state.

## Run

```bash
npm test                              # all tests, headless
npm run test:headed                   # visible browser
npm run test:ui                       # interactive UI mode
npx playwright test sign-in.spec.ts   # one file
```

## Project structure

```
data/             Test data constants (env-driven)
fixtures/         Playwright fixtures (POM injection)
helpers/
  ├── testmail.ts      testmail.app API wrapper (waitForEmail, extractLink)
  └── credentials.ts   Load/save current password between test runs
pages/            Page Object Models
  ├── sign-up-email.page.ts
  ├── sign-up-phone.page.ts
  ├── dashboard.page.ts
  ├── verification.page.ts
  ├── sign-in.page.ts
  ├── forgot-password.page.ts
  └── reset-password.page.ts
tests/            Spec files
auth/             [GITIGNORED] Persisted current password between runs
```

## Architecture decisions

- **POM pattern** with fixture-based DI (`fixtures/pages.fixture.ts`).
- **Stable selectors only** — `getByRole`, `getByLabel` (no `.nth()`, no CSS classes).
- **Real APIs over mocks** — tests hit live `dev.investown.net` and real testmail.app inbox.
- **No personal credentials** — all secrets in `.env` (gitignored).
- **Idempotent password handling** — see "Password drift" above.

## Parallel execution

`playwright.config.ts` runs tests in parallel by default:

- `fullyParallel: true` — tests inside a `describe` block run in parallel.
- `workers` — auto-detected locally (one per CPU core); CI uses 2.
- **`tests/password-reset.spec.ts` opts into serial mode** via `test.describe.configure({ mode: "serial" })` because it mutates the shared seed account (password + reset token). Running two resets concurrently would race the testmail.app inbox and Investown's rate-limit.
- **`tests/sign-in.spec.ts` runs all 4 tests in parallel** — they're read-only against the account. Suite runtime ~15s with 4 workers (vs ~50s serial).

## CI considerations

- `auth/current-password.json` is **gitignored** — CI must run `password-reset.spec.ts` BEFORE `sign-in.spec.ts` (or seed the auth file from a secret).
- Default `workers: 2` in CI (env `CI=true`) — single shared test account limits horizontal scaling.
- Investown rate-limits password reset requests; full suite run typically takes 2–3 min.

## References

- testmail.app API: https://testmail.app/docs
