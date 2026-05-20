import type { Page, Route, Request } from "@playwright/test";
import { faker } from "@faker-js/faker";

/**
 * API mocking helpers for /user (profile) section tests.
 *
 * Pattern: each helper calls `page.route()` to intercept a specific endpoint
 * and fulfill with a stable JSON body. Tests can layer additional `page.route()`
 * calls AFTER calling these helpers — Playwright matches the LAST-registered
 * handler first, so overrides win.
 *
 * Endpoint host: `dev-api.investown.net` (configured per environment). Patterns
 * use `**` wildcards so they match regardless of protocol/subdomain quirks.
 *
 * GraphQL responses follow Apollo standard envelope ({ data, errors }).
 * Password change is a Cognito-direct call from the AWS Amplify SDK — verified
 * live on 2026-05-20 via DevTools (POST cognito-idp.<region>.amazonaws.com with
 * header `X-Amz-Target: AWSCognitoIdentityProviderService.ChangePassword`).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Subset of GET /users/api/v1/users/details that tests can override.
 *
 * The real response has many more fields (level, intercomUserHash*, dismissedBanners,
 * signedUpAt, inflectedName, isSmsMfaEnabled, canInvest, …) and the app crashes if
 * they're missing. `mockUserDetails` fetches the real response and patches these
 * fields over the top — tests get freedom to override key fields (e.g. for XSS
 * payloads) while the rest stays realistic.
 */
export type UserDetailsFixture = {
  firstName: string;
  lastName: string;
  email: string;
  /** Phone number, raw form (no spaces). UI formats for display; assertions use the formatted form. */
  phoneNumber: string;
  /**
   * Locale tag the UI consults to render Czech vs English. Forced by
   * `setupProfileBaseline` to `cs-CZ` so i18n tests don't poison the next run
   * via the backend's persisted preference.
   */
  preferredLocale: string;
};

/** Notification preferences shape used in the Notifikace section toggles. */
export type NotificationPreferences = {
  emailMaster: boolean;
  emailNews: boolean;
  emailOpportunities: boolean;
  emailSummaries: boolean;
  smsMaster: boolean;
  smsNews: boolean;
};

/**
 * Snapshot of the most recent mutation seen by `mockNotifications`. Exposed
 * so tests can assert exactly what the UI sent on a toggle click.
 */
export type CapturedMutation = {
  operationName: string;
  variables: Record<string, unknown> | null;
  rawBody: unknown;
};

/**
 * Runtime type guard for `CapturedMutation`. Validates the structural shape
 * without adding a schema-validation dependency (Zod, io-ts). Use in tests
 * before reading `value.variables` so TypeScript narrows and the assertion
 * fails fast on malformed captures rather than `undefined.something` crashes.
 *
 * Guarantees on success: `operationName` is a string and `variables` is either
 * `null` or an object. `rawBody` is intentionally NOT checked — it's typed
 * `unknown` by design and tests that read it should narrow it themselves.
 */
export function isCapturedMutation(value: unknown): value is CapturedMutation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.operationName === "string" &&
    (v.variables === null || typeof v.variables === "object")
  );
}

/** Behavior variants for `mockPasswordChange`. Mirrors the user-facing error states. */
export type PasswordChangeBehavior =
  | "success"
  | "wrong-current"
  | "same-as-current"
  | "policy-violation";

// ---------------------------------------------------------------------------
// Defaults — exported so tests can import and assert against them
// ---------------------------------------------------------------------------

/** Default profile fixture — stable Czech-named test user. */
export const DEFAULT_USER: UserDetailsFixture = {
  firstName: "Test",
  lastName: "Testovaci",
  email: "resetpasword_invstwwn@mailsac.com",
  phoneNumber: "+447481765995",
  preferredLocale: "cs-CZ",
};

/**
 * Human-formatted display values for assertions. UI inserts spaces into the
 * phone number for legibility. Tests should assert on these formatted strings —
 * they match what the user sees in the DOM.
 */
export const DEFAULT_USER_DISPLAY = {
  fullName: `${DEFAULT_USER.firstName} ${DEFAULT_USER.lastName}`,
  email: DEFAULT_USER.email,
  /** Phone with spaces, as rendered by the UI. */
  phoneFormatted: "+44 7481 765995",
} as const;

