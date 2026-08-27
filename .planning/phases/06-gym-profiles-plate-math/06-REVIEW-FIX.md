---
phase: 06-gym-profiles-plate-math
fixed_at: 2026-08-27T20:18:42Z
review_path: .planning/phases/06-gym-profiles-plate-math/06-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-08-27T20:18:42Z
**Source review:** .planning/phases/06-gym-profiles-plate-math/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 5
- Fixed: 5
- Skipped: 0

Verification ran in the main checkout on branch `main` (no isolated worktree — per this run's
explicit environment instructions). `pnpm -w typecheck` and `pnpm -w test` both passed clean after
all five fixes were applied (9/9 typecheck tasks, 86/86 mobile test suites, 1524/1524 mobile tests,
plus green suites in `@fitness/api-contracts`).

## Fixed Issues

### CR-01: Warm-up ladder always rounds against barbell loads, regardless of the exercise's actual equipment type

**Files modified:** `apps/mobile/lib/db/session-mutations.ts`, `apps/mobile/components/WarmupSheet.tsx`, `apps/mobile/components/ExercisePage.tsx`, `apps/mobile/lib/db/__tests__/session-mutations.test.ts`
**Commit:** 3f16f1a
**Applied fix:** Added `equipmentType: EquipmentType | null` to `GenerateWarmupSetsInput` and threaded it from `ExercisePage` (which already had it in scope) through `WarmupSheet`'s new `equipmentType` prop into `generateWarmupSets`. `achievableWarmupRounder` now branches on equipment type the same way `workout.tsx`'s local `achievableLoadsForEquipmentType` does — barbell/ez_bar and dumbbell round against their real achievable loads; machine/cable (and any equipment type with nothing achievable, e.g. a barbell-less gym) now return `undefined` instead of a rounder that always yields 0, so `warmupSets()` falls back to the plain-increment rounder rather than silently dropping every step. Added two regression tests: one proving a dumbbell exercise rounds against dumbbell loads (not the gym's barbell loads), one proving a machine exercise at a barbell-less gym still produces a non-empty ladder via the plain-increment fallback.

### WR-01: `isUnavailableEquipmentRefs` has no length bound, unlike its three sibling validators

**Files modified:** `packages/api-contracts/src/equipment.ts`, `packages/api-contracts/src/__tests__/equipment.test.ts`
**Commit:** 1bae705
**Applied fix:** Added `EQUIPMENT_PROFILE_LIMITS.maxUnavailableEquipmentRefs` (`maxMachines + maxDumbbellWeights + EQUIPMENT_TYPES.length`) and a matching length check at the top of `isUnavailableEquipmentRefs`, mirroring the three sibling guards. Added over-limit and at-limit unit tests matching the existing pattern for the other three validators. The module's own doc comment ("every type-guard below rejects an array past these lengths") is now accurate for this guard too.

### WR-02: No guard against archiving a gym's only remaining live profile

**Files modified:** `apps/mobile/lib/db/equipment-profiles.ts`, `apps/mobile/lib/db/__tests__/equipment-profiles.test.ts`
**Commit:** abfee1d
**Applied fix:** `archiveEquipmentProfile` now looks up the target row's `userId`/`archivedAt`, and — only when the target is currently live — counts that user's live rows (null-safe on `userId`, since the column is nullable) and throws before writing if archiving would leave zero. The thrown error surfaces through the existing `runMutation` → `mutationError` path in `gym-profiles/index.tsx` with the screen's existing `"Couldn't archive that gym."` fallback message, with no UI wiring changes needed. Re-archiving an already-archived row is unaffected (still a no-op re-stamp). Updated the existing "stamps archivedAt" test to seed two live gyms (it previously relied on there being exactly one, which the new guard now rejects) and added three new tests: rejecting the only-live-gym case, allowing archiving one of several live gyms, and the already-archived no-op case.

### WR-03: `handleMarkUnavailable` has no error handling, unlike its sibling `handleConfirmWriteThrough`

**Files modified:** `apps/mobile/components/EquipmentAvailabilitySheet.tsx`
**Commit:** ffc50d6
**Applied fix:** Gave `handleMarkUnavailable` the same `setError(null)` → `try { ... } catch { setError("Couldn't save"); setScreen('confirm'); } finally { setBusy(false) }` shape as `handleConfirmWriteThrough`. `onMarkUnavailable` is only ever wired while `screen === 'confirm'`, so reverting to `'confirm'` on failure matches the sibling handler exactly, and the confirm screen already renders the `ErrorBanner` for a non-null `error`. No test changes needed — this component's stateful wrapper has no existing direct test (only the hook-free `EquipmentAvailabilitySheetView` is test-invocable, matching this codebase's established pattern for sibling sheets), and the pre-existing View-level tests for the `error` prop continue to pass unchanged.

### WR-04: `reload()` and the mount `useEffect` in `GymProfilesScreen` duplicate the same fetch

**Files modified:** `apps/mobile/app/gym-profiles/index.tsx`
**Commit:** 3a2c5a8
**Applied fix:** Replaced the mount effect's duplicated fetch/`mounted`-guard body with a single `useEffect(() => { void reload(); }, [reload])`, matching the review's suggested simplification. `reload` already reads the same `userId`/`db` dependencies the old effect closed over, so the mount-time behavior is unchanged; a fast unmount before the promise settles is a harmless no-op state update, consistent with how every other `reload()`-triggering call site in this file (via `mutate`) already behaves with no mounted guard.

## Skipped Issues

None — all five in-scope findings (CR-01, WR-01, WR-02, WR-03, WR-04) were fixed. IN-01 was out of scope for this run (`fix_scope: critical_warning`).

---

_Fixed: 2026-08-27T20:18:42Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
