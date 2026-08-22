---
phase: 04-program-builder
plan: 10
subsystem: mobile-client
tags: [home-tab, position-resolver, next-up, prog-09, d-20, d-27]
status: complete

requires:
  - "04-04: user_preference.active_routine_id (the active-program pointer)"
  - "04-07: resolveTarget / TargetOverride in @fitness/api-contracts"
  - "04-08: loadProgramTree, ProgramTree/ProgramDay/ProgramCycle/ProgramSlot, sortByOrderThenId"
  - "Phase 3: exercise_muscle_mapping / muscle_group local tables"
provides:
  - "resolveNextUp / countableHistory / lastLoggedDayIndex / cycleSpan — the derived position resolver (apps/mobile/lib/programs/next-up.ts)"
  - "loadNextUp / NextUpData — the bounded read path (apps/mobile/lib/db/programs/next-up-query.ts)"
  - "The Home tab's Next Up card, with deriveHomeScreenState / nextUpHeading / formatTimeOffRemaining / formatNextUpExerciseLine / dayTargetMuscles"
affects:
  - "apps/mobile/app/(tabs)/index.tsx (was a 22-line placeholder)"
  - "docs/program-vocabularies.md (new 'Where you are in the program' section)"

tech-stack:
  added: []
  patterns:
    - "Pure resolver + thin read module + screen: the position logic imports no database and reads no clock, so every calendar and rotation boundary is a unit test rather than a fixture"
    - "Generic over the caller's day/cycle types (D extends PositionDay, C extends PositionCycle) instead of importing load-program's concrete types, which is what keeps next-up.ts free of any database import"
    - "Exact query-count assertions proven invariant across fixture sizes (3 vs 30 exercises, 1 vs 200 sessions)"

key-files:
  created:
    - apps/mobile/lib/programs/next-up.ts
    - apps/mobile/lib/programs/__tests__/next-up.test.ts
    - apps/mobile/lib/db/programs/next-up-query.ts
    - apps/mobile/lib/db/__tests__/next-up-query.test.ts
    - apps/mobile/app/(tabs)/__tests__/home-screen.test.ts
  modified:
    - apps/mobile/app/(tabs)/index.tsx
    - docs/program-vocabularies.md

decisions:
  - "Position derives from two independent facts: rotation count places the cycle, the most recently logged day places the day (D-20 verbatim). They are not the same number and are deliberately not collapsed into one."
  - "Pitfall 5a resolves per 04-UI-SPEC, not per the plan text: a deleted most-recent day falls back silently to the first day of the current cycle."
  - "A session against a deleted day stops counting toward rotation position, so deleting a day rewinds the block rather than pushing the lifter forward through a program that is now shorter."
  - "A deload consumes a full rotation of days; a time_off cycle consumes none and is measured in calendar days from duration_days — the first interpretation of that column as calendar time anywhere in the codebase."
  - "Consecutive time-off cycles chain (3 days + 5 days = 8 days off), rather than each measuring independently from the last session."
  - "A finished block reports completion and never loops back to cycle one."
  - "The Home card's exercise line is its own format and is not the slot row's summary — it omits rest and uses × / @ — while sharing the em-dash-for-null convention."

metrics:
  duration: ~55 min
  completed: 2026-08-22

actuals:
  tokens: 34000
  tasks: 3
  commits: 3
---

# Phase 04 Plan 10: Home "Next Up" Card Summary

The Home tab now derives which workout is next from logged history at read time — cycle from
rotation count, day from the last day actually trained — and renders that day's exercises with
their targets resolved for the cycle the lifter is genuinely in, plus read-only target-muscle
chips, scheduled-time-off and block-complete states.

## What Shipped

**`apps/mobile/lib/programs/next-up.ts`** — the position resolver 04-08 flagged as the phase's one
unsolved question. Pure: no database import, no React import, no clock read; `today` is an
argument. Generic over the caller's day and cycle types via `PositionDay` / `PositionCycle`
structural minimums, which is what lets it stay free of any `lib/db` import while still handing
back `ProgramDay` / `ProgramCycle` to the screen. Returns a five-member union:
`no-active-program` | `no-days` | `workout` | `time-off` | `program-complete`, each carrying
`skippedTimeOffCycleIds`.

Three exported helpers make the subtle rules separately assertable:

