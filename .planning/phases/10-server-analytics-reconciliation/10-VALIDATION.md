---
phase: 10
slug: server-analytics-reconciliation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-29
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `10-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x via `ts-jest` — API unit (`apps/api/jest.config.js`, `testRegex: '\.spec\.ts$'`) and API e2e (`apps/api/test/jest-e2e.json`, `testRegex: '.e2e-spec.ts$'`); mobile Jest (Expo preset); Playwright `durability` project for web behavior |
| **Config file** | `apps/api/jest.config.js`, `apps/api/test/jest-e2e.json`, `apps/mobile/playwright.config.ts` |
| **Quick run command** | `pnpm --filter @fitness/api test` and `pnpm --filter mobile test` |
| **Full suite command** | `pnpm --filter @fitness/api test:e2e` (requires live Postgres; runs `db:push && nest build && jest --runInBand`) |
| **Estimated runtime** | ~15s quick (unit, no DB) · ~3–6 min full e2e · ~4 min durability |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @fitness/api test` (API tasks) or `pnpm --filter mobile test` (client tasks)
- **After every plan wave:** Run `pnpm --filter @fitness/api test:e2e`, including the extended `seeded-corpus-perf` query-count budget assertions
- **Before `/gsd-verify-work`:** Full API e2e green **and** `pnpm --filter mobile test:e2e:durability` green (the body map's accessibility contract is only real evidence in a browser)
- **Max feedback latency:** 20 seconds for the per-task quick run

---

## Per-Task Verification Map

Task IDs are assigned when PLAN.md files are written; `/gsd-validate-phase` fills this table
against the executed plans. The requirement→test mapping below is the contract those tasks
must satisfy.

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| ANLY-04 | Rollup rows carry weighted (secondary-inclusive) volume per `(user, muscle_group, local_date)` and sync down through the `user_data` stream | unit + e2e | `pnpm --filter @fitness/api test -- reconciliation.spec` · `pnpm --filter @fitness/api test:e2e -- seeded-corpus-perf` | ❌ W0 (new spec) / extend existing |
| ANLY-04 | 1-week window computed locally; 1-month/3-month read the rollup and overlay post-watermark local sessions | unit (mobile) | `pnpm --filter mobile test -- muscle-volume-query` | ❌ W0 |
| ANLY-04 | Body-map figure exposes one `role="img"` announcement with the UI-SPEC's accessible-name format, no text inside `<Svg>`; untrained is categorically distinct from lowest real intensity | unit + durability | `pnpm --filter mobile test -- BodyMap` · `pnpm --filter mobile test:e2e:durability` | ❌ W0 (new spec + append-only harness registration) |
| ANLY-05 | Drill-down lists the exercises contributing a muscle group's sets for the selected window, read locally | unit (mobile) | `pnpm --filter mobile test -- muscle-volume-query` | ❌ W0 |
| ANLY-09 | Editing a past session's sets or `local_date` recomputes the affected PRs and rollup cells — scoped, idempotent, and invalidating the vacated cell | unit + e2e | `pnpm --filter @fitness/api test -- reconciliation.spec` · `pnpm --filter @fitness/api test:e2e -- personal-record-sync` | ❌ W0 / extend existing |
| ANLY-09 | Recompute and history read query counts do not grow with corpus size | e2e (query-count budget) | `pnpm --filter @fitness/api test:e2e -- seeded-corpus-perf` | Partial — `countQueries`/`generateCorpus` harness exists, budgets and assertions are new |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/analytics/__tests__/reconciliation.spec.ts` — ANLY-09 recompute scoping and idempotency
- [ ] `apps/mobile/lib/db/__tests__/muscle-volume-query.test.ts` — ANLY-04 local/rollup/overlay read logic and ANLY-05 drill-down
- [ ] `apps/mobile/components/__tests__/BodyMap.test.tsx` — pure summary-string and intensity-fill logic, mirroring `TrendChart.test.tsx`
- [ ] Extend `apps/api/test/seeded-corpus-perf.e2e-spec.ts` — query-count assertions for the reconcile-on-edit and rollup-read paths
- [ ] Extend `apps/api/test/schema-parity.e2e-spec.ts` — add the rollup and watermark tables to `REQUIRED_TABLES` plus their `REQUIRED_COLUMNS`
- [ ] Extend `apps/api/src/seed/generate-corpus.ts` — insert `exercise_muscle_mapping` rows for the ten `seed-ex-*` exercises (without them no rollup math is exercised; Research Pitfall 1)
- [ ] Register the body-map screen in `apps/mobile/app/__durability.web.tsx` — **append-only**, per the project's standing convention for every e2e-bearing plan

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native (iOS/Android) rendering of the body map, window switch and drill-down sheet | ANLY-04, ANLY-05 | No Xcode and no Android SDK on this machine — standing project policy accumulates native UAT | Deferred to ROADMAP Phase 999.1; record a WINDOWS.md entry per deferred item |
| Subjective visual review of the intensity scale and the untrained-vs-lowest-intensity distinction at maximum OS font scale | ANLY-04 | Human judgment on colour/legibility cannot be asserted | Deferred to ROADMAP Phase 999.2; record a WINDOWS.md entry per deferred item |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
