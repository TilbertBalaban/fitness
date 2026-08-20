---
phase: 04-program-builder
plan: 02
subsystem: sync
tags: [nestjs, drizzle, powersync, react-native, jest, sync-protocol, order-index]

# Dependency graph
requires:
  - phase: 04-program-builder (04-01)
    provides: The routine aggregate root's server-side apply path and the AGGREGATE_ROOT_TYPES/ROOT_TABLE_BY_TYPE/rootFamilyOf seam this plan extends with routine_day/routine_exercise; the Programs tab's create/list screen this plan grows into a program-detail view
provides:
  - A server-side push apply path for routine_day and routine_exercise, ownership resolved through the full two-hop chain to routine.user_id, reparenting blocked at both hops
  - Gap-based order_index arithmetic (ORDER_INDEX_GAP=1024) and the day/exercise write helpers built on it — a reorder writes one row except the single documented exhausted-gap renumber
  - loadProgramTree — the single read path opening a whole program (routine, days, exercises) in exactly three local queries
  - The Programs tab renders a selected program's named days and their exercises, with add/rename/remove day and remove-exercise controls
affects: [04-03-target-entry, 04-05-day-deck-and-drag-handle, 04-06-cycles, 04-08-cycle-strip, 04-11-programs-library]

# Actuals (#2632)
actuals:
  tokens: 23872
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-hop chain resolution: resolveRoutineDayIdForRoutineExercise -> resolveRoutineIdForRoutineDay, mirroring the session_exercise/logged_set batched-parent-read shape one level deeper — the pattern every later multi-hop child table in this phase (routine_exercise_cycle_target, 04-06) extends"
    - "Gap-based order_index (ORDER_INDEX_GAP=1024): appendOrderIndex/midpointOrderIndex/needsRenumber/renumberOrderIndexes/sortByOrderThenId in order-index.ts — the one arithmetic module every ordered write helper and every read path's sort seeds from"
    - "loadProgramTree's optional pre-built exercise-name-map argument: a caller loads the catalog union once (loadExerciseNameMap) and passes it in, keeping the tree read's own query count at exactly one per table regardless of how many times the tree reloads"

key-files:
  created:
    - apps/mobile/lib/db/programs/order-index.ts
    - apps/mobile/lib/db/programs/days.ts
    - apps/mobile/lib/db/programs/load-program.ts
    - apps/mobile/lib/db/__tests__/order-index.test.ts
  modified:
    - apps/api/src/sync/sync.service.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/test/program-sync.e2e-spec.ts
    - packages/api-contracts/src/sync.ts
    - packages/api-contracts/src/__tests__/sync.test.ts
    - apps/mobile/lib/db/__tests__/programs.test.ts
    - apps/mobile/app/(tabs)/programs.tsx
    - apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts

key-decisions:
  - "Ordering resolved as integer gaps (ORDER_INDEX_GAP=1024), not fractional indices — order_index is already integer NOT NULL on both Postgres and SQLite, so gaps need no column widening, no change to sync.service.ts's isNonNegativeInteger validator, and no divergence from session_exercise.order_index. Fractional was considered and rejected on that basis."
  - "A blank target (all five target_* null) means deliberately unprescribed, renders as an em dash, and an exercise may be saved with no targets at all — settled structurally in loadProgramTree (values pass through unchanged) and in formatSlotTargets (null renders '—', never 0)."
  - "No zustand introduced. The candidates CONTEXT.md named (selected day, expanded row, picker multi-select state) are all local to one screen and die with it; component state is sufficient. This plan sets the precedent for Phases 5-11."
  - "formatSlotTargets (this plan's interim day-list row) collapses an equal rep min/max to one number ('3 x 8'), per this plan's own explicit action text and test cases. 04-UI-SPEC.md's Exercise Slot Row (a later, different component shipping in 04-03) explicitly does the opposite for its own collapsed summary line ('8-8', never collapsed). Both are correct for their own component — recorded here so 04-03 does not read this plan's formatSlotTargets as precedent for its own summary format."
  - "PROG-01 is now marked complete: named training days are addable, renameable, and removable through the Programs tab UI. PROG-02 stays unchecked — addExercisesToDay and moveExercise exist as write helpers but have no UI entry point yet (04-03 wires target entry and the exercise picker, 04-05 wires the drag handle); only remove-exercise is reachable by the user today, so 'add, remove, and reorder' is not yet a true statement."

