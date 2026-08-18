---
phase: 03-exercise-catalog
plan: 07
subsystem: ui
tags: [react-native, expo-router, drizzle, powersync, metro, offline-images, exercise-detail]

requires:
  - phase: 03-exercise-catalog
    provides: "03-01's tracer detail screen and ExerciseImageTile fallback tile; 03-05's 870-exercise catalog (seededExercise/exercise union) and 1740 vendored-but-unwired catalog images"
provides:
  - "apps/mobile/lib/catalog/exercise-detail.ts — loadExerciseDetail(db, id), sortMuscleTargets(targets) (primary-before-secondary, weight_factor numeric-descending, name-ascending total order), one joined query per candidate table (never a per-mapping N+1 lookup)"
  - "apps/mobile/components/DetailSection.tsx — heading+body section that renders null (not a bare heading) for an empty/absent/whitespace-only body"
  - "apps/mobile/components/MuscleTargetList.tsx — pluralized primary/secondary muscle lines, secondary sub-line omitted entirely when empty, weight_factor never surfaced as a number"
  - "apps/mobile/app/exercises/[id].tsx — the completed detail screen: name, 4:3 image tile, Target Muscles, Setup/Cues, Suggested Alternatives shell (03-10 fills it); resolveDetailScreenState makes found/not-found/error directly unit-testable"
  - "apps/mobile/components/ExerciseImageTile.tsx — additive `localSource` prop (Metro asset module id) alongside the existing `uri` prop, so a vendored local image and a remote uri can both resolve through one fallback component"
  - "apps/mobile/lib/catalog/catalog-image-map.generated.ts + scripts/generate-catalog-image-map.cjs — the WINDOWS #36 fix: 1740 individually-literal require() calls (Metro cannot resolve a runtime-computed require path) keyed back to exercise id via getLocalCatalogImage()"
