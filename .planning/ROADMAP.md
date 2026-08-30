# Roadmap: Fitness — MacroFactor Workouts Clone

## Overview

Twelve phases from empty repo to full functional parity with MacroFactor Workouts. The ordering is driven by two
constraints research made non-negotiable. First, the local-first data model and sync protocol must be settled before any
feature code builds on top of them — retrofitting sync onto sync-naive code is the most common local-first rebuild
trigger, and the majority of unrecoverable risk in this project concentrates there. Second, there must be a phase where
the app becomes genuinely usable for real training well before everything is built, because that is the forcing function
that surfaces sync, backgrounding, and friction bugs under actual gym conditions rather than synthetic tests — and it is
the documented defense against solo full-parity projects stalling.

Phases 1–2 lay the cross-platform shell and the data/sync foundation. Phases 3–5 build the vertical slice that makes the
app real: an exercise catalog, a program you author, and an in-gym logging loop that works with the phone in airplane
mode. **Phase 5 is the dogfooding milestone** — from there you train with your own app while the remaining seven phases
are built. Phases 6–8 add the equipment model, advanced set types, and the progression engine that delivers the core
value promise. Phases 9–10 turn logged history into records and analytics. Phases 11–12 close parity with auto-generated
programs, body metrics, and the customizable dashboard. Sequencing the completionist surface last is not the same as
cutting it — every v1 requirement is mapped.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Cross-Platform Foundation** - Monorepo, Expo app on iOS/Android/web, NestJS API, accounts
- [x] **Phase 2: Data Model & Sync Engine** - Domain schema, local SQLite, offline writes, multi-device convergence (completed 2026-08-17)
- [x] **Phase 3: Exercise Catalog** - ~900 seeded exercises, muscle taxonomy, load types, custom exercises (completed 2026-08-20)
- [ ] **Phase 4: Program Builder** - Author routines with days, cycles, and per-exercise targets
- [ ] **Phase 5: In-Gym Session Logging** - The core loop: log a full offline workout without friction *(dogfooding starts here)*
- [x] **Phase 6: Gym Profiles & Plate Math** - Multi-gym equipment config and equipment-aware plate calculation (completed 2026-08-28)
- [ ] **Phase 7: Advanced Set Types** - Supersets, drop sets, myoreps, partials, warm-ups, per-side logging
- [ ] **Phase 8: Progression Engine** - Rule-based "what to lift next", offline, increment-aware
- [ ] **Phase 9: Records & Client Analytics** - PR detection and on-device volume, trends, and per-exercise history
- [x] **Phase 10: Server Analytics & Reconciliation** - Authoritative PRs, long-horizon rollups, recompute-on-edit (completed 2026-08-29)
- [x] **Phase 11: Program Generation** - Generate a pre-periodized program from goal, equipment, and schedule (completed 2026-08-30)
- [ ] **Phase 12: Body Metrics & Dashboard** - Measurements, progress photos, body-map heatmap, customizable dashboard

## Phase Details

### Phase 1: Cross-Platform Foundation

**Goal**: A signed-in user can open the same account on iOS, Android, and a desktop browser, from one codebase.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-05, PLAT-06, PLAT-09
**Success Criteria** (what must be TRUE):

  1. User can create an account, sign in, and land on the same authenticated home screen on iOS, Android, and in a desktop browser
  2. User stays signed in across app restarts, and the session survives a multi-week gap between opens
  3. A component needing platform-specific behavior can be written as `.web.tsx` and the shared code picks it up automatically
  4. The API carries an explicit version from its first request, so a months-old mobile build can never be broken by a server deploy

**Plans**: 17/17 plans executed (11 original + 6 gap closure) (10/11 executed; 1 gap-closure plan pending — see `01-VERIFICATION.md`)

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Walking Skeleton tracer: monorepo, versioned NestJS API, Postgres, Better Auth, Expo client; create an account end-to-end

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Appearance foundation: NativeWind token contract and a persisted system/light/dark control
- [x] 01-03-PLAN.md — API version contract: URI versioning plus a minimum-supported-client-version floor returning 426

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Password reset: mailer port with an SMTP adapter, local mail catcher, and the web-only reset page
- [x] 01-05-PLAN.md — Offline-tolerant session lifecycle: transport-failure vs. revocation split, non-blocking cold start, sign-out seam

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-06-PLAN.md — Auth screens: sign-in, sign-up, and forgot-password with every UI-SPEC state
- [x] 01-07-PLAN.md — Navigation shell: native tabs, deep-linkable web tabs, and the `.web.tsx` escape-hatch convention

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-08-PLAN.md — CI on push against a real Postgres, and the completed phase validation contract

**Wave 6** *(gap closure — `01-VERIFICATION.md` status: gaps_found)*

- [x] 01-09-PLAN.md — Native session credential: explicit sign-out actually revokes server-side, and a revocation becomes observable
- [x] 01-10-PLAN.md — Review warnings WR-02/WR-03, and a device-verification recipe for the four open human checks

**Wave 7** *(gap closure — the origin-guard prohibition that FAILED re-verification)*

- [x] 01-11-PLAN.md — Session-credential origin guard: replace the string-prefix check with a parsed-origin comparison, and pin all four bypass classes

