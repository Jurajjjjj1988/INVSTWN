import type { Page } from "@playwright/test";
import type { SignInPage } from "../pages/sign-in.page.js";
import { TEST_DATA } from "../data/test-data.js";
import { loadCurrentPassword } from "./credentials.js";

const SIGN_IN_REDIRECT_TIMEOUT_MS = 15_000;

/**
 * Detect Cognito session expiry and re-login if needed.
 *
 * Call AFTER any navigation that requires auth. If the page landed on
 * /sign-in (meaning the JWT in storageState expired), this re-authenticates
 * via the UI and returns. If already on a protected page, this is a no-op.
 *
 * Use this in tests that run late in a long suite — the global storageState
 * baked at globalSetup time can expire mid-run.
 */
export async function refreshSessionIfNeeded(
  page: Page,
  signInPage: SignInPage,
): Promise<void> {
  if (!page.url().includes("/sign-in")) return;
  await signInPage.login(TEST_DATA.SIGN_UP.EMAIL, loadCurrentPassword());
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: SIGN_IN_REDIRECT_TIMEOUT_MS,
  });
}
