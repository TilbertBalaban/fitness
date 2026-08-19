---
phase: 01-cross-platform-foundation
verified: 2026-08-14T16:10:00Z
status: passed
score: 7/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/8
  gaps_closed:

    - "MUST NOT attach the session credential to a request whose destination is not this project's own API origin — the string-prefix check (url.startsWith(API_URL)) is replaced with a parsed-origin comparison (isProjectOrigin), independently confirmed by running the exact adversarial test against the pre-fix commit (fails) and the fixed commit (passes)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification:

  - test: "Sign up, sign in, and reach the same authenticated five-tab home screen on a real iOS simulator/device"
    expected: "Native tab chrome renders (NativeTabs), the authenticated stack shows on first frame, Home/Programs/Workout/History/Profile all reachable, identical account/session as the browser and Android builds"
    why_human: "No iOS simulator was reachable from this verification environment. Every native-specific claim rests on typecheck, unit tests, and a static `expo export` — none of which render UI. Carried forward unchanged from the prior verification pass (originally WINDOWS.md ledger items #4, #5, #8, #9, #10). Not addressed by 01-11, which was explicitly scoped to the origin-guard gap only."

  - test: "Sign up, sign in, and reach the same authenticated five-tab home screen on a real Android emulator/device"
    expected: "Same as iOS row above, on Android"
    why_human: "Same reasoning as the iOS row. Carried forward unchanged (WINDOWS.md ledger items #8, #9, #10)."

  - test: "Sign in on a device, put it in airplane mode, wait, and cold-start the app after a genuinely elapsed multi-week gap (or at minimum an extended offline period)"
    expected: "Authenticated UI renders immediately with no network wait and no sign-out, per D-01/D-02"
    why_human: "Real elapsed time and true device airplane-mode behavior cannot be produced in this environment. Unit tests (session-refresh.test.ts) prove the classification logic is correct in isolation but do not exercise the actual OS-level cold-start/network-loss path. Carried forward unchanged (WINDOWS.md ledger item #2). This is the specific truth PLAT-06 still depends on for full completion — see Requirements Coverage."

  - test: "On a real iOS or Android build, confirm the attached cookie header is accepted by the running server and the session row is deleted on explicit sign-out"
    expected: "Same behavior the e2e suite (native-session.e2e-spec.ts) proves over HTTP, now observed on a physical/simulated device"
    why_human: "No iOS/Android simulator or device is reachable from this environment. This truth was explicitly declared verification: backstop in 01-09-PLAN.md must_haves.truths — it rests on the HTTP-level e2e proof plus typecheck, not a device observation. Carried forward unchanged (WINDOWS.md ledger item #15)."

  - test: "Confirm maximum OS accessibility font scale wrap-and-grow behavior (auth fields, tab bar labels, placeholder body copy) on iOS and Android"
    expected: "Long text wraps and containers grow rather than clipping or truncating, per UI-SPEC R1"
    why_human: "Verified only on web by shrinking the viewport (WINDOWS.md #9); never observed at real OS accessibility font scale on a native device (WINDOWS.md #7, #9, still open)."
---

# Phase 1: Cross-Platform Foundation Verification Report

