---
phase: 02
slug: data-model-sync-engine
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (`apps/mobile/jest.config.js` exists; `apps/api` uses `test/jest-e2e.json`) |
| **Config file** | `apps/mobile/jest.config.js` · `apps/api/test/jest-e2e.json` |
| **Quick run command** | `pnpm --filter mobile test` |
| **Full suite command** | `pnpm test` (turbo fan-out) |
| **Estimated runtime** | ~2.5 seconds (`pnpm --filter mobile test`), ~80 seconds (`pnpm turbo run typecheck lint test build`) — measured 2026-08-17, plan 02-12 |

**Gaps Wave 0 must close:**
- `apps/api` has **no `test` script** — only `test:e2e`. Sync-endpoint unit tests need a `test` script wired so `turbo run test` picks them up.
- `packages/progression-engine` and `packages/api-contracts` have **no test scripts** at all. Shared schema/unit-conversion logic landing here needs one.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <workspace> test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~3 seconds (`pnpm --filter mobile test`) — measured 2026-08-17, plan 02-12

---

## Per-Task Verification Map

> Seeded by `/gsd-plan-phase`; rows are filled once PLAN.md files exist. `/gsd-validate-phase` reconciles this table against the plans.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Task 2 | 02-12 | 7 | PLAT-02 | — | A complete workout (start, exercise, several sets) can be logged with zero network connectivity through the real production write path, proven by `durability.spec.ts` (02-09) surviving a close/reopen, `schema-redefinition.spec.ts` (02-12 Task 1) surviving a client schema change, and `sync.spec.ts`'s offline-write case (02-12 Task 2) never touching the network while offline | e2e (real browser) | `pnpm --filter mobile test:e2e -- --project=durability` and `pnpm --filter mobile test:e2e -- --project=sync` | ✅ | ✅ green |
| Task 2 | 02-12 | 7 | PLAT-03 | T-02-45..T-02-48 | Offline writes drain to Postgres automatically once connectivity returns, with no manual sync action, no button tap, and no reload — asserted by a region-gated grep proving nothing drives the page between `context.setOffline(false)` and the queue reaching zero, roadmap criterion 1 | e2e (real browser, live PowerSync Service, real API, real Postgres) | `pnpm --filter mobile test:e2e -- --project=sync` | ✅ | ✅ green |
| Task 2 | 02-12 | 7 | PLAT-04 | T-02-45..T-02-48 | Two independent browser contexts signed into the same account, each logging sets offline, both converge with no logged set lost — the browser half of WINDOWS #26; native/device convergence remains deferred (WINDOWS #26 amended, not closed; ROADMAP Phase 999.1) | e2e (two real browser contexts, live stack) | `pnpm --filter mobile test:e2e -- --project=sync` | ✅ | ✅ green (web only) |
| Task 1 | 02-12 | 7 | PLAT-07 | — | An in-progress workout's logged sets survive a close/reopen with `set_index` order intact and no gap, and a reopen against zero logged sets returns zero rows and an empty crud queue with no error — PLAT-07's ordering and empty-input edges | e2e (real browser) | `pnpm --filter mobile test:e2e -- --project=durability` | ✅ | ✅ green |
| Task 2 | 02-12 | 7 | PLAT-08 | — | A set logged with no weight reaches Postgres as SQL NULL through the real client, crud queue, and connector — not only a direct API push (02-10's `null-weight.e2e-spec.ts`) — distinguishing NULL from the literal `'0.000'` at the database | e2e (real browser, live stack, direct Postgres assertion) | `pnpm --filter mobile test:e2e -- --project=sync` | ✅ | ✅ green |
| _pending_ | — | — | PLAT-10 | — | — | — | — | ❌ W0 | ⬜ pending |
| _pending_ | — | — | LOG-22 | — | — | — | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api` — add a `test` script (Jest unit config) so sync write-path logic is covered by `turbo run test`
- [ ] `packages/progression-engine` and/or `packages/api-contracts` — add `test` script if shared schema/unit-conversion logic lands there
- [ ] Two-device concurrent-edit harness — the automated test success criterion 2 names; must exist before any conflict-resolution task claims coverage
- [ ] Seeded corpus fixture (1–2 years of realistic training history) — required by success criterion 3; a handful of hand-entered workouts does not satisfy it
- [ ] Populated pre-migration database fixture — required by success criterion 4 (schema upgrade must preserve unsynced on-device data)
- [x] Measure and record quick/full suite runtimes to fill the runtime fields above (done 2026-08-17, plan 02-12: ~2.5s quick, ~80s full)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native (iOS/Android) offline write + reconnect sync | PLAT-02, PLAT-03 | No Xcode and no Android SDK on this machine — native runtime cannot be exercised here. Web is the only runtime-verifiable target this phase. | Deferred to ROADMAP Phase 999.1 native sweep. Web-target equivalent must still pass automated. |

*Everything else in this phase must have automated verification — see success criteria 2, 3, and 4, each of which explicitly names an automated test.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [x] Feedback latency < 5s (measured ~2.5s for `pnpm --filter mobile test`)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
