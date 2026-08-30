---
phase: 11-program-generation
plan: 06
subsystem: programs
tags: [program-generation, parity, gen-07, playwright, durability, powersync]

# Dependency graph
requires:
  - phase: 11-program-generation
    plan: 01
    provides: generateProgram, GeneratedProgramTree, materializeGeneratedProgram, the generate route
  - phase: 11-program-generation
    plan: 04
    provides: the completed split table the parity fixture generates against
  - phase: 11-program-generation
    plan: 05
    provides: buildGenerationInput, WIZARD_DEFAULTS, loadGenerationCatalog, loadActiveInventory
provides:
  - "packages/program-generator/src/__fixtures__/parity.ts: GENERATION_PARITY_FIXTURES, the data-only table three Jest processes run"
  - "Three runners over one table: the package suite, apps/api/src/generation/__tests__/parity.spec.ts and apps/mobile/lib/db/__tests__/generation-parity.test.ts"
  - "seedGenerationCatalog, readCycleTargetCountForRoutine, readRoutineRaw in test-support"
  - "Durability harness methods: seedAndGenerateProgram, readGeneratedProgramTree, readCycleTargetCount, readGeneratedRoutineRaw, renameProgramDay, setProgramExerciseTargets"
  - "apps/mobile/e2e/generated-program.spec.ts: six real-browser cases against a real @powersync/web database"
affects: []

# Actuals
actuals:
  tokens: 132000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GEN-07 is proved by routing two prescriptions through the real recommendNextPrescription, never by diffing two program trees — two trees can differ in shape and progress identically, and match in shape and progress differently"
    - "The generated half of every case comes from a real generateProgram run resolved per cycle; the hand-built half is independent literals, so neither side can drift into asserting x === x"
    - "One data-only fixture table, three Jest configurations — a divergence between them fails loudly in at least one rather than silently"
    - "A durability seed helper must be idempotent: a spec that generates twice seeds twice, and a repeat primary key is a UNIQUE failure, not a no-op"
    - "Raw-row reads for the status/source claim — D-05 is about the stored row, not the writer's arguments"

key-files:
  created:
    - packages/program-generator/src/__fixtures__/parity.ts
    - packages/program-generator/src/__tests__/parity.test.ts
    - apps/api/src/generation/__tests__/parity.spec.ts
    - apps/mobile/lib/db/__tests__/generation-parity.test.ts
    - apps/mobile/e2e/generated-program.spec.ts
  modified:
    - packages/program-generator/src/index.ts
    - packages/program-generator/package.json
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
---

# Plan 11-06 — The GEN-07 proof

## What Was Built

**One fixture table, three processes.** `GENERATION_PARITY_FIXTURES` carries six cases, each with a
`handBuiltPrescription` and a `generatedPrescription` plus the shared session history, equipment
type, inventory and preference the two are evaluated against. The generated half is produced by
actually running `generateProgram` against a small catalog and resolving a named slot for a named
cycle through `resolveTarget` — the same chain the preview and the builder use. The hand-built half
is written out as literals a user would type. Neither side is derived from the other, so the
equality is a real claim rather than `x === x`.

Cases cover the base cycle, a deload cycle (whose targets are overridden rather than inherited), a
slot resolved with no override at all, a no-history input, and one case per `TRAINING_GOALS` member.

The runner calls the real `recommendNextPrescription` twice per case and compares the two
`ProgressionResult`s. Three coverage gates back it: no case may resolve to
`incomplete_prescription` (two equally-unreadable prescriptions would satisfy the equality while
proving nothing), every training goal must appear, and the generated side's RIR must vary across
cases — which only holds if it was resolved per cycle rather than copied from one base row.

The same table runs from `apps/api/src/generation/__tests__/parity.spec.ts` and
`apps/mobile/lib/db/__tests__/generation-parity.test.ts`, both importing through the package barrel.
`@fitness/progression-engine` was added to the generator's **devDependencies** — the test imports
it; the generator itself must not depend on the progression engine.

**A real browser, a real database.** `seedGenerationCatalog` seeds one barbell exercise per muscle
group the full-body three-day template names, plus an equipment profile that can equip them, and
points the active-profile pointer at it. The harness's `seedAndGenerateProgram` then drives the real
`buildGenerationInput`, `generateProgram` and `materializeGeneratedProgram` against the open
database — the same three calls the shipped screen makes.