affects: [03-06 (concurrent — ExerciseImageTile's uri path is unchanged, list rows keep working), 03-10 (Suggested Alternatives section shell is in place, deliberately unfilled)]

actuals:
  tokens: 9450
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Generated static require-map for a large vendored asset set: a committed .cjs script reads a JSON manifest and emits one literal require() call per file (never a loop calling require() with a computed path, which Metro cannot resolve) — 1740 calls generated, none hand-written."
    - "Additive prop extension for cross-worktree concurrency: ExerciseImageTile gained `localSource` without touching `uri`'s existing behavior, so a plan editing this component's call sites concurrently in a separate worktree merges without a conflict in intent, only in diff lines."
    - "Pure-function extraction as the Jest-without-a-renderer testing strategy: DetailSection/MuscleTargetList (no hooks) are invoked directly as plain functions; the hook-bearing screen's found/not-found/error branching is extracted into an exported async pure function (resolveDetailScreenState) and structural invariants are asserted against the compiled component's own toString() source — used because neither @testing-library/react-native nor react-test-renderer is in this worktree's lockfile."
    - "One joined query per candidate table (LEFT JOIN mapping LEFT JOIN muscle_group), grouped in memory by role, replacing the tracer's per-mapping muscle-group lookup loop — PITFALLS.md §13's canonical N+1 shape for this project."

key-files:
  created:
    - apps/mobile/lib/catalog/exercise-detail.ts
    - apps/mobile/lib/catalog/__tests__/exercise-detail.test.ts
    - apps/mobile/components/DetailSection.tsx
    - apps/mobile/components/MuscleTargetList.tsx
    - apps/mobile/components/__tests__/exercise-detail-components.test.tsx
    - apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts
    - apps/mobile/lib/catalog/catalog-image-map.generated.ts
    - scripts/generate-catalog-image-map.cjs
  modified:
    - apps/mobile/app/exercises/[id].tsx
    - apps/mobile/components/ExerciseImageTile.tsx
    - .planning/WINDOWS.md

key-decisions:
  - "The detail screen renders images exclusively from the vendored local bundle (via getLocalCatalogImage), never from the exercise's own image_urls field, which still points at live raw.githubusercontent.com URLs per WINDOWS #35 (unresolved, untouched by this plan). Reading image_urls for rendering here would have reintroduced both the network dependency T-03-30 forbids and the unresolved licensing risk WINDOWS #35 flags — an exercise absent from the local manifest falls back to the same placeholder tile a load failure already uses, rather than falling through to the remote URL."
  - "ExerciseImageTile's new `localSource` prop is additive, not a replacement: it takes precedence over `uri` when both are present, and `uri`-only callers (03-06's concurrent list-row work) are unaffected. Verified by keeping the prop optional and defaulting the resolved source to the existing uri-to-{uri} behavior when localSource is absent."
  - "No @testing-library/react-native or react-test-renderer exists in this worktree's lockfile, and installing either is out of scope this wave (03-06 owns package.json/pnpm-lock.yaml). DetailSection and MuscleTargetList have no hooks, so they are exercised by direct function invocation (a legitimate technique for hookless components); the hook-bearing screen's classification logic was extracted into an exported pure async helper (resolveDetailScreenState) specifically to keep it testable without a renderer."
  - "Rewriting apps/mobile/app/exercises/[id].tsx (in file scope regardless) replaced the tracer's per-mapping muscle-group select-in-a-loop with the plan's required single joined query — this was a genuine N+1 fix, not scope creep, since the file was already being rewritten end to end per Task 2's action text."

patterns-established:
  - "Generated require-map for a vendored large asset set, regenerable from a single committed script — a pattern any future phase adding another vendored binary asset class (e.g. equipment photos) can reuse directly."

requirements-completed: [EXER-03]

coverage:
  - id: D1
    description: "loadExerciseDetail joins exercise + muscle mappings + muscle groups in one query per candidate table (seededExercise, then exercise), in a deterministic total order (primary before secondary, weight_factor numeric-descending, muscle group name ascending), normalizing every optional field to a single shape of absence"
    requirement: EXER-03
    verification:
      - kind: unit
        ref: "apps/mobile/lib/catalog/__tests__/exercise-detail.test.ts — 10/10 passing"
        status: pass
    human_judgment: false
  - id: D2
    description: "DetailSection omits its entire heading+body for an empty/absent/whitespace-only body; MuscleTargetList pluralizes correctly and omits the secondary sub-line when empty, never surfacing weight_factor as a number"
    requirement: EXER-03
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/exercise-detail-components.test.tsx — 6/6 passing (direct invocation, no renderer)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The detail screen renders name (Heading, no truncation), 4:3 image tile, Target Muscles, Setup/Cues, and a Suggested Alternatives shell in order; an unknown id resolves to a not-found state rather than throwing or leaving a blank screen; no fetch/api-client import anywhere in the loader or screen"
    requirement: EXER-03
    verification:
      - kind: unit
        ref: "apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts — 5/5 passing (resolveDetailScreenState + structural source checks)"
        status: pass
      - kind: other
        ref: "grep -rv '^\\s*//' apps/mobile/app/exercises/ apps/mobile/lib/catalog/exercise-detail.ts | grep -cE \"^import .*api-client|\\bfetch\\(\" -> 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 1740 images 03-05 vendored are wired into the render layer via a generated static require-map and ExerciseImageTile's additive localSource prop; the web export genuinely includes all 1740 vendored files"
    verification:
      - kind: other
        ref: "pnpm --filter mobile build (expo export --platform web) then find dist -iname '*.jpg' | wc -l -> 1740, ~97.25MB total, matching the vendored set exactly"
        status: pass
    human_judgment: false
  - id: D5
    description: "A vendored image actually paints on screen in a real browser, simulator, or device"
    verification: []
    human_judgment: true
    rationale: "Not observed in this session. Bundler-level proof (D4) confirms the wiring is structurally correct, but no browser/simulator/device rendered the screen. Playwright Chromium is present on this machine (contradicting WINDOWS #34's prior claim), but CLAUDE.md's global 'never launch a browser unless explicitly asked' rule took precedence; no Xcode/Android SDK either (WINDOWS #16). Recorded as WINDOWS #37 (unrun-verify)."

duration: "~45 min (dependency install + file reading + Task 1/2 drafting, then three commits spanning 2026-08-18T18:39:30Z-18:52:47Z)"
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 7: Exercise Detail Screen + Vendored Image Wiring Summary

**Completed the exercise-detail screen (single-joined-query loader, deterministic muscle-target ordering, section-omission components) and closed the WINDOWS #36 image-wiring gap by generating a 1740-entry Metro static-require map and adding an additive `localSource` prop to `ExerciseImageTile` — verified to the bundler level (all 1740 vendored jpgs land in the web export), with visual confirmation honestly recorded as unrun.**

## Performance

- **Duration:** ~45 min total (untracked precise start; three commits span 2026-08-18T18:39:30Z-18:52:47Z, preceded by `pnpm install --frozen-lockfile`, `@fitness/api-contracts` build, and file reading)
- **Completed:** 2026-08-18
- **Tasks:** 2 (both plan tasks), plus the orchestrator-directed WINDOWS #36 scope addition folded into Task 2's commit
- **Files modified:** 8 created, 3 modified (10 files total across three commits)

## Accomplishments

- **`exercise-detail.ts`** — `loadExerciseDetail(db, id)` joins the seeded-or-custom exercise table with `exercise_muscle_mapping` and `muscle_group` in a single query per candidate table (never a per-mapping lookup — the tracer screen it replaces had exactly that N+1 shape, fixed here as part of the same file rewrite). `sortMuscleTargets` is exported separately: primary before secondary, then `Number(weight_factor)` descending (never a string compare), then muscle group name ascending as the tie-break that makes the order total rather than merely deterministic-in-practice.
- **`DetailSection.tsx`** — returns `null` for an empty, absent, or whitespace-only body, so "Setup" and "Cues" never render a bare heading with no content underneath.
- **`MuscleTargetList.tsx`** — pluralized "Primary muscle(s)"/"Secondary muscle(s)" lines; the secondary sub-line is omitted entirely (not rendered empty) when there are no secondary mappings; `weight_factor` is never surfaced to the user as a number.
- **`app/exercises/[id].tsx`** — the completed screen: name at Heading role with no `numberOfLines` (verified by source-string absence, not just intent), the 4:3 image tile, Target Muscles (when any primary mapping exists), Setup/Cues via `DetailSection`, and a Suggested Alternatives shell reading "Coming in this phase." (03-10's job to fill). `resolveDetailScreenState` extracts the found/not-found/error classification into a directly-testable pure async function, closing the "unknown id must not throw or blank-screen" truth without needing to invoke the hook-bearing component.
- **WINDOWS #36 scope addition — images now wired, verified to the bundler level.** `scripts/generate-catalog-image-map.cjs` reads `image-manifest.json` and emits `catalog-image-map.generated.ts`: 1740 individually-literal `require()` calls (Metro only resolves a static string-literal `require()` argument — a loop calling `require(computedPath)` is not supported), keyed back to exercise id via `getLocalCatalogImage()`. `ExerciseImageTile` gained an **additive** `localSource` prop that takes precedence over the existing `uri` prop, which is untouched — 03-06's concurrent list-row usage of `uri` keeps working. `pnpm --filter mobile build`'s web export was inspected directly: `find dist -iname '*.jpg' | wc -l` returns exactly 1740, ~97.25MB, matching the vendored set — real, bundler-level proof every require resolved and every image was included, not a claim.

## Task Commits

1. **Task 1: Load and order an exercise's detail from local data** — `dc5760d` (feat)
2. **Task 2: The detail screen, with every section omitted rather than empty (+ WINDOWS #36 image wiring)** — `8a9cb04` (feat)
3. **WINDOWS ledger update** — `a01e8aa` (docs) — amends #36, records #37

**Plan metadata:** this SUMMARY.md commit (docs: complete plan)

## Files Created/Modified

- `apps/mobile/lib/catalog/exercise-detail.ts` — `loadExerciseDetail`, `sortMuscleTargets`, `MuscleTarget`/`RawMuscleTarget`/`ExerciseDetail` types
- `apps/mobile/lib/catalog/__tests__/exercise-detail.test.ts` — 10 tests (ordering, numeric weight_factor comparison, empty/no-mapping cases, unknown id, optional-field normalization, seeded↔custom fallback)
- `apps/mobile/components/DetailSection.tsx` — heading+body section with empty-body omission
- `apps/mobile/components/MuscleTargetList.tsx` — pluralized primary/secondary muscle lines
- `apps/mobile/components/__tests__/exercise-detail-components.test.tsx` — 6 tests, direct-invocation technique
- `apps/mobile/app/exercises/[id].tsx` — the completed detail screen (rewritten from 03-01's tracer)
- `apps/mobile/app/exercises/__tests__/exercise-detail-screen.test.ts` — 5 tests (`resolveDetailScreenState` + structural source checks)
- `apps/mobile/components/ExerciseImageTile.tsx` — additive `localSource` prop
- `apps/mobile/lib/catalog/catalog-image-map.generated.ts` — generated, 1740 require() calls, do-not-hand-edit
- `scripts/generate-catalog-image-map.cjs` — the generator, regenerable from `image-manifest.json`
- `.planning/WINDOWS.md` — amends #36 (partial fix, still open), adds #37 (visual-rendering unrun-verify)

## Decisions Made

See `key-decisions` in frontmatter. Summary:
- Images render exclusively from the vendored local bundle, never from `image_urls` (still-remote, WINDOWS #35 untouched) — preserves both the offline guarantee and the unresolved-licensing carve-out.
- `ExerciseImageTile`'s prop extension is additive by construction, verified by keeping `uri`'s existing resolution path unchanged when `localSource` is absent.
- No test-rendering library is installed in this worktree; DetailSection/MuscleTargetList (hookless) are invoked directly, and the screen's branching logic was extracted into a pure, directly-testable helper rather than working around the missing library with a fragile mock.
- Rewriting `[id].tsx` end to end (already in scope) also fixed the tracer's per-mapping N+1 muscle-group lookup — folded into Task 2, not filed as a separate deviation, since the whole function body was being replaced anyway.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed the tracer's per-mapping N+1 muscle-group lookup**
- **Found during:** Task 2 (rewriting `app/exercises/[id].tsx`)
- **Issue:** 03-01's tracer screen queried `muscle_group` once per mapping row inside a `for` loop — exactly the N+1 shape PITFALLS.md §13 names as this project's canonical risk.
- **Fix:** Replaced by `loadExerciseDetail`'s single joined query per candidate table (Task 1's own design), consumed directly by the rewritten screen.
- **Files modified:** `apps/mobile/app/exercises/[id].tsx` (via the Task 1 loader it now calls)
- **Commit:** `dc5760d` (Task 1, the loader) / `8a9cb04` (Task 2, the screen that stopped doing it manually)

### Orchestrator-directed scope addition (not self-initiated)

**2. WINDOWS #36 — wire the vendored 1740 images into the render layer**
- **Assigned by:** the orchestrator, on par with the plan's own tasks (human-assigned per WINDOWS #36).
- **What was built:** `scripts/generate-catalog-image-map.cjs` + `apps/mobile/lib/catalog/catalog-image-map.generated.ts` (1740 static `require()` calls, generated not hand-written) and an additive `localSource` prop on `ExerciseImageTile`.
- **Constraint honored:** no new dependency installed (03-06 owns `package.json`/`pnpm-lock.yaml` this wave); `uri`'s existing behavior on `ExerciseImageTile` is fully preserved for 03-06's concurrent usage.
- **Verification:** bundler-level only (D4/D5 in `coverage` above) — real and honest, but not a substitute for an observed render. WINDOWS #36 is left `open` (amended, not `fixed`); WINDOWS #37 records the specific unobserved-rendering gap.
- **WINDOWS #35 (image licensing) was not touched**, per explicit instruction — it stays open, and this plan's rendering path structurally avoids ever reading the still-remote `image_urls` field, which if anything reduces (does not increase) its exposure.

---

**Total deviations:** 1 auto-fixed (Rule 1, bug), 1 orchestrator-directed scope addition (WINDOWS #36).
**Impact on plan:** The N+1 fix was a natural consequence of the Task 2 rewrite, not extra work. The WINDOWS #36 addition was scoped exactly as instructed — no dependency changes, no touching 03-06's files, no reopening WINDOWS #35.

## Issues Encountered

- **Fresh worktree had no `node_modules` or `@fitness/api-contracts` `dist/`.** Same recurring gap prior phase SUMMARYs recorded — `pnpm install --frozen-lockfile` (no lockfile changes) then `pnpm --filter @fitness/api-contracts build` were required before any test could run. Not a plan defect.
- **No `@testing-library/react-native` or `react-test-renderer` in the lockfile.** Anticipated by the plan's own contingency text; worked around via direct invocation of hookless components and a pure-function extraction from the hook-bearing screen, both described above.
- **Drizzle's `.select().from(table)` with a `typeof seededExercise | typeof exercise` union parameter type-checks cleanly** (`tsc --noEmit` exits 0) and is exercised by 10 passing unit tests against a hand-rolled fake matching the real query-builder call chain, but — consistent with WINDOWS #33's already-accepted constraint — no real PowerSync/SQLite engine can be constructed under this project's Jest environment, so the union-table query pattern's runtime behavior against a real engine is unverified here. Not filed as a new WINDOWS entry: it is the same root cause WINDOWS #33 already documents for every catalog-touching module in this phase.

## User Setup Required

None.

## Next Phase Readiness

- The exercise detail screen is complete and ready for 03-10 to fill in "Suggested Alternatives" — the section shell already exists at the correct position in the render order.
- 03-06 can merge its concurrent list-row work against `ExerciseImageTile` without a semantic conflict: `uri` is untouched, `localSource` is new and additive.
- **WINDOWS #36 and #37 should both be reread before `/gsd-ship`.** #36 is amended (wiring done, bundler-verified) but not `fixed` — closing it fully needs an observed render (browser/simulator/device), which #37 tracks explicitly. Whoever does the eventual browser/native UAT sweep (ROADMAP Phase 999.1 precedent) should confirm both together.
- **WINDOWS #35 (image licensing, open) remains untouched** and unaffected by this plan, per explicit instruction.

## Self-Check: PASSED

All key files confirmed present on disk (`exercise-detail.ts`, `DetailSection.tsx`, `MuscleTargetList.tsx`, `[id].tsx`, `ExerciseImageTile.tsx`, `catalog-image-map.generated.ts`, `generate-catalog-image-map.cjs`). All three commit hashes (`dc5760d`, `8a9cb04`, `a01e8aa`) confirmed present via `git log --oneline`. Every automated check was actually re-run in this session, not inferred: `pnpm --filter mobile test -- exercise-detail` (22/22 across 3 suites at the time of the last run before the WINDOWS commit), `pnpm --filter mobile test` (full suite, 171/171), `pnpm --filter mobile typecheck` (exit 0), `pnpm --filter mobile build` (exit 0, `find dist -iname '*.jpg' | wc -l` = 1740), and every plan-specified grep acceptance criterion re-run directly against the current worktree.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-18*
