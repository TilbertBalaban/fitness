---
phase: 04-program-builder
plan: 09
subsystem: data
tags: [powersync, drizzle, sqlite, postgres, session-snapshot, cycle-overrides, prog-11]

# Dependency graph
requires:
  - phase: 04-program-builder (04-07)
    provides: resolveTarget/EMPTY_TARGET/ResolvedTarget in packages/api-contracts/src/program.ts and the routine_exercise_cycle_target table on both Postgres and mobile SQLite — this plan is the resolver's third and last consumer
  - phase: 04-program-builder (04-03)
    provides: setExerciseTargets, the base-prescription write path the client regression drives as "an edit to the base"
  - phase: 04-program-builder (04-02)
    provides: removeExercise/removeDay, the delete paths the client regression drives, and the day -> exercise cascade the in-memory store mirrors
provides:
  - addSessionExercise now accepts an optional cycleId and freezes the CYCLE-RESOLVED prescription (base resolved against that cycle's override through resolveTarget) rather than the base alone — in at most two selects
  - resolvePrescriptionForCycle, a private helper in log-set.ts that is the only place a session's frozen targets are computed
  - A PROG-11 regression suite on the client (7 cases) driving the shipped write helpers against one shared in-memory store, with a post-snapshot select-count tripwire on routine_exercise and routine_exercise_cycle_target
  - A PROG-11 regression block in Postgres (6 e2e cases) proving no program edit — including a routine_day DELETE — destroys or mutates a logged session's snapshot
affects: [04-10-session-position, phase-5-logging, phase-8-progression-engine]

# Actuals (#2632)
actuals:
  tokens: 27027
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A write helper that must freeze a resolved value imports the shared resolver and calls it once at the write boundary — it never reimplements `override ?? base`, and it never re-derives the value on a later read. The frozen columns are the only source of truth afterwards."
    - "A jest fake database can be a small in-memory store rather than a per-call stub when several shipped helpers must run against ONE shared state in a single test: a Map per drizzle table, plus a walker over drizzle's eq()/and() query chunks so the store filters on the real conditions the helpers pass. A dedicated 'resolves each helper against the row it names, never a sibling' case guards the store itself against matching every row and making the suite vacuous."
    - "Regression suites for an absence (a deliberately missing foreign key) assert the absence at BOTH levels: a grep-style check that the schema still declares plain text columns, and a live e2e case performing the delete that a foreign key would have turned into a cascade or a constraint violation."

key-files:
  created: []
  modified:
    - apps/mobile/lib/db/log-set.ts
    - apps/mobile/lib/db/__tests__/log-set.test.ts
    - apps/api/test/program-sync.e2e-spec.ts
    - docs/program-vocabularies.md

key-decisions:
  - "The plan's `must_haves.truths` say 'six frozen target_* columns' and 'six nulls'. That text is stale: the user overrode D-25 during this phase (amendment block in 04-CONTEXT.md, contract in 04-UI-SPEC.md § Exercise Slot Row) collapsing target_rir_min/target_rir_max into a single target_rir. The live schema on both apps/api/src/db/schema/session.ts and apps/mobile/lib/db/schema.ts carries exactly FIVE target_* columns, and packages/api-contracts/src/program.ts's ResolvedTarget declares five. This plan implements and asserts FIVE throughout. No sixth column was added and no RIR range was reintroduced."
  - "cycleId is `cycleId?: string | null` on AddSessionExerciseInput and is PASSED IN, never derived. Deriving the session's cycle here would mean reading the routine's cycle list and the user's session history from a write helper, which would make log-set.ts a query-shape owner and would duplicate the position arithmetic 04-10 owns. Every existing caller is unaffected because the field is optional."
  - "The local `Prescription` interface and `EMPTY_PRESCRIPTION` constant in log-set.ts were re-pointed at the contract's own types (`type Prescription = ResolvedTarget`, `const EMPTY_PRESCRIPTION: Prescription = EMPTY_TARGET`) rather than left as a parallel hand-written five-field shape. Same reasoning as the resolver itself: a second definition of the target tuple at this call site is how the snapshot starts disagreeing with the builder. The exported names and the insert shape are unchanged."
  - "Task 2's `<behavior>` asks the override-edit and override-clear cases to drive `setCycleTarget`/`clearCycleTarget` from `apps/mobile/lib/db/programs/cycles.ts` (04-08). That file does not exist at this plan's base commit — 04-08 is being executed in parallel and owns it, so importing it was impossible and creating it would have collided. Those two cases instead perform the same writes (an UPDATE and a DELETE on routine_exercise_cycle_target, filtered on the unique routine_exercise_id/cycle_id pair) directly through the shared store — identical effect on the data the assertion is about. The same substitution applies to the routine rename + archive case, for which no mobile write helper exists yet. All four other cases drive the real shipped helpers (setExerciseTargets, removeExercise, removeDay)."

patterns-established:
  - "Snapshot-on-use is now an asserted regression on both sides of the sync boundary rather than an architectural claim: the client suite proves the app never re-derives a frozen prescription, the e2e suite proves Postgres never destroys one. Any future plan touching either half should extend these two blocks rather than starting a third."

requirements-completed: [PROG-11]

coverage:
  - id: D1
    description: "A session exercise freezes the prescription resolved for its cycle — base resolved against that cycle's override through the one shared resolveTarget — in at most two selects, with the no-routine, no-cycle, no-override, override, explicit-null-inherit and missing-base paths all asserted"
    requirement: "PROG-11"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#addSessionExercise — the snapshot resolves the cycle, not just the base (PROG-11) — 8 cases"
        status: pass
      - kind: other
        ref: "grep -rl 'export function resolveTarget' packages apps | wc -l -> 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Six kinds of program edit — base rewrite, cycle-override edit, override removal, exercise delete, day delete, routine rename+archive — each leave a logged session's five frozen target_* values byte-identical on the client, and nothing in log-set.ts reads routine_exercise or routine_exercise_cycle_target after the snapshot"
    requirement: "PROG-11"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#PROG-11 — editing a program never changes a logged session — 7 cases (6 edit scenarios plus a store-fidelity guard), each ending in the post-snapshot select-count tripwire"
        status: pass
    human_judgment: false
  - id: D3
    description: "The same six edits leave the snapshot untouched in Postgres, read back through the pg client; the routine_day DELETE case additionally proves workout_session survives with its now-dangling routine_day_id, which is the scenario a real foreign key would turn into a cascade or a constraint violation"
    requirement: "PROG-11"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#PROG-11 — editing a program never corrupts a workout already logged against it (e2e) — 6 cases"
        status: pass
      - kind: other
        ref: "grep -c 'references(() => routineExercise.id)' apps/api/src/db/schema/session.ts -> 0; same for routineDay.id -> 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "No routine versioning, revision tree or copy-on-edit scheme was introduced — snapshot-on-use remains the single mechanism, and docs/program-vocabularies.md now records what is frozen, where, when, and which two columns deliberately carry no foreign key"
    requirement: "PROG-11"
    verification:
      - kind: other
        ref: "docs/program-vocabularies.md § Snapshot on use (PROG-11); the full plan diff touches four files and adds no schema, table or migration"
        status: pass
    human_judgment: false

duration: ~35min (approx.)
completed: 2026-08-21
status: complete
---

# Phase 4 Plan 09: Cycle-Resolved Session Snapshot Summary

**`addSessionExercise` now freezes the prescription the user actually saw — base resolved against the session's cycle override through the one shared `resolveTarget` — and "editing a program never corrupts a logged workout" is an asserted regression on the client and in Postgres rather than an architectural claim.**

## Performance

- **Duration:** ~35 min (approx.)
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `apps/mobile/lib/db/log-set.ts` gains `cycleId?: string | null` on `AddSessionExerciseInput` and a private `resolvePrescriptionForCycle` that selects the base row, selects that cycle's `routine_exercise_cycle_target` row (filtered on the unique `routine_exercise_id`/`cycle_id` pair, so at most one), and returns `resolveTarget(base ?? EMPTY_TARGET, override ?? null)`. Two selects, never five — asserted by a select-count ceiling case that runs every input shape.
- `resolveTarget` is **imported, not reimplemented** — `grep -rl 'export function resolveTarget' packages apps | wc -l` is still exactly `1`. The explicit-null-override case (`null` means inherit the base, never clear) is asserted at this call site specifically, because getting it backwards here is permanent in a user's history.
- The local `Prescription`/`EMPTY_PRESCRIPTION` shapes now alias the contract's `ResolvedTarget`/`EMPTY_TARGET` rather than restating the five-field tuple by hand.
- A missing base row (a routine exercise deleted between session start and this call) resolves against `EMPTY_TARGET` rather than throwing, and an override on a missing base still resolves — both asserted (T-04-47).
- `apps/mobile/lib/db/__tests__/log-set.test.ts` grows from 6 to 23 cases: 8 snapshot-resolution cases, 2 database-injection-seam cases for `addSessionExercise` (it had none), and a 7-case `PROG-11` block driving the shipped helpers against one shared in-memory store.
- The in-memory store walks drizzle's `eq()`/`and()` query chunks so it filters on the real conditions the shipped helpers pass, and mirrors the local schema's `routine_day -> routine_exercise -> routine_exercise_cycle_target` delete cascade. A dedicated "resolves each helper against the row it names, never a sibling" case guards the store against matching every row and making the whole suite vacuous.
- The post-snapshot tripwire — reset the select counters after `addSessionExercise` returns, run the edits, assert zero selects against `routine_exercise` and `routine_exercise_cycle_target` — is present in every one of the six edit cases. That is the assertion that fails if a future change makes a logged prescription re-derivable from the routine (T-04-44).
- `apps/api/test/program-sync.e2e-spec.ts` gains a 6-case `PROG-11` block (appended; 04-07's 13-case block and the file's helpers were left structurally untouched). Every survival assertion reads `session_exercise` back through the `pg` client, never a push response body.
- The `routine_day` DELETE case is the load-bearing one and says so in its own comment: the day is deleted, its `routine_exercise` cascades away, and both the `session_exercise` row (with its five values and its now-dangling `routine_exercise_id`) and the `workout_session` row (with its now-dangling `routine_day_id`) survive — the exact scenario a real foreign key on either column would have turned into a cascade that destroys history or a constraint violation that blocks a legitimate edit (T-04-46).
- `docs/program-vocabularies.md` gains a `Snapshot on use (PROG-11)` section recording what is frozen, where, when, and a table naming both deliberately foreign-key-free columns with the cost of "fixing" either one.

## Task Commits

1. **Task 1: The session snapshot resolves the cycle's targets, not just the base** — `a1d5a56` (feat)
2. **Task 2: The client-side regression — editing a program never changes a logged session** — `0eb20d4` (test)
3. **Task 3: The same regression at the Postgres level** — `0d8fce4` (test)

_Both TDD tasks were driven RED first (Task 1's RED run: 3 failing / 13 passing) and committed once green, matching this repo's established one-commit-per-task history (04-01/04-02/04-04/04-06/04-07)._

## Files Created/Modified

- `apps/mobile/lib/db/log-set.ts` — `AddSessionExerciseInput.cycleId`, `resolvePrescriptionForCycle`, `Prescription`/`EMPTY_PRESCRIPTION` re-pointed at the contract types, `resolveTarget`/`EMPTY_TARGET` imported from `@fitness/api-contracts`
- `apps/mobile/lib/db/__tests__/log-set.test.ts` — `fakeSnapshotDb`, the `PROG-11` in-memory store (`inMemoryDb`, `seedProgramAndSnapshot`, the drizzle condition walker), 17 new cases
- `apps/api/test/program-sync.e2e-spec.ts` — `sessionExerciseOp`, `sessionExerciseRow`, `workoutSessionRoutineDayId`, `seedSnapshotScenario`, and the 6-case `PROG-11` describe block
- `docs/program-vocabularies.md` — new `Snapshot on use (PROG-11)` section

## Verification Results

Actual runner output, not paraphrased:

| Command | Result | Baseline |
|---|---|---|
| `pnpm --filter mobile test` | `Test Suites: 35 passed, 35 total` / `Tests: 512 passed, 512 total` | 495 / 35 |
| `pnpm --filter mobile test -- log-set` | `Test Suites: 1 passed, 1 total` / `Tests: 23 passed, 23 total` | 6 cases |
| `pnpm --filter mobile typecheck` | `tsc --noEmit` — exit 0, no output | 0 errors |
| `pnpm --filter api test:e2e` | `Test Suites: 19 passed, 19 total` / `Tests: 207 passed, 207 total` | 201 / 19 |
| `pnpm --filter api test:e2e -- program-sync` | `Test Suites: 1 passed, 1 total` / `Tests: 62 passed, 62 total` | 56 / 1 |
| `pnpm --filter api test:e2e -- sync-push` | `Test Suites: 1 passed, 1 total` / `Tests: 7 passed, 7 total` | 7 / 1 |
| `pnpm --filter api typecheck` | `tsc --noEmit` — exit 0, no output | 0 errors |
| `pnpm --filter api test` | `Test Suites: 3 passed, 3 total` / `Tests: 50 passed, 50 total` | 50 / 3 |
| `pnpm --filter @fitness/api-contracts test` | `Test Suites: 4 passed, 4 total` / `Tests: 92 passed, 92 total` | 92 / 4 |
| `grep -rl 'export function resolveTarget' packages apps \| wc -l` | `1` | 1 |
| `grep -c 'references(() => routineExercise.id)' apps/api/src/db/schema/session.ts` | `0` | 0 |
| `grep -c 'references(() => routineDay.id)' apps/api/src/db/schema/session.ts` | `0` | 0 |

Net additions: mobile +17 tests, api e2e +6 tests. No pre-existing test was modified or removed.

## Decisions Made

- Five target columns, not six — the plan's own truths text is stale relative to the user's D-25 override (see key-decisions)
- `cycleId` is passed in, never derived here (see key-decisions)
- `Prescription`/`EMPTY_PRESCRIPTION` alias the contract types instead of restating them (see key-decisions)
- The two override-edit cases and the routine-archive case write through the shared store rather than through helpers that do not exist at this base commit (see key-decisions and Deviations #1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's `<behavior>` names `setCycleTarget`/`clearCycleTarget` from `apps/mobile/lib/db/programs/cycles.ts`, which does not exist at this plan's base commit**
- **Found during:** Task 2, at the `<read_first>` step
- **Issue:** `cycles.ts` is 04-08's artifact and 04-08 was executing in parallel in a separate worktree. Importing it was impossible (the file is absent), and creating it would have collided with the plan that owns it. The same gap applies to the routine rename + archive case: no mobile write helper sets `routine.archived_at` yet.
- **Fix:** Those three cases perform the identical writes directly through the shared in-memory store — an `UPDATE`/`DELETE` on `routine_exercise_cycle_target` filtered on the unique `(routine_exercise_id, cycle_id)` pair, and an `UPDATE` on `routine`. The data reaching the store is what `setCycleTarget`/`clearCycleTarget` would produce, and the assertion under test (the `session_exercise` row is untouched) is unaffected by which helper wrote it. The other four cases drive the real shipped helpers.
- **Files modified:** `apps/mobile/lib/db/__tests__/log-set.test.ts`
- **Verification:** `pnpm --filter mobile test -- log-set` — 23/23 passed
- **Committed in:** `0eb20d4`

**2. [Rule 2 - Missing critical functionality] The in-memory store could have made the whole PROG-11 suite pass vacuously**
- **Found during:** Task 2, immediately after the suite first went green
- **Issue:** A fake whose `where` matched every row would still pass all six edit cases (the `session_exercise` row is in a different table and would never be touched), while silently proving nothing about the helpers actually resolving the rows they name. A green suite that cannot fail is worse than no suite.
- **Fix:** Added a `resolves each helper against the row it names, never a sibling` case that seeds a second `routine_exercise`, edits and deletes only the sibling, and asserts the snapshotted row's targets and the surviving row set. It fails immediately if the condition walker degrades to match-everything.
- **Files modified:** `apps/mobile/lib/db/__tests__/log-set.test.ts`
- **Verification:** `pnpm --filter mobile test -- log-set` — 23/23 passed
- **Committed in:** `0eb20d4`

**3. [Rule 2 - Missing critical functionality] `addSessionExercise` had no database-injection-seam coverage**
- **Found during:** Task 1 (the plan's `<behavior>` refers to "both existing assertions" for `addSessionExercise`; only `logSet` and `startSession` had them)
- **Issue:** `addSessionExercise` now resolves `getPowerSync()` as a default argument and passes that database down into a second helper. Nothing asserted it never resolves `getPowerSync` when a database is passed explicitly, nor that it resolves it exactly once when one is not — the same WINDOWS #23 seam the two sibling functions already guard.
- **Fix:** Added both cases, including the exactly-once count (a naive implementation calling `getPowerSync()` per select would open two connections).
- **Files modified:** `apps/mobile/lib/db/__tests__/log-set.test.ts`
- **Verification:** `pnpm --filter mobile test -- log-set` — 23/23 passed
- **Committed in:** `a1d5a56`

---

**Total deviations:** 3 auto-fixed (1 blocking — a dependency file owned by a parallel plan; 2 missing-functionality — a test-fidelity guard and an untested injection seam on the function this plan changes)
**Impact on plan:** No scope creep. All four files modified are exactly the four in `files_modified`; no file owned by 04-08 was read into the change set or edited.

## Issues Encountered

- **No `node_modules` and no `.env` in this worktree** (inherited standing condition from every prior Phase 4 plan). Ran `pnpm install --frozen-lockfile`, built `@fitness/api-contracts` (the mobile suite cannot resolve the workspace package without its `dist/`), and copied the existing dev `.env` from the main checkout. The `.env` remains untracked and was not committed.
- **The plan's `must_haves.truths` say "six" where the schema says five.** Resolved by reading the live schema and the D-25 amendment rather than reconciling the count by inventing a field — see key-decisions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **04-10 owes the caller side.** `addSessionExercise` now accepts `cycleId`, but nothing in the app passes it yet — no UI calls this helper at all today. Whichever plan starts a session from a routine day must resolve the session's current cycle (position arithmetic 04-10 owns) and pass it in. Until then every snapshot resolves as `cycleId: undefined`, which is the pre-existing base-only behaviour, unchanged and still asserted.
- **`resolveTarget` now has all three of its intended consumers.** Keep the single-file grep at `1`.
- **The two regression blocks are the extension points.** A future change to the snapshot belongs in `log-set.test.ts`'s `PROG-11` describe and `program-sync.e2e-spec.ts`'s `PROG-11` describe, not in a third suite.
- **The flagged assumption A-PROG-11 stands unresolved and unaddressed by this plan:** after a day is deleted, `workout_session.routine_day_id` is a dangling id and the session cannot say which day of which program it belonged to *by name*. The session's own numbers are intact, which is what success criterion 4 names. If a Phase 9/10 history surface needs "Push day, week 3" for a deleted day, that gap is where to start.
- **`.planning/REQUIREMENTS.md` was deliberately NOT edited.** PROG-11 is complete and is recorded here in `requirements-completed`, but marking it in the shared file was left to the orchestrator to avoid a parallel-edit conflict with 04-08's executor, same reasoning as the WINDOWS ledger deferral below.

---
*Phase: 04-program-builder*
*Completed: 2026-08-21*

## Self-Check: PASSED

All four modified files and this SUMMARY verified present on disk with the expected content (`AddSessionExerciseInput.cycleId` and `resolvePrescriptionForCycle` in `log-set.ts`, the `PROG-11` describe blocks in both test files, the `Snapshot on use (PROG-11)` section in `docs/program-vocabularies.md`). All three task commits verified present in `git log`: `a1d5a56`, `0eb20d4`, `0d8fce4` — sitting directly on the expected base `889eb59`, on branch `worktree-agent-aebd7161e0c19c66f`. No commit in this plan deleted a tracked file (`git diff --diff-filter=D` empty for all three), and `git status --short` is clean with no untracked leftovers. Full plan `<verification>` block re-run at the end — every figure in the Verification Results table above is the runner's own summary line, pasted, not recalled.

## Deferred WINDOWS Entries

- **kind:** unrun-verify — **file:** `apps/mobile/lib/db/log-set.ts` — **description:** The cycle-resolved snapshot was never observed on a real device or in a browser. No UI calls `addSessionExercise` yet, this machine has neither Xcode nor an Android SDK, and browser/E2E-browser verification is forbidden by CLAUDE.md unless the user explicitly asks. Correctness rests on the 23-case jest suite (which drives the shipped helpers against an in-memory store, not real SQLite) plus `tsc --noEmit`. The api `test:e2e` suite that IS green here is a server-side Jest suite against live Postgres, not a browser run, and covers only the Postgres half.
- **kind:** unrun-verify — **file:** `apps/mobile/lib/db/__tests__/log-set.test.ts` — **description:** The PROG-11 client regression runs against a hand-built in-memory store, not against PowerSync's real local SQLite. The store mirrors the local schema's `routine_day -> routine_exercise -> routine_exercise_cycle_target` delete cascade by hand; if PowerSync's local schema ever stops cascading (or starts cascading differently from Postgres), the day-delete case would keep passing against a store that no longer matches reality. The Postgres half of the same claim IS asserted against a live database in `apps/api/test/program-sync.e2e-spec.ts`.
