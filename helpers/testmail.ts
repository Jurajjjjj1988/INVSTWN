import { request, type APIRequestContext } from "@playwright/test";

const API_URL = "https://api.testmail.app/api/json";
const POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;

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

type TestmailListResponse = {
  emails?: TestmailEmail[];
  result?: string;
  message?: string;
};

type PollState = { lastStatus: number; lastSubjects: string[] };

/** Inbox address for a given tag: {NAMESPACE}.{tag}@inbox.testmail.app */
export function inboxAddress(tag: string): string {
  return `${env("TESTMAIL_NAMESPACE")}.${tag}@inbox.testmail.app`;
}

/**
 * Extract the testmail.app tag from a full email address.
 * Format: `{NAMESPACE}.{tag}@inbox.testmail.app` → returns `tag`.
 * Example: `a6ncd.fresh333@inbox.testmail.app` → `fresh333`.
 */
export function testmailTag(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  return localPart.split(".").slice(1).join(".");
}

/** Single poll. Returns matched email, null if not yet, or throws on auth error. */
async function pollOnce(
  ctx: APIRequestContext,
  tag: string,
  sinceMs: number,
  subject: string | undefined,
  state: PollState,
): Promise<TestmailEmail | null> {
  try {
    const res = await ctx.get(API_URL, {
      params: {
        apikey: env("TESTMAIL_API_KEY"),
        namespace: env("TESTMAIL_NAMESPACE"),
        tag,
        livequery: "true",
        timestamp_from: String(sinceMs),
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
    state.lastStatus = res.status();

    if (res.ok()) {
      const payload = (await res.json()) as TestmailListResponse;
      const emails = payload.emails ?? [];
      state.lastSubjects = emails.map((e) => e.subject);
      return subject
        ? (emails.find((e) => e.subject.includes(subject)) ?? null)
        : (emails[0] ?? null);
    }

    const body = await res.text().catch(() => "<no body>");
    console.warn(
      `testmail.app API ${state.lastStatus} for tag=${tag}: ${body}`,
    );
    if (state.lastStatus === 401 || state.lastStatus === 403) {
      throw new Error(
        `testmail.app API auth failed (${state.lastStatus}). Check TESTMAIL_API_KEY.`,
      );
    }
    return null;
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("API auth failed")) throw err;
    console.warn(`testmail.app poll error: ${message}`);
    return null;
  }
}

/**
 * Wait for an email arriving after `sinceMs` (capture this BEFORE triggering send).
 * Uses testmail.app livequery (server-side long-poll up to ~30s) plus client-side
 * retry. Auth errors fail fast; network errors retry until `timeoutMs` elapses.
 */
export async function waitForEmail(
  tag: string,
  opts: { subject?: string; sinceMs?: number; timeoutMs?: number } = {},
): Promise<TestmailEmail> {
  const { subject, sinceMs = Date.now(), timeoutMs = 60_000 } = opts;
  const ctx = await request.newContext();
  const deadline = Date.now() + timeoutMs;
  const state: PollState = { lastStatus: 0, lastSubjects: [] };

  try {
    while (Date.now() < deadline) {
      const hit = await pollOnce(ctx, tag, sinceMs, subject, state);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(
      `No email with subject "${subject ?? "*"}" for ${inboxAddress(tag)} ` +
        `within ${timeoutMs}ms (lastStatus=${state.lastStatus}, ` +
        `lastSubjects=${JSON.stringify(state.lastSubjects.slice(0, 3))})`,
    );
  } finally {
    await ctx.dispose().catch(() => {
      // ignore dispose errors — context cleanup, not test outcome
    });
  }
}

/** Extract first URL containing the given path fragment from HTML body. */
export function extractLink(html: string, pathFragment: string): string {
  const re = new RegExp(`https?://[^\\s"'<>]*${pathFragment}[^\\s"'<>]*`, "i");
  const match = html.match(re);
  if (!match) throw new Error(`No link with "${pathFragment}" in email HTML`);
  return match[0];
}
