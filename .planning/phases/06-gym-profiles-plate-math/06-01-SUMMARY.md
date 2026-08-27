---
phase: 06-gym-profiles-plate-math
plan: 01
subsystem: sync
tags: [gym-profiles, plate-math, powersync, drizzle, nestjs, react-native-web, playwright]

# Dependency graph
requires:
  - phase: 05-progressive-overload-tracking
    provides: personal_record sync push path (the singleton-root precedent this plan's equipment_profile push case mirrors)
provides:
  - "@fitness/plate-math workspace package: resolveInventory + solvePlateBreakdown (bounded-knapsack, D-15)"
  - equipment-profile wire contract (option-a JSON shape) in @fitness/api-contracts
  - seed-on-first-need default equipment profile, stamped onto workout_session at start (D-04/D-17/D-19)
  - PlateStrip rendered live in Phase 5's reserved NumericKeypad band
  - equipment_profile server-side sync push case (T-06-01 ownership enforcement)
affects: [06-gym-profiles-plate-math (later plans in this phase share the sync.service.ts push path and the ROOT_TABLE_BY_TYPE/SINGLETON_ROOT_TYPES registration pattern), 09-retrospective-reconciliation]

# Actuals (#2632)
actuals:
  tokens: 28950
  tasks: 3
  commits: 9

# Tech tracking
tech-stack:
  added: ["@fitness/plate-math (new internal workspace package, no external deps beyond @fitness/api-contracts)"]
  patterns:
    - "Bounded-knapsack plate solver in bigint milli-kg, never floats (D-15)"
    - "Snapshot-on-use: workout_session.equipment_profile_id stamped once at session start, never re-read live (D-04/D-17)"
    - "Seed-on-first-need: ensureDefaultEquipmentProfile idempotently seeds a default profile the first time a userId needs one (D-19)"
    - "Sixth singleton sync root: equipment_profile registered in TABLE_MAP/ROOT_TABLE_BY_TYPE/SINGLETON_ROOT_TYPES/AGGREGATE_RANK, mirroring personal_record's ownership shape exactly, including the easy-to-miss existingXRoots ownership query"

key-files:
  created:
    - packages/api-contracts/src/equipment.ts
    - packages/plate-math/src/{inventory.ts,solver.ts,index.ts}
    - apps/mobile/lib/db/equipment-profiles.ts
    - apps/mobile/components/PlateStrip.tsx
    - apps/mobile/e2e/plate-strip.spec.ts
    - apps/api/test/equipment-profile-sync.e2e-spec.ts
  modified:
    - apps/mobile/lib/db/{log-set,session-lifecycle,history-mutations,session-query}.ts
    - apps/mobile/app/(tabs)/{workout,history}.tsx
    - apps/mobile/components/NumericKeypad.tsx
    - apps/api/src/sync/{patch-update-set,sync.service}.ts
    - packages/api-contracts/src/sync.ts

key-decisions:
  - "Task 1 checkpoint (equipment-profile wire shape) was resolved by the orchestrator before execution began: option-a — objects for all three JSONB columns (available_plates as {weightKg, pairCount}[], dumbbell_increments_kg as {weightKg}[], machine_availability as full machine records), unavailable refs as a 3-branch union. Auto-approved as a technical schema decision, not surfaced as a UI/UX question."
  - "Added the missing existingEquipmentProfileRoots ownership query in sync.service.ts's applyBatch (~line 1420) — a Rule 2 deviation. The plan's Task 3 action text named four registration points (TABLE_MAP, ROOT_TABLE_BY_TYPE, SINGLETON_ROOT_TYPES, AGGREGATE_RANK) but the ownership-resolution block is NOT generic over those maps — it is one hardcoded per-root-type query (existingPersonalRecordRoots, existingUserExercisePreferenceRoots, etc.) feeding existingOwnerByRoot. Without equipment_profile's own entry there, existingOwnerByRoot.get(aggregateKey('equipment_profile', root)) would always return undefined for an EXISTING row, which the surrounding code treats as owner === undefined -> adopted by the pusher (the exact CR-01 push-hijack class the comments at that call site warn about for every other root type). This is load-bearing for T-06-01 (ownership enforcement) and is easy to miss again: any later plan in this phase that registers a new sync root must add its own existingXRoots query at this exact call site, not just the four maps."

patterns-established:
  - "Equipment-profile JSON columns pass through sync.service.ts pre-validated, never re-validated at the values-shaping step — hasInvalidField (isEquipmentProfilePlates/isEquipmentDumbbellIncrements/isEquipmentMachineAvailability) is the single validation gate, toEquipmentProfileValues only reshapes."
  - "barbellWeightKg reuses normalizeWeightKg (logged_set's own nullable-decimal-string helper) rather than a new one — same 'never a binary float' contract, same shape."

requirements-completed: [GYM-01, GYM-02, GYM-04, GYM-05]

coverage:
  - id: D1
    description: "A user with no configured gym gets exactly one seeded 'My Gym' profile the first time a session starts, and the session row carries its id"
    requirement: GYM-01
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/equipment-profiles.test.ts"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/plate-strip.spec.ts (a user with no configured gym gets exactly one seeded profile, and the session points at it)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A loadable barbell weight typed on the keypad renders its per-side plate stack in Phase 5's reserved band"
    requirement: GYM-02
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/PlateStrip.test.tsx"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/plate-strip.spec.ts (a typed barbell weight the seeded gym can load renders the real plate breakdown)"
        status: pass
    human_judgment: true
    rationale: "The plan's own <verification> list carries a <human-check> for this exact deliverable (band renders, keypad digit grid unmoved) — visual layout confirmation is not something the automated suite can assert."
  - id: D3
    description: "The breakdown honours recorded pair counts, proven by a one-pair inventory case"
    requirement: GYM-04
    verification:
      - kind: unit
        ref: "packages/plate-math/src/__tests__/solver.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "A gym profile round-trips to Postgres under the authenticated user, and a malformed inventory is rejected"
    requirement: GYM-05
    verification:
      - kind: integration
        ref: "apps/api/test/equipment-profile-sync.e2e-spec.ts (4 cases: create, partial patch, malformed rejection, ownership)"
        status: pass
    human_judgment: false

duration: unknown — session was paused mid-plan by a checkpoint (missing DATABASE_URL in this worktree) and resumed later; commit timestamps for the final resumed segment span 15:04-15:17 on 2026-08-27, but that excludes the earlier segment before the pause
completed: 2026-08-27
status: complete
---

# Phase 6 Plan 1: Gym Profiles & Plate Math Tracer Summary

**End-to-end tracer proving the whole Phase 6 architecture: a user with no configured gym starts a workout, types a barbell weight, sees a real per-side plate breakdown computed from a real `equipment_profile` row that round-trips to Postgres under the authenticated user's own id.**

## Performance

- **Tasks:** 3/3 completed (Task 1 checkpoint pre-resolved by the orchestrator, Task 2 tracer, Task 3 server sync leg)
- **Files modified:** 33 (2040 insertions, 30 deletions, excluding `pnpm-lock.yaml`)
- **Commits:** 9

## Accomplishments

- New `@fitness/plate-math` workspace package: `resolveInventory` merges an equipment profile with per-session unavailable refs, `solvePlateBreakdown` does an exact bounded-knapsack DFS in bigint milli-kg respecting recorded `pairCount`, never a greedy approximation and never a float.
- `packages/api-contracts/src/equipment.ts`: the full option-a wire contract for the three JSONB equipment-profile columns, with fail-closed length-bounded validators (T-06-02) and `isExactDecimalString` enforcing the same decimal contract `parseDecimalToFraction` enforces (T-06-03).
- Seed-on-first-need: `ensureDefaultEquipmentProfile` idempotently seeds a "My Gym" profile the first time a `userId` needs one; every session-start path (`startWorkoutFromProgram`, `startOneOffSession`, `duplicateSession`, `startBackfilledSession`) resolves and stamps `workout_session.equipment_profile_id` once at session start (snapshot-on-use, D-04/D-17).
- `PlateStrip` renders a real per-side plate breakdown live in Phase 5's reserved `NumericKeypad` band, driven by the session's resolved inventory and the currently-typed weight.
- Real browser e2e proof (`apps/mobile/e2e/plate-strip.spec.ts`) against a live `@powersync/web` database: a loadable typed weight renders the real breakdown, and a fresh user gets exactly one auto-seeded default profile the session then points at.
- Server-side sync push case: `equipment_profile` is now a sixth singleton sync root (`sync.service.ts`), with its own `server_seq`, ownership always taken from the authenticated session (never `data.user_id`), full field validation delegating to the Task 2 contract validators, and a real e2e proof against Postgres (`apps/api/test/equipment-profile-sync.e2e-spec.ts`) covering create, partial PATCH preserving untouched JSON, malformed-payload rejection, and the ownership assertion.
- `equipment_profile` moved from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES` in `packages/api-contracts/src/sync.ts` — only Phase 12's two tables (`body_metric`, `progress_photo`) remain deferred.

## Task Commits

Task 1 (checkpoint:decision, "lock the equipment-profile wire shape") carried no `<action>`/files of its own — it was pre-resolved by the orchestrator as `option-a` before execution began and is folded into Task 2's contract commit below.

1. **Task 2: End-to-end tracer**
   - `754c982` feat(06-01): equipment-profile wire contract (option-a JSON shape)
   - `b734a9c` feat(06-01): plate-math solver package
   - `50b1106` feat(06-01): seed-on-first-need equipment profile, stamp session at start (D-04/D-17/D-19)
   - `872dc22` feat(06-01): PlateStrip component in NumericKeypad's reserved band
   - `9e69ee8` feat(06-01): resolve inventory and render live plate breakdown in workout screen
   - `4d7171c` test(06-01): real browser e2e proof for the plate-math tracer
2. **Task 3: The server leg — equipment_profile reaches Postgres**
   - `a7f6519` feat(06-01): equipment_profile push case in the sync service (T-06-01)
   - `e1a1d2c` feat(06-01): move equipment_profile from PUSH_DEFERRED_TABLES to PUSH_APPLIED_TABLES
   - `84f9ff0` test(06-01): equipment_profile sync e2e proof

**Plan metadata:** pending (final `docs(06-01): complete...` commit, made immediately after this SUMMARY commit)

## Files Created/Modified

- `packages/api-contracts/src/equipment.ts` - option-a wire contract: types, `isEquipmentProfilePlates`/`isEquipmentDumbbellIncrements`/`isEquipmentMachineAvailability`/`isUnavailableEquipmentRefs`, `serializeEquipmentJson`/`parseEquipmentJson`
- `packages/plate-math/src/{inventory.ts,solver.ts,index.ts}` - `resolveInventory`, `solvePlateBreakdown` (bounded DFS knapsack)
- `apps/mobile/lib/db/equipment-profiles.ts` - `ensureDefaultEquipmentProfile`, `loadEquipmentProfile`, `loadActiveEquipmentProfileId`, `setActiveEquipmentProfile`
- `apps/mobile/lib/db/{log-set,session-lifecycle,history-mutations,session-query}.ts` - session-start paths stamp `equipmentProfileId`; `LiveSessionRow` carries it
- `apps/mobile/app/(tabs)/{workout,history}.tsx` - workout screen resolves inventory and renders the plate band; `startBackfilledSession` threads `userId`
- `apps/mobile/components/{PlateStrip,NumericKeypad}.tsx` - the plate-breakdown component and its reserved-band integration
- `apps/mobile/app/__durability.web.tsx`, `apps/mobile/lib/db/test-support.ts`, `apps/mobile/e2e/plate-strip.spec.ts`, `apps/mobile/playwright.config.ts` - e2e harness and proof
- `apps/api/src/sync/patch-update-set.ts` - `EquipmentProfileValues`/`EQUIPMENT_PROFILE_PATCH_FIELDS`
- `apps/api/src/sync/sync.service.ts` - `EquipmentProfileOpData`, `toEquipmentProfileValues`, table registrations, `hasInvalidField` branch, push branch, ownership query
- `packages/api-contracts/src/sync.ts` - `equipment_profile` moved to `PUSH_APPLIED_TABLES`
- `apps/api/test/equipment-profile-sync.e2e-spec.ts` - 4-case real-Postgres proof

## Decisions Made

- **Task 1 (equipment-profile wire shape):** resolved as `option-a` by the orchestrator before execution — objects for all three JSONB columns, unavailable refs as a 3-branch discriminated union. A technical schema decision, auto-approved rather than surfaced as a checkpoint.
- **Ownership-query gap (Rule 2, T-06-01):** the plan's Task 3 action text named four registration maps as sufficient to wire a new sync root, but `sync.service.ts`'s ownership-resolution block is not generic over those maps — each singleton/aggregate root has its own hardcoded `existingXRoots` query feeding `existingOwnerByRoot`. Added `existingEquipmentProfileRoots`, mirroring `personal_record`'s exactly (userId NOT NULL, same shape). Omitting this would have let any push targeting an *existing* `equipment_profile` id silently adopt that row under the pusher, regardless of its true owner — the CR-01 hijack class every other root in this file is explicitly guarded against. Flagged here because later plans in this phase (and any future plan registering a new sync root anywhere in the codebase) will hit the same trap if they only follow the four-map instruction literally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Missing `existingEquipmentProfileRoots` ownership query**
- **Found during:** Task 3, while implementing the `equipment_profile` push case
- **Issue:** The plan's action text specified registering `equipment_profile` in `TABLE_MAP`, `ROOT_TABLE_BY_TYPE`, `SINGLETON_ROOT_TYPES` and `AGGREGATE_RANK`, but `applyBatch`'s ownership-resolution block queries each root type's existing rows individually and feeds them into `existingOwnerByRoot` — a fifth, unnamed integration point. Without it, ownership resolution for an existing `equipment_profile` row would always read as "no such row" and silently adopt it for the pusher (T-06-01's exact threat).
- **Fix:** Added `equipmentProfileRootIds`, the `existingEquipmentProfileRoots` query (mirroring `personal_record`'s NOT-NULL-owner shape), and its `existingOwnerByRoot` entry, in `apps/api/src/sync/sync.service.ts`.
- **Files modified:** `apps/api/src/sync/sync.service.ts`
- **Verification:** the ownership e2e case (`a PUT whose payload names a DIFFERENT user's user_id is still stored against the pusher's id`) exercises the new-row path; the query itself is exercised implicitly by the PATCH case (an existing row, re-pushed, must resolve to its real owner) — both pass.
- **Committed in:** `a7f6519`

**2. [Rule 1 - Bug] Pre-existing `sync.test.ts` assertions hardcoded `equipment_profile` as the deferred-table example**
- **Found during:** Task 3, running `packages/api-contracts` unit tests after moving the table between lists
- **Issue:** Two tests in `sync.test.ts` asserted `isTerminalRejection('unknown_table', 'equipment_profile')` is `true` and enumerated `equipment_profile` as *not* in `PUSH_APPLIED_TABLES` — both now contradict the deliberate contract change this task makes.
- **Fix:** Updated the "contains exactly..." enumeration to include `equipment_profile`; swapped the deferred-table example to `body_metric` (now the actual remaining deferred table); added the `equipment_profile is applied, not deferred` parity test matching the convention every other phase-completing table already carries.
- **Files modified:** `packages/api-contracts/src/__tests__/sync.test.ts`
- **Verification:** `pnpm --filter @fitness/api-contracts test` — 131/131 passing.
- **Committed in:** `e1a1d2c`

---

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 1)
**Impact on plan:** Both fixes are necessary for correctness/security within the exact files the plan already scoped to this task. No scope creep — no new files touched beyond the plan's `<files>` list for Task 3, plus the one pre-existing test file the contract change broke.

## Issues Encountered

**Checkpoint pause: `DATABASE_URL` unreachable in this worktree.** Git worktrees do not carry untracked/gitignored files — `.env` existed in the main checkout but not in this worktree, so `apps/api`'s `db:push`/e2e harness had no `DATABASE_URL`. The Read tool confirmed `apps/api/.env` exists but is denied by permission settings (not "file not found"), and no credentials were guessed. Per the plan's own `<precondition>` text ("a missing `DATABASE_URL` halts the task") and the executor's precondition protocol, execution halted with a `checkpoint:human-verify` after Task 2 was fully committed and Task 3's code was written (typechecked clean, unit-tested where possible) but left uncommitted. The orchestrator copied `/Users/tilbertbalaban/work/fitness/.env` and `apps/mobile/.env` into this worktree (still gitignored, never committed) and resumed execution, at which point `db:push` and the full e2e suite ran cleanly.

**For later executors/plans in this repo:** if an `apps/api` e2e suite halts on a missing `DATABASE_URL` inside a worktree-isolated agent, the fix is not a code change — copy the gitignored `.env` (and `apps/mobile/.env` if the mobile durability suite is also needed) from the main checkout into the worktree root and `apps/api/` before resuming. This is an infrastructure gap in worktree provisioning, not something a plan or its executor should try to work around by constructing/guessing a connection string.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The whole Phase 6 vertical slice is proven end-to-end: contract → solver → client seed/stamp → UI → server sync. Later plans in this phase (multi-gym switching, per-machine availability editing, equipment-type unavailability) build directly on `packages/plate-math`, `equipment-profiles.ts`'s seed/stamp pattern, and the `sync.service.ts` singleton-root registration this plan established — including the ownership-query gap called out above, which any new sync root in this phase must also close.
