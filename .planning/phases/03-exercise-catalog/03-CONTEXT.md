# Phase 3: Exercise Catalog - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The user can find any exercise they train, offline, and every row carries the muscle and load metadata that Phases 4, 5, 8, 9 and 10 read.

**In scope:** Sourcing, normalizing and seeding roughly 900 exercises plus the `MuscleGroup` taxonomy and `ExerciseMuscleMapping` weights into Postgres; the `ExerciseCatalogModule` on the backend; the delivery path that puts catalog content on-device so search and detail work with no signal; search by name, filter by muscle group / equipment / movement pattern; the exercise detail screen (target muscles, cues, setup instructions, static images); custom exercise create / edit / duplicate; archive; never-suggest; an explicit `load_type` taxonomy applied to every row, seeded and custom; the bodyweight-contribution data EXER-09 needs; and suggested alternatives (smart swap).

**Out of scope:** All program and logging surfaces. No program builder (Phase 4), no set-logging UI (Phase 5), no rest timer or plate calculator (Phase 5), no progression rules (Phase 8), no analytics or PR surfaces (Phases 9–10), no gym/equipment-profile management UI (Phase 7 per ROADMAP; `equipment_profile` already exists as a table). EXER-08 and EXER-09 are **data-model requirements in this phase, not logging features** — ROADMAP criterion 4 says so explicitly: every load type must be *representable* "before any logging UI exists". This phase makes bodyweight, assisted, time-based and distance-based movements expressible and correctly attributed; Phase 5 is where sets are logged against them.

**Discussion:** The user declined to discuss any gray area for this phase ("nothing, decide by yourself") — the same call made for Phase 2. Every open decision below is delegated to research and planning. The `Decisions` section records only what prior artifacts and shipped code already locked. Nothing in it was decided by the user in this session.

</domain>

<decisions>
## Implementation Decisions

### Carried forward — already locked, do not re-litigate

These are constraints this phase inherits, restated so the planner treats them as fixed inputs rather than open questions.

- **D-01:** **`SyncModule` is the sole ingress for per-user, offline-mutable data; the seeded catalog is explicitly not that.** Phase 2 D-01 reserves ordinary REST endpoints for auth, media upload URL issuance, and **first-install catalog download** — that carve-out exists for exactly this phase. `ops/powersync/sync-rules.yaml` already encodes the split in code and in a comment: the only exercise query in the user stream is `SELECT * FROM exercise WHERE user_id = auth.user_id()`, and the file states "The seeded exercise taxonomy tables are deliberately absent from every query below: catalog content delivered by the first-install download (D-01), never a per-user synced row." A user's own custom exercises sync; the ~900 seeded rows do not. — **Reversibility:** one-way — adding the seeded catalog to the sync stream means every client re-downloads roughly 900 rows through the sync protocol and the per-user bucket boundary stops being per-user.

- **D-02:** **Every user-authored row carries a client-generated UUID issued before any network round-trip** (Phase 2 D-02). A custom exercise created offline gets its id locally and the server accepts it under a uniqueness constraint. `apps/mobile/lib/db/id.ts` already exists for this. — **Reversibility:** one-way — an ID remapping migration across every synced table plus every client's local database.

- **D-03:** **A variation is a full `Exercise` row, never a separate table.** `variation_of_id` is a nullable self-FK used only for UI grouping and analytics roll-ups (`ARCHITECTURE.md` §1, "Do not create a separate `ExerciseVariation` table"). The column already exists and is already self-referential in `apps/api/src/db/schema/catalog.ts`. — **Reversibility:** costly — every consumer (program design, session logging, PR detection) would gain a second join.

- **D-04:** **`weight_factor` on `ExerciseMuscleMapping` is data, not a hardcoded 1.0/0.5 in code.** `ARCHITECTURE.md` §1 is explicit and the shipped schema already carries `numeric(4,2)` for it, with a code comment naming the stiff-leg deadlift case (primary hamstrings, secondary glutes, secondary lower back, three different weights). Seeding must populate real per-exercise values, not a binary role→constant mapping — volume analytics in Phase 9 is only correct if it does. — **Reversibility:** costly — re-deriving true weights after the fact means re-normalizing the whole seeded dataset.

