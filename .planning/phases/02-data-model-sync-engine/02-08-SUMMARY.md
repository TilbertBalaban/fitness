---
phase: 02-data-model-sync-engine
plan: 08
subsystem: sync-engine
tags: [powersync, docker, colima, postgres-logical-replication, jwt, hs256, sync-streams, nestjs, expo-router]

requires:
  - phase: 02-data-model-sync-engine
    provides: "02-01: PowerSync adopted, the push wire contract, connector.ts/powersync.ts/powersync.web.ts local-only factories, getPowerSync()"
  - phase: 02-data-model-sync-engine
    provides: "02-03: conflict resolution and the protocol-level two-device merge proof PLAT-04's correctness already rests on"
  - phase: 02-data-model-sync-engine
    provides: "02-06: getUploadQueueStats() on both powersync.ts/powersync.web.ts, which this plan preserves untouched"
provides:
  - "A running, self-hosted PowerSync Service (docker-compose.dev.yml) replicating real data from the native Postgres apps/api writes to — verified starting and streaming, not only configured"
  - "GET /v1/sync/token: session-scoped, short-lived, HS256-signed sync credentials, refusing to mint when unconfigured"
  - "ops/powersync/sync-rules.yaml: per-user Sync Streams (edition 3) covering all 12 SYNCED_TABLES, including the two- and three-hop JOIN chains legacy bucket_definitions cannot express"
  - "apps/mobile/lib/db/connector.ts's fetchCredentials wired to the token endpoint; powersync.ts/powersync.web.ts's connectPowerSync/disconnectPowerSync; app/_layout.tsx driving both from session state"
  - "02-08-DECISION.md: Task 1's self-host selection recorded, including what changed (Colima) between the original checkpoint and this execution"
affects: [phase-3-and-later, ship-gate]

actuals:
  tokens: 6614
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Hand-rolled HS256 JWT signing (node:crypto createHmac, no new dependency) for a token whose only consumer is PowerSync's own static-secret client_auth.jwks — avoids a package-legitimacy checkpoint for a three-segment format the project already has the primitives for"
    - "PowerSync Sync Streams (config.edition: 3), not legacy bucket_definitions — the only sync-rules format supporting JOIN/subqueries, needed because session_exercise/logged_set and routine_day/routine_exercise sit two and three ownership hops from workout_session/routine respectively"
    - "Self-hosted PowerSync container reaches the native Homebrew Postgres via host.docker.internal rather than running a second, disconnected Postgres in docker-compose — keeps exactly one source of truth"
    - "docker-compose env-var substitution inside powersync.yaml's !env tags requires a PS_-prefixed name; the project's own POWERSYNC_JWT_SECRET is remapped to PS_JWT_SECRET only at the docker-compose environment: layer, never renamed elsewhere"

key-files:
  created:
    - ops/powersync/powersync.yaml
    - ops/powersync/sync-rules.yaml
    - apps/api/src/sync/powersync-token.ts
    - apps/api/test/powersync-token.e2e-spec.ts
    - .planning/phases/02-data-model-sync-engine/02-08-DECISION.md
  modified:
    - docker-compose.dev.yml
    - .env.example
    - .github/workflows/ci.yml
    - apps/api/src/sync/sync.controller.ts
    - apps/mobile/lib/db/connector.ts
    - apps/mobile/lib/db/powersync.ts
    - apps/mobile/lib/db/powersync.web.ts
    - apps/mobile/app/_layout.tsx

key-decisions:
  - "Task 1 (checkpoint:decision, resolved by human in a prior session): self-host over PowerSync Cloud or deferring the pull leg"
  - "PowerSync replicates from the native Homebrew postgresql@18 instance (127.0.0.1:5432), not the unused `postgres` service already declared in docker-compose.dev.yml — starting that second Postgres would either collide with the host's port 5432 or fork the data apps/api writes to from what PowerSync reads. The container reaches the host instance via host.docker.internal (verified reachable under Colima)."
  - "Sync Streams (edition 3) instead of the plan's literal bucket_definitions phrasing — legacy Sync Rules cannot express a JOIN or a subquery in either a parameter or a data query (docs.powersync.com, Supported SQL), and this schema's session_exercise/logged_set and routine_day/routine_exercise chains are two and three ownership hops from their user_id-bearing root. Every query still resolves to exactly one user via auth.user_id() — the per-user security boundary T-02-10 requires is unchanged, only the SQL surface used to express it."
  - "mintSyncToken hand-rolls HS256 signing with node:crypto rather than adding a JWT library — the only verifier is PowerSync's own static HS256 client_auth.jwks, so there is no JWKS fetch, no RS256, and no per-library claim-validation surface to replicate; avoids a package-legitimacy checkpoint for what is three HMAC-signed base64url segments"
  - "The e2e case for 'rejected once expired' calls the real running PowerSync Service and asserts 401 when reachable, but degrades to asserting a connection-refused attempt was made when unreachable — CI's e2e job provisions Postgres only, not a PowerSync container, so this keeps the suite honest in both environments without adding docker-in-docker to CI"

