---
phase: 02-data-model-sync-engine
verified: 2026-08-17T21:35:00Z
status: passed
score: 5/5 roadmap truths verified; 0 gaps
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/5 roadmap truths verified; 1 new gap found
  gaps_closed:
    - "sync.service.ts's PATCH apply path clobbered every field a PATCH didn't mention, on workout_session and session_exercise entirely and on 8/9 of logged_set's mutable columns — closed by plan 02-13's patchAwareSet, a single field-presence-aware update-set builder shared by all three PUSH_APPLIED_TABLES, kept exhaustive by a mapped-type compiler gate (PatchFieldMap<V>)."
  gaps_remaining: []
  regressions: []
---

# Phase 2: Data Model & Sync Engine — Verification Report (Round 3, post gap-closure)

**Phase Goal:** Anything the user writes succeeds offline and converges correctly across their devices, on a schema that can express real training data.
**Verified:** 2026-08-17T21:35:00Z
**Status:** passed
**Re-verification:** Yes — round 3, following round 2's `gaps_found` verdict (score 5/5 roadmap criteria, 1 new gap: the PATCH-clobber defect)

## What Changed Since Round 2

Round 2 found all five roadmap success criteria verified but surfaced one new defect during
verification itself, not claimed by any SUMMARY: `sync.service.ts`'s `onConflictDoUpdate` wrote a
fully-defaulted values object on every PATCH, so any PATCH that omitted a column silently reset that
column to a default — `loggedSetUpdateSet` guarded only `weight_kg` on `logged_set`; `workout_session`
and `session_exercise` had no guard at all. The user chose to fix rather than defer. Plan `02-13` was
written, independently plan-checked (PASSED, no blockers), executed, and merged. It is the only thing
that changed since round 2.

