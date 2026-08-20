# Phase 4: Program Builder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 4-program-builder
**Areas discussed:** Builder shape, Reorder, Add exercise, Targets entry, Cycles, Deload & time off, Upcoming workouts, Program lifecycle UI, Rest days, Freeze control, New-program entry

---

## Area selection

Two selection questions were presented — one covering schema-level gray areas (cycle & target model, deload/time-off shape, status & lifecycle vocabulary, scheduling model) and one covering the authoring surface (nested builder navigation, reorder mechanism, draft & autosave semantics, target-entry ergonomics).

**User's choice:** Schema areas — "decide by yourself". Authoring surface — "ask by only UI questions, not technical questions".
**Notes:** All subsequent questions were reframed as pure UI/experience choices. Every schema-level area was resolved by Claude and written into CONTEXT.md as an explicit locked decision with reasoning (D-09 through D-20), not left open.

---

## Builder shape

| Option | Description | Selected |
|--------|-------------|----------|
| One long scrolling day | Single scroll, exercise rows expandable in place; whole session visible at once | |
| Drill-down screens | Program → day → exercise, each screen does one thing; more taps | |
| Day as a page you swipe | Days are horizontal pages; comparing two days is one swipe | ✓ |

**User's choice:** Day as a page you swipe
**Notes:** Mirrors how a split is actually thought about.

---

## Reorder

| Option | Description | Selected |
|--------|-------------|----------|
| Drag handle, always visible | Grip on every row, press and drag | ✓ |
| Separate "Reorder" mode | List is read-only until Reorder is tapped | |
| Up / down arrows | ↑↓ buttons per row; never misfires, tedious for long moves | |

**User's choice:** Drag handle, always visible
**Notes:** No gesture, reanimated or drag-and-drop library exists in the tree — flagged in CONTEXT.md as the phase's largest technical risk.

---

## Add exercise

| Option | Description | Selected |
|--------|-------------|----------|
| Full-screen picker, add many | Phase 3 catalog full-screen, selections accumulate, added together | ✓ |
| Full-screen picker, one at a time | Returns to the day after each pick | |
| Bottom sheet over the day | Half-screen sheet, day stays visible behind | |

**User's choice:** Full-screen picker, add many
**Notes:** Optimized for building a day from empty.

---

## Targets entry

| Option | Description | Selected |
|--------|-------------|----------|
| Inline on the expanded row | Row expands in place to reveal target fields | ✓ |
| Bottom sheet per exercise | Sheet with fields and a Done button | |
| Dedicated exercise screen | Full screen, most room to grow, most taps | |

**User's choice:** Inline on the expanded row
**Notes:** Neighbouring exercises stay visible while numbers are set.

---

## Cycles

| Option | Description | Selected |
|--------|-------------|----------|
| Cycle selector above the days | Cycle chips pinned above the swipeable days | ✓ |
| Cycles are the outer swipe | Days swipe, cycle from a header dropdown/stepper | |
| Edit cycle 1, then per-cycle overrides | Build one canonical week, later cycles show only differences | |

**User's choice:** Cycle selector above the days
**Notes:** Switching cycles never loses your place in the day. Drove D-09 (cycles must be first-class, addressable rows) and D-10 (sparse per-cycle target overrides).

---

## Deload & time off

| Option | Description | Selected |
|--------|-------------|----------|
| Visually distinct cycle in the row | Deload and time off styled distinctly inside the same cycle strip | ✓ |
| A toggle in cycle settings | Uniform cycles, marked from a settings sheet | |
| Set once at the program level | Cycle length, count, deload position and time off configured at creation | |

**User's choice:** Visually distinct cycle in the row
**Notes:** The block structure should read at a glance. Drove D-12 — deload and time off are `routine_cycle.kind` values, because they must be the same kind of row as a training cycle to sit in the same strip.

---

## Upcoming workouts

