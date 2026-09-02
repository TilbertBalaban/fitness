---
phase: 13-program-generator-volume-selection-rework
plan: 04
subsystem: testing
tags: [typescript, jest, program-generation, regression-test, fixture-derivation, validation]

# Dependency graph
requires:
  - phase: 13-program-generator-volume-selection-rework
    provides: "13-01's volume split + hardest-cycle fit + daysPerWeek RIR ladder, 13-02's degradation copy, 13-03's tiered slot scoring and week-level variety — the behaviour this plan pins"
  - phase: 11-program-generation
    provides: "generateProgram public entry point, split templates, session-length time model, __fixtures__/parity.ts precedent for a committed .ts fixture"
provides:
  - "scripts/derive-generator-regression-fixture.cjs — deterministic derivation of a GenerationCatalog fixture from apps/api/src/seed/data/catalog-normalized.json"
  - "packages/program-generator/src/__fixtures__/catalog-2day-regression.ts — 60 real-catalog exercises / 208 mappings covering every full_body_2 muscle group six deep (CATALOG_2DAY_REGRESSION)"
  - "packages/program-generator/src/__tests__/regression-2day-60min.test.ts — D-11's five clauses plus coverage and determinism guards, proven to fail against the pre-phase generator"
  - "13-VALIDATION.md signed off: every per-task row green against a real run, nyquist_compliant and wave_0_complete true"
affects: [verify-work for phase 13, any future catalog resync (regenerate the fixture), any split-template change to full_body_2]

