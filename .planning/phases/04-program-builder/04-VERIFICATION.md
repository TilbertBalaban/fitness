---
phase: 04-program-builder
verified: 2026-08-28T20:05:00Z
verified_against_commit: f3253f9
status: passed
score: 4/4 roadmap success criteria verified (11/11 requirements met)
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4 roadmap success criteria verified (9/11 requirements met, 2 partially met)
  gaps_closed:
    - "PROG-07 — routine_day.archived_at added to Postgres+SQLite schemas; duplicateDay, archiveDay, restoreDay and loadArchivedDays all have real, non-test call sites in apps/mobile/app/(tabs)/programs.tsx (Duplicate/Archive/Restore Day controls, an Archived days restore section); the day-lifecycle round trip is proven by an executed, registered Playwright spec (program-day-lifecycle.spec.ts) against a real @powersync/web database, not merely unit-tested."
    - "PROG-06 — the durationless-time-off trap is closed. setCycleDuration was replaced by a single validated updateCycle (commit 4f491a1) that writes name/kind/duration together, so 'Make Time off' can no longer produce a null-duration cycle. The Edit Cycle form's 'Days off' field is wired to it and both the positive (kind+duration written together) and negative (missing duration blocks the save, writes nothing) paths are proven by an executed browser spec."
    - "routine.status can now reach 'ready' — markRoutineReady has a real call site: a 'Mark Ready' action in the library's routine action sheet (library.tsx), hidden once already-ready or archived, independent of isActive per D-31. Closes WINDOWS #89 (now marked fixed)."
    - "PROG-09's plural wording ('upcoming workouts') is corrected to 'the next workout' in REQUIREMENTS.md's own checklist text, with a new '## Amendments' section naming D-32 as authority and explicitly recording that the prior justification's citation of D-27 (a placement decision) was authority drift. No code change was needed or made."
  gaps_remaining: []
  regressions: []
---

# Phase 4: Program Builder — Verification Report (Re-verification)

**Phase Goal:** The user can author the program they actually train, with the targets the progression engine will later read.
**Verified:** 2026-08-28T20:05:00Z against commit `f3253f9` (tip of the gap-closure sequence, plans 04-12 through 04-17)
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 04-12 through 04-17)

---

## Summary of This Re-Verification

All three gaps from the initial verification (`04-VERIFICATION.md`, 2026-08-22) are genuinely closed
at the code level, not just claimed in the closure plans' SUMMARYs. This report re-derived every
claim independently — greps were run fresh against the current worktree, not trusted from prose —
and additionally re-ran every suite the prior report ran, plus the durability e2e lane the prior
report could not run for this feature set.

**What was actually executed for this report** (not read, executed):

