---
phase: 11
slug: program-generation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-29
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest for `packages/*`; jest-expo for `apps/mobile`; Jest + `jest-e2e.json` for `apps/api`; Playwright for the mobile durability project |
| **Config file** | `packages/program-generator/package.json` `"test": "jest"` (new package, mirrors `packages/progression-engine`) — no package-level `jest.config.js` |
| **Quick run command** | `pnpm --filter @fitness/program-generator test` |
| **Full suite command** | `pnpm -w test` |
| **Estimated runtime** | ~15s quick (pure functions, no PowerSync/Postgres); ~3–5 min full suite |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @fitness/program-generator test`
- **After every plan wave:** Run `pnpm -w test`; add `pnpm --filter mobile test:e2e:durability` when the wizard or the write path changed
- **Before `/gsd-verify-work`:** Full suite green plus a real Playwright durability run (authorized standing in this repo)
- **Max feedback latency:** 20 seconds for the quick command

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table is the requirement→command contract the plans must satisfy. `/gsd-validate-phase` fills the Task ID column once plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | — | — | N/A | scaffold | `pnpm --filter @fitness/program-generator test` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | GEN-01 | — | N/A | unit | `pnpm --filter @fitness/program-generator test -- generate.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | GEN-02 | T-11-01 | Candidate pool cannot include an exercise the active gym cannot load | unit | `pnpm --filter @fitness/program-generator test -- candidate-pool.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | GEN-03 | T-11-02 | An excluded exercise is unreachable by every path, including degraded slot fill | unit | `pnpm --filter @fitness/program-generator test -- candidate-pool.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | GEN-03 | T-11-03 | `excluded_exercise` rows are user-scoped on push and pull; no cross-user leak | e2e | `pnpm --filter api test:e2e -- excluded-exercise` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | GEN-04 | — | N/A | unit | `pnpm --filter @fitness/program-generator test -- split-templates.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | GEN-04 | — | N/A | unit | `pnpm --filter @fitness/program-generator test -- emphasis.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | GEN-05 | — | N/A | unit | `pnpm --filter @fitness/program-generator test -- volume-landmarks.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | GEN-06 | — | N/A | unit | `pnpm --filter @fitness/program-generator test -- deload.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | GEN-07 | — | N/A | unit (parity) | `pnpm --filter @fitness/program-generator test -- parity.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | GEN-07 | — | N/A | e2e (durability) | `pnpm --filter mobile test:e2e:durability` | ⚠️ append-only shared file | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/program-generator/` — package does not exist; scaffold `package.json` + `tsconfig.json` mirroring `packages/progression-engine` before any generation logic is written
- [ ] `packages/program-generator/src/__fixtures__/` — shared fixture table for the GEN-07 parity test, following the progression-engine fixture convention
- [ ] `apps/api/src/db/schema/` entry for `excluded_exercise` plus matching `apps/api/test/*.e2e-spec.ts` coverage — no test can exist for a table that does not
- [ ] Framework install: none needed — Jest/ts-jest are already workspace devDependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generation wizard on a real iOS/Android device | GEN-01, GEN-04 | No Xcode or Android SDK on this machine (standing project constraint) | Deferred to ROADMAP Phase 999.1 native sweep, consistent with every prior phase |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
