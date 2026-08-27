---
phase: 06-gym-profiles-plate-math
plan: 03
subsystem: ui
tags: [gym-profiles, expo-router, react-native-web, drizzle, powersync]

# Dependency graph
requires:
  - phase: 06-gym-profiles-plate-math
    provides: "06-01's equipment_profile schema, ensureDefaultEquipmentProfile seed-on-first-need, and the equipment-profiles.ts read/write module this plan extends"
provides:
  - "loadEquipmentProfiles / resolveLiveEquipmentProfileId / archiveEquipmentProfile / restoreEquipmentProfile / duplicateEquipmentProfile / createEquipmentProfile / updateEquipmentProfile / formatGymRowSubtitle"
  - "apps/mobile/app/gym-profiles/ route segment (_layout.tsx + index.tsx list screen) registered in the root stack's signed-in guard"
  - "GymProfileActionSheet component and ArchiveDialog's third 'gym' subject"
  - "Profile tab's Gyms section / Gym Profiles nav row"
affects: [06-gym-profiles-plate-math (06-04 owns gym-profiles/new.tsx and edit/[id].tsx, which will consume createEquipmentProfile/updateEquipmentProfile added here)]

# Actuals (#2632)
actuals:
  tokens: 16300
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveLiveEquipmentProfileId sorts its own fallback candidates (byNameThenId) rather than trusting caller array order — the 'always resolves a live gym' guarantee holds regardless of how rows arrive, unlike resolveLiveRoutineId which never needs a fallback ordering since a program can legitimately have zero active"
    - "Profile tab's focus-effect read now uses Promise.allSettled instead of Promise.all across all four reads, so one failing read (e.g. the active gym) cannot suppress the others"

key-files:
  created:
    - apps/mobile/app/gym-profiles/_layout.tsx
    - apps/mobile/app/gym-profiles/index.tsx
    - apps/mobile/components/GymProfileActionSheet.tsx
  modified:
    - apps/mobile/lib/db/equipment-profiles.ts
    - apps/mobile/components/ArchiveDialog.tsx
    - apps/mobile/lib/navigation/root-stack.tsx
    - apps/mobile/app/(tabs)/profile.tsx

key-decisions:
  - "The signed-in route guard actually lives in apps/mobile/lib/navigation/root-stack.tsx, not apps/mobile/app/_layout.tsx (which only renders renderRootStack's output) — registered gym-profiles there instead, matching exercises/_layout.tsx's own explicit comment: 'do not edit app/_layout.tsx.'"
  - "resolveLiveEquipmentProfileId's fallback sorts its own candidates rather than assuming the caller's array is pre-sorted, so the 'a gym profile always has exactly one active' guarantee is self-contained and holds for any caller, not just loadEquipmentProfiles's own callers."
  - "New Gym / Edit navigate to /gym-profiles/new and /gym-profiles/edit/[id], routes that do not exist yet — 06-04 owns them per the plan's own scoping; this mirrors how programs library already links to routes only realized once its own editor plan lands."

requirements-completed: [GYM-01]

