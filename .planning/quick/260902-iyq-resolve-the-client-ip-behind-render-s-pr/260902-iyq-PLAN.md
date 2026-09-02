---
quick_id: 260902-iyq
slug: resolve-the-client-ip-behind-render-s-pr
status: planned
created: 2026-09-02
source: on Render the API logs `WARN [Better Auth]: Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket`, so every user in the world shares one rate-limit bucket per path — three sign-in attempts from anyone locks out everyone
files_modified:
  - apps/api/src/auth/ip-address-headers.ts
  - apps/api/src/auth/auth.ts
  - apps/api/src/auth/__tests__/ip-address-headers.spec.ts
  - README.md
autonomous: true
estimate:
  tokens: 34000
  raw_tokens: 22000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - A comma-separated RATE_LIMIT_IP_HEADERS value becomes an ordered, trimmed, lowercased header list Better Auth walks in order.
    - An unset or blank RATE_LIMIT_IP_HEADERS yields undefined, so Better Auth keeps its own ['x-forwarded-for'] default and local dev and CI behave exactly as they do today.
    - betterAuth() receives the list through the single existing advanced block; the cross-site cookie attributes set by 260902-i0n survive unchanged.
    - The resolver is unit-testable with no Postgres connection and no new dependency.
  artifacts:
    - apps/api/src/auth/ip-address-headers.ts (exports resolveIpAddressHeaders)
    - apps/api/src/auth/__tests__/ip-address-headers.spec.ts
    - README.md env table row for RATE_LIMIT_IP_HEADERS
  key_links:
    - process.env.RATE_LIMIT_IP_HEADERS -> resolveIpAddressHeaders -> betterAuth advanced.ipAddress.ipAddressHeaders -> getIp header walk -> createRateLimitKey per-client bucket
---

# Quick 260902-iyq — Resolve the client IP behind Render's proxy chain

## Problem

Verified in the installed `@better-auth/core@1.6.26`, `dist/utils/ip.mjs`.

`getIp` walks the configured header list and returns the first header that yields a trustworthy IP:

```
const ipHeaders = options.advanced?.ipAddress?.ipAddressHeaders || DEFAULT_IP_HEADERS;  // ["x-forwarded-for"]
for (const key of ipHeaders) {
  const value = "get" in headers ? headers.get(key) : headers[key];
  if (typeof value === "string") { const ip = getIPFromHeader(value, {...}); if (ip) return ip; }
}
```

`getIPFromHeader` splits the value on commas and then, with no `trustedProxies` configured, ends with:

```
if (forwardedIps.length !== 1) return null;
```

**A forwarded header holding more than one IP is rejected outright.** That is the whole bug. Render
sits behind Cloudflare, so `x-forwarded-for` arrives as a chain — client, then the Cloudflare hop,
then Render's own proxy. Length is 3, not 1, so `getIPFromHeader` returns `null`, `getIp` exhausts
its one-header default list, and — because `isDevelopment()`/`isTest()` are false in production — it
returns `null`. Better Auth logs the warning and buckets every request in the world under one shared
key per path.

The blast radius is the hardcoded per-path rules `auth.ts` already documents at lines 24-28:
`/sign-in` and `/sign-up` get 3 requests per 10 seconds, `/request-password-reset` 3 per 60 seconds.
Shared globally, three sign-in attempts from any one person lock out every other user for 10 seconds.
This is a live denial-of-service against the deployed API, not a cosmetic log line.

Cloudflare sets `cf-connecting-ip`, which holds **exactly one** IP — the shape `getIPFromHeader`
accepts on its single-value path.

## Approach

**An env-driven header list, not a hardcoded `cf-connecting-ip`.** Which forwarded header is
trustworthy is a property of the deployment topology, not of the code: it is only safe to believe a
header that the edge in front of you overwrites on every request. Local dev, CI, and any future
non-Cloudflare host have different answers. An env var makes that trust decision explicit per
deployment and keeps a spoofable header from being trusted by default.

**Unset means `undefined`, not a baked-in default.** Returning `undefined` lets Better Auth apply its
own `DEFAULT_IP_HEADERS` rather than freezing today's default into our source, and guarantees local
dev, the Jest suite, and the e2e run are byte-identical to today.

**Order is load-bearing.** `getIp` returns on the *first* header that yields an IP, so the Render
value puts `cf-connecting-ip` first and keeps `x-forwarded-for` as the fallback — which still works
on any single-hop deployment where the chain has length 1.

**Lowercasing is load-bearing and is the trap.** `getIp` reads `headers.get(key)` for a `Headers`
instance (case-insensitive, so a mixed-case entry works) but `headers[key]` for a plain object bag
(case-**sensitive**, and Node lowercases incoming header names, so `CF-Connecting-IP` silently misses
and falls through to the broken chain). A mixed-case env value would therefore work on one code path
and fail on the other — the failure mode that looks fine everywhere except production.

