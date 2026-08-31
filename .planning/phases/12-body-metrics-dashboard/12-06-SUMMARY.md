---
phase: 12-body-metrics-dashboard
plan: 06
subsystem: ui
tags: [react-native-view-shot, expo-sharing, canvas, blob-download, playwright, flashlist]

requires:
  - phase: 12-03
    provides: the platform-split photo capture/downscale/photo-store layer, ProgressPhotoTile/ProgressPhotoPlaceholder(View), resolveGalleryCells/loadProgressPhotos/canBuildComposite, and the /progress-photos gallery this plan's picker reuses directly
provides:
  - "resolveCompositeCanvas — pure, dependency-free geometry (composite-layout.ts) shared by both platform siblings so native captureRef and web <canvas> never diverge"
  - "composite.ts / composite.web.ts — the shareComposite platform split: native renders a hidden CompositeCaptureView and hands react-native-view-shot's captureRef output to expo-sharing; web draws onto an offscreen <canvas> and delivers a Blob through the export-training-data.web.ts download idiom"
  - "/photo-composite — the three-step Before & After screen (choose Before, choose After, preview) with every UI-SPEC S10 state: not-enough-photos, share-failure, and a device-absent picker tile that is structurally non-selectable (R28/D-19)"
  - "A real-browser Playwright spec proving the web canvas path end to end, including a real download event"
affects: []

actuals:
  tokens: 14100
  tasks: 2
  commits: 3

tech-stack:
  added: ["react-native-view-shot@5.1.0"]
  patterns:
    - "Platform-split .ts/.web.ts module pair sharing one pure geometry helper (resolveCompositeCanvas), following resolveDownscaledDimensions' own 12-03 precedent"
    - "A JSX-needing native module kept in a plain .ts file (composite.ts) via React.createElement rather than promoting it to .tsx, so the platform-split filename pair the plan named stays exact"
    - "Step derived from selection state, never stored separately — deriveCompositeStep(selection) is the single source of truth so Start Over resetting the two ids IS resetting the step"

key-files:
  created:
    - apps/mobile/lib/photos/composite-layout.ts
    - apps/mobile/lib/photos/composite.ts
    - apps/mobile/lib/photos/composite.web.ts
    - apps/mobile/lib/photos/__tests__/composite-layout.test.ts
    - apps/mobile/app/photo-composite.tsx
    - apps/mobile/app/__tests__/photo-composite-screen.test.ts
    - apps/mobile/e2e/photo-composite.spec.ts
  modified:
    - apps/mobile/package.json
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
    - docs/platform-modules.md

key-decisions:
  - "shareComposite's ShareCompositeInput carries an (unused-on-web) viewRef alongside before/after, rather than two divergent signatures — the off-screen CompositeCaptureView the native sibling snapshots is itself platform-split (composite.ts renders it for real, composite.web.ts's is a no-op), so photo-composite.tsx's single call site never branches on Platform.OS."
  - "composite.ts stays a plain .ts file (matching the plan's own file_modified naming) by building its hidden CompositeCaptureView with React.createElement instead of JSX — the plan pins composite.ts/composite.web.ts as the platform-split pair, and a .tsx extension would break that pairing."
  - "deriveCompositeStep computes the step from the selection object every render rather than storing it separately, so Start Over resetting both ids to null is, by construction, also resetting the step — there is no second place that can drift out of sync."

requirements-completed: [BODY-05]

coverage:
  - id: D1
    description: "Two on-device photos become one shareable/downloadable side-by-side image with both date captions, produced entirely client-side."
    requirement: BODY-05
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/photo-composite.spec.ts#two seeded device-resident photos are both selectable and choosing both renders the preview pair with both date captions"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/photo-composite.spec.ts#pressing Download produces a real download event whose suggested filename ends in .jpg"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/photos/__tests__/composite-layout.test.ts (resolveCompositeCanvas — equal-size, portrait/landscape, caption band)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A device-absent photo is visibly present in the composite picker but structurally non-selectable (no onPress, accessibilityState disabled) — never tappable-then-failing."
    requirement: BODY-05
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/photo-composite-screen.test.ts#renders a device-absent cell through ProgressPhotoPlaceholderView with no onPress (disabled, R28)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/photo-composite.spec.ts#a device-absent photo is present in the grid but not selectable (R28/D-19)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A photo cannot be both halves — the chosen Before is excluded from the After step's selectable set."
    requirement: BODY-05
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/photo-composite-screen.test.ts#resolveSelectableCells excludes the already-chosen Before from the After step's selectable set"
        status: pass
    human_judgment: false
  - id: D4
    description: "Reaching the screen with fewer than two on-device photos (a stale deep link) renders the exact not-enough-photos copy with no grid and no share control; a failed share leaves the selection and preview intact with the exact retry copy; Start Over resets to step one; nothing is ever persisted."
    requirement: BODY-05
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/photo-composite-screen.test.ts (not-enough-photos, preview/share-failure, Start Over describe blocks)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/photo-composite.spec.ts#choosing a not-enough-photos deep link renders the exact empty copy with no grid and no share control"
        status: pass
    human_judgment: false
  - id: D5
    description: "Native (iOS/Android) captureRef + expo-sharing composite path is unbuildable/unverifiable in this environment — typecheck-only, deferred to ROADMAP Phase 999.1 per standing project policy."
    verification: []
    human_judgment: true
    rationale: "No Xcode, no Android SDK on this machine (MEMORY fitness-native-toolchain-absent.md). react-native-view-shot's New-Architecture compatibility for this project's exact SDK 57 / RN 0.86.2 pairing (RESEARCH Assumption A1) is asserted from registry metadata, not confirmed against a real native build. Filed as a WINDOWS unrun-verify entry; requires a real device/simulator sweep at Phase 999.1."

