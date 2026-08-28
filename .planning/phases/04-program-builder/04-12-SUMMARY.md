---
phase: 04-program-builder
plan: 12
subsystem: database
tags: [drizzle, postgres, powersync, sqlite, sync, jest]

# Dependency graph
requires:
  - phase: 04-program-builder
    provides: routine_day schema, routine sync apply path, loadProgramTree/duplicateRoutine
provides:
  - "routine_day.archived_at column on Postgres and local SQLite schemas"
  - "routine_day sync apply path that accepts, validates and clears archived_at"
  - "archiveDay/restoreDay/loadArchivedDays write and read helpers"
  - "loadProgramTree filtered to live days only, inherited by the builder, Home next-up and duplicateRoutine"
affects: [04-13, 04-program-builder]

# Actuals (#2632)
actuals:
  tokens: 9400
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "loadArchivedDays mirrors loadRoutines/loadLibraryRoutines: the day-listing read filters archived rows at the SQL level, the archive-reachable read is a separate named function"
    - "Sync stream left unfiltered (routine_day mirrors routine): archive/restore state filters at the client read layer, never at the PowerSync pull query, because bucket removal deletes local rows"

key-files:
  created: []
  modified:
    - apps/api/src/db/schema/program.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/test/schema-parity.e2e-spec.ts
    - apps/api/test/program-sync.e2e-spec.ts
    - ops/powersync/sync-rules.yaml
    - apps/mobile/lib/db/schema.ts
    - apps/mobile/lib/db/programs/days.ts
    - apps/mobile/lib/db/programs/load-program.ts
    - apps/mobile/lib/db/programs/duplicate-routine.ts
    - apps/mobile/lib/db/__tests__/programs.test.ts
    - apps/mobile/lib/db/__tests__/duplicate-routine.test.ts

key-decisions:
  - "D-33 (checkpoint, pre-resolved): stream every routine_day row regardless of archived_at; filter only at loadProgramTree. Filtering the PowerSync pull query would delete an archived day from every device that did not perform the archive, stranding the Restore control and dangling workout_session.routine_day_id."
  - "The day page's existing removeDay (hard delete) stays as-is; Archive is an addition, not a replacement (option-a, not option-c)."
  - "duplicateRoutine's exclusion of archived days is a pinned consequence of reading through the filtered loadProgramTree, not a second filter — recorded as a behavioral test rather than new duplicate-routine logic."

patterns-established:
  - "Condition-resolving test store (collectEqualities/rowMatches/propertyKeyForColumn, copied per-suite from log-set.test.ts) extended to resolve isNull() fragments — needed anywhere a fake db's fixed-rows-regardless-of-condition shape would let a deleted SQL filter still pass its test."

requirements-completed: [PROG-07]

coverage:
  - id: D1
    description: "routine_day.archived_at exists in the live Postgres database, the local SQLite schema, and the sync apply path in both directions"
    requirement: "PROG-07"
    verification:
      - kind: integration
        ref: "apps/api/test/program-sync.e2e-spec.ts#a routine_day PATCH naming only archived_at applies the stamp and leaves name/order_index/is_rest_day untouched"
        status: pass
      - kind: integration
        ref: "apps/api/test/program-sync.e2e-spec.ts#a second routine_day PATCH naming archived_at: null clears it and the row is still there — restore is not a re-create"
        status: pass
      - kind: other
        ref: "pnpm --filter api db:verify (schema-parity routine_day archived_at column check)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Archiving a day destroys nothing: zero deletes, zero tombstones, children intact"
    requirement: "PROG-07"
    verification:
      - kind: integration
        ref: "apps/api/test/program-sync.e2e-spec.ts#archiving a routine_day emits no sync_tombstone rows and leaves its routine_exercise children present — an archive is not a delete"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#archiveDay issues exactly one update writing only archivedAt as an ISO string, and issues zero deletes"
        status: pass
    human_judgment: false
  - id: D3
    description: "The builder, the Home next-up read and duplicateRoutine all see live days only, from one filter in loadProgramTree"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#filters archived days at the SQL level > returns two days and the archived one is absent from tree.days"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/duplicate-routine.test.ts#archived days (D-29/D-33) > inserts exactly two day rows, and the copied program contains no archived day"
        status: pass
    human_judgment: false
  - id: D4
    description: "Archived days remain readable through loadArchivedDays and remain deliverable through sync"
    requirement: "PROG-07"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/programs.test.ts#loadArchivedDays > returns only the routine's days whose archivedAt is non-null"
        status: pass
      - kind: other
        ref: "grep -c anchored routine_day stream query in ops/powersync/sync-rules.yaml == 1 (unfiltered)"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-08-28
status: complete
---

# Phase 04 Plan 12: routine_day archive column, sync path and filtered reads Summary

**`routine_day.archived_at` shipped end-to-end — Postgres column, SQLite mirror, sync apply/validate path, `archiveDay`/`restoreDay`/`loadArchivedDays`, and a `loadProgramTree` that filters archived days at the SQL level for the builder, Home and duplicateRoutine alike.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-08-28T17:28:59+03:00 (worktree base)
- **Completed:** 2026-08-28T18:18:24+03:00
- **Tasks:** 2 (plus one pre-resolved checkpoint)
- **Files modified:** 12

