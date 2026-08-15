# Phase 2: Data Model & Sync Engine - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Anything the user writes succeeds offline and converges correctly across their devices, on a schema that can express real training data.

**In scope:** The domain schema (Postgres via Drizzle, and the on-device local database), client-generated UUIDs on every user-authored row, the local write path that works with no network, the sync engine in both directions (push and pull), conflict/merge semantics, delete/tombstone handling, local schema migration that preserves unsynced data, canonical unit storage with a single conversion boundary, calendar-day attribution for sessions, data export, and a seeded multi-year corpus used as the performance fixture.

**Out of scope:** All feature UI. There is no exercise catalog content (Phase 3), no program builder screens (Phase 4), no set-logging UI (Phase 5), no progression rules (Phase 8), no analytics or PR surfaces (Phases 9–10). Tables those phases need may be created here so the schema is coherent and the seeded corpus is realistic, but no screen is built on them. The five placeholder tabs from Phase 1 stay placeholders.

**Discussion:** The user declined to discuss any gray area for this phase ("nothing, you decide"). Every open call below is delegated to research and planning. Nothing here was decided by the user in this session — the `Decisions` section records only what prior artifacts already locked.

</domain>

<decisions>
## Implementation Decisions

### Carried forward — already locked, do not re-litigate

These are not new decisions. They are constraints this phase inherits, restated so the planner treats them as fixed inputs rather than open questions.

- **D-01:** **`SyncModule` is the sole ingress for per-user, offline-mutable data.** No conventional REST CRUD endpoint may be created for any synced entity. Phase 1 deliberately shipped no such surface precisely so this stays true (`ARCHITECTURE.md` Anti-Pattern 1, and Phase 1 `01-CONTEXT.md` `<code_context>`). Reserve ordinary endpoints for auth, media upload URL issuance, and first-install catalog download only. — **Reversibility:** one-way — once a second write path exists, validation, PR reconciliation, and conflict handling diverge across the two, and every consumer has to be audited to collapse them again.

- **D-02:** **Every user-authored row carries a client-generated UUID issued at creation time, before any network round-trip.** The server never assigns primary identity for user-authored rows; it accepts the client UUID under a uniqueness constraint and uses it as the push idempotency key (`ARCHITECTURE.md` §3). — **Reversibility:** one-way — changing this means an ID remapping migration across every synced table plus every client's local database.

- **D-03:** **The pull cursor is a server-assigned monotonic sequence, never a wall-clock timestamp.** `ARCHITECTURE.md` Anti-Pattern 2 is explicit: clock skew across phone, browser, and server silently drops or duplicates rows and usually "works" until a device's clock is wrong. — **Reversibility:** one-way — the cursor is persisted on every client; changing its type strands every device mid-stream.

- **D-04:** **Weights are stored canonically in kg as decimal, never float, and converted only at the input/display boundary.** Repeated conversion for aggregation is forbidden; rounding happens only when computing an achievable plate load against an equipment profile's native unit and real increments (`ARCHITECTURE.md` §1 Q4, `PITFALLS.md` §10). — **Reversibility:** one-way — the stored column type and every historical value depend on it.

- **D-05:** **Prescriptions are snapshotted onto `SessionExercise` at session start and never re-read from `RoutineExercise` afterward.** No whole-`Routine` version tree (`ARCHITECTURE.md` §1 Q3, Anti-Pattern 3). Historical sessions must render correctly without reading through to the current, possibly-since-edited routine. — **Reversibility:** one-way — retrofitting snapshots after real history exists cannot recover what the prescription was at the time.

- **D-06:** **Grouping is an annotation column on a flat list, never a nested structure.** `superset_group_id` on `RoutineExercise`/`SessionExercise`, `parent_set_id` on `LoggedSet`, with `set_index` strictly incrementing and no fractional indices (`ARCHITECTURE.md` §1 Q1). "Give me set N of this session" stays a single indexed read. — **Reversibility:** costly — the read path and every ordering query assume flatness.

- **D-07:** **No CRDT machinery.** Single user across personal devices is a hub-and-spoke topology, not multi-writer collaboration (`ARCHITECTURE.md` Anti-Pattern 4). This constrains the merge strategy but does *not* by itself settle the conflict model — see the first discretion item below, where `PITFALLS.md` §1 pushes back on naive LWW. — **Reversibility:** reversible — additive if a specific entity later proves it needs more.

- **D-08:** **Sign-out clears the local database and secure storage, after an explicit confirmation when unsynced writes are pending.** Phase 1 shipped the confirmation hook with a hard-coded zero count specifically so this phase wires a real count into an existing seam rather than adding the prompt afterwards (Phase 1 `01-CONTEXT.md` D-04). Finding and populating that seam is in scope. — **Reversibility:** costly — Phase 1's local-storage lifecycle was designed around single-account wipe-on-sign-out semantics.

