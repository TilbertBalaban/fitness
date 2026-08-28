---
phase: 07-advanced-set-types
plan: 05
subsystem: ui
tags: [react-native, drizzle, powersync, session-logging, set-types]

requires:
  - phase: 07-advanced-set-types
    provides: "07-01's read-path widening (parentSetId/side on LoggedSetRow/ResolvedSetRow), tree-flatten ordering, and the SetTypePickerSheet insert-child path; 07-04's set-groups.ts seam (clearSubEntries/removeSubEntry) and ExercisePage's handleSetTypeSelect/writeSetTypeEffect dispatch this plan's handlers sit beside"
provides:
  - "set-row-builders.ts: groupKindFor (D-07's myorep-parent-is-the-activation-set rule) and resolveGroupAddControls (the D-08 add-control visibility gate), plus GROUP_ADD_LABEL — the one place the three '+ Add' strings live"
  - "SetRow.tsx: the per-child 48x48 remove glyph (isChild + onRemoveChild only, never a parent), SetGroupAddControl (the dashed-border D-08 chip), and resolveSetRowColors (the destructive-color resolution SetRow's wrapper and ExercisePage now share)"
  - "set-groups.ts: addSubEntry — re-checks the parent's own session_exercise_id before delegating to logSet, the T-7-03 client-side grouping guard"
  - "ExercisePage.tsx wired end to end: the add control renders after a group's last row once visible, onAddSubEntry/onRemoveChild both leave the affected row present on a failed write (setTypeError), and drop/myorep/partial are each loggable through the picker plus this plan's add/remove controls with no second mechanism"
affects: [07-06, 07-07, 07-08, 07-09, 08-progression-engine, 09-analytics, 10-records]

actuals:
  tokens: 9015
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A group's 'kind' and its add-control visibility are pure, tested functions (groupKindFor/resolveGroupAddControls) the render layer calls once per render and never re-derives — the same discipline D-23's displaySetIndex already established in this file"
    - "Destructive-color resolution lives in one exported function (resolveSetRowColors) shared by SetRow's own wrapper and ExercisePage's, rather than each call site re-deriving GLYPH_COLORS-shaped light/dark literals independently"

key-files:
  created: []
  modified:
    - apps/mobile/lib/session/set-row-builders.ts
    - apps/mobile/lib/session/__tests__/set-row-builders.test.ts
    - apps/mobile/components/SetRow.tsx
    - apps/mobile/components/__tests__/SetRow.test.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/lib/db/set-groups.ts
    - apps/mobile/lib/db/__tests__/set-groups.test.ts

key-decisions:
  - "groupKindFor reads the parent's own setType first (myorep short-circuits to 'myorep' regardless of children, D-07's divergence) and falls back to the FIRST child's setType otherwise — the domain guarantees a group's children all share one type (drop or partial), so no reconciliation across children is needed."
  - "resolveGroupAddControls returns an entry (visible or not) for every group with a kind, rather than only for visible ones — ExercisePageView filters to `visible` itself. This keeps the function's contract 'resolve every group's state' rather than 'resolve only what should render right now', which is what let the myorep-parent-as-first-entry test assert `visible: false` explicitly instead of asserting an entry's absence."
  - "The 'last row of a group' (where the add control renders) is recomputed independently inside ExercisePageView from the same `rows` array, rather than widening GroupAddControl's shape with a lastEntrySetId field — keeps Task 1's already-committed interface exactly as specified (`{ parentSetId, kind, label, visible }`) and the lookup is a cheap second pass over an already-small array."
  - "The destructive glyph color is resolved once via a shared `resolveSetRowColors(themeColors, colorScheme)` export (mirroring GymProfileEditor.tsx's/SessionActionSheet.tsx's own DESTRUCTIVE_COLORS pattern) rather than widening the shared ThemeColors interface — SetRow.tsx's own wrapper and ExercisePage.tsx both call it, so the remove glyph gets the correct light/dark red at both of this row family's real call sites, not just a static fallback."
  - "addSubEntry's own select-then-delegate does not attempt to also delegate the cross-exercise check into logSet — it is deliberately the caller's own guard (matching removeSubEntry's identical each-mutation-checks-its-own-invariant shape from 07-04), so logSet stays a dumb insert with no knowledge of the grouping invariant."

