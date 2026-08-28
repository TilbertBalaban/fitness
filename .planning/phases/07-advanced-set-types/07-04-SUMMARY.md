---
phase: 07-advanced-set-types
plan: 04
subsystem: ui
tags: [react-native, drizzle, powersync, session-logging, set-types]

requires:
  - phase: 07-advanced-set-types
    provides: "07-01's SetTypePickerSheet scaffold (SET_TYPE_PICKER_ROWS, the childless setTypePickerEffect shorthand), the widened read path (parentSetId/side on LoggedSetRow/ResolvedSetRow/ExercisePageSetRow), and countsTowardWorkingVolume/countsTowardRecords"
provides:
  - "resolveSetTypeSelection: the whole UI-SPEC behavior table as one pure, exhaustively tested dispatch function over 'retype' | 'insert-child' | 'confirm-first' | 'no-op' — structurally incapable of retyping a parent row to drop or partial (Pitfall 6)"
  - "FAILURE_SET_RIR (0), so a failure retype and its RIR write are one act (SETS-04)"
  - "SetTypePickerSheetView's E1 error state — the shipped ErrorBanner rendered inline, sheet stays open on a failed write"
  - "ChangeSetTypeDialog: the D-09 destructive confirm, ArchiveDialog-shaped, singular/plural sub-entry copy, E2 error state"
  - "set-groups.ts: clearSubEntries (transactional group delete) and removeSubEntry (single-child delete that refuses a parent row) — the group-mutation seam 07-05/07-08 build on"
  - "ExercisePage.handleSetTypeSelect wired to all four dispatch effects, plus the confirm-then-clear-then-apply flow and its own write-failure state"
  - "docs/session-vocabularies.md: all seven SET_TYPES values now written (no reserved subset), countsTowardWorkingVolume/countsTowardRecords documented beside the vocabulary"
affects: [07-05, 07-08, 08-progression-engine, 09-analytics, 10-records]

actuals:
  tokens: 10089
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Full behavior-table dispatch (resolveSetTypeSelection) layered over a childless-case shorthand (setTypePickerEffect) that calls the fuller function with a guaranteed-different currentSetType — one function owns the rule, the tracer's narrower surface is derived, never duplicated"
    - "Confirm-then-mutate-then-write flow: stash the pending selection in state, run the destructive delete and the pending write inside one try/catch, surface a single shared errorMessage to whichever of the picker/confirm dialog is open"

key-files:
  created:
    - apps/mobile/components/ChangeSetTypeDialog.tsx
    - apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx
    - apps/mobile/lib/db/set-groups.ts
    - apps/mobile/lib/db/__tests__/set-groups.test.ts
  modified:
    - apps/mobile/components/SetTypePickerSheet.tsx
    - apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx
    - apps/mobile/components/ExercisePage.tsx
    - docs/session-vocabularies.md

key-decisions:
  - "resolveSetTypeSelection implements the table as three ordered checks (selected===currentSetType -> no-op; selected is drop/partial -> insert-child/no-op/confirm-first keyed on childSetType; else -> retype/confirm-first keyed on childCount) rather than a literal per-cell lookup table, since the UI-SPEC's cells collapse into exactly these three rules with no exceptions once the drop/partial branch is isolated."
  - "setTypePickerEffect (07-01's shorthand) is now a one-line wrapper: it picks a currentSetType guaranteed to differ from the argument (never a literal that could coincidentally equal one of the seven SET_TYPES values being tested) and calls resolveSetTypeSelection with childCount 0 — this keeps the tracer's existing two-value test surface passing unchanged with zero table duplication."
  - "clearSubEntries and removeSubEntry each do a select-then-delete rather than trusting a delete's own affected-row count, because no return-count convention exists yet on this codebase's WriteDb wrapper (drizzle-over-PowerSync) — selecting first is also what makes removeSubEntry's parent-row refusal possible without a second query."
  - "The confirm-first flow's post-clear write reuses the already-exported setTypePickerEffect (the childless shorthand) rather than re-deriving retype-vs-insert-child inline, since after clearSubEntries the target is genuinely childless and that is exactly the case the shorthand answers."

