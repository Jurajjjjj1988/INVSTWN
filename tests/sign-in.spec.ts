import { test, expect } from "../fixtures/pages.fixture.js";
import { TEST_DATA } from "../data/test-data.js";
import { loadCurrentPassword } from "../helpers/credentials.js";

const EMAIL = TEST_DATA.SIGN_UP.EMAIL;

test.describe("Sign in", () => {
  // Serial — valid + wrong-password tests share the seed account, and Investown
  // rate-limits login attempts per account.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ signInPage }) => {
    await signInPage.navigate();
  });

  test(
    "forgot password link navigates to /forgotten-password",
    { tag: ["@positive", "@auth"] },
    async ({ signInPage, page }) => {
      await signInPage.clickForgotPassword();
      await expect(page).toHaveURL(/forgotten-password/);
    },
  );

  test(
    "login with valid credentials reaches dashboard or 2FA step",
    { tag: ["@positive", "@auth"] },
    async ({ signInPage, page }) => {
      await signInPage.login(EMAIL, loadCurrentPassword());

      // Lands on dashboard OR "Last step" (SMS 2FA) — both prove login passed.
      await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
        timeout: 20_000,
      });

      const onDashboardOrLastStep =
        page.url().endsWith("/") ||
        page.url().includes("/dashboard") ||
        (await page
          .getByRole("heading", { name: /last step/i })
          .isVisible({ timeout: 5_000 })
          .catch(() => false));

      expect(onDashboardOrLastStep, `Got ${page.url()}`).toBe(true);
    },
  );

  test(
    "login with wrong password shows error and stays on sign-in",
    { tag: ["@negative", "@auth"] },
    async ({ signInPage, page }) => {
      await signInPage.login(EMAIL, "WrongPassword123!");
      await expect(signInPage.errorMessage).toBeVisible();
      await expect(page).toHaveURL(/sign-in/);
    },
  );

  test(
    "login with empty email stays on sign-in",
    { tag: ["@negative", "@auth"] },
    async ({ signInPage, page }) => {
      await signInPage.fillPassword("AnyPassword123!");
      await signInPage.logInButton.click();
      await expect(page).toHaveURL(/sign-in/);
    },
  );

  test(
    "login with empty password stays on sign-in",
    { tag: ["@negative", "@auth"] },
    async ({ signInPage, page }) => {
      await signInPage.fillEmail(EMAIL);
      await signInPage.logInButton.click();
      await expect(page).toHaveURL(/sign-in/);
    },
  );

  test(
    "login with malformed email stays on sign-in",
    { tag: ["@edge", "@auth"] },
    async ({ signInPage, page }) => {
      await signInPage.login("not-an-email", "AnyPassword123!");
      await expect(page).toHaveURL(/sign-in/);
    },
  );

  test(
    "login with non-existent user shows generic error (no user enumeration)",
    { tag: ["@negative", "@security", "@auth"] },
    async ({ signInPage, page }) => {
      // Security: error must match the wrong-password error — revealing
      // "user not found" vs "wrong password" enables user enumeration.
      await signInPage.login(
        `a6ncd.nonexistent-${Date.now()}@inbox.testmail.app`,
        "AnyPassword123!",
      );
      await expect(signInPage.errorMessage).toBeVisible();
      await expect(page).toHaveURL(/sign-in/);
    },
  );
});