patterns-established:
  - "Pattern: order-index.ts is pure and synchronous with no database import — every later ordered write helper (cycle rows, 04-06) imports its arithmetic rather than reimplementing gap math"
  - "Pattern: a reorder helper reads siblings in one select, computes the full update set in a pure function, then issues one update per row that actually changed — never renumber-then-midpoint as two separate writes"

requirements-completed: [PROG-01]

coverage:
  - id: D1
    description: "Server-side push apply path for routine_day and routine_exercise: ownership resolved through the two-hop chain to routine.user_id, reparenting blocked at both hops, empty/malformed fields rejected invalid_field, unresolvable parents rejected missing_parent"
    requirement: "PROG-01"
    verification:
      - kind: e2e
        ref: "apps/api/test/program-sync.e2e-spec.ts#routine_day / routine_exercise sync (e2e)"
        status: pass
      - kind: e2e
        ref: "apps/api/test/sync-push.e2e-spec.ts, apps/api/test/sync-aggregate.e2e-spec.ts (regression)"
        status: pass
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/sync.test.ts#PUSH_APPLIED_TABLES / PUSH_DEFERRED_TABLES partition"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gap-based order_index arithmetic and the day/exercise write helpers built on it — a non-renumbering move writes one row, an exhausted-gap move renumbers only the siblings whose index actually changed"
    requirement: "PROG-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/order-index.test.ts (16 cases, every boundary asserted)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#addDay, #addExercisesToDay, #moveExercise, #moveDay, #removeExercise, #removeDay, #renameDay"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadProgramTree opens a whole program (routine, days, exercises) in exactly three local queries, sorted deterministically, with an unresolvable exercise falling back to 'Unknown exercise' rather than failing the day"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#loadProgramTree (7 cases including the 3-day/12-exercise query-count assertion)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Programs tab shows a selected program's named days and exercises with add/rename/remove day and remove-exercise controls, and an unset target renders as an em dash"
    requirement: "PROG-01"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#formatSlotTargets (4 cases)"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) — /programs route bundles"
        status: pass
    human_judgment: true
    rationale: "No simulator/emulator/device available in this worktree (no Xcode, no Android SDK) — the screen's actual on-device rendering and touch behavior have not been observed. Recorded as a WINDOWS unrun-verify entry (inherited from 04-01), deferred to ROADMAP Phase 999.1."

duration: 40min
completed: 2026-08-20
status: complete
---

# Phase 4 Plan 02: Routine Day and Exercise Tree Summary

**Server-side apply path for `routine_day`/`routine_exercise` through the full two-hop ownership chain, gap-based `order_index` arithmetic (1024-multiples) backing new day/exercise write helpers, and a builder read path that opens a whole program in exactly three local queries.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-20T19:40:00+03:00 (approx.)
- **Completed:** 2026-08-20T20:02:32+03:00
- **Tasks:** 3
- **Files modified:** 12 (4 created, 8 modified)

## Accomplishments
- `routine_day` and `routine_exercise` left `PUSH_DEFERRED_TABLES` for `PUSH_APPLIED_TABLES` — both now produce real Postgres rows, with ownership resolved through `routine_exercise -> routine_day -> routine`, the deepest ownership chain in the codebase. A `routine_day` op naming another user's routine, and a `routine_exercise` op naming another user's day, are both rejected `not_owner`; an existing `routine_exercise` row cannot be reparented onto a different day by simply naming a different `routine_day_id` — stored linkage always wins
- Found and fixed a real bug while extending `rootTypeByRootId`: a batch containing only a `routine_day`/`routine_exercise` op (no literal `routine` op) would have had its root misclassified as a `workout_session` root by the existing default, sending the ownership lookup to the wrong table and turning the `not_owner` cross-user case into an incorrect `missing_parent`. Fixed before it could ship, verified by the not_owner e2e cases
- `order-index.ts` resolves CONTEXT.md's `order_index` discretion item: integer gaps (`ORDER_INDEX_GAP = 1024`), not fractional indices, with every arithmetic branch (append, midpoint, exhausted gap, renumber, tie-break) unit-asserted at its exact boundary
- `days.ts` ships `addDay`/`renameDay`/`removeDay`/`moveDay`/`addExercisesToDay`/`removeExercise`/`moveExercise`, each behind the `db: WriteDb = getPowerSync()` injection seam; a non-renumbering move writes exactly one row, an exhausted-gap move renumbers only the siblings whose index actually changed
- `load-program.ts` ships `loadProgramTree`, the single read path opening a whole program tree in exactly three local queries — never a query per day or per exercise — with an exercise name resolved from an optional pre-built map so a caller loads the catalog union once
- The Programs tab grows from a flat program list into a program-detail view: tapping a program (or having exactly one) opens its day list with a working Add Day / rename-in-place / remove-day / remove-exercise UI, each reloading the tree after write
- `formatSlotTargets` makes the null-target contract visible: an em dash when everything is unset, never a zero, with present components joined by a middle dot

