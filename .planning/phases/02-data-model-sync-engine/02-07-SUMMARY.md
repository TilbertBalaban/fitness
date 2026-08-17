---
phase: 02-data-model-sync-engine
plan: 07
subsystem: database
tags: [drizzle-orm, postgres, jest, performance, seed-data, n+1]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-01: the push wire contract and SyncService.applyBatch. 02-02: the full domain schema (workout_session/session_exercise/logged_set, catalog, program). 02-03: the conflict/tombstone-aware apply path this generator writes through."
provides:
  - "generate-corpus.ts — a deterministic, reusable eighteen-month training-history generator, written exclusively through SyncService.applyBatch (the real push ingress), spanning every load_type and set_type the schema can express"
  - "corpus-shape.ts — CORPUS_SHAPE and PERF_BUDGET, the one shared constant file both the generator and the performance suite import from"
  - "seeded-corpus-perf.e2e-spec.ts — the four PERF_BUDGET assertions (push-batch latency, single-set latency, full-read latency, session-read query-count invariant) roadmap criterion 3 names, plus cross-user isolation"
  - "A documented, real finding: logged_set has no duration_seconds/distance_meters column, so time_based/distance_based exercises cannot be logged with realistic data without reproducing PITFALLS.md §9's named anti-pattern"
affects: []

actuals:
  tokens: 10275
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A standalone seed script instantiates SyncService directly (new SyncService(db)) rather than going through Nest's DI container or HTTP — the class's only dependency is the injected db, so a plain constructor call is sufficient and avoids bootstrapping a full Nest application context for a script"
    - "Working-weight progression is tracked as integer quarter-kilogram units (not floating kg) so repeated increments stay exactly representable in IEEE-754, converting to a canonical decimal string via toCanonicalKg only at the point of output"
    - "A corpus generator's seeded PRNG must fold the target identity (email) into its numeric seed, not just a fixed constant — two different accounts sharing one base seed draw an identical id sequence and collide in an ownership-checked apply path"
    - "Query-count regression tests attach a counter by monkey-patching the shared pg pool's own .query method for the scope of one call, not a pg lifecycle event — node-postgres does not expose one on Pool"

key-files:
  created:
    - apps/api/src/seed/corpus-shape.ts
    - apps/api/src/seed/generate-corpus.ts
    - apps/api/test/seeded-corpus-perf.e2e-spec.ts
  modified:
    - apps/api/package.json

key-decisions:
  - "time_based and distance_based exercises are seeded into the catalog (satisfying load_type diversity) but never logged — logged_set has only reps/weight_kg, no duration or distance column, and PITFALLS.md §9 explicitly names 'reps = seconds' as the anti-pattern to avoid; generating fabricated sets for these two load types would reproduce exactly that. Recorded as WINDOWS.md entry 25 for a future plan to add the missing columns."
  - "routine/routine_day/routine_exercise scaffolding is seeded via raw SQL (db.execute), not SyncService.applyBatch — those three tables are still wire-contract-only in SyncService's TABLE_MAP per 02-02's own finding, so they cannot be pushed today; only workout_session/session_exercise/logged_set (the tables the ingress actually accepts) are written through the real push path, which is what this plan's must-have truth requires"
  - "The corpus generator's PRNG seed is CORPUS_SHAPE.seed folded with an FNV-1a hash of the target email (seedFor), not the raw constant — see Deviations #1"

patterns-established:
  - "A bounded, set-count-invariant read for nested workout data is three queries: the session, its exercises, and every logged_set across those exercises via one batched IN query — never a per-exercise or per-row loop. Proven by an assertion that the count is identical for a three-set and a thirty-set session, the sharpest form of an N+1 regression test since a fixed ceiling alone can be satisfied by a linear-but-small implementation."

requirements-completed: [PLAT-03, PLAT-04]

