---
phase: 06-gym-profiles-plate-math
reviewed: 2026-08-27T17:17:23Z
depth: standard
files_reviewed: 81
files_reviewed_list:
  - apps/api/src/db/schema/session.ts
  - apps/api/src/sync/__tests__/patch-update-set.spec.ts
  - apps/api/src/sync/patch-update-set.ts
  - apps/api/src/sync/sync.service.ts
  - apps/api/test/equipment-profile-sync.e2e-spec.ts
  - apps/api/test/schema-parity.e2e-spec.ts
  - apps/api/test/session-annotations-sync.e2e-spec.ts
  - apps/mobile/app/(tabs)/__tests__/profile.test.tsx
  - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
  - apps/mobile/app/(tabs)/history.tsx
  - apps/mobile/app/(tabs)/profile.tsx
  - apps/mobile/app/(tabs)/workout.tsx
  - apps/mobile/app/__durability.web.tsx
  - apps/mobile/app/gym-profiles/__tests__/gym-profile-editor-routes.test.tsx
  - apps/mobile/app/gym-profiles/__tests__/gym-profiles-screen.test.tsx
  - apps/mobile/app/gym-profiles/_layout.tsx
  - apps/mobile/app/gym-profiles/edit/[id].tsx
  - apps/mobile/app/gym-profiles/index.tsx
  - apps/mobile/app/gym-profiles/new.tsx
  - apps/mobile/components/ArchiveDialog.tsx
  - apps/mobile/components/EditingWorkoutScreen.tsx
  - apps/mobile/components/EquipmentAvailabilitySheet.tsx
  - apps/mobile/components/ExercisePage.tsx
  - apps/mobile/components/GymProfileActionSheet.tsx
  - apps/mobile/components/GymProfileEditor.tsx
  - apps/mobile/components/NumericKeypad.tsx
  - apps/mobile/components/PlateStrip.tsx
  - apps/mobile/components/SessionActionSheet.tsx
  - apps/mobile/components/SwapSuggestionList.tsx
  - apps/mobile/components/SwitchGymSheet.tsx
  - apps/mobile/components/__tests__/ArchiveDialog.test.tsx
  - apps/mobile/components/__tests__/EquipmentAvailabilitySheet.test.tsx
  - apps/mobile/components/__tests__/GymProfileActionSheet.test.tsx
  - apps/mobile/components/__tests__/GymProfileEditor.test.tsx
  - apps/mobile/components/__tests__/PlateStrip.test.tsx
  - apps/mobile/components/__tests__/SessionActionSheet.test.tsx
  - apps/mobile/components/__tests__/SwapSuggestionList.test.tsx
  - apps/mobile/components/__tests__/SwitchGymSheet.test.tsx
  - apps/mobile/e2e/equipment-availability.spec.ts
  - apps/mobile/e2e/gym-profiles.spec.ts
  - apps/mobile/e2e/plate-strip.spec.ts
  - apps/mobile/e2e/switch-gym.spec.ts
  - apps/mobile/lib/catalog/smart-swap.ts
  - apps/mobile/lib/db/__tests__/equipment-profiles.test.ts
  - apps/mobile/lib/db/__tests__/session-equipment.test.ts
  - apps/mobile/lib/db/__tests__/session-mutations.test.ts
  - apps/mobile/lib/db/equipment-profiles.ts
  - apps/mobile/lib/db/history-mutations.ts
  - apps/mobile/lib/db/log-set.ts
  - apps/mobile/lib/db/schema.ts
  - apps/mobile/lib/db/session-equipment.ts
  - apps/mobile/lib/db/session-lifecycle.ts
  - apps/mobile/lib/db/session-mutations.ts
  - apps/mobile/lib/db/session-query.ts
  - apps/mobile/lib/db/test-support.ts
  - apps/mobile/lib/gym/__tests__/profile-draft.test.ts
  - apps/mobile/lib/gym/profile-draft.ts
  - apps/mobile/lib/navigation/__tests__/route-guard.test.ts
  - apps/mobile/lib/navigation/root-stack.tsx
  - apps/mobile/package.json
  - apps/mobile/playwright.config.ts
  - docs/equipment-profile-shape.md
  - packages/api-contracts/src/__tests__/equipment.test.ts
  - packages/api-contracts/src/__tests__/sync.test.ts
  - packages/api-contracts/src/equipment.ts
  - packages/api-contracts/src/index.ts
  - packages/api-contracts/src/sync.ts
  - packages/plate-math/jest.config.js
  - packages/plate-math/package.json
  - packages/plate-math/src/__tests__/achievability.test.ts
  - packages/plate-math/src/__tests__/band.test.ts
  - packages/plate-math/src/__tests__/inventory.test.ts
  - packages/plate-math/src/__tests__/solver.test.ts
  - packages/plate-math/src/achievability.ts
  - packages/plate-math/src/band.ts
  - packages/plate-math/src/index.ts
  - packages/plate-math/src/inventory.ts
  - packages/plate-math/src/solver.ts
  - packages/plate-math/tsconfig.json
  - packages/pr-rules/src/__tests__/warmup.test.ts
  - packages/pr-rules/src/warmup.ts
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-08-27T17:17:23Z
**Depth:** standard
**Files Reviewed:** 81
**Status:** issues_found

