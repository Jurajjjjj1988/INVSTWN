import { test, expect } from "../fixtures/profile.fixture.js";
import {
  mockNotifications,
  mockPasswordChange,
} from "../data/profile-mocks.js";

/**
 * Visual regression skeleton for the Investown /user (profile) portal.
 *
 * Strategy: Playwright's NATIVE `toHaveScreenshot()` — no Percy or 3rd-party
 * dependency. Snapshots are committed to the repo under
 * `tests/profile-visual.spec.ts-snapshots/` and diffed on subsequent runs.
 *
 * Why three specific sections:
 *   1. Personal data (/user)          — landing route; covers heading + read-only fields.
 *   2. Notifications (/user/notifications) — six toggles + push info text; the
 *      densest UI in the profile area, most likely to surface CSS regressions.
 *   3. Password change (/user/password-change) — empty form state; covers
 *      labels, three inputs, and the disabled submit button.
 *
 * Determinism guarantees (inherited from `profile.fixture.ts` auto-baseline):
 *   - Third-party analytics/chat blocked (no animated chat launcher overlay).
 *   - `/users/details`, `/user-levels`, `/userVerification` mocked with DEFAULT_USER.
 *   - CSS animations disabled via injected stylesheet (no in-flight transitions).
 *   - Web fonts blocked (consistent fallback rendering across machines).
 *
 * MASKING: anything that legitimately varies between runs/accounts is masked
 * to gray boxes via `mask: [...]`. Currently only the phone value — extend if
 * future API mocks introduce dates, IDs, or session-scoped values.
 *
 * FIRST RUN: generates baselines under `tests/profile-visual.spec.ts-snapshots/`.
 * These MUST be reviewed and committed by a human — they are the source of truth
 * for subsequent diffs. To intentionally update a baseline after a UI change:
 *   npx playwright test profile-visual.spec.ts --update-snapshots
 */

// @slow — snapshots are OS-specific. CI (Linux) needs separate baselines
// from local darwin. Generate via `npm run test:slow -- --update-snapshots`
// on the target OS, then commit the .png files.
test.describe("Profile — Visual regression", () => {
  test(
    "personal data section",
    { tag: ["@visual", "@profile", "@slow"] },
    async ({ profilePage, page }) => {
      await profilePage.gotoSection("personalData");
      await expect(profilePage.personalData.heading).toBeVisible();
      // Mask the dynamic phone digits to keep the snapshot stable across re-runs
      // and across accounts. Add other dynamic fields here if needed.
      await expect(page).toHaveScreenshot("personal-data.png", {
        fullPage: true,
        mask: [profilePage.personalData.phoneValue],
        animations: "disabled",
      });
    },
  );

  test(
    "notifications section",
    { tag: ["@visual", "@profile", "@slow"] },
    async ({ profilePage, page }) => {
      // Explicit notifications mock — guarantees a deterministic toggle state
      // (all OFF via DEFAULT_NOTIFICATIONS) regardless of any future baseline
      // changes. The baseline does NOT mock the GraphQL notifications endpoint.
      await mockNotifications(page);
      await profilePage.gotoSection("notifications");
      await expect(profilePage.notifications.heading).toBeVisible();
      // Wait for all six toggles to be attached before snapping — avoids the
      // race where the screenshot captures a half-rendered toggle grid.
      await expect(profilePage.notifications.emailMasterToggle).toBeAttached();
      await expect(profilePage.notifications.smsMasterToggle).toBeAttached();
      await expect(page).toHaveScreenshot("notifications.png", {
        fullPage: true,
        animations: "disabled",
      });
    },
  );

  test(
    "password change empty form",
    { tag: ["@visual", "@profile", "@slow"] },
    async ({ profilePage, page }) => {
      // Password change is a Cognito-direct call; mock it as `success` to keep
      // the page in a clean idle state (no inline error UI). We never submit,
      // but registering the mock prevents any background validation requests
      // from leaking through to the real backend.
      await mockPasswordChange(page, "success");
      await profilePage.gotoSection("passwordChange");
      await expect(profilePage.password.heading).toBeVisible();
      // All three inputs must be visible before snapping — guarantees the form
      // fully rendered, otherwise the snapshot captures a partial layout.
      await expect(profilePage.password.currentInput).toBeVisible();
      await expect(profilePage.password.newInput).toBeVisible();
      await expect(profilePage.password.confirmInput).toBeVisible();
      await expect(page).toHaveScreenshot("password-change.png", {
        fullPage: true,
        animations: "disabled",
      });
    },
  );
});
