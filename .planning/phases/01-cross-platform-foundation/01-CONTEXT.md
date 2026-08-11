# Phase 1: Cross-Platform Foundation - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A signed-in user can open the same account on iOS, Android, and a desktop browser, from one codebase.

**In scope:** Turborepo + pnpm workspace skeleton, Expo SDK 57 app running on all three targets, NestJS 11 API, Postgres, Better Auth end-to-end (sign-up / sign-in / sign-out / password reset), offline-tolerant session handling, the `.web.tsx` platform-escape-hatch convention, API versioning from the first request, light/dark appearance, and CI.

**Out of scope:** All data sync (Phase 2 — PowerSync, local SQLite, outbox, pull cursor). No domain entities, no exercise catalog, no workout data. The authenticated screens in this phase are navigable placeholders, not features.

</domain>

<decisions>
## Implementation Decisions

### Offline Session Policy

- **D-01:** A cached session is honored **indefinitely** when it cannot be refreshed. A refresh failure never forces a sign-out — only an explicit user sign-out, or a positive server revocation response, ends a session. Directly serves PLAT-06 and success criterion 2 ("session survives a multi-week gap"). — **Reversibility:** costly — session lifetime is a Better Auth server config plus client refresh-failure handling; tightening it later is a config change, but any client already in the field keeps the old behavior until updated.

- **D-02:** **Cold start never blocks on the network.** Read the cached session from secure storage synchronously, render the authenticated UI immediately, and fire the token refresh in the background where its failure is a no-op. There is no refresh attempt on the launch critical path. This is the explicit structural defense against the Clerk-style 10–15s offline black screen research flagged as disqualifying (see `.planning/research/STACK.md`, Auth section). — **Reversibility:** costly — the launch sequence and root layout gate are written around this; retrofitting a blocking refresh means reworking the auth provider boundary.

- **D-03:** **Only a completed HTTP round-trip returning 401/403 with a revoked-session reason triggers logout.** Timeouts, DNS failures, unreachable hosts, and 5xx are classified as "offline" and must never touch the session. The distinction is structural in the API client — transport failures and definitive rejections are separate branches, so a captive portal or misbehaving proxy cannot sign the user out mid-workout. — **Reversibility:** reversible.

- **D-04:** **One account per device.** Sign-out clears the local database and secure storage — but if unsynced writes are pending, the user gets an explicit "you have N unsynced changes" confirmation first. Phase 1 has no local database yet; this establishes the lifecycle Phase 2's local SQLite is built against, and the confirmation hook must exist even while the pending-writes count is trivially zero. — **Reversibility:** costly — Phase 2's local storage layer is designed around single-account, wipe-on-sign-out semantics; supporting multiple retained accounts later means user-scoping every local query.

### Auth Scope

- **D-05:** **Better Auth, self-hosted, stays the choice.** Clerk was explicitly raised and reconsidered during this discussion and rejected: it owns token lifetime and cannot express D-01, its documented offline path throws `ClerkOfflineError` after a failed refresh, it bills per-MAU, and identity living outside the project's own Postgres would still require mirroring user IDs into the database for Phase 2's synced tables. Better Auth is itself a ready solution — sign-up, sign-in, sessions, password hashing, and token rotation ship with it as a NestJS module against the existing Postgres connection. — **Reversibility:** one-way — user identity, password hashes, and the `user_id` foreign key every Phase 2 synced table hangs off all live in the project's own Postgres under this choice; moving to a hosted identity provider later requires a credential migration and a rewrite of the sync tables' ownership column.

- **D-06:** Phase 1 auth surface is **sign-up, sign-in, sign-out, and password reset**. No email verification, no OAuth providers, no account deletion. There is no unverified-account state for later screens to tolerate. — **Reversibility:** reversible.

- **D-07:** **Password reset completes on a web page at the project's own domain.** The reset link always opens the browser and hits a route in the web build already being shipped; the user then signs into the app with the new password. No Apple associated-domains file, no Android intent filters, no custom dev-client rebuild to test the flow — and the behavior is identical from all three platforms because it never leaves the browser. — **Reversibility:** reversible — adding native deep links later is additive; the web route remains the fallback.

- **D-08:** **Email goes through a mailer port in NestJS with two adapters.** Local development uses an SMTP catcher (Mailpit or MailHog) in the dev compose file, so the whole reset flow is clickable end-to-end without owning a domain or a provider account. A real provider adapter is selected by environment variable when deployed. Cloning the repo must never require an external email account to run the app. — **Reversibility:** reversible.

### Post-Sign-In Shell

- **D-09:** Sign-in lands on the **real Expo Router navigation scaffold** — Home, Programs, Workout, History, Profile — with each screen a labelled placeholder. Later phases fill screens in rather than restructuring navigation. This is deliberately more than the success criterion strictly requires, because a single placeholder screen exercises almost none of Expo Router, and "RN Web divergence discovered late" is a named project pitfall (`.planning/research/PITFALLS.md`). The scaffold must demonstrate one route tree producing native tabs *and* real deep-linkable browser URLs. — **Reversibility:** reversible — placeholder screens carry no logic; the tab set can be re-cut before Phase 4 at low cost.

### Claude's Discretion

The user chose not to discuss these; research and planning decide them, grounded in the canonical refs below.

