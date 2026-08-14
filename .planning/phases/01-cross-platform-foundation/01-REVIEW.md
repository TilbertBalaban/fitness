---
phase: 01-cross-platform-foundation
reviewed: 2026-08-14T15:49:34Z
depth: deep
files_reviewed: 2
files_reviewed_list:
  - apps/mobile/lib/api-client.ts
  - apps/mobile/lib/__tests__/session-refresh.test.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 1: Code Review Report — Plan 01-11 Gap Closure (Origin-Based Credential Gate)

**Reviewed:** 2026-08-14T15:49:34Z
**Depth:** deep (security-weighted; cross-referenced against `01-VERIFICATION.md` gap[0], `01-REVIEW.md` CR-01, and the plan's `<threat_model>`)
**Files Reviewed:** 2 (`apps/mobile/lib/api-client.ts`, `apps/mobile/lib/__tests__/session-refresh.test.ts`)
**Status:** clean

## Summary

This diff (`ac1f5e5`, `b6b199c`, `95c3337`) replaces the `url.startsWith(API_URL)` credential-attachment
gate — the prior review's CR-01, and `01-VERIFICATION.md`'s single remaining gap — with a new exported
predicate `isProjectOrigin(url, apiUrl)` that compares `new URL(...).origin` values instead of raw
strings, and `resolveSessionCredential` now delegates to it.

**The fix is correct and closes the vulnerability.** I verified `isProjectOrigin`'s behavior directly
against Node's spec-compliant `URL` implementation (the same engine Jest and, per the plan's Finding A/B,
the on-device Expo/`whatwg-url-minimum` global agree with) across every class named in the review brief,
beyond what the plan's own test suite pins:

| Class | Verified behavior | Bypass? |
|---|---|---|
| Port extension (`:30000` vs `:3000`) | Different origins, rejected | No — tested |
| Subdomain suffix (`api.fitness.app.evil.com`) | Different origins, rejected | No — tested |
| Separator-less suffix (`api.fitness.appevil.com`) | Different origins, rejected | No — tested |
| Userinfo confusion (`api.fitness.app@evil.com`) | Real origin resolves to `evil.com`, rejected | No — tested |
| Scheme mismatch (`http` vs `https`, same host) | Different origins, rejected | No — tested |
| Default-port normalization (`https://x:443` vs `https://x`) | `origin` correctly normalizes both to the same string — legitimately equivalent, not a bypass | No — confirmed via direct probe, not separately tested but not required |
| Trailing-dot FQDN (`api.fitness.app.`) | Node's `URL` preserves the trailing dot in `hostname`/`origin`; differs from the non-dotted origin, so it fails **closed** (rejects a request that isn't actually a bypass risk) | No — confirmed via direct probe |
| IDN/punycode homograph (Cyrillic `а` for `a`) | `URL` ToASCII-converts to a genuinely different string (`xn--pi-6kc.fitness.app`), origin differs, rejected | No — confirmed via direct probe |
| Uppercase host | `URL` lowercases scheme/host before computing `origin`; matches correctly | No — confirmed via direct probe |
| Backslash-as-separator (`https:\\evil.com`) | Spec-compliant parser folds backslash to the real host (`evil.com`) before origin is computed — no manual string parsing exists to fool | No — confirmed via direct probe |
| Relative/path-only URL passed to `apiFetch` | `new URL(relativeUrl)` throws with no base, caught, returns `false` (fails closed to no-credential). No current caller (`app/_layout.tsx`, `sign-out.ts`) ever passes anything but an absolute `${AUTH_ENDPOINT}/...` URL, so this is not a live regression today — noted for future callers | No — not reachable by any existing call site |

The opaque-origin guard (`requestOrigin === '' \|\| === 'null'`, `api-client.ts:32-33`) is reachable and
correctly ordered: I confirmed `file:///etc/passwd`'s `.origin` is the literal string `"null"` (not `""`),
so the request-side branch of that guard is what actually rejects the `describe('isProjectOrigin')`
`'opaque-origin request URL'` case — it is not dead code on the request side, and it cannot produce a
false negative for a legitimate same-origin request since a real API origin is always `http`/`https`
(never opaque).

