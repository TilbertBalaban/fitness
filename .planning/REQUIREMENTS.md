# Requirements: Fitness — MacroFactor Workouts Clone

**Defined:** 2026-08-10
**Core Value:** You can walk into a gym with no signal, log every set of your workout without friction, and the app tells you what to lift next time.

**Scope stance:** Full functional parity with MacroFactor Workouts' public feature surface is the v1 bar, set explicitly by
the project owner. The table-stakes feature set therefore *is* v1 — sequencing is the lever, not scope reduction.

## v1 Requirements

### Platform & Sync

- [ ] **PLAT-01**: User can use the app on iOS, Android, and in a desktop browser, signed into the same account with the same data
- [x] **PLAT-02**: User can log a complete workout start to finish with zero network connectivity
- [x] **PLAT-03**: User's offline changes sync automatically once connectivity returns, without any manual sync action
- [x] **PLAT-04**: User's phone and browser converge correctly after both made changes offline, with no logged set silently lost
- [ ] **PLAT-05**: User can create an account and sign in with email and password
- [ ] **PLAT-06**: User stays signed in across app restarts, and can keep using the app offline even when the session cannot be refreshed
- [x] **PLAT-07**: User's in-progress workout survives app force-quit, crash, or phone restart with every logged set intact
- [x] **PLAT-08**: User can choose kg or lb and see every weight in that unit, with no drift in stored values over repeated conversions
- [ ] **PLAT-09**: User can switch between light and dark appearance
- [x] **PLAT-10**: User can export their training data

### Exercise Library

- [ ] **EXER-01**: User can search the exercise library by name
- [ ] **EXER-02**: User can filter exercises by muscle group, equipment, and movement pattern
- [ ] **EXER-03**: User can view an exercise's detail: target muscles, equipment, setup instructions, technique cues, and static images
- [ ] **EXER-04**: User can create a custom exercise with name, target muscles, equipment, and tracking type
- [ ] **EXER-05**: User can edit or duplicate a custom exercise
- [ ] **EXER-06**: User can archive an exercise, and its past logged sets remain intact and correctly attributed
- [ ] **EXER-07**: User can mark an exercise as never-suggest, without deleting it
- [ ] **EXER-08**: User can log sets against exercises of any load type — external weight, bodyweight, bodyweight plus added load, assisted, time-based, or distance-based
- [ ] **EXER-09**: User's bodyweight contribution is accounted for on bodyweight-loaded exercises so volume and load stay meaningful as bodyweight changes
- [ ] **EXER-10**: User can request suggested alternative exercises for any exercise (smart swap)

### Program Builder

- [ ] **PROG-01**: User can build a program from scratch with named training days
- [ ] **PROG-02**: User can add, remove, and reorder exercises within a training day
- [ ] **PROG-03**: User can set per-exercise targets: number of sets, rep range, RIR target, and rest duration
- [ ] **PROG-04**: User can organize a program into cycles (weeks), each with its own targets
- [ ] **PROG-05**: User can place a deload at the start or end of a cycle
- [ ] **PROG-06**: User can schedule planned time off within a program
- [ ] **PROG-07**: User can duplicate, archive, and restore programs and individual workouts
- [ ] **PROG-08**: User can set which program is active
- [ ] **PROG-09**: User can view the active program's upcoming workouts with target muscles and per-cycle rep/RIR targets
- [ ] **PROG-10**: User can freeze a program so progression stops modifying it
- [ ] **PROG-11**: User can edit a program without corrupting any workout already logged against it

### Session Logging