/**
 * Generate a deterministic fake user fixture via `@faker-js/faker`.
 *
 * Why this exists (not a replacement for `DEFAULT_USER`):
 *   - `DEFAULT_USER` MUST stay literal because most profile tests assert against
 *     its exact strings (e.g. `toHaveText("Test Testovaci")`). Randomising it
 *     would break every existing assertion.
 *   - This helper is for tests that WANT variety — name-rendering edge cases,
 *     XSS payload injection, future fuzz tests — without coupling to the real
 *     test-account literals.
 *
 * Determinism: `faker.seed(seed)` makes output reproducible across runs. Pass
 * the same seed and the same names/email come back. Default seed `42` is an
 * arbitrary but stable choice; override only when you need fixture variety
 * within a single test file.
 *
 * Phone stays literal `+447481765995`: it's a real UK temp number tied to SMS
 * 2FA on the live Investown test account. Randomising it would defeat 2FA
 * routing. Tests that need a different phone for mock-only flows can spread:
 * `{ ...generateFakeUser(), phoneNumber: "..." }`.
 */
export function generateFakeUser(seed = 42): UserDetailsFixture {
  faker.seed(seed);
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email().toLowerCase(),
    phoneNumber: "+447481765995",
    preferredLocale: "cs-CZ",
  };
}

/** Default notification preferences — all toggles OFF (clean slate). */
export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  emailMaster: false,
  emailNews: false,
  emailOpportunities: false,
  emailSummaries: false,
  smsMaster: false,
  smsNews: false,
};

// ---------------------------------------------------------------------------
// Internal: URL patterns and helpers
// ---------------------------------------------------------------------------

const URL_USER_DETAILS = "**/users/api/v1/users/details";
const URL_USER_LEVELS = "**/users/api/v1/configuration/user-levels";
const URL_USER_VERIFICATION = "**/users/api/v1/userVerification";
const URL_NOTIFICATIONS_GRAPHQL = "**/notifications/api/graphql";
/** Region-flexible Cognito IDP pattern — works for any AWS region or multi-region setup. */
const URL_COGNITO = /cognito-idp\.[a-z0-9-]+\.amazonaws\.com/;

const THIRD_PARTY_BLOCKLIST: readonly string[] = [
  // Exponea (now Bloomreach) — customer-data platform; fires on every nav.
  "**/api.eu1.exponea.com/**",
  "**/*.exponea.com/**",
  // Intercom backend (chat widget is whitelisted separately for chat tests).
  "**/api-iam.intercom.io/**",
  "**/*.intercomcdn.com/**",
  // Google Analytics + GTM — fired on app load and most nav events.
  "**/region1.google-analytics.com/**",
  "**/*.googletagmanager.com/**",
  "**/*.google-analytics.com/**",
  // Facebook Pixel — verified in Investown bundle via `fbq(...)` calls.
  "**/connect.facebook.net/**",
  "**/*.facebook.com/tr/**",
  // Hotjar — session-recording + heatmap (~150-300ms first-paint penalty).
  "**/*.hotjar.com/**",
  "**/*.hotjar.io/**",
  // Mixpanel — event analytics CDN + ingestion.
  "**/*.mixpanel.com/**",
  // Segment — analytics router; if not used, the CDN probe still costs ~50ms.
  "**/cdn.segment.com/**",
  "**/api.segment.io/**",
  // Sentry — frontend error reporting; ingest can stall on cold connections.
  "**/*.sentry.io/**",
  "**/*.ingest.sentry.io/**",
  // Cloudflare web analytics insights beacon.
  "**/static.cloudflareinsights.com/**",
  // LinkedIn Insight tag + ad pixels.
  "**/snap.licdn.com/**",
  "**/px.ads.linkedin.com/**",
  // Twitter (X) ad/conversion pixel.
  "**/static.ads-twitter.com/**",
  "**/analytics.twitter.com/**",
  // DoubleClick / AdServices — Google Ads conversion.
  "**/*.doubleclick.net/**",
  "**/googleads.g.doubleclick.net/**",
  "**/*.googleadservices.com/**",
  // Bing Ads UET tag.
  "**/bat.bing.com/**",
];

/**
 * Same as `THIRD_PARTY_BLOCKLIST` but without Intercom patterns. Used by
 * `setupProfileBaselineKeepingChat` for chat-widget tests. Kept in sync by
 * construction — any new Intercom hosts added to the main list are auto-excluded.
 */
