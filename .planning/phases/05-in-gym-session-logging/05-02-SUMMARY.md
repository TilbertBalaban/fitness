---
phase: 05-in-gym-session-logging
plan: 02
subsystem: database

tags: [drizzle, postgres, sqlite, powersync, schema, vocabularies]

requires:
  - phase: 04-program-builder
    provides: routine/routine_cycle CHECK-constraint pattern (routine_status_check, routine_cycle_kind_check) this plan copies for session vocabularies
provides:
  - WORKOUT_SESSION_STATUSES, SET_TYPES, PR_TYPES published tuples in @fitness/api-contracts
  - Ten new Postgres + SQLite columns for notes, pause accounting, rest timer, session rename, non-destructive exercise removal, and auto-advance/warm-up preferences
  - workout_session_status_check, logged_set_set_type_check, personal_record_pr_type_check CHECK constraints, live in the database
  - docs/session-vocabularies.md
affects: [05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10]

actuals:
  tokens: 6809
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Published, additive-only vocabulary tuple in @fitness/api-contracts, mirrored by a Postgres CHECK built from the same literals — WORKOUT_SESSION_STATUSES/SET_TYPES/PR_TYPES follow ROUTINE_STATUSES/CYCLE_KINDS's exact shape (program.ts, program-vocabularies.md)."

key-files:
  created:
    - packages/api-contracts/src/session.ts
    - packages/api-contracts/src/__tests__/session.test.ts
    - docs/session-vocabularies.md
  modified:
    - apps/api/src/db/schema/session.ts
    - apps/api/src/db/schema/records.ts
    - apps/api/src/db/schema/preference.ts
    - apps/mobile/lib/db/schema.ts
    - apps/api/test/schema-parity.e2e-spec.ts
    - apps/api/test/user-exercise-preference.e2e-spec.ts

key-decisions:
  - "Task 1 checkpoint resolved as option-a (pre-decided by the user via the orchestrator before dispatch): three note columns, pause pair on workout_session, status vocabulary gains paused, PR_TYPES with its own CHECK. Notes-as-columns matches every other per-row annotation already in this schema (cue_text, instructions_text, routine_exercise.notes); a separate note table was rejected as speculative generality with no LOG-16 requirement for more than one note per entity."

patterns-established:
  - "Session vocabularies (WORKOUT_SESSION_STATUSES, SET_TYPES, PR_TYPES) are exported from packages/api-contracts/src/session.ts, not program.ts — a per-domain vocabulary file rather than one growing program.ts."

requirements-completed: [LOG-12, LOG-13, LOG-16, LOG-17]

coverage:
  - id: D1
    description: "WORKOUT_SESSION_STATUSES, SET_TYPES, PR_TYPES published as additive-only as const tuples in @fitness/api-contracts, with WORKING_SET_TYPE/WARMUP_SET_TYPE named constants"
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/session.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ten new columns (notes x3, name, paused_at, accumulated_paused_seconds, rest_target_at on workout_session; notes, removed_at on session_exercise; notes on logged_set; auto_advance_enabled, warmup_sets_enabled on user_preference) added identically to the Postgres schema and the mobile SQLite mirror"
    requirement: "LOG-12"
    verification:
      - kind: unit
        ref: "pnpm --filter api typecheck && pnpm --filter mobile typecheck"
        status: pass
      - kind: integration
        ref: "apps/api/test/schema-parity.e2e-spec.ts — column-presence and default-value cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "workout_session_status_check, logged_set_set_type_check and personal_record_pr_type_check CHECK constraints declared in Drizzle and pushed to the live Postgres database, each proven to reject an out-of-vocabulary direct INSERT"
    requirement: "LOG-17"
    verification:
      - kind: integration
        ref: "apps/api/test/schema-parity.e2e-spec.ts — constraint-definition and rejecting-INSERT teeth cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "docs/session-vocabularies.md documents all three vocabularies, the reserved-vs-written SET_TYPES split, and the notes/pause/rest-timer/rename/removal column semantics"
    verification:
      - kind: other
        ref: "docs/session-vocabularies.md exists and names all three enforcing constraints"
        status: pass
    human_judgment: false
  - id: D5
    description: "user_preference.auto_advance_enabled and warmup_sets_enabled both boolean not-null default true, riding the existing singleton root"
    requirement: "LOG-13"
    verification:
      - kind: integration
        ref: "apps/api/test/schema-parity.e2e-spec.ts — 'user_preference.auto_advance_enabled and warmup_sets_enabled are not-null with a true default'"
        status: pass
    human_judgment: false
  - id: D6
    description: "logged_set.notes independently readable/writable from session_exercise.notes and workout_session.notes — LOG-16 edge predicate for column independence"
    requirement: "LOG-16"
    verification: []
    human_judgment: true
    rationale: "Column independence is structurally true (three distinct columns on three distinct tables with no shared trigger or view) but was not separately exercised by an automated write/read test in this plan; 05-04+ exercises the write paths."

