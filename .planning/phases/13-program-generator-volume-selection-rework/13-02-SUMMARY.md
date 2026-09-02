---
phase: 13-program-generator-volume-selection-rework
plan: 02
subsystem: program-generator
tags: [typescript, program-generation, degradation-copy, provenance-docs]

# Dependency graph
requires:
  - phase: 13-program-generator-volume-selection-rework
    provides: "13-01's volume-split.ts, session-fit.ts, RIR_LADDER_BY_DAYS_PER_WEEK — the shipped constants and fit semantics this plan's copy and docs describe"
provides:
  - "day_trimmed degradation sentence that is true whether the fit reduced sets, removed exercises, or both"
  - "docs/volume-rir-landmarks.md sections for RIR_LADDER_BY_DAYS_PER_WEEK, MAX_SETS_PER_EXERCISE/MIN_SETS_PER_EXERCISE, and a corrected If-wrong paragraph naming fitDayToSessionLength and superseding Phase 11's D-14"
affects: [13-03, future-provenance-updates-if-D-01/D-04-amendment-is-implemented]

# Actuals (#2632)
actuals:
  tokens: 2032
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provenance sections keep the file's existing heading/table/Literature-anchor/If-wrong format for every new constant, per the D-15 stance the document opens with"

key-files:
  created: []
  modified:
    - apps/mobile/lib/programs/generation-wizard.ts
    - apps/mobile/lib/programs/__tests__/generation-wizard.test.ts
    - docs/volume-rir-landmarks.md

key-decisions:
  - "Task 2 documents MIN_SETS_PER_EXERCISE=2 and D-04's original reduce-then-remove fit order because that is what 13-01 actually shipped in packages/program-generator/src/volume-split.ts and session-fit.ts as of this plan's execution — see 'Issues Encountered' for a mid-execution amendment to 13-CONTEXT.md that has not yet been implemented in code."

patterns-established: []

requirements-completed: [GEN-VOL-02, GEN-RIR-01]

coverage:
  - id: D1
    description: "describeDegradation's day_trimmed sentence mentions both sets and exercises so it stays true for either concession, while the four degradation sentences remain mutually distinct and non-blaming"
    requirement: GEN-VOL-02
    verification:
      - kind: unit
        ref: "apps/mobile/lib/programs/__tests__/generation-wizard.test.ts#describeDegradation states the day_trimmed sentence mentions both sets and exercises, true for either concession"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/programs/__tests__/generation-wizard.test.ts#describeDegradation returns a distinct non-empty sentence for every declared kind"
        status: pass
      - kind: unit
        ref: "apps/mobile/app/programs/__tests__/generate-screen.test.ts#the preview shows every reduction renders one distinct sentence per entry, none summarised away"
        status: pass
    human_judgment: false
  - id: D2
    description: "docs/volume-rir-landmarks.md states the daysPerWeek-keyed RIR ladder (RIR_LADDER_BY_DAYS_PER_WEEK) verbatim as this project's own design decision, and adds MAX_SETS_PER_EXERCISE/MIN_SETS_PER_EXERCISE with the same provenance framing"
    requirement: GEN-RIR-01
    verification:
      - kind: other
        ref: "node -e verify script from 13-02-PLAN.md Task 2 (checks section presence, all five daysPerWeek ladder rows, fitDayToSessionLength and D-14 mentions)"
        status: pass
      - kind: other
        ref: "grep -c '^## ' docs/volume-rir-landmarks.md is exactly one greater than before this task (8 -> 9)"
        status: pass
      - kind: other
        ref: "Literature anchor / If wrong pairing count check (9 == 9, >= 8)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The WORK_SECONDS_PER_SET/SESSION_OVERHEAD_MINUTES section no longer asserts Phase 11's D-14 (surviving slot sets never reduced); it names fitDayToSessionLength and states D-14 is superseded by Phase 13's D-04"
    verification:
      - kind: other
        ref: "node -e verify script from 13-02-PLAN.md Task 2 confirms both 'fitDayToSessionLength' and 'D-14' appear in the document"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-09-02
status: complete
---

# Phase 13 Plan 02: Trimmed-Day Copy & Landmark Provenance Summary

**Reworded `day_trimmed` degradation sentence to cover set reductions as well as exercise removals, and three updated sections of `docs/volume-rir-landmarks.md` recording the frequency-keyed RIR ladder and the per-exercise set cap as this project's own design decisions.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `generation-wizard.ts`'s `describeDegradation` now returns, for `day_trimmed`, a sentence stating the day "does fewer sets, fewer exercises, or both" — true under D-04's fit, which can reduce sets without removing any exercise, unlike the old sentence's unconditional "so some were dropped".
- `generation-wizard.test.ts` gained a case pinning that the `day_trimmed` sentence mentions both "set" and "exercise" case-insensitively, alongside the existing distinctness, muscle-naming and non-blaming assertions.
- `docs/volume-rir-landmarks.md`'s single-ladder `RIR_PROGRESSION` section is replaced by `RIR_LADDER_BY_DAYS_PER_WEEK`, stating all five `daysPerWeek`-keyed ladders from D-09 verbatim with the frequency/recovery reasoning and the D-15 provenance framing.
- A new `MAX_SETS_PER_EXERCISE` and `MIN_SETS_PER_EXERCISE` section is added adjacent to `EXPERIENCE_VOLUME_BAND`, explaining the per-exercise split (D-01) and stating `MIN_SETS_PER_EXERCISE` is a fit-time floor, not a split-time raise.
- The `WORK_SECONDS_PER_SET`/`SESSION_OVERHEAD_MINUTES` section's "If wrong" paragraph now names `fitDayToSessionLength`, describes the reduce-then-remove concession order, and states explicitly that Phase 11's D-14 is superseded by Phase 13's D-04.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reword the trimmed-day sentence so it is true for both concessions** - `c0afcb7` (fix)
2. **Task 2: Record the RIR ladder and the per-exercise set cap in the provenance document** - `5aeaaf3` (docs)

