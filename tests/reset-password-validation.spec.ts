import { test, expect } from "../fixtures/pages.fixture.js";
import { TEST_DATA } from "../data/test-data.js";

const EMAIL = TEST_DATA.SIGN_UP.EMAIL;

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
 * Strategy: synthetic reset URL with fake code. These tests NEVER submit the
 * form — they only verify the submit button stays disabled for invalid
 * passwords, so the code never needs to be valid. This avoids hitting
 * Investown's per-account password-reset rate-limit (the real reason this
 * suite was previously skipped).
 *
 * Serial mode prevents two tests fighting over the same input fields.
 */
// @slow — synthetic reset URL renders differently on headless CI Linux;
// validation pre-checks fire before form mount. Investigate before
// promoting to the fast suite.
test.describe("Reset password — validation rules", () => {
  test.describe.configure({ mode: "serial", tag: "@slow" });
  test.setTimeout(90_000);

  // Clear the shared signed-in session — /reset-password redirects authenticated
  // users to the dashboard, which would prevent the form from rendering.
  test.use({ storageState: { cookies: [], origins: [] } });

  // Synthetic reset URL — fake code, never submitted, no backend call.
  const resetUrl = `/reset-password#u=${encodeURIComponent(EMAIL)}&c=123456`;

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
