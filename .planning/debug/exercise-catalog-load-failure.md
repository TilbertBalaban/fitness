---
status: diagnosed
trigger: "Navigating to http://localhost:8081/exercises in the web (React Native Web / Expo Router) client renders the catalog's load-failure error state instead of the exercise list."
created: 2026-08-19
updated: 2026-08-19
---

## Current Focus

hypothesis: CONFIRMED — `applyCatalogSnapshot` issues Drizzle `.onConflictDoUpdate()` (SQL `INSERT ... ON CONFLICT ... DO UPDATE`) against PowerSync-managed tables, which the PowerSync SQLite core exposes as VIEWs. SQLite refuses to prepare an UPSERT against a view ("cannot UPSERT a view"), so the very first statement of the catalog load throws.
test: complete — engine-level probe, wasm string extraction, drizzle SQL generation, dev-server asset probe, snapshot data validation
expecting: n/a — root cause established
next_action: hand off to gap-closure plan (diagnose-only mode; no fix applied)

bug_class: Bohrbug (deterministic, 100% reproducible, prepare-time SQL error)

reasoning_checkpoint:
  hypothesis: "`applyCatalogSnapshot` (apps/mobile/lib/catalog/load-snapshot.ts) writes every catalog row with Drizzle's `.onConflictDoUpdate()`. Drizzle compiles that to `insert into \"x\" (...) values (...) on conflict (\"x\".\"id\") do update set ...`. Every PowerSync-managed table — including `localOnly` ones — is a SQLite VIEW over `ps_data__x` / `ps_data_local__x` with INSTEAD OF triggers. SQLite rejects UPSERT against a view at prepare time with `cannot UPSERT a view`. The throw propagates out of `db.transaction()` -> `loadCatalogSnapshot` -> the `catch` in app/exercises/index.tsx -> `setFailed(true)` -> the load-failure screen."
  confirming_evidence:
    - "Direct sqlite3 3.51.0 probe: the exact drizzle-emitted SQL against a view with INSTEAD OF triggers returns `Error: in prepare, cannot UPSERT a view`; the same INSERT without the ON CONFLICT clause succeeds."
    - "`strings` on apps/mobile/public/@powersync/assets/wa-sqlite-async-*.wasm contains `CREATE VIEW ... -- powersync-auto-generated`, `ps_view_insert_`/`ps_view_update_`/`ps_view_delete_`, `ps_data__`, `ps_data_local__`, AND the SQLite error literal `cannot UPSERT a view` — the engine actually shipped to the browser."
    - "The wasm's schema-management query filters `WHERE view.type = 'view' AND view.sql GLOB '*-- powersync-auto-generated'` joined against `ps_view_*` triggers — a single code path for all managed tables; `local_only` is only a Table option (adjacent string `...local_only insert_only include_metadata...`), it does not opt a table out of the view mechanism."
    - "Drizzle SQL generation verified by running the real drizzle-orm in this repo: `.onConflictDoUpdate({target: muscleGroup.id, set: {...}})` emits `... on conflict (\"muscle_group\".\"id\") do update set ...`."
    - "@powersync/drizzle-driver 0.8.0 does no SQL rewriting — grep for `conflict`/`UPSERT` across lib/src returns nothing; PowerSyncSQLiteSession.transaction passes the callback to `client.writeTransaction` and propagates rejections."
    - "DrizzleAppSchema (drizzle-driver utils/schema.js) converts EVERY schema entry, localOnly or not, into a `@powersync/common` `Table` — so muscle_group/seeded_exercise/exercise_muscle_mapping/catalog_meta are all views."
  falsification_test: "Open a real browser page, construct the production @powersync/web database, and run `db.insert(muscleGroup).values({...}).onConflictDoUpdate({...})`. If it resolves without throwing, the hypothesis is wrong. (Not run here — task constraints forbid browser driving.)"
  fix_rationale: "n/a — diagnose-only mode. See Suggested Fix Direction in Resolution."
  blind_spots:
    - "Not executed against the real @powersync/web engine in a browser (explicitly forbidden by task constraints). The chain is proven component-by-component (wasm contains the view machinery + the error string; sqlite3 reproduces the error on a view; drizzle emits the offending SQL; the driver passes it through unmodified) rather than end-to-end in one run."
    - "PowerSync's INSTEAD OF INSERT trigger body was not fully reconstructed from the wasm, so whether `INSERT OR REPLACE INTO <view>` upserts (vs. raising a UNIQUE violation inside the trigger) is unverified against the real engine."
  candidate_causes:
    - "code: Drizzle onConflictDoUpdate emits UPSERT SQL SQLite rejects against a PowerSync view — CONFIRMED"
    - "config: PowerSync web worker/WASM asset path (/@powersync/worker.js) not served by the Expo dev server — ELIMINATED"
    - "environment: API/Postgres unreachable, error masking a connection refusal — ELIMINATED"
    - "data: bundled catalog-snapshot.json malformed, failing isCatalogSnapshot -> status 'invalid' — ELIMINATED"
  and_gate: "no — `cannot UPSERT a view` is a prepare-time error raised on the first statement `applyCatalogSnapshot` issues, unconditionally, on any device whose catalog_meta version differs from the bundled snapshot's (which includes every fresh device, and every device forever after since the aborted transaction never persists the version). Single sufficient cause; no second condition required."

