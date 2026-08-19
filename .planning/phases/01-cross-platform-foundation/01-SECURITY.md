---
phase: 01
slug: cross-platform-foundation
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on (high) — the blocking gate
threats_open: 0
asvs_level: 1
created: 2026-08-19
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: `register_authored_at_plan_time: true` — all 11 phase plans carry a
`<threat_model>` block. Verification depth is ASVS L1 (grep/source-level confirmation that each
declared mitigation is present in the implementation), matching `workflow.security_asvs_level: 1`.
No SUMMARY raised a new threat flag: 01-07 and 01-08 declare "None" explicitly; the other nine
carry no flags section.

**Threat-ID collision warning.** IDs are per-plan and were reused with different meanings across
plans — `T-01-23`…`T-01-33` mean one thing in 01-06/01-08, another in 01-09, another in 01-10, and
another in 01-11. Every row below is keyed by **plan + ID**. Do not merge rows by ID alone.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| B1: client → NestJS API | Every authenticated request, auth submission, reset redemption, and the client version header | Credentials, session cookie, reset tokens |
| B2: NestJS API → Postgres | Credential material and session rows persisted | Password hashes, session rows |
| B3: NestJS API → SMTP | Reset link leaves the system in plaintext | Bearer reset URL |
| B4: device secure storage → app process | Cached session token at rest under D-01 | Session credential |
| B5: npm registry → build / CI runner | Third-party code enters the project | Dependency tree |
| B6: email inbox → browser | Reset link is a bearer credential in an uncontrolled channel | Bearer reset URL |
| B7: rendered screen → person | On-screen copy is itself a disclosure surface | Account-existence signal |
| B8: browser address bar → route tree | Deep-linkable web URLs are an untrusted entry point | Route access |
| B9: CI environment → logs | Env vars and test output written to a durable, readable log | Config values, captured mail |
| B10: app process → arbitrary request destination | `apiFetch` accepts any URL string | Session credential |

---

## Threat Register

