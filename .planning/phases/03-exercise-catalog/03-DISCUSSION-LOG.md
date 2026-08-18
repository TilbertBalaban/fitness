# Phase 3: Exercise Catalog - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 3-Exercise Catalog
**Areas discussed:** None — user delegated all areas to Claude

---

## Gray Area Selection

The four gray areas below were surfaced from ROADMAP success criteria, EXER-01…EXER-10, the research
documents, and a scout of the shipped Phase 1/Phase 2 code. The user was asked which to discuss.

| Option | Description | Selected |
|--------|-------------|----------|
| Load-type taxonomy + bodyweight | EXER-08/09 + criterion 4. `load_type` is bare text today. Fixed enum of six, or a two-axis model (what resists you × what you measure)? And where the bodyweight fraction for pull-ups and dips lives. One-way door — lands in the Postgres schema before any logging UI exists. | |
| Per-user state on global rows | EXER-06/07. Archiving and never-suggest are per-user actions on rows shared by every user, and `archived_at` is currently on the global row. Syncing `user_exercise_preference` table, copy-on-write fork, or restrict archive to custom exercises? Also a real schema gap: no never-suggest column exists. | |
| Catalog delivery + offline | How ~900 exercises, their muscle mappings, and their images reach the device and survive with no signal. Bundled versioned asset, first-install REST download (the D-01 carve-out), or a global PowerSync stream? Plus: images vendored, remote+cached, or dropped for v1? | |
| Seed dataset + smart swap | free-exercise-db (MIT-ish, per-exercise licenses vary) vs wger (CC-BY-SA — ShareAlike follows the derived dataset forever). How raw data normalizes onto the project's muscle taxonomy, movement patterns and load types — and what drives EXER-10 alternatives. | |

**User's choice:** "nothing, decide by yourself" — free text, no area selected.
**Notes:** Same call the user made for Phase 2 ("nothing, you decide"). No area was discussed, so no
per-area question rounds ran. Every gray area above was carried into CONTEXT.md's `Claude's Discretion`
section rather than dropped, with the grounding evidence attached so research and planning resolve each
explicitly instead of silently.

---

## Claude's Discretion

All of the following were delegated. The first four are schema gaps, not preferences — something must be
added to `apps/api/src/db/schema/catalog.ts` and `apps/mobile/lib/db/schema.ts` for each.

- **Catalog delivery to the device** — the local SQLite schema has no `muscle_group` or
  `exercise_muscle_mapping` tables at all, and `ops/powersync/sync-rules.yaml` deliberately excludes the
  seeded taxonomy. Bundled asset vs first-install REST download vs global PowerSync stream.
- **Per-user state on globally-shared rows** — `exercise.archived_at` sits on a row with a null `user_id`;
  no `never_suggest` column exists anywhere. EXER-06 and EXER-07 have no home in the current schema.
- **The `load_type` vocabulary** — `text().notNull()` with no enum and no check constraint; not defined in
  `ARCHITECTURE.md` §1 either. ROADMAP criterion 4 requires it settled and applied to every row.
- **Bodyweight contribution (EXER-09)** — no column exists; the "as bodyweight changes" clause implies a
  relationship to `body_metric` that must not be foreclosed here.
- **Seed dataset choice and its licensing obligation** — free-exercise-db vs wger, and the normalization
  work (muscle-taxonomy mapping, movement-pattern inference, `weight_factor` assignment, duplicate
  detection) that is the real bulk of the phase.
- **Images (EXER-03)** — vendored into the bundle, self-hosted with on-device caching, hot-linked, or
  omitted from v1 as a stated choice.
- **Smart swap (EXER-10)** — deterministic scoring over muscle mapping / equipment / movement pattern, a
  curated swap table, or `variation_of_id` siblings. Must run client-side and respect never-suggest.
- **Search and filter mechanics** — SQLite FTS5 vs `LIKE` vs in-memory fuzzy; alias matching; filter
  combination semantics; and ~900 rows on RN and RN-Web with no virtualized-list library installed.
- **Custom exercise scope (EXER-04/05)** — whether "duplicate" can fork a seeded exercise into a
  user-owned copy, and what `source` / `variation_of_id` / muscle mappings become on that copy.

## Deferred Ideas

Surfaced during codebase scout and research review, recorded in CONTEXT.md `<deferred>`:

- User-facing duplicate merging with historical reference migration — needs logged history (Phase 5+)
- Recompute-on-edit invalidation for PRs and volume aggregates — Phases 9–10
- Exercise exclusion feeding auto-generated programs — Phase 6 consumes the flag this phase stores
- Machine availability per gym profile gating suggestions — Phase 7
- Stability / range-of-motion rankings and joint actions — on MacroFactor's detail screen, absent from
  EXER-03 and from the schema; noted as a visible omission
- Program/workout sharing and import — unrelated to the catalog
- Offline/sync status indicator — carried forward unresolved from Phases 1 and 2
- Native deep links — carried forward unresolved from Phase 1 D-07