## Task Commits

Each task was committed atomically:

1. **Task 1: Days and exercises get a server-side apply path with two-hop ownership** - `6040d10` (feat)
2. **Task 2: Gap-based ordering, and the write helpers that build a day** - `1e7e3b8` (feat)
3. **Task 3: The builder opens the whole program in three queries and renders its days** - `b54fd24` (feat)

_Note: all three tasks carried `tdd="true"`; consistent with this repo's established commit history (single `feat` commits per task, not split RED/GREEN commits — see 04-01's precedent), tests and implementation were committed together after being verified green together._

## Files Created/Modified
- `apps/api/src/sync/patch-update-set.ts` - `RoutineDayValues`/`RoutineExerciseValues` + their `*_PATCH_FIELDS` maps, identity/parent fields mapping to `null`
- `apps/api/src/sync/sync.service.ts` - `toRoutineDayValues`/`toRoutineExerciseValues`, `isInvalidRoutineDay`/`isInvalidRoutineExercise`, the two-hop resolvers, `TABLE_MAP`/`AGGREGATE_RANK`/`rootFamilyOf` extended, `rootTypeByRootId` fixed for the routine-only-batch case, routine_day DELETE cascade tombstoning, two new insert branches
- `apps/api/test/program-sync.e2e-spec.ts` - 12 new e2e cases covering every `<behavior>` bullet
- `packages/api-contracts/src/sync.ts` - `routine_day`/`routine_exercise` moved to `PUSH_APPLIED_TABLES`
- `packages/api-contracts/src/__tests__/sync.test.ts` - updated classification assertions, added coverage for the moved tables
- `apps/mobile/lib/db/programs/order-index.ts` - new: `ORDER_INDEX_GAP`, `appendOrderIndex`, `midpointOrderIndex`, `needsRenumber`, `renumberOrderIndexes`, `sortByOrderThenId`
- `apps/mobile/lib/db/programs/days.ts` - new: `addDay`, `renameDay`, `removeDay`, `moveDay`, `addExercisesToDay`, `removeExercise`, `moveExercise`
- `apps/mobile/lib/db/programs/load-program.ts` - new: `loadProgramTree`, `loadExerciseNameMap`, `ProgramTree`, `ProgramDay`, `ProgramSlot`
- `apps/mobile/lib/db/__tests__/order-index.test.ts` - new: 16 pure-function boundary cases
- `apps/mobile/lib/db/__tests__/programs.test.ts` - extended: `addDay`, `addExercisesToDay`, `moveExercise`, `moveDay`, `removeExercise`, `removeDay`, `renameDay`, `loadProgramTree` (7 cases)
- `apps/mobile/app/(tabs)/programs.tsx` - grown from program list into program-detail view with day/exercise controls; exports `formatSlotTargets`
- `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` - extended: 4 `formatSlotTargets` cases

