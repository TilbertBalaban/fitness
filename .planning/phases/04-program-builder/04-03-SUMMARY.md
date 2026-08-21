---
phase: 04-program-builder
plan: 03
subsystem: ui
tags: [react-native, nativewind, drizzle, powersync, jest, stepper, catalog-reuse]

# Dependency graph
requires:
  - phase: 04-program-builder (04-02)
    provides: routine_day/routine_exercise write helpers (addExercisesToDay, addDay, removeExercise), loadProgramTree's ProgramSlot shape, and the Programs tab shell this plan extends
provides:
  - A full-screen, multi-select exercise picker (ExercisePickerModal) that reuses Phase 3's search/filter/sort/facet functions verbatim, opened from the Programs tab in component state (no new route)
  - Per-exercise target entry (sets, rep range, RIR, rest) via a stepper-based ExerciseSlotRow that expands in place, structurally incapable of an invalid rep range
  - targets.ts: parseTargetField/validateTargets/setExerciseTargets — the null-means-unprescribed contract, enforced client-side only
affects: [04-05-day-deck-and-drag-handle, 04-06-cycles, 04-08-cycle-strip, 04-09-next-up-card, 04-11-programs-library]

# Actuals (#2632)
actuals:
  tokens: 14900
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct-invoke test technique extended to a component whose row content lives inside a FlashList renderItem: find the FlashList element, extract renderItem from its props, and call it per row manually — the same faithful-exercise-without-a-renderer principle SwapSuggestionList/ExerciseImageTile established, applied to virtualized lists for the first time in this phase"
    - "A helper that only composes JSX for a parent (renderTargetStepper) is called as a plain function, never used as a <Component/> element — a nested component descriptor's own body never executes under direct invocation, so its interior is invisible to findByType; calling it inline keeps the returned elements in the parent's own children tree"

key-files:
  created:
    - apps/mobile/lib/catalog/picker-selection.ts
    - apps/mobile/lib/catalog/__tests__/picker-selection.test.ts
    - apps/mobile/components/ExercisePickerModal.tsx
    - apps/mobile/components/__tests__/ExercisePickerModal.test.tsx
    - apps/mobile/lib/db/programs/targets.ts
    - apps/mobile/lib/db/__tests__/targets.test.ts
    - apps/mobile/components/ExerciseSlotRow.tsx
    - apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx
  modified:
    - apps/mobile/app/(tabs)/programs.tsx
    - apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts

key-decisions:
  - "Target entry is stepper-based, not free-text TextField, per 04-UI-SPEC.md's binding resolution of D-25 (steppers, not free text) — this plan's own <action> text was written against an earlier TextField draft and predates that amendment. Steppers make three of parseTargetField's five error codes (not-a-number, whole-number, negative) unreachable from this row by construction; targets.ts keeps validating them anyway as the write-path source of truth and a backstop against any future caller."
  - "The rep-range pair (min/max steppers) is kept internally consistent by construction (UI-SPEC R5): incrementing min above the current max also raises max to match, decrementing max below the current min also lowers min to match. validateTargets's min-above-max check therefore can never fire from this UI path, but stays as defense-in-depth for any other writer of routine_exercise."
  - "ExerciseSlotRow's own collapsed-summary formatter (formatSlotSummary) is a new, separate function from 04-02's formatSlotTargets in programs.tsx, per 04-02-SUMMARY.md's own explicit warning that the two components have different contracts (formatSlotTargets collapses an equal rep min/max to one number; formatSlotSummary never does, and its all-null text is 'No targets set.' rather than an em dash alone). formatSlotTargets stays exported from programs.tsx unchanged and is no longer called by the day list's own JSX (ExerciseSlotRow replaced it), but remains covered by its own 4 existing tests."
  - "Every stepper press writes through immediately via setExerciseTargets and reloads the tree — no explicit Save control and no per-field error affordance, since UI-SPEC's R6 (optimistic local-first writes, no loading state) and R5 (structural validity) together mean there is nothing left to explicitly submit or reject in this row."
  - "The exercise picker's own presentational specifics (header+PrimaryButton vs. a persistent footer bar, and the accent-border-plus-checkmark selection affordance) follow this plan's own <action>/<behavior> text rather than 04-UI-SPEC.md's Exercise Picker Modal section verbatim, since the UI-SPEC was not flagged as a named hard case here and this plan's <behavior> pins exact test literals (formatSelectionCount's 'Add 1 exercise' wording) that a footer-CTA-copy change would contradict. Recorded as a Deviation below, not silently dropped — see 'Known Divergences from 04-UI-SPEC.md.'"