- [ ] **LOG-01**: User can start today's workout from the active program
- [ ] **LOG-02**: User can start a one-off workout not tied to any program
- [ ] **LOG-03**: User sees the previous session's weight and reps inline in each set row, in the same visual unit as the input
- [ ] **LOG-04**: User can tap the previous value to autofill the current set
- [ ] **LOG-05**: User can enter weight and reps on an in-app numeric keypad that never obscures the value being edited
- [ ] **LOG-06**: User can log RIR per set on a 0–6+ scale, and change it mid-workout
- [ ] **LOG-07**: User can mark a set complete with one tap, and tap again to undo without entering an edit mode
- [ ] **LOG-08**: User's rest timer starts automatically when a set is completed
- [ ] **LOG-09**: User's rest timer keeps correct time and alerts them when the app is backgrounded or the screen is locked
- [ ] **LOG-10**: User can extend or skip the rest timer, and view it full-screen
- [ ] **LOG-11**: User sees a workout duration timer running for the session
- [ ] **LOG-12**: User can pause and resume a workout
- [ ] **LOG-13**: User auto-advances to the next exercise when its sets are complete, and can turn that off
- [ ] **LOG-14**: User can add, swap, or remove exercises mid-workout
- [ ] **LOG-15**: User can adjust targets mid-workout for this session only or persistently
- [ ] **LOG-16**: User can attach notes at set, exercise, and session level
- [ ] **LOG-17**: User can add auto-calculated warm-up sets scaled off the working weight, and toggle the behavior off
- [ ] **LOG-18**: User sees a workout summary on finishing: muscles trained, PRs achieved, and a per-exercise breakdown with estimated 1RM
- [ ] **LOG-19**: User can correct entries directly from the summary screen before dismissing it
- [ ] **LOG-20**: User can view, edit, rename, duplicate, and delete past workouts
- [ ] **LOG-21**: User can backfill training history by editing a past workout's date and time
- [x] **LOG-22**: User's workout is attributed to the calendar day it was logged in, regardless of timezone or a late-night finish

### Advanced Set Types

- [ ] **SETS-01**: User can change a set's type by tapping the set number, without leaving the set row
- [ ] **SETS-02**: User can log a drop set as multiple weight/rep sub-entries grouped under one logical set
- [ ] **SETS-03**: User can log a myorep set as an activation set plus grouped rest-pause mini-sets
- [ ] **SETS-04**: User can log a failure set, recorded at 0 RIR and labelled distinctly
- [ ] **SETS-05**: User can log partial reps distinctly from full reps
- [ ] **SETS-06**: User's warm-up sets are distinguished from working sets and excluded from working volume
- [ ] **SETS-07**: User can superset two adjacent exercises so rest starts only after both are done
- [ ] **SETS-08**: User can detach an exercise from a superset
- [ ] **SETS-09**: User can log different weights and reps for the left and right side of a unilateral exercise

### Gym Profiles & Plate Math

- [ ] **GYM-01**: User can create multiple gym profiles and pick which is active
- [ ] **GYM-02**: User can configure a profile's bar types and weights, available plate denominations and counts, and unit system
- [ ] **GYM-03**: User can configure machine availability, weight-stack ranges, and any built-in starting resistance
- [ ] **GYM-04**: User can assign a gym profile to a workout and switch gyms mid-program
- [ ] **GYM-05**: User sees a live plate breakdown while entering a barbell weight, without leaving the entry screen
- [ ] **GYM-06**: User is only ever shown loads their active profile's actual equipment can produce
- [ ] **GYM-07**: User can mark equipment unavailable mid-workout and be offered alternatives

### Progression Engine

- [ ] **PRGR-01**: User is told what weight and reps to use for each exercise, computed from their logged history
- [ ] **PRGR-02**: User's progression triggers when performance exceeds expected performance, defined as rep-range midpoint plus RIR target
- [ ] **PRGR-03**: User's sets taken to failure progress on beating the prior rep count at the same load
- [ ] **PRGR-04**: User can choose whether the engine expands the rep range first or prefers matching the previous weight
- [ ] **PRGR-05**: User's recommendations snap to the increments their active gym profile can actually produce
- [ ] **PRGR-06**: User sees an explicit "progression unavailable within target rep range" state rather than an unachievable recommendation
- [ ] **PRGR-07**: User picks their own starting weight for an exercise with no logged history, and the engine takes over afterward
- [ ] **PRGR-08**: User is never given a reduced recommendation as a consequence of missing sessions
- [ ] **PRGR-09**: User who falls short of target holds the same prescription, and is only offered a reduction after falling short 2–3 sessions running
- [ ] **PRGR-10**: User's imprecise or off-target RIR still produces sensible recommendations, via tolerance bands rather than exact matching
- [ ] **PRGR-11**: User gets recommendations with zero network connectivity, at the moment they start the exercise

