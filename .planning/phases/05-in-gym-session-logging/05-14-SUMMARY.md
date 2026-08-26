---
phase: 05-in-gym-session-logging
plan: 14
subsystem: mobile-e2e
tags: [react-native-web, powersync, notes, set-row, session-menu, durability-harness, playwright]

# Dependency graph
requires:
  - phase: 05-in-gym-session-logging
    provides: "05-12's db-threading precedent (a722ce4) for sheets that write through session-mutations.ts, and 05-13's UI-SPEC Amendment A.1/A.2 contract for the long-press note trigger and the session Menu's Session Note row"
provides:
  - "A long-press note trigger on every SetRow, reaching a new second NoteSheet mount at level='set'"
  - "A Session Note row in the live session Menu, reaching a new NoteSheet mount at level='session' against workout_session.notes"
  - "logged_set.notes and workout_session.notes threaded through loadSessionTree/buildSetRows/ExercisePage into the row and the Menu"
  - "The warm-up 'W' badge relocated from ExercisePageView's external wrapper into SetRowView itself, so every SetRowView consumer can render it (WINDOWS #109)"
  - "session-notes.spec.ts: a browser-real, registered proof that set/exercise/session notes write three independent columns in any order, and an empty note clears one"
affects: [05-16, SetRow, ExercisePage, NoteSheet, workout.tsx]

# Actuals (#2632)
actuals:
  tokens: 13200
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "NoteSheet's db threading follows the exact optional-db-with-getPowerSync()-default pattern 05-12 established for TargetsSheet (a722ce4) — the same class of getPowerSync()-default gap, fixed the same way, for the same reason (durability-harness database isolation)."
    - "A shared affordance (warm-up badge, note dot) is rendered from inside the leaf component (SetRowView) rather than by whichever caller happens to wrap it, so every consumer gets it for free."

key-files:
  created:
    - apps/mobile/e2e/session-notes.spec.ts
  modified:
    - apps/mobile/components/SetRow.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/components/NoteSheet.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/lib/db/summary-query.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/lib/session/set-row-builders.ts
    - apps/mobile/playwright.config.ts

key-decisions:
  - "Applied the orchestrator's explicit ruling to thread an optional db prop through NoteSheet.tsx (both the existing exercise-level mount and the new set-level/session-level mounts) despite the plan's literal 'NoteSheet.tsx is not modified' prohibition — the same getPowerSync()-default divergence 05-12 found and fixed for TargetsSheet (WINDOWS #134) exists identically in setNote's call sites. Recorded as WINDOWS #135. session-mutations.ts and WorkoutSummary.tsx were left untouched, honoring the rest of the prohibition."
  - "Session-level note id is read from headerTimer.sessionId rather than adding a new sessionId prop to WorkoutScreenViewProps — the Menu (and therefore the Session Note row) only renders when headerTimer is non-null anyway (live mode), so no new plumbing was needed."
  - "ExercisePageView now renders SetRowView directly instead of wrapping it in a badge-hosting View — the badge and note dot live inside SetRowView itself, so ExercisePageView only computes the warmup/hasNote booleans from the row's own setType/noteText."
  - "onSetLongPress is computed inside the stateful ExercisePage wrapper (which resolves the long-pressed set's own noteText for the sheet's initial text) rather than accepted as an external prop from workout.tsx — Omit'd from ExercisePageProps to prevent a caller from misusing it."

requirements-completed: [LOG-16]

coverage:
  - id: D1
    description: "A long press on any part of a SetRow (every nested Pressable carries the same handler, since a child Pressable swallows its parent's gesture) opens a set-level NoteSheet; saving writes logged_set.notes. A screen-reader user reaches the identical action via an 'Add note' accessibility action on the same targets, with no long press required."
    requirement: LOG-16
    verification:
      - kind: unit
        ref: "components/__tests__/SetRow.test.tsx — 'a long press on a nested field target...', 'a long press on the reference Pressable...', 'exposes an \"Add note\" accessibility action...'"
        status: pass
      - kind: e2e
        ref: "e2e/session-notes.spec.ts — 'a long press on a set row writes a set-level note'"
        status: pass
    human_judgment: false
  - id: D2
    description: "The session Menu carries a Session Note row (live-mode only, between Pause/Resume and Discard) that opens a NoteSheet at level='session'; saving writes workout_session.notes."
    requirement: LOG-16
    verification:
      - kind: e2e
        ref: "e2e/session-notes.spec.ts — 'the Session Note menu row writes a session-level note'"
        status: pass
    human_judgment: false
  - id: D3
    description: "All three note levels (set, exercise, session) write independent columns in any order — re-saving one never clears or overwrites the other two — and an empty/whitespace-only save at any level stores NULL and removes that level's note dot."
    requirement: LOG-16
    verification:
      - kind: e2e
        ref: "e2e/session-notes.spec.ts — 'the three levels are independent' (includes the reverse-order case), 'an empty note clears the column'"
        status: pass
    human_judgment: false
  - id: D4
    description: "The warm-up 'W' badge renders from inside SetRowView (ahead of the set-number column) for every consumer of the row, not only the one caller that used to wrap it externally (WINDOWS #109)."
    requirement: LOG-16
    verification:
      - kind: unit
        ref: "components/__tests__/SetRow.test.tsx — 'renders the leading warm-up badge...'"
        status: pass
    human_judgment: false