coverage:
  - id: D1
    description: "A user can see every gym they have configured, create a new one, set which is active, edit, duplicate, archive and restore — reachable from the Profile tab."
    requirement: GYM-01
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/equipment-profiles.test.ts (loadEquipmentProfiles, createEquipmentProfile, updateEquipmentProfile, archiveEquipmentProfile/restoreEquipmentProfile, duplicateEquipmentProfile)"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/gym-profiles/__tests__/gym-profiles-screen.test.tsx (partitionGymProfiles, actionsForGymRow)"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/profile.test.tsx (GymRow describe block, incl. navigation-target case)"
        status: pass
    human_judgment: true
    rationale: "The plan's own <verification> carries a <human-check> for the full click-through (Profile tab -> list -> overflow -> archive) — visual/layout confirmation on the web target is not something the unit suite asserts. Recorded as WINDOWS.md entry #141 (unrun-verify) since no browser/simulator session was available in this executor pass."
  - id: D2
    description: "Setting a gym active moves the single active pointer; it never changes any other gym's row, and archiving the active gym leaves the pointer resolvable rather than dangling."
    requirement: GYM-01
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/equipment-profiles.test.ts ('archiving the active gym still resolves a live gym on the read side', resolveLiveEquipmentProfileId describe block)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Archived gyms sit in a collapsed trailing section, the active gym is pinned first with accent styling, and the row subtitle joins only configured sections in fixed order — never a zero count."
    requirement: GYM-01
    verification:
      - kind: unit
        ref: "apps/mobile/app/gym-profiles/__tests__/gym-profiles-screen.test.tsx (partitionGymProfiles describe block)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/equipment-profiles.test.ts (formatGymRowSubtitle describe block)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Gym Profile Action Sheet's action list is dynamic per row state — Set Active omitted on the active row, Restore in place of Archive on an archived row."
    requirement: GYM-01
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/GymProfileActionSheet.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Profile tab's Gym Profiles row names the active gym when it resolves, is absent otherwise, and always navigates — never disabled or broken."
    requirement: GYM-01
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/profile.test.tsx (GymRow describe block)"
        status: pass
    human_judgment: false

duration: ~10 min commit span (17:34-17:44 UTC+3, 2026-08-27); excludes the preceding read/investigation pass
completed: 2026-08-27
status: complete
---

# Phase 6 Plan 3: Gym Profiles List, Action Sheet & Profile Tab Entry Point Summary

**Gym Profiles list screen (active-pinned, archived-collapsed) with a per-row action sheet, gym archive/restore/duplicate write helpers, and a Profile tab nav row naming the active gym.**

## Performance

- **Started:** 2026-08-27T17:34:35+03:00 (first task commit)
- **Completed:** 2026-08-27T17:44:22+03:00 (last task commit)
- **Tasks:** 3/3 completed
- **Files modified:** 13 (1402 insertions, 9 deletions)

## Accomplishments

- `apps/mobile/lib/db/equipment-profiles.ts` gained the remaining gym-profile lifecycle helpers: `loadEquipmentProfiles` (every profile including archived, sorted by name then id), `resolveLiveEquipmentProfileId` (archived-wins reconciliation that always falls back to a live gym — unlike programs, a gym profile can never have zero active), `createEquipmentProfile`, `updateEquipmentProfile`, `archiveEquipmentProfile`/`restoreEquipmentProfile` (single-column timestamp writes, never a delete), `duplicateEquipmentProfile` (deep copy with a fresh id and "{name} copy"), and `formatGymRowSubtitle` (bar -> plates -> dumbbells -> machines, joined only where configured).
- `apps/mobile/app/gym-profiles/` route segment: `_layout.tsx` (Stack + NavBackButton, anchored on `index`) and `index.tsx`, the list screen — active gym pinned first with accent border/name treatment, rest alphabetical, archived collapsed trailing section, mirroring `programs/library.tsx`'s structure. Exports `deriveGymProfilesScreenState`, `partitionGymProfiles`, and `actionsForGymRow` as pure, unit-tested functions.
- `GymProfileActionSheet`: `RoutineActionSheet`'s shell (overlay, `max-w-[400px]` scroll container, row geometry) with a caller-supplied dynamic action list.
- `ArchiveDialog` gains the `'gym'` subject with archive/restore copy verbatim from the 06-UI-SPEC.md Copywriting Contract — no new component.
- Registered `gym-profiles` as a protected segment in `apps/mobile/lib/navigation/root-stack.tsx` (the actual home of the signed-in guard — see Deviations).
- Profile tab gains a "Gyms" section between Workout settings and Sign Out: `GymRow`, reusing `ToggleRow`'s bordered row chrome with a button role, a `barbell-outline` icon, and a trailing chevron + the active gym's name (when it resolves) in place of the on/off pill.

## Task Commits

1. **Task 1: The remaining gym-profile write helpers and the list read** - `b538b6b` (feat)
2. **Task 2: The Gym Profiles list, its action sheet, and gym archival copy** - `e9a0a19` (feat)
3. **Task 3: The Profile tab's Gyms section** - `2b61c55` (feat)

