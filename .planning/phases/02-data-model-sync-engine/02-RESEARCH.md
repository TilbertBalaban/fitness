# Phase 2: Data Model & Sync Engine - Research

**Researched:** 2026-08-15
**Domain:** Local-first sync engine (PowerSync + Postgres/Drizzle + on-device SQLite), offline-mutable domain data model, cross-device conflict resolution
**Confidence:** MEDIUM-HIGH (sync-engine mechanics and current package versions are freshly verified against official docs/npm; the RN-Web beta status and the absence of a native toolchain on this machine are real, load-bearing gaps this document does not paper over)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `SyncModule` is the sole ingress for per-user, offline-mutable data. No conventional REST CRUD endpoint may be created for any synced entity. Reserve ordinary endpoints for auth, media upload URL issuance, and first-install catalog download only. — Reversibility: one-way.
- **D-02:** Every user-authored row carries a client-generated UUID issued at creation time, before any network round-trip. The server never assigns primary identity for user-authored rows. — Reversibility: one-way.
- **D-03:** The pull cursor is a server-assigned monotonic sequence, never a wall-clock timestamp. — Reversibility: one-way.
- **D-04:** Weights are stored canonically in kg as decimal, never float, converted only at the input/display boundary. — Reversibility: one-way.
- **D-05:** Prescriptions are snapshotted onto `SessionExercise` at session start and never re-read from `RoutineExercise` afterward. No whole-`Routine` version tree. — Reversibility: one-way.
- **D-06:** Grouping is an annotation column on a flat list, never a nested structure (`superset_group_id`, `parent_set_id`, strictly incrementing `set_index`). — Reversibility: costly.
- **D-07:** No CRDT machinery. Single user across personal devices is hub-and-spoke, not multi-writer collaboration. — Reversibility: reversible.
- **D-08:** Sign-out clears the local database and secure storage, after an explicit confirmation when unsynced writes are pending. Phase 1 shipped the confirmation hook with a hard-coded zero count; this phase wires a real count into that existing seam. — Reversibility: costly.
- **D-09:** Transport failure and definitive rejection are already separate branches in the API client (Phase 1 D-03/`classifyAuthOutcome`). Sync retry/backoff/"am I offline" classification attaches to that existing split. — Reversibility: reversible.

### Claude's Discretion (resolved by this research — see Decisions sections below)

- Sync engine: adopt PowerSync, or build the protocol `ARCHITECTURE.md` §3 specifies? — **Resolved: adopt PowerSync**, with an explicit RN-Web-beta risk flag and a Wave 0 spike gate. See "Decision 1."
- Conflict model: reconcile `ARCHITECTURE.md` §3 (row-level sequence-keyed LWW) with `PITFALLS.md` §1 (push toward field/set granularity and an append-only posture). — **Resolved: per-entity policy, not one global rule**, with a durable conflict log. See "Decision 2."
- Delete and tombstone semantics — **Resolved: let PowerSync's native DELETE op be the tombstone mechanism; soft-delete only for entities with logged-history dependents.** See "Decision 3."
- Schema scope for this phase — **Resolved: land the full domain schema now; seed only a few dozen representative exercises, not the ~900-exercise catalog.** See "Decision 4."
- Local schema migration and the data-preservation guarantee — **Resolved: PowerSync's client schema is schemaless/view-based, which changes what "migration" means here.** See "Decision 5."
- Calendar-day attribution and timezone policy (LOG-22) — **Resolved: store UTC instant + IANA timezone + a stored local-date column, derived from `started_at`.** See "Decision 6."
- Data export (PLAT-10) — **Resolved: client-side JSON export from local SQLite for v1.** See "Decision 7."
- Performance budget — **Resolved: explicit numeric targets proposed below, tagged `[ASSUMED]`, need user confirmation.** See "Decision 8."

### Deferred Ideas (OUT OF SCOPE)

- Offline/sync status indicator in the UI — this phase exposes the state it would render, not the component; belongs to Phase 5 at the earliest.
- `RoutineRevision` audit trail — optional, low-stakes, not built until a concrete feature asks for it.
- Server-side analytics rollups and PR reconciliation — Phase 9/10 work.
- Native deep links — unrelated to this phase, carried forward from Phase 1 D-07.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-02 | User can log a complete workout start to finish with zero network connectivity | Local-first write path: every write lands in on-device SQLite (PowerSync-managed) first; sync is a background concern. See System Architecture, Decision 1. |
| PLAT-03 | User's offline changes sync automatically once connectivity returns, without any manual sync action | PowerSync's crud-queue drain on reconnect, wired to Phase 1's D-03 transport-failure/offline classification (D-09). See Decision 1, Architecture Patterns. |
| PLAT-04 | User's phone and browser converge correctly after both made changes offline, with no logged set silently lost | Per-entity conflict policy + durable conflict log + automated two-device concurrent-edit test. See Decision 2, Validation Architecture. |
| PLAT-07 | User's in-progress workout survives app force-quit, crash, or phone restart with every logged set intact | Every `LoggedSet` write persists to local SQLite immediately (PowerSync's local-first write-through), not on a "finish workout" action. See Domain Data Model, Pitfall 6 cross-reference. |
| PLAT-08 | User can choose kg or lb and see every weight in that unit, with no drift in stored values over repeated conversions | Canonical kg-as-decimal storage (D-04), conversion only at the display boundary. See Domain Data Model §Units. |
| PLAT-10 | User can export their training data | Client-side JSON export from local SQLite. See Decision 7. |
| LOG-22 | User's workout is attributed to the calendar day it was logged in, regardless of timezone or a late-night finish | UTC instant + IANA timezone + stored local-date column, derived from `started_at`. See Decision 6. |
</phase_requirements>

## Summary

This phase's central engineering call — sync engine — has a clean answer once verified against current docs rather than the STACK.md snapshot from five days earlier: **PowerSync remains the right choice**, and two of the three concerns raised in `CONTEXT.md` turn out to be resolved or substantially reduced by facts that weren't available at the time `STACK.md`/`ARCHITECTURE.md` were written. First, PowerSync's self-hosted Service no longer requires MongoDB — it now supports Postgres as its bucket-storage backend `[VERIFIED: Context7 /powersync-ja/powersync-docs, self-hosted-instances.mdx]`, removing the second-database-engine objection entirely. Second, PowerSync's client-side schema is **schemaless at the protocol level** — the local SQLite schema is applied as SQLite views and "updates immediately upon application deployment without needing migrations" `[VERIFIED: Context7 /powersync-ja/powersync-docs, react-native-and-expo.mdx]`. This substantially de-risks success criterion 4 (schema migration preserving unsynced data) compared to the hand-rolled `PRAGMA user_version` migration story `ARCHITECTURE.md` §3 assumed. Third, and the one place this research surfaces a genuine, previously-unflagged risk: PowerSync's React Native Web support is **explicitly labeled beta** `[VERIFIED: Context7 /powersync-ja/powersync-docs, react-native-web-support.mdx]` and requires nonstandard Metro/worker-asset configuration. Given this project's own constraint (no Xcode, no Android SDK on this machine — native runtime verification is unavailable), the web target is also the *only* target this phase can actually run end-to-end during development, which makes the beta-web-support risk higher-stakes here than it would be for a project that could fall back to native verification. This phase's plan must therefore open with a Wave 0 spike that stands up PowerSync on the web target before any other work depends on it, with WatermelonDB (STACK.md's own documented fallback) as the explicit escape hatch if the spike fails.

