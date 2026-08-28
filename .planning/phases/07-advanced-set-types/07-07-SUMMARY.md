---
phase: 07-advanced-set-types
plan: 07
subsystem: session-logging
tags: [react-native, session-logging, supersets, auto-advance, rest-timer]

requires:
  - phase: 07-advanced-set-types
    plan: 06
    provides: "superset.ts's five predicates (isFinalGroupMember, nextSupersetMemberIndex, supersetMembers, supersetPartnerLabel, detachRowPartnerName) scoped to live group members; formSuperset/detachSuperset; SessionActionSheet's four new conditional rows"
  - phase: 07-advanced-set-types
    plan: 03
    provides: "shouldAutoAdvance's parent-row filter and unchanged single-export shape"
  - phase: 07-advanced-set-types
    plan: 05
    provides: "ExercisePage's actionBarSlot layout precedent (header, then this slot, then rows)"
provides:
  - "handleCheckmarkPress gated on isFinalGroupMember (D-13 rest suppression) and nextSupersetMemberIndex evaluated before shouldAutoAdvance at both completion call sites (D-14 member advance)"
  - "ExerciseStripExercise.supersetGroupId and the decorative link-outline glyph on a paired chip"
  - "ExercisePage wired end to end: Superset/Detach dispatch formSuperset/detachSuperset, SupersetPartnerChip renders and jumps the pager, SessionActionSheet's nextExerciseName/supersetPartnerName resolve from the shared predicates"
affects: [07-08, 07-09, 08-progression-engine, 09-analytics, 10-records]

actuals:
  tokens: 7513
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "The superset-internal advance (D-14) is evaluated and, when it fires, short-circuits shouldAutoAdvance entirely for that completion — the two triggers stay two separate functions/call sites rather than one being folded into the other (Pitfall 5)"
    - "A required-but-out-of-scope call site (EditingWorkoutScreen.tsx's own ExercisePage render) is satisfied with an always-empty SupersetMemberInput[] rather than threading real data through a subtree that structurally has no live pager to advance (D-32) — the same 'required field forces every call site' discipline 07-03 established, applied here to a genuinely inapplicable screen instead of a missed real one"

key-files:
  created: []
  modified:
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - apps/mobile/components/ExerciseStrip.tsx
    - apps/mobile/components/__tests__/ExerciseStrip.test.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/components/EditingWorkoutScreen.tsx

key-decisions:
  - "handleCheckmarkPress is not exported (it lives inside the stateful useWorkoutScreen hook) and this repo carries no react-test-renderer/@testing-library harness (the threat register itself commits to zero new packages this phase), so Task 1's eight behaviors are tested as the exact composition workout.tsx performs — isFinalGroupMember gating rest, and a locally mirrored resolveMemberAdvance(members, currentIndex, autoAdvanceEnabled) helper reproducing the same nextSupersetMemberIndex+autoAdvanceEnabled gate — against SupersetMemberInput fixtures built the same way workout.tsx's own supersetGroupMembers map is built."
  - "The member-advance gate is written as 'if (memberAdvanceIndex !== null && autoAdvanceEnabled) { setCurrentIndex(...) } else { call shouldAutoAdvance }' rather than a three-way branch — when autoAdvanceEnabled is false, falling through to shouldAutoAdvance is behaviorally identical to skipping it (shouldAutoAdvance's own first line already returns null when !enabled), so this stays one conditional instead of two."
  - "nextExerciseName for the sheet's Superset row is computed in ExercisePage from sessionExerciseRows sorted by orderIndex, mirroring formSuperset's own 'next live adjacent exercise' pairing rule exactly, so the row's label always names the exercise the write will actually pair with — never a separately-guessed adjacency."
  - "SupersetPartnerChip resolves its own jump target by reading supersetMembers and stepping to (position + 1) % members.length — this single expression handles both the two-member 'jump to partner' case and the N-of-3-or-more 'jump to the cyclically next member' case with no branch between them."

patterns-established: []

requirements-completed: [SETS-07, SETS-08]