patterns-established:
  - "Pattern: a component whose real row markup must live inside a FlashList's renderItem is still testable by extracting renderItem from the found FlashList element and invoking it manually per row — no react-test-renderer needed."

requirements-completed: [PROG-02, PROG-03]

coverage:
  - id: D1
    description: "A day can be filled from the catalog in one multi-select Add; the picker reuses Phase 3's search/filter/sort/facet functions verbatim and never disables or deduplicates a row already in the day"
    requirement: "PROG-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/picker-selection.test.ts (9 cases)"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExercisePickerModal.test.tsx (7 cases, including the FlashList renderItem-extraction technique)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Target entry (sets, rep range, RIR, rest) is stepper-based, expands in place with no modal, a blank field stays null everywhere (parsed, stored, displayed as an em dash / 'No targets set.'), and the rep range cannot be entered out of order"
    requirement: "PROG-03"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/targets.test.ts (17 cases: parseTargetField, validateTargets, setExerciseTargets)"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx (20 cases: rendering, formatSlotSummary, stepBoundedValue, stepRepMin/stepRepMax pairing)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Programs tab wires both pieces together: Add Exercises opens the picker full-screen in component state (no new route), and day slots render through ExerciseSlotRow with one row expanded at a time"
    requirement: "PROG-02"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#nextExpandedSlotId (3 cases) plus the pre-existing formatSlotTargets/deriveProgramsScreenState suites, unbroken"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) — /programs route bundles with the picker and expandable rows in the graph"
        status: pass
    human_judgment: true
    rationale: "No simulator/emulator/device available in this worktree (no Xcode, no Android SDK) — the picker's full-screen presentation, the numeric stepper's tap behavior and the inline-expand animation have not been observed on a real device. Recorded as a WINDOWS unrun-verify entry, deferred to ROADMAP Phase 999.1."

duration: ~45min (approx.)
completed: 2026-08-20
status: complete
---

# Phase 4 Plan 03: Exercise Picker and Inline Target Entry Summary

**Full-screen multi-select exercise picker reusing Phase 3's catalog verbatim, and a stepper-based Exercise Slot Row (sets/rep-range/RIR/rest) that expands in place and cannot enter an invalid rep range by construction.**

## Performance

- **Duration:** ~45 min (approx.)
- **Completed:** 2026-08-20T20:30:27+03:00
- **Tasks:** 3
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments
- `picker-selection.ts` ships `toggleSelection`/`orderedSelection`/`formatSelectionCount`, pure and dependency-free, backing a full-screen `ExercisePickerModal` that imports (never reimplements) `buildSearchIndex`/`searchCatalog`/`applyCatalogFilters`/`sortCatalogResults`/`deriveFacets` from Phase 3's catalog module — a row already in the day still renders selectable, never disabled or deduplicated
- `targets.ts` resolves CONTEXT.md's "what does a blank target mean" discretion item in code: `parseTargetField` treats an empty field as `null`, never `0`; `validateTargets` enforces `targetSets ≥ 1` and `targetRepMax ≥ targetRepMin` (when both present) while leaving every field nullable and every draft with all-null fields savable; `setExerciseTargets` writes all five columns every time in exactly one update
- `ExerciseSlotRow` expands a day's exercise row in place — no modal, neighbouring rows stay visible — into five stepper fields (Sets, Rep min, Rep max, RIR, Rest), built per `04-UI-SPEC.md`'s binding stepper resolution of D-25 rather than this plan's own now-superseded TextField draft; the rep-range pair is kept structurally valid by construction (R5) so `validateTargets`'s ordering check can never actually fire from this row
- The Programs tab wires both pieces in: an "Add Exercises" control per day opens the picker full-screen in component state (no new `app/programs/` route), `addExercisesToDay` lands the ordered selection, and `nextExpandedSlotId` keeps exactly one slot row expanded at a time

