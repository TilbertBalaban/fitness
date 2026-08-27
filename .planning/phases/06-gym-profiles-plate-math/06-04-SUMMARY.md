---
phase: 06-gym-profiles-plate-math
plan: 04
subsystem: ui
tags: [gym-profiles, expo-router, react-native-web, drizzle, powersync, playwright]

# Dependency graph
requires:
  - phase: 06-gym-profiles-plate-math
    provides: "06-03's equipment_profile write helpers (createEquipmentProfile/updateEquipmentProfile/loadEquipmentProfile), gym-profiles route segment and list screen, GymProfileActionSheet, and ArchiveDialog's 'gym' subject"
provides:
  - "lib/gym/profile-draft.ts — the editor's whole pure logic layer (conversion, merging, clamping, save gate)"
  - "GymProfileEditor / GymProfileEditorView — the shared create-and-edit form component"
  - "apps/mobile/app/gym-profiles/new.tsx and edit/[id].tsx routes, wired to the create/update helpers"
  - "durability harness seam for gym-profiles screens (db/userId override props on GymProfilesScreen/NewGymScreen/EditGymScreen; two new harness mount methods)"
  - "a real-browser e2e proof of the full gym lifecycle (create, edit, activate, archive)"
affects: [06-gym-profiles-plate-math (later plate-math plans read equipment_profile rows this editor writes)]

# Actuals (#2632)
actuals:
  tokens: 22700
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GymProfileEditorView (hook-free) plus a thin stateful GymProfileEditor wrapper — the same split ExerciseSlotRow/ExerciseStrip already establish, so the form is directly invocable by a findByType test with no renderer"
    - "Route screens gain optional db/userId override props (mirroring useWorkoutScreen({userId, db})) so the durability harness can mount the real production route components against an isolated test database instead of the getPowerSync() singleton; both undefined for every real navigation"
    - "A screen that must not navigate when driven by the harness takes an onSaved callback in place of router.replace() — new.tsx's onSaved additionally receives the newly created row's id, the only way the harness can learn it, since createEquipmentProfile generates it server-side mid-write"

key-files:
  created:
    - apps/mobile/lib/gym/profile-draft.ts
    - apps/mobile/lib/gym/__tests__/profile-draft.test.ts
    - apps/mobile/components/GymProfileEditor.tsx
    - apps/mobile/components/__tests__/GymProfileEditor.test.tsx
    - apps/mobile/app/gym-profiles/new.tsx
    - apps/mobile/app/gym-profiles/edit/[id].tsx
    - apps/mobile/app/gym-profiles/__tests__/gym-profile-editor-routes.test.tsx
    - apps/mobile/e2e/gym-profiles.spec.ts
  modified:
    - apps/mobile/app/gym-profiles/_layout.tsx
    - apps/mobile/app/gym-profiles/index.tsx
    - apps/mobile/app/__durability.web.tsx

key-decisions:
  - "New gym's initial unit defaults to 'kg' synchronously rather than awaiting the user's saved preference — E2's own contract states 'No loading state for a new gym', and a DB read before first paint is exactly that gate. The Unit system selector sits second in the form specifically so a wrong default costs one tap."
  - "Tapping the Custom bar preset chip clears the bar weight field rather than literally hiding/revealing it — the UI-SPEC's Gym Profile Editor section keeps the bar weight TextField always visible (chips only pre-fill it), which the plan's own <behavior> text ('reveals the field for manual entry') does not literally match on a hidden field. Clearing on Custom is what makes the chip's own accessibilityState.selected genuinely change, and keeps the field always-editable per the UI-SPEC."
  - "The plate/dumbbell 'add' affordance pairs the shipped dashed add-chip with an adjacent TextField holding the not-yet-committed weight, since profile-draft.ts's upsert functions require an actual weight value to add a row (there is no 'add an empty row, fill it in place' primitive, deliberately — a plate/dumbbell row's weight is its identity, not an editable field once added)."
  - "gym-profiles/index.tsx (06-03's file, not in this plan's declared files_modified) gained optional db/userId override props — Task 3's own action text requires mounting the real list screen, and GymProfilesScreen had no seam for an isolated test database. Extending Task 1/2 output is explicitly sanctioned by the resume instructions when a later task genuinely needs it; this is the same seam useWorkoutScreen/useEditingWorkoutScreen already establish for their own harness mounts."
  - "The harness surfaces a just-created gym's id via a rendered testID Text (gym-editor-last-saved-id), not a third harness method — Task 3's acceptance criteria caps __durability.web.tsx at exactly two new methods, and createEquipmentProfile generates the id server-side mid-write with no other observable signal once router.replace() is disabled for the harness."

