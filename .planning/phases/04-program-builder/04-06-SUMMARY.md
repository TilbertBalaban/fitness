---
phase: 04-program-builder
plan: 06
subsystem: sync
tags: [nestjs, drizzle, postgres, powersync, sync-protocol, program-lifecycle, cycles]

# Dependency graph
requires:
  - phase: 04-program-builder (04-01)
    provides: The routine aggregate root's server-side apply path, AGGREGATE_ROOT_TYPES/ROOT_TABLE_BY_TYPE/rootFamilyOf
  - phase: 04-program-builder (04-02)
    provides: The routine_day/routine_exercise two-hop ownership chain and the rootTypeByRootId batch-with-only-a-child-op fix this plan's routine_cycle branch extends
  - phase: 04-program-builder (04-04)
    provides: The routine_status_check CHECK-constraint precedent and docs/program-vocabularies.md, which this plan extends with the CYCLE_KINDS section
provides:
  - routine_cycle — a first-class, orderable child of the routine aggregate root (no user_id, no server_seq) with a three-value CYCLE_KINDS vocabulary (training/deload/time_off) enforced in the client contract, the server validator and a Postgres CHECK constraint
  - A per-user sync-rules pull query for routine_cycle, joined on routine.user_id in the same shape as routine_day/routine_exercise
  - A full server-side push apply path (toRoutineCycleValues/isInvalidRoutineCycle/resolveRoutineIdForRoutineCycle) with ownership resolved through routine.user_id, reparenting blocked, and duration_days deliberately not required for time_off (a terminal rejection would discard a legitimate offline write)
affects: [04-07-cycle-target-overrides, 04-08-cycle-strip, 06-gym-profiles]

# Actuals (#2632)
actuals:
  tokens: 6532
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "routine_cycle is a fourth child of the routine aggregate root, a sibling of routine_day/routine_exercise one level below it — extends rootFamilyOf/AGGREGATE_RANK/TABLE_MAP rather than adding a parallel branch, per the plan's own key_links contract"
    - "The rootTypeByRootId batch-with-only-a-child-op registration 04-02 found and fixed for routine_day/routine_exercise is extended, not duplicated, for routine_cycle — a batch containing only a routine_cycle op (no literal routine op) still resolves its root's real type to 'routine', not the workout_session default"
    - "duration_days is validated as a non-negative integer or null but never required when kind is 'time_off' — a completeness rule (all time_off cycles must carry a duration) is deliberately left to the builder (04-08) rather than a terminal server rejection, matching the plan's own prohibition against silently discarding legitimate offline writes"

key-files:
  created: []
  modified:
    - packages/api-contracts/src/program.ts
    - packages/api-contracts/src/sync.ts
    - packages/api-contracts/src/__tests__/program.test.ts
    - packages/api-contracts/src/__tests__/sync.test.ts
    - apps/api/src/db/schema/program.ts
    - apps/api/src/db/schema.ts
    - apps/mobile/lib/db/schema.ts
    - apps/mobile/lib/db/test-support.ts
    - ops/powersync/sync-rules.yaml
    - apps/api/test/schema-parity.e2e-spec.ts
    - docs/program-vocabularies.md
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/test/program-sync.e2e-spec.ts

key-decisions:
  - "CYCLE_KINDS is exactly three values (training/deload/time_off), matching LOAD_TYPES/ROUTINE_STATUSES's additive-only tuple shape — a deload is a cycle you still train (lighter), time off is a cycle you do not train at all, and no other exception exists. Pinned by a tripwire test asserting no 'rest'/'week'/'taper' member."
  - "Deload/time-off position (start or end of the program) is order_index, not a fourth/fifth kind — documented explicitly in docs/program-vocabularies.md's new CYCLE_KINDS section, resolving A-PROG-05's flagged assumption."
  - "duration_days is nullable and never required by the server even when kind is time_off — enforcing that completeness rule server-side would make invalid_field (a terminal rejection) discard a legitimate offline write; it is deferred to the builder UI (04-08) per the plan's own instruction."
  - "The unrun-verify inherited from every prior Phase 4 sync plan applies again here: the PowerSync Service has not been restarted against the new sync rules in this environment, so pull-side delivery of routine_cycle rows is asserted only by the query's shape matching the shipped routine_day query, not by an observed stream."

