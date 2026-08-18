# Phase 3: Exercise Catalog - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 19 (new/modified)
**Analogs found:** 17 / 19

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/src/db/schema/catalog.ts` (extend: `load_type` CHECK, `bodyweight_contribution_pct`, `user_exercise_preference` table) | model | CRUD | itself (already exists, extend in place) — structural sibling `apps/api/src/db/schema/records.ts`/`session.ts` for FK/index conventions | exact |
| `apps/api/src/catalog/catalog.module.ts` | config | request-response | `apps/api/src/mailer/mailer.module.ts` (simplest existing `@Module` with providers/exports) and `apps/api/src/health/health.module.ts` (simplest existing controller-only module) | role-match |
| `apps/api/src/catalog/catalog.controller.ts` (`GET /v1/catalog/version`, `GET /v1/catalog/download`) | controller | request-response | `apps/api/src/health/health.controller.ts` (read-only, `AllowAnonymous`, no body) | exact |
| `apps/api/src/catalog/catalog.service.ts` | service | CRUD (read) | `apps/api/src/sync/sync.service.ts` (Drizzle `@Inject(DRIZZLE)` pattern) — scaled down, no mutation | role-match |
| `apps/api/src/sync/sync.service.ts` (extend: `exercise` as second aggregate root) | service | event-driven / CRUD | itself — extend existing `TABLE_MAP`/`AGGREGATE_RANK`/root-resolution/`hasInvalidField` machinery | exact |
| `apps/api/src/sync/patch-update-set.ts` (extend: `ExerciseValues` + `EXERCISE_PATCH_FIELDS`) | utility | transform | itself — extend existing `PatchFieldMap<V>` exhaustiveness pattern | exact |
| `apps/api/src/sync/sync.controller.ts` | controller | request-response | unchanged — no new route needed, `exercise` flows through existing `POST /v1/sync/push` | exact (no-op) |
| `apps/api/src/seed/normalize-catalog.ts` | utility | batch / transform | `apps/api/src/seed/generate-corpus.ts` (deterministic script style, dotenv bootstrap, committed-artifact discipline) | exact |
| `apps/api/src/seed/seed-catalog.ts` | utility | batch | `apps/api/src/seed/generate-corpus.ts` (Drizzle insert/upsert against `db`/`pool`, script entrypoint shape) | exact |
| `packages/api-contracts/src/catalog.ts` (`LOAD_TYPES`, muscle group list, movement pattern list) | config | transform | `packages/api-contracts/src/sync.ts` (flat const-tuple + derived type + additive-only comment style) | exact |
| `packages/api-contracts/src/sync.ts` (move `'exercise'` from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES`) | config | transform | itself | exact |
| `apps/mobile/lib/db/schema.ts` (extend: `muscleGroup`, `exerciseMuscleMapping`, `userExercisePreference` tables) | model | CRUD | itself — extend existing sqlite-core table definitions, snake_case-mirrors-Postgres convention | exact |
| `apps/mobile/lib/db/powersync.ts` (extend: wrap two tables with `{ localOnly: true }`) | config | streaming | itself — extend `DrizzleAppSchema` construction | exact |
| `apps/mobile/lib/catalog/search-index.ts` | utility | transform | no existing analog (first search/index utility in `lib/`) — nearest sibling by directory convention is `apps/mobile/lib/db/id.ts` (pure, no-Nest, single-purpose module) | role-match |
| `apps/mobile/lib/catalog/smart-swap.ts` | utility | transform | `packages/api-contracts/src/units.ts` (pure deterministic function, no side effects, unit-testable) | role-match |
| `apps/mobile/app/(tabs)/exercises.tsx` (or renamed placeholder tab) | component | request-response (local read) | `apps/mobile/app/(tabs)/history.tsx` and sibling placeholder tabs (`PlaceholderScreen` pattern to replace) | exact |
| `apps/mobile/app/exercise/[id].tsx` | component | request-response (local read) | no existing dynamic-route screen in this repo yet — nearest analog is the `(tabs)/*.tsx` screen shape plus Expo Router's own `[id]` convention (file-based, no existing precedent to copy from) | no analog |
| `apps/api/test/exercise-sync.e2e-spec.ts` | test | event-driven | `apps/api/test/sync-push.e2e-spec.ts` and `apps/api/test/sync-aggregate.e2e-spec.ts` (spawned built API, real Postgres, `SyncPushRequest`/`SyncPushResponse` wire types) | exact |
| `apps/api/test/user-exercise-preference.e2e-spec.ts` | test | CRUD | `apps/api/test/patch-partial-update.e2e-spec.ts` (per-user PATCH semantics against a synced table) | role-match |