duration: 33min
completed: 2026-08-23
status: complete
---

# Phase 05 Plan 02: Session Schema & Vocabularies Summary

**Three published session vocabularies (WORKOUT_SESSION_STATUSES, SET_TYPES, PR_TYPES) with Postgres CHECK constraints, ten new Postgres+SQLite columns for notes/pause/rest-timer/rename/removal/preferences, pushed live and proven with rejecting-INSERT teeth tests**

## Performance

- **Duration:** 33 min
- **Started:** 2026-08-23T20:19:00+03:00 (approx.)
- **Completed:** 2026-08-23T20:52:00+03:00
- **Tasks:** 3 (Task 1 checkpoint pre-resolved, Task 2 auto, Task 3 auto/blocking)
- **Files modified:** 10

## Accomplishments
- Published `WORKOUT_SESSION_STATUSES`, `SET_TYPES`, `PR_TYPES` (plus `WORKING_SET_TYPE`/`WARMUP_SET_TYPE`) as additive-only tuples in `packages/api-contracts/src/session.ts`, re-exported from the barrel
- Added ten new columns identically to `apps/api/src/db/schema/*.ts` (Postgres) and `apps/mobile/lib/db/schema.ts` (SQLite): three independent `notes` columns, `workout_session.name`, the `paused_at`/`accumulated_paused_seconds` pause pair, `rest_target_at`, `session_exercise.removed_at`, `user_preference.auto_advance_enabled`/`warmup_sets_enabled`
- Declared and pushed three CHECK constraints (`workout_session_status_check`, `logged_set_set_type_check`, `personal_record_pr_type_check`) to the live database via `drizzle-kit push`, with no unanswered interactive prompt
- Extended `apps/api/test/schema-parity.e2e-spec.ts` with column-presence, default-value, constraint-definition and rejecting/accepting-INSERT teeth cases for all three constraints (32 schema-parity tests total, all passing)
- Wrote `docs/session-vocabularies.md` documenting all three vocabularies, the pause-accounting model, the reserved-vs-written `SET_TYPES` split, and the notes/rest-timer/rename/removal column semantics
- Full API e2e suite (19 suites / 229 tests) and repo-root `pnpm typecheck` / `pnpm lint` all green against the pushed database

## Task Commits

1. **Task 1: Confirm the four schema/vocabulary doors (checkpoint, pre-resolved as option-a) + Task 2: Publish vocabularies and add every Phase 5 column** - `34f5c1c` (feat)
2. **Task 3: Push the schema to the live database and give schema-parity teeth** - `4acb64c` (feat)

**Plan metadata:** (this commit, docs: complete plan)

_Task 1 produced no file changes of its own — its resolution (option-a) is recorded in this SUMMARY's `key-decisions` and folded into Task 2's commit, since the checkpoint gate itself has nothing to commit independently._

## Files Created/Modified
- `packages/api-contracts/src/session.ts` - Publishes `WORKOUT_SESSION_STATUSES`, `SET_TYPES`, `PR_TYPES`, `WORKING_SET_TYPE`, `WARMUP_SET_TYPE`
- `packages/api-contracts/src/index.ts` - Re-exports `./session`
- `packages/api-contracts/src/__tests__/session.test.ts` - Membership, length and ordering assertions for all three vocabularies
- `apps/api/src/db/schema/session.ts` - Ten Phase 5 columns plus `workout_session_status_check` and `logged_set_set_type_check`
- `apps/api/src/db/schema/records.ts` - `personal_record_pr_type_check`
- `apps/api/src/db/schema/preference.ts` - `auto_advance_enabled`, `warmup_sets_enabled`
- `apps/mobile/lib/db/schema.ts` - Mirrors all ten Phase 5 columns on the local SQLite side (with `.default()` matching each column's Postgres default, so existing insert call sites outside this plan's ownership keep typechecking)
- `apps/api/test/schema-parity.e2e-spec.ts` - Column-presence, default-value, constraint-definition and teeth cases for the three new constraints
- `apps/api/test/user-exercise-preference.e2e-spec.ts` - Fixed a pre-existing seed using the never-published `pr_type` literal `'e1rm'`, now correctly rejected by `personal_record_pr_type_check`
- `docs/session-vocabularies.md` - Reference documentation for all three vocabularies and the ten new columns