**Why not `trustedProxies`.** `getIPFromHeader`'s other branch strips the chain from the right to the
first untrusted hop, which would also fix this — but it requires pinning Cloudflare's and Render's
egress CIDRs in config and re-pinning them whenever either provider changes ranges. Neither publishes
a set this app can treat as stable. Trusting a single-value header the edge always rewrites is the
smaller, self-maintaining surface.

**A separate module, per the `cookie-attributes.ts` precedent.** `auth.ts` imports
`../db/drizzle.module`, which throws on a missing `DATABASE_URL` and opens a `pg.Pool` at import
time, so no Jest unit spec can import `auth.ts`. The parser lives in its own dependency-free module
beside it, matching `apps/api/src/auth/cookie-attributes.ts` and `src/common/web-origins.ts`.

## Deployment precondition

The code change is inert on its own. After deploy, set on Render:

```
RATE_LIMIT_IP_HEADERS=cf-connecting-ip,x-forwarded-for
```

Confirmation that it worked is the absence of the `Rate limiting could not determine a client IP`
warning in the Render logs after the next authenticated request. Setting the env var is a human step
outside this commit.

## Threat model

Trust boundary: internet → Cloudflare edge → Render proxy → API. No packages are installed, so the
package-legitimacy gate does not apply.

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|------------|
| T-IYQ-01 | Denial of service | Better Auth rate limiter on `/sign-in`, `/sign-up`, `/request-password-reset` | high | mitigate | This is the bug. A shared per-path bucket lets any one client exhaust the 3-per-10s sign-in allowance for every user. Resolving a real per-client IP restores per-client buckets, which is what T-01-08's mitigation always assumed. |
| T-IYQ-02 | Spoofing | Client-supplied forwarded header used as the rate-limit key | medium | mitigate | A listed header is only trustworthy if the edge overwrites it. `cf-connecting-ip` is set by Cloudflare on every request and cannot be forged by a client whose traffic passes through it. The list is opt-in per deployment and empty by default, so no environment trusts a client-supplied header unless it was explicitly configured to. |
| T-IYQ-03 | Spoofing | Direct-to-origin request bypassing the Cloudflare edge | medium | accept | If the Render origin is reachable without traversing Cloudflare, a client can set `cf-connecting-ip` freely and rotate it to evade rate limiting entirely. Closing this requires origin-level enforcement (Cloudflare Tunnel or an allowlist of edge IPs at the host), which is infrastructure configuration outside this repo. Accepted and recorded here so it is a known residual rather than an assumed-solved one. |
| T-IYQ-04 | Information disclosure | Client IP inside the process | low | accept | The resolved IP is used only as a rate-limit map key. Nothing in `apps/api` logs it, and this task adds no logging of it. |

## Tasks

### Task 1 — Parse the header list from the environment and feed it to Better Auth

**Files:** `apps/api/src/auth/ip-address-headers.ts` (new),
`apps/api/src/auth/__tests__/ip-address-headers.spec.ts` (new), `apps/api/src/auth/auth.ts`

**`ip-address-headers.ts`.** No imports at all — the module must stay loadable with an empty
environment. Export one function:

```
resolveIpAddressHeaders(raw?: string | undefined): string[] | undefined
```

It defaults its argument to `process.env.RATE_LIMIT_IP_HEADERS` so the production call site passes
nothing and the spec passes explicit strings. Split on commas, trim each segment, lowercase each
segment, drop empty segments, preserve input order. Return the array when at least one segment
survives; return `undefined` when `raw` is unset or when nothing survives filtering. Do not
deduplicate, do not sort, do not validate segment contents — an unknown header name simply never
matches and `getIp` moves to the next entry.

Carry one comment on the module, and only this one — it is the trap a reader cannot infer from the
code. State that Better Auth rejects a forwarded header holding more than one IP unless trusted
proxies are configured, that Render's chain therefore resolves to nothing, and that the list must be
lowercase because the plain-object header path is case-sensitive. Do not restate what `split`/`trim`
do and do not add a JSDoc header to the function.

**Behavior (what the spec asserts):**

- `resolveIpAddressHeaders('cf-connecting-ip,x-forwarded-for')` returns exactly
  `['cf-connecting-ip', 'x-forwarded-for']` — asserted as an ordered array, not as a set, because
  first-match-wins ordering is the behaviour under test.
- `resolveIpAddressHeaders(' CF-Connecting-IP , X-Forwarded-For ')` returns the same lowercased,
  trimmed pair in the same order.
- `resolveIpAddressHeaders('cf-connecting-ip,,x-forwarded-for,')` drops the empty segments and
  returns the same pair.
- `resolveIpAddressHeaders('cf-connecting-ip')` returns `['cf-connecting-ip']`.
- `resolveIpAddressHeaders(undefined)` returns `undefined`.
- `resolveIpAddressHeaders('')` returns `undefined`.
- `resolveIpAddressHeaders('  ,  ,')` returns `undefined` — separators and whitespace only must not
  produce an empty array, which would suppress Better Auth's own default.

