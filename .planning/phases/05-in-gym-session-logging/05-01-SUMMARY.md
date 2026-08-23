---
phase: 05-in-gym-session-logging
plan: 01
subsystem: ui

tags: [react-native, expo-router, drizzle-orm, powersync, react-native-tab-view, nativewind]

requires:
  - phase: 04-program-builder
    provides: routine/routineDay/routineExercise schema and the DayDeck/CycleStrip component pattern this plan copies
provides:
  - "startWorkoutFromProgram: the single write funnel from a resolved NextUp program day into a real workout_session + session_exercise snapshot rows"
  - "loadSessionTree/loadLiveSession: batched, offline-safe reads of the open session (never filters workout_session by user_id, since that column is server-stamped only)"
  - "previousSetReference/previousSetReferencesForSession: the one named history-lookup function for D-16's weight/reps reference values"
  - "NumericKeypad/SetRow/ExerciseStrip/ExercisePager/ExercisePage: the reusable component set the rest of Phase 5 composes into"
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10]

actuals:
  tokens: 42000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Hook-free View + thin stateful wrapper split (SetRowView/SetRow, NumericKeypadView/NumericKeypad, ExerciseStripView/ExerciseStrip, ExercisePagerView/ExercisePager, ExercisePageView/ExercisePage) — matches CycleStripView/DayDeckView precedent, direct-invocable by Jest with no renderer."
    - "SessionScreenMode context (D-32) provided once at the screen root, gating timer/auto-advance structurally rather than via session.status."
    - "One-trailing-draft-row set model: existing DB rows plus exactly one draft row, never a pre-populated block of target_sets rows — avoids out-of-order set_index bugs at the cost of not showing all target rows upfront."
    - "useWorkoutScreen extracted hook, parameterized by an optional db override, shared verbatim between the real screen and the __durability harness route."

key-files:
  created:
    - apps/mobile/lib/session/session-mode.tsx
    - apps/mobile/lib/db/session-query.ts
    - apps/mobile/components/NumericKeypad.tsx
    - apps/mobile/components/SetRow.tsx
    - apps/mobile/components/ExerciseStrip.tsx
    - apps/mobile/components/ExercisePager.tsx
    - apps/mobile/components/ExercisePage.tsx
    - apps/mobile/e2e/workout-screen.spec.ts
  modified:
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/lib/db/log-set.ts
    - apps/mobile/e2e/schema-redefinition.spec.ts
    - apps/mobile/e2e/durability.spec.ts

key-decisions:
  - "loadLiveSession/previousSetReference deliberately never filter workout_session by user_id — that column is stamped server-side on sync push only, so filtering on it would make an offline-started or offline-only session invisible to itself (found during Task 1 by reading sync.service.ts, not surfaced by any test)."
  - "The trailing-draft-row model renders exactly one empty row past the last logged set, not a pre-populated block of target_sets rows — trades some upfront-visibility polish for eliminated out-of-order set_index risk."
  - "RIR carries no previous-session reference (D-16's scope split, matching PreviousSetReference's own returned shape) — only weight and reps show a tappable prior-actual value; RIR's field still prefills from the session_exercise target snapshot."
  - "Exercise names in loadSessionTree resolve through the existing loadExerciseNameMap (load-program.ts) rather than a fourth dedicated select, to stay inside the plan's 'at most 5 selects' budget while still resolving both seeded and custom exercise names."

requirements-completed: [LOG-01, LOG-03, LOG-04, LOG-05, LOG-06, LOG-07]

