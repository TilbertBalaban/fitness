---
phase: 02-data-model-sync-engine
plan: 09
subsystem: testing
tags: [powersync, playwright, chromium, drizzle, offline-first, durability, e2e]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-02: startSession/addSessionExercise/logSet write helpers and the local SQLite schema"
  - phase: 02-data-model-sync-engine
    provides: "02-05: apps/mobile/lib/db/test-support.ts's openTestPowerSync/closeTestPowerSync/reopenTestPowerSync primitives (written but unexercised) and the two WINDOWS.md findings (#22 environment gap, #23 DI-seam gap) this plan closes one of"
provides:
  - "apps/mobile/lib/db/log-set.ts — startSession/addSessionExercise/logSet each accept an optional second db: WriteDb parameter defaulting to getPowerSync(), closing WINDOWS.md #23"
  - "A real, passing, browser-driven durability assertion: a set logged through logSet into a real @powersync/web database survives closeTestPowerSync() + reopenTestPowerSync() with no finish/flush/disconnect/sync step in between"
  - "apps/mobile/playwright.config.ts + apps/mobile/e2e/durability.spec.ts — the first browser-driven test infrastructure in this repo, chromium-only, gated behind an explicit package-legitimacy checkpoint"
  - "apps/mobile/app/__durability.web.tsx / __durability.tsx — the harness route, proven absent from a production web bundle by a real build+grep (not asserted)"
  - "PLAT-02 and PLAT-07 traceability entries moved from Gaps Found to Complete for the durability-primitive slice this plan proves (see Known Stubs for the explicit scope boundary)"
affects: [02-12]

actuals:
  tokens: 6300
  tasks: 3
  commits: 5

tech-stack:
  added:
    - "@playwright/test@1.62.1 (apps/mobile devDependency, chromium project only) — approved via a blocking-human package-legitimacy gate, evidence in 02-09-TASK1-PACKAGE-GATE.md"
  patterns:
    - "Database-injection seam via a second, optional, default-valued parameter (db: WriteDb = getPowerSync()) rather than a mutable module-level override — production call sites passing nothing are unaffected, and JS default-parameter semantics evaluate the getPowerSync() call lazily per call"
    - "Metro build-time env-var elimination for test-only surfaces: a bare exported string constant survives in a production bundle even when nothing calls it, because the exporting module is still reachable through other unconditional imports — the constant itself must be computed as a literal-boolean ternary on the same process.env comparison so the minifier folds away the unreachable branch's literal. Proven by an actual build + grep, not assumed."
    - "Cross-CDP-boundary object-identity proof: Playwright's page.evaluate serializes return values, so object reference equality cannot be checked from the Node-side test. The comparison must happen inside the browser realm itself (the harness's reopen() method compares against a captured prior reference and returns a boolean)."

key-files:
  created:
    - .planning/phases/02-data-model-sync-engine/02-09-TASK1-PACKAGE-GATE.md
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/app/__durability.tsx
    - apps/mobile/playwright.config.ts
    - apps/mobile/e2e/durability.spec.ts
  modified:
    - apps/mobile/lib/db/powersync.ts
    - apps/mobile/lib/db/powersync.web.ts
    - apps/mobile/lib/db/log-set.ts
    - apps/mobile/lib/db/__tests__/log-set.test.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/package.json
    - apps/mobile/jest.config.js
    - .gitignore
    - pnpm-lock.yaml
    - .planning/WINDOWS.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "DURABILITY_HARNESS_GLOBAL's string value is a ternary on the literal env comparison, not a bare exported string constant — an actual build+grep proved the bare-literal version leaks into a production bundle regardless of the flag, because test-support.ts is unconditionally imported by __durability.web.tsx for its other real exports (openTestPowerSync etc.). This was discovered empirically, not anticipated from the plan text alone."
  - "reopen()'s distinct-instance proof is computed inside the browser page, not the Playwright Node process — page.evaluate cannot carry JS object identity back across the CDP boundary, so the harness captures the pre-close reference and compares it against the freshly reopened one, returning a plain boolean the spec can assert on."
  - "jest.config.js gets a testPathIgnorePatterns entry for e2e/ (Rule 3, out of this plan's declared files_modified) — Playwright's own runner refuses to execute inside a Jest process, and without the exclusion `pnpm --filter mobile test` fails outright the moment e2e/durability.spec.ts exists. Same precedent 02-05 already established for this exact file."
  - ".gitignore gets two new entries for apps/mobile/test-results/ and playwright-report/ (Rule 3, out of scope) — Playwright's generated run output, analogous to the existing apps/mobile/public/ entry for PowerSync's postinstall assets."