patterns-established:
  - "A shared color-resolution helper exported from the component that owns the color map, called by every stateful wrapper that renders that component's view, instead of each call site re-deriving the same light/dark literal pair."

requirements-completed: [SETS-02, SETS-03, SETS-05]

coverage:
  - id: D1
    description: "groupKindFor resolves a myorep parent's kind as 'myorep' regardless of whether it has children yet (D-07's activation-set rule), and resolves a normal parent's kind from its children's own type (drop or partial)"
    requirement: "SETS-03"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#groupKindFor — returns myorep for a parent typed myorep regardless of whether it has children yet (D-07)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#groupKindFor — returns the children's own type for a normal parent with drop children, and likewise for partial children"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveGroupAddControls marks a drop/partial group's control visible once its LAST child completes, and a myorep group's control visible once the PARENT itself completes when it has no children yet — generalising D-08 to the activation-set case"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#resolveGroupAddControls — marks a drop group visible once its LAST child is completed, and not visible while that last child is incomplete"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#resolveGroupAddControls — named for the myorep parent-as-first-entry rule — visible flips with the PARENT's completion, not a child's"
        status: pass
    human_judgment: false
  - id: D3
    description: "A mini-set appended to the FIRST of three parents leaves the second and third parents' displaySetIndex unchanged at 2 and 3 (SETS-03/ordering edge)"
    requirement: "SETS-03"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#buildSetRows — SETS-03/ordering edge"
        status: pass
    human_judgment: false
  - id: D4
    description: "A plain exercise's row list is unaffected: resolveGroupAddControls returns an empty array for plain parents, and GROUP_ADD_LABEL has no entry for normal/warmup/failure/amrap (R15)"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#resolveGroupAddControls — emits no control at all for a group with no kind, so a plain exercise row list is byte-identical to its Phase 5 self (R15)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/set-row-builders.test.ts#GROUP_ADD_LABEL — maps drop, myorep and partial to the exact Copywriting Contract strings and has no entry for any other set type"
        status: pass
    human_judgment: false
  - id: D5
    description: "SetRowView renders the 48x48 'Remove sub-entry' glyph only when isChild AND onRemoveChild are both supplied — never on a parent row regardless of the handler being present — and tapping it calls onRemoveChild exactly once without also firing onCheckmarkPress"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetRow.test.tsx#SetRowView — Task 2 (07-05): the per-child remove glyph"
        status: pass
    human_judgment: false
  - id: D6
    description: "SetGroupAddControl renders the dashed-border, text-accent, 48-minimum chip carrying the given label and calls onPress exactly once when tapped"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: 'apps/mobile/components/__tests__/SetRow.test.tsx#SetGroupAddControl — Task 2 (07-05): the D-08 "+ Add {type}" control'
        status: pass
    human_judgment: false
  - id: D7
    description: "addSubEntry delegates its insert to the existing logSet transaction (never a second insert path) and refuses a parentSetId whose row belongs to a different session_exercise (T-7-03), leaving logSet uncalled"
    requirement: "SETS-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/set-groups.test.ts#addSubEntry — delegates to logSet with the blank-slot shape isBlankSubEntry recognises, and returns its id"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/set-groups.test.ts#addSubEntry — rejects a parentSetId whose row belongs to a different session_exercise, and never calls logSet"
        status: pass
    human_judgment: false
  - id: D8
    description: "ExercisePage renders the add control after a group's last row, wires onAddSubEntry/onRemoveChild through handleAddSubEntry/handleRemoveChild, and a drop set, a myorep cluster, and a full-plus-partials set can each be logged end to end through the picker plus this plan's controls with no second mechanism (SETS-02/03/05)"
    requirement: "SETS-05"
    verification:
      - kind: unit
        ref: "grep-based acceptance criteria (resolveGroupAddControls/SetGroupAddControl/addSubEntry/removeSubEntry reference counts, zero hardcoded 'Add Drop' at the render site) + pnpm -w typecheck exit 0 + pnpm --filter mobile test -- 'ExercisePager|SetRow|set-row-builders' exit 0"
        status: pass
    human_judgment: true
    rationale: "This plan's own deferred human-check (log 10 reps, tap the set number, pick Partial, log 3 into the indented child, confirm the pair reads as one logical set) is explicitly deferred to the end-of-phase sweep per human_verify_mode: end-of-phase — matching 07-01/07-03/07-04's identical pattern. ExercisePage has no dedicated render-level test suite in this codebase (07-01-SUMMARY.md's documented, inherited gap), so the wiring here is verified structurally and by the full targeted/typecheck suite passing, not by a rendered end-to-end assertion."
  - id: D9
    description: "E3 Set Row / error backstop: a child row whose local delete write fails renders a defined state (the row stays present, the shipped setTypeError banner surfaces) rather than silently vanishing or silently staying stuck"
    verification: []
    human_judgment: true
    rationale: "The plan's own must_haves list this as a `verification: backstop` truth, not a probe-derived acceptance criterion — handleRemoveChild's catch branch sets the existing setTypeError state and never calls onExerciseChanged on failure (so the row is never optimistically removed), but no held-out UI-state test forces a failing removeSubEntry write and asserts the specific rendered banner/row-presence combination. Deferred to the end-of-phase UI-state sweep alongside the identical backstop this phase's UI-SPEC flags for E3's long-text/localization case."

