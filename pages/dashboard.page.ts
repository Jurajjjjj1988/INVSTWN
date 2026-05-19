import { type Page, type Locator, expect } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly greeting: Locator;
  readonly dashboardLink: Locator;
  readonly portfolioLink: Locator;
  readonly transactionsLink: Locator;
  readonly walletLink: Locator;
  readonly completeVerificationButton: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Anchored regex: "Hello " followed by name and exclamation mark — avoids
    // matching unrelated marketing copy containing "Hello".
    this.greeting = page.getByText(/^Hello\s+\S.*!$/);
    this.dashboardLink = page.getByRole("link", { name: "Dashboard" });
    this.portfolioLink = page.getByRole("link", { name: "Portfolio" });
    this.transactionsLink = page.getByRole("link", { name: "Transactions" });
    // Anchored to wallet balance format ("CZK 0", "CZK 1,234.50") — avoids
    // matching any link that just contains the currency code.
    this.walletLink = page.getByRole("link", { name: /^CZK\s/ });
    this.completeVerificationButton = page.getByRole("button", {
      name: "Complete the verification",
    });
    this.searchInput = page.getByRole("textbox", {
      name: "Search for a project by name",
    });
    this.searchButton = page.getByRole("button", { name: "Search" });
  }

  /** Verify user is logged in by checking greeting */
  async verifyLoggedIn(): Promise<void> {
    await expect(this.greeting).toBeVisible();
  }

  /** Verify all navigation elements are present */
  async verifyNavigation(): Promise<void> {
    await expect(this.dashboardLink).toBeVisible();
    await expect(this.portfolioLink).toBeVisible();
    await expect(this.transactionsLink).toBeVisible();
  }

  /** Verify onboarding steps are visible */
  async verifyOnboardingSteps(): Promise<void> {
    await expect(this.page.getByText("Registration")).toBeVisible();
    await expect(this.page.getByText("Identity verification")).toBeVisible();
    await expect(this.page.getByText("Investment questionnaire")).toBeVisible();
    await expect(this.page.getByText("First deposit")).toBeVisible();
  }

  /** Click Complete the verification button */
  async startVerification(): Promise<void> {
    await this.completeVerificationButton.click();
  }
}
