---
phase: 12
slug: body-metrics-dashboard
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-30
mode: unattended — generated during `/gsd-ui-phase --auto` with no user questions asked
---

# Phase 12 — UI Design Contract

> Visual and interaction contract for every user-facing surface this phase ships: the restructured
> Home dashboard and its widget picker (DASH-01/02), the quick-action sheet (DASH-03), body metric
> logging and trends (BODY-01/02/03), and progress photos plus the before/after composite
> (BODY-04/05). This is a large, screen-heavy phase — twelve new or changed surfaces across four
> requirement clusters — and this document is deliberately the most exhaustive one yet, matching
> `09-UI-SPEC.md`'s and `10-UI-SPEC.md`'s depth rather than a lighter treatment.
>
> **Unattended run.** The user directed that nothing be asked. Every question this document would
> normally put to a human was resolved here and marked **[CLAUDE'S CALL]** with a one-line rationale
> and its reversibility. Nothing below contradicts `12-CONTEXT.md`'s D-01…D-29 or `12-RESEARCH.md`'s
> patterns; this document resolves exactly the *visual and interaction* gaps those two leave open.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — shadcn is not applicable, unchanged from every prior phase (React Native + React Native Web; `components.json` correctly does not exist). |
| Component library | Hand-rolled RN components under `apps/mobile/components/`, extending the shipped set. This phase adds the components listed in **Screen & Component Inventory** below. Every one styles itself against the same NativeWind token set in `apps/mobile/tailwind.config.js`; none introduces a second visual language. |
| Icon library | `@expo/vector-icons` (`Ionicons`), unchanged. Icon colour is always resolved via `useThemeColors()`/the local `GLYPH_COLORS` idiom and passed as the `color` prop, never a NativeWind class on the icon (Phase 1 D-06, still binding). |
| Font | System default, unchanged. |
| Charting | **`react-native-svg` only**, unchanged from Phases 9/10 — the bodyweight/measurement trend chart is `TrendChart` reused verbatim (D-11); no second charting or drawing library is introduced. |
| Photo handling | `expo-image-picker` + `expo-image-manipulator` (native) / `<input type="file">` + `<canvas>` (web) for capture and downscale; `react-native-view-shot` (native) / `<canvas>` (web) for the composite. All per `12-RESEARCH.md` Patterns 2–3 — this document specifies only what these produce on screen, not the capture pipeline itself. |

**Design decisions this document resolves that CONTEXT.md and RESEARCH.md left open:**

1. **[CLAUDE'S CALL] The dashboard is a single vertical column of widget cards, `gap-lg`, no grid.** DASH-02 asks for add/remove/reorder only, never resizing or a multi-column layout (CONTEXT § Deferred Ideas). A single column is also the only layout `DragHandle`'s existing vertical-reorder arithmetic (`computeDropTarget`) already solves — a grid would need new drop-target math this phase does not need. *Reversibility: reversible — a layout change only.*
2. **[CLAUDE'S CALL] Each widget owns its own loading/error/empty state internally; the screen-level `HomeScreenState` machine (`loading`/`error`/`no-program`/`ready`) is retired for the dashboard body and survives only for the pinned, non-widget chrome.** Today's `index.tsx` gates the *entire* card column behind one state derived from the Next Up data load. Once Next Up is one of six independently-positioned widgets, a slow or failed Weekly Progress read must not blank the whole screen, and a missing Next Up widget (removed by the user) must not resurrect screen-level "no program" messaging for a widget nobody asked to see. Each widget component keeps exactly the state-handling its Phase 9/10 version already ships (`WeeklyProgressCard`/`HistoryTrendCard`: absent on error/empty; `MuscleHeatmap`: host-owned skeleton) — `next_up`'s existing three-state UI (loading skeleton row, error banner, "no active program" call-to-action) moves unchanged into `NextUpWidget`, which is the one widget still permitted an *informative* (not merely absent) empty state, because "you have no active program" is actionable guidance Phase 4 already earned a home for. *Reversibility: reversible — a state-ownership refactor, not a data change.*
3. **[CLAUDE'S CALL] `WorkoutInProgressBanner` and the trailing "Browse exercises" `PrimaryButton` stay pinned screen chrome, never widgets.** They are session-state safety and a fixed navigational escape hatch, not "insight tiles" (DASH-01's own word) — nothing in D-23's six-kind catalog names them, and making a mid-workout resume banner removable would be a genuine safety regression. *Reversibility: reversible — they could become widgets later, but nothing today asks for it.*
4. **[CLAUDE'S CALL] "Edit Dashboard" and "Quick Actions" are two text/icon links in a new Home header row**, `flex-row items-center justify-between px-lg pt-md`, matching the shipped History/Muscle-Map header-row convention exactly (10-UI-SPEC's "Navigation & Placement"). Leading: an accent icon+text control, **"Quick Actions"**, opening `QuickActionSheet` (D-27). Trailing: **"Edit"**, toggling to **"Done"** while `DashboardWidgetPicker` is open, opening/closing that sheet. Both carry `minHeight: 48`, `accessibilityRole="button"`. *Reversibility: reversible — a placement choice.*
5. **[CLAUDE'S CALL] `DashboardWidgetPicker` reuses `ReorderExercisesSheet`'s exact modal anatomy** (`Modal transparent animationType="fade"`, centered `bg-background/80` overlay, `max-w-[400px] rounded-md bg-surface p-lg` card, `DragHandle` per row) **with one addition: a second, non-draggable "Add a Widget" section beneath the reorderable list**, listing every `widget_kind` not currently enabled as a plain `Pressable` row with a leading `add-circle-outline` icon. Tapping an available row moves it into the enabled list immediately (appended, per `appendOrderIndex`); tapping a `remove-circle-outline` icon on an enabled row moves it back down into "Add a Widget". This is the same drag primitive Phase 4/5 already proved (D-25), extended with the one interaction (add/remove) `ReorderExercisesSheet` never needed because a program day's exercise list has no "not currently in the day" complement to browse. *Reversibility: reversible — a component composition choice over the same reorder primitive.*
6. **[CLAUDE'S CALL] "Quick Weigh-In" and "Quick Measurement" share one `MetricEntrySheet` component**; Quick Weigh-In pre-selects `kind: 'bodyweight'` and skips straight to the numeric field, while Quick Measurement first shows a `SegmentedChipRow` of the user's other tracked kinds (bodyweight excluded — it has its own dedicated action), then the same numeric field once a kind is chosen. One sheet, one field-entry mechanism, two entry points — not two sheets that could drift apart. *Reversibility: reversible.*
7. **[CLAUDE'S CALL] `MetricEntrySheet`'s numeric field reuses `NumericKeypad`'s digit-grid mechanism (`KEYPAD_KEYS`, `applyKeypadPress`, `trimTrailingZeros`) but not its plate-strip band.** `NumericKeypad`'s existing `field: 'weight' | 'reps' | 'rir'` union and its `PlateStripBandData` prop are purpose-built for in-workout logging against a gym profile's real equipment — a body measurement has no plate math and no rep/RIR concept. D-29's "reuses the existing `NumericKeypad`" is satisfied by reusing its proven digit-grid reducer and docked-keypad layout, not by force-fitting a plate strip nothing here needs. A single-value keypad, `MetricValueKeypad`, wraps the same reducer with no band row. *Reversibility: reversible — the shared reducer is the load-bearing reuse; the wrapper is new but thin.*
8. **[CLAUDE'S CALL] A measurement kind counts as "tracked" the moment it has at least one logged entry — no separate zero-entry tracked-kinds table.** D-07's prose ("a per-user tracked-kinds set") is a product framing, not an authorized new synced table — CONTEXT.md's D-21 authorizes exactly one new table this phase (`dashboard_widget`) and names no second one for tracked kinds. Collapsing "choose to track a kind" and "log its first value" into one action (tapping an untracked kind in `TrackKindSheet` opens `MetricEntrySheet` for it immediately) satisfies D-07's actual requirement — the user picks which kinds appear, never invents a new one — without a schema addition CONTEXT did not authorize. *Reversibility: reversible — a genuine zero-entry "tracked but not yet logged" state is additive later if wanted, but needs its own data-model decision first, out of this document's scope.*
9. **[CLAUDE'S CALL] Body metric trend windows default to `3m`, matching the Phase 9 Exercise Performance screen's own `3m` default** — one month of bodyweight is too short to show a trend, one year hides recent movement by default; three months is this app's already-established "give me the middle ground" choice (09-UI-SPEC S4). *Reversibility: reversible — a default-selection choice.*
10. **[CLAUDE'S CALL] The progress-photo gallery is a two-column square-thumbnail grid** (`FlashList` `numColumns={2}`), not the app's usual single-column row list. Photos are the one surface this app displays where the content itself is visual, not textual — a row list would waste the one advantage a photo has over a `SessionHistoryRow`. Each cell carries only a `local_date` caption; no other metadata competes with the image. *Reversibility: reversible — a layout choice.*
11. **[CLAUDE'S CALL] A device-absent photo (D-15) renders as an equal-sized grid tile with a placeholder glyph and the literal copy "On your other device" — never a broken-image icon, never a skeleton, never omitted from the grid.** Omitting it would make the timeline's date sequence lie by silently dropping a real, counted entry; a generic broken-image glyph would read as this app's bug rather than an honest cross-device fact. This is the concrete rendering of CONTEXT's "Specific Ideas" instruction that the placeholder must read as a deliberate product statement. *Reversibility: reversible — a state-rendering choice, not a data change.*
12. **[CLAUDE'S CALL] The composite builder is a dedicated screen (`/photo-composite`), not a modal**, because it is a three-step flow (choose Before, choose After, preview + share/download) too long for a centered `bg-surface` card, and because the rendered preview benefits from full screen width. Every step within it stays screen-level view state — nothing is persisted until Share/Download is tapped, and even then nothing is persisted; the composite itself is explicitly ephemeral (D-18). *Reversibility: reversible — a presentation choice.*
13. **[CLAUDE'S CALL] Editing or deleting a logged metric entry, and deleting a photo, both use the existing `HistoryActionSheet`+`DeleteWorkoutDialog` two-step idiom** (a `Modal`-presented row-action sheet, then a `Modal`-presented destructive confirm), renamed per-surface (`MetricEntryActionSheet`+`DeleteMetricEntryDialog`, `ProgressPhotoActionSheet`+`DeletePhotoDialog`) rather than a fourth bespoke confirmation pattern. D-10's "no separate correction concept" means edit and delete are the row's only two actions — mirroring `HISTORY_ROW_ACTIONS`'s shape with two rows instead of five. *Reversibility: reversible — a component-reuse choice.*
14. **[CLAUDE'S CALL] `RecentRecordsWidget` shows the three most recent PRs across all four metrics** (`RECENT_RECORDS_WIDGET_LIMIT = 3`), reusing `RecordRow` verbatim inside a new `gap-md rounded-md bg-surface p-md` card shell, plus a **"View all records"** link to `/records`. Three rows keeps the tile a glance, not a second Records screen — the full list is one tap away, exactly the "insight tile with an escape hatch" shape every other widget already has. *Reversibility: reversible — a row-count choice.*
15. **[CLAUDE'S CALL] `MuscleHeatmapWidget` renders the two figures at the fixed 1-week window with no window switch inside the card**, plus a **"View muscle map"** link to `/muscle-map` where the switch lives. A dashboard tile answering "did I train evenly this week" needs one number, not a control surface — the full screen is one tap away for anyone who wants to change the window. *Reversibility: reversible.*
16. **[CLAUDE'S CALL] `BodyweightTrendWidget` shows a 30-day window fixed** (`BODYWEIGHT_TREND_WIDGET_WINDOW_DAYS = 30`), independent of the full trend screen's selectable 1m/3m/1y/all — a dashboard glance answers "where am I lately," not "show me the year," and the full detail screen (linked via **"View trend"**) is where range selection belongs. If the user has never logged a `bodyweight` entry, this widget is **absent from render** (D-22's forward-compat skip logic extends naturally to "no data for this widget's one required kind" — an empty tile with no path forward is worse than one fewer tile). *Reversibility: reversible.*

---

## Spacing Scale

Declared values (already shipped, unchanged, multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon/text gaps, badge padding |
| sm | 8px | Compact spacing, grid gaps |
| md | 16px | Default element spacing, card padding |
| lg | 24px | Screen horizontal padding, section gaps |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

**Exceptions inherited, still binding:** 48×48px minimum hit target on every interactive element — every widget's link, every action-sheet row, every keypad key, every photo grid tile (a photo tile may be visually larger than 48×48, but never smaller), the drag handle, and both dialog buttons.

**New exceptions this phase introduces:**

| Constant | Value | Rationale |
|---|---|---|
| `PHOTO_GRID_COLUMNS` | `2` | Fixed column count for the progress-photo gallery grid — not derived from window width, so tile size scales with device width instead of column count changing. |
| `PHOTO_TILE_GAP` | `8` (= `sm`) | Gap between grid tiles, both axes. |
| `MIN_PHOTO_TILE_SIZE` | `120` | Floor for `resolvePhotoTileSize()`. Below this a thumbnail is too small to distinguish a before/after difference by eye. |
| `KEYPAD_SHEET_MAX_WIDTH` | `400` | Matches the shipped `ReorderExercisesSheet`/`HistoryActionSheet` modal card width — `MetricEntrySheet` and `QuickActionSheet` are the same card shape as every other action sheet in this app, never a bespoke width. |

```
resolvePhotoTileSize(windowWidth) = max(MIN_PHOTO_TILE_SIZE, (windowWidth − 2×lg − PHOTO_TILE_GAP) / PHOTO_GRID_COLUMNS)
                                  = max(120, (windowWidth − 56) / 2)
```

Mirrors `resolveChartWidth`/`resolveMuscleMapFigureWidth`'s exported, unit-testable, hook-free idiom exactly.

---

## Typography

Declared values (unchanged — this phase adds no fifth size and no third weight):

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Label | 14px | 400 | 20px (1.43) |
| Body | 16px | 400 — 600 accepted for headings-within-cards and CTA text | 24px (1.5) |
| Heading | 20px | 600 | 24px (1.2) |
| Display | 28px | 600 | 34px (1.21) |

**Phase-specific role mapping:**

- Screen titles ("Body Metrics", exercise-style kind names, "Progress Photos", "Records" link parity) → **Heading**.
- Widget card headings (all six widgets) → **Body, semibold** — matches `WeeklyProgressCard`/`HistoryTrendCard`'s shipped card-heading convention, never Heading (a card inside a scroll never competes with the screen it lives on).
- Bodyweight/measurement trend headline figure (latest value, on both the widget and the full trend screen) → **Display** — this phase's second use of the Display token, matching Phase 9's "one headline number per trend surface" precedent exactly.
- Body-metric overview row kind name → **Body, regular**; its value/date line → **Label, `text-foreground-muted`**.
- Metric entry list row (trend screen) value → **Body, regular**; its date line → **Label, `text-foreground-muted`**.
- Photo grid tile date caption → **Label, `text-foreground-muted`**, overlaid on the tile per **S-PP1**.
- Photo placeholder tile copy ("On your other device") → **Label, `text-foreground-muted`**.
- Quick-action sheet row labels → **Body, regular** (matches `SESSION_EXERCISE_ACTIONS`' row label size, not Label — these are six primary destinations, not a dense overflow menu).
- Keypad digits and the field's live value display → **Display** for the live value (mirrors the in-workout `NumericKeypad`'s own value-display size), **Body** for the digit grid keys themselves.
- Empty/error state headings → **Heading**; their body copy → **Body, regular, `text-foreground-muted`** (the exact shipped pattern, unchanged).

---

## Color

Declared values (unchanged — **no new hex is introduced this phase**):

| Role | Value (light) | Value (dark) | Usage |
|------|-------|-------|-------|
| Dominant (60%) | `#FFFFFF` | `#09090B` | Screen background |
| Secondary (30%) | `#F4F4F5` | `#18181B` | Widget cards, sheet surfaces, skeleton blocks, unselected photo tiles |
| Accent (10%) | `#2563EB` | `#3B82F6` | See extended reserved-for list below |
| Destructive | `#DC2626` | `#EF4444` | Delete-entry and delete-photo confirms only |
| Foreground | `#09090B` | `#FAFAFA` | Body/heading text, headline figures |
| Foreground (muted) | `#71717A` | `#A1A1AA` | Labels, captions, placeholder tile copy, disabled/absent-photo glyph |

**Accent reserved for** (extends the Phase 1 list, additive only). New this phase:

- **The "Quick Actions" header link's icon+text**, and the **"Edit"/"Done"** header toggle text.
- **The trend line stroke, area fill, and "now" marker** inside the bodyweight/measurement `TrendChart` — not new, the exact same rule Phase 9 already established, applied to a new data source.
- **The selected kind chip in Quick Measurement's kind picker and the selected window chip on the trend detail screen** — not new, inherited verbatim from `SegmentedChipRow`.
- **The composite screen's "Before"/"After" selection state** on a chosen photo tile (a 2px accent border), so the two chosen photos are visually distinguishable from the rest of the grid while picking.
- **Every widget's "View X" trailing link text** — not new, the shipped text-link rule.
- **The `add-circle-outline` icon on `DashboardWidgetPicker`'s "Add a Widget" rows.**

**Not accent, explicitly:**

- **A device-absent photo's placeholder glyph and copy** are `foregroundMuted`, never `accent` and never `destructive` — D-19's own framing ("a product statement, not an error") rules out both a warning colour and an achievement colour.
- **The "Remove" icon on an enabled widget row inside `DashboardWidgetPicker` is `foregroundMuted`, not `destructive`** — removing a widget is fully reversible in one tap from the same sheet (design decision 5), which is categorically different from `HISTORY_ROW_ACTIONS`' `delete` row.
- **Delete-entry and delete-photo confirms are `destructive`** — the one genuinely irreversible action class this phase ships (D-10's "ordinary tombstoned delete").

**The `ThemeColors` interface needs no new field.** It ships exactly `{ accent, foregroundMuted, surface }`, unchanged from Phases 9/10. Components in this phase that need `foreground`/`destructive` (the dialogs, the action sheets) resolve them the same locally-scoped way `SessionActionSheet.tsx`'s `GLYPH_COLORS` already does — do not widen `lib/theme-colors.ts` for this.

---

## Phase-Wide Rules

Extends R1–R25 (all still binding). This phase adds:

- **R26 — An unrecognised `widget_kind` is filtered out of the render list before mapping, never thrown and never rendered as an error tile (D-22).** The dashboard's dispatch function returns `KnownWidget[]`, already excluding anything outside `WIDGET_KINDS`; no `switch`'s `default` branch may throw.
- **R27 — A photo whose bytes are absent on this device renders the `ProgressPhotoPlaceholder` tile everywhere a photo could otherwise render — gallery grid, composite picker, any future photo-bearing surface — and is never treated as a broken image, a loading state, or an error (D-15/D-19).**
- **R28 — The composite builder may only select photos that pass locally on this device; a placeholder tile in the composite picker is non-interactive** (`accessibilityState={{ disabled: true }}`, no `onPress`) rather than selectable-then-failing (D-19).
- **R29 — Every widget is a self-contained unit that renders its own empty/loading/error state (design decision 2); the dashboard host never renders a screen-wide spinner, error banner, or empty state on behalf of a widget it did not itself fail to resolve.** The host's own failure mode is narrowly scoped to "the `dashboard_widget` row list itself failed to load," never to any individual widget's content.
- **R30 — A quick-action destination that is pure navigation (history, new program, one-off workout) dismisses `QuickActionSheet` before navigating, never navigates with the sheet still mounted underneath** — matches every existing action-sheet-then-navigate call site in this app (e.g. `HistoryActionSheet`'s `edit`/`view` rows).
- **R31 — `MetricEntrySheet`'s numeric field never blocks manual correction of the pre-filled last-value default** — the value is a starting point, always fully editable via the keypad, exactly like `NumericKeypad`'s existing previous-value-autofill precedent (LOG-04) extended to this new surface.
- **R32 — Every window length, tile-size floor, and row-count limit this phase introduces is a named exported constant** (extends R21/R24) — no numeral for a window, a grid size, or a widget-list limit appears at a call site.

---

## Navigation & Placement

No tab is added, removed or reordered. The five-tab shell is untouched. The dashboard **is** the existing Home tab (D-20).

| # | Surface | Requirement | Lives at | Reached from |
|---|---------|-------------|----------|---------------|
| S1 | **Home tab (dashboard)** | DASH-01 | `apps/mobile/app/(tabs)/index.tsx`, restructured | Home tab — the tab bar |
| S2 | **Dashboard widget picker** | DASH-02 | `components/DashboardWidgetPicker.tsx`, presented via `Modal` over S1 | "Edit" link in S1's header row |
| S3 | **Quick-action sheet** | DASH-03 | `components/QuickActionSheet.tsx`, presented via `Modal` over S1 | "Quick Actions" link in S1's header row |
| S4 | **Quick weigh-in / measurement sheet** | DASH-03, D-29 | `components/MetricEntrySheet.tsx`, presented via `Modal` | Quick Actions → "Quick Weigh-In" / "Quick Measurement"; also every "+" add-entry affordance on S5/S6 |
| S5 | **Body Metrics overview** | BODY-01, BODY-02 | new route `apps/mobile/app/body-metrics.tsx` | Quick Actions → "History" group is unrelated; reached instead from S1's `bodyweight_trend`/no-widget path, and from **Profile** tab's existing settings list gaining one new row, **"Body Metrics"** |
| S6 | **Body metric trend detail** | BODY-03 | new route `apps/mobile/app/body-metric-trend.tsx?kind={kind}` | tapping any row on S5; "View trend" link on the `bodyweight_trend` widget (S1) |
| S7 | **Track a measurement kind** | BODY-02, D-07 (design decision 8) | `components/TrackKindSheet.tsx`, presented via `Modal` | "Track a measurement" row at the foot of S5 |
| S8 | **Progress photos gallery** | BODY-04 | new route `apps/mobile/app/progress-photos.tsx` | Quick Actions → "Progress Photo" opens capture directly (S9), not this screen; this screen is reached from **Profile**'s new **"Progress Photos"** row, matching S5's placement |
| S9 | **Photo capture confirm sheet** | BODY-04, D-16, D-17 | `components/PhotoCaptureConfirmSheet.tsx`, presented via `Modal` | Quick Actions → "Progress Photo"; and a **"Add Photo"** header link on S8 |
| S10 | **Before & after composite** | BODY-05 | new route `apps/mobile/app/photo-composite.tsx` | a **"Create Before & After"** button on S8, visible only when ≥2 on-device photos exist |

**Route shape.** Flat files taking a query param where needed, matching the shipped `app/records.tsx` / `app/exercise-performance.tsx` convention exactly — never a nested dynamic folder:

- `/body-metrics`
- `/body-metric-trend?kind={kind}`
- `/progress-photos`
- `/photo-composite`

**Home header row (new).** Inserted above today's `mt-xl gap-lg` column, at `px-lg pt-md`:

```
<View className="flex-row items-center justify-between px-lg pt-md">
  <Pressable ... accessibilityLabel="Quick Actions" style={{ minHeight: 48 }} className="flex-row items-center gap-xs">
    <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
    <Text className="text-body font-normal text-accent">Quick Actions</Text>
  </Pressable>
  <Pressable ... accessibilityLabel={editing ? 'Done editing dashboard' : 'Edit Dashboard'} style={{ minHeight: 48, minWidth: 48 }} className="items-center justify-center">
    <Text className="text-body font-normal text-accent">{editing ? 'Done' : 'Edit'}</Text>
  </Pressable>
</View>
```

Both controls keep working in every `HomeScreenState` — even mid-error or mid-loading, quick actions and dashboard editing must stay reachable, because neither depends on the Next Up data load design decision 2 retires.

**Profile tab additions.** Two new rows are appended to the Profile tab's existing settings list (file/anatomy not otherwise touched by this phase): **"Body Metrics"** → `/body-metrics`, **"Progress Photos"** → `/progress-photos`. Placed after the existing Gym Profiles row, before Appearance — grouped with other "manage your data" entries rather than app-configuration entries.

---

## Screen & Component Inventory

| Surface | File | Requirement / decision refs | New or changed |
|---------|------|------------------------------|----------------|
| Home tab (host) | `apps/mobile/app/(tabs)/index.tsx` | DASH-01, D-20, decisions 2–4 | changed — header row, widget-list body, pinned chrome unchanged |
| Widget dispatcher | `apps/mobile/components/DashboardWidgetHost.tsx` | DASH-01, D-22, D-23, R26, R29 | new |
| Next Up widget | `apps/mobile/components/NextUpWidget.tsx` | D-23, decision 2 | new — wraps existing `NextUpCard` + its three-state logic, unchanged pixels |
| Weekly Progress widget | `apps/mobile/components/WeeklyProgressCard.tsx` | D-23 | reused verbatim, no changes |
| Recent Records widget | `apps/mobile/components/RecentRecordsWidget.tsx` | D-23, decision 14 | new |
| Muscle Heatmap widget | `apps/mobile/components/MuscleHeatmapWidget.tsx` | D-23, decision 15 | new — wraps existing `MuscleHeatmap` |
| Bodyweight Trend widget | `apps/mobile/components/BodyweightTrendWidget.tsx` | D-23, decision 16 | new — wraps `TrendChart` |
| History Trend widget | `apps/mobile/components/HistoryTrendCard.tsx` | D-23 | reused verbatim, no changes |
| Dashboard widget picker | `apps/mobile/components/DashboardWidgetPicker.tsx` | DASH-02, D-24, D-25, D-26, decision 5 | new |
| Quick-action sheet | `apps/mobile/components/QuickActionSheet.tsx` | DASH-03, D-27, D-28, decision 4 | new |
| Metric entry sheet | `apps/mobile/components/MetricEntrySheet.tsx` | BODY-01, BODY-02, D-29, decisions 6–7 | new |
| Metric value keypad | `apps/mobile/components/MetricValueKeypad.tsx` | decision 7 | new |
| Track-a-kind sheet | `apps/mobile/components/TrackKindSheet.tsx` | BODY-02, D-07, decision 8 | new |
| Body Metrics overview | `apps/mobile/app/body-metrics.tsx` | BODY-01, BODY-02 | new route |
| Body metric row | `apps/mobile/components/BodyMetricRow.tsx` | BODY-01, BODY-02 | new |
| Body metric trend detail | `apps/mobile/app/body-metric-trend.tsx` | BODY-03, D-11, D-12, D-13, D-14 | new route |
| Metric entry row | `apps/mobile/components/MetricEntryRow.tsx` | BODY-01, BODY-02, D-09, D-10 | new |
| Metric entry action sheet | `apps/mobile/components/MetricEntryActionSheet.tsx` | D-10, decision 13 | new |
| Delete metric entry dialog | `apps/mobile/components/MetricEntryActionSheet.tsx` (co-located, `DeleteMetricEntryDialog`) | D-10, decision 13 | new |
| Progress photos gallery | `apps/mobile/app/progress-photos.tsx` | BODY-04 | new route |
| Photo grid tile | `apps/mobile/components/ProgressPhotoTile.tsx` | BODY-04, D-15 | new |
| Photo placeholder | `apps/mobile/components/ProgressPhotoPlaceholder.tsx` | D-15, D-19, R27 | new |
| Photo capture confirm sheet | `apps/mobile/components/PhotoCaptureConfirmSheet.tsx` | BODY-04, D-16, D-17 | new |
| Photo action sheet | `apps/mobile/components/ProgressPhotoActionSheet.tsx` | decision 13 | new |
| Delete photo dialog | `apps/mobile/components/ProgressPhotoActionSheet.tsx` (co-located, `DeletePhotoDialog`) | decision 13 | new |
| Before & after composite | `apps/mobile/app/photo-composite.tsx` | BODY-05, D-18, D-19, decision 12 | new route |
| Metric/window switch | `apps/mobile/components/SegmentedChipRow.tsx` | BODY-03, decision 9 | reused verbatim, fifth call site |
| Reorder/drag primitive | `apps/mobile/components/DragHandle.tsx` / `.web.tsx` | DASH-02, D-25 | reused verbatim |
| Profile tab (host) | `apps/mobile/app/(tabs)/profile.tsx` | S5/S8 entry points | changed — two new settings rows |

**Focal points** (Dimension 2 — naming a primary visual anchor per surface):

- **Home (S1):** the widget column itself is the anchor — the header row is deliberately subordinate chrome (Label-weight equivalent visual presence via icon+text links, not a headline), because the screen's whole proposition is "what do I care about," answered by the cards, not by the header.
- **Body Metrics overview (S5):** the row list is the anchor; there is no chart or figure competing for attention on this screen — trends live one tap away.
- **Trend detail (S6):** the Display-sized headline figure, exactly matching S4's (Phase 9) precedent.
- **Progress photos gallery (S8):** the grid itself — no headline figure, no chart; the photos are the content.
- **Composite (S10):** the rendered preview (two photos side by side) is the anchor once both are chosen; before that, the picker grid is.

---

## S1 — Home Tab (Dashboard) (DASH-01, D-20)

`app/(tabs)/index.tsx`, restructured. Shell unchanged: `ScrollView className="flex-1 bg-background"` with `contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 }}`.

### Anatomy (top to bottom)

1. **Header row** — Quick Actions (leading) / Edit-Done (trailing), per **Navigation & Placement** above. Always rendered, in every state.
2. **`WorkoutInProgressBanner`** — pinned chrome, unchanged (decision 3).
3. **Widget list** — `DashboardWidgetHost`, rendering each enabled `dashboard_widget` row (position order, unknown kinds filtered per R26) through the dispatch table below. `gap-lg` between widgets, matching the column's existing gap.
4. **`PrimaryButton` "Browse exercises"** — pinned chrome, unchanged (decision 3).

### Widget dispatch table (D-22, D-23)

| `widget_kind` | Component | Card shell | Empty/absent behavior |
|---|---|---|---|
| `next_up` | `NextUpWidget` | its own (unchanged from today's `NextUpCard`) | Renders loading skeleton / error banner / "no active program" CTA — the one widget with an informative empty state (decision 2). |
| `weekly_progress` | `WeeklyProgressCard` | its own, unchanged | Absent entirely on empty/error — Phase 9's shipped behavior, untouched. |
| `recent_records` | `RecentRecordsWidget` | new, `gap-md rounded-md bg-surface p-md` | Absent entirely when zero records exist for any metric. |
| `muscle_heatmap` | `MuscleHeatmapWidget` | new, same shell | Never absent — Phase 10's "untrained still renders both figures" rule (10-UI-SPEC design decision 7) applies unchanged; a brand-new user with zero history sees fully-untrained figures, which is itself informative. |
| `bodyweight_trend` | `BodyweightTrendWidget` | new, same shell | Absent entirely when the user has never logged a `bodyweight` entry (decision 16). |
| `history_trend` | `HistoryTrendCard` | its own, unchanged | Absent entirely on empty/error — Phase 9's shipped behavior, untouched. |

**Unrecognised `widget_kind`:** filtered out before the map (R26) — never reaches this table, never renders a row, never throws.

### States

| State | Rendering |
|---|---|
| **Loading — resolving which widgets to show** | R6-adjacent: the `dashboard_widget` row read (`loadOrMaterializeDashboardWidgets`) is local SQLite and near-instant; while unresolved, the widget-list area renders the shipped 3-row skeleton (`rounded-md bg-surface`, height 64, `SKELETON_ROW_COUNT = 3`) exactly as today's screen-level loading state does. Header row, banner, and CTA render immediately regardless (pure chrome, no data dependency). |
| **Error — the widget-list read itself failed** (not any individual widget) | Widget-list area renders Heading `"Dashboard couldn't load"` + Body/muted `"Restart the app to try again. Your programs and history are safe."` — the shipped screen-failure pattern, scoped now to just the list area rather than the whole screen (R29). |
| **Populated — first-run, zero rows materialized yet** | Never user-visible as a distinct state — `loadOrMaterializeDashboardWidgets` (D-26) always returns the `DEFAULT_WIDGET_KINDS` set (`next_up`, `weekly_progress`) synchronously on first read, reproducing today's Home exactly (CONTEXT § Specific Ideas). |
| **Empty — every widget removed deliberately** (D-24) | Widget-list area renders Heading `"No widgets on your dashboard"` + Body/muted `"Add a widget to see your progress at a glance."` + a `PrimaryButton`-style **"Add Widgets"** control opening `DashboardWidgetPicker` directly. Header row, banner, and trailing CTA are unaffected. |
| **Partial — some widgets have data, some are absent per their own rule** | The ordinary case. `gap-lg` naturally collapses around an absent widget — no placeholder gap is ever reserved for a widget that renders `null`. |
| **Populated — every enabled widget has data** | All six render in position order. |
| **Overflow** | The screen's own `ScrollView` handles vertical overflow; six widgets is the structural maximum (the catalog's own size), so no virtualization is needed. |
| **Long-text** | No `numberOfLines` anywhere in the header row or the "no widgets" empty state (R4). |

---

## S2 — Dashboard Widget Picker (DASH-02, D-24, D-25, D-26)

`components/DashboardWidgetPicker.tsx`, `<Modal transparent animationType="fade" onRequestClose={onCancel}>`, same overlay/card shell as `ReorderExercisesSheet` (`bg-background/80` overlay, `max-w-[400px] rounded-md bg-surface p-lg` card, `ScrollView`, `contentContainerStyle={{ flexGrow: 1 }}`).

### Anatomy

1. **Title** — Heading, **"Edit Dashboard"**.
2. **"Your Widgets" section** — Body/semibold subheading, then each enabled widget as a row: `DragHandle` (leading, label the widget's display name via `DragHandle`'s existing `exerciseName`-shaped prop — see integration note below), widget display name (Body, foreground), trailing `remove-circle-outline` icon (`foregroundMuted`, 20px, `minWidth/minHeight: 48`, `accessibilityLabel="Remove {widget name} from dashboard"`).
3. **"Add a Widget" section** — Body/semibold subheading, rendered **only when at least one kind is unenabled**; each row is a plain `Pressable` (`minHeight: 48`, `accessibilityRole="button"`), leading `add-circle-outline` icon (`accent`, 20px), widget display name, `accessibilityLabel="Add {widget name} to dashboard"`.
4. **"Done"** — `PrimaryButton`-style control at the foot, dismisses the sheet. There is no separate "Cancel" — every add/remove/reorder commits immediately per row-tap/drag (matching `ReorderExercisesSheet`'s own no-separate-save precedent), so "Done" is purely dismissal, never a discard point.

**Integration note (for the plan, not a runtime rule):** `DragHandle`'s current props are named for its original exercise-reorder call site (`exerciseName`, `exerciseId`). This surface passes a widget's display name and id into those same parameters — the component's accessibility label and gesture logic are already generic over "a labelled, orderable row," and renaming the props is a mechanical, optional cleanup left to the plan, not a behavior change this spec requires.

**Widget display names** (used here and in the copy contract): `Next Up`, `Weekly Progress`, `Recent Records`, `Muscle Heatmap`, `Bodyweight Trend`, `History Trend`.

### States

| State | Rendering |
|---|---|
| **Empty — "Your Widgets" has zero rows** (D-24, deliberate) | Section renders Label/muted **"No widgets added yet."** in place of the row list — never a blank gap. "Add a Widget" section (all six kinds) renders normally beneath it. |
| **Empty — "Add a Widget" has zero rows** (every kind already enabled) | Section header and list are **absent entirely** — nothing left to add, so nothing renders (mirrors `FilterChipRow`'s shipped "nothing to show" absence rule). |
| **Populated** | Both sections render as specified. |
| **Overflow** | The sheet's own `ScrollView` scrolls internally; six total rows across both sections is the structural maximum, so this is a soft ceiling never actually reached at max font scale without scrolling. |
| **Long-text** | Widget display names are short fixed constants; no truncation, no `numberOfLines` (R4). |

---

## S3 — Quick-Action Sheet (DASH-03, D-27, D-28)

`components/QuickActionSheet.tsx`, `<Modal transparent animationType="fade" onRequestClose={onCancel}>`, same `SessionActionSheet`-shaped overlay/card (`bg-background/80` overlay, `max-w-[400px] rounded-md bg-surface p-lg` card, title, then a `gap-xs` row list).

### Anatomy

Title: Heading, **"Quick Actions"**. Six rows, **in this fixed order** (D-27/D-28, never reordered, never conditionally hidden):

| # | Row label | Icon | Destination |
|---|---|---|---|
| 1 | Quick Weigh-In | `scale-outline` | `MetricEntrySheet`, `kind: 'bodyweight'` pre-selected (S4) |
| 2 | Quick Measurement | `resize-outline` | `MetricEntrySheet`, kind-picker step first (S4) |
| 3 | Progress Photo | `camera-outline` | native picker / web file input directly, then `PhotoCaptureConfirmSheet` (S9) |
| 4 | History | `time-outline` | `router.push('/(tabs)/history')` (R30: sheet dismisses first) |
| 5 | New Program | `add-circle-outline` | `router.push('/programs/generate')` (R30) |
| 6 | One-off Workout | `barbell-outline` | the existing empty-session start path (R30) |

Every row: `Pressable`, `minHeight: 48`, `flex-row items-center gap-sm`, icon (`foregroundMuted`, 20px — none of these six is destructive, so none uses the accent-vs-destructive split `SessionExerciseAction` needs), label (Body, regular, foreground), `accessibilityRole="button"`.

### States

This sheet has exactly one state — it opens from Home's always-available header link and every one of its six destinations is always reachable (no gym profile, no active program, and no logged history are all handled by the destination screens themselves, not by hiding a row here). **No empty, loading, or error state applies** — matching `SessionActionSheet`'s own "every row is always actionable" precedent (E10-style populated backstop).

---

## S4 — Metric Entry Sheet (BODY-01, BODY-02, D-29)

`components/MetricEntrySheet.tsx`, `<Modal transparent animationType="fade" onRequestClose={onCancel}>`, `max-w-[${KEYPAD_SHEET_MAX_WIDTH}px]` card — the docked-keypad shape, not the plain action-sheet shape, because it hosts `MetricValueKeypad` beneath the field.

### Anatomy

1. **Title** — Heading. `"Log {kindLabel}"`, e.g. `"Log Weight"` (bodyweight), `"Log Waist"`.
2. **Kind picker** (Quick Measurement entry point only, decision 6) — `SegmentedChipRow` over the user's tracked kinds excluding `bodyweight`, single-select, `accessibilityLabel="Measurement kind"`. Selecting a chip advances to step 3. Skipped entirely for the Quick Weigh-In entry point and for every entry point that already names its kind (S5/S6 row-level "+"/edit affordances).
3. **Live value display** — Display, foreground: the field's current string value (D-08's canonical-to-display conversion already applied), with the resolved unit label trailing in Label/muted (`"kg"`, `"cm"`, `"in"`, `"%"`). Pre-filled with the **last recorded value for this kind** (D-29) — fully editable (R31), never locked.
4. **`MetricValueKeypad`** — the shared digit-grid reducer (decision 7), no plate strip. `KEYPAD_KEYS` layout unchanged: `1 2 3 / 4 5 6 / 7 8 9 / . 0 backspace`.
5. **"Log"** button — `PrimaryButton`-style, commits the entry (writes `body_metric`, `local_date` via `captureCalendarDay`, D-04) and dismisses the sheet in one action (D-29's "committed in one confirm").
6. **"Cancel"** text link — dismisses without writing.

### States

| State | Rendering |
|---|---|
| **Empty — no prior entry for this kind** | The live value display starts at a genuine blank (not `0`) — an empty field is a real absence, not a fabricated starting number (extends D-13's "no fabricated zeros" to entry defaults). The "Log" button stays disabled (`accessibilityState={{ disabled: true }}`, `opacity-60`) until at least one digit is entered. |
| **Populated — a prior entry exists** | Pre-filled with the last value (D-29), "Log" enabled immediately. |
| **Loading** | Not applicable — the last-value lookup is local SQLite and resolves before the sheet ever presents (R6 precedent: bounded local reads resolve before presenting, matching `MuscleDrilldownSheet`'s own rule). |
| **Error** | If the write itself fails, the sheet stays open, the "Log" button re-enables, and an inline Label/muted line appears beneath the button: **"Couldn't save. Try again."** — never a silent failure, never a dismissed sheet with a lost value. |

---

## S5 — Body Metrics Overview (BODY-01, BODY-02)

New route `app/body-metrics.tsx`. Screen shell `flex-1 bg-background`, `NavBackButton` in the header, screen title **"Body Metrics"** (Heading) at `px-lg pt-md`.

### Anatomy

1. **Screen title.**
2. **Row list** — `BodyMetricRow` per tracked kind (decision 8: has ≥1 entry), in a fixed `BODY_METRIC_KIND_ORDER` (bodyweight first, then the remaining fourteen kinds in the same head-to-toe-then-percentage order `docs/body-metric-vocabularies.md` documents).
3. **"Track a measurement"** row at the foot — `Pressable`, `minHeight: 48`, leading `add-circle-outline` (accent), label (Body, accent) **"Track a measurement"** — opens `TrackKindSheet` (S7).

### `BodyMetricRow` anatomy

```
┌─────────────────────────────────────────────┐
│  Weight                             +    ›  │   Body / foreground, wraps (R4)
│  82.4 kg · 12 Aug                           │   Label / foreground-muted
└─────────────────────────────────────────────┘
```

- Container `flex-row items-center gap-sm rounded-md bg-surface px-md py-sm`.
- Main body `Pressable`, `flex-1`, `minHeight: 48`, pushes to `/body-metric-trend?kind={kind}` (S6). `accessibilityLabel="{kindLabel}, {valueLabel}, {dateLabel}"`.
- Trailing `add-circle-outline` icon (`accent`, 20px, own `minWidth/minHeight: 48` press target, `accessibilityLabel="Log {kindLabel}"`) opens `MetricEntrySheet` pre-selected to this kind — a second, independent hit region from the row body, matching the shipped pattern of a trailing icon owning its own target when it is not purely decorative (distinct from `RecordRow`'s purely-decorative chevron).
- Trailing `chevron-forward` (`foregroundMuted`, 20px), decorative, inside the row body's own press target.
- No `numberOfLines` on either line (R4).

### States

| State | Rendering |
|---|---|
| **Empty — no kind tracked yet** | Row list area renders Heading `"No measurements yet"` + Body/muted `"Track your weight or a measurement to see it here."` The "Track a measurement" row still renders beneath — the path forward is never hidden. |
| **Loading** | R6 — the shipped 3-row skeleton, no spinner. |
| **Error** | Shipped pattern: Heading `"Body Metrics couldn't load"` + Body/muted `"Restart the app to try again. Your programs and history are safe."` |
| **Populated** | Row list per kind, "Track a measurement" row beneath. |
| **Zero/one/many** | One tracked kind renders a single row; up to fifteen scroll in an ordinary `View`/`ScrollView` (not `FlashList` — fifteen rows is well under virtualization's useful threshold, matching `MuscleDrilldownSheet`'s own reasoning). |
| **Long-text** | Kind labels are short fixed constants from the vocabulary; value/date lines wrap (R4). |

---

## S6 — Body Metric Trend Detail (BODY-03, D-11, D-12, D-13, D-14)

New route `app/body-metric-trend.tsx?kind={kind}`. Screen shell `flex-1 bg-background`, `ScrollView` `contentContainerStyle={{ gap: 24, padding: 24 }}` — the shipped `WorkoutSummaryView`/S4-Performance container. `NavBackButton` in the header.

### Anatomy

1. **Kind name** — Heading, e.g. `"Weight"`, `"Waist"`.
2. **Window switch** — `SegmentedChipRow` over `BODY_METRIC_TREND_WINDOWS` (`1m`/`3m`/`1y`/`all`, labels **"1 Month"** / **"3 Months"** / **"1 Year"** / **"All Time"**). Default `3m` (decision 9). View state only, never persisted.
3. **Headline figure** — Display, `text-foreground`: the latest entry's `valueLabel`. Beneath it, Label/muted: `"Latest · {dateLabel}"`.
4. **`TrendChart`** with the resolved, latest-per-`local_date`-deduped points (D-09), on-device only (D-12), no fabricated zeros (D-13).
5. **"+ Log {kindLabel}"** — accent text link beneath the chart, opens `MetricEntrySheet` pre-selected to this kind.
6. **Entries list** — `MetricEntryRow` per entry inside the selected window, most recent first (this is a genuinely different list from the chart's deduped series — every entry is listed here, including a same-day second entry D-09 keeps but the chart doesn't plot).

### `MetricEntryRow` anatomy

```
┌─────────────────────────────────────────────┐
│  82.4 kg                                    │   Body / foreground
│  12 Aug · 7:45 AM                           │   Label / foreground-muted
└─────────────────────────────────────────────┘
```

- `Pressable`, `flex-1`, `minHeight: 48`, opens `MetricEntryActionSheet` for this entry (Edit/Delete).
- `accessibilityLabel="{valueLabel}, logged {dateLabel} at {timeLabel}"`.

### States

| State | Rendering |
|---|---|
| **Empty — this kind has zero entries** | Unreachable in practice (S5 only links to tracked kinds), but if reached directly (e.g. a stale link after every entry of a kind was deleted), renders Heading `"No {kindLabel} logged yet"` + Body/muted `"Log {kindLabel} and your trend starts here."` Window switch is **hidden** — nothing to switch between (mirrors 09-UI-SPEC S4's identical rule). |
| **Empty — entries exist but none in the selected window** | Window switch **stays visible**. Chart area: Heading `"Nothing logged in the last {window}"` + Body/muted `"Try a longer range."` (verbatim, matching 09-UI-SPEC/10-UI-SPEC's shared copy). |
| **Loading** | R6 — a `rounded-md bg-surface` block at `TREND_CHART_HEIGHT` in the chart's slot. |
| **Error** | Shipped pattern: Heading `"Trend couldn't load"` + Body/muted `"Restart the app to try again. Your programs and history are safe."` |
| **Partial — one entry in window** | Single-point rendering per R17 (labelled dot, no line); entries list shows the one row. |
| **Populated** | Headline, chart, entries list. |
| **Overflow — entries list** | Internal `ScrollView`, bounded by the screen's own scroll — no virtualization needed at realistic entry counts (D-09 allows multiple/day, but even daily logging over a year is ~365 rows, well under this app's established `FlashList`-threshold judgment calls elsewhere; if this proves wrong in practice, swapping to `FlashList` is a mechanical follow-up, not a design change). |
| **Long-text** | Value/date lines wrap (R4). |

---

## S7 — Track a Measurement Kind (BODY-02, decision 8)

`components/TrackKindSheet.tsx`, `<Modal transparent animationType="fade" onRequestClose={onCancel}>`, same shell as `HistoryActionSheet`.

### Anatomy

Title: Heading, **"Track a Measurement"**. Row list of every `BODY_METRIC_KINDS` entry **not** already tracked (S5's tracked set), each a `Pressable` (`minHeight: 48`, label = kind's display name, Body/regular). Tapping a row dismisses this sheet and immediately opens `MetricEntrySheet` pre-selected to that kind (decision 8 — choosing to track and logging the first value are one action).

### States

| State | Rendering |
|---|---|
| **Empty — every kind already tracked** | Heading `"You're tracking everything"` + Body/muted `"Every measurement is already on your list."` No row list. |
| **Populated** | Row list per untracked kind. |
| **Overflow** | Internal `ScrollView`; fifteen kinds max, well within one screen at any font scale via scroll. |
| **Long-text** | Kind display names are short fixed constants; no truncation. |

---

## S8 — Progress Photos Gallery (BODY-04)

New route `app/progress-photos.tsx`. Screen shell `flex-1 bg-background`, `NavBackButton` in the header, screen title **"Progress Photos"** (Heading), header row gains a trailing **"Add Photo"** accent text link (opens capture directly → S9) and, when ≥2 device-resident photos exist, a **"Create Before & After"** `PrimaryButton`-style control beneath the header row (→ S10).

### Anatomy

`FlashList` grid, `numColumns={PHOTO_GRID_COLUMNS}` (2), `contentContainerStyle={{ padding: 24, gap: 8 }}` (`PHOTO_TILE_GAP`), most recent first. Each cell is `ProgressPhotoTile` or, when bytes are absent, `ProgressPhotoPlaceholder` (R27) — both sized identically via `resolvePhotoTileSize`.

### `ProgressPhotoTile` anatomy

Square `Pressable`, `resolvePhotoTileSize(windowWidth)` × same, `rounded-md overflow-hidden bg-surface`, the photo as a full-bleed `Image`, a bottom-edge gradient-free solid `bg-background/70` caption strip holding the `local_date` in Label/muted. Tapping opens `ProgressPhotoActionSheet` (view-size / edit note / delete). `accessibilityLabel="Progress photo, {dateLabel}"`.

### `ProgressPhotoPlaceholder` anatomy (R27, design decision 11)

Same square footprint, `rounded-md bg-surface items-center justify-center gap-xs p-sm`, a `cloud-offline-outline` Ionicons glyph (`foregroundMuted`, 24px), Label/muted text **"On your other device"**, and the same `local_date` caption strip as a real tile (the date is metadata that *did* sync — only the bytes did not). Non-interactive as a composite input (R28) but **is** tappable in the gallery itself, opening a small info sheet: Heading `"Not on this device"` + Body/muted `"This photo was taken on another device. Its bytes haven't synced here."` + **"Close"**.

### States

| State | Rendering |
|---|---|
| **Empty — zero photos ever taken** | Grid area renders Heading `"No progress photos yet"` + Body/muted `"Add your first photo to start tracking."` Header's "Add Photo" link and (absent, since <2 exist) no "Create Before & After" button. |
| **Loading** | R6 — a `PHOTO_GRID_COLUMNS`-wide grid of `bg-surface` skeleton tiles at the resolved tile size, `SKELETON_ROW_COUNT` rows' worth. |
| **Error** | Shipped pattern: Heading `"Progress Photos couldn't load"` + Body/muted `"Restart the app to try again. Your programs and history are safe."` |
| **Partial — some tiles device-absent, some present** | The ordinary mixed case (design decision 11) — placeholders and real tiles interleave by date, never grouped or reordered separately. |
| **Populated** | Full grid, "Create Before & After" visible per its ≥2-on-device gate. |
| **Overflow** | `FlashList` virtualization, standard. |
| **Zero/one/many composite-eligible photos** | 0 or 1 on-device photos → "Create Before & After" absent (not disabled — an absent control that cannot function is more honest than a disabled one requiring a tooltip to explain why, matching this app's established "absent over disabled" bias for structurally-impossible actions). ≥2 → present. |
| **Long-text** | Date captions are short, fixed-format strings; no truncation risk in practice, but no `numberOfLines` is set regardless (R4). |

---

## S9 — Photo Capture Confirm Sheet (BODY-04, D-16, D-17)

`components/PhotoCaptureConfirmSheet.tsx`, `<Modal transparent animationType="fade" onRequestClose={onDiscard}>`, `max-w-[400px] rounded-md bg-surface p-lg` card. Presented immediately after the platform capture step (`capture.ts`/`.web.ts`) returns a URI/Blob and the D-17 downscale/re-encode step has run — this sheet never shows the raw, unbounded original.

### Anatomy

1. **Title** — Heading, **"Add Progress Photo"**.
2. **Photo preview** — the downscaled JPEG, `aspect-square rounded-md`, full card width.
3. **Note field** — `TextField`, optional, placeholder **"Add a note (optional)"**.
4. **"Save"** — `PrimaryButton`-style, writes the `progress_photo` metadata row (D-04's `captureCalendarDay`) plus the on-device byte write (native `expo-file-system` / web IndexedDB per D-15), dismisses.
5. **"Discard"** — text link, discards the captured bytes entirely, dismisses without writing anything.

### States

| State | Rendering |
|---|---|
| **Populated** | The only steady state — this sheet is never presented before a photo exists (capture happens first, synchronously in the calling flow). |
| **Error — capture itself failed or was cancelled** | The sheet never opens; the calling flow (Quick Actions or S8's "Add Photo") simply returns to where it was, no error surface needed for a user-cancelled system picker. |
| **Error — the save write fails** | Sheet stays open, "Save" re-enables, inline Label/muted line: **"Couldn't save. Try again."** — same pattern as S4. |
| **Long-text** | The note field wraps normally (multiline `TextField`, unchanged shipped behavior); no character limit is imposed by this spec. |

---

## S10 — Before & After Composite (BODY-05, D-18, D-19)

New route `app/photo-composite.tsx`. Screen shell `flex-1 bg-background`, `NavBackButton`, screen title **"Before & After"** (Heading). Only reachable when ≥2 on-device photos exist (S8's gate).

### Anatomy (three-step, all one screen, no sub-navigation)

1. **Step indicator** — Label/muted, `"Step 1 of 2: Choose Before"` / `"Step 2 of 2: Choose After"` / (once both chosen) `"Preview"`.
2. **Photo grid** (steps 1–2) — same `ProgressPhotoTile`/`ProgressPhotoPlaceholder` grid as S8, but every placeholder tile is non-interactive here (R28) and every real tile is selectable; the already-chosen "Before" photo (during step 2) renders with a 2px accent border and is excluded from the selectable set for "After" (a photo cannot be both).
3. **Preview** (once both chosen) — a `flex-row gap-sm` pair of the two photos, each `flex-1 aspect-square rounded-md`, each with its `local_date` as a caption beneath (Label/muted) — the client-rendered composite layout itself (D-18: side-by-side with date labels).
4. **"Share"** (native) / **"Download"** (web) — `PrimaryButton`-style, platform-split per `composite.ts`/`.web.ts` (`12-RESEARCH.md` Pattern 3): native hands the rendered snapshot to `expo-sharing`; web triggers the `Blob`+`<a download>` idiom (`export-training-data.web.ts`'s established pattern) — never `expo-sharing` on web (Pitfall 2).
5. **"Start Over"** — text link, resets to step 1. Nothing is ever persisted by this screen; leaving it at any step discards all in-progress selection (the composite is explicitly ephemeral, D-18).

### States

| State | Rendering |
|---|---|
| **Populated — steps 1/2** | Grid as specified. |
| **Populated — preview** | Two-photo layout as specified. |
| **Empty — this screen reached with <2 on-device photos** (a stale deep link, since S8 gates the entry) | Heading `"Not enough photos on this device"` + Body/muted `"You need at least two progress photos on this device to build a before & after."` — no grid, no share control. |
| **Error — share/download itself fails** | Inline Label/muted line beneath the button: **"Couldn't share. Try again."** — the two chosen photos and the preview stay intact; only the share action is retried, not the whole flow. |
| **Overflow** | Grid inherits S8's `FlashList` virtualization. |
| **Long-text** | Step-indicator and date captions are short fixed strings. |

---

## Confirmations

| Action | Confirmation | Notes |
|---|---|---|
| Remove a widget from the dashboard | **None** | Fully reversible in one tap from the same `DashboardWidgetPicker` sheet (design decision 5) — not a destructive action. |
| Discard a metric entry sheet / photo capture without saving | **None** | Nothing was written yet; "Cancel"/"Discard" simply closes. |
| Delete a logged metric entry | **Confirm** — `DeleteMetricEntryDialog`: Heading **"Delete Entry"**, body **"This entry will be deleted. This can't be undone. Delete anyway?"**, buttons Cancel / **Delete** (`bg-destructive`) — the `DeleteWorkoutDialog` shape verbatim, new copy. |
| Delete a progress photo | **Confirm** — `DeletePhotoDialog`: Heading **"Delete Photo"**, body **"This photo and its bytes on this device will be deleted. This can't be undone. Delete anyway?"**, buttons Cancel / **Delete** (`bg-destructive`) — same shape. |
| Edit a logged metric entry | **None** | Opens `MetricEntrySheet` pre-filled with the entry's own value (not the kind's latest, since this *is* the entry being edited); saving overwrites in place, no confirm (D-10: an ordinary row edit). |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Home header links | **"Quick Actions"** · **"Edit"** / **"Done"** |
| Dashboard empty state | Heading **"No widgets on your dashboard"** / body **"Add a widget to see your progress at a glance."** / button **"Add Widgets"** |
| Dashboard error | Heading **"Dashboard couldn't load"** / body "Restart the app to try again. Your programs and history are safe." |
| Widget picker title | **"Edit Dashboard"** |
| Widget picker sections | **"Your Widgets"** · **"Add a Widget"** |
| Widget picker empty (no enabled widgets) | **"No widgets added yet."** |
| Widget display names | **Next Up** · **Weekly Progress** · **Recent Records** · **Muscle Heatmap** · **Bodyweight Trend** · **History Trend** |
| Quick-action sheet title / rows | **"Quick Actions"** — **Quick Weigh-In** · **Quick Measurement** · **Progress Photo** · **History** · **New Program** · **One-off Workout** |
| Metric entry sheet title | **"Log {kindLabel}"** |
| Metric entry save error | **"Couldn't save. Try again."** |
| Body Metrics screen title | **"Body Metrics"** |
| Body Metrics empty | Heading **"No measurements yet"** / body **"Track your weight or a measurement to see it here."** |
| Body Metrics error | Heading **"Body Metrics couldn't load"** / body "Restart the app to try again. Your programs and history are safe." |
| "Track a measurement" row / sheet title | **"Track a measurement"** / **"Track a Measurement"** |
| Track-kind sheet, all tracked | Heading **"You're tracking everything"** / body **"Every measurement is already on your list."** |
| Trend detail window labels | **"1 Month"** · **"3 Months"** · **"1 Year"** · **"All Time"** |
| Trend detail, no entries at all | Heading **"No {kindLabel} logged yet"** / body **"Log {kindLabel} and your trend starts here."** |
| Trend detail, nothing in window | Heading **"Nothing logged in the last {window}"** / body "Try a longer range." |
| Trend detail error | Heading **"Trend couldn't load"** / body "Restart the app to try again. Your programs and history are safe." |
| Trend detail add-entry link | **"+ Log {kindLabel}"** |
| Progress Photos screen title | **"Progress Photos"** |
| Progress Photos header links | **"Add Photo"** · **"Create Before & After"** |
| Progress Photos empty | Heading **"No progress photos yet"** / body **"Add your first photo to start tracking."** |
| Progress Photos error | Heading **"Progress Photos couldn't load"** / body "Restart the app to try again. Your programs and history are safe." |
| Device-absent photo tile | **"On your other device"** (verbatim, per CONTEXT § Specific Ideas) |
| Device-absent photo info sheet | Heading **"Not on this device"** / body **"This photo was taken on another device. Its bytes haven't synced here."** / **"Close"** |
| Photo capture sheet title | **"Add Progress Photo"** |
| Photo capture note field placeholder | **"Add a note (optional)"** |
| Photo capture actions | **"Save"** · **"Discard"** |
| Photo capture save error | **"Couldn't save. Try again."** |
| Composite screen title | **"Before & After"** |
| Composite step indicator | **"Step 1 of 2: Choose Before"** · **"Step 2 of 2: Choose After"** · **"Preview"** |
| Composite actions | **"Share"** (native) · **"Download"** (web) · **"Start Over"** |
| Composite empty (reached with <2 photos) | Heading **"Not enough photos on this device"** / body **"You need at least two progress photos on this device to build a before & after."** |
| Composite share/download error | **"Couldn't share. Try again."** |
| Delete metric entry confirm | Heading **"Delete Entry"** / body **"This entry will be deleted. This can't be undone. Delete anyway?"** / confirm **"Delete"** |
| Delete photo confirm | Heading **"Delete Photo"** / body **"This photo and its bytes on this device will be deleted. This can't be undone. Delete anyway?"** / confirm **"Delete"** |
| Profile tab new rows | **"Body Metrics"** · **"Progress Photos"** |
| Recent Records widget | heading **"Recent Records"** / link **"View all records"** |
| Muscle Heatmap widget | heading **"Muscle Map"** / link **"View muscle map"** |
| Bodyweight Trend widget | heading **"Bodyweight"** / link **"View trend"** |

**Copy rules that bind every string above (carried forward, unchanged from Phases 9/10):**

- **No string may assert a zero the user did not produce** (D-09/D-13): a blank entry field starts genuinely empty, never `0`; an absent widget is simply absent, never a "0 progress" tile.
- **Every error state follows the shipped "{Surface} couldn't load" / "Restart the app to try again. Your programs and history are safe." pattern** verbatim, unless a more specific save/share failure applies (which follows its own narrower, action-specific copy).
- **The device-absent photo placeholder is stated as a fact, never an apology or a warning** (R25's "informational, never alarming" rule, extended from Phase 10's stale-rollup caption to this phase's device-boundary disclosure).

---

## Named Constants (R21/R24/R32)

Every one is exported; no window, tile size, or row-count limit appears as a literal at a call site.

| Constant | Value | Home |
|---|---|---|
| `DEFAULT_WIDGET_KINDS` | `['next_up', 'weekly_progress']` | `lib/db/dashboard-widgets.ts` |
| `WIDGET_KINDS` | `['next_up', 'weekly_progress', 'recent_records', 'muscle_heatmap', 'bodyweight_trend', 'history_trend']` | `@fitness/api-contracts` |
| `RECENT_RECORDS_WIDGET_LIMIT` | `3` | `components/RecentRecordsWidget.tsx` |
| `MUSCLE_HEATMAP_WIDGET_WINDOW_DAYS` | `7` | `components/MuscleHeatmapWidget.tsx` |
| `BODYWEIGHT_TREND_WIDGET_WINDOW_DAYS` | `30` | `components/BodyweightTrendWidget.tsx` |
| `BODY_METRIC_TREND_WINDOWS` | `['1m', '3m', '1y', 'all']` | pure analytics/data layer |
| `BODY_METRIC_TREND_WINDOW_DAYS` | `{ '1m': 30, '3m': 90, '1y': 365, all: null }` | pure analytics/data layer |
| `BODY_METRIC_TREND_WINDOW_CHIP_LABELS` | `{ '1m': '1 Month', '3m': '3 Months', '1y': '1 Year', all: 'All Time' }` | pure analytics/data layer |
| `BODY_METRIC_KIND_ORDER` | the fixed 15-kind display order (bodyweight first) | `docs/body-metric-vocabularies.md` / `@fitness/api-contracts` |
| `PHOTO_GRID_COLUMNS` | `2` | `components/ProgressPhotoTile.tsx` |
| `PHOTO_TILE_GAP` | `8` | `components/ProgressPhotoTile.tsx` |
| `MIN_PHOTO_TILE_SIZE` | `120` | `components/ProgressPhotoTile.tsx` |
| `KEYPAD_SHEET_MAX_WIDTH` | `400` | `components/MetricEntrySheet.tsx` |
| `MAX_COMPOSITE_PHOTOS` | `2` | `app/photo-composite.tsx` |
| `PR_TYPES`, `TREND_CHART_HEIGHT`, `MIN_CHART_WIDTH`, `MAX_POINT_MARKERS`, `E1RM_MAX_VALID_REPS` | *(already shipped, Phase 9)* | reused where applicable — never re-declared |

---

## UI Considerations

> Populated by the ui-phase UI-consideration probe. Shape-rooted UI *state* coverage
> (empty / loading / error / populated / partial / overflow / zero-one-many / long-text).
> Empty-state and error-state COPY live in **Copywriting Contract** above — this section covers
> state coverage and REFERENCES those rows rather than restating the copy.

**Probe run:** 12 elements (E1–E12), 71 applicable considerations, 0 unclassified.
**Resolved:** 58 covered (explicit) · 6 backstop · 7 dismissed · 0 unresolved.

Element key: **E1** Home dashboard (list-collection + nav) · **E2** `DashboardWidgetPicker` (list-collection, modal) · **E3** `QuickActionSheet` (interactive-control, modal) · **E4** `MetricEntrySheet` (form/interactive-control, modal) · **E5** Body Metrics overview (list-collection + nav) · **E6** Body metric trend detail (media + list-collection + nav) · **E7** `TrackKindSheet` (list-collection, modal) · **E8** Progress Photos gallery (media list-collection + nav) · **E9** `PhotoCaptureConfirmSheet` (form, modal) · **E10** Before & After composite (media + multi-step form) · **E11** `ProgressPhotoPlaceholder` (static-content, device-boundary state) · **E12** Delete confirmations (destructive-action).

| Category | Element | Status | Resolution / Reason |
|----------|---------|--------|---------------------|
| empty | E1 Home dashboard | ✅ covered | "No widgets on your dashboard" + "Add Widgets" CTA — S1 states. |
| loading | E1 Home dashboard | ✅ covered | R6 skeleton for widget-list resolution only; chrome renders immediately. |
| error | E1 Home dashboard | ✅ covered | Scoped to the widget-list read only (R29), not the whole screen. |
| populated | E1 Home dashboard | ✅ covered | Full widget dispatch table. |
| partial | E1 Home dashboard | ✅ covered | Mixed present/absent widgets is the ordinary case, no special casing. |
| overflow | E1 Home dashboard | ⊘ dismissed | Six widgets is the catalog's structural maximum; `ScrollView` handles it, no virtualization needed. |
| zero-one-many | E1 Home dashboard | ✅ covered | 0 enabled → empty state; 1–6 → the populated column, no per-count special case. |
| long-text | E1 Home dashboard | ✅ covered | Header links and empty-state copy never truncate (R4). |
| empty | E2 `DashboardWidgetPicker` | ✅ covered | Both sub-empty states (zero enabled / zero available) covered independently. |
| loading | E2 `DashboardWidgetPicker` | ⊘ dismissed | Opens only from already-loaded Home state; the widget-kind list is a static constant, never itself a read. |
| error | E2 `DashboardWidgetPicker` | ⊘ dismissed | Add/remove/reorder are local, synchronous, offline-safe writes (same class as `ReorderExercisesSheet`'s own no-error-state precedent) — a write failure here is treated as a data-layer bug, not a UI state this spec renders differently. |
| populated | E2 `DashboardWidgetPicker` | ✅ covered | Both sections render per spec. |
| overflow | E2 `DashboardWidgetPicker` | ✅ covered | Internal `ScrollView`, six-row structural ceiling. |
| long-text | E2 `DashboardWidgetPicker` | ✅ covered | Widget names are short fixed constants. |
| — | E2 drag accessibility | 🧪 backstop | `DragHandle`'s existing accessibility contract (`accessibilityLabel="Reorder {name}"`) is reused verbatim; held-out verification that the generalized label reads correctly for a widget name, not only an exercise name. |
| empty | E3 `QuickActionSheet` | ⊘ dismissed | All six rows are always present and always actionable (spec text above) — there is no empty variant of a fixed six-row menu. |
| loading | E3 `QuickActionSheet` | ⊘ dismissed | No read backs this sheet; it is a static menu. |
| error | E3 `QuickActionSheet` | ⊘ dismissed | Same reasoning. |
| populated | E3 `QuickActionSheet` | ✅ covered | Six fixed rows, fixed order, fixed icons. |
| long-text | E3 `QuickActionSheet` | ✅ covered | Row labels are short fixed constants. |
| empty | E4 `MetricEntrySheet` | ✅ covered | Blank starting value (no fabricated zero) with a disabled "Log" until a digit is entered. |
| populated | E4 `MetricEntrySheet` | ✅ covered | Pre-filled with last value, editable (R31). |
| loading | E4 `MetricEntrySheet` | ⊘ dismissed | Last-value lookup resolves before presenting (R6/`MuscleDrilldownSheet` precedent). |
| error | E4 `MetricEntrySheet` | ✅ covered | Inline "Couldn't save. Try again." on a write failure, sheet stays open. |
| long-text | E4 `MetricEntrySheet` | ✅ covered | Kind label and unit are short fixed constants; no truncation. |
| empty | E5 Body Metrics overview | ✅ covered | "No measurements yet" + always-visible "Track a measurement" path forward. |
| loading | E5 Body Metrics overview | ✅ covered | Shipped 3-row skeleton, no spinner. |
| error | E5 Body Metrics overview | ✅ covered | Shipped "{Surface} couldn't load" pattern. |
| populated | E5 Body Metrics overview | ✅ covered | Row list + "Track a measurement" row. |
| zero-one-many | E5 Body Metrics overview | ✅ covered | 0 tracked → empty; 1–15 → the row list, no per-count special case. |
| long-text | E5 Body Metrics overview | ✅ covered | No `numberOfLines` on either row line (R4). |
| empty | E6 Trend detail | ✅ covered | Two distinct empty states (no entries ever / none in window), window switch hidden vs. visible respectively — mirrors S4's (Phase 9) own dual empty-state rule. |
| loading | E6 Trend detail | ✅ covered | Chart-shaped skeleton block. |
| error | E6 Trend detail | ✅ covered | Shipped pattern. |
| populated | E6 Trend detail | ✅ covered | Headline, chart, entries list. |
| partial | E6 Trend detail | ✅ covered | Single-point rendering (R17) covered explicitly. |
| overflow | E6 Trend detail | ✅ covered | Entries list scrolls within the screen's own `ScrollView`; virtualization flagged as a mechanical follow-up if entry volume proves it necessary. |
| long-text | E6 Trend detail | ✅ covered | Entry row value/date lines wrap (R4). |
| — | E6 chart accessibility | 🧪 backstop | `TrendChart`'s existing R20 `trendChartSummary` announcement is reused verbatim for a body-metric series; held-out verification the announced sentence reads correctly for a non-weight, non-exercise metric label (e.g. "Waist over the last 90 days..."). |
| empty | E7 `TrackKindSheet` | ✅ covered | "You're tracking everything" when nothing remains to add. |
| populated | E7 `TrackKindSheet` | ✅ covered | Row list per untracked kind. |
| loading | E7 `TrackKindSheet` | ⊘ dismissed | The tracked/untracked split is derived from already-loaded Body Metrics screen state; no independent read. |
| overflow | E7 `TrackKindSheet` | ✅ covered | Internal scroll, fifteen-kind ceiling. |
| empty | E8 Progress Photos gallery | ✅ covered | "No progress photos yet" + "Add Photo" always reachable. |
| loading | E8 Progress Photos gallery | ✅ covered | Grid-shaped skeleton tiles. |
| error | E8 Progress Photos gallery | ✅ covered | Shipped pattern. |
| populated | E8 Progress Photos gallery | ✅ covered | Full grid. |
| partial | E8 Progress Photos gallery | ✅ covered | Mixed present/placeholder tiles interleaved by date (design decision 11). |
| overflow | E8 Progress Photos gallery | ✅ covered | `FlashList` virtualization. |
| zero-one-many | E8 Progress Photos gallery | ✅ covered | 0/1 on-device photos → "Create Before & After" absent; ≥2 → present (explicit gate). |
| long-text | E8 Progress Photos gallery | ✅ covered | Date captions are fixed-format short strings; no truncation set regardless. |
| empty | E9 `PhotoCaptureConfirmSheet` | ⊘ dismissed | Never presented without a captured photo — capture happens synchronously before this sheet mounts. |
| populated | E9 `PhotoCaptureConfirmSheet` | ✅ covered | Preview, optional note, Save/Discard. |
| error | E9 `PhotoCaptureConfirmSheet` | ✅ covered | Inline "Couldn't save. Try again." on a write failure. |
| long-text | E9 `PhotoCaptureConfirmSheet` | ✅ covered | Note field wraps normally, no imposed character limit. |
| empty | E10 Composite | ✅ covered | "Not enough photos on this device" when reached with <2 device-resident photos (stale-link case). |
| populated | E10 Composite | ✅ covered | Three-step flow (choose/choose/preview) fully specified. |
| error | E10 Composite | ✅ covered | Inline "Couldn't share. Try again."; selections and preview survive the retry. |
| zero-one-many | E10 Composite | ✅ covered | Exactly 2 photos, always (`MAX_COMPOSITE_PHOTOS`) — no variable-count case at this surface. |
| overflow | E10 Composite | ✅ covered | Grid steps inherit S8's `FlashList` virtualization. |
| long-text | E10 Composite | ✅ covered | Step indicator and date captions are short fixed strings. |
| empty | E11 `ProgressPhotoPlaceholder` | ✅ covered | This component *is* the empty/absent-bytes state for a photo row — its whole existence is R27's coverage. |
| — | E11 non-selectability in composite | ✅ covered | R28 — `accessibilityState={{ disabled: true }}`, no `onPress`, in the composite picker specifically. |
| — | E11 tappability in gallery | ✅ covered | Opens the "Not on this device" info sheet (design decision 11's own gallery-context behavior). |
| long-text | E11 `ProgressPhotoPlaceholder` | ✅ covered | Fixed short copy, no truncation risk; no `numberOfLines` regardless (R4). |
| — | E12 delete-entry confirm | ✅ covered | `DeleteMetricEntryDialog` copy fully specified, `DeleteWorkoutDialog` shape reused. |
| — | E12 delete-photo confirm | ✅ covered | `DeletePhotoDialog` copy fully specified, same shape. |
| — | E12 remove-widget (non-destructive) | ✅ covered | Explicitly no confirmation, with rationale (Confirmations table). |
| — | E4/E9 maximum-font-scale keypad/preview layout | 🧪 backstop | `MetricValueKeypad` and the photo preview card both need visual confirmation they don't clip or overlap at maximum OS font scale, matching every prior phase's identical backstop for docked-keypad/preview surfaces (e.g. `NumericKeypad`'s own Phase 5 backstop). Deferred to ROADMAP Phase 999.2 per standing project policy. |
| — | native camera/picker/composite rendering | 🧪 backstop | `expo-image-picker`, `expo-image-manipulator`, and `react-native-view-shot` have never rendered on a real iOS/Android build in this environment (no Xcode, no Android SDK — `12-RESEARCH.md` Environment Availability). Web path is fully exercisable in Playwright; native is typecheck-only, deferred to ROADMAP Phase 999.1 per standing project policy. |

<!-- Status vocabulary (locked by probe-core projectTruths):
     ✅ covered   → a plain truth string lifted into must_haves.truths
     🧪 backstop  → a flat scalar { statement, verification: backstop }; at verify time, no explicit
                    evidence → insufficient_spec → human_needed (never a silent pass, #1154)
     ⊘ dismissed  → not applicable to this surface, reason recorded; NOT lifted into must_haves
     ⚠ unresolved → an explicit planner assumption (surfaced, never silently dropped)
     Rows are REPLACED (not appended) on a probe re-run — idempotent. -->

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none — tool not initialized (React Native codebase, shadcn/Radix not applicable) | not applicable |
| third-party | none | not applicable |

**New runtime dependencies this phase** (per `12-RESEARCH.md` Package Legitimacy Audit — not a UI-registry concern, recorded here for completeness): `expo-image-picker` 57.0.14, `expo-image-manipulator` 57.0.14, `react-native-view-shot` 5.1.1. All three are official-publisher or well-established packages with no [SLOP] verdict; the two Expo packages were flagged [SUS] on publish-recency alone and cleared as false positives. None is a shadcn/Radix/UI-component registry entry — the gate above is genuinely not applicable to this phase's dependency additions.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