Six cases assert: the routine row reads `status: 'draft'` and `source: 'user'` **from the database**;
the shipped `loadProgramTree` returns three days each with slots; the
`routine_exercise_cycle_target` count is strictly below cycles × slots; the crud queue is non-empty;
the tree survives a close and reopen unchanged; a day renamed and a slot retargeted through the
ordinary `renameDay` / `setExerciseTargets` mutations survive another reopen; and two generations
from the same answers and seed agree on every day name, exercise id and resolved target.

## Verification

- `pnpm --filter @fitness/program-generator test` — **11/11 suites, 122/122 tests pass**
- `pnpm --filter api test -- parity` — **2/2 suites, 21/21 tests pass** (15 progression + 6 generation)
- `pnpm --filter mobile test -- generation-parity` — **6/6 tests pass**
- `pnpm --filter mobile test` — **121/121 suites, 2113/2113 tests pass**
- `pnpm -w typecheck` — **14/14 tasks pass**
- **`npx playwright test --project=durability e2e/generated-program.spec.ts` — 6 passed (27.6s)**
- **`npx playwright test --project=durability` — 90 passed (5.5m)**; no existing scenario regressed
- `grep -cE "describe\(|\bit\(|expect\(" .../__fixtures__/parity.ts` — **0**; data only
- `grep -c "generateProgram"` / `"resolveTarget"` in the fixture — **5** / **3**
- `grep -cE "@nestjs|Test\.createTestingModule|new Client\("` in the api spec — **0**
- `grep -cE "dist/__fixtures__|/dist/"` in both app runners — **0**
- `git diff --numstat apps/mobile/app/__durability.web.tsx` — **71 insertions, 0 deletions**
- `git diff --numstat apps/mobile/playwright.config.ts` — **1 insertion, 0 deletions**; one array entry, no reorder
- `grep -c "generated-program.spec.ts" playwright.config.ts` — **1**

**The parity proof was proved, not assumed.** Perturbing one hand-built literal (the strength case's
rep band, 4-6 → 9-14) turned that case **red**; restoring it returned the suite to green.

## Deviations

### The harness reports degradation kinds, not only a count

The plan's spec sketch asserted zero degradations after generation. The first real run returned
**three** — `day_trimmed` entries, because `WIZARD_DEFAULTS` uses a 60-minute session and D-14 trims
exercise count to fit. That is correct generator behaviour, not a gap in the fixture, so the
assertion was wrong rather than the code. The harness now returns `degradationKinds`, and the spec
asserts no `slot_unfillable` entry — which is the claim the seed helper actually underwrites (the
catalog is wide enough to fill every slot) while leaving the honest time trim visible.

### `seedGenerationCatalog` had to be idempotent

The generate-twice case seeds twice in one page and hit `UNIQUE constraint failed:
ps_data__seeded_exercise.id`. The helper now skips an exercise whose id is already present and
returns the existing profile rather than creating a second one.

### One deletion in `test-support.ts`

`git diff --numstat` reports 120 insertions and **1 deletion** against the plan's zero-deletions
gate. The deleted line is the `./equipment-profiles` import, widened to a multi-line form to add
`setActiveEquipmentProfile`. No existing export was reordered, renamed or restructured, which is
what the gate protects.

**Total deviations:** 3, all mechanical. No production file outside the plan's named list changed.

## Issues Encountered

`setActiveEquipmentProfile` takes positional `(userId, profileId, db)` rather than an input object,
and neither `seeded_exercise` nor `exercise_muscle_mapping` carries a `server_seq` column — both
caught by `pnpm -w typecheck` before the first browser run.

## User Setup Required

None. Chromium was already in `~/Library/Caches/ms-playwright`; no `playwright install` was needed.

## Next Phase Readiness

- GEN-07 is executed rather than claimed: a generated program is written, read, edited and
  progressed by exactly the paths a hand-built one uses, proved in a real browser.
- The parity table is the regression guard — a generator change that moves a rep band or a RIR
  schedule turns three Jest processes red at once.
- `generated-program.spec.ts` is registered last in the durability project's `testMatch`, so the
  next e2e-bearing phase appends after it.
- Executed on the main working tree rather than in a worktree — the machine was sleeping on battery
  and killing background worktree agents before their first commit. Commits are already on `main`,
  so there is nothing to merge for this plan.

---
*Phase: 11-program-generation*
*Completed: 2026-08-30*
