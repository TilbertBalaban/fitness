# API Coverage — Phase 2: Data Model & Sync Engine

This phase integrates a genuine third-party surface for the first time: the **PowerSync** client SDKs
(`@powersync/react-native`, `@powersync/web`, `@powersync/drizzle-driver`) and the **PowerSync Service**,
a separate deployable that reads Postgres logical replication and streams buckets to clients.

The plan-time detector returned `{"detected": false}` because it ran over the ROADMAP section before any
PLAN.md existed. That result is not the whole story — the finished plan bodies do carry SDK and
integration language, and the seal-time re-run reads those. This matrix is written now rather than left
for seal time, so the decision is a reasoned record rather than a block.

Default disposition is **INTEGRATE**. Every **OPT-OUT** carries a one-line reason.

## Capability Matrix — PowerSync

| Capability | Surface | Disposition | Plan | Notes |
|---|---|---|---|---|
| Local database | `PowerSyncDatabase`, `Schema`, `Table` | INTEGRATE | 02-01, 02-02 | The single source of truth the UI reads and writes; never a cache. |
| Schemaless client schema (views re-derived on boot) | `Schema` redefinition across app versions | INTEGRATE | 02-05 | Replaces the hand-rolled local migration runner `ARCHITECTURE.md` §3 assumed. |
| Drizzle query layer over the local database | `DrizzleAppSchema`, `wrapPowerSyncWithDrizzle` | INTEGRATE | 02-01, 02-02 | Keeps one query mental model across client SQLite and server Postgres. |
| CRUD queue (durable outbox) | `getNextCrudTransaction`, `getCrudBatch`, `CrudEntry` | INTEGRATE | 02-01, 02-05, 02-06 | The durable record of unsynced writes; also the source of the sign-out pending count. |
| Backend connector — upload | `PowerSyncBackendConnector.uploadData` | INTEGRATE | 02-01 | The single mutating egress, routed through this project's `apiFetch` and `/v1/sync/push`. |
| Backend connector — credentials | `PowerSyncBackendConnector.fetchCredentials` | INTEGRATE | 02-08 | Short-lived, user-scoped token minted by this project's own backend. |
| Sync stream and checkpoints | `connect()`, `disconnect()`, checkpoint cursor | INTEGRATE | 02-08 | Satisfies D-03 by construction; no second cursor is built beside it. |
| Sync rules / bucket definitions | `sync-rules.yaml` | INTEGRATE | 02-08 | One bucket per user, every selection filtered by `user_id`. |
| Delete operation propagation | `UpdateType.DELETE` crud ops | INTEGRATE | 02-03 | Covers the pull direction; the push-side resurrection race is covered by this project's own tombstone table. |
| Self-hosted service with Postgres bucket storage | `powersync.yaml` `storage` | INTEGRATE | 02-08 | Chosen over MongoDB storage; removes the second-database-engine dependency `STACK.md` flagged. |
| Live / watched queries | `watch`, `onChange` | INTEGRATE | 02-01 (available), consumed from Phase 5 | The reactive read path exists in this phase; no feature screen consumes it until the logging UI lands. |
| First-sync signal | `waitForFirstSync` | INTEGRATE | 02-08 | Used to distinguish "no data yet" from "empty account" on a fresh device. |
| Sync status observation | `SyncStatus`, status listeners | INTEGRATE | 02-06 | Surfaced through this project's own `sync-status.ts`; the indicator component itself is deferred to Phase 5. |
| Attachment / file sync | `@powersync/attachments` | OPT-OUT | — | No media in this phase; progress photos are Phase 12 and will re-open this row. |
| Raw table access | `rawTables` | OPT-OUT | — | Every synced table is declared in the app schema; a raw escape hatch would bypass the type-safe Drizzle layer for no benefit here. |
| Client-side encryption at rest | SQLCipher-style encrypted local store | OPT-OUT | — | ASVS L1 for this data class relies on OS device encryption; revisit if health-classified data is ever stored locally. |
| Multiple concurrent databases | more than one `PowerSyncDatabase` instance | OPT-OUT | — | One account per device (Phase 1 D-04, this phase's D-08), so there is never a second account's database to hold open. |
| PowerSync Cloud hosting | hosted instance | OPT-OUT (conditional) | 02-08 Task 1 | Offered as an explicit option at the plan's decision checkpoint; opts out only if the developer selects self-hosting there. |
| MongoDB bucket storage | `storage: { type: mongodb }` | OPT-OUT | — | Postgres storage is supported and the project already runs Postgres; a second engine buys nothing. |
| MySQL / SQL Server as replication source | alternate source databases | OPT-OUT | — | Postgres is the system of record and is not changing. |

## Re-open triggers

Revisit this matrix when Phase 12 adds progress photos (attachments), if local-at-rest encryption is ever
required, or if the hosting decision in plan 02-08 Task 1 is later changed.
