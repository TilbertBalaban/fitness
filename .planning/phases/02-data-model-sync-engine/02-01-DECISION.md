# 02-01 Task 1 Decision: Sync Engine Selection

**Status:** Resolved
**Decided by:** Human, via interactive checkpoint response
**Selection:** `powersync`

## Decision

Adopt **PowerSync** as this project's local-first sync engine, and commit to the push wire
contract that follows from it (the `SyncCrudOp` / `SyncPushRequest` / `SyncPushResponse` shape
defined in `packages/api-contracts/src/sync.ts`, built in Task 3 of this plan).

The WatermelonDB fallback (`02-01-PLAN.md` Task 1, option `watermelondb`) was presented and
explicitly declined.

## Context carried forward from the plan

`02-CONTEXT.md` delegated this call to research and rated it **one-way**: the sync layer is the
substrate every later phase writes through, and swapping it after real training history exists
means a data migration plus a rewrite of every write path. The same applies to the push payload
shape — from the first commit it is additive-only for as long as any client build might be in the
field (`ARCHITECTURE.md` §3), so its shape is a durable commitment, not an implementation detail.

`02-RESEARCH.md` resolved two of the three objections `STACK.md` raised. PowerSync's self-hosted
service no longer requires MongoDB — Postgres works as its bucket storage — and its client schema
is applied as SQLite views re-derived on every boot, so the hand-rolled local migration runner
`ARCHITECTURE.md` §3 assumed is not needed. The objection that survived is real: React Native
**Web** support is labelled beta and needs non-standard Metro configuration, and this machine has
no native toolchain, so web is the only target that can be run.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **`powersync`** (selected) | Crud queue, monotonic checkpoint cursor, delete propagation and schemaless local schema all come from the SDK rather than being written here; D-02, D-03 and D-04 are satisfied without contortion; official SDKs on both targets from one codebase. | Web support is beta and needs manual Metro and worker-asset configuration; pull requires running a PowerSync Service beside Postgres (plan 02-08); four of its packages carry a SUS "too-new" legitimacy verdict that Task 2 must clear. |
| `watermelondb` (declined) | No extra service to run beside Postgres; the push and pull endpoints are two more NestJS controllers next to the ones already written; nothing depends on a beta web target. | The outbox, the monotonic cursor, tombstone propagation and local schema migrations all become this project's code to write and maintain; WatermelonDB is explicitly untested against React Native's New Architecture, which Expo SDK 57 makes mandatory; plans 02-02 through 02-08 need re-planning. |

## Consequence

Task 3 of this plan (`One workout, started offline, arriving in Postgres`) proceeds on the
PowerSync branch: `@powersync/react-native`, `@powersync/web`, `@op-engineering/op-sqlite`, and
`@powersync/drizzle-driver` are the packages that Task 2's legitimacy gate must clear before
Task 3 installs anything. Plans 02-02 through 02-08 remain valid as written — no re-planning is
required, since the plan's default path already assumed this outcome.
