---
phase: 7
slug: advanced-set-types
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-28
validated: 2026-08-28
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (unit/component, `apps/mobile`); Playwright (e2e, projects `durability` and `sync`); NestJS e2e specs (`apps/api/test/*.e2e-spec.ts`) for sync validation |
| **Config file** | `apps/mobile/jest.config.js`; `apps/mobile/playwright.config.ts` |
| **Quick run command** | `pnpm --filter mobile test -- <pattern>` (targeted Jest); `pnpm --filter api test -- <spec-name>` for a single API e2e spec |
| **Full suite command** | `pnpm -w test` |
| **Estimated runtime** | ~90 seconds full suite; targeted Jest ~5s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter mobile test -- <pattern>` for the file(s) touched
- **After every plan wave:** Run `pnpm -w test` plus `pnpm --filter mobile test:e2e:durability`
- **Before `/gsd-verify-work`:** Full suite green, plus at least one clean `durability` Playwright run exercising a grouped set (drop or per-side) end to end
- **Max feedback latency:** 90 seconds

Playwright is standing-authorized in this repo per `.claude/CLAUDE.md` § Conventions — no ask-first needed.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01.T1, 07-04.T3 | 07-01, 07-04 | 1, 2 | SETS-01 | — | N/A | unit + e2e | `pnpm --filter mobile test -- SetRow SetTypePickerSheet` | ✅ | ✅ green |
| 07-01.T1, 07-03.T2, 07-05.T3 | 07-01, 07-03, 07-05 | 1, 2, 3 | SETS-02 | T-7-01 | Child row cannot graft onto another user's set (a cross-user `parent_set_id` push applies only within the pushing user's own aggregate; the referenced user's own row count is byte-unchanged) | unit + e2e | `pnpm --filter mobile test -- set-row-builders` + `pnpm --filter api test:e2e -- poison-pill` + `pnpm --filter mobile test:e2e:durability -- advanced-sets` | ✅ | ✅ green |
| 07-05.T3 | 07-05 | 3 | SETS-03 | — | N/A | unit | `pnpm --filter mobile test -- set-row-builders` | ✅ | ✅ green |
| 07-04.T1 | 07-04 | 2 | SETS-04 | — | N/A | unit | `pnpm --filter mobile test -- SetTypePickerSheet` | ✅ | ✅ green |
| 07-05.T3 | 07-05 | 3 | SETS-05 | — | N/A | unit | `pnpm --filter mobile test -- set-row-builders` | ✅ | ✅ green |
| 07-02.T1, 07-03.T1 | 07-02, 07-03 | 2 | SETS-06 | — | N/A | unit | `pnpm --filter mobile test -- session-query summary-query history-query` | ✅ | ✅ green |
| 07-06.T1/T2, 07-07.T1 | 07-06, 07-07 | 3, 4 | SETS-07 | — | N/A | unit + e2e | `pnpm --filter mobile test -- superset workout` + `pnpm --filter mobile test:e2e:durability -- rest-timer advanced-sets` | ✅ | ✅ green |
| 07-06.T3, 07-07.T3 | 07-06, 07-07 | 3, 4 | SETS-08 | T-7-02 | `superset_group_id` cannot span sessions — a session-scoped read (`session_id` AND `superset_group_id`, the shape every real client query takes) never sees the other session's member, even though the server applies no FK/ownership check on the column | unit + e2e | `pnpm --filter mobile test -- SessionActionSheet` + `pnpm --filter api test:e2e -- poison-pill` + `pnpm --filter mobile test:e2e:durability -- advanced-sets` | ✅ | ✅ green |
| 07-06.T3, 07-08.T2/T3 | 07-06, 07-08 | 3, 5 | SETS-09 | — | N/A | unit + e2e | `pnpm --filter mobile test -- per-side workout SessionActionSheet` + `pnpm --filter mobile test:e2e:durability -- advanced-sets` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Task IDs are filled in by `/gsd-plan-phase` once PLAN.md files exist; rows above are seeded from the
research Test Map so no requirement can be silently dropped.

Filled in by 07-09 (Task 3) from the plans as executed, per this phase's own `human_verify_mode:
end-of-phase` convention — every row's automated command was re-run as part of 07-09 and observed
green (`pnpm -w test`: 92 suites / 1721 tests; `pnpm --filter mobile test:e2e:durability`: 51/51
specs, 48 pre-existing + 3 new from this plan; `pnpm --filter api test:e2e -- poison-pill`: 17/17
including this plan's own new T-7-01/T-7-02/five-set-type cases).

---

## Wave 0 Requirements

- [x] `apps/mobile/lib/session/__tests__/set-row-builders.test.ts` — new; covers the parent→children tree-flatten ordering, its composition with the warm-up bucket rule, and the out-of-order-child regression case (07-01)
- [x] `apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx` — new component, no existing coverage (07-01)
- [x] `apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx` — new component, no existing coverage (07-04)
- [x] Extend `apps/mobile/lib/session/__tests__/auto-advance.test.ts` — add `parentSetId`-bearing cases (D-19) (07-03)
- [x] Add/extend `ExerciseStrip` coverage for `countCompletedWorkingSets`'s new `parentSetId` filter (07-07 — the `supersetGroupId` link-glyph coverage this plan added; the D-10 parent-only counting rule itself is covered where it is enforced, `set-row-builders.test.ts` and `auto-advance.test.ts`)
- [x] Extend `packages/pr-rules/src/__tests__/personal-records.test.ts` for D-18's `countsTowardRecords` swap (07-02)
- [x] Extend `apps/api/test/poison-pill.e2e-spec.ts` for cross-user `parent_set_id` grafting and cross-session `superset_group_id` (07-09, Task 1 — the two new T-7-01/T-7-02 cases, plus the five-set-type acceptance case)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logging a plain working set is no slower than before this phase | SETS-01 | Perceived-latency judgement; no automated timing harness exists for the log-set path | Log 5 consecutive plain working sets on the web target and confirm no added tap or visible delay versus the Phase 5 flow |
| Grouped sets read as one logical set at a glance | SETS-02, SETS-03 | Visual grouping legibility is a judgement call | Log a drop set and confirm children render indented, badge-labelled, with a blank set-number column |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every task across 07-01..07-09 carries an `<automated>` verify command; the Per-Task Verification Map above confirms none relies on Wave 0 alone once 07-09's own additions are counted
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task in every plan this phase ran `pnpm --filter mobile test -- <pattern>` or an e2e/api command at task-commit time (see each plan's own SUMMARY.md)
- [x] Wave 0 covers all MISSING references — all seven Wave 0 files above exist and are populated
- [x] No watch-mode flags — every automated command in this file and every plan's `<verify>` block runs to completion and exits, never `--watch`
- [x] Feedback latency < 90s — targeted Jest runs ~5s; the full `pnpm -w test` run measured 44s (92 suites/1721 tests) in this plan's own execution; the durability e2e suite (51 specs) measured ~2.5 minutes, which is the phase's slowest single command but is explicitly the `test:e2e:durability` tier, not the per-task Jest tier this 90s budget governs
- [x] `nyquist_compliant: true` set in frontmatter — set above, backed by every box on this page genuinely ticking

**Approval:** Signed off 2026-08-28 by 07-09 (Task 3), the phase's evidence plan.

**Actual verification run, this plan (07-09):**
- `pnpm -w typecheck` — exits 0 (6 packages)
- `pnpm -w test` — 92 suites / 1721 tests, all pass
- `pnpm --filter api test:e2e -- poison-pill` — 17/17 pass, including this plan's own T-7-01, T-7-02 and five-set-type cases
- `pnpm --filter mobile test:e2e:durability` — three full runs: two showed a single pre-existing, order-dependent flake (`reorder-exercises.spec.ts`'s "reordering is idempotent", a file this plan never touches) that passed cleanly every time it was run in isolation; the third run was fully clean, **51/51 specs pass, exit 0** (48 pre-existing + this plan's 3 new `advanced-sets.spec.ts` cases). See 07-09-SUMMARY.md for all three runs' evidence.

**Deferred to the end-of-phase manual sweep (per `human_verify_mode: end-of-phase`, unchanged by this plan):**
- The two rows in Manual-Only Verifications above (plain-set latency, grouped-set visual legibility)
- The backstop truths each of 07-01/07-05/07-06/07-07/07-08's own SUMMARY.md records as `human_judgment: true` with no held-out UI-state test (documented in each plan's own coverage section, not duplicated here)