_Note: Task 1 carried `tdd="true"` in the plan frontmatter but its `<action>` described tests-alongside-implementation (add one case to an existing describe block, not a RED/GREEN cycle against new production behavior); the sentence and its test were written and verified together in one commit, matching how 13-01 handled its non-RED/GREEN tasks._

## Files Created/Modified
- `apps/mobile/lib/programs/generation-wizard.ts` - reworded `day_trimmed` branch of `describeDegradation`; signature, `DegradationEntry` type and `DEGRADATION_KINDS` untouched
- `apps/mobile/lib/programs/__tests__/generation-wizard.test.ts` - one added case asserting the `day_trimmed` sentence mentions both sets and exercises
- `docs/volume-rir-landmarks.md` - `RIR_PROGRESSION` section replaced with `RIR_LADDER_BY_DAYS_PER_WEEK`; `MAX_SETS_PER_EXERCISE`/`MIN_SETS_PER_EXERCISE` section added; `WORK_SECONDS_PER_SET`/`SESSION_OVERHEAD_MINUTES`'s "If wrong" paragraph corrected

## Decisions Made
- Task 2's constant values (`MAX_SETS_PER_EXERCISE = 5`, `MIN_SETS_PER_EXERCISE = 2`) and the described D-04 fit order (reduce sets first, then remove exercises by priority) were written to match what `packages/program-generator/src/volume-split.ts` and `session-fit.ts` actually ship as of this plan's execution, and what the plan's own `<action>` text and acceptance criteria specify verbatim (a two-row table of 5 and 2). See "Issues Encountered" below — `13-CONTEXT.md` was amended mid-execution to different values that are not yet implemented in code.

## Deviations from Plan

None — plan executed exactly as written. Both node-based verify commands from the plan's task-level `<verify>` blocks pass, along with `pnpm --filter mobile test -- generation-wizard generate-screen` and `pnpm -w run lint`.

## Issues Encountered

**Mid-execution amendment to 13-CONTEXT.md (informational, not acted on in this plan):** Between this plan's two task commits, `.planning/phases/13-program-generator-volume-selection-rework/13-CONTEXT.md` was amended (commit `35f0e41`, outside this plan) to change D-01's `MIN_SETS_PER_EXERCISE` from 2 to 3, and to reorder D-04's fit priority (remove overflow exercises first, then reduce sets to the new floor of 3, then remove first exercises) — noting the first implementation produced nine two-set exercises instead of the intended shape. As of this plan's completion, `packages/program-generator/src/volume-split.ts` and `session-fit.ts` (shipped in plan 13-01) still implement the ORIGINAL D-01/D-04 (`MIN_SETS_PER_EXERCISE = 2`, reduce-then-remove). This plan's `13-02-PLAN.md` was authored against the original decisions and its task text explicitly specifies the values documented here (a "two-row constant table (5 and 2)"), so Task 2's documentation was written to match the currently shipped code rather than the newer, not-yet-implemented amendment. **A future plan will need to update `volume-split.ts`/`session-fit.ts` to the amended D-01/D-04 and re-update this same section of `docs/volume-rir-landmarks.md` accordingly** — otherwise the provenance document will state values that no longer match the code.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 13-03 (tiered selection scoring, GEN-SEL-02) is unaffected by this plan's changes — it touches `slot-fill.ts`/selection scoring, not `generation-wizard.ts` or the provenance doc.
- Flagged above: the amended D-01 (`MIN_SETS_PER_EXERCISE = 3`) and amended D-04 (remove-overflow-first fit order) in `13-CONTEXT.md` are not yet implemented in `packages/program-generator`. Whoever picks up that follow-up work should also re-touch the `MAX_SETS_PER_EXERCISE`/`MIN_SETS_PER_EXERCISE` section and the `WORK_SECONDS_PER_SET`/`SESSION_OVERHEAD_MINUTES` "If wrong" paragraph this plan just wrote, since both currently describe the pre-amendment behavior.

---
*Phase: 13-program-generator-volume-selection-rework*
*Completed: 2026-09-02*

## Self-Check: PASSED

Both modified source files (`apps/mobile/lib/programs/generation-wizard.ts`,
`apps/mobile/lib/programs/__tests__/generation-wizard.test.ts`) and `docs/volume-rir-landmarks.md`
confirmed present on disk with the expected content, and both task commit hashes (`c0afcb7`,
`5aeaaf3`) confirmed present in `git log`.
