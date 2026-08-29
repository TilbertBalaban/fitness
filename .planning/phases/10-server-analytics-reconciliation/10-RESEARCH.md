# Phase 10: Server Analytics & Reconciliation - Research

**Researched:** 2026-08-29
**Domain:** Server-side materialized rollups over a NestJS+Drizzle+Postgres API already synced to a PowerSync/RN-Web client; scoped recompute on history edits; SVG body-map rendering
**Confidence:** HIGH for schema/sync-wiring mechanics and existing-code integration points (all read directly from source this session); MEDIUM for the recompute algorithm's exact cost profile (reasoned from precedent, not benchmarked); LOW/ASSUMED for the front/back muscle-view split and query-count budget numbers (no prior art in this repo, and no public spec exists).

## Summary

This phase adds the project's first real server-side business-logic module. Every prior phase's NestJS work was CRUD (the `sync` module's push/pull plumbing) or a parity-only stub (`apps/api/src/progression/__tests__/parity.spec.ts` imports `@fitness/progression-engine` but wires no module — its own header comment says server-side reconciliation is explicitly Phase 10's job). Concretely, this phase must: (1) add a new Postgres table for the daily `(user_id, muscle_group_id, local_date)` rollup plus a watermark row, wired through the *existing* `user_data` PowerSync Sync Stream as two more `auth.user_id()`-filtered queries; (2) add a new mirror table to the mobile Drizzle/SQLite schema so the rollup and watermark sync down automatically (no new PowerSync stream, no push-path wiring, because the client never writes these rows); (3) hook a scoped recompute step into `SyncService`'s existing per-aggregate transaction for the `workout_session` root, reusing `@fitness/pr-rules`'s pure `detectPrs`/`foldPriorBest` (currently client-only, imported from `apps/mobile/lib/db/personal-record.ts`) against Drizzle/Postgres instead of PowerSync's SQLite proxy; (4) extend the existing `seeded-corpus-perf.e2e-spec.ts` harness (which already seeds an 18-month, deterministic corpus) with new query-count assertions for the recompute path, since there is no separate "history" REST endpoint to budget — every user-facing read in this phase is local-first, read directly off the synced SQLite mirror; and (5) build a front/back body-map with `react-native-svg`, following the exact accessibility contract Phase 9's `TrendChart.tsx` already established.

The single biggest gap this research found: `apps/api/src/seed/generate-corpus.ts`'s `ensureExerciseCatalog()` inserts its ten `seed-ex-*` exercises with **zero** `exercise_muscle_mapping` rows — the query-count budget test for the rollup/heatmap cannot exercise real muscle-volume math against the existing corpus until this gap is closed.

