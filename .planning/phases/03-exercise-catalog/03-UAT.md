---
status: partial
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-18T20:50:00Z
updated: "2026-08-19T01:00:00Z"
---

## Current Test

[testing paused — 5 items outstanding, blocked behind G-03-1]

## Tests

### 1. Cold-boot the app offline, open /exercises, then open one exercise

expected: List and detail screens render populated content with real images painting on screen, entirely offline — no blank screen, no broken-image icon, no network request fired (verify via a network panel/proxy). Detail shows name, image, target muscles, cues, instructions, and suggested alternatives.
result: issue
reported: "I cannot create account Access to fetch at 'http://localhost:3000/v1/auth/sign-up/email' from origin 'http://localhost:8081' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'."
severity: blocker
why_human: No browser, simulator, or device was driven this session (CLAUDE.md forbids launching a browser unless explicitly asked; no Xcode/Android SDK on this machine). Evidence is typecheck/unit-test/bundler level only — WINDOWS #34, #38, #39, #36.

### 2. Scroll the ~870-row exercise list continuously, top to bottom

expected: FlashList renders and scrolls all rows without dropped frames or visible jank.
result: [pending]
why_human: Frame-drop behaviour cannot be observed via typecheck or Jest; only bundler-level proof exists that FlashList is wired — WINDOWS #37.

### 3. Exercise create/edit form behaviours

expected: Placeholder tracking-type text; inline per-field errors on invalid submit; Save disabled (not hidden) until name + load_type are set; multiline cue/instructions auto-grows then scrolls; muscle-mapping chip picker works; opening a seeded exercise's Edit route as a non-owner shows a not-permitted state. All six match UI-SPEC exactly.
result: [pending]
why_human: No @testing-library/react-native in this codebase and no simulator/device; verified instead via 33 unit tests over extracted presentational logic plus typecheck/bundling — WINDOWS #41.

### 4. Suggested Alternatives section on the detail screen

expected: Candidate rows render with thumbnail, name, and a plain-language why string; empty state and Browse Catalog link appear when no candidates qualify; why-strings are never blank.
result: [pending]
why_human: Never observed in a real browser/device — verified via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling only — WINDOWS #46.

### 5. loadCatalogSnapshot against a real PowerSync engine

expected: Zero ps_crud entries generated for muscle_group / exercise_muscle_mapping / catalog_meta writes, matching the already-passing Jest-mock-based assertion. Needs a Playwright e2e case (real browser, real Worker/IndexedDB).
result: [pending]
why_human: `new PowerSyncDatabase()` from @powersync/web hangs indefinitely under this project's Jest/Node sandbox; the claim is proven only against a faithful mock of PowerSync's documented per-table trigger behaviour — WINDOWS #33.

### 6. Full native (iOS/Android) pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog and swap suggestions behave as the web/unit-verified logic, rendered correctly on native chrome.
result: [pending]
why_human: No Xcode or Android SDK on this machine. Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase.

## Summary

total: 6
passed: 0
issues: 1
pending: 5
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-1
  truth: "The web client can create an account and reach the catalog — credentialed cross-origin requests from http://localhost:8081 to the API succeed."
  status: failed
  reason: "User reported: CORS preflight to /v1/auth/sign-up/email fails — Access-Control-Allow-Credentials is '' but must be 'true' for credentials: include."
  severity: blocker
  test: 1
  root_cause: "apps/api/src/main.ts never calls app.enableCors(). Better Auth does not emit CORS headers itself (per its Express/Hono/Fastify integration docs the host framework must enable CORS); trustedOrigins only drives its origin/CSRF check and redirect allowlist. The comment at apps/api/src/auth/auth.ts:10-14 asserts the opposite and is the reason the gap went unnoticed."
  artifacts:

    - path: "apps/api/src/main.ts"
      issue: "No app.enableCors({ origin: WEB_ORIGINS, credentials: true }) — every credentialed browser request fails preflight"

    - path: "apps/api/src/auth/auth.ts"
      issue: "Comment at lines 10-14 wrongly claims trustedOrigins makes Better Auth emit Access-Control-Allow-Credentials"
  missing:

    - "Enable CORS in main.ts with the WEB_ORIGINS allowlist and credentials: true, covering both the Better Auth middleware mount and the first-party /v1/catalog routes"
    - "Share one WEB_ORIGINS parser between main.ts and auth.ts so the CORS allowlist and trustedOrigins cannot drift"
    - "Correct the misleading comment in auth.ts"
    - "Regression coverage: an e2e/integration assertion that a credentialed preflight from a WEB_ORIGINS origin returns Access-Control-Allow-Credentials: true"
  debug_session: ""
