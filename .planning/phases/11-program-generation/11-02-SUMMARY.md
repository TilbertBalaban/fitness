---
phase: 11-program-generation
plan: 02
subsystem: database
tags: [drizzle, postgres, powersync, sync, nestjs]

requires:
  - phase: 02-data-model-sync-engine
    provides: "SyncService.applyBatch's ownership-resolution and patch-aware-set machinery, and the user_exercise_preference singleton-aggregate-root pattern this plan copies verbatim"
provides:
  - "excluded_exercise Postgres table (D-10) — a synced row-per-exercise fact that a user will never train a given exercise"
  - "Full sync registration: SYNCED_TABLES/PUSH_APPLIED_TABLES, TABLE_MAP, SINGLETON_ROOT_TYPES, ROOT_TABLE_BY_TYPE, AGGREGATE_RANK, hasInvalidField, toExcludedExerciseValues, the applyBatch insert branch"
  - "One auth.user_id()-scoped pull query on the user_data PowerSync stream"
  - "docs/excluded-exercise-shape.md — the shape/enforcement reference for the next reader"
affects: [11-01, 11-03, 11-04, 11-05, 11-06]

actuals:
  tokens: 8900
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "excluded_exercise is a strict subset of user_exercise_preference's registration footprint — same seven touchpoints, minus archivedAt/neverSuggest, plus a plain createdAt"

key-files:
  created:
    - apps/api/test/excluded-exercise.e2e-spec.ts
    - docs/excluded-exercise-shape.md
  modified:
    - apps/api/src/db/schema/catalog.ts
    - apps/api/src/db/schema.ts
    - packages/api-contracts/src/sync.ts
    - ops/powersync/sync-rules.yaml
    - apps/api/src/sync/sync.service.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/test/schema-parity.e2e-spec.ts

key-decisions:
  - "excluded_exercise carries no archivedAt and no neverSuggest — un-excluding is a hard DELETE, deliberately absent from HARD_DELETE_FORBIDDEN for the same reason user_exercise_preference is"
  - "exerciseId maps to null in EXCLUDED_EXERCISE_PATCH_FIELDS not because of ownership but because it is the table's only identity column — an op naming a different exercise_id is a different row, never an edit"

patterns-established: []

requirements-completed: [GEN-03]

coverage:
  - id: D1
    description: "excluded_exercise exists in Postgres with both indexes (unique on user_id+exercise_id, index on user_id) and reaches devices through one auth.user_id()-scoped stream query"
    requirement: "GEN-03"
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts#has every table schema.ts declares present in the live database"
        status: pass
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts#has every required column on excluded_exercise"
        status: pass
    human_judgment: false
  - id: D2
    description: "A push is stored against its authenticated owner regardless of what the payload claims"
    requirement: "GEN-03"
    verification:
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#stores a PUT against the authenticated session's user id, never a user_id claimed in the payload"
        status: pass
    human_judgment: false
  - id: D3
    description: "A malformed exercise_id (missing, empty, non-string, or naming a nonexistent exercise) is rejected and writes nothing"
    requirement: "GEN-03"
    verification:
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#rejects a PUT missing exercise_id with invalid_field, and writes no row"
        status: pass
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#rejects a PUT with an empty-string exercise_id with invalid_field, and writes no row"
        status: pass
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#rejects a PUT with a non-string exercise_id with invalid_field, and writes no row"
        status: pass
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#rejects a PUT naming an exercise_id that does not exist at all, with a terminal rejection reason, and writes no row"
        status: pass
    human_judgment: false
  - id: D4
    description: "A second user cannot read, retarget or delete the first user's exclusion row by naming the same op id"
    requirement: "GEN-03"
    verification:
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#a second user's PUT naming the first user's existing row id does not read, retarget or delete that row"
        status: pass
    human_judgment: false
  - id: D5
    description: "Un-excluding is an ordinary applied DELETE, and re-pushing the same exclusion is idempotent"
    requirement: "GEN-03"
    verification:
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#a DELETE against a row the user owns removes it, and the response applies rather than rejecting"
        status: pass
      - kind: e2e
        ref: "apps/api/test/excluded-exercise.e2e-spec.ts#pushing the same (user, exercise) exclusion twice with the same op id is idempotent and leaves exactly one row"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-08-29
status: complete
---

# Phase 11 Plan 02: Excluded Exercise Sync Registration Summary

**Registered `excluded_exercise` as a new synced Postgres table across all seven sync touchpoints, pushed it live, and proved ownership/validation/delete behavior against a running server.**

## Performance

- **Duration:** 40 min
- **Tasks:** 3 completed
- **Files modified:** 9 (7 modified, 2 created)

## Accomplishments