**Primary recommendation:** Add one new Drizzle Postgres schema file (`apps/api/src/db/schema/analytics.ts`) holding `muscleVolumeRollup` (daily grain, single deterministic `id`, matching the `exerciseMuscleMapping`/`userExercisePreference` PK precedent) and a watermark table; wire recompute as a synchronous post-processing step inside `SyncService.applyBatch`'s existing `workout_session`-aggregate transaction, scoped per touched `(exerciseId)` for PRs and per touched `(muscleGroupId, localDate)` for rollup cells; add `@fitness/pr-rules` and `@fitness/analytics-engine` as **runtime** (not dev) dependencies of `apps/api`; extend `seeded-corpus-perf.e2e-spec.ts` and `schema-parity.e2e-spec.ts` rather than writing new harnesses.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 1-week muscle volume window | Browser/Client (local SQLite) | — | D-01: cheap, always current, never waits on sync |
| 1-month / 3-month muscle volume window | API/Backend (materialized rollup) | Browser/Client (overlay of not-yet-rolled-up sessions) | D-01/D-02: server owns the expensive aggregate; client only adds the tail past the watermark |
| Drill-down (ANLY-05: exercises behind a muscle's sets) | Browser/Client (local SQLite) | — | D-06: bounded, single-window, single-muscle-group query; must never disagree with sets already shown elsewhere |
| PR recompute on history edit | API/Backend | — | D-03: server-authoritative, runs once, replaces the client's own append-only PR ledger for the touched exercise(s) |
| Rollup recompute on history edit | API/Backend | — | D-03: same aggregate-root transaction as the PR recompute |
| Rollup delivery to client | API/Backend (writes) | Browser/Client (reads via PowerSync sync stream) | D-09: existing `user_data` stream, one more `auth.user_id()` query — no new REST endpoint |
| Body-map rendering | Browser/Client (`react-native-svg`) | — | D-05: one implementation for RN + Web, matches Phase 9's `TrendChart.tsx` precedent |
| Query-count budget enforcement | API/Backend (test harness against Postgres pool) | — | D-08: `pool.query` is monkey-patched in the existing e2e harness; there is no separate REST surface to budget |

## User Constraints

<user_constraints>

### Locked Decisions

- **D-01:** Short windows (1 week) read local SQLite entirely; long windows (1 month, 3 months) read the synced server rollup and overlay any session whose local_date falls after the rollup's own computed-through watermark. Reversibility: costly (removing the overlay reintroduces the invisibility of just-logged offline work).
- **D-02:** The rollup's grain is `(user_id, muscle_group_id, local_date)` — one daily row per muscle group, not one row per window. Reversibility: one-way in practice once rows exist and sync down.
- **D-03:** Recompute is server-authoritative and scoped to what actually changed: affected `(user, exercise)` pairs for PRs, affected `(user, muscle_group, date)` cells for rollups — never the user's whole history. Reuses the discipline `detectPrsForSession` (Phase 5, LOG-19) already proved idempotent. `personal_record.reconciled_at`/`server_seq` are the mechanism this phase finally uses. Reversibility: reversible.
- **D-04:** Muscle volume is weighted by `exercise_muscle_mapping.weight_factor` and includes secondary muscles — a deliberately different quantity from Phase 9's primary-only "muscles trained" count; both must be labelled distinctly in the UI. Reversibility: reversible.
- **D-05:** The body map is drawn with `react-native-svg` (already installed, 15.15.4), following Phase 9's accessibility contract: no text inside `<Svg>`, one `role="img"` announcement per figure. Reversibility: reversible.
- **D-06:** The drill-down (ANLY-05) reads local SQLite, not a second rollup — bounded to one muscle group and one already-selected window. Reversibility: reversible.
- **D-07:** Volume uses `countsTowardWorkingVolume`; anything PR-flavoured uses `countsTowardRecords`. Carried forward from Phases 7-9, live in `@fitness/api-contracts`, never re-derived. This phase adds the server as a third consumer.
- **D-08:** Query-count budgets are asserted via an executable test against a realistically-sized dataset, not aspirational comments. Reversibility: reversible.
- **D-09:** The rollup table syncs down through the existing `user_data` stream, as one more `WHERE user_id = auth.user_id()` query. No new stream, no new auth surface.
- **D-10:** No fabricated zeros, carried forward from Phase 9 (D-09 there). A muscle with no logged work renders as untrained, visually distinct from a muscle at the bottom of a real intensity scale.

### Claude's Discretion

None separately called out beyond the `[CLAUDE'S CALL]`-tagged decisions above — CONTEXT.md's Mode note states every decision in this phase was made at Claude's discretion during an unattended run, each already justified and reversibility-scored inline. Treat D-01 through D-06 and D-08 as locked-but-reviewable; D-07, D-09, D-10 as directly inherited and not open for reinterpretation.

### Deferred Ideas (OUT OF SCOPE)

- Per-exercise rollups (the drill-down stays a local query per D-06).
- Any window other than 1 week / 1 month / 3 months.
- Native rendering of the body map and subjective visual review — deferred to ROADMAP Phases 999.1 and 999.2 per standing project policy (also recorded in this session's memory: Android/native UAT is swept at the end of the project, not per-phase).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANLY-04 | Set volume per muscle group on a front/back body-map heatmap over 1 week / 1 month / 3 months | Rollup schema design (below), D-01 overlay algorithm, `react-native-svg` accessibility pattern from `TrendChart.tsx`, existing `exercise_muscle_mapping.weight_factor`/`role` data already present client- and server-side |
| ANLY-05 | Drill into a muscle group to see which exercises contributed its sets | D-06 confirms local-only query; existing `exerciseMuscleMapping` client table (already synced/local) plus `weekly-progress-query.ts`'s established pattern for joining muscle mappings against logged sets |
| ANLY-09 | PRs and volume recomputed correctly when a past workout is edited | `SyncService.applyBatch`'s existing per-aggregate transaction and `existingRow` pre-read (captures old `local_date` before overwrite); `@fitness/pr-rules`'s `detectPrs`/`foldPriorBest`; `personal_record.reconciled_at`/`server_seq` columns (currently unused) |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.2 `[VERIFIED: npm registry, matches apps/api/package.json ^0.45.0]` | Postgres access, upsert idiom | Already the project's ORM; `onConflictDoUpdate` idiom used throughout `sync.service.ts` is the load-bearing precedent for the new rollup table's upsert |
| `@fitness/pr-rules` | workspace (private, unpublished) `[VERIFIED: packages/pr-rules/package.json]` | Pure PR detection (`detectPrs`, `foldPriorBest`, `estimated1RM`) | Already exists, already used client-side in `apps/mobile/lib/db/personal-record.ts`; this phase is the first to import it into `apps/api` at runtime |
| `@fitness/analytics-engine` | workspace (private, unpublished) `[VERIFIED: packages/analytics-engine/package.json]` | Pure aggregation (weekly progress, exercise series) | Already exists; the natural home for a new pure `muscleVolumeForSession`-style function shared between the server's rollup writer and the client's overlay/drill-down readers |
| `react-native-svg` | 15.15.5 (latest on npm; repo pins 15.15.4) `[VERIFIED: npm registry + apps/mobile/package.json:54]` | Body-map shape rendering | Already installed for Phase 9's `TrendChart.tsx`; D-05 explicitly reuses it |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-kit` | 0.31.x `[VERIFIED: apps/api/package.json:45]` | Schema push (`drizzle-kit push`, no committed migration files) | New table lands by adding it to `apps/api/src/db/schema.ts`'s `schema` object; `pnpm run db:push` (already the `test:e2e` pretest step) applies it — no manual SQL migration to write |
| `pg` (node-postgres) | whatever `drizzle.module.ts` already wraps `[VERIFIED: apps/api/test/seeded-corpus-perf.e2e-spec.ts:9]` | Query-count instrumentation via `pool.query` monkey-patch | The existing `countQueries` helper in `seeded-corpus-perf.e2e-spec.ts` — reuse it verbatim, do not reinvent |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A dedicated `analytics_watermark` singleton table | A `rollup_computed_through` column bolted onto `user_preference` | The column approach reuses an existing synced singleton (no new table), but `user_preference` already has client-writable PATCH fields and a push-path branch (`USER_PREFERENCE_PATCH_FIELDS`) — a server-only-written column there risks being silently clobbered by a client's own preference PATCH racing the recompute, or requires carving out an exception in `patchAwareSet`. A separate table with zero push-path wiring (server writes only, via direct `tx.update`) is simpler to reason about and matches the "server-only-write" shape already established by leaving new tables entirely out of `SYNCED_TABLES`/`TABLE_MAP` (see `body_metric`/`progress_photo`, which are in `SYNCED_TABLES` for a *future* push path but have no `TABLE_MAP` entry yet). Recommended: the dedicated table. |
| Full per-exercise PR history replay on every edit | Date-scoped replay (only sessions from the earliest touched date forward) | Full replay is simpler and still "scoped" in D-03's sense (bounded to touched exercises, not the whole user), matching the existing `loadPriorBestByExercise` cost profile (one batched read of ALL of that exercise's sessions, already the client's own pattern). Date-scoped replay is cheaper for a lifter with years of history on one exercise but is meaningfully more complex to get correct (must also handle a session moving its date earlier than another session that read it as "prior"). Recommended: full per-exercise replay for v1; document the cost tradeoff for planner. |

**Installation:**
```bash
# No external npm installs — react-native-svg and drizzle-orm are already installed at the
# versions this phase needs. The only "new" dependency wiring is internal:
pnpm --filter @fitness/api add @fitness/pr-rules@workspace:* @fitness/analytics-engine@workspace:*
# ^ apps/api/package.json currently has @fitness/api-contracts as a runtime dependency and
# @fitness/progression-engine as a DEV dependency only (test-only parity spec). This phase's
# recompute logic runs in production, so pr-rules/analytics-engine must land in
# "dependencies", not "devDependencies" — the opposite of how progression-engine was added.
```

**Version verification:** `npm view drizzle-orm version` → `0.45.2`; `npm view react-native-svg version` → `15.15.5` (repo pins 15.15.4, already current within patch range). Both checked against the live npm registry this session, 2026-08-29. `@fitness/pr-rules` and `@fitness/analytics-engine` are private workspace packages, not on any registry — verified by reading `packages/pr-rules/package.json` and `packages/analytics-engine/package.json` directly.

## Package Legitimacy Audit

No new external (npm-registry) packages are introduced by this phase. The only "new" dependencies are two already-existing **internal workspace packages** (`@fitness/pr-rules`, `@fitness/analytics-engine`) that need to move from unused-by-`apps/api` to a runtime dependency of `apps/api`. Neither is fetched from a registry, so the SLOP/SUS/OK verdict machinery does not apply — both were read directly from disk this session (`packages/pr-rules/src/*.ts`, `packages/analytics-engine/src/*.ts`) and are proven-in-production code already exercised by `apps/mobile`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    CLIENT (apps/mobile, RN + Web)
  ┌──────────────────────────────────────────────────────────────────┐
  │  Body-map screen                                                  │
  │    1-week window ──────► local SQLite query (loggedSet join       │
  │                           exerciseMuscleMapping, weight_factor)   │
  │    1-mo/3-mo window ───► read muscle_volume_rollup (synced,       │
  │                           local SQLite mirror)                    │
  │                         + overlay: local sessions with             │
  │                           local_date > analytics_watermark        │
  │    drill-down (ANLY-05)─► local SQLite query, one muscle group,    │
  │                           one window, exerciseMuscleMapping join   │
  └───────────────┬───────────────────────────────────┬──────────────┘
                  │ PowerSync pull (user_data stream)  │ push (SYNC_PUSH_PATH)
                  │ (rollup + watermark flow DOWN only)│ (workout_session/
                  ▼                                     │ session_exercise/
  ┌──────────────────────────────────────────────────┐ │ logged_set edits)
  │  ops/powersync/sync-rules.yaml: user_data stream   │ │
  │  + 2 queries: muscle_volume_rollup, analytics_      │ │
  │    watermark, both WHERE user_id = auth.user_id()   │ │
  └──────────────────────────────────────────────────┘ │
                                                          ▼
                    SERVER (apps/api, NestJS + Drizzle + Postgres)
  ┌──────────────────────────────────────────────────────────────────┐
  │  SyncController.push → SyncService.applyBatch                     │
  │    per-aggregate tx loop (existing) ─────┐                        │
  │    for aggregate.rootType === 'workout_session':                  │
  │      1. existing upsert logic runs (unchanged)                    │
  │      2. NEW: AnalyticsReconciliationService.reconcileSession(      │
  │           tx, userId, sessionId, oldLocalDate, newLocalDate,       │
  │           touchedExerciseIds)                                     │
  │           a. PR recompute: per touched exerciseId, replay full     │
  │              session history via @fitness/pr-rules                │
  │           b. Rollup recompute: per touched (muscleGroupId,         │
  │              oldDate|newDate), re-sum weighted volume from         │
  │              logged_set × session_exercise × exercise_muscle_     │
  │              mapping, upsert muscle_volume_rollup                  │
  └──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
apps/api/src/
├── analytics/                          # NEW module — this phase's actual subject
│   ├── analytics.module.ts             # no controller: server-only writes, no REST surface
│   ├── reconciliation.service.ts       # PR + rollup recompute, invoked from sync.service.ts
│   ├── muscle-volume.ts                # pure-ish Drizzle query helpers (read logged_set × mapping)
│   └── __tests__/
│       └── reconciliation.spec.ts      # unit tests, mirrors sync/__tests__ conventions
├── db/schema/
│   └── analytics.ts                    # NEW: muscleVolumeRollup, analyticsWatermark tables
├── sync/
│   └── sync.service.ts                 # MODIFIED: call reconciliation service after workout_session commit
└── seed/
    ├── generate-corpus.ts              # MODIFIED: ensureExerciseCatalog must also insert
    │                                    # exercise_muscle_mapping rows for its seed-ex-* ids
    └── corpus-shape.ts                 # MODIFIED: add new PERF_BUDGET entries for recompute

packages/analytics-engine/src/
└── muscle-volume.ts                    # NEW: pure per-session muscle-volume aggregation,
                                         # shared by server rollup writer + client overlay/drill-down

apps/mobile/lib/db/
├── schema.ts                           # MODIFIED: add muscleVolumeRollup, analyticsWatermark
│                                        # to drizzleSchema (NOT localOnlyCatalogTables — these
│                                        # are real synced tables, just never client-written)
└── muscle-volume-query.ts              # NEW: client reads (rollup + overlay + drill-down)

apps/mobile/components/
└── BodyMap.tsx                         # NEW: react-native-svg body-map, TrendChart.tsx's
                                         # accessibility pattern (accessible, accessibilityRole="image")

ops/powersync/sync-rules.yaml           # MODIFIED: 2 new queries in the user_data stream
```

### Pattern 1: Deterministic single-TEXT-PK on a composite-natural-key table

**What:** Every table PowerSync manages as a synced stream needs a single `TEXT PRIMARY KEY` column named `id` — this is a hard PowerSync/Drizzle-driver constraint, not a style preference, already discovered and documented twice in this codebase.
**When to use:** The new `muscle_volume_rollup` table's natural key is `(user_id, muscle_group_id, local_date)`, but it cannot be a composite Postgres PK if it is going to sync through PowerSync.
**Example:**
```typescript
// Source: apps/api/src/db/schema/catalog.ts (exerciseMuscleMapping comment, read this session)
// "Composite-PK on Postgres; PowerSync requires a single TEXT PRIMARY KEY on every managed
//  table, so id is derived deterministically at load time — that determinism is what makes
//  loadCatalogSnapshot's upsert idempotent across re-runs."
//
// And apps/api/src/db/schema/catalog.ts (userExercisePreference comment, read this session):
// "Single TEXT PRIMARY KEY, not a composite key on (user_id, exercise_id): SyncService's
//  applyBatch resolves every row as eq(table.id, op.id), and PowerSync's local schema gives
//  every managed table one id column — a composite PK would be unwritable through the sync path."
//
// Recommended shape for the new table (apps/api/src/db/schema/analytics.ts):
export const muscleVolumeRollup = pgTable('muscle_volume_rollup', {
  id: text('id').primaryKey(), // deterministic: `${userId}:${muscleGroupId}:${localDate}`
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  muscleGroupId: text('muscle_group_id').notNull(),
  localDate: date('local_date').notNull(),
  weightedVolumeKg: numeric('weighted_volume_kg', { precision: 12, scale: 3 }).notNull(),
  serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
});
```
Upsert target is `muscleVolumeRollup.id` directly (the deterministic string), exactly like `exerciseMuscleMapping`'s own id-derivation — no separate unique index needed, unlike `routineExerciseCycleTarget`'s pair-arbiter pattern (that pattern applies when the *client* generates an unpredictable id and the server must resolve collisions by natural key instead; here the server is the sole writer and can compute the natural-key-derived id itself before every upsert).

### Pattern 2: Server-only-written synced table needs no push-path wiring

**What:** A table can be added to the PowerSync `user_data` stream (pull direction) without ever appearing in `@fitness/api-contracts`'s `SYNCED_TABLES` tuple or `sync.service.ts`'s `TABLE_MAP`.
**When to use:** Both `muscle_volume_rollup` and the watermark table — the client only ever reads them, never writes them.
**Example:**
```typescript
// Source: apps/api/src/sync/sync.service.ts:97-100 (comment, read this session), confirming
// SYNCED_TABLES already has "gap" tables that aren't wired into TABLE_MAP yet:
// "The tables SyncService.TABLE_MAP actually applies today (CR-03)."
// body_metric and progress_photo are in SYNCED_TABLES (packages/api-contracts/src/sync.ts:10-26)
// but absent from TABLE_MAP (apps/api/src/sync/sync.service.ts:80-90) — proof this asymmetry
// is an established, load-bearing pattern, not a gap to "fix". muscle_volume_rollup and the
// watermark table should NOT be added to SYNCED_TABLES at all (they are never a valid op.type
// a client can push), only to sync-rules.yaml's pull query and the mobile client schema.
```

### Pattern 3: Recompute hook location inside the existing aggregate transaction

**What:** `SyncService.applyBatch` already loops per aggregate root and wraps each in `this.db.transaction(async (tx) => {...})` (apps/api/src/sync/sync.service.ts, read this session, transaction body spans roughly lines 1645-2040). For `aggregate.rootType === 'workout_session'`, every op in that aggregate (the session itself, its `session_exercise` children, its `logged_set` grandchildren) is applied inside one transaction.
**When to use:** The reconciliation call belongs at the end of that same transaction, before it returns — so a rollback of the push also rolls back any rollup/PR writes, and so the recompute sees the just-applied rows via the same `tx` handle (no re-read from a stale connection).
**Example:**
```typescript
// Inside the existing `for (const [root, aggregate] of aggregates)` loop, existing code:
try {
  await this.db.transaction(async (tx) => {
    const rootTable = ROOT_TABLE_BY_TYPE[aggregate.rootType];
    const [rootBefore] = await tx.select({ serverSeq: rootTable.serverSeq }).from(rootTable).where(eq(rootTable.id, root));
    // ... existing per-op upsert logic (unchanged) ...

    // NEW, only for aggregate.rootType === 'workout_session':
    if (aggregate.rootType === 'workout_session') {
      await this.reconciliation.reconcileSession(tx, userId, root /* sessionId */);
    }
  });
} catch (error) {
  // existing rollback/rejection handling — reconciliation errors roll back with everything else
}
```
The DELETE-of-a-session case and the "session moved to another date" case both need the row read via `existingRow[0]` — already fetched via `.for('update')` *before* the delete/update is applied (apps/api/src/sync/sync.service.ts, read this session, around line 1673: `const existingRow = await tx.select().from(table).where(eq(table.id, op.id)).for('update')`). That gives the OLD `local_date` for free; the reconciliation service must be handed both the old and new local_date so it can invalidate/recompute rollup cells on both dates when a session's date changes.

### Pattern 4: Accessible SVG body-map, following `TrendChart.tsx` exactly

**What:** `apps/mobile/components/TrendChart.tsx` (Phase 9, read this session) establishes the accessibility contract D-05 requires be reused: the `<Svg>` root carries `accessible accessibilityRole="image" accessibilityLabel={label}`, and every internal shape carries a `HIDDEN_FROM_ASSISTIVE_TECH` spread (`accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants'`) so a screen reader announces one composed sentence, never individual paths.
**When to use:** The body-map component (front and back views).
**Example:**
```typescript
// Source: apps/mobile/components/TrendChart.tsx (read this session, lines 72-100)
const HIDDEN_FROM_ASSISTIVE_TECH = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
// ...
<Svg width={width} height={height} accessible accessibilityRole="image" accessibilityLabel={label}>
  {/* every muscle-group Path gets {...HIDDEN_FROM_ASSISTIVE_TECH}; label is a composed one-sentence
      summary computed the same way trendChartSummary() is: a pure, separately-unit-tested function */}
</Svg>
```
The file-level comment on `TrendChart.tsx` also records a hard rule: never import `Text`/`TSpan`/`TextPath` from `react-native-svg` under any alias — in-canvas text ignores OS font scaling. This applies identically to the body map: muscle-group labels must render as ordinary RN `<Text>` outside the `<Svg>`, not as SVG text.
`accessibilityRole="image"` was proven this session (via project memory/09-01 decision log and confirmed by `TrendChart.tsx`'s own comment) to map to a Playwright-queryable `role="img"` through `react-native-web` — reuse this fact rather than re-verifying it in a browser.

### Anti-Patterns to Avoid

- **Recomputing the whole user's history on every edit:** D-03 explicitly forbids this. Scope PR recompute to touched `exerciseId`s and rollup recompute to touched `(muscleGroupId, date)` cells only.
- **A REST endpoint for reading rollups/history:** Every prior phase (9 and earlier) reads synced data locally; there is no "history controller" in this codebase (`apps/api/src/*.controller.ts` — only `health`, `catalog`, `sync` exist, confirmed by directory listing this session). Do not introduce a new GET endpoint for muscle volume; the client reads its local SQLite mirror, exactly like every other analytics surface in Phase 9.
- **Conflating `countsTowardWorkingVolume` and `countsTowardRecords`:** Phase 9's own research flagged collapsing these two predicates as "the single most likely correctness defect" in the analytics domain (`packages/analytics-engine/src/exercise-series.ts` comment, read this session). Rollup volume must use `countsTowardWorkingVolume`; any PR-adjacent computation must use `countsTowardRecords`.
- **Re-deriving PR logic server-side instead of importing `@fitness/pr-rules`:** the pure rule functions (`detectPrs`, `foldPriorBest`) must be imported, never reimplemented, or the client and server will diverge on which set is a record — precisely the parity risk `@fitness/progression-engine`'s parity-fixture pattern exists to prevent elsewhere.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PR detection math (heaviest weight, e1RM, most-reps-at-weight, best-set-volume) | A second, server-side reimplementation of the PR rules | `@fitness/pr-rules` (`detectPrs`, `foldPriorBest`, `estimated1RM`), imported directly | Already exists, already proven correct client-side (Phase 5/9), and importing it is the only way client/server PR determination can never disagree |
| Query-count instrumentation | A new Postgres query-logging wrapper | The existing `countQueries` helper in `apps/api/test/seeded-corpus-perf.e2e-spec.ts` (monkey-patches `pool.query`) | Already built, already proven against this exact `pool`/`db` pair; a second implementation risks measuring a different code path |
| Realistic multi-year seed data | A new corpus generator | `apps/api/src/seed/generate-corpus.ts` + `CORPUS_SHAPE` (18 months, 4 sessions/week, 15 sets/session, deterministic seed) | Already spans more than the "1-2 years" the additional context asked for; only needs a small extension (muscle mappings for its `seed-ex-*` ids), not a second generator |
| Upsert-on-conflict for the new tables | Raw `INSERT ... ON CONFLICT` SQL | Drizzle's `.onConflictDoUpdate({...})`, the idiom used for every other table in `sync.service.ts` | Consistent with the rest of the codebase; keeps `server_seq`-bump-on-write semantics identical to every other aggregate root |

**Key insight:** Every piece of "hard" logic this phase needs (PR math, working-volume/records predicates, upsert idiom, query-count instrumentation, multi-year seed data) already exists in this codebase from Phases 2-9. This phase's actual novel work is the *wiring*: a new schema, a new sync-stream query, a new recompute hook, and a new SVG component — not new algorithms.

## Runtime State Inventory

Not applicable — this phase is additive (new tables, new module, new component), not a rename/refactor/migration. No existing runtime state (stored data, live service config, OS-registered state, secrets, build artifacts) needs to change identity. Verified by reading the phase's own CONTEXT.md (`In scope: ANLY-04, ANLY-05, ANLY-09` — all additive) and confirming no existing table/column is renamed by this phase's design.

## Common Pitfalls

### Pitfall 1: The seeded corpus has no muscle-mapping data at all

**What goes wrong:** `apps/api/src/seed/generate-corpus.ts`'s `ensureExerciseCatalog()` (read this session, lines 248-256) inserts its ten `seed-ex-*` exercises via raw SQL into `exercise` — with no corresponding `INSERT INTO exercise_muscle_mapping`. A query-count budget test for the rollup/heatmap that runs against this corpus will compute zero muscle volume for every session, because the join to `exercise_muscle_mapping` returns nothing.
**Why it happens:** The real catalog (`apps/api/src/seed/seed-catalog.ts`, importing `free-exercise-db`) and the corpus generator's synthetic exercise list are two entirely separate seed paths that happen to use disjoint id namespaces (`seed-ex-*` vs. the free-exercise-db slugs) — nobody has ever needed them to intersect before this phase.
**How to avoid:** Extend `ensureExerciseCatalog()` (or add a sibling function) to also insert `exercise_muscle_mapping` rows for each `seed-ex-*` id, referencing the real `muscle_group` ids (`chest`, `lats`, `quads`, etc. — the 19-member canonical list in `packages/api-contracts/src/catalog.ts:18-38`, read this session). Update `CORPUS_SHAPE`'s co-located comment (`apps/api/src/seed/corpus-shape.ts`) to note the addition, since "a change to the corpus shape cannot silently invalidate the budget it is measured against."
**Warning signs:** A rollup query-count test that passes trivially (query count is low) because there is simply no data to aggregate — a green test asserting nothing, the exact failure mode `scripts/jest-suite-integrity.cjs` exists to catch for empty suites, but which this specific case would slip past (the suite is not empty, its assertions are just vacuous).

### Pitfall 2: The front/back body-region split does not exist yet

**What goes wrong:** `packages/api-contracts/src/catalog.ts`'s `MUSCLE_GROUP_BODY_REGION` (read this session, lines 43-63) maps each of the 19 `MuscleGroupId`s to one of six `BodyRegion`s (`chest | back | shoulders | arms | core | legs`) — this is NOT a front/back split. ANLY-04 explicitly requires a *front/back* body-map, and several muscle groups are genuinely ambiguous under a naive split (side delts, forearms, calves, abductors are visible from both views; the existing map even puts `neck` in `back` and `abs`/`obliques` implicitly in `core`, neither telling you which SVG view a given muscle group's fill belongs on).
**Why it happens:** No prior phase needed a front/back distinction — Phase 9's muscle-groups-trained count (`WeeklyProgressCard`) only needed a flat count, never a spatial layout.
**How to avoid:** Author a new mapping (e.g. `packages/analytics-engine/src/muscle-body-view.ts`, `FRONT_BACK_VIEW: Record<MuscleGroupId, 'front' | 'back' | 'both'>`), reviewed explicitly rather than inferred, and treat any muscle group assigned `'both'` as appearing (at reduced/edge emphasis) on both SVG views. This is genuinely a **new design decision**, not something inferable from the codebase — flag it for `/gsd-discuss-phase` or the UI-SPEC step rather than silently picking a split.
**Warning signs:** A body-map component whose front view and back view do not visually agree with each other on which muscles trained today (e.g. glutes shown moderately worked on the front view but heavily worked on the back view) is a sign the split table was applied inconsistently, not that the underlying volume math is wrong.

### Pitfall 3: A workout_session edit that moves the session to a different date must invalidate rollup cells on BOTH dates

**What goes wrong:** `workout_session.local_date` is patchable (`WORKOUT_SESSION_PATCH_FIELDS` in `apps/api/src/sync/patch-update-set.ts:198-215`, read this session, includes `localDate: 'local_date'`) — this is exactly LOG-21's "backfill training history by editing a past workout's date and time." If reconciliation only recomputes the rollup cell for the session's *new* date, the *old* date's rollup cell keeps stale volume forever (criterion 3's "leaving no stale derived data" fails silently).
**Why it happens:** The natural implementation reads the session's current (already-updated) row to decide what to recompute — but by the time the upsert has run, the old date is gone from that row.
**How to avoid:** Capture the OLD `local_date` from `existingRow[0]` (already selected via `.for('update')` *before* the op is applied, in the same transaction) and pass both old and new dates into the reconciliation call; recompute the rollup cell for every muscle group touched by the session, on both dates.
**Warning signs:** A body-map heatmap that shows volume on a date the user believes they cleared out by editing a session's date — the classic "phantom data survives the edit that was supposed to remove it" bug class criterion 3 exists specifically to prevent.

### Pitfall 4: `@fitness/pr-rules`/`@fitness/analytics-engine` are CommonJS workspace packages compiled to `dist/` — they must be built before `apps/api` can import them at runtime

**What goes wrong:** Both packages' `package.json` (`main: "./dist/index.js"`) point at a `tsc`-compiled output, not the TS source. `nest build`/`nest start` resolve the workspace package through its `main` field via pnpm's symlink, meaning a fresh worktree or CI runner that hasn't run `pnpm --filter @fitness/pr-rules build` (and analytics-engine) will see `apps/api` fail to resolve the import — indistinguishable from a genuine "module not found" bug.
**Why it happens:** This is the same class of issue already logged in project memory (`fitness-pnpm-corepack-shim`): "otherwise turbo and `@fitness/*` imports fail as fake code errors" — but this phase is the *first* time `apps/api`'s production code (not just a test spec) depends on a pure-rules package, so the failure now blocks `nest build`/`nest start`, not just a Jest run.
**How to avoid:** Ensure Turborepo's task graph builds `@fitness/pr-rules` and `@fitness/analytics-engine` before `apps/api`'s own `build`/`test:e2e` tasks (this should already work if `turbo.json` declares `dependsOn: ["^build"]` correctly — verify, don't assume). Add both packages as `dependencies` (not `devDependencies`) in `apps/api/package.json` so the distinction between test-only and runtime usage is visible in the manifest itself.
**Warning signs:** `Cannot find module '@fitness/pr-rules'` or `'@fitness/analytics-engine'` errors that only reproduce in a fresh clone/worktree, never in a long-running dev session where `dist/` was already built once.

## Code Examples

### Reusing the query-count budget harness pattern

```typescript
// Source: apps/api/test/seeded-corpus-perf.e2e-spec.ts (read this session, lines 176-207)
// Reuse verbatim — do not reimplement:
async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queryCount: number }> {
  const original = pool.query.bind(pool);
  let count = 0;
  (pool as any).query = (...args: unknown[]) => {
    count += 1;
    return (original as any)(...args);
  };
  try {
    const result = await fn();
    return { result, queryCount: count };
  } finally {
    pool.query = original;
  }
}

// New assertion this phase adds, following the exact shape of the existing
// "issues the same query count reading a three-set session and a thirty-set session" test:
it('recomputes PRs+rollup for an edited session in a query count that does not grow with corpus size', async () => {
  const syncService = new SyncService(db);
  // corpusSessionId already exists (18 months of history) — edit ONE session's local_date
  const editOp: SyncCrudOp = { op_id: randomUUID(), op: 'PATCH', type: 'workout_session', id: corpusSessionId, data: { local_date: '2026-01-15' } };
  const { queryCount } = await countQueries(() => syncService.applyBatch(corpusUserId, [editOp]));
  expect(queryCount).toBeLessThanOrEqual(PERF_BUDGET.maxQueriesPerReconcile); // NEW constant, ASSUMED value
});
```

### The idempotency discipline to reuse from Phase 5, adapted server-side

```typescript
// Source: apps/mobile/lib/db/personal-record.ts (read this session, detectPrsForSession,
// lines ~178-206) — the KEY (loggedSetId, prType) idempotency check to replicate server-side:
const alreadyRecorded = new Set(
  (await loadSessionPersonalRecords(sessionId, db))
    .filter((record) => record.loggedSetId !== null)
    .map((record) => `${record.loggedSetId}:${record.prType}`),
);
// The server-side version cannot reuse this function directly (it is typed against PowerSync's
// WriteDb, not Drizzle/Postgres) — it must re-implement the SAME key scheme against
// apps/api/src/db/schema's personalRecord table, importing detectPrs/foldPriorBest from
// @fitness/pr-rules for the actual PR math. Per D-03, since this is server-authoritative
// reconciliation (not append-only detection), the server version is additionally allowed to
// DELETE a previously-recorded row that a fresh replay no longer confirms — the client-side
// function's own comment explicitly defers this to "Phase 10's recompute-on-history-edit
// territory."
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| PowerSync legacy `bucket_definitions` (Sync Rules) | Sync Streams (`edition: 3`, multiple queries per stream, JOINs/CTEs supported) | Already adopted in this repo (`ops/powersync/sync-rules.yaml` header comment, read this session) | This phase's two new queries append to the existing `user_data` stream — no migration decision to make, the project already made it |
| Reconciliation columns declared speculatively | `personal_record.reconciled_at`/`server_seq` finally read/written | This phase | Confirms these columns were added ahead of need in Phase 5 (`apps/api/src/db/schema/records.ts`, read this session) specifically for this phase |

**Deprecated/outdated:** None specific to this phase's stack — PowerSync Sync Streams, Drizzle 0.45.x, and `react-native-svg` 15.x are all current as of this session (2026-08-29).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Full per-exercise PR history replay (not date-scoped replay) is an acceptable recompute cost for v1 | Architecture Patterns / Alternatives Considered | If a single exercise accumulates thousands of sessions, replay cost could grow enough to threaten the push-latency budget (`PERF_BUDGET.pushSessionBatchMs`); would need date-scoped replay as a follow-up optimization |
| A2 | A dedicated `analytics_watermark` singleton table (rather than a column on `user_preference`) is the right design for the computed-through marker | Architecture Patterns / Alternatives Considered | If wrong, the planner instead threads a new server-only-written column through `user_preference`'s existing push-path branch, which is more invasive but not fundamentally blocked |
| A3 | The front/back muscle-group view split is a new mapping to author, not inferable from `MUSCLE_GROUP_BODY_REGION` | Common Pitfalls #2 | If a body_region-derived split were actually sufficient, this adds one unnecessary new constant — low risk either way, but if the split is authored inconsistently the heatmap will visibly disagree between its two views |
| A4 | No new REST endpoint is needed anywhere in this phase — every read is local-first | Anti-Patterns / Architectural Responsibility Map | If the UI-SPEC step decides drill-down or the heatmap actually needs a live server aggregate for some edge case (e.g., a freshly-signed-in second device with an empty local cache), a thin read-through endpoint might be needed as a bootstrap path — verified against this repo's existing `apps/api/src/*.controller.ts` (only health/catalog/sync exist) but not against every possible product requirement |
| A5 | `PERF_BUDGET.maxQueriesPerReconcile`-style numeric thresholds are the project's own reasoned choice, not derived from any external spec | Code Examples | Same caveat the existing `PERF_BUDGET` already carries (`[ASSUMED] per 02-RESEARCH.md Decision 8`) — a wrong number either over-constrains (blocking legitimate work) or under-constrains (missing a real regression) |

## Open Questions

1. **Exact numeric query-count/latency budgets for the recompute path**
   - What we know: The existing `PERF_BUDGET` constants (`pushSessionBatchMs: 2000`, `maxQueriesPerSessionRead: 3`, etc.) are themselves `[ASSUMED]`, the researcher's own reasoned starting point per `corpus-shape.ts`'s comment.
   - What's unclear: What a reasonable ceiling is for "recompute PRs + rollup cells for one edited session against an 18-month corpus" — this has no precedent in the repo.
   - Recommendation: Planner should propose a number (e.g., a small constant multiple of `maxQueriesPerSessionRead`), mark it `[ASSUMED]`, and treat the first real run against the seeded corpus as the calibration point, same as the existing budgets were established.

2. **Front/back muscle-group view assignment**
   - What we know: The 19 canonical muscle groups and their 6-way body-region split (`chest/back/shoulders/arms/core/legs`) are fixed (`packages/api-contracts/src/catalog.ts`).
   - What's unclear: Which muscle groups appear on the front view, the back view, or both — no existing code makes this decision.
   - Recommendation: Treat as a small, explicit design decision inside this phase's own planning (or route to discuss-phase/UI-SPEC) rather than silently inferring one from `MUSCLE_GROUP_BODY_REGION`.

3. **Static SVG path/shape source for the body silhouette itself**
   - What we know: `react-native-svg`'s `Path`/other shape primitives are already proven in this codebase (`TrendChart.tsx`), and the project's "no video assets" constraint suggests simple vector shapes are the right register, not a licensed anatomical illustration.
   - What's unclear: Whether the body map should be a simplified geometric abstraction (per-region blobs/rectangles, computed the same way `buildChartGeometry` computes chart geometry) or a small hand-authored realistic silhouette split into per-muscle-group `<Path>` regions.
   - Recommendation: Defer to UI-SPEC/discuss-phase; this is a design decision, not a technical unknown.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (local, `wal_level = logical`) | Rollup table, e2e schema-parity/perf suites | Presumed available — every prior phase's `test:e2e` already depends on it (`pnpm run db:push && nest build && jest`) | Not independently re-verified this session (no destructive DB probing performed) | — |
| `drizzle-kit push` | Landing the new schema without a hand-written migration | ✓ (already the project's established migration path) | 0.31.x | — |
| PowerSync Service (self-hosted or Cloud) | Delivering the new sync-stream queries to the client | Out of scope to re-verify this session — Phase 2's own research flagged self-hosting's MongoDB dependency as an open ops question, unrelated to this phase's schema/query work | — | Cloud PowerSync if self-hosting proves too costly (Phase 2's own fallback note) |

**Missing dependencies with no fallback:** none identified for this phase specifically.
**Missing dependencies with fallback:** PowerSync self-hosting vs. Cloud — an existing, already-tracked project-level concern (see STATE.md's Phase 2 research flag), not new to this phase.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.x, via `ts-jest`, two configs: unit (`apps/api/jest.config.js`, `testRegex: '\.spec\.ts$'`) and e2e (`apps/api/test/jest-e2e.json`, `testRegex: '.e2e-spec.ts$'`) — both read this session |
| Config file | `apps/api/jest.config.js` (unit), `apps/api/test/jest-e2e.json` (e2e) |
| Quick run command | `pnpm --filter @fitness/api test` (unit specs only, no live Postgres needed for pure-function tests) |
| Full suite command | `pnpm --filter @fitness/api test:e2e` (runs `db:push && nest build && jest --config ./test/jest-e2e.json --runInBand`, requires a live Postgres) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANLY-04 | Rollup table populated with weighted (incl. secondary muscle) volume per day, syncs down through `user_data` stream | unit + e2e | `pnpm --filter @fitness/api test -- reconciliation.spec` (new); `pnpm --filter @fitness/api test:e2e -- seeded-corpus-perf` (extended) | ❌ Wave 0 — new `reconciliation.spec.ts`; extend existing `seeded-corpus-perf.e2e-spec.ts` |
| ANLY-04 | 1-week window computed locally, 1-month/3-month read rollup + overlay | unit (mobile) | `pnpm --filter mobile test -- muscle-volume-query` (new) | ❌ Wave 0 |
| ANLY-04 | Body-map SVG renders with correct `role="img"` announcement, no in-canvas text | unit + durability (Playwright, per repo's standing E2E authorization) | `pnpm --filter mobile test -- BodyMap`; `pnpm --filter mobile test:e2e:durability` (extended) | ❌ Wave 0 — new `BodyMap.test.tsx`; `__durability.web.tsx` needs append-only registration |
| ANLY-05 | Drill-down returns exercises contributing to a muscle group's sets, local-only | unit | `pnpm --filter mobile test -- muscle-volume-query` (drill-down cases) | ❌ Wave 0 |
| ANLY-09 | Editing a past session's sets/date recomputes PRs and rollup cells, scoped and idempotent | unit + e2e | `pnpm --filter @fitness/api test -- reconciliation.spec`; `pnpm --filter @fitness/api test:e2e -- personal-record-sync` (extended, existing file) | ❌ Wave 0 for reconciliation.spec; extend existing `personal-record-sync.e2e-spec.ts` |
| ANLY-09 | Recompute query count does not grow with corpus size | e2e (query-count budget) | `pnpm --filter @fitness/api test:e2e -- seeded-corpus-perf` (extended) | Partial — harness (`countQueries`, `generateCorpus`) exists; new assertions and new `PERF_BUDGET` constants needed |

### Sampling Rate

- **Per task commit:** `pnpm --filter @fitness/api test` (unit, fast, no DB) and `pnpm --filter mobile test` for client-side additions
- **Per wave merge:** `pnpm --filter @fitness/api test:e2e` (full e2e against live Postgres, includes the extended seeded-corpus-perf budget assertions)
- **Phase gate:** Full e2e suite green, plus `pnpm --filter mobile test:e2e:durability` for the body-map's Playwright-verified accessibility contract, before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/analytics/__tests__/reconciliation.spec.ts` — covers ANLY-09's PR/rollup recompute scoping and idempotency
- [ ] `apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts` — covers ANLY-04's local/overlay/rollup read logic and ANLY-05's drill-down
- [ ] `apps/mobile/components/__tests__/BodyMap.test.tsx` — covers the pure summary-string function and shape-fill logic, mirroring `TrendChart.test.tsx`'s existing precedent (not read this session, but implied by `trendChartSummary`'s own "unit-tested on its own so the CONTENT of the announcement is proven without a renderer" comment)
- [ ] Extend `apps/api/test/seeded-corpus-perf.e2e-spec.ts` — new query-count assertions for the reconcile-on-edit path
- [ ] Extend `apps/api/test/schema-parity.e2e-spec.ts` — add `muscle_volume_rollup`/`analytics_watermark` to `REQUIRED_TABLES`, plus a `REQUIRED_COLUMNS` entry for each
- [ ] Extend `apps/api/src/seed/generate-corpus.ts` — insert `exercise_muscle_mapping` rows for the ten `seed-ex-*` exercises (Pitfall 1)
- [ ] Register the new body-map screen in `apps/mobile/app/__durability.web.tsx` (append-only, per this project's established convention for every e2e-bearing plan)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (unchanged) | Existing Better Auth session cookie, unchanged by this phase |
| V3 Session Management | No (unchanged) | — |
| V4 Access Control | Yes | Every rollup/watermark row must be scoped by `user_id` at write time (server derives `userId` from `session.user.id` inside `SyncService.applyBatch`, never from client-supplied data — the same pattern `SyncController.push` already enforces, read this session) and at sync time (`WHERE user_id = auth.user_id()` in the new sync-rules.yaml queries) |
| V5 Input Validation | Yes | The window selector (1 week / 1 month / 3 months) is a closed enum on the client — validate it against a fixed union type, never a free-form string, mirroring `PR_TYPES`/`SET_TYPES`'s tuple-plus-CHECK-constraint pattern already used throughout `apps/api/src/db/schema/*.ts` |
| V6 Cryptography | No | No new crypto surface — the rollup's deterministic `id` (`${userId}:${muscleGroupId}:${localDate}`) is an internal key derivation, not a security boundary, and contains no secret material |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Cross-user rollup read (a client crafts a request implying another user's data) | Information Disclosure | Not reachable via REST at all in this design (no new endpoint) — the only exposure surface is the PowerSync sync stream, which already scopes every query by `auth.user_id()` server-side (the client cannot forge this parameter, it is resolved from the sync token, per `mintSyncToken(session.user.id)` in `apps/api/src/sync/sync.controller.ts`, read this session) |
| Recompute triggered by a forged `sessionId` not owned by the calling user | Tampering / Elevation of Privilege | Reconciliation must run strictly inside the same aggregate-root ownership check `applyBatch` already performs before any op in the aggregate is applied (`owner !== userId` → rejected `not_owner`, read this session) — never a second, independently-trusted lookup |
| Denial of service via a pathologically large edit batch forcing an expensive full-history replay | Denial of Service | `SYNC_MAX_BATCH_OPS` already caps batch size (`packages/api-contracts/src/sync.ts:2`); the per-exercise replay cost is bounded by that exercise's own history size, not the batch size — still worth confirming during implementation that the replay itself has no unbounded loop over unrelated data |

## Sources

### Primary (HIGH confidence — read directly this session)

- `apps/api/src/sync/sync.service.ts` — aggregate-root transaction structure, `TABLE_MAP`/`SINGLETON_ROOT_TYPES`/`AGGREGATE_ROOT_TYPES`, existing upsert idioms, ownership resolution
- `apps/api/src/sync/patch-update-set.ts` — `WORKOUT_SESSION_PATCH_FIELDS` confirms `local_date` is client-patchable
- `apps/api/src/db/schema/records.ts`, `catalog.ts`, `session.ts` — `personal_record.reconciled_at`/`server_seq`, `exercise_muscle_mapping.weight_factor`, `workout_session.local_date`
- `apps/mobile/lib/db/personal-record.ts` — `detectPrsForSession`'s idempotency discipline (client-only today)
- `packages/pr-rules/src/personal-records.ts`, `estimated-1rm.ts`, `index.ts` — pure PR rule functions
- `packages/analytics-engine/src/weekly-progress.ts`, `exercise-series.ts`, `index.ts` — existing pure aggregation precedent and predicate-collapse warning
- `packages/api-contracts/src/catalog.ts` — `MUSCLE_GROUPS` (19-member list), `MUSCLE_GROUP_BODY_REGION` (6-region, not front/back)
- `packages/api-contracts/src/session.ts` — `countsTowardWorkingVolume`/`countsTowardRecords` predicates
- `packages/api-contracts/src/sync.ts` — `SYNCED_TABLES` tuple, confirming `body_metric`/`progress_photo` are pull-registered without push-path wiring
- `ops/powersync/sync-rules.yaml` — existing `user_data` stream, 15 queries, header comment on the "row leaves result set → deleted locally" trap
- `apps/mobile/lib/db/powersync.ts`, `schema.ts` — `AppSchema`/`drizzleSchema` composition, `localOnlyCatalogTables` pattern
- `apps/api/test/seeded-corpus-perf.e2e-spec.ts` — `countQueries` harness, `generateCorpus`/`pushSetsDirectly` fixtures
- `apps/api/src/seed/generate-corpus.ts`, `corpus-shape.ts` — 18-month/4-per-week/15-per-session corpus shape, `ensureExerciseCatalog`'s missing muscle-mapping gap
- `apps/api/test/schema-parity.e2e-spec.ts` — `REQUIRED_TABLES`/`REQUIRED_COLUMNS` pattern this phase must extend
- `apps/api/drizzle.config.ts`, `apps/api/package.json` — `drizzle-kit push` migration model, current dependency/devDependency split
- `apps/mobile/components/TrendChart.tsx` — SVG accessibility contract (`accessibilityRole="image"`, `HIDDEN_FROM_ASSISTIVE_TECH`, no in-canvas text rule)
- `apps/mobile/app/__durability.web.tsx` — durability harness registers whole screens, not individual components
- `.planning/config.json` — `workflow.nyquist_validation: true`, `security_enforcement: true`, `security_asvs_level: 1`

### Secondary (MEDIUM confidence)

- Context7 (`/powersync-ja/powersync-docs`) — confirmed current Sync Streams syntax (`auth.user_id()`, multiple queries per stream) matches this repo's existing `sync-rules.yaml` usage; did not find independent doc confirmation of the "row leaving result set is deleted locally" behavior (relying on the repo's own header comment for that specific claim, which is itself the product of an earlier phase's own research/testing)
- `npm view drizzle-orm version` / `npm view react-native-svg version` — registry-current versions, cross-checked against `package.json` pins

### Tertiary (LOW confidence)

- None used as a basis for any prescriptive recommendation in this document — every claim above is either read from this repo directly or cross-checked against Context7/npm.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already installed and versioned in this repo; no new external dependency decisions were made
- Architecture: HIGH for wiring/integration points (all read from source), MEDIUM for the recompute algorithm's exact cost/complexity tradeoff (reasoned from precedent, not benchmarked)
- Pitfalls: HIGH for Pitfalls 1, 3, 4 (each grounded in a specific file read this session); MEDIUM for Pitfall 2 (a design gap correctly identified, but its resolution is a product decision, not a technical fact)

**Research date:** 2026-08-29
**Valid until:** 30 days (stable, already-installed stack; the front/back muscle-view design gap should be resolved before this expires, not left open across a re-research cycle)
