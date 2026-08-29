# Phase 9: Records & Client Analytics — Pattern Map

**Mapped:** 2026-08-29
**Mode:** unattended `/gsd-start`; every judgement call is labelled `[CLAUDE'S CALL]`.
**Files analysed:** 14 plausible new files across 5 categories
**Analogs found:** 13 / 14 (one genuine gap — no chart primitive exists anywhere in the repo)

---

## File Classification

| Plausible new file | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `packages/analytics-engine/package.json` + `tsconfig.json` + `jest.config.js` | package config | n/a | `packages/progression-engine/{package.json,tsconfig.json,jest.config.js}` | exact |
| `packages/analytics-engine/src/index.ts` | barrel | n/a | `packages/progression-engine/src/index.ts` | exact |
| `packages/analytics-engine/src/*.ts` (bucketing, trend, weekly-progress) | pure computation | transform | `packages/progression-engine/src/{normalize-history,shortfall,expected-performance}.ts` | exact |
| `packages/analytics-engine/src/__tests__/*.test.ts` | unit test | transform | `packages/progression-engine/src/__tests__/shortfall.test.ts` | exact |
| `packages/analytics-engine/src/__fixtures__/*.ts` (only if api must share) | test fixture | transform | `packages/progression-engine/src/__fixtures__/parity.ts` | exact |
| `apps/mobile/lib/db/records-query.ts` | local read | CRUD read | `apps/mobile/lib/db/history-query.ts` | exact |
| `apps/mobile/lib/db/exercise-history-query.ts` | local read | CRUD read | `apps/mobile/lib/db/summary-query.ts` | exact |
| `apps/mobile/lib/db/weekly-progress-query.ts` | local read | CRUD read | `apps/mobile/lib/db/summary-query.ts` + `programs/targets.ts` | role-match |
| `apps/mobile/app/records/index.tsx` (+ `_layout.tsx`) | screen/route | request-response | `apps/mobile/app/exercises/index.tsx` + `apps/mobile/app/exercises/_layout.tsx` | exact |
| `apps/mobile/app/records/[exerciseId].tsx` | detail route w/ param | request-response | `apps/mobile/app/exercises/[id].tsx` | exact |
| `apps/mobile/components/PerformanceChart.tsx` | presentational (SVG) | transform | **no analog — see "No Analog Found"** | none |
| `apps/mobile/components/RecordRow.tsx` | presentational row | n/a | `apps/mobile/components/SessionHistoryRow.tsx` | exact |
| `apps/mobile/components/WeeklyProgressCard.tsx` | presentational card | n/a | `apps/mobile/components/RecommendationBanner.tsx` / `WorkoutSummary.tsx` | exact |
| metric switcher / range switcher | presentational control | n/a | `apps/mobile/components/SelectField.tsx` (**reuse, do not rewrite**) | exact |
| `apps/mobile/e2e/records.spec.ts` (+ harness/config edits) | e2e test | event-driven | `apps/mobile/e2e/workout-summary.spec.ts` | exact |

---

## 1. Pure computation package

### Anatomy to copy: `packages/progression-engine/`

```
packages/progression-engine/
  package.json
  tsconfig.json
  jest.config.js
  src/
    index.ts            <- barrel, `export * from './x'` per module, no default export
    <one-concern>.ts    <- one exported concern per file, kebab-case filename
    result.ts           <- shared types for the package
    __fixtures__/parity.ts
    __tests__/<same-name-as-source>.test.ts
```

**`package.json`** (`packages/progression-engine/package.json`) — copy field-for-field, changing only `name`:

- `"name": "@fitness/analytics-engine"`, `"version": "0.0.0"`, `"private": true`
- `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, `"files": ["dist"]`
- **No `exports` map exists in this repo.** Both existing pure packages resolve through `main`/`types` only. Do not introduce a subpath export map — `progression-engine/src/index.ts` carries a comment explaining that the fixture is re-exported from the public barrel *precisely* to avoid one.
- scripts: `"build": "tsc"`, `"typecheck": "tsc --noEmit"`, `"test": "jest"`
- dependencies: `"@fitness/api-contracts": "workspace:*"` (and `@fitness/pr-rules": "workspace:*"` for this phase — D-01 requires reuse)
- devDependencies verbatim: `@types/jest ^30`, `@types/node ^22.10.0`, `jest ^30`, `ts-jest ^29.2.5`, `typescript ^5.9.2`

