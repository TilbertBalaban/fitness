---
phase: 04-program-builder
plan: 13
subsystem: ui
tags: [react-native, expo-router, jest]

# Dependency graph
requires:
  - phase: 04-program-builder
    provides: "archiveDay/restoreDay/loadArchivedDays and a filtered loadProgramTree (04-12)"
provides:
  - "ArchiveDialog day subject (archive/restore copy, destructive/neutral fill)"
  - "Duplicate, Archive and Restore Day controls on the day page, wired through the screen's mutate funnel"
  - "an Archived days section fed by loadArchivedDays, restore-reachable, absent when empty"
affects: [04-15, 04-16]

# Actuals (#2632)
actuals:
  tokens: 5100
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ArchiveDialog's subject union stays the single confirmation surface for a fourth domain object (day) — no new component, one more COPY entry"
    - "programs.tsx's confirmingDay mirrors library.tsx's confirming shape exactly, and its dialog occupies the same early-return position, so a screen owns its confirmation the same way regardless of which list it confirms against"
    - "reloadTree became the single load path for both the deck and the Archived days section (Promise.all of loadProgramTree + loadArchivedDays), so the two can never disagree about which days exist"

key-files:
  created: []
  modified:
    - apps/mobile/components/ArchiveDialog.tsx
    - apps/mobile/components/__tests__/ArchiveDialog.test.tsx
    - apps/mobile/app/(tabs)/programs.tsx
    - apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts

key-decisions:
  - "Tasks 2 and 3 landed in a single feat commit rather than two: both touch the same day-page header JSX block (Rename/Duplicate/Archive/Remove now sit in one flex-wrap row), and splitting them would have meant staging an intermediate state that never actually ran. Each task still has its own RED test commit."
  - "confirmingDay carries no day name — ArchiveDialog's day copy is generic (\"Archive Day\"/\"Restore Day\"), so the dialog needs only dayId and unarchiving, matching how library.tsx's confirming carries only routineId."
  - "Duplicate Day's write only ever needs the day id and the current name — no navigation to the new copy is added, per the plan's explicit prohibition; the reload puts the copy at the end of the deck and the user swipes to it."

patterns-established: []

requirements-completed: [PROG-07]

coverage:
  - id: D1
    description: "ArchiveDialog renders a day variant — Archive Day (destructive) and Restore Day (neutral) — as the union's fourth extension point"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ArchiveDialog.test.tsx#renders the exact day archive confirmation copy with the destructive fill"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/ArchiveDialog.test.tsx#renders the day restore copy with a neutral, non-destructive confirm fill"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/ArchiveDialog.test.tsx#renders the same two-button row and 48x48 control geometry for the day subject as every other subject"
        status: pass
    human_judgment: false
  - id: D2
    description: "The day page offers Archive and Restore controls, routed through the screen's mutate funnel to archiveDay/restoreDay/loadArchivedDays with a non-test call site"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#hasArchivedDays / orderedArchivedDays"
        status: pass
      - kind: other
        ref: "grep -rl archiveDay apps/mobile/app --include=*.tsx | grep -v __tests__ names apps/mobile/app/(tabs)/programs.tsx"
        status: pass
      - kind: other
        ref: "grep -rl restoreDay and grep -rl loadArchivedDays, same non-empty result"
        status: pass
    human_judgment: false
  - id: D3
    description: "The day page offers a Duplicate control, wired to duplicateDay with the 'name copy' suffix convention and no confirmation"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts#duplicateDayName"
        status: pass
      - kind: other
        ref: "grep -rl duplicateDay apps/mobile/app apps/mobile/components --include=*.tsx | grep -v __tests__ names apps/mobile/app/(tabs)/programs.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "The four day-page controls have not been observed rendered on iOS, Android, or in a browser in this run"
    verification: []
    human_judgment: true
    rationale: "No Xcode, no Android SDK in this worktree (ROADMAP Phase 999.1 native sweep); web observation is explicitly deferred to 04-15 per this plan's prohibition on launching a browser. Recorded as WINDOWS unrun-verify."
---

# Phase 04 Plan 13: Duplicate, Archive and Restore Day controls Summary