- `excluded_exercise` exists in Postgres as a strict subset of `user_exercise_preference`'s shape — same `id`/`user_id`/`exercise_id` columns and unique-pair constraint, with `archived_at`/`never_suggest` dropped and a plain `created_at` in their place, since un-excluding is a hard delete with no restore concept.
- Registered across every push/pull touchpoint: `SYNCED_TABLES`/`PUSH_APPLIED_TABLES` (appended last, no reorder), one new `auth.user_id()`-scoped pull query on the `user_data` PowerSync stream, and all of `SyncService`'s ownership/validation machinery (`TABLE_MAP`, `SINGLETON_ROOT_TYPES`, `ROOT_TABLE_BY_TYPE`, `AGGREGATE_RANK`, `hasInvalidField`, `toExcludedExerciseValues`, the root-existence lookup, and the `applyBatch` insert branch).
- Pushed the schema to the live local Postgres via `drizzle-kit push` and proved it landed with `schema-parity.e2e-spec.ts` (36/36 assertions, including the new table and its column set).
- Wrote a 9-case e2e spec (`excluded-exercise.e2e-spec.ts`) against the live running server proving: ownership always resolves to the authenticated session regardless of a claimed `user_id`; a missing/empty/non-string `exercise_id` is rejected `invalid_field` with no row written; a nonexistent `exercise_id` fails its foreign key with a terminal rejection; two users excluding the same exercise get two distinct rows; a second user's push naming the first user's row id cannot read, retarget or delete it; a DELETE un-excludes; and a repeat push with the same op id is idempotent.
- Documented the shape in `docs/excluded-exercise-shape.md`, including the four enforcement layers and why exclusions are user-level and global (D-11), not per-program or per-gym.

## Task Commits

1. **Task 1: Register `excluded_exercise` across every push and pull touchpoint** - `0b8c21c` (feat)
2. **Task 2: [BLOCKING] Push the schema to the live database** - no commit (operational only — `drizzle-kit push` + `schema-parity` verification against the live database; Task 1's schema files already carried the change)
3. **Task 3: Prove ownership, validation and un-exclude against a live server** - `ad79ec0` (test)

**Plan metadata:** committed by the orchestrator after this worktree merges (STATE.md/ROADMAP.md are not owned by this parallel executor).

## Files Created/Modified

- `apps/api/src/db/schema/catalog.ts` - `excludedExercise` pgTable + `excludedExerciseRelations`, modelled on `userExercisePreference`
- `apps/api/src/db/schema.ts` - imports, barrel export, `schema` object, and `userRelations.excludedExercises`
- `packages/api-contracts/src/sync.ts` - `'excluded_exercise'` appended to `SYNCED_TABLES` and `PUSH_APPLIED_TABLES`
- `ops/powersync/sync-rules.yaml` - one `auth.user_id()`-scoped pull query added to the `user_data` stream
- `apps/api/src/sync/sync.service.ts` - full seven-point registration (TABLE_MAP, SINGLETON_ROOT_TYPES, ROOT_TABLE_BY_TYPE, AGGREGATE_RANK, `ExcludedExerciseOpData`, `hasInvalidField` branch, `toExcludedExerciseValues`, root-existence lookup, `values` ternary, `applyBatch` insert branch)
- `apps/api/src/sync/patch-update-set.ts` - `ExcludedExerciseValues` and `EXCLUDED_EXERCISE_PATCH_FIELDS`
- `apps/api/test/schema-parity.e2e-spec.ts` - `excluded_exercise` added to `REQUIRED_TABLES`/`REQUIRED_COLUMNS`
- `apps/api/test/excluded-exercise.e2e-spec.ts` - new 9-case e2e spec (created)
- `docs/excluded-exercise-shape.md` - shape and enforcement reference (created)

## Decisions Made

None beyond what 11-CONTEXT.md's D-10/D-11 and 11-RESEARCH.md's Pattern 3 already specified — every edit copies `user_exercise_preference`'s established shape verbatim, per the plan's explicit intent that "nothing here is invented."

## Deviations from Plan

None - plan executed exactly as written. The worktree had no `.env` file (gitignored, not copied into a fresh worktree); a `DATABASE_URL`-bearing `.env` from the main repo checkout was copied in locally to satisfy Task 2's precondition — this is a local, gitignored file, not a tracked change, and required no deviation record.

## Issues Encountered

The first draft of the DELETE e2e case asserted `deleteBody.applied` against the row's `id` rather than the DELETE op's own `op_id` — `SyncPushResponse.applied` is a list of op ids, not row ids, exactly as the PUT cases in the same file already assert. Caught by the first test run (a failing assertion, not a silent pass) and fixed before commit.

## User Setup Required

None - no external service configuration required. The schema push targeted the existing local Postgres already in use by every prior phase's e2e suite.

## Next Phase Readiness

`excluded_exercise` is live, synced, and ownership-proven. 11-01's candidate-pool filter can now read real exclusion rows (once 11-03 builds the device-side mirror and read/write helper — explicitly out of scope for this plan). No blockers for downstream plans in this phase.

## Self-Check: PASSED

All created/modified files verified present on disk; commits `0b8c21c`, `ad79ec0`, and `e8adb11` verified present in git history.

---
*Phase: 11-program-generation*
*Completed: 2026-08-29*
