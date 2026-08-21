---
phase: 04-program-builder
plan: 05
subsystem: ui
tags: [react-native, react-native-web, react-native-tab-view, react-native-gesture-handler, react-native-reanimated, jest, pnpm, expo]

# Dependency graph
requires:
  - phase: 04-program-builder (04-02)
    provides: Gap-based order_index arithmetic and moveExercise, the single write path this plan's gesture and non-gesture reorder paths both funnel into
  - phase: 04-program-builder (04-03)
    provides: ExerciseSlotRow (hook-free-view/stateful-wrapper split) and ProgramSlot, extended in place by this plan
provides:
  - DayDeck — days as horizontally swipeable react-native-tab-view pages with a controlled, self-clamping index; no DayDeck.web.tsx sibling (the library ships its own native/web Pager split internally)
  - DragHandle.tsx / DragHandle.web.tsx — an always-visible-when-reorderable drag handle (native: gesture-handler + reanimated pan; web: pointer events), both committing through the same pure reorder-drag.ts helpers into moveExercise
  - Move up / Move down controls on the expanded ExerciseSlotRow — the non-gesture equivalent reorder path, same write, boundary-disabled via accessibilityState
  - Three new platform-modules.md audit rows plus a real react-native-worklets/reanimated peer-version fix (pnpm-workspace.yaml override)
affects: [04-08-cycle-strip, 04-09-next-up-card, 04-11-programs-library]

# Actuals (#2632)
actuals:
  tokens: 13500
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added:
    - "react-native-tab-view ^4.3.2 (Expo-pinned)"
    - "react-native-gesture-handler ~2.32.0 (Expo-pinned, not the audited registry-latest 3.2.1)"
    - "react-native-reanimated 4.5.1 (Expo-pinned, not the audited registry-latest 4.5.3)"
    - "react-native-worklets 0.10.4 (transitive peer only — never a direct dependency; pinned via pnpm-workspace.yaml override)"
    - "react-native-pager-view 9.0.2 (transitive peer only, native pager backing react-native-tab-view)"
  patterns:
    - "Platform-file pairs that need a shared pure hook-free view (DragHandleView) duplicate that view's render body in both the native and .web.tsx files, rather than cross-importing between them — a bare specifier written inside a .web.tsx file resolves back to itself on the web build (self-import), so the pure arithmetic (reorder-drag.ts) is shared but the two files' own JSX is not"
    - "Gesture direction-locking (activeOffsetY/failOffsetX on Gesture.Pan()) is the correct mechanism for 'a vertical drag inside a horizontally-swipeable pager must not fight the page swipe' — not Gesture.Race/Simultaneous, which compose multiple RNGH gestures against each other and have nothing to compose against here since the day deck's own swipe is owned by react-native-tab-view's Pager, not by a sibling RNGH gesture"
    - "A day-page-level boolean (canReorder = day.slots.length >= 2) computed once by the day's render callback and threaded down as a prop is how a D-23-style 'hide when nothing to reorder' rule stays un-duplicated across both DragHandle.tsx and DragHandle.web.tsx and across every row in the day"

key-files:
  created:
    - apps/mobile/components/DayDeck.tsx
    - apps/mobile/components/__tests__/DayDeck.test.tsx
    - apps/mobile/components/DragHandle.tsx
    - apps/mobile/components/DragHandle.web.tsx
    - apps/mobile/components/__tests__/DragHandle.test.tsx
    - apps/mobile/lib/programs/reorder-drag.ts
    - apps/mobile/lib/programs/__tests__/reorder-drag.test.ts
    - apps/mobile/jest-setup.js
  modified:
    - apps/mobile/package.json
    - apps/mobile/babel.config.js
    - apps/mobile/jest.config.js
    - apps/mobile/app/_layout.tsx
    - apps/mobile/components/ExerciseSlotRow.tsx
    - apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx
    - "apps/mobile/app/(tabs)/programs.tsx"
    - docs/platform-modules.md
    - pnpm-workspace.yaml