coverage:
  - id: D1
    description: "startWorkoutFromProgram funnels a resolved program day into one workout_session and one session_exercise per slot, with the frozen target_* snapshot"
    requirement: "LOG-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/log-set.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadSessionTree/loadLiveSession batched reads assemble the open session (session, exercises, sets) without filtering on a possibly-null offline user_id"
    requirement: "LOG-01"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-query.test.ts#loadSessionTree, #loadLiveSession"
        status: pass
    human_judgment: false
  - id: D3
    description: "NumericKeypad and SetRow render with no TextInput, correct field-walk order (weight -> reps -> rir), and a two-tap checkmark round trip"
    requirement: "LOG-05, LOG-06, LOG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/NumericKeypad.test.tsx, apps/mobile/components/__tests__/SetRow.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "previousSetReference/previousSetReferencesForSession resolve the same-set_index prior value (never most-recently-logged), excluding warm-up rows, with a deterministic started_at/logged_at/id tie-break"
    requirement: "LOG-06"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-query.test.ts#previousSetReference, #previousSetReferencesForSession"
        status: pass
    human_judgment: false
  - id: D5
    description: "A set logged on the docked keypad is durable in local SQLite instantly and survives a full page reload; the exercise strip and pager make every exercise reachable by tap or swipe"
    requirement: "LOG-03, LOG-04"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/workout-screen.spec.ts (written, not executed)"
        status: unknown
    human_judgment: true
    rationale: "Playwright e2e specs were written to prove this against the real browser database but were not run — this session's CLAUDE.md forbids launching a browser or running browser/e2e suites unless explicitly requested. Unit tests cover the underlying logic (buildSetRows, useWorkoutScreen handlers) but not real-DB/real-browser durability or the actual swipe gesture. Needs a human or CI run of `pnpm --filter mobile test:e2e:durability`."
  - id: D6
    description: "The previous-session reference value is visible inline beside the weight/reps fields and tapping it autofills that field, surviving a reload; a first-ever set says 'No previous'"
    requirement: "LOG-06"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/durability.spec.ts#previousSetReference resolves the later of two prior sessions and survives a reload (written, not executed)"
        status: unknown
    human_judgment: true
    rationale: "Same as D5 — the reload/tie-break case was written against the real browser database and harness but not executed in this session."

duration: 3h40m
completed: 2026-08-23
status: complete
---

# Phase 5 Plan 1: In-Gym Session Logging Tracer Summary

**Tracer slice from "Start today's workout" through a durable, resumable, multi-exercise set-logging screen with tap-to-autofill previous-session references.**

## Performance

- **Duration:** ~3h40m
- **Tasks:** 3
- **Files modified:** 20 (8 created, 6 modified plus test files)

## Accomplishments

- `startWorkoutFromProgram` writes exactly one `workout_session` and one `session_exercise` per programmed slot through the existing `startSession`/`addSessionExercise` funnel.
- `logSet`/`updateLoggedSet` make every tapped checkmark durable to local SQLite before any network call, with no in-memory draft buffer.
- `NumericKeypad` (docked, no `TextInput`) and `SetRow` (48x48 checkmark, weight/reps/rir fields) implement the phase's core interaction: weight → reps → rir → complete.
- `ExerciseStrip` + `ExercisePager` make every exercise in the session reachable by chip tap or pager swipe, sharing one index between the two (per 05-UI-SPEC).
- `previousSetReference`/`previousSetReferencesForSession` resolve the prior session's SAME-set_index value (RESEARCH.md Pitfall 1), excluding warm-up rows, with a deterministic tie-break; `SetRow` renders the result as a tappable, accent-underlined reference under weight and reps.

## Task Commits

1. **Task 1: Tracer — start workout through a durable first set** - `9265fde` (feat)
2. **Task 2: Expand to every exercise — pinned strip and swipeable pager** - `b3367fd` (feat, mislabeled `05-02` in the commit message — see Deviations)
3. **Task 3: Previous-session reference values and tap-to-autofill** - `327a189` (feat)

**Plan metadata:** _pending — this commit_

## Files Created/Modified

- `apps/mobile/lib/session/session-mode.tsx` - `SessionScreenMode` context (live/editing/summary-correction), D-32
- `apps/mobile/lib/db/session-query.ts` - `loadSessionTree`, `loadLiveSession`, `previousSetReference`, `previousSetReferencesForSession`
- `apps/mobile/lib/db/log-set.ts` - `startWorkoutFromProgram`, `updateLoggedSet` added to the existing `startSession`/`addSessionExercise`/`logSet` funnel
- `apps/mobile/components/NumericKeypad.tsx` - docked, hook-free numeric keypad, no `TextInput`
- `apps/mobile/components/SetRow.tsx` - hook-free set row: fields, checkmark, previous-value reference slot
- `apps/mobile/components/ExerciseStrip.tsx` - chip row (current/completed/in-progress tone, N/M or checkmark fraction)
- `apps/mobile/components/ExercisePager.tsx` - `TabView` wrapper, `clampPagerIndex`
- `apps/mobile/components/ExercisePage.tsx` - per-exercise page composing `SetRowView`, action-bar slot left empty for 05-06
- `apps/mobile/app/(tabs)/workout.tsx` - the real screen: multi-exercise state machine, `useWorkoutScreen` hook
- `apps/mobile/app/__durability.web.tsx` - `__durability` harness route extended with workout-screen and reference-lookup methods
- `apps/mobile/lib/db/test-support.ts` - `seedProgrammedSession`, `WORKOUT_HARNESS_MODE`, `SCHEMA_VARIANT_DELTA` renamed `notes`→`harness_probe` (coordination with 05-02)
- `apps/mobile/e2e/workout-screen.spec.ts` - new Playwright spec (start → log → reload → undo), not executed
- `apps/mobile/e2e/durability.spec.ts` - extended with the two-prior-sessions reference case, not executed
- `apps/mobile/e2e/schema-redefinition.spec.ts` - updated for the `notes`→`harness_probe` rename

