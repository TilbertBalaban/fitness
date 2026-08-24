---
phase: 05-in-gym-session-logging
plan: 03
subsystem: api
tags: [sync, postgres, drizzle, nestjs, personal-record, patch-update-set]

requires:
  - phase: 05-in-gym-session-logging
    provides: "05-02's ten new columns (workout_session notes/name/paused_at/accumulated_paused_seconds/rest_target_at, session_exercise notes/removed_at, logged_set notes, user_preference auto_advance_enabled/warmup_sets_enabled) and three CHECK constraints, plus the WORKOUT_SESSION_STATUSES/SET_TYPES/PR_TYPES tuples in packages/api-contracts"
provides:
  - "personal_record's server-side apply path: pushed PR ops reach Postgres instead of unknown_table"
  - "Narrow PATCH support for notes (three tables), pause accounting, and the two workout preferences"
  - "SESSION_STATUSES/SET_TYPES/PR_TYPES validator Sets built from @fitness/api-contracts tuples, not retyped literals"
affects: [05-04, 05-08, phase-09-records-analytics]

actuals:
  tokens: 17878
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Singleton root fallback values must satisfy any Postgres CHECK constraint on that column, not just be type-valid — Postgres validates CHECK on the tentative INSERT row of an onConflictDoUpdate BEFORE it determines there is a conflict to fall back to UPDATE for, so an empty-string fallback that would be filtered out of the actual PATCH update set still fails the INSERT attempt."

key-files:
  created:
    - apps/api/test/personal-record-sync.e2e-spec.ts
    - apps/api/test/session-annotations-sync.e2e-spec.ts
    - .planning/phases/05-in-gym-session-logging/deferred-items.md
  modified:
    - apps/api/src/sync/sync.service.ts
    - apps/api/src/sync/patch-update-set.ts
    - packages/api-contracts/src/sync.ts
    - apps/api/src/sync/__tests__/patch-update-set.spec.ts
    - .planning/WINDOWS.md

key-decisions:
  - "personal_record's prType fallback (when a PATCH omits pr_type) is a real PR_TYPES member ('heaviest_weight'), never an empty string — matching toRoutineCycleValues' kind ?? 'training' precedent, because the empty-string fallback fails the Postgres CHECK constraint even on the update-via-conflict path."
  - "hasInvalidField's personal_record branch follows the plan's literal 'checked only when present' wording for pr_type/exercise_id/value, not session_exercise's absent-is-invalid FK guard — the CHECK-constraint-safe fallback for prType makes this safe for the CHECK; exercise_id's FK is not re-validated on the update-via-conflict path (a narrower version of the already-documented WINDOWS #31 gap), left as-is per the plan's explicit spec rather than expanded beyond scope."

requirements-completed: [LOG-13, LOG-16, LOG-18]

