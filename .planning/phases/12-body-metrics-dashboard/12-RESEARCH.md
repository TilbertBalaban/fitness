# Phase 12: Body Metrics & Dashboard - Research

**Researched:** 2026-08-30
**Domain:** Cross-platform (RN + RN-Web) photo capture/storage, client-side image compositing, PowerSync singleton-root sync registration, sparse-integer reorder, unit-conversion boundary extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The two tables that were waiting**
- D-01: `body_metric` and `progress_photo` move from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES` in `packages/api-contracts/src/sync.ts`, and gain apply paths in `apps/api/src/sync/sync.service.ts`'s `TABLE_MAP`. Both are singleton aggregate roots — neither owns synced children and neither is ever referenced as a parent by another table's op — so they take exactly the shape `personal_record`, `equipment_profile` and `excluded_exercise` already established. No new resolution class is introduced. Reversibility: reversible.
- D-02: The existing columns are used as-is; the schema is not reshaped. `body_metric` already carries `(id, user_id, kind, value, recorded_at, timezone, local_date, server_seq)` on both ends, and `progress_photo` already carries `(id, user_id, taken_at, timezone, local_date, storage_key, note, server_seq)`. Both already sync down through the `user_data` stream. Reversibility: one-way.
- D-03: `value` stays a string on the client and `numeric(10,3)` on the server, mirroring `muscle_volume_rollup`/`personal_record`. Parsing happens at the display/computation boundary, once. Reversibility: reversible.
- D-04: `recorded_at` + `timezone` + `local_date` are captured with the existing `captureCalendarDay` helper (`apps/mobile/lib/calendar-day.ts`), the same one every session write uses. Reversibility: reversible.

**Metric vocabulary (BODY-01, BODY-02)**
- D-05 [CLAUDE'S CALL]: Bodyweight is not a special case — it is one `kind` among the measurement kinds, stored in the same `body_metric` table. Reversibility: costly.
- D-06 [CLAUDE'S CALL]: `kind` draws from a closed, documented vocabulary in a shared constants module, authored as `docs/body-metric-vocabularies.md`, exported from `@fitness/api-contracts` the way `CYCLE_KINDS` already is. v1 kinds: `bodyweight`, `neck`, `shoulders`, `chest`, `left_bicep`, `right_bicep`, `left_forearm`, `right_forearm`, `waist`, `hips`, `left_thigh`, `right_thigh`, `left_calf`, `right_calf`, `body_fat_percent`. Reversibility: costly.
- D-07 [CLAUDE'S CALL]: "Named measurements" means the user chooses which kinds to track, not that they invent new names. No custom-kind creation in v1. Reversibility: reversible.
- D-08 [CLAUDE'S CALL]: Every kind has exactly one canonical storage unit: mass kinds store kilograms, circumference kinds store centimetres, percentage kinds store percent. Display conversion happens at the single existing boundary — Phase 2's weight-unit conversion rule (`user_preference.weight_unit`) governs mass kinds, and length kinds get the parallel treatment (cm ⇄ in) derived from the same preference rather than a second independent toggle. Reversibility: one-way.
- D-09 [CLAUDE'S CALL]: Multiple entries per kind per day are allowed and all are kept. The trend series takes the latest entry per `local_date` per kind. Reversibility: reversible.
- D-10 [CLAUDE'S CALL]: Editing and deleting a metric entry are in scope; there is no separate "correction" concept. A logged metric is an ordinary row with an ordinary tombstoned delete.

**Trends (BODY-03)**
- D-11 [CLAUDE'S CALL]: Trends reuse `TrendChart` and `@fitness/analytics-engine`'s trend-series/chart-geometry, unchanged. Reversibility: reversible.
- D-12 [CLAUDE'S CALL]: Trends are computed entirely on-device from local SQLite. No server rollup, no new endpoint. Reversibility: reversible.
- D-13: No fabricated zeros — carried forward from Phase 9 D-09 and Phase 10 D-10.
- D-14 [CLAUDE'S CALL]: Trend windows match the app's existing vocabulary — 1 month / 3 months / 1 year / all — selected with the existing `SegmentedChipRow`, not a new control.

**Progress photos (BODY-04, BODY-05)**
- D-15 [CLAUDE'S CALL]: The photo binary lives on the device; only the metadata row syncs. `progress_photo.storage_key` is a stable, app-relative filename under the app's own document directory (native, via `expo-file-system`) and an equivalent key into an app-owned browser store on web. No object-storage service exists in this project's infrastructure. A device that does not hold the bytes renders an explicit "not on this device" placeholder. Reversibility: costly.
- D-16 [CLAUDE'S CALL]: Capture is a platform-split module following the established `.web.tsx` convention (`docs/platform-modules.md`): web uses a file input, native uses the camera/library picker. The native picker dependency is added in this phase; the web path takes no new dependency. Reversibility: reversible.
- D-17 [CLAUDE'S CALL]: Photos are downscaled and re-encoded on capture to a bounded long-edge JPEG before being written. The bound is a documented constant, not a magic number at the call site. Reversibility: reversible but bytes discarded at capture are gone.
- D-18 [CLAUDE'S CALL]: The before-and-after composite is rendered client-side and shared through `expo-sharing` (already a dependency), never generated on the server. Side-by-side with each photo's `local_date` label. Reversibility: reversible.
- D-19 [CLAUDE'S CALL]: The composite is produced from photos that exist on *this* device. Photos whose bytes are absent are not selectable as composite inputs.

**Dashboard (DASH-01, DASH-02)**
- D-20 [CLAUDE'S CALL]: The dashboard is the existing Home tab (`apps/mobile/app/(tabs)/index.tsx`), restructured — not a sixth tab. Reversibility: costly.
- D-21 [CLAUDE'S CALL]: Widget layout is stored in a new synced `dashboard_widget` table — one row per widget `(id, user_id, widget_kind, position, enabled, server_seq)` — not JSON on `user_preference`. A third singleton root alongside D-01's two, applied the same way. Reversibility: one-way.
- D-22 [CLAUDE'S CALL]: `widget_kind` is a closed vocabulary in the same shared constants module as D-06; an unrecognised kind is skipped, never rendered as an error. Reversibility: reversible.
- D-23 [CLAUDE'S CALL]: v1 widget catalog, all built from surfaces that already exist: `next_up`, `weekly_progress`, `recent_records`, `muscle_heatmap`, `bodyweight_trend` (new this phase), `history_trend`. No new analytics. Reversibility: reversible.
- D-24 [CLAUDE'S CALL]: A user cannot end up with an empty dashboard by accident, but they may end up with one deliberately. Removing every widget renders an explicit empty state with a path back to the widget picker. Reversibility: reversible.
- D-25 [CLAUDE'S CALL]: Reordering reuses the existing drag primitive (`DragHandle.tsx`/`DragHandle.web.tsx`, `ReorderExercisesSheet` interaction). Position is a sparse integer `position` column, resolved the same way `order_index` already is elsewhere. Reversibility: reversible.
- D-26 [CLAUDE'S CALL]: A first-run user gets a default widget set materialized as real rows on first dashboard read, not an implicit "no rows means the default" rule. Reversibility: costly — the materialization point is load-bearing for D-24.

**Quick actions (DASH-03)**
- D-27 [CLAUDE'S CALL]: One quick-action sheet, reachable from the Home screen header, listing all six actions in a fixed order. Reuses the existing action-sheet idiom rather than a FAB. Reversibility: reversible.
- D-28 [CLAUDE'S CALL]: Three of the six actions are pure navigation to routes that already exist — history, new program, one-off workout. Only quick weigh-in, quick measurement and progress photo are new destinations. Reversibility: reversible.
- D-29 [CLAUDE'S CALL]: "Quick" weigh-in means the sheet writes the row without a full screen navigation — a single numeric entry using the existing `NumericKeypad`, defaulting to the last recorded value for that kind, committed in one confirm.

### Claude's Discretion
Every gray area in this phase was resolved at Claude's discretion under the user's no-questions directive. The items most worth a human's second look before execution, because they trade capability for scope, are D-15 (photo bytes do not sync), D-07 (no user-authored measurement kinds) and D-21 (a third synced table rather than a JSON column).

### Deferred Ideas (OUT OF SCOPE)
- Progress-photo binaries syncing across devices — needs an object store, an upload/download path and its auth surface (D-15). Its own phase.
- User-authored measurement kinds — a custom kind needs a unit declaration and its own synced row (D-07).
- Photo-over-photo alignment, pose guides, or overlay opacity in the composite — BODY-05 asks for a before-and-after, not an editor.
- Body-fat estimation, girth-derived composition math, or goal projections — no requirement asks for a model.
- Widget resizing or a multi-column dashboard grid — DASH-02 asks for add, remove and reorder only.
- Native rendering of every new surface and subjective visual review — ROADMAP Phases 999.1 and 999.2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BODY-01 | User can log their bodyweight over time | `body_metric` push apply path (Pattern 1); vocabulary module (Pattern 4); reuses `captureCalendarDay` |
| BODY-02 | User can log named body measurements over time | Same `body_metric` table, `kind` vocabulary, D-07 tracked-kinds-set read model |
| BODY-03 | User can view measurement and bodyweight trends | `TrendChart` + `@fitness/analytics-engine` reuse (Pattern 5); on-device query, latest-per-`local_date` dedup |
| BODY-04 | User can capture and store progress photos | `.web.tsx` capture split (Pattern 2); native document-directory write; web IndexedDB store; D-17 downscale/re-encode |
| BODY-05 | User can generate a before-and-after photo composite | `.web.tsx` composite split (Pattern 3): `react-native-view-shot` native, `<canvas>` web; `expo-sharing` native / Blob-download web |
| DASH-01 | User sees a dashboard with weekly progress, recent records, and insight tiles | Widget catalog reuse table (Architecture Patterns); D-23's six components |
| DASH-02 | User can add, remove, and reorder dashboard widgets | `dashboard_widget` new synced table (Pattern 4, worked from 11-02); reused `order-index.ts` reorder primitives (Pattern 6); D-26 materialize-on-first-read (flagged pitfall — differs from existing preferences.ts read-default pattern) |
| DASH-03 | User can reach quick weigh-in, measurement, progress photo, history, new program, one-off workout from a single quick-action menu | `SessionActionSheet`-family idiom reuse; `NumericKeypad` for quick weigh-in |
</phase_requirements>

## Summary

This phase has almost no net-new architectural surface. Six of its eight requirements are wiring:
`body_metric` and `progress_photo` already exist end-to-end in the schema and already pull through
`ops/powersync/sync-rules.yaml`'s `user_data` stream — the only gap is a push apply path, and
`apps/api/src/sync/sync.service.ts` already carries three worked examples of exactly this shape
(`personal_record`, `equipment_profile`, `excluded_exercise`). The most recent of those,
`excluded_exercise` (Phase 11, plan 11-02), is a complete, current, line-for-line template: seven
registration edits in `sync.service.ts`, one field map in `patch-update-set.ts`, one appended line in
`sync.ts`'s two tuples, one appended query in `sync-rules.yaml`, and a `docs/*-shape.md` reference.
`dashboard_widget` (D-21) is a *new* table but follows the identical singleton-root shape — the
`excluded_exercise` plan is the correct template for it too, not just for the two deferred tables.
There is no separate "PowerSync schema version" step to perform: this codebase's `DrizzleAppSchema`
(`@powersync/drizzle-driver`) derives the local SQLite schema directly from `drizzleSchema` — a new
table is added by declaring it in `apps/mobile/lib/db/schema.ts` and adding it to the `drizzleSchema`
object, nothing else. Reordering widgets needs no new arithmetic: `apps/mobile/lib/db/programs/order-index.ts`
(`appendOrderIndex`/`midpointOrderIndex`/`renumberOrderIndexes`/`sortByOrderThenId`, gap size 1024)
is already a pure, database-free module built for exactly this problem and should be imported
directly for `dashboard_widget.position`, not re-derived.

The one genuinely new problem this phase introduces is progress-photo storage on the browser target.
`expo-file-system`'s SDK 54+ `File`/`Directory`/`Paths` API — already in use in this codebase via
`apps/mobile/lib/export/export-training-data.ts` — has **no web equivalent** for arbitrary
app-private storage; Expo's own documentation states the web platform "doesn't really directly
expose file access at arbitrary URIs." The codebase already proves the correct response to this gap:
`export-training-data.web.ts` is a full platform-split sibling that abandons `expo-file-system`
entirely and uses a `Blob` + `URL.createObjectURL` + synthetic `<a download>` click instead. Progress
photos need the mirror-image of that pattern for *storage* rather than one-shot download: IndexedDB,
storing each photo as a `Blob` keyed by `storage_key`, is the correct web-side store — it needs no
new dependency (the codebase has none for this today, and none is needed), it natively supports
`Blob` values via the structured-clone algorithm, and its quota is a percentage of free disk rather
than the ~5MB ceiling `localStorage`/AsyncStorage's web backing store carries. `expo-sharing`
likewise has a real web gap worth flagging early: Expo's own docs state local files cannot be shared
by URI on web at all, which is exactly why `export-training-data.web.ts` bypasses `Sharing.shareAsync`
for a browser download — the BODY-05 composite's web half needs the same bypass, not a literal
`expo-sharing` call, even though D-18's prose names `expo-sharing` (that decision is correctly scoped
to the native half; the web half needs the file's own established platform-split treatment, matching
D-16's convention).

**Primary recommendation:** Treat this phase as three independent, low-risk wiring tracks — (1) copy
`excluded_exercise`'s sync-registration shape twice, once for the two already-existing tables and
once for the new `dashboard_widget` table; (2) build the photo capture/storage/composite surface as
three `.web.tsx`-split modules (capture, storage, composite) each following
`export-training-data.web.ts`'s established Blob/IndexedDB idiom on the web side and
`expo-file-system`'s `File`/`Paths` idiom on the native side; (3) extend `@fitness/api-contracts/src/units.ts`'s
existing exact-bigint-fraction conversion pattern with a parallel cm⇄in pair rather than inventing a
second unit system. No requirement in this phase needs new analytics, a new backend endpoint, or a
new sync-conflict class.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Body metric / measurement logging (BODY-01, BODY-02) | Browser/Client (RN local SQLite via PowerSync) | API/Backend (push apply path only) | Local-first write; server only validates and re-broadcasts through sync, never computes. |
| Bodyweight/measurement trends (BODY-03) | Browser/Client | — | D-12 locks this to on-device computation; no server rollup. |
| Progress photo capture (BODY-04) | Browser/Client (native camera/picker or web file input) | — | No object storage tier exists in this project (D-15); binary never leaves the device. |
| Progress photo storage (BODY-04) | Browser/Client (`expo-file-system` document dir on native, IndexedDB on web) | Database/Storage (Postgres holds only the metadata row) | The metadata row (`progress_photo`) is the only part with a server-side tier; the bytes are client-tier only, by design. |
| Before/after composite (BODY-05) | Browser/Client (client-side render + share/download) | — | D-18 explicitly forbids a server-side compositing tier — the server never holds photo bytes. |
| Dashboard widgets & layout (DASH-01, DASH-02) | Browser/Client (rendering existing widget components) | API/Backend (push apply path for `dashboard_widget` layout only) | Widget *content* is 100% reused from Phases 9/10 client-analytics components; only widget *ordering/visibility* is a new synced row. |
| Quick-action menu (DASH-03) | Browser/Client | — | Pure UI affordance; every destination it opens already exists. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo-image-picker` | `57.0.14` [VERIFIED: npm registry, 2026-08-30] | Native camera/library capture for progress photos (BODY-04) | Official Expo SDK 57 package, paired to this project's `expo` 57.0.12 / `react-native` 0.86.2. |
| `expo-image-manipulator` | `57.0.14` [VERIFIED: npm registry, 2026-08-30] | Downscale + re-encode captured photos to a bounded-long-edge JPEG on native (D-17) | Official Expo SDK 57 package; the current API is the `useImageManipulator`/`manipulate(uri)` context object with `.resize()` and `.saveAsync({ format: SaveFormat.JPEG })` [CITED: docs.expo.dev/versions/latest/sdk/imagemanipulator]. |
| `react-native-view-shot` | `5.1.1` [VERIFIED: npm registry, 2026-08-30] | Snapshot a composed RN view (two photos + date labels) to a JPEG for the composite, native only (BODY-05) | Supports Fabric/TurboModules (New Architecture) from v4.0+ [ASSUMED — training knowledge, not confirmed against the package's own changelog this session]; this project's `expo-image-picker`/`react-native-gesture-handler` etc. all require New Architecture as of SDK 55+, so this is a hard requirement, not a preference. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Browser `indexedDB` (built-in, no package) | n/a | Web-side photo byte store keyed by `storage_key` | No new dependency needed — raw `indexedDB.open()`/`IDBObjectStore` is sufficient for a simple key→Blob store; matches D-16's "the web path takes no new dependency." |
| Browser `<canvas>` (built-in, no package) | n/a | Web-side downscale/re-encode (D-17) and before/after composite render (BODY-05) | `drawImage` + `canvas.toBlob('image/jpeg', quality)` covers both resize and JPEG re-encode without `expo-image-manipulator`, which has no meaningful web target. |
| `expo-file-system` | `~57.0.4` (already installed) | Native document-directory read/write for photo bytes | Already a dependency; `apps/mobile/lib/export/export-training-data.ts` is the exact `File`/`Paths.document` pattern to copy. |
| `expo-sharing` | `~57.0.12` (already installed; verified `57.0.16` is latest patch [VERIFIED: npm registry]) | Native-only handoff of the rendered composite to the OS share sheet | Already a dependency. **Native only** — see Pitfall 2 below for why the web half cannot use it. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| IndexedDB for web photo storage | Origin Private File System (OPFS) via `navigator.storage.getDirectory()` | OPFS gives a more filesystem-like API and is what `@powersync/web`'s own WASM SQLite likely persists through, but IndexedDB needs no additional browser-capability check, stores `Blob` values natively via structured clone, and is simpler for a flat key→bytes store. OPFS is the better choice only if this phase later needs streaming/random-access reads, which it does not. |
| `<canvas>` for web composite/resize | `expo-image-manipulator` on web | `expo-image-manipulator` is a native module; on web it either no-ops or is unsupported for the manipulation operations this phase needs — not verified as web-capable this session, so `<canvas>` (which is unambiguously available on every desktop browser target) is the safer default. |
| `react-native-view-shot` for the composite on native | `expo-image-manipulator`'s crop/compose primitives | `expo-image-manipulator` has no side-by-side-compose primitive; it operates on a single image (crop/resize/rotate/flip). Compositing two images with text labels is naturally a "render a view, snapshot it" problem, which is exactly what `react-native-view-shot` is for. |

**Installation:**
```bash
npx expo install expo-image-picker expo-image-manipulator react-native-view-shot
```
Use `expo install`, not raw `npm install` — Expo's installer pins these to the SDK-57-compatible
version rather than each package's own npm `latest` dist-tag, matching the version pinning behavior
already documented for `react-native-gesture-handler`/`react-native-reanimated` in `docs/platform-modules.md`.

**Version verification:** `npm view expo-image-picker version` → `57.0.14`; `npm view expo-image-manipulator version` → `57.0.14`; `npm view react-native-view-shot version` → `5.1.1`; `npm view expo-sharing version` → `57.0.16` (installed range `~57.0.12` already covers this). All checked directly against the npm registry on 2026-08-30 [VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------------------|-----------|--------------|---------|-------------|
| `expo-image-picker` | npm | Latest patch published 2026-08-26 (4 days before this research) | 4,195,635/wk | `github.com/expo/expo` | SUS (`reasons: ["too-new"]`) | **Kept — flag is a false positive.** The "too-new" signal fires on the most recent *patch* publish timestamp, not on package age; this is the official Expo monorepo package with 4M+ weekly downloads and no deprecation flag. Planner must still add a `checkpoint:human-verify` before the install task per the gate's own rule, but no substitution is warranted. |
| `expo-image-manipulator` | npm | Latest patch published 2026-08-26 | 1,960,532/wk | `github.com/expo/expo` | SUS (`reasons: ["too-new"]`) | **Kept — same false-positive reasoning as above.** |
| `react-native-view-shot` | npm | Latest published 2026-06-20 | 1,082,499/wk | `github.com/gre/react-native-view-shot` | OK | Approved. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `expo-image-picker`, `expo-image-manipulator` — both flagged solely on publish-timestamp recency of the SDK 57 patch release, not on any other risk signal (both are official `expo/expo` monorepo packages with millions of weekly downloads, no postinstall script, no deprecation). Planner should still gate their install task behind `checkpoint:human-verify` per protocol, but no alternative package exists worth substituting — Expo's own image-picker/image-manipulator are the only first-party, SDK-57-aligned options for this capability.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │   Home tab (dashboard)       │
                         │   apps/mobile/app/(tabs)/    │
                         │   index.tsx (D-20)            │
                         └──────────────┬───────────────┘
                                        │ reads dashboard_widget rows
                                        │ (position, enabled, widget_kind)
                                        ▼
                         ┌─────────────────────────────┐
                         │  Widget catalog dispatch     │
                         │  (D-22: skip unknown kinds)  │
                         └───┬──────┬──────┬──────┬─────┘
                    next_up  │ weekly_progress │ recent_records │ muscle_heatmap │ bodyweight_trend │ history_trend
                             ▼      ▼          ▼                ▼               ▼                  ▼
                    (all pre-existing Phase 9/10/4 components — NO new analytics this phase)

  ── Body metric write path (BODY-01/02) ─────────────────────────────────────────────────────
  Quick-action sheet (DASH-03) ──▶ NumericKeypad (quick weigh-in) ──▶ body_metric INSERT
                                                                        │ (client SQLite, PowerSync
                                                                        │  crud queue)
                                                                        ▼
                                          PowerSync sync ──▶ POST /v1/sync/push ──▶ SyncService
                                                                                     .applyBatch
                                                                                     (singleton
                                                                                      root, same
                                                                                      shape as
                                                                                      personal_record)
                                                                                        │
                                                                                        ▼
                                                                              Postgres body_metric
                                                                                (numeric(10,3))
                                                                                        │
                                                          ops/powersync/sync-rules.yaml │ pull
                                                          (already exists — WHERE       │
                                                           user_id = auth.user_id())    ▼
                                                                          Other devices' local SQLite

  ── Progress photo path (BODY-04/05) — bytes NEVER cross this boundary (D-15) ────────────────
  Capture (.web.tsx split)          Downscale/re-encode (D-17)         Local byte store
  native: expo-image-picker    ──▶  native: expo-image-manipulator ──▶ native: expo-file-system
  web: <input type=file>            web: <canvas> drawImage/toBlob      Paths.document + storage_key
                                                                         web: IndexedDB keyed by
                                                                              storage_key
                                          │
                                          ▼
                              progress_photo row (metadata only: storage_key, taken_at, timezone,
                              local_date, note) ── same sync path as body_metric above ──▶ Postgres

  ── Composite (BODY-05) — ephemeral, never persisted or synced ───────────────────────────────
  Two on-device photos ──▶ native: react-native-view-shot captureRef ──▶ expo-sharing share sheet
                        ──▶ web: <canvas> compose + toBlob            ──▶ Blob-download link
                                                                            (export-training-data.web.ts
                                                                             pattern)
```

### Recommended Project Structure

```
apps/mobile/
├── lib/
│   ├── db/
│   │   ├── body-metrics.ts              # write/read helpers for body_metric (BODY-01/02/03)
│   │   ├── progress-photos.ts           # metadata-row CRUD for progress_photo (native+web shared)
│   │   └── dashboard-widgets.ts         # dashboard_widget CRUD + materializeDefaultWidgets (D-26)
│   ├── photos/
│   │   ├── capture.ts + capture.web.ts  # D-16 platform split: picker vs <input type=file>
│   │   ├── downscale.ts + downscale.web.ts   # D-17 platform split: manipulator vs canvas
│   │   ├── photo-store.ts + photo-store.web.ts  # D-15 platform split: File/Paths vs IndexedDB
│   │   └── composite.ts + composite.web.ts  # BODY-05 platform split: view-shot+sharing vs canvas+download
│   └── db/programs/order-index.ts       # REUSED, not reimplemented — see Pattern 6
├── components/
│   ├── QuickActionSheet.tsx             # DASH-03, mirrors SessionActionSheet idiom
│   ├── QuickWeighInSheet.tsx            # D-29, reuses NumericKeypad
│   ├── DashboardWidgetPicker.tsx        # DASH-02 add/remove UI
│   └── ProgressPhotoPlaceholder.tsx     # D-15/D-19 "not on this device" state
docs/
└── body-metric-vocabularies.md          # D-06/D-22, follows program-vocabularies.md's structure
```

### Pattern 1: Singleton-root sync registration (body_metric, progress_photo, dashboard_widget)

**What:** Registering a table so `SyncService.applyBatch` accepts pushed writes for it, following the
exact seven-point checklist Phase 11's `excluded_exercise` plan (`11-02-PLAN.md`) executed and proved
end-to-end against a live server.

**When to use:** Any table that is a singleton aggregate root — owns no synced children, is never
referenced as a parent by another table's op.

**The seven registration points** (verified by reading `apps/api/src/sync/sync.service.ts` directly this session):

1. `TABLE_MAP` (line ~85): `body_metric: bodyMetric, progress_photo: progressPhoto, dashboard_widget: dashboardWidget`
2. `SINGLETON_ROOT_TYPES` (a `Set<string>`, line ~127): add `'body_metric'`, `'progress_photo'`, `'dashboard_widget'`
3. `ROOT_TABLE_BY_TYPE` (line ~144): same three additions, mapping type string to the Drizzle table object
4. `AGGREGATE_RANK` (a `Record`, line ~210): `body_metric: 0, progress_photo: 0, dashboard_widget: 0` — rank 0 because none has children to order against
5. `hasInvalidField` — a new `if (op.type === 'body_metric') { ... }` branch (see Code Examples) validating `kind` against the vocabulary and `value` as a non-negative decimal string
6. The root-existence lookup block (~line 1550-1670 in the current file) — extend `rootIdsByRootType`, the batched `existing...Roots` query, and fold into `existingOwnerByRoot`
7. The `values` ternary chain and `applyBatch`'s insert branch (~line 1900-2150) — `toBodyMetricValues`/`toProgressPhotoValues`/`toDashboardWidgetValues` functions plus an `onConflictDoUpdate` insert mirroring the `excluded_exercise` branch exactly

```typescript
// Source: apps/api/src/sync/sync.service.ts, lines 2016-2029 (read this session)
// This is the excluded_exercise insert branch — body_metric/progress_photo/dashboard_widget
// copy this shape verbatim, substituting the table, values type and patch-field map.
} else if (op.type === 'excluded_exercise') {
  const nextSeq = sql`nextval('sync_seq')`;
  const excludedExerciseValues = values as ExcludedExerciseValues;
  const [{ serverSeq }] = await tx
    .insert(excludedExercise)
    .values({ ...excludedExerciseValues, serverSeq: nextSeq })
    .onConflictDoUpdate({
      target: excludedExercise.id,
      set: {
        ...patchAwareSet(op, excludedExerciseValues, EXCLUDED_EXERCISE_PATCH_FIELDS),
        serverSeq: nextSeq,
      },
    })
    .returning({ serverSeq: excludedExercise.serverSeq });
  const seqValue = BigInt(serverSeq);
  if (seqValue > highestServerSeq) highestServerSeq = seqValue;
}
```

**A key difference from `excluded_exercise`:** `body_metric` and `progress_photo` already exist in
Postgres and already have pull queries in `sync-rules.yaml` — this phase does NOT touch schema files,
does NOT touch `sync-rules.yaml` for those two tables, and does NOT run `drizzle-kit push` for them.
`dashboard_widget`, being wholly new, DOES need all of those steps (see Pattern 4).

### Pattern 2: `.web.tsx` platform split for photo capture (D-16)

**What:** Native uses `expo-image-picker`'s camera/library launcher; web uses a bare
`<input type="file" accept="image/*" capture="environment">`.

**Why not `expo-image-picker` on web too:** `expo-image-picker` DOES technically support the web
target (it internally wraps a hidden file input) [CITED: Expo web search summary, not independently
verified against the package source this session]. D-16 deliberately does not depend on it there
anyway — "the web path takes no new dependency" is an explicit design choice, not a technical
necessity, and importing `expo-image-picker` only from the native (non-`.web.tsx`) sibling means
Metro never bundles its web code path at all, keeping the web bundle smaller and the platform split
symmetrical with every other `.web.tsx` pair in this codebase.

```typescript
// Native: apps/mobile/lib/photos/capture.ts
import * as ImagePicker from 'expo-image-picker';

export async function capturePhoto(): Promise<{ uri: string } | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1, // full quality in — D-17's downscale step does the compression, not this call
  });
  if (result.canceled) return null;
  return { uri: result.assets[0].uri };
}
```

```typescript
// Web: apps/mobile/lib/photos/capture.web.ts
export function capturePhoto(): Promise<{ blob: Blob } | null> {
  return new Promise((resolve) => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { blob: file } : null);
    };
    input.click();
  });
}
```

### Pattern 3: Composite generation, native vs. web (BODY-05)

**Native:** compose a plain RN `<View>` with two `<Image>`s and two `<Text>` date labels, snapshot it
with `react-native-view-shot`'s `captureRef`, then hand the resulting file URI to `expo-sharing`.

```typescript
// Source: react-native-view-shot README pattern, adapted — [CITED: github.com/gre/react-native-view-shot]
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

async function shareComposite(viewRef: React.RefObject<View>) {
  const uri = await captureRef(viewRef, { format: 'jpg', quality: 0.9 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
  }
}
```

**Web:** draw both images onto an offscreen `<canvas>`, add the date labels with `fillText`, export
with `toBlob`, then use the same Blob-download idiom `export-training-data.web.ts` already
establishes — do NOT attempt `expo-sharing` on this path.

```typescript
// Web: apps/mobile/lib/photos/composite.web.ts
// Mirrors apps/mobile/lib/export/export-training-data.web.ts's Blob+<a download> idiom exactly
// (read this session) — expo-sharing cannot share a local file by URI on web at all
// [CITED: docs.expo.dev/versions/latest/sdk/sharing].
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

### Pattern 4: Adding a wholly new synced table (`dashboard_widget`, D-21) end-to-end

Worked from `.planning/phases/11-program-generation/11-02-PLAN.md` (`excluded_exercise`), read in
full this session. Six touchpoints, in order:

1. **Postgres schema** — `apps/api/src/db/schema/records.ts` (beside `bodyMetric`/`progressPhoto`, the
   same file, since `dashboard_widget` is a "records"-adjacent per-user table): `pgTable('dashboard_widget', { id, userId (FK, cascade), widgetKind: text, position: integer, enabled: boolean default true, serverSeq: bigint default nextval('sync_seq') })`, plus an index on `userId`. Add to `apps/api/src/db/schema.ts`'s import/export/`schema` object and `userRelations`.
2. **`packages/api-contracts/src/sync.ts`** — append `'dashboard_widget'` as the LAST member of BOTH `SYNCED_TABLES` and `PUSH_APPLIED_TABLES` (never inserted, never sorted — this file's header comment is explicit about additive-only ordering). This finally makes `PUSH_DEFERRED_TABLES` empty for the first time in the project's life once `body_metric`/`progress_photo` also move (Pattern 1) — the CONTEXT.md "Specific Ideas" section flags this as worth a falsifiable test (assert the tuple is `[]`).
3. **`ops/powersync/sync-rules.yaml`** — append one query line at the end of the `user_data` stream: `SELECT * FROM dashboard_widget WHERE user_id = auth.user_id()`, matching every other flat per-user query's shape exactly.
4. **`apps/api/src/sync/patch-update-set.ts`** — `DashboardWidgetValues` interface + `DASHBOARD_WIDGET_PATCH_FIELDS: PatchFieldMap<DashboardWidgetValues>` mapping `id`/`userId` to `null` (server-derived, written unconditionally) and `widgetKind`/`position`/`enabled` to their snake_case column names (all three ARE user-patchable, unlike `excluded_exercise`'s identity-only `exerciseId` — reordering and toggling visibility are exactly the edits this table exists for).
5. **`apps/api/src/sync/sync.service.ts`** — the seven registration points from Pattern 1.
6. **`apps/mobile/lib/db/schema.ts`** — `dashboardWidget` `sqliteTable('dashboard_widget', { id, userId, widgetKind, position: integer, enabled: integer({mode:'boolean'}), serverSeq: integer })`, added to the `drizzleSchema` export object. **This is the entire "client schema" step** — there is no separate manual schema-version number to bump in this codebase; `apps/mobile/lib/db/powersync.ts` and `powersync.web.ts` both construct `AppSchema = new DrizzleAppSchema({ ...drizzleSchema, ...localOnlyCatalogTables })` directly from this object (verified by reading both files this session), so PowerSync derives its local SQLite schema from `drizzleSchema` at construction time with no version literal anywhere in the call chain.

Then `pnpm --filter api db:push` (this repo keeps no migration files — push IS the migration
mechanism, confirmed in 11-02-PLAN.md's own worked commentary) and `pnpm --filter api db:verify`
(schema-parity e2e spec) close the loop, exactly as Phase 11's plan did.

### Pattern 5: BODY-03 trend reuse — zero new charting code

`TrendChart` (`apps/mobile/components/TrendChart.tsx`) and `@fitness/analytics-engine`'s trend-series
primitives are generic over any `{ date, value }` series — a body-metric trend needs only a query
function (`loadBodyMetricTrend(kind, windowStart)`) that reads `body_metric` rows for the active
`kind`, groups by `local_date`, keeps the latest `recorded_at` row per date (D-09), and hands the
result to the same `TrendChart` props every exercise trend already uses. No SVG, accessibility, or
R16/no-text-inside-`<Svg>` work is needed — that contract is already proven by Phase 9.

### Pattern 6: Reorder — reuse `order-index.ts`, do not reimplement

`apps/mobile/lib/db/programs/order-index.ts` (read in full this session) is already database-free,
pure, and unit-tested: `ORDER_INDEX_GAP = 1024`, `appendOrderIndex`, `midpointOrderIndex`,
`needsRenumber`, `renumberOrderIndexes`, `sortByOrderThenId`. `apps/mobile/lib/db/programs/days.ts`'s
`computeReorder` function (also read this session) is the reusable "given siblings + a moved id + a
before/after anchor pair, compute either one midpoint write or a full renumber" arithmetic —
`dashboard_widget.position` should call this same function (or a thin, table-generic extraction of
it) rather than writing a fourth copy of the same logic (routine_day, routine_exercise, and
session_exercise already each have one).

### Anti-Patterns to Avoid

- **Writing a fourth reorder algorithm:** `computeReorder`/`order-index.ts` already generalizes across
  `routine_day`/`routine_exercise`; `dashboard_widget.position` is not a special case.
- **Calling `expo-sharing` unconditionally on the composite path:** it silently cannot share a local
  file by URI on web (confirmed via Expo's own docs and this codebase's existing bypass in
  `export-training-data.web.ts`) — always platform-split, never guard with `Platform.OS` at the call
  site (violates `docs/platform-modules.md`'s own stated convention).
- **Treating `dashboard_widget`'s "no rows" state as the default:** unlike `user_preference`'s
  read-time-default pattern (`preferences.ts`'s `loadWeightUnit` returns a constant when no row
  exists), D-26 requires real materialized rows on first read — see Pitfall 3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sparse-integer reorder arithmetic | A new gap/renumber scheme for `dashboard_widget.position` | `apps/mobile/lib/db/programs/order-index.ts` + `computeReorder` | Already correct, already tested, already proven under offline two-device LWW for three other tables. |
| kg⇄lb / cm⇄in exact decimal conversion | A second unit-conversion module for length | Extend `packages/api-contracts/src/units.ts`'s bigint-fraction pattern with a parallel `CM_PER_IN` constant and `toCanonicalCm`/`fromCanonicalCm` functions | The existing module is deliberately float-free (exact bigint fraction arithmetic) specifically because "this project has never let a synced numeric become a binary float on the wire" (D-03's own rationale) — 1 inch = 2.54 cm exactly, so the identical technique applies without modification. |
| Image resize/compression on native | Manual byte manipulation or a third-party resize library | `expo-image-manipulator`'s `useImageManipulator`/`.resize()`/`.saveAsync({format: SaveFormat.JPEG})` | Official Expo module, already the SDK-57-aligned choice, avoids a second native dependency for the same job `expo-image-picker`'s own `quality` param cannot do (that only controls JPEG compression, not target dimensions). |
| Composite image generation | A server-side image-composition service | `react-native-view-shot` (native) / `<canvas>` (web) | D-18 explicitly forbids a server compositing tier (the server never holds photo bytes, per D-15) — this must be a client-only capability regardless of implementation choice. |

**Key insight:** Every "Don't Hand-Roll" item in this phase already has a working implementation
somewhere in this codebase from an earlier phase; the risk here is not choosing the wrong library,
it is failing to notice the existing precedent and duplicating it.

## Runtime State Inventory

Not applicable — this is a greenfield phase (new tables, new UI surfaces), not a rename, refactor, or
migration. No existing runtime state (stored data, live service config, OS-registered state, secrets,
build artifacts) needs updating as a consequence of this phase's changes.

## Common Pitfalls

### Pitfall 1: Assuming `expo-file-system`'s document-directory API has a web equivalent

**What goes wrong:** Code written against `new File(Paths.document, ...)` (the pattern
`export-training-data.ts` already uses for native) silently fails or throws when Metro resolves it
for the web bundle, because `expo-file-system` does not expose arbitrary app-private file storage on
web at all.
**Why it happens:** `expo-file-system`'s TypeScript types compile identically on both platforms; the
gap is not caught by typecheck, only by actually running the web bundle.
**How to avoid:** Never import `expo-file-system`'s `File`/`Directory`/`Paths` from a non-`.web.tsx`
file that also needs to run on web. The photo storage module must be `.web.tsx`-split from the start,
with the web sibling built on IndexedDB, not on any `expo-file-system` API.
**Warning signs:** `expo export --platform web` succeeding is NOT sufficient proof the storage path
works — Metro will happily bundle a call that throws at runtime. The actual proof is exercising the
write/read round-trip in a real browser (Playwright), matching this repo's own stated evidence bar
("a green run is real evidence — prefer executing a spec over asserting it would pass").

### Pitfall 2: Calling `expo-sharing` unconditionally for the composite share

**What goes wrong:** `Sharing.shareAsync(uri, ...)` either throws or silently no-ops on the web
target when handed a local blob/object URL, because `expo-sharing`'s web implementation is a thin
wrapper over the Web Share API, which — per Expo's own documentation, read this session — explicitly
cannot share local files by URI on web at all.
**Why it happens:** `Sharing.isAvailableAsync()` has a documented history of returning `true` on some
browsers even when the actual share call subsequently fails (a filed Expo GitHub issue, read this
session) — the availability check itself is not a reliable guard.
**How to avoid:** Split composite output by platform structurally (Pattern 3), not with an
`isAvailableAsync()` runtime check. Native uses `expo-sharing`; web uses the `Blob` + `<a download>`
idiom this codebase already proved correct for the export flow.
**Warning signs:** A composite "share" button that works in a Playwright test (because the download
attribute simulates a click without the OS actually intercepting it) but a code review finds
`expo-sharing` imported from a shared (non-split) module.

### Pitfall 3: Copying `user_preference`'s read-time-default pattern for `dashboard_widget`

**What goes wrong:** `apps/mobile/lib/db/preferences.ts`'s existing precedent (`loadWeightUnit`,
`loadWorkoutPreferences`) is "if no row exists, return a hardcoded default constant" — no row is ever
written until the user explicitly changes something. Applying that same pattern to
`dashboard_widget` would make "no rows" ambiguous between "brand-new user" and "user removed every
widget on purpose," which is exactly the ambiguity D-24/D-26 require distinguishing.
**Why it happens:** `preferences.ts` is the most recently touched precedent for "what does a missing
per-user row mean," and it is tempting to copy it verbatim without noticing D-26 explicitly overrides
that convention for this one table.
**How to avoid:** The dashboard's first read must call a `materializeDefaultWidgets(userId)` function
that performs a real `INSERT` of the D-23 default widget set (reproducing today's Home screen
exactly, per CONTEXT.md's "Specific Ideas") the first time it finds zero `dashboard_widget` rows for
that user — not merely fall back to an in-memory default array at render time.
**Warning signs:** A test that reads the dashboard for a fresh user and finds `dashboard_widget` still
has zero rows in local SQLite afterward — that is the exact bug D-26 was written to prevent.

### Pitfall 4: `hasInvalidField` validation drifting from the vocabulary module

**What goes wrong:** `body_metric.kind` and `dashboard_widget.widget_kind` are both closed
vocabularies (D-06/D-22), but if `sync.service.ts`'s `hasInvalidField` branch retypes the literal
list instead of importing it from `@fitness/api-contracts`, the server-side validator and the
client-side vocabulary module can silently diverge — exactly the failure class this codebase's
existing `SESSION_STATUSES`/`SET_TYPES`/`PR_TYPES` sets were rewritten to prevent (a comment in
`sync.service.ts`, read this session, explicitly calls out `SESSION_STATUSES` "used to be a retyped
literal Set" that was "missing 'paused' entirely").
**Why it happens:** Copy-pasting an existing `hasInvalidField` branch (e.g. `personal_record`'s
`pr_type` check) is fast, but easy to leave as a hand-typed array instead of wiring the shared const.
**How to avoid:** Export `BODY_METRIC_KINDS` and `WIDGET_KINDS` as runtime tuples from
`@fitness/api-contracts` (mirroring `CYCLE_KINDS`, `LOAD_TYPES`, `WEIGHT_UNITS`), then build
`const BODY_METRIC_KIND_SET = new Set<string>(BODY_METRIC_KINDS)` in `sync.service.ts` exactly as
`CYCLE_KINDS`/`WORKOUT_SESSION_STATUSES` already are (verified by reading the imports and set
constructions in `sync.service.ts` this session).
**Warning signs:** A `docs/body-metric-vocabularies.md` value that exists in the vocabulary table but
is rejected by a live push, or vice versa — a value the docs never listed being silently accepted.

### Pitfall 5: `widget_kind` unrecognized-value handling diverging from the "skip, don't error" rule

**What goes wrong:** D-22 requires an unrecognised `widget_kind` (from a newer device's widget the
current client build predates) to be silently skipped at render time, never shown as an error tile.
If the widget-rendering dispatch is written as an exhaustive `switch` with a `default: throw`, a
months-old client crashes the entire dashboard the moment any device adds a widget kind it predates.
**Why it happens:** TypeScript's exhaustiveness checking naturally encourages a `default: throw`
pattern for "this should never happen" cases — but here it genuinely can happen, by design (forward
compatibility).
**How to avoid:** The widget dispatch must filter unknown kinds out of the render list before
mapping, not throw inside the map. Model this the same way `isTerminalRejection`'s forward-compatible
"unrecognized value is not necessarily an error" reasoning already works elsewhere in this codebase.
**Warning signs:** A dashboard that renders a red error boundary instead of simply omitting one tile
when a widget row carries an unfamiliar `widget_kind`.

## Code Examples

### `hasInvalidField` branch for `body_metric` (follows the `personal_record` shape)

```typescript
// Source: pattern from apps/api/src/sync/sync.service.ts's existing personal_record branch
// (read this session, lines ~1013-1020), adapted for body_metric's kind/value shape.
if (op.type === 'body_metric') {
  const d = data as BodyMetricOpData;
  if (d.kind !== undefined && !(typeof d.kind === 'string' && BODY_METRIC_KINDS.has(d.kind))) return true;
  if (d.value !== undefined && !isNonNegativeDecimalOrNull(d.value)) return true;
  if (!isValidOptionalIsoOrNull(d.recorded_at)) return true;
  if (d.local_date !== undefined && !LOCAL_DATE_RE.test(String(d.local_date))) return true;
  return false;
}
```

### Extending the units boundary for length (D-08)

```typescript
// Source: pattern extending packages/api-contracts/src/units.ts (read in full this session) —
// same exact-bigint-fraction technique, parallel to KG_PER_LB/toCanonicalKg/fromCanonicalKg.
export const LENGTH_UNITS = ['cm', 'in'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

// 1 inch = 2.54 cm exactly (international definition) — an exact decimal, unlike the pound, so
// this could even use a plain rational, but kept as an integer numerator/denominator pair for the
// same reason KG_PER_LB is: multiplying by it must never pass through a binary float.
export const CM_PER_IN = { numerator: 254n, denominator: 100n } as const;

// toCanonicalCm/fromCanonicalCm mirror toCanonicalKg/fromCanonicalKg's parseDecimalToFraction ->
// convertFraction -> roundExactFractionToScale -> formatScaledBigInt pipeline verbatim, with
// CM_PER_IN substituted for KG_PER_LB and a length DISPLAY_SCALE (kg-equivalent: cm=1, in=1 is a
// reasonable starting point, subject to the same UX judgement DISPLAY_SCALE's kg=2/lb=1 already
// encodes — this is a Claude's-discretion display-precision choice, not dictated by D-08).
```

### Materializing default widgets on first read (D-26)

```typescript
// New pattern this phase introduces — apps/mobile/lib/db/dashboard-widgets.ts
// Deliberately NOT the preferences.ts read-default pattern (see Pitfall 3).
const DEFAULT_WIDGET_KINDS = ['next_up', 'weekly_progress'] as const; // reproduces today's Home screen exactly

export async function loadOrMaterializeDashboardWidgets(userId: string, db: WriteDb = getPowerSync()) {
  const existing = await db.select().from(dashboardWidget).where(eq(dashboardWidget.userId, userId));
  if (existing.length > 0) return sortByOrderThenId(existing.map(toOrderedRow));

  const rows = DEFAULT_WIDGET_KINDS.map((kind, i) => ({
    id: crypto.randomUUID(),
    userId,
    widgetKind: kind,
    position: appendOrderIndex(i === 0 ? [] : [ (i) * ORDER_INDEX_GAP ]),
    enabled: true,
  }));
  await db.insert(dashboardWidget).values(rows);
  return rows;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `expo-image-manipulator`'s `manipulateAsync(uri, actions, saveOptions)` one-shot function | `useImageManipulator(uri)` / `ImageManipulator.manipulate(uri)` context object with chained `.resize()`/`.crop()`/`.rotate()`/`.flip()` then `.renderAsync()`/`.saveAsync()` | SDK 52+ [CITED: docs.expo.dev/versions/latest/sdk/imagemanipulator] | The context API is the one documented in current (unversioned/latest) Expo docs; the legacy `manipulateAsync` function still exists but the new pattern is what this phase's plan should target. |
| `expo-file-system`'s legacy string-URI API (`FileSystem.documentDirectory`, `FileSystem.writeAsStringAsync`) | `File`/`Directory`/`Paths` object-oriented API (`Paths.document`, `new File(...)`, `.create()`/`.write()`) | SDK 54 [CITED: expo.dev/blog/expo-file-system] | This codebase already uses the new API exclusively (`export-training-data.ts`) — no legacy-API code exists to be consistent with, so the photo storage module should use the new API too, not the legacy one. |

**Deprecated/outdated:** None specific to this phase beyond the above — no library in this phase's
stack is itself deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `react-native-view-shot` v4.0+ supports React Native's New Architecture (Fabric/TurboModules) | Standard Stack | If wrong, the native composite path would need a config-plugin/prebuild investigation or a substitute library before it can run at all on this project's mandatory-New-Architecture Expo SDK 57 target — plan should include a spike/checkpoint verifying a real native build links the module correctly, since native builds are unverifiable in this environment per the project's standing native-toolchain-absent constraint. |
| A2 | `expo-image-picker` internally supports the web target via a hidden file input (cited from a web search summary, not independently confirmed against the package's own source in this session) | Pattern 2 | Low risk either way — D-16 already avoids depending on this by keeping `expo-image-picker` out of the `.web.tsx` sibling entirely, so even if this claim is wrong, the plan's actual web implementation (a bare `<input type="file">`) is unaffected. |
| A3 | IndexedDB quota on desktop browsers (this project's stated web target) is generous enough (percentage-of-disk, not a fixed low cap) that a handful of downscaled JPEGs per user will not realistically hit a quota wall in v1 | Standard Stack / Pattern 2 | If wrong on some browser/config, photo capture on web could start failing silently past a quota ceiling — worth a `navigator.storage.estimate()` check or at minimum a caught-error path that surfaces "storage full" rather than a swallowed exception. |
| A4 | Display precision (decimal places) for cm/in length display, parallel to `DISPLAY_SCALE`'s `{kg:2, lb:1}` | Code Examples | Low risk — cosmetic only; a wrong choice produces an over- or under-precise displayed number, not a data-integrity issue, since the canonical stored value is unaffected. |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Exact cm/in `DISPLAY_SCALE` values for the length-unit extension**
   - What we know: the storage-side exactness technique is settled (bigint fraction, mirroring `KG_PER_LB`); D-08 says length kinds derive display unit from `user_preference.weight_unit` (kg→cm, lb→in).
   - What's unclear: how many decimal places to display for cm vs in (the mass-unit precedent is kg=2 decimals, lb=1 decimal — a body measurement in cm probably wants 1 decimal, in probably wants 1 as well, but this is a UX call, not a technical one).
   - Recommendation: leave as a planner/UI-spec discretion item; the underlying conversion function must be exact regardless of the chosen display rounding.

2. **`react-native-view-shot`'s actual New Architecture compatibility for this project's exact Expo SDK 57 / RN 0.86.2 pairing**
   - What we know: registry metadata shows an actively maintained package (weekly downloads over 1M, latest publish 2026-06-20); general claims (not independently verified against the package's own changelog) state v4.0+ supports Fabric/TurboModules.
   - What's unclear: whether it needs a config plugin entry, and whether any autolinking friction exists specific to Expo's managed workflow at SDK 57.
   - Recommendation: plan should include an early, cheap verification step (e.g. a `pnpm --filter mobile run typecheck` plus `npx expo install react-native-view-shot` succeeding without a version-mismatch warning) before building the full composite feature on top of it, and file a `WINDOWS.md` unrun-verify entry for the actual on-device Fabric behavior, consistent with this project's standing native-toolchain-absent posture.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Live Postgres (`DATABASE_URL`) | `drizzle-kit push` / `db:verify` for `dashboard_widget` (Pattern 4) | Assumed available per existing project workflow (used by every prior phase's e2e specs) — not independently probed this session | — | None — this is a hard blocker for Task-2-equivalent work in this phase, same as every prior phase touching Postgres. |
| PowerSync Service (self-hosted) | Sync-rules change for `dashboard_widget`'s new pull query to take effect | Not probed this session | — | None — CONTEXT.md's own canonical references flag the restart requirement explicitly; the native cross-device verification of this is deferred to ROADMAP Phase 999.1 per standing project policy. |
| A real browser (Chromium via Playwright) | Verifying the IndexedDB photo-storage path and the `<canvas>` composite path actually work (Pitfall 1) | Available per `.planning/CONVENTIONS.md`'s standing E2E authorization for this repo (Chromium cached at `~/Library/Caches/ms-playwright`) | — | None needed — this is the repo's already-proven evidence mechanism. |
| iOS/Android simulator or device | Verifying `expo-image-picker`/`expo-image-manipulator`/`react-native-view-shot` actually work natively | **Not available** — per this project's standing `fitness-native-toolchain-absent` memory (no Xcode, no Android SDK on this machine) | — | Typecheck + correct API usage only; file as WINDOWS unrun-verify entries, deferred to ROADMAP Phase 999.1 per the project's `android-testing-deferred`/`human-verification-deferred` standing policy. |

**Missing dependencies with no fallback:** none beyond the standing native-toolchain gap already
tracked project-wide (not new to this phase).

**Missing dependencies with fallback:** none — every gap above has an existing, already-adopted
project-level deferral mechanism.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` (unit) + Playwright `@playwright/test` `1.62.1` (e2e/web) [VERIFIED: apps/mobile/package.json, read this session] |
| Config file | `apps/mobile/jest.config.js` (unit), `apps/mobile/playwright.config.ts` (e2e) |
| Quick run command | `pnpm --filter mobile test -- <pattern>` (Jest, single file) |
| Full suite command | `pnpm --filter mobile test` (Jest) + `pnpm --filter mobile test:e2e` (Playwright, all projects) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| BODY-01/02 | `body_metric` push/pull registration, ownership, validation | unit + e2e | `pnpm --filter api test:e2e -- body-metric` | ❌ Wave 0 — new spec, modeled on `excluded-exercise.e2e-spec.ts` |
| BODY-03 | Trend query dedups multiple same-day entries to latest, no fabricated zeros | unit | `pnpm --filter mobile test -- body-metric-trend` | ❌ Wave 0 |
| BODY-04 | Native capture→downscale→store round-trip; web capture→downscale→IndexedDB round-trip | unit (downscale math) + Playwright (web storage round-trip, real IndexedDB in a real browser) | `pnpm --filter mobile test:e2e -- progress-photo` | ❌ Wave 0 |
| BODY-05 | Composite generation produces a shareable/downloadable artifact from two on-device photos; excludes photos absent locally (D-19) | Playwright (web canvas path is fully exercisable in a real browser; native `react-native-view-shot` path is typecheck-only per Environment Availability) | `pnpm --filter mobile test:e2e -- composite` | ❌ Wave 0 |
| DASH-01 | Widget catalog renders all six kinds correctly, skips unknown `widget_kind` (D-22) | unit | `pnpm --filter mobile test -- dashboard-widget-dispatch` | ❌ Wave 0 |
| DASH-02 | Add/remove/reorder writes correct `position` values; first-run materializes real rows (D-26) | unit (`computeReorder`-style pure functions) + Playwright (full add/remove/reorder against real PowerSync-web) | `pnpm --filter mobile test:e2e -- dashboard-widgets` | ❌ Wave 0 |
| DASH-03 | Quick-action sheet reaches all six destinations; quick weigh-in commits without navigation and defaults to last value (D-29) | unit + Playwright | `pnpm --filter mobile test:e2e -- quick-action` | ❌ Wave 0 |
| Cross-cutting | `PUSH_DEFERRED_TABLES` is empty after this phase (CONTEXT.md's own falsifiable-assertion request) | unit | one-liner asserting `PUSH_DEFERRED_TABLES.length === 0`, same shape as 11-02's `SYNCED_TABLES`/`PUSH_APPLIED_TABLES` last-member assertion | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter mobile test -- <touched-area>` and/or `pnpm --filter api test -- <touched-area>`
- **Per wave merge:** `pnpm -w typecheck && pnpm --filter mobile test && pnpm --filter api test:e2e`
- **Phase gate:** Full suite green (`pnpm --filter mobile test:e2e` including the `durability` project) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/test/body-metric.e2e-spec.ts` — covers BODY-01/02 push ownership/validation, modeled on `excluded-exercise.e2e-spec.ts`
- [ ] `apps/api/test/progress-photo.e2e-spec.ts` — covers BODY-04 metadata-row push ownership/validation
- [ ] `apps/api/test/dashboard-widget.e2e-spec.ts` — covers DASH-02 push ownership/validation and the `PUSH_DEFERRED_TABLES`-empty assertion
- [ ] `apps/mobile/lib/photos/__tests__/downscale.test.ts` — pure-function coverage for the D-17 bound
- [ ] Framework install: none — Jest and Playwright are already fully configured project-wide.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (new) | Already covered project-wide by Better Auth; no new auth surface this phase. |
| V3 Session Management | No (new) | Same as above. |
| V4 Access Control | Yes | Every new/newly-applied table's ownership is derived from the authenticated session only, never from client payload — the exact pattern `toExcludedExerciseValues`/`toUserExercisePreferenceValues` already establish (`userId` argument, never `data.user_id`). |
| V5 Input Validation | Yes | `hasInvalidField` branches for `body_metric`/`progress_photo`/`dashboard_widget`, built from the shared `@fitness/api-contracts` vocabulary tuples (Pitfall 4), never retyped literals. |
| V6 Cryptography | No (new) | No new cryptographic surface — photo bytes are stored unencrypted on-device, matching this project's existing local-SQLite-at-rest posture for every other table. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| A `body_metric`/`progress_photo`/`dashboard_widget` PUT claiming another user's `user_id` | Spoofing/Tampering | `toBodyMetricValues`/`toProgressPhotoValues`/`toDashboardWidgetValues` take `userId` from the authenticated session argument only, exactly as every existing singleton-root `to*Values` function does — proven by the `excluded_exercise` e2e spec's cross-user case, which this phase's new specs should copy. |
| Cross-user delivery of another user's body metrics, photos, or widget layout | Information Disclosure | Each new `sync-rules.yaml` query is scoped `WHERE user_id = auth.user_id()`, identical in shape to every existing per-user query in the `user_data` stream (`body_metric`/`progress_photo`'s pull queries already exist and were verified by reading the file this session; `dashboard_widget`'s new query must match exactly). |
| Malformed `kind`/`widget_kind` value bypassing the closed vocabulary | Tampering | `hasInvalidField` rejects before `applyBatch` ever reaches an insert; the Postgres side has no CHECK constraint requirement here since a closed-vocabulary CHECK could be added but is not strictly required if `hasInvalidField` is the enforced backstop — recommend adding a CHECK anyway (`docs/program-vocabularies.md`'s own established pattern) since the seed script and any direct-SQL tooling bypass the application-level validator entirely, the same reasoning `personal_record_pr_type_check` already documents. |
| An IndexedDB photo store readable by another origin or another app on a shared browser profile | Information Disclosure | Out of scope for this project — IndexedDB is already origin-scoped by the browser itself; no additional mitigation needed beyond the browser's own same-origin storage isolation. |

## Sources

### Primary (HIGH confidence)
- `apps/api/src/sync/sync.service.ts` (full read, this session) — `TABLE_MAP`, `SINGLETON_ROOT_TYPES`, `ROOT_TABLE_BY_TYPE`, `AGGREGATE_RANK`, `hasInvalidField`, root-existence lookup block, `toExcludedExerciseValues`, `applyBatch` insert branches
- `apps/api/src/sync/patch-update-set.ts` (relevant sections read, this session) — `PatchFieldMap` convention, `ExcludedExerciseValues`/`EXCLUDED_EXERCISE_PATCH_FIELDS`
- `packages/api-contracts/src/sync.ts` (full read, this session) — `SYNCED_TABLES`, `PUSH_APPLIED_TABLES`, `PUSH_DEFERRED_TABLES` and their additive-only header comments
- `packages/api-contracts/src/units.ts` (full read, this session) — the exact bigint-fraction weight-conversion boundary D-08 extends
- `apps/api/src/db/schema/records.ts` (full read, this session) — live `bodyMetric`/`progressPhoto` Postgres column definitions
- `apps/mobile/lib/db/schema.ts` (relevant sections read, this session) — live client `bodyMetric`/`progressPhoto`/`userPreference` column definitions, `drizzleSchema` object
- `apps/mobile/lib/db/powersync.ts` and `powersync.web.ts` (full read, this session) — confirms `DrizzleAppSchema` derives directly from `drizzleSchema`, no manual schema-version literal exists
- `apps/mobile/lib/export/export-training-data.ts` and `.web.ts` (full read, this session) — the native `expo-file-system` `File`/`Paths` pattern and the web `Blob`+`<a download>` bypass pattern
- `apps/mobile/lib/db/programs/order-index.ts` and `days.ts` (full read, this session) — reusable reorder primitives
- `docs/platform-modules.md` (full read, this session) — the `.web.tsx` convention and its native-capability web audit table
- `docs/program-vocabularies.md`, `docs/excluded-exercise-shape.md` (full read, this session) — the vocabulary/shape doc conventions to follow for `docs/body-metric-vocabularies.md`
- `.planning/phases/11-program-generation/11-02-PLAN.md` (full read, this session) — the complete worked example this research bases Pattern 1/4 on
- `ops/powersync/sync-rules.yaml` (full read, this session) — confirms `body_metric`/`progress_photo` pull queries already exist
- npm registry, queried directly 2026-08-30 — `expo-image-picker` 57.0.14, `expo-image-manipulator` 57.0.14, `react-native-view-shot` 5.1.1, `expo-sharing` 57.0.16 (installed range `~57.0.12`)
- Package Legitimacy Gate (`gsd_run query package-legitimacy check`), run this session — verdicts for all three new packages

### Secondary (MEDIUM confidence)
- `docs.expo.dev/versions/latest/sdk/filesystem` and `expo.dev/blog/expo-file-system` [CITED] — web platform limitations of the `File`/`Directory`/`Paths` API
- `docs.expo.dev/versions/latest/sdk/imagemanipulator` [CITED] — current `useImageManipulator`/context-object API shape
- `docs.expo.dev/versions/latest/sdk/imagepicker` [CITED] — config-plugin permission strings, `requestMediaLibraryPermissionsAsync` pattern
- `docs.expo.dev/versions/latest/sdk/sharing` [CITED] — web cannot share local files by URI; Web Share API HTTPS requirement
- `github.com/gre/react-native-view-shot` README/PR #226 [CITED] — `captureRef` API shape, web support via html2canvas (not used here — canvas chosen instead)

### Tertiary (LOW confidence)
- WebSearch summaries (not independently verified against primary source) on `expo-image-picker`'s web support internals, `react-native-view-shot`'s New Architecture compatibility claim, and IndexedDB quota percentages — all flagged in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified directly against the npm registry this session; the only MEDIUM-confidence item (react-native-view-shot's New Architecture support) is flagged as an assumption with a recommended verification step.
- Architecture: HIGH — every pattern is either an exact copy of code read directly from this repository this session (Patterns 1, 4, 5, 6) or built on a browser API with no library-specific uncertainty (Patterns 2, 3's web halves).
- Pitfalls: HIGH — all five are grounded in either a direct code read (Pitfall 3, 4, 5) or Expo's own documentation plus this repo's own existing platform-split precedent (Pitfall 1, 2).

**Research date:** 2026-08-30
**Valid until:** 2026-09-27 (30 days — this phase's dependencies are stable/mature libraries and this repo's own established patterns, not a fast-moving ecosystem corner)
