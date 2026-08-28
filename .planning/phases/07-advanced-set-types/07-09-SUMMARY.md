---
phase: 07-advanced-set-types
plan: 09
subsystem: testing
tags: [playwright, jest, nestjs-e2e, powersync, sync-boundary, security]

requires:
  - phase: 07-advanced-set-types
    provides: "07-05's addSubEntry/set-groups.ts, 07-07's superset rest-suppression and formSuperset/detachSuperset wiring, 07-08's per-side stamping and automatic right-child creation — the three grouped-set behaviors this plan proves end to end"
provides:
  - "apps/api/test/poison-pill.e2e-spec.ts: a new describe block pinning T-7-01 (cross-user parent_set_id grafting stays contained to the pushing user's own aggregate) and T-7-02 (a shared superset_group_id across two sessions never merges them on a session-scoped read), plus a five-set-type acceptance case proving sync.service.ts needs no change for this phase"
  - "apps/mobile/lib/db/test-support.ts: readLoggedSetsWithGrouping and seedSupersetPair, appended"
  - "apps/mobile/app/__durability.web.tsx: six new harness accessors (readLoggedSetsWithGrouping, seedSupersetPair, addSubEntry, removeSubEntry, formSuperset, detachSuperset), appended, each delegating to the real production function"
  - "apps/mobile/e2e/advanced-sets.spec.ts: the phase's end-to-end proof — a drop-set group surviving a real browser reload, a per-side pair counting as one set, and a superset suppressing then resuming rest across a detach — registered in playwright.config.ts's durability project"
  - ".planning/phases/07-advanced-set-types/07-VALIDATION.md: signed off against the plans as executed, nyquist_compliant: true"
affects: [08-progression-engine, 09-analytics, 10-records]

actuals:
  tokens: 10298
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "A durability spec that can trigger an auto-navigating pager (D-14's member-advance) does not assert the just-completed row's own post-click state — it asserts session-level effects (the header Rest bar, the strip's fractions) that are correct regardless of which exercise page the pager lands on afterward"

key-files:
  created:
    - apps/mobile/e2e/advanced-sets.spec.ts
  modified:
    - apps/api/test/poison-pill.e2e-spec.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
    - .planning/phases/07-advanced-set-types/07-VALIDATION.md

key-decisions:
  - "T-7-01's e2e case pins the server's ACTUAL current behavior rather than an assumed one: sync.service.ts's root resolution for a logged_set op walks only its own session_exercise_id, never parent_set_id, so a cross-user parent_set_id reference is accepted and applied — but entirely inside the pushing user's own aggregate, never touching the referenced user's row. The test asserts both halves: the op applies, and the referenced user's own logged_set row count is byte-unchanged."
  - "T-7-02's e2e case documents, in the test's own comment, that containment is client-side by construction (formSuperset scopes both writes by sessionId; every read predicate resolves membership from one session's already-loaded exercise list) since superset_group_id carries no server-side FK or ownership check — the test proves a session-scoped read (session_id AND superset_group_id) never sees the other session's member, not that the server itself enforces anything."
  - "seedSupersetPair (test-support.ts) delegates entirely to the existing seedProgrammedSession, then reads the two resulting session_exercise ids back via readSessionExercisesRaw ordered by order_index — seedProgrammedSession's own return shape never carries the client-generated session_exercise id addSessionExercise assigns internally, so a spec needing a deterministic adjacent pair to hand formSuperset must read it back rather than guess it."
  - "advanced-sets.spec.ts's superset case does not reuse completeFirstSet's own same-page 'Mark set incomplete' assertion for a non-final member's completion, because D-14's member-advance can auto-navigate the pager to the next member before that assertion resolves, moving the row it is looking for off-screen. A dedicated completeDraftAllowingMemberAdvance helper completes the draft and settles, and the caller asserts only session-level effects (the Rest bar) that hold regardless of which page is now showing."
  - "Copied the repository root's gitignored .env into this worktree (untracked, confirmed by `git status --short .env` staying empty) so DATABASE_URL and the other API e2e env vars a fresh worktree does not carry could reach apps/api's test:e2e script — required by the plan's own Task 1 precondition, and not a code change."

patterns-established: []

requirements-completed: [SETS-02, SETS-07, SETS-09]

