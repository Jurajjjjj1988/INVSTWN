import { type Page, type Locator, expect } from "@playwright/test";

export class ResetPasswordPage {
  readonly page: Page;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Selectors verified via Walk & Watch DOM snapshot — exact strings.
    // exact:true on "New password" — "Confirm new password" also contains it,
    // so a substring match would resolve to both inputs (strict-mode violation).
    this.newPasswordInput = page.getByRole("textbox", {
      name: "New password",
      exact: true,
    });
    this.confirmPasswordInput = page.getByRole("textbox", {
      name: "Confirm new password",
    });
    this.submitButton = page.getByRole("button", { name: "Change password" });
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async setNewPassword(newPassword: string): Promise<void> {
    // Investown's reset form uses React Hook Form with mode:'onBlur'.
    // fill() emits 'input' but NOT 'blur' — RHF won't validate until blur,
    // so the submit button stays disabled. `dispatchEvent('blur')` is the
    // canonical fix per Playwright #15813 and RHF discussion #1776.
    await this.newPasswordInput.waitFor({ state: "visible" });
    await this.newPasswordInput.fill(newPassword);
    await this.newPasswordInput.dispatchEvent("blur");
    await this.confirmPasswordInput.fill(newPassword);
    await this.confirmPasswordInput.dispatchEvent("blur");
    // Assert button enabled BEFORE click — surfaces real error if validation
    // didn't fire instead of a misleading "click intercepted".
    await expect(this.submitButton).toBeEnabled({ timeout: 5_000 });
    await this.submitButton.click();
  }
}