## Symptoms

expected: /exercises renders the FlashList-backed exercise catalog with ~870 rows from the seeded local-first catalog (muscle_group / exercise / exercise_muscle_mapping / catalog_meta tables), scrollable.
actual: The screen renders the catalog load-failure fallback with the copy "Exercise catalog couldn't load" / "Restart the app to try again. Your saved exercises and history are safe."
errors: None captured beyond the on-screen fallback copy. No console output collected. (Predicted underlying error: SQLite `cannot UPSERT a view`, swallowed by the bare `catch {}` at apps/mobile/app/exercises/index.tsx:147.)
reproduction: Test 1 in .planning/phases/03-exercise-catalog/03-UAT.md — open http://localhost:8081/exercises in a browser against the local dev stack.
started: Discovered during Phase 03 UAT, immediately after plan 03-11 landed the CORS fix. First browser session past account creation.

## Eliminated

- hypothesis: "Bundled catalog-snapshot.json fails isCatalogSnapshot, returning status 'invalid'"
  evidence: "Ran the real validator's rules over the real asset in node: keys correct, catalog_version='fb701c18b7999d47' (non-empty string), muscle_groups=19, exercises=870, mappings=3177, and 0 exercises with a load_type outside LOAD_TYPES. isCatalogSnapshot returns true."
  timestamp: 2026-08-19

- hypothesis: "PowerSync web worker / wa-sqlite WASM assets are not served by the Expo dev server at :8081, so getPowerSync() or the first query throws"
  evidence: "curl against the already-running dev server (PID 52431, LISTEN *:8081): GET /@powersync/worker.js -> 200, application/javascript, 74335 bytes (byte-identical size to public/@powersync/worker.js); GET /@powersync/assets/wa-sqlite-async-DCIP8kAx.wasm -> 200, application/wasm, 2281765 bytes. Both assets present in apps/mobile/public/@powersync/ from the postinstall `powersync-web copy-assets -o public`. Independently corroborated by .planning/phases/02-data-model-sync-engine/02-VALIDATION.md, which records durability.spec.ts and sync.spec.ts as green in a real Chrome against a real @powersync/web database served from this same dev server."
  timestamp: 2026-08-19

- hypothesis: "The failure is a 03-11 CORS regression, or the API/Postgres being unreachable masked as a load failure"
  evidence: "The catalog load path is entirely local: loadCatalogSnapshot reads the bundled `assets/catalog/catalog-snapshot.json` (Metro-inlined) and writes to local SQLite. No network call exists between the effect's start and setFailed(true). The only network call, refreshCatalog(db), is fired AFTER the local read succeeded, is `void`-ed, and its result is discarded. Plan 03-11 touched only apps/api/src/main.ts, apps/api/src/common/web-origins.ts and apps/api/src/auth/auth.ts — no client file, no catalog file. (Note: nothing is currently listening on :3000, but this is causally irrelevant to the error state.)"
  timestamp: 2026-08-19

- hypothesis: "Switching to .onConflictDoNothing() would sidestep the problem (i.e. only DO UPDATE is rejected)"
  evidence: "sqlite3 probe: `insert into <view> (...) values (...) on conflict do nothing` also returns `Error: in prepare, cannot UPSERT a view`. SQLite rejects the entire upsert-clause grammar against a view, not just DO UPDATE."
  timestamp: 2026-08-19