**`tsconfig.json`** — copy verbatim: `target ES2022`, `module CommonJS`, `moduleResolution Node`, `lib ["ES2022"]` (note: **no `DOM`** — this is what structurally prevents a clock/`window` read, reinforcing D-10), `strict`, `declaration`, `outDir dist`, `rootDir src`, `include ["src/**/*.ts"]`, `exclude ["src/__tests__/**/*"]`.

**`jest.config.js`** — copy verbatim, all three lines:
```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs'],
};
```
The custom reporter is mandatory house style — every package and both apps register `scripts/jest-suite-integrity.cjs`.

**How the apps resolve it:** `pnpm-workspace.yaml` globs `packages/*`; each app declares `"@fitness/<pkg>": "workspace:*"` in its own `dependencies` (`apps/mobile/package.json` already lists api-contracts, plate-math, pr-rules, progression-engine; `apps/api/package.json` lists api-contracts and progression-engine). Consumers import the **package name**, never a relative or `dist/` path. `turbo.json` gives `typecheck` and `test` a `dependsOn: ["^build"]`, so the package's `dist/` must be built before either app typechecks — a new package needs no turbo.json edit, but a fresh worktree needs `pnpm build` before mobile tests resolve the import.

**`packages/pr-rules/` (must be reused, per D-01/D-02):**
- Identical config anatomy; barrel `packages/pr-rules/src/index.ts` re-exports `./estimated-1rm`, `./personal-records`, `./warmup`.
- `estimated1RM` returns `null` above `E1RM_MAX_VALID_REPS = 10` — every new e1RM surface must branch on that `null` (D-02, ANLY-10), never coerce it to a number.
- `foldPriorBest` / `detectPrs` / `PriorBest` / `CandidateSet` / `DetectedPr` / `emptyPriorBest` are the PR vocabulary. Do not fork.
- Consumption exemplar: `apps/mobile/lib/db/personal-record.ts` lines 1–3 import `{ detectPrs, foldPriorBest, type CandidateSet, type PriorBest } from '@fitness/pr-rules'`.

**Test placement:** `src/__tests__/<source-name>.test.ts`, one test file per source file, same kebab name. Fixtures live in `src/__fixtures__/` and contain **data only — no `describe`/`it`/`expect` and no test-framework import** (see the doc comment at the head of `packages/progression-engine/src/__fixtures__/parity.ts`), which is what lets three different jest configs (ts-jest, jest-expo, api ts-jest) import the same table.

---

## 2. Screens / routes

**Tab shell:** `apps/mobile/app/(tabs)/_layout.tsx` uses `NativeTabs` from `expo-router/unstable-native-tabs` with five hard-coded `NativeTabs.Trigger`s (index, programs, workout, history, profile). Its own comment states the five are written out rather than mapped so the set is fixed at build time. `apps/mobile/app/(tabs)/_layout.web.tsx` is the web counterpart.