- **D-09:** **Transport failure and definitive rejection are already separate branches in the API client** (Phase 1 D-03). Sync retry, backoff, and "am I offline" classification attach to that existing split rather than introducing a parallel notion of connectivity. — **Reversibility:** reversible.

### Claude's Discretion

The user chose not to discuss any area. Everything below is delegated — but these are not coin flips, and two of them are places where the project's own research documents contradict each other. The researcher must resolve each explicitly and record the reasoning, not pick silently.

- **Sync engine: adopt PowerSync, or build the protocol `ARCHITECTURE.md` §3 already specifies?**
  **The research conflicts and this phase cannot proceed without settling it.** `STACK.md` names PowerSync "the most important decision in the stack" and calls hand-rolled sync the highest-risk, highest-maintenance path for a solo developer. `ARCHITECTURE.md` §3 then specifies a complete hand-rolled protocol in implementation-level detail — client outbox, `POST /sync/push` with UUID idempotency, `GET /sync/pull?since=<seq>` over a server `BIGSERIAL`, row-level merge — which is work PowerSync would otherwise own. `STACK.md` §"Stack Patterns by Variant" also already sketches the no-extra-infra variant. Decide against these criteria, in this order: (1) does it satisfy D-01 through D-04 without contortion; (2) real infra cost — PowerSync Open Edition requires running the PowerSync Service *and* a MongoDB for its internal bucket state, beside the existing Postgres; (3) whether its client SDK works on Expo SDK 57 / RN 0.86 New Architecture **and** RN Web from the one codebase, verified against current docs rather than assumed; (4) how much of the conflict semantics the phase still has to write either way. Re-verify every version and package name against current sources — `STACK.md`'s figures were captured 2026-08-05/10 and Phase 1 already found one package name that needed re-checking. — **Reversibility:** one-way — the sync layer is the substrate every later phase writes through, and swapping it after real training history exists means a data migration plus a rewrite of every write path.

- **Conflict model: reconciling `ARCHITECTURE.md` §3 with `PITFALLS.md` §1.**
  These are in partial tension and the planner must not paper over it. `ARCHITECTURE.md` §3 prescribes row-level, sequence-keyed last-write-wins and explicitly rejects anything fancier. `PITFALLS.md` §1 warns that LWW silently destroys logged sets and pushes toward set-and-field granularity, logical clocks, and an append-only event model where "editing a set" is a new event rather than an in-place overwrite. Two of the three objections are *already* answered by D-03 (sequence, not wall clock) and by row-granularity rather than whole-session granularity. What remains genuinely open: field-level versus whole-row LWW; whether a `LoggedSet` is treated as an append-only fact or a mutable row; and whether merge policy varies per entity (a display preference and a logged set do not deserve the same rule). Decide it, and state which of `PITFALLS.md` §1's warning signs the chosen design is immune to. Success criterion 2 and PLAT-04 hang on this.

- **Delete and tombstone semantics.** Not covered by either research document. A row deleted offline on one device must not be resurrected by the other device's next pull, and a deleted session must not orphan its sets. Relates to `PITFALLS.md` §4 (partial sync leaving referential integrity broken) — decide whether sync applies whole-entity graphs transactionally or per-row, and what a client does when a page references a parent it has not received yet.

- **Schema scope for this phase.** ROADMAP marks Phase 2 `mvp` mode, which argues for the thinnest slice that proves sync. Success criterion 3 pulls the other way: a seeded corpus of 1–2 years of *realistic* training history needs real `WorkoutSession`/`SessionExercise`/`LoggedSet`/`Exercise` tables to be realistic at all, and `ARCHITECTURE.md` §7 puts the catalog taxonomy at build-order step 1, *before* the sync skeleton at step 2 — while the ROADMAP puts the catalog in Phase 3, after this phase. Decide how much schema lands here versus Phase 3/4/5, and make the seeded-corpus fixture honest about what it exercises. Note `PITFALLS.md` §9 ("domain modeling that can't express real training data") — under-modeling now is the expensive direction, since `ARCHITECTURE.md` §1 opens by saying retrofitting the model later is exactly what this phase exists to prevent.

- **Local schema migration and the data-preservation guarantee (success criterion 4).** `ARCHITECTURE.md` §3 gives the shape — forward-only versioned migrations bundled per release, applied on boot before the sync engine runs, with the sync worker refusing to drain the outbox unless `local_schema_version === expected`. `PITFALLS.md` §3 is about migrations that brick existing installs. Open: what happens when a migration fails halfway on a device holding unsynced writes, and how the test proves preservation against a *populated* pre-migration database rather than an empty one.

