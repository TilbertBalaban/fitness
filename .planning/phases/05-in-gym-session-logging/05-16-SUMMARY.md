---
phase: 05-in-gym-session-logging
plan: 16
subsystem: mobile-e2e
tags: [playwright, powersync, react-native-web, durability-harness, auto-advance, rest-timer, personal-records]

# Dependency graph
requires:
  - phase: 05-in-gym-session-logging
    provides: "05-11 through 05-15's nine pre-existing durability specs plus target-write-back.spec.ts (05-12), session-notes.spec.ts (05-14) and reorder-exercises.spec.ts (05-15) — all written and typechecked, none ever executed before this plan"
provides:
  - "The first real execution of the whole `durability` Playwright project (12 spec files, 33 cases) — closes 05-VERIFICATION.md's two behavior_unverified truths and its human_verification item"
  - "shouldAutoAdvance (lib/session/auto-advance.ts) fixed to compare against the exercise's prescribed target-set count, not merely how many logged_set rows currently exist (WINDOWS #136) — LOG-13's prior 'satisfied' verdict was wrong"
  - "loadLiveSession (lib/db/session-query.ts) fixed to recognize a paused session as still live, not only in_progress — a genuine, previously-undetected production bug (pausing silently dropped the user to the empty 'No active program' state)"
  - "workout.tsx's draft-value reset on set commit — a trailing draft row echoed the just-submitted set's weight/reps/rir instead of starting blank (D-16), the second genuine production bug this run found"
  - "WINDOWS #109/#116/#118/#123 closed against passing checks that would go red on regression, not on the strength of a code edit alone; #139 filed for a newly-discovered nested-button accessibility defect in ExercisePickerModal.tsx, out of this plan's file scope"
affects: [05-VERIFICATION, ROADMAP, phase-999.1-native-sweep]

# Actuals (#2632)
actuals:
  tokens: 24000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "shouldAutoAdvance's targetWorkingSets parameter: null/0 means 'no prescription, fall back to every-existing-row-complete' (an ad-hoc/one-off exercise); a positive number means 'wait for that many rows, all complete' — the same optional-with-fallback shape 05-12/05-14/05-15 already used for db-threading."
    - "Playwright fake-clock (`page.clock.install()`) races: a click whose onPress handler does real async DB work (IndexedDB/PowerSync writes) before scheduling/cancelling a timer must be followed by a short real-time `page.waitForTimeout(...)` before calling `page.clock.fastForward()` — click() resolves once the event dispatches, not once the handler's own await chain settles, and fastForward can run ahead of it. Same pattern applied at three call sites in this run (rest-timer.spec.ts x2, session-lifecycle.spec.ts x2)."
    - "A DOM-nesting button-inside-button (ExercisePickerModal.tsx's per-row Pressable wrapping ExerciseListRow's own Pressable) resolves to two sibling elements after browser parse-time repair; `page.locator('[aria-label=\"...\"]')` reaches the inner, explicitly-labelled one unambiguously where `getByRole('button', { name })` cannot."

key-files:
  created: []
  modified:
    - apps/mobile/lib/session/auto-advance.ts
    - apps/mobile/lib/session/__tests__/auto-advance.test.ts
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/lib/db/__tests__/session-query.test.ts
    - apps/mobile/e2e/rest-timer.spec.ts
    - apps/mobile/e2e/session-edit.spec.ts
    - apps/mobile/e2e/session-lifecycle.spec.ts
    - apps/mobile/e2e/session-notes.spec.ts
    - apps/mobile/e2e/workout-screen.spec.ts
    - apps/mobile/e2e/workout-summary.spec.ts
    - .planning/WINDOWS.md

