---
phase: 10-server-analytics-reconciliation
verified: 2026-08-29T18:30:00Z
status: passed
score: 5/5 truths verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "5/5 truths functionally verified; 1 gap blocked the phase's own full-API-e2e-green gate"
  gaps_closed:
    - "10-VALIDATION.md's own gate — 'Before /gsd-verify-work: Full API e2e green' — was not met (CR-01 regression test failed at its own broken setup assertion)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Muscle Map on a real iOS/Android build (both react-native-svg figures, window switch, drill-down sheet)"
    addressed_in: "Phase 999.1"
    evidence: "ROADMAP.md Phase 999.1 accumulated-items list already carries 'Phase 10 test 1 (WINDOWS #165)'. Correctly routed, not left skipped."
  - truth: "Subjective visual review of the intensity scale / untrained-vs-lowest-intensity distinction at max OS font scale"
    addressed_in: "Phase 999.2"
    evidence: "ROADMAP.md Phase 999.2 accumulated-items list already carries 'Phase 10 test 2 (WINDOWS #166)'. Correctly routed."
  - truth: "Subjective visual review of the Training Volume disambiguation caption and stale-rollup caption at max OS font scale"
    addressed_in: "Phase 999.2"
    evidence: "ROADMAP.md Phase 999.2 accumulated-items list already carries 'Phase 10 test 3 (WINDOWS #167)'. Correctly routed."
warnings:
  - id: W1
    severity: info
    summary: "One durability spec (equipment-availability.spec.ts:246, owned by Phase 6/06-06, zero files in Phase 10's scope) failed on a full 84-spec serial run in the prior pass but passed 3/3 in isolated re-run — a pre-existing timing flake unrelated to this phase, not a regression this phase introduced. Not re-run this pass since nothing in scope changed it."
  - id: W2
    severity: info
    summary: "WR-02 (reconciliation.service.ts's unconditional session-exercise rescue read on every workout_session-touching push) remains deliberately unfixed per the code review's own documented reasoning; unchanged in the current file and still bounded by session size, not corpus size."
---

# Phase 10: Server Analytics & Reconciliation — Verification Report

**Phase Goal:** Long-horizon history stays fast and correct across devices, and editing the past fixes everything derived from it.
**Verified:** 2026-08-29T18:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure

**Note on `mode: mvp`.** ROADMAP marks this phase `mode: mvp`, but its goal is not in the
`As a …, I want to …, so that ….` User Story form the MVP-mode verifier requires (consistent with
Phase 9's own verification note), so the User Flow Coverage table does not apply. Verification ran
goal-backward against the five ROADMAP Success Criteria.

---

## Re-verification scope

This is a scoped re-verification of the single gap recorded in the previous pass (verified
2026-08-29T17:54:51Z). Per the dispatching agent's instruction, this pass did not re-run the full
evidence sweep already completed and recorded below (personal-record-sync 9/9, seeded-corpus-perf
13/13, reconciliation/personal-record-replay 21/21, analytics-engine 124/124, mobile muscle-* 86/86,
Playwright durability 83/84 with the one pre-existing Phase-6 flake, and the WINDOWS #165/#166/#167
routing to ROADMAP 999.1/999.2) — those findings are carried forward unchanged from the prior pass
and are still trustworthy: nothing in this re-verification touched those files or code paths.

### What was re-checked this pass

1. **Read the changed line** in `apps/api/test/analytics-rollup.e2e-spec.ts` (commit `fdaacd4`).
   Confirmed the diff is exactly the one line recommended in the prior gap: `status: 'in_progress'`
   → `status: 'completed'` on line 333's `workoutSessionOp` call, nothing else touched. Read the
   surrounding test body (lines 323–361) to confirm the fix did not weaken what the test proves:
   - Line 341 still asserts `rowsBefore.length > 0` (now satisfiable, since a completed session
     produces rollup rows per `muscle-volume.ts:40`'s `eq(workoutSession.status, 'completed')`
     filter) — the non-vacuity guard is intact, not removed.
   - Lines 348–350's PATCH still names only `ended_at` and `status`, never `local_date` or
     `started_at` — this is the actual CR-01 condition (`session-lifecycle.ts`'s real
     `completeSession` payload shape), unchanged by the fix.
   - Lines 353–360 still assert the watermark stays at `trueLocalDate` (`2026-01-10`) rather than
     advancing to `today`, and that no rollup rows appear under today's date — the real regression
     assertion, unchanged.
   - **Conclusion: the test still genuinely exercises CR-01.** The fix only made its setup
     precondition satisfiable; it did not narrow, skip, or vacuously pass the assertion under test.

2. **Independently re-ran `pnpm --filter api test:e2e`** against the same native Homebrew
   `postgresql@18` on 127.0.0.1:5432 used in the prior pass (confirmed still running, schema intact
   via `psql \dt` — `muscle_volume_rollup`, `analytics_watermark` present). Ran `npx nest build`
   first (silent success, exit 0), then the full suite via the project's own `test:e2e` script:

   ```
   Test Suites: 23 passed, 23 total
   Tests:       283 passed, 283 total
   Time:        63.798 s
   ```

   This matches the dispatching agent's claimed 23/23 / 283/283 exactly, and this is an
   independently-executed run by this verifier, not a re-quote of the SUMMARY. Additionally ran the
   `analytics-rollup` spec in isolation to confirm all 5 tests (including the CR-01 case) pass on
   their own:

   ```
   PASS test/analytics-rollup.e2e-spec.ts
     ✓ a completed workout pushed through the shipped ingress produces weighted, secondary-inclusive
       rollup rows and a watermark, unchanged on replay (178 ms)
     ✓ moving a session to a different local_date vacates the old date's rollup cells entirely, and
       the watermark never moves backwards (92 ms)
     ✓ finishing a session with a PATCH that names neither local_date nor started_at
       (session-lifecycle.ts's real payload shape) reconciles against the session's true stored
       local_date, not the server's current UTC date (89 ms)
     ✓ deleting a session's last logged_set removes that date's rollup cells, and deleting the whole
       session does too (188 ms)
     ✓ re-pushing an unchanged batch twice more is a no-op — same rows, same totals, nothing
       duplicated (100 ms)
   Test Suites: 1 passed, 1 total
   Tests:       5 passed, 5 total
   ```

3. **Confirmed WINDOWS #169/#170** are both marked `fixed` in `WINDOWS.md` (row `170` carries a
   `fixed` status and a `2026-08-29T17:59:13.997Z` closed timestamp, referencing exactly this
   evidence), committed in `7d4824d`.

