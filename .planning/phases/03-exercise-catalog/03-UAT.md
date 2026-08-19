---
status: diagnosed
phase: 03-exercise-catalog
source: [03-VERIFICATION.md]
started: 2026-08-18T20:50:00Z
updated: "2026-08-19T10:05:00Z"
---

## Current Test

[testing paused — 1 blocker under diagnosis, 4 items outstanding]

## Tests

### 1. Scroll the ~870-row exercise list continuously top to bottom on a real device or browser

expected: FlashList renders and scrolls all rows without dropped frames or visible jank.
result: issue
reported: "http://localhost:8081/exercises shows \"Exercise catalog couldn't load / Restart the app to try again. Your saved exercises and history are safe.\""
severity: blocker
why_human: Performance/frame-drop behavior cannot be observed via typecheck or Jest; only bundler-level proof exists that FlashList is wired — WINDOWS #37.

### 2. Exercise create/edit form behaviours

expected: Open the Add Custom Exercise form, leave it blank, and confirm all six rendered behaviours match UI-SPEC exactly — placeholder tracking-type text; inline per-field errors on invalid submit; Save disabled (not hidden) until name + load_type are set; multiline cue/instructions auto-grows then scrolls; muscle-mapping chip picker works; opening a seeded exercise's Edit route as a non-owner shows a not-permitted state.
result: blocked
blocked_by: prior-phase
reason: "Gated behind G-03-2 — the catalog screen fails to load at http://localhost:8081/exercises, so this screen cannot be reached."
why_human: No @testing-library/react-native in this codebase and no simulator/device available; verified instead via 33 unit tests over extracted presentational logic plus typecheck/bundling — WINDOWS #41.

### 3. Suggested Alternatives section on the detail screen

expected: Candidate rows render with thumbnail, name, and a plain-language why string; the empty state and Browse Catalog link appear when no candidates qualify; why-strings are never blank.
result: blocked
blocked_by: prior-phase
reason: "Gated behind G-03-2 — the catalog screen fails to load at http://localhost:8081/exercises, so this screen cannot be reached."
why_human: Never observed in a real browser/device — verified via 20 scorer unit tests + 7 direct-invocation component tests + typecheck/bundling only — WINDOWS #46.

### 4. loadCatalogSnapshot against a real PowerSync engine

expected: Zero ps_crud entries generated for muscle_group / exercise_muscle_mapping / catalog_meta writes, matching the already-passing Jest-mock-based assertion. Needs a Playwright e2e case (real browser, real Worker/IndexedDB).
result: [pending]
why_human: `new PowerSyncDatabase()` from @powersync/web hangs indefinitely under this project's Jest/Node sandbox; the claim is proven only against a faithful mock of PowerSync's documented per-table trigger behaviour — WINDOWS #33.

### 5. Full native (iOS/Android) and browser pass over every catalog screen

expected: List, detail, create/edit forms, archive dialog and swap suggestions behave as the web/unit-verified logic, rendered correctly on native chrome. Also re-run the offline first-boot flow: cold-boot the app offline, open /exercises, then open one exercise — populated content with real images painting on screen, entirely offline, no blank screen, no broken-image icon, no network request fired.
result: blocked
blocked_by: prior-phase
reason: "Gated behind G-03-2 — the catalog screen fails to load at http://localhost:8081/exercises, so this screen cannot be reached."
why_human: No Xcode or Android SDK on this machine. Consistent with every prior phase's native gap; per project convention this is swept once at ROADMAP Phase 999.1 rather than per-phase. The CORS fix (03-11) unblocks account creation, so this browser/device pass can now proceed — it was blocked behind G-03-1 in the previous UAT round.

## Summary

total: 5
passed: 0
issues: 1
pending: 1
skipped: 0
blocked: 3

## Gaps

