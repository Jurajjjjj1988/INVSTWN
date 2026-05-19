import { type Page, type Locator } from "@playwright/test";

export class SignUpEmailPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly promoCheckbox: Locator;
  readonly continueButton: Locator;
  readonly logInLink: Locator;
  readonly businessLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Sign up to Investown" });
    this.emailInput = page.getByRole("textbox", { name: "E-mail address" });
    this.promoCheckbox = page.getByRole("checkbox", {
      name: "I have a promo code from a financial advisor or influencer",
    });
    this.continueButton = page.getByRole("button", { name: "Continue" });
    this.logInLink = page.getByRole("link", { name: "Log in" });
    this.businessLink = page.getByRole("link", {
      name: "Investown for Business",
    });
  }

  /** Navigate to the sign-up email page */
  async navigate(): Promise<void> {
    await this.page.goto("/sign-up/email");
    await this.dismissMobileAppPrompt();
  }

  /** Dismiss mobile-app interstitial. Waits up to 5s for prompt; skips if not shown. */
  private async dismissMobileAppPrompt(): Promise<void> {
    const continueButton = this.page.getByRole("button", {
      name: "Continue in the browser",
    });
    try {
      await continueButton.waitFor({ state: "visible", timeout: 5_000 });
      await continueButton.click();
    } catch {
      // Prompt not shown on this run — proceed.
    }
  }

  /** Fill email and click Continue */
  async submitEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.continueButton.click();
  }

  /** Check the promo code checkbox */
  async checkPromoCode(): Promise<void> {
    await this.promoCheckbox.check();
  }
}