## Pattern Assignments

### `apps/api/src/db/schema/catalog.ts` (model, CRUD — extend existing file)

**Analog:** itself, plus `apps/api/src/db/schema/records.ts` / `session.ts` for FK-and-index idiom.

**Existing shape to extend** (full file already read, lines 1-88):
```typescript
export const exercise = pgTable(
  'exercise',
  {
    // ...existing columns...
    loadType: text('load_type').notNull(),          // currently no CHECK — add one
  },
  (table) => [index('exercise_userId_idx').on(table.userId)],
);
```

**CHECK constraint pattern to add** (from RESEARCH.md, Drizzle `check()` — matches this codebase's existing `(table) => [index(...), ...]` third-argument array shape):
```typescript
import { check } from 'drizzle-orm/pg-core';

export const exercise = pgTable(
  'exercise',
  { /* ...existing columns..., bodyweightContributionPct: numeric('bodyweight_contribution_pct', { precision: 4, scale: 2 }) */ },
  (table) => [
    index('exercise_userId_idx').on(table.userId),
    check(
      'exercise_load_type_check',
      sql`${table.loadType} IN ('external_weight','bodyweight','bodyweight_plus_added','assisted','time_based','distance_based')`,
    ),
  ],
);
```

**New table pattern — `user_exercise_preference`, copy `exerciseMuscleMapping`'s composite-PK + FK-cascade shape exactly:**
```typescript
// Modeled on exerciseMuscleMapping's composite PK + onDelete cascade shape (lines 53-69 of this file)
export const userExercisePreference = pgTable(
  'user_exercise_preference',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id').notNull().references(() => exercise.id, { onDelete: 'cascade' }),
    archivedAt: timestamp('archived_at'),
    neverSuggest: boolean('never_suggest').notNull().default(false),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    serverSeq: bigint('server_seq', { mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.exerciseId] }),
    index('user_exercise_preference_userId_idx').on(table.userId),
  ],
);
```

---

### `apps/api/src/catalog/catalog.controller.ts` + `catalog.module.ts` (controller/config, request-response)

**Analog:** `apps/api/src/health/health.controller.ts` (read-only, unauthenticated, no body — closest shape for `GET /v1/catalog/version` and `GET /v1/catalog/download`, which are also read-only and non-sensitive per RESEARCH.md's threat table) and `apps/api/src/mailer/mailer.module.ts` (simplest provider-registering module).

**Imports/decorator pattern** (`apps/api/src/health/health.controller.ts`, full file):
```typescript
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
@AllowAnonymous()
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```
Note the deliberate deviation `sync.controller.ts` documents at its own top (lines 12-14): `SyncController` has **no** `@AllowAnonymous()` because it mutates. `CatalogController`'s two GET routes are read-only seeded content (RESEARCH.md's threat table explicitly says "no reason to require auth for it") — follow `HealthController`'s `@AllowAnonymous()` + normal versioned path (not `VERSION_NEUTRAL`, since catalog *does* want normal `/v1/...` versioning/`MinClientVersionGuard` coverage, unlike health).

**Module pattern** (`apps/api/src/health/health.module.ts`, full file):
```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```
`CatalogModule` additionally needs a `providers: [CatalogService]` entry, following `mailer.module.ts`'s `providers`/`exports` array shape if `CatalogService` needs to be consumed elsewhere (it likely doesn't — keep it self-contained unless seed script wants to reuse it).

---

### `apps/api/src/sync/sync.service.ts` (service, event-driven — extend existing file, THE central pattern of this phase)

