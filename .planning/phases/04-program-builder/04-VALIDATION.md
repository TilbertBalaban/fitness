---
phase: 4
slug: program-builder
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `04-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (`jest-expo` preset) for mobile unit tests; Playwright for mobile e2e (`apps/mobile/e2e/*.spec.ts`); `apps/api` has no unit test script by design — every API test is end-to-end |
| **Config file** | `apps/mobile/jest.config.js` |
| **Quick run command** | `pnpm --filter mobile test -- <pattern>` |
| **Full suite command** | `pnpm test` (root, runs `turbo run test` across all workspaces) |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter mobile test -- <pattern>` (targeted Jest file for the touched module)
- **After every plan wave:** Run `pnpm test`; additionally run the e2e suite if the API sync apply-path changed
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | PROG-{XX} | T-4-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement → Test Map (from RESEARCH.md)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROG-01/02/03 | Create program, add/reorder/remove exercises, set targets; all persist locally and round-trip through the new sync apply-path | integration (API e2e) | new `apps/api/src/sync/__tests__/routine-sync.e2e-spec.ts`-style test pushing routine ops and asserting Postgres rows | ❌ W0 |
| PROG-04 | Cycle creation + per-cycle override resolution | unit | `pnpm --filter api test -- program` (new `packages/api-contracts` unit test for `resolveTarget`) | ❌ W0 |
| PROG-05/PROG-06 | Deload/time-off `kind` placement | unit | `kind` CHECK constraint rejects invalid values; `order_index` 0/max resolves as start/end | ❌ W0 |
| PROG-07 | Duplicate deep-copy produces fresh UUIDs, no shared FK with source | unit | `pnpm --filter mobile test -- duplicate-routine` | ❌ W0 |
| PROG-08 | Activation is idempotent per-device, offline-safe (single `active_routine_id`) | integration | two concurrent activate pushes from different devices converge to one winner without a jammed queue | ❌ W0 |
| PROG-09 | "Next up" resolves correctly, including the two D-20 edge cases | unit | `pnpm --filter mobile test -- next-up` covering deleted-day and time-off-cycle cases | ❌ W0 |
| PROG-10 | `progression_frozen` gates future writes; data must support the assertion | unit | frozen flag persists and is independently toggleable while `status` and `active_routine_id` are unaffected | ❌ W0 |
| PROG-11 | Editing a program never changes an already-logged session's snapshot | regression | extend existing `log-set` suite: log a session, edit the routine cycle override, assert `session_exercise` unchanged | ❌ W0 (extends existing file) |

---

## Wave 0 Requirements

- [ ] `apps/api/src/sync/__tests__/program-sync.e2e-spec.ts` — covers PROG-01/02/03/08 and the missing `TABLE_MAP` entries
- [ ] `packages/api-contracts/src/__tests__/program.test.ts` — covers `resolveTarget`, `CYCLE_KINDS`, `ROUTINE_STATUSES`
- [ ] `apps/mobile/lib/db/__tests__/duplicate-routine.test.ts` — covers PROG-07
- [ ] `apps/mobile/lib/__tests__/next-up.test.ts` — covers PROG-09 including both D-20 edge cases
- [ ] Extension to the existing `log-set` test file — covers PROG-11 with a cycle-override scenario

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {behavior} | PROG-{XX} | {reason} | {steps} |

*Populated during planning.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