| Plan | Threat ID | Category | Component | Severity | Disposition | Mitigation (verified evidence) | Status |
|------|-----------|----------|-----------|----------|-------------|-------------------------------|--------|
| 01-01 | T-01-01 | Spoofing | sign-in route (B1) | high | mitigate | No project-authored hashing in `apps/api/src` — grep for bcrypt/scrypt/argon2/pbkdf2/createHash returns only a catalog content-digest in `seed/normalize-catalog.ts:123`, not a credential path. `emailAndPassword` owns hashing (`auth/auth.ts`). | closed |
| 01-01 | T-01-05 | Elevation of Privilege | every authenticated route | high | mitigate | Acting user resolved from session context only — `sync.controller.ts:30,42` use `session.user.id`; no body/path-derived identity. | closed |
| 01-01 | T-01-06 | Spoofing / EoP | indefinitely-honoured cached session (D-01) | high | mitigate | Sessions are revocable Postgres rows (`db/schema/session.ts`); `session.expiresIn` set to a generous server floor so the server never independently expires what the client still honours. | closed |
| 01-01 | T-01-07 | Information Disclosure | auth request/response bodies | medium | mitigate | No logger/console in `auth/` or `mailer/`; `auth.e2e-spec.ts` asserts no response body carries the submitted password. | closed |
| 01-01 | T-01-08 | Denial of Service | unauthenticated sign-up/sign-in (B1) | medium | mitigate | `rateLimit: { enabled: true }` in every environment; Better Auth's stricter per-path defaults left intact, loosened only by explicit env override for the e2e suite. | closed |
| 01-01 | T-01-14 | Information Disclosure | `.env` / `BETTER_AUTH_SECRET` | medium | mitigate | `.env` on line 6 of `.gitignore`, 0 tracked `.env` files; secret read from `process.env`, never inlined. | closed |
| 01-01 | T-01-SC | Tampering | pnpm installs | high | mitigate | `pnpm-lock.yaml` committed; blocking human legitimacy gate ran at plan time. | closed |
| 01-02 | T-01-11 | Information Disclosure | appearance value at rest | low | accept | See Accepted Risks R-01. | closed (accepted) |
| 01-02 | T-01-15 | Tampering | attacker-writable appearance value | low | mitigate | `theme.ts:11,17,19` — `isAppearance` allowlist; any unrecognised stored token resolves to `system`, never interpolated into a selector. | closed |
| 01-03 | T-01-09 | Tampering | `X-Client-Version` header | low | accept | See Accepted Risks R-02. | closed (accepted) |
| 01-03 | T-01-16 | Denial of Service | malformed version string | low | mitigate | `min-client-version.guard.ts:22-24` — parse failure caught and treated as absent (`blocked: false`), so a malformed header cannot 500. | closed |
| 01-03 | T-01-17 | Information Disclosure | 426 response body | low | mitigate | `min-client-version.guard.ts:49,73` — body is `{ reason, minimum }` only; no path, inventory, or stack trace. | closed |
| 01-04 | T-01-03 | Tampering | password-reset token | high | mitigate | Better Auth's single-use consumption and default 1h expiry untouched; `password-reset.e2e-spec.ts:195` (replay rejected) and `:220` (expired/fabricated rejected). | closed |
| 01-04 | T-01-02 | Information Disclosure | forgot-password endpoint | medium | mitigate | `password-reset.e2e-spec.ts:148` — identical status and body for a non-existent address, and the mailer port is never called for it. | closed |
| 01-04 | T-01-07 | Information Disclosure | reset link in logs / CI output | medium | mitigate | No logger/console in `mailer/`; `password-reset.e2e-spec.ts:234` asserts no response body or error message carries the raw token or plaintext password. | closed |
| 01-04 | T-01-10 | Information Disclosure | SMTP credentials | medium | mitigate | `.env.example:16-17` — `SMTP_USER` and `SMTP_PASSWORD` are empty placeholders; dev catcher is unauthenticated on loopback, so no dev credential exists to leak. | closed |
| 01-04 | T-01-18 | Spoofing | reset link opened on a hostile device | medium | accept | See Accepted Risks R-03. | closed (accepted) |
| 01-05 | T-01-06 | Spoofing / EoP | indefinitely honoured cached session | high | mitigate | `session-guard.ts` — the `revoked` arm requires a completed 401/403 carrying `SESSION_REVOKED_REASON`; server revocation is honoured on the next reachable request. | closed |
| 01-05 | T-01-19 | Elevation of Privilege | captive portal / proxy returning 401 | high | mitigate | `session-guard.ts:classifyAuthOutcome` — a 401 without the revocation reason falls to `rejected`, not `revoked`, so a network intermediary cannot force a teardown. | closed |
| 01-05 | T-01-20 | Information Disclosure | session token retained after sign-out | high | mitigate | `sign-out.ts` — `revokeServerSession()` discards its outcome and cannot throw (`apiFetch` catches), so `clearCachedSession()` always runs; `auth-storage.ts:21-27` deletes both SecureStore entries. | closed |
| 01-05 | T-01-21 | Denial of Service | hung `get-session` on web | medium | mitigate | `WEB_SESSION_RESOLVE_BUDGET_MS = 3000` bounds the web cold-start wait; sign-in renders provisionally past it (UAT W6). | closed |
| 01-05 | T-01-22 | Information Disclosure | session state on a shared device | medium | accept | See Accepted Risks R-04. | closed (accepted) |
| 01-06 | T-01-02 | Information Disclosure | sign-in / forgot-password copy | medium | mitigate | Generic rejection and address-agnostic success strings asserted verbatim in acceptance criteria. | closed |
| 01-06 | T-01-01 | Spoofing | password entry field | high | mitigate | Secure text entry by default; reveal is an explicit person-initiated control; no credential in a query string or navigation param. | closed |
| 01-06 | T-01-23 | Information Disclosure | client-only validation | medium | mitigate | Server-side `minPasswordLength` and email-format checks remain authoritative in Better Auth; client validation is a convenience layer. | closed |
| 01-06 | T-01-24 | Elevation of Privilege | reset `redirectTo` value | high | mitigate | `web-app-origin.ts` — `PASSWORD_RESET_REDIRECT_URL` built from `EXPO_PUBLIC_WEB_APP_ORIGIN`, never from input, and rejected at import unless http/https; server `trustedOrigins` (`auth.ts`) gates it again. | closed |
| 01-07 | T-01-13 | Information Disclosure | deep-linkable tab URLs | medium | mitigate | `app/_layout.tsx:110-116` — `<Stack.Protected guard={signedIn}>` wraps the tabs group; UAT W9 confirms a direct URL redirects to sign-in when signed out. | closed |
| 01-07 | T-01-25 | Spoofing | web tab navigation via link elements | low | accept | See Accepted Risks R-05. | closed (accepted) |
| 01-07 | T-01-20 | Information Disclosure | session retained after sign-out on a shared browser | high | mitigate | Profile sign-out routes through `sign-out.ts`; UAT W8 observed Postgres session rows 4→3 and an emptied cookie jar. | closed |
| 01-08 | T-01-26 | Information Disclosure | CI job environment and logs | medium | mitigate | Zero `secrets.` references across `.github/workflows/`; every boot value is a throwaway generated in-workflow. | closed |
| 01-08 | T-01-SC | Tampering | dependency resolution on the runner | high | mitigate | `ci.yml:26,81,110` — `pnpm install --frozen-lockfile` on all three jobs; committed lockfile is authoritative. | closed |
| 01-08 | T-01-27 | Information Disclosure | captured reset mail in CI | low | accept | See Accepted Risks R-06. | closed (accepted) |
| 01-09 | T-01-23 | Spoofing / EoP | server session not terminated by an explicit native sign-out (ASVS V3) | critical | mitigate | `native-session.e2e-spec.ts:94-110` — proves the row is gone by direct Postgres query (`sessionRowCount` 0), not by asserting a 200. | closed |
| 01-09 | T-01-24 | Information Disclosure | credential attached to a non-project destination (string-prefix guard) | high | mitigate | **SUPERSEDED — this mitigation was declared but verified FAILED.** Replaced by 01-11 / T-01-29 below, which is verified closed. Retained for audit continuity. | superseded |
| 01-09 | T-01-25 | Denial of Service (against the user) | local storage read failure misread as server revocation | high | mitigate | `session-guard.ts:classifySessionProbe` — requires `presentedCredential: true` before a 200-with-null-body can mean `revoked`; the no-credential path yields `ok`. | closed |
| 01-09 | T-01-26 | Information Disclosure | credential written to a log / trace / crash report | medium | mitigate | No logger/console in `api-client.ts` or `auth-storage.ts`; the credential is passed by value into a header object and never stringified elsewhere. | closed |
| 01-09 | T-01-27 | Tampering | caller overriding the credential via its own cookie header | low | accept | See Accepted Risks R-07. | closed (accepted) |
| 01-09 | T-01-28 | Repudiation | revoked session observed only on next foreground | low | accept | See Accepted Risks R-08. | closed (accepted) |
| 01-10 | T-01-29 | Information Disclosure | account enumeration via sign-up duplicate-email copy | medium | accept | See Accepted Risks R-09. | closed (accepted) |
| 01-10 | T-01-30 | Information Disclosure | real credential committed in the verification recipe | high | mitigate | `docs/native-verification.md` — scan for connection-string / key / token shapes across `docs/` returns nothing; the document names env vars and points at `.env.example`. | closed |
| 01-10 | T-01-31 | Tampering | a documented command that mutates a real database | medium | mitigate | Every command resolves to an existing declared script; the schema-apply step is scoped to the local dev database. | closed |
| 01-10 | T-01-32 | Repudiation | a verification document recording an unperformed check | medium | mitigate | All checklist items ship unchecked; an automated assertion rejects a pre-checked box. | closed |
| 01-11 | T-01-29 | Information Disclosure | `resolveSessionCredential` — credential leak via origin prefix-collision | high | mitigate | `api-client.ts:isProjectOrigin` compares parsed `new URL(...).origin` values. `session-refresh.test.ts:140-163` pins 13 cases including subdomain-suffix, separator-less-suffix, userinfo-authority (`https://api.fitness.app@evil.com`), port-extension (`:30000` vs `:3000`), and scheme-mismatch — all false. **Closes the 01-09 / T-01-24 failure.** | closed |
| 01-11 | T-01-30 | Information Disclosure | two opaque (`"null"`) origins comparing equal | low | mitigate | `api-client.ts` rejects `''` and `'null'` on either side before comparing; `file:///etc/passwd` asserted false. | closed |
| 01-11 | T-01-31 | Denial of Service (against the user) | malformed URL throwing out of the credential gate | medium | mitigate | Parsing wrapped in try/catch returning `false`; the request still goes out exactly once, carries no credential, and classifies `ok` rather than `offline` — preserving the D-03 boundary. | closed |
| 01-11 | T-01-32 | Tampering | a future caller reintroducing a string comparison | high | mitigate | Regression cases assert both that each adversarial URL genuinely begins with the API origin **and** that no credential is attached, so a reversion cannot satisfy them. | closed |
| 01-11 | T-01-33 | Spoofing | attacker-controlled host that is a literal string extension of a deployed `API_URL` | high | mitigate | Directly closed by T-01-29's parsed-origin fix. Residual carried forward — see Forward-Looking Residuals. | closed |