const THIRD_PARTY_BLOCKLIST_KEEPING_CHAT: readonly string[] =
  THIRD_PARTY_BLOCKLIST.filter((pattern) => !/intercom/i.test(pattern));

/** GraphQL request body — the bits we look at. */
type GraphQLBody = {
  operationName?: string | null;
  query?: string;
  variables?: Record<string, unknown>;
};

/**
 * Safely parse a route's JSON body. Returns null on any failure (no body,
 * malformed JSON, binary, or unexpected shape). Handles Apollo batched-request
 * format by taking the first entry — multi-operation batches are not supported.
 */
function readJsonBody(request: Request): GraphQLBody | null {
  const raw = request.postData();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      if (typeof first !== "object" || first === null) return null;
      return first as GraphQLBody;
    }
    return parsed as GraphQLBody;
  } catch {
    return null;
  }
}

/** Standard Apollo-style successful GraphQL envelope. */
function gqlSuccess(data: Record<string, unknown>): {
  status: number;
  contentType: string;
  body: string;
} {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  };
}

/**
 * Standard Apollo-style GraphQL error envelope. Returned with HTTP 200 — the
 * GraphQL convention is to surface errors in the `errors` array, not via status.
 */
function gqlError(
  message: string,
  extensions?: Record<string, unknown>,
): { status: number; contentType: string; body: string } {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: null,
      errors: [{ message, extensions: extensions ?? {} }],
    }),
  };
}

// ---------------------------------------------------------------------------
// Third-party blocking
// ---------------------------------------------------------------------------

/**
 * Block third-party analytics/chat backend requests to keep tests fast and
 * deterministic. Blocks Exponea, Intercom backend, Google Analytics, GTM.
 * Does NOT block the Intercom chat button (part of app bundle) or image CDN.
 */
export async function blockThirdParty(page: Page): Promise<void> {
  await Promise.all(
    THIRD_PARTY_BLOCKLIST.map((pattern) =>
      page.route(pattern, (route: Route) => route.abort()),
    ),
  );
}

/**
 * Like `blockThirdParty` but leaves Intercom requests untouched so the chat
 * widget can load. Use for tests that exercise the Intercom messenger flow.
 */
export async function blockThirdPartyKeepingChat(page: Page): Promise<void> {
  await Promise.all(
    THIRD_PARTY_BLOCKLIST_KEEPING_CHAT.map((pattern) =>
      page.route(pattern, (route: Route) => route.abort()),
    ),
  );
}

// ---------------------------------------------------------------------------
// REST mocks
// ---------------------------------------------------------------------------

/**
 * Mock GET /users/api/v1/users/details by PATCHING the real response.
 *
 * The real response has many fields the app needs to render. Building a payload
 * from scratch breaks the app — we forward to the real backend via `route.fetch()`
 * and merge `override` keys on top. Unspecified fields keep their real values.
 */
export async function mockUserDetails(
  page: Page,
  override?: Partial<UserDetailsFixture>,
): Promise<void> {
  await page.route(URL_USER_DETAILS, async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    try {
      const realResponse = await route.fetch();
      const realBody = (await realResponse.json()) as Record<string, unknown>;
      const patched: Record<string, unknown> = { ...realBody };
      if (override) {
        for (const [k, v] of Object.entries(override)) {
          patched[k] = v;
        }
      }
      await route.fulfill({
        status: realResponse.status(),
        contentType: "application/json",
        body: JSON.stringify(patched),
      });
    } catch {
      // If the real backend is unreachable, pass through unmodified — synthesizing
      // a payload would break the app (missing required fields).
      await route.fallback();
    }
  });
}

/**
 * Mock GET /users/api/v1/configuration/user-levels.
 *
 * Pass-through: real shape has premium tiers, translations, externalBenefits etc.
 * that the UI depends on; building from scratch is fragile. Tests don't assert on
 * level fields, so pass-through is sufficient. Kept as a function for future patching.
 */
export async function mockUserLevels(page: Page): Promise<void> {
  await page.route(URL_USER_LEVELS, async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fallback();
  });
}

/**
 * Mock GET /users/api/v1/userVerification.
 *
 * Pass-through: real shape is a flat record of nullable KYC fields. Building
 * from scratch with the wrong keys broke the app's render. Kept as a function
 * so we can switch to "fetch real, patch override" later if needed.
 */