- **D-05:** **Exercise deletion is archive-only; a row with logged history is never hard-deleted.** `PITFALLS.md` §11 and ROADMAP criterion 3. `archived_at` already exists on the table. Archived exercises stay queryable for historical sets and disappear from pickers. Note `personal_record.exercise_id` is `notNull` and `session_exercise.exercise_id` is `notNull` — a hard delete would break both. — **Reversibility:** one-way — a hard delete that reaches production destroys history that cannot be reconstructed.

- **D-06:** **PowerSync is the sync engine** (Phase 2 resolved this discretion item; `@powersync/react-native` 2.1.x, `@powersync/web` 2.2.x, Streams edition 3). Any catalog delivery mechanism must coexist with it in the same local SQLite database without fighting PowerSync's ownership of the schema. This is a real constraint, not a formality — see the first discretion item. — **Reversibility:** one-way.

- **D-07:** **NativeWind 4 + `apps/mobile/lib/theme.ts` / `theme-colors.ts` is the styling foundation, and Phase 1's five-tab Expo Router scaffold is what feature screens fill in** (Phase 1 D-09). This phase does not restructure navigation. — **Reversibility:** reversible.

- **D-08:** **Weights are stored canonically in kg as decimal, converted only at the display boundary** (Phase 2 D-04). Any load or bodyweight-contribution figure this phase introduces obeys it. `packages/api-contracts/src/units.ts` owns the conversion. — **Reversibility:** one-way.

### Claude's Discretion

The user chose not to discuss any area. Everything below is delegated. These are not coin flips: four of them are **schema gaps that the shipped Phase 2 tables cannot express as they stand**, and one is a licensing commitment that follows the project permanently. The researcher must resolve each explicitly and record the reasoning; the planner must not paper over them.

- **Catalog delivery to the device, and how it stays offline-true.**
  This is the phase's central unsolved problem and everything else depends on it. The facts: `apps/mobile/lib/db/schema.ts` has an `exercise` table but **no `muscle_group` and no `exercise_muscle_mapping`** — muscle data currently has no route to the device at all, and EXER-02 (filter by muscle group) and EXER-03 (view target muscles) both need it with no signal. `sync-rules.yaml` deliberately excludes the seeded taxonomy (D-01). So a mechanism must be chosen and built. Candidates, none free: (a) ship the catalog as a versioned asset bundled into the app build and load it into local SQLite on first boot — no network at all, but every catalog correction needs an app release or an EAS update; (b) a first-install REST download from `ExerciseCatalogModule` into local SQLite with a catalog-version handshake — the literal D-01 carve-out, but it introduces a cold-start network dependency on a machine that may never have had signal, which is precisely the failure `PROJECT.md`'s core value forbids; (c) add the catalog tables to PowerSync as a global (non-user-scoped) stream — reuses the sync machinery and gets updates for free, but contradicts the D-01 comment already written into `sync-rules.yaml` and makes ~900 rows per-user traffic. Decide against: does a user who installs the app and walks straight into a basement gym get a working catalog; how a catalog update reaches an existing install without clobbering their custom exercises; and whether the local tables PowerSync manages can coexist with tables it does not. Whichever is chosen, `apps/mobile/lib/db/schema.ts` gains the two missing taxonomy tables. — **Reversibility:** one-way — the delivery path determines the local schema, the first-run sequence, and the update story for every install in the field.

- **Per-user state on globally-shared rows — the EXER-06 / EXER-07 gap.**
  `exercise.archived_at` sits on a row whose `user_id` is **null** for all ~900 seeded exercises. Archiving a seeded exercise by writing `archived_at` would archive it for every user of the system. And **no `never_suggest` column exists anywhere** — EXER-07 has no home in the current schema. Both requirements are per-user actions against rows nobody owns. Options: (a) a new user-scoped table (`user_exercise_preference` or similar: `user_id`, `exercise_id`, `archived_at`, `never_suggest`) that *does* sync through PowerSync — cleanly separates global content from personal state, at the cost of a left join on every picker query; (b) copy-on-write — archiving a seeded exercise forks a user-owned row, which then diverges from the seed and breaks the shared `exercise_id` that `personal_record` and `session_exercise` point at; (c) restrict `archived_at` to custom exercises only and let never-suggest be the mechanism for seeded ones — smallest change, but ROADMAP criterion 3 says "archiving *an* exercise removes it from pickers", not "archiving a custom exercise". Note the requirements are genuinely distinct: EXER-07's never-suggest is documented in `FEATURES.md` as an exclusion list for injuries, dislikes and unavailable equipment — it must survive without deleting anything, and it is what the Phase 6 auto-generator will read. Whichever shape is chosen, the sync-rules file and both schema files change together. — **Reversibility:** one-way — this is the ownership boundary between global content and personal state; changing it later means migrating whatever per-user rows already exist.

