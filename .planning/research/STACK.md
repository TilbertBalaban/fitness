# Stack Research

**Domain:** Cross-platform local-first strength-training / workout-logging app (React Native + React Native Web client, NestJS backend, Postgres, real accounts + multi-device sync)
**Researched:** 2026-08-10
**Confidence:** HIGH (versions verified against npm registry and official docs on 2026-08-10; local-first sync recommendation is MEDIUM-HIGH — the category itself is still evolving fast)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Expo (SDK) | SDK 57 (React Native 0.86, verified on npm 2026-08-10) | RN + Web unification, build/OTA tooling | Expo is no longer "the easy but limited option" — since SDK 55 the New Architecture (Fabric/JSI/TurboModules) is mandatory and can't be disabled, so bare-RN's traditional advantage (New Arch control) has evaporated. Expo gives you EAS Build, OTA updates, Expo Router, and a single `app.json` target for iOS/Android/Web with none of the native-project boilerplate bare RN needs. |
| Expo Router | Bundled with Expo SDK 57 (v4+) | File-based navigation, shared mobile+web routing with real URLs | Purpose-built to give web real, deep-linkable URLs from the same route tree that drives native screens — the single biggest reason to pick it over bare React Navigation for a RN+Web app. It is built **on top of** React Navigation, so you are not giving up React Navigation, just getting a router layer over it. |
| PowerSync | `@powersync/react-native` 2.0.2, `@powersync/web` 2.1.1 (npm, 2026-08-05) | Local-first sync engine, Postgres ↔ on-device SQLite | See dedicated section below — this is the most important decision in the stack. |
| NestJS | `@nestjs/core` 11.1.29 (npm, 2026-08-10) | Backend API, business logic, write-path for sync | Already decided by the user. NestJS 12 is in active development (targeted ~Q3 2026, ESM-only, Vitest/oxlint/Rspack default toolchain) but is **not yet released** — build on v11, it's the current stable major and the v11→v12 jump is mostly tooling, not API-breaking for a REST/Postgres app. |
| PostgreSQL | 15+ (16/17 fine) | System of record | Required by PowerSync (needs Postgres 11+, `wal_level = logical`) and by the user's chosen stack. |
| Drizzle ORM | `drizzle-orm` 0.45.x | Postgres access layer inside NestJS | See ORM section — recommended over Prisma for this specific project. |
| Better Auth | `better-auth` 1.6.26 + `@thallesp/nestjs-better-auth` (or `@mguay/nestjs-better-auth`) + official Expo plugin | Auth across RN + Web, offline-tolerant sessions | See Auth section — self-hosted, framework-agnostic, has a first-class Expo/RN plugin, and avoids the Clerk offline-UX problems found in research. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | 5.101.x | Server-state cache for **non-local-first** reads (e.g. profile, non-synced admin data) | Not for workout data — PowerSync already owns that. Use for anything that legitimately lives only on the server (e.g. account settings, exercise-library admin edits) and doesn't need offline writes. |
| `zustand` | 5.0.14 | Ephemeral UI/client state (active rest timer, in-progress set draft, screen state) | Anything that is not persisted data. Do not use it to cache synced records — PowerSync's live queries already give you reactive, persisted state. |
| `@shopify/react-native-skia` + `victory-native` (XL) | Skia 2.11.x, victory-native 41.26.x | Volume/PR charts on **native** (iOS/Android) | GPU-accelerated via Skia, 60fps+, the best-performing RN chart stack in 2026 benchmarks. **Does not officially support web** — needs a separate web renderer (see "Stack Patterns by Variant"). |
| `recharts` (or `visx`) | latest 2.x / latest | Volume/PR charts on **web** | SVG-based, runs natively in `react-native-web`'s DOM output; used as the web-only branch of a small chart abstraction (see below). |
| `expo-sqlite` | 57.0.1 | Underlying SQLite engine PowerSync's RN SDK sits on | PowerSync's React Native SDK uses `expo-sqlite`/OP-SQLite-class JSI bindings under the hood — you generally don't touch it directly once PowerSync is wired in, but it's the dependency that makes offline storage possible on-device. |
| `@op-engineering/op-sqlite` | 17.1.5 | Only if you go the "hand-rolled sync" alternative (not the primary recommendation) | Fastest JSI SQLite for RN if you reject PowerSync/WatermelonDB and build your own sync layer. Not needed if you take the PowerSync recommendation. |
| Maestro | CLI (installed via `curl -Ls "https://get.maestro.mobile.dev" | bash`, not npm) | E2E testing, RN + web-adjacent flows | Black-box, YAML-based, zero native code changes, cross-platform (Android/iOS) — the pragmatic default for a solo developer. |
| Jest / Vitest | Jest ships with Expo/RN by default; NestJS 11 still defaults to Jest (Vitest becomes default in NestJS 12) | Unit tests, both client and server | Keep Jest for the RN client (Expo's default, well-supported). On the NestJS side stay on Jest for now — moving to Vitest is a NestJS-12-era migration, not a v11 one. |
| Turborepo | `turbo` 2.10.9 | Monorepo task orchestration | See Monorepo section. |
| pnpm | 9.x/10.x workspaces | Package manager / workspace linking | Pairs with Turborepo; strict, disk-efficient, the de facto standard for TS monorepos in 2026. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| EAS Build / EAS Update | Native builds + OTA updates for the Expo app | Required once you leave Expo Go (you will, for PowerSync's native SQLite module and any custom native code); use a dev client build. |
| Drizzle Kit | Schema migrations for Postgres | Generates SQL migrations from TS schema; works cleanly with NestJS since Drizzle is just a query builder, not a heavyweight ORM runtime. |
| PowerSync Service (self-hosted, Open Edition) | Sync engine server component | Free, open-source; sits beside NestJS, reads Postgres via logical replication, serves sync buckets to clients. Requires MongoDB internally for its own bucket/operation-history storage — budget for that extra piece of infra (or use PowerSync Cloud to avoid running it yourself). |

## Local-First Data Layer — Decision (the most important call in this stack)

### The candidates, evaluated against this project's actual requirements (RN **and** Web, real accounts, multi-device sync, Postgres + NestJS backend)

| Option | Works on RN | Works on Web | Conflict model | Backend requirement | Maturity/maintenance (2026) |
|---|---|---|---|---|---|
| **PowerSync** | Yes (official `@powersync/react-native`) | Yes (official `@powersync/web`, wa-sqlite/WASM) | Server-authoritative by default (last-write-wins via your API), fully custom conflict resolution supported (timestamp/version-based) | Postgres (11+, logical replication) or MongoDB/MySQL/SQL Server; requires running "PowerSync Service" (self-hosted free Open Edition, or PowerSync Cloud) | Actively developed VC-funded company, frequent releases (SDK updated 2026-08-05), Rust-based sync client now standard, production case studies. Best-documented offline-write path of any option here. |
| WatermelonDB | Yes (mature, years in production at Nozbe) | Yes (LokiJS/IndexedDB adapter) | **None built in** — you hand-roll the sync protocol (pull/push endpoints); typically implemented as LWW | Any backend that can implement the documented Watermelon Sync Protocol — fits naturally in front of NestJS+Postgres | Mature and battle-tested, but **flagged risk**: untested on React Native's New Architecture (mandatory as of Expo SDK 55+), and peer deps don't yet include React 19. Real maintenance-drag risk for a greenfield 2026 project on the latest Expo SDK. |
| ElectricSQL | **No** — PGlite (its client embedded-Postgres engine) does not run in React Native; open issue, unresolved | Yes, and excellent there | Active-active replication (CRDT-ish shape) | Postgres only, requires their sync service | GA/1.0 since March 2025, excellent for **web-only** local-first Postgres apps, but the RN gap is disqualifying for this project as-is. |
| RxDB | Yes (via `react-native-quick-sqlite`/SQLite storage) | Yes (same API surface) | Custom, pull/push replication protocol (REST/GraphQL/custom); optional CRDT plugin | Backend-agnostic — REST/GraphQL/custom pull-push, fits NestJS+Postgres | Mature, actively maintained (17.4.0, July 2026), Apache-2.0 core but **premium plugins (encryption, memory-mapped storage) are commercial-licensed** — check if any of those are load-bearing for your design before committing. |
| Replicache | Yes/Yes historically | — | Custom server reconciliation | Custom | **Archived June 2026, in maintenance-only mode.** Rocicorp is redirecting all new users to Zero. Do not start a new project on Replicache. |
| Zero (Rocicorp) | Web-first; RN story is nascent | Yes | Query-based sync, server-authoritative | Custom `zero-cache` deployment | Rocicorp's actively-developed successor to Replicache, but positioned as "sync for the web" — RN support is not yet a first-class, proven story. Too immature for this project's mobile-first requirement today. |
| TinyBase | Yes | Yes | **Native CRDT** (`MergeableStore`), deterministic merge — the only option here with true CRDT semantics out of the box | Backend-agnostic (WebSocket, BroadcastChannel, or custom medium) — you'd still write your own persistence bridge into Postgres | Small but healthy project (5,000+ GitHub stars, v9.4.0 shipped 2026-08-08, 100% test coverage), official Expo integration guide exists. Lighter-weight than PowerSync/WatermelonDB, less proven at scale, and syncing into Postgres is still DIY. |
| Legend-State (+ sync) | Yes | Yes | Sync plugins (Keel, Supabase, TanStack Query, custom fetch); v2 is stable, **v3 (which bundles the good sync engine) is still in beta** | Backend-agnostic via sync plugins; would need a custom plugin for NestJS+Postgres | v2 stable line hasn't had a release since Aug 2024 (stale); the sync-capable v3 line is beta-only as of mid-2026. Promising but not something to build a solo project's data layer on top of yet. |
| Plain SQLite (expo-sqlite/op-sqlite) + hand-rolled sync | Yes | Partial (op-sqlite claims web support; expo-sqlite has a web shim) | Whatever you build | Whatever you build | Full control, zero framework lock-in, but you are building and maintaining a sync engine, conflict resolution, and a queue from scratch — for a solo developer this is the highest-risk, highest-maintenance-cost path and duplicates what PowerSync/WatermelonDB already solved. |

### Decision

**Primary: PowerSync.**

Reasoning, specific to this project's constraints:

1. **It is the only option in this list with official, actively-maintained SDKs on both React Native and Web that talks directly to Postgres.** ElectricSQL is disqualified by the RN gap; WatermelonDB and RxDB require you to write the sync protocol yourself; TinyBase and Legend-State require you to write the Postgres bridge yourself. PowerSync ships all three pieces (client SDKs, sync service, Postgres connector) as a coherent, documented system.
2. **The write path maps directly onto NestJS.** PowerSync's client SDK queues every local write in a durable `ps_crud` table and calls a developer-defined `uploadData()` function per entry — which is just calling your existing NestJS REST endpoints. NestJS keeps 100% of your business logic and validation on the write path; PowerSync only owns the read-path replication (Postgres → on-device SQLite) and the offline write queue. This is exactly "sits in front of Postgres + NestJS," not a replacement for either.
3. **Conflict resolution is explicit and tunable**, not a black box: default is last-write-wins at your API layer, but you have full control (timestamp/version-based rejection, merge logic) because writes flow through your own NestJS handlers, not a magic merge engine.
4. **It directly targets this exact app category** — offline-first, mobile+web, real accounts, reconnect-and-sync — as its core positioning, and has public production case studies for that shape of app.

**Runner-up: WatermelonDB**, specifically if you want to defer the operational cost of running the PowerSync Service (which requires MongoDB for its own state, or a paid PowerSync Cloud subscription) and are comfortable owning the sync protocol yourself. WatermelonDB is more mature/battle-tested as a local reactive database (years in production at Nozbe) and needs zero extra infrastructure beyond your existing NestJS+Postgres — you write two endpoints (`pullChanges`, `pushChanges`) that speak its documented sync protocol. **The tradeoff:** you own conflict resolution and the sync loop entirely yourself (Watermelon gives you no default), and you take on real, current maintenance risk — as of 2026 it is untested against React Native's New Architecture, which is mandatory from Expo SDK 55 onward, and its `with-observables` peer deps don't yet declare React 19 support. If you pick WatermelonDB, pin Expo to the last SDK you've verified it against and budget time to validate New Architecture compatibility yourself before committing.

**What NOT to use for this project:** Replicache (archived/maintenance-mode — do not start new work on it), ElectricSQL (no RN support today), Legend-State v3 sync (beta-only), Zero (RN support not proven), Auth.js/NextAuth (see Auth section).

## Auth

| Solution | RN + Web | Offline-tolerant sessions | Self-hosted / owns your Postgres | Verdict |
|---|---|---|---|---|
| **Better Auth** | Yes — official Expo plugin (deep-link OAuth, secure storage) + works on web | Session/token cached locally via the Expo plugin's secure storage; you control TTL and offline-allow logic yourself since you own the server | Yes — just needs a Postgres connection string, runs as a NestJS module (`@thallesp/nestjs-better-auth` or `@mguay/nestjs-better-auth`, both requiring `better-auth >= 1.5.0`) | **Recommended.** Framework-agnostic, no vendor lock-in, integrates as a NestJS module, and gives you the low-level control needed to implement "keep working with an expired-but-cached session while offline," which none of the hosted providers hand you for free. |
| Clerk | Yes (`@clerk/clerk-expo` 2.20.0) | Has `ClerkOfflineError` and a documented Expo offline-support guide, but real-world reports describe a **10-15 second black screen** before it falls back to sign-in when the device is offline and Clerk's token refresh can't reach the network | No — hosted, per-MAU pricing | Usable, but the documented offline-UX rough edge is a direct conflict with this project's "hostile gym network" requirement. Would need custom handling around `ClerkOfflineError` to avoid a bad in-gym experience. |
| Supabase Auth | Yes | Reasonable (JWT + refresh token model), but idiomatically expects Supabase-hosted Postgres/RLS | Tied to Supabase's Postgres+RLS model unless you fight the defaults | Skip — pulls you toward Supabase's hosted Postgres and RLS-centric auth model, which fights against "NestJS owns the write path" and a plain self-hosted Postgres. |
| Auth.js / NextAuth | No real RN support | N/A | N/A | **Do not use.** It's a Next.js-first library; RN/Expo callback URLs (non-http schemes) aren't supported, and community reports confirm `INVALID_CALLBACK_URL_ERROR` when pairing it with Expo. |
| Self-rolled JWT in NestJS | Yes (it's just HTTP) | Full control — you decide exactly how long a cached refresh token is honored offline | Yes, no dependency at all | A legitimate fallback if you want zero third-party auth dependency, but Better Auth gives you ~90% of this for less hand-written security-sensitive code (password hashing, token rotation, OAuth flows) at negligible cost. |

**Recommendation: Better Auth**, mounted as a NestJS module against your own Postgres, with its official Expo plugin on the client. This is the only option that combines (a) real, current RN support, (b) self-hosted control over session lifetime so you can explicitly allow expired-but-cached sessions while offline in the gym, and (c) no per-user hosted-auth billing for a solo/personal project.

## Exercise Dataset (Seed Data Source)

| Dataset | Exercise count | License | Images | Muscle taxonomy | Verdict |
|---|---|---|---|---|---|
| **free-exercise-db** (`yuhonas/free-exercise-db`) | 800+ | Repo code is MIT; **each exercise's own source license varies** — the README explicitly warns only exercises with a "relatively free" license were included and that per-exercise license terms must still be honored | Yes — static images per exercise, hosted directly in the repo, raw-GitHub-URL-addressable | `primaryMuscles`/`secondaryMuscles` fields plus a `muscle_groups` map from muscle → group | **Primary seed source.** Closest single dataset to the ~900-exercise target, ships JSON + static images (matches this project's "no video" constraint exactly), and is the most commonly reused open exercise dataset in the ecosystem (multiple forks, e.g. `exercemus/exercises`, build on top of it). |
| **wger** (wger.de exercise database) | 845+ (one source cites a smaller filtered count, ~459, depending on query/language filter) | **CC-BY-SA 4.0** — commercial use allowed, but ShareAlike obligates derivative datasets to carry the same license, which is a real constraint if you want to freely relicense your seeded library later | Available via API, coverage varies per exercise | 16 muscle groups, primary/secondary muscle fields, plus equipment and category metadata; also a live REST API (some endpoints unauthenticated) | **Strong secondary/supplemental source.** Use it to backfill exercises and metadata free-exercise-db is missing, and to cross-validate muscle-group taxonomy — but the ShareAlike clause means anything merged in from wger carries that obligation forward. |
| **ExerciseDB** (`ExerciseDB/exercisedb-api`, and the RapidAPI-hosted `exercisedb`) | 1,500–11,000+ depending on which fork/tier ("ExerciseDB V1" free tier: 1,500 with GIFs; RapidAPI listing: 11,000+) | Murky — described as "open-source" in places but the GitHub repo's own LICENSE file needs to be checked exercise-by-exercise; RapidAPI-gated tiers add API terms-of-service on top | GIFs/animations primarily, not static images — **conflicts with this project's explicit "no video, static images only" constraint** unless you extract single frames | Target body parts + equipment, less rigorously modeled primary/secondary split than free-exercise-db/wger | **Do not use as primary source.** GIF-first content model fights the project's no-video constraint, licensing is the least clear of the three, and exercise count is inflated by low-quality/duplicate entries in the larger forks. Fine as a tertiary cross-reference for exercise *names* only. |

**Recommendation:** Seed the ~900-exercise library from **free-exercise-db as the base** (MIT-licensed repo, JSON + static images, right-sized count), **enriched from wger** for gaps and muscle-group metadata validation (accepting the CC-BY-SA obligation on anything actually copied from wger, and attributing accordingly). Do not build the core library on ExerciseDB/RapidAPI — its GIF-centric format and unclear per-exercise licensing don't fit this project's constraints. Budget real normalization work either way: reconciling exercise naming, muscle taxonomy, and equipment tags across sources is the actual effort, not the download.

## Installation

```bash
# Client (Expo app, RN + Web)
npx create-expo-app@latest --template default
npx expo install expo-router @powersync/react-native @powersync/web
npx expo install better-auth @better-auth/expo   # client-side plugin name may differ; verify against current Better Auth Expo docs
npx expo install @shopify/react-native-skia victory-native
npm install recharts   # web-only chart branch
npm install zustand @tanstack/react-query

# Backend (NestJS)
npm install @nestjs/core @nestjs/common @nestjs/platform-express
npm install drizzle-orm pg
npm install -D drizzle-kit
npm install better-auth @thallesp/nestjs-better-auth

# Monorepo root
npm install -D turbo
```

## Alternatives Considered

| Category | Recommended | Alternative | When Alternative Is Better |
|----------|-------------|-------------|-----------------------------|
| Local-first sync | PowerSync | WatermelonDB | You want zero extra sync-server infra and are willing to hand-roll conflict resolution and validate New-Architecture compatibility yourself. |
| Local-first sync | PowerSync | TinyBase | You want a much lighter dependency with native CRDT merge semantics and are comfortable writing your own Postgres persistence bridge. |
| ORM | Drizzle | Prisma | Your team is newer to SQL and values Prisma's higher-level abstractions/migration UX over raw performance and bundle size; Prisma 7's driver-adapter architecture and smaller runtime narrow the gap versus Drizzle. |
| Auth | Better Auth | Clerk | You want a fully hosted, polished auth product with orgs/SSO out of the box and are willing to accept its documented offline black-screen rough edge (or engineer around `ClerkOfflineError` yourself) and per-MAU billing. |
| Navigation | Expo Router | React Navigation directly | You explicitly don't want file-based routing conventions or don't need URL-addressable web routes — but you'd be giving up the main reason to prefer it for this project. |
| Monorepo | Turborepo + pnpm workspaces | Nx | The project grows into multiple teams/apps and you want generators, dependency-graph-aware affected commands, and official NestJS scaffolding plugins — likely overkill for a solo-developer app initially. |
| Charts (native) | Skia + Victory Native XL | `react-native-chart-kit` / SVG-based RN charts | You need the same chart library to also run on web without a platform split, at the cost of GPU-accelerated performance on native. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Replicache | Archived (June 2026), maintenance-mode only, Rocicorp is actively pushing users to migrate off it | PowerSync (or Zero once its RN story matures) |
| Auth.js / NextAuth for the RN client | No real native-app callback-URL support; documented errors pairing it with Expo | Better Auth |
| ElectricSQL for the mobile client | PGlite (its embedded engine) does not run in React Native today | PowerSync, or ElectricSQL for a **web-only** companion app if you ever build one |
| Victory Native XL as your only chart library across RN + Web | No official web target support | Skia/Victory Native on RN, `recharts` (or similar SVG lib) on web, behind a small shared chart-config abstraction |
| Legend-State v2 as a sync layer | The sync-capable line is v3, which is beta-only; v2's last release was August 2024 | PowerSync/WatermelonDB now; revisit Legend-State v3 once it's stable if you want to swap later |
| WatermelonDB on the latest Expo SDK without verification | Explicitly untested against React Native's New Architecture, which SDK 55+ makes mandatory | Verify compatibility yourself first, or default to PowerSync |
| Bare React Native (no Expo) for this project | New Architecture is now forced on Expo too, so bare RN's traditional "escape hatch" advantage is gone, while you lose EAS Build/Update, Expo Router, and the managed native-module ecosystem | Expo SDK 57 |

## Stack Patterns by Variant

**If you want to minimize infrastructure operations (solo developer, no ops team):**
- Use WatermelonDB instead of PowerSync
- Because PowerSync Service requires either self-hosting an extra service (with its own MongoDB dependency for internal state) or paying for PowerSync Cloud, whereas WatermelonDB's sync endpoints are just two more NestJS controllers next to the ones you're already writing

**If charts need to be pixel-identical across RN and Web:**
- Use a single SVG-based library (`recharts`/`visx`/`react-native-svg`-backed) on both platforms instead of splitting Skia (native) / recharts (web)
- Because you avoid maintaining two chart implementations, at the cost of native GPU-accelerated smoothness

**If you decide multi-device sync conflicts need true CRDT merge (not server-authoritative LWW):**
- Use TinyBase's `MergeableStore` as the local layer instead of PowerSync's server-authoritative model, and write your own Postgres persistence bridge
- Because workout-logging data (append-mostly sets/reps) rarely has genuine concurrent-edit conflicts, so this is likely unnecessary complexity for v1 — revisit only if server-authoritative LWW proves insufficient in practice

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Expo SDK 57 | React Native 0.86.x | Verified via npm registry 2026-08-10; New Architecture mandatory, cannot be disabled. |
| Expo SDK 55+ | NOT compatible with legacy RN architecture | If any dependency you need requires the legacy architecture, you must pin to SDK 54 or earlier — check this before adding native modules. |
| PowerSync (`@powersync/react-native`) | Postgres 11+ with `wal_level = logical` | Also supports MongoDB/MySQL/SQL Server as source DB, but Postgres is the fit here. |
| PowerSync Service (self-hosted) | Requires its own MongoDB instance | Independent of your Postgres/NestJS stack — budget it as a separate infra component, or use PowerSync Cloud instead. |
| Better Auth | `>= 1.5.0` required for `@thallesp/nestjs-better-auth` | Older Better Auth versions are unsupported by the NestJS integration package. |
| NestJS v11 | Node.js v18+ (ESM-by-default work targets Node 24+ ecosystem readiness) | NestJS 12 (targeted ~Q3 2026) will require a fuller Node/ESM alignment — don't block v1 shipping on it. |
| Victory Native XL | React Native Skia peer dependency | No official web build; needs the platform-split chart pattern above. |

## Sources

- `/websites/expo_dev` (Context7) — Expo SDK New Architecture mandate (SDK 55+), Expo Router vs React Navigation positioning, SDK/RN version pairing
- `/nestjs/docs.nestjs.com` (Context7) — official NestJS database/ORM integration docs (TypeORM and Prisma recipes, `@nestjs/typeorm`)
- npm registry (`registry.npmjs.org`), queried directly 2026-08-10 — authoritative current versions for `@nestjs/core`, `expo`, `react-native`, `prisma`, `drizzle-orm`, `typeorm`, `@powersync/react-native`, `@powersync/web`, `@electric-sql/client`, `rxdb`, `tinybase`, `@legendapp/state` (incl. dist-tags showing v3 beta), `@op-engineering/op-sqlite`, `expo-sqlite`, `better-auth`, `@clerk/clerk-expo`, `victory-native`, `@shopify/react-native-skia`, `@tanstack/react-query`, `zustand`, `turbo`, `nx`, `detox`
- PowerSync official docs (`docs.powersync.com`) — self-hosted setup, logical replication requirements, custom conflict resolution, client-side backend integration/upload-queue pattern — HIGH confidence
- WatermelonDB official docs (`watermelondb.dev`) — Sync protocol (Frontend/Backend/Implementation pages) — HIGH confidence
- ElectricSQL docs (`electric-sql.com/docs/integrations`) — Expo/React integrations — HIGH confidence on web support, MEDIUM on RN gap (corroborated by community discussion, no official RN SDK found)
- Clerk official docs (`clerk.com/docs/guides/development/offline-support`, `clerk.com/articles/...session-expiry...`) plus community report (Threads) on the offline black-screen behavior — MEDIUM confidence on the specific UX complaint (single anecdotal source, but consistent with documented retry-then-`ClerkOfflineError` behavior)
- Better Auth official docs (`better-auth.com/docs/integrations/nestjs`) — HIGH confidence
- GitHub `rocicorp/replicache` (archived June 10, 2026) and `rocicorp.dev/blog` — HIGH confidence on Replicache's maintenance-mode status
- General web search (WebSearch tool, no dedicated search API configured for this project) across ~20 queries covering RN Web performance, ORM comparisons, monorepo tooling, testing frameworks, and exercise-dataset licensing — MEDIUM confidence individually, cross-checked against official sources/npm where the claim mattered for a prescriptive recommendation

---
*Stack research for: cross-platform local-first workout-tracking app (React Native + React Native Web + NestJS)*
*Researched: 2026-08-10*