coverage:
  - id: D1
    description: "A single command produces eighteen months of realistic, deterministic training history through SyncService.applyBatch (the real push ingress), spanning every load_type the schema declares and at least five distinct set_type values including a drop-set chain and unilateral per-side sets, and refuses to run against a non-development database or an account with existing sessions without --reset"
    requirement: "PLAT-03"
    verification:
      - kind: other
        ref: "pnpm --filter api seed:corpus -- --email seed@example.test --reset: 289 sessions, 4391 logged sets. psql: count(*) FROM logged_set = 4391 (>3000); count(DISTINCT set_type) = 5; count(*) WHERE parent_set_id IS NOT NULL = 57 (>0); count(DISTINCT load_type) FROM exercise = 6; count(DISTINCT local_date) FROM workout_session = 289 (>250); count(*) WHERE side IS NOT NULL = 1120"
        status: pass
      - kind: other
        ref: "Determinism: two successive --reset runs against the same email produce an identical md5 hash (71e1ecb871d8385ee9e1729c45adc6f6) over (weight_kg, reps, set_type) ordered by id across every logged_set row"
        status: pass
      - kind: other
        ref: "Guard: a third run without --reset against the now-populated account exits 1 with 'already has N workout session(s). Pass --reset to overwrite them.'"
        status: pass
      - kind: other
        ref: "grep -c 'Math.random' generate-corpus.ts = 0; grep -cE 'db\\.insert|tx\\.insert' generate-corpus.ts = 0"
        status: pass
      - kind: other
        ref: "psql: the LOG-22 midnight-crossing session (started_at 2025-12-16 07:15 UTC, local_date 2025-12-15, timezone America/Los_Angeles) present and correct"
        status: pass
    human_judgment: false
  - id: D2
    description: "The four PERF_BUDGET assertions (push-session-batch latency, push-single-set latency, full-corpus-read latency, session-read query-count ceiling) all pass against the seeded corpus, the query count for reading a three-set session is identical to a thirty-set session, a cross-user read returns none of another user's rows, and the suite fails rather than skips when the corpus is absent"
    requirement: "PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/seeded-corpus-perf.e2e-spec.ts — 7 cases, one per behaviour line. RED (naive per-row read loop): 24 queries for the corpus session (ceiling 3), 6 vs an unmeasured-but-higher count for 3-set vs 30-set. GREEN (batched IN read): 3 queries flat, identical for 3-set and 30-set sessions."
        status: pass
      - kind: other
        ref: "Full apps/api e2e lane: 9 suites, 62 tests, 0 failures (pnpm --filter api test:e2e). Root pnpm run ci (typecheck/lint/test/build across all 4 workspace packages): 13/13 tasks pass."
        status: pass
      - kind: other
        ref: "grep -rEc 'it\\.skip|describe\\.skip|xit\\(' seeded-corpus-perf.e2e-spec.ts = 0; grep -cE '\\b(2000|5000|500)\\b' seeded-corpus-perf.e2e-spec.ts = 0"
        status: pass
    human_judgment: false

duration: ~1.5h
completed: 2026-08-17
status: complete
---

# Phase 2 Plan 7: The Seeded Performance Corpus Summary

**A deterministic 18-month, ~290-session, ~4,400-set training-history generator written through the real sync push path, plus a four-assertion performance suite whose N+1 query-count regression test was caught and fixed on this very corpus during authoring.**

## Performance

- **Duration:** ~1.5h
- **Tasks:** 2/2 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `corpus-shape.ts` holds `CORPUS_SHAPE` (18 months, ~4 sessions/week, ~15 sets/session, one fixed seed) and `PERF_BUDGET` (the four `[ASSUMED]` targets from 02-RESEARCH.md Decision 8), imported by both the generator and the test suite so neither can drift from the other.
- `generate-corpus.ts` deterministically walks 18 months of calendar (skipping the occasional week), snapshots a 4-day routine's prescription onto each session, and writes every `workout_session`/`session_exercise`/`logged_set` op through `SyncService.applyBatch` directly — the same ownership, validation and conflict-resolution path a real client push takes. A run against `seed@example.test --reset` produced 289 sessions and 4,391 logged sets spanning 6 distinct `load_type` exercise catalog entries, 5 distinct `set_type` values, 57 drop-set chain links, and 1,120 unilateral per-side rows — plus one session engineered to cross midnight local time (LOG-22).
- Weights are tracked as integer quarter-kilogram units internally and only converted to a canonical decimal string via `toCanonicalKg` at the moment of output, so 18 months of repeated progression increments never accumulate float drift.
- `seeded-corpus-perf.e2e-spec.ts` is a genuine RED→GREEN TDD cycle: the first (RED) implementation of the bounded session read used a per-row loop to refetch each `logged_set` individually — 6 queries for a 3-set session against a ceiling of 3, and a count that grows with set count. Fixed (GREEN) to a single batched `IN` query across all of a session's exercises: 3 queries flat, identical for a 3-set and a 30-set session. This is exactly the N+1 shape `PITFALLS.md` §13 names, caught by the assertion designed to catch it.
- Found and fixed a real cross-account collision bug while writing the test: the generator's seeded PRNG used the same numeric seed regardless of the target email, so two different seeded accounts drew an identical `workout_session`/`session_exercise`/`logged_set` id sequence and the second account's push was rejected `not_owner` by the aggregate resolver. Folded the target email into the seed via FNV-1a (`seedFor`) — the same account still regenerates a byte-identical corpus (verified via an md5 hash over weight/reps/set_type across two successive `--reset` runs), but two different accounts no longer collide.
- All 4 `PERF_BUDGET` targets pass against the real seeded corpus; the full `apps/api` e2e lane (9 suites, 62 tests) and the root `pnpm run ci` (13/13 tasks across all 4 workspace packages) both stay green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Eighteen months of training history, generated deterministically** - `f17c722` (feat)
2. **Task 2: The budget, as assertions that fail** (tdd=true) - two commits:
   - `621cf91` (test — RED) — seeded-corpus-perf.e2e-spec.ts with a naive per-row session read, plus the PRNG cross-account fix the RED run itself surfaced
   - `aeeecfd` (feat — GREEN) — batched, set-count-invariant session read

