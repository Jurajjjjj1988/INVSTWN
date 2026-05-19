# Investown E2E Tests

Playwright + TypeScript test suite for `dev.investown.net`.

## What is covered

| Test file                                 | Scope                                                                              | Status                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| `tests/sign-in.spec.ts`                   | Login: form, valid/invalid creds, forgot link, empty/malformed email, non-existent | ✅ **7 tests pass** (serial)       |
| `tests/forgot-password.spec.ts`           | Forgot-password: empty + malformed email + non-existent (security)                 | ✅ 2 pass + 1 `test.fixme`         |
| `tests/password-reset.spec.ts`            | Full E2E: UI request → mail API → **Cognito API submit** → UI login                | ✅ **1 test pass** (hybrid UI+API) |
| `tests/reset-password-validation.spec.ts` | Password policy rules (length, case, digit, confirm mismatch)                      | ⚠️ `describe.fixme` (rate-limited) |
| `tests/sign-up.spec.ts`                   | Sign-up UI smoke (form, navigation, validation)                                    | ⏸️ `describe.skip` (reCaptcha v3)  |

## Hybrid UI + API password reset

**Why hybrid:** Investown's reset form uses React Hook Form with `mode: 'onBlur'` + anti-bot detection. Playwright `fill()` emits `input` but not `blur`, so RHF validators don't run and the submit button stays disabled (see [Playwright #15813](https://github.com/microsoft/playwright/issues/15813)). After exhausting fill workarounds we **bypass the form** by calling the same AWS Cognito endpoint AWS Amplify uses on the frontend:

```
POST cognito-idp.eu-west-1.amazonaws.com
X-Amz-Target: AWSCognitoIdentityProviderService.ConfirmForgotPassword
{ Username, ConfirmationCode, Password, ClientId }
```

**Flow:**

1. **UI** — open `/forgotten-password`, submit email
2. **API** (testmail.app) — fetch reset mail, extract `c=` code from URL hash
3. **API** (Cognito) — POST `ConfirmForgotPassword` with code + new password
4. **UI** — login with new password verifies the reset on real backend

Tested contract = same one frontend uses. RHF/anti-bot fragility removed. See `helpers/cognito.ts`.

## What is NOT automated — and why

Two platform-side blockers:

1. **Full sign-up flow** (`sign-up.spec.ts` — `test.describe.skip`)
   Investown reCaptcha v3 redirects headless bundled Chromium to sign-in before the form renders. Real Chrome works but disturbs the user during runs. Add a test reCaptcha key on dev to unblock.
2. **Password-reset UI validation rules** (`reset-password-validation.spec.ts` — `describe.fixme`)
   Requires a fresh reset link in `beforeAll`, which hits the per-account rate-limit when run alongside `password-reset.spec.ts`. Re-enable with a dedicated test account or longer cool-down.

**Sign-in test handles SMS 2FA branching** — login lands on dashboard OR "Last step" 2FA page, both prove login passed. KYC SMS 2FA itself is not bypassable.

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
  ├── testmail.ts      testmail.app API wrapper (waitForEmail, extractLink, testmailTag)
  ├── cognito.ts       AWS Cognito ConfirmForgotPassword (hybrid password reset)
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

- `fullyParallel: true` — tests across `describe` blocks / spec files run in parallel.
- `workers` — auto-detected locally (one per CPU core); CI uses 2.
- **`tests/password-reset.spec.ts` + `tests/sign-in.spec.ts` opt into serial mode** via `test.describe.configure({ mode: "serial" })` — both share the single seed account. Sign-in's valid + wrong-password tests would race Investown's per-account login rate-limit if parallel.
- Other spec files run in parallel automatically.

## CI considerations

- `auth/current-password.json` is **gitignored** — CI must run `password-reset.spec.ts` BEFORE `sign-in.spec.ts` (or seed the auth file from a secret).
- Default `workers: 2` in CI (env `CI=true`) — single shared test account limits horizontal scaling.
- Investown rate-limits password reset requests; full suite run typically takes 2–3 min.

## References

- testmail.app API: https://testmail.app/docs