### Analytics & Records

- [ ] **ANLY-01**: User's PRs are detected automatically across heaviest weight, best estimated 1RM, most reps at a weight, and best set volume
- [ ] **ANLY-02**: User sees PRs achieved highlighted in the workout summary
- [ ] **ANLY-03**: User can browse a recent-records list and switch between PR metrics
- [ ] **ANLY-04**: User can see set volume per muscle group on a front/back body-map heatmap over a selectable window (1 week / 1 month / 3 months)
- [ ] **ANLY-05**: User can drill into a muscle group to see which exercises contributed its sets
- [ ] **ANLY-06**: User can view a single exercise's performance over time across selectable metrics and time ranges
- [ ] **ANLY-07**: User can browse their full workout history with trends
- [ ] **ANLY-08**: User can see this week's progress against targets for muscles trained, sets, and exercises
- [ ] **ANLY-09**: User's PRs and volume figures are recomputed correctly when they edit a past workout
- [ ] **ANLY-10**: User's estimated 1RM figures are only presented where the underlying formula is valid for the rep range

### Program Generation

- [ ] **GEN-01**: User can generate a complete program from training goal, experience level, days per week, and session length
- [ ] **GEN-02**: User's generated program only uses exercises their active gym profile's equipment supports
- [ ] **GEN-03**: User's excluded exercises never appear in a generated program
- [ ] **GEN-04**: User can choose a split preference and set muscle-group emphasis or deprioritization
- [ ] **GEN-05**: User's generated program arrives pre-periodized with per-cycle set, rep, and RIR targets
- [ ] **GEN-06**: User can choose whether deloads are included and where they fall
- [ ] **GEN-07**: User can edit a generated program exactly as they would a hand-built one, and it progresses identically

### Body Metrics & Photos

- [ ] **BODY-01**: User can log their bodyweight over time
- [ ] **BODY-02**: User can log named body measurements over time
- [ ] **BODY-03**: User can view measurement and bodyweight trends
- [ ] **BODY-04**: User can capture and store progress photos
- [ ] **BODY-05**: User can generate a before-and-after photo composite

### Dashboard

- [ ] **DASH-01**: User sees a dashboard with weekly progress, recent records, and insight tiles
- [ ] **DASH-02**: User can add, remove, and reorder dashboard widgets
- [ ] **DASH-03**: User can reach high-frequency actions (quick weigh-in, measurement, progress photo, history, new program, one-off workout) from a single quick-action menu

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Program Sharing

- **SHAR-01**: User can export a program to a shareable file
- **SHAR-02**: User can import a program someone else exported

### Parallel Training

- **PARA-01**: User can run a secondary training block (e.g. grip work) concurrently with their main program
- **PARA-02**: User's dashboard and analytics account for both concurrent blocks

### Progression Transparency & Refinement