**Plan metadata:** pending (final `docs(06-03): complete...` commit, made immediately after this SUMMARY commit)

## Files Created/Modified

- `apps/mobile/lib/db/equipment-profiles.ts` - loadEquipmentProfiles, resolveLiveEquipmentProfileId, createEquipmentProfile, updateEquipmentProfile, archiveEquipmentProfile, restoreEquipmentProfile, duplicateEquipmentProfile, formatGymRowSubtitle
- `apps/mobile/lib/db/__tests__/equipment-profiles.test.ts` - unit coverage for every helper above
- `apps/mobile/app/gym-profiles/_layout.tsx` - segment Stack layout, anchored on `index`
- `apps/mobile/app/gym-profiles/index.tsx` - the list screen; exports deriveGymProfilesScreenState/partitionGymProfiles/actionsForGymRow
- `apps/mobile/app/gym-profiles/__tests__/gym-profiles-screen.test.tsx` - pure-function coverage for the exports above
- `apps/mobile/components/GymProfileActionSheet.tsx` - the per-row overflow sheet
- `apps/mobile/components/__tests__/GymProfileActionSheet.test.tsx` - rendering/press coverage
- `apps/mobile/components/ArchiveDialog.tsx` - `'gym'` subject added to the union and copy table
- `apps/mobile/components/__tests__/ArchiveDialog.test.tsx` - gym archive/restore copy cases
- `apps/mobile/lib/navigation/root-stack.tsx` - `gym-profiles` added to the signed-in `Stack.Protected` screen list
- `apps/mobile/app/(tabs)/profile.tsx` - `GymRow` + Gyms section; focus effect switched to `Promise.allSettled`
- `apps/mobile/app/(tabs)/__tests__/profile.test.tsx` - GymRow describe block
- `apps/mobile/lib/navigation/__tests__/route-guard.test.ts` - updated protected-screen-list assertion for the new entry

## Decisions Made

- **Route guard's real file (Rule 3 — plan named the wrong file):** the plan's Task 2 action text and acceptance criteria named `apps/mobile/app/_layout.tsx` as the place to declare the `gym-profiles` screen. That file only calls `renderRootStack(signedIn)`; the actual `<Stack.Protected>`/`<Stack.Screen>` declarations live in `apps/mobile/lib/navigation/root-stack.tsx`, and `exercises/_layout.tsx`'s own comment explicitly says "do not edit app/_layout.tsx — the root declaration already does the right thing the moment this segment exists." Registered the screen there instead, matching the `programs`/`exercises` precedent exactly.
- **resolveLiveEquipmentProfileId sorts its own fallback (Rule 1 — bug found via the screen's own tests):** the first implementation (Task 1) assumed the caller always passes rows pre-sorted by name then id (true for `loadEquipmentProfiles`'s own output). Task 2's `partitionGymProfiles` tests exercised it with an out-of-order array and got a fallback that depended on array-index order, not name order — contradicting the plan's own "the first non-archived gym by the total ordering is returned." Fixed by sorting a filtered copy inside the function itself, so the guarantee is self-contained.
- **Profile tab's focus effect switched to `Promise.allSettled`:** the plan's action text calls it "the same all-settled read the effect already performs," but the effect was actually `Promise.all` before this task. Since the plan explicitly requires the gym read to fail independently of preferences/notification-permission ("when it does not resolve, the trailing label is absent... never rendered broken"), and `Promise.all` fails fast on the first rejection, `allSettled` is the literal implementation of that requirement, not just a defensive extra.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `apps/mobile/app/_layout.tsx` does not declare route segments — registered `gym-profiles` in `root-stack.tsx` instead**
- **Found during:** Task 2, wiring the signed-in guard
- **Issue:** The plan named `app/_layout.tsx` as the file to edit and as the acceptance-criteria grep target, but that file only renders `renderRootStack(signedIn)`; the guard's `<Stack.Screen>` list lives in `lib/navigation/root-stack.tsx`.
- **Fix:** Added `<Stack.Screen name="gym-profiles" />` to `root-stack.tsx`'s `signedIn` `Stack.Protected` block, exactly where `exercises` and `programs` already sit.
- **Files modified:** `apps/mobile/lib/navigation/root-stack.tsx`
- **Verification:** `apps/mobile/lib/navigation/__tests__/route-guard.test.ts`'s protected-set-membership test now asserts `gym-profiles` is present; fixed the test's own hardcoded list (see deviation 3).
- **Committed in:** `e9a0a19` (Task 2 commit)

