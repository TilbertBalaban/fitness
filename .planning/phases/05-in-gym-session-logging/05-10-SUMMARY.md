---
phase: 05-in-gym-session-logging
plan: 10
subsystem: ui
tags: [react-native, expo-router, drizzle-orm, powersync, session-editing]

requires:
  - phase: 05-in-gym-session-logging
    provides: startSession/addSessionExercise funnel and captureCalendarDay stamping (05-01, log-set.ts), SessionScreenMode union (05-01), live workout screen + rest/auto-advance machinery (05-05/05-06/05-07), History tab and HISTORY_ROW_ACTIONS (05-09)
provides:
  - setSessionDate — the single deliberate exception to D-06's stamp-once rule (log-set.ts)
  - resolveSessionScreenMode — the ONE place SessionScreenMode is decided (session-mode.tsx)
  - EditingWorkoutScreen.tsx — the `editing` subtree as its own module, physically free of scheduleRestAlert/shouldAutoAdvance
  - SessionDateField / SessionDateFieldView / formatEditingHeader
  - startBackfilledSession — D-33's third session-creation funnel entry point (history.tsx)
  - HISTORY_ROW_ACTIONS Edit entry, the add-a-past-workout two-step wizard
affects: [phase-999.1 (native date-picker/font-scale sweep, unrun session-edit.spec.ts), phase-8 (progression-engine's treatment of backfilled sessions — explicitly out of scope here)]

actuals:
  tokens: 30000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Route-level mode split: the workout screen's default export selects between two sibling components (LiveWorkoutRoute / EditingWorkoutRoute) based on a route param, each mounting its own hooks unconditionally — never one component conditionally calling different hooks (rules of hooks) and never an inline session.status check in the route file itself."
    - "Shared pure logic extracted to a leaf module (lib/session/set-row-builders.ts) that both the live and editing subtrees import, rather than one subtree file importing the other — avoids a route<->component circular dependency while still eliminating duplication."
    - "A hand-rolled, dependency-free month-grid date picker (SessionDateField) instead of a third-party date-picker library, consistent with NumericKeypad's own precedent of building custom input surfaces rather than reaching for a native picker."

key-files:
  created:
    - apps/mobile/components/SessionDateField.tsx
    - apps/mobile/components/EditingWorkoutScreen.tsx
    - apps/mobile/lib/session/set-row-builders.ts
    - apps/mobile/e2e/session-edit.spec.ts
    - apps/mobile/components/__tests__/SessionDateField.test.tsx
    - apps/mobile/components/__tests__/EditingWorkoutScreen.test.tsx
    - apps/mobile/components/__tests__/HistoryActionSheet.test.tsx
    - apps/mobile/lib/session/__tests__/session-mode.test.tsx
  modified:
    - apps/mobile/lib/db/log-set.ts
    - apps/mobile/lib/session/session-mode.tsx
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/history.tsx
    - apps/mobile/components/HistoryActionSheet.tsx
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/lib/db/preferences.ts
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/playwright.config.ts
    - apps/mobile/app/(tabs)/__tests__/workout.test.tsx
    - apps/mobile/app/(tabs)/__tests__/history.test.tsx

key-decisions:
  - "The editing subtree lives in its own file (components/EditingWorkoutScreen.tsx), not a branch inside workout.tsx — required so the plan's own grep-based acceptance criterion ('the editing subtree's module imports neither scheduleRestAlert nor shouldAutoAdvance') is mechanically checkable against a real file boundary, not just a function boundary inside a file that also imports both. workout.tsx's files_modified entry stays true (it is modified — to render the new component), and no plan file was skipped."
  - "A freshly backfilled session is completed immediately (startBackfilledSession calls completeSession right after setSessionDate), not left in_progress. resolveSessionScreenMode treats in_progress/paused as live — an in_progress backfilled session would have bounced straight to the live screen instead of opening in editing mode, defeating the entry point's whole purpose. Not written explicitly in the plan's Task 3 prose; added as a Rule 1 fix once the resolveSessionScreenMode/startBackfilledSession interaction was traced through."
  - "resolveSessionScreenMode is genuinely wired into the runtime (called inside EditingWorkoutScreen.tsx's reload, with a router.replace fallback to the live route if it ever resolves 'live' for a routed sessionId), not left as a pure function only exercised by its own unit tests — matches the plan's 'the ONE place the mode is decided' framing literally rather than letting workout.tsx's route-param presence alone stand in for it unchecked."
  - "buildSetRows/defaultDraftValues/stepAmountFor/ExercisePageData were extracted into a new shared lib/session/set-row-builders.ts rather than importing them from workout.tsx into EditingWorkoutScreen.tsx (or vice versa) — the latter would create a route<->component circular import. workout.tsx re-exports the same names so its own existing test file's imports needed zero changes to their import statements."
  - "The add-a-past-workout entry point is a two-step wizard (SessionDateField, then the unmodified ExercisePickerModal) built directly into history.tsx, replacing 05-09's placeholder addPast=1 query-flag route (documented in that plan's own SUMMARY as the flag 05-10 was expected to consume) — the plan's literal Task 3 text specifies this wizard shape, which the flag mechanism could not have implemented on its own."

patterns-established:
  - "Route root selects between two sibling components based on a resolved mode, never a single component with conditional hook calls — the pattern this plan establishes for workout.tsx and any future third SessionScreenMode value (summary-correction, already reserved in the union)."

requirements-completed: [LOG-20, LOG-21]

coverage:
  - id: D1
    description: "setSessionDate rewrites started_at, timezone and local_date together through captureCalendarDay, is the only other write site besides startSession, and startSession itself gained no date-override parameter"
    requirement: "LOG-21"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts#setSessionDate — the single deliberate exception to D-06"
        status: pass
    human_judgment: false
  - id: D2
    description: "SessionDateField presents the session's current date, opens a self-contained month-grid picker, and formatEditingHeader renders the exact 'Editing {Weekday, Month D}' string with no numberOfLines anywhere"
    requirement: "LOG-21"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SessionDateField.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "resolveSessionScreenMode is the ONE place SessionScreenMode is decided, covering all four cases (in-progress with/without route param, completed and discarded named by a route param)"
    requirement: "LOG-20"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/session-mode.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "The editing subtree (EditingWorkoutScreen.tsx) renders the formatEditingHeader line, SessionDateField, no RestTimerBar, and a Done primary action — never Finish Workout — and imports neither scheduleRestAlert nor shouldAutoAdvance anywhere in the file"
    requirement: "LOG-20"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/EditingWorkoutScreen.test.tsx"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' apps/mobile/components/EditingWorkoutScreen.tsx | grep -cE 'scheduleRestAlert|shouldAutoAdvance' → 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "workout.tsx's root selects between LiveWorkoutRoute and EditingWorkoutRoute with no inline session.status/session.endedAt check of its own; the existing live rendering (RestTimerBar, Finish Workout) is unchanged"
    requirement: "LOG-20"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx (unchanged live-mode assertions, still passing)"
        status: pass
      - kind: other
        ref: "grep -n 'session\\.status ===' and 'session\\.endedAt' apps/mobile/app/(tabs)/workout.tsx → no match"
        status: pass
    human_judgment: false
  - id: D6
    description: "HISTORY_ROW_ACTIONS has exactly five entries (View, Edit, Rename, Duplicate, Delete); Edit navigates to the workout route carrying the session id"
    requirement: "LOG-20"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/HistoryActionSheet.test.tsx"
        status: pass
    human_judgment: false
  - id: D7
    description: "startBackfilledSession funnels through the same startSession call the other two creation paths use, then setSessionDate, then addSessionExercise per selected exercise — completed immediately so it opens in editing mode; the add-a-past-workout entry point is reachable from both the populated History screen (new top-level action) and the empty state (05-09's existing affordance)"
    requirement: "LOG-21"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/history.test.tsx"
        status: pass
    human_judgment: false
  - id: D8
    description: "End-to-end: opening a completed session via Edit shows no live-session DOM, a keypad edit to a logged set persists across reload, changing the date moves the History row, add-a-past-workout lands the session on the chosen day, and resolveNextUp stays coherent after a backfill"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/session-edit.spec.ts (unrun — browser-testing-only-on-request; WINDOWS #128)"
        status: unknown
    human_judgment: true
    rationale: "CLAUDE.md forbids launching a browser this session; the spec is written, typechecks, and follows the established __durability harness pattern, but was not executed. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- session-edit.spec.ts."

duration: ~55min
completed: 2026-08-25
status: complete
---

# Phase 5 Plan 10: Edit and Backfill a Past Workout Summary

**A past workout opens in the same live screen's `editing` mode — live-session machinery physically absent from a separate module, not merely switched off — and a workout done before the app existed can be added and dated through a two-step History wizard, all funneled through one `startSession` and one `setSessionDate`.**

## Performance

- **Duration:** ~55 min (approximate — no exact start timestamp captured before reading began)
- **Completed:** 2026-08-25T06:54:00Z
- **Tasks:** 3
- **Files modified:** 22 (8 created, 14 modified — including test files and the two supporting infrastructure files, __durability.web.tsx and test-support.ts, extended to make the e2e spec possible)

## Accomplishments
- `setSessionDate` (log-set.ts) is the single deliberate exception to D-06's stamp-once rule: it rewrites `started_at`, `timezone` and `local_date` together, through the same `captureCalendarDay` derivation `startSession` uses, and the comment above `startSession` now states the exception instead of contradicting it.
- `resolveSessionScreenMode` (session-mode.tsx) is the one place `SessionScreenMode` is decided — pure, directly tested against all four cases named in the plan, and genuinely wired into the runtime (not just unit-tested in isolation).
- The `editing` subtree is `EditingWorkoutScreen.tsx`, a physically separate module from `workout.tsx`: it imports neither `scheduleRestAlert` nor `shouldAutoAdvance` anywhere in the file (grep-verified, 0 occurrences), replaces the header timer bar entirely with `formatEditingHeader` + `SessionDateField`, and its primary action reads Done, never Finish Workout.
- `workout.tsx`'s root now selects between `LiveWorkoutRoute` and `EditingWorkoutRoute` based on a `sessionId` route param, with no inline `session.status`/`session.endedAt` check anywhere in the file — the existing live behaviour and its whole test suite are unchanged.
- History's Edit action (5th action, appended to `HISTORY_ROW_ACTIONS`: View, Edit, Rename, Duplicate, Delete) opens a completed session in editing mode; a new two-step add-a-past-workout wizard (date, then exercises) is reachable from both the populated History screen and the empty state, and funnels through `startBackfilledSession` — the third and last D-33 session-creation entry point.

## Task Commits

Each task was committed atomically:

1. **Task 1: setSessionDate — the one function allowed to rewrite a session's calendar day** - `8564e5a` (feat)
2. **Task 2: Editing mode — the live machinery made unreachable, not merely inactive** - `8cb0cb1` (feat)
3. **Task 3: Edit and add-a-past-workout from History, end to end** - `187df7c` (feat)

_No separate plan-metadata commit — worktree mode excludes STATE.md/ROADMAP.md; this SUMMARY and WINDOWS.md are committed together below._

## Files Created/Modified
- `apps/mobile/lib/db/log-set.ts` - `setSessionDate`, updated `startSession` comment
- `apps/mobile/components/SessionDateField.tsx` - `SessionDateFieldView`, `SessionDateField`, `formatEditingHeader`
- `apps/mobile/lib/session/session-mode.tsx` - `resolveSessionScreenMode`
- `apps/mobile/lib/session/set-row-builders.ts` - `buildSetRows`/`defaultDraftValues`/`stepAmountFor`/`ExercisePageData` extracted from workout.tsx, shared by both subtrees
- `apps/mobile/components/EditingWorkoutScreen.tsx` - the `editing` subtree: `EditingWorkoutScreenView`, `useEditingWorkoutScreen`, `EditingWorkoutRoute`
- `apps/mobile/app/(tabs)/workout.tsx` - root mode selection (`LiveWorkoutRoute`/`EditingWorkoutRoute`), re-exports from set-row-builders.ts
- `apps/mobile/app/(tabs)/history.tsx` - `startBackfilledSession`, Edit action wiring, add-a-past-workout wizard
- `apps/mobile/components/HistoryActionSheet.tsx` - `HISTORY_ROW_ACTIONS` Edit entry
- `apps/mobile/app/__durability.web.tsx` - harness methods for `setSessionDate`/`startBackfilledSession`/`openEditWorkoutScreen`/`resolveNextUpKind`
- `apps/mobile/lib/db/session-query.ts` - `loadSessionTree`'s projection extended with `timezone`/`localDate`
- `apps/mobile/lib/db/preferences.ts` - shared `loadWeightUnit`
- `apps/mobile/lib/db/test-support.ts` - `readWorkoutSessionRaw` projection extended with `timezone`/`local_date`
- `apps/mobile/playwright.config.ts` - registered `session-edit.spec.ts` in the `durability` project
- `apps/mobile/e2e/session-edit.spec.ts` - the five plan cases, against the real `@powersync/web` engine (written, not executed)

## Decisions Made
- The editing subtree lives in its own file rather than a branch inside `workout.tsx`, so the plan's own grep-based acceptance criterion is checkable against a real module boundary.
- A freshly backfilled session is completed immediately (not left `in_progress`) so it resolves to `editing` mode the instant the user lands on it — an undocumented but necessary consequence of wiring `resolveSessionScreenMode` for real, not just testing it in isolation.
- `resolveSessionScreenMode` is called from `EditingWorkoutScreen.tsx`'s own load path (with a `router.replace` fallback to the live route on the rare edge case it resolves `'live'`), matching "the ONE place the mode is decided" literally.
- Shared pure set-row logic moved to `lib/session/set-row-builders.ts` to avoid a route↔component circular import between `workout.tsx` and `EditingWorkoutScreen.tsx`; `workout.tsx` re-exports the same names so its own test file needed no import changes.
- The add-a-past-workout entry point replaces 05-09's placeholder `addPast=1` route flag with the two-step wizard the plan's Task 3 text specifies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] A freshly backfilled session must complete immediately, or it opens in `live` mode instead of `editing`**
- **Found during:** Task 3 (wiring `startBackfilledSession`)
- **Issue:** The plan's Task 3 action text describes `startBackfilledSession` as `startSession` → `setSessionDate` → `addSessionExercise` per exercise, with no mention of `completeSession`. `startSession` always creates a row with `status: 'in_progress'`. Since `resolveSessionScreenMode` treats `in_progress`/`paused` as `'live'`, navigating straight into the workout route after a bare `startSession`+`setSessionDate` would have resolved to `'live'` mode — the freshly backfilled session would open as if it were a currently-running workout, with the header timer bar, rest scheduling and auto-advance all active, exactly the confusion D-32 exists to prevent.
- **Fix:** `startBackfilledSession` now calls `completeSession(sessionId, date, db)` immediately after `setSessionDate`, before adding exercises. The session is `status: 'completed'` by the time the screen resolves its mode, so it opens in `editing` as the plan's own prose describes ("navigates straight into the editing screen with the date already chosen").
- **Files modified:** `apps/mobile/app/(tabs)/history.tsx`
- **Verification:** `apps/mobile/e2e/session-edit.spec.ts`'s case 4 asserts `backfilled?.status === 'completed'`; the unit-level contract is implicit in `resolveSessionScreenMode`'s own tested predicate.
- **Committed in:** `187df7c` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — a necessary correction to make the plan's own two mechanisms, `startBackfilledSession` and `resolveSessionScreenMode`, agree with each other)
**Impact on plan:** No scope creep — the fix is the minimum change needed for the entry point the plan describes ("navigates straight into the editing screen") to actually behave that way at runtime.

## Known Exceptions to Stated Invariants

- **D-33's single-funnel claim ("exactly one `insert(workoutSession)` in `apps/mobile/lib/db/`") is true for production code but not for the whole `apps/mobile/` tree.** `apps/mobile/lib/db/log-set.ts`'s `startSession` is the only real creation path (verified: a scan of `apps/mobile/lib/db/` for `insert(workoutSession)` returns exactly one match there). A pre-existing, test-only seeding helper — `seedPriorHeaviestSet` in `apps/mobile/lib/db/test-support.ts`, introduced in phase 05-08 (confirmed via `git log -S`), predating this plan — performs a second, direct `insert(workoutSession)` to seed a days-old prior session for `workout-summary.spec.ts`'s PR fixture, entirely outside the funnel. This is out of scope for 05-10 per the deviation rules' scope boundary (not caused by this plan's changes) and is left as-is. Filed as WINDOWS #130.

## Issues Encountered
- `@fitness/api-contracts` and `@fitness/pr-rules` had no built `dist/` in this fresh worktree, failing every Jest import at the start of Task 1 (`Cannot find module '@fitness/api-contracts'`) — same gap 05-09 documented. Ran `pnpm --filter @fitness/api-contracts build` and `pnpm --filter @fitness/pr-rules build` once; not a plan defect.
- `apps/mobile/e2e/history.spec.ts` (05-09) is not registered in `playwright.config.ts`'s `durability` project `testMatch` array — a pre-existing gap noticed while adding `session-edit.spec.ts`'s own entry. Not fixed here (out of scope, predates this plan, not something this plan's own acceptance criteria touch); noted for whoever next runs the e2e suite.

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED
- All 22 files created/modified in this plan verified present via `git ls-files` against the three task commits (`8564e5a`, `8cb0cb1`, `187df7c`).
- All three commit hashes verified present in `git log --oneline`.
- `pnpm --filter mobile test` (full suite): 75 suites, 1278 tests, all passing.
- `pnpm typecheck` and `pnpm lint` (repo root, via turbo): all packages green.

## Next Phase Readiness
- Phase 5's success criterion 5 ("edit a past workout, backfill training history") is closed — `LOG-20`/`LOG-21` complete.
- `apps/mobile/e2e/session-edit.spec.ts` needs a real run (`pnpm --filter mobile test:e2e:durability -- session-edit.spec.ts`) before its coverage is verified rather than written (WINDOWS #128).
- Native date-picker presentation and native OS font-scale wrapping on the editing header are deferred to the ROADMAP Phase 999.1 native/cross-device sweep (WINDOWS #129).
- Phase 8 (progression engine) inherits an explicit, recorded boundary: whether a backfilled session should be excluded from or included in future rule evaluation was left unresolved by this plan on purpose (the plan's own flagged planner assumption), not silently assumed either way.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-25*
