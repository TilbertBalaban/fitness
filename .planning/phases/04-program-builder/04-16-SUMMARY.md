---
phase: 04-program-builder
plan: 16
subsystem: testing
tags: [playwright, react-native-web, powersync, drizzle]

# Dependency graph
requires:
  - phase: 04-program-builder
    provides: "day duplicate/archive/restore controls and the Edit Cycle form's single-write updateCycle (04-13); the Programs screen db/userId injection seam plus seedRoutineTree/openProgramsScreen/raw readers on the durability harness (04-15)"
provides:
  - "program-day-lifecycle.spec.ts — an executed, registered durability-project spec proving day duplicate/archive/restore and the time-off cycle conversion against a real @powersync/web database"
affects: []

# Actuals (#2632)
actuals:
  tokens: 2841
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A DayDeck (react-native-tab-view) inactive page's text content is still reachable by page.getByText even though its accessible name is stripped by aria-hidden for role-based queries (reorder-exercises.spec.ts's own documented constraint) — used here to prove a duplicated day carries its source's exercises by an occurrence-count delta (2 -> 3) rather than by paging the deck."

key-files:
  created:
    - apps/mobile/e2e/program-day-lifecycle.spec.ts
  modified:
    - apps/mobile/playwright.config.ts

key-decisions:
  - "The duplicate day's exercise-count parity was proven via page.getByText occurrence counts (2 -> 3 for each seeded exercise name) rather than by paging DayDeck to the copy's tab or by adding a new raw 'list children by day id' reader to test-support.ts — the latter would have required touching a file outside this plan's declared files_modified, and a temporary probe spec (run and discarded, matching 04-15's own precedent) confirmed getByText, unlike getByRole, is not blocked by the inactive pane's aria-hidden."
  - "The three day-lifecycle cases (duplicate, archive, restore) share one sequential test() rather than three, mirroring gym-profiles.spec.ts's own single-flow structure — archive and restore both need Push already duplicated-past, so splitting them would mean reseeding the same setup three times for no added coverage."
  - "The two cycle-conversion cases are separate test()s, each with its own fresh seed — the negative case needs Week 1 still in its seeded 'training' state, which the positive case's own conversion would otherwise have already consumed."

patterns-established: []

requirements-completed: [PROG-06, PROG-07]

coverage:
  - id: D1
    description: "Duplicating a day from the shipped day page is proven by an executed browser run: the copy appears in the deck and a real routine_day row exists with the copied exercises beneath it"
    requirement: "PROG-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/program-day-lifecycle.spec.ts#duplicating, archiving and restoring a training day, driven end to end (Duplicate section) — executed via pnpm --filter mobile test:e2e:durability, 48/48 passing"
        status: pass
    human_judgment: false
  - id: D2
    description: "Archiving a day is proven to be an archive and not a delete: the row is still in the database with a non-null archived_at, and its exercises are still there"
    requirement: "PROG-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/program-day-lifecycle.spec.ts#duplicating, archiving and restoring a training day, driven end to end (Archive section) — readRoutineDayRaw + readRoutineExercise assertions, executed and passing"
        status: pass
    human_judgment: false
  - id: D3
    description: "An archived day leaves the deck and appears in the Archived days section, and restoring it puts it back — the full round trip, driven, not asserted"
    requirement: "PROG-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/program-day-lifecycle.spec.ts#duplicating, archiving and restoring a training day, driven end to end (Restore section) — Archived days section presence/absence and readRoutineDayRaw round trip, executed and passing"
        status: pass
    human_judgment: false
  - id: D4
    description: "Converting an existing cycle to time off with a duration is proven from the shipped Edit Cycle form: the row ends with kind time_off and a non-null duration_days (D-30, PROG-06)"
    requirement: "PROG-06"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/program-day-lifecycle.spec.ts#converting a cycle to time off with a duration writes kind and duration_days together — executed and passing"
        status: pass
    human_judgment: false
  - id: D5
    description: "Saving a time-off conversion with no duration surfaces the validation message and writes nothing"
    requirement: "PROG-06"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/program-day-lifecycle.spec.ts#converting a cycle to time off with no duration writes nothing — executed and passing"
        status: pass
    human_judgment: false
  - id: D6
    description: "The spec is registered in the durability project and runs in the same single-worker lane as every other real-database case, with the whole lane still passing"
    verification:
      - kind: other
        ref: "grep -c program-day-lifecycle.spec.ts apps/mobile/playwright.config.ts returns 1 (durability testMatch, not sync); pnpm --filter mobile test:e2e:durability run in full — 48 passed (45 pre-existing + 3 new), 0 skipped/fixmed"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-08-28
status: complete
---

# Phase 04 Plan 16: Day lifecycle and time-off conversion — executed browser evidence Summary

**`program-day-lifecycle.spec.ts` drives Duplicate/Archive/Restore on the day page and the time-off cycle conversion through the shipped Edit Cycle form against a real `@powersync/web` database in Chromium — 48/48 durability cases passing, including the 3 new ones.**

## Performance