**Phase Goal:** A signed-in user can open the same account on iOS, Android, and a desktop browser, from one codebase.
**Verified:** 2026-08-14T16:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after the 01-11 gap-closure wave (single code gap from the previous pass)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create account, sign in, and land on same authenticated home screen on iOS/Android/desktop browser | ⚠️ Structurally present, device unverified | Unchanged since prior pass — sign-up/sign-in screens, `(tabs)/_layout.tsx` + `.web.tsx`, `auth.e2e-spec.ts` prove the server side end to end over real HTTP; no iOS/Android device observation |
| 2 | User stays signed in across restarts, session survives multi-week gap, still usable offline | ⚠️ Structurally present, device unverified | Unchanged since prior pass — SecureStore persistence, D-01/D-02 prohibitions tested, but no real elapsed-time/airplane-mode device observation |
| 3 | `.web.tsx` component override is picked up automatically by shared code | ✓ VERIFIED (regression check) | Files still present; `expo export --platform web` re-run directly by this verification, exits 0, all 19 static routes exported |
| 4 | API carries explicit version from its first request | ✓ VERIFIED (regression check) | `MinClientVersionGuard`/`minClientVersionMiddleware` unchanged since prior pass; `apps/api` was not touched by 01-11 (confirmed by `git diff --stat` over the 01-11 commit range) |
| 5 | Explicit sign-out actually revokes the session server-side on native (D-01) | ✓ VERIFIED (regression check) | `SessionCredentialProvider` seam and `revokeServerSession()` unchanged; full mobile test suite re-run directly, 86/86 pass, no regression |
| 6 | Background native session-revocation-detection mechanism can observe a revoked session | ✓ VERIFIED (regression check) | Unchanged; covered by the same 86/86 passing suite |
| 7 | MUST NOT sign the user out / degrade toward signed-out due to network unavailability | ✓ VERIFIED (regression check) | `apiFetch`/`sign-out.ts` logic unchanged by 01-11 (confirmed by reading the diff — only the origin-decision line and its test file changed) |
| 8 | MUST NOT write the session credential to any logging/tracing/crash-reporting sink | ✓ VERIFIED (regression check) | No `console.*` in the touched files; unchanged from prior pass |
| 9 | MUST NOT attach the session credential to a request whose destination is not this project's own API origin | ✓ VERIFIED (gap closed — full re-verification) | See "Gap Closure Evidence" below. Independently confirmed by this verifier, not accepted on the plan's or SUMMARY's self-declaration. |

