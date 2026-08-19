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
- [ ] **Phase 3: Exercise Catalog** - ~900 seeded exercises, muscle taxonomy, load types, custom exercises
- [ ] **Phase 4: Program Builder** - Author routines with days, cycles, and per-exercise targets
- [ ] **Phase 5: In-Gym Session Logging** - The core loop: log a full offline workout without friction *(dogfooding starts here)*
- [ ] **Phase 6: Gym Profiles & Plate Math** - Multi-gym equipment config and equipment-aware plate calculation
- [ ] **Phase 7: Advanced Set Types** - Supersets, drop sets, myoreps, partials, warm-ups, per-side logging
- [ ] **Phase 8: Progression Engine** - Rule-based "what to lift next", offline, increment-aware
- [ ] **Phase 9: Records & Client Analytics** - PR detection and on-device volume, trends, and per-exercise history
- [ ] **Phase 10: Server Analytics & Reconciliation** - Authoritative PRs, long-horizon rollups, recompute-on-edit
- [ ] **Phase 11: Program Generation** - Generate a pre-periodized program from goal, equipment, and schedule
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

**Plans**: 11/11 plans executed (10/11 executed; 1 gap-closure plan pending — see `01-VERIFICATION.md`)

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

**Plans**: 12 plans (11 executed, 1 gap closure outstanding)

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

- [ ] 03-12-PLAN.md — Close G-03-2: a catalog write path a PowerSync view accepts, proven against a real engine in a real browser

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

**Plans**: TBD

Plans:

- [ ] 04-01: TBD during `/gsd-plan-phase 4`

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

**Plans**: TBD

Plans:

- [ ] 05-01: TBD during `/gsd-plan-phase 5`

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

**Plans**: TBD

Plans:

- [ ] 06-01: TBD during `/gsd-plan-phase 6`

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

**Plans**: TBD

Plans:

- [ ] 07-01: TBD during `/gsd-plan-phase 7`

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

**Plans**: TBD

Plans:

- [ ] 08-01: TBD during `/gsd-plan-phase 8`

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

**Plans**: TBD

Plans:

- [ ] 09-01: TBD during `/gsd-plan-phase 9`

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

**Plans**: TBD

Plans:

- [ ] 10-01: TBD during `/gsd-plan-phase 10`

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

**Plans**: TBD

Plans:

- [ ] 11-01: TBD during `/gsd-plan-phase 11`

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

**Plans**: TBD

Plans:

- [ ] 12-01: TBD during `/gsd-plan-phase 12`

## Backlog

### Phase 999.1: Android verification sweep (BACKLOG)

**Goal**: Verify the Android build across every phase's UAT criteria in a single pass, once all phases are built
**Source phase**: all (project-wide policy)
**Deferred at**: 2026-08-15 by user decision during `/gsd-verify-work 01`
**Policy**: Android-specific UAT items are skipped in every phase and accumulate here. iOS and web verification proceed normally per phase and are NOT deferred.
**Prerequisites**: Android SDK + JDK 17 + emulator image (none installed as of deferral), Expo dev-client Android build
**Accumulated items**:

- [ ] Phase 01 test 2: sign up / sign in reaching the authenticated five-tab home screen on Android
- [ ] Phase 01 test 5: maximum OS accessibility font-scale wrap-and-grow on Android
- [ ] (append Android items from phases 02-12 as each phase defers them)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Cross-Platform Foundation | 11/11 | In Progress|  |
| 2. Data Model & Sync Engine | 13/13 | Complete    | 2026-08-17 |
| 3. Exercise Catalog | 11/11 | In Progress|  |
| 4. Program Builder | 0/TBD | Not started | - |
| 5. In-Gym Session Logging | 0/TBD | Not started | - |
| 6. Gym Profiles & Plate Math | 0/TBD | Not started | - |
| 7. Advanced Set Types | 0/TBD | Not started | - |
| 8. Progression Engine | 0/TBD | Not started | - |
| 9. Records & Client Analytics | 0/TBD | Not started | - |
| 10. Server Analytics & Reconciliation | 0/TBD | Not started | - |
| 11. Program Generation | 0/TBD | Not started | - |
| 12. Body Metrics & Dashboard | 0/TBD | Not started | - |
