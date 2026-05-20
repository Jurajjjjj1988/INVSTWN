import { test as base } from "@playwright/test";
import { SignUpEmailPage } from "../pages/sign-up-email.page.js";
import { SignUpPhonePage } from "../pages/sign-up-phone.page.js";
import { DashboardPage } from "../pages/dashboard.page.js";
import { VerificationPage } from "../pages/verification.page.js";
import { SignInPage } from "../pages/sign-in.page.js";
import { ForgotPasswordPage } from "../pages/forgot-password.page.js";
import { ResetPasswordPage } from "../pages/reset-password.page.js";
import { ProfilePage } from "../pages/profile.page.js";

type Pages = {
  signUpEmailPage: SignUpEmailPage;
  signUpPhonePage: SignUpPhonePage;
  dashboardPage: DashboardPage;
  verificationPage: VerificationPage;
  signInPage: SignInPage;
  forgotPasswordPage: ForgotPasswordPage;
  resetPasswordPage: ResetPasswordPage;
  profilePage: ProfilePage;
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
});

export { expect } from "@playwright/test";
