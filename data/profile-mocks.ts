import type { Page, Route, Request } from "@playwright/test";

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
 * Discovery notes (recorded for future maintainers):
 *   - REST endpoints observed via DevTools while navigating /user/*.
 *   - GraphQL response shapes assumed to follow Apollo standard
 *     ({ data, errors }) — adjust the inner `data` keys if real captures differ.
 *   - Password change endpoint NOT observed in initial mapping; we mock all
 *     three plausible locations (REST under /users/api/, GraphQL on
 *     /core/api/graphql or /users/api/graphql, and Cognito direct) so the
 *     test fires the right behavior regardless of which the app actually hits.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Subset of GET /users/api/v1/users/details that tests can override.
 *
 * IMPORTANT: the real response has MANY more fields (level object, intercomUserHash*,
 * dismissedBanners, signedUpAt, inflectedName, preferredLocale, isSmsMfaEnabled,
 * canInvest, etc.) and the app crashes on render if those fields are missing. So
 * `mockUserDetails` does NOT build a response from scratch — it fetches the real
 * response and then patches only the fields below over the top. This means tests
 * keep the freedom to override e.g. firstName/lastName for XSS payloads while the
 * rest of the user object stays realistic.
 *
 * The renamed `phone` → `phoneNumber` mirrors the actual API key. `email` is the
 * top-level key the API uses. `idDocumentNumber` is mapped into the nested
 * `documentNumber` field on /userVerification when present — keeping a separate
 * fixture key here would just be confusing.
 */