coverage:
  - id: D1
    description: "personal_record gains a server-side apply path: PUT/PATCH ops reach Postgres attributed to the pusher's own user id, validated against PR_TYPES and isNonNegativeDecimalOrNull, rejected invalid_field otherwise"
    requirement: "LOG-18"
    verification:
      - kind: e2e
        ref: "apps/api/test/personal-record-sync.e2e-spec.ts#personal_record sync (e2e)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Session validator Sets (SESSION_STATUSES, SET_TYPES, PR_TYPES) are built from @fitness/api-contracts tuples, never retyped literals"
    verification:
      - kind: unit
        ref: "apps/api/src/sync/__tests__/patch-update-set.spec.ts#patchAwareSet"
        status: pass
      - kind: e2e
        ref: "apps/api/test/session-annotations-sync.e2e-spec.ts#LOG-12: pause accounting"
        status: pass
    human_judgment: false
  - id: D3
    description: "Notes on workout_session, session_exercise and logged_set apply as narrow PATCHes (LOG-16): idempotent re-push, JSON-null clear, omitted-key survives, full-row equality on every other column"
    requirement: "LOG-16"
    verification:
      - kind: e2e
        ref: "apps/api/test/session-annotations-sync.e2e-spec.ts#LOG-16: notes at three levels"
        status: pass
    human_judgment: false
  - id: D4
    description: "The two workout preferences (auto_advance_enabled, warmup_sets_enabled) are patchable columns on user_preference, defaulting true on a fresh row"
    requirement: "LOG-13"
    verification:
      - kind: e2e
        ref: "apps/api/test/session-annotations-sync.e2e-spec.ts#LOG-13/LOG-17: workout preferences"
        status: pass
    human_judgment: false
  - id: D5
    description: "Pause accounting (paused_at, accumulated_paused_seconds, status=paused) applies as narrow PATCHes without touching neighbouring columns"
    verification:
      - kind: e2e
        ref: "apps/api/test/session-annotations-sync.e2e-spec.ts#LOG-12: pause accounting"
        status: pass
    human_judgment: false
  - id: D6
    description: "PowerSync Service pull-side delivery of personal_record to a second device (LOG-18's cross-device half)"
    verification: []
    human_judgment: true
    rationale: "The plan's own backstop truth: only the already-shipped sync-rules.yaml SELECT query is asserted, not a running service — a live cross-device pull needs the self-hosted PowerSync Service restarted against the current rules, deferred to ROADMAP Phase 999.1's native/cross-device UAT sweep (WINDOWS #110)."

duration: 30min
completed: 2026-08-24
status: complete
---

# Phase 05 Plan 03: Sync Apply Path for personal_record, Notes, Pause and Workout Preferences Summary

