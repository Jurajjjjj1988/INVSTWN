import { type Page, type Locator, expect } from "@playwright/test";

export class ResetPasswordPage {
  readonly page: Page;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Selectors verified via Walk & Watch DOM snapshot — exact strings.
    this.newPasswordInput = page.getByRole("textbox", { name: "New password" });
    this.confirmPasswordInput = page.getByRole("textbox", {
      name: "Confirm new password",
    });
    this.submitButton = page.getByRole("button", { name: "Change password" });
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async setNewPassword(newPassword: string): Promise<void> {
    // Investown's reset form uses React Hook Form. fill() doesn't trigger
    // the validators (button stays disabled). pressSequentially simulates
    // real keystrokes which fire per-character React state updates, then
    // Tab triggers the final blur that runs schema validation.
    // See: github.com/microsoft/playwright/issues/15813
    await this.newPasswordInput.waitFor({ state: "visible" });
    await this.newPasswordInput.click();
    await this.newPasswordInput.pressSequentially(newPassword, { delay: 30 });
    await this.newPasswordInput.press("Tab");
    await this.confirmPasswordInput.pressSequentially(newPassword, {
      delay: 30,
    });
    await this.confirmPasswordInput.press("Tab");
    await expect(this.submitButton).toBeEnabled({ timeout: 5_000 });
    await this.submitButton.click();
  }
}
