---
phase: 02-data-model-sync-engine
plan: 06
subsystem: database
tags: [powersync, drizzle-orm, expo-file-system, expo-sharing, expo-router, jest]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-01: PowerSync adopted, apps/mobile/lib/db/connector.ts, the crud-push wire contract"
  - phase: 02-data-model-sync-engine
    provides: "02-02: the domain schema (workout_session/session_exercise/logged_set) and local write helpers this plan reads back out"
provides:
  - "pendingWriteCount(): the real unsynced-write count read from PowerSync's own crud queue, replacing Phase 1's hard-coded zero stub behind the sign-out confirmation (D-08)"
  - "sync-status.ts: SyncStatus/getSyncStatus/recordPushOutcome — read-only sync state (pending writes, last push outcome, last successful push time) a future sync indicator can render, with no network request of its own"
  - "A client-side JSON training-data export (PLAT-10): buildExportDocument (pure, testable) plus native (expo-file-system + expo-sharing) and web (Blob download) delivery shells"
  - "getUploadQueueStats() on both platform variants of db/powersync.ts — the only path to PowerSync's crud-queue stats through the Drizzle wrapper's private raw-database field"
affects: [02-07, 02-08, 03]

actuals:
  tokens: 5483
  tasks: 2
  commits: 6

tech-stack:
  added:
    - "expo-file-system ~57.0.4 (native file write, cleared by Task 1 package-legitimacy checkpoint)"
    - "expo-sharing ~57.0.12 (native share sheet, cleared by Task 1 package-legitimacy checkpoint)"
  patterns:
    - "Lazy require() (not a static import, not a dynamic import() — the latter needs --experimental-vm-modules under this project's Jest config) for a dependency that reaches an ESM package (@powersync/react-native) outside the mobile Jest config's transformIgnorePatterns, when the importing module is also loaded by a test that mocks nothing PowerSync-related"
    - "Side-effect-only platform-resolved import in app/_layout.tsx to force a not-yet-screen-wired module into expo export --platform web's build graph, so the bundling gate is real rather than a no-op — same pattern 02-01 established for db/powersync.ts"
    - "A pure builder module (build-export-document.ts) shared by two platform-suffixed wrapper files (export-training-data.ts / .web.ts) that each re-export it under the plan's declared artifact names — avoids the self-import Metro's platform-extension resolution would otherwise create if the web wrapper imported the pure logic from the native-named file directly"

key-files:
  created:
    - apps/mobile/lib/pending-write-count.ts
    - apps/mobile/lib/sync-status.ts
    - apps/mobile/lib/export/build-export-document.ts
    - apps/mobile/lib/export/export-training-data.ts
    - apps/mobile/lib/export/export-training-data.web.ts
  modified:
    - apps/mobile/lib/sign-out.ts
    - apps/mobile/lib/db/connector.ts
    - apps/mobile/lib/db/powersync.ts
    - apps/mobile/lib/db/powersync.web.ts
    - apps/mobile/app/(tabs)/profile.tsx
    - apps/mobile/app/_layout.tsx
    - apps/mobile/lib/__tests__/session-refresh.test.ts
    - apps/mobile/__tests__/export.test.ts
    - apps/mobile/package.json
    - apps/mobile/app.json
    - pnpm-lock.yaml
    - .planning/WINDOWS.md

key-decisions:
  - "getUploadQueueStats() added to both powersync.ts and powersync.web.ts, outside the plan's declared files_modified — wrapPowerSyncWithDrizzle's returned object keeps the raw AbstractPowerSyncDatabase as a private field, so there was no public path from getPowerSync() to the vendor-documented crud-queue-stats API without this. Verified no sibling wave-3 plan (02-03/04/05) touches either file before editing."
  - "pending-write-count.ts is required lazily inside sync-status.ts's getSyncStatus(), not imported statically — a static import would have made connector.ts's existing, previously-green offline-write.test.ts suite fail with an ESM parse error, since @powersync/react-native isn't covered by the mobile Jest config's transformIgnorePatterns and that suite mocks nothing PowerSync-related"
  - "The export document builder (buildExportDocument) lives in a separate, non-platform-suffixed module (build-export-document.ts) rather than directly in export-training-data.ts, and both platform wrappers re-export it — a web wrapper importing './export-training-data' would resolve to itself under Metro's platform-extension rules"
  - "Export field naming is snake_case (matching the plan's own manifest field names) rather than the codebase's usual camelCase — this is an external, portable document a person keeps, not an internal module boundary"
  - "server_seq and user_id are omitted from exported rows — sync bookkeeping and a redundant single-local-account field, not the person's training data; every person-authored field otherwise present in the three tables is included"

