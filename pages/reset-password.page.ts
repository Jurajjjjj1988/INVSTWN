import { type Page, type Locator } from "@playwright/test";

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
    // pressSequentially + Tab blur — Investown React form needs real keystroke
    // events to enable the submit button (fill() alone leaves button disabled).
    await this.newPasswordInput.click();
    await this.newPasswordInput.pressSequentially(newPassword);
    await this.newPasswordInput.press("Tab");
    await this.confirmPasswordInput.pressSequentially(newPassword);
    await this.confirmPasswordInput.press("Tab");
    await this.submitButton.click();
  }
}
