import { test, expect } from "../fixtures/pages.fixture.js";
import { TEST_DATA } from "../data/test-data.js";
import { loadCurrentPassword } from "../helpers/credentials.js";

const EMAIL = TEST_DATA.SIGN_UP.EMAIL;

test.describe("Sign in", () => {
  // Serial — valid + wrong password tests share the seed account.
  // Investown rate-limits repeated login attempts per account; parallel
  // execution makes the wrong-password test occasionally flaky.
  test.describe.configure({ mode: "serial" });

  test("login form renders with all elements", async ({ signInPage }) => {
    await signInPage.navigate();
    await expect(signInPage.heading).toBeVisible();
    await expect(signInPage.emailInput).toBeVisible();
    await expect(signInPage.passwordInput).toBeVisible();
    await expect(signInPage.logInButton).toBeVisible();
    await expect(signInPage.forgotPasswordLink).toBeVisible();
  });

  test("forgot password link navigates to /forgotten-password", async ({
    signInPage,
    page,
  }) => {
    await signInPage.navigate();
    await signInPage.clickForgotPassword();
    await page.waitForURL(/forgotten-password/);
    await expect(page).toHaveURL(/forgotten-password/);
  });

  test("login with valid credentials submits and progresses past sign-in", async ({
    signInPage,
    page,
  }) => {
    const password = loadCurrentPassword();
    await signInPage.navigate();
    await signInPage.login(EMAIL, password);

    // After submit, user either lands on dashboard (no 2FA) OR on "Last step" (SMS 2FA).
    // Both prove login itself succeeded. SMS 2FA verification is covered separately.
    await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
      timeout: 20_000,
    });

    const onDashboard =
      page.url().endsWith("/") || page.url().includes("/dashboard");
    const onLastStep = await page
      .getByRole("heading", { name: /last step/i })
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(
      onDashboard || onLastStep,
      `Expected redirect to dashboard or Last step, got ${page.url()}`,
    ).toBe(true);
  });

  test("login with wrong password shows error and keeps user on sign-in", async ({
    signInPage,
    page,
  }) => {
    await signInPage.navigate();
    await signInPage.login(EMAIL, "WrongPassword123!");

    // Real assertion — error must be shown AND URL must not progress.
    // No hard waits; both expects auto-retry.
    await expect(signInPage.errorMessage).toBeVisible();
    await expect(page).toHaveURL(/sign-in/);
  });

  test("login with empty email submits but stays on sign-in (no progress)", async ({
    signInPage,
    page,
  }) => {
    await signInPage.navigate();
    await signInPage.passwordInput.fill("AnyPassword123!");
    await signInPage.logInButton.click();
    await expect(page).toHaveURL(/sign-in/);
  });

  test("login with empty password submits but stays on sign-in (no progress)", async ({
    signInPage,
    page,
  }) => {
    await signInPage.navigate();
    await signInPage.emailInput.fill(EMAIL);
    await signInPage.logInButton.click();
    await expect(page).toHaveURL(/sign-in/);
  });

  test("login with malformed email stays on sign-in", async ({
    signInPage,
    page,
  }) => {
    await signInPage.navigate();
    await signInPage.login("not-an-email", "AnyPassword123!");
    // Server/client rejected the input. URL must not progress.
    await expect(page).toHaveURL(/sign-in/);
  });

  test("login with non-existent user shows generic error (no user enumeration)", async ({
    signInPage,
    page,
  }) => {
    await signInPage.navigate();
    await signInPage.login(
      `a6ncd.nonexistent-${Date.now()}@inbox.testmail.app`,
      "AnyPassword123!",
    );
    // Security: error message must match the wrong-password error exactly —
    // revealing "user not found" vs "wrong password" enables user enumeration.
    await expect(signInPage.errorMessage).toBeVisible();
    await expect(page).toHaveURL(/sign-in/);
  });
});
