# Architecture Research

**Domain:** Cross-platform, local-first strength-training tracker (React Native + React Native Web client, NestJS + Postgres backend) — functional clone of MacroFactor Workouts
**Researched:** 2026-08-10
**Confidence:** MEDIUM (domain data model and sync architecture are established patterns cross-checked against sync-engine vendor docs, open-source workout trackers, and standard offline-first literature; MacroFactor's actual internal algorithm is not public, so the progression-engine section is a reasoned position, not a confirmed spec)

## 1. Domain Data Model

This is the highest-value part of this document. Everything else (sync, component boundaries, build order) is downstream of getting this right, because retrofitting the model later (especially the versioning/snapshot behavior) is expensive once real training history exists.

### Core entities

```
MuscleGroup            ── anatomical taxonomy (chest, lats, quads, ...)
Exercise                ── one row per liftable movement (including named variations)
ExerciseMuscleMapping   ── Exercise × MuscleGroup, with role + weight_factor
EquipmentProfile (Gym)  ── per-location plates / dumbbell increments / machine availability
Routine (Program)       ── user-authored or generated training plan
RoutineDay               ── an ordered day within a Routine ("Push", "Pull", "Legs")
RoutineExercise          ── a prescribed exercise within a RoutineDay (mutable, "current" prescription)
WorkoutSession           ── one visit to the gym (or one-off/unplanned session)
SessionExercise          ── an exercise within a session; holds an IMMUTABLE snapshot of what was prescribed
LoggedSet                ── one performed set (weight, reps, RIR, set_type, completed)
PersonalRecord            ── derived, reconciled server-side
BodyMetric / ProgressPhoto ── independent, low-interdependency tracking entities
```

### Entity detail

**MuscleGroup**
`id, name, body_region` — a fixed taxonomy table (chest, front/side/rear delts, lats, upper back/traps, lower back, biceps, triceps, forearms, abs, obliques, quads, hamstrings, glutes, calves). Seeded once, rarely changes.

**Exercise**
`id, name, aliases[], movement_pattern (squat|hinge|horizontal_push|vertical_push|horizontal_pull|vertical_pull|carry|rotation|isolation), equipment_required, unilateral (bool), instructions_text, cue_text, image_urls[], is_custom (bool), variation_of_id (nullable FK → Exercise), source (seed|user)`.

Do **not** create a separate `ExerciseVariation` table. Flatten: every named variation ("Incline Barbell Bench Press", "Incline Dumbbell Bench Press") is its own full `Exercise` row, with a nullable self-referential `variation_of_id` used only to group variations under a parent movement for UI browsing and for analytics roll-ups ("all bench press variants"). A separate variation table would force every consumer (session logging, PR detection, program design) to join through two tables for what is, functionally, still just "an exercise you can log sets against." Self-reference gets the grouping benefit without the join tax.

**ExerciseMuscleMapping**
`exercise_id, muscle_group_id, role (primary|secondary), weight_factor (decimal, default 1.0 for primary / 0.5 for secondary)`.
Making `weight_factor` an explicit column (not a hardcoded 1.0/0.5 in code) matters because real exercises don't fit a binary role cleanly — a stiff-leg deadlift might be primary hamstrings at 1.0 and secondary glutes at 0.5 and secondary lower back at 0.3. Keeping this in data, not code, is what makes volume analytics correct per exercise instead of per category-guess (see §Volume Attribution).

**EquipmentProfile (Gym)**
`id, user_id, name, is_default (bool), barbell_weight_kg, available_plates (json: [{weight_kg, count}]), dumbbell_increments_kg (json array), machine_availability (json or join table of exercise_id → available bool)`.
A user can have multiple `EquipmentProfile` rows (home gym, commercial gym, travel). `WorkoutSession` references the active profile at session-start time (same snapshot principle as prescriptions — see below) so that a later change to a gym's plate inventory doesn't retroactively alter what the plate calculator showed during a completed session.

**Routine / RoutineDay / RoutineExercise**
`Routine: id, user_id, name, goal, status (draft|active|archived), source (user_authored|generated), created_from_template_id (nullable)`
`RoutineDay: id, routine_id, order_index, name, is_rest_day`
`RoutineExercise: id, routine_day_id, exercise_id, order_index, superset_group_id (nullable), target_sets, target_rep_min, target_rep_max, target_rir_min, target_rir_max, target_rest_seconds, progression_scheme_id, notes`

Deliberately **no rigid `ProgramWeek` table.** Most real strength programs (and MacroFactor's own model) are a repeating day sequence (Day A/B/C) whose *prescriptions drift week to week* via a periodization rule (e.g., RIR target tightens across a mesocycle, or a wave-loading scheme), not via literally duplicated per-week rows. Model the repeating structure as `RoutineDay` (the shape) and let a separate, small `PeriodizationScheme` (referenced by `progression_scheme_id`) describe how `target_rir`/`target_reps` shift week-over-week within a mesocycle. This avoids an explosion of near-duplicate `ProgramWeek` → `ProgramDay` → `RoutineExercise` rows for a 12-week program and keeps the "current prescription" concept singular and mutable, which is what the snapshot mechanism below depends on.

**WorkoutSession / SessionExercise / LoggedSet**
`WorkoutSession: id (client-generated UUID), user_id, routine_day_id (nullable — null for unplanned/one-off), equipment_profile_id, started_at, ended_at, status (in_progress|completed|discarded), device_id`
`SessionExercise: id (client-generated UUID), session_id, exercise_id, order_index, superset_group_id (nullable), routine_exercise_id (nullable, traceability only), target_sets, target_rep_min, target_rep_max, target_rir_min, target_rir_max, target_rest_seconds` — **the target_* fields are copied at session-start and never re-read from `RoutineExercise` afterward.**
`LoggedSet: id (client-generated UUID), session_exercise_id, set_index, set_type (normal|warmup|drop|myorep|partial|failure|amrap), weight_kg, reps, rir (nullable), side (nullable: left|right|both), completed (bool), parent_set_id (nullable, self-FK), rest_taken_seconds, logged_at`

**PersonalRecord**
`id, user_id, exercise_id, pr_type (heaviest_weight|best_e1rm|most_reps_at_weight|best_set_volume), value, logged_set_id, achieved_at, reconciled_at` — server-authoritative, see §3.

### Hard modeling questions, answered explicitly

**1. Supersets and drop sets without breaking flat set ordering**

Two *different* grouping mechanisms, layered on top of a strictly flat, always-orderable list — never a tree that replaces ordering:

- **Superset** = grouping across *exercises* performed back-to-back with minimal rest. `RoutineExercise.superset_group_id` and `SessionExercise.superset_group_id` (nullable UUID, shared by all members of the group). `order_index` still increments normally across the whole `RoutineDay`/session — the group ID is a pure annotation ("these three consecutive exercises have no full rest between them"), not a different storage shape. UI reads `order_index` for sequencing and `superset_group_id` for visual bracketing/rest-timer logic.
- **Drop set / myorep / partial chain** = a technique *within* a single exercise's set sequence. Keep `LoggedSet.set_index` strictly incrementing (1, 2, 3, 3a, 3b becomes 1,2,3,4,5 — no fractional indices) and add a nullable `parent_set_id` self-FK: a drop set's row has `set_type = 'drop'` and `parent_set_id` pointing at the top set that initiated the drop chain. This lets the UI indent/group the chain visually and lets analytics exclude drops from "top set" progression tracking (progression care about the initiating heavy set, not each drop), while the underlying list stays flat and trivially orderable by `set_index`.

The key principle: **grouping is an annotation column on a flat list, never a nested structure.** This keeps "give me set N of this session" a single indexed read regardless of how many groupings exist, which matters a lot for a UI that must render instantly against local SQLite during a workout.

**2. Prescribed vs. performed, and drift**

`SessionExercise` holds an **immutable snapshot** of the prescription (`target_sets`, `target_rep_min/max`, `target_rir_min/max`, `target_rest_seconds`) copied from the live `RoutineExercise` at the moment the session starts. `LoggedSet` rows are the performed reality. Drift is never stored — it's always a computed diff (`LoggedSet.weight_kg - implied_target_weight`, `LoggedSet.reps - target_rep_range`, etc.) computed at read time by comparing performed sets against their session's snapshot, never against the live, possibly-since-edited `RoutineExercise`.

**3. Keeping historical logged data correct when the routine is later edited**

This is the same problem e-commerce solves by snapshotting product price/name onto an order line item at purchase time, even though the product catalog keeps changing. Apply the identical pattern: **snapshot-on-use, not whole-routine versioning.** `RoutineExercise` is freely mutable — editing it never touches historical sessions, because every session already carries its own frozen `SessionExercise` copy of what was prescribed *at the time*. There is no need for a branching `Routine` version tree; the only thing that must be immutable is the per-session snapshot, and it already is, by construction. This resolves the hard case cleanly: rendering a workout from six months ago never reads through to the current (edited) routine, so it's always correct regardless of how many times the routine has changed since. If the roadmap later wants a "you changed your program on this date" timeline, that's an optional, low-stakes `RoutineRevision` audit row — not required for data correctness, and shouldn't be built until there's a concrete feature asking for it.

**4. Units — canonical storage vs. store-as-entered**

Store **canonical**: `LoggedSet.weight_kg` (decimal, not float — avoid binary-float rounding on repeated conversions) is the single source of truth for every weight value in the system, regardless of what unit the user typed. Store the user's *display* preference at the `User` level, and separately at `EquipmentProfile` level (a gym's plates/dumbbells are inherently one unit — a US commercial gym is lb-only hardware; a European gym is kg-only). Convert **at the input/display boundary only** — never round-trip convert repeatedly for aggregation. Rationale: PRs, weekly volume, and trend charts must sum and compare weights across a user's whole history without accumulating unit-conversion error, and a mixed-unit history (user trained in a lb gym for six months, then a kg gym) is a real, not hypothetical, case for a personal long-term training log. Round only when computing "nearest achievable plate load" for the plate calculator, using the *equipment profile's* native unit and its actual available increments — not a generic kg↔lb rounding.

**5. Muscle-group volume attribution**

Use `ExerciseMuscleMapping.weight_factor` (§Entity detail): primary role defaults to `1.0`, secondary to `0.5`, per set. Weekly volume per muscle group = `SUM(weight_factor)` over all `LoggedSet` rows where `completed = true AND set_type != 'warmup'`, joined through `SessionExercise → Exercise → ExerciseMuscleMapping`, grouped by `(user_id, iso_week, muscle_group_id)`. This is **set-count-based** (credited sets per muscle per week), not tonnage-based (weight × reps) — set count against published landmarks (roughly 6 sets/muscle/week minimum-effective, 10–15 intermediate, 15–20 advanced) is the standard currency in the hypertrophy literature and is what MacroFactor-style dashboards report. Tonnage can be computed as a secondary metric but should not replace set-count as the primary muscle-volume figure. Drop sets and myoreps (via `parent_set_id`) should still count toward volume (they're real completed sets) but should be excluded from "top set" progression-tracking queries — these are different consumers of the same rows, not different storage.

## 2. System Overview

```
┌───────────────────────────── Client (RN + RN Web, one codebase) ─────────────────────────┐
│  UI layer (screens/components) — reads/writes ONLY against Local DB, never blocks on net  │
│       ↕                                                                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌────────────────┐ │
│  │ Program      │ │ Session      │ │ Progression  │ │ Analytics     │ │ Media / Body    │ │
│  │ design       │ │ logging      │ │ engine (pkg) │ │ (client)      │ │ metrics         │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬────────┘ └───────┬─────────┘ │
│         └────────────────┴────────────────┴────────────────┴──────────────────┘           │
│                                        ↕                                                   │
│                              Local SQLite (single source of truth for UI)                  │
│                                        ↕                                                   │
│                                  Sync engine (outbox + pull cursor)                         │
└──────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                        │ HTTPS (batched push / cursor-based pull)
┌──────────────────────────────────────┴─────────────────────────────────────────────────────┐
│                                   NestJS Backend                                           │
│  ┌────────┐ ┌────────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ ┌───────────┐ ┌───────┐ │
│  │ Auth   │ │ SyncModule │ │Exercise │ │ Program │ │ Session     │ │ Analytics │ │ Media │ │
│  │        │ │ (ingress)  │ │Catalog  │ │         │ │(+Progression│ │ (rollups) │ │       │ │
│  │        │ │            │ │         │ │         │ │ +PR recon)  │ │           │ │       │ │
│  └────────┘ └─────┬──────┘ └─────────┘ └─────────┘ └─────────────┘ └───────────┘ └───────┘ │
│                    ↕                                                                       │
│                Postgres (source of truth for cross-device state)                           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| Local SQLite (client) | Single source of truth for the UI; every read and write goes here first | Never a "cache" — holds full personal training history, since it's small (tens of thousands of rows for a lifetime of one user's sets) |
| Sync engine (client) | Outbox of pending local mutations, pull-cursor tracking, batched push/pull, pull-side conflict reconciliation | Only module besides Auth/Media that talks to the network for data |
| Progression engine (shared package) | Pure function: prior logged history + prescription → next recommendation | Identical code on client and server — see §4 |
| SyncModule (backend) | Single ingress/egress point for all per-user synced row data; sequence-based changefeed | Domain modules plug into it rather than exposing their own separate CRUD surface |
| SessionModule (backend) | Ingests synced sessions/sets, triggers PR reconciliation and analytics recompute | Mostly receives synced writes, not direct API calls |
| AnalyticsModule (backend) | Precomputes/materializes cross-history rollups (weekly muscle volume, PR history) | Recomputed on relevant sync events, synced back down like any other entity |

## 3. Offline-First Sync Architecture

**Topology:** single user, multiple personal devices (phone + browser) — **not** multi-user real-time collaboration. This distinction drives every choice below. Per PowerSync's own architecture rationale, CRDTs exist to solve *peer-to-peer, multi-writer* merge problems; for a hub-and-spoke client↔server topology with one human behind both devices, a **versioned last-write-wins (LWW)** model is simpler to build, test, and reason about, and is the right level of engineering effort here. Do not build CRDT merge logic for this domain — it's solving a problem this app doesn't have.

**IDs:** every locally-created row (`WorkoutSession`, `SessionExercise`, `LoggedSet`, `Routine`, `RoutineExercise`, etc.) gets a **client-generated UUID at creation time**, before any network round-trip. This is what makes offline creation "just work": no temporary local ID that needs remapping once the server assigns a "real" one, and no risk of ID collision blocking a later merge. The server never assigns primary identity for user-authored rows — it only accepts and stores the client-issued UUID (with a uniqueness constraint), and generates its own reference on top for reconciliation, described next.

**Push:** client maintains an outbox (either an explicit change-log table, or a `dirty`/`local_version` marker per row) of pending mutations. A background sync worker batches these to a `POST /sync/push` endpoint on connectivity (app foreground, reconnect event, or periodic timer). Every push carries the client-generated UUID (idempotency key) so retries after a dropped response don't duplicate writes — the server recognizes an already-applied UUID and returns the stored result instead of re-inserting.

**Pull:** rather than relying on wall-clock `updated_at` (client/server clock skew is a real risk across phone + browser + server), the server maintains a **monotonic global sequence** (`BIGSERIAL`, touched on every row mutation via a DB trigger or ORM hook) per user. Client pulls `GET /sync/pull?since=<cursor>` and the server returns everything with `seq > cursor`, ordered by `seq`, in pages; client advances its stored cursor only after successfully applying a page. This is the standard changefeed/outbox pattern and avoids relying on synchronized clocks for correctness.

**Conflict model:** because `LoggedSet` and `SessionExercise` rows are practically append-only (rarely edited after creation, and only ever by the same person), sync at **row granularity**, not whole-session locking — two devices touching *different* sets within the same in-progress session should never conflict at all, they just merge. True conflicts (the same row edited on both devices during the same offline window) are rare and low-stakes for this domain (a training log, not a shared document): resolve with **field-level LWW keyed on the sequence number** — the higher-`seq` write wins server-side, and the losing device is corrected on its next pull (its local copy is overwritten with the winning version). This is a deliberate simplicity choice, informed directly by the PowerSync/ElectricSQL architecture pattern: default to LWW, only add anything fancier if a specific entity later proves it needs it (none currently do).

**Server-authoritative vs. client-computable:**

| Must be client-computable, offline, always | Must be server-authoritative (client shows a provisional version) |
|---|---|
| Progression recommendation ("what weight today") — see §4 | Durable `PersonalRecord` rows — client shows optimistic "PR!" UI at log time, server confirms after merging full cross-device history |
| Plate calculator, e1RM estimation (Epley/Brzycki) — pure functions of local input | Long-horizon analytics rollups (12-month trend charts) — computed server-side from the full merged dataset, synced down as a materialized artifact |
| In-session rest timer, current-session/current-week volume tally | — |

Rule of thumb: anything needed to safely guide **the next set the user is about to perform** must be resident and computable on-device with zero network dependency. Anything that's a cross-device summary or historical record-of-truth can be server-owned and reconciled asynchronously.

**Avoid the "two write paths" pitfall:** domain modules (Program, Session, Exercise, Analytics) should not expose their own separate conventional CRUD REST surface for entities that are also synced — that produces two divergent paths for the same data to enter the system (a classic offline-first bug source: the REST API drifts out of sync with the sync-ingest logic). Synced, per-user, offline-mutable entities go through `SyncModule` exclusively; conventional REST/GraphQL endpoints are reserved for things that are genuinely not per-user offline-mutable state (Auth, media upload URL issuance, first-install download of the seeded exercise catalog).

**Schema migrations across client versions:** the client's local SQLite schema version is independent of, but must stay compatible with, the server's sync contract. Two separate concerns:
- *Local migrations:* versioned, forward-only SQL migration files bundled per app release, applied on app boot before the sync engine runs.
- *Wire contract migrations:* the shape of rows sent over `/sync/push` and `/sync/pull` should be **additive-only** (new nullable columns, never destructive renames/removals) for as long as any client version is in the wild. When a breaking change is unavoidable, gate it behind a minimum-supported-client-version check on the sync endpoints and force an update prompt — acceptable because the device was already online and update-capable at some point before walking into the (offline) gym; the sync layer, not the workout-logging UI, is what needs connectivity to be current.
- A client mid-migration (interrupted app update) must never sync partially-migrated local data — the sync worker checks `local_schema_version === expected` before draining the outbox.

## 4. Progression Engine Placement — Position: Client-Side, Always

**Verdict: run the progression engine on-device, unconditionally. Also run the identical implementation server-side, but only for reconciliation and browser-based program planning — never as the primary path.**

**Argument:** the project's stated core value is "you can walk into a gym with no signal ... the app tells you what to lift next time" (PROJECT.md). This is not a soft preference, it's the load-bearing requirement of the whole product — the recommendation must be available at the exact moment the user is about to start an exercise, potentially having had zero connectivity since arriving. There is no server fallback that satisfies this; a spinner or a stale cached number defeats the app's reason for existing.

This is safe to duplicate precisely *because* the project has already committed to a deterministic, rule-based algorithm (PROJECT.md explicitly rules out AI/LLM-driven programming, mirroring MacroFactor's own public description of "clear rules versus black-box guidance"). A deterministic pure function — `(prior LoggedSets for this exercise, SessionExercise's frozen target_*, periodization-scheme state) → next-session recommendation` — has no server-only dependency (no cross-user population data, no ML weights, no RNG). It's closer to a tax calculator than a recommendation system: given the same inputs, the same code must produce the same output anywhere it runs.

**The real risk the question raises — "must be deterministic and duplicated" — is about *implementation* duplication, not *invocation* duplication.** Two independent hand-maintained copies of the rule engine (one in NestJS, one in the RN app) will drift the moment either one is patched. The fix is not to avoid running it twice, it's to avoid *writing* it twice: implement the progression engine as a single, pure, side-effect-free, framework-agnostic TypeScript package (e.g. `packages/progression-engine` in a monorepo) with no NestJS or React Native dependencies, and have both the client and the server import and invoke that same package. This is the one deliberate architectural investment this document recommends up front, precisely because getting it wrong (two divergent copies) is expensive to detect (it silently produces different in-gym recommendations device-to-device) and expensive to fix later (untangling which "version" of the logic a historical recommendation used).

**Data availability:** because local SQLite already holds the user's full training history (§Sync — "never a cache"), the client never needs a network call to gather inputs for the algorithm; a lifetime of one person's `LoggedSet` rows is trivially small.

**Reconciliation after sync:** server recomputes using the same shared package against the canonical, fully-merged dataset (covering the rare case where the client's on-device computation was based on history that hadn't yet synced from another device). If the server's answer differs from what the client already showed and the user already acted on in the gym, that's historical fact — don't silently overwrite it. Surface a soft "recommendation updated based on your other device's data, applies next time" notice rather than retroactively invalidating a workout the user already completed under the client's advice.

## 5. Component Boundaries

### Client modules

| Module | Talks to | Responsibility |
|---|---|---|
| Auth | Backend Auth API, secure token storage | Login, session token, refresh |
| Local DB / persistence | Everything else (internal) | Schema migrations, repository interfaces; **only** module the UI reads/writes through |
| Sync engine | Local DB, Backend SyncModule | Outbox drain, cursor-based pull, conflict reconciliation on pull |
| Exercise catalog (client) | Local DB (read-mostly cache) | Search/filter by muscle, equipment, movement pattern |
| Program design | Local DB | Routine/RoutineDay/RoutineExercise CRUD |
| Session logging | Local DB, Progression engine, EquipmentProfile | The core in-gym flow: start session (snapshot), log sets, rest timer, plate calculator, superset/drop-set UI |
| Progression engine (shared pkg) | Local DB (read-only) | Pure function, invoked by Session logging |
| Analytics (client) | Local DB | Session/weekly on-read aggregation; layers unsynced local sets on top of server-synced rollups |
| Media | Local file storage, Backend MediaModule | Progress photo capture + upload queue |
| Body metrics | Local DB | Simple local-first CRUD, syncs like session data |

### Backend (NestJS) modules

| Module | Talks to | Responsibility |
|---|---|---|
| AuthModule | Postgres, client Auth | Accounts, JWT/refresh, device registration |
| SyncModule | Postgres, all domain modules | `/sync/push`, `/sync/pull`; single ingress/egress for all per-user synced entities |
| ExerciseCatalogModule | Postgres | Canonical Exercise/MuscleGroup/ExerciseMuscleMapping, seeded from open dataset |
| ProgramModule | Postgres, SyncModule | Routine/RoutineDay/RoutineExercise validation logic |
| SessionModule | Postgres, SyncModule, ProgressionModule | Ingest synced sessions/sets, trigger PR reconciliation |
| ProgressionModule (shared pkg) | SessionModule, ProgramModule | Server-side invocation of the same pure progression package |
| AnalyticsModule | Postgres, SessionModule (event-triggered) | Materialized rollups (weekly volume, PR history), exposed via sync |
| MediaModule | Object storage | Signed upload URLs, metadata rows synced normally |
| EquipmentModule | Postgres, SyncModule | Gym/EquipmentProfile CRUD |

### Data flow

1. UI action → write to Local DB (instant, offline-capable) → row appended to sync outbox automatically.
2. Sync engine drains outbox → `POST /sync/push` (batched, idempotent by client UUID) whenever connectivity exists.
3. `SyncModule` validates/persists into Postgres, delegating to the relevant domain module (e.g., `SessionModule` for `LoggedSet` batches) for side effects: PR reconciliation, analytics-recompute job trigger.
4. Client periodically/on-reconnect calls `GET /sync/pull?since=cursor` → receives other-device writes *and* server-computed artifacts (reconciled PRs, analytics rollups) → applies to Local DB → UI reads reactively update.
5. Progression engine reads Local DB directly at session-start time — this path never touches the network.

## 6. Analytics Computation — Two-Tier, Not One

**Tier 1 — on-device, on-read, must work offline:** current-session and current-week aggregates (SQL `GROUP BY` over local SQLite; a single user's data volume makes this cheap). This tier exists because the moment a set is logged, the user may want to know "how much volume have I done for chest this week" *before any sync has occurred* — it must never wait on a server round trip.

**Tier 2 — server-computed, materialized, synced down:** long-horizon cross-history rollups (12-month volume trend, all-time PR list) live in materialized tables (e.g. `weekly_muscle_volume(user_id, muscle_group_id, iso_week, set_count)`), recomputed by a job triggered whenever `SessionModule` ingests new synced sets, and delivered to clients through the normal sync pull like any other entity. The client does not recompute a year of history itself on every chart render; it displays what synced down and layers any not-yet-synced local sessions on top for "as of right now" freshness.

**PR detection specifically spans both tiers:** client does optimistic detection at log time (compare against the best locally-known value, for immediate celebratory UI) — server does the authoritative detection at sync-ingest time (compare against the full cross-device merged history) and that's what populates the durable, synced-back `PersonalRecord` table. If the two disagree (rare: another device logged a better one first, not yet synced when the local device acted), the server version wins on the next pull.

## 7. Suggested Build Order

Dependency graph, in build order:

1. **Exercise catalog + core taxonomy** (`Exercise`, `MuscleGroup`, `ExerciseMuscleMapping`, `EquipmentProfile` shape) — seeded reference data, no sync complexity yet (read-only, bundled/seeded), but every other module depends on it existing.
2. **Auth + Local DB + sync engine skeleton** (client-generated UUIDs, sequence-based pull cursor, outbox push) — build this *before* it feels needed, on the very first writable entity. Retrofitting sync onto code that was written sync-naively is the single most common local-first rebuild trigger; establishing the pattern early is cheaper than adding it later.
3. **Program design** (Routine/RoutineDay/RoutineExercise CRUD) — first real writable domain entity; exercises the sync engine end-to-end on low-stakes data.
4. **Session logging** (WorkoutSession/SessionExercise snapshot-at-start, LoggedSet, superset/drop-set grouping, plate calculator) — **this is the "usable app soonest" milestone.** Steps 1–4 together are a shippable vertical slice: browse catalog → build a routine → log a full offline workout → data persists and eventually syncs. Ship-worthy even with a static/no-op progression stub.
5. **Progression engine** (shared package, invoked client-side) — depends on step 4 producing real logged history to compute from.
6. **PR detection + client-side analytics** (session/weekly views) — depends only on step 4's data existing locally; no new sync surface.
7. **Server-side analytics rollups + PR reconciliation** — depends on step 4's data flowing reliably through sync; adds the long-horizon trend-chart and multi-device correctness layer.
8. **Multi-gym equipment profiles** — can be built in parallel with 3–4 once the sync engine (step 2) exists; sequenced here only because a single-default-gym MVP doesn't strictly need it.
9. **Auto-generated programs** (goal/experience/equipment/schedule → program) — depends on Program design (3) and ideally on the progression engine's rule set (5) being defined, so generation and progression share one coherent rule vocabulary rather than two.
10. **Body metrics + progress photos + media** — independently buildable any time after step 2 exists; low interdependency, good candidate for a late or parallel phase.
11. **Dashboard customization** — pure presentation layer over analytics (6/7); naturally last.

**Roadmap implication:** the natural phase boundary for "first usable, demoable app" sits at the end of step 4 (catalog → local DB/sync → program design → session logging), not earlier. Splitting steps 1–4 across multiple phases is reasonable for sequencing work, but none of them alone is a demoable product; the progression engine (5) is the first genuinely differentiating feature beyond "any workout logger."

## Anti-Patterns to Avoid

### Anti-Pattern 1: Two write paths for the same data
**What people do:** expose a conventional REST CRUD endpoint for an entity (e.g. `POST /sessions`) *in addition to* the sync-ingest endpoint (`POST /sync/push`).
**Why it's wrong:** the two paths inevitably diverge in validation, side effects (PR reconciliation, analytics triggers), and conflict handling — a classic source of "it works when created online but not when it arrives via sync" bugs.
**Do this instead:** every per-user, offline-mutable entity enters the backend exclusively through `SyncModule`. Reserve conventional endpoints for genuinely non-offline-mutable concerns (auth, media upload URLs, first-install catalog download).

### Anti-Pattern 2: Wall-clock timestamps as the sync cursor
**What people do:** use `updated_at > lastSyncedAt` for pull-since logic.
**Why it's wrong:** client/server/other-device clock skew silently drops or duplicates rows, and is very hard to detect in testing because it usually "works" until a device's clock is wrong.
**Do this instead:** a server-assigned monotonic sequence number per row mutation, used as the pull cursor.

### Anti-Pattern 3: Versioning the whole Routine instead of snapshotting on use
**What people do:** try to solve "historical sessions must stay correct after routine edits" by branching/versioning the entire `Routine` aggregate.
**Why it's wrong:** far more storage and logic than the problem requires, and doesn't actually simplify the read path — you still need to know which version a given session used.
**Do this instead:** snapshot the prescription onto `SessionExercise` at session-start (§Domain Data Model, Q3). The routine stays a single, freely-mutable "current" object; correctness comes from sessions never reading through to it.

### Anti-Pattern 4: CRDT machinery for single-user multi-device sync
**What people do:** reach for Automerge/Yjs-style CRDT merge logic because "offline sync" reflexively suggests CRDTs.
**Why it's wrong:** CRDTs solve concurrent multi-writer merge for collaborative documents; this app has one human across two devices, and true conflicts are rare and low-stakes. The engineering cost (merge semantics, testing, debugging non-deterministic-looking merges) isn't justified.
**Do this instead:** row-level, sequence-keyed last-write-wins, as PowerSync/ElectricSQL-style sync engines default to for this exact topology.

## Sources

- [PowerSync Philosophy](https://docs.powersync.com/overview/powersync-philosophy) — MEDIUM confidence (vendor docs, cross-checked against ElectricSQL comparison)
- [ElectricSQL electric-next vs PowerSync](https://powersync.com/blog/electricsql-electric-next-vs-powersync) — MEDIUM confidence
- [Local-First Architecture: CRDTs & Sync Engines](https://appscale.blog/en/blog/local-first-architecture-crdts-sync-engines-offline-first-2026) — LOW confidence (general web article, used only for pattern corroboration)
- [Offline-First Mobile App Architecture: Syncing, Caching, and Conflict Resolution](https://medium.com/@dadaodunayo6/offline-first-mobile-app-architecture-syncing-caching-and-conflict-resolution-27a4e7b10162) — LOW confidence
- [MacroFactor — Understanding and Using Smart Progressions](https://help.macrofactorapp.com/en/articles/305-understanding-and-using-smart-progressions) — MEDIUM confidence (official product documentation, but algorithm internals remain undisclosed)
- [MacroFactor — What is RIR and How Should I Use It During Training?](https://help.macrofactorapp.com/en/articles/385-what-is-rir-and-how-should-i-use-it-during-training) — MEDIUM confidence
- [wger — Self-Hosted Open-Source Fitness Tracker](https://github.com/wger-project/wger) — MEDIUM confidence (open-source reference implementation)
- [Training Volume Landmarks for Muscle Growth — RP Strength](https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth) — MEDIUM confidence (widely cited industry figures; used for the set-count landmark ranges, not as primary literature)
- [Quantification of weekly strength-training volume per muscle group — Frontiers/PMC](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1536360/full) — MEDIUM confidence (peer-reviewed)
- Domain modeling patterns (snapshot-on-use, client-generated UUIDs, flat-list-plus-annotation grouping) — reasoned from established software architecture practice (order-line-item snapshotting, event-sourcing-adjacent patterns), not a single cited source.

---
*Architecture research for: local-first strength-training tracker (React Native + React Native Web + NestJS)*
*Researched: 2026-08-10*