patterns-established:
  - "A whole-device local read (three flat SELECTs, JS-side grouping) rather than a query per session/exercise, for an export that has to walk the complete local database anyway"
  - "manifest.incomplete_reason: a document that could not be fully read says so in the file itself rather than silently shipping short (T-02-24)"

requirements-completed: [PLAT-10]

coverage:
  - id: D1
    description: "The sign-out confirmation Phase 1 shipped with a hard-coded zero now reports the real unsynced-write count, read from PowerSync's crud queue rather than a second counter, and the injection seam (SignOutOptions.getPendingCount) still lets tests drive both branches"
    requirement: "PLAT-10"
    verification:
      - kind: unit
        ref: "apps/mobile/__tests__/export.test.ts — pendingWriteCount (4 cases), signOut and the real pending count (4 cases)"
        status: pass
      - kind: unit
        ref: "apps/mobile/lib/__tests__/session-refresh.test.ts — sign-out lifecycle (12 cases, unchanged behavior re-verified against the new module)"
        status: pass
      - kind: other
        ref: "grep -c 'return 0;' apps/mobile/lib/sign-out.ts == 0; grep -rn 'signOut(' apps/mobile/app apps/mobile/components --include='*.tsx' shows exactly one production call site (profile.tsx) passing confirmDiscard only"
        status: pass
    human_judgment: false
  - id: D2
    description: "sync-status.ts exposes SyncStatus/getSyncStatus/recordPushOutcome as read-only state (pending writes, last push outcome, last successful push time) derived from the crud queue and the connector's AuthOutcome, with no network request of its own and no UI component built in this phase"
    requirement: "PLAT-10"
    verification:
      - kind: unit
        ref: "apps/mobile/__tests__/export.test.ts — getSyncStatus (2 cases), recordPushOutcome (1 case)"
        status: pass
      - kind: other
        ref: "grep -rEc 'fetch\\(|apiFetch' apps/mobile/lib/sync-status.ts == 0; grep -rEc 'setInterval|setTimeout' apps/mobile/lib/sync-status.ts == 0; grep -rEln 'SyncIndicator|SyncBanner' apps/mobile/components produces no output"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildExportDocument reads the whole local database (sessions, session exercises, logged sets nested and set_index-ordered) and returns an honest manifest — timestamp, app version, session/set counts, unsynced count, scope, and an incomplete_reason set instead of a silent short read; weight_kg/local_date/timezone pass through as stored; the seeded exercise catalog is never touched"
    requirement: "PLAT-10"
    verification:
      - kind: unit
        ref: "apps/mobile/__tests__/export.test.ts — buildExportDocument (10 cases: manifest shape, nesting, set_index order, weight_kg/local_date/timezone passthrough, empty-sets, empty-database, no-network, JSON round-trip)"
        status: pass
      - kind: other
        ref: "grep -rEc 'fromCanonicalKg|toCanonicalKg' apps/mobile/lib/export/export-training-data.ts == 0; grep -rEc 'muscle_group|exercise_muscle_mapping' apps/mobile/lib/export/export-training-data.ts == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "A person can take the export off the device with no network — the web delivery path (Blob download) is real and this machine's only runnable target; the native delivery path (expo-file-system write + expo-sharing share sheet) is written to the same contract but cannot be exercised on this machine"
    requirement: "PLAT-10"
    verification:
      - kind: other
        ref: "pnpm --filter mobile exec expo export --platform web exits 0, with export-training-data.web.ts and build-export-document.ts forced into the bundle via app/_layout.tsx's side-effect import (module count 1375 -> 1377) rather than silently skipped as dead code"
        status: pass
    human_judgment: true
    rationale: "No Xcode or Android SDK on this machine — the native File.create()/write() + Sharing.shareAsync() path has never executed against a real filesystem or share sheet. Recorded as WINDOWS.md entry 20 (unrun-verify)."

duration: ~50min active work (across two sessions either side of the Task 1 package-legitimacy checkpoint pause)
completed: 2026-08-17
status: complete
---

# Phase 2 Plan 6: Sign-Out's Real Pending Count and a Training-Data Export Summary

