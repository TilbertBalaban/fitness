---
phase: 11-program-generation
plan: 05
subsystem: programs
tags: [program-generation, wizard, preview, determinism, degradation-report]

# Dependency graph
requires:
  - phase: 11-program-generation
    plan: 01
    provides: generateProgram, GenerationInput, isGenerationInput, GeneratedProgramTree, materializeGeneratedProgram, the generate route
  - phase: 11-program-generation
    plan: 03
    provides: loadExcludedExerciseIds already wired into the generate screen's load path
  - phase: 11-program-generation
    plan: 04
    provides: the completed split table, SUPPORTED_DAYS_PER_WEEK, UNSUPPORTED_SPLIT_PAIRS, resolveSplitTemplate
provides:
  - "apps/mobile/lib/programs/generation-wizard.ts: WIZARD_DEFAULTS, WIZARD_STEPS, validateWizardAnswers/fieldErrorMessage/errorField, buildGenerationInput, nextVariantSeed, defaultGeneratedRoutineName, describeDegradation"
  - "apps/mobile/components/GeneratedProgramPreview.tsx: the whole tree rendered with each cycle's resolved numbers, and every degradation entry as a sentence"
  - "The full generation wizard on /programs/generate — seven inputs, five defaulted, preview then confirm, reproducible Regenerate"
  - "LIBRARY_ENTRY_POINTS and GENERATE_PROGRAM_ROUTE: one entry-point list rendered by both the library's empty and populated states"
  - "A third 'Generate for me' choice on the New Program screen"
affects: [11-06-parity-and-durability]

# Actuals
actuals:
  tokens: 118000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two independent gates on the same input: validateWizardAnswers bounds every numeric field against GENERATION_INPUT_LIMITS imported from the generator, and isGenerationInput rejects the assembled whole — neither retypes the other's limits"
    - "The wizard asks resolveSplitTemplate whether a pair is supported rather than holding a second opinion about the table"
    - "Absent means normal: an untouched muscle group stays out of the emphasis map, so a later change to the default is not frozen into every past generation"
    - "nextVariantSeed is arithmetic on its argument, so the Regenerate sequence replays and a user can return to a variant they preferred"
    - "The preview resolves every slot through resolveTarget(base, override) per cycle — showing the base for all four cycles would present four identical weeks and hide the periodization"
    - "One entry-point list drives both library states, making a control present in one and absent from the other unrepresentable rather than merely untested"
    - "Screen orchestration stays in exported pure functions, so writer-call-count claims are asserted without a renderer"

key-files:
  created:
    - apps/mobile/lib/programs/generation-wizard.ts
    - apps/mobile/lib/programs/__tests__/generation-wizard.test.ts
    - apps/mobile/components/GeneratedProgramPreview.tsx
  modified:
    - apps/mobile/app/programs/generate.tsx
    - apps/mobile/app/programs/library.tsx
    - apps/mobile/app/programs/new.tsx
    - apps/mobile/app/programs/__tests__/generate-screen.test.ts
    - apps/mobile/app/programs/__tests__/library-screen.test.ts
---

# Plan 11-05 — The generation wizard

## What Was Built

11-01 shipped a screen that generated one hardcoded program. This plan turned it into the wizard.

**The pure layer.** `lib/programs/generation-wizard.ts` holds everything assertable without a
renderer: `WIZARD_DEFAULTS` (auto split, deload every 4 cycles, 4 cycles, empty emphasis, seed 0),
`WIZARD_STEPS` as the section order in data, per-field validation returning a token plus a
`fieldErrorMessage` mapper and an `errorField` mapper, `buildGenerationInput`, `nextVariantSeed`,
`defaultGeneratedRoutineName` and `describeDegradation`.

Every numeric bound comes from `GENERATION_INPUT_LIMITS`, imported. The split check calls
`resolveSplitTemplate` rather than consulting a copied matrix, so 11-04's table stays the single
source of truth about what is supported. Neither gate retypes the other's rules — that is T-11-05's
mitigation, and two gates that disagree about a bound would be worse than one.

**The preview.** `GeneratedProgramPreview` renders one `DetailSection` per cycle and, within it,
every day and every slot, with each slot's numbers resolved for that cycle through `resolveTarget`.
A deload cycle is labelled from its `kind`. There is no badge, colour or provenance line anywhere —
D-05 makes a generated program indistinguishable from a hand-built one. Above the caller's Save
action, every `degradations` entry renders as its own `describeDegradation` sentence; an empty list
renders no block rather than an empty one.