duration: 30min
completed: 2026-08-31
status: complete
---

# Phase 12 Plan 06: Before & After Composite Summary

**Client-only before-and-after photo composite — platform-split `<canvas>`/`captureRef` render, a `Blob`-download/OS-share handoff, and a picker that structurally refuses to select a photo this device doesn't hold.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-08-31
- **Tasks:** 2 (both executed; Task 1's package-legitimacy checkpoint for `react-native-view-shot` auto-approved per the unattended-run directive)
- **Files modified/created:** 11

## Accomplishments

- `composite-layout.ts`: `MAX_COMPOSITE_PHOTOS`, `resolveCompositeCanvas` — a pure, dependency-free geometry function scaling each photo to a shared cell width while preserving its own aspect ratio, centering the shorter one against the taller, and adding a fixed caption-band height. Both platform siblings resolve output rectangles from this same arithmetic.
- `composite.ts` (native) / `composite.web.ts` (web): the `shareComposite` platform split. Native renders a hidden `CompositeCaptureView` (two `<Image>`s + two `<Text>` captions, built with `React.createElement` so the file stays plain `.ts`), snapshots it with `react-native-view-shot`'s `captureRef`, and hands the file uri to `expo-sharing`. Web draws both source images onto an offscreen `<canvas>`, writes captions with `fillText`, and delivers a `Blob` through the exact `export-training-data.web.ts` object-URL + `<a download>` + revoke idiom. Neither sibling imports the other's native module — verified by negative-import greps.
- `/photo-composite`: a hook-free `PhotoCompositeScreenView` + stateful wrapper. Three steps on one screen (choose Before, choose After, preview), reusing `ProgressPhotoTile`/`ProgressPhotoPlaceholderView` from the gallery. Device-absent cells render through `ProgressPhotoPlaceholderView`'s no-`onPress` disabled mode (R28); the already-chosen Before gets a 2px accent border and is excluded from the After step's selectable set (`resolveSelectableCells`). `not-enough-photos` and share-failure states render the exact UI-SPEC copy. `Start Over` resets the selection; nothing is ever persisted (D-18).
- `react-native-view-shot` installed via `npx expo install` — resolved to `5.1.0` against SDK 57 (not the registry's own `5.1.1` latest tag), no version-mismatch warning, `pnpm --filter mobile typecheck` clean.
- Real-browser Playwright spec (`photo-composite.spec.ts`, `durability` project, 4 cases): selection + preview with both date captions; a real `page.waitForEvent('download')` producing a `.jpg` suggested filename; a device-absent tile present-but-disabled; and the not-enough-photos empty state — all against a real `@powersync/web` database and real canvas render.
- `docs/platform-modules.md`: new composite-capability row in the native-capability web audit table.
- A WINDOWS `unrun-verify` entry filed for `react-native-view-shot`'s on-device New-Architecture behavior, routed to ROADMAP Phase 999.1.

## Task Commits

1. **Task 1: End-to-end "build and download a before-and-after" — web path, two photos** — `b8faabb` (feat)
2. **Task 2 RED: failing cases for selection rules and every composite state** — `01c3fbf` (test)
2. **Task 2 GREEN: selection rules and every composite state** — `5e81349` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/mobile/lib/photos/composite-layout.ts` — `MAX_COMPOSITE_PHOTOS`, `resolveCompositeCanvas`, the shared geometry types
- `apps/mobile/lib/photos/composite.ts` / `composite.web.ts` — the `shareComposite` + `CompositeCaptureView` platform-split pair
- `apps/mobile/lib/photos/__tests__/composite-layout.test.ts` — geometry unit tests (equal-size, portrait/landscape, caption band, ordering)
- `apps/mobile/app/photo-composite.tsx` — `PhotoCompositeScreenView` (hook-free) + stateful `PhotoCompositeScreen` wrapper, plus `deriveCompositeStep`/`resolveSelectableCells`/`deriveCompositeScreenState`/`compositeStepLabel`
- `apps/mobile/app/__tests__/photo-composite-screen.test.ts` — the pure-function and View-rendering test suite
- `apps/mobile/e2e/photo-composite.spec.ts` — the real-browser Playwright spec (4 cases)
- `apps/mobile/app/__durability.web.tsx`, `apps/mobile/playwright.config.ts` — append-only harness/testMatch additions (verified insertion-only via `git diff --stat`)
- `docs/platform-modules.md` — one new native-capability audit row
- `apps/mobile/package.json`, `pnpm-lock.yaml` — `react-native-view-shot@5.1.0`

## Decisions Made

- **`shareComposite`'s input carries a `viewRef` field even on the web sibling, unused there** — the alternative (two genuinely different call signatures) would force `photo-composite.tsx` to branch on `Platform.OS` at the one place it calls `shareComposite`, which is exactly the pattern `docs/platform-modules.md`'s own convention forbids.
- **`composite.ts` stays a plain `.ts` file** by building its hidden `CompositeCaptureView` with `React.createElement` rather than JSX — the plan names `composite.ts`/`composite.web.ts` as the platform-split pair in its frontmatter, and switching to `.tsx` would break Metro's filename-based resolution for that pair.
- **The off-screen composed view moved from an inline render in `photo-composite.tsx` to a `CompositeCaptureView` component exported by `composite.ts`/`composite.web.ts`.** The first draft rendered it unconditionally in the screen regardless of platform, which duplicated the date-caption text nodes in the web DOM (the hidden native-capture view and the visible preview both rendered "1 Jul") and broke a Playwright `getByText` strict-mode assertion. Splitting it by filename — a no-op on web — fixed the duplication and is the more correct application of the platform-split convention besides.

## Checkpoint Decisions

**Task 1 — package-legitimacy gate for `react-native-view-shot` (`checkpoint:human-verify`, `gate="blocking-human"`):** Auto-approved per the run's explicit unattended-run directive. `12-RESEARCH.md`'s legitimacy audit verified `5.1.1` directly against the npm registry (2026-08-30) and recorded an "OK — Approved" verdict (1,082,499 weekly downloads, latest publish 2026-06-20, no red flags). `npx expo install` resolved `5.1.0` (the SDK-57-compatible version, not the registry's own `5.1.1` latest tag) with no version-mismatch warning; `pnpm --filter mobile typecheck` passed cleanly. **Residual risk accepted:** its New-Architecture (Fabric/TurboModules) compatibility for this project's exact SDK 57 / RN 0.86.2 pairing (RESEARCH Assumption A1) is asserted from training-knowledge/registry metadata, not confirmed against the package's own changelog or a real native build — filed as a WINDOWS unrun-verify entry against ROADMAP Phase 999.1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate date-caption text nodes from the hidden native-capture view rendering unconditionally on web**
- **Found during:** Task 1's own e2e verification (first `test:e2e` run)
- **Issue:** The off-screen composed view (built for `react-native-view-shot`'s `captureRef` on native) was initially rendered inline in `photo-composite.tsx` on every platform, including web — where it serves no purpose, since `composite.web.ts` draws directly from image elements. This put the date caption text in the DOM twice, breaking a Playwright `getByText` strict-mode assertion.
- **Fix:** Moved the hidden view into a `CompositeCaptureView` component exported by `composite.ts` (real render) and `composite.web.ts` (no-op, returns `null`) — the screen's single JSX call site now resolves the correct platform behavior via Metro's filename split, with no `Platform.OS` branch.
- **Files modified:** `apps/mobile/lib/photos/composite.ts`, `apps/mobile/lib/photos/composite.web.ts`, `apps/mobile/app/photo-composite.tsx`
- **Verification:** `pnpm --filter mobile test:e2e -- photo-composite` — all cases pass, no duplicate text
- **Committed in:** `b8faabb` (Task 1 commit — caught and fixed before the task's own commit, not a separate follow-up)

**2. [Rule 1 - Bug] `Couldn't share. Try again.` copy written with a JSX `&apos;` entity, breaking its own acceptance-criteria grep**
- **Found during:** Task 2 GREEN verification
- **Issue:** The share-failure line used `Couldn&apos;t share. Try again.` in JSX text, which a literal source grep for the straight-apostrophe sentence (Task 2's own acceptance criterion) could not match — the same class of issue 12-03's `ProgressPhotoActionSheet.tsx` hit and fixed the same way.
- **Fix:** Switched to a raw apostrophe (`Couldn't share. Try again.`) — syntactically valid in JSX text, no lint rule in this app enforces `&apos;`.
- **Files modified:** `apps/mobile/app/photo-composite.tsx`
- **Verification:** `grep -c "Couldn't share. Try again." apps/mobile/app/photo-composite.tsx` returns 1; full test suite re-run green
- **Committed in:** `5e81349` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bug fixes caught during this plan's own verification, no scope creep)
**Impact on plan:** Both are correctness fixes with zero architectural change — no new files, no new dependencies beyond the one the plan already named.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- BODY-05 is complete; Phase 12's photo/composite surface (BODY-04 + BODY-05) is now fully built.
- Native (iOS/Android) verification of `react-native-view-shot`'s `captureRef` + `expo-sharing` handoff is filed as a `.planning/WINDOWS.md` unrun-verify entry against ROADMAP Phase 999.1 — no blocker for this phase's remaining plans (12-07, 12-08).
- No blockers.

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-31*

## Self-Check: PASSED

All 11 files listed under "Files Created/Modified" verified present on disk (plus this SUMMARY.md
itself). All 3 task commit hashes (`b8faabb`, `01c3fbf`, `5e81349`) verified present in git history.
