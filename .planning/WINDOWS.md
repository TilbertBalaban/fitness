---
schema_version: 1
open_count: 93
waived_count: 1
fixed_count: 14
total_count: 108
last_updated: 2026-08-24T09:05:51.583Z
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
| 27 | 02 | deviation | apps/api/src/sync/sync.service.ts |  | WR-01 (02-REVIEW.md): the single-known-root heal path retroactively poisons every op already grouped under a batch's one other resolvable root when an orphan (an op whose parent reference is entirely absent) heals into it, so one malformed payload takes a whole legitimate session's push down and the client retries the still-poisoned batch forever. poison-pill.e2e-spec.ts cannot reach this branch (it always uses two distinct session ids), and the shipped mobile client cannot produce such an op (log-set.ts always populates parent references). Not folded into 02-13's scope — a genuinely different concern (aggregate grouping, not the update set). | open |  | 2026-08-17T20:19:43.489Z |  |
| 28 | 02 | deviation | apps/api/src/sync/sync.service.ts |  | WR-02 (02-REVIEW.md): highestServerSeq is not rewound when an aggregate's transaction rolls back — Postgres sequence nextval() is non-transactional, so a value obtained inside a rolled-back transaction is real but was never attached to any row that actually committed, and SyncPushResponse.server_seq can report a value ahead of anything durably stored. Latent: no client code reads server_seq today. Not folded into 02-13's scope. | open |  | 2026-08-17T20:19:51.979Z |  |
| 29 | 02 | unrun-verify | .github/workflows/ci.yml |  | WR-03 (02-REVIEW.md): nothing in CI inspects the exported web bundle for the durability harness, so the dead-code-elimination claim (that DURABILITY_HARNESS_GLOBAL folds away and __fitnessDurability is Terser-eliminated when EXPO_PUBLIC_DURABILITY_HARNESS is unset) rests on code review alone. Worth closing with a mechanical grep-the-exported-bundle CI step, given this round's own framing of harness-in-production as the highest-severity risk class in its diff. Not folded into 02-13's scope — needs a CI job change plus a web export, entirely in apps/mobile / .github. | open |  | 2026-08-17T20:19:59.847Z |  |
| 30 | 02 | stub | apps/mobile/lib/db/test-support.ts |  | WR-04 (02-REVIEW.md): DURABILITY_HARNESS_ENABLED is exported from test-support.ts with zero importers anywhere in apps/mobile (confirmed via repo-wide grep) — __durability.web.tsx re-derives the same check inline instead, per its own comment explaining why. Trivially cheap (one line, zero importers) but deliberately left out of 02-13's scope: taking it would pull apps/mobile into this plan's file scope and drag the mobile typecheck and the Playwright durability project into a verification set that is otherwise pure API e2e. One line whenever a mobile-touching plan next runs. | open |  | 2026-08-17T20:20:06.941Z |  |
| 31 | 02 | deviation | apps/api/src/sync/sync.service.ts |  | The session_exercise PATCH constraint: isInvalidSessionExercise requires a non-empty exercise_id on every non-DELETE op, including a PATCH, so a genuinely narrow {order_index}-only PATCH to session_exercise is rejected invalid_field today. Not relaxed by 02-13, for a load-bearing reason: 02-13's patchAwareSet guard filters only the onConflictDoUpdate set: clause, never the insert .values() clause, so d.exercise_id ?? '' still reaches the database whenever a PATCH upserts an id the server has not seen — exactly the empty-string-FK case this validator was written to block (CR-04). Relaxing it needs its own decision about PATCH-as-insert semantics; whichever phase ships a reorder-exercises feature should read this before rediscovering the constraint. | open |  | 2026-08-17T20:20:14.680Z |  |
| 32 | 03 | unmet-truth | apps/mobile/lib/catalog/load-snapshot.ts |  | Seeded exercise rows are written into the shared, PowerSync-synced exercise table (not a localOnly table), so a full catalog load is expected to generate real ps_crud entries despite user_id being null -- PowerSync installs CRUD triggers per-table, not per-row. The zero-sync-traffic must_haves truth holds only for muscle_group/exercise_muscle_mapping/catalog_meta, not for the seeded exercise rows themselves. | fixed |  | 2026-08-18T09:28:36.379Z | 2026-08-18T10:14:26.259Z |
| 33 | 03 | unrun-verify | apps/mobile/lib/db/test-support.ts |  | loadCatalogSnapshot's zero-ps_crud claim for muscle_group/exercise_muscle_mapping/catalog_meta is proven only against a Jest mock that faithfully models PowerSync's documented per-table trigger installation, not against a real PowerSync engine -- new PowerSyncDatabase() from @powersync/web hangs indefinitely under this project's Jest (Node) environment (confirmed by a timed spike, killed after 60s+), matching WINDOWS #22's prior finding. The real-engine confirmation needs a Playwright e2e case (real browser, real Worker/IndexedDB) alongside the existing durability harness. | fixed |  | 2026-08-18T09:28:44.482Z | 2026-08-19T10:02:13.586Z |
| 34 | 03 | unrun-verify | apps/mobile/app/exercises/index.tsx |  | The offline first-boot flow (fresh install, no network, open /exercises, see 3 seeded exercises, open one, see target muscles) and the error-state UI ('Exercise catalog couldn't load') were verified only by typecheck, unit tests and expo export --platform web bundling -- not observed rendered in a browser, simulator or device. No Xcode/Android SDK on this machine; no Playwright browsers installed in this worktree, consistent with prior phases' native/browser gaps (WINDOWS #4, #8, #26). | open |  | 2026-08-18T09:28:46.987Z |  |
| 35 | 03 | unmet-truth | docs/catalog-dataset-license.md |  | Task 1's fedb-with-images decision was accepted against the characterization 'an open, unanswered upstream GitHub issue' on image licensing. Direct re-verification (03-04, 2026-08-18) found this stale: yuhonas/free-exercise-db issues #2 and #12 are both closed/answered -- the maintainer disclaims knowledge of image provenance, and the upstream wrkout/exercises.json CONTRIBUTING.md explicitly states images were scraped from the internet, copyright is not owned, and advises against commercial use. image_urls now points at live raw.githubusercontent.com URLs (not yet vendored/bundled -- that is 03-05's job). This corrected, more concrete risk should be reweighed before /gsd-ship; see docs/catalog-dataset-license.md's 'Image licensing: corrected finding' section. | open |  | 2026-08-18T10:50:22.424Z |  |
| 36 | 03 | stub | apps/mobile/components/ExerciseImageTile.tsx |  | AMENDED by plan 03-07: the wiring is now done -- ExerciseImageTile gained an additive `localSource` prop, catalog-image-map.generated.ts provides 1740 static requires keyed by exercise id, and app/exercises/[id].tsx renders through it. Left `open`, not `fixed`: this only has bundler-level proof (all 1740 requires resolve, all 1740 jpgs land in `expo export --platform web`'s dist/, 97MB) -- no browser/simulator/device observed an image actually paint on screen (see WINDOWS #37). | open |  | 2026-08-18T12:30:40.757Z |  |
| 37 | 03 | unrun-verify | apps/mobile/app/exercises/index.tsx |  | FlashList rendering/scrolling all ~870 seeded rows without dropped frames (03-06's held-out performance backstop truth) was not observed on device or in a real browser -- no simulator/device, no Playwright browsers installed in this worktree. Verified instead: typecheck, 178/178 jest tests, and expo export --platform web bundling FlashList and the new screen for the web target. | open |  | 2026-08-18T18:52:43.762Z |  |
| 38 | 03 | unrun-verify | apps/mobile/app/exercises/index.tsx |  | The catalog-load-failure error state ('Exercise catalog couldn't load') is wired through loadCatalogSnapshot's already-tested invalid-shape path, but this screen's own rendering of that path was not observed in a rendered tree -- @testing-library/react-native is not installed in this codebase, so 03-06's component-level assertions were extracted into pure, unit-tested helpers (deriveExerciseListScreenState et al.) in catalog-filter.ts per the plan's own instruction, rather than rendered. | open |  | 2026-08-18T18:52:43.887Z |  |
| 39 | 03 | unrun-verify | apps/mobile/app/exercises/[id].tsx |  | The vendored local catalog images (1740 files, 03-05) are now wired through catalog-image-map.generated.ts + ExerciseImageTile's localSource prop -- bundler-level proof confirms all 1740 requires resolve and are included in the web export (find dist -iname '*.jpg' \| wc -l == 1740, 97MB). Actual visual rendering (a real image painting on the exercise detail screen) is unverified: Playwright Chromium is present on this machine (contradicting WINDOWS #34's prior claim) but CLAUDE.md's global 'never launch a browser unless explicitly asked' rule takes precedence over verifying this here; no Xcode/Android SDK either (WINDOWS #16). | open |  | 2026-08-18T18:51:58.018Z |  |
| 40 | 03 | stub | apps/mobile/lib/db/schema.ts |  | exercise_muscle_mapping is registered localOnly table-wide (WINDOWS #32's mechanism), so every custom exercise's muscle-mapping rows -- not just a duplicate's copied ones -- never sync to a second device; a future per-user-mapping-sync plan needs to design around this before EXER-04/05's mappings are considered cross-device-durable | open |  | 2026-08-18T19:29:31.308Z |  |
| 41 | 03 | unrun-verify | apps/mobile/app/exercises/new.tsx |  | The rendered create and edit forms (blank-on-open placeholder, inline per-field errors, Save disabled-and-never-hidden, multiline auto-grow/scroll, muscle-mapping chip picker, ownership-gated not-permitted state) were never observed in a browser, simulator or device -- no @testing-library/react-native in this codebase's lockfile, no simulator/device on this machine, and CLAUDE.md forbids launching a browser unless explicitly asked. Verified instead: typecheck, expo export --platform web bundling both routes, and 33 unit tests over every extracted presentational decision. | open |  | 2026-08-18T19:29:38.608Z |  |
| 45 | 03 | unrun-verify | apps/mobile/app/exercises/[id].tsx |  | duplicateExercise is imported from lib/catalog/custom-exercise (owned by 03-08, running concurrently in a separate worktree this wave, not present in 03-09's worktree). pnpm --filter mobile test all pass (219/219, incl. a virtual-mocked duplicateExercise), and pnpm --filter mobile typecheck / build each fail with exactly one error -- Cannot find module '../../lib/catalog/custom-exercise' -- confirmed to be the only error either command produces. Needs re-running after 03-08 and 03-09 merge to confirm the two plans' work integrates cleanly (signature match: duplicateExercise(db, userId, sourceId) => Promise<string>, per 03-08-PLAN.md). | fixed |  | 2026-08-18T19:20:00.883Z | 2026-08-18T20:24:16.512Z |
| 46 | 03 | unrun-verify | apps/mobile/components/SwapSuggestionList.tsx |  | Smart-swap suggestion rows (thumbnail, name, why string, empty state, Browse Catalog link) were never observed in a real browser, simulator or device -- no simulator/device on this machine, and CLAUDE.md forbids launching a browser unless explicitly asked. Verified instead: 20 scorer unit tests, 7 direct-invocation component tests, typecheck, and expo export --platform web bundling the route cleanly. | open |  | 2026-08-18T20:24:39.731Z |  |
| 47 | 03 | unrun-verify | apps/api |  | This plan's phase-level <verification> block names 'pnpm --filter api test:e2e exits 0 -- nothing in this plan touches the server' as a check, but the suite was not re-run in this session (no server files in this plan's scope; api/.env is permission-restricted from this worktree's sandbox). Confidence it is unaffected rests on file-scope reasoning (zero server files touched: smart-swap.ts, SwapSuggestionList.tsx and the [id].tsx edit are all client-only), not a fresh green run. | fixed |  | 2026-08-18T20:24:50.324Z | 2026-08-18T20:42:11.576Z |
| 48 | 03 | unrun-verify | apps/api/test/cors.e2e-spec.ts |  | Plan 03-11's cors.e2e-spec.ts (Task 1 RED/GREEN proof and Task 3's full behavior suite) was not run in this session. pnpm test:e2e runs drizzle-kit push first, which needs DATABASE_URL from apps/api/.env or the workspace-root .env -- neither exists in this worktree (.env is gitignored and not copied into git worktrees) and both read and write access to any .env path is blocked by a hard sandbox deny-rule, confirmed by drizzle-kit push failing with 'Either connection url or host, database are required for PostgreSQL database connection' after injecting 0 vars from .env,../../.env. This is the same class of block recorded at WINDOWS #47. Verified instead: pnpm --filter api typecheck (clean, src/), npx tsc --noEmit -p test/tsconfig.json (clean, test/ including cors.e2e-spec.ts), grep -rl 'env.WEB_ORIGINS' apps/api/src prints exactly one path (web-origins.ts), and no package.json changed across the plan's 3 commits. The RED-before-GREEN failure and the Task 3 ordering check (moving enableCors after minClientVersionMiddleware turning the 426 case red) rest on the diagnosis_already_done block's verified facts about cors@2.8.6 and enableCors's registration-order semantics, not a live observation. | fixed |  | 2026-08-19T08:38:20.587Z | 2026-08-19T08:50:18.338Z |
| 49 | 03 | unrun-verify | apps/mobile/app/exercises/_layout.tsx |  | R4: the segment header, its title and the back control actually painting on /exercises/seed_90_90_Hamstring is unobserved; gates prove the layout file exists, declares the anchor, supplies a function-valued headerLeft, and bundles, not pixels | open |  | 2026-08-19T15:34:15.740Z |  |
| 50 | 03 | unrun-verify | apps/mobile/lib/navigation/back.ts |  | R5: goBackOrReplace's no-previous-entry branch is proven against a fake router in back.test.ts, not against react-navigation's real canGoBack predicate on a refreshed detail URL | open |  | 2026-08-19T15:34:20.470Z |  |
| 51 | 03 | unrun-verify | apps/mobile/app/exercises/_layout.tsx |  | R6 (security-relevant): that exercises/[id], exercises/new and exercises/edit/[id] no longer mount signed-out follows deterministically from expo-router's hoisting and screen-matching rules once the segment layout exists, but this has not been observed in a browser. Must be verified before Phase 03 sign-off. | open |  | 2026-08-19T15:34:24.022Z |  |
| 52 | 03 | unrun-verify | apps/mobile/app/exercises/_layout.tsx |  | R7: native swipe-back on iOS/Android unverified — no Xcode or Android SDK on this machine; per project convention native verification is swept once at ROADMAP Phase 999.1 | open |  | 2026-08-19T15:34:27.450Z |  |
| 53 | 03 | deviation | apps/mobile/app/exercises/_layout.tsx |  | Security fix (T-03-58): app/exercises/_layout.tsx collapses the four hoisted exercises routes into one guarded segment route, so the root layout's existing signed-in Stack.Protected guard on Stack.Screen name=exercises now covers exercises/[id], exercises/new and exercises/edit/[id] as well as the list — previously only the list route was in the protected-screen set and the other three mounted regardless of session state | open |  | 2026-08-19T15:34:33.185Z |  |
| 54 | 4 | unrun-verify | apps/mobile/app/(tabs)/programs.tsx |  | Programs tab (create + list draft programs) has been exercised on neither iOS nor Android — no Xcode, no Android SDK on this machine; native observation deferred to ROADMAP Phase 999.1 | open |  | 2026-08-20T15:38:02.214Z |  |
| 55 | 04 | deviation | apps/mobile/lib/db/programs/days.ts |  | Two-device offline-reorder convergence for order_index (gap scheme) is reasoned from the gap arithmetic and row-level-LWW model, not observed — one device available, no second runtime in this worktree | open |  | 2026-08-20T17:03:04.520Z |  |
| 56 | 04 | unrun-verify | apps/mobile/components/ExercisePickerModal.tsx |  | The full-screen exercise picker's presentation, search/filter interaction and multi-select behavior have been observed on neither iOS nor Android (no Xcode/Android SDK on this machine) — verified only via unit tests and the web build. Deferred to ROADMAP Phase 999.1. | open |  | 2026-08-21T07:35:54.475Z |  |
| 57 | 04 | unrun-verify | apps/mobile/components/ExerciseSlotRow.tsx |  | The inline-expand animation and the numeric stepper's tap/hold behaviour (including rep-range pairing at the UI layer) have been observed on neither iOS nor Android — verified only via unit tests and the web build. Deferred to ROADMAP Phase 999.1. | open |  | 2026-08-21T07:35:54.608Z |  |
| 58 | 04 | deviation | apps/api/src/db/schema/preference.ts |  | user_preference's primary key changed from user_id alone to a TEXT id column deterministically equal to user_id (option-a at plan 04-04's opening checkpoint, resolved by the orchestrator after verifying the user_exercise_preference precedent and the shipped conflict-policy.spec.ts assumption). A one-way primary-key migration on a table PowerSync already syncs; the live table was confirmed empty before the push. user_id also carries a unique constraint so the one-row-per-user singleton holds independently of the id contract. | open |  | 2026-08-21T07:35:54.767Z |  |
| 59 | 04 | unrun-verify | apps/api/src/sync/sync.service.ts |  | Two devices activating different programs while offline converge, once both pushes land, to exactly one active program (T-04-20 backstop). Structurally reasoned from D-14's single-nullable-column LWW shape and partially exercised by the single-device 'second PUT overwrites, exactly one row remains' e2e case; the genuine two-device race is unrun — no second device or runtime available here. | open |  | 2026-08-21T07:35:54.898Z |  |
| 60 | 04 | unrun-verify | ops/powersync/sync-rules.yaml |  | PowerSync Service not restarted against the updated sync rules here, so pull-side delivery of routine_cycle rows is asserted only by the query's shape matching the shipped, already-verified routine_day query, not by an observed stream. Standing limitation inherited from 04-01/04-02/04-04. | open |  | 2026-08-21T10:32:23.609Z |  |
| 61 | 04 | deviation | apps/api/src/sync/sync.service.ts |  | T-04-32 handoff: a routine_cycle DELETE's future routine_exercise_cycle_target children (table created in 04-07) are not yet covered by child-tombstone gathering. 04-07 MUST extend the routine_day DELETE branch to also tombstone cascaded routine_exercise_cycle_target rows, or a deleted override resurrects on the next pull. | fixed |  | 2026-08-21T10:32:23.795Z | 2026-08-21T15:25:40.229Z |
| 62 | 04 | unrun-verify | apps/mobile/components/DayDeck.tsx |  | Day-deck horizontal swipe observed on neither iOS nor Android (no Xcode/Android SDK) and not driven in a browser (CLAUDE.md forbids browser testing without an explicit request) — verified only via DayDeck.test.tsx (8 cases) and the web build. Deferred to ROADMAP Phase 999.1. | open |  | 2026-08-21T10:32:23.952Z |  |
| 63 | 04 | unrun-verify | apps/mobile/components/DragHandle.tsx |  | Native drag gesture (Gesture.Pan, direction-locked against the deck swipe) observed on neither iOS nor Android — verified only via DragHandle.test.tsx (hook-free view only), typecheck and the web build. Deferred to ROADMAP Phase 999.1. | open |  | 2026-08-21T10:32:24.083Z |  |
| 64 | 04 | unrun-verify | apps/mobile/components/DragHandle.web.tsx |  | Web pointer-events drag not driven in a browser. Additionally, which of DragHandle.tsx / DragHandle.web.tsx Metro resolves into the web bundle at runtime was NOT conclusively confirmed — the working precedent of the same convention for _layout.web.tsx / reset-password.web.tsx is the strongest available evidence, not direct verification of this pair. | open |  | 2026-08-21T10:32:24.206Z |  |
| 65 | 04 | deviation | apps/mobile/babel.config.js |  | The react-native-worklets/plugin Babel plugin's runtime behaviour on a native build (whether the worklet genuinely runs on the UI thread on-device) is unobservable here — presence and correctness confirmed only against a succeeding web export and the package's compatibility metadata. | open |  | 2026-08-21T10:32:24.333Z |  |
| 66 | 04 | deviation | apps/mobile/package.json |  | react-native-worklets and react-native-pager-view are peerDependencies of reanimated and tab-view respectively but were left TRANSITIVE-ONLY rather than added as direct dependencies, despite the approved package-legitimacy decision covering all five as direct. babel.config.js references react-native-worklets/plugin, which resolves today only via pnpm hoisting; a stricter hoisting setting would break the build. worklets is additionally pinned to 0.10.4 by a pnpm-workspace override because Expo-pinned reanimated 4.5.1 narrows its peer to exactly 0.10.x while transitive resolution gave 0.11.3, which throws at Reanimated module init on every platform. | fixed |  | 2026-08-21T10:32:24.455Z | 2026-08-21T15:25:40.316Z |
| 67 | 04 | unrun-verify | ops/powersync/sync-rules.yaml |  | PowerSync Service not restarted against the updated sync rules here, so pull-side delivery of routine_exercise_cycle_target rows is asserted only by the query's shape matching the shipped, already-verified routine_exercise/routine_cycle queries (identical JOIN/filter structure and auth.user_id() filter), not by an observed stream. Standing limitation inherited from 04-01/04-02/04-04/04-06. | open |  | 2026-08-21T15:25:47.676Z |  |
| 68 | 04 | unrun-verify | apps/mobile/components/CycleStrip.tsx |  | The pinned cycle strip and its three chip tones (training / dashed-border deload / reduced-opacity time off) are asserted structurally in Jest but rendered on neither iOS nor Android. No Xcode, no Android SDK on this machine. Deferred to ROADMAP Phase 999.1. | open |  | 2026-08-21T15:49:05.323Z |  |
| 69 | 04 | unrun-verify | apps/mobile/app/(tabs)/programs.tsx |  | 'Switching cycles keeps the day you were on' is verified structurally only (DayDeck owns its page index and receives no index prop). The interaction itself has been observed on no platform — not native (no toolchain) and not in a browser (out of scope per CLAUDE.md). | open |  | 2026-08-21T15:49:05.441Z |  |
| 70 | 04 | unrun-verify | apps/mobile/components/ExerciseSlotRow.tsx |  | The per-cycle override marker's rendered legibility beside a stepper label at large OS font scales is untested — no renderer, no device. Only its presence, count and per-field identity are asserted. | open |  | 2026-08-21T15:49:05.524Z |  |
| 71 | 04 | deviation | apps/mobile/lib/db/programs/days.ts |  | computeReorder/SiblingRow promoted from private to exported so moveCycle reuses the reorder arithmetic rather than becoming its third copy. One file beyond 04-08's declared files_modified; two lines changed, no behaviour change. | open |  | 2026-08-21T15:49:05.607Z |  |
| 72 | 04 | deviation | apps/mobile/components/ExerciseSlotRow.tsx |  | The per-cycle override marker ('· this cycle') and the cycle strip's inline 'Edit Cycle' control are executor design calls on points 04-UI-SPEC.md leaves open. Surfaced to the user post-merge per the standing 'UI/UX decisions always surface' rule. Both bounded and reversible. | waived | User reviewed both design calls directly on 2026-08-21 and confirmed the shipped treatment for each: the '· this cycle' text suffix beside overridden stepper labels, and the inline 'Edit Cycle' control visible only while a cycle is selected. Both promoted into 04-UI-SPEC.md so later plans inherit them rather than re-deciding. | 2026-08-21T15:49:05.690Z | 2026-08-21T15:50:48.657Z |
| 73 | 04 | deviation | packages/api-contracts/package.json |  | A fresh git worktree cannot run the mobile suite until 'pnpm --filter @fitness/api-contracts build' is run, because the package's main points at a gitignored dist/. Every worktree-isolated executor importing this package hits it (14 of 35 mobile suites fail with Cannot find module '@fitness/api-contracts'). Worth a prepare hook or a source-entry exports map. | open |  | 2026-08-21T15:49:05.772Z |  |
| 74 | 04 | unrun-verify | apps/mobile/lib/db/log-set.ts |  | The cycle-resolved session snapshot was never observed on a real device or in a browser. No UI calls addSessionExercise yet, this machine has neither Xcode nor an Android SDK, and browser testing is forbidden by CLAUDE.md unless explicitly requested. Correctness rests on the 23-case jest suite plus tsc. The api test:e2e suite that IS green is server-side against live Postgres, covering only the Postgres half. | open |  | 2026-08-21T15:49:05.855Z |  |
| 75 | 04 | unrun-verify | apps/mobile/lib/db/__tests__/log-set.test.ts |  | The PROG-11 client regression runs against a hand-built in-memory store, not PowerSync's real local SQLite. The store mirrors the local schema's routine_day -> routine_exercise -> routine_exercise_cycle_target delete cascade by hand; if PowerSync's local schema ever stops cascading (or diverges from Postgres), the day-delete case would keep passing against a store that no longer matches reality. The Postgres half IS asserted against a live database in apps/api/test/program-sync.e2e-spec.ts. | open |  | 2026-08-21T15:49:05.936Z |  |
| 76 | 04 | unrun-verify | apps/mobile/app/(tabs)/index.tsx |  | The Home Next Up card has been observed on neither iOS nor Android; no Xcode and no Android SDK on this machine. Native rendering of the card, its chip row and its wrap-and-grow behaviour at large OS font scales rests on typecheck plus correct API usage. Deferred to ROADMAP Phase 999.1. | open |  | 2026-08-22T13:45:22.936Z |  |
| 77 | 04 | unrun-verify | apps/mobile/app/(tabs)/index.tsx |  | The Home card has also not been observed in a browser. CLAUDE.md forbids launching a browser or driving the app unless the user explicitly asks, so the web target's actual appearance (chip wrapping, skeleton, opacity-60 time-off treatment) is unverified visually; only the 'expo export --platform web' build is proven. | open |  | 2026-08-22T13:45:23.269Z |  |
| 78 | 04 | deviation | apps/mobile/lib/programs/next-up.ts |  | Adopted assumption (RESEARCH A5): a deload cycle is trained and consumes a full rotation of days exactly like a training cycle. If a later phase decides a deload pauses rotation tracking, cycleSpan is the single place to change. | open |  | 2026-08-22T13:45:23.570Z |  |
| 79 | 04 | deviation | apps/mobile/lib/programs/next-up.ts |  | Adopted resolution (RESEARCH Pitfall 5a): a completed session logged against a since-deleted day stops counting toward rotation position, so deleting a day rewinds which cycle the lifter is in. The rejected alternative (keeping it countable) makes the answer depend on which day was deleted. | open |  | 2026-08-22T13:45:23.769Z |  |
| 80 | 04 | deviation | apps/mobile/lib/programs/next-up.ts |  | 04-UI-SPEC overrides 04-10-PLAN's must-have truth on the deleted-day case: when the most recently logged day has been deleted, the next day resolves silently to the first day of the current cycle, never to a rewound index and never to a visible error. The plan text explicitly rejected this; the user-reviewed UI-SPEC mandates it and takes precedence. | open |  | 2026-08-22T13:45:23.975Z |  |
| 81 | 04 | deviation | apps/mobile/lib/programs/next-up.ts |  | Consecutive time-off cycles chain (each elapsed cycle consumes its own duration_days from the elapsed count before the next is considered), so a 3-day and a 5-day time-off cycle back to back are 8 days off. Neither CONTEXT.md nor the UI-SPEC specifies this; the alternative (each measuring independently from the last session) makes the pair 5 days. | open |  | 2026-08-22T13:45:24.180Z |  |
| 82 | 04 | stub | apps/mobile/lib/programs/next-up.ts |  | skippedTimeOffCycleIds is computed and returned but nothing renders it. A time-off cycle synced with a null duration_days is silently walked past. Surfacing it needs a Home-card state the UI-SPEC does not define. | fixed |  | 2026-08-22T13:45:24.415Z | 2026-08-23T10:37:33.195Z |
| 83 | 04 | todo | apps/mobile/lib/db/programs/next-up-query.ts |  | loadNextUp issues 12 selects; 2 of them are loadExerciseNameMap's seeded/custom reads, which the Home screen could hoist and pass in as a cached name map to bring the count to 10. | open |  | 2026-08-22T13:45:24.660Z |  |
| 84 | 04 | deviation | apps/mobile/lib/programs/__tests__/next-up.test.ts |  | All three 04-10 tasks were written test-first but committed as single feat commits; no separate RED-phase test(...) commit exists, so the TDD gate sequence is not auditable from git history. | open |  | 2026-08-22T13:45:24.937Z |  |
| 85 | 04 | unrun-verify | apps/mobile/app/programs/library.tsx |  | The program library, the New Program fork and the freeze switch have been observed on neither iOS nor Android; no Xcode and no Android SDK. Web observation also not performed (CLAUDE.md forbids launching a browser unless explicitly asked). Correctness rests on unit tests, typecheck and a successful web export. | open |  | 2026-08-22T13:45:25.255Z |  |
| 86 | 04 | deviation | apps/mobile/app/programs/_layout.tsx |  | Security-relevant: authorization for every /programs/* route comes from the root layout's single protected 'programs' registration, not from anything inside the segment. Mirrors the T-03-58 entry recorded for /exercises. Deleting _layout.tsx silently hoists both routes out of the guard — the route-guard suite's Case B is the tripwire. | open |  | 2026-08-22T13:45:25.474Z |  |
| 87 | 04 | deviation | apps/mobile/app/programs/library.tsx |  | The UI-SPEC's 'Delete Draft' action is NOT shipped. The server's HARD_DELETE_FORBIDDEN (apps/api/src/sync/sync.service.ts) rejects every routine DELETE with no draft/never-logged nuance, so a client delete would emit an op the server rejects and the row would resurrect on next sync. Archive is offered for every program instead. Needs a server-side carve-out (allow routine DELETE when no workout_session.routine_day_id references any of its days) before the UI can offer it. | open |  | 2026-08-22T13:45:25.803Z |  |
| 88 | 04 | deviation | apps/mobile/lib/db/programs/duplicate-routine.ts |  | duplicateRoutine writes supersetGroupId, progressionSchemeId and notes as null rather than copying them, because loadProgramTree's ProgramSlot does not carry them. Harmless today (all three are always null — addExercisesToDay is their only writer and hardcodes them), but the moment any phase makes one writable this becomes silent data loss on duplication. The fix is to widen ProgramSlot so every tree consumer sees them, not to add a second read here. | open |  | 2026-08-22T13:45:26.811Z |  |
| 89 | 04 | stub | apps/mobile/lib/db/programs/lifecycle.ts |  | markRoutineReady is implemented and tested but has no UI call site: the UI-SPEC's action sheet enumerates four actions and does not include a draft->ready transition, so nothing in the shipped app can move a routine out of 'draft'. Needs either a UI affordance or an explicit decision that status advances implicitly. | open |  | 2026-08-22T13:45:27.350Z |  |
| 90 | 04 | deviation | apps/mobile/components/RoutineActionSheet.tsx |  | Three files outside 04-11's declared files_modified were touched, all additively: RoutineActionSheet.tsx created (the UI-SPEC binds the '...' trigger to it and no earlier plan built it), ArchiveDialog.tsx gained an optional subject prop so the program copy lands verbatim (existing call sites and its shipped test untouched and green), and new.tsx landed in Task 2's commit because the route-guard assertion on the segment's children needs the route to exist. | open |  | 2026-08-22T13:45:27.676Z |  |
| 91 | 04 | deviation | apps/api/src/sync/sync.service.ts |  | CR-01 shipped: applyBatch keyed aggregates on the bare client-chosen root id with no type discriminator, so a two-op batch reusing one id under two root types routed the ownership check at the wrong table and let any authenticated user overwrite and re-own a shared seeded catalog exercise. Confirmed exploitable end-to-end against a running server (HTTP 201, both ops applied, zero rejected); because exercise.user_id cascades on user delete, deleting the attacking account then hard-deleted the shared row for every user. Caught by 04-REVIEW.md, not by the 207 green e2e tests. Fixed by keying aggregates and ownership lookups on (root table, root id) and removing rootTypeByRootId; permanent e2e cover added for both the seeded-catalog and cross-user routine variants. | fixed |  | 2026-08-23T09:25:24.682Z | 2026-08-23T09:25:45.802Z |
| 92 | 04 | deviation | apps/api/src/sync/sync.service.ts |  | WR-12 shipped and now fixed: USER_EXERCISE_PREFERENCE_PATCH_FIELDS.exerciseId: null meant 'write unconditionally', not 'never write' as four comments in patch-update-set.ts claimed, and toUserExercisePreferenceValues read the client's exercise_id — so a PATCH or PUT naming a different exercise silently re-targeted an existing preference row, moving an archived/never-suggest flag onto another movement. Fixed by resolving exercise_id database-first from the existing batched root query (zero extra queries), matching every other parent resolver's precedence; the four inverted comments and the PatchFieldMap contract were rewritten. Two e2e regressions added, both confirmed failing pre-fix. | open |  | 2026-08-23T10:07:32.284Z |  |
| 93 | 04 | deviation | apps/api/src/sync/sync.service.ts |  | WR-13 item 1 shipped and now fixed: the delete-op tombstone pre-pass ran isTombstoned per op inside a Promise.all, firing up to SYNC_MAX_BATCH_OPS concurrent queries and risking connection-pool exhaustion for unrelated requests. Replaced with the already-existing batched findTombstoned. Query-count regression added (1 query regardless of batch size); pre-fix it measured 3 for a 3-op batch. | open |  | 2026-08-23T10:07:32.378Z |  |
| 94 | 04 | lint-warning | apps/api/src/sync/sync.service.ts |  | WR-13 item 3 OPEN: cascaded child tombstones are written one recordTombstone INSERT at a time inside the delete transaction — a day delete on a 30-exercise, 6-cycle program is up to 180 sequential inserts holding locks. Batchable into one multi-row insert per table via a plural recordTombstones helper. Deferred because transaction queries bypass pool.query, so the existing countQueries helper cannot observe them and the change would land untested on the delete-cascade path. Needs a client-level query counter before it is safe to make. | open |  | 2026-08-23T10:07:32.462Z |  |
| 95 | 04 | deviation | apps/api/test/schema-parity.e2e-spec.ts |  | WR-14 addressed: the RIR-range removal was correct and user-approved, and no-migration is this repo's convention (drizzle-kit push, no ./drizzle directory, db:verify as the gate) — recorded next to the columns in session.ts. The real gap was detectability: schema-parity's session_exercise required-column list omitted target_rir and target_rest_seconds, so a database predating the push passed every test green. Added those plus a FORBIDDEN_COLUMNS gate across the three affected tables, verified failing against a deliberately staled database. | open |  | 2026-08-23T10:07:32.545Z |  |
| 96 | 04 | unmet-truth | apps/mobile/lib/export/build-export-document.ts |  | WR-14 export half NOT actioned (apps/mobile was a concurrent agent's territory). Assessment: the finding is overstated — the manifest already carries app_version (CLIENT_VERSION) and exported_at so a shape change is detectable, and no importer exists anywhere in the repo (TrainingExport is referenced only by the two files producing it), so there is no round-trip to regress. An explicit schema_version field would still be a cheap improvement over relying on app_version as a proxy. Bears on PLAT-10. | open |  | 2026-08-23T10:07:32.629Z |  |
| 97 | 04 | unmet-truth | apps/api/src/db/schema/program.ts |  | WR-15 assessed and deliberately NOT fixed — overstated. The push side already rejects a cycle target whose two parent chains disagree (resolveRoutineIdForCycleTarget returns conflict:true, op rejected not_owner), covered by program-sync.e2e-spec.ts:1172, so 04-07's pull-side single-chain walk is sound for anything written through applyBatch. Residual gap is out-of-band writers only, and none exist (the seed script never touches the table). The suggested fix — denormalise routine_id with composite FKs on both parents — is architectural: it appends to a synced table's wire contract and requires an apps/mobile local-schema change. A cheaper mitigation exists (add the cycle chain to the pull query in ops/powersync/sync-rules.yaml) but nothing in this repo validates that file — no test references it, no PowerSync service runs in the test path — so it needs live-service validation first. | open |  | 2026-08-23T10:07:32.713Z |  |
| 98 | 04 | deviation | apps/mobile/lib/db/programs/cycles.ts |  | Time-off edit defect fixed, and 04-VERIFICATION's account of it was partly wrong: setCycleKind already read the row and threw duration-required, so a durationless time_off row was NEVER written from this path. The real defect was a silent no-op — the throw was swallowed into console.error, the chip did not change, and the form offered no duration input, so the control was dead. Replaced renameCycle/setCycleKind/setCycleDuration/readCycle with one atomic updateCycle running the same validateCycle gate as addCycle, so no intermediate row exists for a sync to observe. validateCycle hardened with Number.isInteger against NaN from a non-numeric duration string. | open |  | 2026-08-23T10:37:33.288Z |  |
| 99 | 04 | deviation | apps/mobile/components/ExerciseSlotRow.tsx |  | WR-07 fixed, but the finding is overstated as written: the stepper does not destroy other overrides — a null in an override row means inherit, not cleared, and un-overriding one field by stepping back to the base value still works. The real defect is narrower: inside a cycle, decrementing at the floor silently converted 'override to the minimum' into 'inherit', a different intent than the user expressed. Fixed by disabling clear-to-null while a cycle is selected. | open |  | 2026-08-23T10:37:33.376Z |  |
| 100 | 04 | deviation | apps/mobile/lib/programs/next-up.ts |  | WR-05's suggested fix (scope the history SQL to this routine) was NOT adopted: it would exclude sessions logged against since-deleted days and break the UI-SPEC Pitfall-5 fallback recorded at ledger entries 79/80. Fixed in the resolver instead by seeding the time-off countdown from countableHistory, the same list the position walk uses, so the two derivations cannot disagree about which sessions count. | open |  | 2026-08-23T10:37:33.458Z |  |
| 101 | 04 | todo | apps/mobile/lib/programs/next-up.ts |  | lastLoggedDayIndex uses completedSessions rather than countableHistory (same class as WR-05, one function up), so a completed session logged against ANOTHER program's day yields findIndex -1 and silently resets the rotation to day one of the current program. Not fixed: from loadNextUp's data, 'a deleted day' and 'another program's day' are indistinguishable, and the UI-SPEC prescribes the reset for the first case. Needs routine ownership carried in the history query plus a spec decision on whether the two cases should diverge. | open |  | 2026-08-23T10:37:33.542Z |  |
| 102 | 04 | deviation | apps/mobile/app/(tabs)/programs.tsx |  | WR-08 fixed by validating the routineId param through resolveLiveRoutineId, but a stale param is NOT cleared from the URL — the screen falls back to the active routine while the address bar still names the dead one, so a reload re-triggers the same fallback. Rewriting the user's URL on load is a navigation-behaviour change beyond the scope of a validation fix. | open |  | 2026-08-23T10:37:33.624Z |  |
| 103 | 04 | unrun-verify | apps/mobile/components/DragHandle.web.tsx |  | WR-03's pointer capture is fixed against the DOM Pointer Events contract and unit-tested through a fake capture target, but has NOT been observed in a browser (CLAUDE.md forbids browser testing without an explicit request). Whether a real pointer leaving the handle mid-drag now stays captured is unverified in a live DOM. Compounds ledger entry 64: which of DragHandle.tsx / DragHandle.web.tsx Metro resolves into the web bundle was never conclusively confirmed — if the native file wins, this fix is inert. | open |  | 2026-08-23T10:37:33.707Z |  |
| 104 | 04 | unrun-verify | apps/mobile/app/(tabs)/index.tsx |  | WR-04's useFocusEffect wiring is unverified as wiring: the mobile lockfile has no renderer (no @testing-library/react-native, no react-test-renderer), so readNextUp is tested by direct invocation and the focus subscription itself is proven only by typecheck. Note also the fix is refocus-driven, not reactive — a write made while Home is already foregrounded still will not appear until the tab is refocused. Genuine reactivity (a PowerSync watch) is a design change, not a warning-pass fix. | open |  | 2026-08-23T10:37:33.790Z |  |
| 105 | 04 | deviation | apps/mobile/lib/db/powersync.ts |  | WR-10's transactions buy LOCAL atomicity plus one crud transaction per push (getNextCrudTransaction), so the server applies each group as one aggregate in one Postgres transaction. They do NOT buy atomic convergence against a concurrent push from another device — that remains row-level LWW and no client-side change can alter it. Recorded so a later reader does not mistake the wrapper for a cross-device guarantee. | open |  | 2026-08-23T10:37:33.873Z |  |
| 106 | 05 | unrun-verify | apps/mobile/e2e/workout-screen.spec.ts |  | Task 1/2 tracer e2e (start workout, durable checkmark, reload, pager swipe/chip-tap) written but not executed — CLAUDE.md forbids launching a browser unless explicitly requested | open |  | 2026-08-23T18:42:33.633Z |  |
| 107 | 05 | unrun-verify | apps/mobile/e2e/durability.spec.ts |  | Task 3 two-prior-sessions previousSetReference reload case written but not executed — CLAUDE.md forbids launching a browser unless explicitly requested | open |  | 2026-08-23T18:42:41.654Z |  |
| 108 | 05 | unrun-verify | apps/mobile/e2e/schema-redefinition.spec.ts |  | notes->harness_probe rename verified by re-reading the spec's literal replacements only; the schema-redefinition e2e suite itself was not re-run in this session (browser launch restricted) | open |  | 2026-08-23T18:42:44.927Z |  |
| 109 | 05 | stub | apps/mobile/components/SetRow.tsx |  | Warm-up rows sort ahead of working rows and are excluded from strip/reference counts, but SetRow.tsx does not yet render 05-UI-SPEC's leading 14px W badge — out of Task 2's file scope, deferred to a later plan touching SetRow.tsx | open |  | 2026-08-23T18:42:48.569Z |  |
| 110 | 05 | unrun-verify | apps/mobile/lib/rest-alert.ts |  | expo-notifications' scheduled DATE-trigger alert has not been observed to actually fire and be audible/visible while the app is fully backgrounded and the phone is locked, on a real iOS or Android device — no Xcode/Android SDK on this machine (D-10). Typecheck + doc-confirmed API usage only. Filed against ROADMAP Phase 999.1 per RESEARCH.md Pitfall 4. | open |  | 2026-08-24T09:05:39.209Z |  |
| 111 | 05 | unrun-verify | apps/mobile/e2e/rest-timer.spec.ts |  | Rest timer e2e (Notification-constructed-at-target, hidden/visible recompute, +30s, Skip Rest, undo-cancels-alert, permission-denied degraded path) written against the durability Playwright project but not executed this session — CLAUDE.md forbids launching a browser unless explicitly requested. | open |  | 2026-08-24T09:05:51.583Z |  |

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
  },
  {
    "id": 27,
    "kind": "deviation",
    "phase": "02",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "WR-01 (02-REVIEW.md): the single-known-root heal path retroactively poisons every op already grouped under a batch's one other resolvable root when an orphan (an op whose parent reference is entirely absent) heals into it, so one malformed payload takes a whole legitimate session's push down and the client retries the still-poisoned batch forever. poison-pill.e2e-spec.ts cannot reach this branch (it always uses two distinct session ids), and the shipped mobile client cannot produce such an op (log-set.ts always populates parent references). Not folded into 02-13's scope — a genuinely different concern (aggregate grouping, not the update set).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T20:19:43.489Z",
    "resolved_at": null
  },
  {
    "id": 28,
    "kind": "deviation",
    "phase": "02",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "WR-02 (02-REVIEW.md): highestServerSeq is not rewound when an aggregate's transaction rolls back — Postgres sequence nextval() is non-transactional, so a value obtained inside a rolled-back transaction is real but was never attached to any row that actually committed, and SyncPushResponse.server_seq can report a value ahead of anything durably stored. Latent: no client code reads server_seq today. Not folded into 02-13's scope.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T20:19:51.979Z",
    "resolved_at": null
  },
  {
    "id": 29,
    "kind": "unrun-verify",
    "phase": "02",
    "file": ".github/workflows/ci.yml",
    "line": null,
    "description": "WR-03 (02-REVIEW.md): nothing in CI inspects the exported web bundle for the durability harness, so the dead-code-elimination claim (that DURABILITY_HARNESS_GLOBAL folds away and __fitnessDurability is Terser-eliminated when EXPO_PUBLIC_DURABILITY_HARNESS is unset) rests on code review alone. Worth closing with a mechanical grep-the-exported-bundle CI step, given this round's own framing of harness-in-production as the highest-severity risk class in its diff. Not folded into 02-13's scope — needs a CI job change plus a web export, entirely in apps/mobile / .github.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T20:19:59.847Z",
    "resolved_at": null
  },
  {
    "id": 30,
    "kind": "stub",
    "phase": "02",
    "file": "apps/mobile/lib/db/test-support.ts",
    "line": null,
    "description": "WR-04 (02-REVIEW.md): DURABILITY_HARNESS_ENABLED is exported from test-support.ts with zero importers anywhere in apps/mobile (confirmed via repo-wide grep) — __durability.web.tsx re-derives the same check inline instead, per its own comment explaining why. Trivially cheap (one line, zero importers) but deliberately left out of 02-13's scope: taking it would pull apps/mobile into this plan's file scope and drag the mobile typecheck and the Playwright durability project into a verification set that is otherwise pure API e2e. One line whenever a mobile-touching plan next runs.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T20:20:06.941Z",
    "resolved_at": null
  },
  {
    "id": 31,
    "kind": "deviation",
    "phase": "02",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "The session_exercise PATCH constraint: isInvalidSessionExercise requires a non-empty exercise_id on every non-DELETE op, including a PATCH, so a genuinely narrow {order_index}-only PATCH to session_exercise is rejected invalid_field today. Not relaxed by 02-13, for a load-bearing reason: 02-13's patchAwareSet guard filters only the onConflictDoUpdate set: clause, never the insert .values() clause, so d.exercise_id ?? '' still reaches the database whenever a PATCH upserts an id the server has not seen — exactly the empty-string-FK case this validator was written to block (CR-04). Relaxing it needs its own decision about PATCH-as-insert semantics; whichever phase ships a reorder-exercises feature should read this before rediscovering the constraint.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T20:20:14.680Z",
    "resolved_at": null
  },
  {
    "id": 32,
    "kind": "unmet-truth",
    "phase": "03",
    "file": "apps/mobile/lib/catalog/load-snapshot.ts",
    "line": null,
    "description": "Seeded exercise rows are written into the shared, PowerSync-synced exercise table (not a localOnly table), so a full catalog load is expected to generate real ps_crud entries despite user_id being null -- PowerSync installs CRUD triggers per-table, not per-row. The zero-sync-traffic must_haves truth holds only for muscle_group/exercise_muscle_mapping/catalog_meta, not for the seeded exercise rows themselves.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T09:28:36.379Z",
    "resolved_at": "2026-08-18T10:14:26.259Z"
  },
  {
    "id": 33,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/lib/db/test-support.ts",
    "line": null,
    "description": "loadCatalogSnapshot's zero-ps_crud claim for muscle_group/exercise_muscle_mapping/catalog_meta is proven only against a Jest mock that faithfully models PowerSync's documented per-table trigger installation, not against a real PowerSync engine -- new PowerSyncDatabase() from @powersync/web hangs indefinitely under this project's Jest (Node) environment (confirmed by a timed spike, killed after 60s+), matching WINDOWS #22's prior finding. The real-engine confirmation needs a Playwright e2e case (real browser, real Worker/IndexedDB) alongside the existing durability harness.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T09:28:44.482Z",
    "resolved_at": "2026-08-19T10:02:13.586Z"
  },
  {
    "id": 34,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/index.tsx",
    "line": null,
    "description": "The offline first-boot flow (fresh install, no network, open /exercises, see 3 seeded exercises, open one, see target muscles) and the error-state UI ('Exercise catalog couldn't load') were verified only by typecheck, unit tests and expo export --platform web bundling -- not observed rendered in a browser, simulator or device. No Xcode/Android SDK on this machine; no Playwright browsers installed in this worktree, consistent with prior phases' native/browser gaps (WINDOWS #4, #8, #26).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T09:28:46.987Z",
    "resolved_at": null
  },
  {
    "id": 35,
    "kind": "unmet-truth",
    "phase": "03",
    "file": "docs/catalog-dataset-license.md",
    "line": null,
    "description": "Task 1's fedb-with-images decision was accepted against the characterization 'an open, unanswered upstream GitHub issue' on image licensing. Direct re-verification (03-04, 2026-08-18) found this stale: yuhonas/free-exercise-db issues #2 and #12 are both closed/answered -- the maintainer disclaims knowledge of image provenance, and the upstream wrkout/exercises.json CONTRIBUTING.md explicitly states images were scraped from the internet, copyright is not owned, and advises against commercial use. image_urls now points at live raw.githubusercontent.com URLs (not yet vendored/bundled -- that is 03-05's job). This corrected, more concrete risk should be reweighed before /gsd-ship; see docs/catalog-dataset-license.md's 'Image licensing: corrected finding' section.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T10:50:22.424Z",
    "resolved_at": null
  },
  {
    "id": 36,
    "kind": "stub",
    "phase": "03",
    "file": "apps/mobile/components/ExerciseImageTile.tsx",
    "line": null,
    "description": "AMENDED by plan 03-07: the wiring is now done -- ExerciseImageTile gained an additive `localSource` prop, catalog-image-map.generated.ts provides 1740 static requires keyed by exercise id, and app/exercises/[id].tsx renders through it. Left `open`, not `fixed`: this only has bundler-level proof (all 1740 requires resolve, all 1740 jpgs land in `expo export --platform web`'s dist/, 97MB) -- no browser/simulator/device observed an image actually paint on screen (see WINDOWS #37).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T12:30:40.757Z",
    "resolved_at": null
  },
  {
    "id": 37,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/index.tsx",
    "line": null,
    "description": "FlashList rendering/scrolling all ~870 seeded rows without dropped frames (03-06's held-out performance backstop truth) was not observed on device or in a real browser -- no simulator/device, no Playwright browsers installed in this worktree. Verified instead: typecheck, 178/178 jest tests, and expo export --platform web bundling FlashList and the new screen for the web target.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T18:52:43.762Z",
    "resolved_at": null
  },
  {
    "id": 38,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/index.tsx",
    "line": null,
    "description": "The catalog-load-failure error state ('Exercise catalog couldn't load') is wired through loadCatalogSnapshot's already-tested invalid-shape path, but this screen's own rendering of that path was not observed in a rendered tree -- @testing-library/react-native is not installed in this codebase, so 03-06's component-level assertions were extracted into pure, unit-tested helpers (deriveExerciseListScreenState et al.) in catalog-filter.ts per the plan's own instruction, rather than rendered.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T18:52:43.887Z",
    "resolved_at": null
  },
  {
    "id": 39,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/[id].tsx",
    "line": null,
    "description": "The vendored local catalog images (1740 files, 03-05) are now wired through catalog-image-map.generated.ts + ExerciseImageTile's localSource prop -- bundler-level proof confirms all 1740 requires resolve and are included in the web export (find dist -iname '*.jpg' | wc -l == 1740, 97MB). Actual visual rendering (a real image painting on the exercise detail screen) is unverified: Playwright Chromium is present on this machine (contradicting WINDOWS #34's prior claim) but CLAUDE.md's global 'never launch a browser unless explicitly asked' rule takes precedence over verifying this here; no Xcode/Android SDK either (WINDOWS #16).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T18:51:58.018Z",
    "resolved_at": null
  },
  {
    "id": 40,
    "kind": "stub",
    "phase": "03",
    "file": "apps/mobile/lib/db/schema.ts",
    "line": null,
    "description": "exercise_muscle_mapping is registered localOnly table-wide (WINDOWS #32's mechanism), so every custom exercise's muscle-mapping rows -- not just a duplicate's copied ones -- never sync to a second device; a future per-user-mapping-sync plan needs to design around this before EXER-04/05's mappings are considered cross-device-durable",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T19:29:31.308Z",
    "resolved_at": null
  },
  {
    "id": 41,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/new.tsx",
    "line": null,
    "description": "The rendered create and edit forms (blank-on-open placeholder, inline per-field errors, Save disabled-and-never-hidden, multiline auto-grow/scroll, muscle-mapping chip picker, ownership-gated not-permitted state) were never observed in a browser, simulator or device -- no @testing-library/react-native in this codebase's lockfile, no simulator/device on this machine, and CLAUDE.md forbids launching a browser unless explicitly asked. Verified instead: typecheck, expo export --platform web bundling both routes, and 33 unit tests over every extracted presentational decision.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T19:29:38.608Z",
    "resolved_at": null
  },
  {
    "id": 45,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/[id].tsx",
    "line": null,
    "description": "duplicateExercise is imported from lib/catalog/custom-exercise (owned by 03-08, running concurrently in a separate worktree this wave, not present in 03-09's worktree). pnpm --filter mobile test all pass (219/219, incl. a virtual-mocked duplicateExercise), and pnpm --filter mobile typecheck / build each fail with exactly one error -- Cannot find module '../../lib/catalog/custom-exercise' -- confirmed to be the only error either command produces. Needs re-running after 03-08 and 03-09 merge to confirm the two plans' work integrates cleanly (signature match: duplicateExercise(db, userId, sourceId) => Promise<string>, per 03-08-PLAN.md).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T19:20:00.883Z",
    "resolved_at": "2026-08-18T20:24:16.512Z"
  },
  {
    "id": 46,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/components/SwapSuggestionList.tsx",
    "line": null,
    "description": "Smart-swap suggestion rows (thumbnail, name, why string, empty state, Browse Catalog link) were never observed in a real browser, simulator or device -- no simulator/device on this machine, and CLAUDE.md forbids launching a browser unless explicitly asked. Verified instead: 20 scorer unit tests, 7 direct-invocation component tests, typecheck, and expo export --platform web bundling the route cleanly.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-18T20:24:39.731Z",
    "resolved_at": null
  },
  {
    "id": 47,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/api",
    "line": null,
    "description": "This plan's phase-level <verification> block names 'pnpm --filter api test:e2e exits 0 -- nothing in this plan touches the server' as a check, but the suite was not re-run in this session (no server files in this plan's scope; api/.env is permission-restricted from this worktree's sandbox). Confidence it is unaffected rests on file-scope reasoning (zero server files touched: smart-swap.ts, SwapSuggestionList.tsx and the [id].tsx edit are all client-only), not a fresh green run.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T20:24:50.324Z",
    "resolved_at": "2026-08-18T20:42:11.576Z"
  },
  {
    "id": 48,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/api/test/cors.e2e-spec.ts",
    "line": null,
    "description": "Plan 03-11's cors.e2e-spec.ts (Task 1 RED/GREEN proof and Task 3's full behavior suite) was not run in this session. pnpm test:e2e runs drizzle-kit push first, which needs DATABASE_URL from apps/api/.env or the workspace-root .env -- neither exists in this worktree (.env is gitignored and not copied into git worktrees) and both read and write access to any .env path is blocked by a hard sandbox deny-rule, confirmed by drizzle-kit push failing with 'Either connection url or host, database are required for PostgreSQL database connection' after injecting 0 vars from .env,../../.env. This is the same class of block recorded at WINDOWS #47. Verified instead: pnpm --filter api typecheck (clean, src/), npx tsc --noEmit -p test/tsconfig.json (clean, test/ including cors.e2e-spec.ts), grep -rl 'env.WEB_ORIGINS' apps/api/src prints exactly one path (web-origins.ts), and no package.json changed across the plan's 3 commits. The RED-before-GREEN failure and the Task 3 ordering check (moving enableCors after minClientVersionMiddleware turning the 426 case red) rest on the diagnosis_already_done block's verified facts about cors@2.8.6 and enableCors's registration-order semantics, not a live observation.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-19T08:38:20.587Z",
    "resolved_at": "2026-08-19T08:50:18.338Z"
  },
  {
    "id": 49,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/_layout.tsx",
    "line": null,
    "description": "R4: the segment header, its title and the back control actually painting on /exercises/seed_90_90_Hamstring is unobserved; gates prove the layout file exists, declares the anchor, supplies a function-valued headerLeft, and bundles, not pixels",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T15:34:15.740Z",
    "resolved_at": null
  },
  {
    "id": 50,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/lib/navigation/back.ts",
    "line": null,
    "description": "R5: goBackOrReplace's no-previous-entry branch is proven against a fake router in back.test.ts, not against react-navigation's real canGoBack predicate on a refreshed detail URL",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T15:34:20.470Z",
    "resolved_at": null
  },
  {
    "id": 51,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/_layout.tsx",
    "line": null,
    "description": "R6 (security-relevant): that exercises/[id], exercises/new and exercises/edit/[id] no longer mount signed-out follows deterministically from expo-router's hoisting and screen-matching rules once the segment layout exists, but this has not been observed in a browser. Must be verified before Phase 03 sign-off.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T15:34:24.022Z",
    "resolved_at": null
  },
  {
    "id": 52,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "apps/mobile/app/exercises/_layout.tsx",
    "line": null,
    "description": "R7: native swipe-back on iOS/Android unverified — no Xcode or Android SDK on this machine; per project convention native verification is swept once at ROADMAP Phase 999.1",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T15:34:27.450Z",
    "resolved_at": null
  },
  {
    "id": 53,
    "kind": "deviation",
    "phase": "03",
    "file": "apps/mobile/app/exercises/_layout.tsx",
    "line": null,
    "description": "Security fix (T-03-58): app/exercises/_layout.tsx collapses the four hoisted exercises routes into one guarded segment route, so the root layout's existing signed-in Stack.Protected guard on Stack.Screen name=exercises now covers exercises/[id], exercises/new and exercises/edit/[id] as well as the list — previously only the list route was in the protected-screen set and the other three mounted regardless of session state",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T15:34:33.185Z",
    "resolved_at": null
  },
  {
    "id": 54,
    "kind": "unrun-verify",
    "phase": "4",
    "file": "apps/mobile/app/(tabs)/programs.tsx",
    "line": null,
    "description": "Programs tab (create + list draft programs) has been exercised on neither iOS nor Android — no Xcode, no Android SDK on this machine; native observation deferred to ROADMAP Phase 999.1",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-20T15:38:02.214Z",
    "resolved_at": null
  },
  {
    "id": 55,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/db/programs/days.ts",
    "line": null,
    "description": "Two-device offline-reorder convergence for order_index (gap scheme) is reasoned from the gap arithmetic and row-level-LWW model, not observed — one device available, no second runtime in this worktree",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-20T17:03:04.520Z",
    "resolved_at": null
  },
  {
    "id": 56,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/ExercisePickerModal.tsx",
    "line": null,
    "description": "The full-screen exercise picker's presentation, search/filter interaction and multi-select behavior have been observed on neither iOS nor Android (no Xcode/Android SDK on this machine) — verified only via unit tests and the web build. Deferred to ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T07:35:54.475Z",
    "resolved_at": null
  },
  {
    "id": 57,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/ExerciseSlotRow.tsx",
    "line": null,
    "description": "The inline-expand animation and the numeric stepper's tap/hold behaviour (including rep-range pairing at the UI layer) have been observed on neither iOS nor Android — verified only via unit tests and the web build. Deferred to ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T07:35:54.608Z",
    "resolved_at": null
  },
  {
    "id": 58,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/api/src/db/schema/preference.ts",
    "line": null,
    "description": "user_preference's primary key changed from user_id alone to a TEXT id column deterministically equal to user_id (option-a at plan 04-04's opening checkpoint, resolved by the orchestrator after verifying the user_exercise_preference precedent and the shipped conflict-policy.spec.ts assumption). A one-way primary-key migration on a table PowerSync already syncs; the live table was confirmed empty before the push. user_id also carries a unique constraint so the one-row-per-user singleton holds independently of the id contract.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T07:35:54.767Z",
    "resolved_at": null
  },
  {
    "id": 59,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "Two devices activating different programs while offline converge, once both pushes land, to exactly one active program (T-04-20 backstop). Structurally reasoned from D-14's single-nullable-column LWW shape and partially exercised by the single-device 'second PUT overwrites, exactly one row remains' e2e case; the genuine two-device race is unrun — no second device or runtime available here.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T07:35:54.898Z",
    "resolved_at": null
  },
  {
    "id": 60,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "ops/powersync/sync-rules.yaml",
    "line": null,
    "description": "PowerSync Service not restarted against the updated sync rules here, so pull-side delivery of routine_cycle rows is asserted only by the query's shape matching the shipped, already-verified routine_day query, not by an observed stream. Standing limitation inherited from 04-01/04-02/04-04.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T10:32:23.609Z",
    "resolved_at": null
  },
  {
    "id": 61,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "T-04-32 handoff: a routine_cycle DELETE's future routine_exercise_cycle_target children (table created in 04-07) are not yet covered by child-tombstone gathering. 04-07 MUST extend the routine_day DELETE branch to also tombstone cascaded routine_exercise_cycle_target rows, or a deleted override resurrects on the next pull.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-21T10:32:23.795Z",
    "resolved_at": "2026-08-21T15:25:40.229Z"
  },
  {
    "id": 62,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/DayDeck.tsx",
    "line": null,
    "description": "Day-deck horizontal swipe observed on neither iOS nor Android (no Xcode/Android SDK) and not driven in a browser (CLAUDE.md forbids browser testing without an explicit request) — verified only via DayDeck.test.tsx (8 cases) and the web build. Deferred to ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T10:32:23.952Z",
    "resolved_at": null
  },
  {
    "id": 63,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/DragHandle.tsx",
    "line": null,
    "description": "Native drag gesture (Gesture.Pan, direction-locked against the deck swipe) observed on neither iOS nor Android — verified only via DragHandle.test.tsx (hook-free view only), typecheck and the web build. Deferred to ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T10:32:24.083Z",
    "resolved_at": null
  },
  {
    "id": 64,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/DragHandle.web.tsx",
    "line": null,
    "description": "Web pointer-events drag not driven in a browser. Additionally, which of DragHandle.tsx / DragHandle.web.tsx Metro resolves into the web bundle at runtime was NOT conclusively confirmed — the working precedent of the same convention for _layout.web.tsx / reset-password.web.tsx is the strongest available evidence, not direct verification of this pair.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T10:32:24.206Z",
    "resolved_at": null
  },
  {
    "id": 65,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/babel.config.js",
    "line": null,
    "description": "The react-native-worklets/plugin Babel plugin's runtime behaviour on a native build (whether the worklet genuinely runs on the UI thread on-device) is unobservable here — presence and correctness confirmed only against a succeeding web export and the package's compatibility metadata.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T10:32:24.333Z",
    "resolved_at": null
  },
  {
    "id": 66,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/package.json",
    "line": null,
    "description": "react-native-worklets and react-native-pager-view are peerDependencies of reanimated and tab-view respectively but were left TRANSITIVE-ONLY rather than added as direct dependencies, despite the approved package-legitimacy decision covering all five as direct. babel.config.js references react-native-worklets/plugin, which resolves today only via pnpm hoisting; a stricter hoisting setting would break the build. worklets is additionally pinned to 0.10.4 by a pnpm-workspace override because Expo-pinned reanimated 4.5.1 narrows its peer to exactly 0.10.x while transitive resolution gave 0.11.3, which throws at Reanimated module init on every platform.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-21T10:32:24.455Z",
    "resolved_at": "2026-08-21T15:25:40.316Z"
  },
  {
    "id": 67,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "ops/powersync/sync-rules.yaml",
    "line": null,
    "description": "PowerSync Service not restarted against the updated sync rules here, so pull-side delivery of routine_exercise_cycle_target rows is asserted only by the query's shape matching the shipped, already-verified routine_exercise/routine_cycle queries (identical JOIN/filter structure and auth.user_id() filter), not by an observed stream. Standing limitation inherited from 04-01/04-02/04-04/04-06.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:25:47.676Z",
    "resolved_at": null
  },
  {
    "id": 68,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/CycleStrip.tsx",
    "line": null,
    "description": "The pinned cycle strip and its three chip tones (training / dashed-border deload / reduced-opacity time off) are asserted structurally in Jest but rendered on neither iOS nor Android. No Xcode, no Android SDK on this machine. Deferred to ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:49:05.323Z",
    "resolved_at": null
  },
  {
    "id": 69,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/app/(tabs)/programs.tsx",
    "line": null,
    "description": "'Switching cycles keeps the day you were on' is verified structurally only (DayDeck owns its page index and receives no index prop). The interaction itself has been observed on no platform — not native (no toolchain) and not in a browser (out of scope per CLAUDE.md).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:49:05.441Z",
    "resolved_at": null
  },
  {
    "id": 70,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/ExerciseSlotRow.tsx",
    "line": null,
    "description": "The per-cycle override marker's rendered legibility beside a stepper label at large OS font scales is untested — no renderer, no device. Only its presence, count and per-field identity are asserted.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:49:05.524Z",
    "resolved_at": null
  },
  {
    "id": 71,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/db/programs/days.ts",
    "line": null,
    "description": "computeReorder/SiblingRow promoted from private to exported so moveCycle reuses the reorder arithmetic rather than becoming its third copy. One file beyond 04-08's declared files_modified; two lines changed, no behaviour change.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:49:05.607Z",
    "resolved_at": null
  },
  {
    "id": 72,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/components/ExerciseSlotRow.tsx",
    "line": null,
    "description": "The per-cycle override marker ('· this cycle') and the cycle strip's inline 'Edit Cycle' control are executor design calls on points 04-UI-SPEC.md leaves open. Surfaced to the user post-merge per the standing 'UI/UX decisions always surface' rule. Both bounded and reversible.",
    "status": "waived",
    "reason": "User reviewed both design calls directly on 2026-08-21 and confirmed the shipped treatment for each: the '· this cycle' text suffix beside overridden stepper labels, and the inline 'Edit Cycle' control visible only while a cycle is selected. Both promoted into 04-UI-SPEC.md so later plans inherit them rather than re-deciding.",
    "recorded_at": "2026-08-21T15:49:05.690Z",
    "resolved_at": "2026-08-21T15:50:48.657Z"
  },
  {
    "id": 73,
    "kind": "deviation",
    "phase": "04",
    "file": "packages/api-contracts/package.json",
    "line": null,
    "description": "A fresh git worktree cannot run the mobile suite until 'pnpm --filter @fitness/api-contracts build' is run, because the package's main points at a gitignored dist/. Every worktree-isolated executor importing this package hits it (14 of 35 mobile suites fail with Cannot find module '@fitness/api-contracts'). Worth a prepare hook or a source-entry exports map.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:49:05.772Z",
    "resolved_at": null
  },
  {
    "id": 74,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/lib/db/log-set.ts",
    "line": null,
    "description": "The cycle-resolved session snapshot was never observed on a real device or in a browser. No UI calls addSessionExercise yet, this machine has neither Xcode nor an Android SDK, and browser testing is forbidden by CLAUDE.md unless explicitly requested. Correctness rests on the 23-case jest suite plus tsc. The api test:e2e suite that IS green is server-side against live Postgres, covering only the Postgres half.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:49:05.855Z",
    "resolved_at": null
  },
  {
    "id": 75,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/lib/db/__tests__/log-set.test.ts",
    "line": null,
    "description": "The PROG-11 client regression runs against a hand-built in-memory store, not PowerSync's real local SQLite. The store mirrors the local schema's routine_day -> routine_exercise -> routine_exercise_cycle_target delete cascade by hand; if PowerSync's local schema ever stops cascading (or diverges from Postgres), the day-delete case would keep passing against a store that no longer matches reality. The Postgres half IS asserted against a live database in apps/api/test/program-sync.e2e-spec.ts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T15:49:05.936Z",
    "resolved_at": null
  },
  {
    "id": 76,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/app/(tabs)/index.tsx",
    "line": null,
    "description": "The Home Next Up card has been observed on neither iOS nor Android; no Xcode and no Android SDK on this machine. Native rendering of the card, its chip row and its wrap-and-grow behaviour at large OS font scales rests on typecheck plus correct API usage. Deferred to ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:22.936Z",
    "resolved_at": null
  },
  {
    "id": 77,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/app/(tabs)/index.tsx",
    "line": null,
    "description": "The Home card has also not been observed in a browser. CLAUDE.md forbids launching a browser or driving the app unless the user explicitly asks, so the web target's actual appearance (chip wrapping, skeleton, opacity-60 time-off treatment) is unverified visually; only the 'expo export --platform web' build is proven.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:23.269Z",
    "resolved_at": null
  },
  {
    "id": 78,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/programs/next-up.ts",
    "line": null,
    "description": "Adopted assumption (RESEARCH A5): a deload cycle is trained and consumes a full rotation of days exactly like a training cycle. If a later phase decides a deload pauses rotation tracking, cycleSpan is the single place to change.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:23.570Z",
    "resolved_at": null
  },
  {
    "id": 79,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/programs/next-up.ts",
    "line": null,
    "description": "Adopted resolution (RESEARCH Pitfall 5a): a completed session logged against a since-deleted day stops counting toward rotation position, so deleting a day rewinds which cycle the lifter is in. The rejected alternative (keeping it countable) makes the answer depend on which day was deleted.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:23.769Z",
    "resolved_at": null
  },
  {
    "id": 80,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/programs/next-up.ts",
    "line": null,
    "description": "04-UI-SPEC overrides 04-10-PLAN's must-have truth on the deleted-day case: when the most recently logged day has been deleted, the next day resolves silently to the first day of the current cycle, never to a rewound index and never to a visible error. The plan text explicitly rejected this; the user-reviewed UI-SPEC mandates it and takes precedence.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:23.975Z",
    "resolved_at": null
  },
  {
    "id": 81,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/programs/next-up.ts",
    "line": null,
    "description": "Consecutive time-off cycles chain (each elapsed cycle consumes its own duration_days from the elapsed count before the next is considered), so a 3-day and a 5-day time-off cycle back to back are 8 days off. Neither CONTEXT.md nor the UI-SPEC specifies this; the alternative (each measuring independently from the last session) makes the pair 5 days.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:24.180Z",
    "resolved_at": null
  },
  {
    "id": 82,
    "kind": "stub",
    "phase": "04",
    "file": "apps/mobile/lib/programs/next-up.ts",
    "line": null,
    "description": "skippedTimeOffCycleIds is computed and returned but nothing renders it. A time-off cycle synced with a null duration_days is silently walked past. Surfacing it needs a Home-card state the UI-SPEC does not define.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:24.415Z",
    "resolved_at": "2026-08-23T10:37:33.195Z"
  },
  {
    "id": 83,
    "kind": "todo",
    "phase": "04",
    "file": "apps/mobile/lib/db/programs/next-up-query.ts",
    "line": null,
    "description": "loadNextUp issues 12 selects; 2 of them are loadExerciseNameMap's seeded/custom reads, which the Home screen could hoist and pass in as a cached name map to bring the count to 10.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:24.660Z",
    "resolved_at": null
  },
  {
    "id": 84,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/programs/__tests__/next-up.test.ts",
    "line": null,
    "description": "All three 04-10 tasks were written test-first but committed as single feat commits; no separate RED-phase test(...) commit exists, so the TDD gate sequence is not auditable from git history.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:24.937Z",
    "resolved_at": null
  },
  {
    "id": 85,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/app/programs/library.tsx",
    "line": null,
    "description": "The program library, the New Program fork and the freeze switch have been observed on neither iOS nor Android; no Xcode and no Android SDK. Web observation also not performed (CLAUDE.md forbids launching a browser unless explicitly asked). Correctness rests on unit tests, typecheck and a successful web export.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:25.255Z",
    "resolved_at": null
  },
  {
    "id": 86,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/app/programs/_layout.tsx",
    "line": null,
    "description": "Security-relevant: authorization for every /programs/* route comes from the root layout's single protected 'programs' registration, not from anything inside the segment. Mirrors the T-03-58 entry recorded for /exercises. Deleting _layout.tsx silently hoists both routes out of the guard — the route-guard suite's Case B is the tripwire.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:25.474Z",
    "resolved_at": null
  },
  {
    "id": 87,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/app/programs/library.tsx",
    "line": null,
    "description": "The UI-SPEC's 'Delete Draft' action is NOT shipped. The server's HARD_DELETE_FORBIDDEN (apps/api/src/sync/sync.service.ts) rejects every routine DELETE with no draft/never-logged nuance, so a client delete would emit an op the server rejects and the row would resurrect on next sync. Archive is offered for every program instead. Needs a server-side carve-out (allow routine DELETE when no workout_session.routine_day_id references any of its days) before the UI can offer it.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:25.803Z",
    "resolved_at": null
  },
  {
    "id": 88,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/db/programs/duplicate-routine.ts",
    "line": null,
    "description": "duplicateRoutine writes supersetGroupId, progressionSchemeId and notes as null rather than copying them, because loadProgramTree's ProgramSlot does not carry them. Harmless today (all three are always null — addExercisesToDay is their only writer and hardcodes them), but the moment any phase makes one writable this becomes silent data loss on duplication. The fix is to widen ProgramSlot so every tree consumer sees them, not to add a second read here.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:26.811Z",
    "resolved_at": null
  },
  {
    "id": 89,
    "kind": "stub",
    "phase": "04",
    "file": "apps/mobile/lib/db/programs/lifecycle.ts",
    "line": null,
    "description": "markRoutineReady is implemented and tested but has no UI call site: the UI-SPEC's action sheet enumerates four actions and does not include a draft->ready transition, so nothing in the shipped app can move a routine out of 'draft'. Needs either a UI affordance or an explicit decision that status advances implicitly.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:27.350Z",
    "resolved_at": null
  },
  {
    "id": 90,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/components/RoutineActionSheet.tsx",
    "line": null,
    "description": "Three files outside 04-11's declared files_modified were touched, all additively: RoutineActionSheet.tsx created (the UI-SPEC binds the '...' trigger to it and no earlier plan built it), ArchiveDialog.tsx gained an optional subject prop so the program copy lands verbatim (existing call sites and its shipped test untouched and green), and new.tsx landed in Task 2's commit because the route-guard assertion on the segment's children needs the route to exist.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:27.676Z",
    "resolved_at": null
  },
  {
    "id": 91,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "CR-01 shipped: applyBatch keyed aggregates on the bare client-chosen root id with no type discriminator, so a two-op batch reusing one id under two root types routed the ownership check at the wrong table and let any authenticated user overwrite and re-own a shared seeded catalog exercise. Confirmed exploitable end-to-end against a running server (HTTP 201, both ops applied, zero rejected); because exercise.user_id cascades on user delete, deleting the attacking account then hard-deleted the shared row for every user. Caught by 04-REVIEW.md, not by the 207 green e2e tests. Fixed by keying aggregates and ownership lookups on (root table, root id) and removing rootTypeByRootId; permanent e2e cover added for both the seeded-catalog and cross-user routine variants.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-23T09:25:24.682Z",
    "resolved_at": "2026-08-23T09:25:45.802Z"
  },
  {
    "id": 92,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "WR-12 shipped and now fixed: USER_EXERCISE_PREFERENCE_PATCH_FIELDS.exerciseId: null meant 'write unconditionally', not 'never write' as four comments in patch-update-set.ts claimed, and toUserExercisePreferenceValues read the client's exercise_id — so a PATCH or PUT naming a different exercise silently re-targeted an existing preference row, moving an archived/never-suggest flag onto another movement. Fixed by resolving exercise_id database-first from the existing batched root query (zero extra queries), matching every other parent resolver's precedence; the four inverted comments and the PatchFieldMap contract were rewritten. Two e2e regressions added, both confirmed failing pre-fix.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:07:32.284Z",
    "resolved_at": null
  },
  {
    "id": 93,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "WR-13 item 1 shipped and now fixed: the delete-op tombstone pre-pass ran isTombstoned per op inside a Promise.all, firing up to SYNC_MAX_BATCH_OPS concurrent queries and risking connection-pool exhaustion for unrelated requests. Replaced with the already-existing batched findTombstoned. Query-count regression added (1 query regardless of batch size); pre-fix it measured 3 for a 3-op batch.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:07:32.378Z",
    "resolved_at": null
  },
  {
    "id": 94,
    "kind": "lint-warning",
    "phase": "04",
    "file": "apps/api/src/sync/sync.service.ts",
    "line": null,
    "description": "WR-13 item 3 OPEN: cascaded child tombstones are written one recordTombstone INSERT at a time inside the delete transaction — a day delete on a 30-exercise, 6-cycle program is up to 180 sequential inserts holding locks. Batchable into one multi-row insert per table via a plural recordTombstones helper. Deferred because transaction queries bypass pool.query, so the existing countQueries helper cannot observe them and the change would land untested on the delete-cascade path. Needs a client-level query counter before it is safe to make.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:07:32.462Z",
    "resolved_at": null
  },
  {
    "id": 95,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/api/test/schema-parity.e2e-spec.ts",
    "line": null,
    "description": "WR-14 addressed: the RIR-range removal was correct and user-approved, and no-migration is this repo's convention (drizzle-kit push, no ./drizzle directory, db:verify as the gate) — recorded next to the columns in session.ts. The real gap was detectability: schema-parity's session_exercise required-column list omitted target_rir and target_rest_seconds, so a database predating the push passed every test green. Added those plus a FORBIDDEN_COLUMNS gate across the three affected tables, verified failing against a deliberately staled database.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:07:32.545Z",
    "resolved_at": null
  },
  {
    "id": 96,
    "kind": "unmet-truth",
    "phase": "04",
    "file": "apps/mobile/lib/export/build-export-document.ts",
    "line": null,
    "description": "WR-14 export half NOT actioned (apps/mobile was a concurrent agent's territory). Assessment: the finding is overstated — the manifest already carries app_version (CLIENT_VERSION) and exported_at so a shape change is detectable, and no importer exists anywhere in the repo (TrainingExport is referenced only by the two files producing it), so there is no round-trip to regress. An explicit schema_version field would still be a cheap improvement over relying on app_version as a proxy. Bears on PLAT-10.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:07:32.629Z",
    "resolved_at": null
  },
  {
    "id": 97,
    "kind": "unmet-truth",
    "phase": "04",
    "file": "apps/api/src/db/schema/program.ts",
    "line": null,
    "description": "WR-15 assessed and deliberately NOT fixed — overstated. The push side already rejects a cycle target whose two parent chains disagree (resolveRoutineIdForCycleTarget returns conflict:true, op rejected not_owner), covered by program-sync.e2e-spec.ts:1172, so 04-07's pull-side single-chain walk is sound for anything written through applyBatch. Residual gap is out-of-band writers only, and none exist (the seed script never touches the table). The suggested fix — denormalise routine_id with composite FKs on both parents — is architectural: it appends to a synced table's wire contract and requires an apps/mobile local-schema change. A cheaper mitigation exists (add the cycle chain to the pull query in ops/powersync/sync-rules.yaml) but nothing in this repo validates that file — no test references it, no PowerSync service runs in the test path — so it needs live-service validation first.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:07:32.713Z",
    "resolved_at": null
  },
  {
    "id": 98,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/db/programs/cycles.ts",
    "line": null,
    "description": "Time-off edit defect fixed, and 04-VERIFICATION's account of it was partly wrong: setCycleKind already read the row and threw duration-required, so a durationless time_off row was NEVER written from this path. The real defect was a silent no-op — the throw was swallowed into console.error, the chip did not change, and the form offered no duration input, so the control was dead. Replaced renameCycle/setCycleKind/setCycleDuration/readCycle with one atomic updateCycle running the same validateCycle gate as addCycle, so no intermediate row exists for a sync to observe. validateCycle hardened with Number.isInteger against NaN from a non-numeric duration string.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.288Z",
    "resolved_at": null
  },
  {
    "id": 99,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/components/ExerciseSlotRow.tsx",
    "line": null,
    "description": "WR-07 fixed, but the finding is overstated as written: the stepper does not destroy other overrides — a null in an override row means inherit, not cleared, and un-overriding one field by stepping back to the base value still works. The real defect is narrower: inside a cycle, decrementing at the floor silently converted 'override to the minimum' into 'inherit', a different intent than the user expressed. Fixed by disabling clear-to-null while a cycle is selected.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.376Z",
    "resolved_at": null
  },
  {
    "id": 100,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/programs/next-up.ts",
    "line": null,
    "description": "WR-05's suggested fix (scope the history SQL to this routine) was NOT adopted: it would exclude sessions logged against since-deleted days and break the UI-SPEC Pitfall-5 fallback recorded at ledger entries 79/80. Fixed in the resolver instead by seeding the time-off countdown from countableHistory, the same list the position walk uses, so the two derivations cannot disagree about which sessions count.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.458Z",
    "resolved_at": null
  },
  {
    "id": 101,
    "kind": "todo",
    "phase": "04",
    "file": "apps/mobile/lib/programs/next-up.ts",
    "line": null,
    "description": "lastLoggedDayIndex uses completedSessions rather than countableHistory (same class as WR-05, one function up), so a completed session logged against ANOTHER program's day yields findIndex -1 and silently resets the rotation to day one of the current program. Not fixed: from loadNextUp's data, 'a deleted day' and 'another program's day' are indistinguishable, and the UI-SPEC prescribes the reset for the first case. Needs routine ownership carried in the history query plus a spec decision on whether the two cases should diverge.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.542Z",
    "resolved_at": null
  },
  {
    "id": 102,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/app/(tabs)/programs.tsx",
    "line": null,
    "description": "WR-08 fixed by validating the routineId param through resolveLiveRoutineId, but a stale param is NOT cleared from the URL — the screen falls back to the active routine while the address bar still names the dead one, so a reload re-triggers the same fallback. Rewriting the user's URL on load is a navigation-behaviour change beyond the scope of a validation fix.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.624Z",
    "resolved_at": null
  },
  {
    "id": 103,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/components/DragHandle.web.tsx",
    "line": null,
    "description": "WR-03's pointer capture is fixed against the DOM Pointer Events contract and unit-tested through a fake capture target, but has NOT been observed in a browser (CLAUDE.md forbids browser testing without an explicit request). Whether a real pointer leaving the handle mid-drag now stays captured is unverified in a live DOM. Compounds ledger entry 64: which of DragHandle.tsx / DragHandle.web.tsx Metro resolves into the web bundle was never conclusively confirmed — if the native file wins, this fix is inert.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.707Z",
    "resolved_at": null
  },
  {
    "id": 104,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/app/(tabs)/index.tsx",
    "line": null,
    "description": "WR-04's useFocusEffect wiring is unverified as wiring: the mobile lockfile has no renderer (no @testing-library/react-native, no react-test-renderer), so readNextUp is tested by direct invocation and the focus subscription itself is proven only by typecheck. Note also the fix is refocus-driven, not reactive — a write made while Home is already foregrounded still will not appear until the tab is refocused. Genuine reactivity (a PowerSync watch) is a design change, not a warning-pass fix.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.790Z",
    "resolved_at": null
  },
  {
    "id": 105,
    "kind": "deviation",
    "phase": "04",
    "file": "apps/mobile/lib/db/powersync.ts",
    "line": null,
    "description": "WR-10's transactions buy LOCAL atomicity plus one crud transaction per push (getNextCrudTransaction), so the server applies each group as one aggregate in one Postgres transaction. They do NOT buy atomic convergence against a concurrent push from another device — that remains row-level LWW and no client-side change can alter it. Recorded so a later reader does not mistake the wrapper for a cross-device guarantee.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T10:37:33.873Z",
    "resolved_at": null
  },
  {
    "id": 106,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/workout-screen.spec.ts",
    "line": null,
    "description": "Task 1/2 tracer e2e (start workout, durable checkmark, reload, pager swipe/chip-tap) written but not executed — CLAUDE.md forbids launching a browser unless explicitly requested",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T18:42:33.633Z",
    "resolved_at": null
  },
  {
    "id": 107,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/durability.spec.ts",
    "line": null,
    "description": "Task 3 two-prior-sessions previousSetReference reload case written but not executed — CLAUDE.md forbids launching a browser unless explicitly requested",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T18:42:41.654Z",
    "resolved_at": null
  },
  {
    "id": 108,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/schema-redefinition.spec.ts",
    "line": null,
    "description": "notes->harness_probe rename verified by re-reading the spec's literal replacements only; the schema-redefinition e2e suite itself was not re-run in this session (browser launch restricted)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T18:42:44.927Z",
    "resolved_at": null
  },
  {
    "id": 109,
    "kind": "stub",
    "phase": "05",
    "file": "apps/mobile/components/SetRow.tsx",
    "line": null,
    "description": "Warm-up rows sort ahead of working rows and are excluded from strip/reference counts, but SetRow.tsx does not yet render 05-UI-SPEC's leading 14px W badge — out of Task 2's file scope, deferred to a later plan touching SetRow.tsx",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-23T18:42:48.569Z",
    "resolved_at": null
  },
  {
    "id": 110,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/lib/rest-alert.ts",
    "line": null,
    "description": "expo-notifications' scheduled DATE-trigger alert has not been observed to actually fire and be audible/visible while the app is fully backgrounded and the phone is locked, on a real iOS or Android device — no Xcode/Android SDK on this machine (D-10). Typecheck + doc-confirmed API usage only. Filed against ROADMAP Phase 999.1 per RESEARCH.md Pitfall 4.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T09:05:39.209Z",
    "resolved_at": null
  },
  {
    "id": 111,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/rest-timer.spec.ts",
    "line": null,
    "description": "Rest timer e2e (Notification-constructed-at-target, hidden/visible recompute, +30s, Skip Rest, undo-cancels-alert, permission-denied degraded path) written against the durability Playwright project but not executed this session — CLAUDE.md forbids launching a browser unless explicitly requested.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T09:05:51.583Z",
    "resolved_at": null
  }
]
````
