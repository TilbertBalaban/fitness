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

- [x] Cross-platform client: React Native mobile + React Native Web browser from one codebase
      *Validated in Phase 01 across the full monorepo; the `.web.tsx` escape-hatch convention is
      exercised throughout. Web target proven end-to-end; native runtime observation is the one
      half still outstanding (Phase 999.1 — no Xcode or Android SDK on this machine).*
- [x] Exercise library seeded from an open dataset (text cues + static images)
      *Validated in Phase 03: ~900 exercises seeded from free-exercise-db with vendored static
      images, a primary/secondary muscle taxonomy, load types, and user-authored custom exercises.*
- [x] Custom program builder — user-authored routines from scratch
      *Validated in Phase 04: routines with days, cycles, per-exercise targets, and reordering that
      converges offline via a gap-indexed scheme.*
- [x] Auto-generated programs from goal, experience level, equipment, and schedule
      *Validated in Phase 11: a pre-periodized program is generated deterministically from goal,
      available equipment and weekly schedule, with per-muscle-group emphasis over all 19 groups.*
- [x] Granular set logging: sets, reps, weight, RIR, rest timer, failure sets
      *Validated in Phase 05 — the dogfooding milestone. A full workout logs offline with an in-app
      keypad that never obscures the value being edited, inline previous-session values, tap-to-
      autofill, and one-tap complete/undo.*
- [x] Advanced set types: supersets, drop sets, partial reps, myoreps
      *Validated in Phase 07: set type changes from the set number without leaving the row; drop
      sets and myoreps group sub-entries under one logical set; warm-ups are excluded from working
      volume.*
- [x] Asymmetrical (left/right) per-side tracking
      *Validated in Phase 07 (SETS-09): independent weight and reps per side for unilateral work.*
- [x] Rule-based progression engine — recommends when to add weight or reps
      *Validated in Phase 08: recommendations compute offline at the moment an exercise starts,
      snap to the active gym's achievable increments, hold rather than reduce after a single short
      session, and surface an explicit "unavailable within target rep range" state instead of an
      unachievable prescription.*
- [x] Analytics: volume and progress charts by muscle group, workout history, trends
      *Validated in Phases 09 and 10: on-device charts and history, with authoritative per-muscle
      volume materialized server-side and recomputed when the past is edited.*
- [x] PR detection and highlighting
      *Validated in Phases 09 and 10: four-metric detection with per-metric badges in the workout
      summary, and server-authoritative records reconciled on edit.*
- [x] Customizable dashboard of user-selected metrics
      *Validated in Phase 12 (DASH-01…03).*
- [x] Body metrics and progress photo tracking
      *Validated in Phase 12: measurements, progress photos, and the body-map heatmap.*
- [x] One-off / unplanned workout logging outside any program
      *Validated in Phase 05 (LOG-02).*

### Active

(None — every v1 requirement shipped in milestone v1.0. Next milestone's
requirements are defined by `/gsd-new-milestone`.)

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
| React Native + RN Web from one codebase | Mobile is the primary in-gym surface; web is wanted too, and a single codebase avoids maintaining two clients solo | ✓ Good — one codebase carried all 12 phases to parity. The `.web.tsx` escape hatch absorbed every genuine platform split (charts, file pickers, SQLite driver) without forking a screen. Caveat: the native runtime is still unobserved (999.1), so the claim is proven on web and inferred on device |
| NestJS backend | Structured, opinionated Node framework; part of the stack the author wants to learn properly | ✓ Good — the module boundary made server-authoritative analytics (Phase 10) a additive concern rather than a rewrite |
| Local-first, offline-capable logging | Gyms have poor connectivity; a logger that fails mid-set is unusable | ✓ Validated in Phase 02 — proven in a real browser against real Postgres. The call paid for itself: three production sync bugs (wrong origin, dropped session cookie, unparsed body) were invisible to every unit test and only surfaced once a real browser drove the real HTTP path |
| Full feature parity as the v1 bar | The point is the real thing, not a toy logger; parity defines a concrete finish line | ✓ Good — 105/105 v1 requirements satisfied. The concrete finish line worked exactly as intended: it prevented scope drift and made "done" checkable rather than arguable |
| Open exercise dataset, no video | 900 exercises with 3-angle video is a content production problem that would stall the software | ⚠️ Revisit — the constraint held and Phase 03 shipped ~900 exercises with static imagery, but free-exercise-db's per-exercise image licensing rests on an unresolved upstream issue (recorded as a phase 03 unmet-truth). Licensing needs a real answer before any public distribution |
| Rule-based progression, not AI | Mirrors MacroFactor's deliberate design; deterministic rules are testable and explainable | ✓ Good — Phase 08's engine is fully deterministic and therefore unit-testable offline, which is what let PRGR-11 (recommendations with zero connectivity) be satisfied at all |
| Accounts + multi-device sync in scope | Phone and browser must converge; deferring auth would force a data model rewrite later | ✓ Validated in Phase 02 — two browser contexts on one account converge after both log offline. Device half deferred to Phase 999.1 |
| No nutrition tracking | MacroFactor's macro coaching is a separate product surface; including it would multiply scope | ✓ Good — held for the whole milestone with no pressure to reopen |
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

**Milestone v1.0 shipped — all 12 phases complete.** 124 plans executed, every phase
verified `passed`, and all 105 v1 requirements satisfied with named evidence. The
reference-product parity bar set at the start was met rather than trimmed.

What exists: a local-first React Native + RN Web client on a NestJS/Postgres backend, with
real accounts and multi-device sync; a ~900-exercise catalog; a program builder and a
deterministic program generator; the offline in-gym logging loop including advanced set
types and per-side tracking; a rule-based progression engine that recommends the next
lift with zero connectivity; PR detection and analytics both on-device and
server-authoritative; and body metrics with a customizable dashboard.

Verification at close: `pnpm -w typecheck` 14/14 green, `pnpm -w test` 2321 tests across
144 suites green.

**Known debt carried forward:** 142 open WINDOWS entries, of which 76 are `unrun-verify`
device/browser checks already scheduled as ROADMAP Phase 999.1 (native iOS/Android) and
999.2 (web human judgement) — this machine has no Xcode or Android SDK, so those are
deferred, not skipped. The remaining 66 are reasoned deviations, stubs, and findings
assessed and deliberately declined. Nyquist validation is reconciled for only 3 of 12
phases. Exercise-image licensing needs a real answer before any public distribution.

**The single biggest outstanding risk is that no part of this app has ever been observed
running on a physical phone.** Every claim about the native target is inferred from a
shared codebase and a green web run.

Next: `/gsd-new-milestone` — or clear 999.1/999.2 first if a device becomes available.

---
*Last updated: 2026-08-31 after the v1.0 milestone*