- **The `load_type` taxonomy — ROADMAP criterion 4, and the phase's clearest one-way door.**
  `load_type` is `text().notNull()` today with **no enum, no check constraint, and no documented value set**, on both the Postgres and SQLite sides. `ARCHITECTURE.md` §1's `Exercise` entity does not list the column at all — it was added during Phase 2 without a defined vocabulary. EXER-08 names six cases: external weight, bodyweight, bodyweight plus added load, assisted, time-based, distance-based. Open: whether that is one flat enum of six, or two orthogonal axes (what provides resistance × what the user actually enters — because "time-based" and "distance-based" describe the *measurement*, while "assisted" describes the *resistance*, and a weighted carry is arguably both loaded and distance-measured); where the enum lives so both clients and the server share exactly one definition (`packages/api-contracts/` is the existing home for shared contracts and is required to be additive-only while any client is in the field); and whether the constraint is enforced in Postgres, in the contract package, or both. Criterion 4 requires this to be settled and applied to **every** row before Phase 5 exists. Under-specifying here is the expensive direction: `PITFALLS.md` §9 is exactly this failure, and Phase 5's set-logging UI, Phase 8's progression rules and Phase 9's volume math all branch on this value. — **Reversibility:** one-way — the value lands in a notNull column on ~900 seeded rows plus every custom exercise, and it is the discriminator every downstream phase switches on.

- **Bodyweight contribution (EXER-09) — where the number lives and what it means.**
  No column exists for it. `FEATURES.md` records that MacroFactor shows "bodyweight contribution (i.e., what % of bodyweight loads the movement — used for exercises like pull-ups, dips, lunges so volume/weight tracking accounts for bodyweight, not just added load)", and ships a whole help article explaining it. EXER-09's phrasing — "so volume and load stay meaningful **as bodyweight changes**" — is the harder half: it implies the effective load of a past pull-up set is a function of the user's bodyweight *at the time of that set*, which lives in `body_metric` (the table exists, with `kind` and `value`). Open: whether the fraction is a per-exercise column (a decimal on `exercise`), a derived value from the muscle mapping, or a per-load-type default with per-exercise overrides; and whether historical effective load is computed at read time by joining to the nearest `body_metric`, or snapshotted onto the set at log time in Phase 5 (the same snapshot-vs-read-through question D-05 already answered for prescriptions — answering it the same way here would be consistent, but this phase only needs to make it *possible*, not implement the logging path). Do not build Phase 5's half; do make sure the data model does not foreclose it. — **Reversibility:** one-way if it becomes a stored column on ~900 rows; the read-time-vs-snapshot half is Phase 5's to finish.

- **Seed dataset choice and the licensing commitment it carries.**
  `STACK.md` names `yuhonas/free-exercise-db` the primary seed (800+ exercises, repo MIT, **but the README warns per-exercise source licenses vary and must still be honored**) and wger the strong secondary (845+, **CC-BY-SA 4.0 — ShareAlike obligates any derivative dataset to carry the same license forever**). ExerciseDB is ruled out: GIF-first, conflicting with the project's static-images-only constraint, and murkiest licensing. Open: which is primary, whether wger is merged in at all given ShareAlike follows the merged dataset permanently, and how the per-exercise license terms of free-exercise-db entries are actually checked rather than assumed. Also entirely unsolved: the normalization work, which is the real bulk of this phase and is explicitly called out in `PROJECT.md` as "real work, not a config step" — mapping a foreign dataset's muscle names onto `ARCHITECTURE.md` §1's fixed 15-group taxonomy, inferring `movement_pattern` from the nine-value vocabulary in §1, assigning a `load_type` to every row, assigning honest `weight_factor` values (D-04), detecting near-duplicates across ~900 rows (`PITFALLS.md` §11 calls duplicate merging "a near-certain need"), and deciding whether normalization is a committed generated artifact or a script re-run at seed time. Record the chosen license and its obligations in the repo. — **Reversibility:** one-way for licensing — a ShareAlike dataset cannot be relicensed after the fact.