**The screen.** `/programs/generate` holds `WizardAnswers` and a `WizardPhase`. The answering phase
renders the sections in `WIZARD_STEPS` order using the shipped `SelectField` and `TextField`: goal,
experience, days, minutes, split (`auto` first), emphasis as a three-level control over all nineteen
muscle groups grouped by `MUSCLE_GROUP_BODY_REGION`, and deload placement with the interval field
shown only for `every_n_cycles`. Generate is gated on `validateWizardAnswers`, and the assembled
input passes through `isGenerationInput` before reaching the generator.

The previewing phase renders the preview, an editable name prefilled from the derived default,
Regenerate (advancing `variantSeed` through `nextVariantSeed`), a Back control that preserves every
answer, and Save. Save is the only write on the screen, guarded by the in-flight flag.

**The ways in.** `LIBRARY_ENTRY_POINTS` is one list rendered by both the library's empty state and
its populated footer, so Generate Program is discoverable before the user owns a program.
`newProgramOptions` gained a third always-available `generate` option.

## Verification

- `pnpm --filter mobile test` — **120/120 suites, 2107/2107 tests pass**
- `pnpm -w typecheck` — **14/14 tasks pass**
- `git diff --stat packages/program-generator` — **empty**; the generator was not touched
- `grep -vE "^\s*(//|\*|/\*)" apps/mobile/app/programs/generate.tsx | grep -c "materializeGeneratedProgram("` — **1**, the Save handler
- `grep -vE ... | grep -ciE "generated program badge|auto-generated"` — **0** in both the screen and the preview
- `grep -c "GENERATION_INPUT_LIMITS" .../generation-wizard.ts` — **11**; every bound imported
- `grep -vE ... | grep -cE "Math\.random|Date\.now|new Date"` — **0** in the wizard module
- `grep -vE ... | grep -cE "getPowerSync|\.select\(|\.insert\("` — **0** in the wizard module; **0** for I/O and navigation in the preview
- `git status --porcelain apps/mobile/components/` — one new file, no existing component modified

The load-bearing behavioural assertions: five combined Generate and Regenerate passes leave the
writer spy at **zero** calls and Save takes it to exactly **one**; a second Save while the first is
in flight produces no second call; an out-of-range day count blocks Generate with that field's
message and leaves the generator spy uncalled; regenerating twice and returning to the original
seed reproduces the first tree's `JSON.stringify` exactly; and the emphasis control's grouped output
covers all nineteen `MUSCLE_GROUPS` with none dropped or duplicated.

## Deviations

### Two `newProgramOptions` cases falsified by this plan's own third option

`'leaves Start Blank as the only live path on a truly empty account'` and `'makes both options
available once one program exists'` both enumerate the option set exhaustively. Adding the
plan-mandated `generate` option turned both red. Renamed and extended to three options; the cases
still assert `blank` and `duplicate` keep their labels and their availability logic. Both live in
`library-screen.test.ts`, which this plan names, so this is not a file-ownership deviation.

### The library entry-point assertion was rewritten mid-task

The first version read `library.tsx` from disk with `node:fs` to count `GENERATE_PROGRAM_ROUTE`
occurrences. `pnpm -w typecheck` rejected it — the mobile tsconfig carries no Node types. Rather
than adding them for one assertion, the two hardcoded `Pressable`s were replaced by
`LIBRARY_ENTRY_POINTS`, which both states map over. The claim is now structural instead of textual:
a control present in one state and absent from the other is unrepresentable.

**Total deviations:** 2. No file outside the plan's named list was modified.

## Issues Encountered

None beyond the two above. The exhaustive-hardcoded-expectation failure mode has now appeared five
times in this phase.

## User Setup Required

None.

## Next Phase Readiness

- `runGeneration(userId, db, deps, answers)` is the single entry point for 11-06's parity run; the
  `answers` parameter is optional, so 11-01's tracer path and its existing tests still work.
- `TRACER_DEFAULTS` is unchanged and still exported — the objective scenario 11-06 replays.
- `describeDegradation` is the one place degradation copy lives, so a kind added later without copy
  turns the wizard suite red before it can reach a user.
- The durability harness (`__durability.web.tsx`, `e2e/**`) was not touched; 11-06 owns it.
- Executed on the main working tree rather than in a worktree — the machine was sleeping on battery
  and killing background worktree agents before their first commit. Commits are already on `main`,
  so there is nothing to merge for this plan.

---
*Phase: 11-program-generation*
*Completed: 2026-08-30*
