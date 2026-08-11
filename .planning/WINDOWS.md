---
schema_version: 1
open_count: 7
waived_count: 0
fixed_count: 0
total_count: 7
last_updated: 2026-08-11T10:49:29.936Z
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
| 4 | 01 | unrun-verify | apps/mobile/app/(tabs)/_layout.tsx |  | Native tab chrome on iOS and Android never rendered: no simulator or device available in the execution worktree. NativeTabs layout verified only by typecheck and by expo export route registration. | open |  | 2026-08-11T10:49:12.759Z |  |
| 5 | 01 | unrun-verify | apps/mobile/app/(tabs)/_layout.tsx |  | Maximum OS accessibility font scale on iOS and Android not exercised (no device). Wrap-and-grow rule R1 verified only on web, by shrinking the viewport to 380px: the tab bar grew 56px to 128px with no label clipped. | open |  | 2026-08-11T10:49:17.780Z |  |
| 6 | 01 | unrun-verify | apps/mobile/app/(tabs)/profile.tsx |  | PLAT-01 three-platform parity only one third proven: sign-in, five-tab navigation, appearance switching and sign-out were driven end to end in a desktop browser against a live API, but never on iOS or Android. | open |  | 2026-08-11T10:49:23.605Z |  |
| 7 | 01 | deviation | apps/mobile/lib/theme.ts |  | Plan 01-02's applyAppearance called react-native Appearance.setColorScheme directly, which does not exist in react-native-web and threw at root-layout mount, rendering every web page blank. Fixed here (plan 01-07) out of scope because it blocked every web truth this plan asserts. | open |  | 2026-08-11T10:49:29.936Z |  |

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
    "file": "apps/mobile/app/(tabs)/_layout.tsx",
    "line": null,
    "description": "Native tab chrome on iOS and Android never rendered: no simulator or device available in the execution worktree. NativeTabs layout verified only by typecheck and by expo export route registration.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:49:12.759Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/app/(tabs)/_layout.tsx",
    "line": null,
    "description": "Maximum OS accessibility font scale on iOS and Android not exercised (no device). Wrap-and-grow rule R1 verified only on web, by shrinking the viewport to 380px: the tab bar grew 56px to 128px with no label clipped.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:49:17.780Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/app/(tabs)/profile.tsx",
    "line": null,
    "description": "PLAT-01 three-platform parity only one third proven: sign-in, five-tab navigation, appearance switching and sign-out were driven end to end in a desktop browser against a live API, but never on iOS or Android.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:49:23.605Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "01",
    "file": "apps/mobile/lib/theme.ts",
    "line": null,
    "description": "Plan 01-02's applyAppearance called react-native Appearance.setColorScheme directly, which does not exist in react-native-web and threw at root-layout mount, rendering every web page blank. Fixed here (plan 01-07) out of scope because it blocked every web truth this plan asserts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:49:29.936Z",
    "resolved_at": null
  }
]
````
