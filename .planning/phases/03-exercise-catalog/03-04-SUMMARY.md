---
phase: 03-exercise-catalog
plan: 04
subsystem: database
tags: [seed-data, normalization, free-exercise-db, exercise-catalog, licensing]

requires:
  - phase: 03-exercise-catalog
    provides: "03-02's flat-six load_type vocabulary (LOAD_TYPES tuple), seeded_exercise localOnly table, docs/catalog-load-types.md per-family bodyweight-contribution defaults"
provides:
  - "apps/api/src/seed/catalog-taxonomy.ts — every free-exercise-db-to-canonical-taxonomy judgment call as reviewable committed data (muscle/equipment vocabulary, shoulder disambiguation, movement-pattern/load-type rule engines, per-family weight_factor and bodyweight_contribution_pct overrides)"
  - "apps/api/src/seed/normalize-catalog.ts — pure, deterministic normalizeCatalog(source) function mechanically applying catalog-taxonomy.ts's rules"
  - "apps/api/src/seed/data/catalog-normalized.json — 870-exercise CatalogSnapshot artifact, committed and re-derivable byte-identically"
  - "apps/api/src/seed/data/catalog-normalization-report.json — count-balanced exclusion/merge/provenance report"
  - "docs/catalog-dataset-license.md — text/JSON data confirmed Unlicense; corrects a stale image-copyright characterization with a direct, current re-verification"
affects: [03-05, any future plan reading catalog-normalized.json for the Postgres seed or the bundled mobile snapshot]

actuals:
  tokens: 16100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Taxonomy-as-data / script-as-mechanical-application split: catalog-taxonomy.ts holds every judgment call as reviewable ordered-rule arrays and lookup tables; normalize-catalog.ts contains zero embedded judgment calls, only the application logic"
    - "Near-duplicate merge gated on exact structured-field equality (equipment, primaryMuscles, secondaryMuscles, force, mechanic, level), not name-similarity alone -- name-only normalization would have wrongly merged genuinely distinct equipment variants (Barbell Squat vs Bodyweight Squat), exactly the granularity-loss PITFALLS.md Pitfall 5 warns against"
    - "Content-addressed catalog_version (SHA-256 of canonically key-sorted body, excluding generated_at) plus a fixed SOURCE_FETCHED_AT constant instead of Date.now() -- makes the artifact byte-reproducible on re-run, verified directly (identical hash across two runs)"

key-files:
  created:
    - apps/api/src/seed/catalog-taxonomy.ts
    - apps/api/src/seed/normalize-catalog.ts
    - apps/api/src/seed/data/free-exercise-db.source.json
    - apps/api/src/seed/data/catalog-normalized.json
    - apps/api/src/seed/data/catalog-normalization-report.json
    - apps/api/src/seed/__tests__/normalize-catalog.spec.ts
    - docs/catalog-dataset-license.md
  modified:
    - apps/api/package.json

key-decisions:
  - "Task 1's checkpoint:decision was answered by a live human BEFORE this executor was spawned, not auto-selected: fedb-with-images (free-exercise-db including its images, vendored into the app bundle). This continuation run implemented that decision as directed -- free-exercise-db is the sole source (wger not merged), image_urls is populated (not left empty)."
  - "Corrected a stale risk characterization mid-plan (Task 2). The Task 1 decision's own rationale described the image-copyright question as 'an open, unanswered upstream GitHub issue.' Direct re-verification via the GitHub API found this is inaccurate: free-exercise-db issues #2 and #12 are both CLOSED and answered -- the maintainer explicitly disclaims knowledge of image provenance ('usage would be at your own risk'), and the upstream wrkout/exercises.json project's own CONTRIBUTING.md states outright that images were scraped from the internet, no one owns their copyright, and using them commercially is advised against. This does not reverse the human's decision (per this plan's explicit instruction not to re-litigate it) but is recorded in full in docs/catalog-dataset-license.md and flagged as .planning/WINDOWS.md #35 (unmet-truth) so it is visible again before /gsd-ship, with materially better information than the decision was originally made against."
  - "image_urls in this plan's artifact are live raw.githubusercontent.com URLs, not yet-vendored bundled assets. This plan's declared file scope excludes apps/mobile/assets/**, so actually downloading and offline-bundling the images is out of scope here and is 03-05's responsibility ('the bundled mobile snapshot' per this plan's own objective) -- documented explicitly in docs/catalog-dataset-license.md so 03-05 does not mistake a populated image_urls array for the offline requirement already being satisfied."
  - "Near-duplicate merge requires exact equality across every structured source field, not just a normalized-name match. A first-pass name-only normalization (stripping leading equipment words) found 56 false 'duplicate' groups, nearly all of which were genuinely distinct exercises (Barbell Squat vs Bodyweight Squat vs Dumbbell Squat) that happen to share a word after aggressive normalization. The shipped algorithm strips only a trailing parenthetical qualifier and additionally requires equipment/primaryMuscles/secondaryMuscles/force/mechanic/level to be identical, correctly merging 3 genuine near-duplicates (e.g. 'Band Good Morning' / 'Band Good Morning (Pull Through)') while leaving every real equipment/technique variant intact."
  - "cue_text is left null for every seeded row -- free-exercise-db has no field distinct from its full instructions text, and synthesizing a generated short-form cue risked violating the plan's own content-safety prohibition against generated recommendation-rationale framing. instructions_text is the source's own instructions, joined verbatim, never generated commentary. This affects A-EXER-03's flagged assumption (detail-view cue-text sections) and should be read by whichever plan builds that screen."