## Accomplishments
- `routine_day.archived_at` added to the Postgres schema, pushed to the live database, and proven present via `schema-parity`'s live-database read (not just a TypeScript type)
- The full sync apply path accepts, converts and validates `archived_at`: `ROUTINE_DAY_PATCH_FIELDS` maps it to a wire name (write-only-when-named), `toRoutineDayValues` converts through `Date`, `isInvalidRoutineDay` rejects a non-ISO value
- `ops/powersync/sync-rules.yaml`'s `routine_day` stream query stays byte-identical and unfiltered, with a header comment recording the deliberate deviation from D-29's literal text (D-33)
- `archiveDay`/`restoreDay`/`loadArchivedDays` client helpers, mirroring `archiveRoutine`/`restoreRoutine`/`loadLibraryRoutines` one level down
- `loadProgramTree`'s single `dayRows` query filters archived days via `isNull(routineDay.archivedAt)` at the SQL level — inherited by the builder deck, the Home next-up read, and `duplicateRoutine`, with no second filter anywhere
- `addDay`/`duplicateRoutine`/`duplicateDay` all write `archivedAt: null` explicitly on every new/copied day row

## Task Commits

1. **Task 1: The column, everywhere it has to exist, proven against the live database** - `7cc7db1` (feat)
2. **Task 2: Archive and restore writes, and a day-listing read that returns live days only** - `7f62064` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `apps/api/src/db/schema/program.ts` - `routineDay.archivedAt: timestamp('archived_at')`
- `apps/api/src/sync/patch-update-set.ts` - `RoutineDayValues.archivedAt`, `ROUTINE_DAY_PATCH_FIELDS.archivedAt: 'archived_at'`
- `apps/api/src/sync/sync.service.ts` - `RoutineDayOpData.archived_at`, `toRoutineDayValues` conversion, `isInvalidRoutineDay` ISO validation
- `apps/api/test/schema-parity.e2e-spec.ts` - `routine_day` entry in `REQUIRED_COLUMNS`
- `apps/api/test/program-sync.e2e-spec.ts` - `routineDayRow` select extended; four new archive/restore/tombstone/invalid_field cases
- `ops/powersync/sync-rules.yaml` - header comment recording the deliberate unfiltered-stream deviation
- `apps/mobile/lib/db/schema.ts` - local `routineDay.archivedAt: text('archived_at')`
- `apps/mobile/lib/db/programs/days.ts` - `archiveDay`, `restoreDay`, `loadArchivedDays`, `ArchivedDayRow`; `addDay` writes `archivedAt: null`
- `apps/mobile/lib/db/programs/load-program.ts` - `loadProgramTree`'s `dayRows` query gains `isNull(routineDay.archivedAt)`
- `apps/mobile/lib/db/programs/duplicate-routine.ts` - both `routineDay` inserts write `archivedAt: null` explicitly
- `apps/mobile/lib/db/__tests__/programs.test.ts` - `archiveDay`/`restoreDay`/`loadArchivedDays` unit tests; condition-resolving store (copied from `log-set.test.ts`, extended for `isNull`); archived-day `loadProgramTree` cases; `moveDay` archived-sibling case
- `apps/mobile/lib/db/__tests__/duplicate-routine.test.ts` - `fakeDb` extended to resolve `where` conditions; archived-day exclusion cases for `duplicateRoutine` and `duplicateDay`

## Decisions Made
- **D-33 (pre-resolved checkpoint, option-a):** stream every `routine_day` row regardless of `archived_at`; filter only at `loadProgramTree`. Filtering the PowerSync pull query would delete an archived day from every device that did not perform the archive, stranding the Restore control (04-13) and leaving `workout_session.routine_day_id` pointing at a row the device no longer holds. Mirrors the existing `routine` query's own precedent. D-29's "filter ... out of `sync-rules.yaml`" clause is withdrawn.
- The day page's existing `removeDay` (hard delete, cascade-tested) stays untouched — option-a, not option-c. Archive is an addition beside it, wired in 04-13.
- `duplicateRoutine`'s exclusion of archived days is a pinned consequence of reading through the filtered `loadProgramTree`, not new logic in `duplicate-routine.ts` itself — verified by a behavioral test against a fixture with a mix of live and archived days, using a `fakeDb` upgraded to resolve real `where` conditions (previously it ignored them and returned fixed rows regardless).

## Deviations from Plan

None - plan executed exactly as written, including the pre-resolved checkpoint (D-33).

## Issues Encountered

**Fresh-worktree bootstrap:** the worktree had no `node_modules`, no built workspace packages, and no `.env` (gitignored, not copied into the worktree by `git worktree add`). Ran `pnpm install`, `npx turbo run build`, and passed `DATABASE_URL` as an inline env var to every `pnpm --filter api ...` command rather than writing a `.env` file (writing/reading `.env` inside the worktree is denied by the sandbox's permission policy). This is bootstrap-only friction, not a code issue — no source files were touched to work around it.

**`fakeLoadProgramDb`'s `where` proving nothing for a filter:** as flagged in the plan's `<read_first>`, `programs.test.ts`'s existing `fakeLoadProgramDb` takes no argument in its `where` and returns fixed rows unconditionally — a filter added to `load-program.ts` and then deleted again would still pass every existing test. Brought in the condition-resolving store from `log-set.test.ts` (per that file's own copy-not-share convention) and extended `collectEqualities` to resolve an `isNull()` fragment, which the original only-`eq()` version skipped. The same problem existed in `duplicate-routine.test.ts`'s `fakeDb` (which also ignored `where` conditions) — extended it the same way so the archived-day exclusion tests there are equally load-bearing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-13, which wires the Archive/Restore Day controls (day page UI, `ArchiveDialog` day-subject copy, the "Archived days" restore section below the day deck) against the read/write surface this plan built: `archiveDay`, `restoreDay`, `loadArchivedDays`, and a `loadProgramTree` that already excludes archived days everywhere it needs to.

No blockers.

---
*Phase: 04-program-builder*
*Completed: 2026-08-28*

## Self-Check: PASSED
All created/modified files present; commits `7cc7db1` and `7f62064` verified in git log.
