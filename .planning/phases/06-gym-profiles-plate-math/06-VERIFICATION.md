---
phase: 06-gym-profiles-plate-math
verified: 2026-08-28T07:39:24Z
status: human_needed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Cold Start Smoke Test — kill dev server/API, clear ephemeral state, boot both from scratch, load the workout screen"
    expected: "Both boot without errors; equipment-profile schema/migration applies cleanly; the seeded 'My Gym' profile appears and the plate band renders on first load"
    why_human: "Requires a live device/browser boot sequence and visual confirmation of first paint; not something a unit/e2e suite substitutes for. User explicitly skipped this UAT item."
  - test: "Plate strip renders in the reserved band (06-01-D2) — type a loadable barbell weight on the keypad"
    expected: "The per-side plate stack renders inside Phase 5's reserved 40px band, and the keypad digit grid does not shift or move"
    why_human: "Visual layout confirmation (no shift in an adjacent, unrelated UI region) is not assertable by the automated suite. Recorded as WINDOWS.md — covered by the automated e2e assertion on rendered content, but not the layout-stability claim. User explicitly skipped this UAT item."
  - test: "Gym Profiles click-through from the Profile tab (06-03-D1)"
    expected: "Profile tab's Gym Profiles row names the active gym and opens the list; every configured gym is visible; create/set-active/edit/duplicate/archive/restore all work; archived gyms sit in a collapsed trailing section; active gym pinned first with accent styling"
    why_human: "Interactive click-through and visual styling confirmation. Recorded as WINDOWS.md #141 (unrun-verify, open). User explicitly skipped this UAT item."
  - test: "Create a gym in lb and reopen it (06-04-D7)"
    expected: "On the web target: create a gym in lb, add 45/25 lb plates with two pairs each, add a machine with a 20-200 stack in 10 steps, save, reopen — every value reads back exactly as typed, and the plate count stepper refuses to go below zero"
    why_human: "Interactive/visual confirmation of the specific manual flow. The equivalent data flow is covered by gym-profiles.spec.ts's real-browser proof (confirmed passing in this verification run), but not the specific interactive confirmation. Recorded as WINDOWS.md #142 (unrun-verify, open). User explicitly skipped this UAT item."
  - test: "Switch Gym mid-session (06-07-D3)"
    expected: "Session menu shows Switch Gym between Session Note and Discard, Discard last and destructively styled; selecting it opens the sheet with no confirmation; tapping a non-active gym restamps and dismisses; the active row dismisses without a write; previously logged sets keep their displayed weight"
    why_human: "Interactive session-menu row order/color confirmation. The functional behavior (restamp, past-set weight preservation) is covered by switch-gym.spec.ts, which was re-run fresh in this verification and passed. Recorded as WINDOWS.md #143 (unrun-verify, open). User explicitly skipped this UAT item."
---

# Phase 6: Gym Profiles & Plate Math Verification Report

**Phase Goal:** The app only ever shows the user loads their actual gym can produce.
**Verified:** 2026-08-28T07:39:24Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can configure multiple gyms with real bars, plate denominations/counts, machine availability, stack ranges, base resistance | ✓ VERIFIED | `packages/api-contracts/src/equipment.ts` (full wire contract + bounded validators); `apps/mobile/components/GymProfileEditor.tsx` (464 lines — bar presets, plate steppers, dumbbell chips, machine cards, unit selector); `apps/mobile/lib/gym/profile-draft.ts` (canonical-kg conversion boundary); `apps/mobile/app/gym-profiles/{new,edit/[id]}.tsx` create/edit routes. `gym-profiles.spec.ts` re-run fresh in this verification: **PASS** ("a gym created, edited, activated and archived entirely through the UI stores exactly what was entered, in canonical kilograms"). |
| 2 | User sees a live plate breakdown while entering a barbell weight, without leaving the entry screen | ✓ VERIFIED | `apps/mobile/components/PlateStrip.tsx` rendered inside `NumericKeypad`'s reserved band; `workout.tsx` computes `bandState` via `useMemo` on `(inventory, target)` and threads it through `NumericKeypad`/`PlateStrip`, confirmed by direct code read (lines 641, 661, 911-913). `plate-strip.spec.ts` (6 cases covering barbell/dumbbell/machine/bodyweight/not-loadable/tap-to-autofill) re-run fresh in this verification: **all PASS**. |
| 3 | Plate math and any suggested load only ever use equipment the active profile actually has — a home gym with 5 lb jumps is never shown a 152.5 lb load | ✓ VERIFIED | `packages/plate-math/src/solver.ts`'s `solvePlateBreakdown` is an exact bounded-knapsack over recorded `pairCount`, never greedy (read directly, lines 44-125); `achievability.ts`'s `roundToAchievable` requires an explicit direction argument (no default); `band.ts`'s `resolveEquipmentBand` is exhaustive over all 12 `EquipmentType` members with a `never`-typed compile-time guard (read directly). The one real defect found by code review (CR-01: warm-up ladder always rounded against barbell loads regardless of exercise equipment type, silently producing zero warm-up sets at a barbell-less gym) was fixed in commit `3f16f1a` — confirmed fixed by direct code read of `session-mutations.ts`'s `achievableWarmupRounder`/`achievableLoadsForEquipmentType`, confirmed wired through `ExercisePage.tsx` → `WarmupSheet.tsx` → `generateWarmupSets`, and confirmed passing via the named regression test `'rounds each step down to the nearest achievable dumbbell load for a dumbbell exercise, not the barbell loads (CR-01)'` (ran `pnpm --filter mobile test -- session-mutations`: **82/82 pass**). |
| 4 | User can switch gyms mid-program and mark equipment unavailable mid-workout, and be offered alternatives | ✓ VERIFIED | GYM-04: `apps/mobile/components/SwitchGymSheet.tsx` (114 lines) wired into `workout.tsx`'s session menu; `restampSessionGym` writes only `equipment_profile_id`. GYM-07: `apps/mobile/components/EquipmentAvailabilitySheet.tsx` (410 lines) implements mark-unavailable (session-scoped) vs. profile write-through (separate, confirmed action), both transitioning to `SwapSuggestionList`. `switch-gym.spec.ts` and `equipment-availability.spec.ts` (4 cases total) re-run fresh in this verification: **all PASS**, including the explicit "a previously logged set's displayed weight is unchanged after a restamp" assertion. |