*Status: open · closed · superseded*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward `threats_open`*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-01 | 01-02 / T-01-11 | Stored appearance value is one of three non-sensitive UI tokens carrying no personal or account data; same-origin `localStorage` on web. A colour-scheme preference is not confidential. | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-02 | 01-03 / T-01-09 | A caller can always claim any version, so the floor is a compatibility control, not a security control. Nothing in the authorisation path reads the header; identity still comes from the validated session (T-01-05). | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-03 | 01-04 / T-01-18 | Once the reset link reaches an inbox this system cannot control who opens it. Compensating control: the one-hour single-use window. Realisation requires prior mailbox compromise. | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-04 | 01-05 / T-01-22 | D-04 sets one account per device with a wipe on sign-out; a device left signed in stays signed in **by design** — that is the phase requirement. Compensating control: server-side revocation exists and is reachable. | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-05 | 01-07 / T-01-25 | Link-backed navigation is the requirement; links target only this application's own routes and no person-supplied value reaches an `href`. No injection surface. | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-06 | 01-08 / T-01-27 | The CI mail catcher receives only mail generated by the suite's own throwaway accounts, and the container is destroyed with the job. | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-07 | 01-09 / T-01-27 | The credential is merged **after** caller-supplied headers (verified: `api-client.ts` spreads `init.headers` first, cookie last), so the registered provider wins. Residual — a caller can still pass a foreign URL — is covered by the T-01-29 origin guard. | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-08 | 01-09 / T-01-28 | The probe fires once per launch by design (D-02: the launch path issues no blocking network call). The server-side row is already gone, so the window is a stale client view, not continued server access. | Plan-time disposition, ASVS L1 | 2026-08-19 |
| R-09 | 01-10 / T-01-29 | Sign-up duplicate-email disclosure is a deliberate UI-SPEC product decision scoped to sign-up only; sign-in and forgot-password are deliberately enumeration-safe (verified, 01-04 / T-01-02). | Plan-time disposition, ASVS L1 | 2026-08-19 |