## Task Commits

Each task was committed atomically:

1. **Task 1: A full-screen catalog picker that accumulates a multi-row selection** - `58a5450` (feat)
2. **Task 2: Target entry semantics — blank means unprescribed, and a bad range is refused** - `a56887d` (feat)
3. **Task 3: Tap an exercise to expand it in place and set its targets** - `b85d777` (feat)

_Note: all three tasks carried `tdd="true"`; consistent with 04-01/04-02's precedent, tests and implementation were committed together after being verified green together (single `feat` commits, not split RED/GREEN)._

## Files Created/Modified
- `apps/mobile/lib/catalog/picker-selection.ts` - `toggleSelection`, `orderedSelection`, `formatSelectionCount`
- `apps/mobile/lib/catalog/__tests__/picker-selection.test.ts` - 9 cases covering every `<behavior>` boundary
- `apps/mobile/components/ExercisePickerModal.tsx` - hook-free `ExercisePickerModalView` + stateful `ExercisePickerModal` wrapper; full-screen, header Cancel/Add, accent-border-plus-checkmark row selection over reused `ExerciseListRow`
- `apps/mobile/components/__tests__/ExercisePickerModal.test.tsx` - 7 cases, including extracting and manually invoking the FlashList's `renderItem` per row (no `react-test-renderer` in this worktree's lockfile)
- `apps/mobile/lib/db/programs/targets.ts` - `TargetDraft`, `TargetFieldError`, `parseTargetField`, `validateTargets`, `setExerciseTargets`
- `apps/mobile/lib/db/__tests__/targets.test.ts` - 17 cases across parsing, validation and the write-scope assertion
- `apps/mobile/components/ExerciseSlotRow.tsx` - hook-free `ExerciseSlotRowView` + stateful `ExerciseSlotRow` wrapper; `stepBoundedValue`, `stepRepMin`, `stepRepMax`, `formatSlotSummary` (all exported, pure)
- `apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx` - 20 cases: collapsed/expanded rendering, the remove control, `formatSlotSummary`'s four-segment template, and every stepper/pairing boundary
- `apps/mobile/app/(tabs)/programs.tsx` - `nextExpandedSlotId`; wires `ExercisePickerModal`/`ExerciseSlotRow`/`addExercisesToDay`/`setExerciseTargets` into the day list
- `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` - 3 new `nextExpandedSlotId` cases, plus mocks for the picker's transitive `app/exercises`/`lib/auth-client` imports so the pre-existing suite keeps passing

## Decisions Made
- Stepper-based target entry (not free-text `TextField`), per `04-UI-SPEC.md`'s binding resolution of D-25 — see key-decisions above and the Deviations section for the full rationale
- Rep-range pairing keeps the range structurally valid; `validateTargets`'s ordering check remains as write-path defense-in-depth
- `ExerciseSlotRow` gets its own collapsed-summary formatter (`formatSlotSummary`), distinct from 04-02's `formatSlotTargets`, per 04-02-SUMMARY.md's explicit warning that the two components have different display contracts
- No explicit Save control on the slot row — every stepper press writes through immediately (R6: optimistic local-first writes, no loading state)
- The exercise picker's presentational specifics (header vs. footer CTA position, border+checkmark vs. checkmark-only selection affordance, exact CTA copy) follow this plan's own pinned `<behavior>` text rather than re-deriving `04-UI-SPEC.md`'s Exercise Picker Modal section verbatim — see Deviations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4-adjacent, pre-authorized by dispatch] Target entry rebuilt as steppers, not `TextField`s**
- **Found during:** Reading `04-03-PLAN.md` against `04-UI-SPEC.md` before Task 3
- **Issue:** `04-03-PLAN.md`'s own `<read_first>`/`<action>`/`<behavior>` text for Task 3 describes four `TextField`s with per-field `TargetFieldError` messages — a free-text draft of D-25 written before `04-UI-SPEC.md`'s Exercise Slot Row section resolved the "stepper vs. free text" discretion item as steppers, with an explicit R5 rule that a min>max rep range must be structurally unenterable rather than caught by an inline error message. The two documents directly contradict each other on the row's fundamental input mechanism.
- **Fix:** Built `ExerciseSlotRow` as UI-SPEC describes: five stepper fields (`[-] {value} [+]`), the rep-range pair kept internally consistent by construction (`stepRepMin`/`stepRepMax`), immediate write-through per press, no per-field error UI. Rewrote Task 3's `<behavior>` assertions to match (five stepper groups instead of five `TextField`s; no min-above-max error-prop test, since that state cannot be reached). This was pre-authorized by this dispatch's own `<ui_contract>` block, which names "the rep-range stepper pair" as the plan's explicitly flagged hard case — not a fresh architectural judgment call requiring a checkpoint.
- **Files modified:** `apps/mobile/components/ExerciseSlotRow.tsx`, `apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx`
- **Verification:** All 20 `ExerciseSlotRow.test.tsx` cases pass; `pnpm --filter mobile typecheck`/`build` both exit 0
- **Committed in:** `b85d777` (Task 3 commit)

