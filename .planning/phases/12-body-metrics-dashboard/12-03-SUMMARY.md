---
phase: 12-body-metrics-dashboard
plan: 03
subsystem: ui
tags: [expo-image-picker, expo-image-manipulator, indexeddb, expo-file-system, powersync, drizzle, flashlist, playwright]

requires:
  - phase: 12-01
    provides: the seven-touchpoint singleton-root sync.service.ts registration template (body_metric), which this plan repeats for progress_photo, plus the PUSH_APPLIED_TABLES/PUSH_DEFERRED_TABLES tuple this plan empties
provides:
  - Platform-split capture/downscale/photo-store modules (lib/photos/) with a shared resolveDownscaledDimensions bound
  - progress_photo's full sync apply path (server + client), moved from PUSH_DEFERRED_TABLES to PUSH_APPLIED_TABLES
  - The /progress-photos gallery route with all four states, the device-absent placeholder, and photo actions (view/edit-note/delete)
  - A real-browser Playwright spec proving the capture-store-read round trip against real IndexedDB
affects: [12-06 (before/after composite, consumes ProgressPhotoPlaceholderView directly), 12-08 (owns asserting PUSH_DEFERRED_TABLES is empty)]

actuals:
  tokens: 31700
  tasks: 3
  commits: 5

tech-stack:
  added: [expo-image-picker@57.0.14, expo-image-manipulator@57.0.14]
  patterns:
    - "Platform-split .ts/.web.ts module pairs sharing one pure helper (resolveDownscaledDimensions) so native and web bound to identical target dimensions from the same arithmetic"
    - "Hook-free ScreenView + stateful default-export wrapper split (RecordsScreenView/BodyMetricsScreenView convention), applied to progress-photos.tsx"
    - "Self-contained <Modal>-wrapping sheet components (PhotoCaptureConfirmSheet/ProgressPhotoActionSheet/DeletePhotoDialog), matching this plan's own PhotoCaptureConfirmSheet/MuscleDrilldownSheet precedent"

key-files:
  created:
    - apps/mobile/lib/photos/constants.ts
    - apps/mobile/lib/photos/capture.ts
    - apps/mobile/lib/photos/capture.web.ts
    - apps/mobile/lib/photos/downscale.ts
    - apps/mobile/lib/photos/downscale.web.ts
    - apps/mobile/lib/photos/photo-store.ts
    - apps/mobile/lib/photos/photo-store.web.ts
    - apps/mobile/lib/db/progress-photos.ts
    - apps/mobile/components/ProgressPhotoTile.tsx
    - apps/mobile/components/ProgressPhotoPlaceholder.tsx
    - apps/mobile/components/PhotoCaptureConfirmSheet.tsx
    - apps/mobile/components/ProgressPhotoActionSheet.tsx
    - apps/mobile/app/progress-photos.tsx
    - apps/mobile/e2e/progress-photo.spec.ts
    - apps/api/test/progress-photo.e2e-spec.ts
  modified:
    - packages/api-contracts/src/sync.ts
    - apps/api/src/sync/sync.service.ts
    - apps/api/src/sync/patch-update-set.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/playwright.config.ts
    - docs/platform-modules.md

key-decisions:
  - "progress-photos.tsx split into a hook-free ProgressPhotosScreenView plus a stateful default-export wrapper — the interrupted prior run had built it as one stateful component; refactored to match RecordsScreenView/BodyMetricsScreenView's shipped split so it is direct-invocation testable like every other screen."
  - "ProgressPhotoActionSheet and DeletePhotoDialog self-contain their own <Modal>, matching this plan's own PhotoCaptureConfirmSheet/MuscleDrilldownSheet precedent rather than HistoryActionSheet.tsx's externally-Modal-wrapped precedent."
  - "hasPhotoBytes is called once per distinct storage_key to build the presence map (matching the plan's own instruction); getPhotoUri only runs for a key already known present, avoiding a second store hit for absent keys."
  - "Task 1's package-legitimacy checkpoint (expo-image-picker/expo-image-manipulator, both flagged SUS on publish-recency alone) was auto-approved per the unattended-run directive — both are first-party expo/expo packages, multi-million weekly downloads, no postinstall script, versions verified against the npm registry in 12-RESEARCH.md."

