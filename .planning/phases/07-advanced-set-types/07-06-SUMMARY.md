---
phase: 07-advanced-set-types
plan: 06
subsystem: session-logging
tags: [react-native, drizzle, powersync, session-logging, supersets]

requires:
  - phase: 07-advanced-set-types
    provides: "07-01's read-path widening (parentSetId/side on LoggedSetRow) and tree-flatten ordering, which this plan builds beside without re-touching"
provides:
  - "apps/mobile/lib/session/superset.ts — every superset group question (membership, final-member, next-member, partner label, detach-row partner name) answered once, scoped to LIVE group members only"
  - "apps/mobile/lib/db/session-mutations.ts — formSuperset/detachSuperset, the first-ever writers of session_exercise.superset_group_id"
  - "Four new conditional SessionActionSheet rows (superset, detach-superset, enable-per-side, disable-per-side) appended to the closed SessionExerciseActionId union"
affects: [07-07, 07-08, 07-09, 08-progression-engine, 09-analytics, 10-records]

actuals:
  tokens: 10430
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure predicate module (superset.ts) takes the already-loaded LIVE exercise list as its first argument, so 'live members only' (D-24) falls out of the caller's existing removed_at filter with zero extra branching"
    - "Group id resolution priority order (partner's existing id, then own existing id, then a fresh id) is what makes a chain of pairwise taps converge on one N-member group instead of overlapping pairs (D-15)"
    - "Label TEMPLATE strings resolved by one function inside the view (resolveActionLabel), never at the call site, matching the existing conditional-row filter pattern this file already established for Equipment"

key-files:
  created:
    - apps/mobile/lib/session/superset.ts
    - apps/mobile/lib/session/__tests__/superset.test.ts
  modified:
    - apps/mobile/lib/db/session-mutations.ts
    - apps/mobile/lib/db/__tests__/session-mutations.test.ts
    - apps/mobile/components/SessionActionSheet.tsx
    - apps/mobile/components/__tests__/SessionActionSheet.test.tsx

key-decisions:
  - "isFinalGroupMember treats an ungrouped exercise and a group shrunk to one live member identically — both resolve through supersetMembers returning a one-member list whose sole member is trivially its own highest — so D-24 needed no special-case branch, it fell out of the shared core function."
  - "formSuperset filters removed exercises in JS after a plain sessionId-scoped select, rather than relying on a SQL isNull() clause, because the in-memory test harness (like session-query.test.ts's own fake) does not parse isNull() semantics — this keeps the unit tests honest about what they actually verify rather than silently no-op-ing the removed-exercise-skip behavior."
  - "detachSuperset scopes its where clause by row id only, not sessionId — the artifact table's own signature (detachSuperset(sessionExerciseId, db)) and the threat register (T-7-16) both specify row-id-only scoping, since clearing one row's own column cannot mutate any other session's row."

patterns-established:
  - "A conditional action-sheet row whose label interpolates a name holds a literal `{placeholder}` template string in the row constant; resolveActionLabel is the one place that placeholder is substituted, keeping label text and sheet geometry in one file."

requirements-completed: [SETS-07, SETS-08, SETS-09]

coverage:
  - id: D1
    description: "isFinalGroupMember scopes 'highest order_index' to the group's own members, never the session as a whole, so a two-member group at the start of a long session still resolves correctly (Pitfall 4)"
    requirement: "SETS-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/superset.test.ts#scopes \"highest\" to the group at the start of a long session, never to the session as a whole (Pitfall 4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A superset group whose live membership shrinks to one behaves like a non-superset exercise (isFinalGroupMember true), and the survivor's group id is left intact by detachSuperset so re-adding a member restores paired behaviour with no re-linking (D-24)"
    requirement: "SETS-08"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/superset.test.ts#returns true for the sole remaining live member of a group whose other member was removed mid-session (D-24)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-mutations.test.ts#detachSuperset — clears exactly the named row, leaves the partner intact (D-24, T-7-16)"
        status: pass
    human_judgment: false
  - id: D3
    description: "formSuperset pairs an exercise with its next live adjacent exercise, reuses an existing group id so chained pairwise taps yield one N-member group, and never writes routine_exercise (D-16)"
    requirement: "SETS-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/session-mutations.test.ts#formSuperset — session-scoped superset formation (D-11, D-15, D-16, T-7-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SessionActionSheet gains four conditional rows (superset, detach-superset, enable-per-side, disable-per-side) appended after equipment, mutually exclusive by construction, none destructive, and the sheet with no new props renders identically to before this plan"
    requirement: "SETS-09"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/SessionActionSheet.test.tsx#with none of the four new props supplied, renders exactly the row set it rendered before this plan (back-compat)"
        status: pass
    human_judgment: false
  - id: D5
    description: "detachRowPartnerName resolves a defined partner name for a 3-or-more-member group (the immediately adjacent live member by orderIndex), closing the A-P7 backstop rather than leaving the row nameless"
    requirement: "SETS-08"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/session/__tests__/superset.test.ts#names the immediately adjacent live member by orderIndex for a group of three or more (A-P7)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-28