### Phase 2: Data Model & Sync Engine

**Goal**: Anything the user writes succeeds offline and converges correctly across their devices, on a schema that can express real training data.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PLAT-02, PLAT-03, PLAT-04, PLAT-07, PLAT-08, PLAT-10, LOG-22
**Success Criteria** (what must be TRUE):

  1. User can create and edit records with the device in airplane mode, and they sync automatically once connectivity returns, with no manual sync action
  2. When phone and browser both edit the same workout offline and then reconnect, no logged set is lost — proven by an automated two-device concurrent-edit test
  3. Sync and cold start stay fast against a seeded corpus of 1–2 years of realistic training history, not a handful of hand-entered workouts
  4. Upgrading the app across a local schema change preserves unsynced on-device data, verified against a populated pre-migration database
  5. A weight entered in either unit round-trips through storage and display without drifting, and a workout finished at 11:45pm is attributed to that day regardless of timezone

**Plans**: 13/13 plans executed (12/12 executed; 8 planned + 4 gap-closure after round-1 verification + 1 gap-closure after round-2 verification returned `gaps_found`)

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Tracer: a workout started in airplane mode reaches Postgres, through every layer, one row

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — The full domain schema, the whole-session aggregate write, and calendar-day attribution

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Conflict policy, the durable conflict log, tombstones, and the two-device convergence proof
- [x] 02-04-PLAN.md — Weights in kilograms with exactly one conversion boundary
- [x] 02-05-PLAN.md — Durability: crash recovery, and unsynced writes surviving a client schema change
- [x] 02-06-PLAN.md — Data export, and the real unsynced-write count behind the sign-out confirmation

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-07-PLAN.md — The seeded 18-month corpus and the performance budget as assertions
- [x] 02-08-PLAN.md — The pull leg: sync service, per-user buckets, and two devices converging

**Wave 5** *(gap closure — criterion 4 unproven, and 4 critical code-review findings)*