**[CLAUDE'S CALL] Do not add a sixth tab.** CONTEXT.md says the tab structure "should not be restructured", and the layout comment forbids a filterable set. Put Phase 9's surfaces in a new **root stack segment** `app/records/`, entered from the existing History and/or Profile tab — this is exactly how `exercises/`, `programs/` and `gym-profiles/` already live. Reversible: promoting a segment to a tab later is additive.

**Registering a new segment (three edits, all mandatory together):**

1. `apps/mobile/lib/navigation/root-stack.tsx` — add `<Stack.Screen name="records" />` **inside `<Stack.Protected guard={signedIn}>`**, alongside `(tabs)`, `exercises`, `programs`, `gym-profiles`. This is the only authorization declaration; `app/_layout.tsx` calls `renderRootStack(signedIn)` and needs no edit.
2. `apps/mobile/app/records/_layout.tsx` — copy `apps/mobile/app/programs/_layout.tsx` verbatim in shape:
   - `export const unstable_settings = { anchor: 'index' };`
   - `screenOptions={{ headerShown: true, headerLeft: () => <NavBackButton fallbackHref="/records" />, gestureEnabled: true, fullScreenGestureEnabled: true }}`
   - one `<Stack.Screen name="..." options={{ title: '...' }} />` per route
   - **Do not add a second guard here** — both existing `_layout.tsx` files carry an explicit comment forbidding it.
3. The route files themselves.

**Detail route with a param:** `apps/mobile/app/exercises/[id].tsx` is the exemplar — `useLocalSearchParams` from `expo-router`, plus the pattern of extracting a pure `resolveDetailScreenState(ensure, loader)` classifier next to the component so the not-found/error/hydrating branches are unit-testable without mounting hooks. Copy that split; it is what `apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts` tests.

**Screen-state derivation idiom:** `deriveHistoryScreenState` in `apps/mobile/app/(tabs)/history.tsx` (`'error' | 'loading' | 'empty' | 'ready'`, failed beats everything, `null` page means not-landed-yet, landed-with-zero-rows is the real empty state). Mirrors `deriveHomeScreenState` in `(tabs)/index.tsx`. **This is the mechanism for D-09** — an empty metric is the `'empty'` branch, never a zero datum.

**Screens export a `*View` component plus a hook/container.** `WorkoutScreenView` + `useWorkoutScreen`, `HistoryScreenViewProps`, `WorkoutSummaryView` — the hook-free `*View` is what unit tests and the durability harness mount. Follow it; the harness depends on it.

---

## 3. Presentational components & theming

**Theming idiom — two layers, both required:**

- **Class-based tokens** (the default): NativeWind classNames over the CSS variables in `apps/mobile/global.css` — `--color-background/surface/accent/destructive/foreground/foreground-muted`, with a `.dark` block overriding all six. Light/dark is handled entirely by tailwind `darkMode: 'class'`; **components never branch on scheme themselves.** Class vocabulary in use: `bg-surface`, `text-foreground`, `text-foreground-muted`, `text-accent`, `text-destructive`, `border-accent`, `border-foreground-muted`, `rounded-md`, `px-md py-sm`, `gap-xs/sm/md`, `text-body`/`text-label`, `font-normal`/`font-semibold`.
- **Resolved color values** (only where a non-DOM API needs a `ColorValue`): `useThemeColors()` from `apps/mobile/lib/theme-colors.ts`, returning `ThemeColors { accent, foregroundMuted, surface }`. It uses **NativeWind's `useColorScheme`, not React Native's** — the file's head comment explains why RN's hook misses the in-app override on web. **`react-native-svg` `fill`/`stroke` props take resolved colors, so the chart components must consume `useThemeColors()`, not classNames.** If the chart needs a colour the palette lacks, extend `ThemeColors` *and* `global.css` together — the interface's comment says these duplicate each other and must be edited together.
- App-wide appearance state: `apps/mobile/lib/theme.ts` (`useAppearance`, `applyAppearance`, `APPEARANCE_STORAGE_KEY`). Not needed by new components.

**Strongest exemplar to copy for a row:** `apps/mobile/components/SessionHistoryRow.tsx` — hook-free `SessionHistoryRowView({ row, colors, onPress, onOverflowPress })` taking `colors` as a **prop** (`colors: { foregroundMuted: string }`) rather than calling the hook, so it renders inside the durability harness and in direct-invocation tests. Note its `MIDDLE_DOT = ' · '` fact-line convention and the `minHeight: 48` / `minWidth: 48` touch-target rule that every Pressable in the repo carries.

**Strongest exemplar for a card with badges/derived cells:** `apps/mobile/components/WorkoutSummary.tsx` — `WorkoutSummaryView`, `deriveRowDisplay`, `formatBreakdownLine`, `formatE1rm`, and `renderPrBadges` written as a **plain function returning elements, not a `<PrBadges />` component** (comment at line ~45 explains: a component element stays an opaque node to the direct-invocation test walker). Copy that discipline for any chart sub-part that must be assertable in a unit test.

**Sheets:** `apps/mobile/components/TargetsSheet.tsx`, `HistoryActionSheet.tsx`, `SetTypePickerSheet.tsx` — each has a matching `components/__tests__/<Name>.test.tsx`.

**Export style:** named exports only (`export function Foo`), no default exports outside `app/` route files. Component file = PascalCase, lib file = kebab-case.

---

## 4. Reading local data

**Established one-shot read idiom** (`apps/mobile/lib/db/history-query.ts`, `summary-query.ts`, `personal-record.ts`, `programs/next-up-query.ts`):

```ts
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { WORKING_VOLUME_EXCLUDED_SET_TYPES } from '@fitness/api-contracts';
import { getPowerSync, type WriteDb } from './powersync';
import { loggedSet, sessionExercise, workoutSession } from './schema';

export async function loadX(input: LoadXInput, db: WriteDb = getPowerSync()): Promise<X> { ... }
```

Rules the exemplars enforce and Phase 9 must follow:
- **`db: WriteDb = getPowerSync()` as the last, defaulted parameter** — this is what makes every reader injectable for `__tests__` and for `__durability.web.tsx`.
- **Batched reads, never one query per row** (`history-query.ts`: "Two queries, never one per row (PITFALLS §13)"; `personal-record.ts`: "One batched read per table, never one per exercise"). A per-exercise trend query loop would violate this.
- `getPowerSync` resolves via platform extension: `lib/db/powersync.ts` (native) / `lib/db/powersync.web.ts` (web).
- No `user_id` row filter on session tables — `history-query.ts` documents that `workout_session.user_id` is stamped server-side on sync push only, so an offline session carries a null locally. The guard is "is anyone signed in at all" (`if (!userId) return EMPTY_PAGE;`).
- Keyset cursors `(startedAt, id)`, never `OFFSET`.
- Test placement: `apps/mobile/lib/db/__tests__/<same-name>.test.ts`.

### Reactive / live queries — **no analog exists; flag this**

There is **zero** use of PowerSync's `.watch()`, `useQuery`, or any live-query hook anywhere in `apps/mobile`. Every screen refreshes with `useFocusEffect` + an `active` cancellation flag. The canonical excerpt is `apps/mobile/app/(tabs)/index.tsx` lines ~217–243, whose own comment names the gap explicitly:

> "This does not make the card reactive: a change arriving from the other device while Home is already focused still waits for the next focus. Closing that needs a PowerSync watched query over the seven tables the card derives from."

`useFocusEffect` callers today: `(tabs)/index.tsx`, `(tabs)/history.tsx`, `(tabs)/workout.tsx`, `(tabs)/profile.tsx`, `components/EditingWorkoutScreen.tsx`.

**[CLAUDE'S CALL] for ANLY-08's "immediately after logging":** the weekly-progress surface should first satisfy D-03/criterion 4 with the existing `useFocusEffect` idiom — navigating back from the workout screen re-focuses and re-reads, which *does* deliver "immediately after logging, before any sync" on the same device. Only if a plan needs same-screen live updates should it introduce `PowerSyncDatabase.watch()`; if it does, that is a **new house pattern** and should be introduced in exactly one dedicated helper (e.g. `lib/db/use-watched-query.ts`) rather than inlined in a screen. Reversible either way.

**Data sources Phase 9 will read:** `loggedSet`, `sessionExercise`, `workoutSession`, `personalRecord`, `exerciseMuscleMapping`, `muscleGroup` (all in `apps/mobile/lib/db/schema.ts`); targets via `apps/mobile/lib/db/programs/targets.ts` and `programs/load-program.ts` for D-08's program-derived denominators.

---

## 5. Segmented / switcher controls — **reuse, do not reinvent**

**Analog: `apps/mobile/components/SelectField.tsx`.** Already the repo's chip picker over a closed option set: `SelectFieldProps { label, value: string | null, options: SelectFieldOption[], placeholder, onChange, error? }`, chips with `accessibilityRole="button"`, `accessibilityState={{ selected }}`, `accessibilityLabel={option.label}`, an `Ionicons` checkmark on the selected chip, `border-accent` vs `border-foreground-muted`, `minWidth/minHeight: 48`.

Phase 8's precedent is `ProgressionPreferenceRow` in `apps/mobile/app/(tabs)/profile.tsx` (lines ~57–85), which wraps `SelectField` with a module-level `PROGRESSION_PREFERENCE_OPTIONS: SelectFieldOption[]` const and a comment that says exactly what Phase 9 should conclude: *"A closed two-value set, so SelectField's chip picker fits without a new form primitive."*

**Copy that shape for both switchers.** ANLY-02's PR-metric switcher and ANLY-03's metric/range switchers are closed option sets — declare `PR_METRIC_OPTIONS` / `CHART_METRIC_OPTIONS` / `CHART_RANGE_OPTIONS` as module-level `SelectFieldOption[]` consts and pass them to `SelectField`. Do **not** add a new segmented-control component. (`apps/mobile/components/FilterChipRow.tsx` is the multi-select sibling — use it only if a switcher is genuinely multi-select, which none of ANLY-02/03 are.) The `accessibilityState={{ selected }}` on these chips is also the Playwright selector hook.

---

## 6. Tests

### Jest unit tests

| Location | Config | Convention |
|---|---|---|
| `packages/*/src/__tests__/*.test.ts` | `preset: ts-jest`, `testEnvironment: node` | one test file per source file, same kebab name |
| `apps/mobile/**/__tests__/*.test.ts(x)` | `apps/mobile/jest.config.js`, `preset: jest-expo`, `setupFilesAfterEach: jest-setup.js` | co-located `__tests__/` beside the source dir; `e2e/` is in `testPathIgnorePatterns` |

Both register `reporters: ['default', '<rootDir>/../../scripts/jest-suite-integrity.cjs']` — a new package's jest.config must too.

Cross-runtime shared-fixture technique (Phase 8, if Phase 9 needs client/server parity for Phase 10's benefit): `packages/progression-engine/src/__fixtures__/parity.ts` exports a `ParityCase[]` with a `requirement` string per case; three runners import it — `packages/progression-engine/src/__tests__/parity.test.ts`, `apps/api/src/progression/__tests__/parity.spec.ts`, `apps/mobile/lib/db/__tests__/progression-parity.test.ts`. Note the api-side uses `.spec.ts`, mobile uses `.test.ts`.

### Playwright durability specs

**Strongest exemplar to copy: `apps/mobile/e2e/workout-summary.spec.ts`** (152 lines — closest in shape to what Phase 9 needs: seed prior history, drive real DOM, assert a derived analytics figure). Runner-up for a read-only list surface: `apps/mobile/e2e/history.spec.ts`.

Conventions, all visible in that file:
1. `import { expect, test } from '@playwright/test';` and `import { DURABILITY_HARNESS_GLOBAL } from '../lib/db/durability-harness-key';` — a **relative** import of that one leaf module, which has no imports at all by design (its head comment explains: any transitive `./powersync` import breaks under Playwright's Node ESM).
2. Each spec declares its **own local `interface XHarness`** naming only the harness methods it uses, plus `type HarnessWindow = Record<string, XHarness>`. `page.evaluate` does not carry closures, so every callback re-declares the cast inline and receives `DURABILITY_HARNESS_GLOBAL` as an argument.
3. Boot: `await page.goto('/__durability'); await page.waitForSelector('[data-testid="durability-harness-ready"]');`
4. Then either `useProductionDb()` (required when the real route calls `getPowerSync()` itself, e.g. `app/workout-summary.tsx` — this will apply to Phase 9's new routes unless they take an injectable `db` prop) or `open()` / `openWithFilename(name)` for an isolated test database.
5. Selectors are **role + accessible name**: `page.getByRole('button', { name: 'Mark set complete' })`. `data-testid` is used only for the harness-ready sentinel. Build new surfaces with real `accessibilityLabel`s.
6. Polling uses `expect.poll` over a raw harness DB read.
7. Seeding goes through real helpers exported from `apps/mobile/lib/db/test-support.ts` (`seedPriorHeaviestSet`, `seedProgrammedSession`, `seedProgressionHistory`, `readLoggedSetsRaw`, …), signature `(db: TestWriteDb, input) => …`; the harness re-exposes them. **The harness re-implements no insert** — new seeds are added to `test-support.ts`, not to the spec.
8. **Registration:** a new spec is invisible unless its filename is appended to the `testMatch` array of the `durability` project in `apps/mobile/playwright.config.ts` (currently 19 entries). Note `workers: 1` and `fullyParallel: false` are deliberate — do not touch.
9. Run with `pnpm --filter mobile test:e2e:durability`. Browser/E2E execution is standing-authorized in this repo (`.claude/CLAUDE.md`), so **execute the spec; do not record it as `unrun-verify`** the way `workout-summary.spec.ts` had to.

---

## Shared Patterns

### The working-set predicate (must not be re-derived)
**Source:** `packages/api-contracts/src/session.ts` lines 20–49.
```ts
export const WARMUP_SET_TYPE: SetType = 'warmup';
export function countsTowardWorkingVolume(setType: SetType): boolean { return setType !== WARMUP_SET_TYPE; }
export function countsTowardRecords(setType: SetType): boolean { return setType !== WARMUP_SET_TYPE && setType !== 'partial'; }
export const WORKING_VOLUME_EXCLUDED_SET_TYPES = SET_TYPES.filter((t) => !countsTowardWorkingVolume(t));
export const RECORDS_EXCLUDED_SET_TYPES = SET_TYPES.filter((t) => !countsTowardRecords(t));
```
**Apply to:** every Phase 9 aggregation. Volume/rep aggregation uses `countsTowardWorkingVolume`; anything PR- or e1RM-flavoured uses the stricter `countsTowardRecords`. SQL callers use the derived `*_EXCLUDED_SET_TYPES` tuples with `notInArray`, because Drizzle cannot call a JS predicate per row.

### Two different, deliberately divergent set counts
**Source:** `apps/mobile/lib/db/summary-query.ts` `ExerciseBreakdown` (lines ~18–33), whose comments spell it out:
- `completedSetCount` / `totalReps` / `volumeKg` — **child-inclusive** (every `countsTowardWorkingVolume` row, drop-set children included).
- `completedWorkingSetCount` — **parent rows only**, the "how many sets did the lifter do" figure.

### `countCompletedWorkingSets` — the exact predicate ANLY-08 must agree with
**Source:** `apps/mobile/components/ExerciseStrip.tsx` lines 59–62:
```ts
export function countCompletedWorkingSets(sets: ExerciseChipSet[]): number {
  return sets.filter((set) =>
    set.parentSetId === null &&
    countsTowardWorkingVolume(set.setType as SetType) &&
    set.completed
  ).length;
}
```
Three conjuncts: **parent rows only**, **not a warm-up**, **completed**. The same rule is enforced in `lib/session/auto-advance.ts` (`shouldAutoAdvance`, D-19) and `summary-query.ts` (`completedWorkingSetCount`). ANLY-08's "sets" target must use this exact predicate — a drop set is one set, not three. **[CLAUDE'S CALL]** the cleanest way to guarantee agreement is for the pure analytics package to export the predicate (or import it from `@fitness/api-contracts`) and for `ExerciseStrip` to be left untouched — a sixth copy of the rule is what the D-17/D-10 comments were written to prevent.

### Error handling / graceful degradation
- Screens classify into a state union (`deriveHistoryScreenState`, `resolveDetailScreenState`) rather than throwing; the reader returns an `EMPTY_PAGE`-style neutral value on a missing user.
- `Promise.allSettled` per independent read so one failure does not blank a whole screen — exemplar `apps/mobile/app/(tabs)/profile.tsx` lines ~164–178.
- Per-item try/catch to isolate one bad row (UI-SPEC E9 backstop) — exemplar `deriveRowDisplay` in `WorkoutSummary.tsx`.
- Persist failures are swallowed, never surfaced as errors (`lib/theme.ts` `setAppearance`).

### Numeric representation
Weights are **decimal strings, never floats** — `numeric(10,3)`, formatted via `value.toFixed(3)` (`personal-record.ts` `formatPrValue`), constant `CANONICAL_KG_SCALE` in `@fitness/api-contracts`. Any chart must convert string→number at the render boundary only, and any value written back must go through the string form.

---

## Seams — files multiple parallel plans will touch

| File | Why it is a seam | Rule for executors |
|---|---|---|
| `apps/mobile/app/__durability.web.tsx` (544 lines) | **Undeclared cross-phase seam.** Every e2e-bearing plan in every phase edits it — one import block, one `window[DURABILITY_HARNESS_GLOBAL]` object literal, one set of mutually-exclusive `useState` mount slots. | **Append-only.** Add imports at the end of the relevant group, add new harness methods at the end of the object literal, add a new mount slot alongside the existing ones (they are mutually exclusive by convention — preserve that). Never reorder, never reformat, never re-implement a write the real `lib/db/*` helper already does. |
| `apps/mobile/playwright.config.ts` | Every e2e plan appends its spec filename to the `durability` project's `testMatch` array. | Append at the end of the array only. Do not touch `workers: 1` / `fullyParallel: false` / `webServer`. |
| `apps/mobile/lib/db/test-support.ts` | Every e2e plan adds `seedX` / `readXRaw` helpers plus their exported input types. | Append-only; new exports at the end. The harness's import block must be updated in the same commit. |
| `.planning/WINDOWS.md` | ~1985 lines of a single JSON array, currently at id 154, edited by nearly every plan; **has already caused merge conflicts**, and ids are allocated next-free by the CLI so ranges cannot be reserved. | Append entries only; expect to renumber at merge rather than reserve a range. |
| `apps/mobile/lib/navigation/root-stack.tsx` | Any plan adding a route segment edits the single `<Stack.Protected>` block. | One line per segment, inside the signed-in guard. Assign a single owner if two plans add segments. |
| `apps/mobile/lib/theme-colors.ts` + `apps/mobile/global.css` | The `ThemeColors` interface and the CSS variables duplicate each other by design and **must be edited together**. | If the chart plan needs a new token, it owns both edits in one commit; no other plan touches them. |
| `apps/mobile/package.json` | D-06's single new dependency `react-native-svg`. | Exactly one plan owns adding it (plus the `pnpm-workspace.yaml` `minimumReleaseAgeExclude` entry if pnpm's release-age gate rejects the version). Every other plan assumes it is present. |
| `apps/mobile/lib/db/schema.ts` | Shared by all readers. | Phase 9 is read-only against it; no plan should modify it. |
| `apps/mobile/app/(tabs)/history.tsx` / `(tabs)/profile.tsx` | Whichever plan adds the entry point into `/records` edits an existing tab screen. | Assign one owner for the entry-point edit. |

---

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `apps/mobile/components/PerformanceChart.tsx` (and any axis/line/bar sub-part) | presentational, SVG | **There is no chart component anywhere in this repo, and `react-native-svg` is not a declared dependency of `apps/mobile`** (it appears only as a transitive entry in `pnpm-lock.yaml`, 3 occurrences, pulled in by other packages — it is not importable from app code until declared). No `<Svg>` usage exists in `apps/mobile/components`. |

**Nearest structural precedents to copy instead of inventing a convention:**
- **Shape:** `apps/mobile/components/PlateStrip.tsx` + `apps/mobile/components/__tests__/PlateStrip.test.tsx` — the closest thing the repo has to "render a computed geometric strip from a pure calculation": the maths lives in `@fitness/plate-math`, the component only renders. Mirror that split exactly (`@fitness/analytics-engine` computes points/domains/ticks; the component maps them to `<Polyline>`/`<Line>`/`<Rect>`).
- **Colours:** `useThemeColors()` from `lib/theme-colors.ts` (SVG props need resolved values, not classNames).
- **Testability:** `renderPrBadges` in `WorkoutSummary.tsx` — return elements from a plain function, not a nested component, so the direct-invocation test walker can see them.
- **Empty state:** `deriveHistoryScreenState`'s `'empty'` branch — D-09 forbids a flat line at zero.
- **Platform:** one file, no `.web.tsx` split (D-05). `react-native-svg` renders to real DOM `<svg>` under `react-native-web`, which is what makes the Playwright durability evidence possible; use `accessibilityLabel` on the container so a spec can assert it.
- **Web-only escape hatch, if ever needed:** `components/DragHandle.tsx` / `DragHandle.web.tsx` is the repo's platform-extension precedent — but D-05 says do not use it here.

---

## Metadata

**Search scope:** `packages/{pr-rules,progression-engine,api-contracts,plate-math}`, `apps/mobile/{app,components,lib,e2e}`, `apps/api/package.json`, root config (`turbo.json`, `pnpm-workspace.yaml`).
**Files read in full or in targeted ranges:** 28.
**Extraction date:** 2026-08-29.