key-decisions:
  - "shouldAutoAdvance's fix is a required new parameter (targetWorkingSets), not an optional one defaulting to the old behavior — forcing both call sites in workout.tsx to reason about it explicitly, rather than silently keeping the bug for anyone who forgot to pass it."
  - "Fixed the getPowerSync()-adjacent draft-reset bug and the loadLiveSession status-filter bug at their source (lib files) rather than working around them in the specs — Rule 1 (auto-fix bugs), matching this plan's own explicit instruction not to re-shape specs to match buggy behavior."
  - "workout-summary.spec.ts's correction case was retyped from 80kg to 30kg: 80kg x 12 reps still beats the 90kg x 5 prior on set volume (960 > 450), so the old assertion ('New PR count 0') was actually asserting against a case that should NOT go fully green — it was itself wrong, not the app. 30kg x 12 (volume 360 < 450) is genuinely below the prior on every PR_TYPES dimension."
  - "Filed WINDOWS #139 rather than fixing ExercisePickerModal.tsx's nested-Pressable defect in place — it is a real accessibility issue (two interactive elements with overlapping accessible names) but sits outside every file this plan's Task 2 was scoped to touch, and fixing it would mean redesigning the picker row's press/selection affordance, not a one-line change."
  - "Did not touch the WarmupSheet/swap-path getPowerSync()-default gaps flagged by 05-12/05-15 (WINDOWS #135/#138's own notes) — no case in the full durability run exercises either path, so there is nothing here to prove the fix against; left for whichever future plan first browser-tests them."

requirements-completed: [LOG-14, LOG-15, LOG-16]

coverage:
  - id: D1
    description: "The full `durability` Playwright project (12 spec files, 33 test cases) has been executed, not merely written/typechecked, and passes: exit code 0, 0 failed, 0 skipped, confirmed across two consecutive clean full-suite runs."
    verification:
      - kind: e2e
        ref: "pnpm --filter mobile test:e2e:durability — 33 passed (1.3m), run twice consecutively with 0 failures both times"
        status: pass
    human_judgment: false
  - id: D2
    description: "SC4 is proven by execution: durability.spec.ts's 'force-quitting mid-workout with warm-ups logged and a pause open loses nothing on reopen' case passes against a real @powersync/web database in a real browser."
    verification:
      - kind: e2e
        ref: "e2e/durability.spec.ts:219 — 'force-quitting mid-workout with warm-ups logged and a pause open loses nothing on reopen'"
        status: pass
    human_judgment: false
  - id: D3
    description: "shouldAutoAdvance fires only once every prescribed working set is logged and complete, not merely once every currently-existing row is complete (WINDOWS #136) — LOG-13's prior unit-test-based 'satisfied' verdict encoded the same wrong assumption as the implementation and is now corrected."
    verification:
      - kind: unit
        ref: "lib/session/__tests__/auto-advance.test.ts — 'is null after the first of three prescribed working sets, even though the one existing row is complete', 'returns the next index only once the prescribed set count is reached and every row is complete', 'falls back to \"every existing working set complete\" for an ad-hoc exercise with no target (null/0)'"
        status: pass
      - kind: e2e
        ref: "e2e/rest-timer.spec.ts (all 5 cases, gated on completeFirstSet staying on the same exercise page after 1 of 3 sets), e2e/workout-screen.spec.ts:34"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pausing a live session no longer drops it out of loadLiveSession's view — a paused session is still recognized as the live session, matching D-29's status-transition model."
    verification:
      - kind: unit
        ref: "lib/db/__tests__/session-query.test.ts — 'finds a paused session, not only an in_progress one', 'ignores a completed or discarded session — only in_progress/paused count as live'"
        status: pass
      - kind: e2e
        ref: "e2e/session-lifecycle.spec.ts:41 — 'pausing freezes the header duration readout and resuming restarts it without losing time'"
        status: pass
    human_judgment: false
  - id: D5
    description: "WINDOWS #109, #116, #118, #123 are marked fixed only against a passing automated check that would go red on regression; #110/#112/#129/#131 remain open, byte-unchanged, deferred to ROADMAP Phase 999.1 or a later finding; #139 is filed for the newly-discovered ExercisePickerModal.tsx nested-button defect."
    verification:
      - kind: other
        ref: ".planning/WINDOWS.md — header counters open_count:113/fixed_count:22/total_count:136 after this run; `grep -E '^\\| (109|116|118|123) ' .planning/WINDOWS.md | grep -c '| open |'` returns 0"
        status: pass
    human_judgment: false

duration: ~3h
completed: 2026-08-26
status: complete
---

# Phase 05 Plan 16: Durability Suite Execution and Gap Closure Summary