- [x] 02-09-PLAN.md — Tracer: a set logged in a real browser, into a real PowerSync database, survives close and reopen
- [x] 02-10-PLAN.md — A bodyweight set round-trips as NULL, not as zero kilograms (CR-02, WINDOWS #20/#21)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 02-11-PLAN.md — The client reads what the server said; one bad op stops wedging the queue (CR-01, CR-03, CR-04)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 02-12-PLAN.md — Schema-change survival against a populated database, automatic reconnect drain, and two-client convergence

**Wave 8** *(gap closure — round-2 verification: the PATCH apply path clobbers every field a PATCH does not name)*

- [x] 02-13-PLAN.md — A PATCH writes only what it named, on all three applied tables (LOG-22 finish-workout case)

### Phase 3: Exercise Catalog

**Goal**: The user can find any exercise they train, and the catalog carries the muscle and load metadata everything downstream depends on.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: EXER-01, EXER-02, EXER-03, EXER-04, EXER-05, EXER-06, EXER-07, EXER-08, EXER-09, EXER-10
**Success Criteria** (what must be TRUE):

  1. User can search and filter roughly 900 exercises by name, muscle group, equipment, and movement pattern, and open one to see its target muscles, cues, and images
  2. User can create and edit their own exercises, and request suggested alternatives for any exercise
  3. Archiving an exercise removes it from pickers while leaving its past logged sets intact and correctly attributed
  4. Every exercise carries an explicit load type, so bodyweight, assisted, time-based, and distance-based movements are all representable before any logging UI exists

**Plans**: 15/17 plans executed (14 executed, 3 gap closure outstanding)

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Tracer: one exercise, from bundled snapshot to detail screen, with no network

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — The four schema gaps closed: load_type CHECK, bodyweight contribution, per-user preference table, and the blocking schema push

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — `exercise` becomes a second sync root: custom exercises and preferences reach Postgres
- [x] 03-04-PLAN.md — Normalization: free-exercise-db onto the canonical 19-group taxonomy, as a committed artifact

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-05-PLAN.md — The seed and the delivery endpoints: ~900 rows in Postgres, versioned snapshot on device

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-06-PLAN.md — Search, filter, and the ~900-row list screen
- [x] 03-07-PLAN.md — The exercise detail screen

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 03-08-PLAN.md — Custom exercise create, edit, and duplicate-from-seed
- [x] 03-09-PLAN.md — Archive and never-suggest, per user, on shared rows

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 03-10-PLAN.md — Smart swap: deterministic alternatives with a plain-language why

**Wave 8** *(gap closure — blocked on Wave 7 completion)*

- [x] 03-11-PLAN.md — Close G-03-1: framework-level CORS with a shared WEB_ORIGINS allowlist, so credentialed web requests reach the API

**Wave 9** *(gap closure — blocked on Wave 8 completion)*

- [x] 03-12-PLAN.md — Close G-03-2: a catalog write path a PowerSync view accepts, proven against a real engine in a real browser

**Wave 10** *(gap closure — blocked on Wave 9 completion)*

- [x] 03-13-PLAN.md — Close G-03-3: an image tile whose box cannot collapse, applied to all three call sites, with the first tests that assert an image element exists

**Wave 11** *(gap closure — blocked on Wave 10 completion)*

- [x] 03-14-PLAN.md — Close G-03-4: an exercises segment layout with back navigation and native swipe, and an Edit control that is always reachable

**Wave 12** *(gap closure — blocked on Wave 11 completion; the three plans below are parallel, with disjoint files)*

- [x] 03-15-PLAN.md — Close G-03-2: a tile image a source's intrinsic dimensions cannot outgrow, with tests that fail on that defect specifically
- [x] 03-16-PLAN.md — Close G-03-6: one catalog-hydration seam for the whole exercises segment, so a cold deep link stops reporting "not found"
- [x] 03-17-PLAN.md — Close WR-03: automated regression coverage for the exercises auth guard — route hoisting plus the guard boundary itself

### Phase 4: Program Builder

**Goal**: The user can author the program they actually train, with the targets the progression engine will later read.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: PROG-01, PROG-02, PROG-03, PROG-04, PROG-05, PROG-06, PROG-07, PROG-08, PROG-09, PROG-10, PROG-11
**Success Criteria** (what must be TRUE):

  1. User can build a program from scratch with named days, ordered exercises, and per-exercise set/rep-range/RIR/rest targets
  2. User can organize the program into cycles with per-cycle targets, place a deload at the start or end of a cycle, and schedule time off
  3. User can activate, freeze, duplicate, archive, and restore programs, and see the active program's upcoming workouts with its targets
  4. Editing a program never changes what any already-logged workout shows

**Plans**: 17 plans (11/11 executed; 6 gap-closure plans added 2026-08-28)

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Tracer: a named program created offline reaches Postgres and shows on the Programs tab

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — The routine tree: days and exercises sync, gap-based ordering, three-query builder read

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md — Build a day: full-screen catalog picker and inline per-exercise targets
- [x] 04-04-PLAN.md — Lifecycle data: active pointer, freeze flag, status constraint, `user_preference` apply path

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-05-PLAN.md — The swipeable day deck and the always-visible drag handle
- [x] 04-06-PLAN.md — Cycles: table, three-kind vocabulary, CHECK constraint, sync apply path

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-07-PLAN.md — Per-cycle target overrides: sparse table, shared `resolveTarget`, dual-parent apply path

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 04-08-PLAN.md — The cycle strip: author cycles, deload and time off; resolved targets in the builder
- [x] 04-09-PLAN.md — Cycle-aware session snapshot and the editing-never-corrupts-history regression

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 04-10-PLAN.md — Home "next up": position derived from logged history
- [x] 04-11-PLAN.md — The program library: duplicate, archive, restore, activate, freeze

**Gap closure** *(04-VERIFICATION.md `gaps_found`; resolved by D-29 – D-32, 2026-08-28. Waves below restart at 1 — the eleven plans above are already executed.)*

**Gap Wave 1**

- [x] 04-12-PLAN.md — `routine_day.archived_at`: the column, the sync path, the write helpers, the filtered read

**Gap Wave 2** *(blocked on Gap Wave 1 completion)*

- [x] 04-13-PLAN.md — The day page reaches them: Archive, Restore and Duplicate Day
- [x] 04-14-PLAN.md — Mark Ready, archived days out of the rotation, and the history-safety regression

**Gap Wave 3** *(blocked on Gap Wave 2 completion)*

- [x] 04-15-PLAN.md — The Programs screen's injection seam and a programs mount in the durability harness

**Gap Wave 4** *(blocked on Gap Wave 3 completion)*

- [x] 04-16-PLAN.md — Executed browser proof: day duplicate/archive/restore and the time-off conversion

**Gap Wave 5** *(blocked on Gap Wave 4 completion)*

- [x] 04-17-PLAN.md — The requirements ledger and the two contracts that drifted from it

### Phase 5: In-Gym Session Logging

**Goal**: The user can walk into a gym with no signal and log a complete workout without friction. **This is the phase the app becomes real** — dogfooding starts here.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LOG-06, LOG-07, LOG-08, LOG-09, LOG-10, LOG-11, LOG-12, LOG-13, LOG-14, LOG-15, LOG-16, LOG-17, LOG-18, LOG-19, LOG-20, LOG-21
**Success Criteria** (what must be TRUE):

  1. User can start today's programmed workout or a one-off session, and log every set — weight, reps, RIR — in airplane mode from start to finish
  2. Logging a normal set takes at most two taps in the common case, because the previous session's numbers are shown inline and tappable to autofill, and the keypad never hides the value being edited
  3. The rest timer starts automatically on set completion and still alerts the user with the app fully backgrounded and the phone locked, verified on a real device
  4. Force-quitting the app mid-workout and relaunching restores the session with every logged set intact
  5. User can correct a mistake with a single tap-to-undo mid-workout, and can view, edit, duplicate, and backfill past workouts afterward
  6. User finishes to a summary showing muscles trained, PRs, and a per-exercise breakdown, and can correct entries from that screen

**Plans**: 16/16 plans executed (10/16 executed — 05-11…05-16 are gap-closure plans from `/gsd-verify-work`'s `gaps_found`)

Plans:

**Wave 1**

- [x] 05-01-PLAN.md — Tracer: start today's programmed workout and log a set end-to-end — session read, set row, in-app keypad, tap-to-complete, exercise strip and pager, previous-session reference
- [x] 05-02-PLAN.md — Session vocabularies, the ten Phase 5 schema columns and three CHECK constraints, pushed to the live database

**Wave 2** *(blocked on Wave 1)*

- [x] 05-03-PLAN.md — Sync apply path: `personal_record` wired as a singleton root, tuple-sourced validators, notes/pause/preference PATCH fields
- [x] 05-04-PLAN.md — `@fitness/pr-rules`: the four PR types, the estimated-1RM validity cutoff, and deterministic warm-up scaling
- [x] 05-05-PLAN.md — Rest and duration timers: persisted wall-clock target, `.web.ts` alert seam, header bar, full-screen extend/skip, honest permission degrade

**Wave 3** *(blocked on Wave 2)*

- [x] 05-06-PLAN.md — Per-exercise actions: targets sheet with program write-back, notes at three levels, warm-up generation, add/swap/remove/reorder
- [x] 05-07-PLAN.md — Session lifecycle: one-off start, pause/resume, finish, discard, Home in-progress banner, auto-advance and workout settings

**Wave 4** *(blocked on Wave 3)*

- [x] 05-08-PLAN.md — Finish summary: muscles trained, PR detection and writes, per-exercise breakdown with e1RM, correct-from-summary
- [x] 05-09-PLAN.md — History tab: constant-cost paged list, rename, duplicate, delete

**Wave 5** *(blocked on Wave 4)*

- [x] 05-10-PLAN.md — Editing mode with the live machinery structurally unreachable, and backfilling a past workout to a chosen date

**Gap closure** *(from 05-VERIFICATION.md: `gaps_found`, 12/16 must-haves verified)*

**Wave 1**

- [x] 05-11-PLAN.md — Tracer: persist `workout_session.cycle_id` end-to-end (both schemas, sync apply path, start funnel, both screen call sites) with a [BLOCKING] live schema push — LOG-15
- [x] 05-13-PLAN.md — UI-SPEC amendment for the three unspecified surfaces (set-row long-press note, Session Note menu row, reorder drag sheet) plus the seal-blocking COVERAGE.md — LOG-14, LOG-16

**Wave 2** *(blocked on Wave 1)*

- [x] 05-12-PLAN.md — Browser-real proof that write-back targets the cycle override, not the base row, and survives a reload — LOG-15

**Wave 3** *(blocked on Wave 2)*

- [x] 05-14-PLAN.md — Set-level long-press and Session Note triggers, the relocated warm-up "W" badge, and a three-level notes spec — LOG-16

**Wave 4** *(blocked on Wave 3)*

- [x] 05-15-PLAN.md — ReorderExercisesSheet, transactional and idempotent reorder, font-scale-aware drop arithmetic, drag spec — LOG-14

**Wave 5** *(blocked on Wave 4)*

- [x] 05-16-PLAN.md — Execute the full Playwright durability project (12 specs, never run before), fix real failures, close WINDOWS #109/#116/#118/#123 — LOG-14, LOG-15, LOG-16

### Phase 6: Gym Profiles & Plate Math

**Goal**: The app only ever shows the user loads their actual gym can produce.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: GYM-01, GYM-02, GYM-03, GYM-04, GYM-05, GYM-06, GYM-07
**Success Criteria** (what must be TRUE):

  1. User can configure multiple gyms with their real bars, plate denominations and counts, machine availability, stack ranges, and base resistance
  2. User sees a live plate breakdown while entering a barbell weight, without leaving the entry screen
  3. Plate math and any suggested load only ever use equipment the active profile actually has — a home gym with 5 lb jumps is never shown a 152.5 lb load
  4. User can switch gyms mid-program and mark equipment unavailable mid-workout, and be offered alternatives

**Plans**: 8/8 plans executed

Plans:

**Wave 1**

- [x] 06-01-PLAN.md — Tracer: a typed barbell weight shows a real plate breakdown from a synced gym profile, and the profile reaches Postgres

**Wave 2** *(blocked on Wave 1)*

- [x] 06-02-PLAN.md — Achievability rounding with an explicit direction, nearest-loadable neighbours, and the one band predicate
- [x] 06-03-PLAN.md — Gym Profiles list, action sheet, gym archival, and the Profile tab entry point

**Wave 3** *(blocked on Wave 2)*

- [x] 06-04-PLAN.md — Gym Profile Editor: bar, plate denominations and counts, dumbbells, machines and cable
- [x] 06-05-PLAN.md — The full equipment band, and every app-generated load made achievable

**Wave 4** *(blocked on Wave 3)*

- [x] 06-06-PLAN.md — Mark equipment unavailable mid-workout and be offered equipment-aware alternatives
- [x] 06-07-PLAN.md — Switch gyms mid-workout without disturbing anything already logged

**Wave 5** *(blocked on Wave 4)*

- [x] 06-08-PLAN.md — The equipment-shape reference doc, the full durability run, and the validation contract

### Phase 7: Advanced Set Types

**Goal**: The user can log how they actually train — supersets, drops, myoreps, partials, and per-side work — without the common case getting slower.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: SETS-01, SETS-02, SETS-03, SETS-04, SETS-05, SETS-06, SETS-07, SETS-08, SETS-09
**Success Criteria** (what must be TRUE):

  1. User can change a set's type by tapping its set number, and logging a plain working set is no slower than before this phase existed
  2. User can log drop sets and myoreps as grouped sub-entries under one logical set, plus failure sets, partial reps, and warm-ups
  3. Warm-up sets are excluded from working volume while still appearing in the session
  4. User can superset two adjacent exercises and the rest timer starts only after both are done, then detach them again
  5. User can log different weights and reps for left and right on a unilateral exercise

**Plans**: 9/9 plans executed

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Tracer: a drop-set sub-entry, from the set-number tap to an indented child row

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-02-PLAN.md — Working-volume and records predicates across every query call site; partials excluded from PRs
- [x] 07-03-PLAN.md — Grouped rows never inflate the count: auto-advance and the strip fraction read parents only
- [x] 07-04-PLAN.md — The picker's full behavior table, the counted destructive confirm, and failure at 0 RIR

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-05-PLAN.md — Groups you can grow: myoreps, partials, the "+ Add {type}" control, and per-child removal
- [x] 07-06-PLAN.md — Superset formation and detach: the group predicate module and four new action-sheet rows

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07-07-PLAN.md — Superset behaviour: rest suppression, member advance, link badge, and partner chip

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 07-08-PLAN.md — Per-side logging: the derived mode, the left-side stamp, and the automatic right-side child

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 07-09-PLAN.md — Sync-boundary threat verification, the durability e2e proof, and the validation sign-off

### Phase 8: Progression Engine

**Goal**: The app tells the user what to lift next, from their own logged history, with no signal. This is the core value promise.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: PRGR-01, PRGR-02, PRGR-03, PRGR-04, PRGR-05, PRGR-06, PRGR-07, PRGR-08, PRGR-09, PRGR-10, PRGR-11
**Success Criteria** (what must be TRUE):

  1. User starting an exercise sees a recommended weight and reps computed from their logged history, with the device offline
  2. Progression triggers when performance beats expected performance (rep-range midpoint plus RIR target), and failure sets progress on beating prior reps at the same load
  3. User can choose whether the engine widens the rep range first or prefers matching the previous weight, and recommendations always snap to the active gym's real increments
  4. When no valid recommendation exists within the target rep range, the app says so explicitly instead of inventing a number
  5. Missing sessions never produces a reduced recommendation; falling short holds the prescription, and a reduction is only suggested after 2–3 consecutive misses
  6. The same rule code runs on client and server, so a recommendation can never differ between them

**Plans**: 6 plans

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Tracer: fill `packages/progression-engine`, snap through plate-math, render a recommendation at exercise start
- [x] 08-02-PLAN.md — D-07's progression preference: vocabulary, column on both sides of sync, push validator, Profile dial

**Wave 2** *(blocked on 08-01)*

- [x] 08-03-PLAN.md — Normalise Phase 7's set vocabulary (per-side on the weaker side, drops through the top set) and the failure-set rule

**Wave 3** *(blocked on 08-03)*

- [x] 08-04-PLAN.md — Shortfall streak, RIR tolerance band, and the layoff invariance PRGR-08 demands

**Wave 4** *(blocked on 08-02 and 08-04)*

- [x] 08-05-PLAN.md — The preference branch in the engine, threaded from `user_preference` to the workout screen

**Wave 5** *(blocked on 08-05)*

- [x] 08-06-PLAN.md — Client/server parity fixture run by three suites, and the real-browser offline proof

### Phase 9: Records & Client Analytics

**Goal**: The user can see what they've achieved and whether they're doing enough, computed on-device.
**Mode:** mvp
**Depends on**: Phase 8
**Requirements**: ANLY-01, ANLY-02, ANLY-03, ANLY-06, ANLY-07, ANLY-08, ANLY-10
**Success Criteria** (what must be TRUE):

  1. User's PRs are detected automatically across heaviest weight, best estimated 1RM, most reps at a weight, and best set volume, and surface in the workout summary
  2. User can browse recent records and switch between PR metrics
  3. User can view a single exercise's performance over time across selectable metrics and ranges, and browse full workout history with trends
  4. User sees this week's progress against targets for muscles trained, sets, and exercises — available immediately after logging, before any sync
  5. Estimated 1RM figures are only shown where the underlying formula is actually valid for the rep range

**Plans**: 2/6 plans executed

Plans:

**Wave 1**

- [x] 09-01-PLAN.md — Tracer: `@fitness/analytics-engine`, `react-native-svg@15.15.4`, `TrendChart`, `SegmentedChipRow`, and the exercise performance screen end-to-end over the last 3 months

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 09-02-PLAN.md — Pure aggregation: rolling-window and trailing-bucket boundaries, the history trend series and its delta, and weekly achieved-versus-target
- [x] 09-03-PLAN.md — Records screen, record row, the History tab's Records link, and the two shipped Phase 5 corrections (per-metric PR badges, the e1RM display union)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 09-04-PLAN.md — Last 7 Days card on the Home tab, with program-derived targets and an all-or-nothing empty state
- [x] 09-05-PLAN.md — History trend card as the session list's header, with the delta chip and untrained weeks omitted
- [x] 09-06-PLAN.md — Performance ranges (3 months, 1 year, all time) and the "View performance" entry link on the exercise detail screen

### Phase 10: Server Analytics & Reconciliation

**Goal**: Long-horizon history stays fast and correct across devices, and editing the past fixes everything derived from it.
**Mode:** mvp
**Depends on**: Phase 9
**Requirements**: ANLY-04, ANLY-05, ANLY-09
**Success Criteria** (what must be TRUE):

  1. User can see set volume per muscle group over 1 week, 1 month, and 3 months, and drill into which exercises contributed each muscle's sets
  2. Long-horizon charts stay fast against years of history because rollups are materialized server-side and synced down, not recomputed on every render
  3. Editing a past workout recomputes the PRs and volume figures that depended on it, leaving no stale derived data
  4. A PR set on one device is authoritative across all of them after sync
  5. History endpoints hold their query count as data grows, enforced by assertions against a realistically-sized dataset

**Plans**: 7/7 plans executed

Plans:
**Wave 1**

- [x] 10-01-PLAN.md — Tracer: rollup + watermark tables, the recompute hook inside applyBatch's transaction, the two pull queries and the client mirror

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-02-PLAN.md — ANLY-09 in full: scoped PR replay, vacated-cell invalidation, idempotence
- [x] 10-03-PLAN.md — Client read layer: muscle-map vocabulary, the D-01 rollup-plus-overlay merge, and the drill-down query

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10-04-PLAN.md — Corpus muscle mappings and the executable reconcile query-count budget
- [x] 10-05-PLAN.md — ANLY-04 UI: MuscleHeatmap, MuscleVolumeRow, the /muscle-map route and the History entry point

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 10-06-PLAN.md — ANLY-05 UI: MuscleDrilldownSheet and its wiring into the screen

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 10-07-PLAN.md — Playwright durability evidence and the deferred-verification ledger

### Phase 11: Program Generation

**Goal**: A user who doesn't want to write their own program gets a complete, pre-periodized one that fits their goal, gym, and schedule.
**Mode:** mvp
**Depends on**: Phase 10
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05, GEN-06, GEN-07
**Success Criteria** (what must be TRUE):

  1. User can generate a complete program from training goal, experience level, days per week, and session length
  2. Generated programs only use exercises the active gym profile supports, and never include an excluded exercise
  3. User can choose a split preference, emphasize or deprioritize muscle groups, and decide whether deloads are included and where
  4. Generated programs arrive pre-periodized with per-cycle set, rep, and RIR targets
  5. A generated program is editable exactly like a hand-built one and progresses through the same engine

**Plans**: 6/6 plans executed

Plans:
**Wave 1**

- [x] 11-01-PLAN.md — Tracer: answers become a generated tree and real program rows, plus the periodization dials and the landmark provenance doc (wave 1)
- [x] 11-02-PLAN.md — The `excluded_exercise` synced table, its seven sync touchpoints, the schema push, and the live ownership/validation proof (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-03-PLAN.md — Exclusions on the device: SQLite mirror, read/write module, exclude control and exclusions screen, wired into generation (wave 2)
- [x] 11-04-PLAN.md — The complete split table for full body, upper/lower and push/pull/legs across 2-6 days, plus the completeness invariant (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 11-05-PLAN.md — The generation wizard, the preview with its degradation report, reproducible Regenerate, and Save as the only write (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 11-06-PLAN.md — GEN-07 parity: one fixture table through the real progression engine in three processes, plus a real-browser durability run (wave 4)

### Phase 12: Body Metrics & Dashboard

**Goal**: The user can track their body alongside their training, and shape the home screen around what they care about.
**Mode:** mvp
**Depends on**: Phase 11
**Requirements**: BODY-01, BODY-02, BODY-03, BODY-04, BODY-05, DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):

  1. User can log bodyweight and named measurements over time and view their trends
  2. User can capture progress photos and generate a before-and-after composite
  3. User sees a dashboard with weekly progress, recent records, and insight tiles, and can add, remove, and reorder those widgets
  4. User can reach quick weigh-in, measurement, progress photo, history, new program, and one-off workout from a single quick-action menu

**Plans**: 8 plans

Plans:

**Wave 1**

- [ ] 12-01-PLAN.md — Tracer: the body-metric write path end-to-end, the closed 15-kind vocabulary and its reference doc, and `body_metric`'s push apply path (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 12-02-PLAN.md — Body Metrics overview, the metric entry sheet and its keypad, the track-a-kind picker, and the cm/in half of the unit boundary (wave 2)
- [ ] 12-03-PLAN.md — Progress photos: platform-split capture/downscale/store, `progress_photo`'s push apply path, the gallery, the device-absent placeholder, and photo actions (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 12-04-PLAN.md — Body metric trends: the on-device latest-per-day series, the trend detail screen reusing `TrendChart`, and entry edit/delete (wave 3)
- [ ] 12-05-PLAN.md — The `dashboard_widget` table end-to-end, the forward-compatible widget host and six-widget catalog, and the restructured Home dashboard (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 12-06-PLAN.md — Before & after composite: the platform-split render/share module, the three-step picker, and the device-resident-only selection rule (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 12-07-PLAN.md — The dashboard widget picker: add, remove and drag-reorder on the shipped order-index arithmetic (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 12-08-PLAN.md — The quick-action sheet reaching all six destinations, the inline quick weigh-in, the two Profile entry points, and the `PUSH_DEFERRED_TABLES`-empty assertion (wave 6)

## Backlog

### Phase 999.1: Native verification sweep — iOS + Android (BACKLOG)

**Goal**: Verify the iOS and Android builds against every phase's native UAT criteria in a single pass, once all phases are built
**Source phase**: all (project-wide policy)
**Deferred at**: Android 2026-08-15; iOS 2026-08-19 — both by user decision during `/gsd-verify-work 01`
**Policy**: Native-only UAT items (iOS and Android) are skipped in every phase and accumulate here. Web verification proceeds normally per phase and is NOT deferred.
**Prerequisites**: Xcode + iOS simulator (absent as of deferral: `xcode-select` → CommandLineTools, no Xcode.app, `xcrun simctl` unavailable), Android SDK + JDK 17 + emulator image (absent), Expo dev-client builds for both platforms
**Accumulated items**:

- [ ] Phase 01 test 11: sign up / sign in reaching the authenticated five-tab home screen on iOS
- [ ] Phase 01 test 12: sign up / sign in reaching the authenticated five-tab home screen on Android
- [ ] Phase 01 test 13: offline cold-start after a genuinely elapsed multi-week gap renders authenticated UI with no sign-out (D-01/D-02)
- [ ] Phase 01 test 14: on-device cookie header accepted by the server and session row deleted on explicit sign-out
- [ ] Phase 01 test 15: maximum OS accessibility font-scale wrap-and-grow on iOS and Android
- [ ] Phase 05 test 1 (LOG SC2): log a normal set on a phone — tap previous weight, tap previous reps, tap the checkmark; confirm exactly two taps to autofill plus completion and that the docked keypad never covers the field being edited at any OS font scale
- [ ] Phase 05 test 2 (LOG SC3): complete a set on a real iOS/Android device, background the app and lock the screen; the scheduled expo-notifications rest alert fires audibly/visibly when the wall-clock target elapses
- [ ] Phase 05 test 3 (D-23): deny the notification permission on a real device, then complete a set — countdown still runs, in-app sound/haptic fires, and a persistent inline note states background alerts are off with a path to enable them
- [ ] Phase 05 test 4 (WINDOWS #112): personal_record round trip across two devices — log a PR-setting set on device A and confirm it appears on device B after both sync (PowerSync pull path against a restarted service)
- [ ] Phase 04 test 1: on a real iOS/Android build, drag-reorder exercises in a day via the grip, exercise the Duplicate/Archive/Restore Day controls, and use Mark Ready — order survives re-entry, the four header controls behave as browser-proven, Mark Ready flips the library subtitle to Ready
- [ ] Phase 04 test 2 (WINDOWS #60/#67): restart the PowerSync Service against ops/powersync/sync-rules.yaml, then create a routine_cycle, a routine_exercise_cycle_target and an archived routine_day on device A — all three arrive on device B, the archived day with archived_at intact per D-33's deliberately unfiltered stream
- [ ] Phase 04 test 3 (WINDOWS #59): two devices both offline each activate a different program, then reconnect — exactly one active program after both pushes land
- [ ] Phase 08 test 1: on a real iOS/Android build, use the Profile progression-preference picker (widen rep range vs match previous weight), then open an exercise with logged history and read the RecommendationBanner — the dial changes what is recommended and the banner renders correctly natively
- [ ] Phase 08 test 2 (WINDOWS #154): run the client/server parity fixture, or an equivalent probe, on a real on-device Hermes build — the parity runners currently exercise only Node and V8, so success criterion 6 is unproven on the JS engine the shipped native app actually uses
- [ ] Phase 09 test 1 (WINDOWS #155): TrendChart on a real iOS/Android build — react-native-svg 15.15.4's NATIVE build has never been compiled or rendered on this machine (no Xcode, no Android SDK). The whole phase's chart approach is proven on web only; this is the single largest native unknown in Phase 9
- [ ] Phase 09 test 2 (WINDOWS #158): Records screen on a real device — RecordRow, the four-metric chip switch, and the "{reps} reps @ {weight}" row built from the third batched logged_set read
- [ ] Phase 09 test 3 (WINDOWS #160): Last 7 Days card and History trend card on a real device, including the TrendChart inside the trend card and the progressbar tracks' native accessibility values (the web path needed aria-* rather than accessibilityValue — confirm the native path announces correctly too)
- [ ] Phase 10 test 1 (WINDOWS #165): the Muscle Map on a real iOS and Android build — both `react-native-svg` figures, the window switch and the drill-down sheet. The native build of this library has never been compiled or rendered on this machine (no Xcode, no Android SDK), so the whole body-map approach is proven on web only, exactly as Phase 9's own chart item records
- [ ] (append native items from phases 02-12 as each phase defers them)

### Phase 999.2: Human verification sweep — web target (BACKLOG)

**Goal**: Run every deferred human-judgment UAT checkpoint against the finished web build in a single pass, once all phases are built
**Source phase**: all (project-wide policy)
**Deferred at**: 2026-08-28 — by user decision during `/gsd-verify-work 06`
**Policy**: UAT items requiring live human interaction or subjective visual judgment on the **web** target are skipped in every phase and accumulate here. Items provable by the automated unit/e2e suites are NOT deferred and still gate each phase normally. Native (iOS/Android) items go to Phase 999.1, not here.
**Prerequisites**: A running dev server + API against a clean database, and a browser session driven by hand
**Accumulated items**:

- [x] Phase 06 test 1: cold start — kill dev server/API, clear ephemeral state, boot both from scratch; migration applies cleanly and the seeded "My Gym" profile renders with its plate band (completed 2026-08-28)
- [ ] Phase 06 test 2 (06-01-D2): plate strip renders inside Phase 5's reserved 40px band without shifting the keypad digit grid
- [ ] Phase 06 test 3 (06-03-D1): Gym Profiles click-through from the Profile tab — create/set-active/edit/duplicate/archive/restore, collapsed archived section, active-gym accent styling
- [ ] Phase 06 test 4 (06-04-D7): create a gym in lb, add plates and a machine, save and reopen — values read back exactly as typed, stepper floors at zero
- [ ] Phase 06 test 5 (06-07-D3): Switch Gym mid-session — menu row order, destructive Discard styling, no-confirmation sheet, logged sets keep their displayed weight
- [ ] Phase 04 test 4: swipe/drag between DayDeck pages while a duplicated or archived day sits in the deck — paging works across the archived-filtered day count and the drag handle still reorders with an odd number of live days
- [ ] Phase 04 test 5: visual review at default and maximum OS font scale of the cycle strip's three chip tones, the day page's Duplicate/Archive/Restore controls, the Archived days section (0.6 opacity, 48x48 Restore) and the Edit Cycle form's Days off field — header wraps rather than shrinks, nothing overflows
- [ ] Phase 07 test 1 (SC1 "no slower"): log 5 consecutive plain working sets — no set-type change, no grouping, no per-side, no superset — and confirm the tap sequence and perceived responsiveness match the Phase 5 flow exactly
- [ ] Phase 07 test 2 (SC2): log a drop set, a myorep cluster (activation set plus rest-pause mini-sets), and a full set followed by partials — each group reads as one logical set at a glance (indentation, badge glyph, blank child set-number column). Note myorep and partial have no dedicated e2e case; only drop set was exercised end to end
- [ ] Phase 07 test 3 (SETS-04): tap a completed set's number, pick Failure — the row keeps its weight/reps, shows an F badge, and reads 0 RIR with no further input
- [ ] Phase 07 test 4 (SETS-07/08): open an exercise's overflow sheet, tap Superset — both chips show the link glyph and the page header shows the partner pill with correct light/dark colours
- [ ] Phase 08 test 3: visually review the Profile "Workout settings" progression-preference chip picker (label, spacing, selected-state styling) and the RecommendationBanner's light/dark theming and copy legibility at default and maximum OS font scale
- [ ] Phase 09 test 4 (WINDOWS #156): visual review of the exercise-performance chart, its two-label axis row and the ANLY-10 "not plotted" caption at maximum OS font scale — R16 (no text inside the SVG) is grep-enforced, but legibility of the 120px canvas beside grown text is human judgment
- [ ] Phase 09 test 5 (WINDOWS #159): visual review of the Records screen at maximum font scale — both row lines are unclamped by design, so confirm they wrap rather than collide
- [ ] Phase 09 test 6 (WINDOWS #161): visual review of the Last 7 Days tracks, the History trend card's headline and delta chip, and the range switch at maximum font scale
- [ ] Phase 10 test 2 (WINDOWS #166): subjective visual review of the intensity scale and of the untrained-versus-lowest-real-intensity distinction at maximum OS font scale. The categorical hue split is grep-enforced and unit-asserted; whether it is legible, including for a colourblind reader, is human judgment
- [ ] Phase 10 test 3 (WINDOWS #167): subjective visual review of the Training Volume disambiguation caption and the stale-rollup caption at maximum OS font scale — wrap-and-grow is grep-enforced, but whether the two captions read as informational rather than alarming is human judgment (R25)
- [ ] (append human-judgment web items from phases 01-12 as each phase defers them)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Cross-Platform Foundation | 11/11 | Complete    | 2026-08-19 |
| 2. Data Model & Sync Engine | 13/13 | Complete    | 2026-08-17 |
| 3. Exercise Catalog | 17/17 | Complete    | 2026-08-20 |
| 4. Program Builder | 17/17 | Complete    | 2026-08-28 |
| 5. In-Gym Session Logging | 16/16 | Complete    | 2026-08-28 |
| 6. Gym Profiles & Plate Math | 8/8 | Complete    | 2026-08-28 |
| 7. Advanced Set Types | 9/9 | Complete    | 2026-08-28 |
| 8. Progression Engine | 6/6 | Complete    | 2026-08-29 |
| 9. Records & Client Analytics | 6/6 | Complete    | 2026-08-29 |
| 10. Server Analytics & Reconciliation | 7/7 | Complete    | 2026-08-29 |
| 11. Program Generation | 6/6 | Complete    | 2026-08-30 |
| 12. Body Metrics & Dashboard | 0/TBD | Not started | - |
