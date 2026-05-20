import { test, expect } from "../fixtures/pages.fixture.js";
import { waitForEmail } from "../helpers/mailsac.js";

test.describe("Forgot password — negative & security", () => {
  test(
    "empty email submit stays on forgotten-password (no progress)",
    {
      tag: ["@negative", "@auth", "@password"],
    },
    async ({ forgotPasswordPage, page }) => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.submitButton.click();
      await expect(page).toHaveURL(/forgotten-password/);
    },
  );

  test(
    "malformed email submit stays on forgotten-password",
    {
      tag: ["@edge", "@auth", "@password"],
    },
    async ({ forgotPasswordPage, page }) => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.emailInput.fill("not-an-email");
      await forgotPasswordPage.submitButton.click();
      await expect(page).toHaveURL(/forgotten-password/);
    },
  );

  // Rate-limited security check: Investown throttles forgotten-password submits
  // per IP/account. Running this back-to-back with password-reset.spec.ts hits
  // the limit and the confirmation heading never appears. Demoted to test.fixme
  // pending a per-run dedicated account or wider cool-down.
  test.fixme(
    "non-existent email shows generic confirmation (no user enumeration)",
    {
      tag: ["@negative", "@security", "@auth", "@password"],
    },
    async ({ forgotPasswordPage, page }) => {
      // Security: requesting reset for a non-existent address must show the SAME
      // generic confirmation as a valid one ("Please, check your e-mail."). No
      // user-enumeration leak via error message or different copy.
      const nonExistentEmail = `nonexistent-${Date.now()}@mailsac.com`;
      const sinceMs = Date.now();

      await forgotPasswordPage.navigate();
      await forgotPasswordPage.requestReset(nonExistentEmail);

      // UI: generic confirmation heading must appear, identical to the valid-email flow.
      await expect(
        page.getByRole("heading", { name: /please.*check.*e-?mail/i }),
      ).toBeVisible({ timeout: 10_000 });

      // API: optionally verify no mail arrives. Investown's security pattern
      // should be to silently drop, not to send to non-existent users.
      let mailArrived = false;
      try {
        await waitForEmail(nonExistentEmail, {
          subject: "INVESTOWN",
          sinceMs,
          timeoutMs: 15_000,
        });
        mailArrived = true;
      } catch {
        // expected — no inbox routing for non-existent users
      }
      expect(
        mailArrived,
        "Security: reset mail should NOT arrive for non-existent user",
      ).toBe(false);
    },
  );
});