coverage:
  - id: D1
    description: "Completing a set on the lower-orderIndex member of a two-member superset writes no rest_target_at and schedules no alert; completing a set on the higher-orderIndex member writes it exactly as an ungrouped exercise does (D-13)"
    requirement: "SETS-07"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx#handleCheckmarkPress — rest suppression and member advance (D-13, D-14) — writes no rest_target_at for the LOWER-orderIndex member... / writes rest_target_at exactly as an ungrouped exercise does for the HIGHER-orderIndex member..."
        status: pass
    human_judgment: false
  - id: D2
    description: "The survivor of a mid-session removed partner starts rest again immediately — isFinalGroupMember sees one live member and treats it as ungrouped (D-24)"
    requirement: "SETS-07"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx#the survivor of a removed partner writes rest_target_at again — only the live member remains (D-24)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A non-final member's completion advances the pager to the next member under the existing auto-advance preference, moves nothing when that preference is off, and the superset-internal advance is evaluated first so a final member still falls through to shouldAutoAdvance unchanged (D-14, Pitfall 5)"
    requirement: "SETS-07"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx#a non-final member completion moves the pager... / with auto-advance disabled... / the superset-internal advance is evaluated first..."
        status: pass
      - kind: unit
        ref: "grep-based acceptance criteria: isFinalGroupMember/nextSupersetMemberIndex call-count checks, shouldAutoAdvance single-export and zero-diff checks on auto-advance.ts, zero new RestTimerBar/Toast/Banner additions"
        status: pass
    human_judgment: false
  - id: D4
    description: "A superset chip carries a decorative link-outline glyph inset top-right, changes nothing else about the chip (tone/fraction/CHIP_TONES untouched, no third Pressable), and the accessibility label carries a superset suffix only when paired (D-12, E5 partial)"
    requirement: "SETS-07"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseStrip.test.tsx#renders no link glyph.../renders exactly one link glyph.../the link glyph is not a Pressable.../the chip's tone class string is identical.../carries the accessibility label superset suffix only when paired"
        status: pass
    human_judgment: false
  - id: D5
    description: "Forming and detaching a superset are one tap each from the exercise's own action sheet — the Superset/Detach rows dispatch formSuperset/detachSuperset, a rejected write leaves the sheet open with the shared error state rather than closing as if it applied (E4), and every SessionExerciseActionId is dispatched explicitly (no unhandled id silently opens Reorder)"
    requirement: "SETS-08"
    verification:
      - kind: unit
        ref: "grep-based acceptance criteria: formSuperset/detachSuperset/supersetPartnerLabel/detachRowPartnerName/SupersetPartnerChip reference counts, id === ' dispatch-arm count >= 7"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/SessionActionSheet.test.tsx (unchanged suite, still green — the sheet's own row visibility/back-compat contract this plan threads real values into)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The partner chip renders the shared predicate's own label copy beneath the header and above the action bar, renders nothing when ungrouped or shrunk to one live member (D-24), and jumps the pager to the partner (two-member) or cyclically to the next member (three-or-more) on tap, reusing the strip's own jump handler"
    requirement: "SETS-08"
    verification: []
    human_judgment: true
    rationale: "ExercisePage has no dedicated render-level test suite in this codebase (07-01/07-05's documented, inherited gap) — the wiring is verified structurally (grep counts, typecheck) and by the full targeted suite passing, not by a rendered end-to-end assertion. This plan's own deferred human-check (open an exercise's overflow sheet, tap Superset, confirm both chips show the link glyph and the page header shows the partner pill, then tap Detach and confirm both disappear) is deferred to the end-of-phase sweep per human_verify_mode: end-of-phase, matching every sibling plan in this phase."
  - id: D7
    description: "Zero regression in existing behavior: the full workspace unit suite and the durability e2e suite (including the rest-timer specs) stay green now that rest scheduling is conditional"
    verification:
      - kind: unit
        ref: "pnpm -w test — 91 suites, 1704 tests, all pass"
        status: pass
      - kind: e2e
        ref: "pnpm --filter mobile test:e2e:durability — 48/48 specs pass, including rest-timer.spec.ts's four specs"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 7: Superset Rest Suppression, Member Advance, and the Sheet/Chip Wiring Summary

**Rest starts only after a superset group's final live member completes a set, a non-final member's completion advances the pager through the group under the existing auto-advance preference, and Superset/Detach are wired one tap each from the exercise action sheet with a link glyph and partner-pill affordance on both the strip and the page.**

## Performance

- **Duration:** ~20 min (approx.)
- **Started:** 2026-08-28T16:50:00Z (approx.)
- **Completed:** 2026-08-28T17:10:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Closed D-13: `handleCheckmarkPress`'s rest-scheduling block (the `restTargetFrom`/`scheduleRestAlert`/`cancelRestAlert` write) is now guarded on `isFinalGroupMember(supersetGroupMembers, exercise.id)` — a non-final member's completion leaves `rest_target_at` untouched, the header timer bar simply stays dormant, and an ungrouped exercise needs no branch of its own since the predicate already returns true for a null group id.
- Closed D-14: `nextSupersetMemberIndex` is evaluated immediately before both `shouldAutoAdvance` call sites; when it returns a non-null index and the existing `autoAdvanceEnabled` preference is on, the pager advances to it and `shouldAutoAdvance` is skipped entirely for that completion. `shouldAutoAdvance` itself is byte-for-byte unchanged (`git diff --stat apps/mobile/lib/session/auto-advance.ts` reports nothing), keeping the two triggers as two separate functions per Pitfall 5.
- `ExerciseStripExercise` gained an optional `supersetGroupId`; a paired chip now renders a 12px `link-outline` glyph inset top-right, decorative and non-interactive (no third `Pressable`), with the chip's existing tone/fraction/`CHIP_TONES` provably untouched and an accessibility label suffix added only when paired.
- `ExercisePage` is wired end to end: `sessionExerciseRows`/`onSelectExercise` thread the live members list and the strip's own jump handler in; `handleSessionAction` dispatches every `SessionExerciseActionId` explicitly (no id silently falls through to Reorder); `formSuperset`/`detachSuperset` are called with no confirmation (matching Switch Gym's precedent) and leave the sheet open with the shared `setTypeError` state on a rejected write; `SupersetPartnerChip` renders the `bg-secondary rounded-full` pill beneath the header and jumps the pager on tap via `(position + 1) % members.length`, covering both the two-member and N-of-3-or-more cases with one expression.
- `EditingWorkoutScreen.tsx`'s own (out-of-plan-scope) `ExercisePage` call site needed the same two new required props — supplied an always-empty `SupersetMemberInput[]` constant rather than threading real data through a subtree that structurally excludes the live-session rest/auto-advance machinery entirely (D-32): a past, already-completed workout has no pager to advance and no rest to suppress, so no Superset/Detach affordance is reachable there, which is the correct behavior rather than a gap.
- Full workspace regression: `pnpm -w test` (91 suites, 1704 tests) and `pnpm --filter mobile test:e2e:durability` (48/48 specs, including all four `rest-timer.spec.ts` cases) both pass with no changes needed elsewhere.

