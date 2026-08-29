# Fitness — MacroFactor Workouts Clone

## What This Is

A cross-platform strength-training app — React Native (mobile) and React Native Web (browser) from a single
codebase, backed by a NestJS API — that reproduces the functionality of
[MacroFactor Workouts](https://macrofactor.com/workouts/). It handles program design, in-gym set logging,
rule-based progressive overload, and training analytics. Built for the author's own training, and as a
serious exercise in the React Native + NestJS stack.

## Core Value

You can walk into a gym with no signal, log every set of your workout without friction, and the app tells
you what to lift next time.

## Requirements

### Validated

- [x] Local-first offline logging — full workout capture with zero connectivity, sync on reconnect
      *Validated in Phase 02: data-model-sync-engine. Proven on the web target against a real
      browser, a live self-hosted PowerSync Service and real Postgres — an offline-logged set
      reaches Postgres with no manual action, and a logged set survives close-and-reopen with no
      finish/flush/sync step. Native (iOS/Android) observation deferred to Phase 999.1; no Xcode or
      Android SDK on this machine.*
- [x] NestJS backend API with real user accounts and multi-device sync
      *Validated in Phase 02: two browser contexts on one account each logging offline both
      converge after reconnect with no logged set lost. Device half deferred to Phase 999.1.*
- [x] Multi-gym profiles with per-location equipment configuration
      *Validated in Phase 06: gym-profiles-plate-math. A user can create, edit, duplicate, set
      active, archive and restore multiple gyms, each with its own bar weight, plate denominations
      with per-denomination pair counts, dumbbell weights and named machines (stack min/max/
      increment/base resistance), in either kg or lb. Every weight is stored in canonical kilograms
      and round-trips exactly. Proven in a real browser by `gym-profiles.spec.ts`. A session
      snapshots the gym it was started at and can be restamped mid-session without re-deriving
      already-logged sets (`switch-gym.spec.ts`).*
- [x] Plate calculator scoped to available equipment
      *Validated in Phase 06: gym-profiles-plate-math. A live per-side plate breakdown renders in
      the keypad's reserved band while entering a barbell weight, honouring the active gym's real
      pair counts. Loads the gym cannot make are named as their two nearest achievable neighbours;
      tap-to-autofill and generated warm-ups only ever produce achievable loads. Equipment can be
      marked unavailable for a single session, which subtracts from the resolved inventory feeding
      the band, the rounder and substitute suggestions alike. Proven by `plate-strip.spec.ts` and
      `equipment-availability.spec.ts`.*

### Active

- [ ] Cross-platform client: React Native mobile + React Native Web browser from one codebase
      *Web target exercised end-to-end in Phase 02; native runtime still unverified (Phase 999.1).*
- [ ] Exercise library seeded from an open dataset (text cues + static images)
- [ ] Custom program builder — user-authored routines from scratch
- [ ] Auto-generated programs from goal, experience level, equipment, and schedule
- [ ] Granular set logging: sets, reps, weight, RIR, rest timer, failure sets
- [ ] Advanced set types: supersets, drop sets, partial reps, myoreps
- [ ] Asymmetrical (left/right) per-side tracking
- [ ] Rule-based progression engine — recommends when to add weight or reps
- [ ] Analytics: volume and progress charts by muscle group, workout history, trends
- [ ] PR detection and highlighting
- [ ] Customizable dashboard of user-selected metrics
- [ ] Body metrics and progress photo tracking
- [ ] One-off / unplanned workout logging outside any program

### Out of Scope

- Nutrition and macro tracking — MacroFactor's core product, but explicitly not this project. Training only.
- Exercise demonstration videos (3-angle, technique voiceover) — a content production problem, not a code
  problem. Text cues and static images instead.
- Jeff Nippard program imports — licensed third-party content, not reproducible.
- AI/LLM-driven programming — MacroFactor deliberately uses deterministic rule-based logic, and so does this.

## Context

- **Reference product:** MacroFactor Workouts. Feature parity with the capabilities on its public feature
  page is the explicit finish line for v1, not a reduced subset.
- **Progression methodology:** Derive rules from published evidence-based lifting literature (sets per
  muscle per week, RIR-based autoregulation, double progression). Research should first establish how
  MacroFactor's own documented progression algorithm behaves and mirror those rules where they can be
  determined from public sources.
- **Exercise data:** Open datasets such as `free-exercise-db` or wger are candidate seeds. ~900 exercises is
  the target scale; sourcing and normalizing this data is real work, not a config step.
- **The gym is the hostile environment.** Poor signal, sweaty hands, one-handed use, screen locking between
  sets, rest timers running in the background. Logging friction is the thing that kills training apps.
- Built by a single developer for personal use first; learning the RN + NestJS stack properly is an
  explicit secondary goal, so architectural quality matters more than shipping speed.

## Constraints

- **Tech stack**: React Native + React Native Web (one codebase, two targets) — chosen up front
- **Tech stack**: NestJS backend — chosen up front
- **Architecture**: Local-first. Writes must succeed offline and reconcile on sync. This is non-negotiable
  and shapes the data model, not just the network layer.
- **Sync**: Real accounts with multi-device sync — the same user's phone and browser must converge
- **Content**: No video assets in v1 — exercise guidance is text and static imagery only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React Native + RN Web from one codebase | Mobile is the primary in-gym surface; web is wanted too, and a single codebase avoids maintaining two clients solo | — Pending |
| NestJS backend | Structured, opinionated Node framework; part of the stack the author wants to learn properly | — Pending |
| Local-first, offline-capable logging | Gyms have poor connectivity; a logger that fails mid-set is unusable | ✓ Validated in Phase 02 — proven in a real browser against real Postgres. The call paid for itself: three production sync bugs (wrong origin, dropped session cookie, unparsed body) were invisible to every unit test and only surfaced once a real browser drove the real HTTP path |
| Full feature parity as the v1 bar | The point is the real thing, not a toy logger; parity defines a concrete finish line | — Pending |
| Open exercise dataset, no video | 900 exercises with 3-angle video is a content production problem that would stall the software | — Pending |
| Rule-based progression, not AI | Mirrors MacroFactor's deliberate design; deterministic rules are testable and explainable | — Pending |
| Accounts + multi-device sync in scope | Phone and browser must converge; deferring auth would force a data model rewrite later | ✓ Validated in Phase 02 — two browser contexts on one account converge after both log offline. Device half deferred to Phase 999.1 |
| No nutrition tracking | MacroFactor's macro coaching is a separate product surface; including it would multiply scope | — Pending |
| Canonical kilograms as the single stored weight unit | A gym profile's display unit (kg/lb) is presentation; storing one canonical unit keeps the plate solver, rounder and sync payloads free of unit ambiguity | ✓ Validated in Phase 06 — every weight round-trips through exact decimal strings with no floating-point arithmetic (`toCanonicalKg` throws rather than coerces), proven by a real-browser lb-profile create/reopen |
| A session snapshots its gym rather than reading the active one | History must stay truthful: re-deriving a past session against today's active gym would silently rewrite what was lifted | ✓ Validated in Phase 06 — `loadSessionInventory` reads the session's own snapshot, and a mid-session gym restamp leaves already-logged sets' displayed weights untouched |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

## Current State

**Phase 10 (Server Analytics & Reconciliation) complete** — 7 plans, all 5 roadmap success criteria
verified by execution against real Postgres and a real browser: API e2e 23 suites / 283 tests,
Playwright durability 84/84, monorepo unit suites green. ANLY-04, ANLY-05 and ANLY-09 are satisfied.
Per-muscle volume is materialized server-side and synced down, editing the past recomputes what
derived from it, and the reconcile path's statement count is pinned by an executed budget assertion
against an 18-month corpus rather than asserted in prose.

Three manual checks (native iOS/Android rendering, and two max-font-scale legibility judgements) are
relocated to ROADMAP Phase 999.1/999.2 with WINDOWS entries — this machine has no Xcode or Android
SDK, so they are deferred rather than skipped.

Next: Phase 11 — Program Generation.

---
*Last updated: 2026-08-29 after Phase 10 completion*
