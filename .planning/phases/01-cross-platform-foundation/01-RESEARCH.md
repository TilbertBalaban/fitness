# Phase 1: Cross-Platform Foundation - Research

**Researched:** 2026-08-11
**Domain:** Monorepo bootstrap, cross-platform Expo Router shell, self-hosted Better Auth (NestJS + Postgres), styling/theming foundation, API versioning
**Confidence:** HIGH (all package names/versions verified live against npm registry and Context7-sourced official docs on 2026-08-11; the styling evaluation is a reasoned recommendation, not a single "correct" answer, but every compatibility claim behind it is verified)

## Summary

This phase has no existing project-level research to build on beyond STACK.md's stack picks — it is the empty-repo bootstrap, so everything here is either "how do I actually wire the already-decided pieces together" or "which of the five things CONTEXT.md left to my discretion is correct." The single highest-value finding is that **Better Auth's Expo client plugin already implements the exact synchronous-cached-session-then-background-refresh pattern D-01/D-02/D-03 ask for** — this is not something to build from scratch, it is a configuration and platform-branching exercise on top of a library primitive that exists today. The second highest-value finding is that **the plugin's session-caching code path is a no-op on web** (`if (isWeb) return`) — web relies on the browser's native cookie jar instead of `SecureStore`, which means D-02's "synchronous cached-session read" is a native-only mechanism and the web cold-start path needs its own (simpler, cookie-based) reasoning, not a shared code path. This is exactly the kind of RN/RN-Web divergence PITFALLS.md pitfall 6 warns about, and it surfaces on the very first native module this project touches.

On styling (PLAT-09), the recommendation is **NativeWind v4**, not Unistyles or Tamagui, specifically because Unistyles 3.x requires custom native code (Nitro Modules) and **does not run in Expo Go at all** — it forces an EAS dev-client build from day one of the styling system, which this phase does not otherwise need (Better Auth's Expo plugin and `expo-secure-store` both run fine in Expo Go; PowerSync's native SQLite module, the thing that actually forces a dev client, is Phase 2). Tamagui is compatible (React 19 requirement is satisfied by RN 0.86) but adds a compiler/build-config surface disproportionate to a solo-dev bootstrap phase. Plain `StyleSheet` + theme context is the safe fallback if NativeWind causes friction, but NativeWind's own web output is now "a small polyfill for className on React Native Web," which is a materially smaller cross-platform risk surface than either alternative.

On API versioning, NestJS's built-in `VersioningType.URI` (or `.HEADER`) plus a `minimum-supported-client-version` check on the sync-adjacent endpoints directly implements ARCHITECTURE.md §3's "additive-only + gate breaking changes behind a floor" contract — this is a configuration call (`app.enableVersioning(...)`), not new infrastructure. Package legitimacy checks flagged several extremely well-established packages (`better-auth`, `expo`, `pg`, `turbo`, `nodemailer`) as `SUS` purely because their *latest patch* was published recently — a known false-positive shape of the "too-new" heuristic on actively-shipped packages; the audit table below documents the override reasoning per package rather than silently accepting or rejecting the verdict.

