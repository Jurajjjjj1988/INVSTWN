import { test, expect } from "../fixtures/pages.fixture.js";
import { setupProfileBaselineKeepingChat } from "../data/profile-mocks.js";
import { ProfilePage } from "../pages/profile.page.js";

/**
 * E2E coverage for the Intercom chat widget surfaced on /user/support.
 *
 * Why this is a SEPARATE spec file (not part of profile.spec.ts):
 *   - The standard `setupProfileBaseline` BLOCKS `api-iam.intercom.io` and the
 *     wider Intercom backend, which is the right call for ~every other test
 *     (faster, deterministic, no remote dependency). Chat tests need the
 *     opposite: Intercom must load so the messenger can actually open.
 *   - Keeping them in their own file makes it obvious WHY this suite hits the
 *     live Intercom backend, and lets us tag/skip it independently if Intercom
 *     is ever in a degraded state during a CI run.
 *
 * Scope guarantee — these tests verify the WIDGET opens. They do NOT send a
 * message to Investown support. We never click "start a new conversation",
 * never type into an input, never submit. Tests assert presence/visibility
 * of UI elements only.
 *
 * Selector strategy — every selector targets Intercom-owned accessible names
 * and iframe titles. Per Intercom's installation docs these are part of their
 * public surface and remain stable across messenger.js releases:
 *   - launcher button: name="Open Intercom Messenger" / "Close Intercom Messenger"
 *   - main iframe:     title="Intercom live chat"
 *   - panel region:    role="region", name="Intercom messenger"
 * If Intercom rebrands these, both tests would fail loudly with role/name
 * mismatches — exactly the failure signal we want.
 */

test.describe("Profile — Chatbot", () => {
  test.beforeEach(async ({ page }) => {
    // NOTE: chat-only baseline — Intercom backend is NOT blocked here.
    // Every other profile test continues to use setupProfileBaseline which
    // DOES block Intercom; behaviour for those is unchanged.
    await setupProfileBaselineKeepingChat(page);
  });

  test(
    "clicking the Intercom launcher opens the chat messenger panel",
    { tag: ["@positive", "@chat", "@support", "@slow"] },
    async ({ page }) => {
      const profile = new ProfilePage(page);
      await profile.gotoSection("support");

      // Baseline: launcher must be visible before we click it. If this fails,
      // Intercom never loaded — typically a CSP / blocked-network problem
      // (e.g. setupProfileBaseline used by mistake).
      await expect(profile.support.intercomLauncherOpen).toBeVisible();

      await profile.support.intercomLauncherOpen.click();

      // After clicking, the messenger iframe is injected at <body> level and
      // its inner panel renders. We assert on the iframe-scoped region rather
      // than the iframe element itself because the iframe can exist (hidden)
      // before open — we want proof the PANEL inside is showing.
      //
      // No `expect(iframe).toBeAttached()` first because Playwright's frame
      // locator transparently waits for the iframe to attach before evaluating
      // any inner getByRole. The `toBeVisible()` poll handles all of:
      //   1. iframe attached
      //   2. messenger region rendered inside iframe
      //   3. region marked visible (Intercom uses display:none while closed)
      await expect(profile.support.intercomMessengerRegion).toBeVisible();

      // Negative-space proof — the launcher's accessible name flips from
      // "Open Intercom Messenger" to "Close Intercom Messenger" once the
      // panel is open. The OPEN-state locator must no longer match.
      // (We use .or() on `intercomLauncher` to keep tracking either state.)
      await expect(profile.support.intercomLauncherOpen).toBeHidden();
    },
  );

  test(
    "open messenger shows the personalized greeting heading",
    { tag: ["@positive", "@chat", "@support", "@slow"] },
    async ({ page }) => {
      const profile = new ProfilePage(page);
      await profile.gotoSection("support");

      await expect(profile.support.intercomLauncherOpen).toBeVisible();
      await profile.support.intercomLauncherOpen.click();

      // The Intercom Home tab renders an H1 like "Hi <FirstName> 👋" for an
      // authenticated visitor. We match the "Hi " prefix so the assertion
      // doesn't couple to the user's first name (which can change if the
      // DEFAULT_USER fixture is updated, or if Investown later sources the
      // name from a different field).
      //
      // This is the strongest proof we get — short of typing a message —
      // that the chat is FULLY interactive: the panel rendered AND it
      // received user context (greeting personalisation needs the JS API
      // boot + auth handshake). If Intercom returned a degraded "anonymous"
      // state the heading would be generic and this assertion would catch it.
      //
      // We deliberately STOP here. The next user action would be clicking
      // "Pošlete nám zprávu" which leads to the message-list / new-conversation
      // flow — that path risks dispatching a real ticket to support and is
      // out of scope for "verify the widget opens".
      await expect(profile.support.intercomGreetingHeading).toBeVisible();
    },
  );
});
