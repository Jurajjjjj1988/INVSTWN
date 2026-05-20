import { chromium, type FullConfig } from "@playwright/test";
import { SignInPage } from "./pages/sign-in.page.js";
import { TEST_DATA } from "./data/test-data.js";
import { loadCurrentPassword } from "./helpers/credentials.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Max time to wait for the post-sign-in redirect (dashboard "/" or "Last step"
 * 2FA page) before we declare login broken. 20s covers slow CI cold-start and
 * Next.js first-paint hydration; tighter values flake on shared CI runners.
 */
const SIGN_IN_REDIRECT_TIMEOUT_MS = 20_000;

/**
 * One-time UI login. Saves storage state to `.auth/user.json` so individual
 * tests can reuse it via `use: { storageState }` and skip the login UI.
 *
 * The mailsac account at TEST_DATA.SIGN_UP.EMAIL must already exist on Investown.
 *
 * Success criterion: any URL that doesn't include "/sign-in" — covers both the
 * dashboard ("/") and the "Last step" SMS 2FA page. Both prove credentials were
 * accepted; that's all storage state needs.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const storagePath = ".auth/user.json";
  mkdirSync(dirname(storagePath), { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ baseURL: process.env.BASE_URL });
  const page = await ctx.newPage();

  try {
    const signIn = new SignInPage(page);
    await signIn.navigate();
    await signIn.login(TEST_DATA.SIGN_UP.EMAIL, loadCurrentPassword());

    // Wait for redirect away from sign-in (lands on dashboard "/" or "Last step" 2FA page).
    await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
      timeout: SIGN_IN_REDIRECT_TIMEOUT_MS,
    });

    await ctx.storageState({ path: storagePath });
  } catch (err) {
    throw new Error(
      `globalSetup login failed — check INVESTOWN_EMAIL / INVESTOWN_PASSWORD in .env (or auth/current-password.json). Underlying: ${(err as Error).message}`,
    );
  } finally {
    await browser.close();
  }
}

export default globalSetup;
