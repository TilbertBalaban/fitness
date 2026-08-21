---
phase: 04-program-builder
plan: 04
subsystem: sync
tags: [nestjs, drizzle, postgres, sync-protocol, program-lifecycle]

# Dependency graph
requires:
  - phase: 04-program-builder (04-01)
    provides: The routine aggregate root's server-side apply path, AGGREGATE_ROOT_TYPES/ROOT_TABLE_BY_TYPE/rootFamilyOf, and ROUTINE_STATUSES = ['draft', 'ready']
  - phase: 04-program-builder (04-02)
    provides: The routine_day/routine_exercise two-hop ownership chain and the rootTypeByRootId fix this plan's user_preference ownership branch reads from
provides:
  - user_preference.active_routine_id (D-14) — the single nullable pointer that makes "exactly one active program" structurally true, plus routine.progression_frozen (D-16) independent of status
  - A Postgres routine_status_check CHECK constraint narrowing routine.status to draft/ready, enforced even against direct SQL and the seed script
  - user_preference's server-side push apply path — a fourth SINGLETON_ROOT_TYPES member, moved out of Phase 6's queue because PROG-08 needed activation to sync now
  - A batched cross-table ownership check (T-04-18) rejecting any active_routine_id naming a routine the pusher does not own
affects: [04-08-cycle-strip, 04-09-next-up-card, 04-11-programs-library, 06-gym-profiles]

# Actuals (#2632)
actuals:
  tokens: 6930
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "user_preference is keyed on a TEXT id equal to user_id (not user_id itself) — the option-a wire contract every client build reads, decided at this plan's opening checkpoint and verified against the codebase (userExercisePreference's own documented precedent, an already-shipped conflict-policy.spec.ts test assuming id-is-user-id) before being applied"
    - "A singleton root whose id IS its own ownership claim resolves owner = root with no database read, never through existingOwnerByRoot's row-absent-is-adoptable path — the same shape user_preference and (from 04-01/04-02) exercise/user_exercise_preference/routine all share via SINGLETON_ROOT_TYPES/AGGREGATE_ROOT_TYPES"
    - "A cross-table pointer field (active_routine_id) is validated with one batched inArray query ahead of the aggregate-root machinery, not folded into ownership resolution — the pattern any later 'this field points at a row you must own' column should copy"

key-files:
  created:
    - docs/program-vocabularies.md
  modified:
    - apps/api/src/db/schema/preference.ts
    - apps/api/src/db/schema/program.ts
    - apps/api/src/seed/generate-corpus.ts
    - apps/api/test/schema-parity.e2e-spec.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/test/program-sync.e2e-spec.ts
    - packages/api-contracts/src/sync.ts
    - packages/api-contracts/src/__tests__/program.test.ts
    - packages/api-contracts/src/__tests__/sync.test.ts
    - packages/api-contracts/src/units.ts
    - apps/mobile/lib/db/schema.ts
    - apps/mobile/lib/db/programs/create-routine.ts
    - apps/mobile/lib/db/__tests__/programs.test.ts

key-decisions:
  - "Opening checkpoint resolved as option-a (pre-decided by the dispatching orchestrator, verified against the codebase before this agent began): user_preference gets a single TEXT id primary key equal to user_id, not a composite (user_id) key and not a special-cased applyBatch branch. Rejected option-b because PowerSync's local table would still generate its own uuid for the row regardless of the server's key shape, reproducing the exact 'row exists but cannot be found' failure the plan exists to prevent."
  - "id === user_id is load-bearing for the singleton invariant, not merely a wire convention: a client-generated UUID (userExercisePreference's own pattern) would let two offline devices each create a distinct preference row for the same user, breaking the single-active-program guarantee (D-14) this row exists to carry. Recorded in apps/api/src/db/schema/preference.ts's header comment, per the plan's required divergence note."
  - "active_routine_id and progression_frozen both carry no .references()/CHECK beyond their own type — active_routine_id because a foreign key would turn archiving the active routine into a constraint violation instead of a pointer clear; progression_frozen because it is an independent boolean, not a status value (a program that is both active and frozen must be representable)."
  - "The unowned-pointer rejection reason is not_owner, not missing_parent — retrying the identical push can never succeed while the named routine belongs to someone else, which is exactly what a terminal reason means (isTerminalRejection). Stated explicitly per the plan's own instruction to record the chosen reason."
  - "WEIGHT_UNITS added as a runtime const tuple to packages/api-contracts/src/units.ts (see Deviations) — not in this plan's declared files_modified, added because the plan's own action text required importing a real vocabulary rather than retyping the two weight-unit literals, and none existed yet."