export async function mockUserVerification(page: Page): Promise<void> {
  await page.route(URL_USER_VERIFICATION, async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fallback();
  });
}

// ---------------------------------------------------------------------------
// Notifications GraphQL mock
// ---------------------------------------------------------------------------

/**
 * The four category names the real Investown API exposes via
 * `UserPreferences.categoryPreferences`. Captured live on 2026-05-20.
 *
 * Order matters: UI iterates over this array to render toggle rows. Missing any
 * category causes every toggle to render as `disabled`. Keep in sync with live API.
 */
const ALL_CATEGORIES = [
  "SummaryReports",
  "ProfitNotifications",
  "NewInvestmentOpportunities",
  "NewsAndPersonalisedOffers",
] as const;

type CategoryName = (typeof ALL_CATEGORIES)[number];

/** Single category entry in the GraphQL response. */
type CategoryPreference = {
  preferenceCategoryName: CategoryName;
  email: boolean;
  push: boolean;
  sms: boolean;
};

/**
 * Mock POST /notifications/api/graphql.
 *
 * Implements the real Investown GraphQL contract:
 *   - `GetUserPreferences` query → full UserPreferences with all 4 categories.
 *   - `PatchUserPreference` mutation → updates ONE category and returns the
 *     full updated array under `data.patchUserPreference.categoryPreferences`.
 *
 * Operation matching is EXACT — regex-based matching previously mistook the
 * query for a mutation. Returns `getLastMutation` so tests can assert the
 * exact payload sent on toggle click.
 */
export async function mockNotifications(
  page: Page,
  opts: {
    initial?: Partial<NotificationPreferences>;
    mutate?: "success" | "error";
  } = {},
): Promise<{ getLastMutation: () => CapturedMutation | null }> {
  const mutateBehavior = opts.mutate ?? "success";
  let state: NotificationPreferences = {
    ...DEFAULT_NOTIFICATIONS,
    ...opts.initial,
  };
  // Push values aren't in the flat `NotificationPreferences` shape — tracked
  // separately. Defaults mirror the live capture (all push=true).
  const pushState: Record<CategoryName, boolean> = {
    SummaryReports: true,
    ProfitNotifications: true,
    NewInvestmentOpportunities: true,
    NewsAndPersonalisedOffers: true,
  };
  // ProfitNotifications has no representation in the flat shape but the UI/API
  // still echo it. Track its email/sms separately so mutations don't drop.
  const profitState: { email: boolean; sms: boolean } = {
    email: false,
    sms: false,
  };
  let lastMutation: CapturedMutation | null = null;

  await page.route(URL_NOTIFICATIONS_GRAPHQL, async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = readJsonBody(request);
    const operationName = body?.operationName ?? "";

    if (operationName === "GetUserPreferences") {
      await route.fulfill(
        gqlSuccess({
          UserPreferences: serializeState(state, pushState, profitState),
        }),
      );
      return;
    }

    if (operationName === "PatchUserPreference") {
      // Capture BEFORE deciding the response so error-path tests can still inspect.
      lastMutation = {
        operationName,
        variables: body?.variables ?? null,
        rawBody: body,
      };

      if (mutateBehavior === "error") {
        await route.fulfill(
          gqlError("Notification preference update failed", {
            code: "INTERNAL_SERVER_ERROR",
          }),
        );
        return;
      }

      applyMutationInput(state, pushState, profitState, body?.variables);
      const serialized = serializeState(state, pushState, profitState);
      await route.fulfill(
        gqlSuccess({
          patchUserPreference: {
            categoryPreferences: serialized.categoryPreferences,
          },
        }),
      );
      return;
    }

    // Unknown operation — fall back to real backend so we don't break new
    // features that haven't been mocked yet.
    await route.fallback();
  });

  return {
    getLastMutation: (): CapturedMutation | null => lastMutation,
  };
}

/**
 * Serialize internal state to the shape the UI expects from `data.UserPreferences`.
 * Returns a fresh object each call (no shared refs) so route handlers can't mutate it.
 *
 * Field mapping:
 *   emailMaster/smsMaster → top-level *NotificationsEnabled
 *   emailSummaries        → SummaryReports.email
 *   emailOpportunities    → NewInvestmentOpportunities.email
 *   emailNews/smsNews     → NewsAndPersonalisedOffers.email/sms
 *   push values           → pushState (per-category)
 *   ProfitNotifications   → profitState (no flat-shape representation)
 *
 * `pushNotificationsEnabled` is hard-coded true (no master-push field in the flat shape).
 */