## Decisions Made

- `loadLiveSession` and `previousSetReference` never filter `workout_session` by `user_id` — that column is stamped server-side on sync push only (`sync.service.ts`'s `toWorkoutSessionValues`), so a session or a prior session that hasn't synced yet would otherwise become invisible to itself. Found by reading the sync service directly, not surfaced by any failing test.
- The trailing-draft-row model (existing rows + exactly one empty draft row, never a pre-populated `target_sets`-sized block) trades some upfront visibility for eliminated out-of-order `set_index` risk.
- RIR carries no previous-session reference, matching the plan's own `PreviousSetReference` shape (`weightKg`/`reps` only) — only weight and reps show a tappable prior value; RIR's field prefill still comes from the `session_exercise` target snapshot.
- `loadSessionTree` resolves exercise names through the existing `loadExerciseNameMap` (from `load-program.ts`) instead of a fourth dedicated select, staying inside the "at most 5 selects" budget while correctly naming both seeded and custom exercises.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `loadLiveSession` originally filtered by `workout_session.user_id`, which is null until sync**
- **Found during:** Task 1
- **Issue:** A session started this instant, still offline, carries a null `user_id` locally (stamped server-side only). Filtering on it would make D-01's "durable and resumable with no signal" false the moment it mattered most.
- **Fix:** Removed the `user_id` SQL filter; `loadLiveSession` filters by `status = 'in_progress'` only, extensively documented inline.
- **Files modified:** `apps/mobile/lib/db/session-query.ts`
- **Committed in:** `9265fde`

**2. [Rule 2 - Missing Critical] `previousSetReference`/`ExercisePage`/`workout.tsx` wiring extended beyond Task 3's stated file list**
- **Found during:** Task 3
- **Issue:** Task 3's `<files>` list covered only `session-query.ts` and `SetRow.tsx`, but without threading the resolved reference map through `ExercisePage.tsx` and `workout.tsx`, the feature's own `<done>` criterion ("the previous session's numbers are visible inline... tappable to autofill") would be unmet — the primitives would exist but nothing would render them.
- **Fix:** Extended `ExercisePageSetRow`/`ExercisePageViewProps` with `reference`/`onReferenceTap`, added `resolveReference`/`BuildSetRowsReferenceContext` to `workout.tsx`'s `buildSetRows`, and added `useWorkoutScreen`'s `referenceMap` state + `handleReferenceTap`.
- **Files modified:** `apps/mobile/components/ExercisePage.tsx`, `apps/mobile/app/(tabs)/workout.tsx`, plus their test files
- **Verification:** All wiring covered by new unit tests in `workout.test.tsx` (onReferenceTap resolution) and `SetRow.test.tsx`
- **Committed in:** `327a189`

**3. [Rule 2 - Missing Critical] `ExercisePager.test.tsx` added, though not in Task 2's file list**
- **Found during:** Task 2
- **Issue:** Task 2's acceptance criteria explicitly requires a unit case proving `clampPagerIndex(5, 2)` returns 1 and `clampPagerIndex(0, 0)` returns 0, but the plan's file list names only `ExerciseStrip.test.tsx`.
- **Fix:** Added `apps/mobile/components/__tests__/ExercisePager.test.tsx` with the required cases plus `exercisePagerRoutes`/empty-pager coverage, matching `DayDeck.test.tsx`'s existing precedent.
- **Files modified:** `apps/mobile/components/__tests__/ExercisePager.test.tsx`
- **Committed in:** `b3367fd`

**4. [Not auto-fixed — documented] Task 2's commit message used the wrong plan prefix**
- **Found during:** post-commit review (writing this summary)
- **Issue:** The Task 2 commit message reads `feat(05-02): ...` instead of `feat(05-01): ...` — `05-02` is the sibling plan running in parallel in this same wave, not this plan's number. A labeling slip, not a code defect.
- **Fix:** Not amended — per this session's git safety protocol ("always create new commits, never amend"). Documented here for traceability; commit hash `b3367fd` is Task 2 of **this** plan (05-01), despite its message.
- **Files modified:** none (commit message only)

**5. [Rule 3 - Blocking] `@fitness/api-contracts` had no `dist/` build output**
- **Found during:** Task 1 (pre-existing environment issue, surfaced by the first typecheck run)
- **Issue:** `Cannot find module '@fitness/api-contracts'` across many files — the workspace package hadn't been built yet.
- **Fix:** Ran `pnpm build` inside `packages/api-contracts` (build step, no code change).
- **Verification:** Typecheck passes.

---

**Total deviations:** 5 (1 auto-fixed bug, 2 missing-critical additions, 1 documented-not-fixed labeling slip, 1 blocking environment fix).
**Impact on plan:** All code deviations were necessary for correctness (Rule 1) or for the plan's own stated `<done>` criteria to actually be true (Rule 2). No scope creep beyond what each task's acceptance criteria already required.

## Issues Encountered

- `grep -c 'db.select'` initially reported `0` selects in `session-query.ts`, contradicting a manual count of 4 — resolved as a grep artifact: the calls are formatted as `db\n  .select({...})` across a newline, which a single-line pattern never matches. Confirmed the true count (4, within the "at most 5" budget) via `grep -c '\.select('`.
- `SetRowView`/`WorkoutScreenView`'s tests initially tried to walk into nested custom components (`SetField`, later `SetRowView`/`NumericKeypadView`/`PrimaryButton`/`ExerciseStripView`/`ExercisePagerView`/`ExercisePageView`) via the direct-invocation tree-walker, which cannot see inside a second component boundary. Resolved with two techniques depending on the case: inlining as a plain function call for genuinely-internal markup (`SetField` → `renderSetField`), and match-by-type-then-invoke-directly for legitimately separate, independently-tested components.
- Drizzle-orm's condition-tree chunk shapes were more subtle than the Task 1 session's own established `collectEqualities` helper needed: a `StringChunk` (operator, `"("`,`")"`, `" and "`) stores its text as an **array** of strings in `.value`, while a bound `Param` stores the scalar directly. Verified empirically via `node -e` against this workspace's exact `drizzle-orm` build before writing `session-query.test.ts`'s `and()`/`inArray()`/`ne()`-aware fake db.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The tracer's every layer (screen → hook → write helpers → SQLite) is proven by 118 new/updated unit tests (99 in Task 1's files, plus 56 in Task 2's, minus overlap, plus 22 in Task 3's `session-query.test.ts` and updates to `SetRow.test.tsx`/`workout.test.tsx`) — full suite is 1012 tests passing, 0 failing.
- `typecheck` and `lint` (both `tsc --noEmit` in this workspace) exit 0.
- **Blocker for full confidence:** `pnpm --filter mobile test:e2e:durability` (covering `workout-screen.spec.ts`, the extended `durability.spec.ts`, and `schema-redefinition.spec.ts`) was never executed this session — CLAUDE.md forbids launching a browser unless explicitly requested. A human or CI run is needed before this plan's D5/D6 coverage items can be marked `pass`. See WINDOWS.md entries for the specific unrun cases.
- The action-bar slot in `ExercisePage.tsx` is intentionally empty (`actionBarSlot?: ReactNode`) — 05-06 fills it with Warm-up/Targets/Note per D-13.
- The "W" warm-up badge described in 05-UI-SPEC's Set Row section is not yet rendered by `SetRow.tsx` — warm-up rows are correctly sorted ahead of working rows and excluded from strip/reference counts, but carry no visual badge yet. `SetRow.tsx` was out of Task 2's file scope; a later plan touching `SetRow.tsx` should add it.

## Self-Check: PASSED

All 14 created/modified source files and the SUMMARY.md itself confirmed present via `git ls-files`; all 3 task commit hashes (`9265fde`, `b3367fd`, `327a189`) confirmed present via `git log --oneline --all`. No missing items.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-23*
