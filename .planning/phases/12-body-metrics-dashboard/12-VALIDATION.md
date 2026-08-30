---
phase: 12
slug: body-metrics-dashboard
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-30
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `12-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest `^29.7.0` via `jest-expo` (`apps/mobile`), Jest + `jest-e2e.json` (`apps/api`), Jest + ts-jest (`packages/*`), Playwright `1.62.1` (`apps/mobile` e2e/web) |
| **Config file** | `apps/mobile/jest.config.js` (unit), `apps/mobile/playwright.config.ts` (e2e), `apps/api/test/jest-e2e.json` (API e2e) |
| **Quick run command** | `pnpm --filter mobile test -- <pattern>` |
| **Full suite command** | `pnpm -w test` plus `pnpm --filter mobile test:e2e` |
| **Estimated runtime** | ~20s quick (single Jest file); ~5 min full suite including Playwright |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter mobile test -- <touched-area>` and/or `pnpm --filter api test -- <touched-area>`
- **After every plan wave:** Run `pnpm -w typecheck && pnpm -w test`; add `pnpm --filter mobile test:e2e` when a screen, the photo store, or a write path changed
- **Before `/gsd-verify-work`:** Full suite green including the Playwright `durability` project (browser/E2E is standing-authorized in this repo — see `.planning/CONVENTIONS.md`)
- **Max feedback latency:** 20 seconds for the quick command

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table is the requirement→command contract the plans must satisfy. `/gsd-validate-phase` fills the Task ID column once plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | BODY-01, BODY-02 | T-12-01 | `body_metric` push derives `user_id` from the session only, never from the payload | e2e | `pnpm --filter api test:e2e -- body-metric` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | BODY-01, BODY-02 | T-12-03 | A `kind` outside the closed vocabulary is rejected before `applyBatch` | e2e | `pnpm --filter api test:e2e -- body-metric` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | BODY-01, BODY-02 | — | N/A | unit | `pnpm --filter @fitness/api-contracts test -- body-metric-vocabulary` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | BODY-01, BODY-02 | — | N/A | unit | `pnpm --filter @fitness/api-contracts test -- units` (cm⇄in round-trip, no drift) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | BODY-03 | — | N/A | unit | `pnpm --filter mobile test -- body-metric-trend` (latest-per-day dedup, no fabricated zeros) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | BODY-03 | — | N/A | e2e | `pnpm --filter mobile test:e2e -- body-metric` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | BODY-04 | T-12-02 | `progress_photo` push is user-scoped on both push and pull; no cross-user leak | e2e | `pnpm --filter api test:e2e -- progress-photo` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | BODY-04 | — | N/A | unit | `pnpm --filter mobile test -- downscale` (the D-17 bound as a pure function) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | BODY-04 | — | N/A | e2e | `pnpm --filter mobile test:e2e -- progress-photo` (capture→store→read round-trip against real browser IndexedDB) | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | BODY-05 | — | N/A | unit | `pnpm --filter mobile test -- composite` (pair selection excludes photos absent locally — D-19) | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | BODY-05 | — | N/A | e2e | `pnpm --filter mobile test:e2e -- composite` (web canvas path produces a downloadable artifact) | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | DASH-01 | — | N/A | unit | `pnpm --filter mobile test -- dashboard-widget-dispatch` (all six kinds render; unknown kind skipped, not an error — D-22) | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | DASH-02 | T-12-01 | `dashboard_widget` push derives `user_id` from the session only | e2e | `pnpm --filter api test:e2e -- dashboard-widget` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | DASH-02 | — | N/A | unit | `pnpm --filter mobile test -- dashboard-layout` (position allocation via the existing `order-index` module; first-run materializes real rows — D-26) | ❌ W0 | ⬜ pending |
| TBD | TBD | 4 | DASH-02 | — | N/A | e2e | `pnpm --filter mobile test:e2e -- dashboard-widgets` (add/remove/reorder against a real `@powersync/web` database) | ❌ W0 | ⬜ pending |
| TBD | TBD | 4 | DASH-03 | — | N/A | unit | `pnpm --filter mobile test -- quick-action` (all six destinations; quick weigh-in defaults to the last recorded value — D-29) | ❌ W0 | ⬜ pending |
| TBD | TBD | 4 | DASH-03 | — | N/A | e2e | `pnpm --filter mobile test:e2e -- quick-action` | ❌ W0 | ⬜ pending |
| TBD | TBD | 4 | Cross-cutting | — | N/A | unit | assertion that `PUSH_DEFERRED_TABLES` is empty — same shape as 11-02's `SYNCED_TABLES` last-member assertion | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/test/body-metric.e2e-spec.ts` — BODY-01/02 push ownership + closed-vocabulary rejection, modeled on `excluded-exercise.e2e-spec.ts`
- [ ] `apps/api/test/progress-photo.e2e-spec.ts` — BODY-04 metadata-row push ownership and validation
- [ ] `apps/api/test/dashboard-widget.e2e-spec.ts` — DASH-02 push ownership/validation and the `PUSH_DEFERRED_TABLES`-empty assertion
- [ ] `packages/api-contracts/src/__tests__/` additions — body-metric vocabulary and cm⇄in conversion
- [ ] `apps/mobile/lib/photos/__tests__/downscale.test.ts` — pure-function coverage for the D-17 bound
- [ ] Playwright specs for progress photo, composite, dashboard widgets, and quick actions
- [ ] Framework install: none — Jest and Playwright are already configured project-wide

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native camera/library capture and the native composite (`react-native-view-shot`) on a real iOS/Android build | BODY-04, BODY-05 | No Xcode and no Android SDK on this machine — the native half of every platform-split module is typecheck-only here (project-standing constraint) | Defer to ROADMAP Phase 999.1; run the capture→store→composite→share flow on a real device |
| Cross-device arrival of `body_metric`, `progress_photo` and `dashboard_widget` rows after a PowerSync Service restart | BODY-01, BODY-04, DASH-02 | Requires restarting the PowerSync Service against the edited `sync-rules.yaml` and two live devices | Defer to ROADMAP Phase 999.1, matching the 04-02 / 11-02 precedent |
| Subjective visual judgment of the restructured dashboard, widget picker, and composite layout on web | DASH-01, DASH-02, BODY-05 | Human visual judgment | Defer to ROADMAP Phase 999.2 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