## Decisions Made
- Integer gaps over fractional indices for `order_index` — no schema change, no validator change, no divergence from `session_exercise.order_index`'s existing integer column
- `formatSlotTargets` collapses an equal rep min/max to one number, per this plan's own action text and test cases — this differs from 04-UI-SPEC.md's Exercise Slot Row (a later, different component shipping in 04-03), which explicitly keeps the range visible even when min equals max. Both are correct for their own surface; recorded so 04-03 does not read this plan's function as precedent
- No `zustand` — component state is sufficient for this phase's UI state; the precedent Phases 5-11 inherit
- PROG-01 marked complete; PROG-02 deliberately left unchecked (see coverage/key-decisions above) — add and reorder exist as write helpers with no UI entry point yet

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `rootTypeByRootId`'s default misclassifying a routine-day-only batch's root**
- **Found during:** Task 1 (extending root resolution for `routine_day`/`routine_exercise`)
- **Issue:** `rootTypeByRootId` only registered a root's type from a literal op in `AGGREGATE_ROOT_TYPES`/`SINGLETON_ROOT_TYPES`. A batch containing *only* a `routine_day` (or `routine_exercise`) op — no literal `routine` op — would leave that root's real id unregistered, and the existing-owner lookup's `rootTypeByRootId.get(id) ?? 'workout_session'` default would misroute it to the `workout_session` table. The ownership check would then find no row there, resolve `owner === undefined`, and reject `missing_parent` instead of the correct `not_owner` — exactly the scenario the plan's own cross-user `routine_day`/`routine_exercise` e2e cases exercise.
- **Fix:** Extended the `rootTypeByRootId` build loop to also register `'routine'` for any root a `routine_day`/`routine_exercise` op resolves to, using the already-computed `rootByOpId` map — no extra query.
- **Files modified:** `apps/api/src/sync/sync.service.ts`
- **Verification:** The two not_owner e2e cases (`rejects user B's routine_day PUT...`, `rejects user B's routine_exercise PUT...`) pass; both push a batch with only the child op, no accompanying `routine` op, so this exact path is exercised
- **Committed in:** `6040d10` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — found and fixed during implementation, before any commit; caught by this plan's own test design rather than shipped and discovered later)
**Impact on plan:** No scope creep; a direct correctness requirement of the two-hop ownership chain the plan itself specifies (T-04-07/T-04-08 in the threat register).

## Issues Encountered
- **Missing `.env` in this worktree** (inherited from 04-01's note) — copied the existing dev `.env` from the main repo checkout (`/Users/tilbertbalaban/work/fitness/.env`) to run the e2e suites against a real local Postgres; it remains untracked and was not committed.
- **`@fitness/api-contracts` needed a fresh build** (`pnpm --filter @fitness/api-contracts build`) before `pnpm --filter api typecheck`/`test:e2e` could resolve the package — its `dist/` output wasn't already built in this worktree. Not a deviation, just an ordering step; documented here in case a future execution hits the same "Cannot find module '@fitness/api-contracts'" error.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The two-hop ownership chain (`routine_exercise -> routine_day -> routine`) and the anti-reparenting guarantee at both hops are proven and ready for 04-06's `routine_cycle`/`routine_exercise_cycle_target` (a third and fourth hop) to extend.
- `order-index.ts`'s gap arithmetic is the one module every later ordered write helper (cycle rows, 04-06) must seed from — do not introduce a second `1024` literal anywhere else.
- `loadProgramTree` is the single read path the builder screen, the cycle strip (04-08) and the next-up card (04-09) will all call — extending it (not reimplementing it) is what keeps the three-query budget real.
- **Blocker/concern:** No Xcode/Android SDK on this machine — the Programs tab's native rendering and touch behavior remain unverified, same standing limitation as 04-01. Deferred to ROADMAP Phase 999.1.
- **Backstop, not observed:** two-device offline-reorder convergence for the gap scheme is reasoned from the arithmetic and the row-level-LWW model, not exercised end-to-end (one device, no second runtime in this worktree). Recorded in `.planning/WINDOWS.md` as a `deviation` entry.

---
*Phase: 04-program-builder*
*Completed: 2026-08-20*

## Self-Check: PASSED

All created files verified present on disk (`apps/mobile/lib/db/programs/order-index.ts`,
`apps/mobile/lib/db/programs/days.ts`, `apps/mobile/lib/db/programs/load-program.ts`,
`apps/mobile/lib/db/__tests__/order-index.test.ts`, this SUMMARY). All three task commits
(`6040d10`, `1e7e3b8`, `b54fd24`) verified present in `git log`.
