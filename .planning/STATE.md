---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 12
current_phase_name: Body Metrics & Dashboard
status: executing
stopped_at: Completed 12-07-PLAN.md
last_updated: "2026-08-31T10:32:48.775Z"
last_activity: 2026-08-30
last_activity_desc: Phase 11 complete, transitioned to Phase 12
progress:
  total_phases: 12
  completed_phases: 11
  total_plans: 124
  completed_plans: 123
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** You can walk into a gym with no signal, log every set without friction, and be told what to lift next time.
**Current focus:** Phase 12 — Body Metrics & Dashboard

## Current Position

Phase: 12 (Body Metrics & Dashboard) — EXECUTING
Plan: 8 of 8
Status: Ready to execute
Last activity: 2026-08-30 — Phase 12 execution started

Progress: [██████████] 99%

## Performance Metrics

**Velocity:**

- Total plans completed: 51
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 13 | - | - |
| 03 | 17 | - | - |
| 06 | 8 | - | - |
| 10 | 7 | - | - |
| 11 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P06 | 76min | 3 tasks | 13 files |
| Phase 01 P07 | 2h | 3 tasks | 14 files |
| Phase 01 P08 | ~1h | 2 tasks | 10 files |
| Phase 05 P12 | 150 | 3 tasks | 9 files |
| Phase 05 P14 | 1h | 3 tasks | 13 files |
| Phase 05 P15 | ~2h | 3 tasks | 13 files |
| Phase 05 P16 | 3h | 3 tasks | 12 files |
| Phase 09 P01 | 55m | 3 tasks | 27 files |
| Phase 09 P02 | 35 min | 3 tasks | 7 files |
| Phase 09 P03 | ~50 min | 3 tasks | 17 files |
| Phase 12 P01 | 45min | 3 tasks | 11 files |
| Phase 12 P02 | 30min | 3 tasks | 16 files |
| Phase 12 P03 | 55min | 3 tasks | 31 files |
| Phase 12 P04 | 62min | 3 tasks | 16 files |
| Phase 12 P05 | 35min | 4 tasks | 24 files |
| Phase 12 P06 | 30min | 2 tasks | 11 files |
| Phase 12 P07 | 49min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: PowerSync chosen for local-first sync — only option with maintained RN *and* Web SDKs talking directly to Postgres
- Init: Progression engine is one shared pure package imported by both client and server, so rules can never diverge
- Init: Sync is row/field-level LWW ordered by server sequence — never whole-document, never wall-clock
- Init: Below-target performance holds the prescription; reduction only suggested after 2–3 consecutive misses
- Init: Parallel training blocks deferred to v2; single active program in v1
- [Phase ?]: 01-06: Auth show/hide control uses a text Show/Hide label, not an Ionicons glyph — @expo/vector-icons sets its own color prop and cannot resolve a NativeWind token class, so an icon would hardcode a colour the theme cannot swap
- [Phase ?]: 01-06: Auth submit outcomes are classified from the raw Response inside better-fetch's onResponse hook and seeded to 'offline' — a BetterFetchError is not ResponseLike, so passing it to classifyAuthOutcome would report every failure as offline
- [Phase ?]: 01-06: EXPO_PUBLIC_WEB_APP_ORIGIN keeps its http://localhost:8081 dev default rather than an https literal, and D-07 is enforced structurally instead — the reset redirectTo is validated at import as an http/https browser origin and throws on a custom app scheme
- [Phase ?]: 01-07: Native tabs import from expo-router/unstable-native-tabs — SDK 57 publishes no expo-router/native-tabs entry point
- [Phase ?]: 01-07: Appearance is applied through NativeWind's colorScheme, the one API driving Appearance on native and the dark class on web — RN's Appearance.setColorScheme does not exist in react-native-web and crashed every web page
- [Phase ?]: 01-07: Platform divergence is a .web.tsx sibling resolved at build time, never a Platform.OS branch at a call site; conventions and the native-capability web audit live in docs/platform-modules.md
- [Phase ?]: apps/api has no test script: every API test is end-to-end, and a lane reporting 'No tests found' as a pass is a green that asserts nothing
- [Phase ?]: Suite integrity is enforced by a Jest reporter (scripts/jest-suite-integrity.cjs), so a zero-test, skipped-test or empty-suite run fails identically locally and in CI
- [Phase ?]: CI references no repository secret: every variable the API needs to boot is a workflow literal and BETTER_AUTH_SECRET is generated per run
- [Phase ?]: 05-12: threaded an optional db prop through WorkoutScreenView -> ExercisePage -> TargetsSheet so write-back lands in whatever database the screen actually reads from, matching the existing writeDb pattern (WINDOWS #134, fixed).
- [Phase ?]: NoteSheet.tsx threaded an optional db prop (WINDOWS #135), per orchestrator ruling narrowing 05-14's 'file not modified' prohibition to a db-parity fix, not new note capability
- [Phase ?]: Warm-up badge and note dot now render from inside SetRowView (not an external wrapper), so every consumer of the row gets both affordances (WINDOWS #109)
- [Phase ?]: 05-15: Threaded an optional rowHeight through DragHandle/DragHandle.web (WINDOWS #137) so the reorder sheet's measured row height governs the real drag gesture, despite the plan naming those files unmodified
- [Phase ?]: 05-15: Threaded db through ExercisePage's handleConfirmRemove (WINDOWS #138), the same getPowerSync()-default gap 05-12/05-14 fixed for TargetsSheet/NoteSheet, surfaced by the first browser test of the Remove path
- [Phase ?]: shouldAutoAdvance now requires targetWorkingSets and compares against the exercise's prescribed set count, not merely existing rows — corrects LOG-13's prior satisfied verdict (WINDOWS #136)
- [Phase ?]: loadLiveSession recognizes a paused session as still live (inArray on in_progress/paused), fixing a real bug where pausing dropped the user to the empty state
- [Phase ?]: Full durability Playwright project (33 cases) executed for the first time and reached two consecutive clean 33/33 runs — closes SC4 and both behavior_unverified truths in 05-VERIFICATION.md
- [Phase ?]: 09-01: react-native-web maps react-native-svg's accessibilityRole=image + accessibilityLabel onto a Playwright-queryable role=img with an accessible name — verified in a real browser, so every chart spec this phase asserts by role and name
- [Phase ?]: 09-01: the records and working-volume set predicates are kept apart in exercise-series.ts and asserted from one shared fixture — heaviest/e1rm use countsTowardRecords, volume uses countsTowardWorkingVolume
- [Phase ?]: 09-03: personal_record.value stores a rep count for most_reps_at_weight and no weight at all — the achieving weight is resolved through a third batched logged_set read, never a per-row lookup
- [Phase ?]: 09-03: RowDisplay.e1rm is now the three-branch E1rmDisplay union — the workout summary distinguishes a rep-cap suppression from an absence of data instead of blanking both
- [Phase ?]: 12-01: BODY_METRIC_KIND_SET imported directly from @fitness/api-contracts into sync.service.ts rather than rebuilt locally from a tuple — single source of truth on both sides of the vocabulary check
- [Phase ?]: 12-01: body_metric's root-existence lookup reads only (id, userId), following personal_record/equipment_profile's shape, not excluded_exercise's extra identity-column read — kind is genuinely client-patchable (D-10), not identity
- [Phase ?]: 12-02: cm/in extends units.ts's exact bigint-fraction pipeline (convertByFactor generalized), never a second module — CM_PER_IN substituted for KG_PER_LB
- [Phase ?]: 12-02: resolveDisplayUnit/toCanonicalValue/fromCanonicalValue in body-metrics.ts are the single place D-08's one-weight_unit-drives-both-mass-and-length rule lives — BodyMetricRow/MetricEntrySheet resolve their own display unit internally rather than the caller pre-formatting a value
- [Phase ?]: 12-02: loadTrackedKinds and loadTrackedKindSummaries share one batched SQL statement via a private loadLatestPerKind helper, not two independent queries
- [Phase ?]: progress-photos.tsx refactored into hook-free ProgressPhotosScreenView + stateful wrapper to match RecordsScreenView/BodyMetricsScreenView's shipped split
- [Phase ?]: ProgressPhotoActionSheet/DeletePhotoDialog self-contain their own <Modal>, matching PhotoCaptureConfirmSheet/MuscleDrilldownSheet rather than HistoryActionSheet's externally-wrapped precedent
- [Phase ?]: PUSH_DEFERRED_TABLES is now empty for the first time in the project's life — progress_photo moved to PUSH_APPLIED_TABLES
- [Phase ?]: emptyState() called as a plain function rather than rendered as a JSX element (tree-walker test convention)
- [Phase ?]: MetricEntryActionSheet/DeleteMetricEntryDialog each own a self-contained Modal, matching Phase 12's own sheet convention
- [Phase ?]: MetricEntrySheet edit mode pre-fills from a passed editEntry prop, saving via updateMetric instead of logMetric
- [Phase ?]: D-21 checkpoint: chose row-per-widget dashboard_widget table over a JSON array on user_preference, matching excluded_exercise/personal_record precedent for concurrent-edit safety under LWW
- [Phase ?]: MuscleHeatmapWidget reuses loadMuscleMapWindow('1w') with a runtime drift guard against analytics-engine's MUSCLE_MAP_WINDOW_DAYS rather than re-deriving a day count
- [Phase ?]: BodyweightTrendWidget bypasses resolveDisplayUnit/fromCanonicalValue and calls formatWeight directly since bodyweight's canonical unit is always kg
- [Phase ?]: RecentRecordsWidget merges across all four PR_TYPES via Promise.all rather than reusing the single-metric loadRecordsPage
- [Phase ?]: 12-06: shareComposite's ShareCompositeInput carries an unused-on-web viewRef alongside before/after so photo-composite.tsx's single call site never branches on Platform.OS
- [Phase ?]: 12-06: composite.ts stays a plain .ts file (matching the plan's platform-split naming) by building the hidden CompositeCaptureView with React.createElement instead of JSX
- [Phase ?]: 12-06: deriveCompositeStep computes the step from the selection object every render rather than storing it separately, so Start Over resetting both ids is, by construction, also resetting the step
- [Phase ?]: 12-07: moveWidget scopes both the sibling read and every write by userId (T-12-29) — a widget id the user does not own resolves to no sibling and writes nothing, matching moveDay's own per-row scoping
- [Phase ?]: 12-07: dashboard_widget's position column is aliased to computeReorder's orderIndex shape via a plain post-read .map(), never a select-level column alias

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 research flag: PowerSync self-hosting requires its own MongoDB instance for internal state — spike whether that ops burden is acceptable solo, or price PowerSync Cloud. Fallback is WatermelonDB (needs a New-Architecture compatibility spike of its own).
- Phase 8 research flag: MacroFactor's below-target thresholds and deload trigger are not publicly documented — our own design decision, informed by RP volume landmarks and SBS autoregulation.
- Phase 11 research flag: Smart Generation's volume-landmark math is not publicly documented — CLOSED by 11-CONTEXT D-15 (project authors its own documented landmark table).
- Phase 5 research flag: `expo-notifications` background delivery reliability needs real-device verification, not doc reading.
- Better Auth's Expo client plugin package name should be re-verified against current docs before first install.
- 01-06: three <human-check> blocks and three long-text backstops unrun — no simulator/device, no Playwright browsers, Mailpit port 1025 unreachable. Filed in .planning/WINDOWS.md as unrun-verify.
- iOS and Android were never run for plan 01-07: no simulator or device is reachable from the execution worktree, so every native-specific claim in 01-07 rests on typecheck plus correct API usage. Three unrun-verify entries are recorded in .planning/WINDOWS.md.
- Phase 01 CI workflow (.github/workflows/ci.yml) has never been executed by GitHub Actions — first push must confirm both jobs go green and that a broken assertion turns the run red (WINDOWS.md 12)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260819-wpp | Fix WR-01 ExerciseImageTile failure state leaks across FlashList recycling | 2026-08-19 | b4ae1c3 | [260819-wpp-fix-wr-01-exerciseimagetile-failure-stat](./quick/260819-wpp-fix-wr-01-exerciseimagetile-failure-stat/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-31T10:32:48.748Z
Stopped at: Completed 12-07-PLAN.md
Resume file: None