- **Calendar-day attribution and timezone policy (LOG-22, criterion 5).** Whether a session's day derives from `started_at` or `ended_at`, whether it is device-local or a stored UTC offset, and what happens across a timezone change mid-mesocycle. `PITFALLS.md` §12 covers the failure modes. The 11:45pm case in criterion 5 is the concrete test.

- **Data export (PLAT-10).** Format, and whether it is produced client-side from the local database or served from the backend. Client-side export is the only version that works in the gym; a server-side export sees the fully merged cross-device history. This may well be both. Keep it small — it is one requirement, not a subsystem.

- **Performance budget (criterion 3).** "Fast" needs a number before it can be verified. Set explicit targets for cold start and for a full sync against the seeded corpus, and make them assertions in the test suite rather than prose in a summary. `PITFALLS.md` §2 and §13 (N+1 queries on nested workout/program data) are the relevant failure modes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent and scope
- `.planning/PROJECT.md` — core value ("walk into a gym with no signal, log every set without friction"), the locked constraints, and the Key Decisions table
- `.planning/REQUIREMENTS.md` — this phase owns PLAT-02, PLAT-03, PLAT-04, PLAT-07, PLAT-08, PLAT-10, LOG-22 and nothing else; PLAT-01/05/06/09 were delivered in Phase 1
- `.planning/ROADMAP.md` §"Phase 2: Data Model & Sync Engine" — the goal and the five success criteria this phase is verified against

### The data model — the highest-value reference for this phase
- `.planning/research/ARCHITECTURE.md` §1 "Domain Data Model" — entity list, per-entity column detail, and the four hard modeling questions answered explicitly (supersets/drop sets, prescribed-vs-performed, routine edits vs. history, canonical units). Its opening line is the thesis of this phase: everything else is downstream of getting the model right, because retrofitting it once real history exists is expensive.
- `.planning/research/ARCHITECTURE.md` §3 "Offline-First Sync Architecture" — push/pull protocol, monotonic sequence cursor, conflict model, the client-computable vs. server-authoritative split, and schema-migration rules
- `.planning/research/ARCHITECTURE.md` §7 "Suggested Build Order" — note that its step ordering puts the catalog taxonomy *before* the sync skeleton, which the ROADMAP inverts; the schema-scope discretion item above turns on this
- `.planning/research/ARCHITECTURE.md` §"Anti-Patterns to Avoid" — all four apply directly to this phase and are restated as D-01, D-03, D-05, D-07

### Pitfalls this phase exists to prevent
- `.planning/research/PITFALLS.md` §1 "Last-write-wins silently destroys logged sets" — read alongside `ARCHITECTURE.md` §3; they are in partial tension and the conflict-model decision must reconcile them
- `.planning/research/PITFALLS.md` §2 "Sync engine untested against 1-2 years of accumulated history" — success criterion 3
- `.planning/research/PITFALLS.md` §3 "Local schema migrations that brick existing installs" — success criterion 4
- `.planning/research/PITFALLS.md` §4 "Partial sync leaves referential integrity broken" — the tombstone/ordering discretion item
- `.planning/research/PITFALLS.md` §9 "Domain modeling that can't express real training data" — the cost of under-modeling in this phase
- `.planning/research/PITFALLS.md` §10 "kg/lb conversion drift" — PLAT-08 and criterion 5
- `.planning/research/PITFALLS.md` §12 "Timezone handling breaks which day was that workout" — LOG-22 and criterion 5
- `.planning/research/PITFALLS.md` §13 "N+1 queries on nested workout/program data" — the performance budget

### Stack
- `.planning/research/STACK.md` — the local-first data layer comparison table (PowerSync, WatermelonDB, ElectricSQL, RxDB, TinyBase, Legend-State, plain SQLite), Drizzle 0.45.x, Postgres 15+. Versions were captured 2026-08-05/10 and must be re-verified against current sources before any install.
- `.planning/research/STACK.md` §"Stack Patterns by Variant" — the WatermelonDB and TinyBase variants, and the argument for avoiding PowerSync's extra service + MongoDB dependency