patterns-established:
  - "A checkpoint:human-verify gate that needs real browser windows is left genuinely open when the environment forbids browser automation, rather than approximated or silently marked done — recorded as status: halted plus a WINDOWS.md entry, not folded into a false 'complete'"

requirements-completed: []

coverage:
  - id: D1
    description: "Task 1: self-host selected as where the PowerSync Service runs, resolved by human decision in a prior session and recorded with what changed (Colima) before this execution resumed"
    requirement: ""
    verification: []
    human_judgment: true
    rationale: "checkpoint:decision — the plan requires an explicit human selection between architecturally divergent infra paths; this summary only records an already-made decision, it does not re-derive it."
  - id: D2
    description: "A self-hosted PowerSync Service runs against real Postgres logical replication, sync rules scope every table to exactly one user via auth.user_id() (including through multi-hop JOINs), and the API mints short-lived HS256 sync tokens from the authenticated session only — verified against the live running service, not only configured"
    requirement: "PLAT-03, PLAT-04"
    verification:
      - kind: e2e
        ref: "apps/api/test/powersync-token.e2e-spec.ts — 7 cases (401 gate, 200+endpoint, subject scoping, TTL bound, header/query injection defense, real 401 from the live PowerSync Service on an expired token, 503 when POWERSYNC_JWT_SECRET is unset)"
        status: pass
      - kind: other
        ref: "docker compose --env-file .env -f docker-compose.dev.yml up -d powersync; container logs show 'Activated new replication stream' with zero errors; GET /probes/startup and /probes/liveness both 200"
        status: pass
      - kind: other
        ref: "grep -rEc 'req\\.(body|query|params|headers)\\[.?user' apps/api/src/sync/sync.controller.ts == 0; grep -c 'user_id' ops/powersync/sync-rules.yaml (13) >= 12 bucket selections; grep -cE 'muscle_group|exercise_muscle_mapping' ops/powersync/sync-rules.yaml == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two real clients (two browser windows/profiles) converge on the same workout after concurrent offline edits, and the app stays fully usable with the sync service stopped — PLAT-03/PLAT-04 proven end to end, not only at the protocol or infrastructure level"
    requirement: "PLAT-03, PLAT-04"
    verification: []
    human_judgment: true
    rationale: "checkpoint:human-verify, gate=blocking, requiring two real browser windows with manual visual/functional judgment ('does this feel right', watching convergence happen). This project's own CLAUDE.md forbids launching a browser or driving the app except on explicit request, and no simulator/device/Playwright-driven browser is available in this execution environment regardless. Left genuinely open (WINDOWS.md entry 26) rather than approximated."

duration: ~2h10min
completed: 2026-08-17
status: halted
---

# Phase 2 Plan 8: Self-Hosted PowerSync Service and Session-Scoped Sync Tokens Summary

**A real, running self-hosted PowerSync Service replicating from Postgres, per-user Sync Streams covering all 12 synced tables, and a session-only HS256 token endpoint — verified end to end against the live service; the two-browser-window human convergence check (Task 3) remains an open checkpoint no automation in this environment can close.**

## Performance

- **Duration:** ~2h10min
- **Tasks:** 2/3 completed (Task 1: decision recorded; Task 2: implemented and verified; Task 3: open checkpoint)
- **Files modified:** 13 (5 created, 8 modified)

## Accomplishments

