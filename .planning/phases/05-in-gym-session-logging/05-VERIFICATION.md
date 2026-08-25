---
phase: 05-in-gym-session-logging
verified: 2026-08-25T07:45:16Z
status: gaps_found
score: 12/16 must-haves verified
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "Write-back targets whichever row the displayed value resolved from: when the session's cycle has a routine_exercise_cycle_target row for that field it updates the override, otherwise it updates the base routine_exercise row (D-15, LOG-15)."
    status: failed
    reason: >
      `resolveWriteBackTarget` correctly implements override-vs-base resolution and is unit-tested
      for both branches, but its only production caller passes a hardcoded `cycleId: null` for
      every programmed session, so the override branch is dead code in practice: "Also update my
      program" always writes the base `routine_exercise` row, even for a session whose cycle has a
      `routine_exercise_cycle_target` override for that field. The user's persistent edit is
      silently applied to the wrong row, and the stale override keeps shadowing it on every future
      cycle that reuses it. Already tracked as WINDOWS #123 (status: open, not waived).
    artifacts:
      - path: "apps/mobile/app/(tabs)/workout.tsx"
        issue: "Line 738: `cycleId: null` is hardcoded into every ExercisePageData built for a programmed session, instead of the session's actual cycle id."
      - path: "apps/mobile/lib/db/session-mutations.ts"
        issue: "resolveWriteBackTarget (line 84) is correct given a real cycleId, but `if (!cycleId) return { kind: 'base' }` means it always takes the base path when fed the hardcoded null."
    missing:
      - "Persist which routine_cycle a workout_session/session_exercise was started against (no cycle_id column exists on either table today), or thread the cycle id captured at session-start time through to ExercisePageData/TargetsSheet instead of discarding it after `handleStartWorkout`."
  - truth: "Notes exist at set, exercise and session level as three independent writes to the three notes columns (LOG-16)."
    status: failed
    reason: >
      The data layer fully supports all three levels (setNote writes three independent nullable
      columns, unit-tested per-level in session-mutations.test.ts), but only the exercise-level
      entry point has a UI trigger this phase — NoteSheet is mounted exclusively from
      ExercisePage.tsx's action bar. No set-row long-press, no session-level note affordance exists
      anywhere in the live workout screen, the summary screen, or history. A user cannot actually
      attach a note to an individual set or to the session as a whole today, contradicting LOG-16's
      literal wording. Already tracked as WINDOWS #118 (status: open, not waived).
    artifacts:
      - path: "apps/mobile/components/NoteSheet.tsx"
        issue: "Supports all three levels via props but is only ever invoked with the exercise level."
      - path: "apps/mobile/components/ExercisePage.tsx"
        issue: "Only mounts NoteSheet from the per-exercise action bar; no other call site exists in the app."
    missing:
      - "A set-level note trigger (e.g. long-press on a SetRow) and a session-level note trigger (e.g. on the header bar or summary screen) that open NoteSheet at those levels."
behavior_unverified_items:
  - truth: "The rest timer still alerts the user with the app fully backgrounded and the phone locked, verified on a real device (Roadmap SC3, D-10, D-25)."
    test: "Complete a set on a real iOS/Android device, background the app and lock the screen, and confirm the scheduled expo-notifications alert actually fires audibly/visibly when the rest target elapses."
    why_human: "No Xcode or Android SDK is available on this machine (WINDOWS #110, #129); the wall-clock-target scheduling logic is unit-tested but nothing can prove the OS actually delivers the notification while backgrounded/locked without a real device."
  - truth: "Force-quitting the app mid-workout and relaunching restores the session with every logged set intact, including warm-ups and an open pause (Roadmap SC4, D-01, D-19's own force-quit case)."
    test: "Run `pnpm --filter mobile test:e2e:durability -- durability.spec.ts`, specifically the 'force-quitting mid-workout with warm-ups logged and a pause open loses nothing on reopen' case."
    why_human: "The spec is written, wired into playwright.config.ts's durability project (CR-01 fixed the wiring gap), and typechecks, but was never executed this session — project CLAUDE.md forbids launching a browser without an explicit request. The base force-quit mechanism was proven in Phase 2 against the same real-database harness; this phase's warm-up+pause extension of it has zero executable confirmation yet."
