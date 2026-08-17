---
phase: 02-data-model-sync-engine
plan: 03
subsystem: sync-engine
tags: [postgres, drizzle-orm, nestjs, jest, conflict-resolution, tombstone]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-01: PowerSync tracer, the push wire contract, sync_seq/server_seq. 02-02: domain schema (sync_conflict_log/sync_tombstone tables), per-aggregate transactional apply in SyncService."
provides:
  - "resolveConflict — the per-entity merge rule (row-level LWW on server sequence, never a client timestamp), pure and unit-tested"
  - "recordConflict/recordTombstone/isTombstoned — the durable overwrite trace and delete trace, written inside the same transaction as the write they document"
  - "Every non-DELETE op routed through resolveConflict before it is written; every DELETE writes a tombstone and every PUT/PATCH checks one first"
  - "The automated two-device concurrent-edit proof (roadmap success criterion 2) and the delete/tombstone scenario family, both in concurrent-edit.e2e-spec.ts"
  - "apps/api's own unit test lane (jest.config.js, package.json test script), wired into turbo run test / pnpm ci"
affects: [02-04, 02-05, 02-06, 02-07, 02-08]

actuals:
  tokens: 6093
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "conflict-policy.ts is pure and Nest-free — no DB, no clock, comparable in a unit test with no server running"
    - "conflict-log.ts's QueryExecutor type (Pick<Database, 'select' | 'insert'>) lets recordConflict/recordTombstone/isTombstoned run identically inside a db.transaction callback or against the pool-backed db directly, since Database and its transaction handle are not supertypes of one another"
    - "Merge order for a child row (logged_set) resolves through its aggregate root's server_seq, captured once before the transaction touches anything and compared against a fresh nextval() at the moment of an overwrite — never a per-child server_seq column (02-02's decision holds)"
    - "A DELETE for an id already tombstoned by this user is short-circuited before aggregate root resolution, since its own row is gone and there is nothing left to chain a root through"

key-files:
  created:
    - apps/api/jest.config.js
    - apps/api/src/sync/conflict-policy.ts
    - apps/api/src/sync/conflict-log.ts
    - apps/api/src/sync/__tests__/conflict-policy.spec.ts
    - apps/api/test/concurrent-edit.e2e-spec.ts
  modified:
    - apps/api/package.json
    - apps/api/src/sync/sync.service.ts

key-decisions:
  - "Task 1 (auto, tdd): the merge rule only ever compares logged_set's weight_kg/reps/rir/set_index/completed, and only when the stored row is already completed — matches 02-RESEARCH.md Decision 2 exactly, immune to all three PITFALLS.md §1 warning signs (asserted via grep in the unit spec, not just argued)"
  - "Task 3 (auto, tdd): deliberately departs from 02-RESEARCH.md Decision 3 on one point — a hand-rolled sync_tombstone table is added even though PowerSync's own delete is itself a tombstone for the pull direction, because the resurrection race in 02-CONTEXT.md is a push-side race PowerSync never sees (device B's queued write racing device A's already-applied delete at our own push endpoint). Documented in code as the deliberate reasoning, not just in this SUMMARY."

patterns-established:
  - "Every op that targets an existing row is routed through resolveConflict before it is written, table-uniformly — insert/overwrite is decided identically whether or not the table logs (only logged_set does today)"
  - "A losing/winning snapshot for a logged_set conflict captures exactly the five compared fields (weight_kg/reps/rir/set_index/completed), not the whole row — the conflict log is a targeted trace of what the merge rule actually compares"

requirements-completed: [PLAT-04]

