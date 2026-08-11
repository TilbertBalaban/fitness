---
phase: 1
slug: cross-platform-foundation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (ships with Expo/RN default template; NestJS 11 defaults to Jest) |
| **Config file** | none — Wave 0 installs (`apps/api/test/jest-e2e.json`) |
| **Quick run command** | `turbo run test --filter=<changed-package>` |
| **Full suite command** | `turbo run test` |
| **Estimated runtime** | ~60 seconds (API e2e requires a live Postgres) |

---

## Sampling Rate

- **After every task commit:** Run `turbo run test --filter=<changed-package>`
- **After every plan wave:** Run `turbo run test`
- **Before `/gsd-verify-work`:** Full suite green **plus** the three-platform manual UAT pass for PLAT-01 / PLAT-09
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Seeded from RESEARCH.md `## Validation Architecture`. Task IDs are filled in by
> `/gsd-validate-phase` once PLAN.md files exist — plans have not been created yet.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PLAT-05 | TBD | Sign-up → sign-in → session round-trip succeeds; credentials never logged | integration | `pnpm --filter api test:e2e -- auth.e2e-spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-05 | TBD | Password reset token is single-use and expires | integration | `pnpm --filter api test:e2e -- password-reset.e2e-spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-06 | TBD | Transport failure (timeout/DNS/5xx) never clears the session — D-01/D-03 | unit | `pnpm --filter mobile test -- session-refresh.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-06 | TBD | Explicit sign-out and a server-confirmed 401/403 revoke both clear the session; nothing else does — D-03 | unit | `pnpm --filter mobile test -- session-refresh.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-06 | TBD | Cold start reads cached session without a network call — D-02 | unit | `pnpm --filter mobile test -- session-refresh.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-09 | — | Theme toggle changes appearance and persists across restart | unit | `pnpm --filter mobile test -- theme.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-01 | TBD | Request below minimum supported client version receives 426, not silent success or generic 404 | integration | `pnpm --filter api test:e2e -- version-guard.e2e-spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pnpm add -D jest supertest @nestjs/testing` — API side has no test framework yet (client-side Jest ships with Expo's template)
- [ ] `apps/api/test/jest-e2e.json` — no NestJS e2e config exists
- [ ] `apps/api/test/auth.e2e-spec.ts` — stubs for PLAT-05
- [ ] `apps/api/test/password-reset.e2e-spec.ts` — stubs for PLAT-05 / D-08
- [ ] `apps/api/test/version-guard.e2e-spec.ts` — stubs for success criterion 4
- [ ] `apps/mobile/lib/__tests__/session-refresh.test.ts` — stubs for PLAT-06 (D-01/D-02/D-03)
- [ ] `apps/mobile/lib/__tests__/theme.test.ts` — stubs for PLAT-09
- [ ] CI Postgres service container for the e2e job

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Same authenticated home screen renders on iOS, Android, and a desktop browser from one route tree | PLAT-01 | No practical automated cross-platform-render assertion at this phase; success criterion 1 is inherently a three-device observation | Sign in on an iOS simulator, an Android emulator, and a desktop browser with the same account. Confirm each lands on the same authenticated home screen and that web URLs are deep-linkable. |
| Password reset email is captured and the link completes the flow | PLAT-05 | Requires opening the Mailpit web UI and clicking a real link | Trigger reset, open `localhost:8025`, click the link, set a new password, sign in with it from the app. |
| Theme change is visually correct in light and dark | PLAT-09 | Visual judgement, not assertable | Toggle the theme control; confirm both appearances on native and web. |
| Session survives a multi-week gap | PLAT-06 | Real elapsed time cannot be automated in-suite | Sign in, put the device in airplane mode, cold-start the app. Confirm the authenticated UI renders immediately with no network wait and no sign-out. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
