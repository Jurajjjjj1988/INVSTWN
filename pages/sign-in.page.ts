import { type Page, type Locator } from "@playwright/test";

export class SignInPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly logInButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Log in to Investown" });
    this.emailInput = page.getByRole("textbox", { name: "E-mail address" });
    this.passwordInput = page.getByRole("textbox", { name: "Password" });
    this.logInButton = page.getByRole("button", { name: "Login" });
    this.forgotPasswordLink = page.getByRole("link", {
      name: "Forgotten password",
    });
    // Verified via Walk & Watch — exact copy shown on bad credentials.
    this.errorMessage = page.getByText("Invalid e-mail or password");
  }

  async navigate(): Promise<void> {
    await this.page.goto("/sign-in");
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

  /**
   * Fill email + fire blur — Investown form uses React Hook Form, fill()
   * alone doesn't trigger validation. See playwright #15813.
   */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.emailInput.dispatchEvent("blur");
  }

  /** Fill password + fire blur — same RHF reason as fillEmail. */
  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
    await this.passwordInput.dispatchEvent("blur");
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.logInButton.click();
  }

  async clickForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
  }
}