**Score:** 7/9 must-haves verified (truths #3-#9), plus 2 truths (#1, #2) structurally present but requiring device-level human confirmation — carried forward unchanged from the prior pass, not new.

### Gap Closure Evidence (Truth #9)

The previous verification rejected 01-09's identical `status: resolved` claim on this exact prohibition. This pass applies the same scrutiny to 01-11's claim and does not accept it at face value. Independent evidence gathered directly by this verification run:

1. **The guard is now a real parsed-origin comparison.** Read `apps/mobile/lib/api-client.ts:28-38`:
   ```
   export function isProjectOrigin(url: string, apiUrl: string): boolean {
     try {
       const requestOrigin = new URL(url).origin;
       const projectOrigin = new URL(apiUrl).origin;
       if (requestOrigin === '' || requestOrigin === 'null') return false;
       if (projectOrigin === '' || projectOrigin === 'null') return false;
       return requestOrigin === projectOrigin;
     } catch {
       return false;
     }
   }
   ```
   This parses both sides with `URL(...).origin`, fails closed on a parse error or an opaque origin, and compares `origin` values (which fold scheme+host+port and ignore userinfo) rather than doing string containment. `resolveSessionCredential` delegates to it: `if (!isProjectOrigin(url, API_URL)) return null;`. `grep -v "^\s*//" apps/mobile/lib/api-client.ts | grep -c "url.startsWith"` returns 0 — the prefix comparison is fully gone from executable source.

2. **The regression tests discriminate a real origin comparison from the old prefix check.** `session-refresh.test.ts` now contains (a) a table-driven `describe('isProjectOrigin')` block with 13 rows, including all four bypass classes named in the gap report (port extension, subdomain suffix, separator-less suffix, userinfo authority confusion), each paired with a positive same-origin row so an always-`false` predicate cannot pass; and (b) inside `describe('apiFetch')`, a case named `'attaches no cookie header for a URL that is a strict textual extension of API_URL on a different port'` that asserts BOTH `adversarialUrl.indexOf(API_URL) === 0` (proving the case genuinely exercises the collision class) AND `init.headers.cookie` is `undefined` (the actual behavior) — this is exactly the two-part pairing the task instructions required, and exactly the blind spot that made the previous negative test (`not-this-project.example.com`) unable to distinguish a correct check from a broken one.

3. **I ran the suite myself, not on the SUMMARY's claim.** `pnpm --filter mobile test` (this verification, fresh run): `Test Suites: 3 passed, 3 total / Tests: 86 passed, 86 total`.

4. **I independently reproduced the RED step against the pre-fix commit** (the SUMMARY's claim is not taken on trust here). I checked out `apps/mobile/lib/api-client.ts` from commit `ac1f5e5` (the RED commit, which contains the new test but the old implementation) over the current tree and ran the single new test:
   ```
   ✕ attaches no cookie header for a URL that is a strict textual extension of API_URL on a different port
     expect(received).toBeUndefined()
     Received: "fitness_cookie=abc123"
   Tests: 14 failed, 43 passed, 57 total
   ```
   Then restored the fixed file (`git status --porcelain` confirmed a clean tree afterward, no leftover mutation). This directly confirms the prefix-collision bypass was real against the shipped code and is closed by the current implementation — the RED/GREEN claim in the SUMMARY is corroborated by an independent reproduction, not merely repeated.

5. **`tsc --noEmit` and `expo export --platform web` both re-run by this verification, both exit 0.**

6. **Scope was held.** `git diff --stat` over the 01-11 commit range (`ac1f5e5^..HEAD`) touches exactly `apps/mobile/lib/api-client.ts`, `apps/mobile/lib/__tests__/session-refresh.test.ts`, and `.planning/REQUIREMENTS.md` — no plan from 01-01 through 01-10 was modified, and `apps/api` was not touched (no server-side test re-run required).

**Conclusion: the claim holds.** Unlike 01-09's rejected claim, this is not a self-declaration accepted at face value — the fix, the test's discriminating power, and the red-then-green transition were each independently reproduced by this verifier.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/mobile/lib/api-client.ts` | Single shared request path; attaches version header + session credential; guards credential to project origin only via a real origin comparison | ✓ VERIFIED | `isProjectOrigin` exported, used at the one call site, `url.startsWith` fully removed, import constraints preserved (no `expo-secure-store`, no `auth-client` import — the one textual `auth-client` match is a pre-existing comment) |
| `apps/mobile/lib/__tests__/session-refresh.test.ts` | Adversarial coverage distinguishing a real origin comparison from a string-prefix one | ✓ VERIFIED | 13-row table-driven `describe('isProjectOrigin')` plus 2 new `apiFetch`-level cases; 0 skipped/todo tests (`grep -cE "it\.(skip|todo)|describe\.skip|xit\(" ` returns 0) |
| `apps/mobile/app/_layout.tsx` | Registers `SessionCredentialProvider`; runs background revocation probe | ✓ VERIFIED (unchanged, regression-checked) | Not modified by 01-11 |
| `apps/mobile/lib/sign-out.ts` | Revokes server session via the shared request path before clearing local state | ✓ VERIFIED (unchanged, regression-checked) | Not modified by 01-11 |
| `apps/api/src/common/min-client-version.guard.ts` + `client-version.constants.ts` | Server-side version floor enforcement | ✓ VERIFIED (unchanged, regression-checked) | `apps/api` not touched by 01-11 |
| `apps/mobile/app/(tabs)/_layout.web.tsx`, `apps/mobile/app/reset-password.web.tsx` | Platform-specific overrides | ✓ VERIFIED (unchanged, regression-checked) | Still present, `expo export --platform web` still exits 0 |
| `apps/mobile/lib/theme.ts`, `apps/mobile/components/AppearanceControl.tsx` | Light/dark appearance switching (PLAT-09) | ✓ VERIFIED (unchanged, regression-checked) | Not touched by 01-11 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `apps/mobile/lib/api-client.ts` (`resolveSessionCredential`) | `apps/mobile/lib/api-client.ts` (`isProjectOrigin`) | `if (!isProjectOrigin(url, API_URL)) return null;` | ✓ WIRED, CORRECT | The prior report flagged this link as "wired but incorrect" (string-prefix). Now delegates to a real parsed-origin predicate; confirmed by reading the code and by the 15-case suite covering it (13 table rows + 2 apiFetch-level cases) |
| `app/_layout.tsx` | `apps/mobile/lib/api-client.ts` | `setSessionCredentialProvider(getSessionCookieHeader)` at module scope | ✓ WIRED (unchanged) | Not touched by 01-11 |
| `apps/mobile/lib/sign-out.ts` | `apps/api` `/v1/auth/sign-out` | `apiFetch(...)` | ✓ WIRED (unchanged) | Not touched by 01-11 |
| `apps/api main.ts` | `/v1/auth/*` | `minClientVersionMiddleware(AUTH_BASE_PATH)` | ✓ WIRED (unchanged) | `apps/api` not touched by 01-11 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full mobile suite passes after the fix | `pnpm --filter mobile test` (run directly by this verification) | `Test Suites: 3 passed, 3 total / Tests: 86 passed, 86 total` | ✓ PASS |
| The specific prefix-collision case fails against the pre-fix implementation (RED, independently reproduced) | Checked out `ac1f5e5`'s `api-client.ts` over the current tree, ran the single named test, then restored | `14 failed, 43 passed, 57 total` — the strict-textual-extension case fails with `Received: "fitness_cookie=abc123"`, exactly the leak the gap described | ✓ CONFIRMS FIX WAS NECESSARY AND IS NOW CLOSED |
| `tsc --noEmit` | `pnpm --filter mobile exec tsc --noEmit` (run directly) | exit 0 | ✓ PASS |
| `expo export --platform web` | `pnpm --filter mobile exec expo export --platform web` (run directly) | exit 0, 19 static routes exported | ✓ PASS |
| Working tree left clean after the RED-reproduction detour | `git status --porcelain` | empty | ✓ PASS (no accidental mutation left behind) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| PLAT-01 | 01-01, 01-03, 01-07, 01-08, 01-09, 01-10 | Same account, iOS/Android/desktop browser | ⚠️ NEEDS HUMAN | Unchanged since prior pass — code/structure present and web-verified; iOS/Android device confirmation outstanding |
| PLAT-05 | 01-01, 01-04, 01-06, 01-08, 01-10 | Create account, sign in with email/password | ✓ SATISFIED | Unchanged since prior pass |
| PLAT-06 | 01-05, 01-08, 01-09, 01-11 | Stays signed in across restarts, usable offline even when the session cannot be refreshed | ⚠️ NEEDS HUMAN (mechanism now fully verified) | The security-guard prohibition that was FAILED in the prior pass is now closed with independently-reproduced evidence (see Gap Closure Evidence above). But PLAT-06's own wording — "stays signed in across app restarts" and "offline even when the session cannot be refreshed" — depends on truth #2, which remains device-unverified: no real app restart, no real multi-week/airplane-mode elapsed-time observation has occurred. See "Premature Complete marking" below. |
| PLAT-09 | 01-02, 01-07, 01-08, 01-10 | Light/dark appearance switching | ✓ SATISFIED | Unchanged since prior pass |

No orphaned requirements — all four declared IDs (PLAT-01, PLAT-05, PLAT-06, PLAT-09) appear in at least one plan's `requirements` field (01-11 additionally declares `PLAT-06`) and are traceable to artifacts above.

### Premature Complete marking on PLAT-06 (explicit judgment requested by this run)

`.planning/REQUIREMENTS.md` was changed by commit `c589e02` (part of the 01-11 wave, prior to this verification running) to mark **PLAT-06 as `[x]` / `Complete`**, both in the checklist line and in the Traceability table.

**This is premature and should be reverted**, for the same reason a near-identical marking was already reverted once in this repository's history (commit `19fa102`, which rolled PLAT-01/05/06/09 back from `Complete` to `Gaps Found` after the prior verification found the origin-guard gap). The reasoning:

- PLAT-06's own requirement text has two halves: (a) a security property — the credential must not leak to a foreign origin, which is what this wave actually fixed and is now genuinely closed with strong evidence; and (b) a behavioral/device property — "stays signed in across app restarts" and "can keep using the app offline" over real elapsed time. Half (b) is unchanged from the prior verification pass: it is still only proven by unit tests exercising the classification logic in isolation (`session-guard.ts`'s `classifyAuthOutcome`), not by an actual device restart or an actual airplane-mode cold start after a real elapsed gap. That is still an open `human_verification` item (row 3, carried forward unchanged in this report).
- 01-11's own plan frontmatter is more conservative than the REQUIREMENTS.md edit it produced: its `must_haves.truths` are scoped entirely to the origin-comparison mechanism, and its "Scope" section explicitly lists the five device-level human-verification items as "out of scope by user decision" and "carried forward untouched" — it does not claim to have closed them. Marking the parent requirement fully `Complete` overstates what the plan itself claims.
- Per the decision tree in this verification process, a requirement with an open `human_verification` item cannot be `passed`/`Complete` — it is `human_needed`. `PLAT-06` still has an open, unaddressed human-verification item (row 3 above), so it does not meet the bar for `Complete`.

**Recommendation:** revert `.planning/REQUIREMENTS.md`'s `PLAT-06` line back to `[ ]` / `Gaps Found`→`Needs Human` (or whatever this project's convention uses for a mechanism-verified-but-device-unconfirmed requirement) until the airplane-mode/multi-week-gap device check is actually performed. This verification does not perform that edit itself (verifiers report, they do not commit), but flags it as a correctness issue in the current tracking state.

### Anti-Patterns Found

None blocking. `pendingWriteCount()` in `sign-out.ts` still returns a hardcoded `0` with its pre-existing, non-debt comment (unchanged by this wave, not re-scanned as new). No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in the two files 01-11 touched (`api-client.ts`, `session-refresh.test.ts`).

Carried-forward Info/Warning items from `01-REVIEW.md` (WR-01 schema inconsistency, IN-01 fake lint script, IN-02 undocumented `Platform.OS` exceptions, IN-03 unused `colorScheme` field, IN-04 missing CORS on `/health`) are pre-existing, non-regressed, and below the blocker threshold — not gating this verification, and `01-REVIEW.md` was not read directly by this pass per the task's instruction (a code-review agent is regenerating it concurrently).

### Gaps Summary

No open code gaps remain. The single gap from the prior verification pass — the string-prefix credential-attachment check in `apps/mobile/lib/api-client.ts` — is closed. This conclusion rests on evidence this verification gathered independently rather than on the plan's or SUMMARY's own `status: resolved`/`status: complete` declarations:

- The fixed implementation was read directly and confirmed to be a parsed-origin comparison with fail-closed handling for parse errors and opaque origins.
- The regression test's discriminating power was confirmed by structure (the two-part assertion pattern) and by independently reproducing the RED state against the pre-fix commit — the exact test now shipped genuinely fails against the code that shipped in 01-09, and genuinely passes against the fix.
- The full mobile test suite, `tsc --noEmit`, and `expo export --platform web` were all re-run directly by this verification, not read off the SUMMARY.
- Scope was confirmed held: only the two declared files (plus the REQUIREMENTS.md tracking edit) changed.

Two things prevent an overall `passed` status:

1. **Five human-verification items remain open**, all device-level and unchanged from the prior pass (iOS/Android device runs, airplane-mode cold start after real elapsed time, on-device cookie-acceptance confirmation, accessibility font scale). None of these can be closed by code; 01-11 explicitly scoped them out and this verification cannot produce a device observation either. Per the status decision tree, any non-empty human-verification list routes the overall status to `human_needed` even though zero code gaps remain.
2. **A tracking-state correctness issue**: `.planning/REQUIREMENTS.md` marks PLAT-06 `Complete`, which this verification assesses as premature given the open human-verification item PLAT-06 itself depends on (see "Premature Complete marking" above). This is not a code gap and does not block phase progress on its own, but it is flagged because this exact pattern (marking a requirement Complete ahead of verification) was already corrected once in this repository (`19fa102`) and recurred here on the very next wave.

---

_Verified: 2026-08-14T16:10:00Z_
_Verifier: Claude (gsd-verifier)_