**Primary recommendation:** Bootstrap with Turborepo + pnpm workspaces (`apps/mobile`, `apps/api`, `packages/*`), NativeWind v4 for styling on both targets, Better Auth 1.6.26 + `@better-auth/expo` + `@thallesp/nestjs-better-auth` for auth (session cached via `expo-secure-store` on native, browser cookie jar on web — two different code paths, same `authClient.useSession()` call site), NestJS URI versioning from the first commit, and Expo Go for the entire phase (no dev-client build needed until Phase 2's PowerSync).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sign-up / sign-in / sign-out / password reset | API / Backend (Better Auth + NestJS + Postgres) | Browser/Client (form UI, calls `authClient`) | Better Auth owns password hashing, token issuance, and the reset-token lifecycle server-side; the client only renders forms and calls the SDK — this is D-05's whole point (self-hosted, not client-owned identity). |
| Session persistence across app restarts / offline gap | Browser / Client | API / Backend (session validation only on request) | D-01/D-02 are explicitly a client-side cold-start and storage decision (`SecureStore` cache on native, cookie jar on web); the server's only role is not actively revoking, which is a passive default. |
| Cross-platform navigation shell (tabs + deep-linkable web URLs) | Browser / Client | — | Expo Router is purely a client-side routing layer in this phase; there is no SSR target (Expo Router web here is a static/CSR web build, not a Node SSR server). |
| `.web.tsx` platform-escape-hatch convention | Browser / Client | — | Build-time file resolution (Metro/webpack), no runtime or server component. |
| API version negotiation + minimum-client-version gate | API / Backend | — | Entirely a NestJS request-pipeline concern (`enableVersioning`, a guard/middleware checking a header against a floor); the client only sends a version, it doesn't decide anything. |
| Styling/theming (NativeWind + light/dark) | Browser / Client | — | Compile-time (Babel/PostCSS) + runtime `useColorScheme`, entirely client-side; the server has no opinion on presentation. |
| Password-reset email delivery | API / Backend (mailer port + SMTP adapter) | — | D-08's mailer port lives in NestJS; the client never touches SMTP, it only triggers the request and later signs in with the new password. |
| Local dev environment (Postgres + Mailpit) | Infra / Dev tooling | — | Not a runtime application tier — docker-compose orchestrates the API's dependencies, doesn't belong to client or API code itself. |

## User Constraints

<user_constraints>

### Locked Decisions

**Offline Session Policy**

- **D-01:** A cached session is honored **indefinitely** when it cannot be refreshed. A refresh failure never forces a sign-out — only an explicit user sign-out, or a positive server revocation response, ends a session.
- **D-02:** **Cold start never blocks on the network.** Read the cached session from secure storage synchronously, render the authenticated UI immediately, and fire the token refresh in the background where its failure is a no-op. There is no refresh attempt on the launch critical path.
- **D-03:** **Only a completed HTTP round-trip returning 401/403 with a revoked-session reason triggers logout.** Timeouts, DNS failures, unreachable hosts, and 5xx are classified as "offline" and must never touch the session. The distinction is structural in the API client — transport failures and definitive rejections are separate branches.
- **D-04:** **One account per device.** Sign-out clears the local database and secure storage — but if unsynced writes are pending, the user gets an explicit "you have N unsynced changes" confirmation first. Phase 1 has no local database yet; this establishes the lifecycle Phase 2's local SQLite is built against, and the confirmation hook must exist even while the pending-writes count is trivially zero.

**Auth Scope**

- **D-05:** **Better Auth, self-hosted, stays the choice.** Clerk was explicitly raised and reconsidered during this discussion and rejected.
- **D-06:** Phase 1 auth surface is **sign-up, sign-in, sign-out, and password reset**. No email verification, no OAuth providers, no account deletion.
- **D-07:** **Password reset completes on a web page at the project's own domain.** The reset link always opens the browser and hits a route in the web build already being shipped; the user then signs into the app with the new password. No Apple associated-domains file, no Android intent filters, no custom dev-client rebuild to test the flow.
- **D-08:** **Email goes through a mailer port in NestJS with two adapters.** Local development uses an SMTP catcher (Mailpit or MailHog) in the dev compose file. A real provider adapter is selected by environment variable when deployed. Cloning the repo must never require an external email account.

**Post-Sign-In Shell**

- **D-09:** Sign-in lands on the **real Expo Router navigation scaffold** — Home, Programs, Workout, History, Profile — with each screen a labelled placeholder. The scaffold must demonstrate one route tree producing native tabs *and* real deep-linkable browser URLs.

### Claude's Discretion

- **Styling and theming foundation (PLAT-09):** which styling approach every future screen inherits (plain `StyleSheet` + theme context vs. NativeWind / Unistyles / Tamagui), and whether dark mode follows the OS or is an in-app persisted toggle. High-leverage — inherited by all 11 remaining phases.
- **API versioning strategy (success criterion 4):** URL path vs. header vs. media-type versioning, and the policy for a client that is too old (hard block with a force-update prompt vs. serve anyway).
- **Monorepo layout:** `apps/` and `packages/` naming, and whether the shared `progression-engine` and a shared API-contract/types package are stubbed now or created when first needed.
- **Local dev environment and CI:** docker-compose for Postgres + Mailpit, EAS dev-client timing, and what CI runs on push.
- **Native-module web audit:** auditing secure storage, notifications, haptics, and background tasks for web behavior during this phase, before feature components pile onto an unverified pattern.

### Deferred Ideas (OUT OF SCOPE)

- **Email verification on sign-up** — cut from Phase 1 scope (D-06). Revisit if the app ever has users beyond the author.
- **OAuth / social sign-in** — not needed for a single-user v1; Better Auth supports it if it is ever wanted.
- **Offline/sync status indicator in the UI** — belongs to Phase 2, where there is actual sync state to report.
- **Native deep links for password reset** (Universal Links / App Links) — D-07 takes the browser-hosted route; deep links are a purely additive improvement later.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | User can use the app on iOS, Android, and in a desktop browser, signed into the same account with the same data | Expo Router native-tabs + web-UI-tabs pattern (verified, see Code Examples); single Better Auth server backing all three clients via `@better-auth/expo` (native) + browser cookie session (web) |
| PLAT-05 | User can create an account and sign in with email and password | Better Auth `emailAndPassword: { enabled: true }` + `@thallesp/nestjs-better-auth` NestJS module wiring (verified) |
| PLAT-06 | User stays signed in across app restarts, and can keep using the app offline even when the session cannot be refreshed | Better Auth Expo plugin's built-in `SecureStore` session cache + `disableSessionRefresh`/`expiresIn`/`updateAge` session config, combined with D-01–D-03's client-side transport-failure/definitive-rejection split (see Common Pitfalls and Code Examples) |
| PLAT-09 | User can switch between light and dark appearance | NativeWind v4 `useColorScheme()` (`colorScheme`, `setColorScheme`, `toggleColorScheme`) + `@react-native-async-storage/async-storage` for persisting the override (see Standard Stack, Architecture Patterns) |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Comments only when crucial** — no restating-the-obvious comments, no provenance/history comments (git holds that). A comment is justified only for a trap, a deliberate deviation, an external-contract quirk, or an absence. This applies directly to the D-02/D-03 client code (the `isWeb` branch in the session-cache plugin and the transport-failure-vs-rejection split in the API client are both "external contract quirk" / "trap" territory and are the kind of thing that *earns* a comment — everything else in this phase's scaffold code should not have one).
- **GSD workflow enforcement** — file-changing work must go through a GSD command (`/gsd-execute-phase`, `/gsd-quick`, `/gsd-debug`), not direct edits. Not a planning concern, but the plan should assume execution happens through the standard GSD phase-execution path.
- **Quick Recap footer** — not applicable to plans/research; applies to conversational responses only.

## Standard Stack

Do not re-derive the core stack choices — `STACK.md` already settled Expo SDK 57, NestJS 11.1.29, Drizzle, Postgres, Better Auth, Turborepo + pnpm. What follows is what STACK.md left open or flagged for re-verification.

### Core (Phase-1-specific)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | 1.6.26 [VERIFIED: npm registry] | Server-side auth core | Already locked by D-05/STACK.md; version matches STACK.md's verified figure exactly one day later. |
| `@better-auth/expo` | 1.6.26 [VERIFIED: npm registry, confirmed via Context7 `/better-auth/better-auth` official docs] | Expo client + server plugin pair (`expoClient` on client, `expo()` on server) | This is the exact package STACK.md flagged for re-verification. **Confirmed correct** — `npm install better-auth @better-auth/expo`, `import { expoClient } from "@better-auth/expo/client"` on the RN app, `import { expo } from "@better-auth/expo"` on the NestJS server (added to Better Auth's own `plugins: [expo()]`, not a NestJS-level plugin). |
| `@thallesp/nestjs-better-auth` | 2.7.0 [VERIFIED: npm registry] | NestJS module wiring for Better Auth | More actively maintained than the STACK.md-listed alternative: last published 2026-07-04 vs. `@mguay/nestjs-better-auth`'s 2025-09-06 (stale, v1.0.4). Peer deps (`express: ^5.1.0`) are satisfied by `@nestjs/platform-express` 11.1.29's bundled `express@5.2.1`. |
| `expo-secure-store` | 57.0.1 [VERIFIED: npm registry] | Native session-cache storage (native platforms only) | Bundled Expo SDK module; confirmed to run in Expo Go for basic get/set/delete (no dev-client requirement in this phase — the `requireAuthentication`/biometric option is the only Expo-Go-incompatible feature, and Phase 1 doesn't use it). |
| `expo-router` | 57.0.12 (bundled with SDK 57) [VERIFIED: npm registry] | File-based routing, native tabs (`expo-router/native-tabs`) + web tabs (`expo-router/ui`) from one route tree | See Code Examples — the native/web tab split is a documented, first-class pattern, not a workaround. |
| `nativewind` | 4.2.6 [VERIFIED: npm registry] | Styling — see dedicated evaluation below | Recommended over Unistyles/Tamagui/plain StyleSheet for this phase. |
| `@react-native-async-storage/async-storage` | 3.1.1 [VERIFIED: npm registry] | Persist the user's dark/light/system theme override | Works on RN and RN Web (web build backs onto `localStorage`); the only piece NativeWind's `useColorScheme` doesn't provide itself. |
| `nodemailer` | 9.0.5 [VERIFIED: npm registry] | Mailer port's transport layer (SMTP adapter, used by both Mailpit-dev and prod adapters) | Standard Node SMTP client; talks to Mailpit's unauthenticated SMTP listener in dev and a real provider's SMTP endpoint in prod via the same interface — satisfies D-08's "two adapters, one port" shape without a proprietary SDK per provider. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `turbo` | 2.10.9 [VERIFIED: npm registry] | Monorepo task orchestration | Root-level `turbo.json`; matches STACK.md. |
| `pnpm` | 11.9.0 [VERIFIED: locally installed, `pnpm --version`] | Workspace / package manager | Newer major than STACK.md's "9.x/10.x" note, but `pnpm-workspace.yaml` syntax (`packages: [apps/*, packages/*]`) is unchanged across these majors — no compatibility risk found. |
| `drizzle-kit` | current, tracks `drizzle-orm` | Postgres migrations | Confirmed `OK` in legitimacy audit; matches STACK.md. |

### Alternatives Considered — Styling (the real evaluation CONTEXT.md asked for)

| Library | Version checked | Expo Go compatible? | RN + RN-Web verdict | New Architecture status | Verdict |
|---------|------------------|----------------------|----------------------|---------------------------|---------|
| **NativeWind v4** | 4.2.6 [VERIFIED: npm registry] | **Yes** — pure JS/Babel/PostCSS, no native code [CITED: WebSearch, cross-checked against nativewind.dev + github.com/nativewind/nativewind] | On web, NativeWind is described by its own maintainers as "a small polyfill for adding className support to React Native Web" [CITED: nativewind.dev via WebSearch] — the smallest cross-platform surface of the three | No native module, nothing to be incompatible with | **Recommended.** Zero native-code risk, Expo Go compatible (keeps the entire phase buildable without a dev-client rebuild loop), most widely adopted RN styling library in 2026 (1.59M weekly npm downloads), first-class Expo Router starter support. |
| **react-native-unistyles** | 3.3.0 [VERIFIED: npm registry] | **No** — "Unistyles includes custom native code, which means it does not support Expo Go" [CITED: unistyl.es / GitHub discussion, via WebSearch]; peer deps (`react-native-nitro-modules`, `react-native-reanimated`) confirm real native code | Powerful (compile-time styling, breakpoints) but forces a dev-client build from the very first screen | Depends on Nitro Modules (native C++ turbo module, actively evolving) — real, current native-dependency risk for a greenfield SDK 57 project | **Rejected for Phase 1.** Forces the EAS dev-client rebuild loop this phase doesn't otherwise need (see Local dev environment below) and adds a young native-module dependency (`react-native-nitro-modules`) on top of an already-mandatory New Architecture. |
| **Tamagui** | `@tamagui/core` 2.7.4 [VERIFIED: npm registry] | Yes, no native module required for core styling | Its own compiler flattens styled components at build time for real web performance gains [CITED: tamagui.dev, via WebSearch] | Peer dep `react: >=19` — **satisfied**, RN 0.86 ships React 19.2.3 [VERIFIED: `npm view react-native@0.86.0 peerDependencies` → `react: '^19.2.3'`] | **Rejected for Phase 1, not disqualified.** Version-compatible and Expo-Go-safe, but its compiler/Babel-plugin setup and design-system surface (tokens, themes, `@tamagui/core` vs. full `tamagui` package) is disproportionate build-config risk for a solo-dev bootstrap phase inheriting 11 more phases of screens. Worth revisiting only if NativeWind's utility-class ergonomics prove insufficient once the UI surface grows (Phase 4+). |
| Plain `StyleSheet` + theme `Context` | N/A (RN core) | Yes, trivially | Zero abstraction, zero risk, but no shared conventions across 11 phases — every screen re-derives spacing/color scales by hand | N/A | **Safe fallback**, not the primary recommendation — accept only if NativeWind causes unexpected friction during the tracer slice; do not default to it preemptively, since the whole point of CONTEXT.md's "not a coin flip" framing is picking a real convention up front. |

**Dark mode decision:** PLAT-09's literal wording ("User can switch between light and dark appearance") requires an explicit in-app control, not OS-follow-only. Implement as: default to `useColorScheme()`'s system value on first launch, expose a persisted three-state override (`system` / `light` / `dark`) via NativeWind's `setColorScheme`/`toggleColorScheme`, and persist the choice with `@react-native-async-storage/async-storage` (NativeWind's color-scheme API is in-memory only — persistence across restarts is explicitly the app's responsibility per NativeWind's own docs) [CITED: nativewind.dev useColorScheme docs, via WebSearch].

**Installation:**
```bash
# Client (Expo app)
npx expo install expo-router expo-secure-store @react-native-async-storage/async-storage
npm install better-auth @better-auth/expo nativewind
npx expo install nativewind tailwindcss  # nativewind peer: tailwindcss >3.3.0

# Backend (NestJS)
npm install @nestjs/core @nestjs/common @nestjs/platform-express
npm install better-auth @thallesp/nestjs-better-auth @better-auth/expo
npm install drizzle-orm pg nodemailer
npm install -D drizzle-kit

# Monorepo root
npm install -D turbo
```

## Package Legitimacy Audit

| Package | Registry | Signal notes | Verdict (seam) | Disposition |
|---------|----------|---------------|-----------------|-------------|
| `better-auth` | npm | 6.4M weekly downloads, GitHub repo present, not deprecated; `publishedAt` (latest patch) 2026-08-04 tripped the "too-new" heuristic | SUS (`too-new`) | **Approved, override.** "Too-new" reflects the latest-patch publish date, not package age — 6.4M weekly downloads and STACK.md's own prior-day verification make this a heuristic false positive, not a real signal. Still recommend a lightweight `checkpoint:human-verify` before first install per protocol, since the override is a judgment call, not a re-run of the check. |
| `@better-auth/expo` | npm | 526K weekly downloads, same repo as `better-auth`, `publishedAt` 2026-08-04 | SUS (`too-new`) | **Approved, override** — same reasoning; this is the package name STACK.md explicitly flagged for re-verification, now confirmed via official Context7-sourced docs, not training data. |
| `@thallesp/nestjs-better-auth` | npm | No public weekly-download figure returned by the registry query; real GitHub repo (`ThallesP/nestjs-better-auth`), actively published (2026-07-04, v2.7.0) | SUS (`unknown-downloads`) | **Approved, keep flagged.** Smaller/newer integration package than the others; `checkpoint:human-verify` before first install is appropriate here specifically (unlike the others, low download visibility is a real, not heuristic-artifact, signal). |
| `nativewind` | npm | 1.59M weekly downloads, real repo, not deprecated | OK | Approved. |
| `turbo` | npm | 21.2M weekly downloads; `publishedAt` 2026-08-07 tripped "too-new" | SUS (`too-new`) | **Approved, override** — same recency-of-patch false positive; this is Vercel's own build tool with 21M weekly downloads. |
| `drizzle-orm` / `drizzle-kit` | npm | 18.2M / 15.3M weekly downloads | OK | Approved. |
| `nodemailer` | npm | 19.5M weekly downloads; `publishedAt` 2026-08-07 tripped "too-new" | SUS (`too-new`) | **Approved, override** — same false-positive shape. |
| `expo`, `expo-router`, `expo-secure-store`, `expo-constants` | npm | 7.7M / 5.1M / 4.7M / 8.2M weekly downloads respectively, all `expo/expo` monorepo, all `publishedAt` 2026-08-10 (SDK 57 release day) tripped "too-new" | SUS (`too-new`) | **Approved, override.** SDK 57 shipped the day before this research; every Expo package legitimately has a fresh `publishedAt`. Already the project's locked stack choice per STACK.md/PROJECT.md — not a new decision this phase is making. |
| `pg` | npm | 43.7M weekly downloads; `publishedAt` 2026-08-08 tripped "too-new" | SUS (`too-new`) | **Approved, override** — same false-positive shape; this is `node-postgres`, the de facto standard Postgres driver. |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** all rows above carry the seam's raw verdict for transparency, but only `@thallesp/nestjs-better-auth` reflects a genuine legitimacy signal (unknown download volume on a smaller integration package) rather than the "too-new" heuristic firing on an actively-shipped, high-download-count package's latest patch. The planner should insert one `checkpoint:human-verify` task before the first `npm install` of the auth stack, covering `@thallesp/nestjs-better-auth` specifically (verify the GitHub repo, README, and recent commit activity look legitimate) rather than one per flagged package.

*Note on the "too-new" heuristic:* seven of nine SUS verdicts above share the same shape — a long-established, extremely high-download package whose *latest version* happens to have been published within the lookback window this check uses. This is a known limitation of publish-recency as a legitimacy signal for actively-maintained packages (which ship patches frequently) versus its intended target (freshly-registered, low-history packages used in typosquatting/slopsquatting). The override reasoning is documented per-row above rather than asserted globally.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────────────────┐
                     │      Client (Expo Router, one route tree, one codebase)   │
                     │                                                            │
   Cold start ──────▶│  Root layout mounts                                       │
                     │       │                                                    │
                     │       ▼                                                    │
                     │  ┌─────────────────────────┐   native: SecureStore.getItem │
                     │  │ authClient.useSession()  │◀──(sync)──────────────────┐  │
                     │  │  (Better Auth Expo/web   │                            │  │
                     │  │   client, isWeb-branched)│   web: browser cookie jar  │  │
                     │  └───────────┬──────────────┘   (no local cache read)   │  │
                     │              │ renders immediately with cached/no session│  │
                     │              ▼                                          │  │
                     │  ┌─────────────────────────┐                            │  │
                     │  │ Expo Router scaffold:    │   .web.tsx / .native.tsx   │  │
                     │  │ native tabs (mobile) or  │   file resolution picks    │  │
                     │  │ expo-router/ui tabs (web)│   the platform branch      │  │
                     │  └───────────┬──────────────┘                            │  │
                     │              │ background, non-blocking                  │  │
                     │              ▼                                          │  │
                     │  ┌─────────────────────────┐   POST /v1/auth/get-session │  │
                     │  │ Background refresh call  │────────────────────────────┼──┼─▶
                     │  └───────────┬──────────────┘                            │  │
                     │              │ result classified:                        │  │
                     │      ┌───────┴────────┐                                  │  │
                     │      ▼                ▼                                  │  │
                     │ transport-failure   401/403 + revoked reason              │  │
                     │ (timeout/DNS/5xx)   ──▶ ONLY this path signs out          │  │
                     │ ──▶ no-op, session                                        │  │
                     │     stays cached                                         │  │
                     └─────────────────────────────────────────────────────────┘
                                                    │ HTTPS, versioned (Accept/URI)
                     ┌──────────────────────────────▼─────────────────────────────┐
                     │                        NestJS API                           │
                     │  enableVersioning() ──▶ routes to matching @Controller       │
                     │  version, or rejects below floor (min-supported-version)    │
                     │       │                                                     │
                     │       ▼                                                     │
                     │  AuthModule (Better Auth + @thallesp/nestjs-better-auth)     │
                     │   - sign-up / sign-in / sign-out / request-password-reset    │
                     │   - session validation (expiresIn / updateAge / no forced    │
                     │     expiry-driven logout — only explicit revoke)             │
                     │       │                              │                      │
                     │       ▼                              ▼                      │
                     │   Postgres (users, sessions)    Mailer port                  │
                     │                                   │         │                │
                     │                          dev: SMTP→Mailpit  prod: SMTP→real   │
                     │                                             provider (env var)│
                     └──────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
.
├── apps/
│   ├── mobile/                  # Expo Router app — iOS, Android, and Web from one tree
│   │   ├── app/                 # file-based routes (Expo Router)
│   │   │   ├── (auth)/          # sign-in, sign-up, forgot-password (unauthenticated group)
│   │   │   ├── (tabs)/          # Home, Programs, Workout, History, Profile (D-09 scaffold)
│   │   │   │   ├── _layout.tsx  # picks NativeTabs (native) vs expo-router/ui Tabs (web) — see Code Examples
│   │   │   │   ├── _layout.web.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   └── ...
│   │   │   └── _layout.tsx      # root layout: mounts authClient session read
│   │   ├── lib/
│   │   │   ├── auth-client.ts   # createAuthClient + expoClient(...) — platform-branched storage
│   │   │   └── theme.ts         # NativeWind colorScheme + AsyncStorage persistence
│   │   └── app.json              # scheme, New Architecture (implicit/mandatory on SDK 57)
│   └── api/                      # NestJS
│       ├── src/
│       │   ├── main.ts           # app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
│       │   ├── auth/             # AuthModule wrapping @thallesp/nestjs-better-auth
│       │   ├── mailer/           # MailerPort interface + SmtpAdapter (Mailpit dev / provider prod)
│       │   └── common/           # version-floor guard, shared decorators
│       └── drizzle/               # schema + migrations
├── packages/
│   ├── api-contracts/            # OPTIONAL Phase-1 stub — shared request/response TS types (see Monorepo section)
│   └── progression-engine/       # EMPTY placeholder package only — do not implement logic in Phase 1
├── docker-compose.dev.yml        # Postgres + Mailpit
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Pattern 1: Platform-branched session storage, one call site

**What:** `authClient.useSession()` is the single call site every screen uses; the *storage mechanism* underneath it is platform-branched by the library itself, not by application code.
**When to use:** Any screen/component that needs to know "is there a signed-in user" — this is D-02's "render authenticated UI immediately" requirement.
**Example:**
```ts
// Source: Context7 /better-auth/better-auth — packages/expo/README.md + docs/content/docs/integrations/expo.mdx
// apps/mobile/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  plugins: [
    expoClient({
      scheme: "fitness",        // must match app.json's "scheme"
      storagePrefix: "fitness",
      storage: SecureStore,      // no-op on web — see Pitfall below, do not remove this line for a web build
    }),
  ],
});
```
```tsx
// apps/mobile/app/(tabs)/_layout.tsx — same call on every platform
import { authClient } from "@/lib/auth-client";

export default function TabsLayout() {
  const { data: session } = authClient.useSession(); // cached value on native cold start; undefined-then-fetched on web
  // ... render NativeTabs or redirect to (auth) group
}
```

### Pattern 2: Native tabs + web deep-linkable URLs from one route tree (D-09, success criterion 3)

**What:** Expo Router resolves `.native.tsx` / `.web.tsx` (or platform-select) layout files to produce OS-native tab chrome on iOS/Android and a real, URL-addressable tab bar on web — same route names, same `<TabSlot />`/`<TabTrigger>` primitives underneath.
**When to use:** The D-09 tab scaffold (Home, Programs, Workout, History, Profile) — this is the canonical pattern, not a workaround.
**Example:**
```tsx
// Source: Context7 /expo/expo — docs/pages/router/basics/navigation-layouts.mdx
// apps/mobile/app/(tabs)/_layout.tsx (native)
import { NativeTabs } from 'expo-router/native-tabs';

export default function AppTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="programs">
        <NativeTabs.Trigger.Label>Programs</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Workout, History, Profile follow the same pattern */}
    </NativeTabs>
  );
}
```
```tsx
// apps/mobile/app/(tabs)/_layout.web.tsx (web — same route names, real URLs)
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';

export default function WebTabsLayout() {
  return (
    <Tabs>
      <TabSlot />
      <TabList>
        <TabTrigger name="index" href="/">Home</TabTrigger>
        <TabTrigger name="programs" href="/programs">Programs</TabTrigger>
        {/* Workout, History, Profile follow the same pattern */}
      </TabList>
    </Tabs>
  );
}
```

### Pattern 3: NestJS URI versioning with a minimum-supported-version floor (success criterion 4)

**What:** `VersioningType.URI` puts the version in the path (`/v1/...`); a small guard rejects requests from a client below the configured floor with a distinct error the client can recognize and turn into a force-update prompt.
**When to use:** Every controller from the first commit — `defaultVersion: '1'` so nothing is accidentally unversioned.
**Example:**
```ts
// Source: Context7 /nestjs/docs.nestjs.com — content/techniques/versioning.md (URI + defaultVersion confirmed)
// apps/api/src/main.ts
import { VersioningType } from '@nestjs/common';

app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```
The "too old, force update" policy (recommended: **hard block with a distinct error code**, not silent best-effort serving) is not a NestJS primitive — implement it as an app-level guard reading a client-sent header (e.g. `X-Client-Version`) against a configured floor, returning a distinguishable 4xx (e.g. `426 Upgrade Required`) the mobile client maps to a force-update screen. This is deliberately **separate** from `VersioningType` itself, which only routes to the matching controller version — it does not know or care whether that version is still supported. `VERSION_NEUTRAL` [CITED: NestJS docs] is the right marker for endpoints (like the version-check endpoint itself) that must always exist regardless of client version.

### Pattern 4: Password reset via `redirectTo`, no deep link (D-07)

**What:** Better Auth's `requestPasswordReset({ email, redirectTo })` accepts a plain HTTPS URL; the emailed link always opens a browser, never a custom scheme.
**Example:**
```ts
// Source: Context7 /better-auth/better-auth — docs/content/docs/authentication/email-password.mdx
await authClient.requestPasswordReset({
  email,
  redirectTo: "https://app.fitness.example.com/reset-password", // web route, per D-07 — never a myapp:// scheme
});
```
Server-side, `sendResetPassword` is the mailer-port entry point (D-08):
```ts
// Source: Context7 /better-auth/better-auth — docs/content/docs/authentication/email-password.mdx
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }) => {
      await mailerPort.send({ to: user.email, subject: "Reset your password", url });
    },
  },
});
```

### Anti-Patterns to Avoid

- **Assuming `SecureStore` "just works" on web:** it doesn't — `isAvailableAsync()` returns `false` and calling e.g. `deleteItemAsync` throws `"deleteValueWithKeyAsync is not a function"` [VERIFIED: Context7 `/expo/expo` — `src/SecureStore.ts`]. Better Auth's own Expo plugin already guards this (`if (isWeb) return`) — do not add a second, redundant `Platform.OS === 'web'` check around `authClient` calls; do add one anywhere else in the app that touches `expo-secure-store` directly (see Pitfall below).
- **Building a custom version-check endpoint before checking `VersioningType.URI` + a guard covers it:** the minimum-supported-client-version behavior is a ~20-line guard, not a new module.
- **Treating `expiresIn`/`updateAge` as "the" mechanism for D-01's "indefinite" honoring:** they are not — they control when Better Auth's *server* considers a session dead. D-01 is really "the client never treats an unreachable refresh as equivalent to a server-confirmed expiry," which is client-side branching logic (Pattern in Common Pitfalls below), not a session-config value alone. Still set `expiresIn` generously (e.g., weeks-to-months) so the *server* doesn't independently expire a session the client is still happily caching.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session token storage + caching on native | A custom `SecureStore` read/write wrapper with expiry logic | `@better-auth/expo`'s `expoClient({ storage: SecureStore })` | Already implements the synchronous cache-read-on-launch pattern D-02 asks for [VERIFIED: Context7 `/better-auth/better-auth` `packages/expo/src/client.ts` — `getActions` reads `storage.getItem(localCacheName)` unawaited on native]. |
| Password hashing, reset-token generation/expiry, session revocation | Custom crypto + a `password_reset_tokens` table | Better Auth's built-in `emailAndPassword` + `requestPasswordReset`/`resetPassword` endpoints | Single-use token generation, expiry (`resetPasswordTokenExpiresIn`, default 1 hour), and hashing are already implemented and tested upstream [VERIFIED: Context7 `/better-auth/better-auth` — `packages/better-auth/src/api/routes/password.ts`]. |
| API version routing | Manual `req.path.startsWith('/v1')` branching in every controller | NestJS `enableVersioning({ type: VersioningType.URI })` | Framework-level, works with Swagger's `ignoreGlobalPrefix`, supports `VERSION_NEUTRAL` for endpoints that must never be gated. |
| Cross-platform tab navigation with real web URLs | A hand-rolled `Platform.select` router wrapping React Navigation directly | `expo-router/native-tabs` (native) + `expo-router/ui` (web), both file-resolved from the same route names | This is the officially documented pattern for exactly this requirement (success criterion 3), not an improvisation. |
| Dark/light theme persistence | A custom `Context` + manual `AsyncStorage` read/write on every mount | NativeWind's `useColorScheme()` (`colorScheme`/`setColorScheme`/`toggleColorScheme`) + `AsyncStorage` only for the persistence write/read at boot | NativeWind already owns the runtime color-scheme state and Tailwind `dark:` variant application; only the "remember it across restarts" piece is left to the app, by NativeWind's own documented design. |

**Key insight:** every "don't hand-roll" item in this phase is not a generic library recommendation — each one is a specific method/endpoint this research verified exists and does the exact thing D-01 through D-09 ask for. The risk in this phase isn't picking the wrong library (STACK.md already did that); it's re-implementing something Better Auth's Expo plugin already ships because the synchronous-native-cache/no-op-on-web split wasn't visible without reading the plugin's actual client source.

## Common Pitfalls

### Pitfall 1: `expoClient`'s session cache is a native-only code path — web needs separate reasoning

**What goes wrong:** A developer assumes `authClient.useSession()` behaves identically on native and web because it's the same function call, and builds D-02's "render immediately from cache" logic assuming a cache read always happens. On web, `getActions` skips the cache-restore step entirely (`if (!isWeb && !opts?.disableCache && sessionAtom)`) [VERIFIED: Context7 `/better-auth/better-auth` — `packages/expo/src/client.ts`], and `onSuccess` returns immediately on web without touching `storage` at all — session state on web is carried by the browser's own cookie jar, sent automatically on requests, not read out of a local cache by application code.

**Why it happens:** The Expo plugin's naming (`expoClient`) and the shared `authClient.useSession()` call site both suggest one unified code path; the platform branch is buried inside the plugin's internals, not documented as a top-level caveat.

**How to avoid:** Treat "cold start renders immediately from a synchronous local read" as a **native-only guarantee**. On web, the equivalent of D-02 is simpler by construction — the browser sends the session cookie with the very first request, so there is no separate "read cache, then verify" step to build; the risk on web is instead a flash-of-unauthenticated-content while the first `get-session` call is in flight, which is a UI loading-state concern, not a storage concern. Do not write `Platform.OS === 'web'` branches trying to force a `SecureStore`-style cache path on web — it's structurally unnecessary there.

**Warning signs:** Test plans that only cover native cold-start; a `SecureStore` read added on the web build path that never actually returns data.

### Pitfall 2: `disableSessionRefresh` and `expiresIn` are not the same knob as D-01

**What goes wrong:** Setting `session.disableSessionRefresh: true` or a very large `session.expiresIn` on the Better Auth server config feels like it "implements" D-01, but these control *server-side* session lifetime accounting, not what the *client* does when a refresh request can't reach the server at all (airplane mode). A session can be configured to never expire server-side and the app can still incorrectly sign the user out if the client code treats "refresh request failed" as "refresh request rejected."

**How to avoid:** D-01/D-03 must be implemented as an explicit branch in the client's HTTP layer: a completed response with `401`/`403` and a revoked-session reason is the *only* trigger for clearing the cached session; anything else (thrown fetch error, timeout, DNS failure, 5xx) is caught and treated as "offline," leaving the cached session untouched. This is application code sitting on top of `authClient`, not a Better Auth config option — server config (`expiresIn`, `updateAge`) should still be set generously so the server doesn't independently and prematurely invalidate a session the client wants to keep honoring, but it doesn't do the client-side branching for you.

**Warning signs:** Any `catch` block around a session-refresh call that calls `signOut()` unconditionally.

### Pitfall 3: Unistyles-class styling libraries silently drag in a dev-client requirement

**What goes wrong:** Picking a styling library without checking Expo Go compatibility means discovering, mid-Phase-1, that every `npx expo start` now requires a custom dev-client build — turning fast native-tabs iteration into an EAS-build-and-wait loop for a concern (styling) that has nothing to do with why a dev client would otherwise be needed.
**How to avoid:** Confirmed in this research: `expo-secure-store` and `@better-auth/expo` are both Expo-Go-safe for Phase 1's usage, and PowerSync's native SQLite module (the actual dev-client trigger) is Phase 2. Choosing NativeWind (no native code) keeps the entire phase inside Expo Go; choosing Unistyles would force a dev client one phase earlier than the architecture otherwise requires.
**Warning signs:** `npx expo start` in Expo Go throwing "native module not found" the moment a styling library's first component renders.

## Code Examples

### Better Auth server bootstrap with the Expo plugin

```ts
// Source: Context7 /better-auth/better-auth — docs/content/docs/integrations/expo.mdx
import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";

export const auth = betterAuth({
  baseURL: process.env.API_BASE_URL,
  plugins: [expo()],
  emailAndPassword: { enabled: true },
  trustedOrigins: ["fitness://"], // app.json "scheme": "fitness"
  session: {
    expiresIn: 60 * 60 * 24 * 180, // 180 days — generous floor so the server never independently expires a cached session D-01 wants to keep honoring
    updateAge: 60 * 60 * 24,       // slide forward daily on successful use
  },
});
```

### NestJS versioning + minimum-client-version guard sketch

```ts
// Source: Context7 /nestjs/docs.nestjs.com — content/techniques/versioning.md (enableVersioning, VERSION_NEUTRAL confirmed)
import { VersioningType, VERSION_NEUTRAL, Controller, Get } from '@nestjs/common';

app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  @Get('health')
  check() { return { ok: true }; } // always reachable, regardless of client version
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Bare React Native for "New Architecture control" | Expo SDK 57 — New Architecture mandatory and cannot be disabled either way [CITED: Context7 `/expo/expo` — `docs/pages/guides/new-architecture.mdx`, cross-checked WebSearch] | SDK 55+ | Already reflected in STACK.md; no action needed, restated here only because it's load-bearing for the styling library's native-module risk assessment above. |
| Metro requiring manual symlink config for pnpm monorepos | "Metro's resolver works with pnpm symlinks out of the box on Expo SDK 53+" [CITED: WebSearch, cross-checked against `docs.expo.dev/guides/monorepos`] | SDK 53+ | On SDK 57, `expo/metro-config`'s built-in monorepo support should need **no manual `unstable_enableSymlinks` flag** — verify this holds during Wave 0 rather than pre-emptively adding legacy config found in older tutorials. |

**Deprecated/outdated:** MailHog is effectively superseded by Mailpit for new setups — Mailpit is its modern, actively maintained, Go-based replacement with a REST API and WebSocket live updates [CITED: WebSearch, multiple 2026 sources]; D-08 names both as acceptable, but default to Mailpit for a new project.

## Local Dev Environment and CI

**docker-compose (Postgres + Mailpit):**
```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: fitness
    ports: ["5432:5432"]
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI
```
[CITED: WebSearch, multiple 2026 sources — `axllent/mailpit:latest`, ports 1025/8025 confirmed across independent write-ups]. The SMTP-adapter's dev config points at `127.0.0.1:1025`, unauthenticated.

**Local machine note (this environment specifically):** Docker is not installed on this development machine; Postgres 18 is already running locally via Homebrew (`postgresql@18`, confirmed accepting connections on 5432) [VERIFIED: `pg_isready` + `brew services list`]. `docker-compose.dev.yml` should still be authored as the reproducible, onboarding-safe baseline (D-08's "cloning the repo must never require an external email account" implies a from-scratch-clone path, not this machine's pre-existing state) — but the plan should not assume `docker compose up` is exercised in this environment without first confirming Docker Desktop or an alternative (Colima, Orbstack) is installed.

**EAS dev-client timing:** Not needed in Phase 1. `expo-secure-store` and `@better-auth/expo` both run inside Expo Go (confirmed above); NativeWind has no native module. The first thing in this project's roadmap that structurally requires a dev client is PowerSync's native SQLite binding in Phase 2 [per SUMMARY.md — "EAS dev-client build" already anticipated there]. Recommendation: stay on Expo Go for all of Phase 1, and treat "first EAS dev-client build" as a Phase 2 setup task, not a Phase 1 one — this directly serves the tracer-first "thinnest real slice" bias this phase is planned under.

**CI on push (recommended minimum for this phase):** typecheck + lint for both `apps/mobile` and `apps/api` via `turbo run typecheck lint`; a NestJS e2e job running `supertest` against the auth endpoints (sign-up → sign-in → get-session → sign-out, plus the version-floor-guard 426 case) against a CI-provisioned Postgres service container. Do not add EAS Build to CI in this phase — no dev-client exists yet to build.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `426 Upgrade Required` is the recommended status code for the below-minimum-client-version rejection | Architecture Patterns, Pattern 3 | Low — this is an implementation-detail convention (any distinct 4xx the client can pattern-match works); not a NestJS or Better Auth requirement, just a reasoned recommendation with no official source cited for this specific code choice. |
| A2 | `postgres:17` in the docker-compose example | Local Dev Environment | Low — STACK.md says "15+ (16/17 fine)"; 17 chosen arbitrarily within that already-approved range, not independently verified this session. |
| A3 | Hard-block (not "serve anyway") is the right policy for a too-old client | Architecture Patterns, Pattern 3 | Medium — CONTEXT.md explicitly left this to research/planning discretion; this recommendation follows ARCHITECTURE.md §3's "gate behind a minimum-supported-client-version check on the sync endpoints and force an update prompt" framing, but the planner should treat this as a proposal to confirm, not a locked fact, since it affects real UX (an old app-store build refusing to work at all). |
| A4 | `packages/progression-engine` and an `api-contracts` package should be **created as empty/near-empty stub packages** in Phase 1's monorepo layout, not deferred entirely to Phase 8 | Recommended Project Structure | Low — ARCHITECTURE.md §4 already locks the *package's eventual existence*; only its Phase-1 materialization timing is discretionary, and creating an empty stub now vs. later is a low-cost, easily-reversible choice either way. |

## Open Questions

1. **Exact minimum-supported-client-version enforcement mechanism (guard vs. interceptor vs. custom versioning extractor)**
   - What we know: NestJS's `VersioningType.CUSTOM` extractor and `VERSION_NEUTRAL` primitives exist and are documented; a floor-check is not itself a built-in NestJS feature.
   - What's unclear: Whether to implement the floor-check as a global `NestMiddleware`, a `CanActivate` guard applied via `APP_GUARD`, or folded into the custom versioning extractor itself (rejecting below-floor requests by returning no matching version, which NestJS turns into a 404 rather than a distinguishable 426).
   - Recommendation: Plan should specify a guard (not the extractor) so the response can be a distinguishable, documented status code (426) rather than a generic 404 the client can't reliably distinguish from "route doesn't exist."

2. **Whether `@react-native-async-storage/async-storage`'s web backing (localStorage) needs a Server-Side-Rendering-safety guard given Expo Router web is CSR, not SSR, in this phase**
   - What we know: Expo Router's web output in this phase is a static/CSR build (no Node SSR server is part of this phase's scope).
   - What's unclear: Whether any part of the build pipeline (e.g. static export) executes component code in a non-browser context where `localStorage` is undefined.
   - Recommendation: Low risk given CSR-only scope; worth a smoke check during Wave 0 rather than a dedicated research pass.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Both apps | ✓ | v22.14.0 | — (NestJS 11 requires `>=20`, satisfied) |
| pnpm | Workspace/package manager | ✓ | 11.9.0 | — |
| Docker | docker-compose (Postgres + Mailpit) | ✗ | — | Postgres already running locally via Homebrew (`postgresql@18`, confirmed listening on 5432); Mailpit alternative: run the `mailpit` binary directly (Homebrew formula exists) instead of via Docker if Docker Desktop/Colima isn't installed before Phase 1 execution. |
| PostgreSQL | System of record | ✓ (native, not containerized) | 18.4 (Homebrew) | — |
| EAS CLI | Only needed once a dev-client build is required (not this phase) | ✓ | 16.26.0 | — (confirms the tooling is ready for Phase 2, no action needed now) |
| Expo CLI | `npx expo ...` | not globally installed | — | Standard — always invoked via `npx expo`, no global install expected or needed. |

**Missing dependencies with no fallback:** none — every gap above has a working local alternative.
**Missing dependencies with fallback:** Docker (use locally-installed Postgres + a native Mailpit binary, or install Docker Desktop/Colima before Phase 1 execution if the reproducible docker-compose path is preferred for onboarding-parity reasons).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (bundled with Expo/RN by default; NestJS 11 defaults to Jest) [per STACK.md] |
| Config file | none yet — see Wave 0 |
| Quick run command | `turbo run test -- --testPathPattern=<changed>` (client: `jest`; API: `jest` via NestJS's default config) |
| Full suite command | `turbo run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-05 | Sign-up → sign-in → session round-trip | integration (supertest against NestJS + test Postgres) | `pnpm --filter api test:e2e -- auth.e2e-spec.ts` | ❌ Wave 0 |
| PLAT-05 | Password reset request → Mailpit capture → reset completes on web route | integration/manual | `pnpm --filter api test:e2e -- password-reset.e2e-spec.ts` (automates request+token consumption) + one manual UAT pass opening the Mailpit web UI at `localhost:8025` | ❌ Wave 0 (automated part); manual part has no file |
| PLAT-06 | Cached session honored after simulated refresh failure (transport error, not 401) | unit (client API-layer branch) | `pnpm --filter mobile test -- session-refresh.test.ts` | ❌ Wave 0 |
| PLAT-06 | Explicit sign-out and a server-confirmed 401/403 revoke both clear the session; nothing else does | unit | `pnpm --filter mobile test -- session-refresh.test.ts` | ❌ Wave 0 |
| PLAT-01 | Same authenticated home screen reachable on native tabs and web tabs from one route tree | manual UAT (three platforms) — no practical automated cross-platform-render assertion in this phase | — | manual only, documented in VERIFICATION.md |
| PLAT-09 | Toggling the theme control changes appearance and persists across restart | unit (AsyncStorage read/write) + manual visual check | `pnpm --filter mobile test -- theme.test.ts` | ❌ Wave 0 |
| Success criterion 4 (API versioning) | Request below the configured minimum client version receives 426, not silent success or generic 404 | integration | `pnpm --filter api test:e2e -- version-guard.e2e-spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `jest` run for the changed package (`turbo run test --filter=...`)
- **Per wave merge:** `turbo run test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the three-platform manual UAT pass for PLAT-01/PLAT-09 (no automated substitute exists for "renders the same authenticated screen on iOS, Android, and desktop browser").

### Wave 0 Gaps
- [ ] `apps/api/test/jest-e2e.json` + `supertest` install — no NestJS e2e test config exists yet
- [ ] `apps/api/test/auth.e2e-spec.ts`, `password-reset.e2e-spec.ts`, `version-guard.e2e-spec.ts` — covers PLAT-05, D-08, success criterion 4
- [ ] `apps/mobile/lib/__tests__/session-refresh.test.ts`, `theme.test.ts` — covers PLAT-06, PLAT-09
- [ ] CI Postgres service container config for the e2e job (GitHub Actions `services:` block or equivalent)
- [ ] Framework install: `pnpm add -D jest supertest @nestjs/testing` (API side; client-side Jest ships with Expo's default template)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Better Auth's built-in password hashing + credential storage (`emailAndPassword`) — do not hand-roll hashing. |
| V3 Session Management | Yes | Better Auth session table (`storeSessionInDatabase`), server-side revocation path, `expiresIn`/`updateAge` config — session tokens are stateful/revocable, not purely stateless JWT with no revoke path (directly addresses PITFALLS.md's "Security Mistakes" row: "Long-lived refresh tokens with no revocation path"). |
| V4 Access Control | Yes (minimal in Phase 1) | Every authenticated NestJS route must resolve the acting user from the validated session, not a client-supplied user ID — no per-resource ownership checks exist yet since there's no owned domain data this phase, but the pattern (session → user, never trust a body/param user id) should be established now for every later phase to inherit. |
| V5 Input Validation | Yes | NestJS `ValidationPipe` + `class-validator`/`zod` on sign-up/sign-in/reset-password DTOs (email format, password length — Better Auth exposes `minPasswordLength`/`maxPasswordLength` server-side already). |
| V6 Cryptography | Yes, delegated | Never hand-roll password hashing or token generation — Better Auth owns this entirely; the only project-level crypto surface is TLS termination (deployment concern, not Phase 1 code). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session-fixation / stolen long-lived cached session (a genuine tension with D-01's "honor indefinitely") | Spoofing / Elevation of Privilege | Server-side session table with a real revocation path (not pure stateless JWT) means a compromised device's session can be revoked from the server even though the client is designed to never self-expire it — this is exactly why D-01 says "only an explicit user sign-out, **or a positive server revocation response**, ends a session": the revocation escape hatch must actually exist and be reachable (e.g., a future "sign out other devices" affordance), even if Phase 1 doesn't build UI for it yet. |
| CSRF against the web client's cookie-based session | Tampering | Better Auth's web client relies on the browser's cookie jar; verify `sameSite`/CSRF protections are part of the default Better Auth cookie config rather than assuming cookie-based auth is automatically CSRF-safe — flag as a plan-time verification item rather than an assumed-safe default. |
| Password-reset token replay / long-lived reset link | Tampering / Information Disclosure | Better Auth's `resetPasswordTokenExpiresIn` (default 1 hour) + single-use `consumeVerificationValue` [VERIFIED: Context7 `/better-auth/better-auth` — `packages/better-auth/src/api/routes/password.ts`] already enforce this; do not extend the default expiry without a reason. |
| IDOR via a client-supplied user identifier instead of session-derived identity | Elevation of Privilege | Every authenticated endpoint resolves `userId` from the validated Better Auth session context, never from a request body/param — establish this convention in Phase 1's `AuthModule`/guard even though there's no owned domain resource yet to protect. |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`), queried directly 2026-08-11 — `better-auth`, `@better-auth/expo`, `@thallesp/nestjs-better-auth`, `@mguay/nestjs-better-auth`, `nativewind`, `react-native-unistyles`, `react-native-nitro-modules`, `tamagui`/`@tamagui/core`, `turbo`, `@nestjs/platform-express` (all patch versions, to confirm the `express` peer version), `@nestjs/core` (engines field), `react-native@0.86.0` (peer deps), `expo` (peer deps), `react-native-reanimated`, `expo-secure-store`, `expo-router`, `nodemailer`, `@react-native-async-storage/async-storage`
- Context7 `/better-auth/better-auth` — Expo integration docs (`docs/content/docs/integrations/expo.mdx`, `packages/expo/README.md`), session-management docs, `packages/expo/src/client.ts` source (the `isWeb` branching), password-reset route source (`packages/better-auth/src/api/routes/password.ts`)
- Context7 `/nestjs/docs.nestjs.com` — `content/techniques/versioning.md` (all four versioning types, `VERSION_NEUTRAL`, `defaultVersion`), `content/faq/global-prefix.md`, `content/openapi/*` (Swagger + versioning interaction)
- Context7 `/expo/expo` — navigation-layouts.mdx, native-tabs.mdx (native/web tab split), `src/SecureStore.ts` (web unavailability behavior), development-builds docs (dev-client requirement conditions)
- Context7 `/vercel/turborepo` — monorepo `apps/`/`packages/` structure, pnpm workspace declaration
- Local environment probes (`node --version`, `pnpm --version`, `pg_isready`, `brew services list`, `command -v docker/eas`) — this machine's actual toolchain state, 2026-08-11

### Secondary (MEDIUM confidence)
- WebSearch, cross-checked against official sources where the claim was load-bearing: NativeWind/Expo SDK 57/New-Architecture compatibility (cross-checked against `nativewind.dev`, `github.com/nativewind/nativewind`, `expo.dev/changelog/sdk-57`), Unistyles 3.x Expo-Go incompatibility (cross-checked against `unistyl.es` and the library's own GitHub discussions), Tamagui compiler/performance claims (`tamagui.dev`), pnpm+Metro symlink history (`docs.expo.dev/guides/monorepos`), Mailpit docker-compose conventions (multiple independent 2026 write-ups agreeing on image name and ports)

### Tertiary (LOW confidence)
- None used as load-bearing for a prescriptive recommendation in this document; all WebSearch findings above were cross-checked against at least one official-source page before being tagged `[CITED]`.

## Metadata

**Confidence breakdown:**
- Standard stack (package names/versions): HIGH — every package name/version verified live against npm registry this session; the one previously-uncertain name (`@better-auth/expo`) is now confirmed via official docs, not inferred.
- Architecture (session-cache mechanics, versioning patterns, tab-split pattern): HIGH — all drawn from official Context7-sourced documentation and, for the session-cache claim specifically, the plugin's own source code.
- Styling evaluation: MEDIUM-HIGH — compatibility facts (Expo Go support, peer deps, New Architecture status) are verified; which library is "best" for this specific solo-dev bootstrap phase is a reasoned recommendation, not a single objectively-correct fact.
- Pitfalls: HIGH for the two Better-Auth-specific pitfalls (drawn directly from plugin source), MEDIUM for the general "styling library drags in a dev client" pitfall (drawn from WebSearch, cross-checked).

**Research date:** 2026-08-11
**Valid until:** ~30 days for the NestJS/monorepo/architecture findings (stable APIs); ~14 days for the exact npm version numbers and the "too-new" package-legitimacy false positives, since patch releases in this fast-moving stack (Expo, Better Auth) are frequent enough that re-verification before actual install is still warranted per the Package Legitimacy Audit's `checkpoint:human-verify` recommendation.
