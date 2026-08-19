---
status: testing
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-18T20:50:00Z
updated: "2026-08-19T12:10:00Z"
---

## Current Test

number: 1
name: Scroll the ~870-row exercise list continuously top to bottom on a real device or browser
expected: |
  FlashList renders and scrolls all rows without dropped frames or visible jank.
awaiting: user response

## Tests

### 1. Scroll the ~870-row exercise list continuously top to bottom on a real device or browser

expected: FlashList renders and scrolls all rows without dropped frames or visible jank.
result: [pending]
why_human: Performance/frame-drop behavior cannot be observed via typecheck or Jest; only bundler-level proof exists that FlashList is wired — WINDOWS #37. The catalog load itself is no longer the blocker (G-03-2 closed by plan 03-12), so this screen is reachable — only the scroll-performance observation remains outstanding.

### 2. Exercise create/edit form behaviours

expected: Open the Add Custom Exercise form, leave it blank, and confirm all six rendered behaviours match UI-SPEC exactly — placeholder tracking-type text; inline per-field errors on invalid submit; Save disabled (not hidden) until name + load_type are set; multiline cue/instructions auto-grows then scrolls; muscle-mapping chip picker works; opening a seeded exercise's Edit route as a non-owner shows a not-permitted state.
result: [pending]
why_human: No @testing-library/react-native in this codebase and no simulator/device available; verified instead via 33 unit tests over extracted presentational logic plus typecheck/bundling — WINDOWS #41. Previously blocked behind G-03-2; now structurally reachable but never walked by a human.

### 3. Suggested Alternatives section on the detail screen

expected: Candidate rows render with thumbnail, name, and a plain-language why string; the empty state and Browse Catalog link appear when no candidates qualify; why-strings are never blank.
result: [pending]
why_human: Never observed in a real browser/device — verified via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling only — WINDOWS #46. Previously blocked behind G-03-2; now structurally reachable, not yet walked by a human.

### 4. Full native (iOS/Android) and browser pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog and swap suggestions behave as the web/unit-verified logic, rendered correctly on native chrome. Also re-run the offline first-boot flow: cold-boot the app offline, open /exercises, then open one exercise — populated content with real images painting on screen, entirely offline, no blank screen, no broken-image icon, no network request fired.
result: [pending]
why_human: No Xcode or Android SDK on this machine. Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase. The browser half is now unblocked by both G-03-1 (CORS/sign-up) and G-03-2 (catalog load) closures — only the native-device half is still environment-blocked.

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-1
  truth: "The web client can create an account and reach the catalog — credentialed cross-origin requests from http://localhost:8081 to the API succeed."
  status: fixed
  reason: "Closed by plan 03-11. apps/api/src/main.ts now calls app.enableCors({ origin: resolveWebOrigins(), credentials: true }) as the first line of bootstrap(), ahead of minClientVersionMiddleware and the Better Auth mount. apps/api/src/common/web-origins.ts is the sole reader of WEB_ORIGINS and feeds both the CORS allowlist and Better Auth's trustedOrigins, so they cannot drift. Proven by apps/api/test/cors.e2e-spec.ts, green in the full api e2e suite (18 suites / 135 tests) at the 03-12 regression gate — WINDOWS #48, fixed."
  severity: blocker
  test: 4
  root_cause: "apps/api/src/main.ts never called app.enableCors(). Better Auth does not emit CORS headers itself; trustedOrigins only drives its origin/CSRF check and redirect allowlist."
  debug_session: ""

- gap_id: G-03-2
  truth: "Opening http://localhost:8081/exercises renders the exercise catalog list (~870 rows) and scrolls smoothly."
  status: fixed
  reason: "Closed by plan 03-12. applyCatalogSnapshot was rebuilt for all four catalog tables on read-existing-ids-then-branch (plain INSERT when new, condition-scoped UPDATE ... WHERE id = ? when existing) — no upsert clause remains anywhere in the production write path. Proven on a real @powersync/web engine in a real browser by apps/mobile/e2e/catalog-load.spec.ts, which observed the original `Error: cannot UPSERT a view` before the fix and, after it, 19 muscle groups / 870 exercises / 3134 mappings / 1 catalog_meta row with a zero-length upload queue, unchanged on re-apply. refreshCatalog's never-throws contract is now real (whole body wrapped, new 'write-failed' outcome) and app/exercises/index.tsx logs the caught error instead of discarding it. The Jest fakes now reject upsert grammar with the engine's own message, so reintroducing it turns the suite red in seconds. Closes WINDOWS #33 — the real-engine gap that let 282/282 mobile tests pass against this defect."
  severity: blocker
  test: 1
  root_cause: "applyCatalogSnapshot wrote every catalog row with Drizzle's .onConflictDoUpdate(), which compiles to a SQLite UPSERT. Every PowerSync-managed table — localOnly included — is a SQLite VIEW over ps_data__* / ps_data_local__* with INSTEAD OF triggers, and SQLite refuses to prepare an UPSERT against a view. The first site (muscle_group) threw at statement 1 of ~4066 inside the transaction; the rollback left catalog_meta unstamped, so currentVersion stayed null and every reload re-entered the same doomed path."
  debug_session: ".planning/debug/exercise-catalog-load-failure.md"
