---
phase: 13
slug: program-generator-volume-selection-rework
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| **Framework** | Jest 30 via `ts-jest` (`preset: 'ts-jest'`, `testEnvironment: 'node'`) — jest 30.4.2 on node v24.14.1 at sign-off |
| **Config file** | `packages/program-generator/jest.config.js` |
| **Quick run command** | `pnpm --filter @fitness/program-generator test` |
| **Full suite command** | `pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test` |
| **Measured runtime** | Package suite: 14 suites / 160 tests in 3.7–4.2 s of jest time (~6 s wall clock including the typecheck the quick loop pairs it with). Workspace gate at sign-off: build 1 s (turbo cache hit), typecheck 12 s, test 52 s — mobile's 144 suites / 2331 tests dominate |
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
- **Max feedback latency:** ~4 s (measured package suite; the skeleton's ~13 s estimate was conservative)

---

## Per-Task Verification Map

Every row below was marked green against a run executed on 2026-09-02 during 13-04 task 3, on the
tree at commit `5d02130` (13-04 task 2) — not carried over from the earlier plans' own runs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | GEN-VOL-01, GEN-VOL-02, GEN-RIR-01 | T-13-01, T-13-02, T-13-04 | `rirForCycle` clamps `daysPerWeek` into 2..6 and falls back to the 4-day ladder rather than returning `undefined`; the fit's loops are bounded by strictly decreasing quantities | unit | `pnpm --filter @fitness/program-generator typecheck && pnpm --filter @fitness/program-generator test -- generate.test.ts volume-landmarks.test.ts` | ✅ `src/__tests__/generate.test.ts`, `src/__tests__/volume-landmarks.test.ts` | ✅ green — 24/24, 3 s |
| 13-01-02 | 01 | 1 | GEN-VOL-01, GEN-VOL-02 | T-13-02 | A single plan fitted to a 1-minute budget terminates with the day non-empty and the shortfall reported | unit | `pnpm --filter @fitness/program-generator test -- volume-split.test.ts session-fit.test.ts session-length.test.ts` | ✅ `src/__tests__/volume-split.test.ts`, `src/__tests__/session-fit.test.ts`, `src/__tests__/session-length.test.ts` | ✅ green — 16/16, 2 s |
| 13-01-03 | 01 | 1 | GEN-RIR-01, GEN-VOL-01 | T-13-03 | Byte-determinism holds across the widened catalog; the shared parity table's hand-typed RIR values match the new ladder in all three consuming processes | unit | `pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test` | ✅ `src/__fixtures__/parity.ts` + the three parity suites | ✅ green — same gate run as 13-04-03 (14/14 turbo tasks, program-generator 160/160 on a cache miss, mobile 2331/2331) |
| 13-02-01 | 02 | 1 | GEN-VOL-02 | T-13-11, T-13-13 | The trimmed-day sentence exposes no catalog internal, stays non-blaming, and no `DegradationEntry.kind` is added | unit | `pnpm --filter @fitness/program-generator build && pnpm --filter mobile test -- generation-wizard generate-screen` | ✅ `apps/mobile/lib/programs/__tests__/generation-wizard.test.ts` | ✅ green — 2 suites, 45/45, 6 s |
| 13-02-02 | 02 | 1 | GEN-RIR-01 | T-13-12 | The provenance document marks the ladder and set cap as project-authored and records that Phase 11's D-14 is superseded | doc gate | `node -e "…docs/volume-rir-landmarks.md placeholder+row scan…"` (full command in `13-02-PLAN.md` Task 2 verify) | ✅ `docs/volume-rir-landmarks.md` | ✅ green — exit 0 |
| 13-03-01 | 03 | 2 | GEN-SEL-01, GEN-SEL-02 | T-13-21, T-13-22, T-13-24 | A `secondary` mapping at weight 1.00 cannot displace a `primary` candidate; `seededRank` then id stay the terminal tie-break; loadability reads `MODEL_EQUIPMENT_TYPES` from `@fitness/plate-math`; an unclassified (`movementPattern: null`) candidate never beats a classified one | unit | `pnpm --filter @fitness/program-generator test -- slot-fill.test.ts` | ✅ `src/__tests__/slot-fill.test.ts` (rewritten for the tiered model; movement-class tier amended in `808260d`) | ✅ green — 19/19, 2 s |
| 13-03-02 | 03 | 2 | GEN-SEL-01 | T-13-22 | The week map never influences the volume split or the session fit, so the estimate stays reproducible and order-independent | unit | `pnpm --filter @fitness/program-generator typecheck && pnpm --filter @fitness/program-generator test` | ✅ full package suite (14 suites) | ✅ green — 160/160 in 3.7–4.2 s across four clean runs; one intervening run lost `generate.test.ts` to a jest-worker SIGSEGV (no assertion failed; see Run Record) |
| 13-04-01 | 04 | 3 | GEN-VOL-01, GEN-SEL-01, GEN-SEL-02 | T-13-31, T-13-32 | Catalog text reaches the emitted module only through `JSON.stringify`; two runs of the script diff clean | script + typecheck | `node scripts/derive-generator-regression-fixture.cjs && cp … && node scripts/derive-generator-regression-fixture.cjs && diff -q … && pnpm --filter @fitness/program-generator typecheck` (full command in `13-04-PLAN.md` Task 1 verify) | ✅ `scripts/derive-generator-regression-fixture.cjs`, `src/__fixtures__/catalog-2day-regression.ts` (60 exercises, 208 mappings) | ✅ green — byte-identical across two runs, typecheck exit 0, every target group carries 6 primary-mapped exercises |
| 13-04-02 | 04 | 3 | GEN-VOL-01, GEN-VOL-02, GEN-SEL-01, GEN-SEL-02, GEN-RIR-01 | T-13-33 | The suite derives its muscle-group list from `resolveSplitTemplate('auto', 2)` and asserts fixture coverage, so a template change fails loudly instead of weakening the proof | unit (real-catalog data) | `pnpm --filter @fitness/program-generator test -- regression-2day-60min.test.ts` | ✅ `src/__tests__/regression-2day-60min.test.ts` | ✅ green — 8/8, 1 s; the same suite fails 4 of its 5 D-11 clauses against the pre-phase generator (commit `667e94a`) |
| 13-04-03 | 04 | 3 | GEN-VOL-01, GEN-VOL-02, GEN-SEL-01, GEN-SEL-02, GEN-RIR-01 | T-13-33, T-13-34 | The workspace gate runs against a freshly built `dist`, so no app suite reports a pass against stale compiled output | integration | `pnpm --filter @fitness/program-generator build && pnpm -w run typecheck && pnpm -w run test` | ✅ (workspace suites) | ✅ green — build exit 0, typecheck 14/14 tasks in 12 s, test 14/14 tasks in 52 s |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Run Record (13-04 task 3, 2026-09-02)

The full package suite (`13-03-02`'s command) was executed six times in this session. Five were
clean at 160/160. One run reported `generate.test.ts` as "Test suite failed to run — a jest worker
process was terminated by another process: signal=SIGSEGV" with 144 tests counted and no assertion
failure. The three immediately following runs, and the turbo gate that executed the package on a
cache miss, were all 160/160. Treated as a one-off worker crash in the node v24.14.1 / jest 30.4.2
environment rather than a flaky test; if it recurs, it belongs in `.planning/WINDOWS.md` as an
environment issue, not a phase defect.

---

## Wave 0 Requirements

Gaps the research identified, and the file that closed each:

- [x] `packages/program-generator/src/volume-split.ts` + `src/__tests__/volume-split.test.ts` — new module and suite (13-01 tasks 1 and 2, commits `9414938`, `10426be`)
- [x] `packages/program-generator/src/session-fit.ts` + `src/__tests__/session-fit.test.ts` — new module and suite (13-01 tasks 1 and 2, commits `9414938`, `10426be`)
- [x] `src/__tests__/session-length.test.ts` — the four cases asserting the replaced removal-from-the-end behaviour were retired, not patched; `trimToSessionLength` no longer exists in `session-length.ts` (13-01 task 2, Pitfall 4)
- [x] `src/__tests__/volume-landmarks.test.ts` — the `rirForCycle` call sites take the new `daysPerWeek` argument and assert D-09's concrete values (13-01 task 1, Pitfall 2)
- [x] `src/__fixtures__/parity.ts` — hand-typed `handBuilt(...)` RIR values recomputed under the 3-day ladder; `catalogCovering` widened past one exercise per group (13-01 task 3, commit `7409c55`, Pitfalls 1 and 3)
- [x] `src/__tests__/generate.test.ts`, `src/__tests__/determinism.test.ts` — `fullCatalog` widened so the split has candidates to place (13-01 tasks 1 and 3, Pitfall 1)
- [x] `src/__tests__/slot-fill.test.ts` — the direct `pickSlotExercise(...)` calls moved to the `SlotPickContext` object, one case per D-07 tier and per D-06/D-08 gate added, movement-class tier covered after the `808260d` amendment (13-03 task 1, commit `bff0072`, Pitfall 2)
- [x] `src/generate.ts` slot-fill call sites rewritten to thread `pickedByMuscleGroup`, `coveredMovementPatterns` and `preferCompound` (13-03 task 2, commit `5f0acfd`)
- [x] `scripts/derive-generator-regression-fixture.cjs` + `src/__fixtures__/catalog-2day-regression.ts` — D-11's fixture and its deterministic derivation (13-04 task 1, commit `ec78e82`)
- [x] `src/__tests__/regression-2day-60min.test.ts` — D-11's five assertions plus the coverage and determinism guards (13-04 task 2, commit `5d02130`)

No framework install was required: `jest ^30.0.0`, `ts-jest ^29.2.5`, `typescript ^5.9.2` and
`@types/jest ^30.0.0` were already devDependencies of `packages/program-generator`, and the phase
added no package.

Determinism coverage needed no new gate — `determinism.test.ts`'s recursive scan of every `.ts` under
`src` (excluding `__tests__`) covers `volume-split.ts`, `session-fit.ts` and the new fixture
automatically, and passed with the fixture in place.

---

## Manual-Only Verifications

All phase behaviours have automated verification. This phase is a pure algorithm rework inside one
workspace package plus one copy string and one markdown document — there is no screen to look at, no
device to run on, and no external service to reach.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — all ten rows above carry an automated command that was run
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task has one
- [x] Wave 0 covers all MISSING references — every research gap is checked off above with its closing file and commit
- [x] No watch-mode flags — every command is a one-shot `jest`, `tsc --noEmit`, `node -e` or `turbo run`
- [x] Feedback latency < 13s — measured 3.7–4.2 s for the package suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** signed off 2026-09-02 by 13-04 task 3 — every row green against a real run on the
current tree. `status` stays `draft` per this file's own lifecycle comment: `/gsd-validate-phase` is
the step that flips it to `validated`.
