import { test, expect } from "../fixtures/pages.fixture.js";
import { TEST_DATA } from "../data/test-data.js";

// Sign-up tests skipped: Investown reCaptcha v3 redirects headless bundled Chromium
// to sign-in before the sign-up form even renders. Not bypassable client-side.
// Real Chrome works but disturbs the user during runs.
test.describe.skip("Sign Up - Email Page (UI smoke)", () => {
  test.beforeEach(async ({ signUpEmailPage }) => {
    await signUpEmailPage.navigate();
  });

  test("user submits email and reaches phone step", async ({
    signUpEmailPage,
    signUpPhonePage,
    page,
  }) => {
    await expect(signUpEmailPage.heading).toBeVisible(); // sanity guard

    await signUpEmailPage.submitEmail(TEST_DATA.SIGN_UP.EMAIL);

    await expect(page).toHaveURL(/sign-up\/(credentials|phone)/);
    // Outcome assertion — submission progressed past email step.
  });

  test("user clicks 'Log in' link and reaches sign-in page", async ({
    signUpEmailPage,
    page,
  }) => {
    await signUpEmailPage.logInLink.click();
    await expect(page).toHaveURL(/sign-in/);
    await expect(
      page.getByRole("heading", { name: "Log in to Investown" }),
    ).toBeVisible();
  });

  test("user clicks 'Investown for Business' link and reaches business signup", async ({
    signUpEmailPage,
    page,
  }) => {
    await signUpEmailPage.businessLink.click();
    await expect(page).toHaveURL(/sign-up\/legal-entity/);
  });

  test("promo code checkbox toggles on click", async ({ signUpEmailPage }) => {
    await expect(signUpEmailPage.promoCheckbox).not.toBeChecked();
    await signUpEmailPage.checkPromoCode();
    await expect(signUpEmailPage.promoCheckbox).toBeChecked();
  });
});

test.describe.skip("Sign Up - Phone Page (UI smoke)", () => {
  test.beforeEach(async ({ signUpEmailPage, signUpPhonePage }) => {
    await signUpEmailPage.navigate();
    await signUpEmailPage.submitEmail(TEST_DATA.SIGN_UP.EMAIL);
    await expect(signUpPhonePage.heading).toBeVisible();
  });

  test("Send SMS button stays disabled until phone is entered", async ({
    signUpPhonePage,
  }) => {
    await signUpPhonePage.phoneInput.clear();
    await expect(signUpPhonePage.sendSmsButton).toBeDisabled();

    // Real user behavior — typing a valid number enables the button.
    await signUpPhonePage.fillPhone(TEST_DATA.SIGN_UP.PHONE);
    await expect(signUpPhonePage.sendSmsButton).toBeEnabled();
  });
});

// Full sign-up E2E (post-phone OTP, credentials, password) is excluded:
// Investown SMS 2FA is a KYC compliance control, not bypassable client-side.
// See README "What is NOT automated".