**personal_record gained a server-side singleton-root apply path (D-30's transport half) and three annotation surfaces — notes on three tables, pause accounting, and two workout preferences — became narrow-PATCH-able columns validated against 05-02's published tuples.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-24T08:44:00Z (approx.)
- **Completed:** 2026-08-24T09:00:20Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `SESSION_STATUSES`/`SET_TYPES`/`PR_TYPES` are now built from `@fitness/api-contracts` tuples instead of retyped literal Sets — `SESSION_STATUSES` picks up `paused`, which is what makes D-29's pause writable through sync at all.
- `workout_session` gained five patchable columns (`notes`, `name`, `paused_at`, `accumulated_paused_seconds`, `rest_target_at`); `session_exercise` gained two (`notes`, `removed_at`); `logged_set` gained one (`notes`); `user_preference` gained two (`auto_advance_enabled`, `warmup_sets_enabled`) — each validated in `hasInvalidField` and mapped through `patchAwareSet` so a PATCH writes only the columns it names.
- `personal_record` is wired as a fifth singleton root across all four maps (`TABLE_MAP`, `SINGLETON_ROOT_TYPES`, `ROOT_TABLE_BY_TYPE`, `AGGREGATE_RANK`), with ownership resolved through the authenticated session (never `data.user_id`) and validated against `PR_TYPES` / `isNonNegativeDecimalOrNull`. Moved from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES` in `packages/api-contracts/src/sync.ts`.
- Two new e2e specs against real Postgres: `personal-record-sync.e2e-spec.ts` (6 cases: valid PUT, cross-user ownership, invalid `pr_type`, negative `value`, direct-INSERT CHECK-constraint backstop, narrow `reconciled_at`-only PATCH) and `session-annotations-sync.e2e-spec.ts` (11 cases covering notes/pause/preferences).
- `.planning/WINDOWS.md` entry #19 amended in place (not renumbered) — the stale "9 tables with no apply path" claim corrected: Phase 4 already wired six, this plan wires the seventh (`personal_record`), leaving `equipment_profile`, `body_metric`, `progress_photo`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Source every session validator from the published tuples and make the new columns patchable** - `2befe3a` (feat)
2. **Task 2: Wire personal_record's apply path as a singleton root** - `27492a1` (feat)
3. **Task 3: Prove notes, pause and the workout preferences round-trip, and correct the stale ledger entry** - `6e0f8a2` (test)

_Note: Task 1's commit also includes `PersonalRecordValues`/`PERSONAL_RECORD_PATCH_FIELDS` in `patch-update-set.ts`, authored ahead of Task 2 in the same file-editing pass — a minor task-boundary blur, not a functional issue (both tasks' verify commands passed independently at their respective checkpoints)._

## Files Created/Modified

- `apps/api/src/sync/sync.service.ts` - tuple-sourced validator Sets, `PR_TYPES`, new OpData fields, `toPersonalRecordValues`/`normalizeNotes`/`normalizeRequiredDecimal`, `hasInvalidField` branches for the new columns and `personal_record`, ownership-resolution query for `personal_record`, apply-block branch
- `apps/api/src/sync/patch-update-set.ts` - extended `WorkoutSessionValues`/`SessionExerciseValues`/`LoggedSetValues`/`UserPreferenceValues` and their `PATCH_FIELDS` maps; new `PersonalRecordValues`/`PERSONAL_RECORD_PATCH_FIELDS`
- `packages/api-contracts/src/sync.ts` - `personal_record` moved `PUSH_DEFERRED_TABLES` → `PUSH_APPLIED_TABLES`; ownership comments corrected
- `apps/api/src/sync/__tests__/patch-update-set.spec.ts` - existing builder functions and "every mutable column" assertions updated for the new required `Values` fields (Rule 3 fix, see Deviations)
- `apps/api/test/personal-record-sync.e2e-spec.ts` - new, 6 cases
- `apps/api/test/session-annotations-sync.e2e-spec.ts` - new, 11 cases
- `.planning/WINDOWS.md` - entry #19 amended in place; new entry (id 110) for the PowerSync Service pull-side backstop
- `.planning/phases/05-in-gym-session-logging/deferred-items.md` - new, logs an out-of-scope pre-existing test failure (see Issues Encountered)

## Decisions Made

- `personal_record.prType`'s absent-PATCH fallback is `'heaviest_weight'` (a real `PR_TYPES` member), not `''` — Postgres validates the `personal_record_pr_type_check` CHECK constraint against the tentative `INSERT` row of an `onConflictDoUpdate` *before* it determines there is a conflict to fall back to `UPDATE` for. An empty-string fallback (which `patchAwareSet` would have filtered out of the real update `set` clause) still failed the `INSERT` attempt itself, throwing `server_error` on every narrow PATCH that omitted `pr_type` — including the plan's required "PATCH naming only `reconciled_at`" case. Fixed by mirroring the file's existing convention (`toRoutineCycleValues`' `kind ?? 'training'`, `toExerciseValues`' `loadType ?? 'external_weight'`): fallback values must satisfy any CHECK constraint on that column, not just be type-valid.
- `hasInvalidField`'s `personal_record` branch follows the plan's literal "checked only when present" wording for `pr_type`/`exercise_id`/`value`, deliberately not adopting `session_exercise`'s absent-is-invalid FK guard. This is safe for the CHECK constraint (fixed above) but leaves the same narrower FK gap WINDOWS #31 already documents for `session_exercise`/`routine_exercise`: a PATCH-as-insert against a genuinely new id with no `exercise_id` would insert an empty-string FK, since foreign-key enforcement is an `AFTER` trigger that never fires on the conflict-detected-so-fall-back-to-UPDATE path. Followed the plan's explicit spec rather than expanding scope to close this; flagged here for visibility, not filed as a new WINDOWS entry since it's a variant of an already-tracked class of gap, not a fresh discovery.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `personal_record.prType`'s absent-value fallback failed the Postgres CHECK constraint on every PATCH**
- **Found during:** Task 2 (writing `personal-record-sync.e2e-spec.ts`'s narrow-PATCH case)
- **Issue:** `toPersonalRecordValues` defaulted `prType: d.pr_type ?? ''` — a PATCH naming only `reconciled_at` built an `INSERT ... ON CONFLICT DO UPDATE` whose tentative row had `pr_type: ''`, which Postgres validates against `personal_record_pr_type_check` before determining the row conflicts, throwing a `server_error` instead of applying the narrow patch.
- **Fix:** Changed the fallback to `'heaviest_weight'`, a real `PR_TYPES` member — matching the file's established "fallback must satisfy any CHECK constraint" convention used elsewhere (`toRoutineCycleValues`, `toExerciseValues`).
- **Files modified:** `apps/api/src/sync/sync.service.ts`
- **Verification:** `personal-record-sync.e2e-spec.ts`'s "a PATCH naming only reconciled_at leaves value and pr_type unchanged" case passes.
- **Committed in:** `27492a1` (Task 2 commit)

**2. [Rule 3 - Blocking] Existing `patch-update-set.spec.ts` unit tests broke on the new required `Values` fields**
- **Found during:** Task 1, running `pnpm --filter api test`
- **Issue:** Adding `notes`/`name`/`pausedAt`/`accumulatedPausedSeconds`/`restTargetAt` to `WorkoutSessionValues` (and the analogous new fields on `SessionExerciseValues`/`LoggedSetValues`) as required (non-optional) interface fields broke three existing test-file builder functions (missing properties) and three "PATCH naming every mutable column returns every key" assertions (missing the new columns from both the builder defaults and the PATCH payload).
- **Fix:** Added the new fields to each builder function's defaults and to the three "every mutable column" test payloads.
- **Files modified:** `apps/api/src/sync/__tests__/patch-update-set.spec.ts`
- **Verification:** `pnpm --filter api test -- patch-update-set` — 19/19 pass.
- **Committed in:** `2befe3a` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were required for the plan's own acceptance criteria (narrow PATCH working end-to-end, `pnpm --filter api typecheck`/`test` green) to hold. No scope creep.

## Issues Encountered

- **This worktree had no `.env` file** (both `.env` and `.env.example` are outside this agent's read-permitted paths). Created a minimal local `.env` with only `DATABASE_URL=postgresql://postgres:dev@localhost:5432/fitness` (matching `docker-compose.dev.yml`'s already-running `postgres` container) so `drizzle-kit push` and the e2e specs could run. It is git-ignored (`.gitignore` line 6) and was not committed.
- **`powersync-token.e2e-spec.ts` fails locally** (all 5 cases, `503`/thrown missing-env-var) because the minimal `.env` above has no `POWERSYNC_JWT_SECRET`/`POWERSYNC_URL`, and the already-running `fitness-powersync-1` container's JWKS is pinned to a secret from whatever session originally started it. This is unrelated to this plan's file scope (JWT minting, not sync push) — logged to `.planning/phases/05-in-gym-session-logging/deferred-items.md` rather than fixed, per the SCOPE BOUNDARY rule. All 20 other e2e suites (241/246 tests) pass, including both of this plan's new specs and the `sync-push`/`sync-aggregate` regression checks.
- **WINDOWS ledger id collision risk under concurrent wave-2 appends:** the new pull-side-backstop entry landed as id 110 (computed as this worktree's local `max(existing ids) + 1`), not inside the plan's advisory 123–132 range — `gsd-tools windows append` has no `--id` override and its own doc comment states the append path is "NOT safe for concurrent writers" in a multi-worktree wave. If 05-04 or 05-05 also append in this same wave, their worktrees may independently compute the same next id, which the merge process will need to reconcile (documented here for the orchestrator's awareness, not something a single plan-scoped worktree can resolve).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `personal_record`'s push half is complete and tested; the pull half (PowerSync Service delivering it to a second device) rests on the already-shipped `sync-rules.yaml` query and is tracked as an unrun-verify (WINDOWS #110) for the ROADMAP Phase 999.1 native/cross-device UAT sweep.
- Notes, pause and preference PATCH support is ready for 05-04/05-05's client-side builders to consume — the wire contract (snake_case keys, narrow-PATCH semantics) matches `packages/api-contracts/src/session.ts`'s published shape.
- No blockers for dependent plans in this wave; `@fitness/pr-rules` (05-04's Task 1) was read-only referenced in this plan's context, never imported (05-03 is transport-only, per the plan's explicit boundary).

---
*Phase: 05-in-gym-session-logging*
*Completed: 2026-08-24*
