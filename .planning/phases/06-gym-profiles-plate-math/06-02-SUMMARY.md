---
phase: 06-gym-profiles-plate-math
plan: 02
subsystem: plate-math
tags: [achievability, rounding, equipment-band, bigint, warmup, plate-math]

# Dependency graph
requires:
  - phase: 06-gym-profiles-plate-math
    provides: "@fitness/plate-math workspace package (resolveInventory + solvePlateBreakdown, bounded-knapsack) from 06-01"
provides:
  - "roundToAchievable/achievableBarbellLoads/achievableDumbbellLoads/achievableMachineLoads/nearestLoadable — the phase's single rounding authority (D-10)"
  - "resolveEquipmentBand/hasResolvableEquipment/EquipmentBandState — the one predicate the band and the Equipment action row share (R11)"
  - "solvePlateBreakdown's not_loadable kind now carries lowerKg/higherKg neighbours (D-13)"
  - "warmupSets' optional roundWeight closure, additive and byte-identical for every existing caller (D-10)"
affects: [06-gym-profiles-plate-math (later plans in this phase render PlateStrip/Equipment-band content off this contract), 08-progression-engine (D-09/D-10 hard contract on what its engine may emit)]

# Actuals (#2632)
actuals:
  tokens: 10160
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "toMilliKg/fromMilliKg bigint scale helpers duplicated privately per module (achievability.ts, solver.ts) rather than shared via export, matching the codebase's existing precedent (solver.ts's own comment re-implementing units.ts's private helpers) — keeps achievability.ts importable with zero dependency on solver.ts, so solver.ts -> achievability.ts stays a one-directional import with no cycle"
    - "Every not-loadable / no-match band state routes through nearestLoadable over the relevant achievable-set builder — one neighbour-finding code path shared by barbell, dumbbell and machine/cable, never three independent implementations"
    - "'No target typed yet' is resolved per equipment kind without a new union member: barbell defaults to the bar alone (a real solvePlateBreakdown outcome), dumbbell/machine treat it as a target of '0', landing on the same not_loadable/stack path a real out-of-range target would take"

key-files:
  created:
    - packages/plate-math/src/achievability.ts
    - packages/plate-math/src/band.ts
    - packages/plate-math/src/__tests__/achievability.test.ts
    - packages/plate-math/src/__tests__/band.test.ts
  modified:
    - packages/plate-math/src/solver.ts
    - packages/plate-math/src/index.ts
    - packages/plate-math/src/__tests__/solver.test.ts
    - packages/pr-rules/src/warmup.ts
    - packages/pr-rules/src/__tests__/warmup.test.ts
    - apps/mobile/components/__tests__/PlateStrip.test.tsx

key-decisions:
  - "solvePlateBreakdown's not_loadable variant gained lowerKg/higherKg fields (a shape change, not a new kind) — solver.ts now imports achievableBarbellLoads/nearestLoadable from achievability.ts rather than duplicating a second neighbour search, so the solver and the achievability module can never disagree about what is loadable."
  - "toMilliKg/fromMilliKg are duplicated privately in achievability.ts rather than exported from solver.ts and imported — this keeps the dependency direction one-way (solver.ts -> achievability.ts, band.ts -> both) with no import cycle, matching the existing precedent that these bigint-scale helpers are reimplemented per module rather than shared."
  - "Machine/cable selection in resolveEquipmentBand sorts candidates by name then id before taking the first match (GYM-03 ordering) — this sort lives in band.ts itself rather than resolveInventory, since resolveInventory (06-01, not touched by this plan) does not sort machines and ordering is only observable at this one call site within this plan's scope."

patterns-established:
  - "EquipmentBandState is pure data (plates/pair/stack/not_loadable/no_plates/collapsed) with no display strings and no unit conversion — PlateStrip owns formatting, this module stays usable from Phase 8 or any non-React consumer."
  - "resolveEquipmentBand's switch over EquipmentType ends in a `const exhaustive: never` default — appending a member to EQUIPMENT_TYPES without a case here is a compile error, never a silent fall-through to collapsed."

requirements-completed: [GYM-05, GYM-06]

coverage:
  - id: D1
    description: "roundToAchievable has no default rounding direction; a halfway target between two achievable loads resolves to the lower one"
    requirement: GYM-06
    verification:
      - kind: unit
        ref: "packages/plate-math/src/__tests__/achievability.test.ts (roundToAchievable describe block, including the @ts-expect-error no-default case)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A not-loadable barbell target names its two nearest achievable neighbours, with either side null when none exists on that side"
    requirement: GYM-06
    verification:
      - kind: unit
        ref: "packages/plate-math/src/__tests__/solver.test.ts (not_loadable cases with lowerKg/higherKg); packages/plate-math/src/__tests__/achievability.test.ts (nearestLoadable describe block)"
        status: pass
    human_judgment: false
  - id: D3
    description: "One resolveEquipmentBand function answers what the band shows for every equipment type, exhaustively over all twelve EQUIPMENT_TYPES members, and hasResolvableEquipment is the single shared predicate"
    requirement: GYM-05
    verification:
      - kind: unit
        ref: "packages/plate-math/src/__tests__/band.test.ts (all describe blocks; all twelve equipment types named)"
        status: pass
    human_judgment: false
  - id: D4
    description: "warmupSets accepts an optional gym-aware roundWeight closure with every existing caller byte-identical"
    requirement: GYM-06
    verification:
      - kind: unit
        ref: "packages/pr-rules/src/__tests__/warmup.test.ts (no-argument/undefined-argument parity case, per-step call case, zero-drop case)"
        status: pass
    human_judgment: false