function serializeState(
  state: NotificationPreferences,
  pushState: Record<CategoryName, boolean>,
  profitState: { email: boolean; sms: boolean },
): {
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  categoryPreferences: CategoryPreference[];
} {
  const emailByCategory: Record<CategoryName, boolean> = {
    SummaryReports: state.emailSummaries,
    ProfitNotifications: profitState.email,
    NewInvestmentOpportunities: state.emailOpportunities,
    NewsAndPersonalisedOffers: state.emailNews,
  };
  const smsByCategory: Record<CategoryName, boolean> = {
    SummaryReports: false,
    ProfitNotifications: profitState.sms,
    NewInvestmentOpportunities: false,
    NewsAndPersonalisedOffers: state.smsNews,
  };
  return {
    emailNotificationsEnabled: state.emailMaster,
    pushNotificationsEnabled: true,
    smsNotificationsEnabled: state.smsMaster,
    categoryPreferences: ALL_CATEGORIES.map((name) => ({
      preferenceCategoryName: name,
      email: emailByCategory[name],
      push: pushState[name],
      sms: smsByCategory[name],
    })),
  };
}

/**
 * Apply a `PatchUserPreference` mutation's `variables.input` to internal state.
 * Mutates state objects in place — the caller (closure in `mockNotifications`)
 * owns their lifecycle across many route invocations.
 */
function applyMutationInput(
  state: NotificationPreferences,
  pushState: Record<CategoryName, boolean>,
  profitState: { email: boolean; sms: boolean },
  variables: Record<string, unknown> | undefined | null,
): void {
  if (!variables || typeof variables !== "object") return;
  const input = variables["input"];
  if (!input || typeof input !== "object") return;
  const inp = input as Record<string, unknown>;
  const name = inp["preferenceCategoryName"];
  if (typeof name !== "string") return;
  if (!isCategoryName(name)) return;

  const email = inp["email"];
  const push = inp["push"];
  const sms = inp["sms"];

  if (typeof push === "boolean") {
    pushState[name] = push;
  }
  if (typeof email === "boolean") {
    applyEmailUpdate(state, profitState, name, email);
  }
  if (typeof sms === "boolean") {
    applySmsUpdate(state, profitState, name, sms);
  }
}

/** Type guard for the four known category names. */
function isCategoryName(name: string): name is CategoryName {
  return (ALL_CATEGORIES as readonly string[]).includes(name);
}

/** Apply a per-category email update to the right internal field. */
function applyEmailUpdate(
  state: NotificationPreferences,
  profitState: { email: boolean; sms: boolean },
  name: CategoryName,
  value: boolean,
): void {
  switch (name) {
    case "SummaryReports":
      state.emailSummaries = value;
      return;
    case "NewInvestmentOpportunities":
      state.emailOpportunities = value;
      return;
    case "NewsAndPersonalisedOffers":
      state.emailNews = value;
      return;
    case "ProfitNotifications":
      profitState.email = value;
      return;
  }
}

/** Apply a per-category sms update to the right internal field. */
function applySmsUpdate(
  state: NotificationPreferences,
  profitState: { email: boolean; sms: boolean },
  name: CategoryName,
  value: boolean,
): void {
  switch (name) {
    case "NewsAndPersonalisedOffers":
      state.smsNews = value;
      return;
    case "ProfitNotifications":
      profitState.sms = value;
      return;
    case "SummaryReports":
    case "NewInvestmentOpportunities":
      // Live API exposes sms=false on these; UI doesn't render an SMS toggle
      // for them. Silently drop if the mutation arrives with one.
      return;
  }
}

// ---------------------------------------------------------------------------
// Password change mock — Cognito direct (verified via DevTools 2026-05-20)
// ---------------------------------------------------------------------------

/**
 * Scenario shape for one password-change behavior. Cognito direct is the only
 * transport observed live; the field is required. `rest` and `graphql` slots are
 * intentionally absent — kept on the type only as documentation that the data
 * table could grow if the transport ever changes.
 */
type PasswordScenario = {
  cognito: {
    /** HTTP status — 200 for success, 400 for any Cognito-classified failure. */
    status: number;
    /** `__type` field in the Cognito error body. Omit on success. */
    type?: string;
    /** `message` field in the Cognito error body. Omit on success. */
    message?: string;
  };
};