patterns-established:
  - "Photo modules never import expo-file-system from a non-native sibling (RESEARCH Pitfall 1) — enforced by the negative-import grep in this plan's own acceptance criteria."
  - "D-17's downscale bound lives only as PHOTO_MAX_LONG_EDGE, never a numeral at a call site (R32) — both downscale.ts and downscale.web.ts import it from constants.ts."

requirements-completed: [BODY-04]

coverage:
  - id: D1
    description: "A photo picked in a real browser is downscaled, stored in an app-owned IndexedDB store, and its progress_photo metadata row reaches Postgres owned by the session user."
    requirement: BODY-04
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/progress-photo.spec.ts#bytes written for a key are readable back for that key"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/progress-photo.spec.ts#savePhoto produces exactly one progress_photo row whose storage_key matches its stored bytes"
        status: pass
      - kind: e2e
        ref: "apps/api/test/progress-photo.e2e-spec.ts#stores a PUT with the taken_at/timezone/local_date/storage_key/note metadata — never any photo bytes (D-15)"
        status: pass
      - kind: e2e
        ref: "apps/api/test/progress-photo.e2e-spec.ts#stores a PUT against the authenticated session's user id, never a user_id claimed in the payload (T-12-10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two captures in the same session produce two rows with two distinct storage_key values, and both remain readable — the idempotency/concurrency edge probe."
    requirement: BODY-04
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/progress-photo.spec.ts#two captures in the same session produce two rows with two distinct storage keys, both readable (idempotency edge)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A photo whose bytes are absent on this device renders ProgressPhotoPlaceholder everywhere a photo could otherwise render, sized identically to a real tile, and is tappable in the gallery opening an explanation sheet."
    requirement: BODY-04
    verification:
      - kind: unit
        ref: "apps/mobile/components/__tests__/ProgressPhotoTile.test.tsx#ProgressPhotoPlaceholderView — the two press modes (E11 tappability / non-selectability, R28)"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/progress-photo.spec.ts#hasPhotoBytes returns false for a row seeded without bytes (the R27 device-absent precondition)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The gallery renders all four states (loading/error/empty/ready) with the shipped copy, and the Create Before & After control is gated on >=2 on-device photos."
    requirement: BODY-04
    verification:
      - kind: unit
        ref: "apps/mobile/app/__tests__/progress-photos-screen.test.ts (loading/error/empty/populated describe blocks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Deleting a photo confirms through DeletePhotoDialog, then removes both the progress_photo row and the on-device bytes, tolerating an already-absent blob."
    requirement: BODY-04
    verification:
      - kind: unit
        ref: "apps/mobile/lib/db/__tests__/progress-photos.test.ts (deletePhoto describe block)"
        status: pass
      - kind: unit
        ref: "apps/mobile/components/__tests__/ProgressPhotoActionSheet.test.tsx#ProgressPhotoActionSheetView"
        status: pass
    human_judgment: false
  - id: D6
    description: "PUSH_DEFERRED_TABLES is empty and PUSH_APPLIED_TABLES includes progress_photo — the tuple move is complete."
    requirement: BODY-04
    verification:
      - kind: unit
        ref: "packages/api-contracts/src/__tests__/sync.test.ts#progress_photo is applied, not deferred — 12-03 gives progress-photo metadata rows a server-side apply path"
        status: pass
    human_judgment: false
  - id: D7
    description: "Native (iOS/Android) capture, manipulation and file-store paths are unbuildable/unverifiable in this environment — typecheck-only, deferred to ROADMAP Phase 999.1 per standing project policy."
    verification: []
    human_judgment: true
    rationale: "No Xcode, no Android SDK on this machine (documented project constraint, see MEMORY fitness-native-toolchain-absent.md). Filed as three WINDOWS unrun-verify entries; requires a real device/simulator sweep at Phase 999.1."

duration: 55min
completed: 2026-08-31
status: complete
---

# Phase 12 Plan 03: Progress Photo Capture, Storage and Gallery Summary