- **TRAN-01**: User can see the rule and prior performance behind any progression recommendation, inline
- **TRAN-02**: User sees a live PR banner immediately after the set that set it, not only at session end
- **TRAN-03**: User can log additional autoregulation signals (soreness, pump, joint pain) alongside RIR
- **TRAN-04**: User can encode custom progression rules beyond the built-in engine

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Nutrition and macro tracking | MacroFactor's actual core product. A second product surface (food database, macro coaching) would multiply scope for a solo developer and dilute the training-focused core value. Training only. |
| Exercise demo videos (3-angle, voiceover cues) | A content-production problem, not a software problem. Text cues and static images from open datasets instead; leaves room to add video later without re-architecting. |
| Jeff Nippard licensed program imports | Licensed third-party IP, not reproducible. |
| AI/LLM-driven programming or progression | MacroFactor itself deliberately uses deterministic rule-based logic. Rules stay testable, explainable, and debuggable — which matters more than novelty for a personal training tool. |
| Predictive muscle-fatigue exercise re-sequencing (Fitbod-style) | Requires a fatigue-decay model that can't be validated without physiological data, and drifts into the black-box territory the AI exclusion exists to avoid. Show historical volume per muscle and let the user decide. |
| Social feed, public profiles, community programs, leaderboards | Adds moderation, privacy, and feed infrastructure unrelated to the core value, and contradicts the personal-use framing. Program export (v2) covers the legitimate "share a routine with a friend" need. |
| Wearable / HRV / sleep-driven autoregulation | High integration complexity against third-party device ecosystems for a signal that self-reported RIR already covers adequately. |
| Live workout co-viewing / realtime multiplayer | The only realtime requirement that matters is a local rest-timer countdown. Async multi-device sync covers the rest. |
| Period tracking, step-count import | Present in MacroFactor, but belong to its nutrition/general-health surface rather than the training core. |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 — Cross-Platform Foundation | Gaps Found |
| PLAT-05 | Phase 1 — Cross-Platform Foundation | Gaps Found |
| PLAT-06 | Phase 1 — Cross-Platform Foundation | Gaps Found |
| PLAT-09 | Phase 1 — Cross-Platform Foundation | Gaps Found |
| PLAT-02 | Phase 2 — Data Model & Sync Engine | Complete |
| PLAT-03 | Phase 2 — Data Model & Sync Engine | Complete |
| PLAT-04 | Phase 2 — Data Model & Sync Engine | Complete |
| PLAT-07 | Phase 2 — Data Model & Sync Engine | Complete |
| PLAT-08 | Phase 2 — Data Model & Sync Engine | Complete |
| PLAT-10 | Phase 2 — Data Model & Sync Engine | Complete |
| LOG-22 | Phase 2 — Data Model & Sync Engine | Complete |
| EXER-01 | Phase 3 — Exercise Catalog | Pending |
| EXER-02 | Phase 3 — Exercise Catalog | Pending |
| EXER-03 | Phase 3 — Exercise Catalog | Pending |
| EXER-04 | Phase 3 — Exercise Catalog | Pending |
| EXER-05 | Phase 3 — Exercise Catalog | Pending |
| EXER-06 | Phase 3 — Exercise Catalog | Pending |
| EXER-07 | Phase 3 — Exercise Catalog | Pending |
| EXER-08 | Phase 3 — Exercise Catalog | Pending |
| EXER-09 | Phase 3 — Exercise Catalog | Pending |
| EXER-10 | Phase 3 — Exercise Catalog | Pending |
| PROG-01 | Phase 4 — Program Builder | Pending |
| PROG-02 | Phase 4 — Program Builder | Pending |
| PROG-03 | Phase 4 — Program Builder | Pending |
| PROG-04 | Phase 4 — Program Builder | Pending |
| PROG-05 | Phase 4 — Program Builder | Pending |
| PROG-06 | Phase 4 — Program Builder | Pending |
| PROG-07 | Phase 4 — Program Builder | Pending |
| PROG-08 | Phase 4 — Program Builder | Pending |
| PROG-09 | Phase 4 — Program Builder | Pending |
| PROG-10 | Phase 4 — Program Builder | Pending |
| PROG-11 | Phase 4 — Program Builder | Pending |
| LOG-01 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-02 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-03 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-04 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-05 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-06 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-07 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-08 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-09 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-10 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-11 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-12 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-13 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-14 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-15 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-16 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-17 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-18 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-19 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-20 | Phase 5 — In-Gym Session Logging | Pending |
| LOG-21 | Phase 5 — In-Gym Session Logging | Pending |
| GYM-01 | Phase 6 — Gym Profiles & Plate Math | Pending |
| GYM-02 | Phase 6 — Gym Profiles & Plate Math | Pending |
| GYM-03 | Phase 6 — Gym Profiles & Plate Math | Pending |
| GYM-04 | Phase 6 — Gym Profiles & Plate Math | Pending |
| GYM-05 | Phase 6 — Gym Profiles & Plate Math | Pending |
| GYM-06 | Phase 6 — Gym Profiles & Plate Math | Pending |
| GYM-07 | Phase 6 — Gym Profiles & Plate Math | Pending |
| SETS-01 | Phase 7 — Advanced Set Types | Pending |
| SETS-02 | Phase 7 — Advanced Set Types | Pending |
| SETS-03 | Phase 7 — Advanced Set Types | Pending |
| SETS-04 | Phase 7 — Advanced Set Types | Pending |
| SETS-05 | Phase 7 — Advanced Set Types | Pending |
| SETS-06 | Phase 7 — Advanced Set Types | Pending |
| SETS-07 | Phase 7 — Advanced Set Types | Pending |
| SETS-08 | Phase 7 — Advanced Set Types | Pending |
| SETS-09 | Phase 7 — Advanced Set Types | Pending |
| PRGR-01 | Phase 8 — Progression Engine | Pending |
| PRGR-02 | Phase 8 — Progression Engine | Pending |
| PRGR-03 | Phase 8 — Progression Engine | Pending |
| PRGR-04 | Phase 8 — Progression Engine | Pending |
| PRGR-05 | Phase 8 — Progression Engine | Pending |
| PRGR-06 | Phase 8 — Progression Engine | Pending |
| PRGR-07 | Phase 8 — Progression Engine | Pending |
| PRGR-08 | Phase 8 — Progression Engine | Pending |
| PRGR-09 | Phase 8 — Progression Engine | Pending |
| PRGR-10 | Phase 8 — Progression Engine | Pending |
| PRGR-11 | Phase 8 — Progression Engine | Pending |
| ANLY-01 | Phase 9 — Records & Client Analytics | Pending |
| ANLY-02 | Phase 9 — Records & Client Analytics | Pending |
| ANLY-03 | Phase 9 — Records & Client Analytics | Pending |
| ANLY-06 | Phase 9 — Records & Client Analytics | Pending |
| ANLY-07 | Phase 9 — Records & Client Analytics | Pending |
| ANLY-08 | Phase 9 — Records & Client Analytics | Pending |
| ANLY-10 | Phase 9 — Records & Client Analytics | Pending |
| ANLY-04 | Phase 10 — Server Analytics & Reconciliation | Pending |
| ANLY-05 | Phase 10 — Server Analytics & Reconciliation | Pending |
| ANLY-09 | Phase 10 — Server Analytics & Reconciliation | Pending |
| GEN-01 | Phase 11 — Program Generation | Pending |
| GEN-02 | Phase 11 — Program Generation | Pending |
| GEN-03 | Phase 11 — Program Generation | Pending |
| GEN-04 | Phase 11 — Program Generation | Pending |
| GEN-05 | Phase 11 — Program Generation | Pending |
| GEN-06 | Phase 11 — Program Generation | Pending |
| GEN-07 | Phase 11 — Program Generation | Pending |
| BODY-01 | Phase 12 — Body Metrics & Dashboard | Pending |
| BODY-02 | Phase 12 — Body Metrics & Dashboard | Pending |
| BODY-03 | Phase 12 — Body Metrics & Dashboard | Pending |
| BODY-04 | Phase 12 — Body Metrics & Dashboard | Pending |
| BODY-05 | Phase 12 — Body Metrics & Dashboard | Pending |
| DASH-01 | Phase 12 — Body Metrics & Dashboard | Pending |
| DASH-02 | Phase 12 — Body Metrics & Dashboard | Pending |
| DASH-03 | Phase 12 — Body Metrics & Dashboard | Pending |

**Coverage:**

- v1 requirements: 105 total
- Mapped to phases: 105
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-10*
*Last updated: 2026-08-10 after initial definition*