- **Duration:** ~50 min (includes fresh-worktree bootstrap: `pnpm install` + `npx turbo run build`)
- **Started:** 2026-08-28T15:25:00Z (approx, worktree base)
- **Completed:** 2026-08-28T16:14:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `program-day-lifecycle.spec.ts` opens the harness the same way `gym-profiles.spec.ts` does, seeds via `seedRoutineTree`, mounts the real Programs screen via `openProgramsScreen`, and drives every control by accessibility label
- **Duplicate:** pressing `Duplicate Push` is proven, by raw read, to append a `Push copy` row whose `order_index` exceeds every sibling's, with no confirmation dialog appearing; the copy's exercise count is proven by a `page.getByText` occurrence-count delta (2 → 3 for each seeded exercise name) — DayDeck's inactive-pane text is reachable by a text query even though its accessible name is stripped from role-based queries by `aria-hidden` (the same constraint `reorder-exercises.spec.ts` already documents for `ExercisePagerView`)
- **Archive:** confirming `Archive Push` is proven, by `readRoutineDayRaw`, to leave the row in place with a non-null `archived_at` string and both of its `routine_exercise` children (via `readRoutineExercise`) still pointing at it — the rendered deck alone cannot tell an archive from a delete, so the raw read is the load-bearing assertion
- **Restore:** confirming `Restore Push` is proven to null `archived_at` back out, put `Rename Push` back in the deck, and make the `Archived days` section disappear entirely (absent, not empty — D-29's own-empty-omits-header rule) rather than render with nothing in it
- **PROG-06/D-30:** selecting the `Week 1` chip, opening Edit Cycle, switching to Time off and saving `7` is proven, by `readRoutineCycleRaw`, to write `kind = 'time_off'` and `duration_days = 7` together — the exact state `04-VERIFICATION.md` gap 2 said was unreachable, driven through the form `updateCycle`'s fix landed in but was never executed against
- The negative case is proven too: leaving `Days off` blank and pressing Save keeps the form open with the validation message `Time off needs a length in days.` visible, while the stored row stays `kind = 'training'` with a null `duration_days` — a form that wrote the kind before validating the duration would still show the same error text, so the stored-row assertion is what actually closes the trap
- The spec is registered in the `durability` project's `testMatch` (not `sync`); the full lane was run once end to end — 48 cases passing (45 pre-existing + 3 new), 0 skipped or fixmed

## Task Commits

1. **Task 1: Duplicate, archive and restore a day, driven end to end** - `094b032` (test)
2. **Task 2: Converting a cycle to time off, driven through the Edit Cycle form** - `26cb015` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `apps/mobile/e2e/program-day-lifecycle.spec.ts` (created) - three `test()` cases: day duplicate/archive/restore (one sequential flow), cycle-to-time-off conversion success, cycle-to-time-off conversion failure (each with its own fresh seed)
- `apps/mobile/playwright.config.ts` - `program-day-lifecycle.spec.ts` added to the `durability` project's `testMatch` array

## Decisions Made
- Proved the duplicate's exercise-count parity via `page.getByText` occurrence counting rather than paging `DayDeck` (no click target exists — `renderTabBar={() => null}` — and driving `react-native-tab-view`'s `PanResponder`-based swipe gesture from Playwright would have been a novel, untested technique in this suite) or adding a new raw reader to `test-support.ts` (outside this plan's declared `files_modified`). A temporary probe spec — written, run, and discarded before the real spec was written, mirroring 04-15's own precedent for a throwaway harness-verification test — confirmed the inactive pane's exercise-name text IS reachable by a text-based locator even though its accessible name is stripped by `aria-hidden` for role-based locators.
- The three day-lifecycle operations share one sequential `test()` (matching `gym-profiles.spec.ts`'s own structure) since archive and restore both operate on the day the duplicate case already produced context for; the two cycle-conversion cases are separate `test()`s, each with a fresh seed, since the negative case needs `Week 1` still in its seeded `training` state rather than the `time_off` state the positive case's own conversion would have left it in.

## Deviations from Plan

None — plan executed exactly as written. No production source file was modified; `git diff` against the plan's declared `files_modified` shows only `apps/mobile/e2e/program-day-lifecycle.spec.ts` and `apps/mobile/playwright.config.ts`.

## Issues Encountered

**Fresh-worktree bootstrap:** the worktree had no `node_modules` and no built workspace packages. Ran `pnpm install` and `npx turbo run build` before any test/typecheck/build command, consistent with 04-14's and 04-15's own note on the same friction.

**Direct `npx playwright test` invocation failed with `Cannot read properties of undefined (reading 'openWithFilename')`** on one exploratory run, while the documented `pnpm --filter mobile test:e2e:durability -- <name>` invocation succeeded consistently across every run in this session (including the two full-suite runs reported above). No source or config change was needed; the documented command in `.claude/CLAUDE.md` is what this SUMMARY's reported pass counts come from.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-VERIFICATION.md's gaps 1 and 2 both now carry executed browser evidence rather than unit-test-plus-typecheck evidence. No blockers for downstream work. The one remaining verification gap for this feature set is native-platform observation (iOS/Android), tracked as WINDOWS #151 and deferred to ROADMAP Phase 999.1 per this repository's established native-testing-deferral pattern.

---
*Phase: 04-program-builder*
*Completed: 2026-08-28*

## Self-Check: PASSED