| Helper | Rule |
|---|---|
| `countableHistory(sessions, days)` | completed + non-null `routineDayId` + the day still exists, ordered by `localDate` → `startedAt` → `id`. Drives rotation count. |
| `lastLoggedDayIndex(sessions, days)` | the index of the most recently logged day, or `null` when there is no history or that day was deleted. Drives which day is next. |
| `cycleSpan(cycle, dayCount)` | `dayCount` for `training` and `deload`, `0` for `time_off`. |

**`apps/mobile/lib/db/programs/next-up-query.ts`** — `loadNextUp(db = getPowerSync())`. One select
when there is no active pointer, two when the pointer names a routine that has not synced or has
been archived, and exactly **twelve** for a full load (preference, routine archived-check,
`loadProgramTree`'s five, `loadExerciseNameMap`'s two, history, muscle mappings, muscle groups).
The count is asserted as an exact number and proven identical for 3 vs 30 exercises and for 1 vs
200 logged sessions. The completed-session filter is a Drizzle `where` clause, with no `LIMIT`:
the row count *is* the lifter's position, so truncating it would move them backwards in their
program.

**`apps/mobile/app/(tabs)/index.tsx`** — eight rendered states (error, loading skeleton, no active
program, no days, a workout, a workout day with no exercises, scheduled time off, block complete).
Target-muscle chips carry `FilterChipRow`'s chip shape with none of its interaction — plain
`View`s, no `accessibilityRole="button"`, no selected state, no `numberOfLines` (R4). No "Start
Workout" action, per the UI-SPEC's Phase-5 boundary.

## The Position Question 04-08 Handed Over

04-08's summary said nothing in the phase answered "which cycle am I currently IN", and that
`selectedCycleId` is browsing state rather than position. That is now answered, and `selectedCycleId`
is untouched — the resolver reads nothing from the builder screen.

D-20 states two mechanisms in one sentence: *"the next day is the one following the most recent
completed session's `routine_day_id`, and the current cycle follows from how many rotations have
completed."* Those are two different numbers, and the implementation keeps them separate rather
than collapsing them into a single index:

- **Cycle** ← `countableHistory(...).length`, walked against each cycle's `cycleSpan`.
- **Day** ← `(lastLoggedDayIndex + 1) % dayCount`, falling back to `0`.

Keeping them separate is what makes the rotation self-heal: a lifter who repeats a day or starts a
different day explicitly (which Phase 5 allows) still gets "the day after the one I actually did",
not "the day my session count says I should be on".

`routine_cycle.duration_days` is now interpreted as calendar time for the first time in the
codebase. The clock starts at the last completed session's `local_date` (or `today` when there is
no history), and each elapsed `time_off` cycle consumes its own `duration_days` from the elapsed
count before the next cycle is considered — so consecutive time-off cycles chain to 8 days rather
than overlapping to 5. `daysRemaining` never goes negative, and a device clock that has moved
behind the last session floors the elapsed count at zero rather than inventing time.

## Deviations from Plan

### Binding-contract overrides (04-UI-SPEC wins over plan text)

**1. [UI-SPEC] Pitfall 5a resolves to the first day of the current cycle, not to a rewound day**

- **Found during:** Task 1
- **Plan text:** must-have truth — *"deleting a day rewinds the rotation rather than crashing or
  silently landing on the first day with no acknowledgement"*, with the day derived from
  `remaining`.
- **UI-SPEC text:** *"resolves **silently** to 'first day of the current cycle' per D-20's own
  fallback rule — this never surfaces as a user-visible error state"*.
- **Resolution:** the UI-SPEC governs. `lastLoggedDayIndex` returns `null` when the most recently
  logged day is gone, and the card renders `days[0]` of the current cycle exactly as it renders any
  ordinary next day. Both halves of the plan's intent survive: the deleted session still stops
  counting toward rotation position (so the *cycle* rewinds), only the *day* choice changed.
- **Files:** `apps/mobile/lib/programs/next-up.ts`
- **Commit:** `03b434c`

**2. [UI-SPEC] The time-off heading is "You're on scheduled time off.", not "Scheduled time off"**

- **Found during:** Task 3. The plan's `nextUpHeading` behavior block specified
  `'Scheduled time off'`; the UI-SPEC and the Copywriting Contract both give the exact string
  `"You're on scheduled time off."`. UI-SPEC copy shipped.