requirements-completed: [GYM-02, GYM-03]

coverage:
  - id: D1
    description: "A user can configure a gym's bar weight (via preset chips or manual entry), plate denominations with per-denomination pair counts, dumbbell weights, and named machines with stack min/max/increment/starting-resistance, and pick the profile's unit system — through one shared create/edit form."
    requirement: GYM-02
    verification:
      - kind: unit
        ref: "apps/mobile/lib/gym/__tests__/profile-draft.test.ts (full suite — draft mutators, save gate, sort order)"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/GymProfileEditor.test.tsx (bar preset selection, machine availability gating, plate/dumbbell row rendering)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/gym-profiles.spec.ts — 'a gym created, edited, activated and archived entirely through the UI stores exactly what was entered, in canonical kilograms'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every weight is stored in canonical kilograms regardless of the profile's unit, and a draft-to-profile-to-draft round trip preserves the exact stored value — no floating-point arithmetic on a parsed decimal."
    requirement: GYM-02
    verification:
      - kind: unit
        ref: "apps/mobile/lib/gym/__tests__/profile-draft.test.ts ('draftFromProfile / toEquipmentProfileDraft round trip' describe block)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/gym-profiles.spec.ts — raw-row assertions comparing toCanonicalKg('45','lb') etc. against the stored columns"
        status: pass
    human_judgment: false
  - id: D3
    description: "A plate count stepper cannot go below zero or express a decimal/negative; a duplicate denomination merges into the existing row rather than creating a second one."
    requirement: GYM-02
    verification:
      - kind: unit
        ref: "apps/mobile/lib/gym/__tests__/profile-draft.test.ts (setPlatePairCount, upsertPlateDenomination describe blocks)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A failed local write on Save renders the shipped error surface above the field stack, and the form stays open with every entered value preserved; sync failure is not surfaced inline."
    requirement: GYM-03
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/GymProfileEditor.test.tsx ('GymProfileEditorView — failed save (E2 error state)')"
        status: pass
    human_judgment: false
  - id: D5
    description: "The create route saves through createEquipmentProfile; the edit route loads the profile, seeds the draft, and saves through updateEquipmentProfile. Editing an existing gym's plate count changes only that column."
    requirement: GYM-03
    verification:
      - kind: unit
        ref: "apps/mobile/app/gym-profiles/__tests__/gym-profile-editor-routes.test.tsx (createGymProfile, updateGymProfile describe blocks)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/gym-profiles.spec.ts — the edit-pass assertion that every raw column except available_plates is byte-identical to the create-time row"
        status: pass
    human_judgment: false
  - id: D6
    description: "Setting a gym active moves the preference pointer (proven by Set Active disappearing from that row's own action list on reopen), and archiving moves the row into the archived partition with an archive timestamp, leaving the row present."
    requirement: GYM-02
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/gym-profiles.spec.ts — the activate/archive passes"
        status: pass
    human_judgment: false
  - id: D7
    description: "On the web target: create a gym in lb, add 45 and 25 lb plates with two pairs each, add a machine with a 20-200 stack in 10 steps, save, reopen — every value reads back as typed, and the plate stepper refuses to go below zero."
    verification: []
    human_judgment: true
    rationale: "The plan's own <verification> carries this as a <human-check> for manual click-through confirmation on the web target — no browser/simulator session for interactive human review was available in this executor pass. Recorded as WINDOWS.md entry #142 (unrun-verify, open). The equivalent flow is covered end-to-end by the automated e2e spec above, but the specific interactive/visual confirmation this line asks for was not separately performed."

duration: Task 1 ~unknown (separate, quota-killed prior session, verified pre-merge); Tasks 2-3 14 min commit span (18:34-18:48 UTC+3, 2026-08-27)
completed: 2026-08-27
status: complete
---

# Phase 6 Plan 4: Gym Profile Editor Summary

**GymProfileEditor form (bar presets, plate steppers, dumbbell chips, machine cards) shared by create and edit routes, backed by a pure canonical-kg draft module, proven end to end through a real browser against a real `@powersync/web` database.**

## Performance

- **Started:** Task 1 committed by a prior, quota-killed executor session; this resumed executor started at Task 2.
- **Task 2 started:** 2026-08-27T18:34:18+03:00 (first commit of this session)
- **Task 3 completed:** 2026-08-27T18:48:18+03:00 (last commit)
- **Tasks:** 3/3 completed (Task 1 by the prior session, Tasks 2-3 by this one)
- **Files modified:** 11 across the whole plan (2 by Task 1, 9 by Tasks 2-3)

