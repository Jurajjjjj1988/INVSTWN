import { type Page, type Locator, expect } from "@playwright/test";

export class VerificationPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly bankIdButton: Locator;
  readonly documentButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Identity verification" });
    this.bankIdButton = page.getByRole("button", { name: /Bank iD/i });
    this.documentButton = page.getByRole("button", {
      name: /photographing document/i,
    });
  }

  /** Navigate to verification provider page */
  async navigate(): Promise<void> {
    await this.page.goto("/user/verification/verification-provider");
  }

  /** Verify both verification options are displayed */
  async verifyOptions(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.bankIdButton).toBeVisible();
    await expect(this.documentButton).toBeVisible();
  }

  /** Select document verification */
  async selectDocumentVerification(): Promise<void> {
    await this.documentButton.click();
  }
}