The domain data model itself is settled — `ARCHITECTURE.md` §1 is thorough and internally consistent, and this research found no reason to deviate from it. The two remaining open calls (conflict-model granularity, delete/tombstone semantics) both have concrete, PowerSync-native answers below rather than requiring new machinery to be built.

**Primary recommendation:** Adopt PowerSync (RN + Web SDKs, Postgres-backed storage, no MongoDB), land the full domain schema now with a small representative exercise fixture (not the full catalog), and gate the web-target spike as the first task in Wave 0 before any other Phase 2 work proceeds.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Domain schema definition (Drizzle, Postgres) | Database / Storage | API / Backend | Source-of-truth shape lives in Postgres via Drizzle; NestJS owns validation on write |
| Local SQLite schema (PowerSync `Schema`/`Table`) | Browser / Client | — | Client-only view layer; re-applied on each app boot, not migrated |
| Write path (log a set, start a session) | Browser / Client | — | Every write lands in local SQLite first, zero network dependency (PLAT-02, PLAT-07) |
| Sync push (outbox drain, `uploadData`) | Browser / Client | API / Backend | Client owns the queue; backend (`SyncModule`) owns validation and persistence of what's pushed |
| Sync pull (checkpoint/cursor) | API / Backend | Browser / Client | Server (PowerSync Service, reading Postgres logical replication) is authoritative for ordering; client applies |
| Conflict resolution | API / Backend | — | Per D-01/D-03, all writes flow through `SyncModule`; conflict policy is authored in the backend connector, not the client |
| Unit conversion (kg/lb) | Browser / Client | — | Convert only at input/display boundary; canonical storage is kg everywhere else (D-04) |
| Calendar-day attribution | Browser / Client | — | Must be computed at the moment/timezone of logging, on-device, never re-derived later from a different device's clock (LOG-22) |
| Data export | Browser / Client | — | Must work offline and include not-yet-synced writes (PLAT-10) |
| Seeded performance corpus (1-2yr) | Database / Storage | Browser / Client | Generated server-side (or via a seed script against Postgres) then synced down to exercise the real pull path, not inserted directly into local SQLite |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@powersync/react-native` | 2.1.0 `[VERIFIED: npm registry, 2026-08-15]` | Local-first sync engine, RN client SDK | Only sync engine in this project's evaluated set with official, actively-maintained SDKs on both RN and Web talking directly to Postgres (STACK.md's own comparison, re-verified below) |
| `@powersync/web` | 2.2.0 `[VERIFIED: npm registry, 2026-08-15]` | Local-first sync engine, Web client SDK (also used for the RN-Web target, see Decision 1) | Pairs with the RN SDK for the RN-Web beta configuration `[VERIFIED: Context7 /powersync-ja/powersync-docs, react-native-web-support.mdx]` |
| `@op-engineering/op-sqlite` | 18.0.0 `[VERIFIED: npm registry, 2026-08-15]`, min required 1.17.0 `[CITED: Context7 /powersync-ja/powersync-docs, snippets/react-native/installation.mdx]` | Underlying native SQLite adapter PowerSync's RN SDK requires | Required, explicit peer dependency of `@powersync/react-native` — not optional |
| `@powersync/drizzle-driver` | 0.8.0 `[VERIFIED: npm registry, 2026-08-15]` | Wraps a PowerSync-managed local database with Drizzle's query builder for type-safe local queries | Lets the client use the same Drizzle mental model/API on the local SQLite that the server uses on Postgres, via `DrizzleAppSchema`/`wrapPowerSyncWithDrizzle` `[CITED: Context7 /powersync-ja/powersync-docs, client-sdks/orms/js/drizzle.mdx]` — reduces the "two different query APIs" tax between client and server code |
| `drizzle-orm` | 0.45.2 `[VERIFIED: npm registry, 2026-08-15]` | Postgres access layer inside NestJS (already installed at `^0.45.0`, matches) | Already in use; `apps/api/src/db/schema.ts` and `drizzle.module.ts` are the attachment points `[VERIFIED: apps/api/src/db/schema.ts:1-89, apps/api/src/db/drizzle.module.ts:1-33]` |
| `drizzle-kit` | 0.31.10 `[VERIFIED: npm registry, 2026-08-15]` | Postgres schema migrations (`db:push`, already wired as an npm script) | `apps/api/package.json` already has `db:push`/`db:verify` scripts calling `drizzle-kit push` `[VERIFIED: apps/api/package.json]` |
| `expo-sqlite` | 57.0.1 `[VERIFIED: npm registry, 2026-08-15]` | Transitive requirement — the JSI/SQLite engine PowerSync's RN SDK sits above via op-sqlite | Already listed in STACK.md; confirmed still current |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `expo-file-system` | verify at install time (not yet in `apps/mobile/package.json`) | Writing the JSON export file to disk before sharing (PLAT-10) | Client-side data export, Decision 7 |
| `expo-sharing` | verify at install time (not yet in `apps/mobile/package.json`) | Native share sheet for the exported file | Client-side data export, Decision 7 |
| `@faker-js/faker` or a small hand-rolled generator | latest, verify at install | Seeded 1-2yr performance corpus generation (success criterion 3, PITFALLS.md §2) | Wave 0 fixture/seed script, not shipped to the app bundle |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PowerSync | WatermelonDB | Zero extra self-hosted-service infra (write two NestJS controllers instead), but PowerSync's protocol-level schemaless local schema and built-in monotonic checkpoint cursor (which satisfies D-03 "for free") both have to be hand-built with WatermelonDB. Documented fallback if the Wave 0 web-target spike fails — see Decision 1. |
| PowerSync self-hosted (Postgres storage) | PowerSync Cloud (Free tier: $0/mo, 2GB synced/mo, 500MB hosted `[CITED: PowerSync pricing page via WebSearch, 2026-08-15]`) | No local Docker/service-process ops burden during development — this machine has no Docker installed (`docker info` → command not found, verified this session) — but Free-tier instances deprovision after 7 days of no deploys/connections, which is a real annoyance for intermittent solo development, not production-viable long-term |
| Client-side + server-side data export (PLAT-10) | Server-side only | A server-side export would see the fully merged cross-device history, but does not work in the gym (violates the project's own core-value framing) and is not needed to satisfy PLAT-10's one requirement; deferred, not rejected — natural Phase 9/10 addition |

**Installation:**
```bash
# Client (Expo app, RN + Web)
cd apps/mobile
npx expo install @powersync/react-native @powersync/web @op-engineering/op-sqlite
npm install @powersync/drizzle-driver
npx expo install expo-file-system expo-sharing

