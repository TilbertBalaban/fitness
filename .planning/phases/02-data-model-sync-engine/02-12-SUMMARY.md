---
phase: 02-data-model-sync-engine
plan: 12
subsystem: sync
tags: [powersync, playwright, e2e, offline-first, drizzle, better-auth, nestjs]

requires:
  - phase: 02-data-model-sync-engine (plan 09)
    provides: the browser-driven durability harness (test-support.ts, __durability.web.tsx, durability.spec.ts) and the log-set.ts DI seam
  - phase: 02-data-model-sync-engine (plan 10)
    provides: null-weight round trip through the sync push apply path, Postgres logged_set.weight_kg made nullable
  - phase: 02-data-model-sync-engine (plan 11)
    provides: the sync apply-path fixes closing the silent-loss seam this plan's drain assertions depend on
provides:
  - "schema-redefinition.spec.ts: roadmap criterion 4 proven against a populated pre-migration database"
  - "sync.spec.ts: roadmap criterion 1 (automatic drain, no user action), the browser half of WINDOWS #26 (two-client convergence), null weight through the full client path, and usability with the sync service down"
  - "playwright durability/sync project split, plus a browser-durability CI job for the local-only half"
affects: [03-exercise-catalog, native-uat-sweep]

actuals:
  tokens: 18317
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Two harness surfaces on the same __durability.web.tsx global: openTestPowerSync/reopenTestPowerSync's isolated instance for durability/schema specs, and useProductionDb()/connect()/disconnect() routed to the real connectPowerSync/disconnectPowerSync singleton for sync.spec.ts — no spec ever stubs SyncConnector, apiFetch, or session-guard.ts"
    - "Region-gated grep as an acceptance criterion: sentinel comments (drain-region:start/end) bracket exactly the window a 'no user action' claim covers, with a whole-file positive control proving the negative-grep pattern isn't simply absent everywhere"
    - "CI=1 is required for any Playwright run against freshly-edited connector/api-client code — playwright.config.ts's reuseExistingServer: !process.env.CI silently reuses a stale Expo dev server (and its stale bundle) across separate local invocations otherwise"

key-files:
  created:
    - apps/mobile/e2e/schema-redefinition.spec.ts
    - apps/mobile/e2e/sync.spec.ts
    - apps/mobile/e2e/node-shims.d.ts
  modified:
    - apps/mobile/lib/db/test-support.ts
    - apps/mobile/app/__durability.web.tsx
    - apps/mobile/playwright.config.ts
    - apps/mobile/lib/db/connector.ts
    - apps/mobile/lib/api-client.ts
    - apps/mobile/__tests__/offline-write.test.ts
    - apps/mobile/package.json
    - .github/workflows/ci.yml
    - .planning/WINDOWS.md
    - .planning/phases/02-data-model-sync-engine/02-VALIDATION.md

key-decisions:
  - "Chose 'side' as the redefined-away column (already nullable client and server side) so the schema-redefinition test exercises PowerSync's view re-derivation without also needing a server migration"
  - "connectTestPowerSync/disconnectTestPowerSync added as a third connect surface, deliberately not routed through powersync.ts's production singleton, so a schema-redefined isolated database can prove its own crud queue drains independently of the production db"
  - "sync.spec.ts registered as its own Playwright project (not folded into durability), explicitly excluded from CI with the cause (wal_level=logical unreachable via a plain GitHub Actions service container) written down at the exclusion site rather than a silent skip"

patterns-established:
  - "Pattern: apiFetch always sets Content-Type: application/json explicitly on any POST carrying a JSON string body — fetch()'s default body-typing (text/plain for an unlabeled string) is silently accepted by the browser but silently dropped by Nest's JSON body-parser server-side"
  - "Pattern: every apiFetch path URL is built by prefixing API_URL, never passed as a bare path from @fitness/api-contracts — a bare path resolves against the current page's own origin on web, not the API"

requirements-completed: [PLAT-02, PLAT-03, PLAT-07]