### What Phase 1 built and locked
- `.planning/phases/01-cross-platform-foundation/01-CONTEXT.md` — D-03 (transport failure vs. definitive rejection split in the API client) and D-04 (one account per device, wipe-on-sign-out, unsynced-writes confirmation hook) are the two Phase 1 decisions this phase attaches to directly
- `.planning/phases/01-cross-platform-foundation/01-VERIFICATION.md` — what Phase 1 actually verified, and the four iOS items still blocked on an absent Xcode toolchain
- `.planning/phases/01-cross-platform-foundation/01-UAT.md` — outstanding verification debt carried into this phase; Android verification is deferred wholesale to Phase 999.1 by user decision 2026-08-15

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/db/schema.ts` — Drizzle schema containing **only** Better Auth tables (`user`, `session`, `account`, `verification`) plus their relations, and a `schema` barrel export. Every domain table is new. `user.id` is `text`, so the ownership column on every synced table must match that type rather than defaulting to uuid.
- `apps/api/src/db/drizzle.module.ts` — the existing Postgres connection module; new domain tables and migrations attach here, not to a second connection.
- `packages/api-contracts/` — exists with a single `src/index.ts`. This is where the sync wire contract belongs, shared by both sides. `ARCHITECTURE.md` §3 requires that contract to be additive-only for as long as any client version is in the field, so its shape is a durable commitment from the first push.
- `packages/progression-engine/` — stubbed and empty. Not this phase's work, but the schema landed here has to be able to feed it (`ARCHITECTURE.md` §4 puts the engine client-side, computing from local data).
- `apps/mobile/lib/` — Phase 1's client library layer, including the API client with the D-03 transport-vs-rejection split and the session handling. The sync worker attaches here.
- `apps/api/src/common/` — existing shared backend primitives; the API versioning approach Phase 1 chose lives in this area and the sync endpoints must respect it.

### Established Patterns
- **No REST CRUD exists for domain data, deliberately.** Phase 1 shipped auth, health, and mailer modules only. That absence is the enabling condition for D-01 — the first domain write path built in this phase determines whether Anti-Pattern 1 is avoided or introduced.
- **Platform escape hatch is `.web.tsx`**, established in Phase 1. The local database layer will need it: the on-device SQLite engine and its web counterpart are the single most likely place for RN/RN-Web divergence in this phase (`PITFALLS.md` §5).
- **Tests are the accepted evidence.** Phase 1 closed with 86/86 mobile unit tests and 5 e2e suites / 22 tests against live Postgres. Success criteria 2, 3, and 4 are all phrased as automated tests ("proven by an automated two-device concurrent-edit test", "against a seeded corpus", "verified against a populated pre-migration database") — they are not human-verifiable items and must not become UAT rows.

### Integration Points
- The Better Auth `user.id` is the ownership column every synced table hangs off (Phase 1 D-05 made this a one-way commitment by keeping identity in the project's own Postgres).
- Phase 1's unsynced-writes confirmation hook currently reports a hard-coded zero — this phase supplies the real count.
- The sync worker's connectivity classification must reuse Phase 1's existing transport-failure branch rather than introducing a second definition of "offline".

### Environment constraint
No Xcode and no Android SDK are installed on this machine. iOS/Android runtime verification is unavailable; Android verification is deferred to Phase 999.1 by user decision. Plan this phase's verification around automated tests and the web target, and do not write success criteria that can only be closed on a native device.

</code_context>

<specifics>
## Specific Ideas

- **The gym remains the reference environment.** Phase 1's D-01/D-02/D-03 were all chosen against the same scenario — phone in airplane mode, mid-workout, no signal since arriving. This phase inherits it: any design where a write, a read, or a cold start waits on the network fails the intent regardless of whether it passes a test.
- **"No logged set silently lost" is the phrase to design against.** It appears in PLAT-04, in success criterion 2, and as the warning sign in `PITFALLS.md` §1 ("a set I definitely logged is gone"). It needs to become a specific, failing-before-it-passes automated assertion, not a property everyone believes is true.
- **Two research documents disagree in two places** — sync engine (`STACK.md` vs `ARCHITECTURE.md` §3) and conflict model (`ARCHITECTURE.md` §3 vs `PITFALLS.md` §1). Both are flagged in the discretion list. Neither should be resolved silently by whichever document an agent happened to read last.

</specifics>

<deferred>
## Deferred Ideas

- **Offline/sync status indicator in the UI** — raised and set aside during Phase 1's discussion on the grounds that it belongs where there is actual sync state to report. That is now. It is still a UI surface, so it belongs to whichever phase builds the shell around it (Phase 5 at the earliest); this phase should expose the state it would render, not the component.
- **`RoutineRevision` audit trail** — `ARCHITECTURE.md` §1 Q3 explicitly says this is optional, low-stakes, and should not be built until a concrete feature asks for it. Snapshot-on-use (D-05) already delivers correctness without it.
- **Server-side analytics rollups and PR reconciliation** — `ARCHITECTURE.md` §3 marks these server-authoritative, but they are Phase 9/10 work and depend on this phase's data flowing reliably first.
- **Native deep links** — carried forward unresolved from Phase 1 D-07; unrelated to this phase.

</deferred>

---

*Phase: 2-Data Model & Sync Engine*
*Context gathered: 2026-08-15*