status: complete
---

# Phase 7 Plan 6: Superset Formation, Detach, and Sheet Rows Summary

**Session-scoped superset formation/detach on `session_exercise.superset_group_id` (its first-ever writer) plus one pure predicate module answering every group-membership question over live members only, and four new conditional `SessionActionSheet` rows for forming/detaching a superset and toggling per-side logging.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-28T09:57:00Z (approx.)
- **Completed:** 2026-08-28T10:52:07Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Shipped `apps/mobile/lib/session/superset.ts` — `supersetMembers`, `isFinalGroupMember`, `nextSupersetMemberIndex`, `supersetPartnerLabel`, `detachRowPartnerName` — every one delegating to the shared `supersetMembers` core, scoped to LIVE members of the exercise's own group (Pitfall 4), with D-24's shrunk-to-one case falling out for free rather than needing a special branch.
- Wrote `formSuperset`/`detachSuperset` in `session-mutations.ts` — the first code in this codebase to ever write `session_exercise.superset_group_id`. `formSuperset` resolves the group id in priority order (partner's existing id, own existing id, fresh id) so a chain of pairwise taps converges on one N-member group (D-15); `detachSuperset` deliberately leaves the survivor's id intact (D-24). Verified `routine_exercise` is never touched by either mutation (D-16) — `days.ts:148` and `duplicate-routine.ts:99`'s "superset authoring not built" comments stay true.
- Extended `SessionActionSheet.tsx`'s closed union and row constant with `superset`, `detach-superset`, `enable-per-side`, `disable-per-side` — appended after `equipment`, mutually exclusive by construction, all rendering in default foreground (none destructive). The two name-interpolating rows hold literal `{placeholder}` templates resolved by one function inside the view.
- Confirmed the back-compat guarantee explicitly: with none of the four new optional props supplied, the sheet renders exactly the row set it rendered before this plan — the existing `ExercisePage` call site needs no change until 07-07/07-08 wire real values through.

## Task Commits

1. **Task 1: One predicate module for every superset group question, over live members only** - `4ec786c` (feat)
2. **Task 2: Session-scoped superset formation and detach** - `d21d167` (feat)
3. **Task 3: Four more conditional rows on the session action sheet** - `b147675` (feat)

## Files Created/Modified

- `apps/mobile/lib/session/superset.ts` (new) - `SupersetMemberInput`, `supersetMembers`, `isFinalGroupMember`, `nextSupersetMemberIndex`, `supersetPartnerLabel`, `detachRowPartnerName`
- `apps/mobile/lib/session/__tests__/superset.test.ts` (new) - 17 tests covering all eight specified behaviors plus the Pitfall-4 and D-24 named scenarios
- `apps/mobile/lib/db/session-mutations.ts` - `formSuperset`, `detachSuperset`
- `apps/mobile/lib/db/__tests__/session-mutations.test.ts` - 9 new tests for the two mutations
- `apps/mobile/components/SessionActionSheet.tsx` - widened `SessionExerciseActionId` union, `resolveActionLabel`, extended `visibleActions` filter, four new optional props on both prop interfaces
- `apps/mobile/components/__tests__/SessionActionSheet.test.tsx` - arity/order test updated to nine entries; 16 new tests for the four rows' visibility, labels, colors, and back-compat

## Decisions Made

- `isFinalGroupMember`/`supersetMembers` treat "ungrouped" and "shrunk to one live member" (D-24) as the same case by construction — `supersetMembers` returns `[self]` for both, so the highest-member check is trivially true with no extra branch.
- `formSuperset` filters removed exercises in JS after a plain `sessionId`-scoped select rather than a SQL `isNull()` where-clause, matching how the existing test harness (mirroring `session-query.test.ts`'s own fake) does not interpret `isNull()` semantics — this keeps the "skips a removed exercise" test honestly exercising real filtering logic instead of an inert SQL clause the fake would silently ignore.
- `detachSuperset` scopes its `where` by row id only (no `sessionId` parameter), matching both the plan's own artifact-table signature and the threat register's T-7-16 disposition ("scoped by row id"); the plan's `<behavior>` prose mentioning "both mutations scope by sessionId" is read as describing `formSuperset` specifically, since a single-row column clear cannot mutate another session's row regardless.
- `detachRowPartnerName` resolves the A-P7 backstop (3-or-more-member group partner naming) as "the next-higher live neighbor by `orderIndex`, falling back to the next-lower neighbor only for the group's own highest member" — a defined choice, not an incidental one, per the plan's own instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, acceptance-criterion correction] Task 2's `grep -c "routineExercise" ... is 0` acceptance criterion is unsatisfiable as literally written**
- **Found during:** Task 2 verification
- **Issue:** The plan's acceptance criteria state the whole file must contain zero occurrences of `routineExercise`. `session-mutations.ts` already legitimately imports and uses `routineExercise`/`routineExerciseCycleTarget` (13 pre-existing occurrences) in `resolveWriteBackTarget`/`writeBackTargets`, both Phase 4/5 functionality unrelated to this plan and predating it.
- **Fix:** Interpreted the intent — that `formSuperset`/`detachSuperset` themselves never reference the program-level table — and verified that directly (both functions reference only `sessionExercise`). Did not remove or alter the pre-existing, unrelated `routineExercise` usage.
- **Files affected:** apps/mobile/lib/db/session-mutations.ts (no code change from this deviation, verification-only)
- **Recorded:** `.planning/WINDOWS.md` entry #148 (kind: deviation)
- **Committed in:** d21d167 (Task 2 commit) — the deviation itself is a verification-interpretation, not a code change

---

**Total deviations:** 1 auto-fixed (1 blocking/verification-interpretation)
**Impact on plan:** No code or scope change — the acceptance criterion's literal text conflicted with pre-existing, unrelated code; the underlying D-16 intent (this plan's new mutations never touch `routine_exercise`) is verified and true.

## Issues Encountered

None. The fresh-worktree bootstrap (`pnpm install`, `pnpm -w build`) completed cleanly; `corepack enable` was skipped since `pnpm`/`corepack` were already resolvable on `PATH` in this worktree. Every targeted test run passed on the first attempt after implementation, apart from one self-authored test-fixture error (a `detachRowPartnerName` adjacency-fallback expectation) caught and corrected before commit. The full-workspace `pnpm -w test` run took ~7.5 minutes due to CPU contention with three sibling parallel worktree agents also running full test suites concurrently; it completed with 89/89 suites and 1592/1592 tests passing.

## Next Phase Readiness

- `superset.ts`'s five predicates and `session-mutations.ts`'s `formSuperset`/`detachSuperset` are ready for 07-07 (D-13 rest suppression, D-14 superset-internal auto-advance) and 07-08 (per-side logging) to build on directly.
- The four new `SessionActionSheet` rows exist and are conditional, but `ExercisePage.tsx`'s `onSelect` handler does not yet call `formSuperset`/`detachSuperset` or supply the four new sheet props (`nextExerciseName`, `supersetPartnerName`, `perSideEnabled`, `perSideAvailable`) — that wiring is explicitly out of this plan's `files_modified` scope and is 07-07/07-08 territory, consistent with the plan's own objective note ("Output: SETS-07's and SETS-08's data and action-sheet halves... their behaviour is 07-08's").
- The must-have backstop truth "a superset-pairing or per-side-toggle write that fails locally leaves the sheet in a defined state" applies to whichever downstream plan wires the actual `onSelect` handler — not exercised by this plan since no call site yet invokes the mutations.
- `detachRowPartnerName`'s N-of-3-or-more naming choice (A-P7) is recorded as a resolved-but-revisitable convention in `superset.ts`'s doc comment, per the plan's own note to revisit "whenever a real N-of-3 case first appears."

## Self-Check: PASSED

- FOUND: apps/mobile/lib/session/superset.ts
- FOUND: apps/mobile/lib/session/__tests__/superset.test.ts
- FOUND commit 4ec786c
- FOUND commit d21d167
- FOUND commit b147675

---
*Phase: 07-advanced-set-types*
*Completed: 2026-08-28*