patterns-established:
  - "Pattern: a single-hop child of the routine aggregate root (routine_cycle, one level below root, no further hop) reuses the exact resolveRoutineIdForRoutineDay shape — a batched inArray query plus a database-wins-over-client-claimed resolver function — rather than inventing a new resolution strategy. The next single-hop child under routine should copy this, not routine_exercise's two-hop shape."

requirements-completed: [PROG-04, PROG-05, PROG-06]

coverage:
  - id: D1
    description: "routine_cycle exists on both Postgres and mobile SQLite with the aggregate-root shape (no user_id, no server_seq), an index on routine_id, and a routine_cycle_kind_check CHECK constraint whose literals match CYCLE_KINDS exactly, proven against a live database by a rejected direct INSERT"
    requirement: "PROG-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/schema-parity.e2e-spec.ts#routine_cycle has no user_id column and no server_seq column..., rejects a routine_cycle row with kind outside training/deload/time_off..."
        status: pass
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/program.test.ts#CYCLE_KINDS deep-equals..., has no rest, week, or taper member"
        status: pass
    human_judgment: false
  - id: D2
    description: "A deload cycle is expressible at the start or end of a program's cycle sequence via order_index 0 or the highest order_index — no position column, resolved structurally and documented in docs/program-vocabularies.md"
    requirement: "PROG-05"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#accepts each of 'training', 'deload' and 'time_off' as a valid kind..."
        status: pass
      - kind: other
        ref: "docs/program-vocabularies.md#CYCLE_KINDS — Position is not a kind section"
        status: pass
    human_judgment: false
  - id: D3
    description: "Planned time off is expressible as a time_off cycle with duration_days measured in whole days, never required server-side, and round-trips through the push apply path with duration_days present, absent (null), or rejected when negative"
    requirement: "PROG-06"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#stores duration_days: 7 for a time_off cycle..., rejects a routine_cycle PUT with duration_days: -1..."
        status: pass
    human_judgment: false
  - id: D4
    description: "routine_cycle ownership resolves through routine.user_id with reparenting blocked, a cross-user PUT rejected not_owner, an unresolvable parent rejected missing_parent, and the ownership-routing fix 04-02 made for routine_day/routine_exercise (a batch with only a child op must not misroute to workout_session) is extended to cover routine_cycle"
    requirement: "PROG-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#rejects user B's routine_cycle PUT naming user A's routine_id with not_owner..., rejects a routine_cycle PUT naming a routine_id in neither the batch nor the database with missing_parent, an existing cycle cannot be reparented onto another routine..."
        status: pass
    human_judgment: false
  - id: D5
    description: "routine_cycle rows stream to their owner and only their owner through a sync-rules query joined on routine.user_id, in the same shape as the shipped routine_day query — not observed against a running PowerSync Service in this environment"
    verification: []
    human_judgment: true
    rationale: "No PowerSync Service instance was restarted against the updated sync rules in this execution environment (inherited standing limitation from every prior Phase 4 sync plan) — the pull-side boundary is asserted only by the query's structural identity to the already-shipped, already-verified routine_day query (same JOIN shape, same auth.user_id() filter), not by an end-to-end observed stream. Recorded as an unrun-verify WINDOWS entry below."

duration: 55min
completed: 2026-08-21
status: complete
---

# Phase 4 Plan 06: Cycle Table, Vocabulary and Sync Path Summary