## Task Commits

1. **Task 1: Rest starts only after the group's final member, and a non-final member advances the pager** - `2f47667` (feat)
2. **Task 2: The strip's link badge and the page's partner chip** - `6907de6` (feat)
3. **Task 3: Wire Superset and Detach into the page, and render the partner chip** - `9be66b8` (feat)

## Files Created/Modified

- `apps/mobile/app/(tabs)/workout.tsx` - `supersetGroupMembers` (the live `SupersetMemberInput[]`), the D-13 rest guard and D-14 member-advance gate in `handleCheckmarkPress`, `supersetGroupId` threaded into the strip's `exercises` map, `supersetGroupMembers`/`onSelectExercise` threaded into `ExercisePage`'s render
- `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` - eight behavior tests against the composition `handleCheckmarkPress` performs, `WorkoutScreenViewProps`'s new `supersetGroupMembers` fixture field
- `apps/mobile/components/ExerciseStrip.tsx` - `ExerciseStripExercise.supersetGroupId`, the link-outline glyph and its accessibility-label suffix
- `apps/mobile/components/__tests__/ExerciseStrip.test.tsx` - glyph presence/absence, Pressable-count, tone-identity, and accessibility-label coverage
- `apps/mobile/components/ExercisePage.tsx` - `sessionExerciseRows`/`onSelectExercise` props, `nextExerciseName`/`supersetPartnerName` derivation, `handleFormSuperset`/`handleDetachSuperset`, explicit-per-id `handleSessionAction`, `SupersetPartnerChip` component and its render placement
- `apps/mobile/components/EditingWorkoutScreen.tsx` - `EMPTY_SUPERSET_MEMBERS` constant and the two new required props at its own `ExercisePage` call site (Rule 3 fix, out-of-scope file)

## Decisions Made

