import { test, expect } from "../fixtures/pages.fixture.js";
import { waitForEmail, extractLink } from "../helpers/mailsac.js";
import { confirmForgotPassword } from "../helpers/cognito.js";
import { saveCurrentPassword } from "../helpers/credentials.js";
import { TEST_DATA } from "../data/test-data.js";

const EMAIL = TEST_DATA.SIGN_UP.EMAIL;

// Password-reset tests must run UNAUTHENTICATED — flow starts at /sign-in.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Password reset", () => {
  // Serial — mutates shared seed account (password + single-use reset code).
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test(
    "user resets forgotten password and logs in with the new one",
    { tag: ["@positive", "@auth", "@password", "@e2e"] },
    async ({ forgotPasswordPage, signInPage, page }) => {
      const newPassword = TEST_DATA.SIGN_UP.PASSWORD;

      await forgotPasswordPage.navigate();
      await expect(forgotPasswordPage.heading).toBeVisible();

      // Capture before trigger — avoids matching older reset mails.
      const sinceMs = Date.now();
      await forgotPasswordPage.requestReset(EMAIL);

      const code = await test.step("fetch reset code from mail", async () => {
        const mail = await waitForEmail(EMAIL, {
          subject: "INVESTOWN",
          sinceMs,
          timeoutMs: 60_000,
        });
        expect(mail.from.toLowerCase()).toContain("verificationemail");
        expect(mail.subject).toMatch(/password reset|obnova hesla/i);

        const resetUrl = extractLink(mail.html, "reset-password");
        const hash = resetUrl.split("#")[1] ?? "";
        const c = new URLSearchParams(hash).get("c");
        if (!c) throw new Error(`No "c=" param in reset URL: ${resetUrl}`);
        return c;
      });

      // Bypass the React Hook Form UI — call the same Cognito endpoint
      // AWS Amplify uses on the frontend. See helpers/cognito.ts.
      await confirmForgotPassword({
        username: EMAIL,
        confirmationCode: code,
        newPassword,
      });
      saveCurrentPassword(newPassword);

      await signInPage.navigate();
      await signInPage.login(EMAIL, newPassword);
      // Lands on dashboard OR "Last step" (SMS 2FA) — both prove the new
      // password was accepted by the auth backend.
      await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
        timeout: 20_000,
      });
    },
  );
});
