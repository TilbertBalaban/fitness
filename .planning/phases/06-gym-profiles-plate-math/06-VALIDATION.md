---
phase: 6
slug: gym-profiles-plate-math
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-26
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `06-RESEARCH.md` § Validation Architecture. Per-task rows are filled by the planner/validate-phase once PLAN.md files exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 — `apps/mobile`, shared packages (`packages/pr-rules`, new `packages/plate-math`); Playwright for `apps/mobile` e2e |
| **Config file** | Per-package, inherited from each `package.json` `"test": "jest"` script (mirror `packages/pr-rules/package.json`) |
| **Quick run command** | `pnpm --filter @fitness/plate-math test` (or the package touched by the task) |
| **Full suite command** | `pnpm -w test` |
| **Estimated runtime** | ~60 seconds (unit); durability e2e adds ~2-3 min |

---

## Sampling Rate

- **After every task commit:** Run the touched package's `pnpm --filter <pkg> test`
- **After every plan wave:** Run `pnpm -w test`
- **Before `/gsd-verify-work`:** Full suite green **plus** `pnpm --filter mobile test:e2e:durability` (repo-authorized Playwright run, as Phase 5 closed out)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | GYM-01 | — | N/A | unit + e2e | `pnpm --filter mobile test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GYM-02 | — | N/A | unit | `pnpm --filter @fitness/plate-math test -- solver` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GYM-03 | T-06-V5 | Reject malformed/oversized `machine_availability` JSONB before write | unit | `pnpm --filter @fitness/plate-math test -- machine` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GYM-04 | T-06-V4 | Scope every `equipment_profile` push write through the session `userId` | unit + e2e | `pnpm --filter mobile test -- log-set` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GYM-05 | — | N/A | unit | `pnpm --filter @fitness/plate-math test -- solver` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GYM-06 | — | N/A | unit | `pnpm --filter @fitness/plate-math test -- achievability` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GYM-07 | — | N/A | unit + e2e | `pnpm --filter mobile test -- smart-swap` | ✅ extend `smart-swap.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/plate-math/src/solver.ts` + `__tests__/solver.test.ts` — GYM-02, GYM-05, D-15 degenerate inventory (one pair, no pairs)
- [ ] `packages/plate-math/src/achievability.ts` + `__tests__/achievability.test.ts` — GYM-06, D-09/D-10 explicit-direction rounding
- [ ] `packages/plate-math/src/inventory.ts` + `__tests__/inventory.test.ts` — D-21 resolved-inventory function
- [ ] `packages/plate-math/package.json` — mirror `packages/pr-rules/package.json` (skip if folded into `pr-rules`)
- [ ] `apps/api/src/sync/__tests__/` — `equipment_profile` push-path case, following `program-sync.e2e-spec.ts`'s `routine` pattern
- [ ] Fix WINDOWS #138 (`handleSwapPick` missing `db` threading) — required before the equipment-aware swap path is exercised by e2e

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native (iOS/Android) plate strip rendering inside the keypad's reserved band | GYM-05 | No native toolchain on this machine; deferred to ROADMAP Phase 999.1 | Run the dev client on device, open set entry, type a barbell weight, confirm the strip renders in the 40px reserved band |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
