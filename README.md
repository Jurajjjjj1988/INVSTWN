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
2. **API** (mailsac) — fetch reset mail, extract `c=` code from URL hash
3. **API** (Cognito) — POST `ConfirmForgotPassword` with code + new password
4. **UI** — login with new password verifies the reset on real backend

Tested contract = same one frontend uses. RHF/anti-bot fragility removed. See `helpers/cognito.ts`.

## Profile portal tests (`/user`)

End-to-end coverage of the account portal (8 sub-sections under `/user/*`). Mocked backend, parallel-safe. Split across `tests/profile.spec.ts` (everything except Intercom) and `tests/profile-chat.spec.ts` (chat widget, baseline keeps Intercom unblocked). ~30 tests total, all green.

### What's covered

| Section       | Route                   | Tests | Notes                                                                                 |
| ------------- | ----------------------- | ----- | ------------------------------------------------------------------------------------- |
| Osobní údaje  | `/user`                 | 2     | Name/e-mail/phone/ID rendering, edit-disabled                                         |
| Dokumenty     | `/user/documents`       | 2     | 6 download links + click opens content in new tab                                     |
| Notifikace    | `/user/notifications`   | 4     | E-mail + SMS toggles, mutation payload, error revert, persistence                     |
| Jazyky        | `/user/languages`       | 1     | Czech default, English switch                                                         |
| Změna hesla   | `/user/password-change` | 7     | RHF blur, wrong-current, same-as-current, plaintext guard, locale switch              |
| Dvoufaktorové | `/user/mfa`             | 4     | Aktivovat reveals input + 3 negative paths (empty, non-numeric, wrong code)           |
| Podpora       | `/user/support`         | 1     | `support@investown.cz` mailto + chat trigger                                          |
| Auth + nav    | all `/user/*`           | 3     | Logout + deep-link auth guard + back-after-logout (BFCache)                           |
| Chatbot       | `/user/support`         | 2     | Intercom launcher opens messenger + personalized greeting (in `profile-chat.spec.ts`) |

Tag split: `@positive` (happy paths), `@negative` (error states from mocked APIs), `@edge` (RHF blur, error revert), `@security` (auth guard, wrong current, same-as-current).

### API mocking strategy

All backend calls are intercepted via `page.route()` and fulfilled from `data/profile-mocks.ts`. Why mocks here, not in password-reset:

- **Parallel-safe** — no shared seed account, no rate-limit races. Each worker gets its own mocked `dev-api.investown.net`.
- **Deterministic** — `DEFAULT_USER` / `DEFAULT_NOTIFICATIONS` fixtures mean assertions never depend on what staging DB happens to hold today.
- **2-min budget** — no mailsac round-trips, no Cognito reset chain.
- **No account pollution** — toggling notifications or changing password against the real account would drift state for the next run.

`profile-mocks.ts` exposes:

- `setupProfileBaseline(page)` — third-party blocklist (Exponea, Intercom, GA, GTM) + `mockUserDetails` + `mockUserLevels` + `mockUserVerification`. Wired as an auto-fixture in `fixtures/profile.fixture.ts` so every profile test inherits it without a manual call.
- `mockNotifications(page, { initial, mutate })` — GraphQL query/mutation handler with `getLastMutation()` closure (validated via `isCapturedMutation` runtime type guard) so tests assert exactly what the UI sent.
- `mockPasswordChange(page, behavior)` — Cognito-direct only (`X-Amz-Target: ChangePassword`) — verified live on 2026-05-20 as the sole transport. Backed by the `PASSWORD_SCENARIOS` data table; behaviors: `success` / `wrong-current` / `same-as-current` / `policy-violation`. Adding a new error case = one row, no handler edit.

> **Pointa:** Last-registered `page.route()` wins, so tests can layer overrides on top of `setupProfileBaseline` without resetting.

### Auth setup

`auth-setup.ts` runs **once** as `globalSetup` — real UI login against `dev.investown.net`, storage state saved to `.auth/user.json`. Every profile test inherits it via `use: { storageState: '.auth/user.json' }` and skips the sign-in screen entirely.