export type UserDetailsFixture = {
  firstName: string;
  lastName: string;
  email: string;
  /**
   * Phone number, raw form (no spaces). The UI formats display; tests still
   * assert on the FORMATTED form because that's what the user sees.
   */
  phoneNumber: string;
  /**
   * Locale tag the UI consults to render Czech vs English. Forced by
   * `setupProfileBaseline` to `cs-CZ` so tests that switch the language
   * (Jazyky) don't poison the next test run via the real backend's persisted
   * preference.
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
 * so tests can assert exactly what the UI sent on a toggle click without
 * having to dig into untyped `unknown`s.
 */
export type CapturedMutation = {
  operationName: string;
  variables: Record<string, unknown> | null;
  rawBody: unknown;
};

/**
 * Behavior variants for `mockPasswordChange`. Mirrors the user-facing error
 * states the password-change form must handle.
 */
export type PasswordChangeBehavior =
  | "success"
  | "wrong-current"
  | "same-as-current"
  | "policy-violation";

// ---------------------------------------------------------------------------
// Defaults — exported so tests can import and assert against them
// ---------------------------------------------------------------------------

/**
 * Default profile fixture — stable Czech-named test user.
 *
 * NOTE: `phone` was renamed to `phoneNumber` to match the real API key. The
 * UI formats the raw phone with spaces (`+44 7481 765995`) for display, so
 * the formatted form is also exported for assertion convenience.
 */
export const DEFAULT_USER: UserDetailsFixture = {
  firstName: "Test",
  lastName: "Testovaci",
  email: "resetpasword_invstwwn@mailsac.com",
  phoneNumber: "+447481765995",
  preferredLocale: "cs-CZ",
};

/**
 * Human-formatted display values for assertions. The UI inserts spaces into
 * the phone number for legibility (`+44 7481 765995`). Tests should assert
 * on these formatted strings — they match what the user sees in the DOM.
 */
export const DEFAULT_USER_DISPLAY = {
  fullName: `${DEFAULT_USER.firstName} ${DEFAULT_USER.lastName}`,
  email: DEFAULT_USER.email,
  /** Phone with spaces, as rendered by the UI. */
  phoneFormatted: "+44 7481 765995",
} as const;

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
const URL_CORE_GRAPHQL = "**/core/api/graphql";
const URL_USERS_GRAPHQL = "**/users/api/graphql";
/**
 * Region-flexible RegExp pattern for the Cognito IDP endpoint. Matches any
 * AWS region (eu-west-1, us-east-1, etc.) so tests don't break when the
 * deployment moves regions or runs against a multi-region setup.
 */
const URL_COGNITO = /cognito-idp\.[a-z0-9-]+\.amazonaws\.com/;

/**
 * Explicit list of password-change REST endpoints we hedge against. Listing
 * each candidate path explicitly (instead of `**\/users/api/**` + substring
 * filter) avoids accidentally swallowing unrelated requests and makes the
 * surface area auditable.
 */
const PASSWORD_REST_CANDIDATES: readonly string[] = [
  "**/users/api/v1/users/password",
  "**/users/api/v1/users/change-password",
  "**/users/api/v1/auth/change-password",
  "**/users/api/v1/password",
];

const THIRD_PARTY_BLOCKLIST: readonly string[] = [
  "**/api.eu1.exponea.com/**",
  "**/api-iam.intercom.io/**",
  "**/region1.google-analytics.com/**",
  "**/*.googletagmanager.com/**",
  "**/*.google-analytics.com/**",
];

/**
 * Same as `THIRD_PARTY_BLOCKLIST` but WITHOUT any Intercom patterns. Used by
 * `setupProfileBaselineKeepingChat` for tests that need a working Intercom
 * messenger (e.g. chat-widget open/close tests in profile-chat.spec.ts).
 *
 * Kept in sync with `THIRD_PARTY_BLOCKLIST` by construction: we filter out
 * every entry whose pattern contains "intercom" (case-insensitive). If new
 * Intercom hosts are added to the main blocklist, they're auto-excluded here.
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
 * malformed JSON, binary, or unexpected non-object shape). Tests assert
 * behavior, not parser internals.
 *
 * Handles Apollo's batched-request format (array of operations) by taking
 * the first entry — none of the mocks here support multi-operation batches
 * deliberately; tests would need explicit support added.
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
 * GraphQL convention is to surface errors in the `errors` array rather than
 * via HTTP status.
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
 * Block third-party analytics / chat backend requests to keep tests fast and
 * deterministic. Call once per test (or in a beforeEach).
 *
 * BLOCKED: Exponea analytics, Intercom messenger backend, Google Analytics,
 *          Google Tag Manager.
 * NOT blocked: the Intercom chat button itself (it's part of the app bundle,
 *          not a separate request) and the d3jg1yk2sjabwp.cloudfront.net image
 *          CDN (we let images load for visual consistency).
 */
export async function blockThirdParty(page: Page): Promise<void> {
  await Promise.all(
    THIRD_PARTY_BLOCKLIST.map((pattern) =>
      page.route(pattern, (route: Route) => route.abort()),
    ),
  );
}

/**
 * Same as `blockThirdParty` but leaves Intercom requests untouched, so the
 * chat widget can actually load. Use for tests in `profile-chat.spec.ts`
 * that exercise the Intercom messenger open/close flow.
 *
 * Why a separate helper rather than a flag on `blockThirdParty`? Keeping the
 * baseline behaviour immutable means existing tests (which assume Intercom
 * IS blocked) continue to pass unchanged — the new variant is purely additive.
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
 * The real response has many fields (level object, intercomUserHash*, etc.)
 * the app needs to render. Building a payload from scratch breaks the app
 * (we tried; it shows the "Ooops" error fallback because of missing fields).
 *
 * Strategy: forward the request to the real backend via `route.fetch()`,
 * then merge `override` keys on top of the returned body. Unspecified fields
 * stay at their real values. If override is empty, this is effectively a
 * pass-through (lets us keep `mockUserDetails(page)` as a no-op marker in
 * tests that don't need overrides).
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
      // If the real backend is unreachable, fall back to letting the request
      // through unmodified — the alternative (synthesizing a payload) breaks
      // the app, so this is the safer failure mode.
      await route.fallback();
    }
  });
}

/**
 * Mock GET /users/api/v1/configuration/user-levels.
 *
 * Strategy: pass-through to the real backend. The real response has a complex
 * shape (premium tiers, translations, externalBenefits etc.) that the UI
 * depends on; building it from scratch is fragile and broke the app in
 * earlier iterations. Tests don't currently assert on level fields, so a
 * pass-through is sufficient. Kept as a function (not deleted) so the
 * baseline composition site stays readable and we can add patching later.
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
 * Strategy: pass-through to the real backend. The real shape is a flat record
 * of nullable KYC fields (pep, street, city, zip, personalIdentifier,
 * documentNumber, submitted, version, …). Building a payload from scratch
 * with the wrong keys (`status`, `verified`, `state`, `documents`) broke the
 * app's render — those keys don't exist on the real API. Tests in this suite
 * don't assert on verification fields directly; the section is read via the
 * personal-data renderer which reads from /users/details. Pass-through keeps
 * the boot flow working without us having to invent KYC data.
 *
 * Kept as a function (not deleted) so the baseline composition site stays
 * readable and so we can switch to "fetch real, patch override" later if
 * tests start needing to drive specific verification states.
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
 * Mock POST /notifications/api/graphql.
 *
 * Behavior depends on the GraphQL operation:
 *   - Read/query operations return the current preferences state.
 *   - Mutation operations either succeed (echoing the merged state) or fail
 *     (depending on `opts.mutate`).
 *
 * The returned `getLastMutation` closure exposes the most recent mutation
 * payload (variables + operationName) so tests can assert exactly what the
 * UI sent on toggle click.
 *
 * Assumed shapes (adjust if real captures differ):
 *   - Query operation name contains "Notification" or "Preferences".
 *   - Mutation operation name contains "Update", "Set", or "Save".
 *   - Response key matches `notificationPreferences` for queries and the
 *     mutation name for mutations — both wrapped in the standard
 *     { data: { ... } } envelope.
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
    ...(opts.initial ?? {}),
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
    const isMutation =
      /update|set|save|toggle|mutate/i.test(operationName) ||
      /^\s*mutation\b/i.test(body?.query ?? "");

    if (isMutation) {
      // Capture mutation variables BEFORE deciding how to respond so error-path
      // tests can still inspect what the UI sent.
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

      // Merge whatever boolean preference values the UI sent into our state
      // (used to re-render the next query). We do NOT forward the mutation to
      // the real backend — we don't want to mutate the shared test account.
      state = mergeMutationVariables(state, body?.variables);
      await route.fulfill(
        gqlSuccess({
          [operationName || "updateNotificationPreferences"]: {
            success: true,
          },
        }),
      );
      return;
    }

    // Query: fetch the real GraphQL response and patch our preferences onto
    // its `data.UserPreferences` node. The previous strategy (fabricating
    // `{ notificationPreferences: ... }`) broke the page because the real
    // response key is `UserPreferences` and the inner shape is nested
    // (`categoryPreferences` array, not flat booleans).
    try {
      const realResponse = await route.fetch();
      const real = (await realResponse.json()) as Record<string, unknown>;
      const patched = applyPreferencesToRealShape(real, state);
      await route.fulfill({
        status: realResponse.status(),
        contentType: "application/json",
        body: JSON.stringify(patched),
      });
    } catch {
      // Real backend unreachable — fall through. Better than synthesizing a
      // wrong shape, which is what the original implementation did.
      await route.fallback();
    }
  });

  return {
    getLastMutation: (): CapturedMutation | null => lastMutation,
  };
}

/**
 * Merge boolean preference fields from mutation variables into the current
 * state. Looks for keys at the top of `variables`, under `variables.input`,
 * and under `variables.prefs`. Unknown / non-boolean values are ignored.
 */
function mergeMutationVariables(
  current: NotificationPreferences,
  variables: Record<string, unknown> | undefined | null,
): NotificationPreferences {
  if (!variables || typeof variables !== "object") return current;
  const candidates: Array<Record<string, unknown>> = [variables];
  const input = variables["input"];
  if (input && typeof input === "object") {
    candidates.push(input as Record<string, unknown>);
  }
  const prefs = variables["prefs"];
  if (prefs && typeof prefs === "object") {
    candidates.push(prefs as Record<string, unknown>);
  }

  const next: NotificationPreferences = { ...current };
  const keys: Array<keyof NotificationPreferences> = [
    "emailMaster",
    "emailNews",
    "emailOpportunities",
    "emailSummaries",
    "smsMaster",
    "smsNews",
  ];
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "boolean") {
        next[key] = value;
      }
    }
  }
  return next;
}

