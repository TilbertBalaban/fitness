# Phase 12: Body Metrics & Dashboard - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning
**Mode:** Auto-generated during an unattended run — the user directed that no questions be asked. Every gray area was resolved at Claude's discretion and is marked `[CLAUDE'S CALL]` with rationale and reversibility.

<domain>
## Phase Boundary

The user can track their body alongside their training, and shape the home screen around what they care about.

**In scope:** BODY-01 (log bodyweight over time), BODY-02 (log named measurements over time), BODY-03 (view bodyweight and measurement trends), BODY-04 (capture and store progress photos), BODY-05 (before-and-after composite), DASH-01 (dashboard with weekly progress, recent records, insight tiles), DASH-02 (add/remove/reorder widgets), DASH-03 (one quick-action menu reaching quick weigh-in, measurement, progress photo, history, new program, one-off workout).

This phase finally builds the write path for the two tables the schema has carried since Phase 2 and never used: `body_metric` and `progress_photo`. They are the last two entries in `PUSH_DEFERRED_TABLES`, and this phase is the one that owed them.

**Out of scope:** the muscle-group body-map heatmap (already shipped in Phase 10 — this phase *reuses* it as a widget, it does not rebuild it), any new server analytics or rollup, changes to the progression engine, the program builder, or the generator. No new tab: the dashboard **is** the existing Home tab.
</domain>

<decisions>
## Implementation Decisions

### The two tables that were waiting

- **D-01:** **`body_metric` and `progress_photo` move from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES`** in `packages/api-contracts/src/sync.ts`, and gain apply paths in `apps/api/src/sync/sync.service.ts`'s `TABLE_MAP`. Both are **singleton aggregate roots** — neither owns synced children and neither is ever referenced as a parent by another table's op — so they take exactly the shape `personal_record`, `equipment_profile` and `excluded_exercise` already established. No new resolution class is introduced. — **Reversibility:** reversible.
- **D-02:** **The existing columns are used as-is; the schema is not reshaped.** `body_metric` already carries `(id, user_id, kind, value, recorded_at, timezone, local_date, server_seq)` on both ends, and `progress_photo` already carries `(id, user_id, taken_at, timezone, local_date, storage_key, note, server_seq)`. Both already sync **down** through the `user_data` stream. Any column change means a Postgres migration plus a client schema-version bump plus a sync-rule touch, for tables whose shape was designed for exactly this feature. — **Reversibility:** one-way — a column change after these rows exist on devices needs a migration on both ends.
- **D-03:** **`value` stays a string on the client and `numeric(10,3)` on the server**, mirroring `muscle_volume_rollup`/`personal_record`. Drizzle surfaces Postgres numeric as a string, and this project has never let a synced numeric become a binary float on the wire. Parsing happens at the display/computation boundary, once. — **Reversibility:** reversible.
- **D-04:** **`recorded_at` + `timezone` + `local_date` are captured with the existing `captureCalendarDay` helper** (`apps/mobile/lib/calendar-day.ts`), the same one every session write uses. A weigh-in at 11:45pm belongs to that day for the same reason a workout does. This is not re-derived here. — **Reversibility:** reversible.

### Metric vocabulary (BODY-01, BODY-02)