coverage:
  - id: D1
    description: "Roadmap criterion 4: an app upgrade across a client schema change does not eat unsynced work, proven against a populated pre-migration database (not an empty one)"
    requirement: "PLAT-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/schema-redefinition.spec.ts#populated, then redefined: every logged set survives, crud queue depth is unchanged, notes reads null, side disappears"
        status: pass
    human_judgment: false
  - id: D2
    description: "PLAT-07's ordering and empty-input edges: set_index survives redefinition with no gap/repeat, and a reopen against zero logged sets returns zero rows and zero crud depth with no error"
    requirement: "PLAT-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/schema-redefinition.spec.ts#ordering survives redefinition"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/schema-redefinition.spec.ts#empty database: reopening as v2 with nothing ever logged returns zero rows, zero crud depth, no error"
        status: pass
      - kind: e2e
        ref: "apps/mobile/e2e/schema-redefinition.spec.ts#round trip back: v1 -> v2 -> v1 leaves logged sets readable in both directions"
        status: pass
    human_judgment: false
  - id: D3
    description: "Roadmap criterion 1: offline writes sync themselves with no user action between reconnect and the queue reaching Postgres"
    requirement: "PLAT-03"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/sync.spec.ts#offline write, automatic drain: no user action between reconnect and the queue reaching Postgres"
        status: pass
    human_judgment: false
  - id: D4
    description: "Null weight reaches Postgres as SQL NULL through the real client, crud queue, and connector — not only a direct API push"
    requirement: "PLAT-02"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/sync.spec.ts#null weight, full client path: a set logged with no weight while offline reaches Postgres as SQL NULL"
        status: pass
    human_judgment: false
  - id: D5
    description: "Criterion 4's drain half: a crud queue that survived a client schema redefinition still pushes and drains once connected"
    requirement: "PLAT-07"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/sync.spec.ts#post-redefinition drain: a crud queue that survived a client schema redefinition still pushes and drains"
        status: pass
    human_judgment: false
  - id: D6
    description: "Two browser contexts signed into the same account, each logging sets offline, converge with no logged set lost (browser half of WINDOWS #26)"
    requirement: "PLAT-02"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/sync.spec.ts#two clients converge: sets logged offline in two browser contexts both reach the other after reconnect"
        status: pass
    human_judgment: false
  - id: D7
    description: "The app remains usable — a local write still succeeds and queues — with the PowerSync Service stopped"
    verification:
      - kind: e2e
        ref: "apps/mobile/e2e/sync.spec.ts#service down stays usable: a local write still succeeds and queues while the PowerSync Service is unreachable"
        status: pass
    human_judgment: false
  - id: D8
    description: "browser-durability CI job runs the local-only durability project on every push; the sync project's exclusion cause is documented at the exclusion site"
    verification:
      - kind: other
        ref: ".github/workflows/ci.yml — job browser-durability; parses via js-yaml, contains playwright install --with-deps chromium and pnpm --filter mobile test:e2e:durability, no continue-on-error/if:always()"
        status: pass
    human_judgment: false

duration: ~2h (session spanned a compaction boundary; task commits span 18:20-19:21 local time, 2026-08-17)
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 12: Offline drain, schema-redefinition durability, and two-client convergence Summary

**5 new Playwright cases against a live self-hosted PowerSync Service, the real API, and real Postgres prove roadmap criteria 1 and 4, plus two Rule-1 production bugs fixed in the sync connector that this round's real-browser exercise was the first to hit.**

## Performance