## Accomplishments

- `apps/mobile/lib/gym/profile-draft.ts` (Task 1, prior session): the editor's whole pure logic layer — `emptyGymProfileDraft`, `draftFromProfile`/`toEquipmentProfileDraft` (the one canonical-kg conversion boundary), `setDraftUnit` (reinterprets nothing already entered), the plate/dumbbell/machine mutators, `isGymProfileSaveable`, and `BAR_PRESETS`.
- `GymProfileEditor.tsx`: `GymProfileEditorView` (hook-free, direct-invocable by tests) plus a thin stateful `GymProfileEditor` wrapper. Renders Name, Unit system, Bar (four preset chips + weight field), Plates (weight + `renderTargetStepper`-driven pair count + remove glyph, plus an add-weight field/dashed-chip pair), Dumbbells (chip row + add-weight field/dashed-chip pair), Machines & Cable (named cards with a `ToggleRow` availability control gating the stack fields), and a Save Gym `PrimaryButton` disabled while not saveable or mid-save. A failed save renders the shipped `ErrorBanner` above the field stack without unmounting the form.
- `apps/mobile/app/gym-profiles/new.tsx` and `edit/[id].tsx`: the create/edit-share-one-form split, mirroring `exercises/new.tsx`/`edit/[id].tsx`. Both gained optional `userId`/`db` override props and an `onSaved` callback used only by the durability harness (production behaviour, reached only via real navigation with no props, is unchanged).
- `apps/mobile/app/gym-profiles/_layout.tsx`: registers the `new` and `edit/[id]` screens with their titles.
- `apps/mobile/app/gym-profiles/index.tsx` (06-03's file, extended): gained the same optional `userId`/`db` override props, needed for the durability harness to mount the real list screen against an isolated test database.
- `apps/mobile/app/__durability.web.tsx`: exactly two new methods, `openGymProfilesScreen()` and `openGymProfileEditor(profileId?)`, mounting the real `GymProfilesScreen`/`NewGymScreen`/`EditGymScreen` route components against the currently open database — no reimplemented wiring. A rendered `gym-editor-last-saved-id` testID surfaces a just-saved row's id (not a harness method) since the harness never navigates on save.
- `apps/mobile/e2e/gym-profiles.spec.ts`: a real-Chromium, real-`@powersync/web` proof driving the full lifecycle through the DOM — create (name, unit, bar weight, two plate denominations with a stepped count, a dumbbell weight, a machine with a stack range), a raw-row read asserting canonical-kg storage, an edit that moves exactly one column, then activate and archive through the list's row overflow.

## Task Commits

1. **Task 1: The pure editor draft module** - `5e6531f` (feat) — completed by a prior, quota-killed executor session; salvaged, verified (`pnpm --filter mobile test -- lib/gym` 26/26, `pnpm -w typecheck`/`pnpm -w test` green), and already merged into this executor's base before it started.
2. **Task 2: The editor form and its create and edit routes** - `db583ec` (feat)
3. **Task 3: Real-browser proof of the gym lifecycle** - `1c01d46` (feat)

**Plan metadata:** pending (final `docs(06-04): complete...` commit, made immediately after this SUMMARY commit)

## Files Created/Modified

- `apps/mobile/lib/gym/profile-draft.ts` - the editor's pure logic layer (Task 1)
- `apps/mobile/lib/gym/__tests__/profile-draft.test.ts` - unit coverage for the above (Task 1)
- `apps/mobile/components/GymProfileEditor.tsx` - `GymProfileEditorView` + `GymProfileEditor` wrapper
- `apps/mobile/components/__tests__/GymProfileEditor.test.tsx` - direct-invocation view tests
- `apps/mobile/app/gym-profiles/new.tsx` - create route, `createGymProfile` helper
- `apps/mobile/app/gym-profiles/edit/[id].tsx` - edit route, `updateGymProfile` helper
- `apps/mobile/app/gym-profiles/_layout.tsx` - registers `new`/`edit/[id]` screens
- `apps/mobile/app/gym-profiles/__tests__/gym-profile-editor-routes.test.tsx` - `createGymProfile`/`updateGymProfile` unit coverage
- `apps/mobile/app/gym-profiles/index.tsx` - gained `db`/`userId` override props (06-03's file, extended for the harness)
- `apps/mobile/app/__durability.web.tsx` - two new mount methods, `lastSavedGymId` testID value
- `apps/mobile/e2e/gym-profiles.spec.ts` - the real-browser lifecycle proof

## Decisions Made

See `key-decisions` in the frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `apps/mobile/app/gym-profiles/index.tsx` needed a db/userId override seam Task 3 could not work without**
- **Found during:** Task 3, wiring the list-mount harness method
- **Issue:** `GymProfilesScreen` read `userId` from `authClient.useSession()` and called every read/write helper with no explicit `db`, defaulting to the production `getPowerSync()` singleton. Mounting it against the harness's isolated test database (the whole point of Task 3's list-mount method) was impossible without a seam.
- **Fix:** Added an optional `GymProfilesScreenProps { userId?: string; db?: WriteDb }`, threaded through every read/write call in the screen. Both are `undefined` for every real navigation to this route, so production behaviour is unchanged.
- **Files modified:** `apps/mobile/app/gym-profiles/index.tsx`
- **Verification:** `pnpm --filter mobile typecheck` and `pnpm --filter mobile test` both green; `gym-profiles.spec.ts`'s activate/archive passes exercise this file directly through the harness.
- **Committed in:** `1c01d46` (Task 3 commit)

**2. [Rule 3 - Blocking] `new.tsx`/`edit/[id].tsx`'s `router.replace('/gym-profiles')` on save would break the harness**
- **Found during:** Task 3, designing the editor-mount harness method
- **Issue:** Both routes navigated to `/gym-profiles` on a successful save via `expo-router`'s real navigation. Calling this from a harness-mounted screen would navigate the single `/__durability` page away, unmounting `window[DURABILITY_HARNESS_GLOBAL]` and breaking every subsequent harness call in the same spec.
- **Fix:** Added an optional `onSaved` callback to both routes' props, run instead of `router.replace()` when supplied. `new.tsx`'s variant additionally receives the newly created row's id (the only way the harness can learn it, since `createEquipmentProfile` generates it server-side mid-write) — surfaced in the harness via a rendered testID value rather than a third harness method, to hold Task 3's "exactly two new methods" acceptance criterion.
- **Files modified:** `apps/mobile/app/gym-profiles/new.tsx`, `apps/mobile/app/gym-profiles/edit/[id].tsx`, `apps/mobile/app/__durability.web.tsx`
- **Verification:** `gym-profile-editor-routes.test.tsx` (unit), `gym-profiles.spec.ts` (e2e, real browser)
- **Committed in:** `db583ec` (routes) and `1c01d46` (harness wiring)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues Task 3 could not complete without extending Task 1/2 output, exactly as the resume instructions authorize).
**Impact on plan:** Both extensions are additive, optional-prop seams with no change to any real-navigation code path. No scope creep outside the gym-profiles subsystem this plan already owns.