- **D-05 [CLAUDE'S CALL]:** **Bodyweight is not a special case — it is one `kind` among the measurement kinds**, stored in the same `body_metric` table. BODY-01 and BODY-02 differ only in which kind is being written, so one table, one write path, one trend query serves both. A separate bodyweight table would duplicate the trend, sync and unit machinery for a single row shape. — **Reversibility:** costly — splitting later means migrating rows and forking the trend query.
- **D-06 [CLAUDE'S CALL]:** **`kind` draws from a closed, documented vocabulary in a shared constants module**, authored as `docs/body-metric-vocabularies.md` alongside the existing `docs/*-vocabularies.md` files, and exported from `@fitness/api-contracts` the way `CYCLE_KINDS` and the set-type vocabulary already are. v1 kinds: `bodyweight`, `neck`, `shoulders`, `chest`, `left_bicep`, `right_bicep`, `left_forearm`, `right_forearm`, `waist`, `hips`, `left_thigh`, `right_thigh`, `left_calf`, `right_calf`, `body_fat_percent`. A free-text kind column with no vocabulary would make the unit question (D-08) unanswerable per row. — **Reversibility:** costly — the vocabulary is additive-only once rows exist; removing a kind orphans data.
- **D-07 [CLAUDE'S CALL]:** **"Named measurements" means the user chooses which kinds to track, not that they invent new names.** The measurement screen shows only the kinds the user has enabled, and enabling one is a client-side display choice derived from whether any row of that kind exists plus a per-user tracked-kinds set. No custom-kind creation in v1 — a user-authored kind string would need its own unit declaration, its own sync row, and its own place in the vocabulary, which is a second feature. Captured as a deferred idea. — **Reversibility:** reversible.
- **D-08 [CLAUDE'S CALL]:** **Every kind has exactly one canonical storage unit, fixed by the vocabulary: mass kinds store kilograms, circumference kinds store centimetres, percentage kinds store percent.** Display conversion happens at the single existing boundary — Phase 2's weight-unit conversion rule (`user_preference.weight_unit`) governs mass kinds, and length kinds get the parallel treatment (cm ⇄ in) derived from the same preference rather than a second independent toggle. Two independent unit switches would let a user see kg with inches, which is not a state any real app offers. — **Reversibility:** one-way — stored values are canonical; changing the canonical unit later is a data migration.
- **D-09 [CLAUDE'S CALL]:** **Multiple entries per kind per day are allowed and all are kept.** The trend series takes the **latest entry per `local_date`** per kind. Rejecting a second weigh-in on the same day would force a destructive edit path for a correction; keeping both and showing the latest is strictly less surprising and needs no delete. — **Reversibility:** reversible.
- **D-10 [CLAUDE'S CALL]:** **Editing and deleting a metric entry are in scope; there is no separate "correction" concept.** A logged metric is an ordinary row with an ordinary tombstoned delete, exactly like a logged set.

### Trends (BODY-03)

- **D-11 [CLAUDE'S CALL]:** **Trends reuse `TrendChart` and `@fitness/analytics-engine`'s trend-series/chart-geometry, unchanged.** Phase 9 already settled the chart approach, the no-text-inside-`<Svg>` rule (R16), and the one-sentence `role="img"` announcement (R20). A body-metric trend is the same shape as an exercise trend with a different series source; a second charting approach in the same app would be a defect, not a feature. — **Reversibility:** reversible.
- **D-12 [CLAUDE'S CALL]:** **Trends are computed entirely on-device from local SQLite.** No server rollup, no new endpoint. Body metrics are low-cardinality (a handful of rows per day at most, versus years of sets), so the Phase 10 rollup argument does not apply here. Local-first comes free. — **Reversibility:** reversible.
- **D-13:** **No fabricated zeros — carried forward from Phase 9 D-09 and Phase 10 D-10.** A day with no weigh-in is a gap in the series, not a zero. A single data point renders as a point, not a flat line.
- **D-14 [CLAUDE'S CALL]:** **Trend windows match the app's existing vocabulary — 1 month / 3 months / 1 year / all** — selected with the existing `SegmentedChipRow`, not a new control. The muscle map's 1w/1m/3m set is deliberately not copied: a one-week bodyweight chart is noise.

### Progress photos (BODY-04, BODY-05)

- **D-15 [CLAUDE'S CALL]:** **The photo binary lives on the device; only the metadata row syncs.** `progress_photo.storage_key` is a stable, app-relative filename under the app's own document directory (native, via `expo-file-system`) and an equivalent key into an app-owned browser store on web. There is **no object-storage service in this project's infrastructure** (`docker-compose.dev.yml` runs Postgres, Mailpit and PowerSync — nothing else), and adding one plus an upload/download path plus its auth surface is a phase-sized piece of work that none of this phase's success criteria require. A device that does not hold the bytes renders an explicit "not on this device" placeholder rather than a broken image. — **Reversibility:** costly — adding real blob sync later reuses `storage_key` as the identifier but needs an upload path, a backfill and a placeholder-retirement pass.
- **D-16 [CLAUDE'S CALL]:** **Capture is a platform-split module following the established `.web.tsx` convention** (`docs/platform-modules.md`): the web target uses a file input, the native target uses the camera/library picker. This is exactly the escape hatch Phase 1 built the convention for. The native picker dependency is added in this phase; the web path takes no new dependency. — **Reversibility:** reversible.
- **D-17 [CLAUDE'S CALL]:** **Photos are downscaled and re-encoded on capture to a bounded long-edge JPEG before being written.** An unbounded original off a modern phone camera is tens of megabytes; the app has no upload path to absorb that and no reason to keep it. The bound is a documented constant, not a magic number at the call site. — **Reversibility:** reversible — but the bytes discarded at capture are gone, so the bound should be generous.
- **D-18 [CLAUDE'S CALL]:** **The before-and-after composite is rendered client-side and shared through `expo-sharing`** (already a dependency), never generated on the server. The user picks two photos, the composite is a side-by-side with each photo's `local_date` label. Server-side composition would require the server to hold the bytes, which D-15 says it does not. — **Reversibility:** reversible.
- **D-19 [CLAUDE'S CALL]:** **The composite is produced from photos that exist on *this* device.** Photos whose bytes are absent are not selectable as composite inputs. This is the honest consequence of D-15 and must be visible in the UI, not discovered as a failure.

### Dashboard (DASH-01, DASH-02)

- **D-20 [CLAUDE'S CALL]:** **The dashboard is the existing Home tab (`apps/mobile/app/(tabs)/index.tsx`), restructured — not a sixth tab.** The five-tab bar is fixed at build time by deliberate design (`(tabs)/_layout.tsx` writes all five triggers out longhand precisely so no edit can produce a partial bar), and Home already renders the Next Up card and `WeeklyProgressCard`. DASH-01 describes what Home should have been all along. — **Reversibility:** costly — the existing Home content becomes widgets, and unwinding that means re-inlining them.
- **D-21 [CLAUDE'S CALL]:** **Widget layout is stored in a new synced `dashboard_widget` table — one row per widget** `(id, user_id, widget_kind, position, enabled, server_seq)` — not as a JSON array on `user_preference`. This is the project's standing rule, set by Phase 11 D-10 (`excluded_exercise`) and by `active_routine_id` getting its own column: a multi-value list packed into one column loses concurrent offline edits under row-level LWW, and reordering is precisely the edit two devices are most likely to make independently. It is a third singleton root alongside D-01's two, applied the same way. — **Reversibility:** one-way — changing the storage shape after the sync rule ships is a migration plus a sync-rule change.
- **D-22 [CLAUDE'S CALL]:** **`widget_kind` is a closed vocabulary in the same shared constants module as D-06, and an unrecognised kind is skipped, never rendered as an error.** A months-old client must survive a newer device adding a widget it has never heard of — the same forward-compatibility posture the API version floor takes. — **Reversibility:** reversible.
- **D-23 [CLAUDE'S CALL]:** **v1 widget catalog, all built from surfaces that already exist:** `next_up` (the current Home card), `weekly_progress` (`WeeklyProgressCard`), `recent_records` (`RecordRow`, from `records-query.ts`), `muscle_heatmap` (Phase 10's `MuscleHeatmap`), `bodyweight_trend` (`TrendChart`, new this phase), `history_trend` (`HistoryTrendCard`). This phase writes **no new analytics** — it re-frames what Phases 9 and 10 already compute. "Insight tiles" (DASH-01) means these tiles, not a new inference engine. — **Reversibility:** reversible — the catalog is additive.
- **D-24 [CLAUDE'S CALL]:** **A user cannot end up with an empty dashboard by accident, but they may end up with one deliberately.** Removing every widget renders an explicit empty state with a path back to the widget picker — not a blank screen and not a forced minimum. — **Reversibility:** reversible.
- **D-25 [CLAUDE'S CALL]:** **Reordering reuses the existing drag primitive** (`DragHandle.tsx` / `DragHandle.web.tsx`, and the `ReorderExercisesSheet` interaction Phase 4 proved on both targets). Position is a sparse integer `position` column, resolved the same way `order_index` already is elsewhere. A second reorder idiom in the same app is a defect. — **Reversibility:** reversible.
- **D-26 [CLAUDE'S CALL]:** **A first-run user gets a default widget set materialized as real rows on first dashboard read**, not an implicit "no rows means the default" rule. An implicit default makes "I removed everything" and "I am new" indistinguishable, which is exactly the ambiguity D-24 needs to avoid. — **Reversibility:** costly — the materialization point is load-bearing for D-24.

### Quick actions (DASH-03)

- **D-27 [CLAUDE'S CALL]:** **One quick-action sheet, reachable from the Home screen header, listing all six actions in a fixed order.** It reuses the existing action-sheet idiom (`SessionActionSheet`, `HistoryActionSheet`, `RoutineActionSheet`, `GymProfileActionSheet`) rather than introducing a floating action button — a FAB would be a new interaction primitive on a screen that is otherwise a scroll of cards, and it collides with native tab-bar safe areas. — **Reversibility:** reversible.
- **D-28 [CLAUDE'S CALL]:** **Three of the six actions are pure navigation to routes that already exist** — history (`(tabs)/history`), new program (`programs/new` / `programs/generate`), one-off workout (the existing empty-session start path). Only quick weigh-in, quick measurement and progress photo are new destinations, and all three are this phase's own screens. The quick-action menu adds no capability; it adds one door to six rooms. — **Reversibility:** reversible.
- **D-29 [CLAUDE'S CALL]:** **"Quick" weigh-in means the sheet writes the row without a full screen navigation** — a single numeric entry using the existing `NumericKeypad`, defaulting to the last recorded value for that kind, committed in one confirm. Sending the user through a full form for a number they type every morning defeats the word "quick".

### Claude's Discretion
Every gray area in this phase was resolved at Claude's discretion under the user's no-questions directive. The items most worth a human's second look before execution, because they trade capability for scope, are **D-15** (photo bytes do not sync), **D-07** (no user-authored measurement kinds) and **D-21** (a third synced table rather than a JSON column).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/ROADMAP.md` §"Phase 12: Body Metrics & Dashboard" — goal, the four success criteria, requirement mapping
- `.planning/REQUIREMENTS.md` — BODY-01…BODY-05, DASH-01…DASH-03 and their mapping table
- `.planning/CONVENTIONS.md` — the standing browser/E2E authorization for this repo

### Sync contract (the two deferred tables)
- `packages/api-contracts/src/sync.ts` — `SYNCED_TABLES`, `PUSH_APPLIED_TABLES`, `PUSH_DEFERRED_TABLES`; the header comment above `PUSH_DEFERRED_TABLES` names Phase 12 as the owner of both remaining entries
- `apps/api/src/sync/sync.service.ts` — `TABLE_MAP` and the parent-resolution classes an apply path must join
- `ops/powersync/sync-rules.yaml` — the single `user_data` stream; `body_metric` and `progress_photo` already have pull queries. Its header documents the trap: **a row leaving a stream's result set is deleted locally**
- `apps/mobile/lib/db/schema.ts` §`bodyMetric`, §`progressPhoto`, §`userPreference` — the client mirror
- `apps/api/src/db/schema/records.ts` §`bodyMetric`, §`progressPhoto` — the Postgres side

### Reused surfaces
- `apps/mobile/app/(tabs)/index.tsx` — the Home screen the dashboard restructures
- `apps/mobile/app/(tabs)/_layout.tsx` — why the tab set is fixed at build time (D-20)
- `apps/mobile/components/TrendChart.tsx` — chart contract, `resolveChartWidth`, `trendChartSummary`, the R16 no-text-in-Svg rule
- `apps/mobile/components/WeeklyProgressCard.tsx`, `HistoryTrendCard.tsx`, `RecordRow.tsx`, `MuscleHeatmap.tsx` — the widget bodies
- `apps/mobile/components/DragHandle.tsx` / `DragHandle.web.tsx`, `ReorderExercisesSheet.tsx` — the reorder idiom (D-25)
- `apps/mobile/components/NumericKeypad.tsx`, `SegmentedChipRow.tsx`, `SessionActionSheet.tsx` — quick-entry, window switch, sheet idioms
- `apps/mobile/lib/calendar-day.ts` — `captureCalendarDay`, the day-attribution rule (D-04)
- `apps/mobile/lib/db/records-query.ts`, `history-trend-query.ts`, `weekly-progress-query.ts` — the queries the widgets read
- `packages/analytics-engine/src/trend-series.ts`, `chart-geometry.ts` — the trend/geometry primitives

### Conventions and vocabularies
- `docs/platform-modules.md` — the `.web.tsx` platform-split convention (D-16)
- `docs/program-vocabularies.md`, `docs/session-vocabularies.md`, `docs/excluded-exercise-shape.md` — the shape a new `docs/body-metric-vocabularies.md` must follow (D-06)
- `.planning/phases/11-program-generation/11-CONTEXT.md` §D-10 — the row-per-item-over-packed-column rule this phase's D-21 applies
- `.planning/phases/10-server-analytics-reconciliation/10-CONTEXT.md` §D-05, §D-10 — the svg/accessibility contract and the no-fabricated-zeros rule
- `.planning/phases/09-records-client-analytics/09-CONTEXT.md` — the client-analytics posture D-12 carries forward

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`body_metric` and `progress_photo` already exist end-to-end** — client SQLite schema, Postgres schema, `SYNCED_TABLES`, and a pull query in the `user_data` stream. What is missing is exactly the push apply path, and `sync.ts` names Phase 12 as the owner in a comment.
- **`TrendChart` + `analytics-engine`** cover BODY-03 with no new dependency and no new accessibility work.
- **`MuscleHeatmap`, `WeeklyProgressCard`, `HistoryTrendCard`, `RecordRow`** are the widget catalog (D-23) — every DASH-01 tile already has a rendering component.
- **`expo-file-system` and `expo-sharing` are already dependencies**; `expo-asset` too. The photo path needs a picker/manipulator dependency on native only.
- **The action-sheet family** (`SessionActionSheet`, `HistoryActionSheet`, `RoutineActionSheet`, `GymProfileActionSheet`) is the DASH-03 idiom, already proven on both targets.

### Established Patterns
- **Singleton aggregate roots in the push path** — `exercise`, `user_exercise_preference`, `user_preference`, `personal_record`, `equipment_profile`, `excluded_exercise`. Both of this phase's tables, plus `dashboard_widget`, are the same class.
- **Row-per-item over packed columns** for anything multi-valued that two devices might edit offline (Phase 11 D-10). D-21 applies it to widget layout.
- **Synced numerics are strings on the wire and in client SQLite** — never binary floats.
- **One conversion boundary for units** (Phase 2) — D-08 extends it to length rather than adding a second toggle.
- **`.web.tsx` platform split** for anything the two targets genuinely cannot share (Phase 1) — the photo picker is a textbook case.
- **No fabricated zeros** in any series (Phases 9 and 10).

### Integration Points
- `packages/api-contracts/src/sync.ts` — move two entries, add one table; `PUSH_DEFERRED_TABLES` becomes empty for the first time in the project's life.
- `apps/api/src/sync/sync.service.ts` `TABLE_MAP` — three new apply paths.
- `ops/powersync/sync-rules.yaml` — one new query for `dashboard_widget`. **The PowerSync Service must be restarted for a sync-rules change to take effect** — every prior phase that touched this file recorded that, and the native cross-device checks land in ROADMAP Phase 999.1.
- `apps/mobile/lib/db/schema.ts` — one new table plus a client schema-version bump, which the Phase 2 durability suite already proves must preserve unsynced writes.
- `apps/mobile/app/(tabs)/index.tsx` — restructured from a fixed layout into a widget list.
- `apps/mobile/e2e/__durability.web.tsx` — the standing shared-seam file. Every e2e-bearing plan in this phase appends to it; nothing rewrites it.

</code_context>

<specifics>
## Specific Ideas

- `PUSH_DEFERRED_TABLES` going empty is a real milestone for this project and should be asserted, not just observed — a test that the tuple is empty makes the "every table has an apply path" claim falsifiable.
- The photo placeholder from D-15 is a user-visible admission that bytes are device-local. It should read as a deliberate product statement ("This photo is on your other device"), not as an error.
- The default widget set (D-26) should reproduce today's Home screen exactly, so an existing user's first launch after this phase looks unchanged until they choose otherwise.
- Quick weigh-in defaulting to the last recorded value (D-29) is the difference between a two-tap morning ritual and a chore.

</specifics>

<deferred>
## Deferred Ideas

- **Progress-photo binaries syncing across devices** — needs an object store, an upload/download path and its auth surface (D-15). Its own phase.
- **User-authored measurement kinds** — a custom kind needs a unit declaration and its own synced row (D-07).
- **Photo-over-photo alignment, pose guides, or overlay opacity in the composite** — BODY-05 asks for a before-and-after, not an editor.
- **Body-fat estimation, girth-derived composition math, or goal projections** — no requirement asks for a model.
- **Widget resizing or a multi-column dashboard grid** — DASH-02 asks for add, remove and reorder only.
- **Native rendering of every new surface and subjective visual review** — ROADMAP Phases 999.1 and 999.2, per standing project policy.

</deferred>

---

*Phase: 12-Body Metrics & Dashboard*
*Context gathered: 2026-08-30*