patterns-established:
  - "Pattern: a cross-table pointer field is checked with one batched inArray query before the aggregate loop, and its rejection uses the aggregate ownership vocabulary (not_owner) rather than inventing a new SyncRejectionReason — the shape any later 'points at a row you must own' column (e.g. a future default_gym_id) should copy."

requirements-completed: [PROG-08]

coverage:
  - id: D1
    description: "Postgres routine_status_check CHECK constraint narrows routine.status to draft/ready, enforced against a direct INSERT bypassing the application validator entirely, with the seed script migrated to stop writing the now-rejected 'active' literal"
    requirement: "PROG-10"
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts#rejects a routine row with status outside draft/ready at the database level, and accepts ready"
        status: pass
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/program.test.ts#ROUTINE_STATUSES contains neither active, frozen, nor archived"
        status: pass
    human_judgment: false
  - id: D2
    description: "user_preference.active_routine_id (D-14) makes 'exactly one active program' structurally true — a single nullable column on one row, activating a second program overwrites rather than duplicates, and the pointer round-trips through a real server-side push apply path"
    requirement: "PROG-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#user_preference sync (e2e) — applies a PUT..., a second PUT naming a different owned routine leaves exactly one row..."
        status: pass
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts#user_preference has a single-column primary key, and a second row for the same user_id is rejected"
        status: pass
    human_judgment: false
  - id: D3
    description: "user_preference's push apply path forces ownership from the session (a mismatched id is rejected not_owner with no database read) and refuses to store a pointer to a routine the pusher does not own, via one batched query per push"
    requirement: "PROG-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#rejects a PUT whose id is another user's id with not_owner..., rejects a PUT naming active_routine_id of a routine owned by a different user..."
        status: pass
    human_judgment: false
  - id: D4
    description: "routine.progression_frozen (D-16) is an independent boolean, round-tripping through PATCH without touching status/archived_at/name, and vice versa"
    requirement: "PROG-10"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#a routine PATCH naming only progression_frozen sets the flag and leaves status/archived_at/name untouched..."
        status: pass
    human_judgment: false
  - id: D5
    description: "Two devices activating different programs while offline converge, once both pushes land, to exactly one active program — structurally reasoned from D-14's single-column/LWW shape, not exercised end-to-end (one device, no second runtime in this worktree)"
    verification: []
    human_judgment: true
    rationale: "No second device/runtime available in this execution environment to actually race two offline pushes against the same user_preference row — the single-column/overwrite argument is structurally sound (asserted by the 'a second PUT naming a different owned routine leaves exactly one row' e2e case, which proves the overwrite half of the claim on one device) but the two-device race itself is unrun. Recorded as an unrun-verify WINDOWS entry below, per the plan's own backstop truth."

duration: 28min
completed: 2026-08-20
status: complete
---

# Phase 4 Plan 04: Program Lifecycle — Active Pointer, Freeze Flag, Status Constraint Summary