- **Styling and theming foundation (PLAT-09):** which styling approach every future screen inherits (plain `StyleSheet` + theme context vs. NativeWind / Unistyles / Tamagui), and whether dark mode follows the OS or is an in-app persisted toggle. Note this is high-leverage — it is inherited by all 11 remaining phases — so the researcher should treat it as a real evaluation, not a coin flip.
- **API versioning strategy (success criterion 4):** URL path vs. header vs. media-type versioning, and the policy for a client that is too old (hard block with a force-update prompt vs. serve anyway). Research already establishes the wire contract must be additive-only while any client version is in the field (`ARCHITECTURE.md` §3).
- **Monorepo layout:** `apps/` and `packages/` naming, and whether the shared `progression-engine` and a shared API-contract/types package are stubbed now or created when first needed. The shared pure progression package is a locked architectural commitment; only its Phase 1 materialization is discretionary.
- **Local dev environment and CI:** docker-compose for Postgres + Mailpit, EAS dev-client timing, and what CI runs on push.
- **Native-module web audit:** research calls for auditing secure storage, notifications, haptics, and background tasks for web behavior during this phase, before feature components pile onto an unverified pattern. Scope and depth are Claude's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent and scope
- `.planning/PROJECT.md` — core value, locked constraints (RN + RN Web one codebase, NestJS, local-first, real accounts with multi-device sync, no video), and the Key Decisions table
- `.planning/REQUIREMENTS.md` — PLAT-01, PLAT-05, PLAT-06, PLAT-09 are this phase's requirements; PLAT-02/03/04/07/08/10 belong to Phase 2 and must not be pulled forward
- `.planning/ROADMAP.md` §"Phase 1: Cross-Platform Foundation" — goal and the four success criteria this phase is verified against

### Stack (versions are verified, not guessed)
- `.planning/research/STACK.md` — Expo SDK 57 / RN 0.86 (New Architecture mandatory), Expo Router, NestJS 11.1.29, Drizzle 0.45.x, Postgres 15+, Better Auth 1.6.26 + `@thallesp/nestjs-better-auth` + the Expo plugin, Turborepo + pnpm. Also the Auth comparison table that D-05 rests on, and the "What NOT to Use" list.
- `.planning/research/SUMMARY.md` §"Phase 1: Foundation" — the phase's rationale as research framed it, and the note that Better Auth's Expo client plugin package name should be re-verified against current docs before the first install

### Architecture constraints this phase must not violate
- `.planning/research/ARCHITECTURE.md` §3 "Offline-First Sync Architecture" — additive-only wire contract, minimum-supported-client-version gating, and the two-write-paths anti-pattern; the API surface established in Phase 1 must leave room for `SyncModule` to be the sole ingress for per-user mutable data in Phase 2
- `.planning/research/ARCHITECTURE.md` §4 "Progression Engine Placement" — the shared pure package is a locked commitment; the monorepo layout chosen here must be able to host it
- `.planning/research/ARCHITECTURE.md` §5 "Component Boundaries" — the client and backend module tables this phase's scaffolding should anticipate

### Pitfalls this phase specifically exists to prevent
- `.planning/research/PITFALLS.md` — pitfall 6 ("RN Web divergence discovered late": establish the `.web.tsx` escape hatch and audit native modules for web behavior *in the setup phase*) and the stale-mobile-client API-breakage pitfall behind success criterion 4

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None. The repository contains only `.claude/` and `.planning/` — there is no `package.json`, no source tree, and no lockfile. Every file this phase produces is new.

### Established Patterns
None yet in code. The conventions this phase sets — workspace layout, the `.web.tsx` platform-escape-hatch, the API client's transport-failure vs. definitive-rejection split (D-03), and the theming approach — are inherited unchanged by all eleven remaining phases. Treat them as durable, not provisional.

### Integration Points
The API surface and monorepo layout chosen here are the seams Phase 2 attaches to: PowerSync's client SDK on one side and a NestJS `SyncModule` on the other. Phase 1 must not build any data-sync path, but must not foreclose one either — in particular, no conventional REST CRUD surface for per-user mutable domain data (`ARCHITECTURE.md` Anti-Pattern 1).

</code_context>

<specifics>
## Specific Ideas

- **The gym is the reference environment for every session decision.** D-01, D-02, and D-03 were each chosen against the same concrete scenario: phone in airplane mode, mid-workout, no signal since arriving. Any implementation that reintroduces a network dependency on the launch path or on session validity fails the intent regardless of whether it passes a test.
- **Clerk was explicitly considered and rejected during this discussion**, not merely skipped during research. Do not re-propose a hosted auth provider without new information that addresses D-01 and D-02.
- The confirm-on-unsynced-writes hook in D-04 should exist in Phase 1 even though the count is always zero, so Phase 2 wires a real count into an existing seam rather than adding the prompt after the local database already exists.

</specifics>

<deferred>
## Deferred Ideas

- **Email verification on sign-up** — considered and cut from Phase 1 scope (D-06). Revisit if the app ever has users beyond the author.
- **OAuth / social sign-in** — not needed for a single-user v1; Better Auth supports it if it is ever wanted.
- **Offline/sync status indicator in the UI** — raised as a cold-start option and set aside: the sync-status surface properly belongs to Phase 2, where there is actual sync state to report.
- **Native deep links for password reset** (Universal Links / App Links) — D-07 takes the browser-hosted route; deep links are a purely additive improvement later.

</deferred>

---

*Phase: 1-Cross-Platform Foundation*
*Context gathered: 2026-08-11*