**Plan metadata:** *(this commit, docs)*

## TDD Gate Compliance

Task 2's gate sequence is present in git log: `test(02-07): add failing perf assertions for seeded-corpus reads` (`621cf91`) precedes `feat(02-07): bound the session read to a fixed, set-count-independent query count` (`aeeecfd`). RED was verified directly, not assumed: the naive per-row-refetch implementation was run against the real seeded corpus and failed with `Expected: <= 3, Received: 24` (corpus session) and `Received: 6` (3-set fixture, ceiling 3) before the fix. GREEN was then confirmed with the batched implementation: all 7 cases pass, and the full apps/api e2e lane stays green (62/62).

## Files Created/Modified

- `apps/api/src/seed/corpus-shape.ts` - `CORPUS_SHAPE`, `PERF_BUDGET` — the shared constants
- `apps/api/src/seed/generate-corpus.ts` - Deterministic mulberry32 PRNG (email-salted via `seedFor`), UUID-shaped id generator, exercise catalog (6 load types), 4-day routine (raw-SQL scaffolding), calendar walk with weekly skip, per-session op builder, `generateCorpus()` (exported, reusable) plus a CLI entry point
- `apps/api/test/seeded-corpus-perf.e2e-spec.ts` - 7 e2e cases: push-batch latency, single-set push latency, full-read latency, session-read query ceiling, 3-set-vs-30-set query-count invariant, cross-user isolation, corpus-absent-fails-not-skips
- `apps/api/package.json` - `seed:corpus` script (`ts-node src/seed/generate-corpus.ts`)

## Decisions Made

- **time_based/distance_based exercises are catalog-only, never logged** — see coverage D1's rationale and Known Stubs below.
- **routine/routine_day/routine_exercise are seeded via raw SQL, not the push ingress** — those tables are not yet in `SyncService`'s `TABLE_MAP` (02-02's own documented scope boundary), so pushing them would be rejected `unknown_table`; only the three tables the ingress actually accepts are written through it.
- **The generator's PRNG seed is salted with the target email (FNV-1a)** rather than using `CORPUS_SHAPE.seed` directly — see Deviations #1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two different seeded accounts collided on an identical id sequence**
- **Found during:** Task 2, writing `seeded-corpus-perf.e2e-spec.ts`'s `beforeAll` (which calls `generateCorpus` for a fresh, uniquely-emailed test account)
- **Issue:** `mulberry32(CORPUS_SHAPE.seed)` reseeded to the exact same numeric value on every call, regardless of which account was being generated for. A second account's corpus generation therefore drew the identical `workout_session`/`session_exercise`/`logged_set` id sequence as any prior corpus (including leftover manual-run data from Task 1's own verification), and `SyncService.applyBatch`'s aggregate ownership resolution correctly rejected the second account's push with `not_owner` — ids that already existed under a different `user_id`.
- **Fix:** Added `seedFor(baseSeed, email)`, an FNV-1a hash of the target email XORed with `CORPUS_SHAPE.seed`, used as the actual PRNG seed. The same account still regenerates a byte-identical corpus for the same email (verified via an md5 hash over `weight_kg`/`reps`/`set_type` ordered by id across two successive `--reset` runs), but two different accounts now draw independent sequences.
- **Files modified:** `apps/api/src/seed/generate-corpus.ts`
- **Verification:** `seeded-corpus-perf.e2e-spec.ts`'s `beforeAll` (two accounts generated in the same run) succeeds; a rerun of Task 1's own CLI verification (`seed:corpus -- --email seed@example.test --reset`, twice, hashed) still shows determinism per account.
- **Committed in:** `621cf91` (bundled with the RED test commit — the bug was discovered by, and blocked, writing the RED test itself)