---

## Forward-Looking Residuals

Not open threats — conditions that would invalidate a currently-closed mitigation if a later phase changes them.

| Ref | Condition | Action if it occurs |
|-----|-----------|---------------------|
| 01-11 / T-01-33 | The origin guard trusts `API_URL` as a build-time constant. | If a later phase derives `API_URL` from a runtime source, the trust anchor moves and this register must be revisited. |
| 01-11 / T-01-32 | `apiFetch` is documented as the app's one request path and is intended for reuse by Phase 2's sync and upload call sites, which build URLs from less-trusted values. | Re-verify the origin guard when those call sites land. |
| 01-05 / T-01-06 | No server route emits `SESSION_REVOKED_REASON` yet; the client branch exists ahead of the emitter. | When a revocation emitter is added, verify end-to-end that the client `revoked` arm actually fires. |

---

## Security Audit Trail

| Audit Date | Register Rows | Closed | Superseded | Open | Run By |
|------------|---------------|--------|------------|------|--------|
| 2026-08-19 | 47 | 46 | 1 | 0 | orchestrator (ASVS L1, source-level verification) |

Register spans 11 plans. 9 of the 46 closed rows are closed by documented acceptance. The single
superseded row (01-09 / T-01-24) was declared mitigated at plan time, verified FAILED, and is
closed by its replacement 01-11 / T-01-29 — verified this run against 13 adversarial URL cases.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-19
