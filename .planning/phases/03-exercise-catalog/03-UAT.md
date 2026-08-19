---
status: testing
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-18T20:50:00Z
updated: "2026-08-19T09:20:00Z"
---

## Current Test

number: 1
name: Scroll the ~870-row exercise list continuously top to bottom
expected: |
  FlashList renders and scrolls all rows without dropped frames or visible jank.
awaiting: user response

## Tests

### 1. Scroll the ~870-row exercise list continuously top to bottom on a real device or browser

expected: FlashList renders and scrolls all rows without dropped frames or visible jank.
result: [pending]
why_human: Performance/frame-drop behavior cannot be observed via typecheck or Jest; only bundler-level proof exists that FlashList is wired — WINDOWS #37.

### 2. Exercise create/edit form behaviours

expected: Open the Add Custom Exercise form, leave it blank, and confirm all six rendered behaviours match UI-SPEC exactly — placeholder tracking-type text; inline per-field errors on invalid submit; Save disabled (not hidden) until name + load_type are set; multiline cue/instructions auto-grows then scrolls; muscle-mapping chip picker works; opening a seeded exercise's Edit route as a non-owner shows a not-permitted state.
result: [pending]
why_human: No @testing-library/react-native in this codebase and no simulator/device available; verified instead via 33 unit tests over extracted presentational logic plus typecheck/bundling — WINDOWS #41.

### 3. Suggested Alternatives section on the detail screen

expected: Candidate rows render with thumbnail, name, and a plain-language why string; the empty state and Browse Catalog link appear when no candidates qualify; why-strings are never blank.
result: [pending]
why_human: Never observed in a real browser/device — verified via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling only — WINDOWS #46.

### 4. loadCatalogSnapshot against a real PowerSync engine

expected: Zero ps_crud entries generated for muscle_group / exercise_muscle_mapping / catalog_meta writes, matching the already-passing Jest-mock-based assertion. Needs a Playwright e2e case (real browser, real Worker/IndexedDB).
result: [pending]
why_human: `new PowerSyncDatabase()` from @powersync/web hangs indefinitely under this project's Jest/Node sandbox; the claim is proven only against a faithful mock of PowerSync's documented per-table trigger behaviour — WINDOWS #33.

### 5. Full native (iOS/Android) and browser pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog and swap suggestions behave as the web/unit-verified logic, rendered correctly on native chrome. Also re-run the offline first-boot flow: cold-boot the app offline, open /exercises, then open one exercise — populated content with real images painting on screen, entirely offline, no blank screen, no broken-image icon, no network request fired.
result: [pending]
why_human: No Xcode or Android SDK on this machine. Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase. The CORS fix (03-11) unblocks account creation, so this browser/device pass can now proceed — it was blocked behind G-03-1 in the previous UAT round.

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-1
  truth: "The web client can create an account and reach the catalog — credentialed cross-origin requests from http://localhost:8081 to the API succeed."
  status: fixed
  reason: "Closed by plan 03-11. apps/api/src/main.ts now calls app.enableCors({ origin: resolveWebOrigins(), credentials: true }) as the first line of bootstrap(), ahead of minClientVersionMiddleware and the Better Auth mount. apps/api/src/common/web-origins.ts is the sole reader of WEB_ORIGINS and feeds both the CORS allowlist and Better Auth's trustedOrigins, so they cannot drift. The misleading comment in auth.ts is corrected. Proven by apps/api/test/cors.e2e-spec.ts, which passed in the full api e2e suite (18 suites / 135 tests) at this session's regression gate — see WINDOWS #48, now fixed."
  severity: blocker
  test: 5
  root_cause: "apps/api/src/main.ts never called app.enableCors(). Better Auth does not emit CORS headers itself; trustedOrigins only drives its origin/CSRF check and redirect allowlist."
  debug_session: ""
