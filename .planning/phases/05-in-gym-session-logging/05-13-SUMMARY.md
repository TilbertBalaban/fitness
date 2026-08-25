---
phase: 05-in-gym-session-logging
plan: 13
subsystem: docs
tags: [ui-spec, design-contract, api-coverage, expo-notifications, notification-api]

requires:
  - phase: 05-in-gym-session-logging (05-01..05-10)
    provides: the base 05-UI-SPEC.md contract (Set Row, Per-Exercise Action Bar, Session Modes, SessionActionSheet) and the shipped rest-alert.ts/rest-alert.web.ts notification seam this plan re-documents
provides:
  - "Amendment A in 05-UI-SPEC.md: A.1 set-row long-press note affordance, A.2 session Menu Note row, A.3 ReorderExercisesSheet contract"
  - "New E12 (Reorder Exercises Sheet) and E13 (Session Menu) UI Considerations blocks, 9 states each, all explicit"
  - "COVERAGE.md: reasoned expo-notifications (native) and browser Notification API (web) capability matrices"
affects: [05-14, 05-15]

actuals:
  tokens: 5800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Gap-closure amendment sections are appended additively (Amendment A) rather than rewriting existing E-blocks in place, so the original contract stays auditable next to the amendment"
    - "A second SDK integration serving the same need (native expo-notifications + browser Notification API) is re-decided from the same full-INTEGRATE baseline in its own COVERAGE.md matrix rather than inheriting the first surface's opt-outs"

key-files:
  created:
    - .planning/phases/05-in-gym-session-logging/COVERAGE.md
  modified:
    - .planning/phases/05-in-gym-session-logging/05-UI-SPEC.md

key-decisions:
  - "Long-press note trigger is attached to every nested Pressable in SetRowView (not just the row container), since a child Pressable swallows the gesture from its parent — plus an accessibilityActions 'note' entry as the non-gestural equivalent for screen-reader users"
  - "ReorderExercisesSheet measures its first row's onLayout height as the drag unit (falling back to reorder-drag.ts's SLOT_ROW_HEIGHT before first layout) so large-OS-font-scale row growth never desyncs the drop arithmetic from the rendered row height"
  - "SESSION_EXERCISE_ACTIONS keeps its fixed arity of four — Reorder becomes actionable via A.3, not a fifth row"
  - "Session Note row is live-mode only because the session Menu itself only renders in live mode; editing/summary-correction expose only the exercise-level note, stated explicitly per D-32/R10"
  - "COVERAGE.md Matrix 2 (browser Notification API) is re-decided from a full-INTEGRATE baseline independently of Matrix 1, per the 'second integration against the same need' rule — it does not inherit native's opt-outs"
  - "Updated the UI Considerations Coverage summary line (80→98 applicable/resolved, 74→92 explicit) to stay accurate after adding E12/E13's 18 new explicit state rows — not required by the plan's acceptance criteria but left stale would misstate the artifact"

patterns-established:
  - "Amendment sections are dated (2026-08-25) so a later reader can tell contract age from the section heading itself"

requirements-completed: [LOG-14, LOG-16]

coverage:
  - id: D1
    description: "05-UI-SPEC.md Amendment A adds written contracts for the set-row note long-press (A.1), the session Menu Note row (A.2), and the new ReorderExercisesSheet (A.3), plus new E12/E13 UI Considerations blocks with all nine states each explicit"
    requirement: LOG-14
    verification:
      - kind: other
        ref: "grep -c 'Amendment A — Gap-Closure Surfaces' / '### E12 — Reorder Exercises Sheet' / '### E13 — Session Menu' .planning/phases/05-in-gym-session-logging/05-UI-SPEC.md — each returns 1; E12 block contains 9 state rows"
        status: pass
    human_judgment: false
  - id: D2
    description: "COVERAGE.md provides reasoned expo-notifications (native) and browser Notification API (web) capability matrices, closing the api-coverage.verify-pre seal gate"
    requirement: LOG-16
    verification:
      - kind: other
        ref: "node .claude/gsd-core/bin/gsd-tools.cjs check api-coverage.verify-pre .planning/phases/05-in-gym-session-logging"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-25
status: complete
---

# Phase 5 Plan 13: Gap-Closure UI Contracts and API Coverage Matrix Summary