key-decisions:
  - "Only the three checkpoint-approved packages were installed via `expo install` (matching the `expo install` precedent Phase 3 set for @shopify/flash-list), which pinned SDK-57-validated versions (gesture-handler ~2.32.0, reanimated 4.5.1) rather than the audited registry-latest versions the checkpoint's own legitimacy table cited (3.2.1 / 4.5.3) — that divergence is Expo's own version-pinning working as intended, not a deviation from the approval."
  - "react-native-worklets and react-native-pager-view were deliberately left as transitive peers, never added to any package.json — a checkpoint prohibition. A real version-compatibility bug was found and fixed by pinning react-native-worklets to 0.10.4 via pnpm-workspace.yaml's overrides map (matching that file's existing react/react-dom override precedent) rather than by promoting it to a direct dependency."
  - "D-23's UI-SPEC amendment (drag handle — and the Move up/down non-gesture path — hidden whenever a day has fewer than two exercises) was followed over this plan's own pre-amendment 'always visible' task text, per this dispatch's binding ui_contract instruction. The count check (day.slots.length >= 2) is computed once by programs.tsx's day-render callback and passed down as canReorder/orderedIds/index, never recomputed per row or per platform file."
  - "The shared-value-driven translateY animation (react-native-reanimated) animates the drag handle's own glyph, not the full row. The plan's action text says 'drive a translation through useAnimatedStyle on the row'; this plan reads that as pointer-following visual feedback on the dragged control itself, not a live-reordering row-shift animation of every other row in the list (which Surface C's own capability table explicitly opts out of — Layout/entering/exiting animations are OPT-OUT, 'the reorder animation is driven explicitly by the pan; implicit layout animations would double-animate'). The actual reorder is committed through moveExercise and the day's list re-renders in its new order on the next tree reload, the same mechanism every other write-then-reload interaction in this screen already uses."
  - "DragHandleView's render body is duplicated (not imported) between DragHandle.tsx and DragHandle.web.tsx, because Metro resolves a bare './DragHandle' specifier written inside DragHandle.web.tsx back to itself on the web build (a self-import) — this is documented inline in both files so a future edit does not 'simplify' it into a cross-import that breaks web resolution."

patterns-established:
  - "Pattern: gesture direction-locking (activeOffsetY/failOffsetX) resolves a vertical-drag-inside-horizontal-pager conflict without needing to compose the drag gesture against the pager's own gesture, since the pager's gesture is not an RNGH gesture."
  - "Pattern: a day-level (not row-level, not platform-level) boolean threaded down as a prop is how a 'hidden below N items' visibility rule is computed exactly once and shared identically across every row and both platform files."

requirements-completed: [PROG-02]