coverage:
  - id: D1
    description: "A client cannot graft a logged_set child onto another user's set: a push whose parent_set_id names a logged_set in a different user's session is proven, by e2e case, to apply only within the pushing user's own aggregate — the referenced user's own row count is byte-unchanged"
    requirement: "SETS-02"
    verification:
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#T-7-01: a cross-user parent_set_id reference does not graft onto or mutate the referenced user's session tree"
        status: pass
    human_judgment: false
  - id: D2
    description: "A client cannot pair exercises across sessions: a push whose superset_group_id references a session_exercise in a different session is proven, by e2e case, never to make the two exercises behave as one group on a session-scoped read"
    requirement: "SETS-09"
    verification:
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#T-7-02: a superset_group_id shared across two sessions never merges the two exercises into one group on a session-scoped read"
        status: pass
    human_judgment: false
  - id: D3
    description: "sync.service.ts requires no change for this phase — all five newly-written set_type values, together with a non-null parent_set_id and a side, are accepted and read back intact"
    verification:
      - kind: e2e
        ref: "apps/api/test/poison-pill.e2e-spec.ts#accepts a logged_set PUT for each of the five newly-written set_type values with a non-null parent_set_id and a side"
        status: pass
    human_judgment: false
  - id: D4
    description: "A drop-set parent and its child survive a real browser close/reload against a real @powersync/web database, with the child's parent_set_id read back from the database, not asserted from rendered text alone"
    requirement: "SETS-02"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/advanced-sets.spec.ts#a drop-set group survives a real browser reload, with the child naming its parent in parent_set_id"
        status: pass
    human_judgment: false
  - id: D5
    description: "A per-side pair (Log Left/Right Separately) produces an automatic right-side child on completion and contributes exactly one to the exercise's own strip fraction, not two"
    requirement: "SETS-09"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/advanced-sets.spec.ts#a per-side pair counts as one set toward the exercise's own prescription"
        status: pass
    human_judgment: false
  - id: D6
    description: "A superset suppresses rest on the non-final member and starts it on the final one, end to end through the real UI; detaching resumes rest on the survivor's own next completion"
    requirement: "SETS-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/advanced-sets.spec.ts#a superset suppresses rest until the final member, and resumes it on the survivor after detach"
        status: pass
    human_judgment: false
  - id: D7
    description: "07-VALIDATION.md reflects the phase's real, just-run verification state rather than an intended one — every Wave 0 file exists, every Per-Task Verification Map row is filled from the plans as executed, and the sign-off flags are backed by a real full-suite run"
    verification:
      - kind: manual_procedural
        ref: "pnpm -w test (92/92 suites), pnpm --filter api test:e2e -- poison-pill (17/17), pnpm --filter mobile test:e2e:durability (51/51 on a clean run) — all re-run and observed green as part of this plan's own Task 3"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 9: The Phase's Security and Durability Evidence Summary