patterns-established:
  - "Dispatch-table-over-shorthand layering: a plan that must serve both a narrow legacy call site and a fuller new contract defines the fuller function first and expresses the legacy shape as one of its call patterns, never the reverse."

requirements-completed: [SETS-01, SETS-04]

coverage:
  - id: D1
    description: "resolveSetTypeSelection implements the full behavior table: five retype-only types on a childless row, Drop Set/Partial insert-child, the active type is a no-op, same-kind children on Drop/Partial are a no-op, and every other combination on a grouped row is confirm-first"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx#resolveSetTypeSelection — the full behavior table (07-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveSetTypeSelection never returns retype for drop or partial, under every child-state combination"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx#never resolves drop or partial to retype, under every child-state combination"
        status: pass
    human_judgment: false
  - id: D3
    description: "Selecting Failure retypes the row and writes rir=0 (FAILURE_SET_RIR) in the same write, never null and never inherited"
    requirement: "SETS-04"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx#FAILURE_SET_RIR is exactly 0; manual trace of ExercisePage.writeSetTypeEffect's failure branch"
        status: pass
    human_judgment: true
    rationale: "FAILURE_SET_RIR's value is unit-pinned at 0, but the end-to-end write (ExercisePage.writeSetTypeEffect calling updateLoggedSet with rir:FAILURE_SET_RIR) has no ExercisePage-level test in this plan — 07-01-SUMMARY.md documented the identical gap for the tracer's own write path, and this plan's Task 3 verification is grep/typecheck-based per its own acceptance criteria, not a rendered-component test. Covered by the plan's own deferred human-check (end-of-phase sweep)."
  - id: D4
    description: "A failed set-type write renders the shipped ErrorBanner inline and keeps the sheet open on its pre-selection state rather than dismissing (E1 error state)"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx#renders the ErrorBanner with the supplied errorMessage / renders no ErrorBanner when errorMessage is not supplied"
        status: pass
    human_judgment: false
  - id: D5
    description: "ChangeSetTypeDialog renders the exact D-09 Copywriting Contract copy (singular/plural), a destructive Delete and Change confirm, a Cancel that dismisses with no change, and its own E2 error state"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx (all eight cases)"
        status: pass
    human_judgment: false
  - id: D6
    description: "clearSubEntries deletes every logged_set row whose parent_set_id matches, leaves the parent and unrelated rows untouched, is a no-op on a childless parent, and runs as one transaction"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/set-groups.test.ts#clearSubEntries — the group-level delete D-09 gates behind a confirm"
        status: pass
    human_judgment: false
  - id: D7
    description: "removeSubEntry deletes exactly one row and refuses (returns falsy, deletes nothing) when called with a parent row's own id"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/set-groups.test.ts#removeSubEntry — the per-child remove, deliberately un-confirmed"
        status: pass
    human_judgment: false
  - id: D8
    description: "docs/session-vocabularies.md no longer describes any SET_TYPES value as reserved; countsTowardWorkingVolume/countsTowardRecords are documented beside the vocabulary"
    requirement: "SETS-01"
    verification:
      - kind: other
        ref: "grep -v '^\\s*<!--' docs/session-vocabularies.md | grep -ci 'reserved for phase 7' == 0; grep -c countsTowardWorkingVolume/countsTowardRecords >= 1"
        status: pass
    human_judgment: false
  - id: D9
    description: "ExercisePage wires all four resolveSetTypeSelection effects (no-op, retype, insert-child, confirm-first), the confirm-then-clear-then-apply flow, and a shared write-failure state across the picker and the confirm dialog"
    requirement: "SETS-01"
    verification:
      - kind: unit
        ref: "grep-based acceptance criteria (resolveSetTypeSelection/FAILURE_SET_RIR/clearSubEntries/ChangeSetTypeDialog reference counts) + pnpm -w typecheck exit 0 + pnpm --filter mobile test -- 'SetTypePickerSheet|ChangeSetTypeDialog|ExercisePager' exit 0"
        status: pass
    human_judgment: true
    rationale: "This plan has no ExercisePage-level render test (07-01-SUMMARY.md's own documented gap, inherited unchanged) — the wiring is verified structurally (grep for the required call sites) and by typecheck/targeted-suite passing, not by a rendered end-to-end assertion. The plan's own deferred human-check (tick a set complete, tap its number, pick Failure, confirm weight/reps/F badge/0 RIR) covers the visual/behavioral end-to-end case at the end-of-phase sweep."

