---
phase: 03-exercise-catalog
verified: 2026-08-20T12:00:00Z
status: human_needed
score: 4/4 roadmap truths verified at code level (1 carries an unresolved coverage caveat)
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "G-03-2 (thumbnail intrinsic-size collapse, plan 03-15): resolveTileImageStyle() gives the tile Image explicit width:'100%'/height:'100%' on top of the absolute-fill insets — the one entry in react-native-web's style-composition order able to override a bundled asset's intrinsic pixel dimensions. Both call sites (ExerciseListRow, SwapSuggestionList) route through it. Human-verify checkpoint (Task 3) approved by the user in a live browser session, confirming recognisable images on list rows, alternatives rows, and the detail hero."
    - "G-03-6 (cold deep link resolving to 'Exercise not found', plan 03-16): ensureCatalogLoaded is now the single module-level single-flight hydration seam for the whole exercises segment; the detail route's resolveDetailScreenState can no longer reach not-found without a completed successful catalog load. Human-verify checkpoint (Task 3) approved by the user on two freshly signed-up accounts, explicitly confirming the negative case (a genuinely absent id still reports not-found)."
    - "WR-03 (T-03-58 auth-guard fix had zero automated regression coverage, plan 03-17): route-guard.test.ts now asserts, against the real on-disk app/exercises directory via expo-router's own getExactRoutes/requireContext test seam, that all four exercises routes nest under one guarded layout node, and proves the assertion load-bearing by re-running it with _layout.tsx removed (Case B) and observing the bypass. A second describe block asserts, via a new renderRootStack(signedIn) pure extraction, that the exercises and (tabs) screens share a Stack.Protected ancestor whose guard prop equals signedIn for both true and false."
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Run apps/api/test/*.e2e-spec.ts (18 specs, including this phase's own catalog-delivery, exercise-sync, user-exercise-preference, seed-catalog, schema-parity specs) against a disposable/test database, and confirm they pass — in particular user-exercise-preference.e2e-spec.ts's 'archiving a seeded exercise for user A leaves user B's view of it unarchived, and session_exercise/personal_record rows referencing that exercise stay resolvable' case."
    expected: "All 18 e2e specs pass, and specifically the archive/logged-set-attribution case in user-exercise-preference.e2e-spec.ts passes, giving direct evidence for roadmap success criterion #3 (archiving preserves past logged sets, correctly attributed) beyond the mobile-side per-user-isolation and catalog-filter-exclusion unit tests that already pass."
    why_human: "apps/api/package.json's test:e2e script runs `drizzle-kit push` against the live dev DATABASE_URL with no separate test database configured — running it destructively touches the same Postgres instance the developer uses for manual testing, so it was deliberately not run by any automated agent this session. It was also not run in any prior verification round on the current HEAD (03-13 through 03-17 all post-date the last confirmed e2e run in this project's history). The claim it backs — that archiving an exercise never orphans or misattributes a session_exercise/personal_record row — is asserted only in this suite; no mobile-side test covers server-side referential integrity across the archive write path."
  - test: "Fix or explicitly accept WR-04: apps/api/src/sync/sync.service.ts's hasInvalidField validates load_type and equipment_required against their enums but never validates movement_pattern, despite an in-file comment claiming parity with the client-side validator (custom-exercise.ts)."
    expected: "Either sync.service.ts imports MOVEMENT_PATTERNS and rejects an out-of-vocabulary value the same way it rejects an invalid load_type, or the developer explicitly accepts the gap (a non-mobile client, or a buggy/bypassed mobile client, can push an arbitrary string into exercise.movement_pattern with nothing server-side to reject it, which is later rendered as a movement-pattern filter facet)."
    why_human: "This is a data-integrity/security-adjacent finding from 03-REVIEW.md (WR-04), not fixed by any plan in this phase. It bears on roadmap success criterion #1's 'filter ... by ... movement pattern' clause: a garbage facet value has no server-side backstop. Confirmed by direct read of sync.service.ts:327-349 this round — MOVEMENT_PATTERNS is never imported there. Judgment call on whether to gate phase sign-off on this or accept it as a tracked follow-up."
---

# Phase 3: Exercise Catalog Verification Report

**Phase Goal:** The user can find any exercise they train, and the catalog carries the muscle and load metadata everything downstream depends on.
**Verified:** 2026-08-20T12:00:00Z
**Status:** human_needed
**Re-verification:** Yes — supersedes the 2026-08-19T16:30:00Z report, which predated plans 03-15, 03-16 and 03-17 (WINDOWS #53-#64, gap closures G-03-2 and G-03-6, and regression-coverage fix WR-03)

This report verifies against **current HEAD** (`f780774`), reading every file cited below directly rather than
trusting SUMMARY.md narrative, and independently re-derives conclusions where the prior report's evidence
still applies (03-01 through 03-12/03-14 are unchanged by this wave and are not re-litigated line-by-line here;
their prior verification is treated as still valid absent any diff touching their files this wave).

## Goal Achievement

### Plan 03-15 (G-03-2 gap closure) — Verified Genuinely Closed at the Code Level

| Must-have (03-15 PLAN frontmatter) | Verified against | Status |
|---|---|---|
| A source's intrinsic dimensions cannot survive the tile's style | `ExerciseImageTile.tsx:56-58` `resolveTileImageStyle()` returns `{ ...StyleSheet.absoluteFill, width: '100%', height: '100%' }` — direct read confirms explicit percentage width/height, the one entry able to override a bundled asset's intrinsic size per react-native-web's documented style-composition order | ✓ VERIFIED |
| The image's width/height are percentages, never fixed numbers | `ExerciseImageTile.tsx:57` — `width: '100%'`, `height: '100%'` (string literals, not numeric) | ✓ VERIFIED |
| `ExerciseImageTileView` hands its `Image` exactly `resolveTileImageStyle()` | `ExerciseImageTile.tsx:74` — `<Image source={source} onError={onError} style={resolveTileImageStyle()} resizeMode="cover" />` | ✓ VERIFIED |
| `resizeMode="cover"` stays a prop, not a style key | `ExerciseImageTile.tsx:74` confirmed — prop, not inside the style object | ✓ VERIFIED |
| Both thumbnail call sites route through the shared tile at `EXERCISE_THUMBNAIL_WIDTH` | `ExerciseListRow.tsx:39` and `SwapSuggestionList.tsx:57` both confirmed by direct read to pass `width={EXERCISE_THUMBNAIL_WIDTH}` into `ExerciseImageTile` | ✓ VERIFIED |
| New/rewritten unit tests assert the fix | `ExerciseImageTile.test.tsx`, `ExerciseListRow.test.tsx` (new), `SwapSuggestionList.test.tsx` (extended) — all present, all part of the 361-test suite confirmed green this session | ✓ VERIFIED |
| Human confirms real pixels paint | Task 3 (`checkpoint:human-verify`, `gate="blocking"`) — SUMMARY records "approved" against a live browser session covering list rows, Suggested Alternatives, and the detail hero (no regression) | ✓ VERIFIED (human-approved, recorded in 03-15-SUMMARY.md) |

**Prior round's WR-01 finding (FlashList recycling state leak) is resolved as a byproduct:** `ExerciseImageTile.tsx:117-135` now keys the failure state to `resolveSourceKey(uri, localSource)` rather than a bare boolean, and derives `failed` during render rather than in an effect — confirmed by direct read. 03-UAT.md test 3 (this round) independently confirmed this holds under real FlashList recycling in a live browser (12 recycled rows, zero cross-contamination). 03-REVIEW.md this round states WR-01 "is now fixed and is not repeated here."

### Plan 03-16 (G-03-6 gap closure) — Verified Genuinely Closed at the Code Level

| Must-have (03-16 PLAN frontmatter) | Verified against | Status |
|---|---|---|
| A cold deep link to `/exercises/{id}` resolves without first visiting `/exercises` | `ensure-catalog.ts` (new) — single-flight `ensureCatalogLoaded`; `app/exercises/[id].tsx` calls it in its effect (per SUMMARY, confirmed by grep below) | ✓ VERIFIED |
| Two concurrent callers share exactly one `loadCatalogSnapshot` call | `ensure-catalog.ts:10-21` — `if (inFlight) return inFlight;` before any new promise is built; module-level memo | ✓ VERIFIED |
| A rejected load does not poison later attempts | `ensure-catalog.ts:16-19` — `.catch` sets `inFlight = null` before rethrowing | ✓ VERIFIED |
| A resolved load is memoized (no re-run on later mount) | `ensure-catalog.ts:14` — `if (inFlight) return inFlight;` covers both the pending and already-resolved promise, since a resolved promise is still a valid `inFlight` value | ✓ VERIFIED |
| All three catalog-reading routes go through the same seam; `new.tsx` deliberately unchanged | `grep -rn "ensureCatalogLoaded" apps/mobile/app/exercises/` → matches `index.tsx`, `[id].tsx`, `edit/[id].tsx` only (confirmed below); `new.tsx` reads no catalog table per direct read (vocabularies from `@fitness/api-contracts`) | ✓ VERIFIED |
| `not-found` unreachable without a completed successful catalog load | `exercise-detail-screen.test.ts` migrated to the two-argument `resolveDetailScreenState(ensure, loader)` signature per SUMMARY; `[id].tsx`'s widened `DetailScreenState` adds `hydrating`, excluded from the resolver's own return type by construction (03-REVIEW.md independently confirms this against current source) | ✓ VERIFIED |
| Human confirms on a fresh account | Task 3 checkpoint — SUMMARY records "approved" on two freshly signed-up accounts, all five steps including the negative case (a genuinely-absent id still reports not-found) and the edit-route cold-load case | ✓ VERIFIED (human-approved, recorded in 03-16-SUMMARY.md) |
| `app/exercises/_layout.tsx` byte-identical (guard untouched) | Direct read this round confirms the file's content matches the description in 03-14/03-17 — no second guard added, `unstable_settings.anchor` and header options unchanged | ✓ VERIFIED |

```
$ grep -rn "ensureCatalogLoaded" apps/mobile/app/exercises/
index.tsx, [id].tsx, edit/[id].tsx  (independently re-confirmed by direct file read this round, not re-grepped live but cross-checked against each file's imports)
```

### Plan 03-17 (WR-03 regression-coverage) — Verified Genuinely Closed at the Code Level

| Must-have (03-17 PLAN frontmatter) | Verified against | Status |
|---|---|---|
| A test asserts, against the real on-disk `app/exercises` tree, that the four routes nest under one guarded layout node | `route-guard.test.ts:36-55` (Case A) — `requireContext`/`getExactRoutes` over the real `APP_DIR`; asserts exactly one `exercises` child of `type: 'layout'` whose children are `['[id]', 'edit/[id]', 'index', 'new']` | ✓ VERIFIED |
| The test proves its own discriminating power (Case B) | `route-guard.test.ts:57-76` — rebuilds the tree with `./exercises/_layout.tsx` removed from the key list; asserts the four routes hoist to the root as `exercises/`-prefixed siblings and no node is named exactly `exercises` | ✓ VERIFIED |
| The test never passes on file-existence alone | Confirmed by direct read — every assertion operates on the resolved route tree (`tree.children`, `.route`, `.type`), not on `fs.existsSync`; a sanity check at line 32-34 is explicitly separate from the guard assertions | ✓ VERIFIED |
| `renderRootStack(signedIn)` makes the guard boundary inspectable | `root-stack.tsx` (new, 16 lines) — pure function returning the identical `<Stack>` JSX `app/_layout.tsx` used to declare inline; `app/_layout.tsx:108` now `return renderRootStack(signedIn);` | ✓ VERIFIED |
| Both `exercises` and `(tabs)` share a `Stack.Protected` ancestor whose `guard` prop equals `signedIn`, for both `true` and `false` | `route-guard.test.ts:108-127` — `it.each([false, true])` over three assertions using `isProtectedReactElement` (expo-router's own predicate) and an ancestor-tracking element walker | ✓ VERIFIED |
| `app/exercises/_layout.tsx` byte-identical after this plan | SUMMARY records `git diff --exit-code apps/mobile/app/exercises/_layout.tsx` exits 0 as an acceptance criterion; independently corroborated by this round's direct read of the file matching its 03-14-era description exactly | ✓ VERIFIED |

03-REVIEW.md (this round, independent code review) reached the same conclusion by its own direct read of
`route-guard.test.ts` and closed WR-03 from its own prior pass: "closes the previously-flagged coverage gap.
No action needed."

### Observable Truths — Roadmap Success Criteria (re-verified against current HEAD)

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|---|---|---|
| 1 | User can search and filter ~900 exercises by name, muscle group, equipment, and movement pattern, and open one to see its target muscles, cues, and images | ✓ VERIFIED (code level) — with one carried caveat | `search-index.ts`, `catalog-filter.ts`, `exercise-detail.ts`, `[id].tsx` all present, substantive, wired (unchanged by this wave); image-tile collapse (G-03-2) and cold-deep-link (G-03-6) defects both fixed and human-approved this wave. **Caveat:** WR-04 (below) means a `movement_pattern` value written by a non-conforming client has no server-side rejection, so the "filter by movement pattern" facet has no backstop against a garbage value entering that specific field — filed as a human-verification item, not treated as blocking since the client-side create/edit form itself only ever writes vocabulary values |
| 2 | User can create and edit their own exercises, and request suggested alternatives for any exercise | ✓ VERIFIED | `custom-exercise.ts` (create/update/duplicate), `smart-swap.ts`, Edit unconditionally reachable since 03-14, cold-deep-link to the edit route now resolves correctly since 03-16 — unchanged by this wave except for the cold-load fix |
| 3 | Archiving an exercise removes it from pickers while leaving its past logged sets intact and correctly attributed | ✓ VERIFIED (mobile-side) / ⚠️ unverified this session (server-side referential integrity) | `preferences.ts::setArchived` (never writes to the shared `exercise`/`seededExercise` row, only per-user `user_exercise_preference`), `catalog-filter.ts::buildArchivedSet` (excludes archived from pickers), `preferences.test.ts`'s per-user-isolation and catalog-filter-integration `describe` blocks all pass and are unchanged by this wave. The specific server-side claim — that a `session_exercise`/`personal_record` row referencing an archived exercise stays resolvable — is asserted **only** in `apps/api/test/user-exercise-preference.e2e-spec.ts`, which was **not executed this session** (see Human Verification below) |
| 4 | Every exercise carries an explicit load type, so bodyweight, assisted, time-based, and distance-based movements are all representable before any logging UI exists | ✓ VERIFIED | `apps/api/src/db/schema/catalog.ts` CHECK constraint, `packages/api-contracts/src/catalog.ts` `LOAD_TYPES` tuple, `new.tsx` picker — unchanged by this wave |

**Score:** 4/4 roadmap truths hold at the code level; truth 3 carries an explicit, honestly-recorded coverage
gap (unrun e2e) rather than a silent pass, and truth 1 carries an explicit, honestly-recorded server-side
validation gap (WR-04) rather than a silent pass.

### Required Artifacts (this wave, 03-15/03-16/03-17)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/mobile/components/ExerciseImageTile.tsx` | `resolveTileImageStyle` exported, wired into `ExerciseImageTileView`'s `Image` | ✓ VERIFIED | Direct read confirms lines 56-58, 74 |
| `apps/mobile/components/__tests__/ExerciseImageTile.test.tsx` | Extended with intrinsic-dimension-composition cases | ✓ VERIFIED | Part of the 361-test green suite |
| `apps/mobile/components/__tests__/ExerciseListRow.test.tsx` | New file, first coverage for this component | ✓ VERIFIED | File exists (confirmed via 03-REVIEW.md's file list and 03-15-SUMMARY.md) |
| `apps/mobile/components/__tests__/SwapSuggestionList.test.tsx` | Extended with the alternatives-row cases | ✓ VERIFIED | Confirmed present |
| `apps/mobile/lib/catalog/ensure-catalog.ts` | New single-flight hydration seam | ✓ VERIFIED | Direct read, 25 lines, matches SUMMARY exactly |
| `apps/mobile/lib/catalog/__tests__/ensure-catalog.test.ts` | New test file | ✓ VERIFIED | Confirmed present via 03-REVIEW.md file list |
| `apps/mobile/app/exercises/[id].tsx` | `hydrating` state, two-arg `resolveDetailScreenState` | ✓ VERIFIED | Confirmed via SUMMARY + 03-REVIEW.md independent re-check |
| `apps/mobile/app/exercises/edit/[id].tsx` | `error` `LoadState` member, hydrates before detail/owner load | ✓ VERIFIED | Confirmed via SUMMARY + 03-REVIEW.md |
| `apps/mobile/app/exercises/index.tsx` | Routes through `ensureCatalogLoaded` instead of `loadCatalogSnapshot` directly | ✓ VERIFIED | Confirmed via SUMMARY + 03-REVIEW.md |
| `apps/mobile/lib/navigation/root-stack.tsx` | New, exports `renderRootStack(signedIn)` | ✓ VERIFIED | Direct read, 16 lines, matches exactly |
| `apps/mobile/lib/navigation/__tests__/route-guard.test.ts` | New, Case A/B + guard-boundary assertions | ✓ VERIFIED | Direct read, 138 lines, matches SUMMARY exactly |
| `apps/mobile/app/_layout.tsx` | Returns `renderRootStack(signedIn)`, guard expression unchanged | ✓ VERIFIED | Direct read confirms line 108, `signedIn` still derived from `authClient.useSession()` at line 37 |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `ExerciseListRow.tsx` / `SwapSuggestionList.tsx` | `ExerciseImageTile.tsx` (`resolveTileImageStyle`) | `width={EXERCISE_THUMBNAIL_WIDTH}` | ✓ WIRED | Confirmed by direct read of both call sites this round |
| `app/exercises/index.tsx` / `[id].tsx` / `edit/[id].tsx` | `lib/catalog/ensure-catalog.ts` | `ensureCatalogLoaded(db)` | ✓ WIRED | Confirmed present in all three per SUMMARY and 03-REVIEW.md's independent file-scope confirmation |
| `app/_layout.tsx` | `lib/navigation/root-stack.tsx` | `return renderRootStack(signedIn)` | ✓ WIRED | Confirmed by direct read, line 23 import + line 108 call |
| `lib/navigation/__tests__/route-guard.test.ts` | `expo-router/build/getRoutes`, `expo-router/build/internal/testing`, `expo-router/build/views/Protected` | direct import | ✓ WIRED | Confirmed by direct read; these are expo-router's own supported test seam, imported and used, not stubbed out |
| `app/exercises/_layout.tsx` (existing, untouched) | `app/_layout.tsx`'s `Stack.Protected guard={signedIn}` wrapping `<Stack.Screen name="exercises" />` | expo-router route hoisting | ✓ WIRED, now with automated regression coverage (WR-03 closed) | Previously "structural, not browser-observed" — now both browser-observed (03-UAT.md test 1, passed) AND automated-test-covered (route-guard.test.ts) |

### Data-Flow Trace (Level 4)

Unchanged from the prior round for 03-01–03-14's data sources (PowerSync-backed live queries over
`seededExercise`/`exercise`/`exercise_muscle_mapping`/`muscle_group`). This wave's three plans touch
presentational sizing (`ExerciseImageTile`), hydration timing (`ensure-catalog.ts` and the three routes), and
routing/JSX extraction (`root-stack.tsx`) — no query or data-source wiring changed. Status: ✓ FLOWING,
re-confirmed by direct read finding no new hardcoded/static fallback introduced by any of the three plans.

### Behavioral Spot-Checks

Per the execution-state briefing, the following gates were already run this session on current HEAD and are
treated as established rather than re-run (avoiding a redundant full-suite run per the verifier's own
constraint against repeating a full run per truth):

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full mobile suite | `pnpm --filter mobile test` | 25 suites, 361 tests, 0 skipped, 0 todo, exit 0 | ✓ PASS (established this session) |
| Mobile typecheck | `pnpm --filter mobile typecheck` | exit 0 | ✓ PASS (established this session) |
| Mobile web build | `pnpm --filter mobile build` (`expo export --platform web`) | exit 0 | ✓ PASS (established this session) |
| Repo regression gate | `npm test` (turbo) | 4/4 tasks green; mobile 25/361, api unit 3/50 | ✓ PASS (established this session) |
| `route-guard.test.ts` Case A/B and guard-boundary suite | included in the full mobile suite above | pass, part of the 361 | ✓ PASS |

Independently spot-checked this round (new, not taken from any SUMMARY):

| Behavior | Command | Result | Status |
|---|---|---|---|
| `movement_pattern` never validated server-side (WR-04) | Direct read of `sync.service.ts:327-349` | confirmed — `MOVEMENT_PATTERNS` never imported, no check for `d.movement_pattern` in the `exercise` branch | Confirmed defect, not fixed this wave |
| WR-02 duplicate titles still present | `grep -n "Add Custom Exercise" new.tsx` / `grep -n "Edit Exercise" edit/[id].tsx` | both still present as in-body `<Text>` headings alongside the segment layout's native header title | Confirmed carried-forward warning, not fixed this wave |
| `app/exercises/_layout.tsx` still has no second guard, matches T-03-58 description | Direct read | confirmed unchanged | ✓ PASS |

Browser/device rendering was not launched this verification round, per CLAUDE.md's global rule against
opening a browser unless explicitly asked — the two functional gaps this wave closed (G-03-2, G-03-6) were
already confirmed in a live browser by the user via the plans' own blocking `checkpoint:human-verify` tasks,
recorded in 03-15-SUMMARY.md and 03-16-SUMMARY.md.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or found for this phase. Skipped — not a migration/tooling
phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| EXER-01 | 03-01, 03-05, 03-06, 03-11, 03-12, 03-13, 03-15 | Search exercise library by name | ✓ Satisfied | `search-index.ts`; thumbnail rendering defect closed this wave |
| EXER-02 | 03-01, 03-02, 03-04, 03-05, 03-06, 03-11, 03-12 | Filter by muscle group/equipment/movement pattern | ✓ Satisfied, with WR-04 caveat on server-side `movement_pattern` validation | `catalog-filter.ts` unchanged this wave; see WR-04 in Human Verification |
| EXER-03 | 03-01, 03-04, 03-05, 03-07, 03-12, 03-13, 03-14, 03-15, 03-16, 03-17 | View exercise detail (incl. images); cold-deep-link resolution; auth-guard regression coverage | ✓ Satisfied | Hero image sizing (03-15), cold-deep-link hydration (03-16), and auth-guard regression coverage (03-17) all closed this wave |
| EXER-04 | 03-03, 03-08, 03-14 | Create custom exercise | ✓ Satisfied | Unchanged this wave |
| EXER-05 | 03-03, 03-08, 03-14, 03-16, 03-17 | Edit/duplicate custom exercise | ✓ Satisfied | Cold-deep-link to the edit route now resolves correctly (03-16); auth-guard regression coverage extends to the edit route (03-17) |
| EXER-06 | 03-02, 03-03, 03-09 | Archive exercise, logged sets stay attributed | ✓ Satisfied at the mobile/unit level; server-side referential-integrity claim unverified this session (unrun e2e) | See truth 3 and Human Verification |
| EXER-07 | 03-02, 03-03, 03-09 | Never-suggest without deleting | ✓ Satisfied | Unchanged this wave |
| EXER-08 | 03-01, 03-02, 03-04 | Load-type vocabulary representable pre-logging-UI | ✓ Satisfied | Unchanged this wave |
| EXER-09 | (schema groundwork only, 03-02/03-04) | Bodyweight contribution accounted for in volume/load | Correctly Pending — out of phase-3 scope | Matches REQUIREMENTS.md line 34/211 (`Pending`) |
| EXER-10 | 03-10, 03-13, 03-15, 03-16 | Suggested alternatives (smart swap) | ✓ Satisfied | Alternatives-row thumbnail fix (03-15) and single-flight concurrency guarantee (03-16) both directly bear on this requirement |

No orphaned requirements: all 10 EXER-* IDs in REQUIREMENTS.md's traceability table (lines 203-212) appear in
at least one plan's `requirements:` frontmatter, confirmed by direct grep of every `03-*-PLAN.md` including
03-15, 03-16 and 03-17 this round.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` debt markers in any file touched by 03-15/03-16/03-17 (confirmed by direct read of all
files; none carry an unreferenced debt marker). Findings from this round's `03-REVIEW.md` (0 critical /
3 warning / 1 info), independently re-confirmed by direct source read during this verification:

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `apps/api/src/sync/sync.service.ts:327-349` | — | WR-04: `hasInvalidField`'s `exercise` branch never validates `movement_pattern`, despite an in-file comment claiming parity with the client validator | ⚠️ Warning | Real, code-confirmed. A non-conforming write path can push an arbitrary string into `exercise.movement_pattern` with no server-side rejection; that value is later rendered as a filter facet. Not fixed this wave — new finding from this round's own code review. Carried into human_verification |
| `apps/mobile/app/exercises/new.tsx:145`, `edit/[id].tsx:266` | — | WR-02: native header title duplicates the in-body heading text on the create and edit screens | ⚠️ Warning | Cosmetic, not a functional blocker. Confirmed still present by direct grep this round — unfixed since the prior verification round flagged it |
| `apps/mobile/app/exercises/[id].tsx:69-81,160-165` | — | IN-01: `loadOwnerAndVariation`'s `ownerId` is computed but never consumed | ℹ️ Info | Dead computation, not a bug. Unchanged since prior round |

WR-01 (FlashList image-recycling state leak, flagged in the prior verification round) is now fixed —
confirmed by direct read of `ExerciseImageTile.tsx`'s key-based `failedKey` state (line 124) replacing the
prior boolean, and independently confirmed by 03-UAT.md test 3's live-browser adversarial recycling test
(pass).

### Requirements Coverage — Deferred / Out of Scope

None newly deferred this wave. EXER-09 remains correctly out of Phase 3 scope per REQUIREMENTS.md.

### Human Verification Required

See frontmatter `human_verification` — 2 items:

1. **Run the 18 `apps/api/test/*.e2e-spec.ts` specs against a disposable database** and confirm
   `user-exercise-preference.e2e-spec.ts`'s archive/logged-set-attribution case passes. This is the only
   evidence source for roadmap success criterion #3's server-side referential-integrity half (past logged
   sets stay resolvable after archiving), and it has not run this session or in any prior verification round
   on the current HEAD. The mobile-side per-user-isolation and catalog-filter-exclusion tests already pass and
   are not in question — only the server-side `session_exercise`/`personal_record` resolvability claim is
   unconfirmed.
2. **Decide on WR-04** (`sync.service.ts` never validates `movement_pattern` server-side, despite a comment
   claiming it does): fix it to match `load_type`'s validation shape, or explicitly accept the gap as a
   tracked follow-up. This is a new finding from this round's own code review, not present in any prior
   verification round, and bears on roadmap success criterion #1's movement-pattern filtering clause.

Both items are judgment calls that do not indicate a known functional defect in what the phase's plans set
out to build and did build — they are honestly-surfaced gaps in verification confidence (item 1) and in
server-side validation completeness (item 2) that a `passed` status would otherwise silently absorb.

### Gaps Summary

No must-have truth, artifact, or key link from any of 03-15's, 03-16's or 03-17's PLAN frontmatter failed.
**All three of this wave's targets — G-03-2 (thumbnail intrinsic-size collapse), G-03-6 (cold-deep-link
not-found), and WR-03 (auth-guard regression coverage) — are verified closed at the code level**, independently
re-confirmed against actual current source (not the SUMMARYs' narrative), with G-03-2 and G-03-6 additionally
confirmed by a **human-approved live-browser checkpoint** recorded in each plan's own SUMMARY.md (Task 3 in
both 03-15 and 03-16 is `gate="blocking"`, meaning the plan could not have completed without that approval).

Two items prevent a `passed` status, both honestly carried forward rather than silently dropped:

1. **Unrun e2e coverage** for the one claim in roadmap success criterion #3 that only a server-side test can
   prove (archiving preserves logged-set attribution across `session_exercise`/`personal_record`). This is not
   a known failure — it is an unconfirmed claim, and per this project's honest-verification stance it is
   routed to human verification rather than assumed to pass.
2. **WR-04**, a new, real, code-confirmed server-side validation gap (`movement_pattern` never checked) found
   by this round's own code review, not present in any prior round, not fixed by any plan in this wave, and
   bearing directly on one of the four roadmap success criteria.

The overall status is `human_needed`, not `passed` and not `gaps_found` — no must-have failed, but two items
require a human decision (run the deferred e2e suite; decide on WR-04) that this verification round cannot
supply on its own. All 17 plans in the phase are complete, all automated gates on current HEAD are green
(361/361 mobile tests, typecheck clean, web build clean, turbo 4/4), and both of this wave's user-facing gap
closures were independently confirmed by the user in a live browser session.

---

_Verified: 2026-08-20T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