**Adds two new e2e cases to `poison-pill.e2e-spec.ts` pinning that a cross-user `parent_set_id` reference and a cross-session `superset_group_id` both stay contained (T-7-01, T-7-02), proves by test that `sync.service.ts` needs no change for the phase's five new set types, exposes the grouping seams on the durability harness append-only, and ships `advanced-sets.spec.ts` — a real-browser, real-database proof that a drop set survives a reload, a per-side pair counts as one set, and a superset suppresses then resumes rest across a detach.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-28T20:27:00Z (approx.)
- **Completed:** 2026-08-28T21:20:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- Closed 07-RESEARCH's Security Domain gap: `poison-pill.e2e-spec.ts` predates D-16's session-only superset design entirely, and this plan adds the two threat-pattern cases the research explicitly instructed rather than assumed covered — both run against a real Postgres via the built API artifact, both pass, and both pin the server's actual current behavior (accepted-but-contained, not rejected) rather than an assumed one.
- Proved, by exercising all five newly-written `set_type` values through the real `/sync` endpoint with a non-null `parent_set_id` and a `side`, that `sync.service.ts` requires zero code change for this phase — the concrete evidence CONTEXT.md asked for.
- Appended `readLoggedSetsWithGrouping`/`seedSupersetPair` to `test-support.ts` and six harness accessors to `__durability.web.tsx`, strictly append-only (confirmed by `git diff` containing no removed line), every accessor delegating to the real, unmodified production functions in `set-groups.ts` and `session-mutations.ts`.
- Shipped `apps/mobile/e2e/advanced-sets.spec.ts` and registered it in `playwright.config.ts`'s `durability` project `testMatch` list — three real-browser cases, one of which asserts directly on `parent_set_id` read back from the database rather than on rendered text alone.
- Ran the full durability suite three times: two runs surfaced one pre-existing, order-dependent flake in `reorder-exercises.spec.ts` (a file this plan never touches) that passed cleanly every time it was run in isolation; the third run was fully clean — **51/51 specs, exit 0** (48 pre-existing + this plan's 3 new cases).
- Signed off `07-VALIDATION.md` against the plans as actually executed — every Wave 0 file confirmed to exist, every Per-Task Verification Map row filled, `nyquist_compliant: true` and `wave_0_complete: true` set because every box on the page genuinely ticks.

## Task Commits

1. **Task 1: Prove the two sync-boundary threats are contained, and that sync.service.ts needs no change** - `318ee55` (test)
2. **Task 2: Expose the grouping seams on the durability harness, append-only** - `a4bc21e` (feat)
3. **Task 3: The end-to-end proof, and the signed-off validation contract** - `94d773e` (test), `62886d2` / `5630498` (docs — 07-VALIDATION.md sign-off), `13bbe97` (docs — WINDOWS.md ledger entry)

## Files Created/Modified

- `apps/api/test/poison-pill.e2e-spec.ts` - the new "Grouped-set boundary containment" describe block (T-7-01, T-7-02, five-set-type acceptance)
- `apps/mobile/lib/db/test-support.ts` - `readLoggedSetsWithGrouping`, `seedSupersetPair`, appended
- `apps/mobile/app/__durability.web.tsx` - six new harness accessors, appended
- `apps/mobile/playwright.config.ts` - `advanced-sets.spec.ts` added to the `durability` project's `testMatch`
- `apps/mobile/e2e/advanced-sets.spec.ts` (new) - the three end-to-end cases
- `.planning/phases/07-advanced-set-types/07-VALIDATION.md` - signed off against the plans as executed
- `.planning/WINDOWS.md` - one new `deviation` entry for the pre-existing `reorder-exercises.spec.ts` flake (not this plan's introduction)

## Decisions Made

- T-7-01/T-7-02 pin the server's actual current behavior rather than the behavior a reader might assume from the threat's name — `parent_set_id` and `superset_group_id` are both accepted by the server with no ownership/FK check, and containment is proven at the read boundary (byte-unchanged victim data; a session-scoped read never spans sessions) rather than at a rejection the server does not actually perform.
- `seedSupersetPair` reads the session_exercise ids back via the already-existing `readSessionExercisesRaw` rather than adding a new return field to `seedProgrammedSession` or `startWorkoutFromProgram` — keeps the delegation to real, unmodified production functions total, with no widened return shape on a function three other plans already depend on.
- The superset spec's non-final-member completion does not assert the same page's own "Mark set incomplete" state, since D-14's member-advance can navigate away before that assertion resolves — a dedicated helper (`completeDraftAllowingMemberAdvance`) is used there instead, asserting only session-level effects.
- Copied the repository root's `.env` into this worktree (confirmed untracked by git) so the API e2e precondition (a live Postgres via `DATABASE_URL`) could be satisfied — a fresh worktree carries no `.env` since it is gitignored at the root.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `SessionExerciseFields` needed a `superset_group_id` field for Task 1's T-7-02 case**
- **Found during:** Task 1's `pnpm --filter api test:e2e -- poison-pill` run (typecheck failure, zero tests ran)
- **Issue:** `poison-pill.e2e-spec.ts`'s existing `sessionExerciseOp` helper's `SessionExerciseFields` interface did not carry `superset_group_id`, so the new T-7-02 case's op builder calls failed to compile.
- **Fix:** Added `superset_group_id?: string | null` to the interface — the same additive-only shape every other field on that interface already follows.
- **Files modified:** `apps/api/test/poison-pill.e2e-spec.ts`
- **Committed in:** `318ee55` (Task 1 commit)

**2. [Rule 3 - Blocking] The superset e2e case's non-final-member completion could not assert its own page's post-click state**
- **Found during:** Task 3's first `pnpm --filter mobile test:e2e:durability -- advanced-sets` run
- **Issue:** `completeFirstSet`'s own `expect(getByRole('button', {name: 'Mark set incomplete'})).toBeVisible()` assertion failed for the superset case's first (non-final) member — D-14's member-advance had already navigated the pager to the final member by the time the assertion resolved, moving the just-completed row off-screen.
- **Fix:** Added a dedicated `completeDraftAllowingMemberAdvance` helper that completes the draft and settles, without asserting the tapped row's own post-click state; the test asserts session-level effects (the Rest bar's presence/absence) instead, which are correct regardless of which exercise page is showing afterward.
- **Files modified:** `apps/mobile/e2e/advanced-sets.spec.ts`
- **Committed in:** `94d773e` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking compile/test failures within this plan's own new test code, not the production code under test)
**Impact on plan:** No scope change. Both fixes are within this plan's own declared files and are corrections to the plan's own test authoring, not to any shipped feature.

## Issues Encountered

- A fresh worktree carries no `.env` (gitignored at the repository root), and `apps/api`'s `test:e2e` script needs `DATABASE_URL` to reach the live Postgres its own `db:push` step targets. Resolved by copying the root `.env` into this worktree (confirmed to remain untracked by git afterward) — not a code change, and the file was already present and gitignored in the parent repo.
- `pnpm run test:e2e:durability -- -g "<pattern>"` did not reliably apply the `-g` filter in this environment (both an npm-script-relayed invocation and a direct `npx playwright test -g` sometimes ran the full 51-test `testMatch` list regardless) — worked around by reading the full suite's output for the relevant spec's own pass/fail line rather than depending on the filter, and by one successful isolated `-g "reordering is idempotent"` run (via `npx playwright test` directly) that confirmed the flake's isolation-passes behavior.
- The full durability suite surfaced a pre-existing, order-dependent flake in `reorder-exercises.spec.ts`'s "reordering is idempotent" case on two of three full runs, always at the same position in the sequential run (immediately after the preceding drag test) and always passing cleanly when run alone. This plan does not touch `reorder-exercises.spec.ts`, `ExerciseStrip.tsx`'s reorder path, or `session-mutations.ts`'s swap/reorder functions — recorded in `.planning/WINDOWS.md` as a `deviation` entry rather than silently ignored, and the plan's own required clean run (`pnpm --filter mobile test:e2e:durability` exits 0) was independently achieved on the third run.

## User Setup Required

None - no external service configuration required. (The `.env` copy above is a worktree-local setup step, not an external service.)

## Next Phase Readiness

- Phase 7's grouped-set feature set (drop sets, myoreps, partials, supersets, per-side logging) now carries both its security evidence (the two named threats from 07-RESEARCH's Security Domain, closed by named e2e cases) and its durability evidence (a real browser run proving all three grouping mechanisms end to end).
- `07-VALIDATION.md` is signed off (`nyquist_compliant: true`, `wave_0_complete: true`) and ready for `/gsd-verify-work`'s consumption.
- The two Manual-Only Verifications rows (plain-set latency, grouped-set visual legibility) and every sibling plan's own `human_judgment: true` backstop truths remain open per `human_verify_mode: end-of-phase` — unchanged by this plan, deferred to the phase's own end-of-phase sweep as every prior plan in this phase already documented.
- The pre-existing `reorder-exercises.spec.ts` flake (WINDOWS.md, new entry) is a candidate for a future stabilization pass — likely a timing/state interaction with the immediately preceding drag test in the same sequential worker, not a defect in the reorder logic itself (the same case passes every time in isolation).

## Self-Check: PASSED

- FOUND: apps/mobile/e2e/advanced-sets.spec.ts
- FOUND: apps/api/test/poison-pill.e2e-spec.ts (T-7-01/T-7-02/five-set-type block)
- FOUND: apps/mobile/lib/db/test-support.ts (readLoggedSetsWithGrouping/seedSupersetPair)
- FOUND: apps/mobile/app/__durability.web.tsx (six new accessors)
- FOUND: apps/mobile/playwright.config.ts (advanced-sets.spec.ts in testMatch)
- FOUND: .planning/phases/07-advanced-set-types/07-VALIDATION.md (status: validated)
- FOUND commit 318ee55
- FOUND commit a4bc21e
- FOUND commit 94d773e
- FOUND commit 62886d2
- FOUND commit 5630498
- FOUND commit 13bbe97

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