**The day page now offers Rename, Duplicate, Archive and Remove, plus a restore-reachable Archived days section — closing 04-VERIFICATION's gap 1 by giving `duplicateDay`, `archiveDay`, `restoreDay` and `loadArchivedDays` their first non-test call sites.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-28T15:05:00Z (approx, worktree base)
- **Completed:** 2026-08-28T15:29:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `ArchiveDialog` gained a `'day'` subject (the union's fourth extension point) with archive/restore copy confirmed directly with the user (D-29), rendering the destructive fill on archive and the neutral fill on restore — asserted directly, not assumed
- The day page's header row (Rename/Duplicate/Archive/Remove) now wraps rather than shrinks (R4), and Archive/Duplicate route through the screen's `mutate` funnel exactly like every other write on this screen
- `reloadTree` now loads `loadArchivedDays` alongside `loadProgramTree` in one `Promise.all`, so the deck and the new Archived days section can never disagree about which days exist
- An Archived days section renders only when non-empty (own-empty-omits-header), each row receded at `opacity: 0.6` with a 48x48 Restore control
- `duplicateDayName` mirrors the library's `${name} copy` suffix convention; `duplicateDay` is wired with no confirmation, per the UI-SPEC's Confirmations table
- Every one of the three previously-orphaned day functions (`duplicateDay`, `archiveDay`, `restoreDay`, plus `loadArchivedDays`) now has a non-test call site in `apps/mobile/app/(tabs)/programs.tsx`, proven by grep

## Task Commits

1. **Task 1: ArchiveDialog gains a day subject** - `e3da32f` (test), `6616a51` (feat)
2. **Task 2: Archive and Restore on the day page** / **Task 3: Duplicate Day** - `87e2244` (test), `886d808` (feat, both tasks — see Decisions Made)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `apps/mobile/components/ArchiveDialog.tsx` - `'day'` member on `ArchiveDialogSubject`, fourth `COPY` entry with the D-29-confirmed copy
- `apps/mobile/components/__tests__/ArchiveDialog.test.tsx` - day archive/restore copy and shared-geometry assertions
- `apps/mobile/app/(tabs)/programs.tsx` - `hasArchivedDays`/`orderedArchivedDays`/`duplicateDayName` pure helpers; `confirmingDay`/`archivedDays` state; `handleDuplicateDay`/`handleArchiveDay`/`handleRestoreDay`/`handleConfirmDayArchive`; day-header Duplicate/Archive controls; Archived days section; `ArchiveDialog subject="day"` early-return
- `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` - `days`/`duplicate-routine` mock entries; `hasArchivedDays`/`orderedArchivedDays`/`duplicateDayName` unit tests

## Decisions Made
- Tasks 2 and 3 landed in one `feat` commit rather than two, since both edit the same day-page header JSX in a way that cannot be split without an intermediate non-running state. Each still has its own preceding `test` (RED) commit, so the RED→GREEN gate holds per task-pair, just not as four separate commits.
- `confirmingDay` carries `{ dayId, unarchiving }` only, no day name — `ArchiveDialog`'s day copy is subject-generic ("Archive Day"), matching `library.tsx`'s `confirming` shape exactly rather than inventing a richer one.
- No deck navigation was added for a freshly duplicated day, per the plan's explicit prohibition; `DayDeck` owns its page index as component state with no controlled prop, and the copy lands at the end of the day order after `reloadTree`.

## Deviations from Plan

None — plan executed exactly as written, including using the plan's confirmed D-33 copy verbatim.

## Issues Encountered

**TypeScript inference on `PressableElement.props`:** the geometry-assertion test initially referenced `accessibilityRole` on the narrow `PressableElement` prop type, which does not declare it (the type only names `children`/`onPress`). Fixed by widening the local cast in the test to include `accessibilityRole` and `style`, matching how the rest of the test file already casts `Pressable` props for assertions it needs beyond the narrow type. No production code was affected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-15 (Playwright suite covering the web observation of these controls) and 04-16 (adds the day Archive/Restore rows to `04-UI-SPEC.md`'s Copywriting Contract, which predates D-29). No blockers.

---
*Phase: 04-program-builder*
*Completed: 2026-08-28*

## Self-Check: PASSED
All modified files present on disk; commits `e3da32f`, `6616a51`, `87e2244`, `886d808` verified in git log.