- Tested Task 1's eight behaviors against the exact composition `handleCheckmarkPress` performs (`isFinalGroupMember` gating rest, a locally mirrored `resolveMemberAdvance` helper reproducing the `nextSupersetMemberIndex`+`autoAdvanceEnabled` gate) rather than driving the stateful hook itself, since `handleCheckmarkPress` is not exported and this repo carries no hook-rendering test harness (and the threat register commits to zero new packages this phase).
- Wrote the member-advance gate as a two-way branch (`memberAdvanceIndex !== null && autoAdvanceEnabled` vs. falling through to `shouldAutoAdvance`) rather than a three-way branch, since `shouldAutoAdvance` already no-ops when `!enabled` — the fallthrough is behaviorally identical to an explicit "moves nothing" branch.
- `nextExerciseName` is computed in `ExercisePage` by sorting `sessionExerciseRows` by `orderIndex` and reading the row after the current one — deliberately mirroring `formSuperset`'s own pairing rule so the sheet's label always names the exercise the write will actually pair with.
- `SupersetPartnerChip` resolves its jump target with one modulo expression (`(position + 1) % members.length`) rather than a two-member/N-member branch, since the same expression is correct for both shapes.
- `EditingWorkoutScreen.tsx`'s `ExercisePage` call site gets an always-empty members list rather than real `supersetGroupId` data — that screen structurally has no live pager or rest timer to affect (D-32), so no Superset/Detach row or partner chip can ever be reachable there, which is correct rather than a workaround.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `EditingWorkoutScreen.tsx`'s own `ExercisePage` call site needed the two new required props**
- **Found during:** Task 3's `pnpm -w typecheck` run
- **Issue:** `EditingWorkoutScreen.tsx` (outside this plan's `files_modified` list) renders `ExercisePage` for the past-session editing subtree. Making `sessionExerciseRows`/`onSelectExercise` required fields on `ExercisePageProps` turned this pre-existing call site into a compile error, the same mechanism 07-03 documented for `parentSetId`.
- **Fix:** Added a module-level `EMPTY_SUPERSET_MEMBERS: SupersetMemberInput[] = []` constant and threaded it plus the screen's own existing `onSelectExercise` handler into the call site. This is not a stopgap — D-32 already structurally excludes rest/auto-advance machinery from this subtree, so an always-empty members list is the semantically correct answer (no superset affordance is reachable when editing a past, already-completed workout), not merely a type-satisfying placeholder.
- **Files modified:** `apps/mobile/components/EditingWorkoutScreen.tsx`
- **Commit:** `9be66b8` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change — the fix satisfies a pre-existing, unrelated call site that this plan's required-field choice reached by construction, and the empty-list answer is the correct one for that screen's design, not a workaround.

## Issues Encountered

None. The fresh-worktree bootstrap (`pnpm install`, `pnpm -w build`) completed cleanly. Every targeted test run passed on the first attempt after implementation. The full-workspace `pnpm -w test` run (91 suites, 1704 tests) and the durability e2e suite (48/48 specs) both passed cleanly with no follow-up fixes needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SETS-07 and SETS-08 are observable end to end: rest suppression, member advance, the link glyph, the partner chip, and the Superset/Detach dispatch all exist and are wired to the same shared predicates and mutations 07-06 published.
- The plan's own deferred human-check (visually confirming the header rest column stays dormant through a superset pair and the partner pill/link glyphs render correctly on the web target) remains open per `human_verify_mode: end-of-phase`, consistent with every sibling plan in this phase — not blocking this plan's completion.
- `SessionActionSheet`'s `perSideEnabled`/`perSideAvailable` props are still left undefined at this call site (both per-side rows stay hidden) — 07-08 is expected to supply real values there directly, per 07-06's own documented next-phase-readiness note.
- The `setTypeError` state set on a rejected `formSuperset`/`detachSuperset` write is not yet visibly rendered by `SessionActionSheet` itself (that component has no `errorMessage` prop, and `SessionActionSheet.tsx` was outside this plan's `files_modified` scope) — the state is set correctly per the plan's own instruction, but the E4 backstop's visible banner for this specific sheet is a gap for a future pass to close if a real write failure needs to surface to the user from the overflow sheet.

## Self-Check: PASSED

- FOUND: apps/mobile/app/(tabs)/workout.tsx
- FOUND: apps/mobile/components/ExerciseStrip.tsx
- FOUND: apps/mobile/components/ExercisePage.tsx
- FOUND: apps/mobile/components/EditingWorkoutScreen.tsx
- FOUND commit 2f47667
- FOUND commit 6907de6
- FOUND commit 9be66b8

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