duration: 6min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 5: Grow and Prune a Group — the D-08 Add Control and the Per-Child Remove Glyph Summary

**Ships `groupKindFor`/`resolveGroupAddControls` (the D-08 add-control visibility gate, generalised to myorep's activation-set-as-first-entry case), the per-child 48x48 remove glyph and `SetGroupAddControl` chip in `SetRow.tsx`, `set-groups.ts`'s `addSubEntry`, and wires all three into `ExercisePage.tsx` — completing drop sets (SETS-02), myoreps (SETS-03) and partials (SETS-05) as one shared, growable/prunable grouping mechanism with no second mechanism per type.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-28T19:41:00Z (approx.)
- **Completed:** 2026-08-28T19:47:14Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- `set-row-builders.ts` gained three pure, tested exports: `GROUP_ADD_LABEL` (the one place the three "+ Add" strings live), `groupKindFor` (myorep's parent-is-the-activation-set divergence, D-07), and `resolveGroupAddControls` (D-08's visibility gate, generalised to a childless myorep parent as the group's "most recent entry").
- `SetRow.tsx` gained the per-child remove glyph (isChild + `onRemoveChild` only, a parent never carries it — asserted directly by test) and `SetGroupAddControl`, the dashed-border D-08 chip reusing the third instance of Gym Profile Editor's add-chip visual language. Also added `resolveSetRowColors`, resolving the destructive glyph color the same way at both of the row family's real call sites (`SetRow`'s own wrapper and `ExercisePage`) instead of a static per-file fallback.
- `set-groups.ts` gained `addSubEntry` — re-checks the parent row's own `session_exercise_id` before delegating the actual insert to the existing `logSet` transaction (never a second insert path), the T-7-03 client-side half of the cross-exercise grouping defence.
- `ExercisePage.tsx` wires the add control to render immediately after a group's last row once visible, threads `onRemoveChild` into child rows only, and adds `handleAddSubEntry`/`handleRemoveChild` — both leave the affected row present and surface the existing `setTypeError` banner on a failed write rather than optimistically mutating the row list.
- Confirmed by test and typecheck (not by adding a new branch) that the myorep path needs no second mechanism: 07-04's picker dispatch already retypes the parent to myorep, and this plan's `resolveGroupAddControls`/`addSubEntry` alone grow it.

## Task Commits

1. **Task 1: Resolve a group's kind and when its add control is allowed to appear** - `456d7a5` (feat)
2. **Task 2: The child's remove glyph and the group's add control, rendered from inside the row family** - `90d7f56` (feat)
3. **Task 3: Wire drops, myoreps and partials into the page — grow, prune, reload** - `5768145` (feat)

## Files Created/Modified

- `apps/mobile/lib/session/set-row-builders.ts` - `GROUP_ADD_LABEL`, `groupKindFor`, `resolveGroupAddControls`
- `apps/mobile/lib/session/__tests__/set-row-builders.test.ts` - the SETS-03/ordering edge case plus full coverage for the three new exports
- `apps/mobile/components/SetRow.tsx` - the per-child remove glyph, `SetGroupAddControl`, `resolveSetRowColors`, `SetRowColors`
- `apps/mobile/components/__tests__/SetRow.test.tsx` - remove-glyph visibility/tap and `SetGroupAddControl` render/tap coverage
- `apps/mobile/components/ExercisePage.tsx` - add-control render-after-last-row logic, `onRemoveChild` threading, `handleAddSubEntry`/`handleRemoveChild`
- `apps/mobile/lib/db/set-groups.ts` - `addSubEntry`
- `apps/mobile/lib/db/__tests__/set-groups.test.ts` - delegation, side-threading, and cross-exercise-refusal coverage for `addSubEntry`

## Decisions Made

- `groupKindFor` checks the parent's own `setType` first (myorep short-circuits regardless of children) and falls back to the first child's `setType` — the domain already guarantees a group's children share one type, so no cross-child reconciliation is needed.
- `resolveGroupAddControls` returns an entry (visible or not) for every group with a kind, rather than filtering to only-visible internally — `ExercisePageView` does that filtering itself, which is what lets the myorep-parent-as-first-entry test assert `visible: false` explicitly.
- The "last row of a group" (where the add control renders) is recomputed inside `ExercisePageView` from the same `rows` array rather than widening `GroupAddControl`'s shape — keeps Task 1's already-committed interface exactly as specified.
- `resolveSetRowColors(themeColors, colorScheme)` is exported from `SetRow.tsx` and called by both `SetRow`'s own wrapper and `ExercisePage`, rather than widening the shared `ThemeColors` interface — mirrors the `GymProfileEditor.tsx`/`SessionActionSheet.tsx` `DESTRUCTIVE_COLORS` precedent exactly, and is what lets the remove glyph render the correct light/dark red at both of this row family's production call sites.
- `addSubEntry` owns its own cross-exercise guard rather than pushing it into `logSet` — matches `removeSubEntry`'s identical each-mutation-checks-its-own-invariant shape from 07-04, keeping `logSet` a dumb insert with no knowledge of the grouping invariant.

## Deviations from Plan

None — plan executed exactly as written. `SetRow.tsx`'s `resolveSetRowColors` addition in Task 3 is within the plan's own top-level `files_modified` list (which already named `SetRow.tsx`), even though Task 3's own `<files>` tag names only `ExercisePage.tsx` — not a scope violation, just a small addition inside an already-declared file, made to avoid a duplicated color-map literal at the new call site.

## Issues Encountered

None. The fresh-worktree bootstrap (`pnpm install`, `pnpm -w build`) completed cleanly, and every targeted and full-workspace test run (`pnpm -w test`: 8 packages, 2029 tests total) passed on the first attempt after each task's implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SETS-02, SETS-03 and SETS-05 are each loggable end to end through the one shared `parent_set_id` grouping mechanism (D-05) — no second grouping concept, column, or renderer was introduced.
- `resolveGroupAddControls`/`groupKindFor`/`addSubEntry` are ready for 07-08 (per-side logging, D-20) to build on directly if it needs an analogous "grow a group" mechanism, though per-side's own R child is created automatically on parent completion rather than via an explicit "+" tap (UI-SPEC), so 07-08 is expected to call `addSubEntry` directly rather than through the add-control's visibility gate.
- Two backstop truths from this plan's own `must_haves` remain open per `human_verify_mode: end-of-phase`, consistent with every sibling plan in this phase: (1) the deferred visual human-check (drop set / myorep cluster / partial pair rendering correctly end to end on the web target), and (2) the specific rendered state of a child row whose local delete write fails (D9 above) — both flagged rather than silently assumed fine, to be swept at phase end.

## Self-Check: PASSED

- FOUND: apps/mobile/lib/session/set-row-builders.ts (groupKindFor/resolveGroupAddControls/GROUP_ADD_LABEL)
- FOUND: apps/mobile/components/SetRow.tsx (SetGroupAddControl/resolveSetRowColors/Remove sub-entry)
- FOUND: apps/mobile/lib/db/set-groups.ts (addSubEntry)
- FOUND: apps/mobile/components/ExercisePage.tsx (resolveGroupAddControls/addSubEntry/removeSubEntry wiring)
- FOUND commit 456d7a5
- FOUND commit 90d7f56
- FOUND commit 5768145

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