| Option | Description | Selected |
|--------|-------------|----------|
| On the Programs tab, under Active | MacroFactor's program library layout, active expanded on top | |
| On the Home tab | Home leads with "next up"; Programs stays about authoring | ✓ |
| On the Workout tab | Upcoming sits where you'd tap to begin training | |

**User's choice:** On the Home tab
**Notes:** `apps/mobile/app/(tabs)/index.tsx` is a placeholder today and becomes real in this phase.

---

## Program lifecycle UI

| Option | Description | Selected |
|--------|-------------|----------|
| One library list, active pinned on top | Single Programs list with a collapsed Archive section | |
| Active screen + separate library | Programs tab is the active program; library screen holds the rest | ✓ |
| Segmented Active / All / Archived | Segmented control always on screen | |

**User's choice:** Active screen + separate library
**Notes:** Everyday screen stays focused on the one program actually being run.

---

## Rest days

| Option | Description | Selected |
|--------|-------------|----------|
| Its own page in the deck | Push → Rest → Pull → Rest → Legs, rest days as real pages | |
| A thin marker between pages | Only training days are pages; rest days as a divider or dot | |
| No rest days at all here | Program is the training days in order; `is_rest_day` unused | ✓ |

**User's choice:** No rest days at all here
**Notes:** Drove D-19 — the program is a floating sequence, not calendar-bound, and `routine_day.is_rest_day` stays on the table but unused. Calendar-bound scheduling deferred.

---

## Freeze control

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle on the active program screen | "Update program" switch, always in sight (MacroFactor's model) | ✓ |
| In program settings | Tucked into the overflow menu with rename/duplicate/archive | |
| A badge you tap on the program card | Live/Frozen badge doubles as the control | |

**User's choice:** Toggle on the active program screen
**Notes:** Drove D-16 — freeze must be an independent boolean, since a program is frozen *while active* and `active AND frozen` must be representable.

---

## New program entry

| Option | Description | Selected |
|--------|-------------|----------|
| Straight into an empty builder | One untitled day, name it whenever | |
| Short setup first | Name, training-day count and cycle length, then a pre-scaffolded builder | |
| Start from a duplicate | First choice is blank or duplicate an existing program | ✓ |

**User's choice:** Start from a duplicate
**Notes:** PROG-07 needs duplication anyway; surfacing it at creation is where it is useful. On an empty account, blank is the only live option.

---

## Claude's Discretion

Every schema-level area was explicitly delegated by the user and resolved in CONTEXT.md rather than left open:

- Cycle and per-cycle target model → D-09, D-10, D-11 (`routine_cycle` as a first-class row; sparse `routine_exercise_cycle_target` overrides; `progression_scheme_id` left untouched for Phase 8)
- Deload and time-off shape → D-12, D-13 (`routine_cycle.kind` vocabulary, enforced in `packages/api-contracts/` and Postgres)
- Status and lifecycle vocabulary → D-14 through D-18 (`user_preference.active_routine_id` instead of a status value; `status` reduced to draft/ready; archive on `archived_at`; freeze as an independent boolean; deep-copy duplication)
- Scheduling model → D-19, D-20 (floating sequence; position derived from logged history, no stored cursor)
- Draft/autosave semantics → left as a researcher item, with the local-first default argued in CONTEXT.md

Still genuinely open for research and planning: the RN + RN-Web reorder/paging library, the `order_index` rewrite strategy under offline concurrency, draft persistence, where `override ?? base` resolution lives, what a blank target means, query shape against `PITFALLS.md` §13, and whether `zustand` is introduced here.

## Deferred Ideas

- Calendar-bound scheduling and authored rest days
- `PeriodizationScheme` behind `progression_scheme_id` (Phase 8)
- Superset authoring in the builder (`superset_group_id` stays null)
- Auto-generated programs (Phase 11)
- Parallel / "Specialized Training" concurrent blocks (v2)
- A `RoutineRevision` audit timeline (explicitly not needed for correctness)
