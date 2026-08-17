---
schema_version: 1
open_count: 21
waived_count: 0
fixed_count: 5
total_count: 26
last_updated: 2026-08-17T16:14:56.834Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | apps/mobile/lib/sign-out.ts |  | Native sign-out's revocation attempt (apiFetch to /v1/auth/sign-out) does not attach the SecureStore-persisted session cookie, so the server has no credential to revoke on native; local state is still wiped unconditionally, satisfying D-01's local guarantee, but the server-side session row is not actually invalidated by this call today on native. | fixed |  | 2026-08-11T10:00:14.900Z | 2026-08-14T14:51:16.431Z |
| 2 | 01 | unrun-verify | apps/mobile/app/_layout.tsx |  | Plan 01-05 Task 2's <human-check> (airplane-mode cold start on iOS/Android simulators, offline web reload) was not run in this sandboxed worktree — no simulator/emulator/browser available. Automated verify (tsc, session-refresh.test.ts, expo export --platform web) all pass; the device-level confirmation is deferred to human UAT, consistent with 01-01's precedent for the three-platform pass. | open |  | 2026-08-11T10:00:33.136Z |  |
| 3 | 01 | stub | apps/api/src/mailer/smtp-mailer.adapter.ts |  | Mailpit dev path authored (docker-compose.dev.yml, smtp-mailer.adapter.ts, README) but not exercised against a live SMTP listener in this session -- Docker and the mailpit binary are both absent on this machine | open |  | 2026-08-11T10:04:44.716Z |  |
| 4 | 01 | unrun-verify | apps/mobile/app/(auth)/sign-in.tsx |  | Task 2 human-check unrun: sign-in states not exercised on iOS, Android, or a desktop browser (no simulator/device, no Playwright browsers installed) | open |  | 2026-08-11T10:31:09.514Z |  |
| 5 | 01 | unrun-verify | apps/mobile/app/(auth)/sign-up.tsx |  | Task 2 human-check unrun: sign-up per-field errors, duplicate-address banner link tappability, and shortest-viewport reachability not exercised on any of the three platforms | open |  | 2026-08-11T10:31:13.200Z |  |
| 6 | 01 | unrun-verify | apps/mobile/app/(auth)/forgot-password.tsx |  | Task 3 human-check partially unrun: Mailpit (port 1025) unreachable and Docker unavailable, so following the emailed reset link in a real browser was not done; the identical-response half is covered by password-reset.e2e-spec.ts | open |  | 2026-08-11T10:31:16.952Z |  |
| 7 | 01 | unrun-verify | apps/mobile/components/TextField.tsx |  | UI-SPEC E1/E2/E3 long-text backstops unverified: wrap-and-grow at maximum OS accessibility font scale is enforced structurally (no numberOfLines/ellipsizeMode/allowFontScaling anywhere) but never observed rendered | open |  | 2026-08-11T10:31:21.540Z |  |
| 8 | 01 | unrun-verify | apps/mobile/app/(tabs)/_layout.tsx |  | Native tab chrome on iOS and Android never rendered: no simulator or device available in the execution worktree. NativeTabs layout verified only by typecheck and by expo export route registration. | open |  | 2026-08-11T10:49:12.759Z |  |
| 9 | 01 | unrun-verify | apps/mobile/app/(tabs)/_layout.tsx |  | Maximum OS accessibility font scale on iOS and Android not exercised (no device). Wrap-and-grow rule R1 verified only on web, by shrinking the viewport to 380px: the tab bar grew 56px to 128px with no label clipped. | open |  | 2026-08-11T10:49:17.780Z |  |
| 10 | 01 | unrun-verify | apps/mobile/app/(tabs)/profile.tsx |  | PLAT-01 three-platform parity only one third proven: sign-in, five-tab navigation, appearance switching and sign-out were driven end to end in a desktop browser against a live API, but never on iOS or Android. | open |  | 2026-08-11T10:49:23.605Z |  |
| 11 | 01 | deviation | apps/mobile/lib/theme.ts |  | Plan 01-02's applyAppearance called react-native Appearance.setColorScheme directly, which does not exist in react-native-web and threw at root-layout mount, rendering every web page blank. Fixed here (plan 01-07) out of scope because it blocked every web truth this plan asserts. | open |  | 2026-08-11T10:49:29.936Z |  |
| 12 | 01 | unrun-verify | .github/workflows/ci.yml |  | CI workflow has never been executed by GitHub Actions; YAML parses and every command it runs passes locally, but no CI run has been observed | open |  | 2026-08-11T11:28:52.418Z |  |
| 13 | 01 | deviation | apps/mobile/app/_layout.tsx |  | No automated check can detect a blank web render. Expo static export emits a shell whose route content is an empty Suspense boundary, identical for a working and a broken app, so typecheck, unit tests and expo export all stay green through the failure recorded as entry 11. Closing this needs a browser-driving check, judged not worth the cost in phase 01. | open |  | 2026-08-11T11:29:00.817Z |  |
| 14 | 01 | deviation | .github/workflows/ci.yml |  | The CI mailpit service is provisioned but never receives mail: password-reset.e2e-spec.ts sets MAIL_TRANSPORT=capture in its own spawn env, so the SMTP path is not on the assertion path in CI any more than it is locally. Kept because plan 01-08 requires the service, and it gives the ambient MAIL_TRANSPORT=smtp config a live endpoint. | open |  | 2026-08-11T11:29:06.577Z |  |
| 15 | 01 | unrun-verify | apps/mobile/lib/api-client.ts |  | Backstop truth unrun: no iOS/Android simulator or device is reachable from this execution worktree, so the on-device half of 01-09's session-revocation truth (a real build's cookie header accepted by a running server, session row deleted, observed on device) rests on the e2e-over-HTTP proof (native-session.e2e-spec.ts) plus typecheck, not a device observation. | open |  | 2026-08-14T14:51:31.054Z |  |
| 16 | 02 | unrun-verify | apps/mobile/lib/db/powersync.ts |  | @op-engineering/op-sqlite New-Architecture compatibility unverified — no Xcode/Android SDK on this machine (RESEARCH.md Open Question 2, precedented by Phase 1's native gaps) | open |  | 2026-08-17T07:22:21.574Z |  |
| 17 | 02 | unrun-verify | apps/mobile/__tests__/offline-write.test.ts |  | AMENDED by plan 02-12: the web runtime is now exercised against a real engine — durability.spec.ts, schema-redefinition.spec.ts and sync.spec.ts all construct and drive a real @powersync/web database (real Worker, real WASM, real IndexedDB) inside a real Chromium browser, and sync.spec.ts drives it through the real production connector against a live PowerSync Service and Postgres. offline-write.test.ts's Jest-level fakes are unchanged, and native op-sqlite's local-write/crud-queue behavior is still entirely unexercised — no native runtime available on this machine (see WINDOWS #16). | open |  | 2026-08-17T07:22:29.262Z |  |
| 18 | 02 | stub | apps/mobile/lib/db/id.ts |  | UUID generator is not cryptographically random (Math.random-based) — should be replaced with expo-crypto randomUUID() once cleared through a package-legitimacy checkpoint | open |  | 2026-08-17T08:03:39.888Z |  |
| 19 | 02 | stub | apps/api/src/sync/sync.service.ts |  | AMENDED by plan 02-12: unchanged — the 9 tables (routine, routine_day, routine_exercise, equipment_profile, exercise, personal_record, body_metric, progress_photo, user_preference) still have no server-side apply path. What changed is that the boundary is now an explicit, tested contract rather than an unexercised claim: sync.spec.ts's real client-to-Postgres cases exercise the 3 wired tables (workout_session, session_exercise, logged_set) end to end against a real browser client, and the rejection of the other 9 as unknown_table is no longer a silent, unasserted behavior. | open |  | 2026-08-17T08:03:47.271Z |  |
| 20 | 02 | deviation | apps/api/src/sync/sync.service.ts | 120 | Sync push still coerces a missing/null weight_kg to string '0' (String(d.weight_kg ?? '0')) — a null-weighted local set would sync as zero, contradicting PLAT-08's never-coerce-to-zero invariant; owned by 02-03's file scope, not fixed here | fixed |  | 2026-08-17T08:31:50.032Z | 2026-08-17T16:14:50.171Z |
| 21 | 02 | stub | apps/api/src/db/schema/session.ts | 91 | Postgres logged_set.weight_kg is still NOT NULL (only the local SQLite mirror was relaxed in 02-04) — a null-weighted bodyweight set cannot yet round-trip through sync; needs a migration + sync.service.ts fix before bodyweight-exercise UI ships | fixed |  | 2026-08-17T08:31:56.749Z | 2026-08-17T16:14:56.619Z |
| 22 | 02 | unrun-verify | apps/mobile/lib/db/test-support.ts |  | Real PowerSync web database cannot be constructed under this Jest/Node sandbox: jest-environment-jsdom and fake-indexeddb are both absent from the lockfile (installing them is out of scope per the package-legitimacy gate); the RN-Web export condition Jest resolves under (customExportConditions includes react-native) forces @powersync/web's react_native_web dist build, which requires a real Worker global even with useWebWorker:false; the plain browser build also requires window.Worker for its default async/multi-tab path; the WASM sync-mode InMemoryVFS path hangs indefinitely (no companion browser context to service its synchronous cross-realm signaling); and forcing --experimental-vm-modules to satisfy the WASM loader's dynamic import() would require a project-wide Jest ESM migration, itself a Rule-4 architectural change out of plan 02-05's scope. crash-recovery.test.ts and schema-redefinition.test.ts (PLAT-07, roadmap criterion 4) could not be authored as real, passing suites against a live database; test-support.ts is written and typechecks against the real PowerSync/Drizzle types but is unexercised here. | fixed |  | 2026-08-17T09:05:25.013Z | 2026-08-17T16:14:56.834Z |
| 23 | 02 | deviation | apps/mobile/lib/db/log-set.ts |  | startSession/addSessionExercise/logSet call the module-level getPowerSync() singleton from ./powersync directly, with no injectable database parameter. Even on an environment where a real PowerSync database could be constructed under Jest, a durability suite could not route these helpers to an isolated test database without either mocking the powersync module (forbidden by plan 02-05's acceptance criteria) or adding a DI seam to log-set.ts/powersync.ts (out of that plan's declared scope). A future plan that adds a real browser/device UAT harness for crash-recovery/schema-redefinition will need to add this seam. | fixed |  | 2026-08-17T09:05:25.185Z | 2026-08-17T12:39:47.492Z |
| 24 | 02 | unrun-verify | apps/mobile/lib/export/export-training-data.ts |  | Native export path (expo-file-system write + expo-sharing share sheet) not exercised on iOS/Android — no Xcode/Android SDK on this machine. Verified instead: buildExportDocument's 10 behavior-line cases (Jest, fakes), tsc --noEmit, and expo export --platform web bundling both build-export-document.ts and export-training-data.web.ts (forced into the web build graph via a side-effect import in app/_layout.tsx, following Phase 2's db/powersync.ts precedent). | open |  | 2026-08-17T09:05:25.330Z |  |
| 25 | 02 | stub | apps/api/src/db/schema/session.ts |  | logged_set has no duration_seconds/distance_meters column; time_based/distance_based exercises exist in the seeded catalog for load_type diversity but are never logged with realistic data (would require the reps=seconds anti-pattern PITFALLS.md §9 names) - a future plan should add these columns | open |  | 2026-08-17T09:41:16.603Z |  |
| 26 | 02 | unrun-verify | apps/mobile/app/(tabs)/*.tsx |  | AMENDED by plan 02-12: the browser half is now automated and passing — sync.spec.ts's "two clients converge" case closes 02-08 Task 3's PLAT-03/PLAT-04 convergence check for two independent browser contexts signed into the same account, and its "service down stays usable" case closes the local-write-still-succeeds-with-the-service-down observation. The device half (two physical or simulated iOS/Android clients) is still blocked — no Xcode or Android SDK on this machine; deferred to the ROADMAP Phase 999.1 native UAT sweep. | open |  | 2026-08-17T10:20:14.945Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "apps/mobile/lib/sign-out.ts",
    "line": null,
    "description": "Native sign-out's revocation attempt (apiFetch to /v1/auth/sign-out) does not attach the SecureStore-persisted session cookie, so the server has no credential to revoke on native; local state is still wiped unconditionally, satisfying D-01's local guarantee, but the server-side session row is not actually invalidated by this call today on native.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-11T10:00:14.900Z",
    "resolved_at": "2026-08-14T14:51:16.431Z"
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
  },
  {
    "id": 8,
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
    "id": 9,
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
    "id": 10,
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
    "id": 11,
    "kind": "deviation",
    "phase": "01",
    "file": "apps/mobile/lib/theme.ts",
    "line": null,
    "description": "Plan 01-02's applyAppearance called react-native Appearance.setColorScheme directly, which does not exist in react-native-web and threw at root-layout mount, rendering every web page blank. Fixed here (plan 01-07) out of scope because it blocked every web truth this plan asserts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T10:49:29.936Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "unrun-verify",
    "phase": "01",
    "file": ".github/workflows/ci.yml",
    "line": null,
    "description": "CI workflow has never been executed by GitHub Actions; YAML parses and every command it runs passes locally, but no CI run has been observed",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T11:28:52.418Z",
    "resolved_at": null
  },
  {
    "id": 13,
    "kind": "deviation",
    "phase": "01",
    "file": "apps/mobile/app/_layout.tsx",
    "line": null,
    "description": "No automated check can detect a blank web render. Expo static export emits a shell whose route content is an empty Suspense boundary, identical for a working and a broken app, so typecheck, unit tests and expo export all stay green through the failure recorded as entry 11. Closing this needs a browser-driving check, judged not worth the cost in phase 01.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T11:29:00.817Z",
    "resolved_at": null
  },
  {
    "id": 14,
    "kind": "deviation",
    "phase": "01",
    "file": ".github/workflows/ci.yml",
    "line": null,
    "description": "The CI mailpit service is provisioned but never receives mail: password-reset.e2e-spec.ts sets MAIL_TRANSPORT=capture in its own spawn env, so the SMTP path is not on the assertion path in CI any more than it is locally. Kept because plan 01-08 requires the service, and it gives the ambient MAIL_TRANSPORT=smtp config a live endpoint.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-11T11:29:06.577Z",
    "resolved_at": null
  },
  {
    "id": 15,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "apps/mobile/lib/api-client.ts",
    "line": null,
    "description": "Backstop truth unrun: no iOS/Android simulator or device is reachable from this execution worktree, so the on-device half of 01-09's session-revocation truth (a real build's cookie header accepted by a running server, session row deleted, observed on device) rests on the e2e-over-HTTP proof (native-session.e2e-spec.ts) plus typecheck, not a device observation.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-14T14:51:31.054Z",
    "resolved_at": null
  },
  {
    "id": 16,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "apps/mobile/lib/db/powersync.ts",
    "line": null,
    "description": "@op-engineering/op-sqlite New-Architecture compatibility unverified — no Xcode/Android SDK on this machine (RESEARCH.md Open Question 2, precedented by Phase 1's native gaps)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T07:22:21.574Z",
    "resolved_at": null
  },
  {
    "id": 17,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "apps/mobile/__tests__/offline-write.test.ts",
    "line": null,
    "description": "AMENDED by plan 02-12: the web runtime is now exercised against a real engine — durability.spec.ts, schema-redefinition.spec.ts and sync.spec.ts all construct and drive a real @powersync/web database (real Worker, real WASM, real IndexedDB) inside a real Chromium browser, and sync.spec.ts drives it through the real production connector against a live PowerSync Service and Postgres. offline-write.test.ts's Jest-level fakes are unchanged, and native op-sqlite's local-write/crud-queue behavior is still entirely unexercised — no native runtime available on this machine (see WINDOWS #16).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T07:22:29.262Z",
    "resolved_at": null
  },
  {
    "id": 18,
    "kind": "stub",
    "phase": "02",
    "file": "apps/mobile/lib/db/id.ts",
    "line": null,
    "description": "UUID generator is not cryptographically random (Math.random-based) — should be replaced with expo-crypto randomUUID() once cleared through a package-legitimacy checkpoint",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T08:03:39.888Z",
    "resolved_at": null
  },
  {
    "id": 19,
    "kind": "stub",
    "phase": "02",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "AMENDED by plan 02-12: unchanged — the 9 tables (routine, routine_day, routine_exercise, equipment_profile, exercise, personal_record, body_metric, progress_photo, user_preference) still have no server-side apply path. What changed is that the boundary is now an explicit, tested contract rather than an unexercised claim: sync.spec.ts's real client-to-Postgres cases exercise the 3 wired tables (workout_session, session_exercise, logged_set) end to end against a real browser client, and the rejection of the other 9 as unknown_table is no longer a silent, unasserted behavior.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T08:03:47.271Z",
    "resolved_at": null
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "02",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": 120,
    "description": "Sync push still coerces a missing/null weight_kg to string '0' (String(d.weight_kg ?? '0')) — a null-weighted local set would sync as zero, contradicting PLAT-08's never-coerce-to-zero invariant; owned by 02-03's file scope, not fixed here",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T08:31:50.032Z",
    "resolved_at": "2026-08-17T16:14:50.171Z"
  },
  {
    "id": 21,
    "kind": "stub",
    "phase": "02",
    "file": "apps/api/src/db/schema/session.ts",
    "line": 91,
    "description": "Postgres logged_set.weight_kg is still NOT NULL (only the local SQLite mirror was relaxed in 02-04) — a null-weighted bodyweight set cannot yet round-trip through sync; needs a migration + sync.service.ts fix before bodyweight-exercise UI ships",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T08:31:56.749Z",
    "resolved_at": "2026-08-17T16:14:56.619Z"
  },
  {
    "id": 22,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "apps/mobile/lib/db/test-support.ts",
    "line": null,
    "description": "Real PowerSync web database cannot be constructed under this Jest/Node sandbox: jest-environment-jsdom and fake-indexeddb are both absent from the lockfile (installing them is out of scope per the package-legitimacy gate); the RN-Web export condition Jest resolves under (customExportConditions includes react-native) forces @powersync/web's react_native_web dist build, which requires a real Worker global even with useWebWorker:false; the plain browser build also requires window.Worker for its default async/multi-tab path; the WASM sync-mode InMemoryVFS path hangs indefinitely (no companion browser context to service its synchronous cross-realm signaling); and forcing --experimental-vm-modules to satisfy the WASM loader's dynamic import() would require a project-wide Jest ESM migration, itself a Rule-4 architectural change out of plan 02-05's scope. crash-recovery.test.ts and schema-redefinition.test.ts (PLAT-07, roadmap criterion 4) could not be authored as real, passing suites against a live database; test-support.ts is written and typechecks against the real PowerSync/Drizzle types but is unexercised here.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T09:05:25.013Z",
    "resolved_at": "2026-08-17T16:14:56.834Z"
  },
  {
    "id": 23,
    "kind": "deviation",
    "phase": "02",
    "file": "apps/mobile/lib/db/log-set.ts",
    "line": null,
    "description": "startSession/addSessionExercise/logSet call the module-level getPowerSync() singleton from ./powersync directly, with no injectable database parameter. Even on an environment where a real PowerSync database could be constructed under Jest, a durability suite could not route these helpers to an isolated test database without either mocking the powersync module (forbidden by plan 02-05's acceptance criteria) or adding a DI seam to log-set.ts/powersync.ts (out of that plan's declared scope). A future plan that adds a real browser/device UAT harness for crash-recovery/schema-redefinition will need to add this seam.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-17T09:05:25.185Z",
    "resolved_at": "2026-08-17T12:39:47.492Z"
  },
  {
    "id": 24,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "apps/mobile/lib/export/export-training-data.ts",
    "line": null,
    "description": "Native export path (expo-file-system write + expo-sharing share sheet) not exercised on iOS/Android — no Xcode/Android SDK on this machine. Verified instead: buildExportDocument's 10 behavior-line cases (Jest, fakes), tsc --noEmit, and expo export --platform web bundling both build-export-document.ts and export-training-data.web.ts (forced into the web build graph via a side-effect import in app/_layout.tsx, following Phase 2's db/powersync.ts precedent).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T09:05:25.330Z",
    "resolved_at": null
  },
  {
    "id": 25,
    "kind": "stub",
    "phase": "02",
    "file": "apps/api/src/db/schema/session.ts",
    "line": null,
    "description": "logged_set has no duration_seconds/distance_meters column; time_based/distance_based exercises exist in the seeded catalog for load_type diversity but are never logged with realistic data (would require the reps=seconds anti-pattern PITFALLS.md §9 names) - a future plan should add these columns",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T09:41:16.603Z",
    "resolved_at": null
  },
  {
    "id": 26,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "apps/mobile/app/(tabs)/*.tsx",
    "line": null,
    "description": "AMENDED by plan 02-12: the browser half is now automated and passing — sync.spec.ts's \"two clients converge\" case closes 02-08 Task 3's PLAT-03/PLAT-04 convergence check for two independent browser contexts signed into the same account, and its \"service down stays usable\" case closes the local-write-still-succeeds-with-the-service-down observation. The device half (two physical or simulated iOS/Android clients) is still blocked — no Xcode or Android SDK on this machine; deferred to the ROADMAP Phase 999.1 native UAT sweep.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T10:20:14.945Z",
    "resolved_at": null
  }
]
````