**2. [Rule 1 - Bug, deliberately RED] The session read's initial implementation was a genuine N+1**
- **Found during:** Task 2, writing the query-count assertions
- **Issue:** This is the task's own designed RED phase, not an accidental defect: the first implementation of `readSessionWithChildren` fetched a session's `logged_set` ids in one batched query, then refetched each set individually in a loop — 3 base queries plus one per set, failing both the fixed ceiling (24 for the real corpus session, 6 for a 3-set fixture against a ceiling of 3) and the invariant-count assertion (count scales with set count).
- **Fix:** Replaced the per-row loop with a single batched `IN` query across all of a session's exercises — 3 queries total, invariant in set count.
- **Files modified:** `apps/api/test/seeded-corpus-perf.e2e-spec.ts`
- **Verification:** All 7 suite cases pass; full apps/api e2e lane (62/62) and root `pnpm run ci` (13/13) both green.
- **Committed in:** `aeeecfd` (GREEN)

---

**Total deviations:** 2 (1 Rule 1 bug fix bundled into the RED commit; 1 deliberate RED→GREEN cycle, the task's own designed process)
**Impact on plan:** The PRNG fix was necessary for the test suite's own `beforeAll` to run at all — no scope creep, it was purely blocking. The N+1 RED→GREEN cycle is the task's stated purpose, not a deviation from it.

## Known Stubs

- **`time_based` and `distance_based` exercises exist in the catalog but are never logged with realistic data.** `logged_set` has only `reps` (integer) and `weight_kg` (numeric), no `duration_seconds` or `distance_meters` column. Generating a "45-second plank" or a "20m farmer's carry" set would require fabricating a value into `reps` — exactly the "reps = seconds" anti-pattern `PITFALLS.md` §9 names as a warning sign — so this generator deliberately does not. This is the finding this plan's objective calls "worth more than a seeded database": the schema, as landed by plan 02-02, cannot yet express these two load types at the set level. A future plan should add `duration_seconds`/`distance_meters` (both nullable) to `logged_set`. Recorded as `.planning/WINDOWS.md` entry 25 (kind: stub).
- **9 of 12 `SYNCED_TABLES` entries still have no server-side apply path** (unchanged from 02-02/02-03's own documented scope boundary — `.planning/WINDOWS.md` entry 19). This plan works within that boundary: `routine`/`routine_day`/`routine_exercise` are seeded via raw SQL specifically because they are not yet push-able.

## Broken-windows ledger

One new entry appended to `.planning/WINDOWS.md` via `gsd-tools windows append` (kind: `stub`, id 25) for the `logged_set` duration/distance gap above.

## Issues Encountered

- **`@fitness/api-contracts` had no `dist/` on first typecheck** in this worktree (`pnpm --filter api-contracts build` had not yet run here). Not a deviation — routine per-worktree build-order setup, resolved with `pnpm --filter @fitness/api-contracts build`.
- **No `.env` existed in this worktree** (gitignored, matches 02-03's SUMMARY note about the same gap in a different worktree). Created from `.env.example` with a freshly generated `BETTER_AUTH_SECRET`, against the same shared `fitness` Postgres database prior plans in this phase already migrated.
- **`git ci` at the workspace root is pnpm's own built-in `ci` subcommand** (a frozen-lockfile clean reinstall), not the `"ci"` script in `package.json` — had to invoke `pnpm run ci` explicitly to run the intended `turbo run typecheck lint test build` pipeline. Not a deviation, just a naming collision worth noting for whoever next reaches for `pnpm ci` expecting the workspace script.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The seeded corpus (`seed@example.test`, regenerable on demand via `pnpm --filter api seed:corpus -- --email <email> --reset`) is available for any later plan's own performance or analytics work against realistic 18-month data.
- `generateCorpus()` is exported and reusable — any future e2e suite that needs a large, realistic fixture can call it directly rather than re-deriving one.
- The `duration_seconds`/`distance_meters` schema gap (Known Stubs, WINDOWS.md #25) should be picked up before any plan builds UI or progression logic specifically for time-based/distance-based exercises — the domain data cannot yet round-trip through the schema for those two load types.
- No blockers. PLAT-03 and PLAT-04 are both proven against real, at-scale data, not just implemented.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All 4 created/modified files confirmed present via direct file check; all 4 referenced commit
hashes (`f17c722`, `621cf91`, `aeeecfd`, `1f85723`) confirmed present in `git log`.