# Backend (NestJS) — drizzle-orm/drizzle-kit already installed, no change needed
# PowerSync Service is a separate deployable, not an npm dependency of apps/api —
# see Decision 1 for self-hosted vs. Cloud setup.
```

**Version verification:** All versions above were confirmed via `npm view <pkg> version` against the live registry on 2026-08-15 (this session), not carried forward from STACK.md's 2026-08-05/10 snapshot. `@powersync/react-native` moved 2.0.2 → 2.1.0 and `@powersync/web` moved 2.1.1 → 2.2.0 in the intervening days, consistent with PowerSync's stated frequent-release cadence.

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@powersync/react-native` | npm | 2026-08-13 (2 days old) | 35,641/wk | `github.com/powersync-ja/powersync-js` | SUS (`too-new`) | Approved with note — see below |
| `@powersync/web` | npm | 2026-08-13 (2 days old) | 69,820/wk | `github.com/powersync-ja/powersync-js` | SUS (`too-new`) | Approved with note |
| `@op-engineering/op-sqlite` | npm | 2026-08-14 (1 day old) | 129,861/wk | `github.com/OP-Engineering/op-sqlite` | SUS (`too-new`) | Approved with note |
| `@powersync/drizzle-driver` | npm | 2026-07-21 (25 days old) | 13,122/wk | `github.com/powersync-ja/powersync-js` | SUS (`too-new`) | Approved with note |
| `drizzle-orm` | npm | 2026-03-27 | 18.2M/wk | `github.com/drizzle-team/drizzle-orm` | OK | Approved |
| `drizzle-kit` | npm | 2026-03-17 | 15.3M/wk | `github.com/drizzle-team/drizzle-orm` | OK | Approved |
| `expo-sqlite` | npm | 2026-07-15 | 907,165/wk | `github.com/expo/expo` | OK | Approved |

