import { test, expect } from "../fixtures/pages.fixture.js";

// Forgot-password tests must run UNAUTHENTICATED — see sign-in.spec.ts comment.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Forgot password — negative & security", () => {
  test(
    "empty email submit stays on forgotten-password (no progress)",
    {
      tag: ["@negative", "@auth", "@password"],
    },
    async ({ forgotPasswordPage, page }) => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.submitButton.click();
      await expect(page).toHaveURL(/forgotten-password/);
    },
  );

  test(
    "malformed email submit stays on forgotten-password",
    {
      tag: ["@edge", "@auth", "@password"],
    },
    async ({ forgotPasswordPage, page }) => {
      await forgotPasswordPage.navigate();
      await forgotPasswordPage.emailInput.fill("not-an-email");
      await forgotPasswordPage.submitButton.click();
      await expect(page).toHaveURL(/forgotten-password/);
    },
  );

  test(
    "non-existent email shows generic confirmation (no user enumeration)",
    {
      tag: ["@negative", "@security", "@auth", "@password"],
    },
    async ({ forgotPasswordPage, page }) => {
      // Mock Cognito ForgotPassword to return success regardless of email — tests
      // the anti-enumeration UI invariant without burning the per-IP rate-limit.
      // The security property: identical confirmation copy for existent vs. non-existent
      // accounts (no enumeration leak via different responses).
      await page.route(
        /cognito-idp\.[a-z0-9-]+\.amazonaws\.com/,
        async (route) => {
          const target = route.request().headers()["x-amz-target"] ?? "";
          if (
            target.includes("ForgotPassword") &&
            !target.includes("Confirm")
          ) {
            await route.fulfill({
              status: 200,
              contentType: "application/x-amz-json-1.1",
              body: JSON.stringify({
                CodeDeliveryDetails: {
                  AttributeName: "email",
                  DeliveryMedium: "EMAIL",
                  Destination: "n***@mailsac.com",
                },
              }),
            });
            return;
          }
          await route.fallback();
        },
      );

      await forgotPasswordPage.navigate();
      await forgotPasswordPage.requestReset(
        `nonexistent-${Date.now()}@mailsac.com`,
      );

      // Generic confirmation must appear — same copy as valid-email flow.
      // Cognito is mocked → response is instant; 5s covers cold-start hydration.
      await expect(
        page.getByRole("heading", {
          name: /please.*check.*e-?mail|prosím.*zkontrolujte.*e-?mail/i,
        }),
      ).toBeVisible({ timeout: 5_000 });
    },
  );
});