/**
 * Map our flat `NotificationPreferences` onto the real Apollo response object
 * captured from /notifications/api/graphql (key `data.UserPreferences`).
 *
 * Returns a deep clone with the override booleans applied. Validated against
 * the live response (2026-05-20):
 *
 *   emailMaster        → data.UserPreferences.emailNotificationsEnabled
 *   smsMaster          → data.UserPreferences.smsNotificationsEnabled
 *   emailSummaries     → categoryPreferences[name=SummaryReports].email
 *   emailOpportunities → categoryPreferences[name=NewInvestmentOpportunities].email
 *   emailNews          → categoryPreferences[name=NewsAndPersonalisedOffers].email
 *   smsNews            → categoryPreferences[name=NewsAndPersonalisedOffers].sms
 *
 * If a category goes missing in a future API revision, the override is
 * silently dropped — UI assertions will then fail loudly, which is the
 * correct signal.
 */
function applyPreferencesToRealShape(
  real: Record<string, unknown>,
  prefs: NotificationPreferences,
): Record<string, unknown> {
  // Deep clone so we never mutate the input — multiple route handlers can
  // share the same response object reference.
  const cloned = structuredClone(real);
  const data = cloned["data"];
  if (!data || typeof data !== "object") return cloned;
  const userPrefs = (data as Record<string, unknown>)["UserPreferences"];
  if (!userPrefs || typeof userPrefs !== "object") return cloned;
  const up = userPrefs as Record<string, unknown>;

  up["emailNotificationsEnabled"] = prefs.emailMaster;
  up["smsNotificationsEnabled"] = prefs.smsMaster;

  patchCategoryPreferences(up["categoryPreferences"], prefs);
  return cloned;
}

