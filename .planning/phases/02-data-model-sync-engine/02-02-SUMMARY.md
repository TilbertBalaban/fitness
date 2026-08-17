---
phase: 02-data-model-sync-engine
plan: 02
subsystem: database
tags: [drizzle-orm, postgres, sqlite, powersync, nestjs, offline-first]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-01: PowerSync adopted, the push wire contract, workout_session tracer end to end (SyncModule/Controller/Service, mobile db layer, connector)"
provides:
  - "The full domain schema — catalog, equipment, program, session, records, preference, sync — in Postgres, mirrored in local SQLite"
  - "session_exercise and logged_set on workout_session: the prescription snapshot (D-05), flat superset/drop-set annotation columns (D-06), weight_kg as numeric (D-04)"
  - "workout_session.timezone + local_date, captured once at write time (LOG-22)"
  - "Per-aggregate transactional apply in SyncService — a whole session (workout_session + its session_exercises + their logged_sets) lands atomically or not at all (PITFALLS §4)"
  - "schema-parity.e2e-spec.ts as a structural gate: the schema push is now a precondition of the e2e runner itself, not a step a run can skip and still report green"
  - "apps/mobile/lib/db/log-set.ts: startSession/addSessionExercise/logSet, the local write path a screen will call in a later phase"
affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08]

