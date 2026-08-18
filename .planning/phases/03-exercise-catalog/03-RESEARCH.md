# Phase 3: Exercise Catalog - Research

**Researched:** 2026-08-18
**Domain:** Offline-first exercise catalog (data seeding, local delivery, search/filter UI, custom-exercise sync) on top of an already-shipped Postgres/Drizzle/NestJS backend and PowerSync/Expo Router client
**Confidence:** MEDIUM-HIGH — the delivery-mechanism and sync-extension findings below are verified directly against this repo's code and the PowerSync SDK's own docs (HIGH); the seed-dataset licensing finding corrects an earlier research artifact and is verified directly against the live GitHub repo (HIGH); UI/list/search library choices are current-registry-verified but not yet spiked in this codebase (MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (carried forward from Phase 1/2, not re-litigated)

- **D-01:** `SyncModule` is the sole ingress for per-user, offline-mutable data; the seeded catalog is explicitly not that. Phase 2's carve-out reserves ordinary REST endpoints for auth, media upload URL issuance, and first-install catalog download. `ops/powersync/sync-rules.yaml` already encodes this split — the only exercise query in the user stream is `SELECT * FROM exercise WHERE user_id = auth.user_id()`; the seeded taxonomy tables are deliberately absent from every query in that file. **Reversibility: one-way.**
- **D-02:** Every user-authored row carries a client-generated UUID issued before any network round-trip. `apps/mobile/lib/db/id.ts` already exists for this. **Reversibility: one-way.**
- **D-03:** A variation is a full `Exercise` row, never a separate table. `variation_of_id` is a nullable self-FK used only for UI grouping/analytics roll-ups. **Reversibility: costly.**
- **D-04:** `weight_factor` on `ExerciseMuscleMapping` is data, not a hardcoded 1.0/0.5 in code. Seeding must populate real per-exercise values. **Reversibility: costly.**
- **D-05:** Exercise deletion is archive-only; a row with logged history is never hard-deleted. `archived_at` already exists on the table. `personal_record.exercise_id` and `session_exercise.exercise_id` are both `notNull`. **Reversibility: one-way.**
- **D-06:** PowerSync is the sync engine (`@powersync/react-native` 2.1.x, `@powersync/web` 2.2.x). Any catalog delivery mechanism must coexist with it in the same local SQLite database without fighting PowerSync's ownership of the schema. **Reversibility: one-way.**
- **D-07:** NativeWind 4 + `apps/mobile/lib/theme.ts`/`theme-colors.ts` is the styling foundation; Phase 1's five-tab Expo Router scaffold is what feature screens fill in. This phase does not restructure navigation. **Reversibility: reversible.**
- **D-08:** Weights are stored canonically in kg as decimal, converted only at the display boundary. Any load or bodyweight-contribution figure this phase introduces obeys it. `packages/api-contracts/src/units.ts` owns the conversion. **Reversibility: one-way.**

### Claude's Discretion (delegated by the user — "decide by yourself")

All items below were explicitly delegated to research/planning by the user in `/gsd-discuss-phase`. Each is resolved with a concrete recommendation in this document, grounded in what the shipped code actually supports today (see `## Architecture Patterns` and `## Common Pitfalls`):

1. **Catalog delivery to the device, offline-true from first boot.** Resolved below — bundled JSON snapshot + PowerSync `localOnly` tables + a background-refresh REST endpoint.
2. **Per-user state on globally-shared (`user_id IS NULL`) rows — EXER-06/EXER-07.** Resolved below — a new `user_exercise_preference` table is not just the cleanest option, it is the *only* one the shipped `SyncService` ownership model can actually execute (see Pitfall/Architecture-Pattern write-ups).
3. **The `load_type` taxonomy.** Resolved below — a single flat enum of six values, defined once in `packages/api-contracts`, enforced with the same hand-rolled `Set<string>` pattern `sync.service.ts` already uses for `set_type`/`status`, plus a Postgres `CHECK` constraint as defense-in-depth.
4. **Bodyweight contribution (EXER-09).** Resolved below — a per-exercise nullable decimal column, `body_metric` join deferred to read-time in Phase 5, data model only in this phase.
5. **Seed dataset choice and its licensing commitment.** Resolved below, **correcting** `STACK.md`'s claim — see `## Package Legitimacy Audit`-equivalent findings and `## State of the Art`.
6. **Images (EXER-03).** Discussed in `## Common Pitfalls` / `## Open Questions` — no single verified-safe default; flagged for a locked decision at plan time, not resolved unilaterally here given the licensing uncertainty just found.
7. **Smart swap (EXER-10).** Resolved below — a deterministic, client-side scoring function over `exercise_muscle_mapping` + `equipment_required` + `movement_pattern`, explicitly excluding never-suggested/archived rows.
8. **Search and filter mechanics for ~900 rows on two platforms.** Resolved below — client-side in-memory fuzzy index (MiniSearch), not SQLite FTS5 or `LIKE`.
9. **Custom exercise scope and duplicate-from-seed.** Resolved below — duplicating a seeded exercise is supported; the copy is a normal `is_custom=true`, `user_id`-owned row with its own `exercise_muscle_mapping` rows copied alongside it.

### Deferred Ideas (OUT OF SCOPE for this phase)

- Duplicate-merging tool that rewrites `session_exercise`/`personal_record` references — needs logged history, which doesn't exist until Phase 5.
- Recompute-on-edit invalidation for PRs/volume aggregates — Phases 9–10.
- Never-suggest feeding Phase 6's auto-generator — this phase stores the flag; Phase 6 consumes it.
- Machine-availability-gated suggestions — Phase 7 (gym profiles).
- Stability/range-of-motion rankings, joint actions — not in EXER-03's requirement text or the schema; explicitly not built.
- Program/workout sharing — unrelated to the catalog.
- Offline/sync status indicator, native deep links — carried forward unresolved from Phases 1/2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXER-01 | Search exercise library by name | MiniSearch in-memory index over the ~900-row catalog + `aliases[]`; see `## Standard Stack` and `## Don't Hand-Roll` |
| EXER-02 | Filter by muscle group, equipment, movement pattern | Local SQL/array filter over the same in-memory or PowerSync-local dataset; AND across dimensions, OR within one (see `## Architecture Patterns`) |
| EXER-03 | View exercise detail: target muscles, equipment, setup, cues, static images | Delivery mechanism (`## Architecture Patterns` §1) puts muscle data on-device; image hosting strategy flagged open (`## Open Questions`) |
| EXER-04 | Create custom exercise (name, target muscles, equipment, tracking type) | Flows through `SyncModule`/`SyncService`, not a new REST DTO — see `## Architecture Patterns` §2 and `## Common Pitfalls` Pitfall 2 |
| EXER-05 | Edit or duplicate a custom exercise; duplicate-from-seed | Same sync path; duplicate-from-seed detailed in `## Architecture Patterns` §2 |
| EXER-06 | Archive an exercise; past logged sets stay intact/attributed | `user_exercise_preference` table — see `## Architecture Patterns` §3 (structural, not stylistic, finding) |
| EXER-07 | Mark never-suggest without deleting | Same `user_exercise_preference` table, same finding |
| EXER-08 | Log against any load type (weight/bodyweight/bodyweight+added/assisted/time/distance) | `load_type` enum — see `## Architecture Patterns` §4 |
| EXER-09 | Bodyweight contribution stays meaningful as bodyweight changes | `bodyweight_contribution_pct` column + `body_metric` join deferred to Phase 5 read-time — see `## Architecture Patterns` §5 |
| EXER-10 | Suggested alternatives (smart swap) | Deterministic client-side scorer — see `## Architecture Patterns` §6 |
</phase_requirements>

## Summary

This phase's hard problems are not framework problems — Expo/NativeWind/PowerSync/Drizzle are all already chosen and wired. The hard problems are (1) getting ~900 rows of muscle/equipment/load-type metadata onto a device that has *never* had signal, without breaking the sync architecture Phase 2 just built and tested, and (2) four genuine schema gaps (`muscle_group`/`exercise_muscle_mapping` missing from the mobile SQLite schema, no `never_suggest` column anywhere, `load_type` with no defined vocabulary, no bodyweight-contribution column) that must be closed correctly because every one of them is a one-way door once ~900 seeded rows and any custom exercises exist against it.

The single most load-bearing finding in this research is code-verified, not assumed: **`packages/api-contracts/src/sync.ts` already lists `'exercise'` in `PUSH_DEFERRED_TABLES` with the comment `// Phase 3 — Exercise Catalog`, and `apps/api/src/sync/sync.service.ts`'s `TABLE_MAP` does not yet handle it.** Phase 2 deliberately left a stub for this phase to fill. Custom-exercise create/edit/duplicate (EXER-04/05) is **not** a new REST controller — it is an extension to the existing sync push pipeline, and that pipeline's `applyBatch` ownership/aggregate-root logic is currently built entirely around `workout_session` as the root type. `exercise` needs to become a second, simpler root type (a singleton aggregate — it has no synced children).

The second load-bearing finding, also code-verified: `SyncService.applyBatch`'s ownership check (`owner !== userId` → reject `not_owner`) will **structurally reject** any client attempt to `PATCH` a seeded exercise row, because seeded rows have `user_id = NULL` and the ownership resolver has no path that treats a null-owner row as writable by an arbitrary authenticated user. This settles the EXER-06/EXER-07 discretion item on its own: per-user archive/never-suggest on shared rows cannot be bolted onto `exercise.archived_at` through the existing sync path — it needs a new, user-owned table.

The third finding corrects an earlier research artifact: `STACK.md` claimed free-exercise-db's README "warns only exercises with a 'relatively free' license were included and that per-exercise license terms must still be honored." A direct fetch of the current README (2026-08-18, all 164 lines grepped for `licen|copyright|attribut`) shows only a top-of-file `License: Unlicense` badge and no per-exercise caveat anywhere in the document. This may be a stale reading of an older README, or a conflation with a different fork — either way, the planner should not carry the stricter claim forward without a five-minute human confirmation, given CONTEXT.md flags this as a one-way licensing commitment.

**Primary recommendation:** deliver the catalog as a versioned JSON snapshot bundled into the app (offline-true from first boot), loaded into two new PowerSync `localOnly: true` tables (`muscle_group`, `exercise_muscle_mapping`) on first run; extend `sync.service.ts` to treat `exercise` as a second singleton-aggregate root type so custom-exercise CRUD flows through the existing sync push endpoint exactly like every other synced entity; add a new `user_exercise_preference` table for archive/never-suggest on shared rows; and search/filter client-side with MiniSearch over the in-memory catalog rather than SQLite FTS5 or `LIKE`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Seeded catalog storage (source of truth) | Database / Storage (Postgres) | — | `apps/api/src/db/schema/catalog.ts` already models this; this phase populates it |
| Seeded catalog delivery to device | API / Backend (bundled asset build step + REST download endpoint) | Client (bundled JSON asset) | D-01's explicit REST carve-out; bundling happens at build time, not runtime |
| Seeded catalog local storage/query | Browser / Client (local SQLite via PowerSync `localOnly` tables) | — | Search/filter/detail must work with zero network (PROJECT.md core value) |
| Custom exercise create/edit/duplicate | API / Backend (`SyncModule`/`SyncService`) | Client (local SQLite write, same as any synced entity) | D-01 — no second write path; must flow through the same `POST /sync/push` every other offline-mutable entity uses |
| Per-user archive / never-suggest | API / Backend (`SyncModule`, new `user_exercise_preference` table) | Client (local SQLite, synced) | Ownership model requires a `user_id`-owned row; the shared `exercise` row structurally cannot carry it (see Summary) |
| Search / filter / smart-swap scoring | Client (in-memory, local SQLite reads) | — | Must work at zero network; dataset (~900 rows) is small enough to hold and index entirely client-side |
| `load_type` vocabulary (schema contract) | API / Backend (Postgres `CHECK` + `packages/api-contracts` enum) | Client (SQLite mirror, same enum imported) | Single source of truth in the shared contracts package, per the project's existing additive-only-contract discipline |
| Bodyweight-contribution figure at read time | Client (join against local `body_metric`) | — | Deferred to Phase 5 per ROADMAP criterion 4 ("before any logging UI exists") — this phase only stores the per-exercise fraction |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `minisearch` | `7.2.0` [VERIFIED: npm registry, `npm view minisearch version` run this session] | Client-side fuzzy/prefix search over the in-memory exercise catalog (EXER-01) | Full offline fuzzy+prefix search, ~5.9kB gzip [CITED: devpick.co/fuse.js-vs-minisearch, MEDIUM confidence — secondary aggregator, not the library's own docs], zero native dependency so it behaves identically on RN and RN-Web — avoids Pitfall 5 (platform divergence) entirely by never touching a platform-specific search primitive |
| `@shopify/flash-list` | `2.3.2` [VERIFIED: npm registry, `npm view @shopify/flash-list version` run this session] | Virtualized rendering of the ~900-row exercise list on both platforms | v2 is JS-only (no native module), New-Architecture-only [CITED: WebSearch of shopify.github.io/flash-list, MEDIUM confidence], and works on React Native Web "out of the box with no additional configuration needed" [CITED: WebSearch summary of shopify-flash-list docs, MEDIUM confidence] — a genuine fit since Expo SDK 57 already mandates the New Architecture (STACK.md, verified prior phase), so there is no legacy-arch fallback concern to design around |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@powersync/drizzle-driver` | `0.8.0` [VERIFIED: apps/mobile/package.json:22, already installed] | Defines `muscle_group`/`exercise_muscle_mapping` as `localOnly: true` PowerSync tables | Confirmed via Context7 (`/powersync-ja/powersync-js`, `packages/drizzle-driver/README.md`) [CITED: PowerSync JS SDK docs] that `DrizzleAppSchema` accepts a per-table `{ tableDefinition, options: { localOnly: true } }` wrapper — this is the mechanism, not a new dependency |
| No new NestJS validation library | — | Custom-exercise field validation on write | Continue the codebase's existing hand-rolled `Set<string>`-based validator pattern (`SESSION_STATUSES`, `SET_TYPES` in `apps/api/src/sync/sync.service.ts:49-50`) for `load_type`/`archived_at`/etc rather than introducing `class-validator` — the write path is `SyncService.hasInvalidField`, not a REST DTO, so a decorator-based validator has no attachment point |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MiniSearch (in-memory) | SQLite FTS5 (native, via `expo-sqlite`'s compile flags) | FTS5 is enabled by default on iOS via Podfile compile flags [CITED: Context7 `/expo/expo`, `expo-sqlite.podspec`], but its availability on web depends on the pre-compiled wa-sqlite WASM binary and "is not controlled by expo-sqlite" [CITED: same source] — a real, unverified platform-divergence risk (Pitfall 5) for a dataset small enough that the in-memory alternative has no real downside |
| MiniSearch | Fuse.js `7.5.0` [VERIFIED: npm registry] | Fuse.js has a larger bundle and is slower on large datasets but offers more configurable typo tolerance [CITED: WebSearch aggregator comparison, MEDIUM confidence] — reasonable if EXER-01's typo-tolerance bar turns out to need more than MiniSearch's prefix+fuzzy defaults |
| `@shopify/flash-list` v2 | Plain RN `FlatList` / `SectionList` | Works everywhere with zero extra dependency, but virtualization performance on a ~900-row list with filter/search re-renders is the exact case FlashList exists for; `FlatList` is the fallback if FlashList's New-Architecture-only requirement proves incompatible with something else in the stack during a spike |
| New `user_exercise_preference` table | Copy-on-write forking a user-owned `exercise` row on archive | Rejected in CONTEXT.md's own reasoning (forking breaks the shared `exercise_id` that `personal_record`/`session_exercise` point at) — confirmed independently here: `personal_record.exerciseId` and `session_exercise.exerciseId` are both `.notNull().references(() => exercise.id)` [VERIFIED: apps/api/src/db/schema/records.ts:14-16 "exerciseId: text('exercise_id') .notNull() .references(() => exercise.id),"; apps/api/src/db/schema/session.ts:58-60 "exerciseId: text('exercise_id') .notNull() .references(() => exercise.id),"] |

**Installation:**
```bash
# Client (Expo app)
npx expo install @shopify/flash-list
npm install minisearch --workspace=mobile   # or pnpm --filter mobile add minisearch

# Backend: no new packages — extends existing apps/api/src/sync/* and apps/api/src/db/schema/catalog.ts
```

**Version verification:** all four package versions above (`minisearch`, `@shopify/flash-list`, `fuse.js`, `@powersync/drizzle-driver`) were confirmed via `npm view <pkg> version` run directly in this session on 2026-08-18. `@powersync/drizzle-driver` is already an installed dependency (`apps/mobile/package.json:22`), not a new install.

## Package Legitimacy Audit

Two new client packages are recommended (`minisearch`, `@shopify/flash-list`). Both are widely-used, long-lived, non-obscure packages discovered via WebSearch/training data (not an authoritative doc), so per the package-name provenance rule they are tagged `[ASSUMED]` on name/identity even though registry existence was independently confirmed.

| Package | Registry | Age/signal | Verdict | Disposition |
|---------|----------|-------------|---------|-------------|
| `minisearch` | npm, `v7.2.0` confirmed live | Long-running project (predates 2026), GitHub repo `lucaong/minisearch`, widely depended-upon per npm-compare aggregator results | [ASSUMED] name/version, registry-confirmed | Approved — low risk, install directly |
| `@shopify/flash-list` | npm, `v2.3.2` confirmed live | Shopify-maintained, official Expo SDK documentation page exists (`docs.expo.dev/versions/latest/sdk/flash-list/`) [CITED] | [ASSUMED] name/version, registry-confirmed, corroborated by official Expo docs listing it | Approved — install directly |

Neither package returned a `SLOP` or `SUS` signal in the WebSearch/registry cross-check performed this session (no automated `gsd-tools query package-legitimacy check` provider was available in this environment; verification was done via direct `npm view` + corroborating official-docs citation instead, per the fallback the protocol allows when the primary tool is unavailable). **Recommendation for the planner:** run `npm view minisearch` and `npm view @shopify/flash-list` again immediately before the install task executes, since this research is a point-in-time snapshot.

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious [SUS]:** none — but see the seed-dataset licensing correction below, which is a genuine open risk of a different kind (licensing, not supply-chain).

## Architecture Patterns

### System Architecture Diagram

```
┌─── Build time ────────────────────────────────────────────────────────────┐
│  Normalization script (Node, apps/api/src/seed/)                          │
│  free-exercise-db JSON  ──┐                                               │
│  wger API (supplemental) ─┼─► normalize → muscle taxonomy map →           │
│                            │   load_type classify → weight_factor assign  │
│                            │   → dedupe → committed generated artifact    │
│                            └─► seed-catalog.ts writes to Postgres          │
│                                (muscle_group, exercise, exercise_muscle_mapping)
│                                                                             │
│  Same normalized artifact ──► bundled JSON asset in apps/mobile           │
│                                (versioned: catalog_version)                │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
┌─── First app launch (zero network) ───────────────────────────────────────┐
│  App boot                                                                  │
│    → getPowerSync() creates local SQLite (fitness.db)                    │
│    → bundled JSON asset loaded once                                      │
│    → INSERT into muscle_group / exercise_muscle_mapping                  │
│      (PowerSync localOnly:true tables — no ps_crud entry, never synced)  │
│    → INSERT into exercise (normal synced table, is_custom=false rows)    │
│  Catalog is now fully queryable offline: search, filter, detail screen   │
└──────────────────────────────────────────────────────────────────────────┘
                                    │  (later, when signal exists)
┌─── Background refresh (when connectivity exists) ─────────────────────────┐
│  GET /v1/catalog/version  →  compare to locally-stored catalog_version   │
│  if newer: GET /v1/catalog/download → upsert into the same three tables  │
│  (REST, not SyncModule — D-01's explicit "first-install catalog          │
│   download" carve-out; a non-mutating-per-user, non-offline-critical     │
│   read path)                                                              │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
┌─── Custom exercise create/edit/duplicate (EXER-04/05) ─────────────────────┐
│  UI write → local SQLite `exercise` row (is_custom=true, user_id set)    │
│    → PowerSync ps_crud queue (normal synced table — NOT localOnly)       │
│    → SyncConnector.uploadData() → POST /v1/sync/push (existing, generic) │
│    → SyncService.applyBatch(): 'exercise' now a MappedTable, treated as  │
│      its own aggregate root (singleton — no synced children)             │
│    → ownership check against exercise.userId (never against a           │
│      workout_session chain, unlike every currently-mapped table)         │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
┌─── Archive / never-suggest on ANY exercise (EXER-06/07) ───────────────────┐
│  UI write → local SQLite `user_exercise_preference` row (user_id +       │
│    exercise_id + archived_at + never_suggest)                            │
│    → syncs through SyncModule exactly like any other per-user table      │
│    → pickers / smart-swap read: LEFT JOIN exercise ⋈ user_exercise_pref  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
apps/api/src/
├── catalog/                        # NEW — ExerciseCatalogModule
│   ├── catalog.module.ts
│   ├── catalog.controller.ts       # GET /v1/catalog/version, GET /v1/catalog/download — read-only, D-01 carve-out
│   └── catalog.service.ts
├── db/schema/catalog.ts            # extended: load_type CHECK constraint, bodyweight_contribution_pct,
│                                    # + new user_exercise_preference table
├── seed/
│   ├── generate-corpus.ts          # existing — workout-history fixture generator, unrelated
│   ├── normalize-catalog.ts        # NEW — free-exercise-db + wger → committed normalized JSON
│   └── seed-catalog.ts             # NEW — writes normalized JSON into Postgres
├── sync/
│   ├── sync.service.ts             # EXTENDED — 'exercise' becomes a MappedTable + its own root type
│   ├── conflict-policy.ts          # unchanged — default overwrite branch already covers 'exercise'
│   └── patch-update-set.ts         # EXTENDED — EXERCISE_PATCH_FIELDS map added

apps/mobile/
├── lib/db/
│   ├── schema.ts                   # EXTENDED — muscleGroup, exerciseMuscleMapping, userExercisePreference tables
│   └── powersync.ts                # EXTENDED — DrizzleAppSchema wraps the two catalog tables with { localOnly: true }
├── lib/catalog/
│   ├── search-index.ts             # NEW — MiniSearch instance built once from local SQLite read
│   └── smart-swap.ts               # NEW — deterministic scoring function
├── app/(tabs)/exercises.tsx        # NEW screen — or wherever the tab is named; fills a Phase-1 placeholder
└── app/exercise/[id].tsx           # NEW — detail screen (Expo Router dynamic route)

packages/api-contracts/src/
└── catalog.ts                      # NEW — LOAD_TYPES enum, MUSCLE_GROUPS list, movement_pattern list,
                                     # shared between client validation and server CHECK/hasInvalidField
```

### Pattern 1: PowerSync `localOnly` tables for the seeded taxonomy

**What:** Define `muscle_group` and `exercise_muscle_mapping` as Drizzle tables wrapped with `{ options: { localOnly: true } }` when constructing `DrizzleAppSchema`, so they live in the same local SQLite file PowerSync manages but generate no `ps_crud` entries and are never pushed or pulled.
**When to use:** Any local table that is bulk-populated by the app itself (not by the sync protocol) and must coexist with PowerSync-synced tables in one database.
**Example:**
```typescript
// Source: Context7 /powersync-ja/powersync-js, packages/drizzle-driver/README.md
import { DrizzleAppSchema } from '@powersync/drizzle-driver';

const muscleGroupWithOptions = { tableDefinition: muscleGroup, options: { localOnly: true } };
const exerciseMuscleMappingWithOptions = { tableDefinition: exerciseMuscleMapping, options: { localOnly: true } };

export const AppSchema = new DrizzleAppSchema({
  ...drizzleSchema,               // existing synced tables, unchanged
  muscleGroup: muscleGroupWithOptions,
  exerciseMuscleMapping: exerciseMuscleMappingWithOptions,
});
```
This directly resolves the "delivery mechanism" discretion item: it is a fourth option CONTEXT.md's own enumeration (a/b/c) did not name, and it structurally satisfies both halves of the tension CONTEXT.md identified — no cold-start network dependency (the tables are populated from a bundled asset on first boot, before any PowerSync connection is even required) and no contradiction of the `sync-rules.yaml` comment (a `localOnly` table generates zero `ps_crud` entries, so it never touches the sync protocol at all — it is not merely "excluded from the user stream," it is invisible to sync mechanics entirely, which is a stronger and cleaner satisfaction of D-01's intent than the literal REST-download carve-out alone would give).

**Verification needed before planning commits to this fully:** this exact combination (`DrizzleAppSchema` with mixed plain and `localOnly`-wrapped table entries, read through `wrapPowerSyncWithDrizzle`) has not been exercised anywhere in this codebase yet. The Context7 example shows the wrapping mechanism but not a mixed-schema object confirmed to work end-to-end with the Drizzle query wrapper. Recommend the first plan/task in this phase be a small spike that inserts a few rows into a `localOnly` table and reads them back through the same `db` the app already uses, before building the full seeding pipeline on top of the assumption.

### Pattern 2: `exercise` as a second, singleton-root aggregate in `SyncService`

**What:** `apps/api/src/sync/sync.service.ts`'s `applyBatch` currently resolves every op's aggregate root by walking a `workout_session → session_exercise → logged_set` parent chain (`rootByOpId`, `AGGREGATE_RANK`), and its one existing root type (`workout_session`) is looked up by ID directly (`rootByOpId.set(op.op_id, op.id)`). `exercise` has no synced children — `session_exercise.exercise_id` is a foreign key reference for reads, not a sync-parent relationship — so an `exercise` op is always a singleton aggregate of exactly one op.
**When to use:** This phase's extension to `sync.service.ts`.
**Concrete changes required** [VERIFIED: apps/api/src/sync/sync.service.ts, full file read this session]:
- `TABLE_MAP` (line 23-27): add `exercise: exercise` (import from `../db/schema`).
- `AGGREGATE_RANK` (line 43-47): add an entry, or (cleaner) route `exercise` ops through a parallel, simpler code path that never enters the `workout_session`-rooted aggregate machinery at all, since it has no children to order against siblings.
- Root/ownership resolution (lines 349-420): `exercise` needs `rootByOpId.set(op.op_id, op.id)` (self-root, matching `workout_session`'s pattern) **and** a separate ownership lookup — the existing `existingRoots` query (lines 389-394) selects specifically from `workoutSession`, so `exercise` ownership must be resolved against `exercise.userId` in its own query, not folded into that one.
- **The nullable-owner case is the crux:** for a seeded row (`exercise.userId === null`), any incoming `PUT`/`PATCH` naming that `id` must be rejected as `not_owner` (a user cannot silently take ownership of a shared row by pushing to it) — do not special-case this to "adopt" the row for the pushing user, which is a data-integrity trap.
- `hasInvalidField` (line 196-225): add an `exercise` branch validating `load_type` against the new enum (same `Set<string>` pattern as `SESSION_STATUSES`/`SET_TYPES`, line 49-50), `is_custom`/`user_id` consistency (a `user_id`-less `PUT` for a `is_custom:true` row is invalid), and `archived_at` (reject direct archive on `exercise` in favor of `user_exercise_preference` — see Pattern 3).
- `patch-update-set.ts`: add `ExerciseValues` + `EXERCISE_PATCH_FIELDS`, following the existing `PatchFieldMap<V>` exhaustiveness-gate pattern exactly (`apps/api/src/sync/patch-update-set.ts:56`, "a mapped type over keyof V ... adding a column ... without classifying it ... is a compile error").
- `conflict-policy.ts`: **no change needed** — `resolveConflict` already defaults to plain `overwrite`, `logConflict: false` for any table not in `CONFLICT_LOGGED_TABLES` (line 76-78), which is the correct behavior for `exercise` (no field-level conflict logging needed for v1, matching CONTEXT.md's "keep it proportionate" framing elsewhere).
- `packages/api-contracts/src/sync.ts`: move `'exercise'` from `PUSH_DEFERRED_TABLES` (line 41) to `PUSH_APPLIED_TABLES` (line 27) — this is a one-line move the comment on line 32-36 explicitly anticipates.
- **No mobile-side change required.** `apps/mobile/lib/db/connector.ts`'s `uploadData()` is fully generic over `transaction.crud` — it uploads whatever PowerSync's crud queue contains for any non-`localOnly` table, with no table-specific logic. Confirmed by direct read of the full file this session.

### Pattern 3: `user_exercise_preference` for archive/never-suggest on shared rows

**What:** A new synced table, `user_exercise_preference(user_id, exercise_id, archived_at, never_suggest, updated_at)`, primary-keyed on `(user_id, exercise_id)`, that carries per-user state against *any* exercise (seeded or custom) without mutating the shared row.
**When to use:** EXER-06 (archive) and EXER-07 (never-suggest).
**Why this is not a stylistic choice:** see Summary — `SyncService.applyBatch`'s ownership resolver rejects any `PATCH` targeting a row whose stored `userId` doesn't equal the pushing user's id, and a seeded exercise's `userId` is `NULL` [VERIFIED: apps/api/src/db/schema/catalog.ts:29, "userId: text('user_id').references(() => user.id, { onDelete: 'cascade' })," — nullable, no `.notNull()`]. There is no code path today (and none should be added) that treats `null !== userId` as "ownable." A new user-owned table sidesteps the problem entirely instead of special-casing the ownership resolver for one table.
**Consequences for pickers/smart-swap:** every exercise-list query becomes a `LEFT JOIN exercise ⋈ user_exercise_preference ON (exercise.id = uep.exercise_id AND uep.user_id = :current_user)`, filtering out rows where `uep.archived_at IS NOT NULL`. Custom exercises (which *do* have a real `exercise.userId`) can additionally use `exercise.archived_at` directly if the planner prefers symmetry, but the simplest correct rule is: **all archive/never-suggest state, for every exercise regardless of origin, lives in `user_exercise_preference`.** This keeps exactly one code path for the picker filter instead of two (seeded vs. custom), which matters because `PITFALLS.md` §11 is explicit that archive logic bugs are a top corruption risk.
**Sync-rules.yaml addition needed:** `SELECT * FROM user_exercise_preference WHERE user_id = auth.user_id()`, following the exact shape every other per-user query in that file already uses.

### Pattern 4: `load_type` — flat six-value enum, dual-enforced

**What:** A single flat enum, not a two-axis scheme. Values (from EXER-08's own six named cases): `external_weight | bodyweight | bodyweight_plus_added | assisted | time_based | distance_based`.
**Rationale for flat over two-axis:** CONTEXT.md itself raises the two-axis option ("what provides resistance × what the user actually enters") but also flags the ambiguity it creates (a weighted carry is "arguably both loaded and distance-measured"). A flat enum forces exactly one classification per exercise, which is what a `notNull` discriminator column needs to stay useful downstream (Phase 5's logging UI switches on this value directly, per `PITFALLS.md` §9) — an orthogonal two-axis model pushes the ambiguity into Phase 5's UI logic instead of resolving it here, which is the wrong direction given ROADMAP criterion 4 explicitly wants this *settled* before any logging UI exists. If a genuinely dual case surfaces during normalization (the carry example), classify it by the field that actually varies session-to-session and drives progression math — for a farmer's carry that's the load, so `external_weight`, with distance/time captured as instruction/cue text, not as the discriminator.
**Enforcement — two layers, matching the project's existing defense-in-depth style:**
1. **Postgres `CHECK` constraint**, via Drizzle's `check()` helper [CITED: Context7 `/drizzle-team/drizzle-orm-docs`, `pg/indexes-constraints.mdx`]:
   ```typescript
   import { check } from 'drizzle-orm/pg-core';
   // in the exercise table's third-argument callback:
   check('exercise_load_type_check', sql`${table.loadType} IN ('external_weight','bodyweight','bodyweight_plus_added','assisted','time_based','distance_based')`)
   ```
2. **Application-level `Set<string>` validator** in `sync.service.ts`'s `hasInvalidField`, identical in shape to the existing `SET_TYPES`/`SESSION_STATUSES` sets — this is what actually produces the client-facing `invalid_field` rejection reason (the DB constraint is a last-resort safety net, not the primary UX).
3. **Single source of truth for the value list** in `packages/api-contracts/src/catalog.ts` (new file), imported by both the server validator and any client-side form (custom exercise create screen's "tracking type" field, per EXER-04).

### Pattern 5: Bodyweight contribution — column now, join later

**What:** `bodyweight_contribution_pct` — a nullable `numeric` column on `exercise` (Postgres) / `text` mirror (SQLite, per the codebase's existing "decimals as exact strings" convention — `apps/mobile/lib/db/schema.ts:7-8`), populated during seeding/custom-creation, expressing "what fraction of bodyweight loads this movement" (e.g. `1.0` for a strict pull-up, `~0.65-0.75` typical dip-family convention, `null` for exercises where it doesn't apply).
**What this phase does NOT build:** the read-time join against `body_metric` to compute an *effective* historical load — ROADMAP criterion 4 is explicit that EXER-08/EXER-09 are data-model deliverables "before any logging UI exists," and `body_metric`'s own snapshot-vs-read-through question is Phase 5's to finish, matching how D-05 already answered the identical question for prescriptions (snapshot-on-use, not live re-read). This phase makes the number storable and honest; Phase 5 decides whether a logged set snapshots the bodyweight-at-time-of-set or computes it by joining the nearest `body_metric` row at read time.

### Pattern 6: Smart swap — deterministic client-side scorer

**What:** A pure function `scoreAlternatives(target: Exercise, candidates: Exercise[], constraints: { excludeEquipment?: string[] }) => ScoredCandidate[]`, run entirely against the already-on-device catalog (no network dependency, matching the mid-workout use case CONTEXT.md names).
**Scoring inputs, in the priority CONTEXT.md's own reasoning implies:**
1. Shared primary muscle (weighted by `exercise_muscle_mapping.weight_factor` overlap) — the dominant signal.
2. Same `movement_pattern` — a strong secondary signal (a horizontal-push swap for a horizontal-push target).
3. `equipment_required` satisfies the constraint (excludes unavailable equipment when the caller passes one, per the mid-workout "machine's taken" case).
4. `variation_of_id` sibling — a bonus, not a filter (CONTEXT.md correctly notes this alone is too narrow: "a lat pulldown is a reasonable pull-up alternative and shares no parent").
5. Excludes rows where the current user's `user_exercise_preference.never_suggest` is true or `archived_at IS NOT NULL` (this is why Pattern 6 depends on Pattern 3 existing first).
**Explicitly not:** any ML/embedding-similarity approach — `PROJECT.md` rules out AI/LLM programming project-wide, and `FEATURES.md` notes MacroFactor pairs every recommendation with a plain-language "why," which a deterministic weighted-score function can trivially produce (surface the top-matching shared muscle/pattern as the "why" string) and a black-box similarity model cannot.

### Anti-Patterns to Avoid

- **Adding `exercise` to the PowerSync user stream in `sync-rules.yaml` to solve the delivery problem.** This is explicitly the option D-01/the sync-rules.yaml comment already ruled out (~900 rows becoming per-user traffic, contradicting the file's own stated design). The `localOnly`-table pattern (Pattern 1) achieves the same "same local database, one query surface" goal without this cost.
- **Treating `exercise.archived_at` as the mechanism for EXER-06 on seeded rows.** Structurally rejected by the existing ownership resolver (Pattern 3) — do not attempt to special-case null-owner rows as writable; build the separate table instead.
- **Writing a new REST DTO/controller for custom exercise create/edit.** This would be Anti-Pattern 1 from `ARCHITECTURE.md` §"Anti-Patterns to Avoid" recurring inside this phase specifically — a second write path for `exercise` alongside the sync push path this phase must build (Pattern 2). The only new REST surface this phase should add is the read-only `ExerciseCatalogModule` (`GET /v1/catalog/version`, `GET /v1/catalog/download`), which is the explicit D-01 carve-out, not a new mutation path.
- **SQLite FTS5 as the search mechanism.** Its cross-platform availability (specifically on web, via wa-sqlite WASM) is not confirmed by the tooling this project uses, and the in-memory MiniSearch alternative has no meaningful downside at this dataset size (Standard Stack table above).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy/prefix text search over ~900 rows | A custom Levenshtein-distance or substring-scan matcher | MiniSearch | Well-tested edge cases (multi-word queries, prefix matching, stop-words) that a hand-rolled matcher will re-discover slowly, for a component every future search-heavy screen in this app will copy the pattern from (CONTEXT.md: "whatever list, search-input, filter-chip and detail-screen patterns land here become the house style for Phases 4–11") |
| Virtualized list rendering with filter/search re-renders | Manual `onScroll`-based windowing | `@shopify/flash-list` v2 | Scroll-position-preserving re-render on filter change, recycling, and RN-Web parity are exactly the class of bug (Pitfall 5) a hand-rolled virtualizer reintroduces per platform |
| Postgres enum enforcement | Only an application-level check, no DB constraint | Drizzle `check()` constraint alongside the app-level `Set<string>` validator | The seed script and any future direct-DB tooling (e.g. a future admin panel) bypass `sync.service.ts`'s validator entirely — the DB constraint is the actual backstop, not a formality |
| Muscle-taxonomy mapping from the open dataset's vocabulary | An ad-hoc string-replace pass done inline in the seed script with no reviewable record | A committed, versioned normalization mapping file (`apps/api/src/seed/normalize-catalog.ts` output as a JSON artifact) reviewed once and re-run deterministically | `PITFALLS.md`'s Integration Gotchas table names this exact mistake ("importing raw dataset fields 1:1 without normalizing... rather than letting the source dataset's schema leak into your own") — the mapping is real intellectual work (CONTEXT.md: "Normalization is the work, not the seeding") and needs to be inspectable and re-runnable, not buried in a one-shot script |

**Key insight:** every "don't hand-roll" item above is really the same principle applied twice — this phase's actual product is a *normalized, well-modeled dataset*, and the libraries above exist so engineering effort goes into that normalization work rather than into re-solving generic UI/search/constraint problems that have mature, off-the-shelf, offline-safe solutions.

## Common Pitfalls

### Pitfall 1: Building the delivery mechanism as REST-download-only, with no bundled fallback

**What goes wrong:** A user installs the app, walks straight into a basement gym with zero signal (the exact scenario `PROJECT.md`'s core value names), and the catalog is empty because the "first-install download" never had a chance to run before the network vanished.
**Why it happens:** D-01's literal text ("first-install download of the seeded exercise catalog") reads as a REST call, and it's tempting to implement exactly that and stop, since it satisfies the letter of the sync-architecture decision.
**How to avoid:** Bundle a versioned JSON snapshot into the app build itself (Pattern 1) so the catalog is populated at first boot with **zero** network dependency, and treat the REST download endpoint as a background-refresh/update mechanism for users who already have a working catalog from the bundle. This is not in tension with D-01 — D-01 reserves ordinary REST endpoints for this use case, it doesn't mandate that REST be the *only* delivery path.
**Warning signs:** The plan has exactly one code path from "app installed" to "catalog queryable," and that path starts with a `fetch()`.

### Pitfall 2: Extending `sync.service.ts` without confronting the aggregate-root assumption

**What goes wrong:** A naive extension adds `exercise: exercise` to `TABLE_MAP` and stops there. `applyBatch`'s root-resolution loop (lines 349-360) has three branches — `workout_session`, `session_exercise`, and an `else` that assumes every remaining type is `logged_set` chaining through `session_exercise_id`. An `exercise` op falls into that `else` branch, tries to resolve a `session_exercise_id` that was never set, gets `undefined`, and the op silently lands in the "could not be determined" (`missing_parent`) bucket — every custom-exercise write fails with a rejection reason that gives no signal about the real cause.
**Why it happens:** The existing code was correctly written for a shape where every synced table chains to `workout_session`; `exercise` is architecturally different (it's a root, not a leaf), and that difference is easy to miss when skimming the file for "where do I add my table."
**How to avoid:** Read Pattern 2 above in full before writing the extension. Add an explicit `exercise` branch to root resolution (self-root, like `workout_session`) rather than relying on the `else` fallthrough.
**Warning signs:** A test that pushes a lone `PUT exercise` op (no accompanying `workout_session`) and expects it applied is the correct acceptance test for this — if the plan's Nyquist validation doesn't include exactly this case, the aggregate-root bug will ship undetected (every other e2e test in this codebase pushes exercise ops *alongside* a session, which would mask the bug).

### Pitfall 3: Seeding `weight_factor` as a binary 1.0/0.5 constant instead of real per-exercise data

**What goes wrong:** D-04 is already locked, but the seed script is where it's easiest to violate under time pressure — mapping `role: 'primary' → 1.0, role: 'secondary' → 0.5` in the normalization script instead of doing the actual per-exercise judgment call `ARCHITECTURE.md` §1's stiff-leg-deadlift example describes.
**How to avoid:** Treat `weight_factor` assignment as part of the "normalization is the work" effort CONTEXT.md names explicitly — budget it as real per-exercise (or per-exercise-family) review, not a formula applied uniformly across all ~900 rows.
**Warning signs:** Every `exercise_muscle_mapping.weight_factor` value in the seeded data is exactly `1.00` or `0.50` with no other values present — this is the literal symptom D-04's own reasoning was written to prevent, and it's mechanically checkable (`SELECT DISTINCT weight_factor FROM exercise_muscle_mapping` should return more than two values).

### Pitfall 4: Trusting `STACK.md`'s per-exercise licensing claim without re-verification

**What goes wrong:** A one-way licensing commitment (CONTEXT.md's own framing) gets locked in based on a claim this research could not reproduce against the live source.
**Why it happens:** `STACK.md` was written 2026-08-05/10; this research re-fetched the actual `yuhonas/free-exercise-db` README on 2026-08-18 and found no per-exercise license caveat anywhere in its 164 lines — only the top-of-file `License: Unlicense` badge. The claim may have come from a different fork, an older README revision, or conflation with the GitHub issue asking about image copyright (which, as of this research, has no answer from the maintainer — it's an open, unresolved question, not a documented caveat).
**How to avoid:** Before the seed-dataset decision is locked in planning, re-fetch `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/README.md` and `.../LICENSE` directly (not summarized) and confirm current state. If the dataset really is Unlicense-only with an open, unanswered question about image provenance specifically, that's a materially different (better, but images-specific) risk profile than "per-exercise text/data licensing varies," and changes what EXER-03's image-hosting decision should weigh.
**Warning signs:** Locking the seed-dataset decision in a plan or CONTEXT.md update without a fresh, direct (non-AI-summarized) read of the license file.

### Pitfall 5: Normalizing free-exercise-db's muscle vocabulary 1:1 instead of onto the fixed taxonomy

**What goes wrong:** free-exercise-db's `primaryMuscles`/`secondaryMuscles` enum [VERIFIED via direct fetch of `schema.json`, 2026-08-18] is: `abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps` — 17 flat values with no delt-region split (`shoulders` is one bucket, not front/side/rear) and no `obliques` (folded into `abdominals`). `ARCHITECTURE.md` §1's taxonomy is described as "chest, front/side/rear delts, lats, upper back/traps, lower back, biceps, triceps, forearms, abs, obliques, quads, hamstrings, glutes, calves" — which, counted literally, is **16 distinct items**, not the "fixed 15-group" the same document calls it (also `abductors`/`adductors`/`neck`/`middle back` in the dataset have no obvious home in that list at all).
**Why it happens:** Every open exercise dataset invents its own muscle vocabulary; a naive import maps 1:1 and either loses granularity (all shoulder work becomes one row) or silently drops muscles with no taxonomy slot (`abductors`, `neck`).
**How to avoid:** Resolve the 15-vs-16 discrepancy explicitly as a first step of planning (enumerate the canonical list, get an exact count, decide where `abductors`/`adductors`/`neck`/`middle back` map — likely `glutes`/`hips`, `hamstrings`/`adductors` region, and either a `neck` addition to the taxonomy or a documented "not tracked" decision), then build the free-exercise-db→canonical mapping table as the committed artifact Pattern/Don't-Hand-Roll above describes, before writing a single row to Postgres.
**Warning signs:** The seed script contains an inline `if (muscle === 'shoulders') return 'front_delts'` with no documentation of why that specific sub-region was chosen, or any dataset muscle value silently dropped with no logged warning.

## Code Examples

### PowerSync `localOnly` table wiring (client)
```typescript
// Source: Context7 /powersync-ja/powersync-js, packages/drizzle-driver/README.md
// (existing project files this pattern extends: apps/mobile/lib/db/schema.ts, apps/mobile/lib/db/powersync.ts)
import { DrizzleAppSchema } from '@powersync/drizzle-driver';
import { muscleGroup, exerciseMuscleMapping, drizzleSchema } from './schema';

export const AppSchema = new DrizzleAppSchema({
  ...drizzleSchema,
  muscleGroup: { tableDefinition: muscleGroup, options: { localOnly: true } },
  exerciseMuscleMapping: { tableDefinition: exerciseMuscleMapping, options: { localOnly: true } },
});
```

### Postgres CHECK constraint for `load_type` (server schema)
```typescript
// Source: Context7 /drizzle-team/drizzle-orm-docs, pg/indexes-constraints.mdx, adapted to this
// codebase's exercise table (apps/api/src/db/schema/catalog.ts)
import { check } from 'drizzle-orm/pg-core';

export const exercise = pgTable(
  'exercise',
  { /* ...existing columns... */ },
  (table) => [
    index('exercise_userId_idx').on(table.userId),
    check(
      'exercise_load_type_check',
      sql`${table.loadType} IN ('external_weight','bodyweight','bodyweight_plus_added','assisted','time_based','distance_based')`,
    ),
  ],
);
```

### Existing `Set<string>` validator pattern to extend for `load_type`
```typescript
// Source: apps/api/src/sync/sync.service.ts lines 49-50 and 210-218 (verified, existing code)
const SESSION_STATUSES = new Set(['in_progress', 'completed', 'discarded']);
const SET_TYPES = new Set(['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap']);
// NEW, following the identical pattern:
const LOAD_TYPES = new Set([
  'external_weight', 'bodyweight', 'bodyweight_plus_added', 'assisted', 'time_based', 'distance_based',
]);
```

## State of the Art

| Old Approach (STACK.md, 2026-08-05/10) | Current Finding (this research, 2026-08-18) | What Changed | Impact |
|--------------------------------------|-----------------------------------------------|---------------|--------|
| free-exercise-db README "warns only exercises with a 'relatively free' license were included and per-exercise license terms must still be honored" | Direct fetch of the current README (164 lines, fully grepped) shows only a top-of-file `License: Unlicense` badge, no per-exercise caveat text found anywhere | Either the README changed, or the earlier claim conflated sources/forks | The licensing risk may be smaller than previously assumed (Unlicense ≈ public domain for text/data) — but the open, unanswered GitHub issue about *image* copyright specifically means EXER-03's image-hosting decision still needs its own, separate risk call, not a blanket "it's fine" |
| No `localOnly`-table option named as a delivery-mechanism candidate | `@powersync/drizzle-driver`'s `DrizzleAppSchema` supports per-table `{ localOnly: true }`, confirmed against the already-installed SDK version (0.8.0) via official PowerSync JS SDK docs | This capability wasn't surfaced in the Phase 2 architecture research or the Phase 3 CONTEXT.md's own three-option enumeration | Materially changes the delivery-mechanism decision — a fourth, better-fitting option exists that the discretion item's framing didn't consider |

**Deprecated/outdated:** none — this is a new phase on a young codebase; nothing here is deprecating a previously-shipped pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | free-exercise-db's images (as opposed to its text/JSON data) are safe to vendor/host without separate per-image licensing review | Pitfall 4, Open Questions | Medium — the GitHub issue asking this exact question is open and unanswered; if images turn out to carry separate terms, EXER-03's image-hosting choice needs to change after the fact, which CONTEXT.md flags as "costly to unwind once shipped" for the bundle-size half of that decision |
| A2 | ~900 total exercises is achievable primarily from free-exercise-db (800+) with wger as a gap-filler, without pulling in enough CC-BY-SA content to trigger a meaningful ShareAlike obligation on the merged dataset | Summary, Don't Hand-Roll | Medium — if wger contributes a large fraction of the final ~900, the ShareAlike obligation "follows the merged dataset permanently" (CONTEXT.md's own framing); the planner should quantify the actual free-exercise-db vs. wger split before finalizing |
| A3 | A flat six-value `load_type` enum (Pattern 4) is sufficient and no exercise genuinely needs to express two simultaneous load axes | Architecture Patterns §4 | Medium — if normalization surfaces several genuinely dual-axis exercises (not just the one farmer's-carry example reasoned through here), the flat enum may need revisiting before seeding — but revisiting now (pre-seed) is cheap; revisiting after ~900 rows are seeded is the one-way door CONTEXT.md warns about |
| A4 | `DrizzleAppSchema`'s mixed plain/`localOnly`-wrapped table object works correctly end-to-end with `wrapPowerSyncWithDrizzle` in this exact installed version combination (`@powersync/react-native` 2.1.0, `@powersync/web` 2.2.0, `@powersync/drizzle-driver` 0.8.0) | Pattern 1 | High if wrong, but cheap to detect — this is exactly why Pattern 1 recommends a spike task before building the full seeding pipeline on top of it |
| A5 | free-exercise-db's `README.md` at the point this research fetched it (2026-08-18) reflects the same content a planner/executor will see days later | Pitfall 4, State of the Art | Low-Medium — a live GitHub repo can change; the planner should re-fetch immediately before locking the decision, not rely on this document's snapshot |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Is free-exercise-db's per-exercise data actually clean Unlicense, or did STACK.md's stricter claim come from somewhere real that this research's fetch missed?**
   - What we know: the current live README shows only the Unlicense badge; no caveat text found in a full-file grep for licensing terms.
   - What's unclear: whether an older commit, a different branch, or a sibling file (e.g., per-exercise JSON files themselves, which this research did not individually sample) carries different terms; whether the *images specifically* (a separate, open, unanswered GitHub issue) carry different terms than the JSON text data.
   - Recommendation: five-minute human/planner re-check of the live repo immediately before locking the seed-dataset decision; if going forward with images from this source, treat the open GitHub issue as a live risk, not a resolved one — consider text-cues-only for v1 (already a stated fallback in CONTEXT.md's own image-strategy options) if that risk isn't acceptable.

2. **What is the exact, final canonical `muscle_group` list and count?**
   - What we know: `ARCHITECTURE.md` §1 names 14-16 items depending on how "front/side/rear delts" is counted, and calls it "fixed 15-group" in its own prose — an internal inconsistency in the source document itself.
   - What's unclear: the exact final list, which determines both the `muscle_group` seed rows and the free-exercise-db→canonical mapping table.
   - Recommendation: the planner should enumerate this list explicitly as a locked decision (not inherited ambiguously from ARCHITECTURE.md) before any seeding code is written — it is upstream of literally every other normalization decision in this phase.

3. **Should `equipment_required` become a structured enum/taxonomy in this phase, or stay free-text?**
   - What we know: the column is currently `text('equipment_required')` with no defined vocabulary (same situation `load_type` was in before this phase), and EXER-02 requires filtering by equipment — free-text filtering degrades to substring matching, which is fragile (`"barbell"` vs `"Barbell"` vs `"olympic barbell"`).
   - What's unclear: whether CONTEXT.md's discretion delegation intended this column to get the same enum treatment as `load_type`, since it wasn't named as one of the four explicit schema-gap items.
   - Recommendation: treat this as in-scope for the planner to decide explicitly (it directly blocks a clean EXER-02 filter implementation) even though CONTEXT.md didn't name it as a discretion item — flag it to the user/discuss-phase if the planner wants it locked rather than delegated further.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (both `apps/api` and `apps/mobile`) [VERIFIED: apps/api/jest.config.js and apps/mobile/jest.config.js present, both exist] |
| Config file | `apps/api/jest.config.js` (unit), `apps/api/test/jest-e2e.json` (e2e); `apps/mobile/jest.config.js` (unit) |
| Quick run command | `pnpm --filter api test` / `pnpm --filter mobile test` |
| Full suite command | `pnpm --filter api test:e2e` (real Postgres, per existing e2e specs in `apps/api/test/*.e2e-spec.ts`); `pnpm --filter mobile test:e2e` (Playwright, per `apps/mobile/playwright.config`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXER-01 | Search returns expected matches by name/alias | unit (client) | `pnpm --filter mobile test -- search-index` | ❌ Wave 0 |
| EXER-02 | Filter combines muscle+equipment+pattern with AND semantics | unit (client) | `pnpm --filter mobile test -- catalog-filter` | ❌ Wave 0 |
| EXER-03 | Detail screen renders muscles/cues/images from local data with zero network | e2e (client, offline-simulated) | `pnpm --filter mobile test:e2e -- exercise-detail-offline` | ❌ Wave 0 |
| EXER-04 | Custom exercise create syncs via `POST /v1/sync/push` | e2e (server) | `pnpm --filter api test:e2e -- exercise-sync` | ❌ Wave 0 |
| EXER-05 | Duplicate-from-seed produces a correctly-owned copy with its own muscle mappings | e2e (server) | `pnpm --filter api test:e2e -- exercise-sync` | ❌ Wave 0 (same file as EXER-04) |
| EXER-06 | Archiving a seeded exercise removes it from pickers; `session_exercise`/`personal_record` references stay valid | e2e (server) | `pnpm --filter api test:e2e -- user-exercise-preference` | ❌ Wave 0 |
| EXER-07 | Never-suggest excludes from smart-swap candidates | unit (client) | `pnpm --filter mobile test -- smart-swap` | ❌ Wave 0 |
| EXER-08 | Every seeded row has a `load_type` from the fixed set; invalid value rejected by both DB CHECK and sync validator | unit (server) + e2e (server, for the sync-rejection half) | `pnpm --filter api test -- load-type` / `pnpm --filter api test:e2e -- exercise-sync` | ❌ Wave 0 |
| EXER-09 | `bodyweight_contribution_pct` is present/nullable per the documented rule, no logging computation attempted this phase | unit (server, schema-level assertion) | `pnpm --filter api test:e2e -- schema-parity` (extend existing file) | ✅ file exists, extend it |
| EXER-10 | Smart swap excludes archived/never-suggest and ranks by shared-muscle weight | unit (client) | `pnpm --filter mobile test -- smart-swap` | ❌ Wave 0 (same file as EXER-07) |

**Aggregate-root regression test (Pitfall 2):** a dedicated e2e case — `POST /v1/sync/push` with a lone `PUT exercise` op, no accompanying `workout_session` — asserting `applied` (not `missing_parent`) is the single highest-value test this phase can write, given it's the one bug class this research found that existing test coverage would not catch by accident.

### Sampling Rate
- **Per task commit:** `pnpm --filter api test` and/or `pnpm --filter mobile test` (whichever side changed)
- **Per wave merge:** `pnpm --filter api test:e2e` and `pnpm --filter mobile test:e2e`
- **Phase gate:** full suite green (both apps) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/test/exercise-sync.e2e-spec.ts` — covers EXER-04, EXER-05, EXER-08 (server half), and the aggregate-root regression case
- [ ] `apps/api/test/user-exercise-preference.e2e-spec.ts` — covers EXER-06
- [ ] `apps/api/src/seed/__tests__/normalize-catalog.spec.ts` — covers the muscle-taxonomy mapping and weight_factor-diversity check (Pitfall 3's mechanical warning sign)
- [ ] `apps/mobile/lib/catalog/__tests__/search-index.test.ts` — covers EXER-01
- [ ] `apps/mobile/lib/catalog/__tests__/catalog-filter.test.ts` — covers EXER-02
- [ ] `apps/mobile/lib/catalog/__tests__/smart-swap.test.ts` — covers EXER-07, EXER-10
- [ ] `apps/mobile/e2e/exercise-detail-offline.e2e.ts` (Playwright, matching existing durability-harness pattern) — covers EXER-03 with simulated offline
- No new test framework install needed — Jest is already configured on both sides.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new surface) | Existing `@thallesp/nestjs-better-auth` session guard already covers the new sync ops and the new `ExerciseCatalogModule` read endpoints (same `MinClientVersionGuard`/session pattern as every other controller) |
| V3 Session Management | No (new surface) | Unchanged — inherited from Phase 1/2 |
| V4 Access Control | Yes | The `exercise` ownership check (Pattern 2) and the `user_exercise_preference` per-user scoping (Pattern 3) are the access-control surface this phase adds — both must reject cross-user access the same way `SyncService`'s existing `not_owner`/scoping logic does for every other table |
| V5 Input Validation | Yes | `load_type` enum (Pattern 4), custom-exercise field validation in `hasInvalidField` (Pattern 2) — the existing hand-rolled validator pattern is the standard to extend, not a new library |
| V6 Cryptography | No | Not applicable to this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A user pushes a `PATCH exercise` op naming a seeded (null-owner) or another user's custom exercise, attempting to silently take ownership or corrupt shared reference data | Tampering / Elevation of Privilege | The ownership resolver (Pattern 2) must reject any op where `existingRow.userId !== pushingUserId`, including the `null` case — treat `null` as "not owned by anyone, therefore not writable via PATCH by anyone," never as "adoptable." This mirrors the existing `not_owner` handling already proven for `workout_session`. |
| A user pushes `user_exercise_preference` rows for another user's `user_id` | Tampering | Standard per-row scoping — `userId` on the incoming op must be ignored/derived from the authenticated session (`SyncController`'s existing pattern: `session.user.id`, never a client-supplied field), exactly as every other synced table already does |
| Read-only `GET /v1/catalog/download` endpoint used as an unauthenticated data-exfiltration or DoS vector (large payload, no auth) | Denial of Service | The catalog is non-sensitive seeded content (no reason to require auth for it), but should still be rate-limited/cacheable (e.g., an ETag or version-based conditional-GET) since it's a real ~900-row payload — avoid re-serving the full download on every app launch when nothing changed |
| Custom exercise `instructions_text`/`cue_text`/`name` fields rendered in the UI without sanitization, enabling stored injection if this content is ever rendered as HTML/markdown | Tampering (stored XSS, if applicable to the render path) | These fields are plain text rendered in React Native `<Text>` components (not `dangerouslySetInnerHTML`/WebView), which is not vulnerable to HTML injection by construction on native; confirm the same holds for any RN-Web rendering path used for this content before treating it as fully closed |

## Sources

### Primary (HIGH confidence)
- `apps/api/src/db/schema/catalog.ts`, `session.ts`, `records.ts`, `equipment.ts` — direct repo reads, this session
- `apps/mobile/lib/db/schema.ts`, `powersync.ts`, `connector.ts` — direct repo reads, this session
- `apps/api/src/sync/sync.service.ts`, `sync.controller.ts`, `conflict-policy.ts`, `patch-update-set.ts` — direct repo reads, this session
- `packages/api-contracts/src/sync.ts`, `units.ts`, `index.ts` — direct repo reads, this session
- `ops/powersync/sync-rules.yaml` — direct repo read, this session
- `.planning/config.json` — direct repo read, this session
- Context7 `/powersync-ja/powersync-js` (`packages/drizzle-driver/README.md`, `packages/common/src/db/schema/Table.ts`, `packages/common/src/db/DBAdapter.ts`) — `localOnly` table mechanism, fetched this session
- Context7 `/drizzle-team/drizzle-orm-docs` (`pg/indexes-constraints.mdx`, `pg/column-types.mdx`) — `pgEnum`/`check()` patterns, fetched this session
- Context7 `/nestjs/docs.nestjs.com` (`techniques/validation.md`, `pipes.md`) — class-validator convention, fetched this session (informed the decision *not* to introduce it for this write path)
- Context7 `/expo/expo` (`packages/expo-sqlite/ios/ExpoSQLite.podspec`, `docs/pages/versions/v57.0.0/sdk/sqlite.mdx`) — FTS5 platform-availability finding, fetched this session
- `npm view <pkg> version` — direct registry queries this session for `minisearch`, `fuse.js`, `@shopify/flash-list`, `@powersync/react-native`, `@powersync/web`, `@powersync/drizzle-driver`, `drizzle-orm`, `expo`, `nestjs-zod`, `class-validator`, `class-transformer`
- `curl` of `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/README.md` and `.../schema.json` — direct fetch, this session, full-file grepped for licensing terms

### Secondary (MEDIUM confidence)
- WebSearch: free-exercise-db exercise count/schema (cross-checked against the direct curl fetch above, which superseded it on the licensing point)
- WebSearch: wger API muscle taxonomy, CC-BY-SA terms
- WebSearch: Fuse.js vs. MiniSearch comparison (devpick.co aggregator)
- WebSearch: `@shopify/flash-list` v2 React Native Web support (Shopify's own doc site summarized via WebSearch, not fetched directly)

### Tertiary (LOW confidence)
- WebFetch of `github.com/yuhonas/free-exercise-db/issues/13` — the images-copyright question is open with no maintainer response; noted as an unresolved risk, not a finding

## Metadata

**Confidence breakdown:**
- Delivery mechanism / sync extension (Patterns 1-2): HIGH — verified directly against this repo's code and the installed SDK's own docs, not inferred
- Per-user preference table (Pattern 3): HIGH — the structural argument is derived from reading the actual ownership-check code, not a stylistic preference
- `load_type`/bodyweight-contribution schema design (Patterns 4-5): MEDIUM — the enum values and column shape are a reasoned design choice consistent with EXER-08's own wording and the codebase's existing validator style, not verified against any external spec (none exists — MacroFactor's own taxonomy is not public)
- Seed dataset / licensing (State of the Art, Pitfall 4): MEDIUM — the correction to STACK.md is directly verified via live fetch, but the *reason* for the discrepancy (stale claim vs. changed README vs. wrong source) is unresolved and flagged as an open question
- UI/search library choices (Standard Stack): MEDIUM — versions and basic capability claims are registry/doc-verified, but none of these libraries have been spiked against this specific codebase's PowerSync/NativeWind/Expo Router combination yet

**Research date:** 2026-08-18
**Valid until:** 30 days for the architecture/pattern findings (stable, code-verified); 7 days for the seed-dataset licensing finding specifically, given it already contradicts a 13-day-old prior research artifact and the source is a live, mutable GitHub repo

---
*Phase: 3-Exercise Catalog*
*Research completed: 2026-08-18*
