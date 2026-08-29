# Phase 10: Server Analytics & Reconciliation - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning
**Mode:** Auto-generated during an unattended `/gsd-start` run — the user directed that no questions be asked. Every grey area was resolved at Claude's discretion and is marked `[CLAUDE'S CALL]` with rationale and reversibility.

<domain>
## Phase Boundary

Long-horizon history stays fast and correct across devices, and editing the past fixes everything derived from it.

In scope: ANLY-04 (set volume per muscle group on a front/back body-map heatmap over 1 week / 1 month / 3 months), ANLY-05 (drill into a muscle group to see which exercises contributed its sets), ANLY-09 (PRs and volume recomputed correctly when a past workout is edited).

This is the first phase in the project whose centre of gravity is the **server**. Phase 9 deliberately computed everything on-device; this phase adds materialized rollups, a reconciliation path, and query-count budgets — and it must do so without breaking the local-first guarantee that Phase 9 relied on.
</domain>

<decisions>
## Implementation Decisions

### The central tension, and how it resolves

- **D-01 [CLAUDE'S CALL]:** **Short windows read local SQLite; long windows read a synced server rollup, with locally-logged-but-not-yet-rolled-up work overlaid on top.** Success criterion 2 requires long-horizon charts to be served by materialized rollups rather than recomputed per render. Taken naively that breaks the project's non-negotiable local-first constraint: a session logged offline would be invisible on the heatmap until the server saw it, so the user's own just-finished workout would not appear in their own analytics. The resolution has one rule: the **1-week window is computed entirely on-device** (seven days of sets is cheap and always current), while the **1-month and 3-month windows read the rollup and then add any session whose date falls after the rollup's own computed-through watermark**. Long-horizon stays fast, and nothing the user logged is ever missing. — **Reversibility:** costly; the overlay is the piece that would have to be removed, and removing it reintroduces the invisibility.

- **D-02 [CLAUDE'S CALL]:** **The rollup's grain is `(user_id, muscle_group_id, local_date)` — one daily row per muscle group, not one row per window.** Three window-specific tables would trade a cheap client-side sum for three times the write amplification and three chances to disagree with each other. A daily grain answers 1 week, 1 month and 3 months from one table, and it answers any future window without a migration. — **Reversibility:** one-way in practice once rows exist and sync down.

- **D-03 [CLAUDE'S CALL]:** **Recompute is server-authoritative and scoped to what actually changed.** When an edited session is pushed, the server recomputes PRs for the affected `(user, exercise)` pairs and rollup rows for the affected `(user, muscle_group, date)` cells — not the user's whole history. Phase 5 already made `detectPrsForSession` idempotent for exactly this reason (LOG-19), so the PR half reuses that rule rather than inventing a second one. `personal_record` already carries `reconciled_at` and `server_seq`; those columns are the mechanism, and this phase is where they finally get used. — **Reversibility:** reversible.

- **D-04 [CLAUDE'S CALL]:** **Muscle volume is weighted by `exercise_muscle_mapping.weight_factor`, and includes secondary muscles.** The column exists and is `notNull`, so the data model already anticipated this; a heatmap that counted only primary muscles would show a bench press contributing nothing to triceps, which any lifter would read as a bug. **This is deliberately a different quantity from Phase 9's "muscles trained" count, which is primary-only** — that one answers "did I train this muscle at all", this one answers "how much work did it receive". Both are correct; they must be named differently in the UI so they cannot be mistaken for the same number. — **Reversibility:** reversible.

- **D-05 [CLAUDE'S CALL]:** **The body map is drawn with `react-native-svg`, the dependency Phase 9 already landed.** One implementation for both targets, no new charting dependency, and it renders in the Playwright durability harness so the heatmap gets real browser evidence. Phase 9 also established the accessibility contract this must follow: no text inside the `<Svg>`, and one `role="img"` announcement per figure — a silent colour-coded body diagram is unusable without it. — **Reversibility:** reversible.

- **D-06 [CLAUDE'S CALL]:** **The drill-down (ANLY-05) reads local SQLite, not a second rollup.** It is always scoped to one muscle group and one already-selected window, so it is a bounded query, and computing it locally means it can never disagree with the set counts Phase 9 already shows elsewhere in the app. Only the aggregate heatmap needs materialization. — **Reversibility:** reversible.

- **D-07:** **Volume uses `countsTowardWorkingVolume`; anything PR-flavoured uses `countsTowardRecords`.** Carried forward unchanged from Phases 7–9. These two predicates live in `@fitness/api-contracts` and are never re-derived. This phase adds a *third* consumer (the server), which is precisely why they are in a shared package.

- **D-08 [CLAUDE'S CALL]:** **Query-count budgets are asserted, not aspirational.** Criterion 5 demands the endpoints hold their query count as data grows. That means a test that seeds a realistically-sized dataset, counts the SQL statements a request actually issues, and fails on regression — not a comment claiming the read is batched. Without an executable assertion, criterion 5 is unfalsifiable and would silently rot. — **Reversibility:** reversible.

- **D-09:** **The rollup table syncs down through the existing `user_data` stream**, as one more `WHERE user_id = auth.user_id()` query alongside the fifteen already there. No new stream, no new auth surface.

- **D-10:** **No fabricated zeros, carried forward from Phase 9 (D-09 there).** A muscle with no logged work renders as untrained — visually distinct from a muscle at the bottom of a real intensity scale. A body map where "no data" and "trained lightly" look alike is worse than no body map.
</decisions>

<code_context>
## Existing Code Insights

- `apps/api/src/` has **no analytics or reconciliation module today** — the modules are `auth`, `catalog`, `common`, `db`, `health`, `mailer`, `progression`, `seed`, `sync`. This phase adds the first one. `sync/` is the closest structural analog (controller + service + module + `__tests__`).
- `apps/api/src/db/schema/records.ts` — `personal_record` already carries `reconciled_at` and `server_seq` (defaulting from the `sync_seq` sequence). The reconciliation columns exist and are unused; this phase is what they were added for.
- `apps/api/src/db/schema/catalog.ts` — `exercise_muscle_mapping` carries `role` and a `notNull` `weight_factor numeric(4,2)`, and `muscle_group` carries `body_region`. The heatmap's data model is already in place.
- `ops/powersync/sync-rules.yaml` — Edition 3 Sync Streams, one `user_data` stream with fifteen queries. Its header comment documents a trap this phase must respect: **a row that leaves a stream's result set is deleted from the local database**, which is why archived days are deliberately not filtered server-side.
- `packages/analytics-engine/` (new in Phase 9) — the natural home for any pure aggregation this phase shares between client and server, and it already has the client/server parity-fixture precedent from Phase 8.
- `apps/mobile/components/TrendChart.tsx` and `react-native-svg@15.15.4` — Phase 9's chart work, including the settled fact that `accessibilityRole="image"` maps to a Playwright-queryable `role="img"`.
- Phase 9's `WeeklyProgressCard` counts **primary** muscle groups. See D-04 — this phase's number is deliberately different and must be labelled so.
- `apps/api/src/sync/sync.service.ts` — the push path, including `resolveRoutineIdForCycleTarget`'s two-chain verification. The recompute trigger belongs on this path.
</code_context>

<specifics>
## Specific Ideas

- The rollup needs a watermark the client can compare against, or D-01's overlay cannot know where the rollup ends and local-only work begins. Design it explicitly rather than inferring it from timestamps.
- Recompute must be idempotent. It will run again on the next edit of the same session, and Phase 5 already proved the PR half can be.
- A realistically-sized seed for the query-count test is itself a deliverable — "realistic" means years of sessions, not a dozen rows.
</specifics>

<deferred>
## Deferred Ideas

- Per-exercise rollups (the drill-down stays a local query — D-06).
- Any window other than 1 week / 1 month / 3 months.
- Native rendering of the body map and subjective visual review — ROADMAP Phases 999.1 and 999.2, per standing project policy.
</deferred>