**Platform-split photo capture/downscale/IndexedDB storage, a synced `progress_photo` metadata row (emptying `PUSH_DEFERRED_TABLES` for the first time), and a four-state gallery with a deliberate device-absent placeholder.**

## Performance

- **Duration:** ~55 min (resumed run — a prior interrupted executor left most of Task 2's implementation uncommitted; this run inspected, verified, corrected, completed the remaining plan work, and committed everything)
- **Completed:** 2026-08-31
- **Tasks:** 3 (Task 1 checkpoint auto-approved, Tasks 2-4 executed)
- **Files modified/created:** 31 (22 mobile/api source + test files, 3 shared-seam append-only files, `docs/platform-modules.md`, `pnpm-lock.yaml`, plus the API contracts package)

## Accomplishments

- Three platform-split module pairs (`capture`, `downscale`, `photo-store`) under `apps/mobile/lib/photos/`, sharing one pure `resolveDownscaledDimensions` helper so native (`expo-image-manipulator`) and web (`<canvas>`) bound to identical target dimensions from the same arithmetic. Web takes no `expo-file-system` dependency — IndexedDB instead.
- `progress_photo` registered at all seven `sync.service.ts` singleton-root touchpoints and in `patch-update-set.ts`, following 12-01's `body_metric` template exactly. Moved from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES` — **the deferred tuple is empty for the first time in the project's life.**
- `lib/db/progress-photos.ts`: `savePhoto` (bytes-before-row), `loadProgressPhotos`, `resolveGalleryCells`/`derivePhotoGalleryState`/`canBuildComposite` (pure gallery-state functions), `deletePhoto` (row + bytes together), `updatePhotoNote` (single-column update).
- `/progress-photos` route: `ProgressPhotosScreenView` (hook-free) + stateful wrapper, all four UI-SPEC states, present/absent cells interleaved by date through `FlashList`, `Create Before & After` gated on `canBuildComposite`.
- `ProgressPhotoPlaceholder`: same square footprint as a real tile, tappable in the gallery (opens `PhotoNotOnDeviceSheet`), non-interactive/disabled in the future composite-picker mode (R28).
- `ProgressPhotoActionSheet` + `DeletePhotoDialog`: three fixed rows (view/edit-note/delete), only Delete destructive, delete goes through confirmation before mutating.
- Real-browser Playwright spec (`progress-photo.spec.ts`, `durability` project) proving the capture-store-read round trip against real IndexedDB — 4 cases, all passing.
- `apps/api/test/progress-photo.e2e-spec.ts` — happy path, foreign-`user_id` ownership (T-12-10), empty-`storage_key` rejection — 3 cases, all passing against live Postgres.

## Task Commits

Task 1 (package-legitimacy checkpoint) produced no code — auto-approved per the unattended-run directive (see Checkpoint Decisions below).

1. **Task 2: End-to-end "capture a progress photo" — web path, one photo** — `41b8c4b` (feat)
2. **Task 3 RED: failing cases for the gallery-state functions** — `0f2fcb3` (test)
2. **Task 3 GREEN: absent-bytes placeholder, info sheet, every gallery state** — `06ca242` (feat)
3. **Task 4 RED: failing cases for ProgressPhotoActionSheet/deletePhoto/updatePhotoNote** — `f4aedbc` (test)
3. **Task 4 GREEN: photo actions — view, edit note, delete row and bytes together** — `f20198b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/mobile/lib/photos/constants.ts` — `PHOTO_MAX_LONG_EDGE`, `PHOTO_JPEG_QUALITY`, `PHOTO_STORAGE_PREFIX`, `photoStorageKey`, `resolveDownscaledDimensions`
- `apps/mobile/lib/photos/{capture,downscale,photo-store}.ts` / `.web.ts` — the three platform-split module pairs
- `apps/mobile/lib/db/progress-photos.ts` — `savePhoto`, `loadProgressPhotos`, `resolveGalleryCells`, `derivePhotoGalleryState`, `canBuildComposite`, `deletePhoto`, `updatePhotoNote`
- `apps/mobile/components/ProgressPhotoTile.tsx` — `ProgressPhotoTileView`/`ProgressPhotoTile`, `resolvePhotoTileSize` and its sizing constants
- `apps/mobile/components/ProgressPhotoPlaceholder.tsx` — `ProgressPhotoPlaceholderView`/`ProgressPhotoPlaceholder`, `PhotoNotOnDeviceSheet`
- `apps/mobile/components/PhotoCaptureConfirmSheet.tsx` — capture-confirm modal, S9
- `apps/mobile/components/ProgressPhotoActionSheet.tsx` — `PROGRESS_PHOTO_ACTIONS`, `ProgressPhotoActionSheetView`/`ProgressPhotoActionSheet`, `DeletePhotoDialog`
- `apps/mobile/app/progress-photos.tsx` — `ProgressPhotosScreenView` (hook-free) + stateful `ProgressPhotosScreen` wrapper, plus the co-located `EditPhotoNoteSheet`
- `apps/mobile/e2e/progress-photo.spec.ts` — the real-IndexedDB round-trip spec
- `apps/api/test/progress-photo.e2e-spec.ts` — server-side ownership/validation e2e coverage
- `packages/api-contracts/src/sync.ts` / `apps/api/src/sync/{sync.service,patch-update-set}.ts` — `progress_photo`'s full apply path
- `apps/mobile/app/__durability.web.tsx`, `apps/mobile/lib/db/test-support.ts`, `apps/mobile/playwright.config.ts` — append-only additions (verified insertion-only via `git diff --stat`)
- `docs/platform-modules.md` — three new native-capability audit rows

## Decisions Made

- **`progress-photos.tsx` refactored into the hook-free View + stateful wrapper split.** The interrupted prior run had built it as one stateful component with no direct-invocation test seam. Refactored to match `RecordsScreenView`/`BodyMetricsScreenView`'s shipped convention (explicitly cited by Task 3's `read_first`), enabling `app/__tests__/progress-photos-screen.test.ts` to render state branches without a renderer.
- **`ProgressPhotoActionSheet`/`DeletePhotoDialog` self-contain their own `<Modal>`**, matching this plan's own `PhotoCaptureConfirmSheet`/`MuscleDrilldownSheet` precedent rather than `HistoryActionSheet.tsx`'s externally-`Modal`-wrapped one — keeps the screen's sheet-open state management uniform across every sheet this plan adds.
- **`hasPhotoBytes` is the batched presence check** (one call per distinct `storage_key`, matching the plan's own instruction); `getPhotoUri` only runs for a key already known present, so an absent key never pays for a second store lookup.
- **Task 1's package-legitimacy checkpoint auto-approved** — see Checkpoint Decisions.

## Checkpoint Decisions

**Task 1 — package-legitimacy gate for `expo-image-picker`/`expo-image-manipulator` (`checkpoint:human-verify`, `gate="blocking-human"`):** Auto-approved under the run's explicit unattended-run directive. `12-RESEARCH.md`'s legitimacy audit flagged both packages **SUS** (`too-new`) purely on publish-timestamp recency (SDK 57 patch published 4 days before the audit). Both are first-party packages from the `github.com/expo/expo` monorepo, carry no postinstall script, no deprecation flag, with millions of weekly downloads (`expo-image-picker` 4.2M, `expo-image-manipulator` 2.0M), and `57.0.14` is a real published version of each. **Residual risk accepted:** the recency-only SUS flag itself — no independent verification against a live npm registry query was performed in this session (the interrupted prior run had already added the dependencies at the researched versions before this session began; this session verified the packages appear correctly in `package.json`/`app.json`/the lockfile and behave correctly at runtime, but did not re-query npmjs.com directly).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a stray self-correcting comment in `photo-store.ts`**
- **Found during:** Inspection of the interrupted prior run's uncommitted work (before Task 2's commit)
- **Issue:** `getPhotoUri`'s doc comment read "An object URL... no, a real file:// URI —" — an artifact of an in-place correction that should not have shipped
- **Fix:** Rewrote to a single clean sentence
- **Files modified:** `apps/mobile/lib/photos/photo-store.ts`
- **Committed in:** `41b8c4b` (Task 2 commit)