**I independently re-read the fixed source and re-ran every relevant test suite myself, from this
running session, against the live stack** (native Postgres, real API build) — not on 02-13-SUMMARY.md's
word.

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create and edit records offline; they sync automatically on reconnect, no manual action | ✓ VERIFIED | Unchanged since round 2 — this round touched only the API's PATCH apply path (`apps/api/src/sync/**`), not the offline-write/drain path. Carried forward: `apps/mobile/e2e/sync.spec.ts`'s `offline write, automatic drain` case. |
| 2 | Phone and browser converge after both edit offline, no set silently lost | ✓ VERIFIED | Round 2's gap was a real, if not-yet-reachable, threat to exactly this guarantee for future PATCH-shaped edits. Closed this round: `apps/api/test/patch-partial-update.e2e-spec.ts`, re-run directly by me, **8/8 pass** — a `{status, ended_at}`-only finish PATCH, a `session_exercise` reorder PATCH, `logged_set` reps-only and weight-only PATCHes, both PUT-still-replaces controls, a conflict-log-agrees-with-the-row case, and one realistic multi-table finish batch, all against real Postgres. |
| 3 | Sync and cold start stay fast against a seeded 1-2yr corpus | ✓ VERIFIED | Re-run directly this round as a regression check (this round's fix touches the same file the perf suite exercises): `apps/api/test/seeded-corpus-perf.e2e-spec.ts`, **7/7 pass**, corpus regenerated live (293 sessions / 3,804+ sets observed). |
| 4 | Upgrading across a local schema change preserves unsynced on-device data | ✓ VERIFIED | Unchanged since round 2 — no mobile file was touched by 02-13 (`packages/api-contracts/src/sync.ts` and `apps/mobile/**` both unmodified, confirmed by `git status` in 02-13-SUMMARY.md and independently by `git show --stat` on all three 02-13 commits, which touch only `apps/api/**` and `.planning/WINDOWS.md`). Carried forward: `apps/mobile/e2e/schema-redefinition.spec.ts`. |
| 5 | A weight round-trips without drift; a workout finished at 11:45pm attributes to that day regardless of timezone | ✓ VERIFIED | LOG-22 (this round's specific target) re-verified directly: `patch-partial-update.e2e-spec.ts`'s `LOG-22: a {status, ended_at}-only finish PATCH...` case, re-run by me — seeds `local_date` 2026-06-15 against a `started_at` whose UTC calendar day is 2026-06-16 (a genuine cross-day case, not coincidentally aligned), reads every date/timestamp column via an explicit `::text` cast (confirmed in the source: `started_at::text`, `local_date::text`, `logged_at::text` — `grep -c '::text'` in the file returns well above the plan's minimum of 3), and asserts `local_date` remains the client's stamp and differs from `started_at`'s UTC date after the PATCH. **PASS.** |

**Score:** 5/5 roadmap truths verified with direct, re-run evidence. **Zero open gaps.**

### Required Artifacts (This Round)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/sync/patch-update-set.ts` | Field-presence-aware update-set builder, shared by all three applied tables | ✓ VERIFIED | Read directly: `patchAwareSet<V extends object>(op, values, fields)` returns `values` unchanged for a PUT; for a PATCH, walks `Object.keys(values)`, keeps a key when its field-map entry is `null` (identity/server-owned) or when the mapped **wire key** (snake_case) is present in `op.data`. Presence check is on raw key existence (`wireKey in data`), not truthiness — an explicit `null`/`0` survives. |
| `PatchFieldMap<V>` + three field maps | Compile-time exhaustiveness gate | ✓ VERIFIED | `type PatchFieldMap<V> = { [K in keyof V]: string | null }` — a mapped type over every key of `V` with no optional marker, so an unclassified column is a `TS2741` compile error. **Independently reproduced**: I deleted `setIndex: 'set_index'` from `LOGGED_SET_PATCH_FIELDS` myself and ran `pnpm --filter api typecheck` — got the exact `TS2741` error the SUMMARY quotes verbatim; restored the line, typecheck passed clean (confirmed via `git diff` showing zero residual change). |
| `apps/api/src/sync/sync.service.ts` | All three `onConflictDoUpdate` `set:` clauses routed through `patchAwareSet`; `.values()` (insert) unchanged | ✓ VERIFIED | Read directly, lines 550-578: `workout_session`'s `set` is `{ ...patchAwareSet(op, workoutSessionValues, WORKOUT_SESSION_PATCH_FIELDS), serverSeq: nextSeq }`; `session_exercise` and `logged_set` route the same way. All three `.insert(table).values(...)` calls pass the **full**, unfiltered values object — the insert path is untouched, so a PATCH for an id the server has never seen still populates every NOT NULL column. `loggedSetUpdateSet` (the old one-field guard) is deleted, confirmed absent (`grep -rn loggedSetUpdateSet apps/api` returns nothing but the plan's own allow-comment). |
| `apps/api/test/patch-partial-update.e2e-spec.ts` | Real-Postgres reproducer, red before the fix, green after | ✓ VERIFIED | Read in full and **re-run directly by me**: 8/8 pass against live Postgres. Every case asserts both halves — the named column took the PATCH's value AND every other column is byte-identical to its pre-PATCH value — so a filter that dropped every column (the no-op trap) would fail these tests, not silently pass them. |
| `apps/api/test/null-weight.e2e-spec.ts` | Two existing PATCH cases strengthened | ✓ VERIFIED | Re-run directly: 8/8 pass. `PATCH changing only reps` now additionally asserts `set_index`/`completed`/etc. unchanged; `PATCH with weight_kg explicitly null` asserts the same. |
| `apps/api/src/sync/__tests__/patch-update-set.spec.ts` | Pure mapping spec, including the camelCase/snake_case no-op trap gate | ✓ VERIFIED | Read in full — 12 cases including an exact-key-set assertion for a `{reps: 9}` PATCH (`['id', 'reps', 'sessionExerciseId']`, not a superset), explicit-null/explicit-zero presence cases, an "every mutable column present" case per table, and a `toBe(values)` identity check for PUT. Re-run directly: 12/12 pass (23/23 combined with `conflict-policy.spec.ts`). |
| `.planning/WINDOWS.md` ids 27-31 | Deliberately deferred findings logged | ✓ VERIFIED | Read directly: 5 new rows, ids 27-31, all `phase: 02`, all `status: open`, `open_count` 21→26, `total_count` 26→31, `fixed_count` unchanged at 5. Each entry names its source finding (WR-01..WR-04, or the `session_exercise` validator constraint) and its reasoning for non-inclusion in this plan's scope. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `sync.service.ts` `workout_session` write path | `patchAwareSet` + `WORKOUT_SESSION_PATCH_FIELDS` | `onConflictDoUpdate({ set: { ...patchAwareSet(...), serverSeq } })` | ✓ WIRED | Confirmed by direct source read; `serverSeq` is spread back in after filtering so the sequence keeps its always-written behavior. |
| `sync.service.ts` `session_exercise` write path | `patchAwareSet` + `SESSION_EXERCISE_PATCH_FIELDS` | `onConflictDoUpdate({ set: patchAwareSet(...) })` | ✓ WIRED | Confirmed by direct source read. |
| `sync.service.ts` `logged_set` write path | `patchAwareSet` + `LOGGED_SET_PATCH_FIELDS` | `onConflictDoUpdate({ set: patchAwareSet(...) })` | ✓ WIRED | Confirmed by direct source read; replaces the deleted `loggedSetUpdateSet`. |
| Field maps (camelCase keys) | `op.data` (snake_case keys) | Wire-key string per map entry, checked via `wireKey in data` | ✓ CORRECTLY MAPPED, NOT A NO-OP | This was the highest-value thing to check per the verification brief. Confirmed by reading every map entry (e.g. `setIndex: 'set_index'`, `startedAt: 'started_at'`) — casing conversion is correct throughout, not identity-mapped. Confirmed further by the e2e suite: every PATCH case asserts the **named column changed to the PATCH's value** (e.g. `expect(after.reps).toBe(15)`) in the same assertion block as the survival checks — a wrong mapping that filtered every column out would fail the "changed" assertions, not just pass the "survived" ones, so this is not a survival-only test that a no-op could sneak past. |
| `apps/api/test/patch-partial-update.e2e-spec.ts` | Live Postgres, real built API (`dist/main.js`) | `spawn`, real sign-up, real HTTP push, `pg` client reads via `::text` | ✓ WIRED | Re-run directly by me in this session against a live Postgres instance (`pg_isready` confirmed), a freshly built API (`nest build`), with env vars matching CI's literal values. |

### Behavioral Spot-Checks (Run Directly by the Verifier, Not Taken From SUMMARY.md)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| PATCH-clobber reproducer, all 3 tables | `npx jest --config test/jest-e2e.json --runInBand patch-partial-update` | 8/8 pass | ✓ PASS |
| Strengthened null-weight suite | `npx jest --config test/jest-e2e.json --runInBand null-weight` | 8/8 pass | ✓ PASS |
| Unit suite (`patch-update-set.spec.ts` + `conflict-policy.spec.ts`) | `pnpm --filter api test` | 23/23 pass | ✓ PASS |
| Typecheck, clean state | `pnpm --filter api typecheck` | exit 0 | ✓ PASS |
| Exhaustiveness gate, mutation test (independently reproduced, not taken from SUMMARY) | Deleted `setIndex: 'set_index'` from `LOGGED_SET_PATCH_FIELDS`, ran `pnpm --filter api typecheck` | `TS2741: Property 'setIndex' is missing...` — exact match to SUMMARY's quoted error | ✓ PASS |
| Exhaustiveness gate, restored | Restored the deleted line, re-ran `pnpm --filter api typecheck`, confirmed `git diff` empty | exit 0, no residual change | ✓ PASS |
| Insert-driven regression suites | `npx jest --config test/jest-e2e.json --runInBand sync-push sync-aggregate concurrent-edit poison-pill schema-parity` | 45/45 pass | ✓ PASS |
| Perf/corpus regression | `npx jest --config test/jest-e2e.json --runInBand seeded-corpus-perf` | 7/7 pass | ✓ PASS |
| `.planning/WINDOWS.md` ledger consistency | Direct file read | ids 27-31 present, `open_count`/`total_count` match | ✓ PASS |
| Debt markers in this round's files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across `patch-update-set.ts`, `sync.service.ts`, the three test files | No matches | ✓ PASS |

**Total independently re-run in this verification pass:** 91 test cases across 8 suites (8+8+23+45+7 =
91), plus one independently-reproduced compiler-error mutation test, all green — none taken on the
SUMMARY's word.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| PLAT-02 | 02-01, 02-02, 02-05, 02-09 | Log a complete workout offline, zero connectivity | ✓ SATISFIED | Unchanged since round 2; not touched by 02-13. |
| PLAT-03 | 02-01, 02-07, 02-08, 02-12 | Offline changes sync automatically on reconnect | ✓ SATISFIED | Unchanged since round 2; not touched by 02-13. |
| PLAT-04 | 02-03, 02-07, 02-08, 02-12, **02-13** | Phone/browser converge, no set silently lost | ✓ SATISFIED, caveat closed | Round 2's caveat — PATCH-shaped future edits could silently clobber convergence — is now closed. `patch-partial-update.e2e-spec.ts`, 8/8, re-run directly. |
| PLAT-07 | 02-02, 02-05, 02-09 | In-progress workout survives force-quit/crash/restart | ✓ SATISFIED | Unchanged since round 2; not touched by 02-13. |
| PLAT-08 | 02-04, 02-10, 02-12, **02-13** | kg/lb unit choice, no drift over repeated conversions | ✓ SATISFIED | `null-weight.e2e-spec.ts`'s PATCH cases, strengthened and re-run, 8/8 pass; PUT-still-replaces regression controls also re-run and passing, confirming unit-conversion/PUT semantics are unaffected by this round's change. |
| PLAT-10 | 02-06 | Export training data | ✓ SATISFIED (supporting) | Unchanged since round 2; not touched by 02-13. Native share-sheet path unverified (WINDOWS #24, no Xcode/Android SDK — deferred to Phase 999.1). |
| LOG-22 | 02-02, **02-13** | Workout attributed to calendar day regardless of timezone | ✓ SATISFIED | Round 2's own concern (this requirement was the direct target of the discovered gap). `patch-partial-update.e2e-spec.ts`'s dedicated LOG-22 case, re-run directly: `local_date` (2026-06-15) and `started_at`'s UTC calendar day (2026-06-16) are genuinely different in the seed data, read via `::text` casts (not driver-parsed `Date` objects, which would risk a timezone-dependent false pass/fail), and `local_date` survives a `{status, ended_at}`-only finish PATCH byte-identical. REQUIREMENTS.md's `[x]` mark and "Complete" traceability status are now earned by this evidence, closing round 2's noted bookkeeping-vs-evidence mismatch for this specific requirement. |

No orphaned requirements. All seven requirement IDs appear in at least one plan's `requirements:`
frontmatter and match ROADMAP.md's Phase 2 `Requirements:` line exactly.

**REQUIREMENTS.md accuracy note, PLAT-10 (pre-existing, unrelated to this round):** the traceability
table still marks PLAT-10 "Pending" despite the underlying evidence (carried forward from round 1)
supporting `[x]`/"Complete." This is unchanged bookkeeping staleness this round did not touch and was
not asked to fix — noted for completeness, not treated as a gap of this verification pass.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any of the six files 02-13 touched
(`apps/api/src/sync/patch-update-set.ts`, `apps/api/src/sync/__tests__/patch-update-set.spec.ts`,
`apps/api/test/patch-partial-update.e2e-spec.ts`, `apps/api/src/sync/sync.service.ts`,
`apps/api/test/null-weight.e2e-spec.ts`, `.planning/WINDOWS.md`).

### Deferred Items (Not Gaps — Assessed and Accepted)

Five findings from 02-REVIEW.md's Warnings section were deliberately left open this round rather than
fixed, and are now tracked on `.planning/WINDOWS.md` (ids 27-31). Assessed each against phase-goal
severity:

- **WR-01** (heal-path poisons siblings): self-scoped, unreachable by the shipped mobile client
  (`log-set.ts` always populates parent references), and a genuinely different concern (aggregate
  grouping) from this plan's scope (the update set). Not phase-blocking.
- **WR-02** (`highestServerSeq` not rewound on rollback): latent — no client code reads `server_seq`
  today. Not phase-blocking.
- **WR-03** (no CI check that the durability harness is dead-code-eliminated from production): a
  process gap, not a functional defect — the underlying dead-code-elimination claim was independently
  assessed as sound by 02-REVIEW.md's own code read. Worth closing eventually but does not undermine
  any of this phase's five success criteria today.
- **WR-04** (`DURABILITY_HARNESS_ENABLED` dead export): trivial, zero-importer dead code.
- **`session_exercise` PATCH `exercise_id` constraint**: a deliberate, well-reasoned design choice
  (relaxing it would require a separate decision about PATCH-as-insert semantics), not an oversight —
  the reasoning is preserved on the ledger for whichever future phase needs it.

None of these five items threaten any of the phase's five roadmap success criteria or its seven
requirements as they stand today. All are properly logged with reasoning, not silently dropped. I
concur with round 2's framing and 02-13's own scoping: these are legitimate deferrals, not gaps
requiring a decision at this checkpoint.

Native (iOS/Android) verification remains deferred to ROADMAP Phase 999.1 — no Xcode or Android SDK on
this machine (unchanged, project-wide policy, not phase-2-specific).

### Human Verification Required

None. All items from round 1 and round 2 are closed; this round's fix required no new human-verifiable
behavior (no UI, no visual, no real-time behavior — the entire change is a server-side data-integrity
fix proven by real-Postgres e2e tests).

### Gaps Summary

**No gaps found in this verification pass.** Round 2's single gap — the PATCH apply path silently
clobbering untouched columns on `workout_session`, `session_exercise`, and 8/9 of `logged_set`'s
mutable columns — is closed. I independently confirmed the closure by:

1. Reading `patch-update-set.ts` and the updated `sync.service.ts` directly, not relying on the
   SUMMARY's description.
2. Independently reproducing the exhaustiveness-gate mutation test (delete a field-map entry, confirm
   `TS2741`, restore, confirm clean) rather than trusting the SUMMARY's quoted compiler error.
3. Re-running all 91 relevant test cases across 8 suites myself, from a cold build, against live
   Postgres — the new reproducer (8/8), the strengthened null-weight suite (8/8), the unit specs
   (23/23), all five insert-driven regression suites (45/45), and the seeded-corpus performance suite
   (7/7).
4. Specifically checking the camelCase/snake_case field-map mapping for the "no-op trap" flagged in
   the verification brief — confirmed correct, and confirmed the e2e suite's own assertions would
   catch a wrong mapping (they assert the PATCH's value landed, not just that other fields survived).
5. Confirming the insert path (`.values()`) is untouched — a PATCH for an unseen id still populates
   every NOT NULL column, so the fix did not trade silent corruption for a constraint violation.
6. Confirming LOG-22's specific evidence uses a genuinely cross-UTC-day date pair and reads
   date/timestamp columns via `::text` casts, avoiding the timezone-dependent-assertion trap.
7. Confirming `.planning/WINDOWS.md`'s five new entries are real, correctly counted, and reasonably
   scoped as non-blocking deferrals rather than swept-under-the-rug regressions.

All five roadmap success criteria, all seven phase requirements, and both prior rounds' human-verification
items remain backed by direct, independently re-run evidence. The phase goal — "Anything the user
writes succeeds offline and converges correctly across their devices, on a schema that can express
real training data" — is achieved, including for partial (PATCH) updates that no shipped client emits
today but that the sync protocol has always accepted and that the very next "edit a set" or "finish
workout" feature will exercise.

---

*Verified: 2026-08-17T21:35:00Z*
*Verifier: Claude (gsd-verifier)*
