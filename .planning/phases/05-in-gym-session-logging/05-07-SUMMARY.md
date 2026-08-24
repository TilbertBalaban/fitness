---
phase: 05-in-gym-session-logging
plan: 07
subsystem: ui

tags: [react-native, expo-router, drizzle-orm, powersync, playwright]

requires:
  - phase: 05-in-gym-session-logging
    provides: "05-01's startSession/addSessionExercise/EMPTY_PRESCRIPTION funnel (log-set.ts), workout.tsx screen and useWorkoutScreen hook"
  - phase: 05-in-gym-session-logging
    provides: "05-05's elapsedWorkoutSeconds/formatClock/RestTimerBar and the workout_session.paused_at/accumulated_paused_seconds/rest_target_at columns"
provides:
  - "startOneOffSession: the second funnel entry point into startSession/addSessionExercise (D-33), LOG-02"
  - "pauseSession/resumeSession/completeSession/discardSession/loadInProgressSessionSummary: the full session-lifecycle write/read surface (D-28, D-29)"
  - "shouldAutoAdvance: the pure LOG-13 rule, and its wiring into workout.tsx's checkmark-completion handlers"
  - "loadWorkoutPreferences/setWorkoutPreference: the auto-advance and warm-up-suggestions singleton-row flags"
  - "WorkoutInProgressBanner/WorkoutInProgressBannerView: the Home in-progress banner (D-28)"
  - "finishSession: the single named exit from the live screen (D-32)"
affects: [05-08, 05-09, 05-10]

actuals:
  tokens: 28400
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "renderNoSessionBody(screenState, nextUp) is a plain function call embedded in JSX, not a nested <Component/> — this workspace's no-renderer test walker only sees a props.children tree and never invokes a component boundary, so a genuine child component here would have been invisible to WorkoutScreenView's direct-invocation tests (the same 'SetField -> renderSetField' fix 05-01 established, applied to a new case)."
    - "WorkoutInProgressBanner follows the hook-free View + thin stateful-wrapper split, but the wrapper owns ONLY UI state (the discard-confirmation modal) — the conditional query itself is issued by the caller (Home), never by the component, which is what makes D-28's cost constraint a property of the call site rather than something every consumer has to remember to preserve."
    - "shouldAutoAdvance takes the just-completed set's type as an explicit parameter rather than being inferred from aggregate row state — 'a warm-up completing never triggers auto-advance even if every working set already stood complete' is not expressible from aggregate state alone."

key-files:
  created:
    - apps/mobile/lib/db/session-lifecycle.ts
    - apps/mobile/lib/db/preferences.ts
    - apps/mobile/lib/session/auto-advance.ts
    - apps/mobile/lib/session/finish-session.ts
    - apps/mobile/components/WorkoutInProgressBanner.tsx
    - apps/mobile/e2e/session-lifecycle.spec.ts
  modified:
    - apps/mobile/app/(tabs)/workout.tsx
    - apps/mobile/app/(tabs)/index.tsx
    - apps/mobile/app/(tabs)/profile.tsx
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/e2e/durability.spec.ts
    - apps/mobile/playwright.config.ts

key-decisions:
  - "The 'session menu' (Pause/Resume, Discard) required by D-29 is a small, locally-defined menu inside workout.tsx, not the shared SessionActionSheet component — SessionActionSheet.tsx is owned by the concurrently-running 05-06 plan this wave, and a two-writer merge on it would be exactly the failure the wave's seam split exists to prevent."
  - "DiscardWorkoutDialog is a standalone component in WorkoutInProgressBanner.tsx (same overlay/two-button shape as ArchiveDialog) rather than an extension of ArchiveDialog's exercise/program subject union — a discarded workout is neither, and ArchiveDialog.tsx is out of this plan's file scope."
  - "loadInProgressSessionSummary does not filter workout_session by user_id, mirroring loadLiveSession/previousSetReference's own documented reasoning (05-01) — that column is stamped server-side on sync push only, so filtering on it would make an offline-started session invisible to its own banner. The threat register's T-05-07-01 mitigation text says 'filters by user_id'; the actual mitigation is the userId-null early-out, which is what the acceptance criterion (no query at all when userId is null) and this codebase's established precedent both require."
  - "A query failure on Home's in-progress-session read (the E8 backstop) is a deliberate, pinned choice to render identically to 'no session' — readInProgressSession still reports the failure distinctly (tested), but HomeScreen's own rendering collapses both to banner-absent rather than stacking a second error surface above the next-up card's own."
  - "WINDOWS.md ids landed at 113-115, not the plan's pre-reserved 163-172 courtesy range — matching 05-05's own documented precedent, gsd-tools windows append assigns dense sequential ids from the ledger's actual current state, which supersedes a pre-reservation made against an earlier snapshot."