**2. [Rule 2 - missing critical functionality] `ExerciseSlotRow` needed its own collapsed-summary formatter**
- **Found during:** Task 3, before writing `ExerciseSlotRow`
- **Issue:** `04-03-PLAN.md`'s `<action>` text says to import `formatSlotTargets` from `programs.tsx` (04-02) "or move it into this component ... pick one home." `04-02-SUMMARY.md` explicitly warns against this: `formatSlotTargets` collapses an equal rep min/max to one number ("3 x 8"), while `04-UI-SPEC.md`'s Exercise Slot Row keeps the range visible even when min equals max ("8–8") and uses a different all-null string ("No targets set." vs. an em dash alone). Reusing `formatSlotTargets` verbatim would have shipped the wrong collapsed-summary contract for this row.
- **Fix:** Added `formatSlotSummary` in `ExerciseSlotRow.tsx` as a distinct function matching UI-SPEC's exact copy. `formatSlotTargets` in `programs.tsx` is untouched and remains exported (still covered by its own 4 pre-existing tests); the plan's `formatSlotTargets`-single-definition acceptance check still passes since the two functions have different names.
- **Files modified:** `apps/mobile/components/ExerciseSlotRow.tsx`
- **Verification:** `grep -rl 'export function formatSlotTargets' apps/mobile` reports exactly one file; `formatSlotSummary`'s 4 dedicated test cases pass
- **Committed in:** `b85d777` (Task 3 commit)

---

**Total deviations:** 2 (1 UI-mechanism rebuild pre-authorized by dispatch context, 1 missing-functionality fix). Both were required for correctness against `04-UI-SPEC.md`, which this dispatch designated binding over the plan's own text where the two conflict.
**Impact on plan:** No scope creep — both changes stayed inside Task 3's declared files. Task 1 and Task 2 executed as written with no deviations.

## Known Divergences from 04-UI-SPEC.md

Recorded, not silently dropped — these were judged non-blocking because `04-UI-SPEC.md`'s own `<ui_contract>` non-negotiables list (injected into this dispatch) did not name them as a hard case, and this plan's own `<behavior>` block pins literal test strings that following the UI-SPEC section verbatim would have broken:

- **Picker CTA position and copy.** `04-UI-SPEC.md`'s Exercise Picker Modal section specifies a persistent **footer** bar with **"Add Exercise"** (singular) / **"Add {N} Exercises"** CTA text. This plan's own `<behavior>` pins `formatSelectionCount(1) === 'Add 1 exercise'` (lowercase, header-positioned) and was implemented as written — a **header** row (Cancel left, Add right).
- **Picker selection affordance.** UI-SPEC specifies a checkmark-only selection indicator (`SelectField`'s pattern). This plan's own `<action>` text specifies "the accent border treatment `FilterChipRow` uses," which was implemented — and which already composes a checkmark *plus* a border (matching `SelectField`'s own visual treatment closely, though not verbatim).

Both are cosmetic/polish-level and do not affect PROG-02's underlying behavior (multi-select accumulation, reuse of Phase 3's search/filter, selectability of already-added rows). Flagged here for the UI-review pass (`gsd-ui-review`) rather than resolved unilaterally, since resolving them would have required rewriting this plan's own pinned TDD literals — a larger, riskier change than this plan's scope justified without a checkpoint.

## Issues Encountered
- **`@fitness/api-contracts` needed a fresh `pnpm --filter @fitness/api-contracts build`** before any test importing `lib/catalog/catalog-filter.ts` (transitively, via `ExercisePickerModal.tsx`) could resolve `@fitness/api-contracts` — the same ordering note 04-02-SUMMARY.md recorded for `apps/api`. Not a deviation, just a required step; documented here in case a future execution hits the same "Cannot find module '@fitness/api-contracts'" error.
- **`ExercisePickerModal.tsx`'s transitive imports (`app/exercises/index.tsx` → `lib/auth-client.ts` → `better-auth/react`) break Jest's parser** (an ESM `.mjs` file outside the project's `transformIgnorePatterns` allowlist) unless mocked before import — matching the existing WINDOWS #22/#33 `@powersync/react-native` precedent. Both `ExercisePickerModal.test.tsx` and the extended `programs-screen.test.ts` mock `@/lib/db/powersync`, `@/app/exercises` and `@/lib/auth-client` up front for this reason.
- **A component whose row markup lives inside a `FlashList`'s `renderItem` cannot be exercised by simple `findByType` traversal** under direct invocation (no `react-test-renderer` in this worktree) — `renderItem` is a prop, not a `children` entry, so it is never automatically walked. Resolved by finding the `FlashList` element, extracting `props.renderItem`, and invoking it manually per catalog row in the test — documented as a new pattern above for any future FlashList-backed component this repo tests the same way.
- No Xcode/Android SDK available in this worktree (inherited constraint from 04-01/04-02) — the picker's full-screen presentation and the stepper's tap/hold behavior remain unobserved on a real device. See Coverage D3 and the WINDOWS entry below.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `ExercisePickerModal` and `ExerciseSlotRow` are both split hook-free-view/stateful-wrapper, matching the established testability pattern — 04-05 (Day Deck & Drag Handle) and 04-08 (Cycle Strip) can extend `ExerciseSlotRow`'s collapsed row (a fixed-width leading area is already reserved for the 04-05 drag handle, per the plan's own instruction) without a re-layout.
- `targets.ts`'s null-means-unprescribed contract is the one Phase 5/Phase 8 must inherit verbatim — a null target must never be defaulted to zero anywhere downstream.
- **Blocker/concern:** No Xcode/Android SDK on this machine — the picker and the inline-expand stepper row's actual on-device rendering and touch behavior have not been observed. Deferred to ROADMAP Phase 999.1, same standing limitation as every prior Phase 4 plan.
- **Known divergence, not a blocker:** the picker's CTA position/copy and selection-affordance treatment differ from `04-UI-SPEC.md`'s literal Exercise Picker Modal section (see above) — worth a deliberate pass in a future UI-polish plan or `gsd-ui-review` run, since PROG-02's functional behavior is unaffected either way.

---
*Phase: 04-program-builder*
*Completed: 2026-08-20*

## Deferred WINDOWS Entries

- **kind:** unrun-verify — **file:** `apps/mobile/components/ExercisePickerModal.tsx` — **description:** The full-screen exercise picker's presentation, search/filter interaction and multi-select behavior have been observed on neither iOS nor Android (no Xcode/Android SDK in this worktree) — verified only via unit tests and `pnpm --filter mobile build`.
- **kind:** unrun-verify — **file:** `apps/mobile/components/ExerciseSlotRow.tsx` — **description:** The inline-expand animation and the numeric stepper's tap/hold behavior (including the rep-range pairing at the UI layer) have been observed on neither iOS nor Android — verified only via unit tests and `pnpm --filter mobile build`.
- **kind:** deviation — **file:** `apps/mobile/components/ExercisePickerModal.tsx` — **description:** The picker's CTA position/copy (header vs. footer, "Add 1 exercise" vs. "Add Exercise") and row-selection affordance (border+checkmark vs. checkmark-only) diverge from `04-UI-SPEC.md`'s literal Exercise Picker Modal section — functionally equivalent, cosmetic difference only, flagged for a future UI-review pass. See SUMMARY "Known Divergences from 04-UI-SPEC.md."