patterns-established:
  - "Deterministic-normalization-artifact pattern (catalog-taxonomy.ts as data / normalize-catalog.ts as mechanical application) is the house pattern for any future dataset-import normalization this project does -- future imports should follow this split rather than embedding judgment calls inline in a script."

requirements-completed: [EXER-02, EXER-03, EXER-08, EXER-09]

coverage:
  - id: D1
    description: "Every normalized exercise carries a load_type from LOAD_TYPES, a movement_pattern from MOVEMENT_PATTERNS or null, and an equipment_required from EQUIPMENT_TYPES or null"
    requirement: EXER-08
    verification:
      - kind: unit
        ref: "apps/api/src/seed/__tests__/normalize-catalog.spec.ts — 'gives every normalized exercise a load_type in LOAD_TYPES and at least one primary mapping'"
        status: pass
      - kind: other
        ref: "node -e check against packages/api-contracts/dist LOAD_TYPES — all 870 exercises pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every exercise has at least one primary muscle mapping, and every muscle_group_id in the artifact is a MUSCLE_GROUPS member"
    requirement: EXER-08
    verification:
      - kind: unit
        ref: "apps/api/src/seed/__tests__/normalize-catalog.spec.ts — 'gives every normalized exercise ... at least one primary mapping' and 'gives every muscle_group_id across all mappings a MUSCLE_GROUPS member'"
        status: pass
    human_judgment: false
  - id: D3
    description: "weight_factor is real per-exercise-family data, not a binary 1.00/0.50 constant — 14 distinct values across the artifact's mappings, including the exact ARCHITECTURE.md stiff-leg-deadlift case (hamstrings primary 1.00, glutes secondary 0.50, lower_back secondary 0.30)"
    requirement: EXER-08
    verification:
      - kind: unit
        ref: "apps/api/src/seed/__tests__/normalize-catalog.spec.ts — 'has more than 2 distinct weight_factor values across all mappings'"
        status: pass
      - kind: other
        ref: "node -e check: Smith Machine Stiff-Legged Deadlift's mappings match ARCHITECTURE.md's canonical example exactly"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every source record and unmappable source value is accounted for: source_record_count (873) = normalized_count (870) + merged_duplicate_count (3) + excluded_count (0); every exclusion (none occurred against the current source) would carry a non-empty reason"
    verification:
      - kind: unit
        ref: "apps/api/src/seed/__tests__/normalize-catalog.spec.ts — 'satisfies the count-preservation invariant' and 'gives every excluded record a non-empty reason'"
        status: pass
      - kind: other
        ref: "node -e check against catalog-normalization-report.json"
        status: pass
    human_judgment: false
  - id: D5
    description: "Re-running the normalization script over the committed source produces a byte-identical artifact and an identical catalog_version"
    verification:
      - kind: unit
        ref: "apps/api/src/seed/__tests__/normalize-catalog.spec.ts — 'produces a deep-equal artifact and an identical catalog_version on a second run'"
        status: pass
      - kind: other
        ref: "pnpm --filter api seed:catalog:normalize run twice; git status --porcelain apps/api/src/seed/data/ empty both times; catalog_version identical (fb701c18b7999d47)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Near-duplicate exercise names are merged into one canonical row with alternates in aliases, and the merge is listed in the report"
    verification:
      - kind: unit
        ref: "apps/api/src/seed/__tests__/normalize-catalog.spec.ts — 'merges at least one near-duplicate pair, with the merged row's aliases containing the alternate name'"
        status: pass
    human_judgment: false
  - id: D7
    description: "The seed dataset's license is recorded in the repository before any row is generated, including a corrected, current finding on the image-copyright question"
    verification:
      - kind: other
        ref: "docs/catalog-dataset-license.md — names the dataset, quotes the license text, records the fetch date and source SHA-256, and documents the corrected image-licensing finding"
      - kind: manual_procedural
        ref: "Human re-review of the corrected image-copyright risk before /gsd-ship"
        status: unknown
    human_judgment: true
    rationale: "The text/data license (Unlicense) was verified with high confidence via direct fetch. The image-licensing finding is now well-substantiated (not open/unresolved, but an explicit upstream admission), but whether to proceed with vendoring these specific images into the app bundle at 03-05 given that stronger information is a business/legal risk call only a human can make -- filed as WINDOWS #35, not silently decided here."
  - id: D8
    description: "No normalized name, cue_text or instructions_text matches a body-shaming or medical-advice deny-list term"
    verification:
      - kind: unit
        ref: "apps/api/src/seed/__tests__/normalize-catalog.spec.ts — 'has no normalized name, cue_text or instructions_text matching a body-shaming or medical-advice term' (word-bounded deny-list, verified zero false positives against the generated corpus before finalizing)"
        status: pass
    human_judgment: false

