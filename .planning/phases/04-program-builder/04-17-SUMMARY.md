---
phase: 04-program-builder
plan: 17
subsystem: docs
tags: [requirements, ledger, ui-spec, vocabulary]

# Dependency graph
requires:
  - phase: 04-program-builder
    provides: "day archive/restore/duplicate call sites (04-13), the archived-day rotation/history-safety regressions (04-14), and 04-16's executed browser evidence for both PROG-07's day lifecycle and PROG-06's time-off conversion"
provides:
  - "REQUIREMENTS.md PROG-06/07/09 statuses backed by a named artifact in a preceding SUMMARY, not carried forward unexamined"
  - "a REQUIREMENTS.md Amendments section — the convention for narrowing a requirement's own text with its authority on the record"
  - "04-UI-SPEC.md's Home card, Confirmations and Day Deck sections matching what 04-13/04-16 actually shipped"
  - "docs/program-vocabularies.md documenting routine_day.archived_at on the same archive-is-a-timestamp rule as routine/exercise"
affects: []

# Actuals (#2632)
actuals:
  tokens: 3092
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A requirement's own text is never reworded silently — an Amendments section records the date, the authority decision, and the superseded justification it replaces, so drift like D-27-cited-for-a-scope-cap becomes visible rather than invisible."

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/phases/04-program-builder/04-UI-SPEC.md
    - docs/program-vocabularies.md

key-decisions:
  - "PROG-07 flipped Complete only after grepping for real non-test call sites of duplicateDay/archiveDay/restoreDay/loadArchivedDays in apps/mobile/app/(tabs)/programs.tsx (all four confirmed present) and confirming 04-16's SUMMARY records an executed 48/48 Playwright run covering duplicate/archive/restore end to end against a real @powersync/web database."
  - "PROG-06's Traceability row stayed Complete, but re-decided from 04-16's executed cycle-conversion evidence rather than left carried forward: both the positive case (kind + duration_days written together) and the negative case (validation blocks a durationless save, writes nothing) ran green in the browser suite, closing 04-VERIFICATION.md gap 2 with an executed proof rather than the diff (4f491a1) that originally closed the code path."
  - "WINDOWS.md was deliberately not touched. Grepped for gap-specific entries (\"gap 1/2/3\", \"A-PROG-07\", \"overclaim\") and found none — 04-VERIFICATION.md's gaps lived only in its own frontmatter, never filed as separate WINDOWS rows. #89 (Mark Ready) is already marked fixed by 04-14. #150/#151 (native day-page/spec observation) are already open and correctly point at ROADMAP Phase 999.1, satisfying the plan's verification clause without a write. WINDOWS.md is also not in this plan's declared files_modified, so leaving it untouched keeps the diff inside its declared scope."

patterns-established: []

requirements-completed: [PROG-06, PROG-07, PROG-09]

coverage:
  - id: D1
    description: "PROG-07's checklist box and Traceability row flip Partial to Complete, backed by a grep-confirmed non-test call site for all four day functions and 04-16's executed browser run"
    requirement: "PROG-07"
    verification:
      - kind: other
        ref: "grep -rl duplicateDay/archiveDay/restoreDay/loadArchivedDays apps/mobile/app apps/mobile/components --include=*.tsx | grep -v __tests__ → apps/mobile/app/(tabs)/programs.tsx for all four"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/program-day-lifecycle.spec.ts, reported executed and green (48/48) in 04-16-SUMMARY.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "PROG-06's Traceability row is decided from 04-16's executed cycle-conversion cases, not carried forward from the diff that closed the code path"
    requirement: "PROG-06"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/program-day-lifecycle.spec.ts#converting a cycle to time off with a duration / with no duration, reported executed and passing in 04-16-SUMMARY.md"
        status: pass
    human_judgment: false
  - id: D3
    description: "PROG-09's checklist text reads 'the next workout' and an Amendments section names D-32 as authority, naming the superseded D-27 citation as a placement decision"
    requirement: "PROG-09"
    verification:
      - kind: other
        ref: "grep -q 'next workout' / '## Amendments' / 'D-32' .planning/REQUIREMENTS.md — all pass; grep -c PROG-09 == 3"
        status: pass
    human_judgment: false
  - id: D4
    description: "04-UI-SPEC.md's Home card, Confirmations and Day Deck sections, and docs/program-vocabularies.md, match the shipped day-archive surface"
    verification:
      - kind: other
        ref: "grep -q D-32/'Archive Day'/'Restore Day'/'Archived days' .planning/phases/04-program-builder/04-UI-SPEC.md — all pass; grep -q routine_day docs/program-vocabularies.md — pass; git diff --quiet -- apps packages ops — pass"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-28
