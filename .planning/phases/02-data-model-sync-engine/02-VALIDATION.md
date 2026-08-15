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
| **Estimated runtime** | ~{N} seconds — measure during Wave 0 |

**Gaps Wave 0 must close:**
- `apps/api` has **no `test` script** — only `test:e2e`. Sync-endpoint unit tests need a `test` script wired so `turbo run test` picks them up.
- `packages/progression-engine` and `packages/api-contracts` have **no test scripts** at all. Shared schema/unit-conversion logic landing here needs one.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <workspace> test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds — set in Wave 0 once measured

---

## Per-Task Verification Map

> Seeded by `/gsd-plan-phase`; rows are filled once PLAN.md files exist. `/gsd-validate-phase` reconciles this table against the plans.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending_ | — | — | PLAT-02 | — | — | — | — | ❌ W0 | ⬜ pending |
| _pending_ | — | — | PLAT-03 | — | — | — | — | ❌ W0 | ⬜ pending |
| _pending_ | — | — | PLAT-04 | — | — | — | — | ❌ W0 | ⬜ pending |
| _pending_ | — | — | PLAT-07 | — | — | — | — | ❌ W0 | ⬜ pending |
| _pending_ | — | — | PLAT-08 | — | — | — | — | ❌ W0 | ⬜ pending |
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
- [ ] Measure and record quick/full suite runtimes to fill the `{N} seconds` fields above

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
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
