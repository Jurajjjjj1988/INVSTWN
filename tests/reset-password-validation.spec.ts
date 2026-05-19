import { test, expect } from "../fixtures/pages.fixture.js";
import { waitForEmail, extractLink, testmailTag } from "../helpers/testmail.js";
import { ForgotPasswordPage } from "../pages/forgot-password.page.js";
import { TEST_DATA } from "../data/test-data.js";

const EMAIL = TEST_DATA.SIGN_UP.EMAIL;
const TAG = testmailTag(EMAIL);

const INVALID_PASSWORDS = [
  { rule: "shorter than 8 chars", newPwd: "Ab1!", confirmPwd: "Ab1!" },
  {
    rule: "without uppercase",
    newPwd: "nouppercase1",
    confirmPwd: "nouppercase1",
  },
  {
    rule: "without lowercase",
    newPwd: "NOLOWERCASE1",
    confirmPwd: "NOLOWERCASE1",
  },
  {
    rule: "without number",
    newPwd: "NoNumberHere",
    confirmPwd: "NoNumberHere",
  },
  {
    rule: "confirm password mismatch",
    newPwd: "Valid12345",
    confirmPwd: "Different12345",
  },
] as const;

/**
 * Password-policy validation on /reset-password.
 *
 * Strategy: one shared reset link (requested once in beforeAll), all tests
 * navigate to it and fill the form — NEVER submit. Token stays valid.
 * Serial mode prevents two tests fighting over the same input fields.
 *
 * Whole suite is `describe.fixme` because beforeAll requests a fresh reset link,
 * which hits Investown's per-account password-reset rate-limit. Re-enable once
 * a per-run dedicated account is set up.
 */
test.describe.fixme("Reset password — validation rules", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  let resetUrl = "";

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const forgot = new ForgotPasswordPage(page);
    const sinceMs = Date.now();

    await forgot.navigate();
    await forgot.requestReset(EMAIL);

    const mail = await waitForEmail(TAG, {
      subject: "INVESTOWN",
      sinceMs,
      timeoutMs: 60_000,
    });
    resetUrl = extractLink(mail.html, "reset-password");
    await ctx.close();
  });

  for (const { rule, newPwd, confirmPwd } of INVALID_PASSWORDS) {
    test(
      `${rule} keeps Change password button disabled`,
      {
        tag: ["@negative", "@auth", "@password", "@validation"],
      },
      async ({ resetPasswordPage }) => {
        await resetPasswordPage.navigate(resetUrl);
        await resetPasswordPage.newPasswordInput.pressSequentially(newPwd, {
          delay: 30,
        });
        await resetPasswordPage.newPasswordInput.press("Tab");
        await resetPasswordPage.confirmPasswordInput.pressSequentially(
          confirmPwd,
          { delay: 30 },
        );
        await resetPasswordPage.confirmPasswordInput.press("Tab");
        await expect(resetPasswordPage.submitButton).toBeDisabled();
      },
    );
  }
});
