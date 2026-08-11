# Phase 1: Cross-Platform Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-11
**Phase:** 1-Cross-Platform Foundation
**Areas discussed:** Offline session policy, Auth scope & post-sign-in shell

**Areas offered but not selected:** Theming & styling foundation, API versioning & client compat

---

## Offline Session Policy

### How long is a cached session honored when refresh fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Indefinitely | Never force sign-out on refresh failure; only explicit sign-out or a positive revocation response ends a session | ✓ |
| Long bounded window (90 days) | Honor for ~90 days since last successful server contact | |
| Short bounded window (30 days) | Honor for ~30 days; tightest security posture, risks failing the multi-week-gap criterion | |

**User's choice:** Indefinitely
**Notes:** Trade-off accepted — a lost phone keeps local data readable until wiped. The gym-with-no-signal scenario outranks it.

### Cold start with a cached session and no connectivity

| Option | Description | Selected |
|--------|-------------|----------|
| Straight in, refresh in background | Render authenticated UI immediately from cached session; refresh fires in background where failure is a no-op | ✓ |
| Bounded refresh attempt, then in | ~1–2s refresh timeout on launch before proceeding | |
| Straight in, plus offline indicator | Same instant render plus persistent non-blocking offline chrome | |

**User's choice:** Straight in, refresh in background
**Notes:** The offline-indicator variant was set aside rather than rejected — the sync-status surface belongs to Phase 2.

### What counts as "the server said so" for a forced logout?

| Option | Description | Selected |
|--------|-------------|----------|
| Only an explicit rejection | Completed round-trip returning 401/403 with a revoked reason; transport failures never touch the session | ✓ |
| Explicit rejection after retries | Require 2–3 consecutive definitive 401s before clearing | |
| Any 401 logs out immediately | Simplest rule; vulnerable to captive portals returning 401-shaped responses | |

**User's choice:** Only an explicit rejection
**Notes:** Makes the distinction structural in the API client rather than a judgement call at each call site.

### On sign-out, what happens to the on-device database?

| Option | Description | Selected |
|--------|-------------|----------|
| Wipe, but confirm if writes are unsynced | One account per device; clear local DB and secure storage, with an explicit confirmation when pending writes exist | ✓ |
| Always wipe, no questions | Unconditional clear; simplest, but a revoked session can silently destroy a just-logged offline workout | |
| Keep local data, keyed by user | Retain partitioned by user id for instant re-login; more surface area for Phase 2 | |

**User's choice:** Wipe, but confirm if writes are unsynced
**Notes:** Phase 1 has no local DB; this sets the lifecycle Phase 2's SQLite layer is built against.

---

## Auth Scope & Post-Sign-In Shell

### How much account surface belongs in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Sign-up, sign-in, sign-out only | The literal PLAT-05 requirement and nothing more | |
| Add password reset | Also ship forgot-password | ✓ |
| Add verification and reset | Full account hygiene from day one | |

**User's choice:** Free-text — "maybe use ready solution ? like clerk", then after discussion: "then I need sign up/in and password reset"
**Notes:** The user raised Clerk as an alternative to what research had locked. Claude laid out the conflict: Clerk owns token lifetime and cannot express the indefinite-offline-session decision made minutes earlier; its documented offline path throws `ClerkOfflineError` after a failed refresh (with a reported 10–15s black screen); it bills per-MAU; and identity outside the project's own Postgres would still require mirroring user IDs for Phase 2's synced tables. Claude also corrected a framing point — Better Auth is itself a ready solution, not hand-rolled auth, shipping sign-up, sign-in, sessions, password hashing and token rotation as a NestJS module. The user then settled on Better Auth with sign-up/sign-in plus password reset. **Clerk is considered-and-rejected, not merely unexamined.**

### Where does the password reset link land?

| Option | Description | Selected |
|--------|-------------|----------|
| Web page at your own domain | Link opens the browser into the web build already being shipped; zero deep-link configuration | ✓ |
| Emailed code, typed in the app | 6-digit OTP; never leaves the app, also skips deep-link config, but a longer flow | |
| Deep link into the native app | Universal Links / App Links with web fallback; nicest UX, most platform setup | |

**User's choice:** Web page at your own domain
**Notes:** Deep links remain additive later; the web route stays the fallback either way.

### How real should email delivery be in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Mailer interface, Mailpit locally | NestJS mailer port with a local SMTP-catcher adapter and an env-selected real provider adapter | ✓ |
| Wire a real provider now | Resend with a verified sending domain; blocks local dev on external account setup | |
| Log the reset link to console | Fastest; leaves "password reset works" unproven | |

**User's choice:** Mailer interface, Mailpit locally
**Notes:** Explicit goal that cloning the repo never requires an external email account to run the app.

### What is behind the authenticated door in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Real nav scaffold, placeholder screens | Full Expo Router tree (Home, Programs, Workout, History, Profile) with labelled placeholders | ✓ |
| One home screen plus sign-out | Smallest honest read of the success criterion | |
| Minimal scaffold, two or three tabs | Middle cut proving the routing pattern without committing to a navigation shape | |

**User's choice:** Real nav scaffold, placeholder screens
**Notes:** Chosen deliberately over the minimum because a single screen exercises almost none of Expo Router, and late-discovered RN Web divergence is a named project pitfall.

---

## Claude's Discretion

The user declined to discuss these; they are recorded in CONTEXT.md for research and planning to decide:

- Styling and theming foundation (PLAT-09) — flagged as high-leverage, inherited by all eleven remaining phases
- API versioning strategy and old-client policy (success criterion 4)
- Monorepo layout, including whether the shared `progression-engine` package is stubbed now
- Local dev environment (docker-compose for Postgres + Mailpit), EAS dev-client timing, CI scope
- Native-module web audit (secure storage, notifications, haptics, background tasks)

## Deferred Ideas

- Email verification on sign-up — cut from Phase 1 scope; revisit if the app gains users beyond the author
- OAuth / social sign-in — not needed for a single-user v1
- Offline/sync status indicator in the UI — belongs to Phase 2, where there is real sync state to report
- Native deep links for password reset (Universal Links / App Links) — purely additive over the browser-hosted route