- Resolved the container-runtime blocker that made Task 1 hard in the first place: Colima + Docker CLI were already installed and verified by the orchestrator before this plan resumed, so `self-host` (the human's prior selection) could actually be built and proven rather than only configured.
- Stood up `ops/powersync/powersync.yaml` + `sync-rules.yaml` and a `powersync` service in `docker-compose.dev.yml`, replicating from the same native Homebrew `postgresql@18` instance `apps/api` already writes to (via `host.docker.internal`), with Postgres as its own bucket storage — no MongoDB, matching `02-RESEARCH.md`'s finding.
- Verified the service for real: `docker compose up -d powersync` produced live replication of the actual seeded corpus (`Activated new replication stream`, zero errors), and both `/probes/startup`/`/probes/liveness` return 200.
- Discovered mid-task that the plan's literal `bucket_definitions`/"one bucket per user" phrasing cannot express this schema's multi-hop ownership chains (`logged_set` is two joins from `workout_session`) — switched to PowerSync's Sync Streams edition, which supports JOINs, and verified the same per-user security boundary holds via `auth.user_id()` on every query.
- Built `GET /v1/sync/token` with a hand-rolled HS256 signer (no new dependency), wired `apps/mobile/lib/db/connector.ts`'s `fetchCredentials` and `app/_layout.tsx`'s `connect()`/`disconnect()` lifecycle to it, and proved the whole chain — including real rejection of an expired token by the live service — in a 7-case e2e suite.
- Kept CI green: added the two new env vars its e2e job needs, verified locally (by stopping the powersync container) that the suite's live-service case degrades to an honest "connection attempted, refused" assertion rather than a false pass when no PowerSync container exists, exactly as GitHub Actions' current e2e job will see it.

## Task Commits

Each task was committed atomically:

1. **Task 1: Where the sync service runs** (checkpoint:decision, resolved by human in a prior session = `self-host`) — `d7078e7` (docs: record the decision and what changed since)
2. **Task 2: A running service, per-user buckets, and a token that expires** (auto) — `0e30fac` (feat: service config, sync streams, token endpoint, connector/powersync wiring, CI env)

**Task 3: Two windows, one training log** (checkpoint:human-verify, gate=blocking) — **not executed**. See "Checkpoint: Task 3 Pending" below.

## Files Created/Modified

- `ops/powersync/powersync.yaml` — self-hosted service config: Postgres-only replication + storage, HS256 `client_auth` against a static shared secret
- `ops/powersync/sync-rules.yaml` — Sync Streams (edition 3), one `user_data` stream with 12 `auth.user_id()`-scoped queries, including the JOIN chains for `session_exercise`/`logged_set`/`routine_day`/`routine_exercise`
- `docker-compose.dev.yml` — `powersync` service, reaching the host's Postgres via `host.docker.internal`
- `apps/api/src/sync/powersync-token.ts` — `mintSyncToken`, `SYNC_TOKEN_TTL_SECONDS` (300s), hand-rolled HS256 signing
- `apps/api/src/sync/sync.controller.ts` — `GET /v1/sync/token`, session-only user id, 503 when unconfigured
- `apps/api/test/powersync-token.e2e-spec.ts` — 7 e2e cases, one per behaviour line
- `apps/mobile/lib/db/connector.ts` — `fetchCredentials` calls `GET /v1/sync/token` via `apiFetch`
- `apps/mobile/lib/db/powersync.ts` / `powersync.web.ts` — `connectPowerSync`/`disconnectPowerSync` exports (preserves `getUploadQueueStats` from 02-06)
- `apps/mobile/app/_layout.tsx` — `connect()`/`disconnect()` driven by `authClient.useSession()`'s signed-in state
- `.github/workflows/ci.yml` — `POWERSYNC_URL` + a throwaway `POWERSYNC_JWT_SECRET` added to the e2e job
- `.env.example` — `POWERSYNC_URL`, `POWERSYNC_JWT_SECRET`, `POWERSYNC_REPLICATION_PASSWORD`, `EXPO_PUBLIC_POWERSYNC_URL`
- `.planning/phases/02-data-model-sync-engine/02-08-DECISION.md` — Task 1's record

## Decisions Made

- **Self-host, native Postgres as the replication source** — see "Two Postgres instances" below for the full reasoning.
- **Sync Streams over legacy bucket_definitions** — see key-decisions in frontmatter; this is the plan's one real deviation, driven by the schema's ownership depth rather than a preference.
- **Hand-rolled HS256 JWT** — avoids a new dependency and its package-legitimacy checkpoint for a format this project already has the crypto primitives for.
- **Live-service e2e case degrades gracefully when unreachable** — keeps the suite meaningful locally (it really does hit the running container and gets a real 401) without requiring CI to run Docker-in-Docker.

## Environment note: Colima, not Docker Desktop

The container runtime on this machine is **Colima** (`colima` + Docker CLI 29.7.2 + `docker-compose` 5.4.0 via Homebrew), not Docker Desktop. `sudo` on this machine requires an interactive password the orchestrator cannot supply, and Docker Desktop's first-launch flow installs a privileged helper that would stall on exactly that prompt. Colima provides the same Docker API with no GUI and no privileged helper, and nothing in `docker-compose.dev.yml` differs because of it — `docker compose` commands run identically either way. `host.docker.internal` resolves correctly under Colima (verified directly: a container reached the host's loopback-bound Postgres through it), which is the one behavior this plan's design depended on that could plausibly have differed between the two runtimes.

