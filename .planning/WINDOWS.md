---
schema_version: 1
open_count: 134
waived_count: 4
fixed_count: 30
total_count: 168
last_updated: 2026-08-29T17:59:13.997Z
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
| 89 | 04 | stub | apps/mobile/lib/db/programs/lifecycle.ts |  | markRoutineReady is implemented and tested but has no UI call site: the UI-SPEC's action sheet enumerates four actions and does not include a draft->ready transition, so nothing in the shipped app can move a routine out of 'draft'. Needs either a UI affordance or an explicit decision that status advances implicitly. | fixed |  | 2026-08-22T13:45:27.350Z | 2026-08-28T15:30:59.775Z |
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
| 109 | 05 | stub | apps/mobile/components/SetRow.tsx |  | Warm-up rows sort ahead of working rows and are excluded from strip/reference counts, but SetRow.tsx does not yet render 05-UI-SPEC's leading 14px W badge — out of Task 2's file scope, deferred to a later plan touching SetRow.tsx | fixed |  | 2026-08-23T18:42:48.569Z | 2026-08-26T10:21:36.756Z |
| 110 | 05 | unrun-verify | apps/mobile/lib/rest-alert.ts |  | expo-notifications' scheduled DATE-trigger alert has not been observed to actually fire and be audible/visible while the app is fully backgrounded and the phone is locked, on a real iOS or Android device — no Xcode/Android SDK on this machine (D-10). Typecheck + doc-confirmed API usage only. Filed against ROADMAP Phase 999.1 per RESEARCH.md Pitfall 4. | open |  | 2026-08-24T09:05:39.209Z |  |
| 111 | 05 | unrun-verify | apps/mobile/e2e/rest-timer.spec.ts |  | Rest timer e2e (Notification-constructed-at-target, hidden/visible recompute, +30s, Skip Rest, undo-cancels-alert, permission-denied degraded path) written against the durability Playwright project but not executed this session — CLAUDE.md forbids launching a browser unless explicitly requested. | open |  | 2026-08-24T09:05:51.583Z |  |
| 112 | 05 | unrun-verify | ops/powersync/sync-rules.yaml |  | personal_record's pull-side round trip (PowerSync Service delivering a pushed PR row to a second device) rests only on the already-shipped sync-rules.yaml SELECT query, not on an observed pull — the self-hosted PowerSync Service was not restarted against the current rules in this plan. A live cross-device pull needs that restart; deferred to ROADMAP Phase 999.1's native/cross-device UAT sweep. | open |  | 2026-08-24T08:59:58.809Z |  |
| 113 | 05 | deviation | apps/mobile/lib/db/session-mutations.ts |  | WarmupSheet.tsx and generateWarmupSets (05-06-PLAN.md Task 2) are not implemented this session: they require importing warmupSets from the @fitness/pr-rules workspace package, which apps/mobile/package.json does not yet declare as a dependency. Adding it needs a package.json edit plus pnpm install, both explicitly forbidden by this wave's seam-ownership dependency freeze (05-06 dispatch: 'If you believe you need a new dependency, HALT and report'). The package itself is real and already built by 05-04 specifically for 05-06's consumption (see 05-04-SUMMARY.md). Needs a human decision to add the workspace dependency, then a follow-up plan to land WarmupSheet.tsx + generateWarmupSets + the WarmupSheet.test.tsx-equivalent coverage. | fixed |  | 2026-08-24T15:15:01.136Z | 2026-08-24T15:43:52.629Z |
| 114 | 05 | deviation | apps/mobile/components/ExercisePage.tsx |  | The stateful ExercisePage wrapper (action bar + Targets/Note/overflow sheets, wired per D-13) is not reachable from the live workout screen this wave: apps/mobile/app/(tabs)/workout.tsx renders ExercisePageView directly (never the ExercisePage wrapper this plan built) and is owned by the concurrent 05-07 worktree this wave, so 05-06 could not wire sessionExerciseId/exerciseId/targets/hasNote/noteText/routineExerciseId/cycleId/onExerciseChanged into it, add the setType field to workout.tsx's ResolvedSetRow rows (so the new warm-up 'W' badge has data to render), or wire the ExerciseStrip's onAddExercise placeholder to ExercisePickerModal (workout.tsx's own comment says 05-06 wires this, but the wave's seam-ownership dispatch explicitly forbids editing workout.tsx). All new components/mutations are built, typechecked and unit-tested via direct invocation; the remaining work is exclusively wiring workout.tsx to use ExercisePage instead of ExercisePageView, and threading the listed props through useWorkoutScreen. A follow-up plan (or 05-10, which already touches workout.tsx for session-mode integration) should close this gap. | fixed |  | 2026-08-24T15:15:15.819Z | 2026-08-24T15:43:52.727Z |
| 115 | 05 | deviation | apps/mobile/e2e/workout-screen.spec.ts |  | No new mid-session add/swap/remove/reorder e2e case was added to workout-screen.spec.ts this session. Task 3's acceptance criterion calls for a case adding an exercise mid-session and asserting the strip grows by one chip, but the strip's Add chip is wired to workout.tsx's onAddExercise handler, which is a documented no-op this wave (see WINDOWS #114) — an e2e case against that flow would fail for a reason unrelated to this plan's own code, so none was authored. Existing e2e cases were left untouched per this session's CLAUDE.md browser-testing prohibition (no browser/e2e run performed). Needs authoring once WINDOWS #114's workout.tsx wiring gap closes. | fixed |  | 2026-08-24T15:15:22.016Z | 2026-08-24T15:45:47.259Z |
| 116 | 05 | deviation | apps/mobile/components/SessionActionSheet.tsx |  | The overflow sheet's Reorder row has no drag-and-drop UI flow this phase: 05-UI-SPEC.md's E10 lists Reorder as one of the four fixed rows but specifies no interaction for it (no drag surface is defined anywhere in the phase's UI-SPEC for the exercise strip or a reorder screen), so ExercisePage.tsx's handleSessionAction dismisses the sheet on 'reorder' as a documented no-op. reorderSessionExercises itself is implemented and unit-tested (contiguous order_index over non-removed rows) — only the UI trigger is missing, pending a UI-SPEC amendment or a follow-up plan that defines the drag surface. | fixed |  | 2026-08-24T15:15:28.184Z | 2026-08-26T10:21:36.421Z |
| 117 | 05 | deviation | apps/mobile/components/ExercisePage.tsx |  | The overflow sheet's Swap action reuses the unmodified Phase 4 ExercisePickerModal (multi-select) rather than the shipped SwapSuggestionList component, resolving a contradiction inside 05-06-PLAN.md's own Task 3 action text ('Swap opens SwapSuggestionList backed by smart-swap.ts' vs. 'this sheet's Swap action... open the unmodified Phase 4 ExercisePickerModal'). SwapSuggestionList's rows are Links that navigate to /exercises/[id] for read-only browsing, not swap-execution capable without modification, and 'reuse ExercisePickerModal through its existing props, do NOT modify it' was the more specific, actionable, unmodified-reuse-consistent instruction. Only the first picked exercise is used as the swap target; the modal's own copy ('Add exercises to {dayName}') was not written for a swap context and reads slightly oddly ('Add exercises to a replacement for {exerciseName}') since ExercisePickerModal is out of this plan's file scope to fix. Flagged as a minor UX rough edge, not a functional defect — swapSessionExercise itself is fully implemented and unit-tested. | open |  | 2026-08-24T15:15:34.805Z |  |
| 118 | 05 | deviation | apps/mobile/components/NoteSheet.tsx |  | NoteSheet supports all three note levels (set/exercise/session) and setNote writes all three columns independently, but this plan wires only the exercise-level entry point (the action bar's Note button) — 05-UI-SPEC.md's Per-Exercise Action Bar section defines no set-level or session-level note trigger for this phase. Set/session-level notes are a tested, reusable capability with no UI surface yet; a future plan can add a long-press-on-set-row or session-header trigger without touching NoteSheet.tsx or session-mutations.ts. | fixed |  | 2026-08-24T15:15:40.631Z | 2026-08-26T10:21:36.235Z |
| 119 | 05 | unrun-verify | apps/mobile/e2e/durability.spec.ts |  | Recovery case (warm-ups + two completed working sets + an open pause) extended into the durability suite but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- durability.spec.ts. | open |  | 2026-08-24T15:17:18.929Z |  |
| 120 | 05 | unrun-verify | apps/mobile/e2e/session-lifecycle.spec.ts |  | Pause/resume header-bar freeze, finish-stamps-completed, and discard-confirmation-then-write cases written against the durability Playwright project but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- session-lifecycle.spec.ts. | open |  | 2026-08-24T15:17:23.564Z |  |
| 121 | 999.1 | unrun-verify | apps/mobile/lib/db/session-lifecycle.ts |  | Native-only observations for 05-07: pause behaviour under a real OS backgrounding event, and Home/Workout tab focus-effect semantics on a physical iOS/Android device, cannot be observed on this machine (no Xcode, no Android SDK, D-10). Deferred to the Phase 999.1 native/cross-device UAT sweep. | open |  | 2026-08-24T15:17:30.385Z |  |
| 122 | 05 | unrun-verify | apps/mobile/e2e/workout-screen.spec.ts |  | The mid-session-add-exercise case (adding via the strip's Add Exercise chip and asserting the strip grows by one chip) was written per 05-06-PLAN.md Task 3's acceptance criteria but not executed this session per the project's browser-testing-only-on-request rule; needs a real pnpm --filter mobile test:e2e:durability run to confirm the ExercisePickerModal getPowerSync()/harness database routing (useProductionDb) actually surfaces catalog rows to select. | open |  | 2026-08-24T15:45:52.808Z |  |
| 123 | 05 | deviation | apps/mobile/app/(tabs)/workout.tsx |  | cycleId is passed as null for every exercise in ExercisePageData: no schema column persists which program cycle a live session started from (workout_session/session_exercise have no cycle_id), so TargetsSheet's write-back path (writeBackTargets/resolveWriteBackTarget) always resolves to the base routine_exercise row for a programmed exercise rather than a cycle-specific routine_exercise_cycle_target override, until cycle identity is threaded through startWorkoutFromProgram/session creation. | fixed |  | 2026-08-24T15:46:03.332Z | 2026-08-26T10:21:32.457Z |
| 124 | 05 | unrun-verify | apps/mobile/e2e/history.spec.ts |  | View/rename/duplicate/delete a past workout, plus discarded-session-hidden, written against the real @powersync/web engine but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- history.spec.ts. | open |  | 2026-08-24T16:26:58.531Z |  |
| 125 | 999.1 | unrun-verify | apps/mobile/components/SessionHistoryRow.tsx |  | Native FlashList recycling behaviour on the new SessionHistoryRow (the same failure class the ExerciseImageTile WINDOWS entry recorded in Phase 3) cannot be observed on this machine (no Xcode, no Android SDK). Deferred to the Phase 999.1 native/cross-device UAT sweep. | open |  | 2026-08-24T16:27:06.639Z |  |
| 126 | 05 | deviation | apps/mobile/e2e/history.spec.ts |  | 05-09-PLAN.md Task 3's e2e prose says duplicating a row makes 'a fourth row appear' in History, but duplicateSession funnels through startSession (D-33), which always creates the copy in_progress — and Task 1's own shown/hidden rule excludes in-progress sessions from History. The copy therefore does NOT appear as a fourth History row; it surfaces on the Workout tab instead. history.spec.ts asserts the correct (in-progress, absent from loadHistoryPage) behavior rather than the plan's literal prose, which contradicts must_haves established earlier in the same plan. | open |  | 2026-08-24T16:27:14.738Z |  |
| 127 | 05 | unrun-verify | apps/mobile/e2e/workout-summary.spec.ts |  | Workout-summary e2e (finish a session, assert trained muscles, PR rows and per-exercise e1RM breakdown, then correct a number before dismissing) written but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- workout-summary.spec.ts. | fixed |  | 2026-08-24T18:47:51.143Z | 2026-08-29T09:04:21.227Z |
| 128 | 05 | unrun-verify | apps/mobile/e2e/session-edit.spec.ts |  | session-edit.spec.ts (05-10) written and typechecked but not executed — browser-testing-only-on-request. Needs pnpm --filter mobile test:e2e:durability -- session-edit.spec.ts. | open |  | 2026-08-25T06:52:48.979Z |  |
| 129 | 05 | unrun-verify | apps/mobile/components/SessionDateField.tsx |  | Native date-picker presentation (the calendar grid's on-device rendering) and native OS font-scale wrapping on the editing header (formatEditingHeader) are unverifiable on this machine — no Xcode/Android SDK/simulator available. Deferred to ROADMAP Phase 999.1's native/cross-device sweep. | open |  | 2026-08-25T06:52:59.973Z |  |
| 130 | 05 | unmet-truth | apps/mobile/lib/db/test-support.ts | 187 | D-33's single-funnel claim ('exactly one insert(workoutSession) in apps/mobile/') holds for production code (log-set.ts's startSession is the only real creation path) but a pre-existing test-only seeding helper, seedPriorHeaviestSet (predates 05-10, used by workout-summary.spec.ts's real-PR fixture), performs a second, direct insert(workoutSession) to seed a days-old prior session outside any funnel. Out of scope for 05-10 (not caused by this plan's changes); left as-is per the scope-boundary rule. | open |  | 2026-08-25T06:53:04.949Z |  |
| 131 | 05 | deviation | apps/mobile/lib/db/schema.ts,apps/api/src/db/schema/session.ts |  | CR-02 review-fix intentionally did not add a unique (session_exercise_id, set_index) constraint to either schema, though REVIEW.md's fix suggestion mentioned it as a belt-and-suspenders option. The db.transaction wrap around logSet's select-max-then-insert (log-set.ts) already closes the race at its source. Adding the unique constraint would require a live Postgres db:push (explicitly out of scope for the review-fix agent) and PowerSync schema-versioning verification on the SQLite mirror (untested here). Revisit if a future finding shows the transaction-only fix insufficient. | open |  | 2026-08-25T07:35:52.441Z |  |
| 132 | 05 | unrun-verify | apps/api/test/schema-parity.e2e-spec.ts |  | 05-11 Task 3 (live drizzle-kit push + db:verify + client schema-redefinition e2e) not run — this worktree has no .env (gitignored, not copied into git worktrees) and the harness's permission settings deny writing one; DATABASE_URL unresolvable from the sandbox even though Postgres port 5432 is reachable. Requires human to restore .env in this worktree (or run Task 3 outside the worktree) before merge. | open |  | 2026-08-25T16:42:58.122Z |  |
| 133 | 05 | deviation | apps/mobile/lib/db/test-support.ts |  | All 10 e2e durability specs failed test collection with 'No tests found' because test-support.ts (imported only for the DURABILITY_HARNESS_GLOBAL string constant) transitively imports log-set.ts, which imports the bare './powersync' — Node's ESM resolver has no platform-extension awareness and resolves that to the native powersync.ts, whose @powersync/react-native import chain is invalid under strict Node ESM (extensionless dist re-exports). This was not caused by any plan; it was discovered and fixed while resolving 05-11's Task 3 halt, by extracting DURABILITY_HARNESS_GLOBAL into a dependency-free leaf module (durability-harness-key.ts) and repointing all 10 specs at it. It unblocks the whole durability suite and is the root cause of 05-VERIFICATION.md's 2 behavior_unverified truths. | open |  | 2026-08-25T17:19:44.653Z |  |
| 134 | 05 | deviation | apps/mobile/components/TargetsSheet.tsx |  | 05-12 Task 3: writeBackTargets/setSessionExerciseTargets always defaulted to getPowerSync(), ignoring whichever db the screen was actually reading from (only visible once a real isolated-db browser test exercised the write path) — threaded an optional db prop through WorkoutScreenView -> ExercisePage -> TargetsSheet, matching the existing writeDb pattern already used for logSet/startSession. | fixed |  | 2026-08-26T08:09:16.699Z | 2026-08-26T08:09:40.530Z |
| 135 | 05 | deviation | apps/mobile/components/NoteSheet.tsx |  | 05-14 orchestrator ruling: NoteSheet.tsx (both mounts) and the new session-level NoteSheet in workout.tsx thread an optional db prop into setNote, sharing WINDOWS #134's getPowerSync()-default gap (NoteSheet/WarmupSheet/swap/remove were flagged by 05-12 as sharing the identical latent defect, out of that plan's scope). This modifies NoteSheet.tsx despite 05-14-PLAN.md's literal 'NoteSheet.tsx and session-mutations.ts are not modified' prohibition; the orchestrator's dispatch explicitly ruled the prohibition's intent is 'do not re-invent note capability', not 'never touch the file', and authorized this narrow db-threading parity fix. session-mutations.ts and WorkoutSummary.tsx remain untouched. | open |  | 2026-08-26T08:26:27.417Z |  |
| 136 | 05 | deviation | apps/mobile/e2e/session-notes.spec.ts |  | 05-14 Task 3 diagnosis (informational, not fixed here — out of this plan's scope): LOG-13's shouldAutoAdvance (lib/session/auto-advance.ts) treats 'every EXISTING working set on the exercise is complete' as the advance trigger, not 'every TARGET set is complete' — after logging just the FIRST of a seeded 3-target exercise's working sets, that predicate is trivially true (one row exists, it is complete), so the pager auto-advances to the next exercise immediately. This is very likely the actual root cause of the pre-existing 'known-failing' e2e specs (workout-screen.spec.ts and others) that log one set then assert against 'Mark set incomplete' expecting to still be on the same exercise's page — they are actually asserting against the NEXT exercise's still-empty draft after an unaccounted-for auto-advance, not a broken completion write. session-notes.spec.ts worked around it locally by re-selecting the first exercise's strip chip after completing its set; the shared spec files were left untouched per this plan's scope boundary (05-16's job). | open |  | 2026-08-26T08:48:16.589Z |  |
| 137 | 05 | deviation | apps/mobile/components/DragHandle.tsx |  | 05-15 Task 2: DragHandle.tsx/DragHandle.web.tsx gained an optional rowHeight prop threaded into computeDropTarget, despite the plan's own <verification> line naming both files as staying unmodified. Task 1 added computeDropTarget's optional rowHeight (font-scale-aware drag unit, E12 must-have), but E12 also requires the ReorderExercisesSheet's measured row height to actually govern the drop arithmetic, and the sheet reuses the real stateful DragHandle (per the dispatch's explicit 'reuse DragHandle, do not reinvent a drag surface' instruction) rather than reimplementing the gesture. The only way to satisfy both constraints was an additive, default-preserving optional prop (mirroring Task 1's own reversible pattern) — undefined at every existing ExerciseSlotRow call site, so Phase 4's reorder callers are byte-identical to before. Existing DragHandle/ExerciseSlotRow unit tests (53 cases) still pass unchanged. | open |  | 2026-08-26T09:03:21.212Z |  |
| 138 | 05 | deviation | apps/mobile/components/ExercisePage.tsx |  | 05-15 Task 3: e2e/reorder-exercises.spec.ts's Remove flow (needed to prove a removed exercise is excluded from the reorder sheet) surfaced the same getPowerSync()-default gap 05-12/05-14 found and fixed for TargetsSheet/NoteSheet (WINDOWS #134/#135) — ExercisePage.tsx's handleConfirmRemove called removeSessionExercise(sessionExerciseId) with no db argument, so the write always resolved the production getPowerSync() singleton instead of the harness's isolated per-test database; the removal silently landed in the wrong SQLite file and the spec's raw read never saw removed_at set. Fixed by passing db ?? getPowerSync() through, matching the pattern already used for Targets/Note/Reorder. handleSwapPick's swapSessionExercise call shares the identical latent defect but is unexercised by this plan's tests, left unfixed and flagged for whichever future plan first browser-tests the swap path. | fixed |  | 2026-08-26T09:21:06.894Z | 2026-08-27T16:38:49.593Z |
| 139 | 05 | deviation | apps/mobile/components/ExercisePickerModal.tsx |  | The picker's per-row Pressable (onToggle) wraps ExerciseListRow's own Pressable — a real button nested inside another button. Browsers split this into two sibling elements on parse, both matching the row's accessible name; workout-screen.spec.ts's 'adding an exercise mid-session' case works around it with an aria-label attribute selector rather than a role+name locator. Discovered running the durability suite for real (05-16); out of that plan's file scope (ExercisePickerModal.tsx). Needs a real fix: either drop the outer selection Pressable and let ExerciseListRow itself own the press/selection affordance, or vice versa. | open |  | 2026-08-26T10:21:03.759Z |  |
| 140 | 05 | deviation | apps/mobile/playwright.config.ts |  | 05-16's 'confirmed across two consecutive clean full-suite runs' did not reproduce under independent re-verification (orchestrator got 32/1 twice, different test each time). Root cause: the durability project runs with Playwright's default worker count (4 on this machine) despite fullyParallel:false, which only serializes cases WITHIN one spec file — multiple spec FILES still ran concurrently, all against the single shared webServer/Metro process, causing real CPU/server contention that surfaced as random page.goto/page.reload timeouts. Fixed by pinning workers:1 on the durability project; also fixed a missed ambiguous Done locator in workout-summary.spec.ts (session-edit.spec.ts precedent). Reproduced 33/33 across three consecutive full-suite runs post-fix. | fixed |  | 2026-08-26T11:15:15.039Z | 2026-08-26T11:15:23.069Z |
| 141 | 06 | unrun-verify | apps/mobile/app/gym-profiles/index.tsx |  | 06-03 plan <verification> human-check: Profile tab Gyms section / Gym Profiles list / archive-to-collapsed-section — not run, no browser/simulator session available in this executor pass | waived | Deferred to ROADMAP Phase 999.2 (human verification sweep, web target) by user decision 2026-08-28 during /gsd-verify-work 06; functional behaviour covered by passing e2e specs | 2026-08-27T14:44:46.168Z | 2026-08-28T07:56:07.108Z |
| 142 | 06 | unrun-verify | apps/mobile |  | 06-04 human-check not run: create a gym in lb, add plates, add a machine, save, reopen, on web target — no browser/simulator session available in this executor pass | waived | Deferred to ROADMAP Phase 999.2 (human verification sweep, web target) by user decision 2026-08-28 during /gsd-verify-work 06; functional behaviour covered by passing e2e specs | 2026-08-27T15:48:46.047Z | 2026-08-28T07:56:07.296Z |
| 143 | 06 | unrun-verify | apps/mobile/app/(tabs)/workout.tsx |  | Plan 06-07's <human-check> (session menu row order: pause/resume, session note, switch gym, discard; visual accent confirmation on switching gyms) was not run interactively — no browser/simulator UI session available in this sandboxed worktree beyond the automated Playwright e2e run (switch-gym.spec.ts, which passed). Automated tsc, unit suite (1473/1473) and the durability e2e spec all green; the human visual confirmation is deferred to UAT. | waived | Deferred to ROADMAP Phase 999.2 (human verification sweep, web target) by user decision 2026-08-28 during /gsd-verify-work 06; functional behaviour covered by passing e2e specs | 2026-08-27T16:10:35.408Z | 2026-08-28T07:56:07.437Z |
| 144 | 06 | deviation | apps/mobile/lib/navigation/root-stack.tsx |  | 06-03 Task 2: the plan named apps/mobile/app/_layout.tsx as the file to declare the gym-profiles signed-in route guard, but that file only calls renderRootStack(signedIn) — the real Stack.Protected/Stack.Screen declarations live in lib/navigation/root-stack.tsx (exercises/_layout.tsx's own comment says do not edit app/_layout.tsx). Registered gym-profiles there instead, matching the exercises/programs precedent; root-stack.tsx was not in 06-03's declared files_modified list. | open |  | 2026-08-27T16:56:16.487Z |  |
| 145 | 06 | deviation | apps/mobile/app/gym-profiles/index.tsx |  | 06-04 Task 3: gym-profiles/index.tsx (06-03's file, not in 06-04's declared files_modified) gained optional userId/db override props so the durability harness could mount the real GymProfilesScreen against an isolated test database instead of the production getPowerSync() singleton. Extending a prior plan's output for a genuine harness-seam need, both props undefined for every real navigation. | open |  | 2026-08-27T16:56:23.888Z |  |
| 146 | 06 | deviation | apps/mobile/components/NumericKeypad.tsx |  | 06-05 Task 2: NumericKeypad.tsx (not in either task's declared files) type-aliases PlateStripBandData = PlateStripProps and constructed the old {inventory, targetKg, unit} shape; Task 2's rewrite of PlateStripView to take an already-resolved EquipmentBandState broke it. Replaced the type alias with an explicit PlateStripBandData interface {state, unit, onNeighbourPress, onRecoveryPress} and updated the one JSX call site — a genuine typecheck blocker, fixed within the same commit. | open |  | 2026-08-27T16:56:26.514Z |  |
| 147 | 06 | deviation | apps/mobile/app/(tabs)/workout.tsx |  | 06-06 Task 3: equipmentType/resolvedInventory/equipmentProfileId were threaded from workout.tsx into ExercisePage even though neither workout.tsx nor EditingWorkoutScreen.tsx was in 06-06's declared files_modified — ExercisePage's new required props had no other data source, and 06-05's own SUMMARY had already flagged workout.tsx as the intended 06-06 integration point. EditingWorkoutScreen.tsx's historical-editing call site passes null for all three (D-11). | open |  | 2026-08-27T16:56:30.246Z |  |
| 148 | 07 | deviation | apps/mobile/lib/db/session-mutations.ts |  | 07-06-PLAN.md Task 2 acceptance criterion 'grep -c routineExercise is 0' is unsatisfiable as literally written — the file already legitimately imports/uses routineExercise (13 pre-existing occurrences) for Phase 4/5 writeBackTargets/resolveWriteBackTarget target write-back, unrelated to this plan. Verified instead that formSuperset/detachSuperset themselves reference only sessionExercise (D-16 intent honored). | open |  | 2026-08-28T10:48:02.164Z |  |
| 149 | 04 | deviation | ops/powersync/sync-rules.yaml |  | routine_day stream query deliberately not filtered by archived_at, against D-29's literal text — a filter would delete an archived day from every device that did not perform the archive, making restore unreachable; withdrawn/resolved as D-33 in 04-CONTEXT.md | open |  | 2026-08-28T15:18:35.060Z |  |
| 150 | 04 | unrun-verify | apps/mobile/app/(tabs)/programs.tsx |  | The four day-page controls (Duplicate, Archive, Restore, plus the pre-existing Remove) have been observed on neither iOS nor Android — no Xcode, no Android SDK in this worktree (ROADMAP Phase 999.1); the web observation lands in 04-15. | open |  | 2026-08-28T15:29:10.796Z |  |
| 151 | 04 | unrun-verify | apps/mobile/e2e/program-day-lifecycle.spec.ts |  | Duplicate/archive/restore day and time-off cycle conversion have been observed only in a web browser (Chromium via Playwright) — no Xcode, no Android SDK in this worktree (ROADMAP Phase 999.1 native sweep). | open |  | 2026-08-28T16:14:09.256Z |  |
| 152 | 07 | deviation | apps/mobile/components/ExercisePage.tsx |  | setTypeError set on a rejected formSuperset/detachSuperset write is not yet visibly rendered by SessionActionSheet (no errorMessage prop; SessionActionSheet.tsx was out of 07-07's file scope) | open |  | 2026-08-28T17:09:09.731Z |  |
| 153 | 07 | deviation | apps/mobile/e2e/reorder-exercises.spec.ts |  | CORRECTED 2026-08-28: this was NOT a pre-existing order-dependent flake and it did NOT pass in isolation — it reproduced at roughly one run in three with the spec run alone. Root cause: openReorderSheet waited only for the sheet heading to be visible, but the sheet measures its first row in onLayout and stores that height in state, so it renders once at the SLOT_ROW_HEIGHT fallback and again at the measured height, shifting every row between them. A boundingBox() taken across that shift named coordinates the drag handle had already left, mouse.down() landed on nothing, and no pointerdown ever reached DragHandle.web.tsx — so no drop was committed and the assertion failed against an unchanged order rather than a wrong one. Instrumentation confirmed commitDrop computed toIndex 0 correctly on every run where the pointer actually went down. Phase 7's heavier ExercisePage widened the settle window that had previously hidden it. Fixed by hovering each handle before measuring, which waits for actionability (element still across two consecutive animation frames). 15/15 repeat runs green, full durability suite 51/51. | fixed |  | 2026-08-28T18:00:51.116Z | 2026-08-28T21:00:00.000Z |
| 154 | 08 | unrun-verify | packages/progression-engine/src/index.ts |  | Both parity runners (package + api-side spec.ts + mobile-side test.ts) execute under Node/V8, never on-device Hermes, so a Hermes-specific arithmetic divergence would not be caught by any of the three (08-RESEARCH.md Assumption A4); this machine has no Xcode or Android SDK to run a real RN Hermes build (standing project limitation). | open |  | 2026-08-28T22:48:47.103Z |  |
| 155 | 09 | unrun-verify | apps/mobile/components/TrendChart.tsx |  | TrendChart renders on iOS/Android is unverified: this machine has neither Xcode nor the Android SDK, so react-native-svg's native build was never exercised. Web rendering is proven by e2e/exercise-performance.spec.ts. Verify at ROADMAP Phase 999.1. | open |  | 2026-08-29T08:33:00.632Z |  |
| 156 | 09 | unrun-verify | apps/mobile/app/exercise-performance.tsx |  | Subjective visual review of the chart, its two-label axis row and the ANLY-10 caption at the maximum OS font scale is unobservable in automation. R16 (no text inside the SVG) is enforced by a grep gate and the axis row wraps, but legibility itself needs a human. Verify at ROADMAP Phase 999.2. | open |  | 2026-08-29T08:33:05.293Z |  |
| 157 | 09 | deviation | packages/analytics-engine/src/trend-series.ts |  | trend-series: a bodyweight-only week qualifies with volume 0 rather than being omitted — the plan asserted a qualifying bucket is never zero on any metric; zero external load is a measured total, and omitting the bucket would erase a week the lifter really trained. The delta guards the zero denominator with not-comparable. | open |  | 2026-08-29T08:48:50.588Z |  |
| 158 | 09 | unrun-verify | apps/mobile/app/records.tsx |  | Records screen rendering on iOS/Android: this machine has neither Xcode nor the Android SDK, so RecordRow and the metric switch were never exercised natively. Web rendering is proven green. ROADMAP Phase 999.1. | open |  | 2026-08-29T09:03:53.664Z |  |
| 159 | 09 | unrun-verify | apps/mobile/components/RecordRow.tsx |  | Subjective visual review of the Records screen at maximum OS font scale: the absence of a line clamp on both row lines and the chip growth rule are grep-enforced and unit-asserted, but legibility itself needs a human. ROADMAP Phase 999.2. | open |  | 2026-08-29T09:03:57.654Z |  |
| 160 | 09 | unrun-verify | apps/mobile/components/WeeklyProgressCard.tsx |  | Last 7 Days card and History trend card rendering on iOS/Android: this machine has neither Xcode nor the Android SDK, so neither card, nor the TrendChart inside the trend card, was ever exercised natively. Web rendering is proven green across 78 durability cases. ROADMAP Phase 999.1. | open |  | 2026-08-29T11:39:28.964Z |  |
| 161 | 09 | unrun-verify | apps/mobile/components/HistoryTrendCard.tsx |  | Subjective visual review at maximum OS font scale of the Last 7 Days tracks, the History trend card's headline and delta chip, and the exercise-performance range switch. Wrap-and-grow is grep-enforced and unit-asserted; legibility itself needs a human. ROADMAP Phase 999.2. | open |  | 2026-08-29T11:39:29.198Z |  |
| 162 | 09 | deviation | apps/mobile/components/WeeklyProgressCard.tsx |  | Progress tracks originally carried accessibilityValue, which react-native-web 0.21 no longer maps, so each track rendered role=progressbar with an aria-label but no aria-valuemin/max/now — silent to a screen reader on web while the prop-level unit test stayed green. Fixed to the aria-* spelling (accepted by React Native since 0.71) so one set of props serves both targets. Caught only because 09-04's spec was executed rather than authored. | fixed |  | 2026-08-29T11:39:29.402Z | 2026-08-29T11:39:41.680Z |
| 163 | 10 | deviation | apps/api/src/db/schema/records.ts |  | personal_record.logged_set_id has no onDelete cascade/set-null; deleting a logged_set or workout_session that a server-reconciled PR row references now hard-fails with an FK violation (10-02 populates this column with real data for the first time). Needs a schema decision (cascade vs set-null) in a follow-up plan; 10-02's own e2e fixtures route around it with countsTowardRecords-excluded set types rather than touching the forbidden schema file. | open |  | 2026-08-29T15:39:49.312Z |  |
| 164 | 10 | deviation | apps/mobile/lib/db/muscle-volume-query.ts |  | Known residual (planner-flagged): an offline EDIT of an already-synced session dated on or before the analytics_watermark shows its pre-edit contribution until the edit reaches the server — neither the strict-greater-than date clause nor the null-owner clause overlays it. Self-corrects on next sync; never fabricates a number. Follow-up if it ever matters: derive the overlay set from PowerSync's pending crud queue instead of a date comparison. | open |  | 2026-08-29T15:29:04.201Z |  |
| 165 | 10 | unrun-verify | apps/mobile/components/MuscleHeatmap.tsx |  | Muscle Map native (iOS/Android) rendering unobservable on this machine (no Xcode, no Android SDK) — both react-native-svg figures, the window switch and the drill-down sheet are proven on web only via the executed Playwright durability spec. Deferred to ROADMAP Phase 999.1. | open |  | 2026-08-29T17:08:21.035Z |  |
| 166 | 10 | unrun-verify | apps/mobile/components/MuscleHeatmap.tsx |  | Subjective visual review of the intensity scale and the untrained-versus-lowest-real-intensity distinction at maximum OS font scale — the categorical hue split (R22/D-10) is grep-enforced and unit-asserted, but whether it is legible, including for a colourblind reader, is human judgment. Deferred to ROADMAP Phase 999.2. | open |  | 2026-08-29T17:08:31.218Z |  |
| 167 | 10 | unrun-verify | apps/mobile/app/muscle-map.tsx |  | Subjective visual review of the Training Volume disambiguation caption and the stale-rollup caption at maximum OS font scale — wrap-and-grow is grep-enforced, but whether the two captions read as informational rather than alarming is human judgment (R25). Deferred to ROADMAP Phase 999.2. | open |  | 2026-08-29T17:08:37.783Z |  |
| 168 | 10 | deviation | apps/mobile/e2e/muscle-map.spec.ts |  | 10-07's executed browser evidence confirms the D-01 overlay's post-watermark clause and the null-owner backfill clause both render correctly end to end against a real @powersync/web database (muscle-map.spec.ts's overlay case: rollup + post-watermark session + pre-watermark null-owner session sum correctly, disclosed by count). It does not re-exercise the already-synced-session-edit residual recorded at WINDOWS #164 (a different case: an EDIT of a session whose user_id was already set before the edit) — that residual remains open and unchanged by this plan. | open |  | 2026-08-29T17:09:08.671Z |  |
| 169 | 10 | unrun-verify | apps/api |  | 10-07's phase-level verification names 'pnpm --filter api test:e2e exits 0 -- nothing in this plan touches the server' as a check, but the suite could not be run in this worktree: drizzle-kit push fails with 'Either connection url or host, database are required for PostgreSQL database connection' because apps/api/.env is permission-restricted from this sandbox and carries no DATABASE_URL (same class of block as WINDOWS #47/#48). Confidence it is unaffected rests on file-scope reasoning (10-07 touches apps/mobile and .planning only, zero apps/api files across all three commits), not a fresh green run. | fixed |  | 2026-08-29T17:11:40.245Z | 2026-08-29T17:59:05.816Z |
| 170 | 10 | unrun-verify | apps/api/test/analytics-rollup.e2e-spec.ts |  | The CR-01 regression test added in commit 83ddc37 -- a workout_session PATCH carrying neither local_date nor started_at (completeSession's real payload shape) against a session stored at local_date 2026-01-10, asserting the watermark does not advance to today -- was written and hand-reviewed but never executed. Docker/colima is unavailable on this machine (colima status: 'error retrieving current runtime: empty value'), so the whole apps/api e2e suite could not run. This is the proof for a BLOCKER-severity fix to the analytics watermark, so it carries more weight than the general suite gap at WINDOWS #169: run 'pnpm --filter api test:e2e' once Postgres is reachable and confirm this case is green before trusting the watermark on any non-today session. | fixed |  | 2026-08-29T17:31:52.108Z | 2026-08-29T17:59:13.997Z |
| 171 | 10 | deviation | apps/mobile/app/muscle-map.tsx |  | Code review WR-01 ('loadHasAnyHistory accepts userId but never filters on it') is a FALSE POSITIVE and its fix was applied then reverted (bcde0c0 -> c219dfa). Adding eq(workoutSession.userId, userId) broke 5 of 6 muscle-map durability specs. Reason: workout_session.user_id is assigned SERVER-side, so a locally-logged, not-yet-synced session legitimately carries user_id NULL -- seedMuscleMapHistory reproduces exactly this (userId: seededSession.syncedToServer ? input.userId : null). Filtering the local read by userId therefore tells a lifter whose only history is unsynced that they have no history at all, collapsing the screen to its no-history empty state. In this local-first architecture the on-device DB holds only the signed-in user's rows by PowerSync sync-rule construction, so a userId filter on a LOCAL workoutSession read is redundant AND wrong. Do not re-apply. Rollup/watermark reads in muscle-volume-query.ts do scope by userId -- that is a different table and not a precedent for this one. | open |  | 2026-08-29T17:41:17.594Z |  |

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
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-22T13:45:27.350Z",
    "resolved_at": "2026-08-28T15:30:59.775Z"
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
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-23T18:42:48.569Z",
    "resolved_at": "2026-08-26T10:21:36.756Z"
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
  },
  {
    "id": 112,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "ops/powersync/sync-rules.yaml",
    "line": null,
    "description": "personal_record's pull-side round trip (PowerSync Service delivering a pushed PR row to a second device) rests only on the already-shipped sync-rules.yaml SELECT query, not on an observed pull — the self-hosted PowerSync Service was not restarted against the current rules in this plan. A live cross-device pull needs that restart; deferred to ROADMAP Phase 999.1's native/cross-device UAT sweep.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T08:59:58.809Z",
    "resolved_at": null
  },
  {
    "id": 113,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/lib/db/session-mutations.ts",
    "line": null,
    "description": "WarmupSheet.tsx and generateWarmupSets (05-06-PLAN.md Task 2) are not implemented this session: they require importing warmupSets from the @fitness/pr-rules workspace package, which apps/mobile/package.json does not yet declare as a dependency. Adding it needs a package.json edit plus pnpm install, both explicitly forbidden by this wave's seam-ownership dependency freeze (05-06 dispatch: 'If you believe you need a new dependency, HALT and report'). The package itself is real and already built by 05-04 specifically for 05-06's consumption (see 05-04-SUMMARY.md). Needs a human decision to add the workspace dependency, then a follow-up plan to land WarmupSheet.tsx + generateWarmupSets + the WarmupSheet.test.tsx-equivalent coverage.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T15:15:01.136Z",
    "resolved_at": "2026-08-24T15:43:52.629Z"
  },
  {
    "id": 114,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/ExercisePage.tsx",
    "line": null,
    "description": "The stateful ExercisePage wrapper (action bar + Targets/Note/overflow sheets, wired per D-13) is not reachable from the live workout screen this wave: apps/mobile/app/(tabs)/workout.tsx renders ExercisePageView directly (never the ExercisePage wrapper this plan built) and is owned by the concurrent 05-07 worktree this wave, so 05-06 could not wire sessionExerciseId/exerciseId/targets/hasNote/noteText/routineExerciseId/cycleId/onExerciseChanged into it, add the setType field to workout.tsx's ResolvedSetRow rows (so the new warm-up 'W' badge has data to render), or wire the ExerciseStrip's onAddExercise placeholder to ExercisePickerModal (workout.tsx's own comment says 05-06 wires this, but the wave's seam-ownership dispatch explicitly forbids editing workout.tsx). All new components/mutations are built, typechecked and unit-tested via direct invocation; the remaining work is exclusively wiring workout.tsx to use ExercisePage instead of ExercisePageView, and threading the listed props through useWorkoutScreen. A follow-up plan (or 05-10, which already touches workout.tsx for session-mode integration) should close this gap.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T15:15:15.819Z",
    "resolved_at": "2026-08-24T15:43:52.727Z"
  },
  {
    "id": 115,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/e2e/workout-screen.spec.ts",
    "line": null,
    "description": "No new mid-session add/swap/remove/reorder e2e case was added to workout-screen.spec.ts this session. Task 3's acceptance criterion calls for a case adding an exercise mid-session and asserting the strip grows by one chip, but the strip's Add chip is wired to workout.tsx's onAddExercise handler, which is a documented no-op this wave (see WINDOWS #114) — an e2e case against that flow would fail for a reason unrelated to this plan's own code, so none was authored. Existing e2e cases were left untouched per this session's CLAUDE.md browser-testing prohibition (no browser/e2e run performed). Needs authoring once WINDOWS #114's workout.tsx wiring gap closes.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T15:15:22.016Z",
    "resolved_at": "2026-08-24T15:45:47.259Z"
  },
  {
    "id": 116,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/SessionActionSheet.tsx",
    "line": null,
    "description": "The overflow sheet's Reorder row has no drag-and-drop UI flow this phase: 05-UI-SPEC.md's E10 lists Reorder as one of the four fixed rows but specifies no interaction for it (no drag surface is defined anywhere in the phase's UI-SPEC for the exercise strip or a reorder screen), so ExercisePage.tsx's handleSessionAction dismisses the sheet on 'reorder' as a documented no-op. reorderSessionExercises itself is implemented and unit-tested (contiguous order_index over non-removed rows) — only the UI trigger is missing, pending a UI-SPEC amendment or a follow-up plan that defines the drag surface.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T15:15:28.184Z",
    "resolved_at": "2026-08-26T10:21:36.421Z"
  },
  {
    "id": 117,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/ExercisePage.tsx",
    "line": null,
    "description": "The overflow sheet's Swap action reuses the unmodified Phase 4 ExercisePickerModal (multi-select) rather than the shipped SwapSuggestionList component, resolving a contradiction inside 05-06-PLAN.md's own Task 3 action text ('Swap opens SwapSuggestionList backed by smart-swap.ts' vs. 'this sheet's Swap action... open the unmodified Phase 4 ExercisePickerModal'). SwapSuggestionList's rows are Links that navigate to /exercises/[id] for read-only browsing, not swap-execution capable without modification, and 'reuse ExercisePickerModal through its existing props, do NOT modify it' was the more specific, actionable, unmodified-reuse-consistent instruction. Only the first picked exercise is used as the swap target; the modal's own copy ('Add exercises to {dayName}') was not written for a swap context and reads slightly oddly ('Add exercises to a replacement for {exerciseName}') since ExercisePickerModal is out of this plan's file scope to fix. Flagged as a minor UX rough edge, not a functional defect — swapSessionExercise itself is fully implemented and unit-tested.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T15:15:34.805Z",
    "resolved_at": null
  },
  {
    "id": 118,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/NoteSheet.tsx",
    "line": null,
    "description": "NoteSheet supports all three note levels (set/exercise/session) and setNote writes all three columns independently, but this plan wires only the exercise-level entry point (the action bar's Note button) — 05-UI-SPEC.md's Per-Exercise Action Bar section defines no set-level or session-level note trigger for this phase. Set/session-level notes are a tested, reusable capability with no UI surface yet; a future plan can add a long-press-on-set-row or session-header trigger without touching NoteSheet.tsx or session-mutations.ts.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T15:15:40.631Z",
    "resolved_at": "2026-08-26T10:21:36.235Z"
  },
  {
    "id": 119,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/durability.spec.ts",
    "line": null,
    "description": "Recovery case (warm-ups + two completed working sets + an open pause) extended into the durability suite but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- durability.spec.ts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T15:17:18.929Z",
    "resolved_at": null
  },
  {
    "id": 120,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/session-lifecycle.spec.ts",
    "line": null,
    "description": "Pause/resume header-bar freeze, finish-stamps-completed, and discard-confirmation-then-write cases written against the durability Playwright project but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- session-lifecycle.spec.ts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T15:17:23.564Z",
    "resolved_at": null
  },
  {
    "id": 121,
    "kind": "unrun-verify",
    "phase": "999.1",
    "file": "apps/mobile/lib/db/session-lifecycle.ts",
    "line": null,
    "description": "Native-only observations for 05-07: pause behaviour under a real OS backgrounding event, and Home/Workout tab focus-effect semantics on a physical iOS/Android device, cannot be observed on this machine (no Xcode, no Android SDK, D-10). Deferred to the Phase 999.1 native/cross-device UAT sweep.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T15:17:30.385Z",
    "resolved_at": null
  },
  {
    "id": 122,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/workout-screen.spec.ts",
    "line": null,
    "description": "The mid-session-add-exercise case (adding via the strip's Add Exercise chip and asserting the strip grows by one chip) was written per 05-06-PLAN.md Task 3's acceptance criteria but not executed this session per the project's browser-testing-only-on-request rule; needs a real pnpm --filter mobile test:e2e:durability run to confirm the ExercisePickerModal getPowerSync()/harness database routing (useProductionDb) actually surfaces catalog rows to select.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T15:45:52.808Z",
    "resolved_at": null
  },
  {
    "id": 123,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/app/(tabs)/workout.tsx",
    "line": null,
    "description": "cycleId is passed as null for every exercise in ExercisePageData: no schema column persists which program cycle a live session started from (workout_session/session_exercise have no cycle_id), so TargetsSheet's write-back path (writeBackTargets/resolveWriteBackTarget) always resolves to the base routine_exercise row for a programmed exercise rather than a cycle-specific routine_exercise_cycle_target override, until cycle identity is threaded through startWorkoutFromProgram/session creation.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T15:46:03.332Z",
    "resolved_at": "2026-08-26T10:21:32.457Z"
  },
  {
    "id": 124,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/history.spec.ts",
    "line": null,
    "description": "View/rename/duplicate/delete a past workout, plus discarded-session-hidden, written against the real @powersync/web engine but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- history.spec.ts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T16:26:58.531Z",
    "resolved_at": null
  },
  {
    "id": 125,
    "kind": "unrun-verify",
    "phase": "999.1",
    "file": "apps/mobile/components/SessionHistoryRow.tsx",
    "line": null,
    "description": "Native FlashList recycling behaviour on the new SessionHistoryRow (the same failure class the ExerciseImageTile WINDOWS entry recorded in Phase 3) cannot be observed on this machine (no Xcode, no Android SDK). Deferred to the Phase 999.1 native/cross-device UAT sweep.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T16:27:06.639Z",
    "resolved_at": null
  },
  {
    "id": 126,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/e2e/history.spec.ts",
    "line": null,
    "description": "05-09-PLAN.md Task 3's e2e prose says duplicating a row makes 'a fourth row appear' in History, but duplicateSession funnels through startSession (D-33), which always creates the copy in_progress — and Task 1's own shown/hidden rule excludes in-progress sessions from History. The copy therefore does NOT appear as a fourth History row; it surfaces on the Workout tab instead. history.spec.ts asserts the correct (in-progress, absent from loadHistoryPage) behavior rather than the plan's literal prose, which contradicts must_haves established earlier in the same plan.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T16:27:14.738Z",
    "resolved_at": null
  },
  {
    "id": 127,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/workout-summary.spec.ts",
    "line": null,
    "description": "Workout-summary e2e (finish a session, assert trained muscles, PR rows and per-exercise e1RM breakdown, then correct a number before dismissing) written but not executed — CLAUDE.md forbids launching a browser unless explicitly requested. Needs a human or CI run of pnpm --filter mobile test:e2e:durability -- workout-summary.spec.ts.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T18:47:51.143Z",
    "resolved_at": "2026-08-29T09:04:21.227Z"
  },
  {
    "id": 128,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/e2e/session-edit.spec.ts",
    "line": null,
    "description": "session-edit.spec.ts (05-10) written and typechecked but not executed — browser-testing-only-on-request. Needs pnpm --filter mobile test:e2e:durability -- session-edit.spec.ts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T06:52:48.979Z",
    "resolved_at": null
  },
  {
    "id": 129,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/mobile/components/SessionDateField.tsx",
    "line": null,
    "description": "Native date-picker presentation (the calendar grid's on-device rendering) and native OS font-scale wrapping on the editing header (formatEditingHeader) are unverifiable on this machine — no Xcode/Android SDK/simulator available. Deferred to ROADMAP Phase 999.1's native/cross-device sweep.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T06:52:59.973Z",
    "resolved_at": null
  },
  {
    "id": 130,
    "kind": "unmet-truth",
    "phase": "05",
    "file": "apps/mobile/lib/db/test-support.ts",
    "line": 187,
    "description": "D-33's single-funnel claim ('exactly one insert(workoutSession) in apps/mobile/') holds for production code (log-set.ts's startSession is the only real creation path) but a pre-existing test-only seeding helper, seedPriorHeaviestSet (predates 05-10, used by workout-summary.spec.ts's real-PR fixture), performs a second, direct insert(workoutSession) to seed a days-old prior session outside any funnel. Out of scope for 05-10 (not caused by this plan's changes); left as-is per the scope-boundary rule.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T06:53:04.949Z",
    "resolved_at": null
  },
  {
    "id": 131,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/lib/db/schema.ts,apps/api/src/db/schema/session.ts",
    "line": null,
    "description": "CR-02 review-fix intentionally did not add a unique (session_exercise_id, set_index) constraint to either schema, though REVIEW.md's fix suggestion mentioned it as a belt-and-suspenders option. The db.transaction wrap around logSet's select-max-then-insert (log-set.ts) already closes the race at its source. Adding the unique constraint would require a live Postgres db:push (explicitly out of scope for the review-fix agent) and PowerSync schema-versioning verification on the SQLite mirror (untested here). Revisit if a future finding shows the transaction-only fix insufficient.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T07:35:52.441Z",
    "resolved_at": null
  },
  {
    "id": 132,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "apps/api/test/schema-parity.e2e-spec.ts",
    "line": null,
    "description": "05-11 Task 3 (live drizzle-kit push + db:verify + client schema-redefinition e2e) not run — this worktree has no .env (gitignored, not copied into git worktrees) and the harness's permission settings deny writing one; DATABASE_URL unresolvable from the sandbox even though Postgres port 5432 is reachable. Requires human to restore .env in this worktree (or run Task 3 outside the worktree) before merge.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T16:42:58.122Z",
    "resolved_at": null
  },
  {
    "id": 133,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/lib/db/test-support.ts",
    "line": null,
    "description": "All 10 e2e durability specs failed test collection with 'No tests found' because test-support.ts (imported only for the DURABILITY_HARNESS_GLOBAL string constant) transitively imports log-set.ts, which imports the bare './powersync' — Node's ESM resolver has no platform-extension awareness and resolves that to the native powersync.ts, whose @powersync/react-native import chain is invalid under strict Node ESM (extensionless dist re-exports). This was not caused by any plan; it was discovered and fixed while resolving 05-11's Task 3 halt, by extracting DURABILITY_HARNESS_GLOBAL into a dependency-free leaf module (durability-harness-key.ts) and repointing all 10 specs at it. It unblocks the whole durability suite and is the root cause of 05-VERIFICATION.md's 2 behavior_unverified truths.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T17:19:44.653Z",
    "resolved_at": null
  },
  {
    "id": 134,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/TargetsSheet.tsx",
    "line": null,
    "description": "05-12 Task 3: writeBackTargets/setSessionExerciseTargets always defaulted to getPowerSync(), ignoring whichever db the screen was actually reading from (only visible once a real isolated-db browser test exercised the write path) — threaded an optional db prop through WorkoutScreenView -> ExercisePage -> TargetsSheet, matching the existing writeDb pattern already used for logSet/startSession.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T08:09:16.699Z",
    "resolved_at": "2026-08-26T08:09:40.530Z"
  },
  {
    "id": 135,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/NoteSheet.tsx",
    "line": null,
    "description": "05-14 orchestrator ruling: NoteSheet.tsx (both mounts) and the new session-level NoteSheet in workout.tsx thread an optional db prop into setNote, sharing WINDOWS #134's getPowerSync()-default gap (NoteSheet/WarmupSheet/swap/remove were flagged by 05-12 as sharing the identical latent defect, out of that plan's scope). This modifies NoteSheet.tsx despite 05-14-PLAN.md's literal 'NoteSheet.tsx and session-mutations.ts are not modified' prohibition; the orchestrator's dispatch explicitly ruled the prohibition's intent is 'do not re-invent note capability', not 'never touch the file', and authorized this narrow db-threading parity fix. session-mutations.ts and WorkoutSummary.tsx remain untouched.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T08:26:27.417Z",
    "resolved_at": null
  },
  {
    "id": 136,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/e2e/session-notes.spec.ts",
    "line": null,
    "description": "05-14 Task 3 diagnosis (informational, not fixed here — out of this plan's scope): LOG-13's shouldAutoAdvance (lib/session/auto-advance.ts) treats 'every EXISTING working set on the exercise is complete' as the advance trigger, not 'every TARGET set is complete' — after logging just the FIRST of a seeded 3-target exercise's working sets, that predicate is trivially true (one row exists, it is complete), so the pager auto-advances to the next exercise immediately. This is very likely the actual root cause of the pre-existing 'known-failing' e2e specs (workout-screen.spec.ts and others) that log one set then assert against 'Mark set incomplete' expecting to still be on the same exercise's page — they are actually asserting against the NEXT exercise's still-empty draft after an unaccounted-for auto-advance, not a broken completion write. session-notes.spec.ts worked around it locally by re-selecting the first exercise's strip chip after completing its set; the shared spec files were left untouched per this plan's scope boundary (05-16's job).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T08:48:16.589Z",
    "resolved_at": null
  },
  {
    "id": 137,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/DragHandle.tsx",
    "line": null,
    "description": "05-15 Task 2: DragHandle.tsx/DragHandle.web.tsx gained an optional rowHeight prop threaded into computeDropTarget, despite the plan's own <verification> line naming both files as staying unmodified. Task 1 added computeDropTarget's optional rowHeight (font-scale-aware drag unit, E12 must-have), but E12 also requires the ReorderExercisesSheet's measured row height to actually govern the drop arithmetic, and the sheet reuses the real stateful DragHandle (per the dispatch's explicit 'reuse DragHandle, do not reinvent a drag surface' instruction) rather than reimplementing the gesture. The only way to satisfy both constraints was an additive, default-preserving optional prop (mirroring Task 1's own reversible pattern) — undefined at every existing ExerciseSlotRow call site, so Phase 4's reorder callers are byte-identical to before. Existing DragHandle/ExerciseSlotRow unit tests (53 cases) still pass unchanged.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T09:03:21.212Z",
    "resolved_at": null
  },
  {
    "id": 138,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/ExercisePage.tsx",
    "line": null,
    "description": "05-15 Task 3: e2e/reorder-exercises.spec.ts's Remove flow (needed to prove a removed exercise is excluded from the reorder sheet) surfaced the same getPowerSync()-default gap 05-12/05-14 found and fixed for TargetsSheet/NoteSheet (WINDOWS #134/#135) — ExercisePage.tsx's handleConfirmRemove called removeSessionExercise(sessionExerciseId) with no db argument, so the write always resolved the production getPowerSync() singleton instead of the harness's isolated per-test database; the removal silently landed in the wrong SQLite file and the spec's raw read never saw removed_at set. Fixed by passing db ?? getPowerSync() through, matching the pattern already used for Targets/Note/Reorder. handleSwapPick's swapSessionExercise call shares the identical latent defect but is unexercised by this plan's tests, left unfixed and flagged for whichever future plan first browser-tests the swap path.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T09:21:06.894Z",
    "resolved_at": "2026-08-27T16:38:49.593Z"
  },
  {
    "id": 139,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/components/ExercisePickerModal.tsx",
    "line": null,
    "description": "The picker's per-row Pressable (onToggle) wraps ExerciseListRow's own Pressable — a real button nested inside another button. Browsers split this into two sibling elements on parse, both matching the row's accessible name; workout-screen.spec.ts's 'adding an exercise mid-session' case works around it with an aria-label attribute selector rather than a role+name locator. Discovered running the durability suite for real (05-16); out of that plan's file scope (ExercisePickerModal.tsx). Needs a real fix: either drop the outer selection Pressable and let ExerciseListRow itself own the press/selection affordance, or vice versa.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T10:21:03.759Z",
    "resolved_at": null
  },
  {
    "id": 140,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/mobile/playwright.config.ts",
    "line": null,
    "description": "05-16's 'confirmed across two consecutive clean full-suite runs' did not reproduce under independent re-verification (orchestrator got 32/1 twice, different test each time). Root cause: the durability project runs with Playwright's default worker count (4 on this machine) despite fullyParallel:false, which only serializes cases WITHIN one spec file — multiple spec FILES still ran concurrently, all against the single shared webServer/Metro process, causing real CPU/server contention that surfaced as random page.goto/page.reload timeouts. Fixed by pinning workers:1 on the durability project; also fixed a missed ambiguous Done locator in workout-summary.spec.ts (session-edit.spec.ts precedent). Reproduced 33/33 across three consecutive full-suite runs post-fix.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T11:15:15.039Z",
    "resolved_at": "2026-08-26T11:15:23.069Z"
  },
  {
    "id": 141,
    "kind": "unrun-verify",
    "phase": "06",
    "file": "apps/mobile/app/gym-profiles/index.tsx",
    "line": null,
    "description": "06-03 plan <verification> human-check: Profile tab Gyms section / Gym Profiles list / archive-to-collapsed-section — not run, no browser/simulator session available in this executor pass",
    "status": "waived",
    "reason": "Deferred to ROADMAP Phase 999.2 (human verification sweep, web target) by user decision 2026-08-28 during /gsd-verify-work 06; functional behaviour covered by passing e2e specs",
    "recorded_at": "2026-08-27T14:44:46.168Z",
    "resolved_at": "2026-08-28T07:56:07.108Z"
  },
  {
    "id": 142,
    "kind": "unrun-verify",
    "phase": "06",
    "file": "apps/mobile",
    "line": null,
    "description": "06-04 human-check not run: create a gym in lb, add plates, add a machine, save, reopen, on web target — no browser/simulator session available in this executor pass",
    "status": "waived",
    "reason": "Deferred to ROADMAP Phase 999.2 (human verification sweep, web target) by user decision 2026-08-28 during /gsd-verify-work 06; functional behaviour covered by passing e2e specs",
    "recorded_at": "2026-08-27T15:48:46.047Z",
    "resolved_at": "2026-08-28T07:56:07.296Z"
  },
  {
    "id": 143,
    "kind": "unrun-verify",
    "phase": "06",
    "file": "apps/mobile/app/(tabs)/workout.tsx",
    "line": null,
    "description": "Plan 06-07's <human-check> (session menu row order: pause/resume, session note, switch gym, discard; visual accent confirmation on switching gyms) was not run interactively — no browser/simulator UI session available in this sandboxed worktree beyond the automated Playwright e2e run (switch-gym.spec.ts, which passed). Automated tsc, unit suite (1473/1473) and the durability e2e spec all green; the human visual confirmation is deferred to UAT.",
    "status": "waived",
    "reason": "Deferred to ROADMAP Phase 999.2 (human verification sweep, web target) by user decision 2026-08-28 during /gsd-verify-work 06; functional behaviour covered by passing e2e specs",
    "recorded_at": "2026-08-27T16:10:35.408Z",
    "resolved_at": "2026-08-28T07:56:07.437Z"
  },
  {
    "id": 144,
    "kind": "deviation",
    "phase": "06",
    "file": "apps/mobile/lib/navigation/root-stack.tsx",
    "line": null,
    "description": "06-03 Task 2: the plan named apps/mobile/app/_layout.tsx as the file to declare the gym-profiles signed-in route guard, but that file only calls renderRootStack(signedIn) — the real Stack.Protected/Stack.Screen declarations live in lib/navigation/root-stack.tsx (exercises/_layout.tsx's own comment says do not edit app/_layout.tsx). Registered gym-profiles there instead, matching the exercises/programs precedent; root-stack.tsx was not in 06-03's declared files_modified list.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T16:56:16.487Z",
    "resolved_at": null
  },
  {
    "id": 145,
    "kind": "deviation",
    "phase": "06",
    "file": "apps/mobile/app/gym-profiles/index.tsx",
    "line": null,
    "description": "06-04 Task 3: gym-profiles/index.tsx (06-03's file, not in 06-04's declared files_modified) gained optional userId/db override props so the durability harness could mount the real GymProfilesScreen against an isolated test database instead of the production getPowerSync() singleton. Extending a prior plan's output for a genuine harness-seam need, both props undefined for every real navigation.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T16:56:23.888Z",
    "resolved_at": null
  },
  {
    "id": 146,
    "kind": "deviation",
    "phase": "06",
    "file": "apps/mobile/components/NumericKeypad.tsx",
    "line": null,
    "description": "06-05 Task 2: NumericKeypad.tsx (not in either task's declared files) type-aliases PlateStripBandData = PlateStripProps and constructed the old {inventory, targetKg, unit} shape; Task 2's rewrite of PlateStripView to take an already-resolved EquipmentBandState broke it. Replaced the type alias with an explicit PlateStripBandData interface {state, unit, onNeighbourPress, onRecoveryPress} and updated the one JSX call site — a genuine typecheck blocker, fixed within the same commit.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T16:56:26.514Z",
    "resolved_at": null
  },
  {
    "id": 147,
    "kind": "deviation",
    "phase": "06",
    "file": "apps/mobile/app/(tabs)/workout.tsx",
    "line": null,
    "description": "06-06 Task 3: equipmentType/resolvedInventory/equipmentProfileId were threaded from workout.tsx into ExercisePage even though neither workout.tsx nor EditingWorkoutScreen.tsx was in 06-06's declared files_modified — ExercisePage's new required props had no other data source, and 06-05's own SUMMARY had already flagged workout.tsx as the intended 06-06 integration point. EditingWorkoutScreen.tsx's historical-editing call site passes null for all three (D-11).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T16:56:30.246Z",
    "resolved_at": null
  },
  {
    "id": 148,
    "kind": "deviation",
    "phase": "07",
    "file": "apps/mobile/lib/db/session-mutations.ts",
    "line": null,
    "description": "07-06-PLAN.md Task 2 acceptance criterion 'grep -c routineExercise is 0' is unsatisfiable as literally written — the file already legitimately imports/uses routineExercise (13 pre-existing occurrences) for Phase 4/5 writeBackTargets/resolveWriteBackTarget target write-back, unrelated to this plan. Verified instead that formSuperset/detachSuperset themselves reference only sessionExercise (D-16 intent honored).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T10:48:02.164Z",
    "resolved_at": null
  },
  {
    "id": 149,
    "kind": "deviation",
    "phase": "04",
    "file": "ops/powersync/sync-rules.yaml",
    "line": null,
    "description": "routine_day stream query deliberately not filtered by archived_at, against D-29's literal text — a filter would delete an archived day from every device that did not perform the archive, making restore unreachable; withdrawn/resolved as D-33 in 04-CONTEXT.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T15:18:35.060Z",
    "resolved_at": null
  },
  {
    "id": 150,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/app/(tabs)/programs.tsx",
    "line": null,
    "description": "The four day-page controls (Duplicate, Archive, Restore, plus the pre-existing Remove) have been observed on neither iOS nor Android — no Xcode, no Android SDK in this worktree (ROADMAP Phase 999.1); the web observation lands in 04-15.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T15:29:10.796Z",
    "resolved_at": null
  },
  {
    "id": 151,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/mobile/e2e/program-day-lifecycle.spec.ts",
    "line": null,
    "description": "Duplicate/archive/restore day and time-off cycle conversion have been observed only in a web browser (Chromium via Playwright) — no Xcode, no Android SDK in this worktree (ROADMAP Phase 999.1 native sweep).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T16:14:09.256Z",
    "resolved_at": null
  },
  {
    "id": 152,
    "kind": "deviation",
    "phase": "07",
    "file": "apps/mobile/components/ExercisePage.tsx",
    "line": null,
    "description": "setTypeError set on a rejected formSuperset/detachSuperset write is not yet visibly rendered by SessionActionSheet (no errorMessage prop; SessionActionSheet.tsx was out of 07-07's file scope)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T17:09:09.731Z",
    "resolved_at": null
  },
  {
    "id": 153,
    "kind": "deviation",
    "phase": "07",
    "file": "apps/mobile/e2e/reorder-exercises.spec.ts",
    "line": null,
    "description": "CORRECTED 2026-08-28: this was NOT a pre-existing order-dependent flake and it did NOT pass in isolation — it reproduced at roughly one run in three with the spec run alone. Root cause: openReorderSheet waited only for the sheet heading to be visible, but the sheet measures its first row in onLayout and stores that height in state, so it renders once at the SLOT_ROW_HEIGHT fallback and again at the measured height, shifting every row between them. A boundingBox() taken across that shift named coordinates the drag handle had already left, mouse.down() landed on nothing, and no pointerdown ever reached DragHandle.web.tsx — so no drop was committed and the assertion failed against an unchanged order rather than a wrong one. Instrumentation confirmed commitDrop computed toIndex 0 correctly on every run where the pointer actually went down. Phase 7's heavier ExercisePage widened the settle window that had previously hidden it. Fixed by hovering each handle before measuring, which waits for actionability (element still across two consecutive animation frames). 15/15 repeat runs green, full durability suite 51/51.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-28T18:00:51.116Z",
    "resolved_at": "2026-08-28T21:00:00.000Z"
  },
  {
    "id": 154,
    "kind": "unrun-verify",
    "phase": "08",
    "file": "packages/progression-engine/src/index.ts",
    "line": null,
    "description": "Both parity runners (package + api-side spec.ts + mobile-side test.ts) execute under Node/V8, never on-device Hermes, so a Hermes-specific arithmetic divergence would not be caught by any of the three (08-RESEARCH.md Assumption A4); this machine has no Xcode or Android SDK to run a real RN Hermes build (standing project limitation).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T22:48:47.103Z",
    "resolved_at": null
  },
  {
    "id": 155,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "apps/mobile/components/TrendChart.tsx",
    "line": null,
    "description": "TrendChart renders on iOS/Android is unverified: this machine has neither Xcode nor the Android SDK, so react-native-svg's native build was never exercised. Web rendering is proven by e2e/exercise-performance.spec.ts. Verify at ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T08:33:00.632Z",
    "resolved_at": null
  },
  {
    "id": 156,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "apps/mobile/app/exercise-performance.tsx",
    "line": null,
    "description": "Subjective visual review of the chart, its two-label axis row and the ANLY-10 caption at the maximum OS font scale is unobservable in automation. R16 (no text inside the SVG) is enforced by a grep gate and the axis row wraps, but legibility itself needs a human. Verify at ROADMAP Phase 999.2.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T08:33:05.293Z",
    "resolved_at": null
  },
  {
    "id": 157,
    "kind": "deviation",
    "phase": "09",
    "file": "packages/analytics-engine/src/trend-series.ts",
    "line": null,
    "description": "trend-series: a bodyweight-only week qualifies with volume 0 rather than being omitted — the plan asserted a qualifying bucket is never zero on any metric; zero external load is a measured total, and omitting the bucket would erase a week the lifter really trained. The delta guards the zero denominator with not-comparable.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T08:48:50.588Z",
    "resolved_at": null
  },
  {
    "id": 158,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "apps/mobile/app/records.tsx",
    "line": null,
    "description": "Records screen rendering on iOS/Android: this machine has neither Xcode nor the Android SDK, so RecordRow and the metric switch were never exercised natively. Web rendering is proven green. ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T09:03:53.664Z",
    "resolved_at": null
  },
  {
    "id": 159,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "apps/mobile/components/RecordRow.tsx",
    "line": null,
    "description": "Subjective visual review of the Records screen at maximum OS font scale: the absence of a line clamp on both row lines and the chip growth rule are grep-enforced and unit-asserted, but legibility itself needs a human. ROADMAP Phase 999.2.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T09:03:57.654Z",
    "resolved_at": null
  },
  {
    "id": 160,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "apps/mobile/components/WeeklyProgressCard.tsx",
    "line": null,
    "description": "Last 7 Days card and History trend card rendering on iOS/Android: this machine has neither Xcode nor the Android SDK, so neither card, nor the TrendChart inside the trend card, was ever exercised natively. Web rendering is proven green across 78 durability cases. ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T11:39:28.964Z",
    "resolved_at": null
  },
  {
    "id": 161,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "apps/mobile/components/HistoryTrendCard.tsx",
    "line": null,
    "description": "Subjective visual review at maximum OS font scale of the Last 7 Days tracks, the History trend card's headline and delta chip, and the exercise-performance range switch. Wrap-and-grow is grep-enforced and unit-asserted; legibility itself needs a human. ROADMAP Phase 999.2.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T11:39:29.198Z",
    "resolved_at": null
  },
  {
    "id": 162,
    "kind": "deviation",
    "phase": "09",
    "file": "apps/mobile/components/WeeklyProgressCard.tsx",
    "line": null,
    "description": "Progress tracks originally carried accessibilityValue, which react-native-web 0.21 no longer maps, so each track rendered role=progressbar with an aria-label but no aria-valuemin/max/now — silent to a screen reader on web while the prop-level unit test stayed green. Fixed to the aria-* spelling (accepted by React Native since 0.71) so one set of props serves both targets. Caught only because 09-04's spec was executed rather than authored.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-29T11:39:29.402Z",
    "resolved_at": "2026-08-29T11:39:41.680Z"
  },
  {
    "id": 163,
    "kind": "deviation",
    "phase": "10",
    "file": "apps/api/src/db/schema/records.ts",
    "line": null,
    "description": "personal_record.logged_set_id has no onDelete cascade/set-null; deleting a logged_set or workout_session that a server-reconciled PR row references now hard-fails with an FK violation (10-02 populates this column with real data for the first time). Needs a schema decision (cascade vs set-null) in a follow-up plan; 10-02's own e2e fixtures route around it with countsTowardRecords-excluded set types rather than touching the forbidden schema file.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T15:39:49.312Z",
    "resolved_at": null
  },
  {
    "id": 164,
    "kind": "deviation",
    "phase": "10",
    "file": "apps/mobile/lib/db/muscle-volume-query.ts",
    "line": null,
    "description": "Known residual (planner-flagged): an offline EDIT of an already-synced session dated on or before the analytics_watermark shows its pre-edit contribution until the edit reaches the server — neither the strict-greater-than date clause nor the null-owner clause overlays it. Self-corrects on next sync; never fabricates a number. Follow-up if it ever matters: derive the overlay set from PowerSync's pending crud queue instead of a date comparison.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T15:29:04.201Z",
    "resolved_at": null
  },
  {
    "id": 165,
    "kind": "unrun-verify",
    "phase": "10",
    "file": "apps/mobile/components/MuscleHeatmap.tsx",
    "line": null,
    "description": "Muscle Map native (iOS/Android) rendering unobservable on this machine (no Xcode, no Android SDK) — both react-native-svg figures, the window switch and the drill-down sheet are proven on web only via the executed Playwright durability spec. Deferred to ROADMAP Phase 999.1.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T17:08:21.035Z",
    "resolved_at": null
  },
  {
    "id": 166,
    "kind": "unrun-verify",
    "phase": "10",
    "file": "apps/mobile/components/MuscleHeatmap.tsx",
    "line": null,
    "description": "Subjective visual review of the intensity scale and the untrained-versus-lowest-real-intensity distinction at maximum OS font scale — the categorical hue split (R22/D-10) is grep-enforced and unit-asserted, but whether it is legible, including for a colourblind reader, is human judgment. Deferred to ROADMAP Phase 999.2.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T17:08:31.218Z",
    "resolved_at": null
  },
  {
    "id": 167,
    "kind": "unrun-verify",
    "phase": "10",
    "file": "apps/mobile/app/muscle-map.tsx",
    "line": null,
    "description": "Subjective visual review of the Training Volume disambiguation caption and the stale-rollup caption at maximum OS font scale — wrap-and-grow is grep-enforced, but whether the two captions read as informational rather than alarming is human judgment (R25). Deferred to ROADMAP Phase 999.2.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T17:08:37.783Z",
    "resolved_at": null
  },
  {
    "id": 168,
    "kind": "deviation",
    "phase": "10",
    "file": "apps/mobile/e2e/muscle-map.spec.ts",
    "line": null,
    "description": "10-07's executed browser evidence confirms the D-01 overlay's post-watermark clause and the null-owner backfill clause both render correctly end to end against a real @powersync/web database (muscle-map.spec.ts's overlay case: rollup + post-watermark session + pre-watermark null-owner session sum correctly, disclosed by count). It does not re-exercise the already-synced-session-edit residual recorded at WINDOWS #164 (a different case: an EDIT of a session whose user_id was already set before the edit) — that residual remains open and unchanged by this plan.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T17:09:08.671Z",
    "resolved_at": null
  },
  {
    "id": 169,
    "kind": "unrun-verify",
    "phase": "10",
    "file": "apps/api",
    "line": null,
    "description": "10-07's phase-level verification names 'pnpm --filter api test:e2e exits 0 -- nothing in this plan touches the server' as a check, but the suite could not be run in this worktree: drizzle-kit push fails with 'Either connection url or host, database are required for PostgreSQL database connection' because apps/api/.env is permission-restricted from this sandbox and carries no DATABASE_URL (same class of block as WINDOWS #47/#48). Confidence it is unaffected rests on file-scope reasoning (10-07 touches apps/mobile and .planning only, zero apps/api files across all three commits), not a fresh green run.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-29T17:11:40.245Z",
    "resolved_at": "2026-08-29T17:59:05.816Z"
  },
  {
    "id": 170,
    "kind": "unrun-verify",
    "phase": "10",
    "file": "apps/api/test/analytics-rollup.e2e-spec.ts",
    "line": null,
    "description": "The CR-01 regression test added in commit 83ddc37 -- a workout_session PATCH carrying neither local_date nor started_at (completeSession's real payload shape) against a session stored at local_date 2026-01-10, asserting the watermark does not advance to today -- was written and hand-reviewed but never executed. Docker/colima is unavailable on this machine (colima status: 'error retrieving current runtime: empty value'), so the whole apps/api e2e suite could not run. This is the proof for a BLOCKER-severity fix to the analytics watermark, so it carries more weight than the general suite gap at WINDOWS #169: run 'pnpm --filter api test:e2e' once Postgres is reachable and confirm this case is green before trusting the watermark on any non-today session.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-29T17:31:52.108Z",
    "resolved_at": "2026-08-29T17:59:13.997Z"
  },
  {
    "id": 171,
    "kind": "deviation",
    "phase": "10",
    "file": "apps/mobile/app/muscle-map.tsx",
    "line": null,
    "description": "Code review WR-01 ('loadHasAnyHistory accepts userId but never filters on it') is a FALSE POSITIVE and its fix was applied then reverted (bcde0c0 -> c219dfa). Adding eq(workoutSession.userId, userId) broke 5 of 6 muscle-map durability specs. Reason: workout_session.user_id is assigned SERVER-side, so a locally-logged, not-yet-synced session legitimately carries user_id NULL -- seedMuscleMapHistory reproduces exactly this (userId: seededSession.syncedToServer ? input.userId : null). Filtering the local read by userId therefore tells a lifter whose only history is unsynced that they have no history at all, collapsing the screen to its no-history empty state. In this local-first architecture the on-device DB holds only the signed-in user's rows by PowerSync sync-rule construction, so a userId filter on a LOCAL workoutSession read is redundant AND wrong. Do not re-apply. Rollup/watermark reads in muscle-volume-query.ts do scope by userId -- that is a different table and not a precedent for this one.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-29T17:41:17.594Z",
    "resolved_at": null
  }
]
````