human_verification:
  - test: "Run the full `pnpm --filter mobile test:e2e:durability` project once a browser session is explicitly authorized."
    expected: "All 9 specs (durability, schema-redefinition, catalog-load, workout-screen, rest-timer, session-lifecycle, session-edit, history, workout-summary) pass against a real @powersync/web database in a real browser."
    why_human: "Every spec in this phase was written but never executed, per CLAUDE.md's browser-testing-only-on-request rule. All 9 are correctly wired into playwright.config.ts (CR-01 closed the 2 that were previously invisible to the runner) and typecheck, but no evidence exists any of them pass."
  - test: "Log a normal set on a phone: tap the previous weight, tap the previous reps, tap the checkmark. Confirm this is exactly two taps to autofill plus completion, and that the docked keypad never visually covers the field being edited at any OS font scale."
    expected: "Matches Roadmap SC2 — at most two taps in the common case, keypad never hides the value."
    why_human: "The layout is structurally guaranteed (flex sibling, not an overlay) and unit-tested for logic, but the actual visual/interaction feel needs a real screen."
  - test: "On a real device, deny the notification permission, then complete a set. Confirm the countdown still runs, the in-app sound/haptic fires, and a persistent inline note states background alerts are off with a path to turn them on."
    expected: "Matches D-23's degraded-but-functional path — never a broken or silently-missing countdown."
    why_human: "No simulator/device available; the degrade logic is unit-tested but the actual OS permission-denial UX has never been observed."
  - test: "With a program that has at least one routine_exercise_cycle_target override active, open a programmed session, adjust a target in TargetsSheet, and tap 'Also update my program'. Then start a new session in the same cycle and confirm the override (not the base row) reflects the edit."
    expected: "The override row updates; the base row is untouched when an override exists."
    why_human: "This confirms the scope of the D-15 gap listed above in a live session — currently expected to FAIL per the code-level finding."
  - test: "Confirm the personal_record round trip across two devices: log a PR-setting set on device A, verify it appears on device B after both sync."
    expected: "The PR row created on device A is visible via the PowerSync pull path on device B."
    why_human: "WINDOWS #112 — the self-hosted PowerSync Service was not restarted against the current sync-rules.yaml in this session; the push half is proven by e2e tests against live Postgres, but the pull-side round trip to a second client rests only on the unrun sync-rules SELECT query."
---

# Phase 5: In-Gym Session Logging Verification Report

**Phase Goal:** The user can walk into a gym with no signal and log a complete workout without
friction. This is the phase the app becomes real — dogfooding starts here.
**Verified:** 2026-08-25T07:45:16Z
**Status:** gaps_found
**Re-verification:** No — initial verification