requirements-completed: [LOG-02, LOG-11, LOG-12, LOG-13]

coverage:
  - id: D1
    description: "startOneOffSession funnels a one-off workout through the same startSession/addSessionExercise helpers startWorkoutFromProgram uses; every session_exercise row carries all five target_* columns null (EMPTY_PRESCRIPTION)"
    requirement: "LOG-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-lifecycle.test.ts#startOneOffSession"
        status: pass
    human_judgment: false
  - id: D2
    description: "pauseSession/resumeSession/completeSession/discardSession implement D-29's pause accounting (a resume with no open pause is a no-op; completing while paused folds in the final open interval) and D-28's discard-as-status-transition"
    requirement: "LOG-11"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-lifecycle.test.ts#pauseSession, #resumeSession, #completeSession, #discardSession"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadInProgressSessionSummary issues no query when userId is absent and selects at most five columns; the Home banner renders it with a resume/discard action pair and a discard confirmation before writing"
    requirement: "LOG-11"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-lifecycle.test.ts#loadInProgressSessionSummary, apps/mobile/components/__tests__/WorkoutInProgressBanner.test.tsx, apps/mobile/app/(tabs)/__tests__/home-screen.test.ts#readInProgressSession"
        status: pass
    human_judgment: false
  - id: D4
    description: "shouldAutoAdvance returns null when disabled, when a working set remains incomplete, when the just-completed set was a warm-up, and on the last exercise (no wrap-around); returns the next index otherwise. Wired into workout.tsx's checkmark handlers, gated on mode === 'live'"
    requirement: "LOG-13"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/auto-advance.test.ts, apps/mobile/app/(tabs)/__tests__/workout.test.tsx (grep for session.status === returns no match)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Workout tab renders six distinct states (error, loading, no-program, time-off, program-complete, workout-available, ready); a one-off workout can be started from every no-session-ish state via the unmodified ExercisePickerModal"
    requirement: "LOG-02"
    verification:
      - kind: unit
        ref: "apps/mobile/app/(tabs)/__tests__/workout.test.tsx#deriveWorkoutScreenState, #WorkoutScreenView"
        status: pass
    human_judgment: false
  - id: D6
    description: "loadWorkoutPreferences/setWorkoutPreference and a Workout settings section on Profile (auto-advance toggle, warm-up-suggestions toggle, notification re-request row) let the auto-advance rule be turned off"
    requirement: "LOG-13"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/preferences.test.ts, apps/mobile/app/(tabs)/__tests__/profile.test.tsx"
        status: pass
    human_judgment: false
  - id: D7
    description: "Force-quitting mid-workout with warm-ups logged, two completed working sets, and an open pause restores everything on reopen — the pause stays open (never converted or cleared), and the restored duration equals the pre-close duration"
    requirement: "LOG-11"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/durability.spec.ts#force-quitting mid-workout with warm-ups logged and a pause open loses nothing on reopen (written, not executed)"
        status: unknown
    human_judgment: true
    rationale: "Written against the real browser database and durability harness, extended for this plan's pause/warm-up scenario, but this session's CLAUDE.md forbids launching a browser or running browser/e2e suites unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- durability.spec.ts. Filed as WINDOWS.md #113."
  - id: D8
    description: "Pausing freezes the header duration readout and resuming restarts it without losing time; finishing stamps ended_at/completed; discard requires the confirmation before writing"
    requirement: "LOG-11"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/session-lifecycle.spec.ts (written, not executed)"
        status: unknown
    human_judgment: true
    rationale: "Same browser-launch restriction as D7. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- session-lifecycle.spec.ts. Filed as WINDOWS.md #114."

