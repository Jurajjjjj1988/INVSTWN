import { test, expect } from "../fixtures/pages.fixture.js";
import { waitForEmail, extractLink } from "../helpers/testmail.js";
import { ForgotPasswordPage } from "../pages/forgot-password.page.js";
import { TEST_DATA } from "../data/test-data.js";

const EMAIL = TEST_DATA.SIGN_UP.EMAIL;
const TAG = EMAIL.split("@")[0].split(".").slice(1).join(".") || "investown2";

/**
 * Password-policy validation on /reset-password.
 *
 * Strategy: one shared reset link (requested once in beforeAll), all tests
 * navigate to it and fill the form — NEVER submit. Token stays valid.
 * Serial mode prevents two tests fighting over the same input fields.
 *
 * Investown rate-limits password-reset requests, so this file's beforeAll
 * may collide with password-reset.spec.ts if run back-to-back. Acceptable
 * trade-off for validation coverage.
 */
// Whole suite is fixme: each run requires a fresh reset link (beforeAll), and
// Investown rate-limits forgotten-password requests per account. Running this
// alongside sign-in.spec.ts or password-reset.spec.ts within ~30 min causes the
// reset mail to never arrive. Re-enable when a per-run dedicated account is set up.
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

  test("password shorter than 8 chars keeps button disabled", async ({
    resetPasswordPage,
  }) => {
    await resetPasswordPage.navigate(resetUrl);
    await resetPasswordPage.newPasswordInput.pressSequentially("Ab1!");
    await resetPasswordPage.confirmPasswordInput.pressSequentially("Ab1!");
    await expect(resetPasswordPage.submitButton).toBeDisabled();
  });

  test("password without uppercase keeps button disabled", async ({
    resetPasswordPage,
  }) => {
    await resetPasswordPage.navigate(resetUrl);
    await resetPasswordPage.newPasswordInput.pressSequentially("nouppercase1");
    await resetPasswordPage.confirmPasswordInput.pressSequentially(
      "nouppercase1",
    );
    await expect(resetPasswordPage.submitButton).toBeDisabled();
  });

  test("password without lowercase keeps button disabled", async ({
    resetPasswordPage,
  }) => {
    await resetPasswordPage.navigate(resetUrl);
    await resetPasswordPage.newPasswordInput.pressSequentially("NOLOWERCASE1");
    await resetPasswordPage.confirmPasswordInput.pressSequentially(
      "NOLOWERCASE1",
    );
    await expect(resetPasswordPage.submitButton).toBeDisabled();
  });

  test("password without number keeps button disabled", async ({
    resetPasswordPage,
  }) => {
    await resetPasswordPage.navigate(resetUrl);
    await resetPasswordPage.newPasswordInput.pressSequentially("NoNumberHere");
    await resetPasswordPage.confirmPasswordInput.pressSequentially(
      "NoNumberHere",
    );
    await expect(resetPasswordPage.submitButton).toBeDisabled();
  });

  test("mismatched confirm password keeps button disabled", async ({
    resetPasswordPage,
  }) => {
    await resetPasswordPage.navigate(resetUrl);
    await resetPasswordPage.newPasswordInput.pressSequentially("Valid12345");
    await resetPasswordPage.confirmPasswordInput.pressSequentially(
      "Different12345",
    );
    await expect(resetPasswordPage.submitButton).toBeDisabled();
  });
});