**Note on roadmap `mode: mvp` tag:** `gsd-tools query roadmap.get-phase 5` reports `Mode: mvp`, but
the phase goal text does not conform to the `As a X, I want Y, so that Z.` User Story format
(`user-story.validate` returns `false`), and the phase's own planning artifacts (10 requirement-
driven plans covering LOG-01 through LOG-21, `05-RESEARCH.md`, `05-DISCUSSION-LOG.md`,
`05-UI-SPEC.md`) are standard goal-backward planning outputs, not the SPIDR-sliced artifact set
`/gsd-mvp-phase` produces. Treated as a stale/default tag rather than a deliberate MVP-slice
signal; verified with the standard goal-backward methodology per the orchestrator's explicit
instructions, not the MVP User-Flow-Coverage format.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 — Start today's programmed workout or a one-off, log every set (weight/reps/RIR) offline start to finish | ✓ VERIFIED | `startWorkoutFromProgram`/`startOneOffSession` both funnel through `startSession` (log-set.ts:22); `logSet` writes durably inside a transaction with no draft buffer; PowerSync/SQLite offline architecture already proven in Phase 2 (PLAT-02/03/04 Complete). Unit tests green. |
| 2 | SC2 — Logging a normal set takes at most two taps; previous numbers inline/tappable; keypad never hides the value | ✓ VERIFIED | `previousSetReference`/`previousSetReferencesForSession` (session-query.ts) are real batched DB queries, not static; `SetRow` renders the greyed reference with tap-to-autofill; `NumericKeypad` is a flex sibling of scrollable content, never an absolute overlay (D-20 must_have) — no `TextInput` mounts anywhere in the write path. |
| 3 | SC3 — Rest timer starts automatically and alerts with the app backgrounded and phone locked, verified on a real device | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wall-clock-target model (`rest-timer.ts`), `.web.ts` platform seam with zero `Platform.OS` branches, and the "cancel outstanding alert before scheduling" invariant are all unit-tested and pass (`rest-alert.test.ts`). The "verified on a real device" clause is explicitly unmet — no Xcode/Android SDK on this machine (WINDOWS #110, #129). |
| 4 | SC4 — Force-quitting mid-workout and relaunching restores the session with every logged set intact | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `durability.spec.ts` contains a real, substantive case ("force-quitting mid-workout with warm-ups logged and a pause open loses nothing on reopen", line 219) against a real `@powersync/web` database, and is wired into `playwright.config.ts`'s `durability` project. Never executed this session (browser-testing prohibition). Base mechanism proven in Phase 2; this phase's extension is unconfirmed. |
| 5 | SC5 — Single-tap undo mid-workout; view/edit/duplicate/backfill past workouts | ✓ VERIFIED | `handleCheckmarkPress` toggles `completed` in place with no edit mode; `history-query.ts`/`history-mutations.ts` wire view/rename/duplicate/delete (LOG-20); `SessionDateField`/`setSessionDate` wire backfill (LOG-21); editing a past workout reopens the live screen in `editing` mode (05-10). All unit-tested; regression tests for CR-02/WR-02 (transactional integrity) pass individually. |
| 6 | SC6 — Finish to a summary showing muscles trained, PRs, per-exercise breakdown; correct entries from that screen | ✓ VERIFIED | `WorkoutSummary.tsx`/`summary-query.ts`/`personal-record.ts`/`detectPrsForSession` wired; CR-03's PR-badge-by-`exercise_id` misattribution bug was found, fixed, and its regression test (`attributes a PR only to the session_exercise instance that earned it`) passes individually. Correction reuses `SetRow` in `summary-correction` mode through the same `logSet`/`updateLoggedSet` paths. |
| 7 | Every set entry is durable the instant the checkmark is tapped; no draft buffer or save action (D-01) | ✓ VERIFIED | `logSet` (log-set.ts:178) writes and returns immediately inside a transaction; no in-memory set list found feeding a later save. |
| 8 | Starting a session creates exactly one `workout_session` + one `session_exercise` per programmed exercise with a frozen `target_*` snapshot (D-02) | ✓ VERIFIED | `startWorkoutFromProgram`/`addSessionExercise` (log-set.ts). Code review independently confirmed exactly two production `db.insert(workoutSession)` sites plus the one accepted test-fixture exception (WINDOWS #130). |
| 9 | `timezone`/`local_date` are stamped exactly once at session start, with `setSessionDate` as the sole documented exception (D-06/D-33) | ✓ VERIFIED | Grepped; `startSession` and `setSessionDate` are the only writers in production code. Single-funnel: `startWorkoutFromProgram`, `startOneOffSession`, and `duplicateSession` all call `startSession`. |
| 10 | RIR stays one integer column; no min/max pair anywhere; `FORBIDDEN_COLUMNS` gate enforces it (D-07) | ✓ VERIFIED | `schema-parity.e2e-spec.ts`'s `FORBIDDEN_COLUMNS` explicitly asserts `target_rir_min`/`target_rir_max` are absent from `session_exercise`, `routine_exercise`, and `routine_exercise_cycle_target` on the live Postgres database. |
| 11 | Every discriminator (session status, set type, PR type) is a tuple-sourced vocabulary shared client/server/DB (D-09) | ✓ VERIFIED | `packages/api-contracts/src/session.ts` exports the tuples; `sync.service.ts`'s validator Sets and the Postgres CHECK constraints are both built from them (confirmed by code review and schema-parity's `REQUIRED_COLUMNS`). |
| 12 | PR detection, e1RM, and warm-up scaling live in one shared pure package used by both client and (future) server (D-30) | ✓ VERIFIED | `packages/pr-rules` (estimated-1rm.ts, personal-records.ts, warmup.ts) has no DB/React/ambient-clock dependency; no local reimplementation found anywhere in `apps/mobile`. |
| 13 | `SessionScreenMode` is one typed value gating every timer/auto-advance call site across live/editing/summary-correction (D-32) | ✓ VERIFIED | `SessionModeProvider` mounted with `'live'` (workout.tsx:1159), `'editing'` (EditingWorkoutScreen.tsx:548), and `'summary-correction'` (workout-summary.tsx:61); `resolveSessionScreenMode` is the single decision point. `EditingWorkoutScreen.tsx` confirmed to never import `scheduleRestAlert`/`shouldAutoAdvance`. |
| 14 | Write-back targets the row the displayed value actually resolved from — override when a cycle override exists, base otherwise (D-15, LOG-15) | ✗ FAILED | See Gaps below. `cycleId` is hardcoded `null` at every production call site feeding `TargetsSheet`, so `resolveWriteBackTarget` always takes the base branch regardless of whether an override actually exists. |
| 15 | Notes exist at set, exercise, and session level (LOG-16) | ✗ FAILED | See Gaps below. Data layer supports all three; only the exercise-level UI trigger is wired this phase. |
| 16 | All 6 code-review findings (CR-01/02/03, WR-01/02/03) are fixed, not just claimed | ✓ VERIFIED | Each fix commit (`2369108`, `884c36c`, `ad130d3`, `645aac8`, `50d37e7`, `144b3ee`) carries a regression test; this verifier independently ran each named regression test in isolation (not the full suite) and confirmed all pass: `log-set.test.ts` "assigns distinct, sequential set_index values...", `summary-query.test.ts` "attributes a PR only to the session_exercise instance...", `history-mutations.test.ts` "runs startSession and the whole exercise-copy loop inside exactly one transaction call", `rest-alert.test.ts` "cancels any outstanding alert before scheduling...". |

**Score:** 12/16 truths verified (2 present-behavior-unverified, 2 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/mobile/lib/db/session-query.ts` | Session read + previous-set reference queries | ✓ VERIFIED | Real batched DB queries, no query-in-render-loop found |
| `apps/mobile/lib/session/session-mode.tsx` | `SessionScreenMode` typed contract | ✓ VERIFIED | 3 members declared, single provider pattern |
| `apps/mobile/components/SetRow.tsx` | Per-set row UI | ✓ VERIFIED (minor gap) | Renders correctly; missing UI-SPEC's warm-up "W" badge (WINDOWS #109, open, cosmetic) |
| `apps/mobile/components/NumericKeypad.tsx` | In-app keypad | ✓ VERIFIED | No TextInput anywhere; flex-sibling layout |
| `apps/mobile/components/ExerciseStrip.tsx` / `ExercisePager.tsx` / `ExercisePage.tsx` | Pager + strip + action-bar host | ✓ VERIFIED | `ExercisePage` reachable from `workout.tsx` (WINDOWS #114 gap closed) |
| `apps/mobile/lib/rest-timer.ts`, `rest-alert.ts`, `rest-alert.web.ts` | Timer + platform-split alerting | ✓ VERIFIED | No `Platform.OS` branch; wall-clock target model |
| `packages/pr-rules/*` | Shared PR/e1RM/warmup rules | ✓ VERIFIED | Pure, tested, imported by mobile only (server import is Phase 10 scope) |
| `apps/mobile/lib/db/personal-record.ts`, `summary-query.ts`, `components/WorkoutSummary.tsx` | Finish summary + PR writes | ✓ VERIFIED | CR-03 fixed; correction-in-place wired |
| `apps/mobile/lib/db/history-query.ts`, `history-mutations.ts`, `components/SessionHistoryRow.tsx` | History tab | ✓ VERIFIED | Paged, constant-query-cost, transactional delete/duplicate (WR-02 fixed) |
| `apps/mobile/components/SessionDateField.tsx`, `components/EditingWorkoutScreen.tsx` | Editing mode + backfill | ✓ VERIFIED | `editing` mode structurally isolates live machinery |
| `apps/api/test/personal-record-sync.e2e-spec.ts`, `session-annotations-sync.e2e-spec.ts` | Server apply-path tests | ✓ VERIFIED (per orchestrator-established green baseline) | Present, substantive, not skimmed as stubs |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `workout.tsx` checkmark press | `log-set.ts`'s `logSet` | direct call | ✓ WIRED | Same durable write path `durability.spec.ts` targets |
| `TargetsSheet`'s "Also update my program" | `session-mutations.ts`'s `writeBackTargets`/`resolveWriteBackTarget` | direct call | ⚠️ HOLLOW | Function correct; caller always supplies `cycleId: null` — see Gap #1 |
| `WarmupSheet` | `@fitness/pr-rules`'s `warmupSets` | import + `logSet` writes | ✓ WIRED | No local reimplementation of warmup math |
| `finishSession` | `/workout-summary` route → `detectPrsForSession` (`@fitness/pr-rules`) | navigation + import | ✓ WIRED | One exit path, one PR-detection call site |
| `HistoryActionSheet`/`history.tsx` duplicate action | `duplicateSession` → `startSession` | funnel call | ✓ WIRED | Lands `in_progress` on Workout tab per accepted deviation (WINDOWS #126) |
| `NoteSheet` | `setNote` (3 independent columns) | direct call | ⚠️ HOLLOW (partial) | Only the exercise-level entry point is mounted anywhere in the app — see Gap #2 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `SetRow` reference line | `previousSetReference` result | `session-query.ts` DB query | Yes | ✓ FLOWING |
| `TargetsSheet` write-back destination | `resolveWriteBackTarget`'s `cycleId` argument | Hardcoded `null` at call site (`workout.tsx:738`) | No — always resolves to `{kind:'base'}` regardless of actual override existence | ✗ HOLLOW_PROP |
| `WorkoutSummary` PR badges | `computeSessionPrTypesBySetId` → `prTypesBySessionExerciseId` | `detectPrsForSession`/`@fitness/pr-rules` against local history | Yes (post-CR-03 fix) | ✓ FLOWING |
| `ExerciseStrip` completion fraction | `countCompletedWorkingSets` | Local session set rows, warm-ups excluded from denominator | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-02 double-tap set_index race is closed | `npx jest lib/db/__tests__/log-set.test.ts -t "assigns distinct, sequential set_index"` | 1 passed | ✓ PASS |
| CR-03 PR badge attribution is per-session_exercise | `npx jest lib/db/__tests__/summary-query.test.ts -t "attributes a PR only to the session_exercise instance"` | 1 passed | ✓ PASS |
| WR-02 duplicateSession is transactional | `npx jest lib/db/__tests__/history-mutations.test.ts -t "runs startSession and the whole exercise-copy loop inside exactly one transaction call"` | 1 passed | ✓ PASS |
| LOG-08 adjacency: outstanding alert cancelled before rescheduling | `npx jest lib/__tests__/rest-alert.test.ts -t "cancels any outstanding alert before scheduling"` | 1 passed | ✓ PASS |
| `schema-parity.e2e-spec.ts` proves the live-Postgres push, not just typecheck | Not re-run this session — relies on orchestrator-established 21-suite/251-test green baseline, which includes this file | N/A | ? SKIP (per orchestrator pre-established state) |
| Full Playwright durability suite (9 specs) | Not run — browser-testing prohibited without explicit request | N/A | ? SKIP |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention; verification used targeted Jest spot-checks instead (Step 7b).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LOG-01 | 05-01, 05-07 | Start today's programmed workout | ✓ SATISFIED | `startWorkoutFromProgram` |
| LOG-02 | 05-07 | Start a one-off workout | ✓ SATISFIED | `startOneOffSession`, `EMPTY_PRESCRIPTION` path |
| LOG-03 | 05-01 | Previous session's weight/reps shown inline | ✓ SATISFIED | `previousSetReference`, deterministic tie-break |
| LOG-04 | 05-01 | Tap previous value to autofill | ✓ SATISFIED | Tap-to-autofill wired in `SetRow` |
| LOG-05 | 05-01 | In-app numeric keypad, never obscures value | ✓ SATISFIED | No `TextInput`; flex-sibling layout, not overlay |
| LOG-06 | 05-01 | RIR 0–6+, changeable mid-workout | ✓ SATISFIED | Single `rir` column, editable via keypad |
| LOG-07 | 05-01 | One-tap complete, tap again to undo | ✓ SATISFIED | `handleCheckmarkPress` toggle, no edit mode |
| LOG-08 | 05-05 | Rest timer starts automatically | ✓ SATISFIED | `startRest` on set completion |
| LOG-09 | 05-05 | Rest timer correct when backgrounded/locked | ? NEEDS HUMAN | Logic unit-tested; real-device confirmation impossible on this machine (WINDOWS #110, #129) |
| LOG-10 | 05-05 | Extend/skip rest timer, full-screen view | ✓ SATISFIED | `RestTimerFullScreen`, `REST_EXTEND_SECONDS` |
| LOG-11 | 05-05, 05-07 | Workout duration timer | ✓ SATISFIED | `elapsedWorkoutSeconds`, pause-aware |
| LOG-12 | 05-02, 05-07 | Pause and resume workout | ✓ SATISFIED | `paused_at`/`accumulated_paused_seconds` |
| LOG-13 | 05-02, 05-06, 05-07 | Auto-advance exercise, togglable | ✓ SATISFIED | `shouldAutoAdvance` pure function, `auto_advance_enabled` preference |
| LOG-14 | 05-06 | Add, swap, remove exercises mid-workout | ✓ SATISFIED | Add/swap/remove all wired and tested; Reorder intentionally has no UI trigger yet (not required by LOG-14's text; tracked WINDOWS #116) |
| LOG-15 | 05-06 | Adjust targets mid-workout, session-only or persistently | ⚠️ PARTIAL | Session-only save fully works; persistent write-back has the D-15 wiring gap (Gap #1) — functions but silently targets the wrong row when a cycle override exists |
| LOG-16 | 05-02, 05-06 | Notes at set, exercise, session level | ✗ BLOCKED | Data layer complete for all 3 levels; only the exercise-level UI trigger exists (Gap #2) — a user cannot attach a set- or session-level note today |
| LOG-17 | 05-04, 05-06 | Auto-calculated warm-up sets, togglable | ✓ SATISFIED | `warmupSets()` deterministic, materialized as real `logged_set` rows |
| LOG-18 | 05-03, 05-04, 05-08 | Finish summary: muscles, PRs, breakdown with e1RM | ✓ SATISFIED | `loadSessionSummary`, CR-03 fixed |
| LOG-19 | 05-08 | Correct entries from the summary screen | ✓ SATISFIED | `SetRow` in `summary-correction` mode |
| LOG-20 | 05-09, 05-10 | View, edit, rename, duplicate, delete past workouts | ✓ SATISFIED | History tab + editing mode |
| LOG-21 | 05-10 | Backfill a past workout's date/time | ✓ SATISFIED | `setSessionDate`/`SessionDateField`, single documented exception to D-06 |

No orphaned requirements — all 21 LOG-* IDs declared for Phase 5 in REQUIREMENTS.md appear in at least one plan's `requirements` field.

### Anti-Patterns Found

None. Scanned all 154 files listed across the phase's 10 SUMMARY.md key-files sections for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/empty-implementation patterns. The single `XXX` grep hit was a base64 integrity hash substring in `pnpm-lock.yaml`, not a debt marker.

### Human Verification Required

See `human_verification` in frontmatter — 5 items: the full unrun Playwright durability suite, the two-tap/keypad-overlay visual/interaction check, the notification-permission-denied degrade UX, a live confirmation of the D-15 write-back gap's blast radius on a real cycle-override program, and the cross-device `personal_record` pull round trip.

### Gaps Summary

Two must-have truths from the phase's own plans fail in production wiring, both already self-
reported by the executing agents in `WINDOWS.md` (#123, #118) but neither accepted as a deviation
by the orchestrator's explicit list, so both are reported here as gaps rather than absorbed:

1. **D-15 write-back targets the wrong row when a cycle override exists (LOG-15).** The underlying
   resolution function is correct and tested; the bug is purely that its only caller
   (`apps/mobile/app/(tabs)/workout.tsx`) never threads the session's actual `cycleId` through,
   because no schema column persists which cycle a session was started against. Low blast radius
   for a single-cycle program, but silently wrong for any program using Phase 4's per-cycle
   overrides — exactly the programs Phase 4's own success criteria say this app must support.

2. **LOG-16 notes are only reachable at the exercise level (LOG-16).** The three-column data layer
   is complete and tested for set/exercise/session notes, but only one of the three has a UI
   trigger. A user following LOG-16's literal promise ("attach notes at set, exercise, and session
   level") can only do one of the three today.

Both gaps are narrow, well-isolated (one caller-side null, one missing UI trigger) and do not
implicate the phase's core durability/offline/sync guarantees, which were extensively verified and
found sound. Neither blocks dogfooding the core logging loop; both should be closed before the
phase is considered fully done, since they are explicit textual requirements (LOG-15, LOG-16) and
explicit plan must-haves (D-15), not incidental polish.

Separately, all review findings from `05-REVIEW.md` (3 critical, 3 warning) were independently
re-confirmed fixed by running each finding's own regression test in isolation — this is not merely
trusting `05-REVIEW-FIX.md`'s narrative.

---

_Verified: 2026-08-25T07:45:16Z_
_Verifier: Claude (gsd-verifier)_
