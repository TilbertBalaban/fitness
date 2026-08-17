---
phase: 02-data-model-sync-engine
plan: 10
subsystem: database
tags: [drizzle, postgres, sync, null-handling, e2e-testing]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-03/02-04's sync push path (toLoggedSetValues, hasInvalidField, conflict logging) and the null-aware unit-conversion contract (toCanonicalKg/formatWeight) that Postgres now matches"
provides:
  - "logged_set.weight_kg nullable in Postgres, matching the mobile SQLite mirror and the units contract"
  - "A sync-service mapping and validator that distinguish absent, explicit-null and zero weight_kg through every stage: validation, insert, PATCH-preserving update, and conflict logging"
  - "apps/api/test/null-weight.e2e-spec.ts — the real-Postgres round-trip proof for the null-weight case, plus a fixed latent conflict-detection bug for null weights"
affects: [progressive-overload, volume-analytics, personal-records]

actuals:
  tokens: 2722
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Absent vs. explicit-null vs. real-value distinction, applied consistently: a key-presence check on the raw op.data object decides omission from an update, never a truthiness/undefined check on the already-mapped value (which would also swallow a legitimate null or zero)."

key-files:
  created:
    - apps/api/test/null-weight.e2e-spec.ts
    - .planning/phases/02-data-model-sync-engine/deferred-items.md
  modified:
    - apps/api/src/db/schema/session.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/src/sync/conflict-policy.ts

key-decisions:
  - "Task 1 (checkpoint:decision, resolved by the human user, not auto-mode): selected drop-not-null — drop Postgres logged_set.weight_kg's NOT NULL constraint rather than introduce a separate marker column for 'no external load'. Rationale: the mobile SQLite mirror (apps/mobile/lib/db/schema.ts, plan 02-04) and packages/api-contracts/src/units.ts (toCanonicalKg/formatWeight) already treat null as the sole representation of 'no external load'; Postgres was the last of four layers still forcing a non-null decimal. A second marker column would let two columns encode one fact and disagree, and would leave CR-02 open until the mobile schema and units contract were reworked too."
  - "isNonNegativeDecimalOrNull wraps isNonNegativeDecimal rather than replacing its logic, so the base validator's behavior for every other caller stays untouched — only the weight_kg branch of hasInvalidField gained the null exception."
  - "The PATCH-preserves-weight fix operates only on the onConflictDoUpdate 'set' object, never on the INSERT 'values' object — a brand-new row via PUT/PATCH still needs weightKg present (as null when absent) to avoid an insert-time NOT NULL surprise on other columns; only an update to an *existing* row must skip the column entirely to avoid clobbering it."

requirements-completed: [PLAT-08]

coverage:
  - id: D1
    description: "A logged set pushed with no weight lands in Postgres as SQL NULL, and reading it back returns null rather than a decimal"
    requirement: "PLAT-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts#PUT with weight_kg absent from data stores SQL NULL, and a read returns null"
        status: pass
    human_judgment: false
  - id: D2
    description: "A logged set pushed with a weight of zero and a logged set pushed with no weight both apply and remain distinguishable after the round trip"
    requirement: "PLAT-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts#a null-weight set and a zero-weight set pushed together both apply and stay distinct after the round trip"
        status: pass
    human_judgment: false
  - id: D3
    description: "A PATCH carrying an explicit null weight is applied, not rejected invalid_field, and the stored weight becomes NULL"
    requirement: "PLAT-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts#PATCH with weight_kg explicitly null is applied, not rejected, and the stored weight becomes NULL"
        status: pass
    human_judgment: false
  - id: D4
    description: "A PATCH that changes only reps leaves the previously-stored weight exactly as it was"
    requirement: "PLAT-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts#PATCH changing only reps, with weight_kg absent, leaves the previously-stored weight byte-identical"
        status: pass
    human_judgment: false
  - id: D5
    description: "A negative weight and a non-numeric weight are both still rejected invalid_field"
    requirement: "PLAT-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts#PUT with weight_kg of '-5' is rejected invalid_field"
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts#PUT with weight_kg of 'abc' is rejected invalid_field"
        status: pass
    human_judgment: false
  - id: D6
    description: "logged_set.weight_kg declares no NOT NULL constraint, and the live Postgres column matches after the schema push"
    requirement: "PLAT-08"
    verification:
      - kind: other
        ref: "psql information_schema.columns gate before/after pnpm --filter api db:push (recorded in this SUMMARY: NO -> YES)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A conflict-logged overwrite where the incoming weight is null records a real JSON null in sync_conflict_log, not the stringified word null"
    requirement: "PLAT-08"
    verification:
      - kind: e2e
        ref: "apps/api/test/null-weight.e2e-spec.ts#a conflict-logged overwrite with an incoming null weight records a real JSON null in sync_conflict_log, not the string \"null\""
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 10: Null-Weight Round Trip Summary