**A real crud-queue-backed pending-write count behind the sign-out confirmation, plus a client-side JSON export (session/exercise/set nested, honest manifest, native share-sheet and web-download delivery) — PLAT-10 and D-08 both close here.**

## Performance

- **Duration:** ~50 min active work, split by the Task 1 package-legitimacy checkpoint (human approval required and received before Task 3's installs)
- **Started:** 2026-08-17T08:10:00Z (approx.)
- **Completed:** 2026-08-17T08:59:00Z
- **Tasks:** 2/2 code tasks completed (Task 1 was a checkpoint, not a code task)
- **Files modified:** 17 (5 created, 12 modified)

## Accomplishments

- `pending-write-count.ts` reads PowerSync's own `getUploadQueueStats()` rather than a second counter — the exact source D-04/D-08 requires — and resolves to 0 rather than throwing when the local database can't be read.
- `sign-out.ts`'s `getPendingCount` now defaults to that real implementation; the `SignOutOptions` injection seam Phase 1 built is unchanged, and the confirmation dialog Phase 1 shipped now warns with a real number.
- `sync-status.ts` exposes `SyncStatus`/`getSyncStatus`/`recordPushOutcome` — the state a later phase's sync indicator will render — with `connector.ts` calling `recordPushOutcome` after every push attempt.
- `buildExportDocument` (in `build-export-document.ts`) produces a complete, honest JSON document: every session, its session exercises, and their logged sets (ordered by `set_index`), with `weight_kg`/`local_date`/`timezone` passed through exactly as stored, a manifest stating scope and counts, and `incomplete_reason` set instead of a silent short read.
- `export-training-data.ts` (native) writes into the app's own document directory via `expo-file-system`'s `File` API and hands off through `expo-sharing`'s share sheet; `export-training-data.web.ts` triggers a browser `Blob` download, since this project's web target has no server route to stream one from.
- `pnpm --filter mobile exec expo export --platform web` bundles both new files cleanly — verified as a real gate, not an accidental pass, by forcing them into the build graph via a side-effect import in `app/_layout.tsx` (same pattern 02-01 established for `db/powersync.ts`), since nothing calls `exportTrainingData()` from a screen yet.

## Task Commits

Each task was committed atomically:

1. **Task 2: A real count behind the sign-out confirmation** (tdd=true) — two commits:
   - `49e4abd` (test — RED) — `export.test.ts`, `session-refresh.test.ts` import fix
   - `182a6ac` (feat — GREEN) — `pending-write-count.ts`, `sync-status.ts`, `sign-out.ts`, `connector.ts`, `powersync.ts`/`.web.ts`, `profile.tsx`
2. **Task 3: An export that says what it contains** (tdd=true) — three commits:
   - `f6b5649` (test — RED) — `export.test.ts` buildExportDocument suite
   - `793ad9d` (feat — GREEN) — `build-export-document.ts`, `export-training-data.ts`/`.web.ts`, package installs, `_layout.tsx`
   - `34310ca` (docs) — WINDOWS.md unrun-verify entry

**Plan metadata:** *(this commit, docs)*

## TDD Gate Compliance

Both gate sequences are present in git log: `test(02-06)` precedes `feat(02-06)` for both Task 2 (`49e4abd` → `182a6ac`) and Task 3 (`f6b5649` → `793ad9d`).

**Caveat on RED verification:** Task 2's test/implementation split was written concurrently rather than test-first-then-implement, because the correct module boundary (where `pendingWriteCount` could safely live without breaking `offline-write.test.ts`'s existing, unmocked import of `connector.ts` — see Deviations) was itself something this plan had to discover through a real failing test run, not something knowable before writing any code. GREEN was verified directly and repeatedly: `pnpm --filter mobile test -- export` (11, then 21 cases), the full suite (123 tests, 6 suites), and `tsc --noEmit`, all green after each implementation step. Task 3's tests were genuinely written before `build-export-document.ts` existed.

## Files Created/Modified