duration: ~60min (continuation run; Task 1's human-answered checkpoint predates this session)
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 4: Exercise Catalog Normalization Summary

**870 free-exercise-db exercises mechanically normalized onto the canonical 19-group muscle taxonomy with honest per-exercise-family weight_factor and bodyweight_contribution_pct values, committed as a reviewable, deterministically re-runnable artifact plus a license record that corrects a stale image-copyright characterization.**

## Performance

- **Duration:** ~60 min (continuation run — Task 1's `checkpoint:decision` was answered by a live human before this session started)
- **Completed:** 2026-08-18T10:50:00Z (approx)
- **Tasks:** 2 (Task 1 was a prior-session human-answered checkpoint; Task 2 and Task 3 executed this session)
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments

- Task 1's `checkpoint:decision` was answered by a live human (`fedb-with-images`) in a prior executor session, not auto-selected — this continuation implemented that decision as directed: free-exercise-db is the sole source (wger not merged), `image_urls` populated (not left empty).
- Built `catalog-taxonomy.ts` — every normalization judgment call (17-value muscle vocabulary mapping, shoulder-region disambiguation, 12-value equipment mapping, 10-rule movement-pattern engine, 5-rule load-type engine, 9-family weight-factor overrides, 6-family bodyweight-contribution overrides) as reviewable committed data with a stated `why` for every rule.
- Built `normalize-catalog.ts` — a pure `normalizeCatalog(source)` function mechanically applying those rules: 873 source records → 870 normalized exercises (3 genuine near-duplicates merged, 0 excluded), 14 distinct `weight_factor` values, content-addressed `catalog_version`, byte-identical on re-run (verified directly, twice).
- Spot-checked the shipped output against `ARCHITECTURE.md`'s own canonical example — the Stiff-Legged Deadlift's mapping (hamstrings primary 1.00, glutes secondary 0.50, lower_back secondary 0.30) matches exactly, after fixing a regex bug the spot-check itself surfaced (see Deviations).
- **Corrected a stale, materially understated risk characterization mid-plan.** The Task 1 decision's rationale described the free-exercise-db image-copyright question as "an open, unanswered upstream GitHub issue." Direct verification via the GitHub API (issues #2 and #12, both closed/answered) and the upstream `wrkout/exercises.json` repo's own `CONTRIBUTING.md` found the actual, current state is: the images were scraped from the internet, no one in the maintenance chain owns their copyright, and the source itself advises against using them in commercial projects. This is recorded in full in `docs/catalog-dataset-license.md` and filed as `.planning/WINDOWS.md` #35 (`unmet-truth`) — the human's decision is implemented as given, not reversed, but the corrected information is made visible for a re-weighing before `/gsd-ship`.
- Wrote 21 tests across the taxonomy-validation and normalization-behavior describe blocks in `normalize-catalog.spec.ts`, including a word-bounded body-shaming/medical-advice deny-list scan verified to have zero false positives against the actual generated corpus before being finalized.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the seed dataset, its license, and whether images ship in v1** — `checkpoint:decision`, human-answered in a prior session (not this executor). No commit — a decision task; recorded in this SUMMARY per this session's continuation instructions.
2. **Task 2: The taxonomy mapping and the normalization rules, as committed data** — `1f41b5d` (feat)
3. **Task 3: Run the normalization and commit the artifact plus its exclusion report** — `de6dd96` (test)

**Plan metadata:** this SUMMARY.md commit (docs).

## Files Created/Modified

- `apps/api/src/seed/catalog-taxonomy.ts` — `SOURCE_MUSCLE_TO_CANONICAL`, `AMBIGUOUS_DELT`, `SHOULDER_DISAMBIGUATION_RULES`, `SOURCE_EQUIPMENT_TO_CANONICAL`, `MOVEMENT_PATTERN_RULES`, `LOAD_TYPE_RULES`, `WEIGHT_FACTOR_FAMILY_RULES`/`WEIGHT_FACTOR_OVERRIDES`, `BODYWEIGHT_CONTRIBUTION_FAMILY_RULES`/`BODYWEIGHT_CONTRIBUTION_DEFAULTS`, `normalizeNameForMergeComparison`, `VARIATION_MODIFIER_PREFIXES`
- `apps/api/src/seed/normalize-catalog.ts` — `normalizeCatalog`, `computeCatalogVersion`, `NormalizationResult`/`NormalizationReport`/`ExclusionRecord`/`MergeRecord`/`DerivedFieldRecord` types, a plain ts-node entrypoint
- `apps/api/src/seed/data/free-exercise-db.source.json` — the committed source dataset (873 exercises, SHA-256 recorded in `docs/catalog-dataset-license.md`)
- `apps/api/src/seed/data/catalog-normalized.json` — the 870-exercise `CatalogSnapshot` artifact
- `apps/api/src/seed/data/catalog-normalization-report.json` — counts, exclusions, merges, per-field provenance
- `apps/api/src/seed/__tests__/normalize-catalog.spec.ts` — 21 tests (11 taxonomy-validation, 10 normalization-behavior)
- `docs/catalog-dataset-license.md` — license record, including the corrected image-licensing finding
- `apps/api/package.json` — adds `seed:catalog:normalize` script

## Decisions Made

See `key-decisions` in frontmatter for full detail. Summary:
- Implemented the human's prior `fedb-with-images` decision as directed; did not re-litigate or narrow it.
- Corrected the stale "open, unanswered" image-licensing characterization with direct, current verification, documented fully rather than silently accepted or silently suppressed.
- Near-duplicate merge requires exact structured-field equality, not name-similarity alone, to avoid the granularity loss PITFALLS.md Pitfall 5 names.
- `cue_text` left null everywhere — no source field for it, and synthesizing one risked the plan's own content-safety prohibition.
- Image vendoring into the app bundle (offline availability) is explicitly out of this plan's scope and deferred to 03-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `stiff_leg_deadlift` weight-factor family regex missed the dataset's actual "Stiff-Legged" spelling**
- **Found during:** Task 3, spot-checking the shipped output against `ARCHITECTURE.md`'s own canonical stiff-leg-deadlift example
- **Issue:** `WEIGHT_FACTOR_FAMILY_RULES`'s original regex (`/stiff[- ]leg deadlift|.../i`) required the literal substring "stiff leg deadlift" or "stiff-leg deadlift", but the actual source dataset spells these exercises "Stiff-Legged Deadlift" (with an extra "-ged"). "Smith Machine Stiff-Legged Deadlift" fell through to the generic `deadlift` family (0.85/0.90/0.45) instead of the intended `stiff_leg_deadlift` family (1.00/0.50/0.30) — silently reproducing exactly the imprecision D-04 was written to prevent, for the one exercise the plan names as its own canonical worked example.
- **Fix:** Widened the regex to `/stiff.{0,12}leg.{0,20}deadlift|deadlift.{0,20}stiff.{0,12}leg|romanian deadlift|\brdl\b/i`, verified against all 7 stiff-leg/romanian-named exercises in the source (5 correctly matched, "Stiff Leg Barbell Good Morning" and "Wide Stance Stiff Legs" correctly excluded since neither is a deadlift).
- **Files modified:** `apps/api/src/seed/catalog-taxonomy.ts`
- **Verification:** Re-ran the normalization script; `Smith Machine Stiff-Legged Deadlift`'s mappings now read hamstrings primary 1.00 / glutes secondary 0.50 / lower_back secondary 0.30, matching `ARCHITECTURE.md`'s example exactly.
- **Committed in:** `de6dd96` (Task 3 commit)

**2. [Rule 1 - Bug] Task 2's own literal acceptance-criteria shell command doesn't run as written**
- **Found during:** Task 2 verification
- **Issue:** The plan's acceptance criterion `node -e "const t=require('ts-node').register()||require('./apps/api/src/seed/catalog-taxonomy'); ..."` has a logic bug: `require('ts-node').register()` always returns a truthy `Service` object, so the `||` never falls through to `require('./apps/api/src/seed/catalog-taxonomy')` — `t` is bound to the ts-node service, not the taxonomy module, and `t.WEIGHT_FACTOR_OVERRIDES` is `undefined`.
- **Fix:** Ran the corrected two-statement form (`require('ts-node').register(); const t = require('./src/seed/catalog-taxonomy'); ...`) instead, which passes (14 distinct `weight_factor` values). The equivalent, correctly-written check also exists as a Jest test (`WEIGHT_FACTOR_OVERRIDES` describe block) which passes.
- **Files modified:** none (verification-only finding, not a code change)
- **Verification:** Corrected command exits 0 with `distinct 14`; Jest test passes.
- **Committed in:** n/a (verification note only)

---

**Total deviations:** 2 auto-fixed (1 bug in shipped code, 1 bug in the plan's own literal verification command)
**Impact on plan:** The weight-factor regex fix directly affects data correctness for the plan's own canonical worked example and was essential; the acceptance-criteria command note is documentation-only and doesn't change any shipped artifact.

## Issues Encountered

- **Fresh worktree had no `@fitness/api-contracts` `dist/`.** Same issue 03-01/03-02 recorded — `pnpm --filter @fitness/api-contracts build` was run before typecheck/tests could resolve the workspace import. Not a plan defect.
- **The one required "near-duplicate merge" test case does not occur naturally under strict, honest matching.** A first-pass name-only normalization (stripping leading equipment words like "Barbell"/"Dumbbell") found 56 apparent duplicate groups, but nearly all were genuinely distinct exercises (different equipment, different `load_type`) that only collided because the normalization was too aggressive — exactly PITFALLS.md Pitfall 5's warning. The shipped algorithm requires exact equality across every structured source field in addition to a conservative (trailing-parenthetical-only) name normalization, correctly finding 3 true near-duplicates and correctly declining to merge everything else. Documented in `catalog-taxonomy.ts`'s own module comment so a future reader understands why the merge rate is low and why that's correct, not a missed opportunity.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `catalog-normalized.json` and `catalog-normalization-report.json` are ready for 03-05 to consume for both the Postgres seed and the bundled mobile snapshot.
- **03-05 must actually download and vendor the images `image_urls` currently points at (live `raw.githubusercontent.com` URLs) into the app bundle** to satisfy the `fedb-with-images` decision's offline-availability requirement — this plan deliberately stopped short of that (out of its declared file scope) and documented the boundary explicitly in `docs/catalog-dataset-license.md`.
- **`.planning/WINDOWS.md` #35 (unmet-truth, open) should be read and weighed again before `/gsd-ship`** — the image-copyright risk this project is accepting by shipping app-bundled images is now backed by an explicit upstream admission ("scraped off the internet," "do not own the copy right," "advise against using them in comercial projects"), not merely an open question. This is the single most consequential open item this plan produced.
- `docs/catalog-load-types.md`'s per-family bodyweight-contribution defaults were consumed directly (not re-derived) — matches the intended hand-off from 03-02.

## Self-Check: PASSED

All 7 created files confirmed present on disk. Both task commit hashes (`1f41b5d`, `de6dd96`) confirmed present in `git log --oneline --all`. Normalization output re-verified against all stated acceptance criteria (exercise count ≥700, weight_factor distinct >2, all load_type values in `LOAD_TYPES`, report invariant balances, byte-identical on re-run) via direct `node -e` checks, not merely inferred from test output.

---
*Phase: 03-exercise-catalog*
*Completed: 2026-08-18*