- **Commit:** `6c460b9`

**3. [UI-SPEC] The no-active-program body is the UI-SPEC's copy, not the plan's**

- **Found during:** Task 3. Plan: *"Pick a program on the Programs tab and it will show up here."*
  UI-SPEC / Copywriting Contract: *"Build or activate one to see what's next."* UI-SPEC copy
  shipped, with a `Build or activate one` link.
- **Commit:** `6c460b9`

**4. [UI-SPEC] Target muscles render as read-only chips, not through `MuscleTargetList`**

- **Found during:** Task 3. The plan told the card to reuse `MuscleTargetList`, which renders
  `"Primary muscles: X"` / `"Secondary muscles: Y"` prose lines. The UI-SPEC specifies *"a row of
  read-only target-muscle chips (visually identical to `FilterChipRow`'s chip shape but
  non-interactive)"* at the card level, above the per-exercise lines. Chips shipped, aggregated
  across the day's exercises in first-appearance order without repeats. `MuscleTargetList` is
  untouched and still serves the exercise-detail screen.
- **Commit:** `6c460b9`

**5. [Prompt/UI-SPEC] The exercise line is the card's own format, not `formatSlotTargets`**

- **Found during:** Task 3. The plan instructed the card to render through `programs.tsx`'s
  `formatSlotTargets`. That function no longer exists (deleted in `af9575d` as dead code carrying a
  contradictory `8-8 → 8` collapse rule), `programs.tsx` is 04-11's file this wave, and the UI-SPEC
  gives the card its own template anyway. `formatNextUpExerciseLine` lives in `index.tsx`:
  `"{name}: {sets} × {min}–{max} reps @ {rir} RIR"` — no rest, em dash per null field, `8–8` never
  collapsed, `0` never substituted for a null. An entirely untargeted exercise reuses the slot
  row's already-approved `"No targets set."` string rather than rendering
  `"— × —–— reps @ — RIR"`.
- **Commit:** `6c460b9`

### Technical deviations (autonomous, pre-approved)

**6. [Rule 3 - Blocking] `next-up.ts` is generic over day/cycle types instead of importing them**

- The plan's own acceptance criterion forbids `next-up.ts` importing the local database modules,
  but the resolver's result union needs `ProgramDay` / `ProgramCycle`. Resolved with structural
  `PositionDay` / `PositionCycle` constraints and generic parameters, so the caller's richer types
  pass straight through and no `lib/db` type import exists.

**7. `next-up.ts` imports `sortByOrderThenId` from `lib/db/programs/order-index`**

- `order-index.ts` is a dependency-free pure module that happens to live under `lib/db` — it
  imports nothing at all. Copying its comparator would put the tie-breaking rule in two places,
  which is exactly how two reads of the same data start disagreeing. The plan's three purity greps
  (`from './db'`, `from '@/lib/db'`, `drizzle-orm`) all still return nothing, as does `Date.now()`.

**8. `loadNextUp` reads the routine row itself before calling `loadProgramTree`**

- `loadProgramTree` does not select `archived_at`, and `load-program.ts` belongs to 04-08. A
  dedicated `{ id, archivedAt }` select costs one query and lets an archived or not-yet-synced
  pointer return `routine: null` after **two** selects instead of loading a seven-query tree first.

**9. `NextUpData` has no `slotsByDayId`**

- The plan listed both `days` and `slotsByDayId`. `ProgramDay.slots` already is that index;
  a second copy would be a second source of truth for the same rows. Dropped.

**10. The full-load query count is twelve, not the plan's implied ten**

- `loadProgramTree` called without a pre-built name map runs `loadExerciseNameMap`'s two extra
  selects (seeded + custom exercises). Twelve is still constant and asserted invariant against both
  fixture size and history length. Passing a cached name map in from the screen would drop it to
  ten and is a clean later optimisation.

**11. `skippedTimeOffCycleIds` is returned but not surfaced**

- The plan says a skipped null-duration time-off cycle should be "reported so the caller can
  surface it". The resolver reports it; the screen does not render it, because the UI-SPEC defines
  no card state for it and inventing one would be a user-facing design decision this executor is
  not authorised to make. Recorded below as a deferred WINDOWS entry.