/**
 * Walk the real `categoryPreferences` array and apply per-category overrides
 * in-place. Defensive: any malformed entry is skipped. Extracted to keep the
 * main `applyPreferencesToRealShape` body small enough for the cognitive-
 * complexity rule.
 */
function patchCategoryPreferences(
  cats: unknown,
  prefs: NotificationPreferences,
): void {
  if (!Array.isArray(cats)) return;
  const overrides: Record<string, { email?: boolean; sms?: boolean }> = {
    SummaryReports: { email: prefs.emailSummaries },
    NewInvestmentOpportunities: { email: prefs.emailOpportunities },
    NewsAndPersonalisedOffers: { email: prefs.emailNews, sms: prefs.smsNews },
  };
  for (const cat of cats) {
    if (typeof cat !== "object" || cat === null) continue;
    const c = cat as Record<string, unknown>;
    const name = c["preferenceCategoryName"];
    if (typeof name !== "string") continue;
    const override = overrides[name];
    if (!override) continue;
    if (typeof override.email === "boolean") c["email"] = override.email;
    if (typeof override.sms === "boolean") c["sms"] = override.sms;
  }
}

// ---------------------------------------------------------------------------
// Password change mock — hedged across REST, GraphQL, and Cognito direct
// ---------------------------------------------------------------------------

/**
 * Mock password change with the given behavior. We hedge across three
 * possible call sites — whichever the app actually hits gets the mocked
 * response; the others sit idle.
 *
 * Hedged endpoints:
 *   1. REST POST to one of the explicit `PASSWORD_REST_CANDIDATES` paths
 *      (e.g. `/users/api/v1/users/password`, `/users/api/v1/users/change-password`).
 *   2. GraphQL `**\/core/api/graphql` POST with operationName containing
 *      "Password" (e.g. `ChangePassword`, `UpdatePassword`).
 *   3. GraphQL `**\/users/api/graphql` POST with operationName containing
 *      "Password" — kept for the case where password mutations live under
 *      the users service rather than core.
 *   4. Cognito direct POST to any `cognito-idp.<region>.amazonaws.com` host
 *      with header `X-Amz-Target` containing `ChangePassword`. AWS Amplify
 *      apps frequently call this endpoint directly from the browser; the
 *      region is matched permissively so multi-region setups still work.
 *
 * Error shapes:
 *   - REST: HTTP 400 with `{ code, message }` body.
 *   - GraphQL: HTTP 200 with `errors[]` (Apollo convention).
 *   - Cognito: HTTP 400 with `__type` matching the failure code (Cognito's
 *     standard error envelope).
 */
export async function mockPasswordChange(
  page: Page,
  behavior: PasswordChangeBehavior,
): Promise<void> {
  // Register each explicit REST candidate path. We previously used a broad
  // `**\/users/api/**` glob + URL substring check, but that risked intercepting
  // unrelated user-API requests and made the surface area opaque. Listing
  // candidate paths explicitly is auditable and lets `page.route()` matching
  // do the filtering.
  await Promise.all(
    PASSWORD_REST_CANDIDATES.map((pattern) =>
      page.route(pattern, async (route: Route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        await route.fulfill(restPasswordResponse(behavior));
      }),
    ),
  );

  const passwordGraphQLHandler = async (route: Route): Promise<void> => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = readJsonBody(request);
    const op = body?.operationName ?? "";
    if (!/password/i.test(op) && !/password/i.test(body?.query ?? "")) {
      await route.fallback();
      return;
    }
    await route.fulfill(graphQLPasswordResponse(behavior, op));
  };
  await page.route(URL_CORE_GRAPHQL, passwordGraphQLHandler);
  await page.route(URL_USERS_GRAPHQL, passwordGraphQLHandler);

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
    await route.fulfill(cognitoPasswordResponse(behavior));
  });
}