actuals:
  tokens: 19313
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Domain schema split into apps/api/src/db/schema/*.ts modules, each importing `user` from the barrel (../schema) inside lazy .references() callbacks — the same circular-but-safe pattern 02-01 established for workout_session"
    - "Child-of-aggregate tables (session_exercise, logged_set, routine_day, routine_exercise) carry no user_id/server_seq of their own — ownership and merge order resolve through their aggregate root, never duplicated onto every child row"
    - "Server-side aggregate resolution always prefers an existing row's actual DB linkage over a client-claimed parent id — only a genuinely new row trusts client-supplied session_id/session_exercise_id"
    - "test:e2e script folds `pnpm run db:push` in as a precondition, not a lifecycle hook — closes the gap where an e2e run could report green against an unmigrated database"

key-files:
  created:
    - apps/api/src/db/schema/catalog.ts
    - apps/api/src/db/schema/equipment.ts
    - apps/api/src/db/schema/program.ts
    - apps/api/src/db/schema/records.ts
    - apps/api/src/db/schema/preference.ts
    - apps/api/src/db/schema/sync.ts
    - apps/api/test/sync-aggregate.e2e-spec.ts
    - apps/mobile/lib/calendar-day.ts
    - apps/mobile/lib/db/log-set.ts
    - apps/mobile/lib/db/id.ts
    - apps/mobile/__tests__/calendar-day.test.ts
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/db/schema/session.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/test/schema-parity.e2e-spec.ts
    - apps/api/package.json
    - packages/api-contracts/src/sync.ts
    - apps/mobile/lib/db/schema.ts

key-decisions:
  - "Child-of-aggregate tables (session_exercise, logged_set, routine_day, routine_exercise) intentionally omit user_id and server_seq, contrary to the plan prose's general 'every user-authored table, without exception' convention — the plan's own per-table field lists, the schema-parity required-column assertions, and T-02-03's 'resolved once, through the root, without a second lookup per row' language are all internally consistent with this reading, and following the literal field lists over the general prose avoids inventing columns nothing in the plan tests for"
  - "SYNCED_TABLES grew to all 12 user-authored tables per Task 1's explicit instruction, but only workout_session/session_exercise/logged_set are wired through sync.service.ts's TABLE_MAP in this plan — the other 9 (routine, routine_day, routine_exercise, equipment_profile, exercise, personal_record, body_metric, progress_photo, user_preference) are recognized by the wire contract but not yet apply-able; a later plan wires their own aggregate handling"
  - "Client-generated ids use a dependency-free UUID-shaped generator (apps/mobile/lib/db/id.ts) rather than expo-crypto — see Deviations"

patterns-established:
  - "Aggregate root resolution for a sync push: resolve batch-first, then database, and prefer existing DB linkage over a client claim so an attacker cannot reparent a row they don't own by claiming a session_id they do own in the same push"
  - "A whole aggregate (root + every op that resolves to it) is rejected together on missing_parent or not_owner — a batch never applies part of a session and silently drops the rest"

requirements-completed: [PLAT-02, PLAT-07, LOG-22]

coverage:
  - id: D1
    description: "The full domain schema (catalog, equipment, program, session, records, preference, sync tables) exists in Postgres with the exact column shapes ARCHITECTURE.md §1 and this plan specify — text UUID primary keys, weight_kg as numeric never a binary float, the prescription snapshot, flat superset/drop-set annotation columns"
    requirement: "PLAT-02"
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts — 12 cases: all 20 barrel tables present, user/workout_session/logged_set/session_exercise/user_preference required columns, logged_set.weight_kg is numeric, email uniqueness"
        status: pass
      - kind: other
        ref: "psql information_schema.columns: logged_set.weight_kg data_type = numeric"
        status: pass
    human_judgment: false
  - id: D2
    description: "The schema push is a structural precondition of the e2e runner — an e2e run against an unmigrated database cannot report green"
    requirement: "PLAT-02"
    verification:
      - kind: other
        ref: "Negative control, run once: jest invoked directly against an unmigrated database exits 1; the same spec through `pnpm run test:e2e -- schema-parity` (which pushes first) exits 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "A whole workout — session, session_exercises, logged_sets — pushes as one transactional aggregate; a logged_set whose parent session_exercise cannot be resolved is rejected missing_parent with the rest of the aggregate left unapplied; child-before-parent op ordering still applies correctly; ownership is resolved once per aggregate through the root, rejecting a child whose root belongs to another user"
    requirement: "PLAT-02, PLAT-07"
    verification:
      - kind: e2e
        ref: "apps/api/test/sync-aggregate.e2e-spec.ts — 6 cases: whole-session aggregate apply, missing_parent rejection, child-before-parent ordering, same-set_index sets distinguishable by id, cross-user not_owner on a child op (T-02-03), invalid_field on a negative weight_kg (T-02-05)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The calendar day a workout is attributed to is captured once at write time from the device's IANA zone and never recomputed on read — correct at the 23:45/00:15 midnight boundary, across a session that crosses midnight, under a different reading timezone, and across a DST transition"
    requirement: "LOG-22"
    verification:
      - kind: unit
        ref: "apps/mobile/__tests__/calendar-day.test.ts — 7 cases"
        status: pass
      - kind: other
        ref: "grep: resolvedOptions().timeZone appears in exactly one non-comment location (lib/calendar-day.ts); no read path in apps/mobile/lib re-derives the day via new Date(...started_at...)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Local write helpers (startSession, addSessionExercise, logSet) exist and are wired to the local SQLite schema, PowerSync's crud queue and the id/calendar-day utilities — but their actual on-device local-write behavior (a real PowerSync/SQLite round trip) cannot execute inside this Jest process"
    requirement: "PLAT-02, PLAT-07"
    verification: []
    human_judgment: true
    rationale: "No native runtime or browser (IndexedDB/Worker/WASM) is available in this execution environment — the same environment constraint 02-01's SUMMARY documented for PowerSync's local-write path. tsc --noEmit and the full monorepo `pnpm ci` prove the code is well-typed and wired; a human/device UAT pass is required to prove the real local write."

duration: ~2h
completed: 2026-08-17
status: complete
---

# Phase 2 Plan 2: The Domain Schema and a Whole Workout Aggregate Summary

**The full ARCHITECTURE.md domain schema landed in Postgres and mirrored in local SQLite, with a whole workout (session + exercises + sets) now applying to Postgres as one transactional aggregate that rejects orphaned children and cross-user reparenting, and the calendar day captured once at write time per LOG-22.**

## Performance

- **Duration:** ~2h
- **Tasks:** 3/3 completed
- **Files modified:** 18 (11 created, 7 modified)

## Accomplishments

- Split the Postgres schema into `apps/api/src/db/schema/{catalog,equipment,program,session,records,preference,sync}.ts`, landing every entity `ARCHITECTURE.md` §1 specifies: `muscle_group`/`exercise`/`exercise_muscle_mapping`, `equipment_profile`, `routine`/`routine_day`/`routine_exercise`, `session_exercise`/`logged_set` on `workout_session`, `personal_record`/`body_metric`/`progress_photo`, `user_preference`, and the server-owned `sync_conflict_log`/`sync_tombstone`.
- `weight_kg` is `numeric(8,3)` on both Postgres and (as text) SQLite — no path in the schema can store a weight as a binary float (D-04), asserted structurally by `schema-parity.e2e-spec.ts`'s `information_schema.columns` check.
- `workout_session` gained `timezone`/`local_date`, captured exactly once by `captureCalendarDay` at `startSession` time and never recomputed on read (LOG-22) — proven by 7 unit cases covering the midnight boundary, a cross-midnight session, a different-timezone read, and a DST transition.
- Rebuilt `SyncService.applyBatch` around aggregate grouping: ops for `workout_session`/`session_exercise`/`logged_set` are grouped by their aggregate root (resolved batch-first, database-second), ownership is checked once per aggregate via one batched query, and each aggregate applies in parent-before-child order inside its own transaction — a batch whose child cannot resolve its parent poisons the whole aggregate (`missing_parent`) rather than partially landing it.
- Made the schema-parity gate structural rather than nominal: `test:e2e` now runs `db:push` as a precondition, proven with a real negative control (direct jest invocation against an unmigrated database exits 1; the same spec through the wrapped script exits 0).
- Found and closed a real elevation-of-privilege gap while implementing aggregate resolution (see Deviations #2) — an attacker could otherwise have reparented an existing child row onto a session they own, bypassing the `not_owner` check.

## Task Commits

Each task was committed atomically:

1. **Task 1: The domain schema every later phase is downstream of** - `5196500` (feat)
2. **Task 2: [BLOCKING] Push the schema to Postgres and make schema parity grow with it** - `3e217e2` (feat)
3. **Task 3: A whole workout, offline, on the right day** (tdd=true) - two commits:
   - `10a2041` (test — RED) — calendar-day.test.ts, sync-aggregate.e2e-spec.ts
   - `b095ce1` (feat — GREEN) — calendar-day.ts, log-set.ts, id.ts, mobile schema, sync.service.ts aggregate rewrite

**Plan metadata:** *(this commit, docs)*

## TDD Gate Compliance

Task 3's gate sequence is present in git log: `test(02-02): add failing tests for calendar-day and sync aggregate apply` (`10a2041`) precedes `feat(02-02): a whole workout, offline, on the right day` (`b095ce1`). RED was verified directly, not assumed: `calendar-day.test.ts` was run against a nonexistent `calendar-day.ts` (module-not-found failure) before implementation, and `sync-aggregate.e2e-spec.ts` was run against the pre-Task-3 `sync.service.ts` (via `git stash`, restored afterward) — all 6 cases failed as expected. GREEN was then confirmed with the real implementation restored.

## Files Created/Modified

- `apps/api/src/db/schema/catalog.ts` - `muscleGroup`, `exercise` (nullable `user_id`, self-referencing `variation_of_id`), `exerciseMuscleMapping` (composite PK, `weight_factor` as data)
- `apps/api/src/db/schema/equipment.ts` - `equipmentProfile`
- `apps/api/src/db/schema/program.ts` - `routine`, `routineDay`, `routineExercise`
- `apps/api/src/db/schema/session.ts` - `workoutSession` extended with `timezone`/`local_date`; new `sessionExercise` (prescription snapshot) and `loggedSet` (`weight_kg` numeric, `parent_set_id` self-reference)
- `apps/api/src/db/schema/records.ts` - `personalRecord`, `bodyMetric`, `progressPhoto`
- `apps/api/src/db/schema/preference.ts` - `userPreference`, keyed on `user_id`
- `apps/api/src/db/schema/sync.ts` - `syncConflictLog`, `syncTombstone` (server-owned, never in `SYNCED_TABLES`)
- `apps/api/src/db/schema.ts` - Barrel re-exports every module; `schema` names all 20 tables; `userRelations` extended
- `apps/api/test/schema-parity.e2e-spec.ts` - `REQUIRED_TABLES` grown to all 20; per-table required-column assertions; `logged_set.weight_kg` numeric assertion
- `apps/api/package.json` - `test:e2e` now runs `db:push` first; `db:verify` delegates to `test:e2e -- schema-parity`
- `apps/api/src/sync/sync.service.ts` - Aggregate grouping/ordering/transactional apply, field validation (T-02-05), existing-linkage-wins-over-client-claim resolution (T-02-03)
- `apps/api/test/sync-aggregate.e2e-spec.ts` - 6 e2e cases against a spawned build and live Postgres
- `packages/api-contracts/src/sync.ts` - `SYNCED_TABLES` grown to 12 entries
- `apps/mobile/lib/calendar-day.ts` - `captureCalendarDay`, the single device-zone read site
- `apps/mobile/lib/db/schema.ts` - Local SQLite mirrors of every new table
- `apps/mobile/lib/db/log-set.ts` - `startSession`, `addSessionExercise`, `logSet`
- `apps/mobile/lib/db/id.ts` - Dependency-free client-UUID generator (see Deviations #3)
- `apps/mobile/__tests__/calendar-day.test.ts` - 7 unit cases

## Decisions Made

- **Child-of-aggregate tables omit `user_id`/`server_seq`** — `session_exercise`, `logged_set`, `routine_day`, `routine_exercise` resolve ownership and merge order through their aggregate root rather than carrying their own copies, matching the plan's per-table field lists and T-02-03's threat mitigation language over its more general "every table, without exception" prose.
- **9 of the 12 newly-`SYNCED_TABLES` entries are wire-contract-only in this plan** — `routine`, `routine_day`, `routine_exercise`, `equipment_profile`, `exercise`, `personal_record`, `body_metric`, `progress_photo`, `user_preference` are recognized by `SYNCED_TABLES` per Task 1's explicit instruction but not yet wired through `sync.service.ts`'s `TABLE_MAP`; an op for one of them is now rejected `unknown_table` (see Deviations #1) rather than crashing, and a later plan adds their own aggregate handling.
- **Dependency-free client-UUID generator** instead of `expo-crypto` — see Deviations #3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `TABLE_MAP` lookup on an unmapped-but-`SYNCED_TABLES` type would have crashed**
- **Found during:** Task 3, implementing the aggregate grouping loop
- **Issue:** Task 1 extended `SYNCED_TABLES` to 12 tables, but only `workout_session`/`session_exercise`/`logged_set` are wired through `TABLE_MAP` in this plan. An op for e.g. `'routine'` would pass the `unknown_table` check (since `SYNCED_TABLES` now recognizes it) and then crash on `.from(undefined)`.
- **Fix:** Added an `isMappedTable` guard so an op for a `SYNCED_TABLES` entry with no `TABLE_MAP` mapping is rejected `unknown_table` instead of throwing.
- **Files modified:** `apps/api/src/sync/sync.service.ts`
- **Verification:** `pnpm --filter api exec tsc --noEmit`; existing `sync-push.e2e-spec.ts`'s `unknown_table` case still passes.
- **Committed in:** `b095ce1`

**2. [Rule 2 - Missing critical functionality] Existing-row linkage must win over a client-claimed parent**
- **Found during:** Task 3, designing `session_exercise`/`logged_set` root resolution
- **Issue:** Resolving an existing row's aggregate root purely from the client-supplied `session_id`/`session_exercise_id` would let an attacker "reparent" an existing child row they don't own by claiming, in the same push, a `session_id` they DO own — bypassing the `not_owner` check entirely (T-02-03).
- **Fix:** `resolveSessionIdForSessionExercise`/`resolveSessionExerciseIdForLoggedSet` always prefer the database's existing linkage over the batch's claimed value; only a genuinely new row (no existing DB row) trusts the client-supplied parent.
- **Files modified:** `apps/api/src/sync/sync.service.ts`
- **Verification:** `sync-aggregate.e2e-spec.ts`'s not_owner case (pushes a child op for an existing session, from a different authenticated user).
- **Committed in:** `b095ce1`

**3. [Rule 3 - blocking issue, package install excluded] Client-generated UUID without a new dependency**
- **Found during:** Task 3, implementing `startSession`/`addSessionExercise`/`logSet`
- **Issue:** D-02 requires a client-generated UUID `id` before any network round-trip. The natural choice — `expo-crypto`'s `randomUUID()` (confirmed via Context7 against Expo's own source: `globalThis.crypto.randomUUID` is NOT available on Hermes/iOS) — is not an installed dependency. Installing a new package mid-task requires the package-legitimacy checkpoint (deviation Rule 3's exclusion), which this plan does not carry as a task and which auto-mode never auto-approves.
- **Fix:** `apps/mobile/lib/db/id.ts` implements a dependency-free UUID-shaped generator, the same algorithm the existing `offline-write.test.ts` already uses for its test-only `fakeId()`. Not cryptographically random — acceptable here because this id is a sync identity, not a secret; a collision would surface as the server's per-row `not_owner` rejection (existing-linkage-wins, deviation #2), not silent corruption.
- **Files modified:** `apps/mobile/lib/db/id.ts` (new), `apps/mobile/lib/db/log-set.ts`
- **Verification:** `pnpm --filter mobile exec tsc --noEmit`; format matches the UUID v4 shape already exercised by `offline-write.test.ts`.
- **Committed in:** `b095ce1`
- **Follow-up:** A real UUID package (`expo-crypto` or `uuid`) should replace this once cleared through the package-legitimacy gate — logged in Known Stubs below and `.planning/WINDOWS.md`.

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 1 Rule 2, 1 Rule 3)
**Impact on plan:** All three were necessary for the plan's own acceptance criteria and threat model to hold — none is scope creep. #1 and #2 are correctness/security fixes surfaced by implementing the aggregate logic the plan specified; #3 is the minimum change that unblocks Task 3 without silently working around the package-legitimacy gate.

## Known Stubs

- **`apps/mobile/lib/db/id.ts`'s UUID generator is not cryptographically random** (Deviation #3). Functionally adequate for a sync identity per the reasoning above, but should be replaced with `expo-crypto`'s `randomUUID()` once that package is cleared through a package-legitimacy checkpoint. Recorded in `.planning/WINDOWS.md`.
- **9 of the 12 `SYNCED_TABLES` entries have no server-side apply path yet** (`routine`, `routine_day`, `routine_exercise`, `equipment_profile`, `exercise`, `personal_record`, `body_metric`, `progress_photo`, `user_preference`) — an op for any of them is rejected `unknown_table` by the crash guard (Deviation #1) rather than applied. This is an intentional scope boundary (Task 3 only wires the session aggregate), not an oversight, but is recorded here so a later plan doesn't assume these tables are already sync-capable just because they're wire-contract-recognized.

## Broken-windows ledger

Both Known Stubs entries above were also appended to `.planning/WINDOWS.md` via `gsd-tools windows append` (kind: `stub`).

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The domain schema is complete and live in Postgres; every later plan in this phase builds on these exact tables.
- `SyncService`'s aggregate-apply pattern (resolve root batch-first-then-database, existing-linkage-wins, ownership-once-per-aggregate, transaction-per-aggregate) is now the template plan 02-03 and later plans should extend when wiring the remaining 9 `SYNCED_TABLES` entries — most of which (`routine`/`routine_day`/`routine_exercise`) are themselves an aggregate shaped exactly like `workout_session`/`session_exercise`/`logged_set`.
- `apps/mobile/lib/db/log-set.ts`'s write helpers are ready for a screen to call once Phase 3's UI exists; their real on-device behavior is unverified in this environment (see coverage D5 and Known Stubs).
- No blockers.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All 11 created files confirmed tracked via `git ls-files`; all 4 referenced commit hashes
(`5196500`, `3e217e2`, `10a2041`, `b095ce1`) confirmed present in `git log`.