coverage:
  - id: D1
    description: "The merge rule (resolveConflict) exists as a pure, unit-covered function: insert on a missing row, overwrite-no-log on an in-progress set or a non-logged table, overwrite-with-log on a completed logged_set whose weight_kg/reps/rir/set_index/completed differs, no clock read from either side, weight_kg compared as an exact decimal string"
    requirement: "PLAT-04"
    verification:
      - kind: unit
        ref: "apps/api/src/sync/__tests__/conflict-policy.spec.ts — 10 cases, one per behaviour line"
        status: pass
    human_judgment: false
  - id: D2
    description: "The two-device concurrent-edit proof: two independent client batches pushed in a controlled order converge with no logged set lost (asserted by row count), the later push wins, and the sync_conflict_log row holds exactly what the earlier push had stored. Both push orders are covered, plus the replay, same-batch-duplicate, empty-batch and identical-values negative-space cases."
    requirement: "PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/concurrent-edit.e2e-spec.ts — 'Two-device concurrent edit (e2e)' describe block, 7 cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deletes stay deleted: a DELETE writes one tombstone (idempotently); a PUT/PATCH for a tombstoned id is rejected 'deleted' rather than resurrecting the row; deleting a workout_session tombstones and removes its whole aggregate in one transaction with no orphans; a cross-user delete is rejected not_owner; exercise/routine deletes are rejected invalid_field; a tombstone is scoped to one user"
    requirement: "PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/concurrent-edit.e2e-spec.ts — 'Deletes that stay deleted (e2e)' describe block, 8 cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "apps/api has a unit test lane (jest.config.js + package.json test script) that turbo run test / pnpm ci picks up, using the same jest-suite-integrity reporter as the e2e lane and a testRegex that never collides with .e2e-spec.ts"
    requirement: "PLAT-04"
    verification:
      - kind: other
        ref: "pnpm exec turbo run typecheck lint test build --filter=api --filter=@fitness/api-contracts — 6/6 tasks pass; apps/api/package.json test script present; jest.config.js reporters include scripts/jest-suite-integrity.cjs; testRegex '\\.spec\\.ts$' does not match .e2e-spec.ts (verified by grep and by the full e2e suite still passing separately)"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-08-17
status: complete
---

# Phase 2 Plan 3: Concurrent-Edit Conflict Resolution and Deletes Summary