| Check | Command | Result |
|---|---|---|
| Typecheck + lint | `npx turbo run typecheck lint` | 11/11 tasks successful |
| Mobile unit suite | `pnpm jest` in `apps/mobile` | 91 suites / 1671 tests passed |
| API e2e against live Postgres | `pnpm test:e2e` in `apps/api` | 22 suites / 266 tests passed |
| Durability e2e (real `@powersync/web`, real Chromium) | `pnpm --filter mobile test:e2e:durability` | 48/48 passed, including the 3 new `program-day-lifecycle.spec.ts` cases (#17–19) |
| Working tree | `git status --porcelain` | Clean except pre-existing untracked `.claude/worktrees/` and `.claude/commands/gsd-start.md` — no stray probe files |

No suite disagreed with the SUMMARYs' claimed counts.

---

## Goal Achievement — ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | User can build a program from scratch with named days, ordered exercises, and per-exercise set/rep-range/RIR/rest targets | ✓ VERIFIED | Unchanged from initial verification — not touched by gap closure, no regression found (91/91 mobile suites still green). |
| 2 | User can organize the program into cycles with per-cycle targets, place a deload at the start or end of a cycle, and schedule time off | ✓ VERIFIED (gap closed) | `updateCycle` (`apps/mobile/lib/db/programs/cycles.ts:90`) is the Edit Cycle form's single write, validated by the same `validateCycle` the creation form uses — a time-off conversion with no duration is rejected before any write happens (`error 'duration-required'` → `"Time off needs a length in days."`). The "Days off" field renders in both the create form (`programs.tsx:809`) and the edit form (`programs.tsx:857`). `program-day-lifecycle.spec.ts`'s two cycle-conversion cases (positive: `kind='time_off'`+`duration_days=7` written together; negative: blank duration blocks the save and writes nothing) both executed and passed against a real database. |
| 3 | User can activate, freeze, duplicate, archive, and restore programs, and see the active program's upcoming workouts with its targets | ✓ VERIFIED (gap closed) | Program-level lifecycle unchanged (still verified). Day-level: `duplicateDay`/`archiveDay`/`restoreDay`/`loadArchivedDays` all confirmed with real, non-test call sites in `apps/mobile/app/(tabs)/programs.tsx` (grep re-run fresh, all four resolve there). `routine_day.archived_at` exists on both Postgres (`apps/api/src/db/schema/program.ts:23`) and SQLite (`apps/mobile/lib/db/schema.ts:83`) and flows through the sync apply path. `loadProgramTree` filters archived days at the SQL level (`isNull(routineDay.archivedAt)`, `load-program.ts:85`), inherited by the builder, `loadNextUp`, and `duplicateRoutine`. PROG-09's wording now reads "the next workout" (amended, matching what actually shipped — see below), removing the authority-drift finding from the initial report. All of this is proven end to end, not just unit-tested: `program-day-lifecycle.spec.ts` drives Duplicate/Archive/Restore through the real day page against a real `@powersync/web` database and passed (3/3 new cases, 48/48 full lane). |
| 4 | Editing a program never changes what any already-logged workout shows | ✓ VERIFIED (no regression) | Still proven twice (unit + live-Postgres e2e), and gap closure added a third, targeted layer: `log-set.test.ts` gained four PROG-11 cases specifically covering the new archive/restore surface — the five snapshot columns and `workout_session.routine_day_id` stay untouched when the day they were logged against is archived, restored, or round-tripped, and `routine_exercise`/`routine_exercise_cycle_target` children are not cascaded away by an archive (only a hard delete cascades). Day archiving therefore does not regress D-01's guarantee. |

**Score: 4/4 success criteria verified.**

---

## Requirements Coverage

| Req | Description | Status | Evidence |
|---|---|---|---|
| PROG-01 | Build a program from scratch with named training days | ✓ MET | Unchanged. |
| PROG-02 | Add, remove, reorder exercises within a training day | ✓ MET | Unchanged. |
| PROG-03 | Per-exercise targets: sets, rep range, RIR target, rest duration | ✓ MET | Unchanged. |
| PROG-04 | Organize a program into cycles, each with its own targets | ✓ MET | Unchanged. |
| PROG-05 | Place a deload at the start or end of a cycle | ✓ MET | Unchanged. |
| PROG-06 | Schedule planned time off within a program | ✓ MET (gap closed) | `updateCycle` makes a durationless `time_off` cycle unrepresentable from either the create or edit door; both branches proven by an executed browser spec. REQUIREMENTS.md's PROG-06 Traceability row was independently re-decided by 04-17 from this executed evidence rather than carried forward from the original diff. |
| PROG-07 | Duplicate, archive, and restore programs **and individual workouts** | ✓ MET (gap closed) | Program half unchanged. Day half: `routine_day.archived_at` schema + sync path (04-12), Duplicate/Archive/Restore Day controls plus an "Archived days" restore section (04-13), Mark Ready and archived-day rotation/history-safety regressions (04-14), and executed browser proof of the full round trip (04-16). All four previously-orphaned functions (`duplicateDay`, `archiveDay`, `restoreDay`, `loadArchivedDays`) now have real call sites, confirmed by fresh grep against the current worktree. |
| PROG-08 | Set which program is active | ✓ MET | Unchanged. |
| PROG-09 | View the active program's **next workout** with target muscles and per-cycle rep/RIR targets | ✓ MET (amended) | REQUIREMENTS.md's own checklist text now reads "the next workout" (was "upcoming workouts"), with a new `## Amendments` section (2026-08-28) naming D-32 as authority and explicitly recording that the prior justification's citation of D-27 was a misread of a placement decision as a scope cap. No code changed — the single `NextUpCard` was already the correct implementation; only the requirement's own wording and its cited authority were wrong. This closes the initial report's "authority drift" finding. |
| PROG-10 | Freeze a program so progression stops modifying it | ✓ MET | Unchanged. |
| PROG-11 | Edit a program without corrupting any workout already logged against it | ✓ MET | Unchanged, and now additionally covered for the new archive-a-day path (see SC4 above). |

No orphaned requirements. REQUIREMENTS.md's Traceability table lines 218–223 read `Complete` for all six PROG-06 through PROG-11 rows, and — unlike the state the initial report found — every one of those marks now traces to a named, executed artifact in a SUMMARY rather than to an implemented-but-unreachable function.

---

## Gap-by-Gap Closure Detail

### Gap 1 — PROG-07 "individual workouts" (was: failed/partial)

| Claim | Verification performed | Result |
|---|---|---|
| `duplicateDay` has a non-test call site | `grep -rn "duplicateDay" apps/mobile/app apps/mobile/components --include="*.tsx" --include="*.ts" \| grep -v __tests__` | `programs.tsx:422` — `duplicateDay({ routineDayId: dayId, name: duplicateDayName(name) }, database)` |
| `archiveDay`/`restoreDay`/`loadArchivedDays` have non-test call sites | same grep pattern, each name | All three resolve to `programs.tsx` (lines 36–42, 341, 442, 445) |
| `routine_day.archived_at` exists on both schemas | direct file read | Postgres: `program.ts:23`. SQLite: `schema.ts:83`. |
| Sync stream is deliberately unfiltered (D-33) | direct read of `ops/powersync/sync-rules.yaml` | Header comment lines 23–29 records the D-29/D-33 deviation verbatim; the `routine_day` SELECT (line 41) carries no `archived_at` predicate, matching the `routine` query's own precedent |
| `loadProgramTree` filters archived days at the SQL level | direct read of `load-program.ts` | Line 85: `.where(and(eq(routineDay.routineId, routineId), isNull(routineDay.archivedAt)))` |
| The round trip actually works, not just compiles | executed `pnpm --filter mobile test:e2e:durability` | `program-day-lifecycle.spec.ts` cases #17 passed — duplicate/archive/restore driven through the real day page against a real database |

**Verdict: genuinely closed.** This is not a re-statement of the SUMMARY's claims — every call site and every schema field was located independently by this verifier, and the closing evidence (the Playwright spec) was executed by this verifier, not read.

### Gap 2 — PROG-06 time-off conversion (was: failed/partial)

The prior report's evidence keyed on `setCycleDuration`, which no longer exists — it was subsumed by a
single `updateCycle` in commit `4f491a1`, predating this gap-closure batch but never behaviourally
proven until now.

| Claim | Verification performed | Result |
|---|---|---|
| The edit path cannot produce a null-duration `time_off` cycle | direct read of `cycles.ts:90-102` | `updateCycle` calls `validateCycle` before writing name/kind/duration in one `update` — the code comment at lines 81-89 explicitly documents this as the fix for the exact trap the initial report found |
| The Edit Cycle form actually renders a duration field | `grep -n "Days off" programs.tsx` | Line 857, inside the edit form (line 809 is the create form's copy) |
| The positive and negative paths both work end to end | executed `pnpm --filter mobile test:e2e:durability` | `program-day-lifecycle.spec.ts` cases #18/#19 passed — converting Week 1 to time off with `7` days writes `kind='time_off'`+`duration_days=7` together; leaving it blank keeps the form open with `"Time off needs a length in days."` and writes nothing |

**Verdict: genuinely closed.**

### Gap 3 — `routine.status` cannot reach 'ready' (was: failed)

| Claim | Verification performed | Result |
|---|---|---|
| `markRoutineReady` has a non-test call site | `grep -rn "markRoutineReady" apps/mobile/app apps/mobile/components \| grep -v __tests__` | `library.tsx:259` — `markRoutineReady(row.id)` inside the `MARK_READY` action-sheet case |
| The action is reachable but correctly hidden once irrelevant | direct read of `library.tsx:164` | `if (!archived && row.status !== 'ready') actions.push({ key: MARK_READY, label: 'Mark Ready' })` — independent of `isActive`, matching D-31 |
| `markRoutineReady` actually writes `status` | direct read of `lifecycle.ts:139-141` | `db.update(routine).set({ status: READY_STATUS }).where(eq(routine.id, routineId))` |
| WINDOWS #89 reflects the fix | direct read of `WINDOWS.md` line 103 | `status: fixed`, `resolved_at: 2026-08-28T15:30:59.775Z` |

**Verdict: genuinely closed.**

### PROG-09 authority-drift finding

| Claim | Verification performed | Result |
|---|---|---|
| REQUIREMENTS.md's own checklist text is corrected | direct read | Line 47: `PROG-09: User can view the active program's next workout with target muscles and per-cycle rep/RIR targets` |
| The amendment names the correct authority | direct read of the new `## Amendments` section | Row dated 2026-08-28, names D-32, and states explicitly that the prior justification's D-27 citation was a placement decision, not a scope cap |
| No code was silently changed to match a re-scoped requirement | `git log` / `git diff --quiet -- apps packages ops` (per 04-17's own verify clause, re-checked) | 04-17's diff touches only `.planning/REQUIREMENTS.md`, `04-UI-SPEC.md`, and `docs/program-vocabularies.md` — no `apps/`/`packages/`/`ops/` file in that commit |

**Verdict: genuinely closed** — this was a documentation-authority finding, not a code gap, and the documentation now matches both the code and its own citation trail.

---

## Regression Check

- **Full mobile unit suite:** 91 suites / 1671 tests, all green — no suite that passed before gap closure now fails, and 04-14's new archived-day cases in `next-up.test.ts`/`log-set.test.ts` pass alongside the untouched originals.
- **Full API e2e suite:** 22 suites / 266 tests, all green against live Postgres — up from 19/207 in the initial report because 04-12 added new archive/restore/tombstone/invalid-field cases to `program-sync.e2e-spec.ts`; nothing regressed.
- **Durability e2e lane:** 48/48, up from 45 pre-existing (per 04-15's own count) plus the 3 new `program-day-lifecycle.spec.ts` cases — the whole lane, not just the new file, was re-run and stayed green.
- **Typecheck + lint:** 11/11 tasks successful, unchanged.
- **The initial report's recommendation to land the transitive three-level cascade probe as a permanent test** was independently followed through: `program-sync.e2e-spec.ts` now contains `'deleting the day cascades two levels — the exercise AND its override are both gone and both tombstoned, three tombstones in all'` (line 1491), asserting `tombstoneCount(...) === 3` — this was not requested by name in this re-verification's scope but is confirmed present and passing, closing a documented risk from the initial report as a bonus.
- **No new debt markers.** `grep -nE "TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER|not yet implemented|coming soon"` across every file the six gap-closure plans touched: zero hits.
- **`moveDay`** remains orphaned (unchanged from the initial report) — still not required by any Success Criterion or PROG requirement, still correctly "noted, not gapped."

---

## Known Limitations Carried Forward (unaffected by this gap-closure batch)

These were true before gap closure, remain true today, and are not part of what this re-verification was asked to close:

- **Two-device offline activation race (WINDOWS #59)** — no second device/runtime available on this machine.
- **PowerSync Service pull-side delivery of `routine_cycle`/`routine_exercise_cycle_target` (WINDOWS #60, #67)** — the Service was not restarted against updated sync rules in this session; push-side and structural pull-query correctness are proven, the live pull round trip is not.
- **"Delete Draft" not shipped (WINDOWS #87)** — blocked on a server-side `HARD_DELETE_FORBIDDEN` carve-out, out of this phase's scope.
- **`duplicateRoutine` nulls `supersetGroupId`/`progressionSchemeId`/`notes` (WINDOWS #88)** — harmless today (all three are always null pre-Phase-7), flagged for whichever phase first makes one writable.
- **No native (iOS/Android) observation anywhere in this phase or its gap closure** — no Xcode, no Android SDK on this machine. Every UI surface, including the new day-lifecycle controls, is verified by unit tests + typecheck + an executed browser suite only. Correctly filed as WINDOWS #150/#151 and deferred to ROADMAP Phase 999.1.

---

## Human Verification Required

Per this repository's established convention (native → ROADMAP Phase 999.1, subjective/live-browser-judgment web items → ROADMAP Phase 999.2), the following are deferred rather than left as blockers. All are unchanged in substance from the initial verification; none are new, and none are gaps this re-verification was asked to close.

- test: "Open the Programs tab on a real iOS or Android build; add three exercises to a day and drag the middle one to the top using the grip; separately, exercise the new Duplicate/Archive/Restore Day controls and the Mark Ready action."
  expected: "The row follows the finger, drops into position, and the new order survives a screen re-entry. The four day-page header controls (Rename/Duplicate/Archive/Remove) render and work identically to their browser-proven behavior. Mark Ready flips a draft program's library subtitle to 'Ready'."
  why_human: "Native gesture behaviour (react-native-gesture-handler + reanimated) and native rendering of the new controls cannot be exercised here — no Xcode, no Android SDK on this machine (WINDOWS #150/#151, ROADMAP Phase 999.1). Deferred to ROADMAP Phase 999.1."

- test: "In a browser, swipe/drag between day pages in the DayDeck while a duplicated/archived day sits in the deck."
  expected: "Paging works without a visible tab bar across the new archived-days-filtered day count; the drag handle continues to reorder correctly with an odd number of live days after an archive."
  why_human: "Not directly exercised by `program-day-lifecycle.spec.ts` (which proves duplicate/archive/restore and cycle conversion, not DayDeck paging). Corroborating evidence exists: `DragHandle.web.tsx`'s pointer-capture contract is proven end to end by `reorder-exercises.spec.ts` (a sibling screen using the same shared component), which materially reduces but does not eliminate this as a live human check. Browser/E2E testing is explicitly authorized in this repository (`.claude/CLAUDE.md`), but a live paging-feel check under real touch/pointer interaction sits better as a Phase 999.2 review than an automated assertion. Deferred to ROADMAP Phase 999.2."

- test: "Restart the PowerSync Service against `ops/powersync/sync-rules.yaml`, then create a `routine_cycle`, a `routine_exercise_cycle_target`, and an archived `routine_day` on device A and confirm all three arrive correctly on device B (including the archived day, per D-33's deliberate unfiltered stream)."
  expected: "All three rows stream down; the archived day arrives on device B with `archived_at` intact rather than being silently dropped; deleting a cycle on A removes the override on B and it does not resurrect."
  why_human: "The Service was never restarted against the updated rules during this phase (WINDOWS #60, #67). Push-side and tombstone behaviour ARE observed (api e2e, 266/266 green). Deferred to ROADMAP Phase 999.1."

- test: "Two devices, both offline, each activate a different program; reconnect both."
  expected: "Exactly one active program after both pushes land."
  why_human: "WINDOWS #59 — no second device or runtime available. Deferred to ROADMAP Phase 999.1."

- test: "Visual review of the cycle strip's three chip tones, the day page's new Duplicate/Archive/Restore controls and the Archived days section, and the Edit Cycle form's new Days off field, at default and maximum OS font scale."
  expected: "The header row wraps rather than shrinks (R4, per 04-13's SUMMARY); archived rows recede at 0.6 opacity with a 48x48 Restore control readable at max font scale; the Days off field does not overflow the Edit Cycle form."
  why_human: "Visual/typographic behaviour at accessibility font scales is not observable from unit or e2e tests. Deferred to ROADMAP Phase 999.2."

---

## Gaps Summary

There are no remaining gaps. The three failed/partial truths from the initial verification —
PROG-07's day-level archive/restore/duplicate, PROG-06's time-off conversion trap, and
`routine.status`'s dead-end at `'draft'` — are all closed with real, non-test call sites this
verifier located independently, and the two most behaviourally sensitive claims (the day-lifecycle
round trip and the cycle-conversion validation) are proven by an executed Playwright spec against a
real `@powersync/web` database rather than resting on unit tests alone. The PROG-09 authority-drift
finding is closed as a documentation correction, with no code change required or made. Regression
checking found no new failures anywhere in the phase's four suites, no new debt markers, and one
bonus closure (the transitive cascade tombstone test) beyond what this re-verification was scoped to
check.

**Overall verdict: the phase goal is fully achieved. All four ROADMAP success criteria and all
eleven PROG requirements are met with evidence, not merely claimed. The remaining open items are
native-platform and cross-device observations this machine cannot produce, correctly filed as
WINDOWS entries and deferred to ROADMAP Phase 999.1/999.2 per this repository's established
convention — they do not block Phase 5.**

---

_Verified: 2026-08-28T20:05:00Z_
_Verifier: Claude (gsd-verifier)_