status: complete
---

# Phase 04 Plan 17: Requirements ledger correction and contract catch-up Summary

**REQUIREMENTS.md's PROG-06/07/09 statuses now trace to named artifacts in 04-13/04-14/04-16's SUMMARYs rather than to functions, with a new Amendments section recording D-32's PROG-09 narrowing and the D-27 authority drift it corrects; 04-UI-SPEC.md and docs/program-vocabularies.md are brought back into agreement with the shipped day-archive surface.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-28T19:16:00Z (approx, worktree base)
- **Completed:** 2026-08-28T19:41:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- PROG-07's checklist box and Traceability row flip from unchecked/Partial to checked/Complete — verified first, not assumed: `grep`-confirmed non-test call sites for `duplicateDay`, `archiveDay`, `restoreDay` and `loadArchivedDays` in `apps/mobile/app/(tabs)/programs.tsx`, plus 04-16's SUMMARY recording an executed, green 48/48 Playwright run covering the full duplicate/archive/restore round trip against a real database
- PROG-06's Traceability row stays Complete, but decided from 04-16's executed cycle-conversion cases (both the positive write and the negative validation-blocks-the-save case ran green) rather than carried forward unexamined from the diff (`4f491a1`) that originally fixed the code path
- PROG-09's checklist text narrows from "upcoming workouts" to "the next workout," and a new `## Amendments` section — the first of its kind in this file — records the change dated 2026-08-28, names D-32 as authority, and states plainly that the earlier justification cited D-27, a placement decision that never supported a scope cap
- `04-UI-SPEC.md`'s Home "Next Up" Card section now cites D-32 instead of D-27 for the single-card scope, with the superseded D-27 citation kept and marked as a correction rather than deleted
- `04-UI-SPEC.md`'s Confirmations table gains Archive Day / Restore Day rows reproducing `ArchiveDialog.tsx`'s shipped day copy verbatim, and the Duplicate row's note now covers the shipped day case
- `04-UI-SPEC.md`'s Day Deck section gains a bullet describing the four-control wrapping header row and the Archived days section, cited to D-29
- `docs/program-vocabularies.md` extends "Active, frozen and archived are not statuses" with a paragraph on `routine_day.archived_at`: same archive-is-a-timestamp rule as `routine`/`exercise`, not a status column, the single filtered read (`loadProgramTree`) versus the one deliberate archive-reachable exception (`loadArchivedDays`), and why the sync rules still deliver archived days unfiltered (D-33)

## Task Commits

1. **Task 1: The requirements ledger, corrected with its authority written down** - `97e6020` (docs)
2. **Task 2: The UI contract and the vocabulary doc catch up** - `1138da1` (docs)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `.planning/REQUIREMENTS.md` - PROG-07 checklist/Traceability flipped to Complete; PROG-09 checklist text narrowed to "the next workout"; PROG-07 Traceability row Partial→Complete; new `## Amendments` section with the dated PROG-09/D-32 row
- `.planning/phases/04-program-builder/04-UI-SPEC.md` - Home card section re-authorised to D-32 with the D-27 correction recorded; Confirmations table gains Archive Day/Restore Day rows and an amended Duplicate note; Day Deck section gains the header-controls/Archived-days bullet
- `docs/program-vocabularies.md` - "Active, frozen and archived are not statuses" extended with the day-level archive paragraph

## Decisions Made
- PROG-07's flip is conditioned on evidence, not on the plan's own confidence: greps were run directly against the current worktree rather than trusted from the SUMMARYs' prose claims, per this plan's own prohibition on carrying a status forward unexamined.
- PROG-06 was re-evaluated rather than left alone even though its Traceability row already read Complete — 04-VERIFICATION.md had explicitly said that mark was against a conversion path proven broken, so leaving it untouched would have repeated exactly the failure mode this plan exists to correct. 04-16's executed positive and negative cases are the artifact that now backs it.
- WINDOWS.md left untouched — see key-decisions above for the full reasoning (no gap-specific entries exist to close, #89/#150/#151 are already in their correct state, and the file is outside this plan's declared `files_modified`).

## Deviations from Plan

None — plan executed exactly as written. Both tasks' automated `<verify>` commands were run directly against the worktree and passed; no auto-fixes were needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 04's gap-closure sequence (04-12 through 04-17) is complete. `REQUIREMENTS.md` now agrees with what 04-13/04-14/04-16 actually shipped and proved, `04-UI-SPEC.md` and `docs/program-vocabularies.md` agree with the code, and the one requirement whose text changed (PROG-09) carries a dated, authority-named amendment. No blockers for Phase 5.

---
*Phase: 04-program-builder*
*Completed: 2026-08-28*

## Self-Check: PASSED