coverage:
  - id: D1
    description: "Days become swipeable react-native-tab-view pages with a controlled index that survives a day being deleted mid-session; renderTabBar suppressed (04-08's cycle strip owns that space); no DayDeck.web.tsx sibling needed since the library ships its own native/web Pager split, confirmed by reading the installed package's own Pager.ios.tsx/Pager.tsx source"
    requirement: "PROG-02"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/DayDeck.test.tsx (8 cases: dayRoutes, clampDeckIndex boundaries, empty-state, two-route navigationState/swipeEnabled, renderTabBar returns null, stale-index re-clamp)"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) — /programs route bundles with react-native-tab-view in the graph"
        status: pass
    human_judgment: true
    rationale: "No simulator/emulator/device in this worktree (no Xcode, no Android SDK) and this project's CLAUDE.md forbids driving the app in a browser without an explicit request — the actual swipe gesture, its feel, and react-native-tab-view's web PanResponder fallback have not been observed running, only unit-tested and bundled. Deferred to ROADMAP Phase 999.1 (native) and recorded honestly here (web)."
  - id: D2
    description: "An always-visible-whenever-reorderable drag handle (D-23, UI-SPEC-narrowed to day.slots.length >= 2) on every exercise row, gesture-driven on native (Gesture.Pan, direction-locked, no long-press gate) and pointer-events-driven on web, both committing through the identical computeDropTarget/neighboursForIndex pure helpers into moveExercise — a non-renumbering move writes exactly one row"
    requirement: "PROG-02"
    verification:
      - kind: unit
        ref: "apps/mobile/lib/programs/__tests__/reorder-drag.test.ts (11 cases: SLOT_ROW_HEIGHT, every computeDropTarget boundary including the half-row threshold on both sides, both clamps, single-element list; every neighboursForIndex case including moved-row-excluded-from-its-own-neighbours)"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/DragHandle.test.tsx (3 cases: accessibilityRole/Label, 48x48 hit target, unconditional render with no expanded/editing gate)"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) — both DragHandle.tsx and DragHandle.web.tsx exist in the graph; grep-confirmed neither contains Platform.OS or activateAfterLongPress"
        status: pass
    human_judgment: true
    rationale: "Native drag behavior is unobservable in this environment (no Xcode/Android SDK) — DragHandle.tsx rests on typecheck plus correct, Context7-verified API usage only. On web, the actual pointer-driven drag has not been observed running (browser driving is out of scope per CLAUDE.md without an explicit request); additionally this executor could not conclusively confirm via Metro's own resolver API which of DragHandle.tsx/DragHandle.web.tsx the web bundle actually selects at runtime (see Issues Encountered) — the evidence available (successful web export, the established working precedent of this exact convention for _layout.web.tsx/reset-password.web.tsx already in this codebase, and direct source verification of an analogous split in react-native-tab-view's own Pager files) supports but does not prove it. Both are recorded as WINDOWS entries."
  - id: D3
    description: "Reordering is reachable without any gesture: Move up / Move down controls on the expanded ExerciseSlotRow call the identical onReorder(beforeId, afterId) path DragHandle uses, boundary-disabled via accessibilityState={{disabled:true}} rather than removed"
    requirement: "PROG-02"
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx#ExerciseSlotRowView — drag handle and Move up/down (4 new cases: hidden when canReorder omitted, exactly one DragHandle when canReorder true, boundary accessibilityState.disabled at index 0/last, onReorder called with the correct beforeId/afterId pair)"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx — all 20 pre-existing cases pass unmodified (new props are optional, default to hidden)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both targets build with all five new packages (three direct, two transitive) in the dependency graph; docs/platform-modules.md carries an evidence-backed audit row for each of the three direct packages"
    verification:
      - kind: unit
        ref: "pnpm --filter mobile typecheck (0 errors) and pnpm --filter mobile test (495/495 passed, full suite)"
        status: pass
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) — exit 0 after every task, including the two-command sequence (pnpm --filter @fitness/api-contracts build then pnpm --filter mobile typecheck) this worktree needed, matching 04-02/04-03's documented ordering note"
        status: pass
    human_judgment: false

duration: ~100min (approx.)
completed: 2026-08-21
status: complete
---

# Phase 4 Plan 05: Day Deck & Drag Handle Summary

**Swipeable day deck via react-native-tab-view (no web sibling needed — the library ships its own native/web Pager split), plus a gesture-driven drag handle on native and pointer-events on web, both hidden below two exercises per UI-SPEC and both reachable through an identical Move up/down non-gesture path, all committing through the existing gap-based `moveExercise`.**

## Performance

- **Duration:** ~100 min (approx. — not measured from a recorded start timestamp)
- **Completed:** 2026-08-21T10:24:47Z
- **Tasks:** 3 (the leading checkpoint was pre-resolved by this dispatch, not executed as a task)
- **Files modified:** 17 (10 created, 7 modified, excluding the pnpm-lock.yaml dependency-resolution diff)

