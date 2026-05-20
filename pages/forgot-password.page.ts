import { type Page, type Locator } from "@playwright/test";

export class ForgotPasswordPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Bilingual matchers — UI flips between EN and CZ based on account locale.
    this.heading = page.getByRole("heading", {
      name: /Forgot your password\?|Zapomněli jste heslo\?/i,
    });
    this.emailInput = page.getByRole("textbox", {
      name: /E-mail address|E-mail/i,
    });
    this.submitButton = page.getByRole("button", {
      name: /Send a link|Odeslat odkaz/i,
    });
  }

  async navigate(): Promise<void> {
    await this.page.goto("/forgotten-password");
    await this.dismissMobileAppPrompt();
  }

  /** Dismiss mobile-app interstitial. Waits up to 5s for prompt; skips if not shown. */
  private async dismissMobileAppPrompt(): Promise<void> {
    const continueButton = this.page.getByRole("button", {
      name: /Continue in the browser|Pokračovat v prohlížeči/i,
    });
    try {
      await continueButton.waitFor({ state: "visible", timeout: 5_000 });
      await continueButton.click();
    } catch {
      // Prompt not shown on this run — proceed.
    }
  }

  async requestReset(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }
}