duration: ~1h
completed: 2026-08-26
status: complete
---

# Phase 5 Plan 14: Set/Session Note Wiring and Warm-up Badge Relocation Summary

**Wired the two missing note surfaces (set-level long press, session-level Menu row) onto `setNote`'s three already-tested columns, relocated the warm-up badge into `SetRowView` itself, and proved all three note levels end to end in a real browser — closing LOG-16 and WINDOWS #109/#118.**

## Performance

- **Duration:** ~1h
- **Tasks:** 3 of 3 complete
- **Files modified:** 13 (1 net-new: `apps/mobile/e2e/session-notes.spec.ts`)

## Accomplishments

- `SetRowView` gained `warmup`/`hasNote`/`onLongPress` optional props: a 14px warm-up badge ahead of the set-number column, a 6px note dot before the checkmark, and an `onLongPress` (plus an `accessibilityActions` "Add note" equivalent) attached to every nested Pressable — the set-number Pressable, each field Pressable, each field's own reference Pressable, and the checkmark — so a long press anywhere on the row reaches the handler regardless of which nested Pressable swallows the gesture first.
- `loadSessionTree` now selects `logged_set.notes` and `workout_session.notes`; `buildSetRows` carries the set's note through as `ResolvedSetRow.noteText`.
- `ExercisePageView` renders `SetRowView` directly (no more external wrapper for the warm-up badge); the stateful `ExercisePage` wrapper resolves a long-pressed set's own note text and mounts a second `NoteSheet` at `level="set"`, alongside the existing `level="exercise"` mount.
- `workout.tsx`'s session Menu popover gained a "Session Note" row (live-mode only, between Pause/Resume and Discard, carrying its own note dot) that opens a `NoteSheet` at `level="session"` against `workout_session.notes`.
- `session-notes.spec.ts` (new, registered in `playwright.config.ts`) proves all three levels end to end against a real `@powersync/web` database: 4 cases, 0 failures, run 3 times with identical results — set-level write, session-level write, three-level independence (forward AND reverse save order), and empty-note-clears-the-column.
- Fixed a real gap in `readWorkoutSessionRaw` (test-support.ts): its explicit column list predated this plan's `workout_session.notes` addition and could not have returned it to any spec.

## Task Commits

1. **Task 1: Carry the set's note to the row, and give the row its note and warm-up affordances** — `6879d2d` (feat)
2. **Task 2: Mount the set-level and session-level note sheets** — `69bd6aa` (feat)
3. **Task 3: Prove all three note levels in a real browser** — `6cc3577` (test)

## Files Created/Modified