/** REST response for the password-change endpoint, per behavior. */
function restPasswordResponse(behavior: PasswordChangeBehavior): {
  status: number;
  contentType: string;
  body: string;
} {
  if (behavior === "success") {
    return {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    };
  }
  const errorMap: Record<
    Exclude<PasswordChangeBehavior, "success">,
    { status: number; code: string; message: string }
  > = {
    "wrong-current": {
      status: 401,
      code: "INVALID_CURRENT_PASSWORD",
      message: "Current password is incorrect",
    },
    "same-as-current": {
      status: 400,
      code: "PASSWORD_SAME_AS_CURRENT",
      message: "New password must differ from current password",
    },
    "policy-violation": {
      status: 400,
      code: "PASSWORD_POLICY_VIOLATION",
      message: "Password does not meet policy requirements",
    },
  };
  const detail = errorMap[behavior];
  return {
    status: detail.status,
    contentType: "application/json",
    body: JSON.stringify({ code: detail.code, message: detail.message }),
  };
}

/** GraphQL response for the password-change mutation, per behavior. */
function graphQLPasswordResponse(
  behavior: PasswordChangeBehavior,
  operationName: string,
): { status: number; contentType: string; body: string } {
  if (behavior === "success") {
    return gqlSuccess({
      [operationName || "changePassword"]: { success: true },
    });
  }
  const messageMap: Record<
    Exclude<PasswordChangeBehavior, "success">,
    { message: string; code: string }
  > = {
    "wrong-current": {
      message: "Current password is incorrect",
      code: "INVALID_CURRENT_PASSWORD",
    },
    "same-as-current": {
      message: "New password must differ from current password",
      code: "PASSWORD_SAME_AS_CURRENT",
    },
    "policy-violation": {
      message: "Password does not meet policy requirements",
      code: "PASSWORD_POLICY_VIOLATION",
    },
  };
  const detail = messageMap[behavior];
  return gqlError(detail.message, { code: detail.code });
}

/** Cognito ChangePassword direct-call response, per behavior. */
function cognitoPasswordResponse(behavior: PasswordChangeBehavior): {
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
} {
  const headers: Record<string, string> = {
    "x-amzn-requestid": "mocked-request-id",
  };
  if (behavior === "success") {
    return {
      status: 200,
      contentType: "application/x-amz-json-1.1",
      headers,
      body: JSON.stringify({}),
    };
  }
  // Cognito uses these specific __type values; the app likely branches on them.
  const cognitoErrors: Record<
    Exclude<PasswordChangeBehavior, "success">,
    { type: string; message: string }
  > = {
    "wrong-current": {
      type: "NotAuthorizedException",
      message: "Incorrect username or password.",
    },
    "same-as-current": {
      type: "InvalidParameterException",
      message: "Previous password and proposed password must be different.",
    },
    "policy-violation": {
      type: "InvalidPasswordException",
      message: "Password did not conform with policy.",
    },
  };
  const detail = cognitoErrors[behavior];
  return {
    status: 400,
    contentType: "application/x-amz-json-1.1",
    headers,
    body: JSON.stringify({ __type: detail.type, message: detail.message }),
  };
}

// ---------------------------------------------------------------------------
// Composite setup
// ---------------------------------------------------------------------------

/**
 * Apply the baseline mocks for any /user/* test:
 *   - block third-party noise
 *   - mock user details (forces `preferredLocale = cs-CZ` so the UI renders
 *     in Czech regardless of what the previous test session left behind in
 *     the real backend — i18n tests can flip the language by clicking the
 *     radio without polluting later tests)
 *   - mock user levels and verification (pass-through; see helpers)
 *
 * Tests can layer additional mocks (notifications, password-change) on top
 * by calling the dedicated helpers after this one.
 */
export async function setupProfileBaseline(page: Page): Promise<void> {
  await blockThirdParty(page);
  await mockUserDetails(page, { preferredLocale: "cs-CZ" });
  await mockUserLevels(page);
  await mockUserVerification(page);
}

/**
 * Like `setupProfileBaseline` but does NOT block Intercom backend calls — the
 * chat widget can load and the messenger can open. All other baseline mocks
 * (user details, levels, verification, non-Intercom third-party blocking) are
 * applied identically so tests still get a deterministic profile state.
 *
 * Use this in `profile-chat.spec.ts` (or any test that needs to assert against
 * the live Intercom messenger). Do NOT use this for tests that DON'T touch the
 * chat — those should keep using `setupProfileBaseline` for maximum determinism
 * (the live Intercom backend introduces a remote-network dependency).
 */
export async function setupProfileBaselineKeepingChat(
  page: Page,
): Promise<void> {
  await blockThirdPartyKeepingChat(page);
  // Same locale lock as setupProfileBaseline — chat tests should also see
  // Czech UI regardless of the real backend's stored preference.
  await mockUserDetails(page, { preferredLocale: "cs-CZ" });
  await mockUserLevels(page);
  await mockUserVerification(page);
}
