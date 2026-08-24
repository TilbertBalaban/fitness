# Deferred Items — Phase 05, out of scope for individual plans

Items discovered during plan execution that are out of scope for the discovering plan's file
ownership. Not fixed here; logged for a future plan to pick up.

## 05-03: `powersync-token.e2e-spec.ts` fails locally — missing `POWERSYNC_JWT_SECRET`/`POWERSYNC_URL`

**Discovered during:** 05-03 Task 3, running the full `pnpm --filter api test:e2e` suite as the
plan's `<verification>` requires.

**Symptom:** All 5 cases in `apps/api/test/powersync-token.e2e-spec.ts` fail — 4 with
`expected 200 "OK", got 503 "Service Unavailable"`, and the 5th throws
`POWERSYNC_JWT_SECRET / POWERSYNC_URL must be set for this suite to run`. This worktree's `.env`
(created fresh for this plan, see below) sets only `DATABASE_URL`; it has no
`POWERSYNC_JWT_SECRET` or `POWERSYNC_URL`, and the running `fitness-powersync-1` Docker container
(up for several days, started by some earlier session with its own `.env`) already has a JWKS
baked in from a secret this worktree does not have.

**Scope:** Entirely unrelated to 05-03's file ownership (`apps/api/src/sync/sync.service.ts`,
`apps/api/src/sync/patch-update-set.ts`, `packages/api-contracts/src/sync.ts`, and the two new
sync e2e specs). `powersync-token.e2e-spec.ts` and `apps/api/src/sync/powersync-token.ts` are not
in this plan's `<files>` list; nothing this plan changed touches JWT minting.

**Not fixed here** per the SCOPE BOUNDARY (only auto-fix issues directly caused by the current
task's changes). Generating a POWERSYNC_JWT_SECRET locally would not by itself close this: the
already-running PowerSync Service container's JWKS is pinned to whatever secret started it, so a
freshly generated value would make the first 4 cases pass (server no longer 503s) but the 5th
case (`is rejected by the PowerSync Service once expired`) would still need the *same* secret the
container already trusts, which is not recoverable from this worktree.

**All other suites pass:** 20/21 suites, 241/246 tests green, including both of this plan's new
specs (`personal-record-sync.e2e-spec.ts`, `session-annotations-sync.e2e-spec.ts`) and the
`sync-push`/`sync-aggregate` regression checks.

**Note on `.env`:** this worktree had no `.env` file (both `.env` and `.env.example` are outside
this agent's read-permitted paths). A minimal `.env` with `DATABASE_URL=postgresql://postgres:dev@localhost:5432/fitness`
(matching `docker-compose.dev.yml`'s `postgres` service) was created locally so `drizzle-kit push`
and the e2e specs could run at all. It is git-ignored (`.gitignore` line 6) and was not committed.
A future plan that needs the PowerSync-Service-backed suites green should provision
`POWERSYNC_JWT_SECRET`/`POWERSYNC_URL` to match `ops/powersync/powersync.yaml`'s configured JWKS,
or restart the `fitness-powersync-1` container against a known secret.