**`routine_cycle` lands as a first-class, orderable child of the `routine` aggregate root — a three-value `CYCLE_KINDS` vocabulary (training/deload/time_off) enforced in the client contract, a Postgres CHECK constraint and the server validator, plus a full push apply path proving ownership, anti-reparenting and all three valid kinds round-trip.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-21T~11:40 (approx., from the wave's base commit)
- **Completed:** 2026-08-21T12:36:26+03:00
- **Tasks:** 3 (Task 2 was a blocking live-database push + verification step, no code commit)
- **Files modified:** 14

## Accomplishments
- `CYCLE_KINDS = ['training', 'deload', 'time_off']` ships in `packages/api-contracts/src/program.ts`, matching `LOAD_TYPES`/`ROUTINE_STATUSES`'s additive-only tuple shape, pinned by a tripwire test asserting no `'rest'`/`'week'`/`'taper'` member can ever be reintroduced
- `routine_cycle` exists on both Postgres and mobile SQLite with the aggregate-root shape (no `user_id`, no `server_seq`), an index on `routine_id`, and a `routine_cycle_kind_check` CHECK constraint whose literals match `CYCLE_KINDS` exactly — proven against a live database by a rejected direct `INSERT ... kind = 'rest'` and an accepted `'deload'`
- `ops/powersync/sync-rules.yaml` gains a `routine_cycle` query joined on `routine.user_id`, placed directly after `routine_exercise` so the file reads in tree order — every query in the file still filters on `auth.user_id()`
- `docs/program-vocabularies.md`'s `CYCLE_KINDS` placeholder (left by 04-04) is filled: a value table (meaning, trained?, `duration_days` applies?), and an explicit "position is not a kind" section resolving A-PROG-05's flagged assumption — a deload at the start of a program is `order_index` 0, at the end is the highest `order_index`, never a fourth/fifth kind
- `apps/api/src/sync/sync.service.ts` gets a full push apply path for `routine_cycle`: `toRoutineCycleValues`, `isInvalidRoutineCycle`, `resolveRoutineIdForRoutineCycle` (one-hop, database-wins-over-client-claimed), extended `TABLE_MAP`/`AGGREGATE_RANK`/`rootFamilyOf`, and — critically — the `rootTypeByRootId` registration that closes the same "batch containing only a child op misroutes to `workout_session`" trap 04-02 found and fixed for `routine_day`/`routine_exercise`, now also covering `routine_cycle`
- `duration_days` is validated (non-negative integer or null) but never required when `kind` is `'time_off'` — a terminal `invalid_field` rejection would silently discard a legitimate offline write; that completeness rule is deliberately deferred to the builder UI (04-08)
- 13 new e2e cases in `apps/api/test/program-sync.e2e-spec.ts` cover forward/reverse aggregate ordering, cross-user rejection, missing parent, all three valid kinds (not just one), the rejected fourth kind, `duration_days` present/absent/negative, empty name, anti-reparenting, PATCH field isolation (`order_index` alone leaves `name`/`kind` untouched), DELETE with routine/day survivorship, and two cycles sharing one `order_index` both applying (no server-side uniqueness)
- `drizzle-kit push` landed the additive `routine_cycle` table cleanly against the live database with no interactive confirmation prompt; `db:verify`'s schema-parity suite is green with two new live-database cases (no `user_id`/`server_seq`, CHECK constraint rejection)

## Task Commits

Each task was committed atomically:

1. **Task 1: The cycle table, its vocabulary, its constraint and its sync-rules query** - `cec8ebe` (feat)
2. **Task 2 [BLOCKING]: Push the cycle table to the live database and prove it landed** - no commit (live database state + verification only; the schema-parity code changes it verifies were already committed in Task 1, matching 04-04's Task 2 precedent)
3. **Task 3: Cycles get a server-side apply path under the routine aggregate** - `8c8e6e8` (feat)

_Note: Task 1 and Task 3 both carried `tdd="true"`; consistent with this repo's established commit history (single `feat` commit per task, not split RED/GREEN commits — see 04-01/04-02/04-04's precedent), tests and implementation were committed together after being verified green together._

## Files Created/Modified
- `packages/api-contracts/src/program.ts` - `CYCLE_KINDS`/`CycleKind` export, matching `LOAD_TYPES`'s shape
- `packages/api-contracts/src/sync.ts` - `routine_cycle` added to `SYNCED_TABLES` and `PUSH_APPLIED_TABLES`
- `packages/api-contracts/src/__tests__/program.test.ts` - `CYCLE_KINDS` tripwire tests, `SYNCED_TABLES` membership test
- `packages/api-contracts/src/__tests__/sync.test.ts` - updated pre-existing exact-membership assertions for the `routine_cycle` addition (Rule 1 fix, see Deviations)
- `apps/api/src/db/schema/program.ts` - `routineCycle` pgTable, `routineCycleRelations`, `cycles: many(routineCycle)` added to `routineRelations`
- `apps/api/src/db/schema.ts` - `routineCycle` exported from the barrel (import list, `export {}` block, `schema` object)
- `apps/mobile/lib/db/schema.ts` - `routineCycle` sqliteTable mirror, added to `drizzleSchema`
- `apps/mobile/lib/db/test-support.ts` - `routineCycle` imported and added to the manually-enumerated `drizzleSchemaV2` object (Rule 2 fix, see Deviations)
- `ops/powersync/sync-rules.yaml` - new `routine_cycle` query, same shape as `routine_day`
- `apps/api/test/schema-parity.e2e-spec.ts` - `routine_cycle` added to `REQUIRED_TABLES`/`REQUIRED_COLUMNS`, two new live-database cases
- `docs/program-vocabularies.md` - `CYCLE_KINDS` section filled in, replacing 04-04's placeholder
- `apps/api/src/sync/patch-update-set.ts` - `RoutineCycleValues`/`ROUTINE_CYCLE_PATCH_FIELDS`, `id`/`routineId` mapped to `null`
- `apps/api/src/sync/sync.service.ts` - `toRoutineCycleValues`, `isInvalidRoutineCycle`, `resolveRoutineIdForRoutineCycle`, `TABLE_MAP`/`AGGREGATE_RANK`/`rootFamilyOf`/`rootTypeByRootId` extended, batched parent-read query, insert branch
- `apps/api/test/program-sync.e2e-spec.ts` - new `routine_cycle sync (e2e)` describe block, 13 cases

## Decisions Made
- `CYCLE_KINDS` closed to exactly three values — see key-decisions above
- Deload/time-off position lives in `order_index`, never a position enum — resolves A-PROG-05's flagged assumption in favor of the "start or end of the program's cycle sequence" reading
- `duration_days` stays optional server-side even for `time_off` cycles — completeness is the builder's job (04-08), not a terminal server rejection
- The `rootTypeByRootId` registration is extended (`routine_day || routine_exercise || routine_cycle`) rather than duplicated into a parallel branch — one edit, three types covered, matching the plan's own `key_links` instruction

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `packages/api-contracts/src/__tests__/sync.test.ts`'s pre-existing exact-membership assertions broke when `routine_cycle` joined `PUSH_APPLIED_TABLES`**
- **Found during:** Task 1 (adding `routine_cycle` to `PUSH_APPLIED_TABLES`)
- **Issue:** `sync.test.ts` asserted the exact pre-plan membership of `PUSH_APPLIED_TABLES` (9 tables, no `routine_cycle`) — this plan's own intentional addition broke that assertion, the same situation 04-01/04-02/04-04's SUMMARYs documented for the same file on their own table additions.
- **Fix:** Updated the exact-membership assertion to include `routine_cycle`; added a dedicated "is applied, not deferred" case and an `isTerminalRejection('unknown_table', 'routine_cycle')` tripwire, matching the file's existing per-table pattern.
- **Files modified:** `packages/api-contracts/src/__tests__/sync.test.ts`
- **Verification:** `pnpm --filter @fitness/api-contracts test` — 78/78 passed
- **Committed in:** `cec8ebe` (Task 1 commit)

**2. [Rule 2 - Missing critical functionality] `apps/mobile/lib/db/test-support.ts`'s manually-enumerated `drizzleSchemaV2` did not include `routineCycle`**
- **Found during:** Task 1, following the plan's own explicit read-first instruction to check `test-support.ts`'s table enumeration
- **Issue:** `TestAppSchema` derives from the real `drizzleSchema` export (already correct once `routineCycle` was added there), but `drizzleSchemaV2` is a second, hand-built object for the schema-redefinition durability harness that does not import from `drizzleSchema` — it would have silently diverged from the real schema, one table short, exactly the drift the plan's own read-first note warned against.
- **Fix:** Imported `routineCycle` from `./schema` and added it to `drizzleSchemaV2`'s object literal, alongside the existing `routine`/`routineDay`/`routineExercise` entries.
- **Files modified:** `apps/mobile/lib/db/test-support.ts`
- **Verification:** `pnpm --filter mobile typecheck` exits 0
- **Committed in:** `cec8ebe` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — a pre-existing test invalidated by this plan's own intentional table addition; 1 missing-functionality fix — a schema-redefinition harness that would have silently drifted from the real schema, caught by following the plan's own read-first instruction)
**Impact on plan:** No scope creep. Both are direct, necessary consequences of this plan's own changes, caught before commit by typecheck/test runs rather than shipped and discovered later.