**12. The no-program and block-complete links route to `/(tabs)/programs`, not the Program Library**

- The UI-SPEC says these link "into the Program Library", but `app/programs/library.tsx` is 04-11's
  file and does not exist at this base commit — routing to it would fail. The Programs tab is the
  entry point to the library. A one-line route change once 04-11 merges.

**13. `nextUpHeading` also covers `no-days` and `no-active-program`**

- The plan's four heading cases left two union members unhandled. Both return already-approved
  Copywriting-Contract strings (`"No days yet"`, `"No active program"`) so the function is total
  over the union rather than needing a non-null assertion at the call site.

## Auth Gates

None.

## Known Stubs

None. Every branch the card can reach renders defined copy; no placeholder text, no hardcoded empty
data, no unwired component.

## Threat Flags

None. This plan adds only local read paths — no network endpoint, no auth path, no schema change,
no new file access. The plan's own register (T-04-48 DoS, T-04-49 tampering, T-04-51 repudiation)
is mitigated as written: the query count is asserted exactly and proven invariant, the resolver is
structurally unable to index `days` out of range (asserted across 1–4 days × 0–3 cycles × 0–12
sessions), an archived or missing active routine returns `routine: null` without throwing, and the
history read carries no `LIMIT`.

## TDD Gate Compliance

Each of the three tasks was written test-first — the `<behavior>` block was translated into a test
file before its implementation file existed — but the RED phase was **not committed separately**.
Each task landed as a single `feat(...)` commit containing both the failing-then-passing test and
its implementation. `git log` therefore shows three `feat` commits and no `test` commit, so a
strict RED/GREEN gate-sequence check over commit history will not find a RED gate for this plan.

## Verification

All figures are the runner's own summary lines, pasted verbatim.

**`pnpm --filter mobile test`** (baseline at base commit: 601 tests / 37 suites)
```
Test Suites: 40 passed, 40 total
Tests:       684 passed, 684 total
Snapshots:   0 total
Time:        18.639 s, estimated 119 s
```
+3 suites, +83 tests: `next-up` (42), `next-up-query` (15), `home-screen` (26).

**`pnpm --filter mobile typecheck`**
```
$ tsc --noEmit
```
Exit 0, no diagnostics.

**`pnpm --filter mobile build`**
```
Exported: dist
```
Exit 0. Nineteen routes exported, including `/(tabs)`.

**`pnpm --filter @fitness/api-contracts test`** (baseline 92 / 4 — unchanged, nothing in this plan
touches that package)
```
Test Suites: 4 passed, 4 total
Tests:       92 passed, 92 total
```

**Purity and contract greps**
```
grep -c "from './db'\|from '@/lib/db'\|drizzle-orm" apps/mobile/lib/programs/next-up.ts   -> 0
grep -c "Date.now()" apps/mobile/lib/programs/next-up.ts                                   -> 0
grep -rl 'export function resolveTarget' packages apps | wc -l                             -> 1
grep -riE "missed|skipped|fell behind|lapsed" "apps/mobile/app/(tabs)/index.tsx"           -> no match
grep -q "db: WriteDb = getPowerSync()" apps/mobile/lib/db/programs/next-up-query.ts        -> match
grep -q "captureCalendarDay" apps/mobile/lib/db/programs/next-up-query.ts                  -> match
```

**Not run, and why:** `apps/api` unit and e2e suites (nothing in this plan touches `apps/api` or
the server schema; the e2e suite needs a live Postgres). No browser, no Playwright, no native
build — CLAUDE.md forbids browser verification unless the user asks, and this machine has neither
Xcode nor an Android SDK.

## Files Not Touched (parallel-execution boundary)

`lifecycle.ts`, `duplicate-routine.ts`, `root-stack.tsx`, everything under `app/programs/`, and
`app/(tabs)/programs.tsx` are 04-11's this wave and were read but never edited. `MuscleTargetList`,
`ExerciseSlotRow`, `load-program.ts` and `order-index.ts` were read and imported, never modified.
`docs/program-vocabularies.md` was appended to only — 04-07's and 04-09's sections are untouched.

## Deferred WINDOWS Entries

The orchestrator files these after merge; this executor did not call `gsd_run windows append`,
since 04-11 runs concurrently against the same auto-incrementing ledger.