## Accomplishments
- Installed the three checkpoint-approved packages via `expo install` (Phase 3's `@shopify/flash-list` precedent), which pinned SDK-57-validated versions rather than the audited registry-latest ones the checkpoint table named — `react-native-worklets`/`react-native-pager-view` arrived transitively and were never promoted to direct dependencies, honoring the checkpoint's own prohibition
- Wired `react-native-worklets/plugin` (confirmed via Context7 against `docs.swmansion.com` — Reanimated 4 moved its Babel plugin out of `react-native-reanimated/plugin`) last in `babel.config.js`'s plugin array, and wrapped both rendered branches of `RootLayout` in `GestureHandlerRootView`
- Found and fixed a real bug: `expo install` resolved `react-native-worklets@0.11.3`, but the Expo-pinned `react-native-reanimated@4.5.1` declares a peer of exactly `0.10.x` — this threw `"Worklets (0.11.3) is not compatible with installed version of Reanimated (4.5.1)"` at Reanimated's own module-init time, on every platform, not just in Jest. Fixed via a `pnpm-workspace.yaml` overrides pin to `0.10.4`, matching that file's existing `react`/`react-dom` override precedent, without adding `react-native-worklets` to any `package.json`
- `DayDeck.tsx`: `dayRoutes`/`clampDeckIndex` (pure) plus a hook-free `DayDeckView`/stateful `DayDeck` wrapper around `react-native-tab-view`'s `TabView`; `renderTabBar` suppressed, `SceneMap` deliberately avoided (day pages render a live, reloading tree). Confirmed directly from the installed package's own source (`Pager.ios.tsx`/`Pager.android.tsx` export the native-pager-backed adapter; `Pager.tsx`, the file Metro resolves for web, exports the pure-JS `PanResponderAdapter`) that no `DayDeck.web.tsx` sibling is needed
- `reorder-drag.ts`: `SLOT_ROW_HEIGHT`, `computeDropTarget`, `neighboursForIndex` — pure, zero react/react-native/drizzle-orm imports, no `order_index` reference anywhere; every arithmetic branch (half-row threshold on both sides, both clamps, single-element list, moved-row-excluded-from-its-own-neighbours) is unit-asserted
- `DragHandle.tsx` (native, gesture-handler + reanimated) and `DragHandle.web.tsx` (pointer events) — both always render whenever the day page says reordering is possible (`day.slots.length >= 2`, computed once and passed down, never per row or per platform file — the UI-SPEC's binding D-23 amendment), never behind a long press, and both commit through the identical `computeDropTarget`/`neighboursForIndex` pair into the caller's `onReorder(beforeId, afterId)`
- `ExerciseSlotRow.tsx` gained a real leading column for `DragHandle` (04-03's shipped row did not literally have one despite its own SUMMARY's forward-looking note) plus Move up/Move down controls in the expanded state, each boundary-disabled via `accessibilityState={{disabled:true}}` rather than removed — the non-gesture reorder path PROG-02's "add, remove, and reorder" now genuinely covers
- `programs.tsx` wires `moveExercise` through a single `handleReorderExercise` callback that both the gesture and non-gesture paths funnel into, and replaces the vertical day-section stack with `<DayDeck>`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install and wire the three packages, and prove both targets still build** - `590ba0d` (feat)
2. **Task 2: Days become swipeable pages** - `0a9adc0` (feat)
3. **Task 3: An always-visible drag handle, with a non-gesture path to the same write** - `414cf67` (feat)

_Note: all three tasks carried `tdd="true"`; consistent with this phase's established precedent, tests and implementation were committed together after being verified green together (single `feat` commits, not split RED/GREEN)._

## Files Created/Modified
- `apps/mobile/components/DayDeck.tsx` - `dayRoutes`, `clampDeckIndex`, `DayDeckView`, `DayDeck`
- `apps/mobile/components/__tests__/DayDeck.test.tsx` - 8 cases
- `apps/mobile/components/DragHandle.tsx` - native `DragHandleView` + stateful `DragHandle` (Gesture.Pan, direction-locked)
- `apps/mobile/components/DragHandle.web.tsx` - web `DragHandleView` + stateful `DragHandle` (pointer events)
- `apps/mobile/components/__tests__/DragHandle.test.tsx` - 3 cases (native `DragHandleView`)
- `apps/mobile/lib/programs/reorder-drag.ts` - `SLOT_ROW_HEIGHT`, `computeDropTarget`, `neighboursForIndex`
- `apps/mobile/lib/programs/__tests__/reorder-drag.test.ts` - 11 cases
- `apps/mobile/jest-setup.js` - new: `react-native-worklets` Jest mock + Reanimated `setUpTests()`
- `apps/mobile/package.json` - the three direct-dependency installs
- `apps/mobile/babel.config.js` - `react-native-worklets/plugin`, last in the plugins array
- `apps/mobile/jest.config.js` - `setupFilesAfterEnv`, `transformIgnorePatterns` extended for all five new packages
- `apps/mobile/app/_layout.tsx` - `GestureHandlerRootView` wraps both rendered branches
- `apps/mobile/components/ExerciseSlotRow.tsx` - leading `DragHandle` column, Move up/down controls, `canReorder`/`orderedIds`/`index`/`onReorder` (all optional, default hidden)
- `apps/mobile/components/__tests__/ExerciseSlotRow.test.tsx` - 4 new cases added (20 pre-existing unmodified)
- `apps/mobile/app/(tabs)/programs.tsx` - `<DayDeck>` replaces the vertical day stack; `handleReorderExercise` wires both reorder paths to `moveExercise`
- `docs/platform-modules.md` - three new audit rows (tab-view, gesture-handler, reanimated)
- `pnpm-workspace.yaml` - `react-native-worklets: 0.10.4` override, documented inline

## Decisions Made
- Followed `expo install`'s SDK-pinned versions over the checkpoint table's audited registry-latest ones — see key-decisions above
- Kept `react-native-worklets`/`react-native-pager-view` as transitive-only peers per the checkpoint's own prohibition, fixing the real version mismatch via a workspace-level override instead
- Followed 04-UI-SPEC.md's binding D-23 amendment (drag handle hidden below two exercises) over this plan's own pre-amendment "always visible" task text — see key-decisions above
- Interpreted "drive a translation through useAnimatedStyle on the row" as handle-local pointer-following feedback, not a full-row live-reorder animation, consistent with Surface C's own explicit opt-out of layout/entering/exiting animations — see key-decisions above
- Duplicated `DragHandleView`'s render body across the native/web pair rather than cross-importing, to avoid a Metro self-import trap — see key-decisions above

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `react-native-worklets` resolved to a version incompatible with the Expo-pinned Reanimated**
- **Found during:** Task 3, first `DragHandle.test.tsx` run
- **Issue:** `expo install` resolved `react-native-worklets@0.11.3` as a transitive peer, but `react-native-reanimated@4.5.1` (the Expo-pinned version Task 1 installed) declares a peerDependency of exactly `"0.10.x"`. This is not a Jest artifact — Reanimated's own module-init code asserts the Worklets version and throws `"[Reanimated] Your installed version of Worklets (0.11.3) is not compatible with installed version of Reanimated (4.5.1)"` on every platform the moment `react-native-reanimated` is imported, so it would have broken the native and web runtime too, not just tests.
- **Fix:** Pinned `react-native-worklets: 0.10.4` (the latest 0.10.x release, satisfying both Reanimated's `0.10.x` peer and `expo-modules-core`'s wider `^0.10.0` range) via `pnpm-workspace.yaml`'s `overrides` map — the same mechanism and location this file already uses for its `react`/`react-dom` pin, discovered only after an initial attempt to add a `pnpm.overrides` key to `apps/mobile/package.json` silently failed (pnpm 11 moved that setting; it now warns "no longer read"). `react-native-worklets` is not listed in any `package.json`'s own `dependencies`, honoring the checkpoint's prohibition on promoting a transitive dependency to a direct one.
- **Files modified:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter mobile peers check` no longer lists `react-native-worklets` as unmet (only two pre-existing, out-of-scope peer warnings remain — `@op-engineering/op-sqlite` and `@powersync/common`, both present before this plan); `DragHandle.test.tsx` and the full 495-test suite pass
- **Committed in:** `414cf67` (Task 3 commit)

**2. [Rule 3 - Blocking] Reanimated requires Jest setup that does not exist yet in this project**
- **Found during:** Task 3, same test run
- **Issue:** Importing any component that imports `react-native-reanimated` fails to even load under Jest without both (a) `react-native-worklets`' own Jest mock and (b) Reanimated's `setUpTests()` — neither existed in this project since nothing imported Reanimated before this plan. The correct mock path (`react-native-worklets/lib/module/mock`, not the package-root `react-native-worklets/mock` the package's own README-adjacent naming might suggest) was confirmed via Context7 against `docs.swmansion.com/react-native-worklets`.
- **Fix:** Added `apps/mobile/jest-setup.js` (mocks `react-native-worklets`, then calls `require('react-native-reanimated').setUpTests()`) and wired it via `setupFilesAfterEnv` in `jest.config.js`.
- **Files modified:** `apps/mobile/jest-setup.js` (new), `apps/mobile/jest.config.js`
- **Verification:** `DragHandle.test.tsx` and the full suite pass with no reanimated-related failures
- **Committed in:** `414cf67` (Task 3 commit)

**3. [Rule 2 - Missing critical functionality] `ExerciseSlotRow` had no literal reserved leading column for the drag handle**
- **Found during:** Task 3, before placing `DragHandle`
- **Issue:** `04-03-SUMMARY.md`'s own "Next Phase Readiness" section states "a fixed-width leading area is already reserved for the 04-05 drag handle" — but the shipped `ExerciseSlotRow.tsx` (read directly) has no such column; the collapsed header was a single full-width `Pressable`.
- **Fix:** Restructured the collapsed header into a `flex-row` with `DragHandle` (when `canReorder`) as a leading sibling and the existing tap-to-expand `Pressable` given `flex-1`, so the grip's hit region and the row's tap-to-expand region are naturally disjoint (UI-SPEC's own requirement) rather than needing a manual carve-out inside one Pressable.
- **Files modified:** `apps/mobile/components/ExerciseSlotRow.tsx`
- **Verification:** All 20 pre-existing `ExerciseSlotRow.test.tsx` cases pass unmodified (the restructuring is additive — the tap-to-expand `Pressable`'s own `accessibilityLabel`/`accessibilityState` are unchanged, findByType traversal locates it regardless of nesting depth)
- **Committed in:** `414cf67` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking dependency/tooling issues, 1 missing-functionality gap found by re-reading the actual shipped file rather than trusting a prior SUMMARY's forward-looking claim). None required an architectural decision or a checkpoint — all three were fixes required for correctness, none changed this plan's scope or files beyond what Task 3 already declared (plus `pnpm-workspace.yaml`, touched under Rule 3 since the alternative — a direct-dependency pin — was explicitly prohibited by the checkpoint).
**Impact on plan:** No scope creep. The worklets version fix in particular would have shipped a Reanimated crash on first native/web use of any Reanimated API had it gone unnoticed — Jest surfaced it immediately rather than it being deferred to an unobservable native runtime.

## Issues Encountered

- **Metro platform-resolution for `DragHandle.tsx`/`DragHandle.web.tsx` was not independently, conclusively verified for the web bundle.** Unlike the `react-native-tab-view` Pager split (verified by reading the installed package's own `Pager.ios.tsx`/`Pager.tsx` source directly), this executor could not get Metro's own resolver API to run cleanly in this worktree (a `metro-resolver` invocation attempt failed to resolve cleanly under pnpm's isolated `node_modules` layout, and the worktree-isolation sandbox additionally blocked a more elaborate diagnostic command). A `grep` of the exported web bundle for markers unique to each file was inconclusive: `reorder-three-outline` (the shared glyph name, present verbatim in both files) appeared twice, and reanimated-specific identifiers (`withSpring`) appeared in the bundle — but `react-native-gesture-handler` (used unconditionally by `GestureHandlerRootView` in `app/_layout.tsx` on both platforms) has its own internal, best-effort `require('react-native-reanimated')` integration file, which is a plausible, mundane explanation for those matches that does not require `DragHandle.tsx` itself to have been included in the web bundle. The evidence actually in hand — `expo export --platform web` succeeding with no resolution errors, and this exact `.web.tsx` sibling convention already working and documented for `_layout.tsx`/`reset-password.tsx` in this same codebase — supports but does not prove that `DragHandle.web.tsx` is what the web bundle actually renders. Recorded honestly rather than asserted as verified; see the WINDOWS entry below.
- No Xcode/Android SDK in this worktree (inherited constraint from every prior Phase 4 plan) — the day deck's swipe and the drag handle's gesture have not been observed on a real device or simulator.
- This project's CLAUDE.md forbids driving the app in a browser without an explicit request, so even the web target's actual interactive behavior (the swipe feel, the pointer-drag feel) was not observed in this session — only unit-tested and bundled. Stated plainly per this dispatch's own instruction not to overstate "the build passed" as evidence the interaction works.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `DayDeck` and `DragHandle`/`DragHandle.web.tsx` are both in place for 04-08 (Cycle Strip) to extend — the cycle strip renders above `DayDeck`, which already suppresses its own library tab bar (`renderTabBar={() => null}`) to make room for it.
- `ExerciseSlotRow`'s new `canReorder`/`orderedIds`/`index`/`onReorder` props are all optional and default to "hidden" — any future caller that does not care about reordering (e.g. a read-only display context) can omit them with no behavior change.
- **Blocker/concern:** No Xcode/Android SDK on this machine, and no browser-driven verification per project policy — the day deck's swipe and the drag handle's gesture (native and web) remain unobserved beyond unit tests and successful bundling. See the WINDOWS entries below, all deferred to ROADMAP Phase 999.1.
- **Blocker/concern:** the Metro platform-resolution question above (which of `DragHandle.tsx`/`DragHandle.web.tsx` the web bundle actually selects) was not conclusively re-verified independently for this specific file pair — flagged for a future session with better tooling access to confirm definitively, though the risk is low given the identical, already-working convention elsewhere in this codebase.

---
*Phase: 04-program-builder*
*Completed: 2026-08-21*

## Deferred WINDOWS Entries

- **kind:** unrun-verify — **file:** `apps/mobile/components/DayDeck.tsx` — **description:** The day-deck horizontal swipe has been observed on neither iOS nor Android (no Xcode/Android SDK in this worktree), and not driven in a browser either per this project's CLAUDE.md — verified only via `DayDeck.test.tsx` (8 cases) and `pnpm --filter mobile build`.
- **kind:** unrun-verify — **file:** `apps/mobile/components/DragHandle.tsx` — **description:** The native drag gesture (Gesture.Pan, direction-locking against the day deck's swipe) has been observed on neither iOS nor Android — verified only via `DragHandle.test.tsx` (3 cases, the hook-free view only), typecheck, and `pnpm --filter mobile build`.
- **kind:** unrun-verify — **file:** `apps/mobile/components/DragHandle.web.tsx` — **description:** The web pointer-events drag has not been driven in a browser (out of scope for this executor per CLAUDE.md without an explicit request) — verified only via typecheck and `pnpm --filter mobile build`. Additionally, which of `DragHandle.tsx`/`DragHandle.web.tsx` Metro actually resolves into the web bundle at runtime was not independently, conclusively confirmed this session (see Issues Encountered) — the working precedent of the identical convention for `_layout.web.tsx`/`reset-password.web.tsx` elsewhere in this codebase is the strongest available evidence, not a direct verification of this specific pair.
- **kind:** deviation — **file:** `apps/mobile/babel.config.js` — **description:** The `react-native-worklets/plugin` Babel plugin's actual runtime behavior on a native build (does the worklet genuinely run on the UI thread on-device) is unobservable in this environment — the plugin's presence and correctness were confirmed against `expo export --platform web` succeeding and the installed package's own compatibility metadata, not against a running native app.