**Spec placement.** `apps/api/src/auth/__tests__/ip-address-headers.spec.ts`, beside the existing
`cookie-attributes.spec.ts`. `jest.config.js` roots at `src` and matches `\.spec\.ts$`, so it is
picked up with no config change. It must import only `../ip-address-headers` — never `../auth`,
which would pull in the pg pool.

**Do not write an integration case against Better Auth's own `getIp`.** It lives in
`@better-auth/core/utils/ip`, which is a transitive dependency and does **not** resolve from
`apps/api` under pnpm's strict layout (verified: `MODULE_NOT_FOUND`). Do not add `@better-auth/core`
to `package.json` to make such a case work — the ordering and lowercasing assertions above already
pin the properties `getIp` depends on.

**`auth.ts`.** Import the helper and extend the **existing** `advanced` object at line 58 so it
reads:

```
advanced: {
  defaultCookieAttributes: resolveDefaultCookieAttributes(),
  ipAddress: { ipAddressHeaders: resolveIpAddressHeaders() },
},
```

Merge into that one block — a second `advanced` key would silently overwrite the cross-site cookie
attributes shipped by quick 260902-i0n and break deployed web sign-in. Passing `undefined` through
is correct and typechecks: the option is declared `ipAddressHeaders?: string[]` and `getIp` applies
`|| DEFAULT_IP_HEADERS`, and this tsconfig does not set `exactOptionalPropertyTypes`.

Change nothing else in `auth.ts` — not `baseURL`, not `trustedOrigins`, not `session`, not
`rateLimit`, not the existing comments. Add no comment in `auth.ts`; the explanation lives in the
helper.

**Verify:**
```
pnpm --filter api exec jest --config jest.config.js src/auth/__tests__/ip-address-headers.spec.ts
pnpm --filter api typecheck
test "$(grep -v '^\s*//' apps/api/src/auth/auth.ts | grep -c 'advanced:')" -eq 1
```

**Done:** `typecheck` exits 0. All seven spec cases pass. The grep gate proves exactly one `advanced`
block survives in `auth.ts`, and `resolveDefaultCookieAttributes` is still called inside it. Making
`resolveIpAddressHeaders` return `undefined` unconditionally turns the four populated-list cases red.

### Task 2 — Document the variable and land one commit

**Files:** `README.md`

Add one row to the env table under `## Environment` (README.md around line 103). Place it after the
`WEB_APP_ORIGIN` row, keeping the existing three-column shape (`Variable` | `Used by` | `Purpose`):

- Variable: `RATE_LIMIT_IP_HEADERS`
- Used by: `api`
- Purpose: comma-separated, ordered list of forwarded headers Better Auth reads to identify the
  rate-limiting client. State that unset keeps Better Auth's own `x-forwarded-for` default, that
  behind Cloudflare on Render the value is `cf-connecting-ip,x-forwarded-for` because Render's
  `x-forwarded-for` is a multi-hop chain Better Auth refuses to trust, and that only headers the
  edge overwrites on every request belong in the list.

Touch no other part of the README. Do not edit `.env.example` — it is outside this task's scope.

Then run the full API unit suite and land **all four files as one commit**. Do not commit per task.

Do **not** run `pnpm --filter api test:e2e` or `db:verify` — both invoke `db:push` against a live
Postgres, which this task neither needs nor provisions. The auth e2e specs drive requests with no
forwarded header at all, so they exercise the unset path where this change is a deliberate no-op and
carry no signal for it.

Commit message, one line, no body:

```
fix(api): resolve the client IP from a configurable forwarded-header list
```

Per `.claude/CLAUDE.md` and the user's global instructions: **no** `Co-Authored-By`, **no**
`Claude-Session` trailer, **no** AI attribution of any kind in the commit message.

**Verify:**
```
pnpm --filter api test
git show --stat HEAD
```

**Done:** The API unit suite is green. `git show --stat HEAD` lists exactly four files —
`apps/api/src/auth/ip-address-headers.ts`, `apps/api/src/auth/__tests__/ip-address-headers.spec.ts`,
`apps/api/src/auth/auth.ts`, `README.md` — in a single commit whose message carries no attribution
trailer. The README env table contains a `RATE_LIMIT_IP_HEADERS` row naming the Render value.

## Success criteria

- `resolveIpAddressHeaders` returns an ordered lowercase list for a populated value and `undefined`
  for every unset or blank form.
- `betterAuth()` receives `advanced.ipAddress.ipAddressHeaders` alongside the pre-existing
  `defaultCookieAttributes`, in one `advanced` block.
- `pnpm --filter api typecheck` and `pnpm --filter api test` both pass.
- `RATE_LIMIT_IP_HEADERS` is documented in the README env table with the Render value.
- One commit, four files, no AI attribution.

## Output

Write `.planning/quick/260902-iyq-resolve-the-client-ip-behind-render-s-pr/260902-iyq-SUMMARY.md`
when done. Record the residual T-IYQ-03 direct-to-origin gap and the Render env-var step as
outstanding human follow-ups.