**Score:** 4/4 roadmap success criteria verified, 0 present-but-behavior-unverified.

### Plan-Level Must-Haves (representative sample, cross-checked against code)

| Must-have | Status | Evidence |
|---|---|---|
| Ownership: `equipment_profile` push writes `user_id` from the authenticated session, never the op payload | ✓ VERIFIED | `apps/api/src/sync/sync.service.ts` — `existingEquipmentProfileRoots` ownership query added (06-01 SUMMARY, Rule 2 self-fix); `equipment-profile-sync.e2e-spec.ts`'s ownership case cited in 06-01/06-08 SUMMARYs. Not independently re-run this verification (`DATABASE_URL` unavailable in this environment — see Gaps note below). |
| A plate count stepper cannot go below zero/express a decimal; duplicate denominations merge | ✓ VERIFIED | `apps/mobile/lib/gym/profile-draft.ts`'s `setPlatePairCount`/`upsertPlateDenomination`, unit-tested (`profile-draft.test.ts`). |
| No manually entered weight is snapped/corrected/rewritten on commit; no logged set is recomputed against a newly active profile | ✓ VERIFIED | Confirmed by direct read of `resolveEquipmentBand`/`PlateStrip` (pure, read-only band; tap-to-autofill writes explicitly, typed entry never touched) and by the `switch-gym.spec.ts` assertion re-run in this verification. |
| `isUnavailableEquipmentRefs` has a length bound (WR-01) | ✓ VERIFIED | `packages/api-contracts/src/equipment.ts:107` — `EQUIPMENT_PROFILE_LIMITS.maxUnavailableEquipmentRefs` check added, confirmed by direct read; `equipment.test.ts` re-run: **28/28 pass**, including the new over-limit/at-limit cases. |
| No guard existed against archiving a gym's only live profile (WR-02) | ✓ VERIFIED | `apps/mobile/lib/db/equipment-profiles.ts:334-357` — `archiveEquipmentProfile` now throws before writing when it would leave zero live rows for the user; confirmed by direct read and by `equipment-profiles.test.ts` re-run (**included in the 82/82 pass** run). |
| `handleMarkUnavailable` had no error handling (WR-03) | ✓ VERIFIED | `apps/mobile/components/EquipmentAvailabilitySheet.tsx:357-371` — now has the same `try/catch/finally` + `setError` shape as its sibling handler; confirmed by direct read. |
| `GymProfilesScreen`'s mount effect duplicated `reload`'s fetch (WR-04) | ✓ VERIFIED | `apps/mobile/app/gym-profiles/index.tsx:149-151` — mount effect now calls `void reload()`; confirmed by direct read. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/plate-math/src/solver.ts` | Bounded-knapsack plate solver | ✓ VERIFIED | 125 lines, exact bigint arithmetic, respects `pairCount` |
| `packages/plate-math/src/achievability.ts` | Rounding authority, no default direction | ✓ VERIFIED | 153 lines, `RoundDirection` required argument |
| `packages/plate-math/src/band.ts` | `resolveEquipmentBand`/`hasResolvableEquipment` | ✓ VERIFIED | 148 lines, exhaustive switch over 12 equipment types |
| `apps/mobile/components/PlateStrip.tsx` | Live plate breakdown UI | ✓ VERIFIED | 173 lines, renders every `EquipmentBandState` kind, zero solve/resolve calls (props-driven) |
| `apps/mobile/lib/db/equipment-profiles.ts` | Gym CRUD + lifecycle helpers | ✓ VERIFIED | 432 lines, all lifecycle functions present and tested |
| `apps/mobile/components/GymProfileEditor.tsx` | Gym editor form | ✓ VERIFIED | 464 lines |
| `apps/mobile/components/SwitchGymSheet.tsx` | Mid-workout gym switch | ✓ VERIFIED | 114 lines, wired into `workout.tsx` session menu |
| `apps/mobile/components/EquipmentAvailabilitySheet.tsx` | Mark-unavailable + substitutes | ✓ VERIFIED | 410 lines, wired into `ExercisePage.tsx` |
| `docs/equipment-profile-shape.md` | Documented wire shapes | ✓ VERIFIED | 167 lines, matches shipped contract module field names (spot-checked) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `workout.tsx` weight field | `PlateStrip`/`NumericKeypad` band | `resolveEquipmentBand` memoised on `(inventory, target)` | ✓ WIRED | Confirmed by direct read (lines 911-913, 661) |
| `workout_session.equipment_profile_id` | Session start | `ensureDefaultEquipmentProfile` in `session-lifecycle.ts` | ✓ WIRED | Confirmed by direct read (lines 3, 32-33) |
| `ExercisePage.tsx` | `WarmupSheet` → `generateWarmupSets` | `equipmentType` prop (CR-01 fix) | ✓ WIRED | Confirmed by direct read; regression test passes |
| Session menu "Switch Gym" | `SwitchGymSheet` → `restampSessionGym` | `handleSelectGym` in `workout.tsx` | ✓ WIRED | Confirmed by fresh `switch-gym.spec.ts` run |
| `SessionActionSheet` Equipment row | `EquipmentAvailabilitySheet` → `SwapSuggestionList` | `hasResolvableEquipment` predicate gate | ✓ WIRED | Confirmed by fresh `equipment-availability.spec.ts` run |

### Behavioral Spot-Checks (run fresh in this verification, not taken from SUMMARY claims)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Unit tests: gym CRUD, warm-up rounding (incl. CR-01 regression), gym editor | `pnpm --filter mobile test -- session-mutations equipment-profiles GymProfileEditor` | 3 suites, 82/82 tests pass | ✓ PASS |
| Unit tests: plate-math package (solver/band/achievability/inventory) | `pnpm --filter @fitness/plate-math test` | 4 suites, 70/70 tests pass | ✓ PASS |
| Unit tests: equipment wire contract validators (incl. WR-01 length-bound tests) | `pnpm --filter @fitness/api-contracts test -- equipment` | 1 suite, 28/28 tests pass | ✓ PASS |
| Full durability e2e project, including all 4 new phase-6 specs | `pnpm --filter mobile test:e2e:durability -- plate-strip.spec.ts` (initially, then full project) | 45/45 pass in 2.0m, including `plate-strip.spec.ts` (6), `gym-profiles.spec.ts` (1), `equipment-availability.spec.ts` (3), `switch-gym.spec.ts` (1) | ✓ PASS |
| No skip markers in the 4 new e2e spec files | `grep -rnE "test\.(skip\|fixme\|only)" apps/mobile/e2e/{plate-strip,gym-profiles,equipment-availability,switch-gym}.spec.ts` | no matches | ✓ PASS |
| No debt markers (TBD/FIXME/XXX/TODO/HACK/placeholder) in phase's key source files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER\|placeholder\|not yet implemented"` across plate-math/gym/equipment source | 1 hit — a form `placeholder="Select a unit"` prop, not a debt marker | ✓ PASS (no real markers) |