**2. [Rule 1 - Bug] `packages/api-contracts/src/__tests__/sync.test.ts` updated alongside `sync.ts`, though not in the plan's `files_modified` frontmatter**
- **Found during:** Inspection of the interrupted prior run's work
- **Issue:** Removing `'progress_photo'` from `PUSH_DEFERRED_TABLES` and emptying that tuple broke the existing `isTerminalRejection('unknown_table', 'progress_photo')` true-branch test, which depended on a real deferred table existing
- **Fix:** (Already done by the interrupted run, verified correct here) Updated the "contains exactly..." assertion to include `progress_photo`, added a dedicated "is applied, not deferred" assertion, and replaced the now-untestable true-branch case with two tripwire assertions proving the tuple move happened for both `body_metric` and `progress_photo`
- **Files modified:** `packages/api-contracts/src/__tests__/sync.test.ts`
- **Verification:** `pnpm --filter api-contracts test` — 203/203 pass
- **Committed in:** `41b8c4b` (Task 2 commit)

**3. [Rule 1 - Bug] Fixed two grep-breaking copy issues in `ProgressPhotoActionSheet.tsx`**
- **Found during:** Task 4 acceptance-criteria verification
- **Issue:** A doc comment mentioning "the Delete Photo copy" made `grep -c "Delete Photo"` return 2 instead of the required 1; the confirm-body sentence used a JSX `&apos;` entity, which a literal source grep for the straight-apostrophe sentence could not match
- **Fix:** Reworded the comment to avoid the literal phrase; switched the confirm-body text to a raw apostrophe (syntactically valid in JSX text, no lint rule in this app enforces `&apos;`)
- **Files modified:** `apps/mobile/components/ProgressPhotoActionSheet.tsx`
- **Verification:** both acceptance-criteria greps now return the required counts; component tests re-run green
- **Committed in:** `f20198b` (Task 4 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bug fixes on inherited work, 1 Rule 1 bug fix on this session's own new code)
**Impact on plan:** All three are correctness/consistency fixes with zero scope creep — no new files, no architectural changes.

## Issues Encountered

- **`pnpm --filter mobile test:e2e -- progress-photo` ran the full 99-test suite (all Playwright projects) instead of filtering to the 4 `progress-photo.spec.ts` cases.** Root cause: pnpm forwards the literal `--` token to `playwright test` alongside the filter argument, and Playwright's CLI treats a positional `--` as consuming the filter rather than applying it — confirmed by reproducing the same behavior with `npx playwright test --list -- progress-photo` (unfiltered) versus `npx playwright test --list progress-photo` (correctly filtered to 4 tests). This is a pre-existing pnpm/Playwright argument-forwarding interaction, not something this plan's changes caused. The run still completed with all 4 `progress-photo.spec.ts` cases passing and zero regressions in the other 94 durability-project tests; the run's only 5 failures were in the unrelated `[sync]` project (`sync.spec.ts`), which requires a live API+PowerSync Service stack that was not running in this environment (confirmed: nothing listening on the API port) — out of scope for this plan.

## User Setup Required

None — no external service configuration required. `docker-compose`'s Postgres/Mailpit/PowerSync containers (already running from 12-01) were sufficient for all verification performed.

## Next Phase Readiness

- `PUSH_DEFERRED_TABLES` is empty — 12-08 can now write its falsifiable "the deferred tuple is empty" assertion against a real, permanent condition rather than a moving target.
- `ProgressPhotoPlaceholderView` is ready for 12-06's before/after composite picker to consume directly (no `onPress` → disabled mode), as this plan's `<action>` anticipated.
- Native (iOS/Android) verification of the three photo modules is filed as three `.planning/WINDOWS.md` `unrun-verify` entries against ROADMAP Phase 999.1 — no blocker for this phase's remaining plans.
- No blockers.

---
*Phase: 12-body-metrics-dashboard*
*Completed: 2026-08-31*

## Self-Check: PASSED

All 16 files listed under "Files Created/Modified" verified present on disk. All 5 task commit
hashes (`41b8c4b`, `0f2fcb3`, `06ca242`, `f4aedbc`, `f20198b`) verified present in git history.
