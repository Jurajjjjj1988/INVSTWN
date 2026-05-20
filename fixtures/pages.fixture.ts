import { test as base, type Page } from "@playwright/test";
import { SignUpEmailPage } from "../pages/sign-up-email.page.js";
import { SignUpPhonePage } from "../pages/sign-up-phone.page.js";
import { DashboardPage } from "../pages/dashboard.page.js";
import { VerificationPage } from "../pages/verification.page.js";
import { SignInPage } from "../pages/sign-in.page.js";
import { ForgotPasswordPage } from "../pages/forgot-password.page.js";
import { ResetPasswordPage } from "../pages/reset-password.page.js";
import { ProfilePage } from "../pages/profile.page.js";
import { refreshSessionIfNeeded } from "../helpers/session.js";

type Pages = {
  signUpEmailPage: SignUpEmailPage;
  signUpPhonePage: SignUpPhonePage;
  dashboardPage: DashboardPage;
  verificationPage: VerificationPage;
  signInPage: SignInPage;
  forgotPasswordPage: ForgotPasswordPage;
  resetPasswordPage: ResetPasswordPage;
  profilePage: ProfilePage;
  loggedInPage: Page;
};

export const test = base.extend<Pages>({
  signUpEmailPage: async ({ page }, use) => {
    await use(new SignUpEmailPage(page));
  },
  signUpPhonePage: async ({ page }, use) => {
    await use(new SignUpPhonePage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  verificationPage: async ({ page }, use) => {
    await use(new VerificationPage(page));
  },
  signInPage: async ({ page }, use) => {
    await use(new SignInPage(page));
  },
  forgotPasswordPage: async ({ page }, use) => {
    await use(new ForgotPasswordPage(page));
  },
  resetPasswordPage: async ({ page }, use) => {
    await use(new ResetPasswordPage(page));
  },
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },
  /**
   * Authenticated `Page` with auto-refresh if the baseline storageState
   * session has expired (e.g., in long-running suites). Triggers a no-op
   * navigation to `/`, then re-logs in via {@link SignInPage} if the app
   * redirected to `/sign-in`. Tests can then `goto()` protected routes
   * without inline expiry handling.
   */
  loggedInPage: async ({ page, signInPage }, use) => {
    await page.goto("/");
    await refreshSessionIfNeeded(page, signInPage);
    await use(page);
  },
});

export { expect } from "@playwright/test";