**Analog:** itself. This is not a new file — it is a structural extension of the exact machinery already reverse-engineered in RESEARCH.md Pattern 2 / Pitfall 2.

**`TABLE_MAP` extension** (line 23-27):
```typescript
const TABLE_MAP = {
  workout_session: workoutSession,
  session_exercise: sessionExercise,
  logged_set: loggedSet,
  exercise: exercise,   // NEW — import from '../db/schema'
} as const;
```

**Root-resolution extension — the Pitfall 2 trap.** Do NOT let `exercise` fall through the existing `else` branch (which assumes every non-`workout_session`/`session_exercise` type is a `logged_set` chaining through `session_exercise_id`). Add an explicit self-root branch matching `workout_session`'s own pattern (line 352-353):
```typescript
// Root resolution — null means "could not be determined from the batch or the database".
const rootByOpId = new Map<string, string | null>();
for (const op of remaining) {
  if (op.type === 'workout_session' || op.type === 'exercise') {
    rootByOpId.set(op.op_id, op.id);   // self-root — exercise has no synced children
  } else if (op.type === 'session_exercise') {
    // ...unchanged...
```

**Ownership resolution — the null-owner trap** (RESEARCH.md Pattern 2, "the nullable-owner case is the crux"). The existing `existingRoots` query (lines 389-394) selects specifically from `workoutSession` — `exercise` needs its own parallel query, and the null case must reject, never adopt:
```typescript
// Parallel to existingRoots (lines 389-394), but exercise.userId is nullable — unlike
// workoutSession.userId, which is always populated. A null owner is "not owned by anyone,
// therefore not writable via PATCH by anyone," never an adoptable row (RESEARCH.md Pattern 2).
const existingExerciseRoots = exerciseRootIds.length
  ? await this.db.select({ id: exercise.id, userId: exercise.userId }).from(exercise).where(inArray(exercise.id, exerciseRootIds))
  : [];
// owner === null (seeded row) must fall into the `owner !== userId` branch (line 417-420),
// never the `owner === undefined` "treat as fresh insert" branch (line 409-411) — a PUT for an
// id that already exists as a seeded row is a takeover attempt, not an insert.
```

**Validator extension** (`hasInvalidField`, line 196-225, same `Set<string>` shape as `SESSION_STATUSES`/`SET_TYPES`, line 49-50):
```typescript
const LOAD_TYPES = new Set([
  'external_weight', 'bodyweight', 'bodyweight_plus_added', 'assisted', 'time_based', 'distance_based',
]);

// inside hasInvalidField, new branch:
if (op.type === 'exercise') {
  if (data.load_type !== undefined && !(typeof data.load_type === 'string' && LOAD_TYPES.has(data.load_type))) {
    return true;
  }
  // is_custom:true rows must always carry a user_id — a user_id-less write for a custom row is invalid.
  return false;
}
```

**`HARD_DELETE_FORBIDDEN`** (line 38) already includes `'exercise'` — no change needed there, but confirm the `archived_at` field itself is rejected on direct `exercise` PATCH per Pattern 3 (archive lives in `user_exercise_preference`, not on `exercise` directly):
```typescript
// exercise/routine carry archived_at and are never hard-deleted (line 35-38, already correct).
// Additionally: a direct PATCH naming `archived_at` on `exercise` itself should be rejected
// invalid_field — this phase's archive mechanism is user_exercise_preference, not this column.
```

**`AGGREGATE_RANK`** (line 43-47) — `exercise` never has children so it does not need a meaningful rank relative to `workout_session`/`session_exercise`/`logged_set`; route it through a parallel, simpler code path per RESEARCH.md Pattern 2's recommendation, or give it rank `0` alongside `workout_session` since aggregates are keyed by distinct root id anyway (a `workout_session` aggregate and an `exercise` aggregate never share a key).

**Aggregate-root regression test — the single highest-value test this phase can write** (RESEARCH.md, Common Pitfalls §2): a lone `PUT exercise` op with no accompanying `workout_session` must apply, not reject `missing_parent`. Model this on `apps/api/test/sync-aggregate.e2e-spec.ts`'s existing structure.

