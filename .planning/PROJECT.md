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

(None yet — ship to validate)

### Active

- [ ] Cross-platform client: React Native mobile + React Native Web browser from one codebase
- [ ] NestJS backend API with real user accounts and multi-device sync
- [ ] Local-first offline logging — full workout capture with zero connectivity, sync on reconnect
- [ ] Exercise library seeded from an open dataset (text cues + static images)
- [ ] Custom program builder — user-authored routines from scratch
- [ ] Auto-generated programs from goal, experience level, equipment, and schedule
- [ ] Granular set logging: sets, reps, weight, RIR, rest timer, failure sets
- [ ] Advanced set types: supersets, drop sets, partial reps, myoreps
- [ ] Asymmetrical (left/right) per-side tracking
- [ ] Plate calculator scoped to available equipment
- [ ] Multi-gym profiles with per-location equipment configuration
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
| Local-first, offline-capable logging | Gyms have poor connectivity; a logger that fails mid-set is unusable | — Pending |
| Full feature parity as the v1 bar | The point is the real thing, not a toy logger; parity defines a concrete finish line | — Pending |
| Open exercise dataset, no video | 900 exercises with 3-angle video is a content production problem that would stall the software | — Pending |
| Rule-based progression, not AI | Mirrors MacroFactor's deliberate design; deterministic rules are testable and explainable | — Pending |
| Accounts + multi-device sync in scope | Phone and browser must converge; deferring auth would force a data model rewrite later | — Pending |
| No nutrition tracking | MacroFactor's macro coaching is a separate product surface; including it would multiply scope | — Pending |

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
*Last updated: 2026-08-10 after initialization*