duration: unknown — commit timestamps span 17:34-17:40 on 2026-08-27; investigation and design time preceding the first commit was not separately timestamped
completed: 2026-08-27
status: complete
---

# Phase 6 Plan 2: Achievability & Equipment Band Summary

**The phase's single rounding authority (`roundToAchievable`/`nearestLoadable`/three `achievableXLoads` builders) plus `resolveEquipmentBand`, the one function that decides what the equipment band shows across all twelve equipment types, and an additive `roundWeight` hook on `warmupSets`.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 10 (815 insertions, 14 deletions)
- **Commits:** 3

## Accomplishments

- `achievability.ts`: `roundToAchievable(targetKg, loads, direction)` with `RoundDirection` required and never defaulted (D-10), ties resolving down; `achievableBarbellLoads`/`achievableDumbbellLoads`/`achievableMachineLoads` computing the full achievable set per equipment kind in the same bigint milli-kg scale the solver uses; `nearestLoadable` for D-13's not-loadable neighbour pair.
- `solvePlateBreakdown`'s `not_loadable` kind now carries `lowerKg`/`higherKg`, computed via `nearestLoadable` over `achievableBarbellLoads` rather than a second neighbour search — the solver and the achievability module share one answer for what is loadable.
- `band.ts`: `resolveEquipmentBand` branches exhaustively over all twelve `EQUIPMENT_TYPES` members (a `never`-typed default makes a future appended type a compile error, not a silent collapse), returning a pure `EquipmentBandState` (`plates`/`pair`/`stack`/`not_loadable`/`no_plates`/`collapsed`) with no display strings or unit conversion. `hasResolvableEquipment(state)` is the single `state.kind !== 'collapsed'` predicate the band and the Equipment action row both read.
- Machine/cable selection in `resolveEquipmentBand` sorts candidates by name then id before taking the first match, giving deterministic, repeat-call-stable output when more than one machine shares an equipment type (GYM-03 ordering).
- `warmupSets` gained an optional third `roundWeight?: (rawKg: number) => number` parameter — every existing caller that omits it is byte-identical, including the ties-up rounding `roundToIncrement` still owns; a supplied closure replaces the increment-based rounding per step and a result at or below zero still drops that step.

## Task Commits

1. **Task 1: Achievability — the rounder, the achievable set, and the nearest neighbours**
   - `fd76970` feat(06-02): achievability rounder, achievable-set builders, not-loadable neighbours
2. **Task 2: One band predicate for the whole phase (R11)**
   - `d1cc513` feat(06-02): resolveEquipmentBand — one predicate for the whole equipment band (R11)
3. **Task 3: Warm-ups can round to a real gym's loads, without changing any existing caller**
   - `7bbf0cc` feat(06-02): warmupSets accepts an optional gym-aware roundWeight closure (includes the downstream PlateStrip.test.tsx fix, Rule 1)

**Plan metadata:** pending (final `docs(06-02): complete...` commit, made immediately after this SUMMARY commit)

## Files Created/Modified

- `packages/plate-math/src/achievability.ts` - `RoundDirection`, `roundToAchievable`, `nearestLoadable`, `isAchievable`, `achievableBarbellLoads`, `achievableDumbbellLoads`, `achievableMachineLoads`
- `packages/plate-math/src/band.ts` - `EquipmentBandState`, `resolveEquipmentBand`, `hasResolvableEquipment`
- `packages/plate-math/src/solver.ts` - `not_loadable`'s `lowerKg`/`higherKg` fields, `notLoadableWithNeighbours` helper
- `packages/plate-math/src/index.ts` - barrel exports for `achievability.ts`/`band.ts`
- `packages/plate-math/src/__tests__/{achievability,band,solver}.test.ts` - full behaviour-list coverage, including degenerate one-pair/no-pairs inventories and all twelve `EQUIPMENT_TYPES`
- `packages/pr-rules/src/warmup.ts` - `warmupSets`' optional `roundWeight` parameter; `DEFAULT_ROUNDING_INCREMENT_KG`'s comment updated to describe it as the last-resort fallback
- `packages/pr-rules/src/__tests__/warmup.test.ts` - no-argument parity, per-step `roundWeight` call, zero-drop cases
- `apps/mobile/components/__tests__/PlateStrip.test.tsx` - updated the `not_loadable`/`no_plates`/`unsupported` parametrized case for `not_loadable`'s new required fields

## Decisions Made