- **Images (EXER-03) — where they live and whether they survive offline.**
  `image_urls` is a `text[]` today, holding URLs, and nothing populates it. free-exercise-db hosts static images in-repo, raw-GitHub-addressable. Options: vendor the images into the app bundle (offline-true, but ~900 exercises × 2 images is real bundle weight on a mobile app); serve them from the project's own storage with on-device caching (needs the cache to be warm before the gym, i.e. a pre-fetch strategy and a cache-eviction policy); hot-link raw GitHub (fastest to build, an availability and arguably a licensing problem, and broken with no signal); or ship v1 with cues and no images and let `image_urls` stay empty. EXER-03 lists static images as part of the detail view and `PROJECT.md` lists "text cues + static imagery" as the deliberate replacement for the video MacroFactor has — so dropping them entirely needs to be a stated, visible choice rather than an omission. Note the "hostile gym environment" premise applies: a detail screen that shows a broken image placeholder mid-workout is the failure mode. — **Reversibility:** reversible for the hosting mechanism; the bundle-size decision is costly to unwind once shipped.

- **Smart swap (EXER-10) — what actually drives "suggested alternatives".**
  `FEATURES.md` documents it as used both when building a program and mid-workout when equipment is unavailable, which means the ranking function must be able to take an equipment constraint. Available signals already in the schema: `exercise_muscle_mapping` (shared primary muscle, weighted), `equipment_required`, `movement_pattern`, `unilateral`, and `variation_of_id` grouping (D-03). Options: a deterministic scoring function over those columns; a hand-curated swap table seeded alongside the catalog; or `variation_of_id` siblings only (cheapest, and much too narrow — a lat pulldown is a reasonable pull-up alternative and shares no parent). Deterministic and explainable is the house style — `PROJECT.md` rules out AI/LLM programming and `FEATURES.md` notes MacroFactor pairs every recommendation with a plain-language "why". Whatever is chosen must run **client-side against local data**, since mid-workout swap happens with no signal; and it must respect never-suggest and archived state, which is why this item depends on the per-user-state decision above. Keep it proportionate — it is one requirement, not a recommendation subsystem. — **Reversibility:** reversible — a scoring function is local and swappable.

- **Search and filter mechanics, and ~900 rows on two platforms.**
  EXER-01 is search by name; the schema also carries `aliases text[]`, which implies alias matching is expected. `PITFALLS.md` §5 (React Native Web platform divergence) is the live risk: **no virtualized-list library and no search library are installed today** (`apps/mobile/package.json` has neither FlashList nor any fuzzy-match package), and Phase 1's established escape hatch is `.web.tsx`. Open: SQLite FTS5 versus `LIKE` versus in-memory fuzzy matching over a loaded array; whether alias and typo tolerance are in scope for v1; how the three filter dimensions of EXER-02 combine (AND across dimensions, OR within one, presumably — say so); and how a ~900-row list stays smooth on both RN and RN-Web without maintaining two implementations. Note this phase is the project's **first real feature UI** — Phase 1 shipped five labelled placeholders and Phase 2 shipped no UI at all — so whatever list, search-input, filter-chip and detail-screen patterns land here become the house style for Phases 4–11. Treat that as a reason for care, not a reason for scope. — **Reversibility:** costly — not the search implementation itself, but the component patterns every later screen copies.

- **Custom exercise scope (EXER-04 / EXER-05), and duplicate-from-seed.**
  `is_custom`, `source` and the nullable `user_id` already exist and already sync. Open: whether "duplicate" (EXER-05) can duplicate a *seeded* exercise into a user-owned copy — `FEATURES.md` lists "duplicate" alongside "edit settings" and "delete (for custom exercises)", and duplicating a seeded row is the natural way a user says "same as this, but on the other machine". If yes, decide what `variation_of_id` and `source` are set to on the copy, and confirm the copy's muscle mappings come along (they live in a table that, per the first discretion item, may not even exist locally yet). Also: what a custom exercise must supply — EXER-04 names name, target muscles, equipment and tracking type, and "tracking type" is the `load_type` decision above surfacing in the create form.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent and scope