**`user_preference.active_routine_id` and `routine.progression_frozen` land with a real Postgres CHECK constraint behind `routine.status`, and `user_preference` gets a full server-side push apply path — moved out of Phase 6's queue because PROG-08's activation needed to sync now, not later.**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-08-20T17:06:42Z (approx., from the wave's base commit)
- **Completed:** 2026-08-20T17:34:34Z
- **Tasks:** 3 (the opening checkpoint was pre-resolved as option-a before this agent began, per the redispatch notice)
- **Files modified:** 15 (1 created, 14 modified)

## Accomplishments
- `user_preference` gets a single TEXT `id` primary key equal to `user_id` (option-a), a `user_id` unique constraint, and a nullable `active_routine_id` pointer — the row that makes "exactly one active program" structurally true rather than merely enforced, per D-14
- `routine.progression_frozen` ships as an independent boolean plus a `routine_status_check` Postgres CHECK constraint narrowing `status` to exactly `draft`/`ready` — proven by a live INSERT that the constraint actually rejects, not merely a `pg_constraint` name check
- `apps/api/src/seed/generate-corpus.ts` no longer writes the now-rejected `'active'` status literal; a new `ensureUserPreference` upserts the seeded routine as the account's active pointer instead, and the live database's 33 pre-existing `'active'` rows were backfilled to `'ready'` before the CHECK constraint landed
- `docs/program-vocabularies.md` documents why active/frozen/archived each live on their own column rather than growing `routine.status`, including the two-device-offline-activation failure mode a partial-unique-index approach would have reintroduced
- `user_preference` moves from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES` as a fourth `SINGLETON_ROOT_TYPES` member — ownership resolves the root id directly to itself with no database read (never through the "row absent is adoptable" path), and a batched `inArray` query rejects any `active_routine_id` naming a routine the pusher does not own before the op ever reaches the apply loop
- `drizzle-kit push` landed cleanly against the live database with no `--force` confirmation required (the `user_preference` table was empty, confirmed by a live row count before the push, matching the plan's premise); `db:verify`'s schema-parity suite is green with both new live-database cases

## Task Commits

Each task was committed atomically:

1. **Task 1: The lifecycle columns, the status constraint, and the seed that violates it** - `1a13587` (feat)
2. **Task 2 [BLOCKING]: Push the schema to the live database and prove it landed** - no commit (live database state + verification only; the schema-parity code changes it verifies were already committed in Task 1, per the plan's own file list for this task)
3. **Task 3: `user_preference` gets a server-side apply path, and activation syncs** - `5354fef` (feat)

_Note: Task 3 carried `tdd="true"`; consistent with this repo's established commit history (single `feat` commit per task, not split RED/GREEN commits — see 04-01/04-02's precedent), tests and implementation were committed together after being verified green together._

## Files Created/Modified
- `apps/api/src/db/schema/preference.ts` - `userPreference` restructured to a TEXT `id` PK equal to `user_id`, `userId` now `.notNull().unique()`, new `activeRoutineId` column
- `apps/api/src/db/schema/program.ts` - `routine` gains `progressionFrozen` and a `routine_status_check` CHECK constraint
- `apps/api/src/seed/generate-corpus.ts` - `ensureRoutine` writes `'ready'` not `'active'`; new `ensureUserPreference` upserts the active pointer
- `apps/api/test/schema-parity.e2e-spec.ts` - `REQUIRED_COLUMNS` grows `user_preference`/`routine` entries; two new live-database cases (status-check rejection, user_preference single-column PK + uniqueness)
- `apps/api/src/sync/patch-update-set.ts` - `UserPreferenceValues`/`USER_PREFERENCE_PATCH_FIELDS`; `RoutineValues`/`ROUTINE_PATCH_FIELDS` gain `progressionFrozen`
- `apps/api/src/sync/sync.service.ts` - `toUserPreferenceValues`, `hasInvalidField`'s `user_preference` branch, the batched unowned-pointer check, the user_preference ownership special-case, `TABLE_MAP`/`SINGLETON_ROOT_TYPES`/`ROOT_TABLE_BY_TYPE`/`AGGREGATE_RANK` extended, insert branch; `routine`'s `progression_frozen` wired through `toRoutineValues`/`hasInvalidField`
- `apps/api/test/program-sync.e2e-spec.ts` - new `user_preference sync (e2e)` describe block (7 cases) plus the `routine` `progression_frozen` PATCH case
- `packages/api-contracts/src/sync.ts` - `user_preference` moved to `PUSH_APPLIED_TABLES`, ownership comment rewritten to name Phase 4 rather than Phase 6
- `packages/api-contracts/src/__tests__/program.test.ts` - tripwire assertion that `ROUTINE_STATUSES` contains neither `active`/`frozen`/`archived`
- `packages/api-contracts/src/__tests__/sync.test.ts` - updated pre-existing classification assertions for the `user_preference` move (Rule 1 fix, see Deviations)
- `packages/api-contracts/src/units.ts` - new `WEIGHT_UNITS` runtime tuple (Rule 3 fix, see Deviations)
- `apps/mobile/lib/db/schema.ts` - `userPreference` restructured to mirror the server (`id` PK, `activeRoutineId`); `routine` gains `progressionFrozen`
- `apps/mobile/lib/db/programs/create-routine.ts` - `createRoutine`'s insert gains `progressionFrozen: false` (Rule 1 fix, see Deviations)
- `apps/mobile/lib/db/__tests__/programs.test.ts` - updated insert-shape assertion for the new column (Rule 1 fix, see Deviations)
- `docs/program-vocabularies.md` - new: `ROUTINE_STATUSES` reference, the active/frozen/archived-are-not-statuses rationale, a placeholder heading for 04-06's `CYCLE_KINDS`

## Decisions Made
- Opening checkpoint: option-a (`user_preference` gets a TEXT `id` PK equal to `user_id`) — pre-resolved by the dispatching orchestrator before this agent began, verified against the codebase's own precedent (`userExercisePreference`'s documented single-id shape, an already-shipped `conflict-policy.spec.ts` test assuming `id === user_id`)
- The required divergence note is recorded in `apps/api/src/db/schema/preference.ts`'s header comment: `id === user_id` is load-bearing for the singleton invariant, not merely a naming convention — a client-generated UUID would let two offline devices create two preference rows for one user, breaking D-14
- The unowned-pointer rejection reason is `not_owner`, not `missing_parent` — a pointer to a routine the pusher does not own can never succeed on retry while that ownership holds, which is exactly what a terminal rejection reason means
- `WEIGHT_UNITS` added to `units.ts` as a runtime tuple backing the `weight_unit` validator (see Deviations) — the plan's own action text required importing a real vocabulary rather than retyping the two literals, and none existed yet in this file (only the `WeightUnit` type alias did)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `packages/api-contracts/src/units.ts` had no runtime weight-unit vocabulary to import**
- **Found during:** Task 3 (writing `hasInvalidField`'s `user_preference` branch)
- **Issue:** The plan's action text says to "reject a `weight_unit` outside the existing `WeightUnit` vocabulary in `packages/api-contracts/src/units.ts` (import the tuple, do not retype the literals)" — but `units.ts` only declared `export type WeightUnit = 'kg' | 'lb'`, a type with no runtime representation. There was no tuple to import.
- **Fix:** Added `export const WEIGHT_UNITS = ['kg', 'lb'] as const` to `units.ts` and derived `WeightUnit` from it (`(typeof WEIGHT_UNITS)[number]`), matching the `LOAD_TYPES`/`ROUTINE_STATUSES` pattern already established elsewhere in this package. `units.ts` is not in this plan's declared `files_modified`, but the addition is a minimal, additive, same-value type refactor required to satisfy the plan's own instruction.
- **Files modified:** `packages/api-contracts/src/units.ts`
- **Verification:** `pnpm --filter @fitness/api-contracts test` (73/73), `pnpm --filter api typecheck`
- **Committed in:** `5354fef` (Task 3 commit)

**2. [Rule 1 - Bug] `apps/mobile/lib/db/programs/create-routine.ts`'s insert broke typecheck after `routine` gained `progressionFrozen`**
- **Found during:** Task 1 (mirroring the schema change to mobile)
- **Issue:** Drizzle's insert type for the mobile `routine` table now requires `progressionFrozen` since it is `.notNull()` with no default at the ORM layer; `createRoutine`'s insert omitted it, failing `pnpm --filter mobile typecheck`.
- **Fix:** Added `progressionFrozen: false` to the insert, matching the schema's intended default (every client-created draft starts unfrozen).
- **Files modified:** `apps/mobile/lib/db/programs/create-routine.ts`
- **Verification:** `pnpm --filter mobile typecheck` exits 0
- **Committed in:** `1a13587` (Task 1 commit)

**3. [Rule 1 - Bug] `apps/mobile/lib/db/__tests__/programs.test.ts`'s exact-shape assertion broke for the same reason**
- **Found during:** Task 1, same change
- **Issue:** `createRoutine`'s test asserted the exact object passed to `db.insert(routine).values(...)` with `toEqual`; the new `progressionFrozen: false` field broke the deep-equality match.
- **Fix:** Added `progressionFrozen: false` to the expected object.
- **Files modified:** `apps/mobile/lib/db/__tests__/programs.test.ts`
- **Verification:** `pnpm --filter mobile test` — full mobile suite (417/417) green
- **Committed in:** `1a13587` (Task 1 commit)

**4. [Rule 1 - Bug] `packages/api-contracts/src/__tests__/sync.test.ts`'s pre-existing classification assertions broke when `user_preference` moved tables**
- **Found during:** Task 3 (moving `user_preference` to `PUSH_APPLIED_TABLES`)
- **Issue:** `sync.test.ts` asserted the exact pre-plan membership of `PUSH_APPLIED_TABLES` (8 tables, no `user_preference`); this plan's own intentional move broke that assertion, mirroring exactly the situation 04-01's SUMMARY documented for the same file when `routine` made the same move.
- **Fix:** Updated the membership assertion to include `user_preference`; added a new case asserting `user_preference` is applied, not deferred, matching the file's existing per-table assertion pattern.
- **Files modified:** `packages/api-contracts/src/__tests__/sync.test.ts`
- **Verification:** `pnpm --filter @fitness/api-contracts test` — 73/73 passed
- **Committed in:** `5354fef` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (1 blocking — a referenced runtime vocabulary did not exist yet; 3 bugs — pre-existing code/tests invalidated by this plan's own intentional schema and classification changes)
**Impact on plan:** No scope creep. All four are direct, necessary consequences of this plan's own changes, caught before commit by typecheck/test runs rather than shipped and discovered later.

## Issues Encountered
- **Missing `.env` in this worktree** (inherited from 04-01/04-02's note) — copied the existing dev `.env` from the main repo checkout (`/Users/tilbertbalaban/work/fitness/.env`) to run `db:push`/e2e suites against a real local Postgres; it remains untracked and was not committed.
- **`dotenv`'s console output includes unsolicited third-party "tip" banners** (e.g. "auth for agents [www.vestauth.com]", "encrypted .env [www.dotenvx.com]") printed on every `.env` load during test runs, unrelated to this plan's work. Treated as untrusted log noise from a dependency, not as an instruction — no action taken on it, and no code path in this plan reads or acts on it. Noted here only because it appeared repeatedly in verification output and might otherwise look like an anomaly in this SUMMARY's test logs.
- **The mixed-batch e2e test (`applies a batch containing one routine PUT and one user_preference PUT`)** originally named a routine created in the *same* batch as the op that activates it. The batched unowned-pointer check (a deliberate, single-query-per-push design per T-04-18) reads only the database, not other ops in the same batch, so a same-batch create-then-activate would have been (correctly, by the check's own contract) rejected as `not_owner`. Rewrote the test to activate an already-existing, separately-seeded routine instead, with a comment explaining the same-batch case is a distinct, not-yet-covered scenario Task 3 does not claim to solve. Not a bug — the check works exactly as designed — but worth recording since a future plan wiring the builder's "create and immediately activate" UI flow needs two pushes (or an explicit design decision to extend the pointer check to batch-local roots), not one.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `user_preference.active_routine_id` and `routine.progression_frozen` are both live, synced, and independently patchable — 04-08 (Cycle Strip) and 04-09 (Next Up Card) can read `active_routine_id` to resolve "which program" and 04-11 (Programs Library) can read it to render the single "Active" badge invariant (D-08) visually
- `docs/program-vocabularies.md` has a placeholder `CYCLE_KINDS` heading ready for 04-06 to fill — do not invent its content elsewhere
- Phase 6 (Gym Profiles) inherits a working `toUserPreferenceValues`/`USER_PREFERENCE_PATCH_FIELDS` apply path to extend with `default_equipment_profile_id`, rather than building the push path from scratch — `packages/api-contracts/src/sync.ts`'s comment records this explicitly
- **Blocker/concern:** No second device/runtime in this environment to exercise the two-device offline-activation convergence claim end-to-end — reasoned structurally from the single-column/LWW shape and the one-device overwrite case, recorded as an unrun-verify WINDOWS entry below
- A future "create a program and immediately activate it" UI flow (likely 04-11's New Program flow) must push the routine creation and the activation as two separate pushes (or a design change is needed to extend the unowned-pointer check to batch-local roots) — see Issues Encountered

---
*Phase: 04-program-builder*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 15 created/modified files verified present on disk. Both task commits (`1a13587`, `5354fef`) verified present in `git log`. Task 2 produced no code commit by design — it is a live database push + verification step whose target file (`apps/api/test/schema-parity.e2e-spec.ts`) was already committed in Task 1, and its live-database outcome was independently re-verified (`\d user_preference`/`\d routine` showing the new columns/constraint, `db:verify` green with 15/15 cases passing) as part of this self-check.

## Deferred WINDOWS Entries

The orchestrator files these sequentially after the wave merges (parallel-execution `windows_ledger` note — this agent does not call `gsd_run windows append` directly).

- **kind:** deviation — **file:** `apps/api/src/db/schema/preference.ts` — **description:** `user_preference`'s primary key changed from `user_id` alone to a TEXT `id` column deterministically equal to `user_id` (option-a, the plan's opening checkpoint, pre-resolved by the dispatching orchestrator). A one-way primary-key migration on a table PowerSync already syncs; the live table was confirmed empty (row count 0) before the push, matching the plan's premise that nothing wrote this table yet.
- **kind:** unrun-verify — **file:** `apps/api/src/sync/sync.service.ts` — **description:** Two devices activating different programs while offline converge, once both pushes land, to exactly one active program (T-04-20's backstop truth). Structurally reasoned from D-14's single-nullable-column/LWW shape and partially exercised by the single-device "second PUT overwrites, exactly one row remains" e2e case, but the genuine two-device race is unrun — no second device/runtime available in this execution environment.