---

### `apps/api/src/sync/patch-update-set.ts` (utility, transform — extend existing file)

**Analog:** itself — the `PatchFieldMap<V>` exhaustiveness-gate pattern (full file already read, lines 1-123) is the exact template to follow.

**Pattern to copy** (lines 20-33, `SessionExerciseValues` + `SESSION_EXERCISE_PATCH_FIELDS` as the closest-shaped sibling — single-entity table with simple scalar columns, no nested arrays):
```typescript
export interface ExerciseValues {
  id: string;
  userId: string | null;
  name: string;
  aliases: string[] | null;
  movementPattern: string | null;
  equipmentRequired: string | null;
  loadType: string;
  unilateral: boolean;
  instructionsText: string | null;
  cueText: string | null;
  imageUrls: string[] | null;
  isCustom: boolean;
  variationOfId: string | null;
  source: string;
  bodyweightContributionPct: string | null;
}

export const EXERCISE_PATCH_FIELDS: PatchFieldMap<ExerciseValues> = {
  id: null,
  userId: null,          // never client-patchable — ownership is set once at insert
  name: 'name',
  aliases: 'aliases',
  movementPattern: 'movement_pattern',
  equipmentRequired: 'equipment_required',
  loadType: 'load_type',
  unilateral: 'unilateral',
  instructionsText: 'instructions_text',
  cueText: 'cue_text',
  imageUrls: 'image_urls',
  isCustom: null,          // set once at insert, never patched
  variationOfId: 'variation_of_id',
  source: null,            // set once at insert (seeded vs custom), never patched
  bodyweightContributionPct: 'bodyweight_contribution_pct',
};
```
Note the load-bearing comment already in the file (lines 101-107) about wire-key vs. Drizzle-key mismatch — the same trap applies to `exercise`'s snake_case/camelCase pairing.

---

### `apps/api/src/seed/normalize-catalog.ts` + `seed-catalog.ts` (utility, batch — new files)

**Analog:** `apps/api/src/seed/generate-corpus.ts` (full file header read, lines 1-50+).

**Bootstrap pattern to copy exactly** (lines 1-8):
```typescript
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../db/drizzle.module';
```

**Determinism discipline to copy** (lines 18-30) — `normalize-catalog.ts` should follow the same "no `Math.random()`, committed generated artifact, reviewable and re-runnable" discipline this file establishes, per RESEARCH.md's Don't-Hand-Roll table: "A committed, versioned normalization mapping file... reviewed once and re-run deterministically."

**Script entrypoint shape** — `generate-corpus.ts` is a plain Node/ts-node script driven outside Nest's DI (no `@Injectable()`), reusing `db`/`pool` exported directly from `drizzle.module.ts`. `seed-catalog.ts` should follow the identical shape: import `db` directly, no NestJS bootstrap, run via a `pnpm` script.

---

### `packages/api-contracts/src/catalog.ts` (config, transform — new file)

**Analog:** `packages/api-contracts/src/sync.ts` (full file read, lines 1-93).

**Pattern to copy** — flat const-tuple + derived type + additive-only-contract comment discipline (lines 1-22 style):
```typescript
// Additive-only from this commit forward — every client build in the field reads this shape.
export const LOAD_TYPES = [
  'external_weight', 'bodyweight', 'bodyweight_plus_added', 'assisted', 'time_based', 'distance_based',
] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export const MUSCLE_GROUPS = [ /* the resolved 15/16-item canonical list — RESEARCH.md Open Question #2 must be settled first */ ] as const;
export type MuscleGroupId = (typeof MUSCLE_GROUPS)[number];

export const MOVEMENT_PATTERNS = [ /* the nine-value vocabulary from ARCHITECTURE.md §1 */ ] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];
```
This is imported by both `sync.service.ts`'s `LOAD_TYPES` `Set<string>` validator (server) and any client-side form (mobile custom-exercise create screen) — single source of truth, matching `packages/api-contracts/src/units.ts`'s existing role as the shared-conversion-logic home.