# Actuals (#2632) — chars/4 over the realized diff of the four files this plan touched (git diff 667e94a..137eec1)
actuals:
  tokens: 19059
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generated-fixture convention: a committed scripts/*.cjs derives a src/__fixtures__/*.ts module through JSON.stringify, with a header naming the script, its invocation and the source path, so regeneration is byte-identical and a hand edit is detectable by re-running"
    - "Regression suites derive their muscle-group list from resolveSplitTemplate rather than hardcoding it, and assert fixture coverage of that list, so a template change fails the suite instead of silently weakening it"
    - "Slot-to-muscle-group attribution in tests resolves through the fixture's primary mappings and throws on anything but exactly one match, so a mis-attributed slot is a loud failure"

key-files:
  created:
    - scripts/derive-generator-regression-fixture.cjs
    - packages/program-generator/src/__fixtures__/catalog-2day-regression.ts
    - packages/program-generator/src/__tests__/regression-2day-60min.test.ts
  modified:
    - .planning/phases/13-program-generator-volume-selection-rework/13-VALIDATION.md

key-decisions:
  - "RED evidence for a regression suite pinning already-shipped behaviour was produced by running the new suite in a throwaway detached worktree at the pre-phase commit (667e94a) with a one-line MAX_SETS_PER_EXERCISE shim — it failed 4 of the 5 D-11 clauses there and passes 8/8 on the current tree"
  - "The fixture keeps every mapping of every selected exercise (not only the primary ones) because the D-08 primary gate and the primary-score tier read them; after the 808260d amendment the D-07 movement-class tier reads movementPattern instead, which the fixture also carries"
  - "13-VALIDATION.md's status stays draft: its own lifecycle comment reserves the flip to validated for /gsd-validate-phase; only nyquist_compliant and wave_0_complete were set, as the plan instructs"

patterns-established:
  - "Pre-phase worktree as RED oracle: when a TDD task's test cannot go red on the current tree by design, prove its teeth against the last commit before the phase instead of committing an unfalsifiable test"

requirements-completed: [GEN-VOL-01, GEN-VOL-02, GEN-SEL-01, GEN-SEL-02, GEN-RIR-01]

coverage:
  - id: D1
    description: "A committed script regenerates the D-11 fixture byte-identically from the real catalog snapshot, and the emitted module typechecks as a GenerationCatalog with at least four primary-mapped exercises for every full_body_2 muscle group"
    requirement: GEN-SEL-02
    verification:
      - kind: other
        ref: "node scripts/derive-generator-regression-fixture.cjs (twice) && diff -q && pnpm --filter @fitness/program-generator typecheck"
        status: pass
      - kind: other
        ref: "coverage scan from 13-04-PLAN.md Task 1 acceptance criteria — every target group has 6 primary-mapped exercises"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reported scenario (2 days, 60 min, intermediate, hypertrophy, auto, 4 cycles, no inventory) yields at least 4 exercises per day, no shared exercise per muscle group across days, no exercise above MAX_SETS_PER_EXERCISE in any cycle, a hardest-cycle estimate inside 60 minutes, and a cycle-4 RIR of 0 — against real-catalog data"
    requirement: GEN-VOL-01
    verification:
      - kind: unit
        ref: "packages/program-generator/src/__tests__/regression-2day-60min.test.ts#D-11 regression (8 cases)"
        status: pass
      - kind: other
        ref: "same suite against pre-phase commit 667e94a in a throwaway worktree: 4 failed / 4 passed (2 exercises per day, shared exercises, 7 sets, RIR 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The whole workspace typechecks and tests green with the rebuilt package, and 13-VALIDATION.md records real infrastructure, sampling rate and a per-task map with every row run"
    requirement: GEN-VOL-02
    verification:
      - kind: integration
        ref: "pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test (14/14 turbo tasks; program-generator 160/160 on a cache miss, mobile 2331/2331)"
        status: pass
      - kind: other
        ref: "placeholder scan from 13-04-PLAN.md Task 3 verify — exit 0; map has 10 data rows"
        status: pass
    human_judgment: false

# Metrics
duration: ~10min
completed: 2026-09-02
status: complete
---

# Phase 13 Plan 04: D-11 Real-Catalog Regression Summary

**A committed script derives a 60-exercise real-catalog fixture, an 8-case suite pins the reported 2-day/60-min scenario against it (and fails 4/5 clauses on the pre-phase generator), and 13-VALIDATION.md is signed off with every row run green**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-02T15:28:09Z
- **Completed:** 2026-09-02T15:38:17Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `scripts/derive-generator-regression-fixture.cjs` reads `apps/api/src/seed/data/catalog-normalized.json`, throws a named `CatalogSnapshotError` if the file is missing or either array is empty, picks the first six string-sorted primary-mapped exercises per `full_body_2` muscle group (skipping ids already taken by an earlier group), keeps every mapping those exercises carry within the 19 `MuscleGroupId` values, and emits the module through `JSON.stringify` — two consecutive runs diff clean.
- `CATALOG_2DAY_REGRESSION` carries 60 exercises and 208 mappings, six primary-mapped exercises for each of the ten template groups, typechecks as a `GenerationCatalog`, and is not re-exported from `index.ts`.
- `regression-2day-60min.test.ts` generates the tree once and asserts, one case per clause: 2 days / 4 training cycles, at least 4 slots per day, no exercise shared per muscle group across the two days, every resolved `targetSets` at most `MAX_SETS_PER_EXERCISE`, the last training cycle's estimate (recomputed via `estimateSlotMinutes` + `SESSION_OVERHEAD_MINUTES`) inside 60 minutes, RIR exactly 0 in the fourth training cycle, fixture coverage of every group `resolveSplitTemplate('auto', 2)` names, and byte-identical serialization across two runs.
- On the current tree the real-catalog scenario produces six exercises per day at three sets (Guillotine bench / pullover / full squat / anti-gravity press / incline curls / ab crunch machine on A; medium-grip bench / chin-up / band good morning / hip thrust / one-arm upright row / board press on B), RIR 2/1/0/0, hardest-cycle estimate 59.5 min on both days.
- The full workspace gate is green: typecheck 14/14 tasks (12 s), test 14/14 tasks (52 s), package suite 14 suites / 160 tests in ~4 s.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the deterministic fixture derivation script** - `ec78e82` (test)
2. **Task 2: Assert D-11's five properties against the real-catalog fixture** - `5d02130` (test)
3. **Task 3: Close the phase with a full workspace gate and a validation record** - `137eec1` (docs)

**Plan metadata:** see the final docs commit recorded by the orchestrator.

## Files Created/Modified

- `scripts/derive-generator-regression-fixture.cjs` - deterministic fixture derivation; `TARGET_MUSCLE_GROUPS` (ten `full_body_2` ids), `EXERCISES_PER_GROUP = 6`, the 19 `MuscleGroupId` values from `volume-landmarks.ts`, `JSON.stringify` emission with a provenance header
- `packages/program-generator/src/__fixtures__/catalog-2day-regression.ts` - generated `CATALOG_2DAY_REGRESSION: GenerationCatalog` (60 exercises, 208 mappings)
- `packages/program-generator/src/__tests__/regression-2day-60min.test.ts` - the D-11 suite (8 cases)
- `.planning/phases/13-program-generator-volume-selection-rework/13-VALIDATION.md` - filled-in infrastructure, sampling rate, 10-row per-task map with run evidence, Wave 0 checklist, sign-off

## Decisions Made

- **RED gate for a regression test of shipped behaviour.** Task 2 is `tdd="true"`, but a suite that pins fixes already landed in waves 1 and 2 cannot fail on the current tree. Rather than commit an unfalsifiable test, the suite was run in a throwaway detached worktree at `667e94a` (the commit before 13-01) with a one-line `volume-split.ts` shim exporting `MAX_SETS_PER_EXERCISE = 5`: it failed "at least 4 exercises" (received 2), "no shared exercise" (3 shared), "at most 5 sets" (received 7) and "cycle-4 RIR 0" (received 1). The worktree was removed afterwards. The test was committed in a single `test(13-04)` commit; there is no separate `feat` commit because no production code changed.
- **Mapping retention.** The plan's rationale ("gives D-07's compoundness tier something to read") predates `808260d`; the tier now reads `movementPattern`. Secondary mappings were still kept because the D-08 primary gate and the primary-score tier read `mappings`, and the fixture carries `movementPattern` for the amended tier.
- **`status: draft` left in place in VALIDATION.md.** Its lifecycle comment reserves `validated` for `/gsd-validate-phase`; the plan asks only for the two boolean flags, which are set.

## Deviations from Plan

None in the Rule 1–3 sense — no production code was touched and no fix was needed. Two notes for the record:

- The fixture-strategy wording in the plan ("compoundness tier") was read as the movement-class tier per the orchestrator's note; no change to the script's behaviour followed from it.
- Against the pre-phase generator, the "hardest cycle inside 60 minutes" clause passes (two exercises at seven sets is 48.5 min), so this fixture reproduces four of the five reported symptoms, not five. The estimate clause still has teeth on the current design: it is what fails if the session fit regresses to evaluating cycle 1 only with more than two exercises in play.

## Issues Encountered

- One run of the full package suite during Task 3 lost `generate.test.ts` to a jest-worker `SIGSEGV` ("terminated by another process", 144 tests counted, no assertion failed). The same command passed 160/160 immediately before, three times immediately after, and inside the turbo gate on a cache miss. Recorded in 13-VALIDATION.md's Run Record as a one-off environment event (node v24.14.1 / jest 30.4.2); the 13-03-02 row is marked green on that basis. If it recurs it belongs in WINDOWS.md as an environment issue.
- The Task 3 verify chain's final invocation was served entirely from turbo cache (3 s, 14/14 cached) because `*.md` is excluded from task inputs; the preceding cache-miss execution (typecheck 12 s, test 52 s) is the load-bearing evidence and is what the VALIDATION rows cite.

## TDD Gate Compliance

Task 2 carries `tdd="true"`. Git log has the `test(13-04)` commit (`5d02130`) but no `feat(13-04)` commit — by design, since the plan's own D-10 truth forbids any new production symbol and the behaviour under test shipped in 13-01..13-03. RED was demonstrated against the pre-phase commit rather than the current tree (see Decisions Made).

## Known Stubs

None — the fixture is real catalog data, the suite reads the public generator, and no placeholder values flow anywhere.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 13 is complete across all four plans; `/gsd-verify-work` can run against a fully green workspace and a signed-off VALIDATION.md.
- A future catalog resync must re-run `node scripts/derive-generator-regression-fixture.cjs` and commit the result; the suite's fixture-coverage case is what turns a forgotten regeneration into a failure if the template grows.
- The root-level untracked `app.json` and staged `eas.json` were left untouched throughout, as instructed.

---
*Phase: 13-program-generator-volume-selection-rework*
*Completed: 2026-09-02*

## Self-Check: PASSED

All three created files, the modified VALIDATION.md and commits ec78e82, 5d02130, 137eec1 verified present.