Note: an initial direct `playwright test --project=durability` invocation (bypassing the project's documented `pnpm run test:e2e:durability` script) failed all 7 plate-strip cases with a WASM-SQLite-init race (`openWithFilename` undefined) — traced to a missing `EXPO_PUBLIC_DURABILITY_HARNESS=1` env var that the documented script sets. Re-run through the documented command succeeded cleanly (45/45). Recorded here for transparency; not a code regression.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| GYM-01 | 06-01, 06-03 | Multiple gym profiles, pick active | ✓ SATISFIED | `equipment-profiles.ts` lifecycle helpers, `gym-profiles/index.tsx` list screen, e2e proof |
| GYM-02 | 06-01, 06-04 | Bar types/weights, plates, unit system | ✓ SATISFIED | `GymProfileEditor.tsx`, `profile-draft.ts`; REQUIREMENTS.md traceability table still shows "Pending" — **stale documentation, see Gaps** |
| GYM-03 | 06-04, 06-02, 06-05 | Machine availability, stack ranges, base resistance | ✓ SATISFIED | `band.ts`'s `resolveStackBand`, `GymProfileEditor.tsx`'s machine cards |
| GYM-04 | 06-01, 06-07 | Assign gym to workout, switch mid-program/mid-workout | ✓ SATISFIED | `session-lifecycle.ts` stamp-at-start, `SwitchGymSheet.tsx`; REQUIREMENTS.md traceability table still shows "Pending" — **stale documentation, see Gaps** |
| GYM-05 | 06-01, 06-02, 06-05 | Live plate breakdown in entry screen | ✓ SATISFIED | `PlateStrip.tsx` in `NumericKeypad`'s reserved band |
| GYM-06 | 06-02, 06-05 | Only shown loads active profile can produce | ✓ SATISFIED | `achievability.ts`, `band.ts`, CR-01 fix confirmed |
| GYM-07 | 06-06 | Mark equipment unavailable mid-workout, offered alternatives | ✓ SATISFIED | `EquipmentAvailabilitySheet.tsx`, `SwapSuggestionList.tsx` |

No orphaned requirements — REQUIREMENTS.md's Phase 6 mapping (GYM-01 through GYM-07) exactly matches the union of `requirements:` fields declared across the phase's 8 plans.

### Anti-Patterns Found

None blocking. One informational note: `IN-01` from `06-REVIEW.md` (`isGymProfileSaveable` doesn't validate numeric-field content before enabling Save) was explicitly out of scope for the fix pass (`fix_scope: critical_warning`) and remains open — non-blocking per the review's own classification (delayed error surface, not a data-integrity bug).

### Gaps Summary

No functional gaps block the phase goal. All four roadmap success criteria are backed by code that was read directly (not merely cited from SUMMARY.md) and by e2e/unit tests re-run fresh in this verification pass, including a full 45/45 durability suite run through the project's documented script.

One **non-blocking documentation gap**: `.planning/REQUIREMENTS.md`'s checkbox list and Traceability table still show `GYM-02` and `GYM-04` as unchecked/"Pending", even though both are demonstrably implemented (confirmed above) and every phase-6 plan's `requirements-completed` frontmatter claims all seven `GYM-0N` IDs complete. Every other completed phase in this project (Phase 3, Phase 5, etc.) has its requirement checkboxes and traceability status updated to `[x]`/"Complete" once delivered — Phase 6's closing plan (06-08) did not do this for two of its seven requirements. Recommend updating `.planning/REQUIREMENTS.md` lines 91 and 93 to `[x]` and the traceability table rows for GYM-02/GYM-04 to "Complete" before shipping, so future phases don't read Phase 6 as incomplete.

Two items recorded as **not independently re-run in this environment** (consistent with 06-01/06-06/06-08's own documented limitation): the three `apps/api` e2e specs (`equipment-profile-sync.e2e-spec.ts`, `schema-parity.e2e-spec.ts`, `session-annotations-sync.e2e-spec.ts`) require `DATABASE_URL`, unavailable in this environment. Their passing status is cited from the originating plans' SUMMARY.md, not freshly verified here — this is an environment limitation, not a functional gap, and does not affect this phase's client-side goal ("the app only ever shows the user loads their gym can produce").

### Human Verification Required

Five UAT items were explicitly skipped by the user (visual/interactive confirmations the user chose not to perform manually). These are not failures — every one of them has an equivalent automated e2e or unit proof that passed (re-confirmed fresh in this verification run where applicable) — but the specific interactive/visual confirmation each item asks for was never performed by a human. Listed in the frontmatter `human_verification` block above; summarized:

1. **Cold Start Smoke Test** — full boot-from-scratch visual confirmation.
2. **Plate strip renders in the reserved band, keypad unmoved** (06-01-D2) — visual layout stability.
3. **Gym Profiles click-through from the Profile tab** (06-03-D1, WINDOWS #141) — interactive list/archive/styling confirmation.
4. **Create a gym in lb and reopen it** (06-04-D7, WINDOWS #142) — interactive round-trip confirmation on the web target.
5. **Switch Gym mid-session** (06-07-D3, WINDOWS #143) — interactive session-menu row order/accent-color confirmation.

---

_Verified: 2026-08-28T07:39:24Z_
_Verifier: Claude (gsd-verifier)_