- `apps/mobile/components/SetRow.tsx` — `warmup`/`hasNote`/`onLongPress` props, the relocated warm-up badge, the note dot, long-press + accessibility-action wiring on every nested Pressable
- `apps/mobile/components/ExercisePage.tsx` — `onSetLongPress`, the second `set-note` `ActiveSheet` mount, `db` threaded to both `NoteSheet` mounts, `renderWarmupBadge` deleted
- `apps/mobile/components/NoteSheet.tsx` — optional `db?: WriteDb` prop threaded into `setNote`'s own db argument (WINDOWS #135)
- `apps/mobile/app/(tabs)/workout.tsx` — the Session Note Menu row, its own note dot, `handleOpenSessionNote`/`handleSessionNoteSaved`/`handleCancelSessionNote`, a `NoteSheet` mount at `level="session"`
- `apps/mobile/lib/db/session-query.ts` — `LoggedSetRow.notes`, `LiveSessionRow.notes`, both selected in `loadSessionTree`
- `apps/mobile/lib/db/summary-query.ts` — added `loggedSet.notes` to its own `LoggedSetRow`-shaped select (Rule 3 compile fix, same table already read)
- `apps/mobile/lib/db/test-support.ts` — `readWorkoutSessionRaw`'s explicit column list gained `notes`
- `apps/mobile/lib/session/set-row-builders.ts` — `ResolvedSetRow.noteText`, mapped in `buildSetRows`
- `apps/mobile/e2e/session-notes.spec.ts` — new, four browser-real cases
- `apps/mobile/playwright.config.ts` — registered the new spec
- `apps/mobile/components/__tests__/SetRow.test.tsx`, `apps/mobile/lib/db/__tests__/session-query.test.ts`, `apps/mobile/components/__tests__/WorkoutSummary.test.tsx`, `apps/mobile/app/(tabs)/__tests__/workout.test.tsx` — new/updated unit test coverage and fixture updates for the widened `LoggedSetRow`/`LiveSessionRow`/`ResolvedSetRow` shapes

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `notes` to `summary-query.ts`'s own `LoggedSetRow`-shaped select**
- **Found during:** Task 1, `pnpm --filter mobile typecheck`
- **Issue:** `summary-query.ts` builds its own `LoggedSetRow[]` via an explicit column select that predated the new required `notes` field; widening the shared interface broke its compile.
- **Fix:** Added `notes: loggedSet.notes` to the same select — no new query, same table it already reads.
- **Files modified:** `apps/mobile/lib/db/summary-query.ts`
- **Committed in:** `6879d2d`

