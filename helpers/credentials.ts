import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const STORE_PATH = join(process.cwd(), "auth", "current-password.json");

/**
 * Returns the most recent password for the test account.
 *
 * - If `auth/current-password.json` exists, returns the password stored after
 *   the last reset test run (always-current).
 * - Otherwise falls back to `INVESTOWN_PASSWORD` from `.env` (initial bootstrap).
 *
 * Pattern: password-reset.spec.ts updates the store after each successful reset,
 * so sign-in.spec.ts always has the current password.
 */
export function loadCurrentPassword(): string {
  if (existsSync(STORE_PATH)) {
    const data = JSON.parse(readFileSync(STORE_PATH, "utf-8")) as {
      password: string;
    };
    if (data.password) return data.password;
  }
  const fallback = process.env.INVESTOWN_PASSWORD;
  if (!fallback) {
    throw new Error(
      "No password available — set INVESTOWN_PASSWORD in .env or run password-reset.spec.ts first",
    );
  }
  return fallback;
}

/** Persist new password to `auth/current-password.json` (gitignored). */
export function saveCurrentPassword(password: string): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(
    STORE_PATH,
    JSON.stringify({ password, updatedAt: new Date().toISOString() }, null, 2),
  );
}
