# Phase 4: Program Builder - Research

**Researched:** 2026-08-20
**Domain:** Program-authoring data model (Postgres + local SQLite via PowerSync), program lifecycle state machine, and a cross-platform (RN + RN Web) authoring UI with swipeable paging and drag reordering
**Confidence:** MEDIUM — the schema and lifecycle findings are HIGH (read directly from the shipped codebase); the reorder/paging library choice is MEDIUM-LOW (no library has a documented, first-party guarantee of RN-Web parity, this is the phase's one real open risk)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward — already locked, do not re-litigate**

- **D-01:** Snapshot-on-use is the mechanism that makes success criterion 4 true, and it already exists. Phase 2's D-05 and `ARCHITECTURE.md` §1 ("Hard modeling question 3") reject whole-routine versioning outright: `routine_exercise` is freely mutable, and `session_exercise` carries a frozen copy of the prescription taken once at session start and never re-read. `apps/api/src/db/schema/session.ts` implements it (six `target_*` columns plus a no-FK `routine_exercise_id` for traceability only) and `apps/mobile/lib/db/log-set.ts` performs the copy. This phase must not build a `RoutineRevision` tree, a version branch, or a copy-on-edit scheme.
- **D-02:** No `ProgramWeek` → `ProgramDay` → `RoutineExercise` duplication per week. `ARCHITECTURE.md` §1 is explicit: a 12-week program must not become an explosion of near-duplicate day and exercise rows.
- **D-03:** Every user-authored row carries a client-generated UUID issued before any network round-trip (Phase 2 D-02). `apps/mobile/lib/db/id.ts` is the issuer. Programs, days, exercises, cycles and target overrides all obey this.
- **D-04:** `SyncModule` / PowerSync is the sole ingress for per-user, offline-mutable data (Phase 2 D-01, Phase 3 D-01). `ops/powersync/sync-rules.yaml` lines 26–28 already stream `routine`, `routine_day` and `routine_exercise` scoped by `routine.user_id` through joins. Any new table added by this phase joins back to `routine` the same way.
- **D-05:** Archive is a nullable timestamp, never a hard delete (Phase 3 D-05, `PITFALLS.md` §11). `routine.archived_at` already exists. Restore is setting it back to null.
- **D-06:** Weights are stored canonically in kg as decimal, converted only at the display boundary (Phase 2 D-04, `packages/api-contracts/src/units.ts`). Nothing in this phase stores a load, but any weight shown or entered in a builder field obeys it.
- **D-07:** NativeWind 4 + `apps/mobile/lib/theme.ts` / `theme-colors.ts`, Phase 1's five-tab Expo Router scaffold, and `.web.tsx` siblings — never `Platform.OS` branches at a call site (Phase 1 D-09/D-11, `docs/platform-modules.md`). This phase fills in the Programs tab and the Home tab; it does not restructure navigation.
- **D-08:** Single active program in v1. Parallel/"Specialized Training" concurrent blocks were deferred to v2. The builder must not grow a concept of simultaneous blocks.

**Cycles and targets — the schema this phase must invent**

- **D-09:** A cycle is a first-class row (`routine_cycle`), and this does not violate D-02. New table: `id`, `routine_id` (FK, cascade), `order_index`, `name`, `kind`, and a nullable `duration_days`. Ownership resolves through `routine.user_id` exactly as `routine_day` does — no `user_id` column, no `server_seq`.
- **D-10:** Per-cycle targets are sparse override rows, not per-cycle copies. New table `routine_exercise_cycle_target`: `id`, `routine_exercise_id` (FK, cascade), `cycle_id` (FK, cascade), and the same six nullable `target_*` columns `routine_exercise` already carries. `routine_exercise` keeps its existing columns as the base prescription. Resolution is `override ?? base`, and a row exists only where the user actually changed a value.
- **D-11:** `ARCHITECTURE.md` §1's `PeriodizationScheme` is Phase 8's, not this phase's — a deliberate deviation. `progression_scheme_id` stays a nullable, unowned `text` column in this phase — do not define it, do not add an FK, do not build a scheme table.
- **D-12:** Deload and time off are cycle kinds, not separate columns. `routine_cycle.kind` ∈ `'training' | 'deload' | 'time_off'`. Deload at start/end of a cycle is `order_index` 0 or the last index — no separate enum needed. Time off (PROG-06) is a cycle with `kind = 'time_off'` and a `duration_days`.
- **D-13:** The `kind` vocabulary lives in `packages/api-contracts/`, alongside the Phase 3 `load_type` precedent, and is enforced on both sides (Postgres check constraint + same values on SQLite).

**Program lifecycle**

- **D-14:** "Active" is `user_preference.active_routine_id`, not a value of `routine.status`. This is what makes PROG-08 correct offline — a status-based "active" flag would let two devices both push `status = 'active'` under LWW with no way to pick a winner. `user_preference` already exists with exactly this shape (holds `default_equipment_profile_id` today). Add a nullable `active_routine_id`.
- **D-15:** `routine.status` is `'draft' | 'ready'` and nothing else; archive stays on `archived_at`. `apps/api/src/seed/generate-corpus.ts` writes the literal `'active'` today and must be migrated.
- **D-16:** Freeze is an independent boolean (`routine.progression_frozen`, default false), never a status value — `active AND frozen` must be representable.
- **D-17:** Phase 8's engine writes to future cycle overrides only — never the base prescription, never a past or current cycle — and `progression_frozen` is the gate on those writes. This phase fixes the write target, Phase 8 finalizes the rule.
- **D-18:** Duplicate is a deep copy with fresh client UUIDs. Whole program: copy `routine` + `routine_cycle` + `routine_day` + `routine_exercise` + `routine_exercise_cycle_target`, all with new UUIDs, `created_from_template_id` set to the source routine id, `archivedAt` null, `status = 'draft'`, `progression_frozen` false, never touching `user_preference.active_routine_id`. Single day: copy `routine_day` + its `routine_exercise` rows + their overrides, appended at the end of the day order.

**Scheduling and "upcoming"**

- **D-19:** The program is a floating sequence, not calendar-bound, and `routine_day.is_rest_day` goes unused in this phase. Do not remove the column, do not surface it.
- **D-20:** Position in the program is derived from logged history, never stored as a cursor. The Home tab's "next up" resolves: the next day is the one following the most recent completed `workout_session`'s `routine_day_id` in the rotation, and the current cycle follows from how many rotations have completed. **Flagged for the researcher:** confirm this resolves sanely when a day is deleted from the routine after being logged against, and when time-off cycles sit between rotations — see Common Pitfalls and Open Questions below.

**Authoring surface — decided by the user**

- **D-21:** Days are a horizontally swipeable deck. Push / Pull / Legs are pages you swipe between; each page is a vertical list of that day's exercises. Comparing two days is one swipe. Rest days are not pages (D-19).
- **D-22:** A cycle selector strip is pinned above the day deck. Cycle chips (`1 2 3 Deload 4 · Time off`) sit above the swipeable days; picking a cycle re-renders the days below with that cycle's resolved targets (D-10) without losing your place in the day. Deload and time-off cycles are unmistakably styled inside that same strip (D-12).
- **D-23:** Exercises reorder by an always-visible drag handle. A grip on every row, press and drag to reposition. This is the phase's largest unbudgeted technical risk.
- **D-24:** Adding exercises opens the Phase 3 catalog full-screen in multi-select mode. The existing search and filter-chip surface, but selections accumulate and land in the day together on Add.
- **D-25:** Targets are entered inline on the expanded exercise row. Tapping an exercise expands it in place to reveal sets / rep range / RIR range / rest. No modal, no screen change.
- **D-26:** The Programs tab is the active program; a separate library screen holds the rest and the archive. Duplicate, archive, restore and rename live in the library; the freeze toggle is on the active screen (D-16).
- **D-27:** Upcoming workouts appear on the Home tab, not the Programs tab. `apps/mobile/app/(tabs)/index.tsx` is currently a placeholder and becomes real in this phase.
- **D-28:** "New program" offers blank or duplicate-an-existing as the first choice.

### Claude's Discretion

The user delegated every schema-level area (D-09 through D-20 resolve them explicitly) and asked to be consulted on UI only. The following remain genuinely open for research and planning:

- A reorder and paging library that works on React Native *and* React Native Web. Neither exists in the tree today and this blocks D-21 and D-23. This is the item most likely to change the phase's plan count. **Resolved below in Standard Stack / Common Pitfalls — no single library has confirmed first-party RN-Web parity for drag-reorder; the paging half has a stronger answer.**
- `order_index` rewrite strategy under offline concurrency. Contiguous integers mean a single drag rewrites many rows, and two devices reordering the same day offline produce a row-level-LWW interleaving that may not be either user's intent. Fractional or gap-based indices avoid the rewrite. **Resolved below — recommend fractional (rational) indices.**
- Draft persistence. Confirm a half-built program is a real `routine` row with `status = 'draft'` written locally from the first keystroke, and decide what discarding a draft does.
- Where target resolution lives. `override ?? base` (D-10) is needed by the builder, the Home tab's next-up card, and `log-set.ts`'s session snapshot. Must be one shared pure function. **Resolved below — a shared module, not three implementations.**
- What a blank target means. Define what Phase 8 and Phase 5 should read from a null, and whether the builder can save an exercise with no targets at all.
- Query shape for the builder and the next-up card — `PITFALLS.md` §13's N+1 concern, program → days → exercises → sets.
- Whether `zustand` is introduced here. `STACK.md` names it for ephemeral UI state and it is not installed.

### Deferred Ideas (OUT OF SCOPE)

- Calendar-bound scheduling (Mon/Wed/Fri, missed-day handling, planned dates) — D-19 chose a floating sequence.
- Authored rest days in the builder — `routine_day.is_rest_day` stays on the table, unused.
- `PeriodizationScheme` behind `progression_scheme_id` — Phase 8's subject.
- Superset authoring in the builder — `routine_exercise.superset_group_id` stays null this phase.
- Auto-generated programs — Phase 11.
- Parallel / "Specialized Training" concurrent blocks — v2.
- A `RoutineRevision` audit timeline — explicitly not required until a concrete feature asks.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROG-01 | Build a program from scratch with named training days | `routine`/`routine_day` already shipped (Phase 2); builder writes through PowerSync exactly as `routine_day` rows are created today — no schema change needed for this requirement alone |
| PROG-02 | Add, remove, reorder exercises within a day | `routine_exercise.order_index` already exists; reorder needs the fractional-index strategy (Common Pitfalls) and the drag-handle library decision (Standard Stack) |
| PROG-03 | Per-exercise targets: sets, rep range, RIR, rest | The six `target_*` columns already exist on `routine_exercise` (base prescription) — this requirement is UI-only (D-25's inline expand) |
| PROG-04 | Organize into cycles, each with its own targets | New `routine_cycle` + `routine_exercise_cycle_target` tables (D-09/D-10) — schema and sync-rules additions detailed in Architecture Patterns |
| PROG-05 | Deload at start or end of a cycle | `routine_cycle.kind = 'deload'` at `order_index` 0 or the max index (D-12) — no new column |
| PROG-06 | Schedule planned time off | `routine_cycle.kind = 'time_off'` + `duration_days` (D-12) |
| PROG-07 | Duplicate, archive, restore programs and individual workouts | Deep-copy algorithm (D-18) detailed in Code Examples; archive/restore reuses `ArchiveDialog` and `archived_at` (D-05) |
| PROG-08 | Set which program is active | `user_preference.active_routine_id` (D-14) — **requires building the `user_preference` sync apply-path, currently unowned by any phase's TABLE_MAP** (Common Pitfalls #1) |
| PROG-09 | View active program's upcoming workouts with target muscles and per-cycle targets | Home tab "next up" card (D-27), position-derivation logic (D-20), shared target-resolution function |
| PROG-10 | Freeze a program so progression stops modifying it | `routine.progression_frozen` boolean (D-16) |
| PROG-11 | Edit a program without corrupting logged workouts | Already true by construction via D-01's snapshot; this phase's job is a regression test, not new mechanism, **plus extending `log-set.ts`'s `addSessionExercise` to resolve per-cycle overrides before snapshotting** (Common Pitfalls #2) |

</phase_requirements>

## Summary

Phase 4 is mostly a **schema-and-sync-plumbing phase wearing a UI-heavy costume**. The three tables the builder writes to today (`routine`, `routine_day`, `routine_exercise`) are fully defined in Postgres and mirrored in SQLite, but — this is the single most important finding in this research — **none of them has a server-side apply path**. `apps/api/src/sync/sync.service.ts`'s `TABLE_MAP` only wires up `workout_session`, `session_exercise`, `logged_set`, `exercise`, and `user_exercise_preference`; `routine`/`routine_day`/`routine_exercise` sit in `PUSH_DEFERRED_TABLES` in `packages/api-contracts/src/sync.ts` with the comment `// Phase 4 — Program Builder` attached to each. Every PowerSync CRUD op the builder generates today would be **silently accepted into the ps_crud queue and never actually applied to a Postgres row**, because the pull side (`sync-rules.yaml`) already streams these tables down but the push side does not yet write them. This phase must build that whole apply path from scratch, mirroring the exact pattern already proven for the five wired-up tables, and extend it to two brand-new tables (`routine_cycle`, `routine_exercise_cycle_target`) plus the one column this phase adds to `user_preference`.

The cycle/target schema itself is already fully decided in CONTEXT.md (D-09–D-13) and does not need re-derivation: `routine_cycle` is a first-class, orderable row scoped by `kind` (`training | deload | time_off`); `routine_exercise_cycle_target` is a sparse override table resolved as `override ?? base` against `routine_exercise`'s existing six `target_*` columns. The lifecycle schema is equally decided: `active_routine_id` moves onto `user_preference` (itself **also currently unmapped** in `TABLE_MAP` — attributed to Phase 6 by the same file's comments, a second cross-phase ownership conflict this research surfaces explicitly), `routine.status` narrows to `'draft'|'ready'`, and freeze becomes an independent `progression_frozen` boolean.

The UI risk the user flagged (D-21/D-23) resolves into two separable problems with different confidence levels. The swipeable day deck has a strong, well-known answer: `react-native-tab-view` (react-navigation's own tab/pager component) already ships a cross-platform swipe implementation internally — `react-native-pager-view` on iOS/Android, `PanResponder` on web — so it needs **no `.web.tsx` split at all** for the paging mechanism itself. The always-visible drag handle (D-23) has no equally strong answer: every reorder library surveyed (`react-native-draggable-flatlist`, `react-native-sortables`, `react-native-reorderable-list`) is built on `react-native-gesture-handler` + `react-native-reanimated`, both of which have *documented* web support but neither of which is *committed to by any reorder library's own docs* as web-supported — this is a genuine open risk requiring a spike before the planner sizes the reorder screens, not a library that can be picked with confidence today.

**Primary recommendation:** build the sync apply-path for `routine`/`routine_day`/`routine_exercise`/`user_preference` plus the two new tables first (it blocks every other success criterion — nothing persists across devices without it), model cycles and overrides exactly as D-09/D-10 specify, use `react-native-tab-view` for the day deck, and spike `react-native-gesture-handler` + `react-native-reanimated` directly (not a pre-built reorder library) for the drag handle behind a `.web.tsx` split if the spike shows web gaps.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Program/cycle/day/exercise authoring (CRUD) | Local SQLite (client) | Database/Storage (Postgres, via sync) | Local-first: every write lands in SQLite first (PowerSync), then syncs; Postgres is the cross-device source of truth, never the write path itself |
| Sync apply / validation of new rows | API / Backend (`SyncModule`) | Database/Storage | `sync.service.ts`'s `TABLE_MAP` + `toXValues` functions are the only place ownership/shape validation happens before a Postgres write |
| Cycle-target resolution (`override ?? base`) | Client (shared pure function) | API / Backend (same function, imported) | Needed identically by the builder UI, the Home "next up" card, and `log-set.ts`'s snapshot — must be one function per the discretion item, imported by both runtimes exactly like the progression-engine package pattern |
| Program lifecycle state (active/frozen/archived) | Local SQLite (client) | API / Backend (server-side invariant enforcement, e.g. a partial unique index is explicitly rejected by D-14's reasoning) | `active_routine_id` lives on `user_preference`, a synced row; the client sets it optimistically offline, the server has no independent authority here beyond conflict resolution |
| Day-deck paging / drag reorder UI | Browser / Client (React Native + RN Web) | — | Pure presentation concern; no server involvement |
| "Upcoming workouts" position derivation | Client (read-time query over local SQLite) | — | D-20: computed from `workout_session` history at read time, never stored — must run entirely offline |
| `routine_cycle`/`routine_exercise_cycle_target` sync scoping | Database/Storage (`sync-rules.yaml`) | API / Backend | New joined queries scoped through `routine.user_id`, same shape as existing `routine_day`/`routine_exercise` queries |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-native-tab-view` | 4.3.2 [VERIFIED: npm registry, 2026-08-20] | Swipeable day-deck paging (D-21), cycle-content re-render without losing day position | `[ASSUMED]` package identity — discovered via WebSearch/training knowledge, not Context7/official docs directly read this session. Registry-confirmed to exist and is current (733k weekly downloads, maintained under the `react-navigation` GitHub org). Its own architecture uses `react-native-pager-view` on native and `PanResponder` on web internally — this is the one component in the phase that does **not** need a `.web.tsx` split for its core mechanism, because the library already ships the split. |
| `drizzle-orm` (existing) | `^0.45.2` (already in `apps/mobile/package.json` and `apps/api`) | Schema definitions for `routine_cycle`, `routine_exercise_cycle_target` on both Postgres and SQLite sides | Already the project's ORM (Phase 2 D-?); no new dependency |
| `@fitness/api-contracts` (existing workspace package) | `workspace:*` | Home of the `kind` vocabulary (D-13) and the shared target-resolution function (discretion item) | Already the home of `LOAD_TYPES`, `MUSCLE_GROUPS`, `SYNCED_TABLES` — the established pattern for cross-runtime shared vocabularies and pure functions |

### Supporting — the reorder/paging risk, resolved as far as it can be without a spike

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-native-gesture-handler` | 3.2.1 [VERIFIED: npm registry, 2026-08-20] `[SUS — see Package Legitimacy Audit]` | Low-level pan/drag gesture primitive for the always-visible drag handle (D-23) | Recommended as the **direct** dependency for a hand-built drag handle, not via a pre-built reorder library — see rationale below |
| `react-native-reanimated` | 4.5.3 [VERIFIED: npm registry, 2026-08-20] `[SUS — see Package Legitimacy Audit]` | Drives the drag-handle's follow-finger animation and reorder transition | Software Mansion's own docs (`docs.swmansion.com/react-native-reanimated/docs/guides/web-support/`) confirm a dedicated, first-party **Web Support** guide exists — reanimated explicitly supports web via a pure-JS fallback path, which neither `react-native-draggable-flatlist` nor `react-native-sortables` documents inheriting |

**Why not a pre-built reorder library:** `react-native-draggable-flatlist` (v4.0.3, `[VERIFIED: npm registry]`, `OK` legitimacy verdict, 357k weekly downloads) and `react-native-sortables` (v1.10.0, `[VERIFIED: npm registry]`, `SUS`/too-new verdict, 110k weekly downloads) are both built **on top of** gesture-handler + reanimated, but **neither library's own documentation states web-platform support** `[CITED: GitHub READMEs fetched 2026-08-20 — no platform-support table or web statement found in either]`. `react-native-sortables` ships a "Web example" in its examples directory (a positive signal) but its own landing copy says only "seamlessly across iOS and Android" `[CITED: react-native-sortables-docs.vercel.app, fetched 2026-08-20]` — an unconfirmed, possibly-experimental web story. Building the drag handle directly on gesture-handler + reanimated (both of which *do* have first-party, documented web support) rather than trusting a third library's undocumented web behavior is the lower-risk path, at the cost of writing more of the interaction by hand. **This must still be spiked before the planner commits to a plan count** — see Common Pitfalls.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-built drag handle on gesture-handler + reanimated | `react-native-draggable-flatlist` | Faster to build, `OK` legitimacy verdict and a real install base, but its web behavior is undocumented — only choose this if the spike confirms it degrades gracefully (or is acceptably absent) on web, and the parity rule (`docs/platform-modules.md`) is satisfied by an explicit, written-down gap rather than a silent one |
| `react-native-tab-view` for day paging | Plain `ScrollView` with `pagingEnabled` + manual page-index state | Zero new dependency, guaranteed web parity (native RN Web scroll snapping works today), but loses `react-native-tab-view`'s built-in swipe-velocity/threshold tuning and its `TabBar`-adjacent APIs if the cycle strip ever wants tab-like affordances later — a legitimate fallback if the spike finds `react-native-tab-view` too heavy |
| A single cross-platform reorder library | Platform-specific: gesture-handler/reanimated drag on native, a simpler pointer-events-based reorder (`onPointerDown`/`onPointerMove`, no library) on web via `.web.tsx` | This is the `docs/platform-modules.md`-sanctioned escape hatch if the spike shows gesture-handler's web story has real gaps — write the interaction twice rather than once, exactly as Phase 1 already did for the tab bar (`_layout.tsx` / `_layout.web.tsx`) |

**Installation:**
```bash
pnpm --filter mobile add react-native-tab-view react-native-gesture-handler react-native-reanimated
```
Note: `expo install` is the project's likely convention for native-module additions (matches SDK-pinned versions); confirm against how `@shopify/flash-list` was added in Phase 3 before running this — if that used `expo install`, follow the same command here instead of a bare `pnpm add`.

**Version verification:** all four version numbers above were checked directly against the npm registry this session (`npm view <pkg> version`, 2026-08-20) — see per-row citations. `react-native-tab-view`'s and `react-native-draggable-flatlist`'s package *identities* were sourced from WebSearch/training knowledge, not an authoritative doc, and are therefore `[ASSUMED]` per the package-name provenance rule even though the registry confirms they exist.

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----------------------|--------------|--------------|---------|-------------|
| `react-native-tab-view` | npm | 2026-07-16 | 733,536 | `github.com/react-navigation/react-navigation` | OK | Approved |
| `react-native-draggable-flatlist` | npm | 2025-05-06 | 357,335 | `github.com/computerjazz/react-native-draggable-flatlist` | OK | Approved (not recommended as primary approach — see Standard Stack rationale) |
| `react-native-gesture-handler` | npm | 2026-08-14 | 6,344,301 | `github.com/software-mansion/react-native-gesture-handler` | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify` before install, despite 6.3M weekly downloads and Software Mansion (React Native core ecosystem maintainer) ownership; the `too-new` signal is a false-positive pattern for a foundational, frequently-released library, but the gate still applies per protocol |
| `react-native-reanimated` | npm | 2026-07-22 | 6,436,986 | `github.com/software-mansion/react-native-reanimated` | SUS (`too-new`) | Flagged — same false-positive pattern as gesture-handler; `checkpoint:human-verify` required |
| `react-native-pager-view` | npm | 2026-08-15 | 1,026,599 | `github.com/callstack/react-native-pager-view` | SUS (`too-new`) | Not directly installed by this phase (transitive dependency of `react-native-tab-view` on native) — no direct install task needed, but note it exists in the dependency tree |
| `react-native-sortables` | npm | 2026-07-23 | 110,170 | `github.com/MatiPl01/react-native-sortables` | SUS (`too-new`) | **REMOVED from recommendation** — not selected as the reorder library (see Standard Stack); do not install |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `react-native-gesture-handler`, `react-native-reanimated`, `react-native-pager-view` (transitive) — all three flagged purely on the `too-new` (recent-publish-date) heuristic, which is expected for actively-maintained foundational libraries; still gate installation behind `checkpoint:human-verify` per protocol. `react-native-sortables` is also `SUS` but is not being installed at all.

*Package identities (`react-native-tab-view`, `react-native-draggable-flatlist`, `react-native-sortables`) were discovered via WebSearch/training knowledge and are tagged `[ASSUMED]` regardless of registry confirmation, per the provenance rule — the planner should gate each new install behind `checkpoint:human-verify`.*

## Architecture Patterns

### System Architecture Diagram — the missing sync apply-path this phase must build

```
┌─────────────────────────── Client (Programs tab / Home tab) ──────────────────────────────┐
│  Builder UI writes routine / routine_day / routine_exercise / routine_cycle /               │
│  routine_exercise_cycle_target rows via Drizzle → PowerSync local SQLite                    │
│         │                                                                                     │
│         ▼                                                                                     │
│  PowerSync crud queue (ps_crud) ── already generates ops for routine* tables TODAY            │
│         │                                                                                     │
└─────────┼──────────────────────────────────────────────────────────────────────────────────┘
          │ HTTPS POST /v1/sync/push  (SYNC_PUSH_PATH, api-contracts/src/sync.ts)
          ▼
┌─────────────────────────── NestJS SyncModule ──────────────────────────────────────────────┐
│  sync.service.ts                                                                             │
│                                                                                                │
│  TABLE_MAP today:           workout_session, session_exercise, logged_set,                    │
│                              exercise, user_exercise_preference                               │
│                                                                                                │
│  ██ MISSING — this phase adds: ██                                                             │
│    routine, routine_day, routine_exercise,                                                    │
│    routine_cycle, routine_exercise_cycle_target,                                              │
│    user_preference (active_routine_id column)                                                 │
│                                                                                                │
│  Each addition needs, mirroring the existing 5-table pattern exactly:                         │
│    1. An OpData interface (shape of the untyped `data` field)                                 │
│    2. A toXValues(id, ownerId, data) mapper function                                           │
│    3. A TABLE_MAP entry + AGGREGATE_RANK entry (parent-before-child ordering)                 │
│    4. hasInvalidField validation (kind enum, status enum, FK presence)                        │
│    5. Removal from PUSH_DEFERRED_TABLES → addition to PUSH_APPLIED_TABLES                     │
│       (packages/api-contracts/src/sync.ts)                                                    │
│    6. PATCH_FIELDS entry in patch-update-set.ts if partial updates are needed                 │
│         │                                                                                     │
│         ▼                                                                                     │
│  Postgres: routine, routine_day, routine_exercise (existing tables — now actually written)     │
│            routine_cycle, routine_exercise_cycle_target (new tables)                          │
│            user_preference.active_routine_id (new column)                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
          ▲
          │ pull side already works today (this direction is NOT broken)
          │
┌─────────┴──────────────────────────────────────────────────────────────────────────────────┐
│  ops/powersync/sync-rules.yaml — streams routine/routine_day/routine_exercise down already;  │
│  this phase adds two more joined queries for routine_cycle and                                │
│  routine_exercise_cycle_target, scoped through routine.user_id exactly like the existing ones │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why this matters more than the UI:** without the push side, a program authored on the phone would sit in the local `ps_crud` queue forever, or worse, appear to "sync" (no error surfaces to the user — PowerSync's push just reports success once the server acknowledges receipt of the op) while Postgres never receives the row. A second device would never see the program. **This is a silent data-loss bug waiting to happen if the planner treats routine/routine_day/routine_exercise as "already wired up" just because their Drizzle schema exists.**

### Cycle / Target Resolution Data Flow

```
routine_exercise (base prescription: target_sets, target_rep_min/max, target_rir_min/max, target_rest_seconds)
        │
        │  LEFT JOIN routine_exercise_cycle_target
        │  WHERE routine_exercise_cycle_target.cycle_id = <selected/current cycle>
        ▼
resolveTarget(base, override) → override.field ?? base.field   (per-field, not per-row)
        │
        ├──► Builder UI (cycle strip selection re-renders day exercises with resolved targets)
        ├──► Home tab "next up" card (PROG-09 — per-cycle rep/RIR targets shown)
        └──► log-set.ts addSessionExercise() at session start (D-01 snapshot-on-use —
             MUST resolve override ?? base for the CURRENT cycle before copying onto
             session_exercise, not just read routine_exercise's base columns as it does today)
```

**Single shared function, one location:** `packages/api-contracts/src/` (or a small new `apps/mobile/lib/db/`-adjacent module imported by both the builder and `log-set.ts` — server-side resolution is not needed in this phase since nothing server-side reads targets yet, but placing the function in `api-contracts` keeps it available for Phase 8/9 without a later move).

### Recommended Project Structure

```
apps/api/src/db/schema/
├── program.ts                          # existing routine/routine_day/routine_exercise — add routineCycle, routineExerciseCycleTarget here
apps/api/src/sync/
├── sync.service.ts                     # add TABLE_MAP entries, OpData interfaces, toXValues fns for the 5 new/changed tables
├── patch-update-set.ts                 # add PATCH_FIELDS maps if PATCH (not just PUT) is needed for routine/cycle rows
packages/api-contracts/src/
├── program.ts                          # NEW — CYCLE_KINDS vocabulary (D-13), ROUTINE_STATUSES (D-15), resolveTarget() shared pure function
├── sync.ts                             # move routine/routine_day/routine_exercise from PUSH_DEFERRED_TABLES to PUSH_APPLIED_TABLES; add routine_cycle, routine_exercise_cycle_target to SYNCED_TABLES
apps/mobile/lib/db/
├── schema.ts                           # add routineCycle, routineExerciseCycleTarget sqliteTable defs; add activeRoutineId to userPreference
├── log-set.ts                          # extend addSessionExercise to resolve cycle overrides before snapshot
├── programs/                           # NEW — program CRUD helpers (createRoutine, duplicateRoutine, activateRoutine, reorderExercise, etc.), mirroring lib/catalog/'s shape
apps/mobile/app/(tabs)/
├── programs.tsx                        # becomes the active-program screen (D-26)
├── index.tsx                           # gains the "next up" card (D-27)
apps/mobile/app/programs/
├── library.tsx                         # NEW — the library/archive screen D-26 requires
├── new.tsx                             # NEW — blank-or-duplicate creation flow (D-28)
apps/mobile/components/
├── CycleStrip.tsx, DayDeck.tsx, ExerciseSlotRow.tsx, ExercisePickerModal.tsx  # NEW — reusing SearchField/FilterChipRow/ExerciseListRow (D-24) from Phase 3
ops/powersync/sync-rules.yaml           # add routine_cycle, routine_exercise_cycle_target joined queries
```

### Pattern 1: Aggregate-Root Ownership for the Two New Tables

**What:** `routine_cycle` and `routine_exercise_cycle_target` carry no `user_id` and no `server_seq`, exactly like `routine_day`/`routine_exercise` today.
**When to use:** Every child table under the `routine` aggregate root.
**Example:**
```typescript
// Source: apps/api/src/db/schema/program.ts (existing pattern, extended)
export const routineCycle = pgTable(
  'routine_cycle',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routine.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(), // 'training' | 'deload' | 'time_off' — CYCLE_KINDS from api-contracts
    durationDays: integer('duration_days'),
  },
  (table) => [index('routine_cycle_routineId_idx').on(table.routineId)],
);

export const routineExerciseCycleTarget = pgTable(
  'routine_exercise_cycle_target',
  {
    id: text('id').primaryKey(),
    routineExerciseId: text('routine_exercise_id')
      .notNull()
      .references(() => routineExercise.id, { onDelete: 'cascade' }),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => routineCycle.id, { onDelete: 'cascade' }),
    targetSets: integer('target_sets'),
    targetRepMin: integer('target_rep_min'),
    targetRepMax: integer('target_rep_max'),
    targetRirMin: integer('target_rir_min'),
    targetRirMax: integer('target_rir_max'),
    targetRestSeconds: integer('target_rest_seconds'),
  },
  (table) => [index('routine_exercise_cycle_target_routineExerciseId_idx').on(table.routineExerciseId)],
);
```
Both tables need a Postgres CHECK constraint on `kind` (mirroring `exercise_load_type_check`'s pattern referenced in `docs/catalog-load-types.md`) and a same-shaped SQLite mirror in `apps/mobile/lib/db/schema.ts`.

### Pattern 2: `react-native-tab-view` for the Day Deck (D-21)

**What:** A `TabView` whose "tabs" are days, rendered without a visible tab bar (or with the cycle strip standing in for it) — the swipe gesture and page-index state come from the library, day content is the builder's own list.
**When to use:** Anywhere D-21's "horizontally swipeable deck of pages" applies — the day deck here, and potentially future phases with a similar shape.
**Example:**
```typescript
// Source: react-native-tab-view README pattern (react-navigation.org/docs/tab-view — official docs,
// not fetched this session; shape below is the library's well-known SceneMap/renderScene API)
import { TabView } from 'react-native-tab-view';

function DayDeck({ days, initialIndex }: { days: RoutineDayWithExercises[]; initialIndex: number }) {
  const [index, setIndex] = useState(initialIndex);
  const routes = days.map((d) => ({ key: d.id, title: d.name }));

  return (
    <TabView
      navigationState={{ index, routes }}
      onIndexChange={setIndex}
      renderScene={({ route }) => (
        <DayExerciseList day={days.find((d) => d.id === route.key)!} />
      )}
      renderTabBar={() => null} // the cycle strip (D-22) is a separate, pinned component — not this library's TabBar
    />
  );
}
```
**Verify before building:** confirm `react-native-tab-view`'s web `PanResponder` path renders acceptably inside a NativeWind/RN-Web tree during the spike — this claim is `[CITED: WebSearch summary of react-native-tab-view's README, fetched 2026-08-20]`, not independently re-verified against the actual rendered output in this repo.

### Anti-Patterns to Avoid

- **Storing a `weekNumber` column and materializing `routine_exercise` rows per week:** this is exactly D-02's prohibition — cycles are a small, addressable, orderable set of rows (4–8 per program), never a per-week copy of the exercise tree.
- **Reading `routine_exercise`'s base columns directly at session start without checking for a cycle override:** breaks PROG-11/D-10 silently — every session logged against a program with per-cycle targets would snapshot the wrong numbers with no error, no test failure until someone notices the weights displayed don't match what the builder showed.
- **Adding `active`/`frozen` as `routine.status` enum values:** directly reintroduces the two-devices-both-activate-offline bug D-14 exists to prevent.
- **A `Platform.OS === 'web'` branch inside a shared drag-handle component:** violates the established `.web.tsx` convention (`docs/platform-modules.md`) — if native and web diverge, it must be a filename split, discoverable by listing the directory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swipeable paging between days | A custom `PanResponder`/`ScrollView.scrollTo` paging implementation | `react-native-tab-view` (or, as a documented fallback, `ScrollView` with `pagingEnabled`) | The library already solved velocity thresholds, overscroll, and the native/web split; hand-rolling reproduces Pitfall 5's exact failure mode (gesture semantics genuinely differ RN vs. web) |
| Deep-copy duplication (D-18) | Ad-hoc per-table copy loops scattered across the codebase | One `duplicateRoutine(sourceId, { scope: 'program' \| 'day', dayId? })` function that walks the aggregate root → children → grandchildren in one place, issuing fresh UUIDs via the existing `generateClientId()` | A single function is testable once for "did every child get a new UUID and correct FK rewiring" rather than trusting four call sites to do it identically |
| Kg/lb conversion in any target-entry field | Any new conversion logic | `packages/api-contracts/src/units.ts`'s existing `toCanonicalKg`/display helpers (D-06) | Nothing in this phase should reimplement decimal-safe conversion — rest duration and set/rep/RIR fields aren't weights, but any future weight-adjacent field in the builder must route through this |

**Key insight:** almost everything this phase needs to "not hand-roll" is not a third-party library gap — it's *reusing this project's own established patterns* (the aggregate-root convention, the shared units module, the `.web.tsx` split) rather than inventing new plumbing per screen.

## Runtime State Inventory

Not applicable — this phase is additive (new tables, new columns, new screens on existing placeholders), not a rename/refactor/migration of existing production data. The one existing-data touch point is `apps/api/src/seed/generate-corpus.ts` line 279's literal `status = 'active'`, which must be updated to `'ready'` plus a `user_preference.active_routine_id` write — this is a seed-script code edit, not a runtime data migration, since no real user data exists yet in this pre-launch project.

## Common Pitfalls

### Pitfall 1: Treating `routine`/`routine_day`/`routine_exercise` as "already synced" because their Drizzle schema exists

**What goes wrong:** The planner sizes Phase 4 as "just build the UI, the schema's already there" and ships a builder that writes real rows to local SQLite that never reach Postgres, because `sync.service.ts`'s `TABLE_MAP` has no entry for these tables and `packages/api-contracts/src/sync.ts` explicitly lists them in `PUSH_DEFERRED_TABLES`.
**Why it happens:** The schema files (`apps/api/src/db/schema/program.ts`, `apps/mobile/lib/db/schema.ts`) and the pull-side `sync-rules.yaml` all look complete, and PowerSync's push call returns success (it only confirms the op was *queued/acknowledged*, not applied by the server's business logic) — there is no client-visible error signal that the row never landed server-side.
**How to avoid:** Treat "build the sync apply-path for routine/routine_day/routine_exercise" as an explicit, first task in the plan, verified with an integration test that pushes a routine op and asserts a row exists in Postgres afterward — not just that the HTTP call returned 200.
**Warning signs:** No test in the plan asserts against a Postgres row after a routine-related sync push; `PUSH_DEFERRED_TABLES` in `packages/api-contracts/src/sync.ts` still lists `routine`/`routine_day`/`routine_exercise` after the phase is marked complete.

### Pitfall 2: `user_preference`'s sync apply-path is attributed to Phase 6, but D-14 needs it in Phase 4

**What goes wrong:** `packages/api-contracts/src/sync.ts`'s comment above `PUSH_DEFERRED_TABLES` attributes `user_preference`'s apply-path ownership to "Phase 6 — Gym Profiles & Plate Math" (because that's where `default_equipment_profile_id` first needs writing). But D-14 requires this phase to add `active_routine_id` to `user_preference` and write it from the activate-program flow (PROG-08). If Phase 4 waits for Phase 6 to build the apply path, activation cannot sync across devices.
**Why it happens:** The original sync contract was written before Phase 4's schema decisions existed, and the ownership comment was a reasonable projection at the time (`user_preference` didn't yet have anything Phase 4 needed).
**How to avoid:** This phase must build `user_preference`'s apply path itself (at minimum, `active_routine_id`), and update the `PUSH_DEFERRED_TABLES` comment/ownership to reflect that Phase 4 got there first — Phase 6 then only needs to extend the same, already-built `toUserPreferenceValues` function with its own field, not build the apply path from scratch.
**Warning signs:** The plan defers `user_preference` sync work to "later" without checking whether PROG-08 depends on it; Phase 6 research (when it happens) discovers the apply path already exists and is confused about who owns the file.

### Pitfall 3: `order_index` rewritten as contiguous integers under offline concurrency

**What goes wrong:** A drag-reorder writes new contiguous integers (0, 1, 2, 3...) to every affected `routine_exercise`/`routine_day` row. Two devices reordering the same day offline each produce a full contiguous rewrite; on sync, row-level LWW resolves each row independently, producing an interleaved, nonsensical order that matches neither device's intended sequence.
**Why it happens:** Contiguous-integer reindexing is the obvious, simplest implementation, and works perfectly in every single-device manual test.
**How to avoid:** Use fractional/rational order values (e.g., insert between `order_index` 1.0 and 2.0 by writing 1.5) so a single reorder touches only the moved row(s), not the whole list — this is the standard technique for exactly this class of problem (shared by Trello-style "LexoRank"/fractional-indexing schemes). Since the existing columns are `integer`, this requires either widening `order_index` to `numeric`/`real` on both Postgres and SQLite, or reserving integer gaps (e.g., seed at multiples of 1000) and renumbering only when gaps are exhausted. **Decide and record this explicitly** — the discretion item in CONTEXT.md flags this as open, and it applies to both `routine_day.order_index` and `routine_exercise.order_index`.
**Warning signs:** A reorder operation's diff touches every row in the list rather than just the moved one(s); no test exists for "two devices reorder the same day differently while offline, then sync."

### Pitfall 4: N+1 on the program/cycle/day/exercise/override tree

**What goes wrong:** The builder holds the whole program tree open at once (per CONTEXT.md's own discretion item) — a naive implementation queries `routine` → loop over `routine_day` → loop over `routine_exercise` → loop over `routine_exercise_cycle_target` per exercise, exactly `PITFALLS.md` §13's textbook N+1 shape, now one join level deeper than the session-logging case that pitfall was originally written against.
**Why it happens:** The nested-relations shape is the most natural way to think about "a program," and Drizzle's relational query API makes lazy per-row loops easy to write without noticing the query count.
**How to avoid:** One query per table (routine, all its days, all their exercises, all their cycle-target overrides, all its cycles), joined and grouped in-memory client-side rather than N nested awaits — local SQLite reads are cheap but not free, and the builder re-renders this tree on every cycle-strip selection change (D-22).
**Warning signs:** No query-count assertion exists for opening the builder on a program with multiple days/cycles; the builder feels sluggish switching cycles in the cycle strip.

### Pitfall 5: Position-derivation (D-20) breaks when a logged-against day is deleted or a time-off cycle sits mid-rotation

**What goes wrong:** D-20 derives "next up" from the most recent `workout_session.routine_day_id` in the rotation. Two edge cases the user explicitly flagged for research: (1) if that day is later deleted from the routine, the derivation has nothing to find "the day after" relative to; (2) a time-off cycle sitting between two training cycles needs the rotation to skip over it, not treat it as a trainable day.
**Why it happens:** The derivation logic is naturally written against "the current shape of the routine" without considering that the shape has changed since the last logged session, or that cycles are heterogeneous (training vs. time_off) in a way plain day-sequence rotation doesn't naturally handle.
**How to avoid:** Two explicit rules: (a) if the most-recently-logged day no longer exists in the current day list, fall back to "first day of the current cycle" rather than crashing or silently defaulting to day 0 with no acknowledgment; (b) rotation logic must filter `routine_cycle.kind = 'training'` (and non-deload, per how deload cycles should behave — this is itself worth a UI-considerations note, since deload cycles ARE trainable days) when determining "how many rotations have completed," and a `time_off` cycle should present as "you're on scheduled time off" on the Home tab rather than a workout recommendation. **Neither rule is specified in CONTEXT.md — this is a real open question for the planner, not a solved problem.**
**Warning signs:** No test covers "delete the currently-next day, then check what Home shows"; no test covers "log through cycle 1, hit a time-off cycle, check what Home shows during time off."

## Code Examples

### Sync apply-path pattern to replicate (the shape every new table needs)

```typescript
// Source: apps/api/src/sync/sync.service.ts (existing, read this session) — pattern for
// toExerciseValues/TABLE_MAP/AGGREGATE_RANK, to be replicated for routine, routine_day,
// routine_exercise, routine_cycle, routine_exercise_cycle_target, and user_preference's new column

const TABLE_MAP = {
  workout_session: workoutSession,
  session_exercise: sessionExercise,
  logged_set: loggedSet,
  exercise: exercise,
  user_exercise_preference: userExercisePreference,
  // ADD: routine, routine_day, routine_exercise, routine_cycle,
  //      routine_exercise_cycle_target, user_preference
} as const;

const AGGREGATE_RANK: Record<MappedTable, number> = {
  workout_session: 0,
  session_exercise: 1,
  logged_set: 2,
  exercise: 0,
  user_exercise_preference: 0,
  // ADD, mirroring the workout_session chain's own depth-ordering:
  // routine: 0, routine_day: 1, routine_exercise: 2,
  // routine_cycle: 1 (sibling of routine_day under routine),
  // routine_exercise_cycle_target: 3 (child of both routine_exercise and routine_cycle —
  //   apply after both parents),
  // user_preference: 0 (singleton root, same class as exercise)
};
```

### `resolveTarget` — the one shared pure function (discretion item, resolved)

```typescript
// Proposed location: packages/api-contracts/src/program.ts
// [ASSUMED shape — not yet implemented; derived from D-10's "override ?? base" rule read
// directly from 04-CONTEXT.md, verbatim quoted there]
export interface ResolvedTarget {
  targetSets: number | null;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRestSeconds: number | null;
}

export function resolveTarget(base: ResolvedTarget, override: Partial<ResolvedTarget> | null): ResolvedTarget {
  if (!override) return base;
  return {
    targetSets: override.targetSets ?? base.targetSets,
    targetRepMin: override.targetRepMin ?? base.targetRepMin,
    targetRepMax: override.targetRepMax ?? base.targetRepMax,
    targetRirMin: override.targetRirMin ?? base.targetRirMin,
    targetRirMax: override.targetRirMax ?? base.targetRirMax,
    targetRestSeconds: override.targetRestSeconds ?? base.targetRestSeconds,
  };
}
```
This one function must be imported by (1) the builder UI's cycle-strip rendering, (2) the Home tab's "next up" card, and (3) `apps/mobile/lib/db/log-set.ts`'s `addSessionExercise` — currently that function only reads `routine_exercise`'s base columns `[VERIFIED: apps/mobile/lib/db/log-set.ts lines 69-93, read this session]`:
```typescript
  let prescription = EMPTY_PRESCRIPTION;
  if (input.routineExerciseId) {
    const [row] = await db
      .select({
        targetSets: routineExercise.targetSets,
        targetRepMin: routineExercise.targetRepMin,
        targetRepMax: routineExercise.targetRepMax,
        targetRirMin: routineExercise.targetRirMin,
        targetRirMax: routineExercise.targetRirMax,
        targetRestSeconds: routineExercise.targetRestSeconds,
      })
      .from(routineExercise)
      .where(eq(routineExercise.id, input.routineExerciseId));
    if (row) prescription = row;
  }
```
This must become a join against `routine_exercise_cycle_target` for the session's current cycle, then a `resolveTarget(base, override)` call — otherwise PROG-11's success criterion is violated the moment any program has a per-cycle override.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `react-native-pager-view` used directly for any RN+Web swipeable deck | `react-native-tab-view`, which wraps pager-view on native and falls back to `PanResponder` on web | Longstanding (react-native-tab-view has shipped this split for years) | Removes the need for a phase-specific `.web.tsx` split for basic day-to-day paging |
| Contiguous-integer `order_index` for reorderable lists in offline-sync apps | Fractional/rational-index schemes (LexoRank-style) | Industry-standard technique wherever multi-device offline reordering exists (Trello's public engineering writeups are the canonical reference) | Avoids full-list rewrite conflicts under concurrent offline edits — directly relevant to this phase's `order_index` discretion item |

**Deprecated/outdated:** none specific to this phase — the domain (program/cycle modeling) is bespoke to this project, not following an external framework's evolving API.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `react-native-tab-view` is the correct package name/library for this use case, and its web fallback uses `PanResponder` | Standard Stack, Architecture Patterns Pattern 2 | If the library has since changed its web strategy or the claim is stale, the "no `.web.tsx` needed" conclusion is wrong and the planner should budget a split anyway |
| A2 | `react-native-draggable-flatlist` and `react-native-sortables` lack documented web support | Standard Stack | If either has since added first-party web support undocumented in the sources checked, the recommendation to hand-roll on gesture-handler + reanimated directly is overly conservative and adds unnecessary build effort |
| A3 | `expo install` vs. `pnpm add` convention for new native dependencies | Standard Stack, Installation | If the wrong installer is used, Expo's version-pinning for New-Architecture compatibility could be bypassed, risking a version mismatch |
| A4 | Fractional/rational `order_index` is the right fix for the reorder-conflict pitfall, vs. an integer-gap scheme | Common Pitfalls #3 | Both are legitimate; if the team prefers integer-gap (matches the existing `integer` column type with zero migration), the plan should say so explicitly rather than defaulting to a schema-widening migration on my recommendation alone |
| A5 | Deload cycles count as "trainable" for rotation-advancement purposes (Pitfall 5) while time-off cycles do not | Common Pitfalls #5 | This is genuinely unspecified in CONTEXT.md; if the intended behavior differs (e.g., deload also pauses "which day is next" tracking), the Home tab's next-up logic needs different branching than proposed here |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Does `react-native-tab-view`'s web `PanResponder` fallback actually feel acceptable inside this project's NativeWind-styled tree, and does it coexist cleanly with the cycle strip's own re-render-on-select behavior (D-22)?**
   - What we know: the library's documented architecture splits pager-view (native) from PanResponder (web) internally.
   - What's unclear: whether swipe velocity/threshold tuning needs project-specific overrides, and whether disabling its built-in `TabBar` (`renderTabBar={() => null}`) in favor of the separate cycle-strip component has any layout side effects.
   - Recommendation: budget a small throwaway spike (a bare `TabView` rendered on both a device/simulator, when available, and a browser) before the first real builder task starts.

2. **Can `react-native-gesture-handler` + `react-native-reanimated` deliver an acceptable always-visible drag handle on RN Web out of the box under Expo's Metro web bundler (not webpack), given the mixed signals found (official web-support docs exist, but community GitHub issues report web friction)?**
   - What we know: both libraries have first-party "Web Support" documentation; Expo's own bundler (used by this project — `expo export --platform web`) handles much of the babel/worklets configuration automatically that raw-webpack setups (the source of most GitHub friction reports) must configure manually.
   - What's unclear: whether Expo's automatic configuration is sufficient for gesture-handler's pan gestures specifically (vs. reanimated's animation primitives, which are more clearly documented as web-working), and whether the "no simulator, no device, no Android SDK" environment constraint (STATE.md) means this can only be verified on the web target during this phase.
   - Recommendation: spike this explicitly and early — this is the item CONTEXT.md itself calls "the phase's largest unbudgeted technical risk," and this research could not resolve it to HIGH confidence with the tools available this session.

3. **Fractional vs. integer-gap `order_index` — which, and does it require a Postgres column-type migration?**
   - What we know: both approaches solve the offline-reorder-conflict problem; fractional requires widening `integer` → `numeric`/`real`, integer-gap does not.
   - What's unclear: whether a `numeric` order_index has any interaction with existing indexes/queries that assume integer ordering (e.g., `ORDER BY order_index` still works identically either way, but any code doing integer arithmetic on the column would need review — none was found in this session's grep, but the search was not exhaustive).
   - Recommendation: planner picks one explicitly in the plan and records the reason, per CONTEXT.md's own instruction to "decide deliberately and record why."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm / Postgres (existing dev stack) | Schema + sync apply-path work | ✓ (established in Phases 1-3) | — | — |
| iOS Simulator / Android emulator or device | Verifying D-21/D-23's native drag/swipe behavior | ✗ | — | No fallback — native verification stays deferred to ROADMAP Phase 999.1 per STATE.md; this phase's native-specific claims rest on typecheck + correct API usage only, exactly as Phases 1-3 already accepted |
| A desktop/mobile browser (for `expo export --platform web` / dev server) | Verifying D-21/D-23's web behavior, and the only environment where this phase's UI risk can actually be exercised end to end | ✓ (assumed present — no contrary evidence found) | — | — |

**Missing dependencies with no fallback:**
- Native simulator/device for verifying gesture-handler/reanimated drag behavior and react-native-tab-view's native pager path — deferred to Phase 999.1 per existing project convention (`.planning/WINDOWS.md`).

**Missing dependencies with fallback:**
- None beyond the native-verification gap above; the web target substitutes as the one place this phase's core UI risk (D-21/D-23) can be exercised now.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (`jest-expo` preset) for mobile unit tests `[VERIFIED: apps/mobile/jest.config.js, read this session]`; Playwright for mobile e2e (`apps/mobile/e2e/*.spec.ts`); `apps/api` has **no unit test script by design** — every API test is end-to-end (already an established project convention per STATE.md/PITFALLS notes) |
| Config file | `apps/mobile/jest.config.js` |
| Quick run command | `pnpm --filter mobile test -- <pattern>` |
| Full suite command | `pnpm test` (root, runs `turbo run test` across all workspaces) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROG-01/02/03 | Create program, add/reorder/remove exercises, set targets, all persist locally and round-trip through the new sync apply-path | integration (API e2e) | new `apps/api/src/sync/__tests__/routine-sync.e2e-spec.ts`-style test pushing routine ops and asserting Postgres rows | ❌ Wave 0 |
| PROG-04 | Cycle creation + per-cycle override resolution | unit | `pnpm --filter api test -- program` (new `packages/api-contracts` unit test for `resolveTarget`) | ❌ Wave 0 |
| PROG-05/PROG-06 | Deload/time-off `kind` placement | unit | test asserting `kind` CHECK constraint rejects invalid values, and `order_index` 0/max resolves as "start/end" | ❌ Wave 0 |
| PROG-07 | Duplicate deep-copy produces fresh UUIDs, no shared FK with source | unit | `pnpm --filter mobile test -- duplicate-routine` | ❌ Wave 0 |
| PROG-08 | Activation is idempotent per-device, offline-safe (single `active_routine_id`) | integration | new test asserting two concurrent "activate" pushes from different devices converge to one winner without a rejected/jammed queue | ❌ Wave 0 |
| PROG-09 | "Next up" resolves correctly, including the two D-20 edge cases (Pitfall 5) | unit | `pnpm --filter mobile test -- next-up` covering deleted-day and time-off-cycle cases explicitly | ❌ Wave 0 |
| PROG-10 | `progression_frozen` gates future writes (Phase 8 contract, but this phase's data must support the assertion) | unit | test asserting the frozen flag persists and is independently toggleable while `status` and `active_routine_id` are unaffected | ❌ Wave 0 |
| PROG-11 | Editing a program never changes an already-logged session's snapshot | regression (already covered pattern per D-01, extend for cycle overrides) | extend existing `log-set` test suite: log a session, edit the routine's cycle override afterward, assert the session's `session_exercise` row is unchanged | ❌ Wave 0 — extends existing test file, not a new one |

### Sampling Rate

- **Per task commit:** targeted Jest file for the touched module.
- **Per wave merge:** `pnpm test` (full turbo suite) plus, if the API sync apply-path changed, the e2e suite.
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `apps/api/src/sync/__tests__/program-sync.e2e-spec.ts` (or similarly named) — covers PROG-01/02/03/08, and is the test that would have caught the missing `TABLE_MAP` entries had this research not surfaced them first
- [ ] `packages/api-contracts/src/__tests__/program.test.ts` — covers `resolveTarget`, `CYCLE_KINDS`, `ROUTINE_STATUSES`
- [ ] `apps/mobile/lib/db/__tests__/duplicate-routine.test.ts` — covers PROG-07
- [ ] `apps/mobile/lib/__tests__/next-up.test.ts` (or wherever the Home-tab derivation logic lands) — covers PROG-09 including both D-20 edge cases
- [ ] Extension to existing `log-set` test file — covers PROG-11 with a cycle-override scenario

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new surfaces reuse the existing authenticated session; no new auth flow) | — |
| V3 Session Management | No | — |
| V4 Access Control | **Yes** | Every new table (`routine_cycle`, `routine_exercise_cycle_target`) must resolve ownership through `routine.user_id` via join, exactly like `routine_day`/`routine_exercise` today — both in `sync-rules.yaml`'s pull-side queries and in `sync.service.ts`'s push-side apply logic (an op must be rejected `not_owner` if the referenced `routine_id`/`cycle_id`/`routine_exercise_id` doesn't resolve to the pushing user's own routine, mirroring the existing `not_owner`/`missing_parent` rejection reasons already implemented for `session_exercise`) |
| V5 Input Validation | **Yes** | `routine_cycle.kind` must be validated against the `CYCLE_KINDS` tuple server-side (`hasInvalidField`-style check, mirroring `LOAD_TYPES`/`EQUIPMENT_TYPES`/`MOVEMENT_PATTERNS`'s existing pattern) before it ever reaches the Postgres CHECK constraint — the CHECK constraint is the backstop, not the primary validation, per the existing project convention |
| V6 Cryptography | No | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A pushed op naming a `routine_id`/`cycle_id` that belongs to another user's routine | Elevation of Privilege / Tampering | Ownership-join validation before apply, rejecting with `not_owner` — the exact pattern `sync.service.ts` already applies to `session_exercise`/`logged_set` via `workout_session.user_id`; must be replicated for the new routine-scoped tables |
| A malformed `kind` value smuggled into a `routine_cycle` op | Tampering | Server-side enum validation against the shared `api-contracts` tuple, rejected `invalid_field`, before the Postgres CHECK constraint is ever hit |
| Two devices both pushing `active_routine_id` for different routines while offline | Tampering (data-integrity, not security in the classic sense) | Already addressed structurally by D-14 — LWW on a single column makes "two actives" unrepresentable, not a security control per se but the same class of correctness risk this ASVS section exists to catch |

## Sources

### Primary (HIGH confidence — read directly this session)
- `apps/api/src/db/schema/program.ts`, `session.ts`, `preference.ts` — shipped schema, read in full
- `apps/mobile/lib/db/schema.ts` — local SQLite mirror, read in full
- `apps/mobile/lib/db/log-set.ts` — snapshot-on-use mechanism, read in full
- `apps/api/src/sync/sync.service.ts` (lines 1-260) — TABLE_MAP, AGGREGATE_RANK, HARD_DELETE_FORBIDDEN, toXValues pattern
- `packages/api-contracts/src/sync.ts` — SYNCED_TABLES, PUSH_APPLIED_TABLES, PUSH_DEFERRED_TABLES and their phase-ownership comments
- `packages/api-contracts/src/catalog.ts`, `units.ts` — vocabulary and pure-function precedent
- `ops/powersync/sync-rules.yaml` — existing pull-side joined queries
- `apps/api/src/seed/generate-corpus.ts` (lines 260-300) — the `status = 'active'` literal D-15 must migrate
- `.planning/research/ARCHITECTURE.md` §1, §2, §5 — domain model and snapshot-on-use rationale
- `.planning/research/PITFALLS.md` §5, §9, §11, §13 — RN Web divergence, domain modeling, history corruption, N+1
- `docs/platform-modules.md`, `docs/catalog-load-types.md` — the `.web.tsx` convention and vocabulary-enforcement precedent
- npm registry (`npm view <pkg> version`, 2026-08-20) — version/publish-date/download counts for all six candidate packages, via the `package-legitimacy check` seam

### Secondary (MEDIUM confidence)
- WebSearch: react-native-tab-view's native-pager/web-PanResponder split (cross-checked against the library's own npm listing existing and its GitHub org being `react-navigation`)
- WebSearch + WebFetch: react-native-reanimated's dedicated "Web Support" documentation page's existence confirmed via search result titles, not fetched in full
- WebFetch: react-native-sortables docs site (`react-native-sortables-docs.vercel.app`) — "seamlessly across iOS and Android" language, no web claim

### Tertiary (LOW confidence, flagged for validation)
- WebSearch/WebFetch: react-native-draggable-flatlist and react-native-gesture-handler's actual web behavior — search results were inconclusive; several GitHub issues surfaced describing web friction, but none conclusively current for this project's exact Expo/Metro setup

## Metadata

**Confidence breakdown:**
- Standard stack (schema/sync additions): HIGH — read directly from the shipped codebase this session
- Standard stack (reorder/paging libraries): LOW-MEDIUM — no library has a first-party, confirmed guarantee of RN-Web parity for drag-reorder; flagged for a pre-planning spike
- Architecture (sync apply-path gap): HIGH — confirmed by reading `TABLE_MAP`, `PUSH_DEFERRED_TABLES`, and `sync-rules.yaml` directly
- Pitfalls: HIGH for the sync/ownership pitfalls (grounded in code); MEDIUM for the reorder-conflict and position-derivation pitfalls (grounded in reasoning from the shipped LWW/aggregate-root model, not an observed bug)

**Research date:** 2026-08-20
**Valid until:** 30 days for the schema/sync findings (stable, code-grounded); 7-14 days for the reorder-library recommendation (fast-moving RN ecosystem, and this research explicitly could not resolve it past MEDIUM-LOW confidence — re-check before the drag-handle task starts if more than two weeks elapse)