---

### `apps/mobile/lib/db/schema.ts` (model, CRUD — extend existing file)

**Analog:** itself (full file read, lines 1-179).

**Pattern to copy** — `exerciseMuscleMapping` and `muscleGroup` mirror the Postgres shapes exactly per the file's own header comment (lines 1-8: "Column names stay snake_case and identical to the Postgres tables... weight_kg is text, not real — SQLite has no decimal type"):
```typescript
export const muscleGroup = sqliteTable('muscle_group', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  bodyRegion: text('body_region').notNull(),
});

export const exerciseMuscleMapping = sqliteTable('exercise_muscle_mapping', {
  exerciseId: text('exercise_id').notNull(),
  muscleGroupId: text('muscle_group_id').notNull(),
  role: text('role').notNull(),
  weightFactor: text('weight_factor').notNull(),   // decimal-as-exact-string, same rule as weightKg (line 45)
});

export const userExercisePreference = sqliteTable('user_exercise_preference', {
  userId: text('user_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  archivedAt: text('archived_at'),
  neverSuggest: integer('never_suggest', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
  serverSeq: integer('server_seq'),
});
```
`exercise`'s existing `loadType`/`bodyweightContributionPct` extension: add `bodyweightContributionPct: text('bodyweight_contribution_pct')` next to `exercise` (line 105-122), following the same `text()`-for-decimal convention.

Add all three new tables to the `drizzleSchema` export object (lines 165-178) — `muscleGroup` and `exerciseMuscleMapping` are `localOnly` (see next pattern), `userExercisePreference` is a normal synced entry alongside `exercise`.

---

### `apps/mobile/lib/db/powersync.ts` (config, streaming — extend existing file)

**Analog:** itself (full file read, lines 1-42) plus the Context7-sourced `DrizzleAppSchema` mixed-wrapping example already captured in RESEARCH.md Pattern 1.

**Current shape** (line 6):
```typescript
export const AppSchema = new DrizzleAppSchema(drizzleSchema);
```

**Extension** (RESEARCH.md Pattern 1, Code Examples section — verbatim):
```typescript
export const AppSchema = new DrizzleAppSchema({
  ...drizzleSchema,
  muscleGroup: { tableDefinition: muscleGroup, options: { localOnly: true } },
  exerciseMuscleMapping: { tableDefinition: exerciseMuscleMapping, options: { localOnly: true } },
});
```
**Load-bearing caveat already flagged in RESEARCH.md:** this exact mixed-schema combination is unverified end-to-end in this codebase (Assumption A4) — plan the first task in this area as a small spike (insert a few rows into a `localOnly` table, read them back through the same `db` the app already uses) before building the full seeding pipeline on top of it.

---

### `apps/mobile/app/(tabs)/exercises.tsx` (component, request-response local read — new/renamed screen)

**Analog:** `apps/mobile/app/(tabs)/history.tsx` and its four sibling placeholder tabs (full file read):
```typescript
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function HistoryScreen() {
  return <PlaceholderScreen heading="History" body="Review your past workouts here." />;
}
```
This is the Phase-1 scaffold this phase fills in per D-07/D-09 — whichever tab is designated for the exercise catalog (check `apps/mobile/app/(tabs)/_layout.tsx` for the current five-tab assignment before deciding which placeholder this replaces), replace the `PlaceholderScreen` call with the real list/search/filter UI, keeping the same file location and default-export screen-component shape. Check for a `.web.tsx` sibling need per Pitfall 5 / CONTEXT.md's search-and-filter discretion item — `(tabs)/_layout.web.tsx` already exists as the precedent for when a `.web.tsx` split is needed.

---

## Shared Patterns

### NestJS module/controller minimalism
**Source:** `apps/api/src/health/health.module.ts` + `health.controller.ts`
**Apply to:** `CatalogModule`/`CatalogController` — this codebase's convention is small, single-purpose modules (`auth`, `common`, `db`, `health`, `mailer`, `seed`, `sync` — RESEARCH.md confirms "nothing else" exists in `apps/api/src/`). `CatalogModule` is the first new top-level module this phase adds; keep it as narrow as `HealthModule`.

