---
phase: 13
slug: program-generator-volume-selection-rework
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-02
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

Every requirement in this phase is pure in-package TypeScript with no I/O, no device dependency and
no UI surface, so every behaviour is automatable at unit speed. There is no manual-only row.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 via `ts-jest` (`preset: 'ts-jest'`, `testEnvironment: 'node'`) |
| **Config file** | `packages/program-generator/jest.config.js` |
| **Quick run command** | `pnpm --filter @fitness/program-generator test` |
| **Full suite command** | `pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test` |
| **Estimated runtime** | ~13 seconds for the package suite; the workspace suite is minutes |
| **Suite integrity guard** | `scripts/jest-suite-integrity.cjs` (declared in the package's `reporters`) fails a run containing a zero-test, skipped-test or empty suite |
| **Build-before-verify rule** | `apps/mobile` and `apps/api` resolve `@fitness/program-generator` through `dist/`, not `src/`. `turbo run test`/`typecheck` resolve `^build` automatically; a direct `pnpm --filter mobile test` does not, so always rebuild the package first |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @fitness/program-generator test`
- **After every plan wave:** `pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test`
- **Before `/gsd-verify-work`:** full suite green, including the three jest processes that import
  `packages/program-generator/src/__fixtures__/parity.ts`
  (this package, `apps/api/src/generation/__tests__/parity.spec.ts`,
  `apps/mobile/lib/db/__tests__/generation-parity.test.ts`)
- **Max feedback latency:** ~13 seconds (package suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | GEN-VOL-01, GEN-VOL-02, GEN-RIR-01 | T-13-01, T-13-02, T-13-04 | `rirForCycle` clamps `daysPerWeek` into 2..6 and falls back to the 4-day ladder rather than returning `undefined`; the fit's loops are bounded by strictly decreasing quantities | unit | `pnpm --filter @fitness/program-generator typecheck && pnpm --filter @fitness/program-generator test -- generate.test.ts volume-landmarks.test.ts` | ✅ (existing suites, extended) | ⬜ pending |
| 13-01-02 | 01 | 1 | GEN-VOL-01, GEN-VOL-02 | T-13-02 | A single plan fitted to a 1-minute budget terminates with the day non-empty and the shortfall reported | unit | `pnpm --filter @fitness/program-generator test -- volume-split.test.ts session-fit.test.ts session-length.test.ts` | ❌ W0 — `__tests__/volume-split.test.ts`, `__tests__/session-fit.test.ts` | ⬜ pending |
| 13-01-03 | 01 | 1 | GEN-RIR-01, GEN-VOL-01 | T-13-03 | Byte-determinism holds across the widened catalog; the shared parity table's hand-typed RIR values match the new ladder in all three consuming processes | unit | `pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test` | ✅ (existing fixtures, edited) | ⬜ pending |
| 13-02-01 | 02 | 1 | GEN-VOL-02 | T-13-11, T-13-13 | The trimmed-day sentence exposes no catalog internal, stays non-blaming, and no `DegradationEntry.kind` is added | unit | `pnpm --filter @fitness/program-generator build && pnpm --filter mobile test -- generation-wizard generate-screen` | ✅ `apps/mobile/lib/programs/__tests__/generation-wizard.test.ts` | ⬜ pending |
| 13-02-02 | 02 | 1 | GEN-RIR-01 | T-13-12 | The provenance document marks the ladder and set cap as project-authored and records that Phase 11's D-14 is superseded | doc gate | `node -e "…docs/volume-rir-landmarks.md placeholder+row scan…"` (full command in `13-02-PLAN.md` Task 2 verify) | ✅ `docs/volume-rir-landmarks.md` | ⬜ pending |
| 13-03-01 | 03 | 2 | GEN-SEL-01, GEN-SEL-02 | T-13-21, T-13-22, T-13-24 | A `secondary` mapping at weight 1.00 cannot displace a `primary` candidate; `seededRank` then id stay the terminal tie-break; loadability reads `MODEL_EQUIPMENT_TYPES` from `@fitness/plate-math` | unit | `pnpm --filter @fitness/program-generator test -- slot-fill.test.ts` | ⚠️ exists but tests the replaced single-score model — rewritten, not extended | ⬜ pending |
| 13-03-02 | 03 | 2 | GEN-SEL-01 | T-13-22 | The week map never influences the volume split or the session fit, so the estimate stays reproducible and order-independent | unit | `pnpm --filter @fitness/program-generator typecheck && pnpm --filter @fitness/program-generator test` | ✅ (existing suite, extended) | ⬜ pending |
| 13-04-01 | 04 | 3 | GEN-VOL-01, GEN-SEL-01, GEN-SEL-02 | T-13-31, T-13-32 | Catalog text reaches the emitted module only through `JSON.stringify`; two runs of the script diff clean | script + typecheck | `node scripts/derive-generator-regression-fixture.cjs && … && diff -q … && pnpm --filter @fitness/program-generator typecheck` (full command in `13-04-PLAN.md` Task 1 verify) | ❌ W0 — `scripts/derive-generator-regression-fixture.cjs`, `src/__fixtures__/catalog-2day-regression.ts` | ⬜ pending |
| 13-04-02 | 04 | 3 | GEN-VOL-01, GEN-VOL-02, GEN-SEL-01, GEN-SEL-02, GEN-RIR-01 | T-13-33 | The suite derives its muscle-group list from `resolveSplitTemplate('auto', 2)` and asserts fixture coverage, so a template change fails loudly instead of weakening the proof | unit (real-catalog data) | `pnpm --filter @fitness/program-generator test -- regression-2day-60min.test.ts` | ❌ W0 — `src/__tests__/regression-2day-60min.test.ts` | ⬜ pending |
| 13-04-03 | 04 | 3 | GEN-VOL-01, GEN-VOL-02, GEN-SEL-01, GEN-SEL-02, GEN-RIR-01 | T-13-33, T-13-34 | The workspace gate runs against a freshly built `dist`, so no app suite reports a pass against stale compiled output | integration | `pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test` | ✅ (workspace suites) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Gaps the research identified, and the task that closes each:

- [ ] `packages/program-generator/src/volume-split.ts` + `src/__tests__/volume-split.test.ts` — new module and suite (13-01 tasks 1 and 2)
- [ ] `packages/program-generator/src/session-fit.ts` + `src/__tests__/session-fit.test.ts` — new module and suite (13-01 tasks 1 and 2)
- [ ] `src/__tests__/session-length.test.ts` — the four cases asserting the replaced removal-from-the-end behaviour are retired, not patched (13-01 task 2, Pitfall 4)
- [ ] `src/__tests__/volume-landmarks.test.ts` — three `rirForCycle` call sites take the new `daysPerWeek` argument and assert D-09's concrete values (13-01 task 1, Pitfall 2)
- [ ] `src/__fixtures__/parity.ts` — six hand-typed `handBuilt(...)` RIR values recomputed under the 3-day ladder; `catalogCovering` widened past one exercise per group (13-01 task 3, Pitfalls 1 and 3)
- [ ] `src/__tests__/generate.test.ts`, `src/__tests__/determinism.test.ts` — `fullCatalog` widened so the split has candidates to place (13-01 tasks 1 and 3, Pitfall 1)
- [ ] `src/__tests__/slot-fill.test.ts` — five direct `pickSlotExercise(...)` calls move to the context object, and one case per D-07 tier and per D-06/D-08 gate is added (13-03 task 1, Pitfall 2)
- [ ] `scripts/derive-generator-regression-fixture.cjs` + `src/__fixtures__/catalog-2day-regression.ts` — D-11's fixture and its deterministic derivation (13-04 task 1)
- [ ] `src/__tests__/regression-2day-60min.test.ts` — D-11's five assertions (13-04 task 2)

No framework install is required: `jest ^30.0.0`, `ts-jest ^29.2.5`, `typescript ^5.9.2` and
`@types/jest ^30.0.0` are already devDependencies of `packages/program-generator`.

Determinism coverage needs no new gate — `determinism.test.ts`'s recursive scan of every `.ts` under
`src` (excluding `__tests__`) already covers `volume-split.ts`, `session-fit.ts` and the new fixture
automatically.

---

## Manual-Only Verifications

All phase behaviours have automated verification. This phase is a pure algorithm rework inside one
workspace package plus one copy string and one markdown document — there is no screen to look at, no
device to run on, and no external service to reach.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 13s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — 13-04 task 3 marks each row green against a real run and completes this
checklist.