- **kind:** unrun-verify — **file:** apps/mobile/app/(tabs)/index.tsx — **description:** The Home Next Up card has been observed on neither iOS nor Android; no Xcode and no Android SDK on this machine. Native rendering of the card, its chip row and its wrap-and-grow behaviour at large OS font scales rests on typecheck plus correct API usage. Deferred to ROADMAP Phase 999.1.
- **kind:** unrun-verify — **file:** apps/mobile/app/(tabs)/index.tsx — **description:** The card has also not been observed in a browser. CLAUDE.md forbids launching a browser or driving the app unless the user explicitly asks, so the web target's actual appearance (chip wrapping, skeleton, opacity-60 time-off treatment) is unverified visually; only the `expo export --platform web` build is proven.
- **kind:** deviation — **file:** apps/mobile/lib/programs/next-up.ts — **description:** Adopted assumption (RESEARCH A5): a deload cycle is trained and consumes a full rotation of days exactly like a training cycle. If a later phase decides a deload pauses rotation tracking, `cycleSpan` is the single place to change.
- **kind:** deviation — **file:** apps/mobile/lib/programs/next-up.ts — **description:** Adopted resolution (RESEARCH Pitfall 5a): a completed session logged against a since-deleted day stops counting toward rotation position, so deleting a day rewinds which cycle the lifter is in. The rejected alternative — keeping it countable — makes the answer depend on which day was deleted.
- **kind:** deviation — **file:** apps/mobile/lib/programs/next-up.ts — **description:** 04-UI-SPEC overrides 04-10-PLAN's must-have truth on the deleted-day case: when the most recently logged day has been deleted, the next day resolves silently to the first day of the current cycle, never to a rewound index and never to a visible error.
- **kind:** deviation — **file:** apps/mobile/lib/programs/next-up.ts — **description:** Consecutive time-off cycles chain (each elapsed cycle consumes its own duration_days from the elapsed count before the next is considered), so a 3-day and a 5-day time-off cycle back to back are 8 days off. Neither CONTEXT.md nor the UI-SPEC specifies this; the alternative (each measuring independently from the last session) makes the pair 5 days.
- **kind:** stub — **file:** apps/mobile/lib/programs/next-up.ts — **description:** `skippedTimeOffCycleIds` is computed and returned but nothing renders it. A time-off cycle synced with a null duration_days is silently walked past. Surfacing it needs a card state the UI-SPEC does not define.
- **kind:** todo — **file:** apps/mobile/app/(tabs)/index.tsx — **description:** The no-active-program and block-complete links route to `/(tabs)/programs` because `app/programs/library.tsx` (04-11) did not exist at this base commit. The UI-SPEC asks for a link into the Program Library; repoint once 04-11 has merged.
- **kind:** todo — **file:** apps/mobile/lib/db/programs/next-up-query.ts — **description:** `loadNextUp` issues 12 selects; 2 of them are `loadExerciseNameMap`'s seeded/custom reads, which the Home screen could hoist and pass in as a cached name map to bring the count to 10.
- **kind:** deviation — **file:** apps/mobile/lib/programs/__tests__/next-up.test.ts — **description:** All three tasks were written test-first but committed as single `feat` commits; no separate RED-phase `test(...)` commit exists for this plan.

## Self-Check: PASSED

Created files verified present on disk:
- `apps/mobile/lib/programs/next-up.ts` — FOUND
- `apps/mobile/lib/programs/__tests__/next-up.test.ts` — FOUND
- `apps/mobile/lib/db/programs/next-up-query.ts` — FOUND
- `apps/mobile/lib/db/__tests__/next-up-query.test.ts` — FOUND
- `apps/mobile/app/(tabs)/__tests__/home-screen.test.ts` — FOUND
- `apps/mobile/app/(tabs)/index.tsx` — FOUND (modified)
- `docs/program-vocabularies.md` — FOUND (appended)

Commits verified in `git log`:
- `03b434c` feat(04-10): derive program position from logged history — FOUND
- `28b5b83` feat(04-10): load the Home card's data in a bounded number of local queries — FOUND
- `6c460b9` feat(04-10): lead the Home tab with the next workout — FOUND

No commit in this plan deleted a tracked file (`git diff --diff-filter=D HEAD~3 HEAD` is empty).