## Known Verify-Script Defect (not a deviation, not fixed)

Task 1's `<verify>` block includes:
```
test "$(grep -c '^ *- SELECT' ops/powersync/sync-rules.yaml)" = "$(grep -c 'auth.user_id()' ops/powersync/sync-rules.yaml)"
```
This equality was already false at this plan's starting commit (`217ed75`): 13 `SELECT` lines vs. 14 `auth.user_id()`-matching lines, because the file's own header comment (line 6) contains the literal substring `auth.user_id()` in prose, one line `grep -c` counts as a match. After this plan's addition the counts are 14 vs. 15 — the same pre-existing one-line offset, unrelated to `routine_cycle`. The check's actual intent — "every query in the file still filters on `auth.user_id()`" — is true by manual inspection of all 14 `SELECT` lines. Not fixed here: editing the header comment's prose to route around a grep miscount felt like gaming the check rather than fixing it, and the file is otherwise correct. Flagged for whoever next touches this verify script.

## Issues Encountered
- **Missing `.env` in this worktree** (inherited from every prior Phase 4 sync plan's note) — copied the existing dev `.env` from the main repo checkout (`/Users/tilbertbalaban/work/fitness/.env`) to run `db:push`/e2e suites against a real local Postgres; it remains untracked and was not committed.
- **No `node_modules` in this worktree at start** — `pnpm --filter @fitness/api-contracts build` triggered a full workspace `pnpm install` (1217 packages) before it could resolve; not a deviation, just the first build command in this worktree paying that one-time cost.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `routine_cycle` is live, synced, and fully push-applied — 04-07 (per-cycle target overrides via `routine_exercise_cycle_target`) and 04-08 (Cycle Strip UI) both have a real table and a real apply path to build on
- **Handoff to 04-07 (explicit, from this plan's own threat register T-04-32):** a cycle DELETE's `routine_exercise_cycle_target` children (not yet created — 04-07 creates that table) are not yet covered by this plan's child-tombstone gathering. 04-07 must extend the `routine_day` DELETE branch's child-tombstone pattern (`childRoutineExercises` in `sync.service.ts`) to also gather and tombstone `routine_exercise_cycle_target` rows cascaded by a `routine_cycle` DELETE, or a deleted override resurrects on the next pull.
- **Backstop, not observed:** the PowerSync Service has not been restarted against the updated `sync-rules.yaml` in this environment — pull-side delivery of `routine_cycle` rows is asserted only by the query's structural identity to the already-shipped `routine_day` query, not by an observed stream. Recorded as a WINDOWS `unrun-verify` entry below.
- `CYCLE_KINDS`/`isInvalidRoutineCycle`/the `routine_cycle_kind_check` constraint are the third vocabulary in this phase to follow the `load_type`/`ROUTINE_STATUSES` three-place-enforcement pattern (client contract, server validator, Postgres CHECK) — the next closed vocabulary this phase introduces should copy this shape rather than reinvent it

---
*Phase: 04-program-builder*
*Completed: 2026-08-21*

## Self-Check: PASSED

All modified files verified present on disk with the expected content (`packages/api-contracts/src/program.ts`'s `CYCLE_KINDS`, `apps/api/src/db/schema/program.ts`'s `routineCycle`, `apps/api/src/sync/sync.service.ts`'s `resolveRoutineIdForRoutineCycle`, this SUMMARY). Both task commits (`cec8ebe`, `8c8e6e8`) verified present in `git log`. Task 2 produced no code commit by design — it is a live database push + verification step whose target file (`apps/api/test/schema-parity.e2e-spec.ts`) was already committed in Task 1, and its live-database outcome was independently re-verified (`\d routine_cycle` showing the expected columns/constraint/index, a direct `INSERT ... kind = 'rest'` rejected, `db:verify` green with 18/18 cases) as part of this self-check.

## Deferred WINDOWS Entries

The orchestrator files these sequentially after the wave merges (parallel-execution `windows_ledger` note — this agent does not call `gsd_run windows append` directly).

- **kind:** unrun-verify — **file:** `ops/powersync/sync-rules.yaml` — **description:** The PowerSync Service has not been restarted against the updated sync rules in this environment, so pull-side delivery of `routine_cycle` rows is asserted only by the query's shape matching the shipped, already-verified `routine_day` query (identical JOIN/filter structure), not by an observed stream. Inherited standing limitation from every prior Phase 4 sync plan (04-01/04-02/04-04).
- **kind:** deviation — **file:** `apps/api/src/sync/sync.service.ts` — **description:** `T-04-32` (this plan's own threat register): a `routine_cycle` DELETE's future `routine_exercise_cycle_target` children (table created in 04-07) are not yet covered by child-tombstone gathering. 04-07 must extend the `routine_day` DELETE branch's pattern to also tombstone cascaded `routine_exercise_cycle_target` rows, or a deleted override resurrects on the next pull. Explicitly flagged in this plan's own threat model, carried forward here as a handoff note rather than a defect in this plan's own scope.