Why this matters for the 2-min budget: UI login takes ~10s (RHF onBlur + redirect). Doing it once instead of 16× keeps the whole profile spec under ~90s on CI with 4 workers.

### Constraints honored

The suite was built explicitly to:

- **Use API for data mocking** — zero live backend calls inside the `profile.spec.ts` tests themselves; only `globalSetup` touches the real app.
- **Run in parallel** — `fullyParallel: true` in `playwright.config.ts`. No `serial` opt-in, no shared mutable state.
- **Complete within 2 minutes** — wall-clock target including `globalSetup`. Achieved by mocks + storageState reuse.

### What was intentionally NOT tested

- **Investown členství** — section has no interactive functionality.
- **Zrušit účet** — destructive flow, deferred as separate scenario with throwaway account.
- **Intercom chat content** — third-party widget, blocked at network layer.
- **Mobile responsive layout** — separate concern, viewport variants belong in their own project config.

### How to run

```bash
npx playwright test profile.spec.ts profile-chat.spec.ts --reporter=list   # whole profile suite
npx playwright test profile.spec.ts --grep @security                       # tag filter
npx playwright test profile.spec.ts --grep @negative                       # error-path subset
npx playwright test profile-chat.spec.ts                                   # Intercom widget only
npx playwright test profile.spec.ts --headed                               # watch it run
```

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
# Fill in MAILSAC_API_KEY (sign up free at mailsac.com — 1500 API calls / month)
```

## Test account

Pre-verified seed account on `dev.investown.net` (staging only, no real money).

| Field            | Value                                               |
| ---------------- | --------------------------------------------------- |
| Email            | _see `INVESTOWN_EMAIL` in `.env` (a mailsac inbox)_ |
| Initial password | _see `INVESTOWN_PASSWORD` in `.env`_                |
| Name             | `TESTER TEST`                                       |
| Phone            | `+447481762285` (UK temp-number.com)                |

> ⚠️ Staging only. Mailsac inboxes are PUBLIC by default — mark yours as Private in the mailsac UI so reset links aren't world-readable. Never reuse this password elsewhere.

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

### Environment + cross-browser

```bash
# Default: dev environment, Chrome only (~1 min)
npm test

# Different environment
TEST_ENV=staging npm test

# Cross-browser (chrome + firefox + webkit, ~3x time)
CROSS_BROWSER=1 npm test
```

`TEST_ENV` accepts `dev` | `staging` | `prod` and resolves to the matching `*.investown.net` host. `BASE_URL` still wins as an explicit override. `CROSS_BROWSER=1` adds firefox + webkit projects; pick one with `--project=firefox`.

## Project structure

```
data/             Test data constants (env-driven)
fixtures/         Playwright fixtures (POM injection)
helpers/
  ├── mailsac.ts       mailsac.com API wrapper (waitForEmail, extractLink)
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
- **Real APIs over mocks** — tests hit live `dev.investown.net` and real mailsac inbox.
- **No personal credentials** — all secrets in `.env` (gitignored).
- **Idempotent password handling** — see "Password drift" above.

## Parallel execution

`playwright.config.ts` runs tests in parallel by default:

- `fullyParallel: true` — tests across `describe` blocks / spec files run in parallel.
- `workers` — auto-detected locally (one per CPU core); CI uses 4.
- **`tests/password-reset.spec.ts` + `tests/sign-in.spec.ts` opt into serial mode** via `test.describe.configure({ mode: "serial" })` — both share the single seed account. Sign-in's valid + wrong-password tests would race Investown's per-account login rate-limit if parallel.
- Other spec files run in parallel automatically.

## CI considerations

- `auth/current-password.json` is **gitignored** — CI must run `password-reset.spec.ts` BEFORE `sign-in.spec.ts` (or seed the auth file from a secret).
- Default `workers: 4` in CI (env `CI=true`) — bumped from 2 to fit 2-min budget; single shared test account limits horizontal scaling beyond that.
- Investown rate-limits password reset requests; full suite run typically takes 2–3 min.

## References

- mailsac API: https://docs.mailsac.com/