/**
 * One row per behavior. Adding a new scenario = one entry here; route handler
 * stays untouched. Assertion text stays close to fixture text by design.
 *
 * Cognito uses these specific `__type` values; the app branches on them to pick
 * the user-facing error message. Captured from the live AWS Cognito service.
 */
export const PASSWORD_SCENARIOS: Record<
  PasswordChangeBehavior,
  PasswordScenario
> = {
  success: {
    cognito: { status: 200 },
  },
  "wrong-current": {
    cognito: {
      status: 400,
      type: "NotAuthorizedException",
      message: "Incorrect username or password.",
    },
  },
  "same-as-current": {
    cognito: {
      status: 400,
      type: "InvalidParameterException",
      message: "Previous password and proposed password must be different.",
    },
  },
  "policy-violation": {
    cognito: {
      status: 400,
      type: "InvalidPasswordException",
      message: "Password did not conform with policy.",
    },
  },
};

/**
 * Mock the AWS Cognito direct `ChangePassword` call with the given behavior.
 *
 * Investown's web app uses the AWS Amplify SDK (`aws-amplify/auth`) to call
 * Cognito directly from the browser — no app-server REST or GraphQL endpoint
 * sits in front of it. The call goes to
 *   POST https://cognito-idp.<region>.amazonaws.com/
 * with header `X-Amz-Target: AWSCognitoIdentityProviderService.ChangePassword`
 * and body `{ AccessToken, PreviousPassword, ProposedPassword }`.
 *
 * Response shape:
 *   - Success: HTTP 200 with empty body `{}`.
 *   - Failure: HTTP 400 with `{ __type, message }` (see `PASSWORD_SCENARIOS`).
 */
export async function mockPasswordChange(
  page: Page,
  behavior: PasswordChangeBehavior,
): Promise<void> {
  const scenario = PASSWORD_SCENARIOS[behavior];

  await page.route(URL_COGNITO, async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const target = request.headers()["x-amz-target"] ?? "";
    if (!/ChangePassword/i.test(target)) {
      await route.fallback();
      return;
    }
    await route.fulfill(buildCognitoResponse(scenario.cognito));
  });
}

/**
 * Build a Playwright `route.fulfill` response payload from a scenario row.
 * Success returns an empty Cognito body; failure echoes `__type` + `message`
 * verbatim from the scenario table.
 */
function buildCognitoResponse(cognito: PasswordScenario["cognito"]): {
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
} {
  const headers: Record<string, string> = {
    "x-amzn-requestid": "mocked-request-id",
  };
  if (cognito.status === 200) {
    return {
      status: 200,
      contentType: "application/x-amz-json-1.1",
      headers,
      body: JSON.stringify({}),
    };
  }
  return {
    status: cognito.status,
    contentType: "application/x-amz-json-1.1",
    headers,
    body: JSON.stringify({
      __type: cognito.type ?? "UnknownException",
      message: cognito.message ?? "Unknown error",
    }),
  };
}

// ---------------------------------------------------------------------------
// Composite setup
// ---------------------------------------------------------------------------

/**
 * Apply the baseline mocks for any /user/* test:
 *   - block third-party noise
 *   - mock user details (forces `preferredLocale = cs-CZ` so the UI renders
 *     in Czech regardless of backend state — i18n tests can flip at runtime)
 *   - mock user levels and verification (pass-through)
 *
 * Tests can layer additional mocks on top by calling dedicated helpers after this.
 */
export async function setupProfileBaseline(page: Page): Promise<void> {
  await blockThirdParty(page);
  await mockUserDetails(page, { preferredLocale: "cs-CZ" });
  await mockUserLevels(page);
  await mockUserVerification(page);
}

/**
 * Like `setupProfileBaseline` but does NOT block Intercom — the chat widget
 * can load. All other baseline mocks are applied identically. Use only for
 * tests that need the live Intercom messenger; others should prefer
 * `setupProfileBaseline` for maximum determinism.
 */
export async function setupProfileBaselineKeepingChat(
  page: Page,
): Promise<void> {
  await blockThirdPartyKeepingChat(page);
  await mockUserDetails(page, { preferredLocale: "cs-CZ" });
  await mockUserLevels(page);
  await mockUserVerification(page);
}