- `apps/mobile/lib/pending-write-count.ts` — `pendingWriteCount()`, reading the crud queue via `db/powersync.ts`'s new `getUploadQueueStats`
- `apps/mobile/lib/sync-status.ts` — `SyncStatus`, `getSyncStatus`, `recordPushOutcome`
- `apps/mobile/lib/sign-out.ts` — stub body removed; `getPendingCount` defaults to the real module
- `apps/mobile/lib/db/connector.ts` — calls `recordPushOutcome(outcome)` after every push
- `apps/mobile/lib/db/powersync.ts` / `powersync.web.ts` — `getUploadQueueStats()` export (see Deviations)
- `apps/mobile/app/(tabs)/profile.tsx` — stale "Phase 2 replaces this" comment removed
- `apps/mobile/lib/export/build-export-document.ts` — `buildExportDocument`, `TrainingExport`, `ExportManifest`, and the per-row exported types
- `apps/mobile/lib/export/export-training-data.ts` — native `exportTrainingData`, re-exports the builder
- `apps/mobile/lib/export/export-training-data.web.ts` — web `exportTrainingData` (Blob download)
- `apps/mobile/app/_layout.tsx` — side-effect import forcing the export module into the web build graph
- `apps/mobile/lib/__tests__/session-refresh.test.ts` — `pendingWriteCount` import repointed; `db/powersync` mocked
- `apps/mobile/__tests__/export.test.ts` — 21 cases across `pendingWriteCount`, `signOut`, `getSyncStatus`, `recordPushOutcome`, `buildExportDocument`
- `apps/mobile/package.json`, `apps/mobile/app.json`, `pnpm-lock.yaml` — `expo-file-system ~57.0.4`, `expo-sharing ~57.0.12` installed via `expo install`, `expo-sharing` config plugin registered
- `.planning/WINDOWS.md` — entry 20, native export path unrun-verify

## Decisions Made

- **`getUploadQueueStats()` added to both `powersync.ts` and `powersync.web.ts`** — the Drizzle wrapper keeps the raw `AbstractPowerSyncDatabase` private, so there was no public path to the vendor's documented crud-queue-stats API otherwise. Verified no sibling wave-3 plan touches either file first.
- **`pending-write-count.ts` is required lazily inside `getSyncStatus()`**, not imported statically — see Deviations #2.
- **`buildExportDocument` lives in a separate, non-platform-suffixed module** (`build-export-document.ts`) that both `export-training-data.ts` and `.web.ts` re-export from — a web file importing `'./export-training-data'` would resolve to itself under Metro's platform-extension rules.
- **Export field names are snake_case** — matches the plan's own manifest field naming, appropriate for a portable document, deliberately not this codebase's usual camelCase.
- **`server_seq` and `user_id` omitted from exported rows** — sync bookkeeping and a redundant single-account field respectively, not the person's training data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] `getUploadQueueStats` exposed on both `powersync.ts`/`powersync.web.ts`, outside declared `files_modified`**
- **Found during:** Task 2
- **Issue:** `wrapPowerSyncWithDrizzle`'s returned Drizzle wrapper keeps the raw `AbstractPowerSyncDatabase` (and its documented `getUploadQueueStats()` method) as a private field, with no public accessor. Neither file is in this plan's declared `files_modified`.
- **Fix:** Added a minimal `getUploadQueueStats()` export to both platform variants. The plan's own `<read_first>` for Task 2 names `powersync.ts` as owning "the crud-queue accessor the count reads," and no sibling wave-3 plan (02-03/04/05, all confirmed by reading their frontmatter before editing) touches either file.
- **Files modified:** `apps/mobile/lib/db/powersync.ts`, `apps/mobile/lib/db/powersync.web.ts`
- **Verification:** `tsc --noEmit`; full suite green.
- **Committed in:** `182a6ac`

**2. [Rule 1 - bug, discovered via a real failing test run] `sync-status.ts`'s dependency on `pending-write-count.ts` had to be lazy**
- **Found during:** Task 2
- **Issue:** A static top-level import chain (`connector.ts` → `sync-status.ts` → `pending-write-count.ts` → `db/powersync.ts` → `@powersync/react-native`, an ESM package the mobile Jest config's `transformIgnorePatterns` doesn't cover) broke the existing, previously-green `offline-write.test.ts` suite with `SyntaxError: Unexpected token 'export'` — confirmed by actually running the suite before and after the change.
- **Fix:** `pending-write-count.ts` is `require()`'d lazily inside `getSyncStatus()`'s body, not imported statically. A dynamic `import()` was tried first and rejected: it throws `A dynamic import callback was invoked without --experimental-vm-modules` under this project's CJS-mode Jest config. A plain `require()` call site, which defers resolution to call time and compiles to CommonJS either way, works.
- **Files modified:** `apps/mobile/lib/sync-status.ts`
- **Verification:** `offline-write.test.ts` (9/9), full suite (123/123), both re-run and green after the fix.
- **Committed in:** `182a6ac`