**Amendment A to 05-UI-SPEC.md (set-row note long-press, session Menu Note row, ReorderExercisesSheet) plus a reasoned expo-notifications/browser-Notification COVERAGE.md, closing both the E10 Reorder no-op gap and the seal-blocking api-coverage.verify-pre gate.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-25T16:22Z (approx, per STATE.md)
- **Completed:** 2026-08-25
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Wrote `## Amendment A — Gap-Closure Surfaces (2026-08-25)` in `05-UI-SPEC.md` with three previously-unspecified contracts: A.1 set-row long-press note (with the nested-Pressable coexistence rule and the accessibility-action equivalent), A.2 the session Menu's new Session Note row, and A.3 the new `ReorderExercisesSheet` component (reusing `reorder-drag.ts`'s pure drop arithmetic and Phase 4's `DragHandle`/`.web.tsx` verbatim).
- Added one new row each to E4 (Set Row) and E7 (Active Workout screen)'s existing UI Considerations tables, and two full new blocks — E12 (Reorder Exercises Sheet, 9 states) and E13 (Session Menu, 9 states) — all `explicit`, none `⚠ backstop`.
- Preserved `SessionActionSheet`'s fixed arity of four rows in writing — Reorder becomes actionable, not a fifth row.
- Recorded the five out-of-scope backstops (E8, E9 ×2, E11 ×2) as still open and unresolved after gap closure in the Backstop Summary, so they stay visible rather than silently dropped.
- Produced `COVERAGE.md` with two capability matrices (native `expo-notifications`, web `Notification` API), every row `INTEGRATE` or a reasoned `OPT-OUT`, flipping `api-coverage.verify-pre` from `passed: false, block: true` to `passed: true, block: false`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Amend 05-UI-SPEC.md with the three missing surface contracts** - `ab1c030` (docs)
2. **Task 2: Produce the API coverage matrix** - `e826afa` (docs)

**Plan metadata:** committed separately per worktree convention — orchestrator commits STATE.md/ROADMAP.md updates after wave completion; this SUMMARY.md is committed with the plan's per-task commits protocol.

## Files Created/Modified
- `.planning/phases/05-in-gym-session-logging/05-UI-SPEC.md` - Amendment A (A.1–A.3), E4/E7 table row additions, new E12/E13 blocks, Backstop Summary line, Coverage count update
- `.planning/phases/05-in-gym-session-logging/COVERAGE.md` - new file: two reasoned capability matrices for the rest-timer notification surface

## Decisions Made
- Long-press handler is attached to every nested `Pressable` in `SetRowView`, not just the row container, because a child `Pressable` swallows the parent's gesture — the plan's own read-first list called this out and A.1 states it explicitly.
- `ReorderExercisesSheet`'s drag unit is measured via `onLayout` (falling back to `SLOT_ROW_HEIGHT`) rather than a fixed constant, so large-OS-font-scale row growth never desyncs the drop math from the rendered row height.
- `SESSION_EXERCISE_ACTIONS` keeps its fixed arity of four — verified the literal constant name and arity language appear in A.3.
- COVERAGE.md's Matrix 2 (browser `Notification` API) was re-decided from a full-INTEGRATE baseline rather than inheriting Matrix 1's native opt-outs, per the "second integration against the same need" rule (e.g. `tag`/`renotify` coalescing is OPT-OUT on web for a different reason — D-27's single-pending-alert model already prevents duplicates — than native's badge-count opt-out).
- Updated the `## UI Considerations` `**Coverage:**` summary line (80→98 applicable, 74→92 explicit) to reflect the 18 new explicit state rows E12/E13 add — the plan's acceptance criteria didn't require this, but leaving the count stale would have made the artifact self-contradictory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Trimmed five COVERAGE.md cells that exceeded the schema's length limits**
- **Found during:** Task 2, first `api-coverage.verify-pre` run
- **Issue:** `check api-coverage.verify-pre` rejected the initial matrix with 6 schema errors — 4 `OPT-OUT`/`INTEGRATE` reason cells over the 200-char limit and 1 capability-name cell (`ServiceWorker showNotification (persistent notifications surviving a closed tab)`) over the 80-char limit.
- **Fix:** Rewrote the five offending cells (Notification response listeners, Notification categories and interactive actions, Badge count, Visibility-change re-arm, ServiceWorker `showNotification`) to carry the same reasoning in fewer characters — no capability or decision was changed, only the cell text length.
- **Files modified:** `.planning/phases/05-in-gym-session-logging/COVERAGE.md`
- **Verification:** Re-ran `node .claude/gsd-core/bin/gsd-tools.cjs check api-coverage.verify-pre .planning/phases/05-in-gym-session-logging` — `"passed": true, "block": false"`.
- **Committed in:** `e826afa` (Task 2 commit — the fix was applied before the first commit, so no separate fix-up commit exists)

---

**Total deviations:** 1 auto-fixed (1 blocking — schema-limit trim, no semantic change)
**Impact on plan:** Cosmetic only; every capability decision and reason from the original draft survived, just phrased more tersely to fit the gate's length limits.

## Issues Encountered
None beyond the deviation above.

## User Setup Required

None - no external service configuration required. This plan writes two markdown design/coverage artifacts and ships no executable code (per the plan's own threat model: "no runtime boundary").

## Next Phase Readiness
- 05-14 (set-row note affordance + Session Note row) and 05-15 (Reorder Exercises sheet) now have a written, state-complete contract to implement against — A.1/A.2 for 05-14, A.3 for 05-15.
- `api-coverage.verify-pre` no longer blocks the Phase 5 seal.
- The five out-of-scope backstops (E8 Home banner error, E9 Workout Summary empty/error, E11 History row anatomy/partial) remain explicitly open in the Backstop Summary — not this run's scope, and not silently dropped.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-25*