requirements-completed: [PLAT-02, PLAT-07]

coverage:
  - id: D1
    description: "A real @powersync/web database, constructed in a real browser page, accepts a write from the real logSet helper and returns that row on a subsequent read — no mock anywhere on the assertion path"
    requirement: "PLAT-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/durability.spec.ts#a set logged through logSet survives a close and reopen with no finish or sync step"
        status: pass
    human_judgment: false
  - id: D2
    description: "A set written by logSet is readable after closeTestPowerSync() followed by reopenTestPowerSync(), with no finish, flush, disconnect, waitForFirstSync or connect call in between"
    requirement: "PLAT-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/durability.spec.ts (same test; grep -nE for finish/flush/disconnect/waitForFirstSync/connect between logSet and close returns no match)"
        status: pass
    human_judgment: false
  - id: D3
    description: "startSession, addSessionExercise and logSet each accept a caller-supplied database and write to it, while every existing production call site that passes nothing still resolves getPowerSync() exactly as before"
    requirement: "PLAT-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#the database-injection seam (WINDOWS #23) — 3 new cases"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/durability.spec.ts (harness routes real writes through the injected db)"
        status: pass
    human_judgment: false
  - id: D4
    description: "reopenTestPowerSync returns a different JavaScript object than the instance closeTestPowerSync closed, reading the same underlying store"
    requirement: "PLAT-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/durability.spec.ts#reopenedIsDistinctInstance assertion"
        status: pass
    human_judgment: false
  - id: D5
    description: "A web export built without EXPO_PUBLIC_DURABILITY_HARNESS contains no harness global, so the durability entry point is unreachable in a production bundle; the same build with the flag set does contain it"
    requirement: "PLAT-02"
    verification:
      - kind: other
        ref: "pnpm --filter mobile exec expo export --platform web --clear (flag unset): grep -ro __fitnessDurability apps/mobile/dist -> 0 matches. Same build with EXPO_PUBLIC_DURABILITY_HARNESS=1: 1 match, inside the entry bundle's window-attach code."
        status: pass
    human_judgment: false
  - id: D6
    description: "Backstop truth carried from 02-05: a set whose write had not committed when the process died is absent entirely, and one that had committed is present with every field populated — there is no half-written row"
    verification: []
    human_judgment: true
    rationale: "This plan proves a graceful close (closeTestPowerSync's own close(), no disconnect/flush/finish) survives a reopen — not a hard process kill mid-write. The mid-commit case remains untestable by any automated means available in this environment and stays a backstop truth pending real device/browser-crash UAT, exactly as 02-05 left it."

duration: ~45min
completed: 2026-08-17
status: complete
---

# Phase 2 Plan 9: Browser-Driven Durability Tracer Summary

**Playwright/chromium proves a set logged through the real `logSet` helper into a real `@powersync/web` database survives a close and reopen with no finish or sync step — the durability vehicle plan 02-05 could not build under Jest/Node, now real, end to end, with the database-injection seam WINDOWS.md #23 named.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3/3 completed (Task 1 was a checkpoint already resolved by the human before this executor started; Tasks 2-3 executed here)
- **Files modified:** 15 (5 created, 10 modified)

## Accomplishments