## Issues Encountered

- A stale Metro dev server from an earlier test run was still bound to port 8081 and served the pre-Task-3 bundle, causing the first `test:e2e:durability` run to fail with `openGymProfileEditor is not a function`. Killed the stale process and reran; not a code defect.
- The e2e spec's `getByText('Archived', { exact: true })` initially matched two nodes (the collapsed section's own header and the archived row's own subtitle, both literally "Archived") — resolved by scoping to `.first()` (the header renders before the row in document order).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

GYM-02 and GYM-03 are fully implemented and proven end to end. The gym profile editor is the last piece 06-03's list screen was waiting on — its "New Gym"/"Edit" links, previously 404s in a fresh worktree, now resolve to working routes. Later plate-math plans in this phase can read `equipment_profile` rows with confidence that every stored weight is canonical kilograms and that the schema's declared limits (`EQUIPMENT_PROFILE_LIMITS`) are enforced client-side before a write is attempted.

The plan's `<verification>` `<human-check>` (create a gym in lb with plates/machine on the web target, confirm read-back and stepper floor interactively) was not run — no browser/simulator session for interactive review was available in this executor pass. Recorded as WINDOWS.md entry #142 (`unrun-verify`, open). The equivalent data flow is covered by the automated e2e spec, which is real evidence but not a substitute for the interactive confirmation the human-check line asks for.

## Self-Check: PASSED

- `[ -f apps/mobile/lib/gym/profile-draft.ts ]` -> FOUND
- `[ -f apps/mobile/components/GymProfileEditor.tsx ]` -> FOUND
- `[ -f apps/mobile/app/gym-profiles/new.tsx ]` -> FOUND
- `[ -f "apps/mobile/app/gym-profiles/edit/[id].tsx" ]` -> FOUND
- `[ -f apps/mobile/e2e/gym-profiles.spec.ts ]` -> FOUND
- `git log --oneline --all | grep 5e6531f` -> FOUND
- `git log --oneline --all | grep db583ec` -> FOUND
- `git log --oneline --all | grep 1c01d46` -> FOUND
