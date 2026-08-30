# Phase 11 — Program Generation: Verification

**Goal:** A user who doesn't want to write their own program gets a complete, pre-periodized one
that fits their goal, gym, and schedule.

**Verdict: ACHIEVED.** All five success criteria and all seven requirements are met by executed
evidence, not by structural claim.

---

## Regression gate

`pnpm -w test` — **14/14 tasks, 174 suites, 2875 tests pass**

| package | suites | tests |
|---|---|---|
| `@fitness/api-contracts` | 7 | 158 |
| `@fitness/plate-math` | 5 | 85 |
| `@fitness/pr-rules` | 3 | 52 |
| `@fitness/progression-engine` | 9 | 107 |
| `@fitness/analytics-engine` | 9 | 124 |
| `@fitness/program-generator` | 11 | 122 |
| `api` | 9 | 114 |
| `mobile` | 121 | 2113 |

`pnpm -w typecheck` — **14/14 tasks pass**

`npx playwright test --project=durability` — **90 passed (5.5m)**, including the six new
`generated-program.spec.ts` cases. No pre-existing scenario regressed.

---

## Success criteria

### 1. User can generate a complete program from goal, experience level, days per week, session length

**Met.** `/programs/generate` renders the wizard sections declared by `WIZARD_STEPS`, gated on
`validateWizardAnswers`, and the assembled input passes `isGenerationInput` before reaching
`generateProgram`. Reachable from the program library (`LIBRARY_ENTRY_POINTS`, present in both the
empty and populated states) and from the New Program screen's third `generate` option.

Evidence: `generation-wizard.test.ts` 23/23; `generate-screen.test.ts` 21/21; `library-screen.test.ts`
40/40; the durability spec's `seedAndGenerateProgram` produces a three-day program with slots on
every day in a real browser.

### 2. Generated programs only use gym-supported exercises and never an excluded one

**Met.** `buildCandidatePool` filters by equipment first, then applies exclusions **last and
unconditionally** — never merged into one pass, never skipped when the equipment filter already
thinned the pool. `runGeneration` loads the user's real `excluded_exercise` ids; zero call sites
pass an empty literal. A failed exclusion read propagates rather than degrading to an empty list.

Evidence: `candidate-pool.test.ts` includes a case where every other candidate for a muscle group is
already equipment-filtered out — the slot degrades and reports the gap rather than reaching past the
exclusion. `generate-screen.test.ts` asserts a rejected exclusion read leaves `generateProgram`
uncalled.

### 3. User can choose a split, emphasize or deprioritize muscle groups, and place deloads

**Met.** Twelve `(splitPreference, daysPerWeek)` pairs resolve to a declared week; the three that do
not are declared in `UNSUPPORTED_SPLIT_PAIRS` rather than merely missing, and the wizard reports the
pair as unsupported rather than silently substituting another split. Emphasis is a three-level
control over all nineteen `MUSCLE_GROUPS`, grouped by `MUSCLE_GROUP_BODY_REGION`; an untouched group
stays absent from the map, and absent means normal. Deload placement offers all three
`DELOAD_PLACEMENTS` with the interval editable only for `every_n_cycles`.

Evidence: `split-contract.test.ts` enumerates `SPLIT_PREFERENCES × GENERATION_INPUT_LIMITS` at
runtime (37 tests); proved to bite by temporarily adding a fifth preference, which turned 12 cases
red.

### 4. Generated programs arrive pre-periodized with per-cycle set, rep and RIR targets

**Met.** Each slot carries a base `ResolvedTarget` plus a sparse `overridesByCycleKey`; the deload
cycle's override is produced by `deloadOverrideFor`. The preview resolves every slot per cycle
through `resolveTarget`, so the four cycles show their own numbers rather than four copies of the
base.

Evidence (from the real database, not the writer's arguments): the durability spec asserts
`routine_exercise_cycle_target` row count is **strictly less than cycles × slots** — the overrides
are sparse on disk, not a per-cycle copy.

### 5. A generated program is editable exactly like a hand-built one and progresses identically

**Met, and executed rather than claimed.**

*Progresses identically:* `GENERATION_PARITY_FIXTURES` carries six cases, each routing a hand-built
prescription and a generator-derived one through the real `recommendNextPrescription` and asserting
deeply equal `ProgressionResult`s. The generated half comes from an actual `generateProgram` run
resolved per cycle; the hand-built half is independent literals. The table is executed by **three**
Jest processes (the package suite, `apps/api`, `apps/mobile`). Perturbing one hand-built literal
turned that case red, so the proof bites.

*Editable identically:* in a real browser against a real `@powersync/web` database, a generated
program's routine row reads `status: 'draft'` and `source: 'user'`; the shipped `loadProgramTree`
reads it back; `renameDay` and `setExerciseTargets` — the ordinary builder mutations — edit it; and
both edits survive a close and reopen. No generated-program-specific read, write, view or branch
exists anywhere.

---

## Requirements

| id | verdict | evidence |
|---|---|---|
| GEN-01 | met | the wizard (11-05), the write path (11-01), the durability generate-and-save case |
| GEN-02 | met | `buildCandidatePool`'s equipment predicate reusing `plate-math`'s `canEquip`; `loadActiveInventory` |
| GEN-03 | met | `excluded_exercise` on both sides (11-02/11-03), exclusions applied last, the degraded-slot case |
| GEN-04 | met | the split table (11-04), the emphasis control over all 19 groups (11-05) |
| GEN-05 | met | per-cycle overrides, sparse in the real database |
| GEN-06 | met | all three `DELOAD_PLACEMENTS` with an editable interval |
| GEN-07 | met | the three-process parity table and the real-browser edit-and-reopen proof |

---

## Deferred / not claimed

- **Multi-device convergence of exclusions** ("an exclusion on one device appears on the other")
  remains a **backstop** claim, resting on the sync path 11-02 established rather than on a
  device-pair test. Consistent with how every prior phase treats cross-device claims.
- **Native (iOS/Android) UAT** is deferred to ROADMAP Phase 999.1 per standing project decision; no
  native toolchain is installed on this machine.
- Every plan in this phase ran on the main working tree rather than in worktrees, because the
  machine was sleeping on battery and killing background worktree agents before their first commit.
  All commits are on `main`; nothing is left to merge.

---

## Recurring finding

The same failure mode appeared **five** times across this phase: an exhaustive hardcoded test
expectation turned red by a legitimate, plan-mandated addition — the route-guard child list (twice),
`PUSH_APPLIED_TABLES`, the split assertions, and the `newProgramOptions` option set. Each was a
stale assertion, not a defect. Where a structural alternative existed it was taken (the library's
two entry points became one `LIBRARY_ENTRY_POINTS` list both states map over, making a
present-in-one-state-only control unrepresentable rather than merely untested).

---
*Phase: 11-program-generation*
*Verified: 2026-08-30*
