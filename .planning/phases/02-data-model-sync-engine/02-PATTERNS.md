# Phase 2: Data Model & Sync Engine - Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** 17
**Analogs found:** 15 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/api/src/db/schema/session.ts` (WorkoutSession/SessionExercise/LoggedSet) | model | CRUD | `apps/api/src/db/schema.ts` | exact (same file being extended/split) |
| `apps/api/src/db/schema/program.ts` (Routine/RoutineDay/RoutineExercise) | model | CRUD | `apps/api/src/db/schema.ts` | exact |
| `apps/api/src/db/schema/catalog.ts` (MuscleGroup/Exercise/ExerciseMuscleMapping) | model | CRUD | `apps/api/src/db/schema.ts` | exact |
| `apps/api/src/db/schema/equipment.ts` (EquipmentProfile) | model | CRUD | `apps/api/src/db/schema.ts` | exact |
| `apps/api/src/db/schema/records.ts` (PersonalRecord/BodyMetric/ProgressPhoto) | model | CRUD | `apps/api/src/db/schema.ts` | exact |
| `apps/api/src/db/schema.ts` (barrel update — merge new tables into `schema`) | model | CRUD | itself | exact |
| `apps/api/src/sync/sync.module.ts` | module | request-response | `apps/api/src/health/health.module.ts` | role-match (simplest Nest module in repo) |
| `apps/api/src/sync/sync.controller.ts` (PowerSync connector target / push endpoint) | controller | request-response, event-driven (batched crud ops) | `apps/api/src/health/health.controller.ts` (routing/decorator shape) + `apps/api/src/common/min-client-version.guard.ts` (guard/ownership-check shape) | role-match |
| `apps/api/src/sync/sync.service.ts` (per-aggregate transactional apply, conflict dispatch) | service | CRUD, transform | `apps/api/src/db/drizzle.module.ts` (only existing service-adjacent DB access point) | partial — no service layer exists yet, closest is the DB module itself |
| `apps/api/src/sync/conflict-log.ts` | model/utility | event-driven | `apps/api/src/db/schema.ts` (for the table) + `apps/api/src/common/client-version.constants.ts` (for a small self-contained utility module shape) | partial |
| `apps/api/src/seed/generate-corpus.ts` | utility | batch | none — no seed script exists in the repo | no analog |
| `apps/mobile/lib/db/schema.ts` (local Drizzle table defs, mirrors server) | model | CRUD | `apps/api/src/db/schema.ts` | role-match (cross-runtime analog) |
| `apps/mobile/lib/db/powersync.ts` (PowerSyncDatabase instantiation) | provider | streaming | `apps/mobile/lib/api-client.ts` (single shared-instance module pattern) | partial |
| `apps/mobile/lib/db/connector.ts` (uploadData via apiFetch) | service | request-response | `apps/mobile/lib/api-client.ts` + `apps/mobile/lib/session-guard.ts` | exact (this IS the reuse point named in RESEARCH.md) |
| `apps/mobile/lib/pending-write-count.ts` (replaces stub in `sign-out.ts`) | utility | CRUD (read local queue) | `apps/mobile/lib/sign-out.ts` (`pendingWriteCount` stub itself) | exact — direct seam replacement |
| `apps/mobile/lib/export/export-training-data.ts` | utility | file-I/O | `apps/mobile/lib/auth-storage.ts` (nearest client-side persistence/IO module) | partial |
| `apps/mobile/lib/calendar-day.ts` (local_date/timezone capture at session start) | utility | transform | `apps/mobile/lib/client-version.ts` (small pure-value utility module shape) | partial |

## Pattern Assignments

### `apps/api/src/db/schema/*.ts` (model, CRUD) — new domain tables

**Analog:** `apps/api/src/db/schema.ts` (full file, lines 1-89)

**Imports pattern:**
```typescript
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
```
For the new tables, extend with `numeric`, `integer`, `date`, and cross-file imports of `user`:
```typescript
import { pgTable, text, timestamp, integer, numeric, boolean, date } from 'drizzle-orm/pg-core';
import { user } from '../schema';
```

**Core CRUD/ownership pattern** (lines 17-34, `session` table — copy this shape for every synced table):
```typescript
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    // ...
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);
```
**Load-bearing detail:** `user.id` is `text`, not `uuid` (Better Auth's own ID shape) — every synced table's ownership column (`user_id`) must be declared `text().references(() => user.id, { onDelete: 'cascade' })`, matching this exactly, not defaulting to a `uuid` type. Primary keys for user-authored rows are also `text` (the client-generated UUID, D-02), storing it as a string, not Postgres's native `uuid` type — mirrors how `session.id`/`account.id` are already `text`.

**Relations pattern** (lines 76-87):
```typescript
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));
```
Every new domain table needs a matching `relations()` export, and the parent-side `many()` array on `user` must be extended (or, once split into `db/schema/*.ts` files per RESEARCH.md's recommended structure, each domain file exports its own relations and `db/schema.ts` becomes the barrel).

**Barrel export pattern** (line 89):
```typescript
export const schema = { user, session, account, verification };
```
Every new table must be added to this object — `drizzle(pool, { schema })` in `drizzle.module.ts` and every Drizzle query depend on it being complete. This is also what `schema-parity.e2e-spec.ts` (see below) checks against the live database.

---

### `apps/api/src/sync/sync.module.ts` (module, request-response)

**Analog:** `apps/api/src/health/health.module.ts` (full file, 8 lines)

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```
Copy this exact shape for `SyncModule` — no providers beyond the controller and (once written) `SyncService`. Then wire it into `apps/api/src/app.module.ts`'s `imports: [...]` array, following the existing registration pattern (lines 11-13) — but note the guarding comment already in that file:
```typescript
// No controller for per-user mutable domain data lives here or is added later in this phase:
// ARCHITECTURE.md §3 Anti-Pattern 1 reserves that ingress for Phase 2's SyncModule.
@Module({
  imports: [DrizzleModule, AuthModule, HealthModule, MailerModule],
  providers: [{ provide: APP_GUARD, useClass: MinClientVersionGuard }],
})
export class AppModule {}
```
That comment is the explicit seam this phase fills — `SyncModule` is the one controller this comment was written in anticipation of. Add it to the `imports` array; it does not need its own `APP_GUARD` entry, the existing global guard already applies.

---

### `apps/api/src/sync/sync.controller.ts` (controller, request-response / event-driven)

**Analogs:**
- Routing/decorator shape: `apps/api/src/health/health.controller.ts`
- Ownership/ordering enforcement shape: `apps/api/src/common/min-client-version.guard.ts`

**Controller skeleton pattern** (from `health.controller.ts`, lines 1-11):
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
`SyncController` should NOT use `@AllowAnonymous()` — every sync route requires an authenticated session (V4 Access Control, RESEARCH.md Security Domain). Follow the versioned-route convention (omit `version: VERSION_NEUTRAL` so it participates in the app's normal `/v1/...` versioning and the `MinClientVersionGuard`, unlike health).

**Ownership-check pattern to replicate inside the handler body** (adapted from `min-client-version.guard.ts`'s header-extraction style, lines 14-26): every push op must re-verify `userId` against the authenticated session before applying — do not trust a client-supplied `user_id` field (RESEARCH.md Security Domain, "malicious/buggy client pushing a crud op for another user's row id").

**Push handler pattern** (from RESEARCH.md Pattern 1/Pattern 2, to implement as the controller body):
```typescript
// apps/api/src/sync/sync.controller.ts — illustrative, adapt to actual Nest DI
@Post('sync/push')
async push(@Body() body: { batch: CrudOp[] }, @Session() session: AuthSession) {
  return this.syncService.applyBatch(session.userId, body.batch);
}
```

---

### `apps/api/src/sync/sync.service.ts` (service, CRUD/transform)

**Analog:** `apps/api/src/db/drizzle.module.ts` (full file, 33 lines) — this is the only existing DB-access-adjacent code; no service layer exists yet in this codebase (auth/mailer are Nest modules wrapping third-party libraries, not hand-written CRUD services).

**Transaction pattern to introduce** (RESEARCH.md Pattern 2, this is new code, not extracted from an existing file):
```typescript
await db.transaction(async (tx) => {
  for (const op of sessionAggregateOps) {
    await applyOp(tx, op); // insert/update/delete, idempotent on client UUID (D-02)
  }
});
```
Inject `DRIZZLE` the same way any future service would — `drizzle.module.ts`'s `DRIZZLE` symbol/provider (lines 15, 27-31) is the only DI seam for Postgres access in this repo; there is no repository-pattern layer to imitate, so `SyncService` is the first of its kind and should establish that convention directly rather than search for a nonexistent precedent.

---

### `apps/api/src/sync/conflict-log.ts` (model/utility, event-driven)

**Analog (table shape):** `apps/api/src/db/schema.ts`'s `session`/`account` table pattern (ownership column, `text` PK) — same pattern as above.
**Analog (small self-contained module shape):** `apps/api/src/common/client-version.constants.ts` — not read in full this pass, but its role (small pure constants/helpers module, no controller, no DI) is the right shape to imitate for any pure conflict-log helper functions that don't need to be Nest-injectable.

No direct analog exists for "durable audit log written by a backend connector on overwrite" — this is new domain logic. Follow the ownership-column and transactional-apply conventions above; write conflict-log rows inside the same `db.transaction()` as the overwrite itself (RESEARCH.md Decision 2), not as a separate best-effort call.

---

### `apps/api/src/seed/generate-corpus.ts` (utility, batch)

**No analog found.** No seed script exists anywhere in this codebase. Use RESEARCH.md's own Decision 8 corpus shape (18 months, ~4 sessions/week, ~15 sets/session, ~4,650 `LoggedSet` rows) and the Standard Stack's `@faker-js/faker` recommendation as the starting point instead of a codebase pattern. Structurally, it is a standalone Node script invoked against `apps/api/src/db` — follow `drizzle.module.ts`'s own `.env` loading convention (lines 1-8 of that file) since a seed script run via `ts-node`/`tsx` outside Nest's bootstrap needs the same explicit dotenv load:
```typescript
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });
```

---

### `apps/mobile/lib/db/schema.ts` (model, CRUD, local/client-side)

**Analog:** `apps/api/src/db/schema.ts` — mirror the same table shapes but with SQLite-compatible Drizzle types (no `pgTable`, use PowerSync's `Schema`/`Table` or `@powersync/drizzle-driver`'s SQLite-flavored table builder per RESEARCH.md's Standard Stack). Column-naming and ownership-column conventions (snake_case columns, `text` id/userId) should stay identical to the server schema so the two stay structurally in sync, matching `schema-parity.e2e-spec.ts`'s own concern (see Shared Patterns below) applied to the client side.

---

### `apps/mobile/lib/db/connector.ts` (service, request-response) — the PowerSync backend connector

**Analog:** `apps/mobile/lib/api-client.ts` (full file, 78 lines) + `apps/mobile/lib/session-guard.ts`'s `AuthOutcome` union (line 1)

This is the single most concrete, load-bearing reuse point in this phase — RESEARCH.md's own Code Examples section already sketches it directly against these two files:

```typescript
// apps/mobile/lib/api-client.ts:1-2 — the exact import shape to reuse
import { CLIENT_VERSION, CLIENT_VERSION_HEADER } from './client-version';
import { classifyAuthOutcome, type AuthOutcome } from './session-guard';
```

```typescript
// apps/mobile/lib/api-client.ts:53-77 — apiFetch's outcome-classification shape,
// the exact pattern uploadData() must follow
export async function apiFetch(
  input: string,
  init: ApiFetchInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiFetchResult> {
  const credential = await resolveSessionCredential(input);
  const headers = { ...(init.headers ?? {}), [CLIENT_VERSION_HEADER]: CLIENT_VERSION, ...(credential ? { cookie: credential } : {}) };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, headers, signal: controller.signal });
    const outcome = await classifyAuthOutcome(response);
    return { response, outcome };
  } catch (error) {
    const outcome = await classifyAuthOutcome(error);
    return { response: null, outcome };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

`connector.ts`'s `uploadData()` must call `apiFetch('/v1/sync/push', ...)` (never raw `fetch`), then branch on the returned `AuthOutcome` exactly as `session-guard.ts:1` defines it — `'ok' | 'offline' | 'revoked' | 'rejected'`:
```typescript
// Source: RESEARCH.md Code Examples, "PowerSync connector honoring D-09's offline classification"
import { apiFetch } from '../api-client';

async function uploadData(database: AbstractPowerSyncDatabase) {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;

  const { outcome } = await apiFetch('/v1/sync/push', {
    method: 'POST',
    body: JSON.stringify({ batch: transaction.crud }),
  });

  if (outcome === 'ok') {
    await transaction.complete();
  }
  // 'offline' -> leave queued for retry (D-09's transport-failure branch)
  // 'revoked' -> surface to the same session-invalidation path Phase 1 already built
  // 'rejected' -> surface as a genuine validation failure, do not silently retry forever
}
```
**Do not** introduce a second definition of "offline" — reuse `classifyAuthOutcome`/`AuthOutcome` verbatim rather than inventing new connectivity states (D-09).

---

### `apps/mobile/lib/pending-write-count.ts` (utility, CRUD) — replaces the sign-out stub

**Analog:** `apps/mobile/lib/sign-out.ts` (full file, 39 lines) — this is a direct seam replacement, not a fresh pattern.

```typescript
// apps/mobile/lib/sign-out.ts:5-10 — the exact function this phase must replace
// The seam D-04 requires. Always 0 in Phase 1 — there is no local database yet — so Phase 2
// replaces this one function body with a real count rather than threading a confirmation into a
// sign-out lifecycle that already shipped without one.
export async function pendingWriteCount(): Promise<number> {
  return 0;
}
```
The new implementation should query the PowerSync crud queue's pending-op count (`database.getCrudBatch()`/equivalent SDK call) and can either replace this function body in place or be exported from `apps/mobile/lib/pending-write-count.ts` and re-exported/imported by `sign-out.ts`, preserving the existing `SignOutOptions.getPendingCount` injection seam (lines 12-15, 29):
```typescript
export interface SignOutOptions {
  confirmDiscard?: (pendingCount: number) => Promise<boolean> | boolean;
  getPendingCount?: () => Promise<number>;
}
// ...
export async function signOut(options: SignOutOptions = {}): Promise<void> {
  const getPendingCount = options.getPendingCount ?? pendingWriteCount;
  const pendingCount = await getPendingCount();
  if (pendingCount > 0) {
    const confirmed = options.confirmDiscard ? await options.confirmDiscard(pendingCount) : false;
    if (!confirmed) return;
  }
  await revokeServerSession();
  await clearCachedSession();
}
```
This function-injection shape (`getPendingCount` overridable for tests) is itself the pattern to preserve — do not hardcode the PowerSync call directly into `signOut()`, keep it swappable exactly as `sign-out.ts` already models with `confirmDiscard`.

---

### `apps/mobile/lib/export/export-training-data.ts` (utility, file-I/O)

**Analog:** `apps/mobile/lib/auth-storage.ts` (not read in full this pass, but it is the nearest existing client-side persistence module — `sign-out.ts` imports `clearCachedSession` from it, confirming it owns local storage read/write concerns already). Follow its module-scope, single-responsibility-function shape (small named exports, no class) rather than introducing a new stylistic pattern. Uses `expo-file-system`/`expo-sharing` per RESEARCH.md Decision 7 — no existing file-I/O precedent in the repo, so these calls are new but the surrounding module shape (small pure async functions, explicit exported types) should match `sign-out.ts`'s style.

---

### `apps/mobile/lib/calendar-day.ts` (utility, transform)

**Analog:** `apps/mobile/lib/client-version.ts` (small pure-value utility module — not read in full this pass, but its role per `api-client.ts`'s import of `CLIENT_VERSION`/`CLIENT_VERSION_HEADER` confirms it is a small constants/helpers module with no side effects). Follow that shape: a pure function computing `{ timezone, localDate }` at session-start, per RESEARCH.md Pattern 3:
```typescript
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const startedAt = new Date();
const localDate = startedAt.toLocaleDateString('en-CA', { timeZone: timezone }); // "YYYY-MM-DD"
```

---

## Shared Patterns

### Ownership column convention (V4 Access Control)
**Source:** `apps/api/src/db/schema.ts` lines 29-31 (`session.userId`), 42-44 (`account.userId`)
**Apply to:** Every new domain table in `apps/api/src/db/schema/*.ts`
```typescript
userId: text('user_id')
  .notNull()
  .references(() => user.id, { onDelete: 'cascade' }),
```
`user.id` is `text`, never `uuid` — this is the single most load-bearing convention carried into this phase (RESEARCH.md explicitly flags it).

### Dotenv bootstrap for any standalone script
**Source:** `apps/api/src/db/drizzle.module.ts` lines 1-8
**Apply to:** `apps/api/src/seed/generate-corpus.ts`, and any e2e spec file (all of `apps/api/test/*.e2e-spec.ts` already repeat this exact block)
```typescript
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });
```

### AuthOutcome-based connectivity classification (D-09)
**Source:** `apps/mobile/lib/session-guard.ts` (full file, `AuthOutcome` type + `classifyAuthOutcome`)
**Apply to:** `apps/mobile/lib/db/connector.ts`'s `uploadData()` — the sync worker's retry/backoff/offline logic must branch on this exact union (`'ok' | 'offline' | 'revoked' | 'rejected'`), never introduce a parallel connectivity concept.

### Guard/middleware-based cross-cutting enforcement
**Source:** `apps/api/src/common/min-client-version.guard.ts` (full file)
**Apply to:** Any per-request enforcement the sync controller needs beyond ownership checks (e.g. batch-size limits, malformed-op rejection) — follow the `CanActivate`-guard shape already established, registered via `APP_GUARD` in `app.module.ts`, rather than inlining checks ad hoc in the controller.

### e2e test harness against a spawned built server
**Source:** `apps/api/test/version-guard.e2e-spec.ts` (full file, 107 lines) — `freePort()`, `waitForReady()`, `spawn(process.execPath, [dist/main.js])` pattern
**Apply to:** `apps/api/test/sync-push.e2e-spec.ts`, `concurrent-edit.e2e-spec.ts`, `seeded-corpus-perf.e2e-spec.ts` (all named in RESEARCH.md's Wave 0 Gaps) — reuse this exact spawn/port/ready-poll harness rather than writing a new one per suite.

### Schema-parity assertion against the live database
**Source:** `apps/api/test/schema-parity.e2e-spec.ts` (full file, 69 lines)
**Apply to:** Extend `REQUIRED_TABLES`/table-specific column checks to cover every new domain table this phase adds — this is the existing mechanism that catches "typecheck passes but the database was never migrated," and it must grow with the schema rather than staying auth-only.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/api/src/seed/generate-corpus.ts` | utility | batch | No seed/fixture-generation script exists anywhere in the repo yet; follow RESEARCH.md Decision 8's corpus shape and Standard Stack's `@faker-js/faker` recommendation instead of a codebase analog |
| `apps/mobile/lib/db/powersync.ts` (PowerSyncDatabase instantiation/AppSchema wiring) | provider | streaming | No client-side database/provider instantiation module exists yet (Phase 1 shipped no local database) — follow PowerSync's own official setup docs (Context7 `/powersync-ja/powersync-docs`) cited throughout RESEARCH.md rather than a codebase pattern; `apps/mobile/lib/api-client.ts`'s single-shared-module-scope-instance shape (`let sessionCredentialProvider`) is the closest structural precedent for "one instance, lazily configured via a setter" but the domain (SQLite/live-query engine vs. HTTP client) has no real overlap |

## Metadata

**Analog search scope:** `apps/api/src/**`, `apps/api/test/**`, `apps/mobile/lib/**`
**Files scanned:** 24 (14 read in full/near-full this session, 10 discovered via directory listing and referenced by role without a full read where a stronger analog already covered the pattern)
**Pattern extraction date:** 2026-08-15