### Hand-rolled `Set<string>` validation, not a decorator library
**Source:** `apps/api/src/sync/sync.service.ts` lines 49-50, 196-225
**Apply to:** `load_type` validation in `hasInvalidField`, and any custom-exercise field validation. Confirmed by RESEARCH.md: `class-validator` has no attachment point because the write path is `SyncService.hasInvalidField`, not a REST DTO.

### Patch-aware field mapping via exhaustive `PatchFieldMap<V>`
**Source:** `apps/api/src/sync/patch-update-set.ts` (full file)
**Apply to:** `ExerciseValues`/`EXERCISE_PATCH_FIELDS` — every new synced-table extension in this phase must follow this exact compile-time-exhaustive shape, per the file's own stated purpose (line 50-55).

### Ownership resolution: null owner is never adoptable
**Source:** `apps/api/src/sync/sync.service.ts` lines 407-420 (existing `workoutSession` ownership logic) + RESEARCH.md Pattern 2/Security Domain threat table
**Apply to:** the `exercise` root-resolution extension and any future table with a nullable owner column. This is the single most safety-critical pattern in the phase — a bug here is a cross-user data-integrity hole (STRIDE: Tampering/Elevation of Privilege, per RESEARCH.md's threat table).

### Deterministic, committed generated artifacts for data transforms
**Source:** `apps/api/src/seed/generate-corpus.ts` (mulberry32 PRNG, FNV-1a seed fold, lines 18-45)
**Apply to:** `normalize-catalog.ts` — no `Math.random()`, output is a reviewable/re-runnable committed JSON artifact, not a one-shot inline transform (RESEARCH.md's Don't-Hand-Roll table, "Muscle-taxonomy mapping" row).

### e2e test harness: spawned built API + real Postgres over HTTP
**Source:** `apps/api/test/sync-push.e2e-spec.ts` (lines 1-40+), `apps/api/test/sync-aggregate.e2e-spec.ts`
**Apply to:** `exercise-sync.e2e-spec.ts`, `user-exercise-preference.e2e-spec.ts` — this codebase does not use Nest's in-process `TestingModule` for sync/auth tests because `@thallesp/nestjs-better-auth`/`better-auth` are ESM-only; instead it spawns the built artifact and drives it via `supertest` over real HTTP against a real Postgres instance. Follow this exact harness shape (dotenv config lines, `freePort()`, `waitForReady()`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/mobile/app/exercise/[id].tsx` | component | request-response (local read) | First dynamic Expo Router route in this codebase — no existing `[param].tsx` file to copy structure from. Planner should follow Expo Router's own file-based dynamic-segment convention directly (not a codebase analog) and reuse the `(tabs)/*.tsx` screen-component shape for the body. |
| `apps/mobile/lib/catalog/search-index.ts` | utility | transform | First search/indexing utility in `lib/` — nearest sibling by directory discipline is `apps/mobile/lib/db/id.ts` (pure module, no Nest, single exported function), but there is no existing MiniSearch-wrapping code to copy a concrete excerpt from. Build directly from RESEARCH.md's Standard Stack guidance (MiniSearch 7.2.0, `apps/mobile` `pnpm --filter mobile add minisearch`). |

## Metadata

**Analog search scope:** `apps/api/src/{db,sync,catalog,health,mailer,seed}`, `apps/mobile/{app,lib}`, `packages/api-contracts/src`, `apps/api/test/*.e2e-spec.ts`
**Files scanned:** 19 read directly this session (catalog.ts, sync.service.ts, patch-update-set.ts, sync.controller.ts, health.controller.ts, health.module.ts, mailer.module.ts, generate-corpus.ts (partial), schema.ts (mobile), powersync.ts (mobile), sync.ts (api-contracts), history.tsx, sync-push.e2e-spec.ts (partial)) plus directory listings for `apps/api/src/{health,mailer,seed}`, `apps/api/test/`, `apps/mobile/app/`
**Pattern extraction date:** 2026-08-18
