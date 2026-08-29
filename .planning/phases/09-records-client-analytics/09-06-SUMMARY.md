# 09-06 Summary — Performance ranges and the entry link (ANLY-06)

**Completed:** 2026-08-29
**Status:** complete
**Provenance:** the executor was killed by an API session rate limit during verification. Its two commits (failing tests, then the implementation) were in the worktree; the exercise-detail entry link, its test, and the extended spec were not committed. The orchestrator recovered them and completed verification.

## What shipped

- `apps/mobile/app/exercise-performance.tsx` — the range switch (3 months / 1 year / all time), weekly-bucketed bests for the longer ranges, and the "nothing logged in this range" state distinct from "no history for this exercise".
- `apps/mobile/lib/db/exercise-history-query.ts` — extended for the wider ranges.
- `apps/mobile/app/exercises/[id].tsx` — the **"View performance"** link, rendered **unconditionally**. A link that vanishes when an exercise has no history is indistinguishable from a bug; S4's own empty state is the truthful answer.
- `apps/mobile/e2e/exercise-performance.spec.ts` — extended, executed.

## Seam discipline held

This plan was deliberately designed to touch none of the three files 09-04 and 09-05 share, driving the range switch through the DOM rather than a harness parameter. It did not edit `__durability.web.tsx`, `playwright.config.ts` or `test-support.ts` — so it contributed nothing to that merge.

## Evidence

| Check | Result |
|---|---|
| `pnpm --filter mobile test:e2e:durability` | **78 passed, 0 failed** (whole project) |
| `pnpm --filter mobile test` | 1946 passed / 108 suites |
| `npx turbo run typecheck lint test` | 21 tasks successful |

## Deferred, not gated

Native rendering (999.1) and max-font-scale visual review (999.2).
