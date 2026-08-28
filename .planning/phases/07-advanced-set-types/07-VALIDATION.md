---
phase: 7
slug: advanced-set-types
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-28
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
| *pending* | — | — | SETS-01 | — | N/A | unit | `pnpm --filter mobile test -- SetRow` | ✅ | ⬜ pending |
| *pending* | — | — | SETS-02 | T-7-01 | Child row cannot graft onto another user's set | unit + e2e | `pnpm --filter mobile test -- set-row-builders` | ❌ W0 | ⬜ pending |
| *pending* | — | — | SETS-03 | — | N/A | unit + e2e | `pnpm --filter mobile test -- set-row-builders` | ❌ W0 | ⬜ pending |
| *pending* | — | — | SETS-04 | — | N/A | unit | `pnpm --filter mobile test -- SetTypePickerSheet` | ❌ W0 | ⬜ pending |
| *pending* | — | — | SETS-05 | — | N/A | unit | `pnpm --filter mobile test -- set-row-builders` | ❌ W0 | ⬜ pending |
| *pending* | — | — | SETS-06 | — | N/A | unit | `pnpm --filter mobile test -- session-query` | ✅ extend | ⬜ pending |
| *pending* | — | — | SETS-07 | — | N/A | unit + e2e | `pnpm --filter mobile test -- rest-timer` | ❌ W0 | ⬜ pending |
| *pending* | — | — | SETS-08 | — | N/A | unit | `pnpm --filter mobile test -- SessionActionSheet` | ✅ extend | ⬜ pending |
| *pending* | — | — | SETS-09 | T-7-02 | `superset_group_id` cannot span sessions | unit + e2e | `pnpm --filter mobile test -- set-row-builders` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Task IDs are filled in by `/gsd-plan-phase` once PLAN.md files exist; rows above are seeded from the
research Test Map so no requirement can be silently dropped.

---

## Wave 0 Requirements

- [ ] `apps/mobile/lib/session/__tests__/set-row-builders.test.ts` — new; covers the parent→children tree-flatten ordering, its composition with the warm-up bucket rule, and the out-of-order-child regression case
- [ ] `apps/mobile/components/__tests__/SetTypePickerSheet.test.tsx` — new component, no existing coverage
- [ ] `apps/mobile/components/__tests__/ChangeSetTypeDialog.test.tsx` — new component, no existing coverage
- [ ] Extend `apps/mobile/lib/session/__tests__/auto-advance.test.ts` — add `parentSetId`-bearing cases (D-19)
- [ ] Add/extend `ExerciseStrip` coverage for `countCompletedWorkingSets`'s new `parentSetId` filter (confirm whether a `__tests__` file exists before assuming)
- [ ] Extend `packages/pr-rules/src/__tests__/personal-records.test.ts` for D-18's `countsTowardRecords` swap
- [ ] Extend `apps/api/test/poison-pill.e2e-spec.ts` for cross-user `parent_set_id` grafting and cross-session `superset_group_id`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logging a plain working set is no slower than before this phase | SETS-01 | Perceived-latency judgement; no automated timing harness exists for the log-set path | Log 5 consecutive plain working sets on the web target and confirm no added tap or visible delay versus the Phase 5 flow |
| Grouped sets read as one logical set at a glance | SETS-02, SETS-03 | Visual grouping legibility is a judgement call | Log a drop set and confirm children render indented, badge-labelled, with a blank set-number column |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