**First real execution of all 33 durability cases across 12 spec files — found and fixed two genuine production bugs (LOG-13's auto-advance firing two sets early, and pausing silently dropping the live session) plus a set of test-only races and selector ambiguities, closing SC4 and both of 05-VERIFICATION.md's `behavior_unverified` truths.**

## Performance

- **Duration:** ~3h
- **Tasks:** 3
- **Files modified:** 12 (10 source/spec files + WINDOWS.md, across 6 commits)

## Accomplishments

- Ran the whole `durability` Playwright project for the first time ever (it was written across 05-01 through 05-15 but never executed, per the project's prior browser-testing-only-on-request rule) — baseline: 33 tests, 22 passed, 11 failed.
- Diagnosed and fixed at source: `shouldAutoAdvance`'s LOG-13 bug (WINDOWS #136) — it fired after the first of N prescribed working sets instead of the last, because it compared against however many `logged_set` rows happened to exist rather than the exercise's own `target_sets`. This was the root cause of all 5 `rest-timer.spec.ts` failures and one of `workout-screen.spec.ts`'s two.
- Found and fixed a second, previously-undetected production bug while chasing the first: `loadLiveSession` filtered `workout_session` by `status = 'in_progress'` only, so pausing a session made it invisible and the screen fell back to the "No active program" empty state.
- Found and fixed a third: completing a set through the trailing draft row left `draftValuesByExercise` holding the just-submitted values, so the next draft row for that exercise echoed the previous set's weight/reps/rir instead of starting blank (D-16).
- Fixed four genuine test-only defects (ambiguous "Done"/"Weight, set field" locators once two rows legitimately coexist, a stale `/^Rest, /` label match once the countdown legitimately reaches zero, a picker virtualization + nested-button issue, and a PR-badge scenario that was asserting an incorrect expectation).
- Fixed four genuine timing races between a Playwright `.click()` (which resolves on event dispatch) and the async handler's own real IndexedDB writes racing `page.clock.fastForward()` — two in `rest-timer.spec.ts`, two in `session-lifecycle.spec.ts`.
- Closed WINDOWS #109, #116, #118, #123 against passing checks; filed #139 for a newly-discovered accessibility defect out of this plan's scope.
- Confirmed stable: two consecutive full-suite runs, 33/33 passed both times, 0 skipped, exit code 0.

## Task Commits

1. **Task 1: Run the full durability project and triage the result honestly** — no commit (this task modifies no source file by design; its only product is the triage recorded below).
2. **Task 2: Fix what genuinely fails and re-run to green** — four commits:
   - `e9d5ab8` fix(05-16): key auto-advance on the prescribed set count, not existing rows
   - `4644593` fix(05-16): thread target set count into auto-advance and reset the draft on commit
   - `a132fe8` fix(05-16): loadLiveSession recognizes a paused session as still live
   - `07b0956` test(05-16): fix durability spec races, selector ambiguity, and PR scenario
3. **Task 3: Close the ledger against what was actually proven** — `e252993` docs(05-16): close WINDOWS #109/#116/#118/#123 against passing checks

**Plan metadata:** (final commit, appended after this SUMMARY)

## Task 1: The honest baseline (verbatim, no source touched)

Ran `pnpm --filter mobile test:e2e:durability` from repo root. Final line: **`11 failed / 22 passed`** (33 total), exit code 1. `git status --porcelain apps/mobile/e2e apps/mobile/lib apps/mobile/components apps/mobile/app` was empty at the end of this task, confirming nothing was fixed here.

Per-spec baseline (12 files, 33 cases):

| Spec file | Cases | Passed | Failed |
|---|---|---|---|
| durability.spec.ts | 3 | 3 | 0 |
| history.spec.ts | 1 | 1 | 0 |
| catalog-load.spec.ts | 1 | 1 | 0 |
| reorder-exercises.spec.ts | 3 | 3 | 0 |
| schema-redefinition.spec.ts | 4 | 4 | 0 |
| target-write-back.spec.ts | 3 | 3 | 0 |
| session-notes.spec.ts | 4 | 4 | 0 |
| rest-timer.spec.ts | 5 | 0 | 5 |
| session-edit.spec.ts | 2 | 0 | 2 |
| session-lifecycle.spec.ts | 4 | 3 | 1 |
| workout-summary.spec.ts | 1 | 0 | 1 |
| workout-screen.spec.ts | 2 | 0 | 2 |

Bucket assignment for the 11 baseline failures (per the plan's own a/b/c/d taxonomy):

- **rest-timer.spec.ts x5 — bucket (b) production defect.** All 5 share the `completeFirstSet` helper, which failed identically at "Mark set incomplete" not becoming visible after completing 1 of the exercise's 3 prescribed sets. Root cause: `shouldAutoAdvance` (WINDOWS #136, diagnosed but left unfixed by 05-14) fired after the first existing row, swiping the pager away before the test's next assertion.
- **workout-screen.spec.ts:34 — bucket (b), same root cause as above.**
- **session-lifecycle.spec.ts:41 ("pausing...") — bucket (b) production defect.** `loadLiveSession`'s `status = 'in_progress'` filter excluded a paused session outright.
- **session-edit.spec.ts x2 — bucket (a) spec defect.** `getByRole('button', { name: 'Done' })` is ambiguous once both EditingWorkoutScreen's persistent header "Done" and NumericKeypad's rir-submit "Done" are visible at once — a real, unrelated-to-behavior locator collision.
- **workout-summary.spec.ts:47 — bucket (a) spec defect (mixed).** The first assertion assumed exactly one "New PR" badge; a 100kg x 12 set beating a 90kg x 5 prior genuinely trips two PR_TYPES (heaviest_weight, best_set_volume) at once by design. The correction-removes-it assertion used a target weight (80kg) whose volume (960) still beat the prior's (450) — the assertion's own premise was wrong, not the app.
- **workout-screen.spec.ts:112 ("adding an exercise...") — bucket (a) spec defect.** The picker's FlashList never scrolls an alphabetically-late catalog row into view without a search query; separately, the row's own accessible-name lookup resolved ambiguously due to a real nested-button DOM structure (filed as WINDOWS #139, not fixed — out of this plan's file scope).

No bucket (c) cross-spec interference or bucket (d) environment failures were present in the baseline — every failure was attributable to a real cause on the first pass.

## Task 2: Fixes, by bucket

**(b) Production defects fixed at source, each with a regression test that fails without the fix:**

1. **`shouldAutoAdvance` (lib/session/auto-advance.ts)** — added a required `targetWorkingSets` parameter; the predicate now requires `workingSets.length >= targetWorkingSets` (falling back to "every existing row complete" only when there is no prescription). Regression tests: `lib/session/__tests__/auto-advance.test.ts` — "is null after the first of three prescribed working sets, even though the one existing row is complete" and "returns the next index only once the prescribed set count is reached and every row is complete" (both fail against the pre-fix implementation). **This corrects LOG-13's prior ✓ SATISFIED verdict in 05-VERIFICATION.md — that verdict rested on unit tests that encoded the same wrong "every existing row" assumption as the buggy implementation, so they agreed with each other and were both wrong.**
2. **`loadLiveSession` (lib/db/session-query.ts)** — filters `workout_session.status` with `inArray([IN_PROGRESS_STATUS, PAUSED_STATUS])` instead of `eq(status, 'in_progress')`. Regression tests: `lib/db/__tests__/session-query.test.ts` — "finds a paused session, not only an in_progress one" and "ignores a completed or discarded session — only in_progress/paused count as live" (the fake db's `collectConditions`/`rowMatches` helper was extended to actually evaluate `inArray()` membership rather than matching every row unconditionally, so these tests genuinely fail without the fix).
3. **Draft-value reset on commit (app/(tabs)/workout.tsx)** — `handleCheckmarkPress`'s draft-commit branch now resets `draftValuesByExercise[exercise.id]` to `defaultDraftValues(exercise)` immediately after a successful `logSet`. Regression proof: `e2e/workout-screen.spec.ts:34`'s new assertions (`.not.toContainText('100')` / `.toContainText('No previous')` on the trailing draft's own weight field, both immediately after commit and after a real page reload) — this codebase's own established convention for `useWorkoutScreen` is that its regression coverage is the e2e durability suite, not a Jest unit test, per the hook's own doc comment ("the real WorkoutScreenView, driven by real DOM clicks in a real browser, is what workout-screen.spec.ts proves (D-01)").

**(a) Spec defects fixed without changing assertion strength:**

- `session-edit.spec.ts` x2: scoped the ambiguous "Done" click to `page.locator('button[aria-label="Done"]')` (only NumericKeypad's own button carries that attribute).
- `workout-screen.spec.ts:34`: scoped "Weight/Reps/RIR, set field" assertions to `.first()` once a completed row and its own trailing draft legitimately coexist.
- `workout-screen.spec.ts:112`: added a search-field fill before asserting the target catalog row visible (FlashList virtualization), and switched to an `aria-label` attribute selector for the row itself (filed the underlying nested-button structure as WINDOWS #139).
- `workout-summary.spec.ts:47`: `.first()` on the initial "New PR" assertion (two genuine badges); retyped the correction target from 80kg to 30kg so every `PR_TYPES` dimension (weight, e1rm — null either way since reps=12 exceeds `E1RM_MAX_VALID_REPS=10`, untested-weight reps bucket, and set volume) genuinely drops below the 90kg x 5 prior.
- `rest-timer.spec.ts` "+30s...": logs a second working set (target is 3) to get a fresh, non-expired rest countdown for the Skip Rest check, since the prior countdown had already legitimately reached zero (RestTimerFullScreenView hides Skip Rest/+30s once `atZero`, by design); matched both the active (`/^Rest, /`) and dormant (`/^Rest/`) bar labels depending on countdown state.
- `rest-timer.spec.ts` "+30s..." and "undoing the completed set...", `session-lifecycle.spec.ts` "pausing..." and "finishing the workout...": added a short deterministic wait (or, for "finishing", waited on the resulting navigation) between a click whose `onPress` handler does real async DB work and the test's own subsequent `page.clock.fastForward()` / DB read — `click()` resolves on event dispatch, not once the handler's promise chain settles, so advancing the fake clock or reading the DB immediately after can race ahead of the handler's own writes. Diagnosed by adding temporary debug instrumentation (a scratch spec file plus console logging in `rest-alert.web.ts`), confirmed the exact race, then reverted all debug scaffolding before committing the real fix.

**Fix rounds:** reaching a stable green run took repeated full-suite re-executions (one run was invalidated by transient system load unrelated to any code change — 14 failures that all cleared on an immediate re-run with no code touched in between). After the four fixes above landed, two **consecutive** clean runs confirmed stability: **33 passed, 0 failed (1.3m)**, exit code 0, both times.

**Verbatim final result** (most recent run): `Running 33 tests using 4 workers ... 33 passed (1.3m)`.

`pnpm --filter mobile test` — 76 suites, 1322 tests, all passed. `pnpm --filter mobile typecheck` — clean, no errors.

`grep -rc "test.skip\|test.fixme\|\.only(" apps/mobile/e2e/*.spec.ts` returns 0 for every file. `grep -c "retries" apps/mobile/playwright.config.ts` returns 1, value still `0`.

## Files Created/Modified

- `apps/mobile/lib/session/auto-advance.ts` — `targetWorkingSets` parameter, fixes WINDOWS #136
- `apps/mobile/lib/session/__tests__/auto-advance.test.ts` — regression cases for the fix, all existing cases updated for the new required parameter
- `apps/mobile/app/(tabs)/workout.tsx` — threads `exercise.targetSets` into both `shouldAutoAdvance` call sites; resets the trailing draft's values on successful commit
- `apps/mobile/lib/db/session-query.ts` — `loadLiveSession` recognizes `paused` as still-live
- `apps/mobile/lib/db/__tests__/session-query.test.ts` — regression cases; extended the fake db harness to evaluate `inArray()` for real
- `apps/mobile/e2e/rest-timer.spec.ts` — fixed two races, a stale-label match, and added a helper to mint a fresh countdown for the Skip Rest case
- `apps/mobile/e2e/session-edit.spec.ts` — disambiguated the "Done" locator in two places
- `apps/mobile/e2e/session-lifecycle.spec.ts` — fixed two races (rounding-to-zero, navigation-vs-read)
- `apps/mobile/e2e/session-notes.spec.ts` — updated a comment that described WINDOWS #136 as an active bug after the fix landed
- `apps/mobile/e2e/workout-screen.spec.ts` — `.first()` scoping, draft-reset regression assertions, search-then-attribute-selector fix for the picker
- `apps/mobile/e2e/workout-summary.spec.ts` — `.first()` scoping, retyped correction target to 30kg
- `.planning/WINDOWS.md` — #109/#116/#118/#123 marked fixed; #139 filed

## Decisions Made

See `key-decisions` in the frontmatter above — summarized: fixed genuine bugs at source rather than reshaping specs to match them; made the auto-advance fix's new parameter required rather than silently-defaulted; corrected a spec's own wrong premise (80kg still tripped a genuine PR) rather than loosening its assertion; filed rather than fixed the out-of-scope nested-button defect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `shouldAutoAdvance` fired two sets early on any multi-set exercise (WINDOWS #136)**
- **Found during:** Task 1 triage (already diagnosed but left unfixed by 05-14)
- **Issue:** Compared "every EXISTING working-set row" instead of "every PRESCRIBED working set" — trivially true after logging just the first of N.
- **Fix:** Added `targetWorkingSets`, required at both call sites.
- **Files modified:** `apps/mobile/lib/session/auto-advance.ts`, `apps/mobile/lib/session/__tests__/auto-advance.test.ts`, `apps/mobile/app/(tabs)/workout.tsx`
- **Verification:** New unit cases fail pre-fix, pass post-fix; all 5 `rest-timer.spec.ts` cases plus `workout-screen.spec.ts:34` now pass.
- **Committed in:** `e9d5ab8`, `4644593`

**2. [Rule 1 - Bug] Pausing a live session made it invisible to `loadLiveSession`**
- **Found during:** Task 2, chasing `session-lifecycle.spec.ts`'s "pausing..." failure
- **Issue:** `status = 'in_progress'` filter excluded `paused`, a status D-29 explicitly documents as still-live.
- **Fix:** `inArray(status, [IN_PROGRESS_STATUS, PAUSED_STATUS])`.
- **Files modified:** `apps/mobile/lib/db/session-query.ts`, `apps/mobile/lib/db/__tests__/session-query.test.ts`
- **Verification:** New unit cases fail pre-fix, pass post-fix; `session-lifecycle.spec.ts:41` now passes.
- **Committed in:** `a132fe8`

**3. [Rule 1 - Bug] Trailing draft row echoed the just-submitted set instead of starting blank**
- **Found during:** Task 2, after fixing #1 exposed the previously-unreachable second-row rendering
- **Issue:** `draftValuesByExercise[exercise.id]` was never reset after a successful commit (D-16 requires a blank weight on a fresh draft).
- **Fix:** Reset to `defaultDraftValues(exercise)` immediately after commit.
- **Files modified:** `apps/mobile/app/(tabs)/workout.tsx`
- **Verification:** `workout-screen.spec.ts:34`'s new draft-blank assertions (immediate and post-reload) fail pre-fix, pass post-fix.
- **Committed in:** `4644593`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — genuine bugs, not scope additions). **Impact on plan:** All three were required for the durability suite to pass honestly; none is scope creep — each was discovered strictly by running specs already in this plan's declared file scope.

## Issues Encountered

- **Transient environment flake:** one full-suite run reported 14 failures across specs that had passed cleanly moments before and passed cleanly again on immediate re-run with zero code changes in between — attributed to system load from four parallel Playwright workers plus several manual single-spec `npx playwright test` invocations run back-to-back during diagnosis. Not counted as a real fix round; excluded from the bucket triage.
- **Async-race class of test defect:** four separate cases (two in `rest-timer.spec.ts`, two in `session-lifecycle.spec.ts`) had `page.click()` immediately followed by either `page.clock.fastForward()` or a DB read, racing the click's own `onPress` handler (which does real, awaited IndexedDB writes before scheduling a timer or navigating). Diagnosed by temporarily adding a scratch debug spec file and console logging inside `lib/rest-alert.web.ts` (both fully reverted — confirmed via `git status`/`git diff` before committing) to observe the actual call sequence and timestamps, which showed the fake clock's `Date.now()` had already advanced past a target the handler hadn't yet cancelled. Fixed with either a short deterministic `page.waitForTimeout(...)` or a wait on the resulting observable state change.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `05-VERIFICATION.md`'s two `behavior_unverified` truths and its `human_verification` "run the full durability project" item are now satisfied by a recorded, repeated green run — no human action needed for those.
- Out of scope, explicitly deferred to ROADMAP Phase 999.1 (unchanged by this plan, per its own out-of-scope section): the `sync` Playwright project (needs a PowerSync Service restart, WINDOWS #112), and everything needing a real iOS/Android device or simulator (SC3's real-device rest-timer clause, notification-permission-denied degrade UX, two-tap/keypad-overlay feel check, WINDOWS #110/#129). WINDOWS #131 (deliberately-skipped unique constraint) also stays open and unchanged.
- WINDOWS #135 (NoteSheet db-threading), #137 (DragHandle rowHeight), #138 (ExercisePage swap-path db gap), and the newly-filed #139 (ExercisePickerModal nested button) remain open — none is blocking, each documents a real, scoped gap for a future plan that touches its file.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-26*

## Self-Check: PASSED

All 14 referenced files confirmed present on disk; all 5 task commit hashes (`e9d5ab8`, `4644593`, `a132fe8`, `07b0956`, `e252993`) confirmed present in `git log --oneline --all`.
