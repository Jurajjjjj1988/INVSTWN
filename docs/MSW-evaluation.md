# MSW Evaluation for investown-tests

**Audience:** Roman (incoming maintainer)
**Date:** 2026-05-20
**Verdict (TL;DR):** Defer adoption. Current `page.route()` setup works, switching costs 2-3 days, and the upside only materializes when unit tests / Storybook arrive or the team grows.

---

## Why this question came up

`data/profile-mocks.ts` uses Playwright's built-in `page.route()` with the "fetch real, patch overrides" pattern (Pattern 1 in the api-mocking skill). MSW (Pattern 3) is the alternative everyone asks about because it's the dominant mocking library in the React ecosystem. This doc decides whether the switch is worth Roman's first sprint.

## Quantified comparison

| Dimension                                     | Current (`page.route`)                   | With MSW                                         | Winner       |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------ | ------------ |
| New deps to install / pin / audit             | 0                                        | +2 (`msw`, `playwright-msw`)                     | `page.route` |
| Handlers reusable in unit tests / Storybook   | No                                       | Yes (if we add them)                             | depends      |
| GraphQL `operationName` matching              | manual `readJsonBody()` (works, ~15 LOC) | first-class `graphql.query()` API                | MSW (slight) |
| Service Worker setup overhead                 | none                                     | global-setup wiring + `msw-storage-state`        | `page.route` |
| Handler shape clarity                         | typed factories with JSDoc               | declarative `http.get(url, resolver)`            | MSW (slight) |
| Mock-state isolation across parallel workers  | trivial — per-page closures              | needs explicit `server.resetHandlers()` per test | `page.route` |
| Survives backend schema drift (fetch + patch) | yes, built into Pattern 1                | possible but not idiomatic in MSW                | `page.route` |
| Cognito direct-from-browser interception      | works — regex URL match                  | works the same — still need `page.route` shim    | tie          |

**Score:** 5 wins for `page.route`, 2 slight wins for MSW, 1 tie, 1 depends. The wins for MSW only matter when the "if we had unit tests" branch is true.

## Decision criteria for Roman

1. **Do you use MSW in your other projects?** If yes, the same handler files port over and the learning curve is zero. Then adoption pays off. If no, you'd be learning MSW to replace something already working.
2. **Will the team add Jest/Vitest unit tests or Storybook stories for the same React components?** This is the one scenario where MSW genuinely beats `page.route`: the same `handlers.ts` file serves E2E, unit, and Storybook. If unit testing isn't on the roadmap, that whole benefit evaporates.
3. **Is the current mock layer painful to maintain?** `profile-mocks.ts` is ~770 lines, fully typed, with JSDoc on every public surface. The pain points (string-union behaviors, hard-coded backend hedging, missing fixture indirection) are pattern-level issues — see `api-mocking/SKILL.md` recommendations 1-5. None of them are solved by MSW; they're solved by Patterns 6 and 7 _inside_ `page.route()`.

If 2 of 3 answers are "no," defer.

## Sample MSW handler — `mockNotifications` side-by-side

### Current (`page.route` + state closure)

```ts
export async function mockNotifications(page: Page, opts = {}) {
  let state = { ...DEFAULT_NOTIFICATIONS, ...opts.initial };
  let lastMutation: CapturedMutation | null = null;

  await page.route(URL_NOTIFICATIONS_GRAPHQL, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = readJsonBody(route.request());
    const op = body?.operationName ?? "";

    if (op === "GetUserPreferences") {
      return route.fulfill(gqlSuccess({ UserPreferences: serialize(state) }));
    }
    if (op === "PatchUserPreference") {
      lastMutation = {
        operationName: op,
        variables: body?.variables ?? null,
        rawBody: body,
      };
      applyMutationInput(state, body?.variables);
      return route.fulfill(
        gqlSuccess({
          patchUserPreference: {
            categoryPreferences: serialize(state).categoryPreferences,
          },
        }),
      );
    }
    return route.fallback();
  });

  return { getLastMutation: () => lastMutation };
}
```

### Same logic in MSW (`playwright-msw` + `graphql.query/mutation`)

```ts
import { graphql, HttpResponse } from "msw";
import { createWorkerFixture } from "playwright-msw";

export function notificationsHandlers(initial = DEFAULT_NOTIFICATIONS) {
  let state = { ...initial };
  let lastMutation: CapturedMutation | null = null;

  return {
    handlers: [
      graphql.query("GetUserPreferences", () =>
        HttpResponse.json({ data: { UserPreferences: serialize(state) } }),
      ),
      graphql.mutation("PatchUserPreference", ({ variables }) => {
        lastMutation = {
          operationName: "PatchUserPreference",
          variables,
          rawBody: variables,
        };
        applyMutationInput(state, variables);
        return HttpResponse.json({
          data: {
            patchUserPreference: {
              categoryPreferences: serialize(state).categoryPreferences,
            },
          },
        });
      }),
    ],
    getLastMutation: () => lastMutation,
  };
}
```

**Observation:** MSW is ~3 lines shorter and reads slightly more declaratively (`graphql.mutation("PatchUserPreference", ...)` vs branching on `operationName`). But the meat — `serialize()`, `applyMutationInput()`, the state closure, the `lastMutation` capture — is identical. The ergonomic win is real but small.

## Recommendation: **Defer**

Honest reasoning:

- The current setup works. The notifications mock is the most complex part of the suite and it's fully solved with `page.route`. The slight readability gain from `graphql.query` doesn't justify a rewrite.
- Roman doesn't have unit tests yet. The headline MSW benefit ("same handlers everywhere") only pays off when there's an "everywhere" to share with.
- Switching mid-stream loses 2-3 days. Even a careful migration ships zero new test coverage during that window.
- Bigger wins lie inside the current stack. Pattern 6 (fixture-scoped baseline) and Pattern 7 (scenario objects for password) would eliminate the actual pain points without changing the network layer.

**Revisit when any of these hit:**

- Unit / Storybook tests are added for the same React components → shared `handlers.ts` becomes valuable.
- The team grows beyond Roman + Juraj → declarative handlers lower the entry barrier for new joiners.
- A concrete `page.route()` limitation surfaces — cross-tab consistency, fetch interception in a Web Worker, WebSocket mocking, partial header overrides.

## Migration path (if green-lit later)

1. Add `msw` + `playwright-msw` to `devDependencies`. Run `npx msw init public/` only if a Service Worker is needed; with `playwright-msw` you can stay in `page.route` shim mode.
2. Convert `mockNotifications` first — it's the most-touched mock and the GraphQL operation matching is where MSW shines. Run the existing `profile/notifications.spec.ts` against both implementations as an A/B verification.
3. Convert remaining mocks one PR at a time: `mockUserDetails`, `mockPasswordChange`, then the pass-through helpers. Keep `setupProfileBaseline` as the public seam — only its internals change.

Estimated cost end-to-end: 2-3 focused days with all current tests green at every step.