**Row-level last-write-wins on server sequence for `logged_set`, with a durable `sync_conflict_log` trace on every real overwrite of a completed set, plus a `sync_tombstone` table that stops a stale offline write from resurrecting a deleted row — proven end to end by an automated two-device push test, not argued.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3/3 completed
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- Implemented `resolveConflict`, the pure per-entity merge rule from `02-RESEARCH.md` Decision 2: two different sets never collide (each is its own row); the same completed set overwritten with different values logs a recoverable trace; an in-progress set or any non-`logged_set` table overwrites silently. No clock participates anywhere in the decision — asserted structurally via a grep-based unit test, not just by code review.
- Added `apps/api`'s first unit test lane (`jest.config.js` + `package.json` `test` script), wired into `turbo run test`/`pnpm ci`, sharing the e2e lane's `jest-suite-integrity` reporter so a zero-test run can't report green.
- Wrote the automated two-device concurrent-edit proof the roadmap names as success criterion 2 — real HTTP pushes against a spawned build and live Postgres, both push orders, a replay, a same-batch duplicate, an empty batch, and two identical-valued rows under different parents. Every scenario asserts by row count that nothing was silently lost.
- Added deletes: a `DELETE` op writes a tombstone in the same transaction as the row removal; any `PUT`/`PATCH` against a tombstoned id is rejected `deleted` rather than resurrecting the row (closing the push-side resurrection race `02-CONTEXT.md` names, which is outside PowerSync's own delete-as-tombstone pull-side coverage — a deliberate, documented departure from `02-RESEARCH.md` Decision 3). Deleting a `workout_session` tombstones its whole aggregate before the FK cascade removes the rows.
- Found and fixed a real pre-existing bug in aggregate root resolution while implementing the DELETE-only-batch case (see Deviations).

## Task Commits

Each task was committed atomically:

1. **Task 1: The merge rule, and the trace an overwrite leaves behind** (tdd=true) — two commits:
   - `abaf397` (test — RED) — apps/api unit test lane + failing conflict-policy.spec.ts
   - `e40bd54` (feat — GREEN) — conflict-policy.ts, conflict-log.ts, sync.service.ts wiring
2. **Task 2: The two-device concurrent-edit proof** (tdd=true) — `71d6c59` (test) — concurrent-edit.e2e-spec.ts, no implementation changes (proves Task 1's already-built behavior)
3. **Task 3: Deletes that stay deleted** (tdd=true) — two commits:
   - `d1f4535` (test — RED) — delete/tombstone scenarios appended to concurrent-edit.e2e-spec.ts
   - `049e07f` (feat — GREEN) — tombstone writing, PUT/PATCH tombstone rejection, workout_session cascade tombstoning, exercise/routine hard-delete rejection, and the aggregate-root-resolution bug fix

**Plan metadata:** *(this commit, docs)*

## TDD Gate Compliance

Both gated tasks show RED before GREEN in git log: `abaf397` (test) precedes `e40bd54` (feat) for Task 1; `d1f4535` (test) precedes `049e07f` (feat) for Task 3. Task 2 is test-only by design (its `<files>` list carries no implementation file) — it proves behavior Task 1 already built, so a single `test(...)` commit is correct and no feat commit follows it.

## Files Created/Modified

- `apps/api/jest.config.js` - The unit test lane: ts-jest, `testRegex: '\.spec\.ts$'` scoped to `src/`, the same `jest-suite-integrity` reporter the e2e config uses
- `apps/api/package.json` - New `test` script (`jest --config jest.config.js`), picked up by `turbo run test` / `pnpm ci`
- `apps/api/src/sync/conflict-policy.ts` - `resolveConflict`, `ConflictDecision`, `CONFLICT_LOGGED_TABLES` (currently just `logged_set`) — pure, no Nest DI, no DB, no clock
- `apps/api/src/sync/conflict-log.ts` - `recordConflict`, `recordTombstone`, `isTombstoned`, and the shared `QueryExecutor` type they take
- `apps/api/src/sync/__tests__/conflict-policy.spec.ts` - 10 unit cases, one per Task 1 behaviour line
- `apps/api/test/concurrent-edit.e2e-spec.ts` - 15 e2e cases across two describe blocks (7 concurrent-edit, 8 delete/tombstone)
- `apps/api/src/sync/sync.service.ts` - Routes every non-DELETE op through `resolveConflict`; logs a conflict inside the same transaction as the overwrite; writes/checks tombstones on DELETE/PUT/PATCH; cascades tombstones for a deleted `workout_session`'s children; rejects `exercise`/`routine` deletes `invalid_field`; short-circuits an already-tombstoned DELETE before root resolution; fixes the aggregate-root-resolution ordering bug (see Deviations)

## Decisions Made

- **Only `logged_set` is in `CONFLICT_LOGGED_TABLES`** — `workout_session` and `user_preference` metadata get plain overwrite with no log, matching `PITFALLS.md` §1's explicit acceptance of that granularity for low-stakes fields.
- **Merge order for a `logged_set` conflict is read from the aggregate root's `server_seq`** (captured once before the transaction touches anything, compared against a fresh `nextval()` at the moment of overwrite) rather than adding a `server_seq` column to `logged_set` itself — `logged_set` deliberately carries no `server_seq` of its own per 02-02's "child rows resolve merge order through their aggregate root" decision, and this plan's `files_modified` scope excludes schema files.
- **The `sync_tombstone` table is added despite `02-RESEARCH.md` Decision 3 arguing PowerSync's own delete is itself the tombstone** — that argument covers the *pull* direction only; the resurrection case in `02-CONTEXT.md` is a *push*-side race (`SyncModule` never sees a queued write through PowerSync's own protocol). This is `02-RESEARCH.md`'s own flagged thinnest claim (assumption A2), and this plan's e2e suite is exactly the test it asked for.
- **A DELETE for an id already tombstoned by this user is short-circuited before aggregate root resolution** — its own row is gone by definition, so there is nothing in the batch or the database left to resolve a root through; treating it as vacuously applied (idempotent) is the only sound outcome.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Aggregate root resolution could never succeed for a DELETE-only batch (or any op omitting `session_exercise_id`)**
- **Found during:** Task 3, implementing the DELETE-only-batch case (a device deleting a set it isn't otherwise editing this push)
- **Issue:** `sessionExerciseIdsToCheck` (the set of `session_exercise` ids the batch queries to learn their `session_id`) was built only from `session_exercise` ops' own ids and from `logged_set` ops' client-supplied `session_exercise_id` in `data`. A `DELETE` op carries `data: null`, so it could supply no client-claimed parent — and since the existing row's *real* `session_exercise_id` (already known from the database) was never folded into that set either, the session-level lookup silently returned nothing, and the op was rejected `missing_parent` even though its parentage was fully knowable from the database.
- **Fix:** Reordered the two batched pre-queries so the existing `logged_set` rows are read first, and folded their real `session_exercise_id` values into `sessionExerciseIdsToCheck` before the `session_exercise` lookup runs — existing linkage now participates in root resolution the same way it already won over a client claim for ownership (T-02-03), not just for `session_exercise`-level resolution.
- **Files modified:** `apps/api/src/sync/sync.service.ts`
- **Verification:** `concurrent-edit.e2e-spec.ts`'s DELETE-only-batch cases (remove-and-tombstone, double-delete, cross-user delete) all exercise this path; full e2e suite (55 tests, 8 suites) still green.
- **Committed in:** `049e07f`

**2. [Rule 1 - Bug, self-introduced during this task] A `replace_all` edit broke the tombstone pre-pass filter loop**
- **Found during:** Task 3, immediately after wiring the already-tombstoned short-circuit
- **Issue:** A blind `replace_all` intended to rename later loop variables from `workable` to `remaining` also rewrote the loop that *populates* `remaining` itself, turning `for (const op of workable)` into `for (const op of remaining)` — iterating the (empty) output array to fill itself, so `remaining` stayed permanently empty and every push silently returned `applied: [], rejected: []` regardless of content.
- **Fix:** Corrected the populating loop back to iterate `workable`.
- **Files modified:** `apps/api/src/sync/sync.service.ts`
- **Verification:** Caught immediately by the full e2e suite going from 15 failures to 15 passes on the next run; re-verified with a second clean run.
- **Committed in:** `049e07f` (never reached a separate commit — caught and fixed before this task's GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs)
**Impact on plan:** #1 is a genuine correctness fix required for Task 3's own acceptance criteria (a DELETE-only push is exactly the realistic shape PowerSync's crud queue produces for "delete a set I'm not otherwise editing"). #2 was a bug introduced and caught entirely within this session's own tool use, not a plan or architecture issue — recorded for the audit trail's sake.

## Known Stubs

None introduced by this plan. `apps/api/lib/db/id.ts`'s non-cryptographic UUID generator (02-02's Deviation #3) remains an open item tracked in `.planning/WINDOWS.md`, unrelated to this plan's scope.

## Issues Encountered

- **No `.env` existed in this worktree** (gitignored, not carried by git). Created from `.env.example` with a freshly generated `BETTER_AUTH_SECRET`, matching the committed schema already present in the shared `fitness` Postgres database from prior plans in this worktree. Not a deviation — routine per-worktree setup, `.env` is never committed.
- **A `drizzle-kit push` / `dotenv` CLI banner line printed an unusual promotional-looking tip** (varying text across invocations, e.g. referencing an external URL) as console noise during `db:push` and dotenv's own config-loading log line. Not part of any task's output, not actionable, and not visited — flagged here only for the audit trail since it looked atypical for a routine CLI tool tip.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `resolveConflict`/`recordConflict`/`recordTombstone`/`isTombstoned` are the template later plans extend when wiring the remaining `SYNCED_TABLES` entries (`routine`/`routine_day`/`routine_exercise` etc.) that 02-02 left wire-contract-only — each is itself an aggregate shaped like `workout_session`/`session_exercise`/`logged_set`, and the same "child resolves merge order through its aggregate root" pattern applies.
- The aggregate-root-resolution fix (Deviation #1) benefits every future op type that can omit its parent id from `data` (any DELETE, and in principle a minimal PATCH) — not just `logged_set`.
- No blockers. PLAT-04 and roadmap success criterion 2 are both proven, not just implemented.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All 6 created files confirmed tracked via `git ls-files`; all 5 task commit hashes
(`abaf397`, `e40bd54`, `71d6c59`, `d1f4535`, `049e07f`) confirmed present in `git log`.