- `.planning/PROJECT.md` — core value ("walk into a gym with no signal"), the no-video constraint, and the Context note that exercise-data sourcing "is real work, not a config step"
- `.planning/REQUIREMENTS.md` §"Exercise Library" — this phase owns EXER-01 through EXER-10 and nothing else
- `.planning/ROADMAP.md` §"Phase 3: Exercise Catalog" — the goal and the four success criteria this phase is verified against; note criterion 4's "before any logging UI exists" clause, which is what keeps EXER-08/09 a data-model deliverable rather than a logging feature

### The data model — read before touching any schema
- `.planning/research/ARCHITECTURE.md` §1 "Domain Data Model" — the `Exercise`, `MuscleGroup` and `ExerciseMuscleMapping` entity detail, the fixed 15-group muscle taxonomy, the nine-value `movement_pattern` vocabulary, the explicit "do not create a separate `ExerciseVariation` table" ruling, and the `weight_factor`-as-data argument. **Note it does not define `load_type`** — that column was added in Phase 2 without a vocabulary, and defining it is this phase's job
- `.planning/research/ARCHITECTURE.md` §5 "Component Boundaries" — `ExerciseCatalogModule` is the named backend module this phase builds ("Canonical Exercise/MuscleGroup/ExerciseMuscleMapping, seeded from open dataset")
- `.planning/research/ARCHITECTURE.md` §7 "Suggested Build Order" — step 1 is this catalog, described as "seeded reference data, no sync complexity yet (read-only, bundled/seeded)". The ROADMAP moved it after the sync engine; the delivery-mechanism discretion item turns on reconciling those two
- `.planning/research/ARCHITECTURE.md` §"Anti-Pattern 1: Two write paths for the same data" — the constraint the first-install catalog download is carved out of

### Pitfalls this phase exists to prevent
- `.planning/research/PITFALLS.md` §11 "Editing history and deleting exercises silently corrupts downstream analytics" — the single most relevant pitfall. Archive-not-delete, duplicate merging that migrates historical references rather than deleting, and the warning sign to design against (a hard `DELETE` with no reference check)
- `.planning/research/PITFALLS.md` §9 "Domain modeling that can't express real training data" — the cost of under-specifying `load_type`
- `.planning/research/PITFALLS.md` §5 "React Native Web platform divergence breaks core interactions" — the search/list/filter surface is where this phase can hit it
- `.planning/research/PITFALLS.md` §13 "N+1 queries on nested workout/program data" — exercise + muscle mappings + images is exactly the nested shape

### The reference product
- `.planning/research/FEATURES.md` §"Exercise library" — the MacroFactor surface being cloned: ~900 exercises, detail-screen contents including bodyweight contribution, custom creation (name/target muscles/equipment/tracking type), search, duplicate, edit, smart swap used both at program-build and mid-workout, and "Prevent exercise from being suggested" as an exclusion list independent of deletion
- `.planning/research/FEATURES.md` §"Gym profiles and equipment" — why smart swap must accept an equipment constraint ("that machine's taken/broken" is a designed-for moment)

### Stack and licensing
- `.planning/research/STACK.md` §"Exercise Dataset (Seed Data Source)" — the three-way comparison and the licensing terms that follow each choice; free-exercise-db's per-exercise license caveat and wger's CC-BY-SA ShareAlike obligation are both load-bearing. Versions and claims were captured 2026-08-05/10 and must be re-verified before committing to a source