**2. [Rule 1 - Bug] `resolveLiveEquipmentProfileId`'s fallback depended on caller array order**
- **Found during:** Task 2, while writing `gym-profiles-screen.test.tsx`'s `partitionGymProfiles` tests
- **Issue:** The Task 1 implementation picked the first non-archived row via `rows.find(...)` directly on the array as given — correct only when the caller's array happened to already be in name-then-id order. A test passing an out-of-order array (a realistic case: nothing enforces that every caller of `partitionGymProfiles` sorts first) got the wrong fallback.
- **Fix:** Changed the fallback branch to filter then sort a copy (`byNameThenId`) before taking the first entry, so the "first non-archived gym by the total ordering" guarantee holds regardless of input order.
- **Files modified:** `apps/mobile/lib/db/equipment-profiles.ts`
- **Verification:** `equipment-profiles.test.ts`'s `resolveLiveEquipmentProfileId` describe block (7 cases) and `gym-profiles-screen.test.tsx`'s `partitionGymProfiles` describe block both pass.
- **Committed in:** `e9a0a19` (Task 2 commit)

**3. [Rule 1 - Bug] `route-guard.test.ts` hardcoded the pre-existing protected-screen list**
- **Found during:** Task 3, running the full `pnpm --filter mobile test` suite
- **Issue:** `protected set membership` asserted `screenNamesUnderGuard(true, true)` equals exactly `['(tabs)', 'exercises', 'programs']` — a closed list that now excludes the deliberately-added `gym-profiles` entry.
- **Fix:** Updated the assertion (and its describe-block name) to include `'gym-profiles'` in the expected sorted list.
- **Files modified:** `apps/mobile/lib/navigation/__tests__/route-guard.test.ts`
- **Verification:** Full `pnpm --filter mobile test` — 1393/1393 passing.
- **Committed in:** `2b61c55` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 3, 2 Rule 1)
**Impact on plan:** All three are corrections within the exact subsystem the plan already scoped to this work (route guard registration, the active-gym-resolution invariant, and the pre-existing test the guard change broke). No scope creep — no file outside this plan's read/write surface was touched.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`createEquipmentProfile`/`updateEquipmentProfile` are written and unit-tested but unconsumed by any UI in this plan — 06-04 (the Gym Profile Editor) is expected to wire `gym-profiles/new.tsx` and `gym-profiles/edit/[id].tsx` to them, matching the same create/edit-share-one-form shape `exercises/new.tsx`/`edit/[id].tsx` already establishes. The "New Gym" and "Edit" actions in this plan's list/action-sheet already `router.push` to those routes; they are 404s in a fresh worktree until 06-04 lands, exactly mirroring how `programs/library.tsx`'s "New Program" link only became a working route once its own editor plan shipped.

The plan's `<verification>` `<human-check>` (Profile tab -> Gym Profiles list -> overflow -> archive, on the web target) was not run — no browser/simulator session was available in this executor pass. Recorded as WINDOWS.md entry #141 (`unrun-verify`, open).

## Self-Check: PASSED

- `[ -f apps/mobile/app/gym-profiles/_layout.tsx ]` -> FOUND
- `[ -f apps/mobile/app/gym-profiles/index.tsx ]` -> FOUND
- `[ -f apps/mobile/components/GymProfileActionSheet.tsx ]` -> FOUND
- `git log --oneline --all | grep b538b6b` -> FOUND
- `git log --oneline --all | grep e9a0a19` -> FOUND
- `git log --oneline --all | grep 2b61c55` -> FOUND