- hypothesis: "Drizzle's qualified conflict target (`on conflict (\"muscle_group\".\"id\")`) is itself invalid SQLite and the real defect"
  evidence: "sqlite3 probe against a REAL table accepts the qualified target and executes the upsert successfully. Not a defect."
  timestamp: 2026-08-19

## Evidence

- timestamp: 2026-08-19
  checked: "grep for the user-visible fallback copy"
  found: "apps/mobile/app/exercises/index.tsx:209 renders it when deriveExerciseListScreenState returns 'error', which requires `failed === true`. `failed` is set in exactly two places in the mount effect (lines 142 and 148): loadCatalogSnapshot returning status 'invalid', or any throw inside the try block spanning loadCatalogSnapshot + loadCatalogRows."
  implication: "Two entry conditions to differentiate. Note getPowerSync() at line 138 is OUTSIDE the try — a throw there would leave the screen in 'loading', not 'error', so the engine failing to construct is ruled out by the observed symptom alone."

- timestamp: 2026-08-19
  checked: "apps/mobile/lib/catalog/load-snapshot.ts — applyCatalogSnapshot"
  found: "All four write statements use Drizzle `.onConflictDoUpdate()`: muscleGroup (line 46), seededExercise (line 82), exerciseMuscleMapping (line 118), catalogMeta (line 125). The muscle_group loop is the FIRST statement inside the transaction."
  implication: "If UPSERT is unsupported, the failure is at statement #1 of 4066 — zero rows written, transaction rolled back, catalog_meta never stamped. The load is permanently stuck: every subsequent visit re-enters the same write path because currentVersion stays null. Explains why 'Restart the app to try again' never helps."

- timestamp: 2026-08-19
  checked: "Real drizzle-orm SQL generation for the muscle_group upsert"
  found: "sql = `insert into \"muscle_group\" (\"id\", \"name\", \"body_region\") values (?, ?, ?) on conflict (\"muscle_group\".\"id\") do update set \"name\" = ?, \"body_region\" = ?`"
  implication: "Confirms a literal SQLite UPSERT clause reaches the engine."

- timestamp: 2026-08-19
  checked: "sqlite3 3.51.0 probe — the drizzle-emitted SQL against a PowerSync-shaped view (ps_data_local__muscle_group backing table + view + INSTEAD OF INSERT trigger)"
  found: "Plain `insert into \"muscle_group\" (...) values (...)` -> OK. The same insert with `on conflict (\"muscle_group\".\"id\") do update set ...` -> `Error: in prepare, cannot UPSERT a view`."
  implication: "Reproduces the exact failure mode at the engine level. It is a PREPARE-time error, so it is unconditional — no data or timing dependency."

- timestamp: 2026-08-19
  checked: "strings over apps/mobile/public/@powersync/assets/wa-sqlite-async-DCIP8kAx.wasm (the actual engine served to the browser)"
  found: "Contains `cannot UPSERT a view`; `CREATE VIEW ... -- powersync-auto-generated`; `ps_view_insert_`, `ps_view_update_`, `ps_view_delete_`; `ps_data__` and `ps_data_local__`; the schema-management query `... WHERE view.type = 'view' AND view.sql GLOB '*-- powersync-auto-generated'` joined against the ps_view_* triggers; and `local_only` listed among Table options alongside insert_only/include_metadata."
  implication: "The shipped engine both (a) materializes every managed table — localOnly included — as a view with INSTEAD OF triggers, and (b) carries the exact error string the probe produced. Single code path: local_only only switches the backing-table prefix, it does not bypass the view."

- timestamp: 2026-08-19
  checked: "@powersync/drizzle-driver 0.8.0 — utils/schema.js, PowerSyncSQLiteSession.js, grep for conflict/UPSERT"
  found: "DrizzleAppSchema's toPowerSyncTables converts every entry (with or without a `{tableDefinition, options}` wrapper) into a `@powersync/common` Table. No occurrence of 'conflict' or 'UPSERT' anywhere in lib/src — no SQL rewriting. transaction() delegates to client.writeTransaction and awaits the callback, so a rejection propagates to the caller."
  implication: "Nothing between Drizzle's compiler and wa-sqlite intercepts or rewrites the UPSERT."

