import { request } from "@playwright/test";

const API_BASE = "https://mailsac.com/api";
const POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name} (set it in .env)`);
  return v;
}

type MailsacFrom = { address?: string; name?: string };

type MailsacMessage = {
  _id: string;
  subject: string;
  from?: MailsacFrom[];
  received?: string;
  links?: string[];
};

export type Email = {
  id: string;
  from: string;
  subject: string;
  html: string;
  links: string[];
  timestamp: number;
};

async function fetchInbox(inbox: string): Promise<MailsacMessage[]> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(
      `${API_BASE}/addresses/${encodeURIComponent(inbox)}/messages`,
      {
        headers: { "Mailsac-Key": env("MAILSAC_API_KEY") },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    if (res.status() === 401 || res.status() === 403) {
      throw new Error(
        `mailsac API auth failed (${res.status()}). Check MAILSAC_API_KEY.`,
      );
    }
    if (!res.ok()) {
      const body = await res.text().catch(() => "<no body>");
      throw new Error(`mailsac API ${res.status()}: ${body}`);
    }
    return (await res.json()) as MailsacMessage[];
  } finally {
    await ctx.dispose().catch(() => {
      // ignore dispose errors — context cleanup, not test outcome
    });
  }
}

/**
 * Fetch raw HTML body from mailsac. The JSON `/messages/{id}` endpoint
 * returns metadata only — body lives on `/dirty/{inbox}/{id}` as raw HTML.
 */
async function fetchBodyHtml(inbox: string, id: string): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(
      `${API_BASE}/dirty/${encodeURIComponent(inbox)}/${id}`,
      {
        headers: { "Mailsac-Key": env("MAILSAC_API_KEY") },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    if (!res.ok()) {
      throw new Error(`mailsac dirty fetch ${res.status()} for ${id}`);
    }
    return await res.text();
  } finally {
    await ctx.dispose().catch(() => {
      // ignore dispose errors — context cleanup, not test outcome
    });
  }
}

/**
 * Wait for an email arriving in `inbox` after `sinceMs`. Capture `sinceMs`
 * BEFORE triggering the send to avoid matching older messages.
 *
 * Polls mailsac inbox list every 2s up to `timeoutMs`. Auth errors fail fast;
 * transient network errors retry until deadline.
 */
export async function waitForEmail(
  inbox: string,
  opts: { subject?: string; sinceMs?: number; timeoutMs?: number } = {},
): Promise<Email> {
  const { subject, sinceMs = Date.now(), timeoutMs = 60_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  let lastSubjects: string[] = [];

  while (Date.now() < deadline) {
    try {
      const all = await fetchInbox(inbox);
      const recent = all.filter((m) => {
        const ts = m.received ? Date.parse(m.received) : 0;
        return ts >= sinceMs;
      });
      lastSubjects = recent.map((m) => m.subject);
      const hit = subject
        ? recent.find((m) => m.subject.includes(subject))
        : recent[0];
      if (hit) {
        const html = await fetchBodyHtml(inbox, hit._id);
        return {
          id: hit._id,
          from: hit.from?.[0]?.address ?? "",
          subject: hit.subject,
          html,
          links: hit.links ?? [],
          timestamp: hit.received ? Date.parse(hit.received) : Date.now(),
        };
      }
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("auth failed")) throw err;
      console.warn(`mailsac poll error: ${message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `No email with subject "${subject ?? "*"}" for ${inbox} ` +
      `within ${timeoutMs}ms (lastSubjects=${JSON.stringify(lastSubjects.slice(0, 3))})`,
  );
}

/** Extract first URL containing the given path fragment from HTML body. */
export function extractLink(html: string, pathFragment: string): string {
  const re = new RegExp(`https?://[^\\s"'<>]*${pathFragment}[^\\s"'<>]*`, "i");
  const match = html.match(re);
  if (!match) throw new Error(`No link with "${pathFragment}" in email HTML`);
  return match[0];
}