- **Duration:** ~2h (task commits: 18:20:58 -> 19:21:02 local; earlier investigation before Task 1's commit is not reflected in git timestamps due to a mid-session context compaction)
- **Tasks:** 3/3 completed
- **Files modified:** 13
- **Commits:** 3 (`45a955d`, `a3c4c5c`, `c90f181`)

## Accomplishments

- **Roadmap criterion 4** (schema upgrade doesn't eat unsynced work) proven against a *populated* pre-migration database: a session, an exercise, and 3 logged sets (one with no weight) are logged through the real write helpers with **crud queue depth 5** (1 session + 1 exercise + 3 sets), never connected, never finished. The database is closed and reopened under a redefined schema (`notes` column added, `side` column removed). Every set survives with original weight/reps, `notes` reads null, `side` is absent from the view, and **crud queue depth after reopen is asserted equal to the depth before close** (`expect(depthAfter).toBe(depthBefore)`) — not a hardcoded number, so the proof holds regardless of the underlying op-per-row PowerSync queue granularity.
- **PLAT-07's ordering and empty-input edges** covered: `set_index` stays sequential across a redefinition with no gap or repeat; a reopen against a database that never logged anything returns zero rows and zero crud depth with no error; a round trip back to `v1` after `v2` leaves everything readable in both directions.
- **Roadmap criterion 1** (offline writes drain automatically, no user action) proven with a mechanically-checked "no user action" claim: the drain window is bracketed by `// drain-region:start` / `// drain-region:end` sentinel comments, and an `awk`-scoped grep confirms zero page-driving calls (`click`, `goto`, `reload`, `fill`, etc.) appear between them, while the same pattern over the whole file returns 4 matches (the sign-in step), proving the negative grep isn't trivially vacuous.
- **Null weight through the full client path**: a set logged with no weight while offline reaches Postgres as SQL `NULL` (distinguished from the literal `'0.000'`) after going through the real crud queue and connector — not only a direct API push, which 02-10 already covered.
- **Two clients converge** (browser half of WINDOWS #26, closing 02-08 Task 3's open checkpoint): two independent browser contexts signed into the same account, both offline, both log distinct sets, both reconnect — every set from both contexts reaches Postgres and each context's own local database eventually reads the *other* context's set (pull, not just push).
- **Service down stays usable**: with the PowerSync Service container stopped (`docker stop`), a local write still succeeds and the crud queue still accepts it; the container is restarted and its liveness probe re-polled in a `finally` block so the stack is left healthy for subsequent runs.
- **Two genuine, previously-unexercised production bugs found and fixed** in `SyncConnector`/`apiFetch` — see Deviations below. Both were undetectable by any means short of driving the connector against a real browser and a real HTTP server, which is exactly what 02-08's Task 3 checkpoint had left unresolved.
- **CI wiring**: `playwright.config.ts` split into `durability` and `sync` projects (already true when this plan resumed — verified, not re-done); added `test:e2e:durability` script and a `browser-durability` CI job running only the local-only project, with the `sync` project's exclusion and cause (`wal_level=logical` unreachable via a plain GitHub Actions service container) documented as a comment at the job.
- **WINDOWS ledger**: #20, #21 marked fixed (re-verified via a fresh 8/8-passing run of `null-weight.e2e-spec.ts` against the current nullable-schema/coercion-free code — these were already fixed by 02-10/02-11 but the ledger hadn't caught up); #22 marked fixed (the real PowerSync web database the entry said couldn't be constructed under Jest is now exercised end to end by 10 passing Playwright cases across this plan and 02-09); #23 was already fixed by 02-09. #17, #19, #26 amended (not closed) with what specifically changed.

## Task Commits

Each task was committed atomically:

1. **Task 1: An app upgrade across a schema change does not eat unsynced work** - `45a955d` (feat)
2. **Task 2: Offline writes sync themselves, and two clients converge** - `a3c4c5c` (feat)
3. **Task 3: Keep it honest — CI, the ledger, and the requirement statuses** - `c90f181` (docs)

## Files Created/Modified

- `apps/mobile/e2e/schema-redefinition.spec.ts` - 4 cases proving roadmap criterion 4 against a populated database
- `apps/mobile/e2e/sync.spec.ts` - 5 cases proving criterion 1, the drain half of criterion 4, two-client convergence, null-weight-through-client, and service-down usability
- `apps/mobile/e2e/node-shims.d.ts` - local ambient shim for `node:child_process`'s `execFileSync`, avoiding a new `@types/node` dependency for e2e-only type-checking
- `apps/mobile/lib/db/test-support.ts` - `SCHEMA_VARIANT_DELTA`, `TestAppSchemaV2`, variant-aware open/reopen, `readRawColumns`/`readLoggedSetsRaw`/`readAllLoggedSetsRaw`, `connectTestPowerSync`/`disconnectTestPowerSync`
- `apps/mobile/app/__durability.web.tsx` - harness surfaces for both the isolated test-support.ts database and the production `connectPowerSync`/`disconnectPowerSync` singleton
- `apps/mobile/playwright.config.ts` - `durability`/`sync` project split with a 90s timeout on `sync`
- `apps/mobile/lib/db/connector.ts` - fixed two Rule-1 bugs: bare relative sync paths, and a missing `Content-Type: application/json` on the push POST
- `apps/mobile/lib/api-client.ts` - fixed a Rule-1 bug: `apiFetch`'s `fetch()` call had no explicit `credentials` mode, so web silently dropped the session cookie cross-origin
- `apps/mobile/__tests__/offline-write.test.ts` - updated assertion for the now-fully-qualified push URL (135/135 still pass)
- `apps/mobile/package.json` - added `test:e2e:durability` script
- `.github/workflows/ci.yml` - added the `browser-durability` job
- `.planning/WINDOWS.md` - #20/#21/#22 marked fixed, #17/#19/#26 amended
- `.planning/phases/02-data-model-sync-engine/02-VALIDATION.md` - per-task verification map filled for PLAT-02/03/04/07/08, runtimes measured (~2.5s quick, ~80s full)

## Decisions Made

- `side` chosen as the removed column for the schema-redefinition test (already nullable both sides, exercises view re-derivation without a server migration)
- `connectTestPowerSync`/`disconnectTestPowerSync` added as a third connect surface rather than reusing the production singleton, so a schema-redefined isolated database's own crud queue can be proven to drain independently
- `sync.spec.ts` kept as its own Playwright project, deliberately excluded from CI with the specific unresolvable cause (`wal_level=logical` requires a compose-based Postgres a plain GH Actions service container can't provide) written at the exclusion site

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `connector.ts`'s sync endpoints resolved against the page's own origin, not the API**
- **Found during:** Task 2, first real-browser run of `sync.spec.ts`
- **Issue:** `@fitness/api-contracts` exports `SYNC_TOKEN_PATH`/`SYNC_PUSH_PATH` as bare paths (no origin). Every other `apiFetch` call site in the app builds a full URL from `API_URL` first; `connector.ts` did not, so on web a bare path resolved against the Expo dev server's own origin and 404'd.
- **Fix:** Both paths now built as `` `${API_URL}${path}` ``.
- **Files modified:** `apps/mobile/lib/db/connector.ts`
- **Verification:** `sync.spec.ts`'s first case; typecheck clean.
- **Committed in:** `a3c4c5c` (Task 2 commit)

**2. [Rule 1 - Bug] `apiFetch` had no explicit `credentials` mode, silently dropping the session cookie cross-origin on web**
- **Found during:** Task 2, after fix 1 resolved the 404 and exposed a 401 instead
- **Issue:** `fetch()`'s default credentials mode (`same-origin`) drops cookies on a cross-origin request; the API and the web app are two different origins (different ports at minimum). `getSessionCookieHeader()` deliberately returns `''` on web (the browser's own cookie jar is meant to carry auth there), so without an explicit `credentials: 'include'`, every authenticated `apiFetch` call on web silently 401'd.
- **Fix:** Added `credentials: 'include'` to the one `fetch()` call inside `apiFetch`.
- **Files modified:** `apps/mobile/lib/api-client.ts`
- **Verification:** A direct `curl` simulation (manual Origin + Cookie headers) confirmed the server's CORS/cookie handling was already correct; the fix made the real browser's request match that.
- **Committed in:** `a3c4c5c` (Task 2 commit)

**3. [Rule 1 - Bug] `connector.ts`'s push POST never set `Content-Type`, so the API's JSON body-parser silently skipped the body**
- **Found during:** Task 2, after fixes 1-2 resolved the token fetch and exposed a `500 Internal Server Error` (`TypeError: Cannot read properties of undefined (reading 'batch')`) on `/v1/sync/push`
- **Issue:** `fetch()` with a plain string body and no explicit `Content-Type` header defaults to `text/plain` in the browser. Nest's JSON body-parser only parses `application/json`, so `body` arrived `undefined` server-side, throwing on `body.batch`.
- **Fix:** Added `headers: { 'Content-Type': 'application/json' }` to the push request.
- **Files modified:** `apps/mobile/lib/db/connector.ts`
- **Verification:** Confirmed via the API server's own error log (`Cannot read properties of undefined (reading 'batch')`) before the fix, and a clean `201` response after; all 5 `sync.spec.ts` cases pass.
- **Committed in:** `a3c4c5c` (Task 2 commit)

**4. [Rule 3 - Blocking] Test invocations were reusing a stale Expo dev server bundle across separate local runs**
- **Found during:** Task 2, while investigating why fix 3 didn't appear to take effect
- **Issue:** `playwright.config.ts`'s `webServer.reuseExistingServer: !process.env.CI` reuses an already-running dev server between separate CLI invocations when `CI` is unset locally, serving a stale (pre-fix) bundle.
- **Fix:** No code change — this is process discipline, not a code defect. All subsequent local test runs in this session and the CI job itself set `CI=1` (CI does so natively; documented here since it cost real debugging time).
- **Files modified:** none (process fix)
- **Committed in:** N/A (no file change)

**5. [Rule 1 - Bug] `offline-write.test.ts`'s push-URL assertion was stale after fix 1**
- **Found during:** Task 2, after fixing `connector.ts`'s bare paths
- **Issue:** The unit test asserted the push URL equaled the bare `SYNC_PUSH_PATH`, which fix 1 made incorrect.
- **Fix:** Assertion updated to expect `` `${API_URL}${SYNC_PUSH_PATH}` ``.
- **Files modified:** `apps/mobile/__tests__/offline-write.test.ts`
- **Verification:** `pnpm --filter mobile test` — 135/135 pass.
- **Committed in:** `a3c4c5c` (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bug fixes, 1 Rule 3 process fix)
**Impact on plan:** All fixes were necessary for `sync.spec.ts` to prove anything real — without them the connector could not reach the API at all. No scope creep; all fixes are inside the files the plan already declared in scope (`connector.ts`, `api-client.ts`) or their direct consequence (`offline-write.test.ts`).

## Issues Encountered

- The 401-after-404-fix investigation initially looked like it might be a CORS/cookie infrastructure gap; a manual `curl` simulation with an explicit `Origin` and `Cookie` header proved the server-side handling was already correct, isolating the bug to the browser's own request (missing `credentials: 'include'`) rather than the API.
- After the `credentials: 'include'` fix, a `500` on the push endpoint initially looked identical in the browser console to the earlier 401s (`Failed to load resource`), and was only disambiguated by reading the API server's own stderr log, which named the exact `TypeError` and line.
- Two consecutive local re-runs after fixing `connector.ts`'s `Content-Type` still showed the pre-fix `500`, which cost additional time before the `reuseExistingServer`/`CI` interaction (deviation 4) was identified as the cause — the fix was correct on disk the whole time but was not being served.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2's roadmap criteria 1 and 4 both now have real, passing, live-stack proofs; criteria 2, 3, and 5 were already verified by prior plans in this phase and are unaffected by this round.
- `sync.spec.ts` establishes a durable pattern (region-gated grep for "no user action" claims, real-sign-in-screen session acquisition, real Postgres assertions) that future phases needing a similar no-user-action guarantee can reuse directly.
- Remaining open gaps carried forward, unchanged by this plan: native (iOS/Android) op-sqlite behavior is still entirely unexercised (WINDOWS #16, #17 web-only now); 9 of 12 `SYNCED_TABLES` still have no server apply path (WINDOWS #19, now an explicit tested boundary rather than a silent one); the device half of two-client convergence remains blocked pending the ROADMAP Phase 999.1 native UAT sweep (WINDOWS #26).
- No stubs, skipped tests, or unrun `<verify>` blocks from this plan's own scope remain open — every acceptance criterion in the plan's Task 1, Task 2, and Task 3 sections was checked against the final file state before commit.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All 14 claimed files verified present via `ls -la`. All 3 claimed commit hashes (`45a955d`, `a3c4c5c`, `c90f181`) verified present via `git log --oneline --all`.