## Decisions Made
- **Task 1 (option-a, pre-resolved by the user via the orchestrator):** three note columns (not a separate note table), the `paused_at`/`accumulated_paused_seconds` pause pair on `workout_session`, `status` promoted to a published vocabulary that adds `paused`, and `PR_TYPES` as a published four-value vocabulary with its own CHECK. Rationale: matches the shipped `docs/program-vocabularies.md` precedent exactly; a note table or a deferred CHECK would add either a speculative join or let out-of-vocabulary rows land before the rule governing them exists (PITFALLS §11).
- Gave the mobile SQLite mirror's `accumulated_paused_seconds`, `auto_advance_enabled` and `warmup_sets_enabled` columns explicit `.default()` values matching their Postgres defaults (0 / true / true) rather than leaving them bare `.notNull()` like `completed`/`progressionFrozen` — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Copied the untracked repo-root `.env` into this worktree**
- **Found during:** Task 3 precondition check
- **Issue:** This git worktree has no `.env` file (gitignored, not carried by `git worktree add`), so `DATABASE_URL` was unresolved and `drizzle-kit push`/`db:verify` failed with "Either connection url or host, database are required." Postgres itself was confirmed reachable on `localhost:5432` before proceeding.
- **Fix:** Copied `/Users/tilbertbalaban/work/fitness/.env` (the main checkout's root `.env`) into this worktree's root, matching `drizzle.config.ts`'s existing `../../.env` lookup path. The file stays gitignored and untracked in this worktree.
- **Files modified:** none (untracked `.env`, not committed)
- **Verification:** `DATABASE_URL` resolved to `localhost:5432/fitness`; `pnpm --filter api db:push` and `db:verify` both succeeded
- **Committed in:** n/a (gitignored)

**2. [Rule 3 - Blocking] Added `.default()` to three new mobile SQLite columns**
- **Found during:** Task 2, `pnpm --filter mobile typecheck`
- **Issue:** `accumulated_paused_seconds`, `auto_advance_enabled` and `warmup_sets_enabled` were declared `.notNull()` with no default on the mobile SQLite side (matching `completed`/`progressionFrozen`'s bare-notNull style), which made them required in every insert's TypeScript type. Two existing insert call sites outside this plan's file ownership (`apps/mobile/lib/db/log-set.ts`, owned by 05-01; `apps/mobile/lib/db/programs/lifecycle.ts`) failed to typecheck because they don't yet supply these new fields.
- **Fix:** Added `.default(0)` to `accumulatedPausedSeconds` and `.default(true)` to both preference flags on the mobile schema only — mirroring the real defaults those same columns already carry on the Postgres side (`.notNull().default(0)` / `.notNull().default(true)`), which makes the fields optional in Drizzle's insert type without touching any file outside this plan's ownership.
- **Files modified:** `apps/mobile/lib/db/schema.ts`
- **Verification:** `pnpm --filter mobile typecheck` exits 0
- **Committed in:** 34f5c1c (Task 2 commit)

**3. [Rule 1 - Bug] Fixed a pre-existing test seeding an unpublished `pr_type`**
- **Found during:** Task 3, `pnpm --filter api test:e2e`
- **Issue:** `apps/api/test/user-exercise-preference.e2e-spec.ts`'s `seedPersonalRecord` helper inserted `pr_type = 'e1rm'`, a value that was never part of any published vocabulary. The new `personal_record_pr_type_check` constraint (required by this plan) correctly rejects it, breaking an unrelated pre-existing test.
- **Fix:** Changed the literal to `'best_e1rm'`, the correct published `PR_TYPES` value for the same concept.
- **Files modified:** `apps/api/test/user-exercise-preference.e2e-spec.ts`
- **Verification:** `pnpm --filter api test:e2e` — all 19 suites / 229 tests pass
- **Committed in:** 4acb64c (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All three fixes were necessary for the plan's own acceptance criteria (mobile typecheck, live db:push, full e2e green) to pass; none expand scope beyond what Task 2/3 already required.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required
None - no external service configuration required. `DATABASE_URL` is a local dev credential already present in the main checkout's `.env`; no new environment variable was introduced by this plan.

## Next Phase Readiness
- All three vocabularies, ten columns and three CHECK constraints are live in the database and ready for 05-03 (`sync.service.ts` validators) and the wave 2+ UI plans to build on.
- 05-01 (running in parallel in a sibling worktree) owns `apps/mobile/lib/db/log-set.ts`, `apps/mobile/lib/db/session-query.ts` and `apps/mobile/lib/db/test-support.ts` — those files will need to start supplying the new `notes`/pause/rest-timer/removal fields on their own insert/update paths once merged; this plan's `.default()` additions on the mobile schema keep them typechecking in the meantime but do not populate the new columns for them.
- No blockers for downstream plans.

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-23*