4. **Re-confirmed requirements traceability.** `REQUIREMENTS.md` still marks ANLY-04, ANLY-05, and
   ANLY-09 `[x]` Complete and maps all three to "Phase 10 — Server Analytics & Reconciliation" with
   status "Complete" in its traceability table (lines 117–122, 279–281) — no orphaned IDs, unchanged
   from the prior pass.

**Result: the gap is genuinely closed, not papered over.** The regression test proves what it always
claimed to prove; only its previously-broken setup was fixed.

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | User can see set volume per muscle group over 1 week/1 month/3 months, and drill into contributing exercises | ✓ VERIFIED | `muscle-map.spec.ts` durability cases 1, 4, 5, 6 (both figures render + announce, untrained distinct, drill-down opens/lists/dismisses); `muscle-volume-query.test.ts`, `MuscleHeatmap.test.tsx`, `MuscleVolumeRow.test.tsx`, `MuscleDrilldownSheet.test.tsx` all pass (carried forward, unchanged) |
| 2 | Long-horizon charts stay fast because rollups are materialized server-side and synced down, not recomputed on every render | ✓ VERIFIED | `muscle_volume_rollup`/`analytics_watermark` written inside `applyBatch`'s transaction, synced via two `auth.user_id()`-scoped pull queries in `sync-rules.yaml`; `seeded-corpus-perf.e2e-spec.ts` re-confirmed green in this pass's full 283/283 run |
| 3 | Editing a past workout recomputes the PRs and volume figures that depended on it, leaving no stale derived data | ✓ VERIFIED | `analytics-rollup.e2e-spec.ts` 5/5 pass, **including the CR-01 regression test, independently re-run and confirmed by this verifier to genuinely exercise the no-local-date/no-started_at PATCH scenario** (see re-verification scope above). `personal-record-sync.e2e-spec.ts`'s correction/idempotency cases (9/9, carried forward) also pass |
| 4 | A PR set on one device is authoritative across all of them after sync | ✓ VERIFIED | `personal-record-sync.e2e-spec.ts` 9/9 pass (carried forward; re-confirmed green in this pass's full suite run) |
| 5 | History endpoints hold their query count as data grows, enforced by assertions against a realistically-sized dataset | ✓ VERIFIED | `seeded-corpus-perf.e2e-spec.ts` 13/13 pass (carried forward; re-confirmed green in this pass's full suite run) |

**Score:** 5/5 Success Criteria verified. The previous gap — criterion 3's regression test failing
its own broken setup assertion — is closed. `10-VALIDATION.md`'s "Before `/gsd-verify-work`: Full API
e2e green" gate is now genuinely met: 23/23 suites, 283/283 tests, independently re-executed by this
verifier.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| ANLY-04 | 10-01, 10-03, 10-04, 10-05, 10-07 | Set volume per muscle group, front/back heatmap, 1wk/1mo/3mo window | ✓ SATISFIED | See criteria 1, 2, 5 above |
| ANLY-05 | 10-03, 10-06, 10-07 | Drill into which exercises contributed a muscle's sets | ✓ SATISFIED | See criterion 1 above; drill-down reuses the existing `/exercise-performance` route |
| ANLY-09 | 10-01, 10-02, 10-04 | PRs and volume recomputed correctly on editing a past workout | ✓ SATISFIED | See criteria 3, 4, 5 above — no longer qualified by the CR-01 test gap |

REQUIREMENTS.md marks all three `[x]` Complete and maps them to "Phase 10" — no orphaned requirement
IDs found for this phase (re-confirmed this pass).

### Required Artifacts (carried forward from prior pass, updated where the gap touched them)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/api/test/analytics-rollup.e2e-spec.ts` | Executed proof of rollup writes against live Postgres | ✓ VERIFIED | 5/5 pass, independently re-run this pass. The CR-01 test's only change from the prior (failing) version is the one-line setup fix confirmed above — the assertion under test is unchanged |
| All other artifacts | — | ✓ VERIFIED | Unchanged since prior pass; not re-inspected this pass per the scoped re-verification instruction (see Re-verification scope) |

### Gaps Summary

No gaps remain. The single gap from the prior pass — the CR-01 regression test in
`analytics-rollup.e2e-spec.ts` failing at its own broken setup precondition, before ever reaching the
CR-01 assertion — is closed by commit `fdaacd4` (the one-line `status: 'in_progress'` →
`'completed'` fix) and confirmed by an independently re-executed `pnpm --filter api test:e2e`
(23/23 suites, 283/283 tests) in this verification pass. WINDOWS #169 and #170 are correctly marked
`fixed` (commit `7d4824d`).

### Human Verification — Relocated, Not Outstanding

These three items are **not** phase-10 gates. Each has been relocated to ROADMAP Phase 999.1 or
999.2 with a WINDOWS entry, per this project's standing convention for manual checks that this
machine cannot perform. They are recorded here for traceability only; the phase does not wait on
them, and none is marked `skipped`.

The convention exists because a deferred item left as a pending `*-UAT.md` test can never advance:
the UAT predicate requires all-pass, so a test that is permanently unrunnable on this hardware would
block the phase transition forever. Relocation to the final-sweep phases is what keeps the item
alive and the phase honest at the same time. They are listed below exactly as previously routed:

1. **Muscle Map on a real iOS/Android build**

   **Test:** Run the app on a real iOS and Android device/simulator and view the Muscle Map screen —
   both front/back `react-native-svg` figures, the 1wk/1mo/3mo window switch, and the drill-down
   sheet.
   **Expected:** Both figures render correctly, window switching updates the heatmap, and the
   drill-down sheet opens/lists/dismisses correctly on native, matching the durability-tested web
   behavior.
   **Why human:** No Xcode or Android SDK is installed on this machine; native rendering cannot be
   verified programmatically. Routed to ROADMAP Phase 999.1 as "Phase 10 test 1" (WINDOWS #165).

2. **Intensity scale legibility at max OS font scale**

   **Test:** With the OS accessibility text-size setting at maximum, view the Muscle Map heatmap and
   assess whether the untrained-vs-lowest-intensity color distinction remains visually clear,
   including for a colourblind reader.
   **Expected:** The untrained state remains visually distinguishable from the lowest non-zero
   intensity band at max font scale and under common colour-vision deficiencies.
   **Why human:** Subjective visual/accessibility judgment; not verifiable by grep or automated
   assertion. Routed to ROADMAP Phase 999.2 as "Phase 10 test 2" (WINDOWS #166).

3. **Training Volume disambiguation and stale-rollup captions at max OS font scale**

   **Test:** With the OS accessibility text-size setting at maximum, view the Training Volume screen
   and the Muscle Map's stale-rollup caption (if the watermark lags behind unsynced local data).
   **Expected:** Both captions remain legible and their meaning stays clear at max font scale, without
   truncation or layout breakage.
   **Why human:** Subjective visual/legibility judgment. Routed to ROADMAP Phase 999.2 as "Phase 10
   test 3" (WINDOWS #167).

WINDOWS #164 (offline-edit-of-an-already-synced-session residual) and #168 (durability's
non-coverage of that same residual) remain open, planner-flagged, non-blocking deviations —
unchanged from the prior pass, and out of scope for this phase's success criteria.

---

_Verified: 2026-08-29T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
