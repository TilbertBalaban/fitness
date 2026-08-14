---
phase: 01-cross-platform-foundation
verified: 2026-08-14T15:30:00Z
status: gaps_found
score: 6/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/6
  gaps_closed:
    - "Explicit sign-out actually revokes the session server-side on native (D-01)"
    - "The background native session-revocation-detection mechanism can actually observe a revoked session"
  gaps_remaining: []
  regressions:
    - "New must-have introduced by plan 01-09 itself (the SessionCredentialProvider prohibition set) is not actually satisfied: the origin guard is a string-prefix check, not an origin comparison"
gaps:
  - truth: "MUST NOT attach the session credential to a request whose destination is not this project's own API origin (01-09-PLAN.md must_haves.prohibitions, declared status: resolved)"
    status: failed
    reason: >
      apps/mobile/lib/api-client.ts:29 implements the guard as `if (!url.startsWith(API_URL))
      return null;` — a string-prefix test, not an origin comparison. This is a confirmed bypass,
      independently reproduced by reading the code and confirming the values it operates on:
      `API_URL` defaults to `http://localhost:3000` (apps/mobile/lib/auth-storage.ts:4), so
      `'http://localhost:30000/x'.startsWith('http://localhost:3000')` evaluates true, and in a
      deployed environment `https://api.fitness.app.evil.com` would satisfy
      `startsWith('https://api.fitness.app')`. Either case attaches the user's live session cookie
      to a non-project host. This is CR-01 in 01-REVIEW.md (critical, filed against this exact
      re-review pass) — it is a NEW finding relative to the previous 01-VERIFICATION.md, introduced
      by the same 01-09 gap-closure work that fixed the two previously-failed truths. The plan's own
      frontmatter marks this prohibition `status: resolved`; the code does not bear that out, so the
      claim is rejected on direct evidence rather than accepted at face value.

      The one negative test that exists for this guard
      (`apps/mobile/lib/__tests__/session-refresh.test.ts`, "attaches no cookie header for a request
      to a host that is not the API origin, even with a provider registered") asserts against
      `https://not-this-project.example.com/v1/auth/get-session` — a URL that also fails a
      *correct* origin check, so it cannot distinguish a real origin comparison from this
      prefix-based one. The full session-refresh.test.ts suite (42 tests) was run directly by this
      verification and passes end to end, confirming the green suite is real but does not cover the
      prefix-collision case — a green suite here is not evidence the prohibition holds.
    artifacts:
      - path: "apps/mobile/lib/api-client.ts"
        issue: "resolveSessionCredential (line 28-29) uses url.startsWith(API_URL) instead of comparing parsed request/API origins"
    missing:
      - "Replace the startsWith check with a parsed-origin comparison (new URL(url).origin !== new URL(API_URL).origin), wrapped in try/catch so a malformed URL is treated as non-matching"
      - "A regression test exercising the specific prefix-collision case (e.g. API_URL=http://localhost:3000 against a request to http://localhost:30000/..., or a same-scheme suffix-extension host like https://api.fitness.app.evil.com) so a future reversion to string comparison fails loudly"
deferred: []
human_verification:
  - test: "Sign up, sign in, and reach the same authenticated five-tab home screen on a real iOS simulator/device"
    expected: "Native tab chrome renders (NativeTabs), the authenticated stack shows on first frame, Home/Programs/Workout/History/Profile all reachable, identical account/session as the browser and Android builds"
    why_human: "No iOS simulator was reachable from this verification environment. Every native-specific claim rests on typecheck, unit tests, and a static `expo export` — none of which render UI. Carried forward from WINDOWS.md ledger items #4, #5, #8, #9, #10 (all still open)."
  - test: "Sign up, sign in, and reach the same authenticated five-tab home screen on a real Android emulator/device"
    expected: "Same as iOS row above, on Android"
    why_human: "Same reasoning as the iOS row. Carried forward from WINDOWS.md ledger items #8, #9, #10 (still open)."
  - test: "Sign in on a device, put it in airplane mode, wait, and cold-start the app after a genuinely elapsed multi-week gap (or at minimum an extended offline period)"
    expected: "Authenticated UI renders immediately with no network wait and no sign-out, per D-01/D-02"
    why_human: "Real elapsed time and true device airplane-mode behavior cannot be produced in this environment. Unit tests (session-refresh.test.ts) prove the classification logic is correct in isolation but do not exercise the actual OS-level cold-start/network-loss path. Carried forward from WINDOWS.md ledger item #2 (still open)."
  - test: "On a real iOS or Android build, confirm the attached cookie header is accepted by the running server and the session row is deleted on explicit sign-out"
    expected: "Same behavior the e2e suite (native-session.e2e-spec.ts) proves over HTTP, now observed on a physical/simulated device"
    why_human: "No iOS/Android simulator or device is reachable from this environment. This truth was explicitly declared verification: backstop in 01-09-PLAN.md must_haves.truths — it rests on the HTTP-level e2e proof plus typecheck, not a device observation. Carried forward from WINDOWS.md ledger item #15 (still open)."
  - test: "Confirm maximum OS accessibility font scale wrap-and-grow behavior (auth fields, tab bar labels, placeholder body copy) on iOS and Android"
    expected: "Long text wraps and containers grow rather than clipping or truncating, per UI-SPEC R1"
    why_human: "Verified only on web by shrinking the viewport (WINDOWS.md #9); never observed at real OS accessibility font scale on a native device (WINDOWS.md #7, #9, still open)."
---

# Phase 1: Cross-Platform Foundation Verification Report

**Phase Goal:** A signed-in user can open the same account on iOS, Android, and a desktop browser, from one codebase.
**Verified:** 2026-08-14T15:30:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (01-09/01-10 gap-closure wave)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create account, sign in, and land on same authenticated home screen on iOS/Android/desktop browser | ⚠️ Structurally present, device unverified | Sign-up/sign-in screens, `(tabs)/_layout.tsx` + `.web.tsx`, `auth.e2e-spec.ts` prove the server side end to end over real HTTP; no iOS/Android device observation (WINDOWS #4, #5, #8, #9, #10) |
| 2 | User stays signed in across restarts, session survives multi-week gap, still usable offline | ⚠️ Structurally present, device unverified | SecureStore persistence (`auth-storage.ts`), `classifyAuthOutcome`/D-01/D-02 prohibitions never sign out on network failure (`session-guard.ts`, tested), but no real elapsed-time/airplane-mode device observation (WINDOWS #2) |
| 3 | `.web.tsx` component override is picked up automatically by shared code | ✓ VERIFIED | `apps/mobile/app/(tabs)/_layout.web.tsx` and `apps/mobile/app/reset-password.web.tsx` exist alongside their non-`.web` counterparts; Expo Router/Metro platform-extension resolution is the mechanism, exercised by `expo export --platform web` in CI |
| 4 | API carries explicit version from its first request, so an old build can never be broken by a server deploy | ✓ VERIFIED | `AUTH_BASE_PATH = '/v1/auth'` (auth-storage.ts), `MinClientVersionGuard` + `minClientVersionMiddleware` enforce `X-Client-Version` against `MIN_CLIENT_VERSION` and return 426 when below floor, exercised by `version-guard.e2e-spec.ts` |
| 5 | Explicit sign-out actually revokes the session server-side on native (D-01) | ✓ VERIFIED (gap closed) | `SessionCredentialProvider` seam registered at module scope in `app/_layout.tsx`; `sign-out.ts`'s `revokeServerSession()` routes through `apiFetch`, which now attaches the credential; `native-session.e2e-spec.ts` proves the Postgres session row is deleted by a cookie-only-authenticated request |
| 6 | Background native session-revocation-detection mechanism can observe a revoked session | ✓ VERIFIED (gap closed) | Same credential seam feeds `app/_layout.tsx`'s background `get-session` probe; `session-refresh.test.ts` covers classification of a real 401/revoked response with a credential attached |
| 7 | MUST NOT sign the user out / degrade toward signed-out due to network unavailability or an empty secure-storage read | ✓ VERIFIED (judgment) | `apiFetch` never itself clears session state or signs out (confirmed by reading `api-client.ts` and `sign-out.ts`); `classifyAuthOutcome` treats offline/timeout as `offline`, never `revoked`, and no call site reacts to `offline` by clearing state |
| 8 | MUST NOT write the session credential (or a fragment) to any logging/tracing/crash-reporting sink | ✓ VERIFIED (judgment) | No `console.*` calls found in `api-client.ts`, `sign-out.ts`, `auth-storage.ts`, `auth-client.ts`, or `app/_layout.tsx` |
| 9 | MUST NOT attach the session credential to a request whose destination is not this project's own API origin | ✗ FAILED | `api-client.ts:29` uses `url.startsWith(API_URL)`, a prefix check, not an origin comparison — confirmed bypassable with `http://localhost:30000/...` against the default `API_URL=http://localhost:3000`, or a suffix-extension host in production. See Gaps below. |

**Score:** 6/8 must-haves verified, plus 2 truths (#1, #2) structurally present but requiring device-level human confirmation (carried forward from the previous verification and from WINDOWS.md, not new).

### Deferred Items

None. (No later-phase mapping for any current gap.)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/mobile/lib/api-client.ts` | Single shared request path; attaches version header + session credential; guards credential to project origin only | ⚠️ PARTIAL | Version header and credential-provider seam both correct and tested; the origin guard is present but implemented incorrectly (prefix check, not origin match) |
| `apps/mobile/app/_layout.tsx` | Registers `SessionCredentialProvider`; runs background revocation probe | ✓ VERIFIED | `setSessionCredentialProvider(getSessionCookieHeader)` at module scope; background probe wired |
| `apps/mobile/lib/sign-out.ts` | Revokes server session via the shared request path before clearing local state | ✓ VERIFIED | `revokeServerSession()` → `apiFetch` → credential now attached; local wipe always proceeds regardless of server outcome (D-03 asymmetry) |
| `apps/api/src/common/min-client-version.guard.ts` + `client-version.constants.ts` | Server-side version floor enforcement across Nest-routed and Better-Auth-routed paths | ✓ VERIFIED | `MinClientVersionGuard` (Nest routes) + `minClientVersionMiddleware` (Better Auth's non-Nest-routed `/v1/auth` prefix), both tested by `version-guard.e2e-spec.ts` |
| `apps/mobile/app/(tabs)/_layout.web.tsx`, `apps/mobile/app/reset-password.web.tsx` | Platform-specific overrides picked up automatically | ✓ VERIFIED | Files exist, sibling to non-`.web` versions, exercised by `expo export --platform web` |
| `apps/mobile/lib/theme.ts`, `apps/mobile/components/AppearanceControl.tsx` | Light/dark appearance switching (PLAT-09) | ✓ VERIFIED | `AppearanceControl` imported and rendered in `app/(tabs)/profile.tsx`; `applyAppearance` uses NativeWind's `colorScheme.set` (cross-platform-safe, fixes the earlier RN-only `Appearance.setColorScheme` crash on web — WINDOWS #11) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `app/_layout.tsx` | `apps/mobile/lib/api-client.ts` | `setSessionCredentialProvider(getSessionCookieHeader)` called at module scope | ✓ WIRED | Confirmed by grep and by `session-refresh.test.ts` passing credential-attachment assertions |
| `apps/mobile/lib/sign-out.ts` | `apps/api` `/v1/auth/sign-out` | `apiFetch(... AUTH_ENDPOINT/sign-out ...)` | ✓ WIRED | Now carries the session cookie via the credential provider seam; proven end-to-end by `native-session.e2e-spec.ts` |
| `apps/mobile/lib/api-client.ts` (`resolveSessionCredential`) | request origin | `url.startsWith(API_URL)` | ⚠️ WIRED BUT INCORRECT | The link exists and executes on every request, but the comparison it performs does not enforce the invariant it is documented to enforce |
| `apps/api main.ts` | `/v1/auth/*` | `minClientVersionMiddleware(AUTH_BASE_PATH)` registered via `app.use(...)` before `listen()` | ✓ WIRED | Confirmed by reading `min-client-version.guard.ts` inline comment and by `version-guard.e2e-spec.ts` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Credential attaches only for same-origin requests, rejects a different host | `npx jest lib/__tests__/session-refresh.test.ts` (run directly by this verification) | 42/42 tests pass, including the "not-this-project.example.com" negative case | ✓ PASS (but does not cover the prefix-bypass class — see gap) |
| Prefix-collision bypass reproduces as described | Manual evaluation: `'http://localhost:30000/x'.startsWith('http://localhost:3000')` | `true` | ✗ CONFIRMS BYPASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| PLAT-01 | 01-01, 01-03, 01-07, 01-08, 01-09, 01-10 | Same account, iOS/Android/desktop browser | ⚠️ NEEDS HUMAN | Code/structure present and web-verified; iOS/Android device confirmation outstanding (WINDOWS #4,5,8,9,10) |
| PLAT-05 | 01-01, 01-04, 01-06, 01-08, 01-10 | Create account, sign in with email/password | ✓ SATISFIED | `auth.e2e-spec.ts` proves signup/sign-in end to end against a real server; sign-in/sign-up screens wired |
| PLAT-06 | 01-05, 01-08, 01-09 | Stays signed in across restarts, usable offline | ⚠️ NEEDS HUMAN (mechanism verified) + ✗ Origin-guard prohibition FAILED | Persistence/offline-tolerance logic verified structurally and by unit test; real device multi-week-gap unverified (WINDOWS #2); the credential-attachment security guard this requirement depends on is confirmed broken (see gap #9) |
| PLAT-09 | 01-02, 01-07, 01-08, 01-10 | Light/dark appearance switching | ✓ SATISFIED | `AppearanceControl` wired into profile screen; `theme.test.ts` covers the switching logic |

No orphaned requirements — all four declared IDs (PLAT-01, PLAT-05, PLAT-06, PLAT-09) appear in at least one plan's `requirements` field and are traceable to artifacts above.

### Anti-Patterns Found

None blocking. `pendingWriteCount()` in `sign-out.ts` returns a hardcoded `0` with an explicit, non-debt comment explaining it is a deliberate Phase-2 seam (no local DB exists yet) — not a stub masking missing behavior for this phase's scope.

Carried-forward Info/Warning items from 01-REVIEW.md (WR-01 schema inconsistency, IN-01 fake lint script, IN-02 undocumented `Platform.OS` exceptions, IN-03 unused `colorScheme` field, IN-04 missing CORS on `/health`) are pre-existing, non-regressed, and below the blocker threshold — noted for completeness, not gating this verification.

### Gaps Summary

Two of the three previously-failed truths from the prior verification pass (missing credential attachment on native sign-out, and on the background revocation probe) are now genuinely closed: a `SessionCredentialProvider` seam was introduced, registered once at `app/_layout.tsx` module scope, and both call sites route through it with real unit and e2e coverage.

However, the same gap-closure work introduced a new, unresolved defect in the security boundary the plan itself declared as a must-have prohibition: `resolveSessionCredential` in `apps/mobile/lib/api-client.ts` gates credential attachment with `url.startsWith(API_URL)`, a string-prefix test rather than a real origin comparison. This is independently reproducible (`'http://localhost:30000/x'.startsWith('http://localhost:3000')` → `true` under the project's own default config) and is not caught by the existing regression test, which only exercises a wholly unrelated host. Plan 01-09's frontmatter marks this prohibition `status: resolved` — that claim does not hold against the code as it stands and is rejected here on direct evidence. This is a security-relevant regression, not a cosmetic gap: `apiFetch` is the app's one shared request path, documented as reusable by future phases (sync, uploads), so an unfixed prefix-comparison bug widens in blast radius every time a new caller constructs a URL from anything less than a hardcoded constant.

Human verification items are otherwise unchanged from the prior pass and remain open in WINDOWS.md: no iOS/Android simulator or device was reachable from this environment, so every native-rendering and real-elapsed-time claim (multi-week session survival, airplane-mode cold start, accessibility font scale) rests on typecheck/unit-test/static-export evidence rather than a device observation.

---

_Verified: 2026-08-14T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