- timestamp: 2026-08-19
  checked: "apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts — why 282/282 mobile tests pass"
  found: "The suite drives applyCatalogSnapshot through a hand-written `FakeDb` object whose `insert(table).values(v).onConflictDoUpdate({set})` is a plain JS closure mutating a Map. No SQL is ever compiled, prepared, or executed. Same pattern in refresh-catalog.test.ts."
  implication: "This is exactly WINDOWS #33 / 03-UAT test 4. The unit suite is structurally incapable of catching a SQL-dialect/engine-compatibility defect. The green test count is not evidence about this code path."

- timestamp: 2026-08-19
  checked: "Which write paths HAVE been proven against a real engine"
  found: "02-VALIDATION.md records durability.spec.ts and sync.spec.ts green in real Chrome (PLAT-02/03/04/07/08). Those specs exercise lib/db/log-set.ts, whose three writes (log-set.ts:25, :91, :135) are all plain `db.insert(t).values({...})` with NO onConflict clause. grep across apps/mobile + packages finds onConflictDoUpdate ONLY in load-snapshot.ts (4 sites) and its tests."
  implication: "The real-browser e2e coverage that exists never prepares an UPSERT. The defect sits precisely in the one write shape no real-engine test has ever touched."

- timestamp: 2026-08-19
  checked: "Bundled asset validity — node run of isCatalogSnapshot's rules over apps/mobile/assets/catalog/catalog-snapshot.json"
  found: "catalog_version='fb701c18b7999d47', muscle_groups=19, exercises=870, mappings=3177, 0 invalid load_type values."
  implication: "The 'invalid' branch is refuted; the failure must be the throw branch. Also confirms currentVersion (null on a fresh device) !== snapshot version, so the write path is always entered."

- timestamp: 2026-08-19
  checked: "Dev server asset probe (curl, no browser)"
  found: "/@powersync/worker.js -> 200 application/javascript 74335 B; /@powersync/assets/wa-sqlite-async-DCIP8kAx.wasm -> 200 application/wasm 2281765 B; /exercises -> 200."
  implication: "The worker-path / WASM-serving hypothesis is refuted."

- timestamp: 2026-08-19
  checked: "Blast radius — other callers of applyCatalogSnapshot"
  found: "refresh-catalog.ts:70 runs the identical `db.transaction(tx => applyCatalogSnapshot(tx, snapshot))`. Its docblock claims 'Never throws: every non-success path resolves to an outcome instead', but applyCatalogSnapshot does throw, and index.tsx:155 calls it as `void refreshCatalog(db)` with no catch."
  implication: "Same defect, second call site, plus a latent unhandled promise rejection once the primary defect is fixed but a refresh still fails. Both must be in the gap-closure scope."

- timestamp: 2026-08-19
  checked: "sqlite3 probe of candidate fix shapes against a view"
  found: "`insert or replace into <view> (...) values (...)` prepares and executes successfully (the row was replaced in the backing table). `on conflict do nothing` fails with the same `cannot UPSERT a view`."
  implication: "Any fix must avoid the ON CONFLICT grammar entirely. `INSERT OR REPLACE` is grammatically accepted against a view, but whether PowerSync's INSTEAD OF INSERT trigger body actually upserts (vs. raising a UNIQUE violation on ps_data__/ps_data_local__) was NOT reconstructed from the wasm and must be verified against the real engine."

## Resolution

root_cause: "apps/mobile/lib/catalog/load-snapshot.ts's applyCatalogSnapshot writes catalog rows with Drizzle's `.onConflictDoUpdate()`, which compiles to a SQLite UPSERT (`INSERT ... ON CONFLICT ... DO UPDATE`). Every PowerSync-managed table is a SQLite VIEW over ps_data__/ps_data_local__ with INSTEAD OF triggers, and SQLite refuses to prepare an UPSERT against a view (`cannot UPSERT a view`). The first of the four upsert sites (muscle_group) throws at prepare time inside loadCatalogSnapshot's transaction; the throw is swallowed by the bare `catch {}` at app/exercises/index.tsx:147, which sets failed=true and renders the load-failure screen. Because the transaction rolls back before catalog_meta is stamped, the condition is permanent across reloads."

classification: code-defect (pre-existing in plan 03-05's catalog loader; NOT a 03-11 regression, NOT an environment-setup problem)

fix: [not applied — diagnose-only mode]

verification: [n/a]

files_changed: []