**2. [Ruling from orchestrator dispatch, not a standard Rule 1-4] Threaded `db` through `NoteSheet.tsx`**
- **Found during:** Task 2, applying the precedent 05-12 (WINDOWS #134) established for `TargetsSheet`
- **Issue:** `NoteSheet.tsx`'s `handleSave` called `setNote({ level, id, text })` with no explicit `db` argument, always resolving `setNote`'s own `getPowerSync()` default — the identical database-divergence defect 05-12 found and fixed for `writeBackTargets`/`setSessionExerciseTargets`, which would have made a real isolated-database browser test's note write land in a different SQLite file than the one the test reads back.
- **Fix:** Added an optional `db?: WriteDb` prop to `NoteSheetProps`, defaulting to `getPowerSync()` exactly like `TargetsSheet`'s own fix; threaded it from `ExercisePage` (both the exercise-level and set-level mounts) and from `WorkoutScreenView` (the session-level mount).
- **Files modified:** `apps/mobile/components/NoteSheet.tsx`, `apps/mobile/components/ExercisePage.tsx`, `apps/mobile/app/(tabs)/workout.tsx`
- **Authorization:** The orchestrator's dispatch for this plan explicitly ruled that the plan's "NoteSheet.tsx and session-mutations.ts are not modified" prohibition's intent is "do not re-invent note capability that already exists," not "never touch the file," and pre-authorized this narrow db-threading parity fix, citing WINDOWS #134.
- **Recorded:** WINDOWS #135 (`deviation`), citing #134 and the ruling. `session-mutations.ts` and `WorkoutSummary.tsx` remain untouched, honoring the rest of the prohibition.
- **Verification:** `pnpm --filter mobile test` — 1296/1296 pass; `pnpm --filter mobile test:e2e:durability e2e/session-notes.spec.ts` — 4/4 pass, run 3 times with identical results.
- **Committed in:** `69bd6aa`

**3. [Rule 3 - Blocking] Added `notes` to `readWorkoutSessionRaw`'s explicit column list (test-support.ts)**
- **Found during:** Task 3, writing `session-notes.spec.ts`'s session-level assertion
- **Issue:** `readWorkoutSessionRaw` selects an explicit, hand-listed set of `workout_session` columns that predated this plan's `notes` column — the harness's own raw session reader could not have returned it to any spec, including this one.
- **Fix:** Added `notes` to the column list.
- **Files modified:** `apps/mobile/lib/db/test-support.ts`
- **Committed in:** `6cc3577`

---

**Total deviations:** 3 (2 Rule-3 blocking compile/harness fixes, 1 orchestrator-authorized db-threading exception to a literal file-touch prohibition, whose spirit — "no new note capability, no semantic change" — was honored).
**Impact on plan:** All three were required for the plan's own acceptance criteria (a compiling widened type, a working browser-real proof) or for parity with a fix the immediately preceding plan already established for the identical defect class. No scope creep, no architectural change.

## Issues Encountered

**Two real environment findings surfaced while getting Task 3's spec green (both documented, neither "fixed" by editing shared/other-plan files):**

1. **The durability harness's own feature gate depends on the Playwright *process's* env var, not just the dev server's.** `DURABILITY_HARNESS_GLOBAL` (`lib/db/durability-harness-key.ts`) is computed from `process.env.EXPO_PUBLIC_DURABILITY_HARNESS` in BOTH the Metro-bundled web app AND the Node-side spec file that imports it directly. Invoking `npx playwright test` without going through the `package.json` script (which sets `EXPO_PUBLIC_DURABILITY_HARNESS=1` in the shell before invoking Playwright) silently resolves the constant to `''` in the spec's own process, producing `window['']` (`undefined`) lookups that read exactly like the harness never initialized. Always invoke through `pnpm --filter mobile test:e2e:durability` (or export the var manually) — confirmed with a clean, repeatable pass once done correctly.

2. **LOG-13's auto-advance fires after the FIRST completed set of a multi-set exercise, not after the last one — likely the real root cause of several other specs' pre-existing failures.** `shouldAutoAdvance` (`lib/session/auto-advance.ts`) checks "every EXISTING working set on this exercise is complete," not "every TARGET set is complete." After logging exactly one of a seeded 3-target exercise's working sets, that predicate is trivially true (one row exists, it's complete), so the pager immediately auto-advances to the next exercise. `workout-screen.spec.ts` (already on the dispatch's "known-failing, not yours to fix" list) logs one set and then asserts against "Mark set incomplete" expecting to still be on the same exercise's page — but the pager has already moved on, so it is asserting against the SECOND exercise's still-empty draft row, not a broken completion write. `session-notes.spec.ts` worked around this locally by re-selecting the first exercise's strip chip immediately after completing its set. Not fixed in the shared spec files (out of this plan's scope — 05-16's job per the dispatch); recorded as **WINDOWS #136**.

**The `pnpm -- ` forwarding quirk the dispatch warned about did occur** on the very first attempt (`pnpm --filter mobile test:e2e:durability -- e2e/session-notes.spec.ts` silently ran the entire `durability` project — 30 tests, 19 passed, 11 pre-existing failures, none from this plan's own file). Confirmed the correct scoped form (`pnpm --filter mobile test:e2e:durability e2e/session-notes.spec.ts`, no extra `--`) narrows to exactly 4 tests via `--list` before trusting any run's result.

**Selector ambiguity from `seedWorkoutSession`'s two seeded exercises both being present in the pager's accessibility tree** (`react-native-tab-view`'s `lazy={false}` default) required scoping every per-exercise-page locator in the new spec with `.first()`, and using the `textbox` role rather than `getByLabel('Note')` for the note field (which otherwise collided with the exercise action bar's own "Note" button). Confined entirely to the new spec file — no shared harness or component code needed a fix for this.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- LOG-16 is closed: all three note levels (set, exercise, session) are reachable from the live workout screen, each writes only its own column, and an empty note clears it — proven by both unit tests (`SetRow.test.tsx`, `session-query.test.ts`) and a real, registered, three-times-green browser spec.
- WINDOWS #109 (warm-up badge cosmetic gap) is closed: the badge now lives inside `SetRowView`, available to every consumer.
- WINDOWS #118 (LOG-16 blocked — only exercise-level note reachable) is closed.
- WINDOWS #134's `getPowerSync()`-default class of defect is now fixed for `NoteSheet.tsx` too (WINDOWS #135); only `WarmupSheet` and `ExercisePage`'s swap/remove handlers still share it, unexercised by any test in this plan or 05-12's — worth flagging for whichever future plan first browser-tests those paths.
- WINDOWS #136 (LOG-13 auto-advance fires one set too early) is newly recorded and likely explains the real root cause behind several of this phase's other "known-failing" e2e specs (`workout-screen.spec.ts` among them) — a lead for 05-16, not fixed here.

## Self-Check: PASSED

- FOUND: `apps/mobile/components/SetRow.tsx`
- FOUND: `apps/mobile/components/ExercisePage.tsx`
- FOUND: `apps/mobile/components/NoteSheet.tsx`
- FOUND: `apps/mobile/app/(tabs)/workout.tsx`
- FOUND: `apps/mobile/lib/db/session-query.ts`
- FOUND: `apps/mobile/lib/db/summary-query.ts`
- FOUND: `apps/mobile/lib/db/test-support.ts`
- FOUND: `apps/mobile/lib/session/set-row-builders.ts`
- FOUND: `apps/mobile/e2e/session-notes.spec.ts`
- FOUND: `apps/mobile/playwright.config.ts`
- FOUND: commit `6879d2d` (Task 1)
- FOUND: commit `69bd6aa` (Task 2)
- FOUND: commit `6cc3577` (Task 3)

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-26*