- Closed WINDOWS.md #23: `startSession`, `addSessionExercise` and `logSet` each gained a second, optional `db: WriteDb = getPowerSync()` parameter — a default-parameter seam, not a mutable override — with production call sites (there are none yet outside `log-set.ts` and its test) unaffected by construction.
- Built the first browser-driven test infrastructure in this repository: `@playwright/test@1.62.1` (chromium project only), a harness route pair (`__durability.web.tsx` / `__durability.tsx`), and one real end-to-end durability assertion that a previous plan (02-05) spent six empirically-documented attempts trying and failing to construct under Jest/Node.
- Proved, with a real build and a real grep (not an assertion), that the harness global is absent from a production web bundle when `EXPO_PUBLIC_DURABILITY_HARNESS` is unset and present when it is set — and discovered mid-implementation that the naive version of this (a bare exported string constant) does NOT satisfy that property, because the module carrying it is unconditionally imported for other real reasons. Fixed by turning the constant into a literal-boolean ternary Terser can fold.
- Solved the "prove reopen() returns a different object" requirement despite Playwright's `page.evaluate` being unable to carry JS object identity across the CDP boundary — the comparison happens inside the browser page itself, returning a plain boolean.

## Task Commits

1. **Task 1: Package-legitimacy and adoption gate for @playwright/test** — already resolved (approved) by the human before this executor started; `e531830` (docs) preserves the verification record.
2. **Task 2: The database-injection seam WINDOWS #23 names** — `530adbc` (feat)
3. **Task 3: End-to-end — a set logged in a real browser survives a close and reopen** — `3e52431` (feat)

**WINDOWS ledger update:** `e416a36` (docs) — marks entry #23 fixed.

**Plan metadata:** *(this commit, docs)*

## Files Created/Modified

- `.planning/phases/02-data-model-sync-engine/02-09-TASK1-PACKAGE-GATE.md` - preserved verification record for the approved Task 1 gate
- `apps/mobile/lib/db/powersync.ts` / `powersync.web.ts` - export `WriteDb` type alias
- `apps/mobile/lib/db/log-set.ts` - three write helpers gain the `db: WriteDb = getPowerSync()` seam
- `apps/mobile/lib/db/__tests__/log-set.test.ts` - three new seam-proving cases
- `apps/mobile/lib/db/test-support.ts` - `DURABILITY_HARNESS_ENABLED`, `DURABILITY_HARNESS_GLOBAL`, `readLoggedSets`, `pendingCrudCount`
- `apps/mobile/app/__durability.web.tsx` - the harness route, real writes only, no mocks
- `apps/mobile/app/__durability.tsx` - native stub, no web-SDK imports
- `apps/mobile/playwright.config.ts` - chromium-only, non-parallel, webServer running the real Expo web dev server
- `apps/mobile/e2e/durability.spec.ts` - the one real durability assertion
- `apps/mobile/package.json` - `test:e2e` script, `@playwright/test` devDependency
- `apps/mobile/jest.config.js` - excludes `e2e/` from Jest (Rule 3, out of scope)
- `.gitignore` - ignores Playwright's generated run output (Rule 3, out of scope)
- `pnpm-lock.yaml` - `@playwright/test` and its transitive dependencies
- `.planning/WINDOWS.md` - entry #23 marked fixed
- `.planning/REQUIREMENTS.md` - PLAT-02, PLAT-07 marked complete (see Known Stubs for the exact scope this covers)

## Decisions Made