duration: 55min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 4: The Full Set-Type Behavior Table and the D-09 Destructive Confirm Summary

**Completes the seven-row Set-Type Picker's real contract (`resolveSetTypeSelection`), ships the `ChangeSetTypeDialog` destructive confirm and its `set-groups.ts` mutation seam, and wires both into `ExercisePage` so every row does what the UI-SPEC behavior table says — including writing `rir=0` in the same act as a Failure retype.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-28T12:35:00Z (approx.)
- **Completed:** 2026-08-28T13:30:00Z
- **Tasks:** 3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- Replaced 07-01's two-value `setTypePickerEffect` with `resolveSetTypeSelection`, a single pure function implementing the entire UI-SPEC behavior table (`retype | insert-child | confirm-first | no-op`) — structurally incapable of retyping a parent row to `drop` or `partial` (Pitfall 6), pinned by an exhaustive test over every `SET_TYPES` × child-state combination.
- Added `FAILURE_SET_RIR` (0) and wired `SetTypePickerSheetView`'s E1 error state (the shipped `ErrorBanner`, sheet stays open on a failed write).
- Shipped `ChangeSetTypeDialog` (D-09's destructive confirm, `ArchiveDialog`-shaped) and `set-groups.ts`'s `clearSubEntries`/`removeSubEntry` — the group-mutation seam 07-05 and 07-08 both build on.
- Rewrote `ExercisePage.handleSetTypeSelect` to dispatch over all four effects, added the confirm-then-clear-then-apply flow (`handleConfirmChangeSetType`) and a shared `setTypeError` write-failure state surfaced through both the picker and the confirm dialog.
- Flipped `docs/session-vocabularies.md`'s `SET_TYPES` table from a written/reserved split to all-seven-written, and documented `countsTowardWorkingVolume`/`countsTowardRecords` beside the vocabulary.

## Task Commits

1. **Task 1: The picker's real contract — one pure dispatch function over the whole behavior table** - `78f7307` (feat)
2. **Task 2: The destructive confirm, and the group mutation seam it drives** - `56f9f2f` (feat)
3. **Task 3: Wire the whole table into ExercisePage, and retire the reserved rows in the vocabulary doc** - `969147a` (feat)

## Files Created/Modified

- `apps/mobile/components/SetTypePickerSheet.tsx` - `resolveSetTypeSelection`, `FAILURE_SET_RIR`, `errorMessage`/`ErrorBanner` on the view
- `apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx` - the full behavior-table test suite plus the ErrorBanner cases
- `apps/mobile/components/ChangeSetTypeDialog.tsx` (new) - D-09's destructive confirm
- `apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx` (new) - copy, button-press, and error-state coverage
- `apps/mobile/lib/db/set-groups.ts` (new) - `clearSubEntries`, `removeSubEntry`
- `apps/mobile/lib/db/__tests__/set-groups.test.ts` (new) - transactional-delete and parent-refusal coverage
- `apps/mobile/components/ExercisePage.tsx` - `handleSetTypeSelect` rewritten over the four effects, `handleConfirmChangeSetType`/`handleCancelChangeSetType`, `writeSetTypeEffect`, `'change-set-type-confirm'` sheet
- `docs/session-vocabularies.md` - `SET_TYPES` all-written, `countsTowardWorkingVolume`/`countsTowardRecords` subsection

## Decisions Made

- `resolveSetTypeSelection` is three ordered checks (own-type no-op; drop/partial keyed on `childSetType`; everything else keyed on `childCount`) rather than a literal 7×2 lookup table — the UI-SPEC's cells collapse into exactly these rules once the drop/partial branch is isolated.
- `setTypePickerEffect` (07-01's shorthand) now picks a `currentSetType` guaranteed to differ from its argument and delegates to `resolveSetTypeSelection` with `childCount: 0`, rather than duplicating the childless-row table — the tracer's existing two-value tests pass unchanged.
- `clearSubEntries`/`removeSubEntry` select-then-delete rather than trusting a delete's own affected-row count, since no such convention exists yet on this codebase's Drizzle-over-PowerSync `WriteDb`; selecting first is also what makes `removeSubEntry`'s parent-row refusal possible with one query per call.
- The confirm-first flow's post-clear write reuses `setTypePickerEffect` rather than re-deriving retype-vs-insert-child inline — after `clearSubEntries`, the target is genuinely childless, which is exactly what that shorthand answers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed a type error in ChangeSetTypeDialog.test.tsx surfaced by `pnpm -w typecheck`**
- **Found during:** Task 3 (running the plan's own `pnpm -w typecheck` verification step)
- **Issue:** `el.props.children` on the generic `AnyElement` (`ReactElement<Record<string, unknown>>`) type is `unknown`, which `flatText(node: ReactNode)` cannot accept — two call sites in the Cancel/Delete-and-Change button-press tests failed `tsc --noEmit`.
- **Fix:** Cast `el.props.children as ReactNode` at both call sites, matching the pattern the rest of this file's own `findByType`/`flatText` helpers already assume.
- **Files modified:** `apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx`
- **Verification:** `pnpm -w typecheck` exits 0; the two affected tests still pass.
- **Committed in:** `969147a` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's own `<verification>` gate (`pnpm -w typecheck` exits 0). No scope creep — confined to the test file this same plan created in Task 2.

## Issues Encountered

- `pnpm --filter mobile test` (the full suite) reported one failing suite, `DayDeck.test.tsx`, with `A jest worker process ... was terminated by another process: signal=SIGSEGV` — a jest worker-process infra crash, not a test assertion failure. Re-ran `pnpm --filter mobile test -- DayDeck` in isolation and it passed cleanly (8/8). Confirmed unrelated to this plan's changes (DayDeck.tsx is untouched by this plan) and out of this plan's scope per the deviation rules' scope boundary. The full-suite run otherwise reported 1571/1571 tests passing across 89/90 suites.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `set-groups.ts` (`clearSubEntries`, `removeSubEntry`) is the group-mutation seam 07-05 (myorep grouping) and 07-08 (per-side logging) both build on directly.
- `resolveSetTypeSelection` is now the single source of truth for the picker's dispatch table — any later plan touching set-type selection should extend this function, never re-derive the table inline.
- The plan's own deferred human-check (tick a set complete, tap its set number, pick Failure, confirm the row keeps weight/reps, shows an F badge, and reads 0 RIR) remains open per `human_verify_mode: end-of-phase` — to be swept at phase end, not blocking this plan's completion.
- No blockers for 07-05/07-06/07-08, which were dispatched in parallel worktrees alongside this plan.

## Self-Check: PASSED

- FOUND: apps/mobile/components/ChangeSetTypeDialog.tsx
- FOUND: apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx
- FOUND: apps/mobile/lib/db/set-groups.ts
- FOUND: apps/mobile/lib/db/__tests__/set-groups.test.ts
- FOUND commit 78f7307
- FOUND commit 56f9f2f
- FOUND commit 969147a

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