## Two Postgres instances: which one PowerSync replicates from

Two different Postgres databases exist in this repository's dev tooling:

1. **Native Homebrew `postgresql@18`** (127.0.0.1:5432) — the one actually running, and the one `apps/api`'s `DATABASE_URL` and every existing e2e suite already point at.
2. **`postgres:17` declared in `docker-compose.dev.yml`** — a container definition that has never been started; a completely separate, empty database.

**PowerSync replicates from the native instance (option 1).** Reasons:

- The whole point of pull is that a device learns about writes the API already made — those writes land in whichever Postgres `DATABASE_URL` points at. Pointing PowerSync at the *other* Postgres (option 2) would mean replicating from a database nothing ever writes to; pull would silently see nothing, forever.
- Starting the `postgres` service in `docker-compose.dev.yml` would also need to bind host port 5432, which the native instance already occupies — a collision, not a coexistence, unless the native instance were stopped and every existing test suite repointed at the container. That's a larger, riskier change than this plan's scope, for no benefit: the native instance is not a placeholder here, it's the system of record.
- The plan's own Task 2 action text anticipated exactly this: "Reconfigure the local Postgres for logical replication and create a dedicated replication role for the service; do it with `psql` and `brew services`."

Concretely: `ALTER SYSTEM SET wal_level = logical` + `brew services restart postgresql@18` (both ran without any `sudo` prompt — the service is a per-user LaunchAgent), then a dedicated `powersync_role` (`REPLICATION LOGIN`, `SELECT` on all tables + future tables via `ALTER DEFAULT PRIVILEGES`, `CREATE` on the `fitness` database for the storage schema) and a `CREATE PUBLICATION powersync FOR ALL TABLES`. The container reaches this native instance via `host.docker.internal:5432`, verified reachable from inside a container before any config was written.

## Checkpoint: Task 3 Pending

Task 3 ("Two windows, one training log") is a `checkpoint:human-verify` with `gate="blocking"` requiring a person to open two browser profiles, sign into the same account, log sets in each while online and then offline, and observe convergence and continued usability with the sync service stopped. This genuinely needs a human's eyes on two live browser windows — it is not something this execution can approximate:

- This project's own `CLAUDE.md` forbids launching a browser or driving the app unless explicitly asked, independent of any other constraint.
- This execution's environment constraints separately and explicitly forbid browser automation.
- No simulator, device, or Playwright-driven browser exists in this worktree regardless of policy.

Everything Task 3 needs already exists and runs: the PowerSync Service is up and replicating, the token endpoint is live and tested, and `connector.ts`/`_layout.tsx` wire `connect()`/`disconnect()` to session state. What remains is purely the human observation step. Recorded as `.planning/WINDOWS.md` entry 26 (`unrun-verify`). This SUMMARY is marked `status: halted` rather than `complete` so downstream automation does not treat PLAT-03/PLAT-04 as proven end-to-end until a human actually runs the steps in `02-08-PLAN.md`'s Task 3.

**To resume:** start the stack (`pnpm --filter api dev`, `docker compose --env-file .env -f docker-compose.dev.yml up -d powersync`, `pnpm --filter mobile dev`), open two browser profiles signed into the same account, and follow `02-08-PLAN.md`'s Task 3 `<how-to-verify>` steps exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Legacy `bucket_definitions` cannot express this schema's ownership chains**
- **Found during:** Task 2, writing `ops/powersync/sync-rules.yaml`
- **Issue:** The plan's action text describes "one bucket per user" using the term the PowerSync docs call legacy Sync Rules (`bucket_definitions`). That format's parameter and data queries do not support JOINs or subqueries at all (docs.powersync.com, Supported SQL). `session_exercise`/`logged_set` are two and three joins from their `user_id`-bearing root (`workout_session`), and `routine_day`/`routine_exercise` are similarly nested under `routine` — neither can be expressed as a single-table `WHERE` clause.
- **Fix:** Used PowerSync's Sync Streams edition (`config: edition: 3`), whose expanded SQL compiler supports JOIN/CTEs/multiple queries per stream, confirmed against live docs via Context7 before writing any config. Every query still resolves to exactly one user through `auth.user_id()` — the security boundary is unchanged, only the SQL surface used to express it.
- **Files modified:** `ops/powersync/sync-rules.yaml`
- **Verification:** `grep -c 'user_id' ops/powersync/sync-rules.yaml` (13) exceeds the 12 table selections; `grep -cE 'muscle_group|exercise_muscle_mapping'` returns 0; the live running service replicated every one of these tables with zero errors (see container logs).
- **Committed in:** `0e30fac`