- **`toMilliKg`/`fromMilliKg` duplicated, not shared via export:** `achievability.ts` reimplements these bigint-scale helpers privately rather than having `solver.ts` export them, keeping the dependency direction one-way (`solver.ts` imports from `achievability.ts`, never the reverse) and avoiding an import cycle, while matching the codebase's existing precedent of reimplementing `units.ts`'s private helpers per module.
- **`not_loadable` gained fields, not a new kind:** the plan's behaviour list required `solvePlateBreakdown`'s existing `not_loadable` union member to carry neighbours; this was implemented as a shape addition to the existing kind (not a new kind, not a second type), keeping every prior consumer's `kind === 'not_loadable'` check correct.
- **Machine ordering lives in `band.ts`, not `inventory.ts`:** the plan's Task 2 action text asserted `resolveInventory` "already guarantees" a total machine order, but `resolveInventory` (06-01, outside this plan's `<files>`) only filters machines, it does not sort them. Rather than modify a file outside this plan's declared scope, the name-then-id sort was implemented locally in `resolveStackBand`, satisfying the plan's GYM-03 ordering must-have at the one point this plan makes machine order observable.
- **"No target yet" resolved without a new union member:** barbell/ez_bar default to the bar alone (a real `solvePlateBreakdown` outcome at `perSideTarget === 0`); dumbbell/machine treat an absent target as `'0'`, which lands on the same `not_loadable`/`stack` path an out-of-range or unmatched real target would take. This avoids fabricating a "recommended" weight before the user has typed anything, while still satisfying the must-have that a supported equipment type never resolves to `collapsed` before a target is entered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `PlateStrip.test.tsx`'s not_loadable/no_plates/unsupported parametrized case broke under `not_loadable`'s new required fields**
- **Found during:** Task 3, running `pnpm -w typecheck` per the task's own acceptance criteria
- **Issue:** Task 1's shape change to `PlateBreakdown`'s `not_loadable` variant (`lowerKg`/`higherKg` now required) broke a pre-existing `it.each(['not_loadable', 'no_plates', 'unsupported'])` test in `apps/mobile` that constructed bare `{ kind }` breakdown objects — a type error, not a runtime failure, but a genuine blocker to the workspace typecheck this task's acceptance criteria require.
- **Fix:** Changed the parametrized case to pass full per-kind objects (`{ kind: 'not_loadable', lowerKg: null, higherKg: null }` for the not-loadable row; bare `{ kind }` unchanged for the other two rows, which need no extra fields).
- **Files modified:** `apps/mobile/components/__tests__/PlateStrip.test.tsx`
- **Verification:** `pnpm -w typecheck` and `pnpm -w test` both exit 0; the PlateStrip suite's 8 tests (including the 3 parametrized rows) all pass.
- **Committed in:** `7bbf0cc`

---

**Total deviations:** 1 auto-fixed (1 Rule 1)
**Impact on plan:** The fix was a direct, necessary consequence of Task 1's own shape change and stayed within the touched file's existing test; no scope creep beyond the one file Task 1's change broke.

## Issues Encountered

**pnpm not on PATH in this worktree.** Neither `pnpm` nor a working `corepack pnpm` shim resolved in this sandboxed shell — `corepack pnpm` itself failed trying to shell out to a `pnpm` binary for its own deps-status check. Located the corepack-cached `pnpm.mjs` distribution directly (`~/.cache/node/corepack/v1/pnpm/11.9.0/dist/pnpm.mjs`) and invoked it via `node` for per-package commands. For the workspace-wide `pnpm -w typecheck`/`pnpm -w test` commands (which shell out to `turbo`, which in turn needs a `pnpm` binary on `PATH` to run per-package scripts), created a temporary executable shim at `.tmp-bin/pnpm` inside the worktree that forwards to the cached `pnpm.mjs`, prepended it to `PATH` for those two commands only, and deleted the shim directory immediately after — it was never staged or committed.

**For later executors in this repo:** if `pnpm`/`corepack pnpm` is unavailable in a worktree-isolated shell, `node <corepack-cache-path>/pnpm.mjs <args>` works directly for `--filter <pkg>` commands; workspace-wide `turbo`-backed scripts additionally need a `pnpm` name resolvable on `PATH` (a throwaway shim script forwarding to the same cached distribution, deleted before the final commit, is sufficient).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The phase's achievability contract is now complete and real: `roundToAchievable`, `nearestLoadable`, and the three `achievableXLoads` builders are the one place every consumer — the plate strip (06-05), warm-up generation (wired via `roundWeight`), tap-to-autofill prefill, and Phase 8's recommendation engine — must round through. `resolveEquipmentBand`/`hasResolvableEquipment` give 06-05/06-06 the one function and one predicate they need for the band's content and the Equipment action row's visibility. No blockers for the remaining plans in this phase.

## Self-Check: PASSED

All 4 created files confirmed tracked via `git status`; all 3 task commit hashes (fd76970, d1cc513, 7bbf0cc) confirmed present via `git log --oneline`.
