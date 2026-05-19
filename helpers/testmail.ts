import { request } from "@playwright/test";

const API_URL = "https://api.testmail.app/api/json";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name} (set it in .env)`);
  return v;
}

export type TestmailEmail = {
  id: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  timestamp: number;
};

/** Inbox address for a given tag: {NAMESPACE}.{tag}@inbox.testmail.app */
export function inboxAddress(tag: string): string {
  return `${env("TESTMAIL_NAMESPACE")}.${tag}@inbox.testmail.app`;
}

/** Wait for an email arriving after `sinceMs` (capture this BEFORE triggering send). */
export async function waitForEmail(
  tag: string,
  opts: { subject?: string; sinceMs?: number; timeoutMs?: number } = {},
): Promise<TestmailEmail> {
  const { subject, sinceMs = Date.now(), timeoutMs = 60_000 } = opts;
  const ctx = await request.newContext();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await ctx.get(API_URL, {
      params: {
        apikey: env("TESTMAIL_API_KEY"),
        namespace: env("TESTMAIL_NAMESPACE"),
        tag,
        livequery: "true",
        timestamp_from: String(sinceMs),
      },
    });
    if (res.ok()) {
      const data = await res.json();
      const hit = subject
        ? data.emails?.find((e: TestmailEmail) => e.subject.includes(subject))
        : data.emails?.[0];
      if (hit) return hit;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `No email with subject "${subject ?? "*"}" for tag ${tag} within ${timeoutMs}ms`,
  );
}

/** Extract first URL containing the given path fragment from HTML body. */
export function extractLink(html: string, pathFragment: string): string {
  const re = new RegExp(`https?://[^\\s"'<>]*${pathFragment}[^\\s"'<>]*`, "i");
  const match = html.match(re);
  if (!match) throw new Error(`No link with "${pathFragment}" in email HTML`);
  return match[0];
}