## Summary

Reviewed the Gym Profiles & Plate Math phase across the plate-math package, its mobile/API
consumers, and the sync layer. The core contract module (`packages/plate-math`) is well-tested and
internally consistent — `achievability.ts`, `band.ts`, and `solver.ts` all route through the same
bigint-based canonical-kg arithmetic and agree with each other at every call site checked
(`workout.tsx`, `ExercisePage.tsx`, `session-mutations.ts`, `session-equipment.ts`,
`EquipmentAvailabilitySheet.tsx`). The sync plumbing for the new `unavailable_equipment` column
(`session.ts`, `patch-update-set.ts`, `sync.service.ts`, the mobile SQLite mirror) is symmetric and
covered by e2e tests.

The one real defect found is architectural rather than a typo: `generateWarmupSets` /
`achievableWarmupRounder` in `session-mutations.ts` always rounds the warm-up ladder against
**barbell** achievable loads regardless of the exercise's actual equipment type, because
`equipmentType` is never threaded from `ExercisePage`/`WarmupSheet` down into
`generateWarmupSets`. This directly violates this phase's central contract (GYM-06: "only ever
shown loads their gym can produce") for every non-barbell exercise, and at a gym with no barbell
configured at all it silently produces **zero** warm-up sets for every exercise, not just barbell
ones. No test in `session-mutations.test.ts` exercises a dumbbell/machine exercise or a
barbell-less gym through `generateWarmupSets`, so the unit suite does not catch it.

The remaining findings are smaller robustness/consistency gaps: a missing length bound on
`isUnavailableEquipmentRefs` (asymmetric with its three sibling validators and the comment
claiming otherwise), no guard against archiving a gym's only remaining live profile (breaking the
documented "always exactly one active gym" invariant), and an inconsistent error-handling path in
`EquipmentAvailabilitySheet`'s "Mark Unavailable" action.

## Critical Issues

### CR-01: Warm-up ladder always rounds against barbell loads, regardless of the exercise's actual equipment type

**File:** `apps/mobile/lib/db/session-mutations.ts:196-259` (in particular `achievableWarmupRounder`, lines 206-212, and `generateWarmupSets`, lines 221-259)

**Issue:**

`GenerateWarmupSetsInput` (line 196) and `generateWarmupSets` never receive the exercise's
`equipmentType`. `achievableWarmupRounder` (lines 206-212) unconditionally calls
`achievableBarbellLoads(inventory)`:

```ts
function achievableWarmupRounder(inventory: ResolvedInventory): (rawKg: number) => number {
  const achievableKg = achievableBarbellLoads(inventory);
  return (rawKg: number): number => {
    const rounded = roundToAchievable(String(rawKg), achievableKg, 'down');
    return rounded === null ? 0 : Number(rounded);
  };
}
```

`generateWarmupSets` resolves the session's inventory (line 240) and, whenever an inventory
resolves at all, applies this barbell-only rounder to *every* exercise's warm-up ladder — dumbbell,
machine, and cable exercises included:

```ts
const inventory = sessionExerciseRow ? await loadSessionInventory(sessionExerciseRow.sessionId, db) : null;
const roundWeight = inventory ? achievableWarmupRounder(inventory) : undefined;
const ladder = warmupSets(workingWeightKg, roundingIncrementKg, roundWeight);
```

`warmupSets()` (packages/pr-rules/src/warmup.ts:44-45) drops any step whose rounded weight is
`<= 0`:

```ts
const weightKg = roundWeight ? roundWeight(rawKg) : roundToIncrement(rawKg, roundingIncrementKg);
if (weightKg <= 0) continue;
```

Confirmed by tracing the caller chain: `WarmupSheet` (`apps/mobile/components/WarmupSheet.tsx`)
is mounted unconditionally by `ExercisePage.tsx` (line 271) for every exercise —
`ExerciseActionBar` is given `warmupSetsEnabled` as a hard-coded `true` (`ExercisePage.tsx:220`),
with no gating on `equipmentType`. `ExercisePage` has `equipmentType` in scope (used for the
Equipment row and `EquipmentAvailabilitySheet`, lines 129/154/175/301) but does **not** pass it to
`WarmupSheet`, and `WarmupSheet` never passes it to `generateWarmupSets`. So:

1. **Wrong equipment, wrong numbers:** For a dumbbell/machine/cable exercise at a gym that has a
   barbell configured, the warm-up ladder is rounded against the gym's barbell-achievable loads —
   numbers that have nothing to do with the dumbbells or the stack the set is actually performed
   on.
2. **Silent zero-set generation:** For *any* exercise (including dumbbell/machine/cable ones) at a
   gym whose `barbellWeightKg` is `null` (a dumbbell-only or machine-only gym — a fully legitimate
   D-19/E1 configuration), `achievableBarbellLoads` returns `[]`, `roundToAchievable(...)` returns
   `null` on every step, `achievableWarmupRounder` returns `0` for every step, and `warmupSets()`
   filters out all three steps. Tapping "Add Warm-up Sets" silently inserts **zero rows** and the
   sheet closes as if it worked — no error, no rejected write, nothing.

This is exactly the class of bug GYM-06 exists to prevent ("only ever shown loads their gym can
produce"), except inverted: the app-generated ladder collapses to nothing instead of showing an
unachievable load. `session-mutations.test.ts`'s `generateWarmupSets` describe block only exercises
a barbell exercise against a gym that has a barbell configured (or no inventory at all, which hits
the `inventory === null` branch and correctly falls back to the plain increment) — no test covers a
non-barbell exercise or a barbell-less gym, so the unit suite does not catch this.

**Fix:** Thread `equipmentType` through `GenerateWarmupSetsInput` → `WarmupSheet` →
`ExercisePage`'s `WarmupSheet` mount, and make `achievableWarmupRounder` branch the same way
`achievableLoadsForEquipmentType` in `workout.tsx` (lines 158-162) already does — using
`achievableDumbbellLoads`/`achievableMachineLoads` for the exercise's real equipment type, and
falling back to the plain-increment rounder (never to a silent zero) for machine/cable or when the
type resolves to nothing achievable:

```ts
function achievableWarmupRounder(
  equipmentType: EquipmentType | null,
  inventory: ResolvedInventory,
): ((rawKg: number) => number) | undefined {
  const achievableKg = achievableLoadsForEquipmentType(equipmentType, inventory); // shared with workout.tsx
  if (achievableKg.length === 0) return undefined; // fall through to roundToIncrement, never to 0
  return (rawKg: number): number => {
    const rounded = roundToAchievable(String(rawKg), achievableKg, 'down');
    return rounded === null ? 0 : Number(rounded);
  };
}
```

and pass the caller's resolved `equipmentType` in from `ExercisePage`/`WarmupSheet`.

## Warnings

### WR-01: `isUnavailableEquipmentRefs` has no length bound, unlike its three sibling validators

**File:** `packages/api-contracts/src/equipment.ts:97-113`

**Issue:** `isEquipmentProfilePlates`, `isEquipmentDumbbellIncrements`, and
`isEquipmentMachineAvailability` each reject an array past `EQUIPMENT_PROFILE_LIMITS`
(`maxPlateDenominations`/`maxDumbbellWeights`/`maxMachines`). `isUnavailableEquipmentRefs` applies
no such bound:

```ts
export function isUnavailableEquipmentRefs(value: unknown): value is UnavailableEquipmentRef[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => { ... });
}
```

The module's own T-06-02 doc comment (lines 3-4) claims "every type-guard below rejects an array
past these lengths," which is not true for this one. `packages/api-contracts/src/__tests__/equipment.test.ts`
has explicit over-limit tests for the other three validators (lines 56, 82, 114) but none for
`isUnavailableEquipmentRefs`. This field is written through the sync PATCH path
(`sync.service.ts`'s `hasInvalidField`, `apps/api/src/sync/sync.service.ts:852-854`), so a client
that bypasses the normal UI flow (or a bug in a future caller) can push an unbounded
`unavailable_equipment` array through every push cycle with no server-side rejection.

**Fix:** Add a length cap (e.g. reuse `maxMachines + maxDumbbellWeights + EQUIPMENT_TYPES.length`,
or a fresh named limit) to `isUnavailableEquipmentRefs`, matching the pattern the other three
guards already use, and add the corresponding over-limit unit test.

### WR-02: No guard against archiving a gym's only remaining live profile

**File:** `apps/mobile/lib/db/equipment-profiles.ts:332-334`, `apps/mobile/app/gym-profiles/index.tsx:208-230`

**Issue:** `equipment-profiles.ts`'s own doc comment states the invariant this phase relies on:

> "E1's contract requires exactly one gym to always read as active (D-19 guarantees at least one
> non-archived row exists)."

`archiveEquipmentProfile` (lines 332-334) and the `ARCHIVE` action handler in
`gym-profiles/index.tsx` (lines 208-230) apply no check for "is this the last live gym" before
archiving. A user with a single gym profile (the common case for anyone who hasn't created a
second gym) can archive it via the action sheet, leaving zero non-archived
`equipment_profile` rows. `resolveLiveEquipmentProfileId` then returns `null` (no `firstLive`
candidate), and every read that depends on it (`GymProfilesScreen`'s active partition,
`loadSessionInventory` via a stale `equipmentProfileId` pointer, the Equipment row's
`hasResolvableEquipment` check) degrades until something calls `ensureDefaultEquipmentProfile`
again (e.g. the next `startWorkoutFromProgram`), which reseeds a brand-new "My Gym" default rather
than restoring the one the user just archived.

**Fix:** Either disable/hide the Archive action when `partition.rest.length === 0 &&
partition.active.length === 1` (i.e., the target is the only live gym), or have
`archiveEquipmentProfile` reject/no-op when archiving would leave zero live rows for the user,
surfacing that as a `mutationError` the same way other failed mutations already are.

### WR-03: `handleMarkUnavailable` has no error handling, unlike its sibling `handleConfirmWriteThrough`

**File:** `apps/mobile/components/EquipmentAvailabilitySheet.tsx:357-383`

**Issue:** `handleConfirmWriteThrough` (lines 369-383) wraps its writes in `try/catch`, sets a
user-visible `error` state, and reverts `screen` to `'confirm'` on failure. `handleMarkUnavailable`
(lines 357-367), which performs the equivalent "Mark Unavailable" write, has only a `finally`:

```ts
async function handleMarkUnavailable(): Promise<void> {
  setBusy(true);
  try {
    await markEquipmentUnavailable(sessionId, target.ref, writeDb);
    const fresh = await loadSessionInventory(sessionId, writeDb);
    await loadAlternatives(fresh);
    setScreen('alternatives');
  } finally {
    setBusy(false);
  }
}
```

If `markEquipmentUnavailable`/`loadSessionInventory`/`loadAlternatives` throws (e.g. a transient
PowerSync write failure), the error propagates as an unhandled promise rejection (the call site is
`onMarkUnavailable={() => void handleMarkUnavailable()}`) with no `ErrorBanner` shown and the sheet
left in a stuck `busy: false, screen: 'confirm'` state with no feedback to the user, unlike every
other mutating action in this file.

**Fix:** Give `handleMarkUnavailable` the same `try { ... } catch { setError(...) } finally { ... }`
shape as `handleConfirmWriteThrough`.

### WR-04: `reload()` and the mount `useEffect` in `GymProfilesScreen` duplicate the same fetch

**File:** `apps/mobile/app/gym-profiles/index.tsx:134-174`

**Issue:** The `reload` callback (lines 134-148) and the mount-time `useEffect` (lines 150-174)
both perform the identical `Promise.all([loadEquipmentProfiles(...), loadActiveEquipmentProfileId(...)])`
read, `setProfiles`/`setActiveProfileId`/`setFailed` sequence, and `try/catch` shape — the only
difference is the `mounted` guard vs. none. This is copy-pasted logic that will silently drift if
one of the two is ever updated and the other is forgotten.

**Fix:** Have the mount effect simply call `void reload()` (guarding on `mounted` inside `reload`
itself, or accepting the effect's `mounted` closure as-is since `reload` already reads the same
`userId`/`db` deps).

## Info

### IN-01: `isGymProfileSaveable` does not validate numeric-field content before enabling Save

**File:** `apps/mobile/lib/gym/profile-draft.ts:243-258`

**Issue:** `isGymProfileSaveable` only validates `name` and array-length limits; it does not check
that `barWeight`/plate weights/dumbbell weights/machine stack fields are well-formed decimal
strings via `isExactDecimalString`. An invalid value (e.g. a bar weight left as `"12."` or cleared
to non-numeric text through some future input path) leaves `saveable: true`, and the failure only
surfaces when `toEquipmentProfileDraft` throws inside `GymProfileEditor`'s submit handler (caught
there, so this is not a data-integrity bug — just a delayed/less-direct error rather than a
disabled Save button).

**Fix:** Have `isGymProfileSaveable` also run `isExactDecimalString` over `barWeight` (when
non-empty) and each plate/dumbbell/machine numeric field, folding the result into `saveable`, so an
invalid entry disables Save immediately instead of round-tripping through a thrown error.

---

_Reviewed: 2026-08-27T17:17:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