**Note on the four `SUS`-flagged PowerSync packages:** the `too-new` signal fires on the *latest version's* publish date, not the package's overall age — these are established, high-download, actively-maintained packages with real GitHub repos matching the official Context7-fetched documentation used throughout this research (PowerSync ships frequent point releases, consistent with the version bump observed between STACK.md's 2026-08-05 capture and this session). This is very likely a false positive of the "too-new" heuristic against a fast-release-cadence vendor, not a slopsquat/hallucination signal — but per the Package Legitimacy Gate protocol, the verdict is recorded as returned and each install must still be gated behind a `checkpoint:human-verify` task rather than silently waved through, since the protocol does not permit the researcher's own confidence to override a `SUS` disposition.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@powersync/react-native`, `@powersync/web`, `@op-engineering/op-sqlite`, `@powersync/drizzle-driver` — planner must add a `checkpoint:human-verify` task before each is installed, most naturally combined with the Wave 0 spike task itself.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────── Client (Expo RN + RN Web) ────────────────────────┐
│                                                                            │
│  UI action (log a set, start a session)                                  │
│         │                                                                 │
│         ▼                                                                 │
│  Write via @powersync/drizzle-driver ──► Local SQLite (PowerSync-managed) │
│         │                                     │                           │
│         │                                     ▼                           │
│         │                            PowerSync crud queue (outbox)        │
│         │                                     │                           │
│         ▼                                     │ on reconnect / foreground │
│  UI reads reactively from local SQLite         │ (Phase 1 D-09 offline    │
│  (live queries — zero network wait)            │  classification gates    │
│                                                 │  the retry loop)         │
│                                                 ▼                          │
│                              uploadData(connector) ──► apiFetch()         │
└─────────────────────────────────────────────────┼────────────────────────┘
                                                    │ POST /v1/sync/push
                                                    │ (idempotent by client UUID, D-02)
┌───────────────────────────────────────────────────▼──────────────────────┐
│                              NestJS Backend                               │
│  SyncModule (sole ingress, D-01)                                          │
│    ├─ validates + applies within one Postgres transaction per aggregate   │
│    │  (WorkoutSession + its SessionExercises + its LoggedSets)            │
│    ├─ conflict policy per entity (Decision 2) — row-level LWW for         │
│    │  session metadata, field-level-aware LWW + conflict log for sets     │
│    └─ delegates PR reconciliation / analytics trigger to domain modules   │
│                    │                                                       │
│                    ▼                                                       │
│              Postgres (source of truth)                                   │
│                    │ logical replication (wal_level=logical)              │
│                    ▼                                                       │
│           PowerSync Service (bucket/checkpoint layer,                     │
│           storage backend = Postgres, not MongoDB — Decision 1)           │
└─────────────────────────────────────────────────┬──────────────────────┘
                                                    │ GET /sync/stream (checkpoint-based)
┌───────────────────────────────────────────────────▼──────────────────────┐
│  Other device's local SQLite applies the pulled bucket ops                │
│  (server-assigned monotonic checkpoint — D-03 satisfied by construction)  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
apps/api/src/
├── db/
│   ├── schema.ts              # extend with domain tables (Decision 4) alongside existing auth tables
│   ├── schema/                # split by domain once schema.ts grows past auth-only shape:
│   │   ├── catalog.ts         #   MuscleGroup, Exercise, ExerciseMuscleMapping
│   │   ├── equipment.ts       #   EquipmentProfile
│   │   ├── program.ts         #   Routine, RoutineDay, RoutineExercise
│   │   ├── session.ts         #   WorkoutSession, SessionExercise, LoggedSet
│   │   └── records.ts         #   PersonalRecord, BodyMetric, ProgressPhoto
│   └── drizzle.module.ts      # unchanged — one connection, all tables attach here
├── sync/
│   ├── sync.module.ts         # the sole ingress (D-01)
│   ├── sync.controller.ts     # PowerSync connector target, or push/pull if WatermelonDB fallback taken
│   ├── sync.service.ts        # per-aggregate transactional apply, conflict policy dispatch
│   └── conflict-log.ts        # durable record of any overwritten LoggedSet (Decision 2)
└── seed/
    └── generate-corpus.ts     # 1-2yr realistic seed script (success criterion 3, PITFALLS.md §2)

apps/mobile/lib/
├── db/
│   ├── schema.ts               # Drizzle table defs, mirrors server shape but SQLite types only
│   ├── powersync.ts            # PowerSyncDatabase instantiation, AppSchema, wrapPowerSyncWithDrizzle
│   └── connector.ts            # PowerSyncBackendConnector — uploadData() calling apiFetch()
├── sync-status.ts               # exposes pending/connected state for the Phase 5 UI to consume later (Deferred)
├── pending-write-count.ts       # replaces the Phase 1 stub in sign-out.ts (D-08)
└── export/
    └── export-training-data.ts  # PLAT-10, Decision 7
```

### Pattern 1: PowerSync backend connector as the D-01 enforcement point
**What:** The `PowerSyncBackendConnector`'s `uploadData()` is the *only* function that ever calls the mutating sync endpoints; the app never issues an ordinary `POST /v1/workout-sessions` or similar for synced data.
**When to use:** Every synced entity write in this phase, without exception.
**Example:**
```typescript
// Source: Context7 /powersync-ja/powersync-docs, handling-writes/custom-conflict-resolution.mdx
// (adapted to this project's apiFetch/D-09 transport-classification pattern)
async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;

  const { outcome } = await apiFetch('/v1/sync/push', {
    method: 'POST',
    body: JSON.stringify({ batch: transaction.crud }),
  });

  if (outcome === 'ok') {
    await transaction.complete();
  }
  // 'offline' outcome: leave the transaction queued, PowerSync retries on next connect.
  // 'rejected'/'revoked': surface, do not silently drop — do not call transaction.complete().
}
```

### Pattern 2: Per-aggregate transactional apply on the server
**What:** `SyncModule`'s push handler groups incoming crud ops by aggregate (a `WorkoutSession` and everything hanging off it) and applies each aggregate inside one Postgres transaction, per PITFALLS.md §4.
**When to use:** Every push batch that contains parent+child rows created in the same offline window.
**Example:**
```typescript
// Illustrative — not from a fetched source; follows PITFALLS.md §4's guidance directly.
await db.transaction(async (tx) => {
  for (const op of sessionAggregateOps) {
    await applyOp(tx, op); // insert/update/delete, idempotent on client UUID (D-02)
  }
});
```

### Pattern 3: Local-date attribution captured once, at write time
**What:** `WorkoutSession.local_date` and `WorkoutSession.timezone` are set once when the session starts, from the device's current IANA zone, and never recomputed.
**When to use:** Any entity where "which calendar day did this happen" matters (LOG-22).
**Example:**
```typescript
// Source: pattern synthesized from IANA-vs-offset guidance (WebSearch, MEDIUM confidence,
// cross-checked against MDN Temporal.ZonedDateTime and general timezone-library guidance)
import { Temporal } from '@js-temporal/polyfill'; // or Intl.DateTimeFormat().resolvedOptions().timeZone if polyfill is not added

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "America/Los_Angeles"
const startedAt = new Date();
const localDate = startedAt.toLocaleDateString('en-CA', { timeZone: timezone }); // "YYYY-MM-DD", stable format
// Persist all three columns: started_at (UTC instant), timezone (IANA string), local_date (this string)
```

### Anti-Patterns to Avoid
- **A second write path for synced data:** any conventional `POST /v1/<entity>` endpoint for a synced entity, even "just for the web admin case" — this is `ARCHITECTURE.md`'s Anti-Pattern 1 and directly violates D-01.
- **Hand-rolling a `PRAGMA user_version` migration runner for the PowerSync-managed local schema:** unnecessary — PowerSync's protocol is schemaless and the client schema is re-applied as views on boot `[VERIFIED: Context7 /powersync-ja/powersync-docs, react-native-and-expo.mdx]`. Only build a hand-rolled migration runner if the Wave 0 spike forces a fallback to WatermelonDB (Decision 1).
- **Whole-row LWW keyed on wall-clock `updated_at`:** `ARCHITECTURE.md` Anti-Pattern 2 / PITFALLS.md §1's warning sign — PowerSync's checkpoint mechanism already avoids this at the transport layer; do not reintroduce it inside a custom connector by comparing client-supplied timestamps.
- **Re-deriving "which calendar day" from the viewing device's current timezone:** PITFALLS.md §12's exact failure mode — always read the stored `local_date`, never `new Date(started_at)` on read.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Offline write queue / outbox | A custom `dirty`/`local_version` table and drain loop | PowerSync's built-in crud queue (`getNextCrudTransaction`) | This is exactly what PowerSync's SDK already durably persists; hand-rolling it duplicates a well-tested piece of the SDK for no benefit |
| Monotonic pull cursor | A custom `BIGSERIAL`-based `/sync/pull?since=` endpoint | PowerSync's checkpoint/bucket protocol, reading Postgres via logical replication | Already satisfies D-03 by construction; building `ARCHITECTURE.md` §3's hand-rolled version on top of PowerSync would be a second, redundant cursor system |
| Local SQLite schema migrations | A `PRAGMA user_version`-keyed migration runner for PowerSync-managed tables | PowerSync's schemaless client-side view layer | Confirmed via official docs this session — schema changes require no migration step for synced tables |
| Tombstone propagation | A hand-rolled `deleted_at` sync table for every entity | PowerSync's native `DELETE` crud op, propagated through the same bucket/checkpoint mechanism as any other mutation | The delete IS already a synced operation in PowerSync's model — a parallel tombstone table would duplicate what the op-log already guarantees (verify with an explicit test — see Decision 3, this is the one area with the thinnest official documentation coverage) |
| kg/lb conversion | Ad hoc conversion at each display call site | A single conversion module invoked only at the input/display boundary, storing kg decimal everywhere else (D-04) | PITFALLS.md §10; repeated conversion accumulates drift |

**Key insight:** almost everything this phase's discretion items ask about ("build the sync protocol, or don't") turns out to already be solved, correctly, inside the SDK the project already selected — the remaining hand-authored work is entity-specific *policy* (which fields get field-level LWW, what counts as an aggregate boundary), not sync-protocol plumbing.

## Common Pitfalls

### Pitfall: PowerSync's RN-Web support is beta, and this machine cannot fall back to native verification
**What goes wrong:** A plan that treats "RN + Web from one codebase" as already-proven infrastructure discovers mid-phase that the web target requires nonstandard Metro config (`config.resolver.unstable_enablePackageExports = true`) and manual worker-asset copying (`node_modules/@powersync/web/dist/worker` → project `public/`) `[VERIFIED: Context7 /powersync-ja/powersync-docs, react-native-web-support.mdx]`, and that native (iOS/Android) cannot be verified at all on this machine (no Xcode, no Android SDK — confirmed this session: `xcodebuild -version` fails, `adb` not found).
**Why it happens:** STACK.md's PowerSync recommendation was written without flagging the web-target beta status explicitly, and this project's environment constraint (no native toolchain) means the usual fallback — "verify on a real device" — doesn't exist here.
**How to avoid:** Put the web-target spike first in Wave 0, before any other Phase 2 task depends on PowerSync working. If it fails or proves unworkable within a tightly time-boxed spike, fall back to WatermelonDB per STACK.md's own documented fallback path rather than sinking further effort into the beta path.
**Warning signs:** Any Phase 2 plan that schedules the PowerSync web-target verification after other tasks already depend on it being correct.

### Pitfall: Conflating "schema migration" (Postgres) with "schema migration" (PowerSync local schema)
**What goes wrong:** A plan writes a `PRAGMA user_version`-style migration runner for the client, spending real effort on machinery PowerSync's protocol makes unnecessary for synced tables, while under-testing the one thing that *does* need verification: that in-flight, not-yet-pushed crud-queue entries survive a client `Schema` redefinition across an app update.
**Why it happens:** `ARCHITECTURE.md` §3 was written assuming a hand-rolled local database; the schemaless nature of PowerSync's client schema wasn't known at that time.
**How to avoid:** Re-scope success criterion 4's verification to what actually matters under PowerSync: does the crud queue (the durable offline-write record) survive a schema redefinition and app restart, not "does an ALTER TABLE migration run cleanly."
**Warning signs:** A plan task titled "write local SQLite migration runner" for the synced portion of the schema.

### Pitfall: Testing the two-device concurrent-edit requirement (PLAT-04) only at the UI level
**What goes wrong:** Given no native device is available, a plan might try to satisfy "an automated two-device concurrent-edit test" by literally launching two RN Web browser tabs — brittle, slow, and doesn't test the actual conflict-resolution code path in isolation.
**Why it happens:** "Two devices" reads as a UI/E2E requirement, but the actual thing under test is the backend connector's conflict policy plus the PowerSync checkpoint protocol.
**How to avoid:** Write the concurrent-edit test at the sync-protocol/backend level — two simulated client sessions (two client UUIDs, two independent local crud batches) pushed to `SyncModule` in an order that creates a genuine field-level collision, asserting the conflict-log row exists and no `LoggedSet` is lost. This is testable today, with the tooling already present (Jest e2e against live Postgres, per Phase 1's pattern), independent of the native-device gap.
**Warning signs:** The only test for PLAT-04 requires a running mobile simulator.

## Runtime State Inventory

> This phase adds new schema and a new sync subsystem to a greenfield app with zero real users and zero prior schema for domain data — it is not a rename/refactor/migration phase in the sense this section targets. Included for completeness per the trigger condition ("any phase involving... migration"), since success criterion 4 uses the word "migration."

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no domain tables exist yet in Postgres (`schema.ts` currently contains only Better Auth tables: `user`, `session`, `account`, `verification` `[VERIFIED: apps/api/src/db/schema.ts:1-89]`). No PowerSync Service instance is running yet. | Code edit only — this phase creates the tables, no existing data to migrate |
| Live service config | None — no PowerSync Service deployment exists yet (self-hosted or Cloud) | New deployment, not a migration |
| OS-registered state | None applicable — no native builds exist yet for this app | N/A |
| Secrets/env vars | None yet — `DATABASE_URL` already exists (`apps/api/src/db/drizzle.module.ts:17-21`); a new `POWERSYNC_SERVICE_URL`/`POWERSYNC_JWT_SECRET`-style var will be added, not renamed | Code edit — add new env vars, no rename of existing ones |
| Build artifacts | None affected | N/A |

**Nothing found in any category requiring migration of existing data** — verified by reading `apps/api/src/db/schema.ts` in full this session; it contains exactly four Better Auth tables and no domain tables.

## Common Pitfalls — Decision-Specific Reasoning

### Decision 1: Sync engine — PowerSync (adopt), with a gated web-target spike

Evaluated against the four criteria `CONTEXT.md` specifies, in order:

1. **Does it satisfy D-01 through D-04 without contortion?** Yes, on all four. D-01: `uploadData()` is the only function that ever calls a mutating endpoint — the app's own code enforces this, not the SDK, but the SDK's shape (a queue + one upload callback) makes it the path of least resistance rather than something fought against. D-02: the crud queue is keyed by row `id`, which the app controls — client-generated UUIDs at creation time slot in directly. D-03: PowerSync's own pull/checkpoint protocol is internally sequence-based (derived from Postgres LSN via logical replication, chunked into buckets with monotonic op ordering), never wall-clock — this constraint is satisfied by the SDK's architecture, not something this phase has to build. D-04 (no CRDT): PowerSync's default is LWW; nothing about adopting it pulls in CRDT machinery.
2. **Real infra cost.** STACK.md's flagged concern — "requires MongoDB" — is stale. PowerSync's self-hosted Service now supports Postgres as the storage backend for bucket state (`storage: { type: postgresql, uri: ... }` in `service.yaml`) `[VERIFIED: Context7 /powersync-ja/powersync-docs, configuration/powersync-service/self-hosted-instances.mdx]`, alongside MongoDB as an alternative. Self-hosting still means running one more process (the PowerSync Service itself), which this machine cannot easily containerize today (`docker` is not installed — confirmed this session). PowerSync Cloud's Free tier ($0/mo, 2GB synced/mo, 500MB hosted `[CITED: PowerSync pricing page, via WebSearch 2026-08-15]`) is a viable way to develop this phase without standing up local infra at all, with the caveat that idle Free-tier instances deprovision after 7 days.
3. **RN + Web from one codebase, verified against current docs.** Confirmed to exist (`@powersync/react-native` + `@powersync/web` combined per a dedicated "React Native Web Support" doc), but it is **explicitly labeled beta** and needs manual Metro/worker-asset setup `[VERIFIED: Context7 /powersync-ja/powersync-docs, react-native-web-support.mdx]`. This is the one place this research found a real, previously-unflagged risk. Native (RN, non-web) support has no such beta caveat and just needs `@op-engineering/op-sqlite` ≥1.17.0 as a peer — but native cannot be runtime-verified on this machine at all (no Xcode, no Android SDK).
4. **How much conflict semantics still has to be authored either way.** Regardless of PowerSync vs. hand-rolled, the entity-specific conflict *policy* (Decision 2) has to be written — PowerSync supplies the mechanism (a pluggable backend connector with full access to each op) but not the business rule. This is a wash between the two options; it does not favor either.

**Net call:** adopt PowerSync. Sequence the Phase 2 plan so the RN-Web spike is a Wave 0 gate — a small, time-boxed task that stands up `PowerSyncDatabase` against a trivial table on the web target and confirms live-query reactivity + a push/pull round trip — before any other task assumes it works. If the spike fails, fall back to WatermelonDB (STACK.md's own documented alternative), which trades away PowerSync's schemaless-migration and built-in-cursor benefits for zero extra self-hosted-service infra and a hand-rolled (but well-precedented, per `ARCHITECTURE.md` §3) sync protocol.

### Decision 2: Conflict model — per-entity policy, not one global rule

`ARCHITECTURE.md` §3 and `PITFALLS.md` §1 are reconciled, not in true conflict, once granularity is separated from the specific mechanism:

- **`LoggedSet`:** two *different* sets in the same session, edited on two different devices, never actually collide — each has its own client-UUID row, so PowerSync's per-row crud queue applies them independently with zero conflict-resolution logic needed. A true collision (the *same* `LoggedSet.id* edited on both devices during the same offline window) is genuinely rare for this domain. For that rare case: row-level LWW keyed on the server-assigned checkpoint sequence (satisfies D-03), **plus** a durable `sync_conflict_log` row written by the backend connector whenever an overwrite happens to a `LoggedSet` where `completed = true`. This is the mechanism that makes PLAT-04's "no logged set silently lost" auditable rather than merely hoped-for — nothing is destroyed without a recoverable trace, without needing full CRDT/event-sourcing machinery (D-07 still holds).
- **`SessionExercise`/`WorkoutSession` metadata** (`started_at`, `ended_at`, `status`): plain row-level LWW is acceptable — these fields are effectively single-writer-at-a-time in practice (you are either mid-workout on one device or not).
- **Preferences/settings** (unit preference, default gym profile): plain LWW, no special handling — PITFALLS.md §1 explicitly calls this granularity acceptable for low-stakes fields.
- **Deletes:** never folded into field-level LWW — handled explicitly, see Decision 3.

**Immunity check against PITFALLS.md §1's stated warning signs:** (a) not a single `updatedAt >` comparison — PowerSync's checkpoint sequence plus the conflict-log mechanism replace it; (b) an automated two-device concurrent-edit test is a named success criterion (2) and is scoped concretely in Validation Architecture below, not left as an aspiration; (c) "a set I definitely logged is gone" becomes structurally detectable — the conflict log makes an overwrite an auditable event, not a silent one.

### Decision 3: Delete and tombstone semantics

PowerSync's crud queue emits an explicit `DELETE` op type per row, propagated through the same bucket/checkpoint mechanism as inserts and updates `[CITED: Context7 /powersync-ja/powersync-docs, handling-writes/custom-conflict-resolution.mdx — sample connector code shows `UpdateType.DELETE` handled identically to `PUT`/`PATCH`]`. This means the delete operation **is** the tombstone — a device that already pulled a row and then pulls a later `DELETE` op for the same id learns about the deletion through the identical mechanism it learns about any other mutation, with the identical ordering guarantee. Building a second, hand-rolled tombstone table on top of this would duplicate a guarantee the sync protocol already provides.

Two categories, differently handled:
- **Entities with logged-history dependents** (`Exercise`, `Routine`) — never hard-delete once real history exists, per PITFALLS.md §11. Use a soft-delete/`archived_at` column, synced like any other field update (not a `DELETE` op at all). This phase should add the column even though the archive *UI* is Phase 3+'s concern.
- **Entities with no such dependents, genuinely removable** (an unfinished, never-completed `WorkoutSession`, a mis-logged `LoggedSet` removed before the session ends) — a real PowerSync `DELETE` op, relying on the mechanism above.

**Documentation coverage is thin here** — this is the one design decision in this phase with the least direct official-doc backing (the sample above is a generic connector pattern, not a dedicated "how PowerSync handles deletes across two offline devices" walkthrough). Verify explicitly with a targeted automated test (delete on device A while offline, device B pulls after B independently edited the same row) before trusting this in production, per PITFALLS.md §4's referential-integrity concern.

**Referential integrity (PITFALLS.md §4):** apply aggregates transactionally server-side (Pattern 2 above). A `LoggedSet` whose parent `SessionExercise` hasn't arrived yet should be rejected/requeued by the backend connector's transaction, not inserted with a dangling reference — PowerSync's crud queue can genuinely deliver batches out of the app's intended order under retry, so this must be an explicit check, not an assumption.

### Decision 4: Schema scope — land the full schema now, seed a small representative fixture

Recommendation: create every table `ARCHITECTURE.md` §1 lists (`MuscleGroup`, `Exercise`, `ExerciseMuscleMapping`, `EquipmentProfile`, `Routine`/`RoutineDay`/`RoutineExercise`, `WorkoutSession`/`SessionExercise`/`LoggedSet`, `PersonalRecord`, `BodyMetric`/`ProgressPhoto`) in this phase's Drizzle schema, but seed `Exercise` with only a few dozen representative rows spanning every load type (external weight, bodyweight, bodyweight+added, assisted, time-based, distance-based, unilateral — per PITFALLS.md §9) rather than importing the full ~900-exercise catalog. Reasoning:
- Success criterion 3 needs a *realistic* 1-2yr corpus, which requires the real `LoggedSet`/`SessionExercise`/`WorkoutSession`/`Exercise` shape to exist — a stub schema can't produce a realistic corpus.
- `ROADMAP.md`'s phase ordering (catalog in Phase 3, after this phase) does not actually conflict with `ARCHITECTURE.md` §7's build-order once "catalog" is read as two separable things: the *schema shape* (needed now, for the corpus to be honest) versus the *catalog content and browsing UI* (Phase 3's actual job — sourcing, normalizing, and licensing ~900 exercises from free-exercise-db/wger, and building search/filter UI).
- This keeps the `mvp` mode intent intact — mode constrains UI/feature surface, not whether a migration file exists — while avoiding PITFALLS.md §9's "under-modeling now is the expensive direction" trap.

### Decision 5: Local schema migration and the data-preservation guarantee

Superseding `ARCHITECTURE.md` §3's hand-rolled migration language for the PowerSync path: the client-side schema is applied as SQLite views, re-derived on each app boot from the `Schema`/`Table` definitions in code, and "schema migrations are not required" for the synced portion `[VERIFIED: Context7 /powersync-ja/powersync-docs, react-native-and-expo.mdx and reference/rust.mdx (same statement, cross-confirmed across two SDK reference pages)]`. Success criterion 4 ("upgrading the app across a local schema change preserves unsynced on-device data, verified against a populated pre-migration database") should be re-scoped for what's actually at risk under this architecture: **does the crud queue (the durable record of not-yet-pushed writes) survive a client `Schema` redefinition and app restart** — this is testing PowerSync's queue durability, not a hand-rolled `ALTER TABLE` runner. Concretely: seed local unsynced writes, change the `Schema` object (e.g. add a nullable column to a `Table`), restart the app/database instance, assert the queue still contains the original pending ops and they still push correctly.

Postgres-side schema changes continue exactly as `apps/api` already does them — `drizzle-kit push`/`db:verify`, additive-only for as long as a client version might be in the field, per `ARCHITECTURE.md` §3's wire-contract rule. New tables also need the PowerSync Service's sync-rule configuration (`sync-config.yaml`) updated — this is an operational/config step to remember, not application code.

### Decision 6: Calendar-day attribution and timezone policy (LOG-22)

Standard, well-corroborated guidance `[CITED: WebSearch synthesis across multiple sources including MDN Temporal.ZonedDateTime documentation, 2026-08-15 — MEDIUM confidence, general web guidance not a single official source but internally consistent across all results]`: never store only a UTC instant and re-derive "the day" from whatever device is currently viewing it — store the IANA timezone identifier active at the moment of logging (not a numeric offset, because DST shifts the meaning of an offset over time), and derive+persist the local calendar date once, at write time.

Concretely, add to `WorkoutSession`: `started_at` (UTC instant, already in `ARCHITECTURE.md` §1's entity list), `timezone` (new column, IANA string e.g. `America/Los_Angeles`, captured from `Intl.DateTimeFormat().resolvedOptions().timeZone` at session start), `local_date` (new column, a plain date string computed once from `started_at` + `timezone` at session start, never recomputed on read). LOG-22's "attributed to the calendar day it was logged in" uses `started_at`'s local date specifically (not `ended_at`) — a session crossing midnight stays attributed to the day it began, which is both the intuitive answer and avoids a session's day flipping mid-workout as it's still being logged. This directly satisfies the 11:45pm test case in success criterion 5 and travel-across-timezone correctness per PITFALLS.md §12.

### Decision 7: Data export (PLAT-10)

Client-side, from the local PowerSync-managed SQLite — the only version that (a) works fully offline in the gym, per the project's core value framing, and (b) includes writes that haven't synced yet. Format: JSON, one object per `WorkoutSession` with nested `SessionExercise`/`LoggedSet` arrays — structurally simple, complete fidelity, no lossy flattening. Implementation: query local SQLite via the Drizzle wrapper, serialize, write via `expo-file-system`, hand off via `expo-sharing`'s native share sheet (both need adding to `apps/mobile/package.json`, not yet present — verify current versions at install time). No backend export endpoint in this phase — kept small, per `CONTEXT.md`'s own "one requirement, not a subsystem" framing; a server-side export that reflects the fully-merged cross-device history is a natural low-cost addition once Phase 9/10's server-side analytics exist, not required now.

### Decision 8: Performance budget `[ASSUMED — needs user confirmation]`

PITFALLS.md §2 flags "past a few thousand logged sets (roughly 6-12 months of real training history)" as where sync/cold-start problems typically first surface, and success criterion 3 asks for 1-2 years. Proposed corpus and targets, none independently verified against MacroFactor's actual numbers or dedicated performance research this session — treat as a starting point for the planner to turn into concrete test assertions, not settled fact:

| Metric | Target | Corpus assumption |
|--------|--------|--------------------|
| Seed corpus size | 18 months, ~4 sessions/week, ~15 sets/session → ~4,650 `LoggedSet` rows | Comfortably covers the 1-2yr ask and PITFALLS.md §2's danger-zone threshold |
| Cold start (app launch → first interactive screen with local data visible) | < 2s | Web target only — the one this machine can actually measure |
| Full initial sync (new device, first pull of the full corpus) | < 5s | Against a local/dev PowerSync Service |
| Incremental sync (one new set pushed and pulled) | < 500ms round trip | — |

## Code Examples

### Domain schema addition (Drizzle, Postgres side) — illustrative shape, not from a fetched source
```typescript
// apps/api/src/db/schema/session.ts — follows ARCHITECTURE.md §1 entity detail;
// ownership column matches user.id's existing type (text), per apps/api/src/db/schema.ts:4-5
import { pgTable, text, timestamp, integer, numeric, boolean, date } from 'drizzle-orm/pg-core';
import { user } from '../schema';

export const workoutSession = pgTable('workout_session', {
  id: text('id').primaryKey(), // client-generated UUID (D-02)
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  routineDayId: text('routine_day_id'), // nullable — one-off sessions
  equipmentProfileId: text('equipment_profile_id'),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  timezone: text('timezone').notNull(),   // IANA identifier — Decision 6
  localDate: date('local_date').notNull(), // computed once at session start — Decision 6
  status: text('status').notNull(), // 'in_progress' | 'completed' | 'discarded'
});
```

### PowerSync connector honoring D-09's offline classification
```typescript
// Source: pattern combining Context7 /powersync-ja/powersync-docs uploadData example
// with this project's own apps/mobile/lib/session-guard.ts AuthOutcome union
// [VERIFIED: apps/mobile/lib/session-guard.ts:1] export type AuthOutcome = 'ok' | 'offline' | 'revoked' | 'rejected';
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| PowerSync Service requires MongoDB for bucket storage | PowerSync Service supports Postgres as bucket storage | Confirmed current as of this session (2026-08-15); STACK.md's 2026-08-05/10 snapshot didn't reflect this | Removes the second-database-engine objection to self-hosting PowerSync |
| PowerSync RN SDK 2.0.2 / Web SDK 2.1.1 (STACK.md, captured 2026-08-05) | RN SDK 2.1.0 / Web SDK 2.2.0 | npm registry, confirmed this session (2026-08-15) | Minor version bump; re-verify install commands reflect current versions |

**Deprecated/outdated:** the assumption (implicit in `ARCHITECTURE.md` §3's migration language) that the local client schema needs a hand-rolled versioned migration runner — not true under PowerSync's schemaless client protocol; only true if the Wave 0 spike forces a WatermelonDB fallback.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Performance budget numbers (cold start <2s, full sync <5s, incremental <500ms, 18mo/4x-week/15-sets corpus shape) | Decision 8 | If wrong, the planner writes assertions against numbers with no grounding in real usage or a competitor benchmark; low cost to fix (just numbers in a test), but should be confirmed with the user before locking into PLAN.md as a hard gate |
| A2 | PowerSync's `DELETE` crud op is sufficient as the sole tombstone mechanism, with no additional hand-rolled tombstone table needed | Decision 3 | If wrong, a device could resurrect a deleted row after an offline window — this is the phase's own PLAT-04/PITFALLS.md §4 concern; mitigated by requiring an explicit automated test before trusting this in production, but the underlying claim itself rests on a generic connector code sample, not a dedicated "delete propagation across offline devices" doc page |
| A3 | Attributing a session's calendar day from `started_at` rather than `ended_at` is the correct policy for LOG-22 | Decision 6 | Low risk — this is a reasoned design choice with a stated rationale (intuitive "which day did I train," avoids mid-workout day-flip), not a verified external requirement; a user could reasonably want the opposite |
| A4 | JSON is the right export format for PLAT-10 (vs. CSV or another structured format) | Decision 7 | Low risk, easily changed later since it's one requirement — but if the user specifically wants CSV for spreadsheet import, this should be revisited before implementation |

**None of these are HIGH-risk to the phase's success criteria as stated** — the sync-engine and conflict-model decisions (the two flagged as genuinely contested in `CONTEXT.md`) are backed by `[VERIFIED]`/`[CITED]` findings this session, not `[ASSUMED]` reasoning.

## Open Questions

1. **Does the Wave 0 PowerSync-web spike actually succeed on this stack (Expo SDK 57, RN Web ~0.21.2, Metro)?**
   - What we know: the beta feature exists and has documented setup steps (worker-asset copy, `unstable_enablePackageExports`).
   - What's unclear: whether it works cleanly against this specific Expo/RN-Web version combination, since the beta doc doesn't enumerate tested version pairs.
   - Recommendation: this is precisely why it's gated as a Wave 0 spike rather than assumed — the planner should treat spike failure as a legitimate outcome that triggers the WatermelonDB fallback, not a blocker to route around.

2. **Does `@op-engineering/op-sqlite` (native SQLite adapter) work correctly under React Native's New Architecture (mandatory since Expo SDK 55+)?**
   - What we know: it's JSI-based (per its own positioning as "fastest JSI SQLite for RN," matching STACK.md's characterization); JSI itself is architecture-agnostic (used by both legacy bridge and New Architecture/Fabric).
   - What's unclear: no official doc page this research reached made an explicit "supports New Architecture: yes" statement, and a same-session WebFetch attempt against the op-sqlite docs returned garbled/unreliable content that could not be trusted as a source.
   - Recommendation: cannot be verified on this machine regardless (no Xcode/Android SDK), so this is a real, standing gap — the planner should note this explicitly as blocked-pending-native-toolchain rather than assumed-fine, consistent with how Phase 1 handled its own native-verification gaps (`01-VERIFICATION.md`, `.planning/WINDOWS.md`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Domain schema, sync source-of-truth | ✓ | 18.4 (Homebrew), accepting connections on 5432 (confirmed this session) | — |
| Docker | Self-hosted PowerSync Service (typical deployment path) | ✗ | — | Use PowerSync Cloud Free tier for development instead of local self-hosting |
| Xcode / iOS Simulator | Native RN runtime verification | ✗ | — | Web target + Jest/typecheck only for this phase; native sync verification deferred, consistent with Phase 1's precedent |
| Android SDK / emulator | Native RN runtime verification | ✗ | — | Same as above; Android is already deferred wholesale to Phase 999.1 per user decision |
| Node.js | Everything | ✓ | v22.14.0 | — |
| Expo CLI | Client dev/build | ✓ | 57.0.15 (via `npx expo`) | — |

**Missing dependencies with no fallback:** none — every missing dependency below has a documented fallback for this phase.

**Missing dependencies with fallback:**
- Docker → PowerSync Cloud Free tier for development (accepting the 7-day idle-deprovision caveat)
- Xcode/Android SDK → web-target-only runtime verification this phase; native verification deferred per the same pattern Phase 1 already established and documented in `.planning/WINDOWS.md`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (mobile: `jest-expo` preset; API: `ts-jest` against `test/jest-e2e.json`) — both already wired, both enforce non-empty suites via `scripts/jest-suite-integrity.cjs` `[VERIFIED: apps/mobile/jest.config.js, apps/api/test/jest-e2e.json]` |
| Config file | `apps/mobile/jest.config.js`; `apps/api/test/jest-e2e.json` |
| Quick run command | `pnpm --filter mobile test` / `pnpm --filter api test:e2e` (existing scripts, confirmed in `package.json` files) |
| Full suite command | `pnpm ci` (root — runs `turbo run typecheck lint test build`, confirmed in root `package.json`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-02 | Full workout logged offline, zero network | unit + integration | `pnpm --filter mobile test -- --testPathPattern=offline-write` | ❌ Wave 0 |
| PLAT-03 | Offline changes sync automatically on reconnect | integration | `pnpm --filter api test:e2e -- sync-push` | ❌ Wave 0 |
| PLAT-04 | Two-device concurrent edit converges, no set lost | integration (protocol-level, per "Common Pitfalls" above) | `pnpm --filter api test:e2e -- concurrent-edit` | ❌ Wave 0 |
| PLAT-07 | In-progress workout survives force-quit | unit | `pnpm --filter mobile test -- --testPathPattern=crash-recovery` | ❌ Wave 0 |
| PLAT-08 | kg/lb round-trips without drift | unit | `pnpm --filter mobile test -- --testPathPattern=unit-conversion` | ❌ Wave 0 |
| PLAT-10 | Export produces complete, valid JSON | unit | `pnpm --filter mobile test -- --testPathPattern=export` | ❌ Wave 0 |
| LOG-22 | 11:45pm session attributed to correct calendar day | unit | `pnpm --filter mobile test -- --testPathPattern=calendar-day` | ❌ Wave 0 |
| (criterion 3) | Sync/cold-start against 1-2yr seeded corpus | integration/perf | `pnpm --filter api test:e2e -- seeded-corpus-perf` | ❌ Wave 0 |
| (criterion 4) | Crud queue survives schema redefinition + restart | integration | `pnpm --filter mobile test -- --testPathPattern=schema-redefinition` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant quick command above (mobile or api, scoped to the touched area)
- **Per wave merge:** `pnpm --filter mobile test` and `pnpm --filter api test:e2e` in full
- **Phase gate:** `pnpm ci` green before `/gsd-verify-work`, plus the Wave 0 PowerSync-web spike outcome recorded explicitly (pass → proceed, fail → WatermelonDB fallback triggers a re-plan of this phase's remaining waves)

### Wave 0 Gaps
- [ ] PowerSync web-target spike (not a test file — a go/no-go checkpoint task, see Decision 1)
- [ ] `apps/api/src/seed/generate-corpus.ts` — the 1-2yr realistic seed script, covers criterion 3
- [ ] `apps/api/test/sync-push.e2e-spec.ts`, `concurrent-edit.e2e-spec.ts`, `seeded-corpus-perf.e2e-spec.ts` — cover PLAT-03, PLAT-04, criterion 3
- [ ] `apps/mobile/lib/__tests__/offline-write.test.ts`, `crash-recovery.test.ts`, `unit-conversion.test.ts`, `export.test.ts`, `calendar-day.test.ts`, `schema-redefinition.test.ts` — cover the remaining requirement rows above
- [ ] Framework install: none — Jest is already configured on both sides; no new test framework needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — unchanged from Phase 1 | Better Auth, already established |
| V3 Session Management | No — unchanged from Phase 1 | Better Auth cookie/session, already established |
| V4 Access Control | Yes | Every sync operation must be scoped to the requesting user — `SyncModule` must verify a pushed row's `user_id` matches the authenticated session's user before applying it, and every pull query filters by `user_id` server-side, never trusting a client-supplied `user_id` field |
| V5 Input Validation | Yes | Every field in a pushed crud op must be validated server-side (type, range — e.g. `weight_kg` non-negative, `set_index` monotonic) before it reaches Postgres; PowerSync's crud queue delivers arbitrary client-controlled JSON per op, so the backend connector is the only trust boundary |
| V6 Cryptography | No new surface — TLS to Postgres and to the PowerSync Service, no new crypto primitives introduced by this phase | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via nested resource fetch (fetch a `LoggedSet` by ID without verifying it belongs to the requesting user's session) — PITFALLS.md's own Security Mistakes table names this exact risk | Elevation of Privilege | Always scope through the owning chain: verify `WorkoutSession.user_id` matches before trusting a `LoggedSet`/`SessionExercise` write or read tied to it |
| Trusting client-supplied timestamps for sync ordering | Tampering | Use PowerSync's server-side checkpoint sequence as authoritative order; treat any client-supplied timestamp as advisory display data only, never as an ordering key |
| A malicious/buggy client pushing a crud op for another user's row id | Tampering, Elevation of Privilege | `SyncModule`'s apply step checks ownership before every write, not just on first insert — an `UPDATE`/`DELETE` op targeting an id must re-verify ownership, not assume it because the id was already accepted once |

## Sources

### Primary (HIGH confidence)
- Context7 `/powersync-ja/powersync-docs` — self-hosted storage backend (Postgres vs. MongoDB), client-side schema/"schemaless" migration behavior, React Native Web Support beta status and setup requirements, RN installation requirements (`@op-engineering/op-sqlite` ≥1.17.0), Drizzle driver integration, custom conflict-resolution connector patterns
- npm registry (`npm view <pkg> version`), queried directly 2026-08-15 (this session) — `@powersync/react-native` 2.1.0, `@powersync/web` 2.2.0, `@op-engineering/op-sqlite` 18.0.0, `@powersync/drizzle-driver` 0.8.0, `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `expo-sqlite` 57.0.1
- This repo, read directly this session — `apps/api/src/db/schema.ts` (full file, confirms `user.id` is `text`, no domain tables exist yet), `apps/api/src/db/drizzle.module.ts`, `apps/mobile/lib/sign-out.ts`, `apps/mobile/lib/session-guard.ts`, `apps/mobile/lib/auth-storage.ts`, `apps/mobile/components/SignOutDialog.tsx`, `apps/mobile/app/(tabs)/profile.tsx`, `apps/mobile/lib/api-client.ts`, `apps/api/src/main.ts`, `package.json` files (root, mobile, api)
- Environment probes run directly this session — `pg_isready`/`psql --version` (Postgres 18.4, running), `docker info` (not installed), `xcodebuild -version` (no Xcode), `adb version` (not found), `node --version` (v22.14.0), `npx expo --version` (57.0.15)
- `gsd_run query package-legitimacy check` — all 7 sync-related packages checked this session

### Secondary (MEDIUM confidence)
- WebSearch: PowerSync self-hosted Service deployment requirements (cross-checked against and confirmed by the Context7 fetch above)
- WebSearch: tombstone deletion pattern in offline-first sync engines (general distributed-systems pattern corroboration, cross-checked against the PowerSync-specific `DELETE` crud-op behavior found via Context7)
- WebSearch: IANA timezone storage best practices (multiple independent sources, internally consistent, cross-checked against MDN's `Temporal.ZonedDateTime` documentation)
- WebSearch: `PRAGMA user_version` SQLite migration pattern (standard, well-documented community pattern; used only as the "if the WatermelonDB fallback is taken" reference, not the primary recommendation)
- WebSearch: PowerSync Cloud pricing (2026) — Free tier terms

### Tertiary (LOW confidence)
- WebFetch against `op-engineering.github.io/op-sqlite` for New Architecture/Fabric support status — **returned unreliable/garbled content this session (referenced unrelated "Claude Agent SDK" text) and was explicitly discarded as a source**; the New Architecture compatibility question for `@op-engineering/op-sqlite` remains an open question (see "Open Questions" above), not a verified claim

## Metadata

**Confidence breakdown:**
- Standard stack (PowerSync version numbers, MongoDB-vs-Postgres storage backend, RN-Web beta status): HIGH — confirmed via Context7 official docs and live npm registry this session
- Architecture (conflict model, tombstone semantics, schema-scope decisions): MEDIUM-HIGH — domain model itself is carried from prior `ARCHITECTURE.md` research (unchanged, still sound); the PowerSync-specific reconciliation is newly verified this session but the tombstone claim specifically rests on a generic code sample, not a dedicated doc page (flagged as A2 in Assumptions Log)
- Pitfalls (RN-Web beta risk, native-toolchain gap): HIGH — both are directly observed facts from this session (doc text + environment probes), not inferred
- Performance budget: LOW — explicitly tagged `[ASSUMED]`, needs user confirmation before becoming a hard test gate

**Research date:** 2026-08-15
**Valid until:** 14 days (PowerSync's release cadence moved two minor versions in the ~10 days between STACK.md's capture and this session — re-verify versions again before this phase's actual implementation work begins if more than ~2 weeks elapse)

---
*Phase: 02-data-model-sync-engine*
*Research completed: 2026-08-15*