**Postgres `logged_set.weight_kg` is now nullable and the sync push path distinguishes absent, explicit-null and zero weight through validation, insert, PATCH-preserving update, and conflict logging — closing CR-02 and WINDOWS #20/#21.**

## Performance

- **Duration:** ~45 min (estimated — this executor resumed mid-plan from a Task 1 checkpoint already resolved by the human user; no formal start timestamp was captured for the resumed session)
- **Completed:** 2026-08-17T12:26:56Z
- **Tasks:** 2 (Task 1 was a decision checkpoint resolved before this executor was spawned — see Task 1 below)
- **Files modified:** 5 (3 source, 1 new test, 1 new deferred-items doc)

## Task 1 (resolved prior to this executor)

**Decision:** Drop the `NOT NULL` constraint on Postgres `logged_set.weight_kg`, or keep it and close CR-02 a different way.

**Selected option:** `drop-not-null`

**Decided by:** the human user, via an interactive decision prompt presented by the orchestrator (auto-mode was not active — `workflow.auto_advance=false` and `workflow._auto_chain_active=false` were both confirmed).

**Rationale (as presented and accepted):** Postgres was the last of four layers still forcing a non-null weight. `apps/mobile/lib/db/schema.ts` is already nullable and `packages/api-contracts/src/units.ts` (`toCanonicalKg`/`formatWeight`) already treats `null` as "no external load" distinct from zero — both delivered by plan 02-04. Keeping `NOT NULL` would mean two columns encoding one fact, able to disagree, and would leave CR-02 open until the mobile schema and units contract were reworked too. Dropping it aligns Postgres with the layers that already model this correctly, while a genuine `0` (e.g. assisted work) stays expressible and distinct from `null`.

This executor received the decision as already resolved and did not re-present it.

## Accomplishments

- Dropped `.notNull()` from `logged_set.weightKg` in `apps/api/src/db/schema/session.ts`, keeping `numeric('weight_kg', { precision: 8, scale: 3 })` unchanged otherwise.
- Replaced the zero-string fallback (`String(d.weight_kg ?? '0')`) in `toLoggedSetValues` with a `normalizeWeightKg` helper that maps both absent and explicit-null `weight_kg` to real `null`, never to the string `"0"`.
- Added `isNonNegativeDecimalOrNull` (a thin wrapper around the existing `isNonNegativeDecimal`) and applied it to the `weight_kg` branch of `hasInvalidField` only — `reps` and `set_index` keep the strict non-nullable integer check.
- Added `loggedSetUpdateSet`: a PATCH whose raw `data` omits the `weight_kg` key entirely now omits `weightKg` from `onConflictDoUpdate`'s `set`, so a reps-only edit no longer clobbers the stored weight to `0`/`null`. The check is on raw-key presence, not on the mapped value, so absent and explicit-null stay distinguishable.
- Fixed the conflict-log `winningValue` construction: an explicit incoming `null` weight now serializes as a real JSON `null` instead of `String(null)`'s four-character spelling `"null"`.
- **[Rule 1 auto-fix]** Found and fixed the same `String(null)` defect in `apps/api/src/sync/conflict-policy.ts`'s `loggedSetChangedFields` — newly reachable now that `weightKg` can be `null`, this bug would false-positive "changed" for a stored-null-vs-incoming-null pair (no real change) and would have gone undetected without the null-weight suite specifically exercising the conflict-logged case. Fixed with a local `normalizedWeightKg` helper. Not in the plan's declared `files_modified`, but directly caused by this task's nullability change and within the deviation-rule Scope Boundary.
- Authored `apps/api/test/null-weight.e2e-spec.ts` (8 cases, all passing) covering every line of the plan's behavior block against real Postgres, following `sync-push.e2e-spec.ts`'s established harness (spawned built API, throwaway account per run, direct `pg` client assertions).
- Pushed the schema change to the live Postgres instance and gated the suite run on the live column actually being nullable (see "Schema Push" below).

## Task Commits

Each task was committed atomically:

1. **Task 2: Absent, null and zero become three different things end to end** - `0fe0422` (feat)
2. **Task 3: Push the relaxed schema, then prove the round trip** - `2892d65` (docs — no source diff; this task's deliverable is the live-database push plus verification, documented here and in `deferred-items.md`)

**Plan metadata:** *(this commit)* — SUMMARY.md

_Note: Task 1 (checkpoint:decision) produced no commit — it was resolved by the human user before this executor was spawned._

## Files Created/Modified

- `apps/api/src/db/schema/session.ts` - Dropped `.notNull()` from `loggedSet.weightKg`
- `apps/api/src/sync/sync.service.ts` - Null-aware weight mapping, validator, PATCH-preserving update, fixed conflict-log serialization
- `apps/api/src/sync/conflict-policy.ts` - **[Rule 1]** Fixed the same `String(null)` defect in `loggedSetChangedFields`, now reachable with a nullable column
- `apps/api/test/null-weight.e2e-spec.ts` - New: 8-case real-Postgres round-trip suite for the null-weight behavior
- `.planning/phases/02-data-model-sync-engine/deferred-items.md` - New: logs an out-of-scope, pre-existing `drizzle-kit push` drift discovered while pushing this schema change

## Schema Push (Task 3)

Ran in the required order, each step verified before the next:

1. **Before-reading** (fresh for this execution, taken immediately before pushing):
   ```
   psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='logged_set' and column_name='weight_kg'"
   -> NO
   ```
   This is a fresh run, not a re-run — the column was still `NOT NULL` at the start of this task.

2. **Push:** `pnpm --filter api db:push` (`drizzle-kit push`, non-interactive, no `--force`). Reported `[✓] Changes applied` without prompting, consistent with a non-destructive `NOT NULL` drop on a populated table. The tool's non-interactive stdout did not render the pending-statement diff text before applying (that text only appears with an explicit `--verbose` flag, used afterward — see below), so the literal `ALTER TABLE` text for this specific change was not captured verbatim from the original invocation. The change is nonetheless fully proven by the before/after `information_schema` readings below, and the only DDL semantically possible for "drop NOT NULL, unchanged `numeric(8,3)`" on this column is:
   ```sql
   ALTER TABLE "logged_set" ALTER COLUMN "weight_kg" DROP NOT NULL;
   ```

3. **After-reading, gating the suite run:**
   ```
   psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='logged_set' and column_name='weight_kg'"
   -> YES
   ```
   Confirmed again directly: `select column_name, is_nullable, numeric_precision, numeric_scale ...` returned `weight_kg|YES|8|3` — nullable, precision and scale unchanged.

4. **Suites**, run only after the gate passed:
   - `pnpm --filter api test:e2e -- null-weight` — **8/8 passing, 0 skipped**
   - `pnpm --filter api test:e2e -- sync-push` — **7/7 passing** (unchanged from baseline)
   - `pnpm --filter api test:e2e -- concurrent-edit` — **15/15 passing** (matches `02-VERIFICATION.md`'s recorded count)
   - `pnpm --filter api test:e2e -- seeded-corpus-perf` — **7/7 passing** (run in addition, per the plan's top-level `<verification>` block)
   - `pnpm --filter @fitness/api-contracts test` — **46/46 passing** (unaffected, run in addition per the plan's top-level `<verification>` block)
   - `pnpm --filter mobile test` — not run; this plan touches no mobile file (per the plan's own verification note), and a separate parallel executor holds `apps/mobile/**` in this wave.

**Out-of-scope discovery, not fixed (logged to `deferred-items.md`):** while pushing and re-verifying, `drizzle-kit push` repeatedly (and reproducibly, on a clean re-run) reported and re-applied a batch of statements on eight tables unrelated to `weight_kg` — `ALTER ... SET DEFAULT nextval('sync_seq')` on `workout_session`, `personal_record`, `exercise`, `progress_photo`, `equipment_profile`, `body_metric`, `routine`, `user_preference`, plus a drop/recreate of `exercise_muscle_mapping`'s composite primary key. Confirmed non-destructive (`exercise_muscle_mapping` held 0 rows throughout; no column type/precision/nullability changed on any of the eight tables) and semantically a no-op each time — almost certainly a Drizzle introspection/normalization quirk unrelated to CR-02. Documented in `deferred-items.md` rather than root-caused, since none of the eight tables are in this plan's `files_modified` and the fix (if one is needed) is a separate Drizzle/schema investigation.

## Decisions Made

See the frontmatter `key-decisions` and the "Task 1" section above for the drop-not-null decision and its rationale (selected by the human user, not this executor).

Additional decisions made during Task 2/3 execution:
- `isNonNegativeDecimalOrNull` wraps `isNonNegativeDecimal` rather than duplicating its logic, keeping the base validator's behavior for any future caller unchanged.
- The PATCH-preserves-weight fix touches only the `onConflictDoUpdate` `set` object, never the `insert().values()` object, so a brand-new row still gets an explicit `weightKg` (null when absent) rather than silently omitting a column Postgres would otherwise default in an unintended way.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed the same `String(null)` defect in `conflict-policy.ts`'s conflict-detection comparison**
- **Found during:** Task 2, while implementing the conflict-log fix `sync.service.ts` explicitly named.
- **Issue:** `loggedSetChangedFields` in `apps/api/src/sync/conflict-policy.ts` compared `String(incoming.weight_kg) !== stored.weightKg`. Before this plan, `weightKg` could never be `null` (the column was `NOT NULL`), so this was dormant. Once nullable, `String(null)` produces the four-character string `"null"`, which would never equal a real stored `null` value — a stored-null-vs-incoming-null pair (no actual change) would false-positive as "changed", and the comparison's type declarations (`weightKg: string`) no longer matched reality.
- **Fix:** Added a local `normalizedWeightKg` helper (`value === null ? null : String(value)`) and widened `LoggedSetStoredRow`/`LoggedSetIncomingData`'s `weight_kg` types to `string | null`.
- **Files modified:** `apps/api/src/sync/conflict-policy.ts`
- **Verification:** `apps/api/test/null-weight.e2e-spec.ts`'s conflict-logged case exercises exactly this path (a completed set overwritten with an explicit-null weight) and asserts `winning_value.weight_kg` is a real `null`, not the string `"null"`.
- **Committed in:** `0fe0422` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — the fix this plan's own conflict-log behavior line (line 8 of the `<behavior>` block) requires would have been incomplete without it, since `resolveConflict`'s change-detection is what decides whether a conflict is logged at all. No scope creep: same bug class, same root cause (`String(null)`), directly exposed by this plan's own nullability change.

## Issues Encountered

- **`.env` absent in this worktree:** `.env` is gitignored and was not present in this ephemeral worktree checkout, so `DATABASE_URL` (and the other local-dev env vars) were unset. Copied `.env.example` verbatim to `.env` (dev-only placeholder credentials matching the documented native Homebrew `postgresql@18` instance at `127.0.0.1:5432`; confirmed working via a direct `psql` connection before proceeding). Not committed (`.gitignore` excludes it).
- **`@fitness/api-contracts` unbuilt on first typecheck:** `pnpm install` had not yet produced `packages/api-contracts/dist/`, so `pnpm --filter api typecheck` initially failed with `Cannot find module '@fitness/api-contracts'`. Ran `pnpm --filter api-contracts build` once; typecheck and build were clean afterward. Environment setup, not a code issue.
- **Unrelated `drizzle-kit push` drift** — see "Out-of-scope discovery" above and `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-02 is closed on both halves: `apps/api/src/sync/sync.service.ts` no longer coerces a missing/null weight to `"0"`, and the live Postgres `logged_set.weight_kg` column accepts `NULL`.
- WINDOWS #20 and #21 can both be marked fixed.
- A bodyweight set and a zero-kilogram set are now provably distinct rows after a real round trip through the sync push path.
- No previously-passing suite regressed (`sync-push`, `concurrent-edit`, `seeded-corpus-perf`, `@fitness/api-contracts` all still green at their prior counts).
- Deferred: the recurring `drizzle-kit push` drift on eight unrelated tables (see `deferred-items.md`) — worth a small follow-up investigation, but not blocking and not data-affecting.
- Deliberately out of scope for this plan (unchanged): `02-REVIEW.md` IN-01, WR-01–WR-04; `WINDOWS.md` #18, #24, #25.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All claimed files verified present on disk (`apps/api/test/null-weight.e2e-spec.ts`, `apps/api/src/db/schema/session.ts`, `apps/api/src/sync/sync.service.ts`, `apps/api/src/sync/conflict-policy.ts`, `deferred-items.md`, this SUMMARY). All claimed commits (`0fe0422`, `2892d65`, `71add3e`) verified present in `git log`.
