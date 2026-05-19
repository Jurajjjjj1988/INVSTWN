import { type Page, type Locator } from "@playwright/test";

export class SignUpPhonePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly phoneInput: Locator;
  readonly sendSmsButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Phone number" });
    this.phoneInput = page.getByRole("textbox", { name: "Phone number" });
    this.sendSmsButton = page.getByRole("button", { name: "Send SMS" });
  }

  /** Fill phone number */
  async fillPhone(phoneNumber: string): Promise<void> {
    await this.phoneInput.clear();
    await this.phoneInput.fill(phoneNumber);
  }

  /** Click Send SMS button */
  async clickSendSms(): Promise<void> {
    await this.sendSmsButton.click();
  }
}
