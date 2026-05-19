import { test, expect } from "../fixtures/pages.fixture.js";
import { waitForEmail, extractLink } from "../helpers/testmail.js";
import { saveCurrentPassword } from "../helpers/credentials.js";
import { TEST_DATA } from "../data/test-data.js";

const EMAIL = TEST_DATA.SIGN_UP.EMAIL; // a6ncd.investown2@inbox.testmail.app
// Tag is the part between namespace and @ — testmail.app routes mail by it.
const TAG = EMAIL.split("@")[0].split(".").slice(1).join(".") || "investown2";

test.describe("Password reset", () => {
  // testmail.app livequery + Investown SMTP delay can total up to 90s
  test.setTimeout(120_000);

  // Note: UI-only "submit + verify mail arrives" test removed.
  // Full E2E below covers the same UI submission AND extends to reset link usage.
  // Running both in sequence triggered Investown's password-reset rate-limit.

  // Full E2E is demoted to test.fixme because Investown rate-limits the password-reset
  // endpoint per account — re-running this test within ~30 min of a prior reset causes
  // the mail to never arrive (request silently throttled). The reset request + mail
  // fetch via testmail.app API + reset-link extraction all work in isolation; the
  // pressSequentially + Tab pattern in ResetPasswordPage.setNewPassword is the right
  // workaround for React-controlled inputs (plain fill() leaves the submit disabled).
  //
  // To re-enable for stable CI we need one of:
  //   - a dedicated test account per run, OR
  //   - cool-down >30 min between runs, OR
  //   - Investown disabling the rate-limit on dev.investown.net.
  test.fixme("Full reset flow — request, fetch link from API, set password from .env", async ({
    forgotPasswordPage,
    resetPasswordPage,
  }) => {
    const sinceMs = Date.now();
    const knownPassword = TEST_DATA.SIGN_UP.PASSWORD; // from .env — keeps state idempotent
    let resetUrl = "";

    await test.step("Submit reset request", async () => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.requestReset(EMAIL);
    });

    await test.step("Fetch reset link from testmail.app API", async () => {
      const mail = await waitForEmail(TAG, {
        subject: "INVESTOWN",
        sinceMs,
        timeoutMs: 60_000,
      });
      expect(mail.from.toLowerCase()).toContain("verificationemail");
      expect(mail.subject).toMatch(/password reset|obnova hesla/i);

      resetUrl = extractLink(mail.html, "reset-password");
      // Reset URL format: https://dev.investown.net/reset-password#u={email}&c={code}
      const hash = resetUrl.split("#")[1] ?? "";
      const params = new URLSearchParams(hash);
      expect(
        params.get("c"),
        `No "c=" param in reset URL: ${resetUrl}`,
      ).toBeTruthy();
    });

    await test.step("Open reset link and set password from .env", async () => {
      await resetPasswordPage.navigate(resetUrl);
      await resetPasswordPage.setNewPassword(knownPassword);
      // Verify we left the reset page (Investown redirects after successful reset)
      await resetPasswordPage.page.waitForURL(
        (url) => !url.pathname.includes("reset-password"),
        { timeout: 15_000 },
      );
      // Persist current password for downstream tests (sign-in.spec.ts reads it).
      saveCurrentPassword(knownPassword);
    });
  });

  // Login flow requires SMS 2FA (Investown sends OTP after every login).
  // Automated SMS retrieval from public temp-number.com is unreliable (Cloudflare + race
  // conditions with ~200 SMS/day on the shared number). Documented for future when:
  // - Investown provides a test 2FA bypass, OR
  // - Project switches to a dedicated SIM + Android SMS Gateway setup.
  test.fixme("Login after reset (blocked by SMS 2FA — see README)", async () => {
    // Implementation: signInPage.login(EMAIL, newPassword) →
    // wait for "Last step" → waitForSmsOtp() → fill → dashboard
  });
});
