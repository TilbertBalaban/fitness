---
phase: quick-260902-iyq
plan: 260902-iyq
subsystem: auth
tags: [better-auth, rate-limiting, cloudflare, render, nestjs]

requires: []
provides:
  - "resolveIpAddressHeaders(raw?) — dependency-free parser that turns a comma-separated RATE_LIMIT_IP_HEADERS value into an ordered, trimmed, lowercased header list, or undefined when unset/blank"
  - "auth.ts advanced.ipAddress.ipAddressHeaders wired to the parser inside the existing advanced block, alongside defaultCookieAttributes"
affects: [auth, deployment, rate-limiting]

actuals:
  tokens: 1297
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Dependency-free env-gate module beside auth.ts (following cookie-attributes.ts / web-origins.ts) so it stays importable without pulling in the pg pool auth.ts opens at import time"

key-files:
  created:
    - apps/api/src/auth/ip-address-headers.ts
    - apps/api/src/auth/__tests__/ip-address-headers.spec.ts
  modified:
    - apps/api/src/auth/auth.ts
    - README.md

key-decisions:
  - "Merged into the single existing advanced block rather than adding a second advanced key, so the cross-site cookie attributes shipped by 260902-i0n are not silently overwritten"
  - "Unset RATE_LIMIT_IP_HEADERS resolves to undefined, not a baked-in default, so Better Auth's own ['x-forwarded-for'] default governs local dev, CI, and any environment that never sets the var"
  - "No integration case against Better Auth's own getIp: @better-auth/core does not resolve from apps/api under pnpm's strict layout (verified MODULE_NOT_FOUND), so the spec pins ordering/lowercasing/trimming behavior only"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "resolveIpAddressHeaders parses RATE_LIMIT_IP_HEADERS into an ordered, trimmed, lowercased header list and returns undefined for every unset/blank form, per the seven documented cases"
    verification:
      - kind: unit
        ref: "apps/api/src/auth/__tests__/ip-address-headers.spec.ts#resolveIpAddressHeaders"
        status: pass
    human_judgment: false
  - id: D2
    description: "auth.ts's betterAuth() call receives advanced.ipAddress.ipAddressHeaders inside the one existing advanced block, alongside defaultCookieAttributes, with no second advanced key"
    verification:
      - kind: unit
        ref: "grep gate: exactly one 'advanced:' occurrence in apps/api/src/auth/auth.ts (excluding comments) — verified during execution"
        status: pass
    human_judgment: false
  - id: D3
    description: "Production deploy must set RATE_LIMIT_IP_HEADERS=cf-connecting-ip,x-forwarded-for on Render, and the 'Rate limiting could not determine a client IP' warning must disappear from Render logs after the next authenticated request"
    verification: []
    human_judgment: true
    rationale: "Requires setting an env var on Render and observing production logs after a live deploy, which this task does not perform or have access to trigger — the plan explicitly scopes this out as a human step outside the commit"

duration: 12min
completed: 2026-09-02
status: complete
---

# Quick 260902-iyq: Resolve the client IP behind Render's proxy chain

**`advanced.ipAddress.ipAddressHeaders` now reads an env-driven, ordered, lowercased header list (`RATE_LIMIT_IP_HEADERS`), so Better Auth can resolve a real per-client IP behind Render's multi-hop `x-forwarded-for` chain instead of collapsing every user into one shared rate-limit bucket per path.**

## Performance

- **Duration:** 12 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- New `apps/api/src/auth/ip-address-headers.ts` exports `resolveIpAddressHeaders`, a dependency-free, unit-testable parser that splits `RATE_LIMIT_IP_HEADERS` on commas, trims, lowercases, drops empty segments, preserves order, and returns `undefined` when nothing survives — so Better Auth falls back to its own `['x-forwarded-for']` default.
- `auth.ts` merges `ipAddress: { ipAddressHeaders: resolveIpAddressHeaders() }` into the single existing `advanced` block, next to `defaultCookieAttributes` — no second `advanced` key, no risk of silently dropping the cross-site cookie fix from 260902-i0n.
- README's environment table documents `RATE_LIMIT_IP_HEADERS`, including the Render production value (`cf-connecting-ip,x-forwarded-for`) and why Render's own `x-forwarded-for` chain is untrustworthy without it.

## Task Commits

Both tasks landed in a single fix commit (per the plan, task 2 is documentation-and-commit only):

1. **Task 1 + Task 2: Parse the header list, wire it into auth.ts, document it, and commit** - `fd1b97b` (fix)

## Files Created/Modified

- `apps/api/src/auth/ip-address-headers.ts` - new parser module, exports `resolveIpAddressHeaders`
- `apps/api/src/auth/__tests__/ip-address-headers.spec.ts` - unit spec covering all seven documented cases (ordering, mixed-case, empty segments, single header, unset, empty string, separators-only)
- `apps/api/src/auth/auth.ts` - extended the existing `advanced` block with `ipAddress: { ipAddressHeaders: resolveIpAddressHeaders() }`; nothing else in the file changed
- `README.md` - added a `RATE_LIMIT_IP_HEADERS` row to the environment table, after `EXPO_PUBLIC_WEB_APP_ORIGIN`

## Decisions Made

- Confirmed via the plan's documented source read of `@better-auth/core@1.6.26`'s `dist/utils/ip.mjs` that `getIPFromHeader` rejects any forwarded header holding more than one IP unless `trustedProxies` is configured — this is the root cause the parser exists to route around, by putting a single-value header (`cf-connecting-ip`) first in the list rather than pinning Cloudflare/Render CIDRs.
- Confirmed the grep gate (`exactly one 'advanced:' occurrence outside comments`) passes, proving the merge landed inside the pre-existing block rather than adding a competing one.
- Skipped an integration case against Better Auth's own `getIp`, per the plan's explicit instruction: `@better-auth/core` is a transitive dependency that does not resolve from `apps/api` under pnpm's strict layout (verified `MODULE_NOT_FOUND`), and the plan directs against adding it to `package.json` just to enable such a test.

## Deviations from Plan

None - plan executed exactly as written, including its documented decision to skip a `getIp` integration case.

## Issues Encountered

None.

## User Setup Required

**External configuration requires a manual Render step.** The code change is inert on its own until someone sets, on Render:

```
RATE_LIMIT_IP_HEADERS=cf-connecting-ip,x-forwarded-for
```

Confirmation it worked is the absence of the `Rate limiting could not determine a client IP` warning in Render logs after the next authenticated request. This is outside the scope of this commit and is tracked as coverage item D3 above.

Also carried forward as a recorded residual risk (not fixed by this task, per the plan's threat model): **T-IYQ-03** — a client that reaches the Render origin directly, bypassing the Cloudflare edge, can set `cf-connecting-ip` freely and evade rate limiting entirely. Closing this requires origin-level enforcement (Cloudflare Tunnel or an edge-IP allowlist at the host), which is infrastructure configuration outside this repo.

## Next Phase Readiness

- Code is ready to ship; `pnpm --filter api typecheck` exits 0 and the full API unit suite (12 suites, 200 tests) is green with no skips.
- Outstanding: after Render's `RATE_LIMIT_IP_HEADERS` env var is set and the API redeploys, someone must confirm the client-IP warning disappears from production logs — tracked as coverage item D3 above (human judgment, no automated verification possible from this environment).
- T-IYQ-03 (direct-to-origin bypass) remains an accepted residual risk per the plan's threat model, not a defect in this commit.

---
*Quick task: 260902-iyq*
*Completed: 2026-09-02*

## Self-Check: PASSED

All created/modified files present on disk; commit `fd1b97b` found in git log.