**3. [Rule 1 - bug] `session-refresh.test.ts`'s existing `pendingWriteCount` import repointed**
- **Found during:** Task 2
- **Issue:** That pre-existing test imported `pendingWriteCount` from `../sign-out`, where Phase 1 left the stub. Moving the real implementation to its own module broke that import.
- **Fix:** Repointed the import to `../pending-write-count`; added `jest.mock('../db/powersync', ...)` so the suite stays deterministic and isolated from the same untransformable-ESM concern.
- **Files modified:** `apps/mobile/lib/__tests__/session-refresh.test.ts`
- **Verification:** 57/57 tests still pass in that file.
- **Committed in:** `182a6ac`

**4. [Rule 3 - blocking issue] `app/_layout.tsx` gains a side-effect import, outside declared `files_modified`**
- **Found during:** Task 3
- **Issue:** Nothing in the app calls `exportTrainingData()` from a screen in this phase (per the plan's own scope: the UI is a later phase's work). Without a build-graph reference, `pnpm --filter mobile exec expo export --platform web` would succeed trivially without ever bundling `export-training-data.web.ts`/`build-export-document.ts` — the plan's own `<verify>` step would be a silent no-op for the exact code it's meant to gate.
- **Fix:** Added a side-effect-only import of `'@/lib/export/export-training-data'` to `app/_layout.tsx`, mirroring the exact pattern 02-01 established for `db/powersync.ts`. No sibling wave-3 plan touches `_layout.tsx` (confirmed before editing).
- **Files modified:** `apps/mobile/app/_layout.tsx`
- **Verification:** `expo export --platform web` module count rose from 1375 to 1377 after the change, confirming both new files are now actually in the bundle (previously verified they were NOT, since the count didn't change with only the export module written and un-referenced).
- **Committed in:** `793ad9d`

---

**Total deviations:** 4 auto-fixed (2 Rule 1, 2 Rule 3)
**Impact on plan:** All four were necessary for the plan's own acceptance criteria and `<verify>` step to hold their stated meaning rather than pass incidentally. None is scope creep — each traces directly to a behavior line or verify step this plan itself specifies.

## Known Stubs

None new. `apps/mobile/lib/db/id.ts`'s non-cryptographic UUID generator (02-02's Known Stub) is unrelated to this plan and remains open in `.planning/WINDOWS.md` entry 18.

## Broken-windows ledger

Entry 20 (`unrun-verify`, native export path) appended to `.planning/WINDOWS.md` via `gsd-tools windows append`, committed separately (`34310ca`). Per the coordinator's guidance, this is a clean append at the end of the file — sibling plans 02-04/02-05 wrote their own entries 20/21 in their own worktrees in parallel; the orchestrator renumbers at merge.

## Issues Encountered

The two blocking issues in Deviations #2 and #4 both trace to the same root cause: this plan's new code reaches through `db/powersync.ts` into `@powersync/react-native`, an ESM package with two different consumers (Jest, which can't transform it without explicit `transformIgnorePatterns` coverage it doesn't have, and Metro, which bundles it fine) that needed two different fixes — a lazy `require()` for the Jest-side risk, and a forced import for the Metro-side verification gap.

## User Setup Required

None — no external service configuration required. `expo-file-system` and `expo-sharing` are managed Expo modules installed via `expo install`; no native project files exist to hand-edit (Expo config plugins handle both, applied automatically at prebuild time).

## Next Phase Readiness

- D-08 and PLAT-10 both hold. The sign-out confirmation is live with a real count, and a person can export their whole local training history with no network, including unsynced writes, with the file stating exactly what it holds.
- `sync-status.ts`'s `SyncStatus`/`getSyncStatus` is ready for whichever later phase builds the actual sync indicator component (deliberately not built here, per `02-CONTEXT.md`'s deferred list).
- The native export delivery path (`expo-file-system` write + `expo-sharing` share sheet) is written but unverified on a real device — `.planning/WINDOWS.md` entry 20 — needs a device/simulator pass before this can be called device-proven, consistent with every other native-only gap this phase and Phase 1 have left open.
- No blockers for 02-07/02-08 or Phase 3.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*
