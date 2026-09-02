---
quick_id: 260902-hrj
subsystem: infra
tags: [wrangler, cloudflare-pages, pnpm, expo, deploy]

provides:
  - "apps/mobile deploy:web script (export + wrangler pages deploy, unexecuted)"
  - "wrangler pinned to the exact literal 4.128.0 as an apps/mobile devDependency"
affects: [deploy, ci]

actuals:
  tokens: 27392
  tasks: 2
  commits: 1

tech-stack:
  added: ["wrangler@4.128.0 (Cloudflare Workers/Pages CLI, apps/mobile devDependency)"]
  patterns: ["hand-write exact-pin devDependency versions instead of `pnpm add`, which writes a `^` range by default"]

key-files:
  created: []
  modified:
    - apps/mobile/package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml

key-decisions:
  - "wrangler pinned as bare literal 4.128.0 (no range operator) so a later install cannot silently drift the deploy CLI"
  - "deploy:web composes expo export --platform web --clear (defaults output to dist) with wrangler pages deploy dist --project-name fitness-web --branch main, matching the previously ad-hoc npx invocation"

requirements-completed: []

duration: ~10min
completed: 2026-09-02
status: complete
---

# Quick 260902-hrj: Add a pinned `deploy:web` script to apps/mobile Summary

**Added an exact-pinned `wrangler@4.128.0` devDependency and a `deploy:web` script to `apps/mobile/package.json` — no deploy executed.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 3 (`apps/mobile/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`)

## Accomplishments
- `apps/mobile/package.json` carries `"deploy:web": "expo export --platform web --clear && wrangler pages deploy dist --project-name fitness-web --branch main"`, placed immediately after `build`.
- `wrangler` added as a devDependency pinned to the bare literal `"4.128.0"` — verified no `^`/`~`/range prefix.
- `pnpm install` reconciled the lockfile; `wrangler` and its transitive tree are recorded under the `apps/mobile` importer in `pnpm-lock.yaml`.
- `pnpm --filter mobile exec wrangler --version` resolves `4.128.0` from the workspace's own `node_modules`, not npx.

## Task Commits

1. **Task 1: Add the deploy:web script and the exactly-pinned wrangler devDependency** - staged into the Task 2 commit (config-only edit + `pnpm install`, no standalone commit per plan design)
2. **Task 2: Commit the three files as one unattributed chore commit** - `cb5c903` (chore)

## Files Created/Modified
- `apps/mobile/package.json` - added `deploy:web` script and pinned `wrangler` devDependency
- `pnpm-lock.yaml` - wrangler 4.128.0 + transitive tree (incl. miniflare) recorded under `apps/mobile`
- `pnpm-workspace.yaml` - pnpm-appended `minimumReleaseAgeExclude` entries (`miniflare@5.20260831.0-alpha`, `wrangler@4.128.0`) plus an `allowBuilds.workerd: true` entry (see Deviations)

## Decisions Made
- Hand-wrote the devDependency version instead of `pnpm add -D wrangler@4.128.0`, since pnpm's default save-prefix (`^`) would have produced a range, defeating the pin.
- Left `pnpm-workspace.yaml`'s pnpm-appended `minimumReleaseAgeExclude` entries exactly as written (wrangler@4.128.0 was inside pnpm's 24h release-age quarantine at execution time — published 2026-09-01T17:17:39Z).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Approved the `workerd` native postinstall build script**
- **Found during:** Task 1 verification (`pnpm --filter mobile exec wrangler --version`)
- **Issue:** `pnpm install` left `workerd@1.20260831.1`'s postinstall script unrun (`[ERR_PNPM_IGNORED_BUILDS]`), which made `pnpm --filter mobile exec` fail outright before it could resolve the `wrangler` binary — the plan's own verification command was blocked. `workerd` is Cloudflare's own Workers runtime, pulled in as a transitive of `wrangler`/`miniflare`, both already flagged VERIFIED in the plan's package-legitimacy table.
- **Fix:** Ran `pnpm approve-builds workerd` (non-interactive, scoped to the one package, not `--all`). pnpm recorded `allowBuilds: workerd: true` in `pnpm-workspace.yaml`, then ran the postinstall script.
- **Files modified:** `pnpm-workspace.yaml` (one additional `allowBuilds` entry, in addition to the plan-anticipated `minimumReleaseAgeExclude` entries)
- **Verification:** `pnpm --filter mobile exec wrangler --version` then resolved `4.128.0` cleanly; Task 1 and Task 2 automated `<verify>` blocks both passed.
- **Committed in:** `cb5c903` (part of the single Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to make the plan's own verification command runnable; no scope creep — `workerd` was already an accepted transitive of the already-vetted `wrangler`/`miniflare` pair, and no deploy was run.

## Issues Encountered
None beyond the workerd build-approval deviation above.

## User Setup Required
None - no external service configuration required. `deploy:web` was added but deliberately never executed; running it later still requires the operator's own `CLOUDFLARE_API_TOKEN`/OAuth in their environment.

## Next Phase Readiness
`pnpm --filter mobile run deploy:web` is ready to run whenever the operator chooses to deploy. No further setup required for this change; nothing here blocks other work.

---
*Quick task: 260902-hrj*
*Completed: 2026-09-02*