duration: ~2h30m
completed: 2026-08-24
status: complete
---

# Phase 5 Plan 7: Session Lifecycle, Home Banner, Auto-Advance Summary

**A one-off workout can now be started from any no-session state, a session can be paused/resumed/finished/discarded through a new session menu, an in-progress session is visible from Home with resume/discard actions, and the pager auto-advances between exercises unless the toggle in Profile turns it off.**

## Performance

- **Duration:** ~2h30m
- **Tasks:** 3
- **Files modified:** 21 (7 created, 14 modified)

## Accomplishments

- `startOneOffSession` (`lib/db/session-lifecycle.ts`) is D-33's second funnel entry point — it calls the exact same `startSession`/`addSessionExercise` helpers `startWorkoutFromProgram` uses, so a source scan of `apps/mobile/lib/db/` for `insert(workoutSession)` still returns exactly one match, in `log-set.ts`.
- `pauseSession`/`resumeSession`/`completeSession`/`discardSession`/`loadInProgressSessionSummary` implement the full D-28/D-29 lifecycle surface, every status value drawn from the `WORKOUT_SESSION_STATUSES` tuple rather than a bare string literal.
- The Workout tab's old single `'no-session'` state is now six distinct states (`error`/`loading`/`no-program`/`time-off`/`program-complete`/`workout-available`/`ready`), each with its own heading and body, with the one-off start action (opening the unmodified `ExercisePickerModal`) available from every no-session-ish state.
- A new session menu (Pause/Resume, Discard) and a Finish Workout primary CTA are wired into `workout.tsx`, gated on the live `SessionScreenMode`, never `session.status` (a grep for `session.status ===` in the file returns no match).
- `shouldAutoAdvance` (`lib/session/auto-advance.ts`, LOG-13) is pure and fully unit-tested; wired into both the trailing-draft-row and existing-row checkmark handlers, respecting the `autoAdvanceEnabled` preference loaded on every Workout-tab focus.
- `WorkoutInProgressBanner`/`WorkoutInProgressBannerView` render on Home above the existing Next Up card, driven by a query Home only issues when `userId` is present (D-28's cost constraint), with a Discard action that opens a confirmation before writing.
- Profile gains a Workout settings section: auto-advance toggle, warm-up-suggestions toggle, and the D-22 notification re-request row deep-linking to OS Settings.
- `finishSession` (`lib/session/finish-session.ts`) is the one named exit from the live screen, so 05-08 can later change its single navigation line to the summary route without touching `workout.tsx`.
- `durability.spec.ts` gained the harder force-quit-with-pause recovery case (success criterion 4); `session-lifecycle.spec.ts` was authored to drive the real screen through pause/resume/finish/discard. Both are written and typechecked but not executed — CLAUDE.md forbids launching a browser this session — and are filed as WINDOWS.md unrun-verify entries.

## Task Commits

1. **Task 1 (session-lifecycle write module, partial) + supporting groundwork** - `46fd44e` (feat) — `session-lifecycle.ts`'s full surface (Task 1's `startOneOffSession` plus Task 2's pause/resume/complete/discard/loadInProgressSessionSummary, written together as one file)
2. **Task 2/3 (preferences, auto-advance, finishSession primitives)** - `a7abdd2` (feat)
3. **Task 3 (Home banner, Profile settings)** - `4e091f3` (feat)
4. **Task 1/2/3 (workout.tsx wiring — one-off start, pause/resume/discard/finish, auto-advance)** - `c909e92` (feat)
5. **Task 2 (e2e specs, durability harness extension)** - `7759eda` (test)

**Plan metadata:** _pending — this commit_

## Files Created/Modified

- `apps/mobile/lib/db/session-lifecycle.ts` - `startOneOffSession`, `pauseSession`, `resumeSession`, `completeSession`, `discardSession`, `loadInProgressSessionSummary`
- `apps/mobile/lib/db/preferences.ts` - `loadWorkoutPreferences`, `setWorkoutPreference`
- `apps/mobile/lib/session/auto-advance.ts` - `shouldAutoAdvance`
- `apps/mobile/lib/session/finish-session.ts` - `finishSession`
- `apps/mobile/components/WorkoutInProgressBanner.tsx` - `WorkoutInProgressBannerView`, `WorkoutInProgressBanner`, `DiscardWorkoutDialog`
- `apps/mobile/app/(tabs)/workout.tsx` - six-state `deriveWorkoutScreenState`, one-off picker flow, session menu, Finish Workout CTA, auto-advance wiring
- `apps/mobile/app/(tabs)/index.tsx` - `readInProgressSession`, banner wiring above the Next Up card
- `apps/mobile/app/(tabs)/profile.tsx` - `ToggleRow`, `NotificationRow`, Workout settings section
- `apps/mobile/app/__durability.web.tsx`, `apps/mobile/lib/db/test-support.ts` - `pauseSession`/`resumeSession`/`readSessionRaw` harness methods
- `apps/mobile/e2e/durability.spec.ts` - the force-quit-with-pause recovery case
- `apps/mobile/e2e/session-lifecycle.spec.ts` - pause/resume/finish/discard driven through the real screen
- `apps/mobile/playwright.config.ts` - registered `session-lifecycle.spec.ts`

## Decisions Made

See `key-decisions` in frontmatter — the local session menu (not the concurrently-owned `SessionActionSheet`), `DiscardWorkoutDialog` as a standalone component, `loadInProgressSessionSummary`'s no-user_id-filter precedent, the E8 backstop's collapsed rendering, and the WINDOWS.md id-range note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `shouldAutoAdvance`'s signature gained a `completedSetType` parameter beyond the plan's own literal `{ sets, enabled, currentIndex, exerciseCount }`**
- **Found during:** Task 3
- **Issue:** The plan's own required behavior — "it returns null ... when the just-completed set was a warm-up" — cannot be derived from aggregate `sets` state alone: if every working set already stood complete and a warm-up was the most recent completion, an aggregate-only function would incorrectly return the next index.
- **Fix:** Added `completedSetType: string` as a required input, sourced by the caller (`workout.tsx`) from the specific set that was just toggled.
- **Files modified:** `apps/mobile/lib/session/auto-advance.ts`, `apps/mobile/lib/session/__tests__/auto-advance.test.ts`
- **Verification:** `auto-advance.test.ts`'s "just-completed set was a warm-up" case passes.
- **Committed in:** `a7abdd2`

**2. [Rule 2 - Missing Critical] `__durability.web.tsx`/`test-support.ts` gained `pauseSession`/`resumeSession`/`readWorkoutSessionRaw` harness methods**
- **Found during:** Task 2, writing the recovery e2e case
- **Issue:** Neither file is in Task 2's `<files>` list, but the plan's own required recovery case (success criterion 4: a pause outstanding through close/reopen) cannot be expressed at all without a harness method that pauses a session and reads its raw row back.
- **Fix:** Added the three methods, delegating to the real `session-lifecycle.ts` writes against the currently-open test database — no stub, no bypass.
- **Files modified:** `apps/mobile/app/__durability.web.tsx`, `apps/mobile/lib/db/test-support.ts`
- **Committed in:** `7759eda`

**3. [Not a code deviation — process note] Session-menu component location**
- **Found during:** Task 2
- **Issue:** The plan says pause/resume "live on the session menu" without naming a component; `SessionActionSheet.tsx` (the natural shared "session menu" component) is owned by the concurrently-running 05-06 plan this wave and is on this plan's explicit do-not-edit list.
- **Resolution:** Built a small, locally-defined menu inline in `workout.tsx` rather than touching `SessionActionSheet.tsx` or waiting on 05-06. No file-scope conflict; documented for traceability since a future plan wiring `SessionActionSheet` for Swap/Remove/Reorder/Info may want to fold this menu into it.

**4. [Not a code deviation — tooling note] WINDOWS.md ids landed at 113-115, not the plan's pre-reserved 163-172 courtesy range**
- **Found during:** Task 2/3, filing the unrun-verify entries
- **Issue:** `gsd-tools windows append` assigns dense sequential ids (`max(existing) + 1`); by the time this plan appended, the ledger's actual max was 112 (from concurrent 05-05/05-06 work), so 113-115 were the correct next ids — matching 05-05's own documented precedent for the identical situation.
- **Fix:** None needed — the tool's centralized, collision-proof assignment supersedes the plan's pre-reservation, which was a courtesy estimate against an earlier ledger state.
- **Files modified:** `.planning/WINDOWS.md`

---

**Total deviations:** 4 (2 missing-critical additions, 1 process note on component ownership, 1 tooling note — no code change)
**Impact on plan:** Both code-affecting deviations were necessary for this plan's own stated behavior or verify command to actually be true. No scope creep beyond what the tasks' acceptance criteria already required.

## Issues Encountered

- The first implementation of the no-session states' heading/body block used a nested `<NoSessionBody />` component element. This workspace's Jest tests use a no-renderer, direct-invocation walker that only traverses `props.children` — it never invokes a component boundary, so the nested component's own returned JSX (a `Fragment` of `Text` elements) was invisible to `flatText()`'s assertions. Fixed by converting it to a plain function (`renderNoSessionBody`) called directly and embedded as `{renderNoSessionBody(...)}` in the parent's JSX — the same "`SetField` → `renderSetField`" fix 05-01's SUMMARY documented for an analogous case.
- `@fitness/api-contracts` had no `dist/` build output in this fresh worktree (same pre-existing environment gap 05-01/05-02/05-05 already documented) — ran `pnpm build` inside `packages/api-contracts` once, at the start of this session.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `pnpm --filter mobile test` is green: 1113/1113 passing, including 153 tests across the eight suites this plan touched (`session-lifecycle.test.ts`, `preferences.test.ts`, `auto-advance.test.ts`, `finish-session.test.ts`, `WorkoutInProgressBanner.test.tsx`, `workout.test.tsx`, `home-screen.test.ts`, `profile.test.tsx`).
- `pnpm typecheck` and `pnpm lint` are both green at the repo root (Turborepo, all 5 packages).
- **Blocker for full confidence:** `pnpm --filter mobile test:e2e:durability -- durability.spec.ts` and `-- session-lifecycle.spec.ts` were never executed this session — CLAUDE.md forbids launching a browser unless explicitly requested. A human or CI run is needed before D7/D8's coverage items can be marked `pass`. See WINDOWS.md #113, #114. The native-only observations (pause under real OS backgrounding, tab focus semantics on a physical device) are filed as WINDOWS.md #115 against Phase 999.1.
- 05-08 (finish summary / correction flow) can change `finishSession`'s single `router.push('/(tabs)')` line to the summary route with no other change to this plan's files — that was the whole point of extracting it as a named function.
- 05-06's `SessionActionSheet.tsx` (Swap/Remove/Reorder/Info) is untouched by this plan; a future plan may want to fold this plan's ad hoc Pause/Resume/Discard menu into that shared sheet once it exists, but nothing here blocks that refactor.
- `apps/mobile/lib/db/log-set.ts` was read from, never edited — the single-funnel invariant (`insert(workoutSession)` appearing exactly once in `apps/mobile/lib/db/`) holds.

## Self-Check: PASSED

- FOUND: apps/mobile/lib/db/session-lifecycle.ts
- FOUND: apps/mobile/lib/db/preferences.ts
- FOUND: apps/mobile/lib/session/auto-advance.ts
- FOUND: apps/mobile/lib/session/finish-session.ts
- FOUND: apps/mobile/components/WorkoutInProgressBanner.tsx
- FOUND: apps/mobile/e2e/session-lifecycle.spec.ts
- FOUND: apps/mobile/lib/db/__tests__/session-lifecycle.test.ts
- FOUND: apps/mobile/lib/db/__tests__/preferences.test.ts
- FOUND: apps/mobile/lib/session/__tests__/auto-advance.test.ts
- FOUND: apps/mobile/lib/session/__tests__/finish-session.test.ts
- FOUND: apps/mobile/components/__tests__/WorkoutInProgressBanner.test.tsx
- FOUND: apps/mobile/app/(tabs)/__tests__/profile.test.tsx
- FOUND: commit 46fd44e
- FOUND: commit a7abdd2
- FOUND: commit 4e091f3
- FOUND: commit c909e92
- FOUND: commit 7759eda

No missing items.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-24*
