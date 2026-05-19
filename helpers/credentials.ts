import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";

const STORE_PATH = join(process.cwd(), "auth", "current-password.json");

type PasswordStore = { password: string; updatedAt: string };

/**
 * Returns the most recent password for the test account.
 *
 * - If `auth/current-password.json` exists AND parses, returns the stored password.
 * - On corrupt JSON, missing field, or absent file, falls back to `INVESTOWN_PASSWORD`
 *   from `.env`. Corruption is logged so it's visible in CI output.
 *
 * Pattern: password-reset.spec.ts updates the store after each successful reset,
 * so sign-in.spec.ts always reads the current password.
 */
export function loadCurrentPassword(): string {
  if (existsSync(STORE_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(STORE_PATH, "utf-8")) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "password" in parsed &&
        typeof (parsed as PasswordStore).password === "string" &&
        (parsed as PasswordStore).password.length > 0
      ) {
        return (parsed as PasswordStore).password;
      }
      console.warn(`auth/current-password.json missing 'password' field`);
    } catch (err) {
      console.warn(
        `auth/current-password.json parse failed: ${(err as Error).message}`,
      );
    }
  }
  const fallback = process.env.INVESTOWN_PASSWORD;
  if (!fallback) {
    throw new Error(
      "No password available — set INVESTOWN_PASSWORD in .env or run password-reset.spec.ts first",
    );
  }
  return fallback;
}

/**
 * Persist new password to `auth/current-password.json` atomically.
 *
 * Writes to `*.tmp` first, then `renameSync` — guarantees the file is either
 * the old content or the new content, never a half-written corrupt blob (which
 * would crash `loadCurrentPassword` on next run).
 */
export function saveCurrentPassword(password: string): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const tmpPath = `${STORE_PATH}.tmp`;
  const payload: PasswordStore = {
    password,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  renameSync(tmpPath, STORE_PATH);
}
