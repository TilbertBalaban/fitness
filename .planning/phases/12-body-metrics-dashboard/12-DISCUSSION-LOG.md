# Phase 12: Body Metrics & Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 12-Body Metrics & Dashboard
**Areas discussed:** Metric storage grain, Measurement vocabulary and units, Trend rendering, Progress photo storage, Before-and-after composite, Dashboard surface, Widget layout persistence, Widget catalog, Quick-action menu, Push apply path
**Mode:** `--auto` — the user directed that no questions be asked. Every question below was auto-resolved to the recommended option without an interactive prompt.

---

## Metric storage grain

| Option | Description | Selected |
|--------|-------------|----------|
| One table, bodyweight as a kind | BODY-01 and BODY-02 share `body_metric`; kind distinguishes them | ✓ |
| Separate bodyweight table | Dedicated table for weigh-ins, `body_metric` for the rest | |
| Reshape the existing columns | Redesign the table now that the feature is being built | |

**Auto-selection:** One table, bodyweight as a kind (recommended default) → D-05, D-02.
**Notes:** `body_metric` has carried the exact needed column set since Phase 2 and already syncs down. Reshaping means a migration on both ends for no gain.

---

## Measurement vocabulary and units

| Option | Description | Selected |
|--------|-------------|----------|
| Closed documented vocabulary, one canonical unit per kind | 15 v1 kinds in a shared constants module + `docs/body-metric-vocabularies.md`; kg/cm/percent canonical | ✓ |
| Free-text kind, unit stored per row | User names anything; each row declares its unit | |
| Closed vocabulary, independent length-unit toggle | Separate cm/in switch from the weight-unit preference | |

**Auto-selection:** Closed vocabulary with one canonical unit per kind (recommended default) → D-06, D-07, D-08.
**Notes:** A free-text kind makes the unit question unanswerable per row. Two independent unit toggles allow a kg-with-inches state no real app offers.

---

## Same-day duplicates

| Option | Description | Selected |
|--------|-------------|----------|
| Keep all, trend takes latest per day | A second weigh-in is a correction without a delete | ✓ |
| One entry per kind per day, second overwrites | Upsert on `(kind, local_date)` | |
| Reject the second entry | Force an edit of the existing row | |

**Auto-selection:** Keep all, latest-per-day wins (recommended default) → D-09, D-10.

---

## Trend rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `TrendChart` + analytics-engine, computed on-device | Same chart contract and accessibility rules as Phase 9 | ✓ |
| New chart component tuned for body metrics | Purpose-built renderer | |
| Server-computed trend endpoint | Mirror Phase 10's rollup approach | |

**Auto-selection:** Reuse `TrendChart`, on-device (recommended default) → D-11, D-12, D-13, D-14.
**Notes:** Body metrics are low-cardinality, so Phase 10's rollup argument does not apply. Windows are 1m/3m/1y/all — the muscle map's 1w option is noise for bodyweight.

---

## Progress photo storage

| Option | Description | Selected |
|--------|-------------|----------|
| Bytes stay on-device, metadata row syncs | `storage_key` is an app-relative filename; absent bytes render a placeholder | ✓ |
| Add an object store and sync the binaries | New infra service, upload/download path, auth surface | |
| Store bytes in Postgres as bytea/large objects | No new service, but bloats the sync path | |

**Auto-selection:** Bytes stay on-device (recommended default) → D-15, D-16, D-17, D-19.
**Notes:** `docker-compose.dev.yml` runs Postgres, Mailpit and PowerSync only — there is no blob store, and none of this phase's success criteria require cross-device photo binaries. Flagged in CONTEXT.md as one of the three decisions most worth a human's second look.

---

## Before-and-after composite

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side composite, shared via `expo-sharing` | Side-by-side with each photo's local date | ✓ |
| Server-rendered composite | Requires the server to hold the bytes | |
| Overlay/alignment editor | Opacity blending, pose guides | |

**Auto-selection:** Client-side composite (recommended default) → D-18. Overlay editor deferred.

---

## Dashboard surface

| Option | Description | Selected |
|--------|-------------|----------|
| Restructure the existing Home tab | Home already renders Next Up + WeeklyProgressCard | ✓ |
| Add a sixth tab | New Dashboard destination | |
| Dashboard as a Home sub-route | Home links out to it | |

**Auto-selection:** Restructure Home (recommended default) → D-20.
**Notes:** The five-tab bar is written out longhand in `(tabs)/_layout.tsx` specifically so no edit can produce a partial bar.

---

## Widget layout persistence

| Option | Description | Selected |
|--------|-------------|----------|
| New synced `dashboard_widget` table, row per widget | Row-level LWW resolves each widget independently | ✓ |
| JSON array column on `user_preference` | One row, simplest to write | |
| Device-local only, not synced | No sync work at all | |

**Auto-selection:** Row-per-widget synced table (recommended default) → D-21, D-22, D-25, D-26.
**Notes:** Phase 11 D-10 set the standing rule — a multi-value list packed into one column loses concurrent offline edits, and reordering is exactly the edit two devices make independently. Flagged in CONTEXT.md for a human's second look because it adds a third table to this phase.

---

## Widget catalog

| Option | Description | Selected |
|--------|-------------|----------|
| Six widgets built from existing surfaces | next_up, weekly_progress, recent_records, muscle_heatmap, bodyweight_trend, history_trend | ✓ |
| Add new derived insights | Streak inference, plateau detection, readiness scoring | |
| Minimal three-widget set | Only what DASH-01 names literally | |

**Auto-selection:** Six widgets from existing surfaces (recommended default) → D-23, D-24.
**Notes:** "Insight tiles" is read as re-framing what Phases 9 and 10 already compute, not as a new inference engine.

---

## Quick-action menu

| Option | Description | Selected |
|--------|-------------|----------|
| Action sheet from the Home header | Reuses the existing sheet family | ✓ |
| Floating action button | New interaction primitive; collides with native tab-bar safe areas | |
| Expandable inline card on Home | Always-visible row of six buttons | |

**Auto-selection:** Action sheet from the Home header (recommended default) → D-27, D-28, D-29.
**Notes:** Three of the six actions are pure navigation to routes that already exist. Quick weigh-in commits from the sheet using `NumericKeypad`, defaulting to the last recorded value.

---

## Push apply path

| Option | Description | Selected |
|--------|-------------|----------|
| Both tables as singleton aggregate roots | Same shape as personal_record / equipment_profile / excluded_exercise | ✓ |
| New resolution class for body data | Custom parent-chain handling | |
| Defer the push path again | Pull-only for another phase | |

**Auto-selection:** Singleton aggregate roots (recommended default) → D-01, D-03, D-04.
**Notes:** `PUSH_DEFERRED_TABLES` becomes empty for the first time in the project's history — CONTEXT.md asks for that to be asserted by a test rather than merely observed.

---

## Claude's Discretion

Every gray area, under the user's standing no-questions directive. The three worth a human's second look before execution, because they trade capability for scope: **D-15** (photo bytes do not sync across devices), **D-07** (no user-authored measurement kinds), **D-21** (a third synced table rather than a JSON column).

## Deferred Ideas

- Progress-photo binaries syncing across devices (needs an object store and an auth surface)
- User-authored measurement kinds
- Photo alignment / pose guides / overlay opacity in the composite
- Body-fat estimation, girth-derived composition math, goal projections
- Widget resizing and multi-column dashboard grids
- Native rendering and subjective visual review — ROADMAP Phases 999.1 / 999.2
