---
schema_version: 1
open_count: 59
waived_count: 1
fixed_count: 12
total_count: 72
last_updated: 2026-08-21T15:50:48.657Z
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
  }
]
````
