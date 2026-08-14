---
phase: 01-cross-platform-foundation
verified: 2026-08-14T00:00:00Z
status: gaps_found
score: 3/6 must-haves verified
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "Explicit sign-out actually revokes the session server-side on native (D-01: '...an explicit user sign-out...ends a session')"
    status: failed
    reason: >
      apps/mobile/lib/api-client.ts's apiFetch (the sole shared request path) never reads or attaches
      the Better Auth session cookie persisted in SecureStore. sign-out.ts's revokeServerSession()
      calls POST /v1/auth/sign-out through apiFetch with no credential on native (only web sets
      `credentials: 'include'`, which relies on the browser's own cookie jar). The server therefore
      cannot identify which session to revoke: the DB session row survives an explicit native sign-out
      indefinitely, even though local SecureStore state is correctly wiped. This is CR-01 from
      01-REVIEW.md (critical, filed 2026-08-11) and Broken-Windows ledger item #1 (kind: deviation,
      status: open) — both still unresolved; no commit since the review touches api-client.ts,
      sign-out.ts, or auth-storage.ts. Independently re-confirmed by reading the current source.
    artifacts:
      - path: "apps/mobile/lib/api-client.ts"
        issue: "apiFetch attaches CLIENT_VERSION_HEADER but never a session credential (cookie) on native"
      - path: "apps/mobile/lib/sign-out.ts"
        issue: "revokeServerSession() routes through apiFetch with no credential on native, so the server-side session row is not invalidated"
    missing:
      - "Attach the SecureStore-persisted session cookie (or route through authClient's own $fetch) on every native apiFetch call, so revokeServerSession and the background revocation check can actually authenticate"
      - "A unit test asserting the outgoing native request in these two call sites carries a session credential, so a regression fails loudly"
  - truth: "The background native session-revocation-detection mechanism (app/_layout.tsx, D-01/D-03's 'positive server revocation response' escape hatch) can actually observe a revoked session"
    status: failed
    reason: >
      The same missing-credential defect means app/_layout.tsx's background get-session check always
      receives an unauthenticated 200-with-null-session response on native, so classifyAuthOutcome can
      never return 'revoked' regardless of the real server-side session state. The mechanism is present
      and unit-tested in isolation (session-guard.ts's classification logic is correct), but the one
      call site that is supposed to feed it a real signal is structurally incapable of doing so on
      native. No server route emits SESSION_REVOKED_REASON yet in Phase 1, so this has zero live blast
      radius today — but it ships as code asserting a guarantee (via its own inline comment) it cannot
      deliver, and nothing in the test suite catches the gap because session-refresh.test.ts mocks
      fetch directly and never asserts a credential is attached.
    artifacts:
      - path: "apps/mobile/app/_layout.tsx"
        issue: "Background revocation check (lines 40-49) calls apiFetch with no attached credential on native"
    missing:
      - "Same fix as the sign-out gap above — both call sites share the root cause"
deferred: []
human_verification:
  - test: "Sign up, sign in, and reach the same authenticated five-tab home screen on a real iOS simulator/device"
    expected: "Native tab chrome renders (NativeTabs), the authenticated stack shows on first frame, Home/Programs/Workout/History/Profile all reachable, identical account/session as the browser and Android builds"
    why_human: "No iOS simulator was reachable from any worktree during this phase's execution or this verification. Every native-specific claim rests on typecheck, unit tests, and a static `expo export` — none of which render UI. The identical situation on web (typecheck/tests/export all green) concealed a real blank-page bug (WINDOWS.md #11/#13, fixed in plan 01-07) that only browser rendering caught. That precedent means green non-rendering checks cannot be extrapolated to 'native renders correctly.'"
  - test: "Sign up, sign in, and reach the same authenticated five-tab home screen on a real Android emulator/device"
    expected: "Same as iOS row above, on Android"
    why_human: "Same reasoning as the iOS row; also flagged as open in WINDOWS.md ledger items #8, #9, #10."
  - test: "Sign in on a device, put it in airplane mode, wait, and cold-start the app after a genuinely elapsed multi-week gap (or at minimum an extended offline period)"
    expected: "Authenticated UI renders immediately with no network wait and no sign-out, per D-01/D-02"
    why_human: "Real elapsed time and true device airplane-mode behavior cannot be produced in this sandboxed environment. Unit tests (session-refresh.test.ts) prove the classification logic is correct in isolation but do not exercise the actual OS-level cold-start/network-loss path. Flagged as open in WINDOWS.md ledger item #2 and named explicitly as a Manual-Only Verification in 01-VALIDATION.md."
  - test: "Confirm maximum OS accessibility font scale wrap-and-grow behavior (auth fields, tab bar labels, placeholder body copy) on iOS and Android"
    expected: "Long text wraps and containers grow rather than clipping or truncating, per UI-SPEC R1"
    why_human: "Verified only on web by shrinking the viewport (WINDOWS.md #9); never observed at real OS accessibility font scale on a native device (WINDOWS.md #7, #9)."
---

# Phase 1: Cross-Platform Foundation Verification Report

**Phase Goal:** A signed-in user can open the same account on iOS, Android, and a desktop browser, from one codebase.
**Verified:** 2026-08-14
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|---|---|---|
| 1 | User can create an account, sign in, and land on the same authenticated home screen on iOS, Android, and in a desktop browser | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code, e2e tests (`auth.e2e-spec.ts`, 6/6 green), and one live browser session all confirm this on **web only** (sign-up → 5-tab authenticated shell, `/history` pasted cold retains session). iOS and Android were **never rendered** in any worktree — no simulator/device reachable (WINDOWS.md #4, #5, #8, #9, #10). One-third proven, not three-thirds. Routed to human verification below. |
| 2 | User stays signed in across app restarts, and the session survives a multi-week gap between opens | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | D-01/D-02/D-03 correctly implemented and unit-tested (`session-refresh.test.ts`, 24/24 green) covering every classification branch (offline/revoked/rejected/ok) and the cold-start-never-blocks path. But the device-level claim itself — real airplane mode, real elapsed multi-week gap — was never observed (WINDOWS.md #2; 01-VALIDATION.md lists this as Manual-Only). Classification logic verified; the runtime invariant it protects is not. |
| 3 | A component needing platform-specific behavior can be written as `.web.tsx` and the shared code picks it up automatically | ✓ VERIFIED | `apps/mobile/app/(tabs)/_layout.tsx` (NativeTabs) + `_layout.web.tsx` (expo-router/ui, link-backed) share identical route names; Metro platform-extension resolution documented in `docs/platform-modules.md`. `reset-password.tsx` (stub) + `reset-password.web.tsx` (real page) is the second instance. Confirmed rendering on web via live browser session (deep-linkable `/history` URL worked cold). No `Platform.OS` branching found under `app/(tabs)/`. |
| 4 | The API carries an explicit version from its first request, so a months-old mobile build can never be broken by a server deploy | ✓ VERIFIED | `main.ts` calls `app.enableVersioning(...)`; `MinClientVersionGuard` (APP_GUARD, global) plus `minClientVersionMiddleware` (for Better Auth's non-controller routes) both gate on `X-Client-Version`. `version-guard.e2e-spec.ts` (6/6 green) proves: below-floor → 426 with reason code; at/above floor → 200; absent header → 200 (treated as oldest supported, not hostile); malformed header → 200 (fails safe); unversioned path (`/auth/...` vs `/v1/auth/...`) → 404, never reaches a controller; `/health` reachable regardless of version. |
| 5 | Explicit sign-out actually ends the session server-side, on every platform (D-01) | ✗ FAILED | `apiFetch` never attaches the SecureStore-persisted session cookie on native. `sign-out.ts`'s `revokeServerSession()` therefore sends an unauthenticated `POST /v1/auth/sign-out` on native — the server cannot identify or revoke the session row. Local SecureStore is still correctly wiped, so the *client* believes it signed out, but the *server-side session persists indefinitely*. Confirmed on web (browser cookie jar + `credentials: 'include'` → session row genuinely deleted, per live verification). This is CR-01 from 01-REVIEW.md (critical, still open) and WINDOWS.md ledger item #1 (still open, no fix commit since the review). |
| 6 | The native background session-revocation-detection mechanism can observe a real server-side revocation (D-01's "positive server revocation response" escape hatch) | ✗ FAILED | Same root cause as #5: `app/_layout.tsx`'s background `get-session` check on native never carries a credential, so it always resolves `'ok'`, never `'revoked'`, regardless of actual server state. The classification logic itself (`session-guard.ts`) is correct and unit-tested in isolation; the one call site meant to feed it real signal cannot. Zero live blast radius today only because no route emits `SESSION_REVOKED_REASON` yet — the defect will still be present, silently, the moment one does. |

**Score:** 3/6 truths verified (2 present + wired but behavior-unverified — see Human Verification; 2 failed — see Gaps)

### Required Artifacts

All artifacts declared across the 8 plans' `must_haves.artifacts` exist and are substantive (checked via `gsd-tools query verify.artifacts` per plan):

| Plan | Result |
|---|---|
| 01-01 (workspace, Better Auth, versioning skeleton) | 9/9 passed |
| 01-02 (theme/appearance) | 5/5 passed |
| 01-03 (client-version guard) | 5/5 passed |
| 01-04 (mailer + password reset) | 5/5 passed |
| 01-05 (session lifecycle, sign-out) | 6/6 passed |
| 01-06 (auth screens) | 7/7 passed |
| 01-07 (tab shell, platform escape hatch) | 4/5 — see note below |
| 01-08 (CI) | 3/3 passed |

**01-07 note:** `apps/mobile/components/PlaceholderScreen.tsx` failed the automated `contains: "Heading"` pattern check. Read directly: the component takes a `heading` prop and renders it with a `text-heading` Tailwind class — it fully satisfies the plan's stated intent (a shared heading-plus-body shell) but never contains the literal capitalized string `Heading`. This is a false positive of the pattern-matching heuristic, not a real gap — the artifact is substantive and wired (confirmed via `key_links` below and live browser rendering of tab placeholder screens).

### Key Link Verification

All key links across all 8 plans verified via `gsd-tools query verify.key-links`: 23/23 wired (auth-client → auth server → Drizzle schema; api-client → session-guard → client-version; theme → AppearanceControl → global.css; tab layouts → AppearanceControl/sign-out; mailer port → SMTP adapter; CI workflow → turbo tasks → Postgres service). No NOT_WIRED or PARTIAL results.

### Behavioral Spot-Checks (carried over from verified_state, not re-run)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck across workspace | `pnpm typecheck` (5 turbo tasks) | Pass | ✓ PASS |
| Full task graph | `turbo run typecheck lint test build` (11 tasks) | Pass | ✓ PASS |
| API e2e suite | `pnpm --filter api test:e2e` | 4 suites, 21 tests pass | ✓ PASS |
| Mobile unit suite | `pnpm --filter mobile test` | 3 suites, 51 tests pass | ✓ PASS |
| Mobile web export | `pnpm --filter mobile build` | 19 static routes incl. all 5 tabs | ✓ PASS |
| Suite-integrity guard | probe suite (no tests) vs. clean run | Probe exits 1 with reason; clean exits 0 | ✓ PASS |
| End-to-end web UAT | Browser: sign-up → 5-tab shell; `/history` cold paste retains session; Profile sign-out returns to sign-in AND deletes the Postgres session row; zero console errors | Confirmed | ✓ PASS (web only) |
| iOS/Android render | — | Never attempted — no simulator/device reachable | ? SKIP → human verification |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| PLAT-01 | 01-01, 01-03, 01-07 | Same account on iOS/Android/desktop browser | ⚠️ Partially satisfied | Web fully proven; iOS/Android code-complete and typechecked but never rendered. See truth #1. |
| PLAT-05 | 01-01, 01-04, 01-06 | Create account, sign in with email/password | ✓ Satisfied | `auth.e2e-spec.ts`, `password-reset.e2e-spec.ts`, `auth-forms.test.ts` all green; sign-up/sign-in/forgot-password screens implemented with full UI-SPEC state coverage. |
| PLAT-06 | 01-05 | Stay signed in across restarts, offline-tolerant | ⚠️ Partially satisfied | D-01/D-02/D-03 classification logic correct and unit-tested; device-level cold-start/airplane-mode behavior unverified (see truth #2). Sign-out's server-side revocation is broken on native (see gaps — a related but distinct defect from PLAT-06's literal text, which is about *not* losing a session, not about correctly *ending* one). |
| PLAT-09 | 01-02, 01-07 | Light/dark appearance | ✓ Satisfied | `theme.test.ts` (10/10 green) covers persistence, restart restoration, unknown-value fallback; live browser confirms the toggle repaints the app. WR-02 (theme.test.ts's overly permissive sentinel assertion) is a minor unresolved warning, not a functional gap. |

No orphaned requirements: REQUIREMENTS.md maps exactly PLAT-01, PLAT-05, PLAT-06, PLAT-09 to Phase 1, and all four appear in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `apps/mobile/lib/api-client.ts` | 18-37 | Missing credential attachment on native (CR-01) | 🛑 Blocker | Native explicit sign-out and background revocation-detection cannot authenticate — see gaps. |
| `apps/mobile/lib/__tests__/theme.test.ts` | 84-92 | Overly permissive regression assertion (WR-02, still open) | ⚠️ Warning | A regression to the pre-0.82 `null` sentinel on the real pinned RN 0.86 runtime would still pass this test. Does not block the phase goal. |
| `apps/mobile/app/(auth)/sign-up.tsx` | 21-25 | Fragile string-split with no guard (WR-03, still open) | ⚠️ Warning | A future copy edit could silently truncate the duplicate-email error message. Cosmetic risk only. |
| No TBD/FIXME/XXX debt markers found | — | — | — | Scanned all 44 files modified across the 8 plans; clean. |

No stub components, no hardcoded-empty render paths, and no console.log-only implementations were found among the files scanned.

### Human Verification Required

See frontmatter `human_verification` — four items: iOS render, Android render, real device-level offline/multi-week-gap behavior, and max-accessibility-font-scale wrap behavior on native. All four are also tracked as open items in `.planning/WINDOWS.md` (ledger entries #2, #4, #5, #7, #8, #9, #10).

### Gaps Summary

Two related, unresolved gaps trace to a single root cause: `apps/mobile/lib/api-client.ts`'s `apiFetch` never attaches the native session credential (the Better Auth cookie the Expo plugin persists in SecureStore) to outgoing requests. This was already identified as CR-01 (critical) in `01-REVIEW.md` on 2026-08-11 and remains unfixed — no commit since the review touches the three affected files (`api-client.ts`, `sign-out.ts`, `_layout.tsx`'s consumer, `auth-storage.ts`).

Concretely, on native only:
1. Explicit sign-out never actually revokes the server-side session row (only the client's local copy is wiped) — a real security-relevant asymmetry between platforms, since the identical action on web does correctly delete the Postgres session row (verified live).
2. The background revocation-detection mechanism in `app/_layout.tsx` can never observe a real revocation, because its own request can never authenticate.

Neither gap causes a premature or unwanted sign-out (D-01's core no-network-logout guarantee is not violated — if anything the defect fails toward keeping the user signed in too long, the opposite risk). Both gaps are, however, genuine, currently-shipping defects in code whose own inline comments assert a guarantee ("only `revoked` clears anything") the code cannot deliver — exactly the kind of gap that stays invisible because nothing in the test suite exercises the credential-attachment step.

Separately, and not counted as a gap (routed to human verification instead): two of the phase's four ROADMAP success criteria (same-account-on-three-platforms, and multi-week-gap session survival) are proven only on the desktop browser target and via unit-level classification logic, respectively. iOS and Android were never rendered in any worktree during execution or during this verification — no simulator or device was reachable. This is not itself evidence of failure, but it is also not evidence of success: the identical "typecheck + unit tests + `expo export` all green" signature that this phase already produced once for a completely broken web render (WINDOWS.md #11/#13, the blank-page bug fixed only after live browser inspection in plan 01-07) means a similarly invisible native-only defect cannot be ruled out by the automated evidence alone.

---

_Verified: 2026-08-14_
_Verifier: Claude (gsd-verifier)_