- gap_id: G-03-1
  truth: "The web client can create an account and reach the catalog — credentialed cross-origin requests from http://localhost:8081 to the API succeed."
  status: fixed
  reason: "Closed by plan 03-11. apps/api/src/main.ts now calls app.enableCors({ origin: resolveWebOrigins(), credentials: true }) as the first line of bootstrap(), ahead of minClientVersionMiddleware and the Better Auth mount. apps/api/src/common/web-origins.ts is the sole reader of WEB_ORIGINS and feeds both the CORS allowlist and Better Auth's trustedOrigins, so they cannot drift. The misleading comment in auth.ts is corrected. Proven by apps/api/test/cors.e2e-spec.ts, which passed in the full api e2e suite (18 suites / 135 tests) at this session's regression gate — see WINDOWS #48, now fixed."
  severity: blocker
  test: 5
  root_cause: "apps/api/src/main.ts never called app.enableCors(). Better Auth does not emit CORS headers itself; trustedOrigins only drives its origin/CSRF check and redirect allowlist."
  debug_session: ""

- gap_id: G-03-2
  truth: "Opening http://localhost:8081/exercises renders the exercise catalog list (~870 rows) and scrolls smoothly."
  status: failed
  reason: "User reported: http://localhost:8081/exercises shows \"Exercise catalog couldn't load / Restart the app to try again. Your saved exercises and history are safe.\""
  severity: blocker
  test: 1
  root_cause: "applyCatalogSnapshot writes every catalog row with Drizzle's .onConflictDoUpdate(), which compiles to a SQLite UPSERT. Every PowerSync-managed table — localOnly ones included — is a SQLite VIEW over ps_data__* / ps_data_local__* with INSTEAD OF triggers, and SQLite refuses to prepare an UPSERT against a view (`Error: in prepare, cannot UPSERT a view`). The first upsert site (muscle_group, load-snapshot.ts:46) throws at statement 1 of ~4066 inside loadCatalogSnapshot's transaction. The bare `catch {}` at app/exercises/index.tsx:147 swallows it and sets failed = true. Because the transaction rolls back before catalog_meta is stamped, currentVersion stays null forever — so every reload re-enters the same doomed write path, which is why \"Restart the app to try again\" never helps. Classification: pre-existing code-defect from plan 03-05 — NOT a 03-11 regression (03-11 touched only three apps/api files and the catalog load makes no network call before failing) and NOT an environment-setup problem (worker + WASM verified served: 200 application/javascript 74335 B, 200 application/wasm 2281765 B on :8081)."
  artifacts:
    - path: "apps/mobile/lib/catalog/load-snapshot.ts"
      issue: "Four .onConflictDoUpdate() sites (lines 46, 82, 118, 125) emit SQLite UPSERT against PowerSync views. Line 46 (muscle_group) throws first. onConflictDoNothing() is NOT an escape — probed, same error."
    - path: "apps/mobile/lib/catalog/refresh-catalog.ts"
      issue: "Line 70 is a second call site of the same broken write path. Docblock claims 'Never throws' but it does; index.tsx:155 calls it as `void refreshCatalog(db)` with no catch → latent unhandled rejection."
    - path: "apps/mobile/app/exercises/index.tsx"
      issue: "Bare `catch {}` at line 147 discards the error object — the reason UAT captured no diagnostic."
    - path: "apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts"
      issue: "Drives the loader through a hand-written FakeDb whose onConflictDoUpdate is a JS closure mutating a Map. No SQL is ever compiled, so 282/282 mobile tests pass against a defect that fails on every real engine. This is exactly WINDOWS #33 / UAT test 4."
  missing:
    - "Replace the ON CONFLICT grammar in applyCatalogSnapshot. INSERT OR REPLACE INTO <view> does prepare against a view, but whether PowerSync's INSTEAD OF trigger body upserts vs. raises a UNIQUE violation must be proven on the real engine first. Read-existing-ids-then-branch-insert/update is the conservative alternative and fits the archive-drift diff already in the function."
    - "Apply the same fix to refresh-catalog.ts, and either make its 'never throws' contract real or wrap the void call site."
    - "Log the caught error at app/exercises/index.tsx:147 instead of discarding it."
    - "Close WINDOWS #33 as part of this fix, not after it: add a Playwright case to the existing durability project (browser-only — no API, no Postgres) that calls loadCatalogSnapshot against the real @powersync/web engine and asserts row counts plus zero ps_crud entries. Without it, the fake-db unit suite will go green on a fix that is still broken."
  debug_session: ".planning/debug/exercise-catalog-load-failure.md"