The regression tests genuinely discriminate: the dynamically-constructed adversarial URL in the
`apiFetch`-level test (`${API_URL}0/probe`) is paired with
`expect(adversarialUrl.indexOf(API_URL)).toBe(0)` before the no-cookie assertion, exactly as the plan
required, and I independently confirmed every literal URL in the 13-row `describe('isProjectOrigin')`
table textually begins with its paired `apiUrl` argument by inspection — so a reversion to
`url.startsWith(apiUrl)` would fail every one of those rows, not just the dynamically-derived one.
I ran the suite directly rather than trusting the SUMMARY's reported numbers: `pnpm --filter mobile test
-- session-refresh.test.ts` passes 57/57 (42 pre-existing + 2 from Task 1 + 13 from Task 2).

No caller of `apiFetch` is broken: `git grep` confirms the only two production call sites
(`app/_layout.tsx:50`, `sign-out.ts:22`) already build their URL from `AUTH_ENDPOINT`, which is always
`API_URL` + a fixed path — both resolve to the project's own origin under the new check exactly as they
did under the old one. `apiFetch`'s header-merge, timeout/abort handling, and `ApiFetchResult` shape are
untouched by the diff (confirmed via `git diff`).

Comments policy (`.claude/CLAUDE.md`, "Comments — only when crucial"): the diff adds `isProjectOrigin`
with zero comments, despite the plan's own text calling this a legitimate "trap" case where a comment
could earn its place. This is compliant with the stated policy (no comment is never a violation) and
arguably better — the function's three guarded returns are self-explanatory from the code shape,
each explained already in the plan's action steps rather than restated in-file.

No Critical or Warning findings for this diff. Two minor Info-level observations below; neither weakens
the security fix.

## Info

### IN-05: The `requestOrigin === ''` / `projectOrigin === ''` branches in `isProjectOrigin` are unreachable dead code

**File:** `apps/mobile/lib/api-client.ts:32-33`
**Issue:** `URL.prototype.origin` never serializes to the empty string under the WHATWG spec that both
Jest's `URL` and (per the plan's own Finding A) the on-device Expo `URL` implement. An opaque origin
always serializes to the literal string `"null"` — I confirmed this directly for `about:blank`,
`data:text/plain,hi`, `javascript:alert(1)`, and `file:///etc/passwd`, none of which ever produced `""`.
The `=== ''` half of each guard therefore has no reachable input under any URL either argument could
plausibly hold; only the `=== 'null'` half can ever fire. This is harmless — it doesn't weaken the
guard, and dead defensive code here fails closed rather than open — but it's worth knowing it isn't
adding coverage the comment-free code doesn't already claim.
**Fix:** Optional. Either drop the `=== ''` checks, or leave them as intentional belt-and-suspenders
defense against a future non-spec-compliant `URL` polyfill — if kept, no action needed.

### IN-06: The "URL the platform URL parser rejects" test's `outcome: 'ok'` assertion is guaranteed by the test's own fetch mock, not by anything the credential gate proves about transport-layer behavior

**File:** `apps/mobile/lib/__tests__/session-refresh.test.ts:286-297`
**Issue:** This case (and the plan's Task 1 Step 3 narrative) frames the `outcome === 'ok'` assertion as
proof that "a local parsing failure must not be reclassified as a transport event" (the D-03 boundary).
In practice, `globalThis.fetch` is mocked with `.mockResolvedValue(fakeResponse(200, {}))` unconditionally
— it never inspects the `'not-a-url'` string passed as `input` — so `classifyAuthOutcome` receiving a
200-shaped object and returning `'ok'` is guaranteed by the mock's construction, not by demonstrating that
`isProjectOrigin`'s internal catch prevents a parse failure from leaking into `apiFetch`'s own error path.
That said, the test is not worthless: `expect(fetchMock).toHaveBeenCalledTimes(1)` together with
`init.headers.cookie` being `undefined` does prove the real, valuable property — that a malformed URL
reaching `resolveSessionCredential` doesn't throw an uncaught exception out of `apiFetch` (the
`const credential = await resolveSessionCredential(input);` line at `api-client.ts:58` has no surrounding
try/catch, so a regression that removed `isProjectOrigin`'s internal catch would break this test via a
thrown exception, not via a wrong `outcome` value). The `outcome` assertion specifically is the part that
adds no discriminating power beyond what the mock already fixes.
**Fix:** Optional / cosmetic. If the D-03 claim is meant to be evidenced end-to-end, either mock `fetch`
to throw for the literal string `'not-a-url'` (mirroring what a real unparseable-URL `fetch()` call would
do) and assert the *actual* resulting classification, or reword the test name/plan narrative to scope the
claim to what's actually tested: "the credential gate's own parse failure doesn't propagate."

---

_Reviewed: 2026-08-14T15:49:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

## Carried Forward (pre-existing, out of scope for plan 01-11 — not counted in this review's status)

Per the task brief, these items from the prior `01-REVIEW.md` are explicitly out of scope for this
gap-closure plan and are carried forward unchanged, not re-litigated, and not counted against this
diff's `clean` status.

- **WR-01** (Warning): `session.updatedAt`/`account.updatedAt` inconsistently omit `.defaultNow()` vs.
  `user.updatedAt`/`verification.updatedAt` — `apps/api/src/db/schema.ts:24-26, 53-55`
- **IN-01** (Info): `"lint": "tsc --noEmit"` duplicates `typecheck` and is not a real linter —
  `apps/mobile/package.json:11`, `apps/api/package.json:10`
- **IN-02** (Info): Two undocumented `Platform.OS` branches against the project's own documented
  convention — `apps/mobile/components/AuthScreenLayout.tsx:9`, `apps/mobile/lib/sign-out.ts:24`
- **IN-03** (Info): `useAppearance()`'s `colorScheme` field is sourced from an API documented elsewhere
  as unreliable for this purpose, and has no current consumer — `apps/mobile/lib/theme.ts:42-64`
- **IN-04** (Info): `/health` has no CORS configuration on the Nest side — `apps/api/src/main.ts`,
  `apps/api/src/health/health.controller.ts`

**CR-01 (prior review, now RESOLVED by this diff):** "The session-credential origin guard is a naive
`startsWith` prefix check, not an origin comparison." Closed by `isProjectOrigin` in this diff; see
Summary above for the verification performed.
