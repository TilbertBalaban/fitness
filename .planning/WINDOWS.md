---
schema_version: 1
open_count: 7
waived_count: 0
fixed_count: 0
total_count: 7
last_updated: 2026-08-11T10:31:21.540Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | apps/mobile/lib/sign-out.ts |  | Native sign-out's revocation attempt (apiFetch to /v1/auth/sign-out) does not attach the SecureStore-persisted session cookie, so the server has no credential to revoke on native; local state is still wiped unconditionally, satisfying D-01's local guarantee, but the server-side session row is not actually invalidated by this call today on native. | open |  | 2026-08-11T10:00:14.900Z |  |
| 2 | 01 | unrun-verify | apps/mobile/app/_layout.tsx |  | Plan 01-05 Task 2's <human-check> (airplane-mode cold start on iOS/Android simulators, offline web reload) was not run in this sandboxed worktree — no simulator/emulator/browser available. Automated verify (tsc, session-refresh.test.ts, expo export --platform web) all pass; the device-level confirmation is deferred to human UAT, consistent with 01-01's precedent for the three-platform pass. | open |  | 2026-08-11T10:00:33.136Z |  |
| 3 | 01 | stub | apps/api/src/mailer/smtp-mailer.adapter.ts |  | Mailpit dev path authored (docker-compose.dev.yml, smtp-mailer.adapter.ts, README) but not exercised against a live SMTP listener in this session -- Docker and the mailpit binary are both absent on this machine | open |  | 2026-08-11T10:04:44.716Z |  |
| 4 | 01 | unrun-verify | apps/mobile/app/(auth)/sign-in.tsx |  | Task 2 human-check unrun: sign-in states not exercised on iOS, Android, or a desktop browser (no simulator/device, no Playwright browsers installed) | open |  | 2026-08-11T10:31:09.514Z |  |
| 5 | 01 | unrun-verify | apps/mobile/app/(auth)/sign-up.tsx |  | Task 2 human-check unrun: sign-up per-field errors, duplicate-address banner link tappability, and shortest-viewport reachability not exercised on any of the three platforms | open |  | 2026-08-11T10:31:13.200Z |  |
| 6 | 01 | unrun-verify | apps/mobile/app/(auth)/forgot-password.tsx |  | Task 3 human-check partially unrun: Mailpit (port 1025) unreachable and Docker unavailable, so following the emailed reset link in a real browser was not done; the identical-response half is covered by password-reset.e2e-spec.ts | open |  | 2026-08-11T10:31:16.952Z |  |
| 7 | 01 | unrun-verify | apps/mobile/components/TextField.tsx |  | UI-SPEC E1/E2/E3 long-text backstops unverified: wrap-and-grow at maximum OS accessibility font scale is enforced structurally (no numberOfLines/ellipsizeMode/allowFontScaling anywhere) but never observed rendered | open |  | 2026-08-11T10:31:21.540Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "apps/mobile/lib/sign-out.ts",
    "line": null,
    "description": "Native sign-out's revocation attempt (apiFetch to /v1/auth/sign-out) does not attach the SecureStore-persisted session cookie, so the server has no credential to revoke on native; local state is still wiped unconditionally, satisfying D-01's local guarantee, but the server-side session row is not actually invalidated by this call today on native.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:00:14.900Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/app/_layout.tsx",
    "line": null,
    "description": "Plan 01-05 Task 2's <human-check> (airplane-mode cold start on iOS/Android simulators, offline web reload) was not run in this sandboxed worktree — no simulator/emulator/browser available. Automated verify (tsc, session-refresh.test.ts, expo export --platform web) all pass; the device-level confirmation is deferred to human UAT, consistent with 01-01's precedent for the three-platform pass.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:00:33.136Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "stub",
    "phase": "01",
    "file": "apps/api/src/mailer/smtp-mailer.adapter.ts",
    "line": null,
    "description": "Mailpit dev path authored (docker-compose.dev.yml, smtp-mailer.adapter.ts, README) but not exercised against a live SMTP listener in this session -- Docker and the mailpit binary are both absent on this machine",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:04:44.716Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/app/(auth)/sign-in.tsx",
    "line": null,
    "description": "Task 2 human-check unrun: sign-in states not exercised on iOS, Android, or a desktop browser (no simulator/device, no Playwright browsers installed)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:31:09.514Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/app/(auth)/sign-up.tsx",
    "line": null,
    "description": "Task 2 human-check unrun: sign-up per-field errors, duplicate-address banner link tappability, and shortest-viewport reachability not exercised on any of the three platforms",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:31:13.200Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/app/(auth)/forgot-password.tsx",
    "line": null,
    "description": "Task 3 human-check partially unrun: Mailpit (port 1025) unreachable and Docker unavailable, so following the emailed reset link in a real browser was not done; the identical-response half is covered by password-reset.e2e-spec.ts",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:31:16.952Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/components/TextField.tsx",
    "line": null,
    "description": "UI-SPEC E1/E2/E3 long-text backstops unverified: wrap-and-grow at maximum OS accessibility font scale is enforced structurally (no numberOfLines/ellipsizeMode/allowFontScaling anywhere) but never observed rendered",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:31:21.540Z",
    "resolved_at": null
  }
]
````