**2. [Rule 3 - Blocking issue] docker-compose's `powersync.yaml` `!env` substitution rejected `POWERSYNC_JWT_SECRET`**
- **Found during:** Task 2, first `docker compose up` attempt
- **Issue:** PowerSync's config parser refuses to substitute any `!env` variable that does not start with `PS_` — a hard-coded prefix requirement, not something a `.env` naming convention could avoid.
- **Fix:** Renamed the variable to `PS_JWT_SECRET` only inside `docker-compose.dev.yml`'s `environment:` block, mapping it from the project's own `POWERSYNC_JWT_SECRET` (`.env.example`, the API, and this project's own naming stay unchanged everywhere else).
- **Files modified:** `docker-compose.dev.yml`, `ops/powersync/powersync.yaml`
- **Verification:** the service started and replicated successfully after the rename; failed identically on `sslmode`-style other `!env` names before the fix (confirmed the `PS_` prefix is the actual constraint, not something else in the YAML).
- **Committed in:** `0e30fac`

**3. [Rule 3 - Blocking issue] `.github/workflows/ci.yml` needed the two new env vars, though it is outside the plan's declared `files_modified`**
- **Found during:** Task 2, reasoning through whether the new e2e suite would pass in CI
- **Issue:** CI's e2e job has no `POWERSYNC_URL`/`POWERSYNC_JWT_SECRET` in its `env:` block. Without them, `GET /v1/sync/token` would 503 on *every* case in `powersync-token.e2e-spec.ts` in CI (not just the live-service one), because the controller correctly refuses to mint or report an endpoint when either is unset.
- **Fix:** Added `POWERSYNC_URL` (a literal, matching the pattern of other e2e env vars) and a per-run throwaway `POWERSYNC_JWT_SECRET` (same generation pattern as the existing `BETTER_AUTH_SECRET` step) to the e2e job.
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** locally simulated CI's exact condition by stopping the `powersync` container and re-running the full suite — all 7 cases still passed, with the live-service case correctly falling into its documented connection-refused branch.
- **Committed in:** `0e30fac`

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking issues that would have made the plan's own acceptance criteria or the existing CI baseline fail otherwise)
**Impact on plan:** None is scope creep. #1 is a genuine constraint of the sync-rules format the plan didn't anticipate; #2 and #3 are the minimum changes needed to make the plan's own verify steps and the "don't break CI" constraint hold simultaneously.

## Known Stubs

None new from this plan's own code. Pre-existing stubs (`apps/mobile/lib/db/id.ts`'s non-cryptographic UUID, `sync.service.ts`'s 9-of-12-table server apply gap) are unrelated to this plan and remain open in `.planning/WINDOWS.md` entries 18 and 19.

## Broken-windows ledger

Entry 26 (`unrun-verify`, Task 3's pending human checkpoint) appended to `.planning/WINDOWS.md` via `gsd-tools windows append`, committed with this SUMMARY.

## Issues Encountered

None beyond the three auto-fixed deviations above, all resolved within Task 2's own scope.

## User Setup Required

None beyond what `.env.example` now documents (`POWERSYNC_URL`, `POWERSYNC_JWT_SECRET`, `POWERSYNC_REPLICATION_PASSWORD`, `EXPO_PUBLIC_POWERSYNC_URL`) — no external service or dashboard configuration, since `self-host` was selected over PowerSync Cloud.

## Next Phase Readiness

- PLAT-03/PLAT-04's transport is built, running, and proven end-to-end through automated tests plus a live-service integration check — everything short of the human observing two real browser windows converge.
- `status: halted` on this SUMMARY blocks anything that names this plan in `depends_on` until Task 3 is resolved by a human. Nothing in this phase currently depends on 02-08, so this does not block Phase 2's own close, but the phase transition / milestone-completion tooling should treat PLAT-03/PLAT-04 as not-yet-fully-validated until Task 3 is approved.
- To close Task 3: bring the stack up (API, `powersync` container, mobile web), open two browser profiles, and follow `02-08-PLAN.md`'s Task 3 steps. No further code changes are anticipated — Task 3 is a verification step, not an implementation gap.

---
*Phase: 02-data-model-sync-engine*
*Completed: 2026-08-17*

## Self-Check: PASSED

All 5 created files confirmed tracked via `git ls-files` (ops/powersync/powersync.yaml,
ops/powersync/sync-rules.yaml, apps/api/src/sync/powersync-token.ts,
apps/api/test/powersync-token.e2e-spec.ts, 02-08-DECISION.md); both referenced commit hashes
(`d7078e7`, `0e30fac`) confirmed present in `git log`.