- **`DURABILITY_HARNESS_GLOBAL` computed as a ternary, not a bare literal** — see key-decisions above. Verified by an actual `expo export --platform web --clear` build plus `grep -ro __fitnessDurability dist` both before (1 match, unset — wrong) and after (0 matches, unset — correct) the fix, and again with the flag set (1 match, correct).
- **`reopen()`'s object-identity comparison happens in the browser, not in the Playwright test file** — `page.evaluate`'s return-value serialization cannot preserve JS reference identity, so the harness itself captures the pre-close database reference and compares it against the freshly reopened one.
- **No mutable override, no module-level setter** — the DB-injection seam is a plain optional parameter. This was a hard constraint from the plan (and from WINDOWS.md #23 itself): a mutable override would reintroduce cross-test bleed the whole point of this plan is to avoid.
- **PLAT-02 and PLAT-07 marked complete per the plan's own `requirements` frontmatter field**, but see Known Stubs below for the precise, narrower claim this plan actually proves versus the full breadth of each requirement's user-facing description.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `apps/mobile/jest.config.js` needed a `testPathIgnorePatterns` entry for `e2e/`**
- **Found during:** Task 3, first `pnpm --filter mobile test` run after `e2e/durability.spec.ts` existed
- **Issue:** Playwright's own test runner refuses to execute inside a Jest process (`Playwright Test needs to be invoked via 'pnpm exec playwright test' and excluded from Jest test runs`), so Jest's default file discovery picking up `e2e/*.spec.ts` broke the entire `pnpm --filter mobile test` run
- **Fix:** Added `testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/']` to `jest.config.js`
- **Files modified:** `apps/mobile/jest.config.js`
- **Verification:** `pnpm --filter mobile test` — 7 suites, 129 tests, all pass
- **Committed in:** `3e52431` (Task 3 commit)

**2. [Rule 3 - Blocking issue] `.gitignore` needed entries for Playwright's generated run output**
- **Found during:** Task 3, first `pnpm --filter mobile test:e2e` run
- **Issue:** `apps/mobile/test-results/` (Playwright's trace/screenshot output directory) appeared as untracked after the first e2e run
- **Fix:** Added `apps/mobile/test-results/` and `apps/mobile/playwright-report/` to `.gitignore`, following the existing `apps/mobile/public/` precedent for generated assets
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` shows no untracked generated files after a fresh `test:e2e` run
- **Committed in:** `3e52431` (Task 3 commit)

**3. [Rule 1 - Bug, caught before commit] `DURABILITY_HARNESS_GLOBAL` as a bare string constant leaked into a production bundle regardless of the flag**
- **Found during:** Task 3, running the two-sided production-bundle grep the acceptance criteria require
- **Issue:** The straightforward implementation (`export const DURABILITY_HARNESS_GLOBAL = '__fitnessDurability';`) is not itself gated by any conditional — it survives in the compiled bundle because `test-support.ts` is unconditionally imported by `__durability.web.tsx` for its other real (always-used) exports. A real build with the flag unset showed 1 match, not the required 0.
- **Fix:** Rewrote the constant as `process.env.EXPO_PUBLIC_DURABILITY_HARNESS === '1' ? '__fitnessDurability' : ''` — a literal-boolean ternary Terser folds at build time, eliminating the unreachable branch's string. Re-verified with fresh (`--clear`) builds both ways: 0 matches unset, 1 match set.
- **Files modified:** `apps/mobile/lib/db/test-support.ts`, `apps/mobile/package.json` (test:e2e now also sets `EXPO_PUBLIC_DURABILITY_HARNESS=1` for the Playwright Node process itself, so the spec's own import of the constant resolves to the same string the browser-side build used)
- **Verification:** Real builds, real greps, both directions — numbers recorded above and in this SUMMARY's D5 coverage entry
- **Committed in:** `3e52431` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking issues, 1 Rule 1 bug caught before it could ship)
**Impact on plan:** All three were necessary to get the plan's own acceptance criteria to genuinely pass — none represent scope creep. The Rule 1 catch (item 3) is the most consequential: without it, this plan would have shipped a security-relevant claim (`T-02-30`, "harness route unreachable in a production bundle") that a real build proved false on first attempt.

## Issues Encountered

- Metro's transform cache does not key on `process.env.EXPO_PUBLIC_*` values by default — running `pnpm --filter mobile build` twice back-to-back with only the env var changed reused the first build's cached output and showed identical (wrong) results both times. Resolved by passing `expo export --platform web --clear` for each side of the two-sided grep, which forces a fresh bundle per env-var value. This is worth remembering for any future plan that needs to verify env-var-gated build output.
- `page.evaluate`'s closure limitation (a helper function defined at the spec's module top level is not available inside the evaluated callback, only the callback's own source text is sent to the browser) caused an initial `ReferenceError: harnessOn is not defined` on the first e2e run. Fixed by inlining the window-lookup expression into every `page.evaluate` callback instead of sharing a helper.
- `apps/api/@fitness/api-contracts` needed a `pnpm --filter @fitness/api-contracts build` before `pnpm --filter mobile test` would resolve `@fitness/api-contracts` from a freshly-materialized worktree — a pre-existing build-output gap unrelated to this plan (identical to what 02-05's SUMMARY already noted for this exact worktree pattern), not fixed as part of this plan's scope beyond running the one build command needed to unblock local verification.

## User Setup Required

None — no external service configuration required. `@playwright/test`'s chromium binary installs to `~/Library/Caches/ms-playwright/` (outside the repo, never committed); a fresh clone needs `pnpm --filter mobile exec playwright install chromium` once before `pnpm --filter mobile test:e2e` will run.

## Known Stubs

- **PLAT-02 and PLAT-07 are marked complete for the durability-primitive slice this plan proves, not their full breadth.** What is proven: one set, logged through the real production write path, into a real browser-hosted PowerSync database, surviving a graceful close-and-reopen with no finish or sync step — this is the mechanism-level guarantee both requirements' user-facing descriptions ultimately rest on. What is NOT proven here and remains for later phases: PLAT-02's "complete workout start to finish" breadth (multiple exercises, multiple sets, an actual finish action, real UI) awaits Phase 5's set-logging UI; PLAT-07's "every logged set intact" breadth across a full multi-exercise session, and the harder "process killed mid-commit" case (this plan's D6 backstop truth), remain unverified and are explicitly out of this plan's declared scope. Roadmap success criterion 4 (client schema redefinition against a populated pre-migration database) is unaddressed by this plan by design — it is deferred to plan 02-12, which the objective text names explicitly as the plan that expands onto this one's proven vehicle.
- **WINDOWS.md #22 (Jest/Node cannot construct a real PowerSync database) stays open.** This plan did not fix the Jest/Node sandbox — it established a different vehicle (a real browser via Playwright) for the one claim (PLAT-07's durability) that needed a real database. Jest/Node is still, and will likely remain, unable to construct one.

## Next Phase Readiness

- The database-injection seam (`db: WriteDb = getPowerSync()`) is now available to any future test suite that needs to drive `startSession`/`addSessionExercise`/`logSet` against an isolated database — plan 02-12 (schema-redefinition durability, roadmap criterion 4) is the named next consumer.
- The Playwright/chromium vehicle and the harness route pattern (`app/__durability.web.tsx` / `.tsx`, gated behind a literal `process.env.EXPO_PUBLIC_*` comparison for both runtime reachability and build-time string elimination) are established and proven — 02-12 can extend `e2e/durability.spec.ts` or add sibling spec files rather than re-deriving the vehicle from scratch.
- `readLoggedSets` and `pendingCrudCount` are exported from `test-support.ts` but only `readLoggedSets` is exercised by this plan's spec; `pendingCrudCount` is wired into the harness global (`crudCount()`) but not yet asserted on by any spec — available for 02-12 if a crud-queue-depth assertion becomes relevant there.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All four commit hashes (`e531830`, `530adbc`, `3e52431`, `e416a36`) confirmed present in `git log --oneline`. All five created files (`02-09-TASK1-PACKAGE-GATE.md`, `__durability.web.tsx`, `__durability.tsx`, `playwright.config.ts`, `e2e/durability.spec.ts`) confirmed present via `git ls-files`. `pnpm --filter mobile test` (129/129 pass), `pnpm --filter mobile typecheck` (exit 0), and `pnpm --filter mobile test:e2e` (1 passed, 0 skipped) all re-confirmed green immediately before this SUMMARY was written.
