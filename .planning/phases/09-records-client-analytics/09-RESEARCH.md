# Phase 9: Records & Client Analytics — Research

**Researched:** 2026-08-29
**Mode:** unattended `/gsd-start`. The `gsd-phase-researcher` subagent was terminated by an API session rate limit before writing anything; this document was authored in the main loop instead. Every version number and signature below was verified against this repo or an authoritative registry today — nothing here is recalled.
**Companion docs:** `09-CONTEXT.md` (binding decisions D-01..D-10), `09-PATTERNS.md` (codebase analogs — that document already answers the package-scaffolding, live-query and set-predicate questions exhaustively; this one deliberately does **not** repeat them).

---

## 1. `react-native-svg` on Expo SDK 57 — VERIFIED, no blocker

D-05/D-06 stake the whole chart approach on this dependency. It holds.

| Question | Answer | How verified |
|---|---|---|
| Version for this SDK | **`15.15.4`** — pin exactly this | `GET https://api.expo.dev/v2/sdks/57.0.0/native-modules` → `{"npmPackage":"react-native-svg","versionRange":"15.15.4"}`. This is the same map `npx expo install` consults, so it *is* the authoritative answer. |
| Repo's Expo / RN | `expo@57.0.12`, `react-native@0.86.2` | `apps/mobile/package.json` |
| Peer deps | `react: '*'`, `react-native: '*'` | `npm view react-native-svg@15.15.4 peerDependencies` |
| Conflict with the workspace `react: 19.2.3` override? | **No.** Its peer range is unconstrained, so it cannot produce the dual-peer-variant failure documented in `pnpm-workspace.yaml`'s better-auth comment. | wildcard peers, above |
| Release-age gate | **Not a concern.** Published `2026-03-18`, i.e. ~5 months old. No `minimumReleaseAge` value is set in `.npmrc` or `pnpm-workspace.yaml` (only a `minimumReleaseAgeExclude` list), and every entry on that list is a package published *recently*. 15.15.4 needs no exclude entry. | `npm view react-native-svg time`; `cat .npmrc` (absent), `pnpm-workspace.yaml` |
| Already in the tree? | **Declared nowhere; installed nowhere.** It appears in `pnpm-lock.yaml` only as an *optional* peer of `react-native-css-interop@0.2.6` (NativeWind's engine) and is absent from `node_modules/.pnpm`. It must be added to `apps/mobile/dependencies` before any app code can import it. | `grep react-native-svg pnpm-lock.yaml` (3 hits, all peer declarations); `ls node_modules/.pnpm` |

**Note the NativeWind relationship.** `react-native-css-interop` lists `react-native-svg` as an optional peer precisely so NativeWind can style SVG elements. That is a compatibility signal, not an instruction — the UI-SPEC requires SVG colours to come from `useThemeColors()` as resolved `ColorValue`s (`fill`/`stroke` props), which is the safer path and the one `09-PATTERNS.md` §3 documents. Do not rely on classNames reaching SVG props.

### New Architecture / Fabric
`react-native-svg` shipped Fabric support in the 13.x line and has been Fabric-native throughout 15.x; Expo pinning 15.15.4 *for an SDK where the New Architecture cannot be disabled* is itself the strongest available evidence that it works under Fabric — Expo's version map only lists modules validated against that SDK. `[UNVERIFIED BY EXECUTION]` No Fabric smoke test was run in this session.

### Web target
Under `react-native-web`, `react-native-svg` resolves to its `react-native-svg/lib/module/ReactNativeSVG.web.js` implementation, which renders **real DOM `<svg>`/`<path>`/`<circle>` elements** rather than a canvas. This is the property D-05 depends on and the reason one implementation can serve both targets.

### Install requirements — **no config plugin, no native rebuild needed for the web evidence path**
`react-native-svg` is a native module, so a *native* dev-client rebuild is required before it runs on iOS/Android. It needs **no** Expo config plugin and **no** Metro or webpack configuration. Critically for this phase: the **web target needs no native build at all**, so the Playwright durability evidence is reachable from a plain `pnpm install` without touching the native toolchain — which matters because this machine has neither Xcode nor the Android SDK (see ROADMAP Phase 999.1).

### Playwright queryability — **the risk that actually needs designing around**
Real DOM `<svg>` output is *present* in the page, but SVG shapes carry **no implicit ARIA role and no accessible name**, so `getByRole`/`getByText` — the repo's mandated selector style (`09-PATTERNS.md` §6, convention 5) — will not find a `<path>` or a `<circle>`.

The UI-SPEC already solves this without knowing it: **R16** forbids any text inside `<Svg>` (every label is a sibling RN `<Text>`, which becomes a queryable DOM text node), and **R20** puts `accessibilityRole="image"` + a full-sentence `accessibilityLabel` on the `<Svg>` root, which `react-native-web` maps to `role="img"` + `aria-label`. Together these give a spec two solid handles:

```ts
// the chart itself, by its announced sentence
await expect(page.getByRole('img', { name: /Heaviest weight over Last 3 months/ })).toBeVisible();
// and every number/date, as ordinary text siblings
await expect(page.getByText('102.5 kg')).toBeVisible();
```

**Recommendation:** assert charts through `role="img"` + accessible name and through the sibling `<Text>` nodes. Do **not** add `testID`s to individual shapes — the repo reserves `data-testid` for the harness-ready sentinel alone. `trendChartSummary()` being separately exported and unit-tested (UI-SPEC R20) means the *content* of the announcement is proven by jest, and the e2e only has to prove it reached the DOM. `[UNVERIFIED BY EXECUTION]` The `role="img"` mapping was not exercised in a real Playwright run this session; the first plan that adds a chart spec should confirm it before building further specs on the assumption.

---

## 2. Chart maths without a charting library

No layout engine is available (D-06), so scales, ticks and path strings are ours. All of this belongs in the pure package (D-04/D-10) and must be unit-tested there — the component receives finished numbers (UI-SPEC `TrendChartProps`).

### Linear scale
```ts
export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  // A zero-width domain maps everything to the range midpoint. Dividing by `span` here yields
  // Infinity/NaN and silently produces an SVG path the renderer drops with no error.
  if (span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}
```
The `span === 0` guard is exactly the UI-SPEC's "every value identical → flat line at vertical centre" rule, and is the single most likely source of an invisible chart if omitted.

### Y domain — never `[0, max]`
UI-SPEC requires `[min, max]` with a 10% pad. A 100–105 kg bench series scaled from zero is a flat line against the frame's bottom edge and reads as "no progress". Pad symmetrically:
```ts
const pad = (max - min) * 0.1 || Math.max(Math.abs(max) * 0.1, 1); // `|| …` covers min === max
```

### Y is inverted
SVG's y axis grows **downward**. The value range must be `[height - PAD, PAD]`, not `[PAD, height - PAD]`. Getting this backwards renders a vertically mirrored chart that still looks plausible — it is the classic silent bug here, so it deserves a dedicated unit-test assertion ("a higher value produces a *smaller* y").

### Path `d` strings
```ts
const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const area = `${line} L${last.x.toFixed(2)},${baselineY} L${first.x.toFixed(2)},${baselineY} Z`;
```
Round to 2 decimals — full float precision bloats the string with no visual gain and makes snapshot diffs unreadable. Straight segments only; the UI-SPEC specifies no curve smoothing, and a Catmull-Rom/Bézier fit would invent values between real sessions, which D-09's honesty rule argues against.

### Degenerate cases (all specified by UI-SPEC R17 — implement them, do not discover them)
- **0 points** → component returns `null`; the host renders its own empty state.
- **1 point** → one `<Circle>`, no path. A single-point polyline is invisible, and a line drawn to an implied origin asserts a workout that never happened.
- **2 points** → works with the general code; no special case needed once the `span === 0` guard exists.
- **all values equal** → flat line at centre via the guard above. This is a *true* flat series, and is explicitly **not** the D-09 fabricated-zero case.

### Gaps in a series — a real decision the UI-SPEC leaves to the plan
`[CLAUDE'S CALL]` **Do not break the line across weeks with no sessions when the x axis is session-indexed; do break it when the x axis is time-proportional.** The distinction matters and the two chart hosts differ:
- **S4 Exercise Performance** plots one point per *session that included this exercise*. Points are inherently irregular in time; connecting consecutive sessions is the honest reading ("last time → this time") and is what Phase 8's recency-by-logged-sessions rule (D-10) already treats as the meaningful axis. Connect them.
- **S2 History Trend** plots fixed 7-day buckets, where a bucket with no training is a real, meaningful zero-work week. Per D-09 this must **not** be plotted as a zero point. Render the bucket as a gap: emit a separate sub-path (start a new `M`) rather than drawing through it, so the line visibly breaks.

This yields one shared helper — a path builder that takes `(TrendPoint | null)[]` and starts a new `M` after every `null` — with S4 simply never passing a `null`. That keeps one implementation and makes the difference a data property rather than two code paths.

### Ticks
The UI-SPEC deliberately specifies **only two x labels** (first and last `dateLabel`) and **no y axis** — just a min–max caption. So no tick-selection algorithm is needed. Do not build one; a "nice number" tick generator is real complexity that this design has already designed away.

---

## 3. Reuse boundary — what `@fitness/pr-rules` gives us, and the large thing it does not

Read in full: `packages/pr-rules/src/personal-records.ts`, `estimated-1rm.ts`.

### Available now
| Symbol | Signature | Serves |
|---|---|---|
| `estimated1RM` | `(weightKg: number, reps: number) => number \| null` — `null` above `E1RM_MAX_VALID_REPS` | **ANLY-10 in full.** The mechanism, not just a helper. |
| `E1RM_MAX_VALID_REPS` | `10` | ANLY-10 copy interpolation (UI-SPEC forbids hardcoding `10` in strings) |
| `foldPriorBest` | `(sets: CandidateSet[]) => PriorBest` | PR detection input |
| `detectPrs` | `(candidate: CandidateSet, priorBest: PriorBest) => DetectedPr[]` | **ANLY-01 in full** (already wired) |
| `emptyPriorBest`, `PriorBest`, `CandidateSet`, `DetectedPr` | — | vocabulary |

Both `foldPriorBest` and `detectPrs` gate on `countsTowardRecords(setType) && completed && weightKg !== null` (D-18: warm-up **and partial** excluded; drop/myorep/failure/amrap eligible). A tie is not a PR — strict improvement only.

### ANLY-01 and ANLY-02 are already shipped — confirm, do not rebuild
`apps/mobile/lib/db/personal-record.ts` already contains `logPersonalRecord`, `loadPriorBestByExercise`, `walkSessionPrs`, `detectPrsForSession` (idempotent, re-runnable after an edit per LOG-19) and `computeSessionPrTypesBySetId`. Phase 5 wired detection into session completion and the workout summary renders PR badges, proven by `e2e/workout-summary.spec.ts`.

**Phase 9's only work on ANLY-01/02 is the two narrow UI-SPEC corrections** (distinct per-metric badge labels; the `e1RM: —` display union). Everything else is done.

### The finding that most changes the plan: **`personal_record` is a persisted, synced table**
```
personal_record(id, user_id, exercise_id, pr_type, value, logged_set_id, achieved_at, reconciled_at, server_seq)
```
— `apps/mobile/lib/db/schema.ts:231`, and it is in the PowerSync bucket (`ops/powersync/sync-rules.yaml:48`).

**ANLY-03's records list is therefore a read over an existing table, not a recomputation.** Every field the UI-SPEC's `RecordRow` needs is already stored: which exercise, which metric, the value, and when it was achieved (plus `logged_set_id` to navigate to the originating set). This is dramatically cheaper than folding history, it is consistent by construction with the badge the user already saw, and it makes "browse recent records, switch metric" a `WHERE pr_type = ? ORDER BY achieved_at DESC` keyset read in the established `history-query.ts` idiom.

`[CLAUDE'S CALL]` **Build ANLY-03 on `personal_record`, not on `foldPriorBest`.** Recomputing would risk showing the user a different record set than the badge that celebrated it. Note `value` is a 3-decimal string (`numeric(10,3)`, the `formatPrValue` convention) — parse at the render boundary only, per `09-PATTERNS.md` § Numeric Representation.

### Genuinely missing — this is the new package's scope
Nothing in `pr-rules` addresses time. All of the following must be written:
- **Bucketing** — `(sessions, windowDays, bucketDays, today) => Bucket[]`, clock passed in (D-10).
- **Per-exercise series** — one point per session containing the exercise, per selected metric (`heaviest` = max `weightKg`; `e1rm` = max non-null `estimated1RM`, dropping above-cap sets and *reporting how many were dropped* for the UI-SPEC's "n sessions above 10 reps aren't plotted" caption; `volume` = Σ `weightKg × reps` over `countsTowardWorkingVolume` rows).
- **Trend delta** — current bucket vs previous, returning an explicit "not comparable" branch when fewer than two buckets have data (the UI-SPEC hides the chip in that case; it must not be a `0%`).
- **Weekly progress vs targets** — achieved/target per track, with an explicit `no target` branch (D-08).

Note the **two different set predicates** must both be honoured and never merged: `countsTowardRecords` (excludes warm-up *and partial*) for anything PR/e1RM-flavoured, `countsTowardWorkingVolume` (excludes warm-up only) for volume and rep totals — plus the `parentSetId === null` conjunct for *set counts* specifically. `09-PATTERNS.md` § Shared Patterns has the exhaustive treatment; it is the single most likely correctness defect in this phase.

### New package vs. extending `pr-rules`
`[CLAUDE'S CALL]` **New package, `@fitness/analytics-engine`.** `pr-rules` is a coherent, small, stable unit that both apps and three parity runners depend on; folding time-series aggregation into it would double its surface and couple the shipped PR path to new code. `09-PATTERNS.md` §1 has the exact scaffolding to copy. The new package takes `@fitness/pr-rules` and `@fitness/api-contracts` as workspace dependencies.

---

## 4. Reactivity for "before any sync" (success criterion 4)

`09-PATTERNS.md` §4 establishes the finding and I confirm the recommendation: **there is no live-query usage anywhere in `apps/mobile`** — every screen refreshes via `useFocusEffect` with an `active` cancellation flag.

Criterion 4 says "available immediately after logging, before any sync". The **"before any sync"** clause is about *locality* — the figure is derived from local SQLite with no server round-trip (D-03) — not about same-screen live updating. Returning from the workout screen re-focuses Home, which re-reads and shows the new numbers. That satisfies the criterion on the existing idiom with no new infrastructure.

`[CLAUDE'S CALL]` **Do not introduce `PowerSyncDatabase.watch()` in this phase.** It would be a new house pattern established incidentally by an analytics card, and the gap it closes (a *second device's* change landing while the screen is already focused) is not what criterion 4 asks for. `apps/mobile/app/(tabs)/index.tsx` already carries a comment naming this exact gap as known and deliberate — Phase 9 should not silently resolve it in one card while four other screens keep the old behaviour. If it is ever closed, it should be closed everywhere at once, in its own dedicated helper.

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| SVG shapes invisible to Playwright's role/text selectors | **High** — it is the phase's evidence path | UI-SPEC R16/R20 already force sibling `<Text>` + `role="img"` with an accessible name. Confirm the mapping in the *first* chart spec before writing more. |
| Inverted-y bug renders a mirrored but plausible chart | Medium | Explicit unit test: higher value → smaller `y`. |
| Zero-width domain (all values equal, or one point) → `NaN` path, silently dropped by the renderer | Medium | `span === 0` guard in `linearScale`; UI-SPEC R17 cases as unit tests. |
| Analytics set count disagrees with the exercise strip | **High** — a visible self-contradiction | Share the predicate (`countsTowardWorkingVolume` + `parentSetId === null` + `completed`); do not re-derive. `09-PATTERNS.md` § Shared Patterns. |
| Native dev-client rebuild needed for `react-native-svg` on iOS/Android | Low for this phase | Web needs no native build, so all phase evidence is reachable. Native verification is already deferred to ROADMAP Phase 999.1 (no Xcode/Android SDK on this machine) — append a Phase 9 chart item there. |
| `apps/mobile/package.json` edited by two plans in one wave | Medium | Exactly one plan owns adding `react-native-svg@15.15.4`; all others assume it present. Flagged as a seam in `09-PATTERNS.md`. |

---

## Sources

- `https://api.expo.dev/v2/sdks/57.0.0/native-modules` — queried 2026-08-29; authoritative Expo SDK 57 → `react-native-svg@15.15.4` pin. **HIGH**
- npm registry (`npm view react-native-svg`) — publish dates, peer deps, `latest` = 15.15.5. **HIGH**
- This repo, read directly today: `apps/mobile/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packages/pr-rules/src/{personal-records,estimated-1rm,index}.ts`, `apps/mobile/lib/db/{schema.ts,personal-record.ts}`, `apps/mobile/lib/navigation/root-stack.tsx`, `ops/powersync/sync-rules.yaml`. **HIGH**
- `09-PATTERNS.md` (same phase) for codebase analogs, deliberately not duplicated here. **HIGH**
- Fabric compatibility of `react-native-svg` 15.x — inferred from Expo's SDK-57 version map rather than executed. **MEDIUM, flagged `[UNVERIFIED BY EXECUTION]` above.**
