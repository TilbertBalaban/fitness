# Project Research Summary

**Project:** Fitness — MacroFactor Workouts Clone
**Domain:** Local-first, cross-platform strength-training / workout-logging app (React Native + React Native Web, NestJS + Postgres)
**Researched:** 2026-08-10
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a strength-training logger and programming engine, cloned functionally from MacroFactor Workouts, built solo on a
pre-decided stack (React Native + React Native Web from one codebase, NestJS + Postgres). Research across four dimensions
converges on a single dominant conclusion: **the local-first data layer is the project.** It is the highest-risk decision,
the hardest thing to retrofit, and — because MacroFactor Workouts is itself documented as *not* offline-capable and
requires network at launch to validate a subscription — it is also the one place where this clone is genuinely better than
the product it copies. Everything else in the roadmap is downstream of getting the data model and sync protocol right first.

The recommended approach: build on Expo SDK 57 / RN 0.86 (New Architecture is mandatory since SDK 55, which erases bare
RN's traditional advantage), with **PowerSync** as the local-first sync engine — the only evaluated option with officially
maintained SDKs on *both* React Native and Web that talks directly to Postgres, and whose write path (durable upload queue
calling a developer-supplied `uploadData()`) maps cleanly onto NestJS controllers so NestJS keeps full ownership of
business logic. Auth via self-hosted Better Auth rather than Clerk, specifically because Clerk's documented offline
behavior conflicts with the gym-network requirement. The exercise library seeds from `free-exercise-db` (MIT, 800+, static
images) enriched by wger (CC-BY-SA 4.0), matching the project's no-video constraint exactly.

The two dominant risks are architectural and motivational. Architecturally: sync built naively (whole-document
last-write-wins, wall-clock cursors, sync-naive schema) is the single most common local-first rebuild trigger, and it must
be established before feature code piles on top of it. Motivationally: "full parity as v1" with no intermediate
self-usable milestone is the documented failure mode for solo clone projects — not because any one feature is too hard,
but because nothing is dogfoodable until nearly everything exists, which is exactly when the sync, backgrounding, and
progression-correctness bugs would otherwise surface. The roadmap must therefore sequence a genuinely usable
log-a-real-workout slice early, without cutting parity from the scope.

## Key Findings

### Recommended Stack

Expo-managed React Native for both targets, PowerSync for local-first persistence and sync, NestJS + Drizzle + Postgres on
the server, Better Auth self-hosted for cross-platform sessions. The one deliberate up-front architectural investment is a
**shared, pure, framework-agnostic progression-engine package** imported by both client and server, so the rule engine is
never implemented twice.

**Core technologies:**
- **Expo SDK 57 / React Native 0.86** — mobile + web from one codebase; New Architecture mandatory since SDK 55, so bare RN offers no remaining advantage while costing EAS Build/Update and Expo Router
- **Expo Router** — file-based routing giving web real, deep-linkable URLs from the same route tree that drives native screens; built on React Navigation, so nothing is given up
- **PowerSync** (`@powersync/react-native` 2.0.2, `@powersync/web` 2.1.1) — local-first sync; the only option with maintained RN *and* Web SDKs talking directly to Postgres. Writes queue durably and flush through your own NestJS endpoints
- **NestJS 11.1.29 + Drizzle ORM + Postgres 15+** — backend; Drizzle over Prisma for a query-builder fit alongside a sync engine. NestJS 12 (~Q3 2026, ESM-only) is not released; do not block on it
- **Better Auth 1.6.26** (self-hosted, NestJS module + Expo plugin) — the only option combining current RN support, self-hosted control over session lifetime (needed to honor expired-but-cached sessions offline), and no per-MAU billing
- **free-exercise-db (MIT) + wger (CC-BY-SA 4.0)** — exercise library seed; static images, no video, matching project constraints
- **Skia + Victory Native XL on native / Recharts on web** — behind a small shared chart abstraction; Victory Native XL has no official web target
- **Turborepo + pnpm workspaces** — required anyway to host the shared progression-engine package

**What NOT to use:** Replicache (archived June 2026), ElectricSQL (PGlite does not run in React Native), Legend-State v3
sync (beta only), Zero (RN story unproven), Auth.js/NextAuth (no real RN callback support), bare React Native.

### Expected Features

MacroFactor Workouts' surface was mapped from its quick-start PDF (read directly) and a 99-article help center. Because
PROJECT.md sets full parity as the v1 bar, **the table-stakes list effectively is the v1 scope** — there is no meaningfully
smaller "validate the concept" cut. Sequencing, not cutting, is the lever.

**Must have (table stakes):**
- Core logging loop: sets/reps/weight, RIR (0–6+), inline previous-set reference, auto-starting rest timer
- Exercise library, muscle-group mapped, searchable, with custom exercises and smart swap
- Custom program builder organized into cycles (weeks) with per-cycle rep/RIR targets
- Auto-generated programs from goal, experience, equipment, schedule, split preference
- Advanced set types: supersets, drop sets, myoreps, partials, failure sets, warm-ups
- Asymmetrical left/right per-side logging for unilateral exercises
- Multi-gym equipment profiles + equipment-scoped plate calculator (incl. machine stack ranges and base resistance)
- Rule-based progression engine (see below), with an explicit "no recommendation available" state
- Volume/progress analytics by muscle group ("Levels" body-map heatmap), workout history, per-exercise trends
- PR detection across multiple PR types (heaviest, best e1RM, most reps at weight, best set volume)
- Customizable dashboard, body metrics, progress photos, one-off/unplanned workouts

**Should have (competitive):**
- **True offline-first logging** — the single highest-leverage differentiator, since MacroFactor itself does not have it
- Background-surviving rest timer with OS-level notifications — the named make-or-break in-gym factor
- Algorithm-transparency: every recommendation can show the rule that produced it (free, because the rules are deterministic)

**Defer (v1.x / v2+):**
- Program export/import; live mid-set PR banner; parallel "specialized training" blocks
- Progression scripting DSL; extra autoregulation signals (soreness/pump); wearable integration

**Explicitly excluded:** nutrition/macro tracking, demo videos, Jeff Nippard licensed imports, AI/LLM programming,
predictive fatigue re-sequencing, social feeds.

### MacroFactor's Smart Progression — what is actually confirmed

Recovered from MacroFactor's own help center, so the engine can be built against real rules rather than guesses:
- Rule-based, explicitly not AI. Each set carries a target rep range and an RIR target.
- **Expected performance = rep-range midpoint + RIR target** (7–9 reps at 2 RIR → expected ~10). Exceeding it triggers progression.
- Sets to failure progress purely on beating prior reps at the same load.
- Two adjustment modes: *expand rep range* (widen reps before adding weight) vs *weight match* (stay in range, prefer matching prior weight).
- Recommendations are constrained by the gym profile's actual available increments, and the engine will explicitly surface "progression unavailable within target rep range" rather than invent a bad number.
- Missed workouts are never penalized. Imprecise RIR is tolerated by design — forgiving bands, not equality checks.
- Cold start: an exercise with no history gets no suggestion; the user picks the first weight.

**Undocumented, and therefore our own design decisions:** the below-target/regression thresholds, any automatic deload
trigger, and the volume-landmark math behind auto-generation.

### Architecture Approach

Client-side SQLite is the single source of truth for the UI — never a cache — with every read and write going through it
and a sync engine draining an outbox to NestJS. The domain model resolves its two hard problems with the same principle
applied twice: **keep structures flat and annotate**, and **snapshot on use**.

**Major components:**
1. **Exercise catalog + taxonomy** — `Exercise` (flattened, with self-referential `variation_of_id`), `ExerciseMuscleMapping` with an explicit per-mapping `weight_factor` column so volume attribution lives in data, not code
2. **Local DB + sync engine** — client-generated UUIDs as idempotency keys, server-assigned monotonic sequence as the pull cursor (never wall-clock), outbox push, versioned forward-only local migrations
3. **Program design** — `Routine`/`RoutineDay`/`RoutineExercise`; deliberately no rigid `ProgramWeek` table, with periodization expressed as a scheme rather than duplicated per-week rows
4. **Session logging** — `SessionExercise` freezes the prescription at session start; `LoggedSet` stays a flat, strictly-incrementing list with `superset_group_id` and `parent_set_id` as pure annotations
5. **Progression engine** — one pure shared package, invoked client-side as the primary path, server-side only for reconciliation
6. **Analytics** — two tiers: on-device on-read for current session/week, server-materialized rollups for long-horizon trends, synced down like any other entity

**Reconciling the one apparent conflict in the research:** ARCHITECTURE.md recommends last-write-wins while PITFALLS.md
warns LWW silently destroys logged sets. These agree once the granularity is made explicit. What is dangerous is
*whole-document/whole-workout* LWW ordered by wall-clock time. What is recommended is **row-level (per set, per field
group) LWW ordered by a server-assigned monotonic sequence**, so a conflict on set 4 cannot touch set 2 and clock skew
cannot reorder events. Logged sets are append-mostly facts, and the topology is one human across two devices — not
multi-writer collaboration — so CRDT machinery is the wrong tool. The binding requirement is therefore: sync at set/field
granularity, sequence-ordered, with an automated two-devices-offline-then-reconcile test asserting no data loss.

### Critical Pitfalls

1. **Whole-document LWW and wall-clock cursors silently lose sets** — sync per set/field with server-sequence ordering; test concurrent offline edits from two devices explicitly. Hardest thing in the project to retrofit.
2. **Sync never tested against real history** — build a seed script generating 1–2 years of realistic training (3–5×/week, 10–20 sets) early and benchmark cold start and initial sync against it, not a handful of hand-entered workouts.
3. **In-gym session state lost to backgrounding or app kill; rest timer dies when the screen locks** — persist every set to SQLite on entry (never on "finish workout"), and implement the rest timer as an OS-scheduled local notification computed from a stored wall-clock target, never a JS interval. Verify with force-quit on a real device.
4. **Domain model that can't express real training data** — model an explicit `load_type` (external weight / bodyweight / bodyweight ± added / assisted / time / distance / unilateral) before any set-logging UI exists; store weight canonically in one unit; capture the local calendar date alongside the UTC instant so "which day was that workout" survives late nights and travel.
5. **Progression engine that ratchets forever, ignores equipment increments, or punishes missed sessions** — bound progression by the programmed rep range, snap recommendations to the gym profile's actual increments, distinguish "no data" from "under-target", use tolerance bands not equality checks, and ship the explicit "unavailable" state.
6. **RN Web divergence discovered late** — establish the `.web.tsx` escape-hatch convention and audit every native module (haptics, notifications, secure storage, background tasks) for web behavior in the setup phase, before feature components pile onto an unverified pattern.
7. **Solo full-parity scope stall** — the meta-pitfall this roadmap exists to prevent: no self-dogfoodable slice until everything is built means the other six pitfalls never surface under real conditions.

## Implications for Roadmap

Research produces a strongly-constrained ordering. Two hard rules fall out: **sync foundation before any feature builds on
it**, and **an early slice the author can actually train with**, because that is the forcing function that surfaces
pitfalls 1–3 under real gym conditions rather than synthetic tests.

### Phase 1: Foundation — monorepo, cross-platform shell, auth
**Rationale:** Establishes the `.web.tsx` escape hatch and native-module audit convention before any feature component exists (Pitfall 5/6), and gets API versioning and mobile-appropriate session lifetimes right from the first release (Pitfall 14).
**Delivers:** Turborepo + pnpm workspace, Expo app running on iOS/Android/web, NestJS service, Postgres, Better Auth end-to-end, API versioning, CI.
**Avoids:** RN Web divergence discovered late; stale-mobile-client API breakage.

### Phase 2: Data model + sync engine
**Rationale:** The single most expensive thing to retrofit. Must exist before the first writable domain entity, on the principle that establishing the pattern early is far cheaper than adding it later.
**Delivers:** Full domain schema (with `load_type`, canonical kg storage, local calendar date), local SQLite + PowerSync wiring, outbox push, sequence-based pull cursor, versioned local migrations, aggregate-atomic sync, a 1–2 year seed generator, and the two-devices-concurrent-edit test.
**Avoids:** Pitfalls 1, 2, 3, 4, 9, 10, 12 — the majority of the project's unrecoverable risk lives here.

### Phase 3: Exercise catalog
**Rationale:** Every later component depends on it; read-mostly, so it exercises sync gently. Muscle mapping must land here because analytics and generation both require it.
**Delivers:** Seed/normalize ~900 exercises from free-exercise-db + wger, muscle taxonomy with `weight_factor`, load types, unilateral flags, search, custom exercises, soft-delete/archive and duplicate-merge.
**Avoids:** Deletion orphaning history; dataset schema leaking into the domain model.

### Phase 4: Program builder
**Rationale:** First real writable domain entity — exercises the sync engine end-to-end on low-stakes data before the in-gym path depends on it.
**Delivers:** Routines, days, cycles, per-cycle rep/RIR/rest targets, ordering, archive/duplicate.

### Phase 5: In-gym session logging — **the first dogfoodable milestone**
**Rationale:** Phases 1–4 plus this is the smallest genuinely usable product: build a routine, walk into a gym, log a full offline workout. This is the forcing function the whole roadmap depends on.
**Delivers:** Session start with prescription snapshot, inline set entry with previous-set reference, custom numeric keypad, tap-to-complete/tap-to-undo, auto-starting background-surviving rest timer with notifications, crash/force-quit recovery, one-off workouts, session summary.
**Avoids:** Pitfalls 6 and 7 — validated by force-quit and one-handed time-pressured testing, not by inspection.

### Phase 6: Equipment profiles + plate calculator
**Rationale:** Tightly coupled and must precede progression, since recommendations are constrained by real available increments.
**Delivers:** Multi-gym profiles, plate/bar/stack config with base resistance, inline live plate-breakdown strip, increment snapping.

### Phase 7: Advanced set types + asymmetrical tracking
**Rationale:** Additive to the set model established in Phase 2; supersets also require touching Phase 5's rest-timer trigger logic.
**Delivers:** Supersets (with paired rest semantics), drop sets, myoreps, partials, failure sets, smart warm-ups, per-side logging.

### Phase 8: Progression engine
**Rationale:** Consumes logged history (5) and equipment increments (6), and must precede analytics, which reuses its e1RM and rep-range logic.
**Delivers:** Shared pure package invoked client-side, both adjustment modes, expected-performance rule, forgiving RIR bands, increment snapping, missed-session neutrality, explicit "unavailable" state, and inline "why this recommendation".
**Research flag:** Needs its own phase-level research pass — the below-target and deload rules are genuinely undocumented and are our design decisions.

### Phase 9: PR detection + client analytics
**Rationale:** Depends only on logged data existing locally; adds no new sync surface.
**Delivers:** Multi-type PR detection, per-exercise performance over time, session/weekly volume, e1RM with rep-range validity limits.

### Phase 10: Server analytics rollups + reconciliation
**Rationale:** Long-horizon trends and cross-device authoritative PRs require the full merged dataset.
**Delivers:** Materialized weekly muscle volume, authoritative PR reconciliation, recompute-on-edit invalidation, N+1-safe nested endpoints with query-count assertions.

### Phase 11: Auto-generated programs
**Rationale:** Deliberately late — depends on the program model (4), the catalog (3), equipment (6), and ideally the progression rule vocabulary (8) so generation and progression share one coherent rule set. Highest algorithmic complexity with the least public documentation.
**Delivers:** Goal/experience/frequency/duration/equipment/split/emphasis → full program with pre-periodized targets and deload placement.
**Research flag:** Volume-landmark math is undocumented; needs a dedicated research pass.

### Phase 12: Body metrics, progress photos, customizable dashboard
**Rationale:** Body metrics are independent of everything and could move earlier if desired; the dashboard is pure presentation over analytics and is naturally last.
**Delivers:** Measurements, progress photos with media upload queue, before/after composite, Levels body-map heatmap, configurable dashboard widgets.

### Phase Ordering Rationale

- Sync foundation is second, not late, because retrofitting sync onto sync-naive code is the most common local-first rebuild trigger and the majority of unrecoverable risk concentrates there.
- The exercise catalog precedes the program builder, progression, and analytics because all three require exercise→muscle mapping and load types that must be part of initial seeding.
- Phase 5 is deliberately positioned as the first dogfoodable milestone, directly answering the solo-scope-stall pitfall — from that point the author is training with the app while the remaining phases are built.
- Equipment profiles precede progression because a recommendation that ignores available increments is useless, and precede/accompany the plate calculator because a calculator without gym-scoped equipment is just generic math.
- Auto-generation is last among functional features despite being table stakes: it is the most algorithmically complex, the least documented, and the only one nothing else depends on.
- Sequencing completionist features late is explicitly *not* the same as cutting them — the parity bar is unchanged.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (data model + sync):** highest-consequence architecture; PowerSync self-hosting requires its own MongoDB instance for internal state — spike whether that ops burden is acceptable solo, or price PowerSync Cloud
- **Phase 8 (progression engine):** below-target thresholds and deload logic are undocumented; needs derivation from evidence-based literature
- **Phase 11 (auto-generation):** volume-landmark/sets-per-muscle formulas are undocumented
- **Phase 5 (rest timer background execution):** iOS/Android background limits and `expo-notifications` background-delivery reliability need device-level verification, not doc reading

Phases with standard patterns (research optional):
- **Phase 4 (program builder), Phase 9 (client analytics), Phase 12 (body metrics/dashboard)** — conventional CRUD and aggregation over an already-settled model

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified live against the npm registry on 2026-08-10, not training data; the local-first category itself is moving fast (MEDIUM-HIGH on that one call) |
| Features | MEDIUM-HIGH | MacroFactor's quick-start PDF read directly and 99-article help center mapped; competitor claims cross-checked but not hands-on tested |
| Architecture | MEDIUM | Established patterns (order-line snapshotting, flat-list-plus-annotation, client UUIDs + sequence cursor) cross-checked against sync-vendor docs and wger; MacroFactor's internals are not public |
| Pitfalls | MEDIUM-HIGH | Sync, RN Web, and background-execution pitfalls are well-documented consensus; MacroFactor's positive-case progression mechanics quoted from official docs |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **MacroFactor's below-target/regression thresholds and any automatic deload trigger are not public** — design our own during Phase 8, informed by RP volume landmarks and SBS autoregulation, and document the decision rather than pretending to mirror.
- **Smart Generation's volume-landmark math is not public** — same treatment in Phase 11.
- **PowerSync Service self-hosting requires a MongoDB instance for internal state** — spike during Phase 2 planning; the fallback is PowerSync Cloud or the WatermelonDB runner-up (which needs its own New-Architecture compatibility spike).
- **Better Auth's Expo client plugin package name** should be re-verified against current docs before the first install.
- **MacroFactor's crash/kill resilience mid-session is unverified** — worth checking empirically against the real app, since it is exactly what this project intends to beat.
- **No MacroFactor-Workouts-specific user complaint corpus exists yet** (product launched Q1 2026); UX-friction claims lean on longer-lived competitors as proxies.

## Sources

### Primary (HIGH confidence)
- npm registry, queried directly 2026-08-10 — authoritative versions for Expo, React Native, NestJS, PowerSync, Drizzle, Better Auth, and all evaluated sync/chart libraries
- `macrofactor.com/.../Workouts-Quick-Start-Guide.pdf` — read directly; UI screenshots and the actual in-workout logging surface
- MacroFactor help center — Smart Progressions (`/305-`), progressive overload (`/372-`), RIR (`/385-`), Smart Generation (`/285-`), connectivity/offline (`/366-`), plus ~15 further articles across a 99-article index
- PowerSync, WatermelonDB, ElectricSQL, Better Auth, and Expo official documentation
- `yuhonas/free-exercise-db` and `wger-project/wger` repositories — licensing and dataset shape verified against source

### Secondary (MEDIUM confidence)
- Hevy, Strong, Boostcamp, Fitbod feature pages and help centers — competitive comparison
- Stronger by Science autoregulation material; RP volume-landmark articles; peer-reviewed weekly-volume quantification (Frontiers)
- 1RM formula accuracy comparisons — Epley/Brzycki reliability by rep range

### Tertiary (LOW confidence, flagged inline in source docs)
- Review/comparison aggregators used only for competitor positioning
- Clerk offline black-screen duration (single community anecdote, consistent with Clerk's own documented `ClerkOfflineError` behavior)
- MacroFactor exercise/video counts (sources disagree: 600 / 638 / 900+) — not load-bearing, since this project seeds its own dataset

---
*Research completed: 2026-08-10*
*Ready for roadmap: yes*
