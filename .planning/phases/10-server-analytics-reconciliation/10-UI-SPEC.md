---
phase: 10
slug: server-analytics-reconciliation
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-29
mode: unattended — generated during `/gsd-start` with no user questions asked
---

# Phase 10 — UI Design Contract

> Visual and interaction contract for the one genuinely new user-facing surface this phase ships:
> the front/back muscle-volume heatmap (ANLY-04) and its per-muscle drill-down (ANLY-05).
> ANLY-09 (server-side PR/rollup recomputation on edit) introduces no UI of its own and is out of
> scope for this document.
>
> **Unattended run.** The user directed that nothing be asked. Every question this document would
> normally put to a human was resolved here and marked **[CLAUDE'S CALL]** with a one-line rationale
> and its reversibility, so a later reader can find and overturn any of them cheaply. Nothing below
> contradicts `10-CONTEXT.md`'s D-01…D-10, and this document follows `09-UI-SPEC.md`'s structure,
> token vocabulary and accessibility rules exactly rather than inventing a second style.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — shadcn is not applicable, unchanged from every prior phase (React Native + React Native Web; `components.json` correctly does not exist). |
| Component library | Hand-rolled RN components under `apps/mobile/components/`. This phase adds exactly three: `MuscleHeatmap`, `MuscleVolumeRow`, `MuscleDrilldownSheet`. Every one styles itself against the same NativeWind token set in `apps/mobile/tailwind.config.js`; none introduces a second visual language. |
| Icon library | `@expo/vector-icons` (`Ionicons`), unchanged. This phase adds no new glyph — the drill-down's dismiss control is text ("Close"), not an icon, matching `RenameSessionDialog`'s Cancel/Confirm text-button precedent rather than introducing a close-icon convention this app has never used. |
| Font | System default, unchanged. |
| Charting/drawing | **`react-native-svg` only** (D-05), the same dependency Phase 9 landed — no second drawing library. One file, no `.web.tsx` sibling, so the heatmap renders identically on native and web and is exercisable by the Playwright durability harness (D-05's stated reason). |

**Design decisions this document resolves that CONTEXT.md left open:**

1. **[CLAUDE'S CALL] The body map is a schematic zone diagram, not an anatomical illustration.** Each muscle group is a simple `<Rect>`/`<Circle>` zone positioned on a torso/limb grid — the same primitive-shapes discipline `TrendChart` already established for `react-native-svg`. The project has no illustration/asset pipeline and no video/image content this phase (per-project constraint), and D-05 restricts the dependency to shape primitives already in the app. *Reversibility: reversible — swapping in a licensed vector body illustration later is additive; the per-muscle fill/accessibility contract below is unchanged either way.*
2. **[CLAUDE'S CALL] Every muscle-group zone belongs to exactly one figure (front or back), never both.** See **Muscle → Figure Assignment**. A muscle rendered on both figures at the same fill would double the visual weight of the "which regions did I train" read for no informational gain, and D-06 already treats each muscle group as a single row in the drill-down list — one figure membership keeps the row list and the two figures in 1:1 correspondence. *Reversibility: a data-table change, reversible.*
3. **[CLAUDE'S CALL] The drill-down entry point is a plain RN `Pressable` row beneath the figures, never a tap handler on an SVG shape.** A schematic zone is frequently smaller than the 48×48px hit-target floor this app enforces everywhere else, and D-05 requires each figure to carry exactly **one** `role="img"` announcement with every child hidden from assistive tech — an SVG shape inside that subtree cannot be independently screen-reader-focused. Routing the interaction through an ordinary list row solves both problems with one mechanism and gives Playwright a stable `role`+`name` target, per this phase's own accessibility ask. *Reversibility: one-way in spirit — reintroducing an SVG-shape tap target would silently strand screen-reader users and shrink touch targets below the floor.*
4. **[CLAUDE'S CALL] "Untrained" is a hue change (`foregroundMuted`), not merely a darker shade of the trained hue (`accent`).** D-10 requires "no data" and "trained lightly" to never look alike; a single-hue opacity ramp that fades toward the background risks exactly that confusion near its low end, especially for a colorblind reader. Two categorically different colors make the boundary legible without reading a legend. *Reversibility: reversible — a fill-color rule.*
5. **[CLAUDE'S CALL] Entry point lives on the History tab, third link in the existing header row.** No tab is added, restructured, or reordered (carrying forward Phase 9's own constraint). "Records" (Phase 9) and "Muscle Map" (this phase) are both backward-looking analytics entries and sit together; "Add a Past Workout" (a write action) stays visually separated on the trailing side. See **Navigation & Placement**. *Reversibility: reversible — a route link, not a data change.*
6. **[CLAUDE'S CALL] The drill-down presents as a bottom sheet (`Modal`), not a new route.** It is a contextual, bounded, transient read (D-06: one muscle group, one already-selected window, local SQLite) — the sheet family (`WarmupSheet`, `TargetsSheet`, `NoteSheet`) is this app's existing pattern for exactly that shape of interaction, and dismissing it returns the user to the same heatmap scroll position and selection, unlike a full navigation which would exit the visual heatmap. *Reversibility: reversible — a presentation choice over the same query.*
7. **[CLAUDE'S CALL] A window with real history elsewhere but nothing trained in the selected window still renders the two figures, fully "untrained," rather than replacing them with a text-only empty state.** This differs from `WeeklyProgressCard`/`HistoryTrendCard`'s Phase 9 convention (whole-card-absent-or-text-only on empty) deliberately: D-10 designed the untrained fill specifically to answer "did I train anything in this window" truthfully, and a body map is the one surface here where the zero-state itself *is* the informative visual, not a placeholder for one. A Heading-role banner still announces the state explicitly (see **S5 states**) so it never reads as a bug. *Reversibility: reversible — a state-rendering choice.*
8. **[CLAUDE'S CALL] Default window is 1 Week.** It is the window Phase 9's own "Last 7 Days" card already trained users to expect, it is always computed entirely on-device with zero rollup lag (D-01), and it is the fastest first paint of the three. *Reversibility: reversible — a default-selection choice, changeable with no data implication.*

---

## Spacing Scale

Declared values (already shipped, unchanged, multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon/text gaps, badge padding |
| sm | 8px | Compact spacing, progress-track height |
| md | 16px | Default element spacing, card padding |
| lg | 24px | Screen horizontal padding, section gaps |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

**Exceptions inherited, still binding:** 48×48px minimum hit target on every interactive element — every `MuscleVolumeRow`, the window chips, the drill-down's exercise rows, and its "Close" control.

**New exceptions this phase introduces:**

| Constant | Value | Rationale |
|---|---|---|
| `MUSCLE_FIGURE_HEIGHT` | `240` | Fixed SVG canvas height for each of the two figures — on the 4px grid, carries no text (R16 extended by R23), so it does not scale with OS font scale; the row list beneath it carries all the scaling text. |
| `MIN_FIGURE_WIDTH` | `120` | Floor for `resolveMuscleMapFigureWidth()`. Below this a schematic zone diagram is illegible; a narrower container renders the loading-block skeleton size instead of a squeezed figure. |
| `FIGURE_GAP` | `16` (= `md`) | Horizontal gap between the front and back figures. |

```
resolveMuscleMapFigureWidth(windowWidth) = max(MIN_FIGURE_WIDTH, (windowWidth − 2×lg − FIGURE_GAP) / 2)
                                         = max(120, (windowWidth − 64) / 2)
```

Mirrors `resolveChartWidth`'s exported, unit-testable, hook-free idiom (`TrendChart.tsx`) exactly — same shape, one more figure to fit.

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

- Screen title ("Muscle Map") and empty/error headings → **Heading**.
- Subsection headings ("Front", "Back" list group headers) → **Body, semibold** — matching Phase 9's card-heading convention (`WeeklyProgressCard`'s "Last 7 Days", not a screen title).
- Figure captions ("Front", "Back" beneath each `<Svg>`) → **Label, muted**.
- Training Volume disambiguation caption and the stale-rollup caption → **Label, muted**.
- `MuscleVolumeRow` muscle name → **Body, regular**; its value line ("182.5 kg" or "Untrained") → **Label, muted**.
- Drill-down sheet header (muscle name) → **Heading**; its subheader (window + volume) → **Label, muted**.
- Drill-down exercise row name → **Body, regular**; its trailing line (sets · volume) → **Label, muted**.
- This phase introduces **no Display-role figure** — unlike Phase 9's trend surfaces, there is no single "headline number" here; the heatmap's whole point is a *distribution* across nineteen muscle groups, not one figure. Display stays reserved for Phase 9's surfaces.

---

## Color

Declared values (unchanged — **no new hex is introduced this phase**):

| Role | Value (light) | Value (dark) | Usage |
|------|-------|-------|-------|
| Dominant (60%) | `#FFFFFF` | `#09090B` | Screen background |
| Secondary (30%) | `#F4F4F5` | `#18181B` | Sheet surface, skeleton blocks |
| Accent (10%) | `#2563EB` | `#3B82F6` | **Trained** muscle fill (variable opacity), selected window chip |
| Destructive | `#DC2626` | `#EF4444` | Not used — this phase ships no destructive action |
| Foreground | `#09090B` | `#FAFAFA` | Body/heading text, row muscle/exercise names |
| Foreground (muted) | `#71717A` | `#A1A1AA` | **Untrained** muscle fill, labels, captions |

**Accent reserved for** (extends the Phase 1 list, additive only):

- **A trained muscle zone's fill**, at an intensity-proportional opacity (see **Intensity Scale**). The heatmap's whole informational content is carried by this one fill rule.
- The selected window chip's border + checkmark — inherited verbatim from `SegmentedChipRow`.

**Not accent, explicitly:**

- **An untrained muscle zone's fill is always `foregroundMuted`**, never a low-opacity `accent` (R22/D-10). This is a categorical (hue) distinction, not a shade distinction — see design decision 4 above.
- **The stale-rollup caption** is `foregroundMuted` text, never `destructive` and never `accent` (R25) — it discloses a fact, it is not a warning and not an achievement.

**`ThemeColors` needs no new field.** It ships exactly `{ accent, foregroundMuted, surface }` (`lib/theme-colors.ts`), unchanged from Phase 9, and this phase's components need precisely those three — the untrained/trained fill split is expressed entirely through which of the two colors is used, at what opacity, never through a fourth hex.

---

## Phase-Wide Rules

Extends R1–R21 (all still binding). This phase adds:

- **R22 — Muscle-zone fill is categorical, never continuous, across the untrained/trained boundary.** Untrained is always `colors.foregroundMuted` at `UNTRAINED_FILL_OPACITY`; trained is always `colors.accent` at an intensity-proportional opacity no lower than `TRAINED_FILL_OPACITY_FLOOR`. No gradient ever crosses from one color to the other — extends R17's "never fabricate a zero" into a two-dimensional heatmap (D-10).
- **R23 — Every figure (`<Svg>`) carries exactly one `role="img"` announcement; every shape inside it is hidden from assistive tech; the interactive drill-down entry point is always a plain RN `Pressable` outside the `<Svg>`, never a tap handler on a shape.** Mirrors R20, extended per design decision 3 above.
- **R24 — Every window length and day threshold this phase introduces is a named exported constant** (extends R21) — `MUSCLE_MAP_WINDOW_DAYS`, no numeral for a time span at a call site.
- **R25 — A stale-rollup disclosure is informational, never alarming.** No destructive color, no warning icon, no "out of date" framing — D-01's overlay already guarantees the number is correct; the caption only discloses which part of it came from where.

---

## Muscle → Figure Assignment

`MUSCLE_GROUP_FIGURE_SIDE: Record<MuscleGroupId, 'front' | 'back'>` — every one of the 19 `MUSCLE_GROUPS` (`@fitness/api-contracts`) assigned exactly once (design decision 2). **This is a distinct concept from the existing `body_region` column** (`chest`/`back`/`shoulders`/`arms`/`core`/`legs`, used by Phase 9 nowhere in the UI) — `body_region` answers "which anatomical region," this table answers "which side of the body is it visible from," and the two must not be conflated.

| Front (10) | Back (9) |
|---|---|
| `chest` | `rear_delts` |
| `front_delts` | `upper_back_traps` |
| `side_delts` | `lats` |
| `biceps` | `lower_back` |
| `forearms` | `triceps` |
| `abs` | `glutes` |
| `obliques` | `hamstrings` |
| `quads` | `calves` |
| `adductors` | `abductors` |
| `neck` | |

`MUSCLE_MAP_ROW_ORDER` — the fixed vertical order muscle rows render in beneath each figure, roughly head-to-toe, so the list reads as a body scan rather than an alphabetical jumble:

- Front: `neck`, `front_delts`, `side_delts`, `chest`, `biceps`, `forearms`, `abs`, `obliques`, `quads`, `adductors`.
- Back: `upper_back_traps`, `rear_delts`, `lats`, `lower_back`, `triceps`, `glutes`, `abductors`, `hamstrings`, `calves`.

---

## Navigation & Placement

No tab is added, removed or reordered. The five-tab shell is untouched.

| # | Surface | Requirement | Lives at | Reached from |
|---|---------|-------------|----------|---------------|
| S5 | **Muscle Map screen** | ANLY-04 | new route `apps/mobile/app/muscle-map.tsx` | a **"Muscle Map"** accent text link in the History tab's header row |
| S6 | **Muscle drill-down sheet** | ANLY-05 | `components/MuscleDrilldownSheet.tsx`, presented via `Modal` over S5 | tapping any `MuscleVolumeRow` on S5 |

**Route shape.** Flat file, no query params — matching the shipped `app/records.tsx` convention (a screen whose own view state — the selected window — is never persisted or deep-linked, exactly like `RecordsScreen`'s `prType`):

- `/muscle-map`

**History header row — extended to three links.** Phase 9 shipped `<View className="flex-row justify-between px-lg pt-md">` holding "Records" (leading) and "Add a Past Workout" (trailing). It becomes:

```
<View className="flex-row flex-wrap items-center justify-between gap-sm px-lg pt-md">
  <View className="flex-row flex-wrap items-center gap-md">
    <Pressable ...>Records</Pressable>
    <Pressable ...>Muscle Map</Pressable>
  </View>
  <Pressable ...>Add a Past Workout</Pressable>
</View>
```

Every link keeps `minHeight: 48`, `accessibilityRole="button"`, `text-body font-normal text-accent`. `flex-wrap` on both the outer row and the leading group means at maximum OS font scale the group of two wraps to its own line, and if the whole row can no longer fit two groups side by side, "Add a Past Workout" drops beneath them — never truncation (R1/R4). The two backward-looking analytics links ("Records", "Muscle Map") stay grouped together on the leading side; the one write action stays alone on the trailing side — this groups by *kind of action*, not by shipping order.

**History empty state.** The shipped stack gains a third link in the same vertical stack, same styling, order: **"Add a Past Workout"**, **"Records"**, **"Muscle Map"** — a user with no sessions has no records and no trained muscles either, and the empty Muscle Map screen (below) is the honest, useful answer; hiding the path would make the feature undiscoverable, exactly Phase 9's stated reasoning for "Records" in this same spot.

**Muscle row → drill-down.** Tapping any `MuscleVolumeRow` (trained or untrained) opens `MuscleDrilldownSheet` for that muscle group and the screen's currently-selected window. Untrained rows are tappable too — one code path, no special-cased "disabled" row — and the sheet's own empty state (below) explains the absence in place.

**Drill-down exercise row → performance.** Tapping a contributing-exercise row inside the sheet dismisses the sheet and pushes `/exercise-performance?exerciseId={id}` (no `metric` param — defaults to `heaviest` per S4's own shipped fallback), reusing Phase 9's screen rather than building a second one.

---

## Screen & Component Inventory

| Surface | File | Requirement / decision refs | New or changed |
|---------|------|------------------------------|----------------|
| Muscle Map screen | `apps/mobile/app/muscle-map.tsx` | ANLY-04, D-01, D-02, D-04, D-10 | new route |
| Muscle heatmap (two figures) | `apps/mobile/components/MuscleHeatmap.tsx` | D-05, D-06, D-10, R22, R23 | new — the phase's second `react-native-svg` consumer |
| Muscle breakdown row | `apps/mobile/components/MuscleVolumeRow.tsx` | ANLY-04, ANLY-05, D-04, D-10 | new |
| Muscle drill-down sheet | `apps/mobile/components/MuscleDrilldownSheet.tsx` | ANLY-05, D-06 | new |
| Window switch | `components/SegmentedChipRow.tsx` | ANLY-04 | reused verbatim, no changes — fourth call site after Records/Performance metrics/Performance ranges |
| History tab (host) | `apps/mobile/app/(tabs)/history.tsx` | ANLY-04 | changed — header row gains "Muscle Map"; empty state gains the same link |

**Focal point** (Dimension 2 — naming a primary visual anchor per surface, per the Phase 1/4/9 precedent):

- **Muscle Map screen:** the two figures, side by side, are the anchor — the screen's whole proposition is "where did the work go," answered visually before any row is read. The window switch and the row list beneath are subordinate, in that order.
- **Muscle drill-down sheet:** the contributing-exercise list is the anchor; the header (muscle name + volume) orients the reader to what they are looking at, subordinate to the list itself.

---

## `MuscleHeatmap` — the phase's highest-value contract

One file, `components/MuscleHeatmap.tsx`. No `.web.tsx` sibling — same reasoning as `TrendChart` (D-05).

### Props

```ts
export interface MuscleVolumePoint {
  muscleGroupId: MuscleGroupId;     // @fitness/api-contracts
  muscleName: string;               // pre-resolved from muscle_group.name (already humanized)
  side: 'front' | 'back';           // pre-resolved via MUSCLE_GROUP_FIGURE_SIDE
  trainingVolumeKg: number | null;  // null = untrained (D-10) — 0 never stands in for null
  volumeLabel: string | null;       // pre-formatted, e.g. "182.5 kg" — null when untrained
  relativeIntensity: number | null; // 0..1 relative to this window's highest-volume muscle; null when untrained
}

export interface MuscleHeatmapProps {
  points: MuscleVolumePoint[];   // exactly 19, one per MUSCLE_GROUPS entry, any order
  colors: ThemeColors;           // { accent, foregroundMuted, surface }
  frontWidth: number;            // from resolveMuscleMapFigureWidth(useWindowDimensions().width)
  backWidth: number;             // same value in practice; kept separate for testability, matching TrendChart's width prop
  windowLabel: string;           // e.g. "the last 30 days" — used only inside the announced sentence, never rendered as visible text here
}
```

Component is **hook-free and computation-free** — it receives already-bucketed, already-labeled points and takes `colors` as a prop, matching `TrendChart`'s and `RecommendationBanner`'s house contract, directly invocable by a test with no renderer. All aggregation (rollup read, D-01 overlay, D-04 weighting) lives in the pure data layer, not here.

### Fill rule (R22/D-10)

```
UNTRAINED_FILL_OPACITY = 0.16      // colors.foregroundMuted at this opacity
TRAINED_FILL_OPACITY_FLOOR = 0.35  // colors.accent at this opacity when relativeIntensity === 0 but non-null
                                    // (a muscle trained, but far below the window's hardest-trained muscle,
                                    // must still read as visibly blue, not near-invisible)

fillFor(point) =
  point.trainingVolumeKg === null
    ? { color: colors.foregroundMuted, opacity: UNTRAINED_FILL_OPACITY }
    : { color: colors.accent, opacity: TRAINED_FILL_OPACITY_FLOOR + point.relativeIntensity * (1 − TRAINED_FILL_OPACITY_FLOOR) }
```

`relativeIntensity` is computed by the data layer as `trainingVolumeKg / max(trainingVolumeKg across all trained points in the window)`; the muscle with the most volume in the window always renders at full accent opacity, every other trained muscle scales down toward (never reaching) the untrained floor color — the two never meet because they are different hues (design decision 4).

### Anatomy

```
<View className="flex-row gap-md">
  <View className="items-center gap-xs">
    <Svg width={frontWidth} height={MUSCLE_FIGURE_HEIGHT} accessible accessibilityRole="image"
         accessibilityLabel={muscleMapFigureSummary({ side: 'front', windowLabel, points })}>
      {/* one Rect/Circle zone per front-side muscle, MUSCLE_GROUP_FIGURE_SIDE-filtered,
          each accessibilityElementsHidden + importantForAccessibility="no-hide-descendants" */}
    </Svg>
    <Text className="text-label font-normal text-foreground-muted">Front</Text>
  </View>
  <View className="items-center gap-xs">
    <Svg width={backWidth} height={MUSCLE_FIGURE_HEIGHT} accessible accessibilityRole="image"
         accessibilityLabel={muscleMapFigureSummary({ side: 'back', windowLabel, points })}>
      {/* back-side zones, same hidden-descendant rule */}
    </Svg>
    <Text className="text-label font-normal text-foreground-muted">Back</Text>
  </View>
</View>
```

No `<SvgText>` anywhere (R16, carried forward unchanged) — the "Front"/"Back" captions are ordinary RN `<Text>` siblings, exactly as `TrendChart`'s axis labels are.

### Accessibility (R23) — `muscleMapFigureSummary`

Exported and unit-tested independently of any renderer, matching `trendChartSummary`'s precedent:

| Case | Announced sentence |
|---|---|
| At least one muscle trained on this side | `"{Front\|Back} view, {windowLabel}. {trainedCount} of {sideTotal} muscles trained. Highest: {topMuscleName}, {topVolumeLabel} Training Volume."` |
| No muscle trained on this side (history exists elsewhere, D-10) | `"{Front\|Back} view, {windowLabel}. No muscles trained on this view."` |

`{topMuscleName}` is the trained point with the highest `relativeIntensity` on that side; ties break by `MUSCLE_MAP_ROW_ORDER` position. `windowLabel` is always a duration phrase ("the last 7 days" / "the last 30 days" / "the last 90 days"), never a calendar reference (D-07, carried forward).

### Zero-figure-data guard

`MuscleHeatmap` is never called with fewer than 19 points — that is a host contract, not a runtime branch. If a host somehow supplies zero points, the component renders both `<Svg>`s with every zone at the untrained fill (defensive, mirrors `TrendChart`'s `null`-return backstop philosophy, except here "nothing to draw" and "everything untrained" are visually identical by design, so there is no ambiguous blank frame to guard against).

---

## `MuscleVolumeRow`

`components/MuscleVolumeRow.tsx`. Modelled on `RecordRow`'s shipped anatomy — one `Pressable`, `flex-1`, `minHeight: 48`.

```
┌─────────────────────────────────────────────┐
│  Front Delts                             ›  │   Body / foreground, wraps (R4)
│  182.5 kg                                   │   Label / foreground-muted
└─────────────────────────────────────────────┘
```

- Container `flex-row items-center gap-sm rounded-md bg-surface px-md py-sm`.
- Trailing line reads `{volumeLabel}` when trained, **`"Untrained"`** when not (D-09-style honesty: never `"0 kg"`, never a blank).
- Trailing `chevron-forward` Ionicons, 20px, `colors.foregroundMuted` — same shared press target as `RecordRow`.
- `accessibilityRole="button"`, `accessibilityLabel`:
  - Trained: `"{muscleName}, {volumeLabel} Training Volume, {relativePctRounded}% of your hardest-trained muscle"`.
  - Untrained: `"{muscleName}, untrained"`.
- No `numberOfLines` on either line (R4) — a long muscle name (there are none over two words in this taxonomy today, but the rule is unconditional per house convention) wraps and the row grows.

---

## `MuscleDrilldownSheet` (ANLY-05, D-06)

`components/MuscleDrilldownSheet.tsx`, presented via `<Modal transparent animationType="fade" onRequestClose={onClose}>` — the same idiom `HistoryActionSheet`/`RenameSessionDialog` already use. Reads **local SQLite only** (D-06) — never the server rollup — scoped to `{ muscleGroupId, windowDays }`.

**Opened already-computed, never mid-load.** The query is bounded (one muscle group, one window, local device) and Phase 5/9's precedent for this class of read is to resolve before presenting rather than flash a spinner (R6). If the read throws, the sheet still opens (a tap deserves a response — R3's "explicit action may block" reasoning, distinct from a background card read that simply stays absent) and renders the error branch below.

### Anatomy

1. **Header row** — muscle name (Heading) leading; **"Close"** text link (Label, muted, `minHeight/minWidth: 48`, `accessibilityRole="button"`) trailing.
2. **Subheader** (Label, muted) — `"{windowLabel} · {volumeLabel} Training Volume"` (trained) or `"{windowLabel} · Untrained"` (untrained).
3. **Contributing-exercise list** — plain `View`/`ScrollView` (not `FlashList`; bounded to the exercises that actually contributed, realistically under a dozen), each row:

```
┌─────────────────────────────────────────────┐
│  Barbell Bench Press                        │   Body / foreground, wraps (R4)
│  8 sets · 640 kg                            │   Label / foreground-muted
└─────────────────────────────────────────────┘
```

   `Pressable`, `minHeight: 48`, `accessibilityRole="button"`, `accessibilityLabel="{exerciseName}, {setsCount} sets, {volumeLabel} contributed to {muscleName}"`. Tapping dismisses the sheet, then pushes `/exercise-performance?exerciseId={id}`.

### States

| State | Rendering |
|---|---|
| **Populated** | Header, subheader, list of contributing exercises sorted by contribution descending. |
| **Empty** (muscle untrained in this window, or trained but somehow zero contributing rows) | List area renders Heading `"No sets for {muscleName} in {windowLabel}"` + Body/muted `"Widen the time range or log an exercise that trains this muscle."` Header/subheader still render — the sheet never opens to a bare heading with no orientation. |
| **Error** | Heading `"Couldn't load"` + Body/muted `"Restart the app to try again. Your programs and history are safe."` — the shipped pattern verbatim, header row (muscle name + Close) still renders so the sheet is dismissable. |
| **Overflow** | List scrolls internally within the sheet's own max height; the sheet itself does not grow to fill the screen (a bottom sheet, not a full-screen takeover — matches the existing sheet family's sizing). |
| **Long-text** | Exercise name wraps (R4), no `numberOfLines`. |

---

## S5 — Muscle Map Screen (ANLY-04)

New route `app/muscle-map.tsx`. Screen shell `flex-1 bg-background`, `ScrollView` with `contentContainerStyle={{ gap: 24, padding: 24 }}` — the shipped `WorkoutSummaryView`/Performance-screen container. `NavBackButton` in the header, screen title **"Muscle Map"** (Heading).

### Anatomy (populated)

1. **Screen title** — Heading.
2. **Window switch** — `SegmentedChipRow` over `MUSCLE_MAP_WINDOWS`:

   | id | Chip label | `MUSCLE_MAP_WINDOW_DAYS` | Read path (D-01) |
   |---|---|---|---|
   | `1w` | `1 Week` | `7` | entirely local SQLite |
   | `1m` | `1 Month` | `30` | server rollup + local overlay past the watermark |
   | `3m` | `3 Months` | `90` | server rollup + local overlay past the watermark |

   Default `1w` (design decision 8). Selection is view state only, never persisted.

3. **Training Volume disambiguation caption** — Label, muted, always visible: **"Training Volume — includes secondary muscles, weighted by contribution. This is different from 'Muscles trained' on Home."** Satisfies D-04's naming requirement at the one place a user could otherwise conflate the two numbers.
4. **Stale-rollup caption** — Label, muted, conditional: shown only for `1m`/`3m` and only when the rollup's watermark is behind the newest locally-logged session inside the window: **"Includes {n} session{s} not yet reflected on the server."** (singular "1 session", `pluralize` idiom). Never shown for `1w` (always fully local — D-01). Absent, not "Up to date" — silence is the "nothing to disclose" state (R25).
5. **`MuscleHeatmap`** — the two figures.
6. **Row list**, grouped:
   - `"Front"` (Body, semibold) + ten `MuscleVolumeRow`s in `MUSCLE_MAP_ROW_ORDER`.
   - `"Back"` (Body, semibold) + nine `MuscleVolumeRow`s in `MUSCLE_MAP_ROW_ORDER`.

### States

| State | Rendering |
|---|---|
| **Loading** | R6 — no spinner. Window switch and captions render immediately (pure view state, no read needed); the figures render as two `bg-surface rounded-md` blocks at `MUSCLE_FIGURE_HEIGHT`×`resolveMuscleMapFigureWidth` in place of the real `<Svg>`s, and the row list is simply absent until the read lands (no row skeleton — the figures' own skeleton is the loading signal). |
| **Error** | Heading `"Muscle map couldn't load"` + Body/muted `"Restart the app to try again. Your programs and history are safe."` Window switch, captions, figures and rows are all absent — the shipped screen-level-failure pattern (S3/S4). |
| **Empty — no history at all, any window** | Window switch and both captions are **hidden** — there is nothing to switch between or disclose (mirrors S4's "no history for this exercise" precedent). Heading `"No history to show"` + Body/muted `"Log a workout and your muscle map starts here."` |
| **Empty — history exists, nothing trained in the selected window** (design decision 7) | Window switch and captions stay **visible** (the user can widen the window). A Heading `"Nothing logged in {windowLabel}"` + Body/muted `"Try a longer range."` banner renders directly above the figures (reusing S4's exact body copy). Both figures still render, every zone at the untrained fill; every row reads `"Untrained"`. |
| **Partial — some muscles trained, some not** | No banner (this is the ordinary, most common populated case). Figures and rows render mixed fills/values exactly as computed. |
| **Populated — every muscle trained** | No banner. All 19 zones render at some accent opacity, none at the untrained floor. |
| **Overflow** | The row list is structurally fixed at 19 rows (10 + 9); the screen's own `ScrollView` handles vertical overflow — no internal virtualization needed at this bounded size. |
| **Zero-one-many** | Muscle count is always exactly 19 per figure-side split; there is no variable-cardinality case at the row level. The *trained* subset within those 19 varies freely from 0 to 19 and is exactly the empty/partial/populated states above. |
| **Long-text** | Muscle names wrap (R4); the disambiguation and stale-rollup captions wrap via ordinary `<Text>` reflow — neither is ever truncated. |

---

## Confirmations

| Action | Confirmation | Notes |
|---|---|---|
| — | — | **This phase ships no destructive action and no write of any kind.** Both new surfaces are read-only derivations over already-logged data; the only state they own is the selected window, which is view state and is never persisted. No dialog, no `ArchiveDialog` variant, and no use of the `destructive` colour anywhere. |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Entry-point link | History header, third link: **"Muscle Map"** |
| Screen title | **"Muscle Map"** |
| Window chip labels | **"1 Week"** · **"1 Month"** · **"3 Months"** |
| Training Volume disambiguation caption | **"Training Volume — includes secondary muscles, weighted by contribution. This is different from 'Muscles trained' on Home."** |
| Stale-rollup caption | **"Includes {n} session{s} not yet reflected on the server."** — absent (not "Up to date") when there is nothing to disclose; never for the 1-week window |
| Figure captions | **"Front"** · **"Back"** |
| Row value, trained | `{volumeLabel}` (e.g. "182.5 kg") |
| Row value, untrained | **"Untrained"** — never "0 kg" (D-09/D-10 style) |
| Nothing-trained-in-window banner | Heading **"Nothing logged in {windowLabel}"** / body **"Try a longer range."** (reused verbatim from S4) |
| Empty — no history at all | Heading **"No history to show"** / body **"Log a workout and your muscle map starts here."** |
| Error — screen | Heading **"Muscle map couldn't load"** / body **"Restart the app to try again. Your programs and history are safe."** |
| Drill-down header | `{muscleName}` |
| Drill-down subheader, trained | **"{windowLabel} · {volumeLabel} Training Volume"** |
| Drill-down subheader, untrained | **"{windowLabel} · Untrained"** |
| Drill-down row | `{exerciseName}` / **"{setsCount} sets · {volumeLabel}"** |
| Drill-down empty | Heading **"No sets for {muscleName} in {windowLabel}"** / body **"Widen the time range or log an exercise that trains this muscle."** |
| Drill-down error | Heading **"Couldn't load"** / body **"Restart the app to try again. Your programs and history are safe."** |
| Drill-down dismiss control | **"Close"** |
| Destructive confirmation | *(none — this phase ships no destructive action)* |

**Copy rules that bind every string above (carried forward, unchanged):**

- **No string may imply a calendar week or calendar month** (D-07): `windowLabel` is always a duration phrase — "the last 7 days" / "the last 30 days" / "the last 90 days" — never "this week," "this month," or a weekday/date-of-month reference.
- **No string may assert a zero the user did not produce** (D-09/D-10): "Untrained," never "0 kg"; "Nothing logged," never "0 muscles trained."
- **The stale-rollup caption is stated as a fact, not a caveat** (R25): no "may be incomplete," no "syncing…" spinner-adjacent language — the overlay already makes the number correct.

---

## Named Constants (R21/R24)

Every one is exported; no time span, day threshold, or figure dimension appears as a literal at a call site.

| Constant | Value | Home |
|---|---|---|
| `MUSCLE_MAP_WINDOWS` | `['1w', '1m', '3m']` | pure analytics package |
| `MUSCLE_MAP_WINDOW_DAYS` | `{ '1w': 7, '1m': 30, '3m': 90 }` | pure analytics package |
| `MUSCLE_MAP_WINDOW_CHIP_LABELS` | `{ '1w': '1 Week', '1m': '1 Month', '3m': '3 Months' }` | pure analytics package |
| `MUSCLE_GROUP_FIGURE_SIDE` | see **Muscle → Figure Assignment** | pure analytics package |
| `MUSCLE_MAP_ROW_ORDER` | see **Muscle → Figure Assignment** | pure analytics package |
| `UNTRAINED_FILL_OPACITY` | `0.16` | `components/MuscleHeatmap.tsx` |
| `TRAINED_FILL_OPACITY_FLOOR` | `0.35` | `components/MuscleHeatmap.tsx` |
| `MUSCLE_FIGURE_HEIGHT` | `240` | `components/MuscleHeatmap.tsx` |
| `MIN_FIGURE_WIDTH` | `120` | `components/MuscleHeatmap.tsx` |
| `FIGURE_GAP` | `16` | `components/MuscleHeatmap.tsx` |
| `PR_TYPES`, `E1RM_MAX_VALID_REPS`, `TREND_CHART_HEIGHT`, `MIN_CHART_WIDTH`, `MAX_POINT_MARKERS` | *(already shipped, Phase 9)* | reused where applicable — never re-declared |

---

## UI Considerations

> Populated by the ui-phase UI-consideration probe. Shape-rooted UI *state* coverage
> (empty / loading / error / populated / partial / overflow / zero-one-many / long-text).
> Empty-state and error-state COPY live in **Copywriting Contract** above — this section covers
> state coverage and REFERENCES those rows rather than restating the copy.

**Probe run:** 5 elements (E1–E5), 32 applicable considerations, 0 unclassified.
**Resolved:** 22 covered (explicit) · 3 backstop · 7 dismissed · 0 unresolved.

Element key: **E1** Muscle Map screen (list-collection + nav) · **E2** `MuscleHeatmap` (media + static-content) · **E3** `MuscleVolumeRow` (list-collection + nav) · **E4** `MuscleDrilldownSheet` (list-collection + nav, modal) · **E5** Window `SegmentedChipRow` reuse (interactive-control).

| Category | Element | Status | Resolution / Reason |
|----------|---------|--------|---------------------|
| empty | E1 Muscle Map screen | ✅ covered | Two distinct empty states — no history at all (switches hidden) vs. nothing in the selected window (switches visible, banner + fully-untrained figures). See S5 states. |
| loading | E1 Muscle Map screen | ✅ covered | R6 — figure-shaped skeleton blocks only; switch/captions render immediately since they are pure view state. |
| error | E1 Muscle Map screen | ✅ covered | Shipped "Muscle map couldn't load" pattern; everything else absent. |
| populated | E1 Muscle Map screen | ✅ covered | Title, switch, captions, two figures, grouped row lists. |
| partial | E1 Muscle Map screen | ✅ covered | Mixed trained/untrained is the ordinary case; no banner, no special casing. |
| overflow | E1 Muscle Map screen | ✅ covered | Fixed 19-row list; screen `ScrollView` handles vertical overflow, no internal virtualization needed at this bound. |
| zero-one-many | E1 Muscle Map screen | ✅ covered | Muscle count structurally fixed at 19 (10 front + 9 back); the *trained* subset varies 0–19, covered by empty/partial/populated. |
| long-text | E1 Muscle Map screen | ✅ covered | Muscle names and both captions wrap (R4); no `numberOfLines` anywhere on this screen. |
| empty | E2 `MuscleHeatmap` | ✅ covered | Never called with 0 points by contract; if it were, every zone falls back to the untrained fill — no ambiguous blank frame (D-10 makes "all untrained" and "no data" visually identical by design, so there is nothing further to guard). |
| loading | E2 `MuscleHeatmap` | ⊘ dismissed | The component is computation-free and props-driven; the host (E1) owns the loading-skeleton rendering, matching `TrendChart`'s own dismissal of this category. |
| error | E2 `MuscleHeatmap` | ⊘ dismissed | Hook-free, read-free, computation-free — cannot fail independently of the host that supplies its points (same reasoning as `TrendChart`). |
| populated | E2 `MuscleHeatmap` | ✅ covered | Two figures, 10 + 9 zones, fill per R22's rule. |
| overflow | E2 `MuscleHeatmap` | ✅ covered | Figure width floors at `MIN_FIGURE_WIDTH`; height is fixed at `MUSCLE_FIGURE_HEIGHT` regardless of point count (count is always 19). |
| long-text | E2 `MuscleHeatmap` | 🧪 backstop | No text renders inside either `<Svg>` (R16 extended by R23); "Front"/"Back" captions are real `<Text>` that scale normally. Verified by a held-out assertion that no `SvgText` element is rendered anywhere in this component, mirroring `TrendChart`'s own held-out check. |
| — | E2 screen-reader announcement | 🧪 backstop | R23: each `<Svg>` root announces one `muscleMapFigureSummary()` sentence per side, every child hidden from assistive tech. Verified by a held-out test over both cases (some trained / none trained on that side) plus an assertion that the root carries `accessible` + `accessibilityRole="image"`. |
| — | E2 native/web parity | 🧪 backstop | D-05: one file, no `.web.tsx` sibling. Verified by the Playwright durability spec rendering both figures in a browser; native rendering is unobservable in this environment and is recorded in `.planning/WINDOWS.md` for ROADMAP Phase 999.1. |
| empty | E3 `MuscleVolumeRow` | ✅ covered | Untrained row renders `"Untrained"` — never `"0 kg"` (D-09/D-10). |
| loading | E3 `MuscleVolumeRow` | ⊘ dismissed | Rows render only once the host's data has landed (E1's loading state omits the row list entirely); there is no partially-loaded row. |
| error | E3 `MuscleVolumeRow` | ⊘ dismissed | Same reasoning — a row never renders against a failed read; the host's error state pre-empts the whole list. |
| populated | E3 `MuscleVolumeRow` | ✅ covered | Muscle name + value line + chevron, `Pressable` opens the drill-down. |
| overflow | E3 `MuscleVolumeRow` | ✅ covered | Fixed count per side (10/9); no per-row overflow case beyond ordinary text wrap. |
| zero-one-many | E3 `MuscleVolumeRow` | ⊘ dismissed | A row is not itself a collection — this category applies at the list level (E1), not per-row. |
| long-text | E3 `MuscleVolumeRow` | ✅ covered | No `numberOfLines` on either line (R4); row grows to fit. |
| — | E3 accessible name | ✅ covered | Exact two-branch format specified (trained/untrained) in the component contract above, mirroring `RecordRow`'s composed-label idiom. |
| empty | E4 `MuscleDrilldownSheet` | ✅ covered | "No sets for {muscle} in {window}" + actionable body copy; header/subheader still render for orientation. |
| loading | E4 `MuscleDrilldownSheet` | ✅ covered | Opened only once the bounded local query resolves (R6-compliant — no spinner ever renders); the sheet does not present mid-load. |
| error | E4 `MuscleDrilldownSheet` | ✅ covered | Shipped "Couldn't load" pattern; the sheet still opens and is dismissable (an explicit tap deserves a response — R3 reasoning, distinct from E1's card-style silent-absence-on-error). |
| populated | E4 `MuscleDrilldownSheet` | ✅ covered | Header, subheader, contributing-exercise list sorted by contribution descending. |
| overflow | E4 `MuscleDrilldownSheet` | ✅ covered | Internal scroll within the sheet's own bounded height; the sheet does not expand to a full-screen takeover. |
| zero-one-many | E4 `MuscleDrilldownSheet` | ✅ covered | Zero contributing exercises → the empty branch; one or many → the populated list, no special casing between one and many. |
| long-text | E4 `MuscleDrilldownSheet` | ✅ covered | Exercise names wrap (R4), no `numberOfLines`. |
| overflow | E5 window `SegmentedChipRow` | ✅ covered | Three chips never wrap to a second row — the shipped `SegmentedChipRow` overflow rule, unchanged, fourth call site. |
| long-text | E5 window `SegmentedChipRow` | ✅ covered | Chip labels are short fixed constants; the shipped grow-not-truncate rule applies unchanged. |

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

**No new runtime dependency this phase.** `react-native-svg` is already in the lockfile from Phase 9 (D-05); this phase adds a second consumer (`MuscleHeatmap`), not a second dependency. No further chart/drawing package may be added.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
