import { test as base } from "./pages.fixture.js";
import { setupProfileBaseline } from "../data/profile-mocks.js";

/**
 * Profile-scoped Playwright test fixture.
 *
 * Extends the shared page-object fixture (`./pages.fixture.js`) with an
 * AUTO-RUN baseline mock setup: every test that imports this `test` gets
 * `setupProfileBaseline(page)` invoked BEFORE the test body runs — and,
 * critically, before any `page.goto(...)` the test makes.
 *
 * WHY a separate fixture file (not a flag on the base `test`):
 *   - `tests/sign-in.spec.ts`, `tests/sign-up.spec.ts`, etc. do NOT want the
 *     profile-baseline mocks. Adding the fixture to the shared `pages.fixture`
 *     would force them on every spec or require each non-profile spec to
 *     explicitly opt out.
 *   - This file gives profile tests a single import line that guarantees:
 *       1. Third-party analytics/chat are blocked (deterministic).
 *       2. `/users/details`, `/user-levels`, `/userVerification` are mocked.
 *       3. The mocks are registered before navigation (no race condition).
 *
 * WHY `auto: true` (and not `auto: false`):
 *   - With `auto: false` the fixture would only run when explicitly listed in
 *     a test's destructure (e.g. `async ({ page, _profileBaseline })`), which
 *     is effectively the same as the old manual `setupProfileBaseline(page)`
 *     call — easy to forget, no real safety win.
 *   - With `auto: true`, the fixture is invoked for EVERY test in this file's
 *     consumers (currently `tests/profile.spec.ts`). Tests can no longer
 *     forget the baseline, and they can no longer call it AFTER `goto` by
 *     mistake.
 *   - Opt-out for tests that don't need it (e.g. the unauthenticated deep-link
 *     test which creates its own browser context): those tests don't go
 *     through the fixture's `page`, so the auto baseline applies to the
 *     fixture's page but is harmless for the ad-hoc `freshPage`. They can
 *     still call `setupProfileBaseline(freshPage)` manually for the ad-hoc
 *     context.
 *
 * TEARDOWN: no explicit cleanup needed. `page.route` handlers are bound to
 * the Playwright `page` lifecycle — when the page closes at end-of-test,
 * the route handlers are garbage-collected with it.
 */

type ProfileFixtures = {
  /**
   * Underscore-prefixed by convention to signal "internal/auto" — tests
   * should NOT list this in their destructure unless they need to assert
   * something about the baseline itself. It runs automatically for every
   * test that imports this `test`.
   */
  _profileBaseline: void;
};

export const test = base.extend<ProfileFixtures>({
  _profileBaseline: [
    async ({ page }, use) => {
      // Fast-mode: block fonts only (saves ~80ms/test, no DOM impact) and
      // disable CSS animations (saves ~200ms/test on transitions).
      // Image/SVG block was tried but broke assertions that depend on icon
      // visibility (notification toggles render SVGs we don't want to abort).
      await page.route(/\.(woff2?|ttf|otf)(\?|$)/i, (route) => route.abort());
      await page.addInitScript(() => {
        const style = document.createElement("style");
        style.textContent = `*,*::before,*::after{animation-duration:0ms!important;animation-delay:0ms!important;transition-duration:0ms!important;transition-delay:0ms!important;}`;
        document.head.appendChild(style);
      });
      await setupProfileBaseline(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