### What Phases 1 and 2 built and locked
- `.planning/phases/02-data-model-sync-engine/02-CONTEXT.md` — D-01 (single write path, catalog-download carve-out), D-02 (client UUIDs), D-04 (canonical kg), D-05 (snapshot-on-use) all constrain this phase
- `.planning/phases/02-data-model-sync-engine/02-VERIFICATION.md` — what Phase 2 actually proved, and against which target
- `.planning/phases/01-cross-platform-foundation/01-CONTEXT.md` — D-09 (the five-tab Expo Router scaffold this phase fills in) and the styling-foundation discretion item, resolved as NativeWind 4
- `.planning/phases/01-cross-platform-foundation/01-UAT.md` — outstanding verification debt; Android verification is deferred wholesale to Phase 999.1 by user decision

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/db/schema/catalog.ts` — **the catalog schema already exists.** `muscle_group` (`id`, `name`, `body_region`), `exercise` (with `aliases[]`, `movement_pattern`, `equipment_required`, `load_type`, `unilateral`, `instructions_text`, `cue_text`, `image_urls[]`, `is_custom`, `variation_of_id` self-FK, `source`, `archived_at`, `server_seq`), and `exercise_muscle_mapping` (composite PK, `role`, `weight_factor numeric(4,2)`). This phase fills these tables and extends them where the discretion items require; it does not design them from scratch.
- `apps/mobile/lib/db/schema.ts` — the local SQLite mirror. Has `exercise`; **does not have `muscle_group` or `exercise_muscle_mapping`**. Note the file's own convention comment: column names stay snake_case and identical to Postgres, and decimals are stored as exact strings because SQLite has no decimal type — `weight_factor` must follow that rule.
- `packages/api-contracts/src/` — `index.ts`, `sync.ts`, `units.ts`. The existing home for anything both sides must agree on; the `load_type` vocabulary belongs here. The wire contract is required to be additive-only while any client version is in the field.
- `apps/mobile/lib/theme.ts` and `theme-colors.ts` — the Phase 1 theming layer every screen in this phase inherits, under NativeWind 4 (`nativewind` 4.2.6, `tailwindcss` 3.4.19, `react-native-css-interop` 0.2.6).
- `apps/mobile/app/(tabs)/` — the five placeholder screens from Phase 1 (`index`, `programs`, `workout`, `history`, `profile`) with an existing `.web.tsx` layout split. The catalog needs a home in this tree.
- `apps/api/src/seed/generate-corpus.ts` — the Phase 2 seeded-corpus generator, with a deterministic mulberry32 PRNG and an FNV-1a per-account seed fold, plus `corpus-shape.ts`. The catalog seeder is a sibling script, and the determinism discipline in this file is the established bar. Whether the corpus generator should start drawing from the real catalog is worth deciding.
- `apps/api/src/sync/` — `sync.service.ts`, `conflict-policy.ts`, `patch-update-set.ts`, `powersync-token.ts`. Custom exercises flow through this unchanged; seeded catalog rows do not touch it.

### Established Patterns
- **The catalog/sync split is already written into `ops/powersync/sync-rules.yaml`** and defended in a comment. A plan that puts seeded rows into the user stream is contradicting a shipped, commented decision and must say so explicitly.
- **`.web.tsx` is the platform escape hatch** (Phase 1), already used for `(tabs)/_layout`, `powersync`, `reset-password` and the durability harness. The list/search surface is the next likely place it is needed.
- **Tests are the accepted evidence.** Phase 1 closed with 86/86 mobile unit tests plus e2e against live Postgres; Phase 2 added Playwright e2e against a real browser, a live PowerSync Service and real Postgres (`apps/mobile/e2e/`, `apps/mobile/playwright.config`, `pnpm test:e2e`). Seed correctness, normalization coverage and the archive-preserves-history criterion are all automatable and should be tests, not UAT rows.
- **No REST CRUD exists for domain data, deliberately.** `apps/api/src/` holds auth, common, db, health, mailer, seed and sync — nothing else. `ExerciseCatalogModule` will be the first read-only domain module; keeping it read-only is what keeps Anti-Pattern 1 intact.

### Integration Points
- `session_exercise.exercise_id` and `personal_record.exercise_id` are both `notNull` and both point at `exercise.id`. Every archive, merge and duplicate decision has to leave those references valid — this is ROADMAP criterion 3 in schema terms.
- `routine_exercise.exercise_id` (Phase 4's table, already created) points here too. The catalog picker this phase builds is what Phase 4 will reuse.
- `equipment_profile.machine_availability` is a `jsonb` column that `ARCHITECTURE.md` §1 describes as possibly "a join table of exercise_id → available bool" — smart swap's equipment constraint reads whatever shape that ends up being. Phase 7 owns the profile UI; do not build it here, but do not design the swap function so that it cannot consume it.
- `body_metric` (`kind`, `value`, `recorded_at`, `local_date`) is where a user's bodyweight lives — EXER-09's effective-load story terminates there.
- `exercise.server_seq` defaults from the shared `sync_seq` sequence even for seeded rows; whether a non-syncing table should be consuming that sequence is worth a look during planning.

### Environment constraint
No Xcode and no Android SDK on this machine. iOS/Android runtime verification is unavailable and Android verification is deferred to Phase 999.1 by user decision. Plan verification around automated tests and the web target; do not write success criteria that can only be closed on a native device. This bites harder in this phase than the last two, because it is the first phase whose deliverable is mostly UI.

</code_context>

<specifics>
## Specific Ideas

- **"Before any logging UI exists" is the phrase that scopes this phase.** ROADMAP criterion 4 puts it there deliberately. EXER-08 and EXER-09 read like logging requirements and are not — the deliverable is a data model that can *represent* an assisted pull-up and a farmer's carry, and a catalog that says which is which. Resist building any of Phase 5.
- **The gym remains the reference environment.** Phase 1 D-02 (cold start never blocks on the network) and Phase 2's whole premise were chosen against it. A catalog that needs a round-trip to show a exercise detail screen fails the intent regardless of what a test says. The first discretion item is where this is won or lost.
- **This phase is where the app stops being infrastructure.** Phases 1 and 2 shipped a scaffold and a proven sync engine with no feature surface. Phase 3 is the first thing a user can actually *use*, and the first place `PITFALLS.md` §5 (RN/RN-Web divergence in real interactions) can bite for real.
- **Normalization is the work, not the seeding.** Loading 900 JSON rows into Postgres is an afternoon. Mapping a foreign dataset's muscle vocabulary onto the fixed 15-group taxonomy, assigning honest `weight_factor` values, inferring movement patterns, classifying load types, and finding the duplicates is the phase. Plan the effort where it actually is.
- **Four of the discretion items are schema gaps, not preferences.** `never_suggest` has no column; per-user archive has no owner; `load_type` has no vocabulary; bodyweight contribution has no home; and the local database has no muscle tables. These are not "decide the approach" items — something must be added to the schema for each, and each addition crosses both `apps/api/src/db/schema/catalog.ts` and `apps/mobile/lib/db/schema.ts`, and possibly `ops/powersync/sync-rules.yaml`.

</specifics>

<deferred>
## Deferred Ideas

- **Duplicate merging with historical reference migration** — `PITFALLS.md` §11 calls this "a near-certain need given ~900 seeded exercises from an open dataset" and prescribes migrating historical set references to the canonical exercise rather than deleting the duplicate. Detecting duplicates at seed time is in scope for this phase; a *user-facing merge tool* that rewrites `session_exercise` and `personal_record` references is not — it needs logged history to operate on, which does not exist until Phase 5.
- **Recompute-on-edit invalidation for PRs and volume aggregates** — the other half of `PITFALLS.md` §11. Belongs with analytics and PR detection (Phases 9–10).
- **Exercise exclusion feeding auto-generated programs** — EXER-07's never-suggest list is what Phase 6's generator reads to avoid injured/disliked/unavailable movements. This phase stores the flag; Phase 6 consumes it.
- **Machine availability per gym profile gating exercise suggestions** — `FEATURES.md` describes equipment settings directly gating what gets suggested, including pin-loaded stack ranges and built-in starting resistance. Phase 7 owns gym profiles.
- **Stability and range-of-motion rankings, joint actions** — present on MacroFactor's exercise detail screen per `FEATURES.md`, absent from EXER-03's requirement text and from the schema. Not in scope; noted so it is a visible omission rather than a forgotten one.
- **Program/workout sharing and import** — `FEATURES.md` flags the generic import/share mechanism as worth replicating. Unrelated to the catalog.
- **Offline/sync status indicator in the UI** — carried forward unresolved from Phases 1 and 2. Phase 5 at the earliest.
- **Native deep links** — carried forward unresolved from Phase 1 D-07.

</deferred>

---

*Phase: 3-Exercise Catalog*
*Context gathered: 2026-08-18*
