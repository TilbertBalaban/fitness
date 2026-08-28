# Phase 7: Advanced Set Types - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-28
**Phase:** 7-Advanced Set Types
**Areas discussed:** Set-type switcher, Drop sets & myoreps, Supersets, Counting & per-side

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Set-type switcher | Tapping the set number; how a non-normal set announces itself | ✓ |
| Drop sets & myoreps | Grouped sub-entry layout and entry flow | ✓ |
| Supersets | Pairing, pager presentation, rest-timer trigger | ✓ |
| Counting & per-side | Volume/PR semantics for the new types; unilateral logging | ✓ |

**User's choice:** All four.

---

## Set-type switcher

### What appears when you tap a set number?

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom sheet (Recommended) | Matches every shipped set-row affordance; a stray tap costs one dismiss | ✓ |
| Inline cycle-through | Fastest for repeated changes, but a mis-tap silently rewrites a logged type | |
| Compact popover | Keeps the row in view, but a new pattern with its own web/native positioning story | |

**User's choice:** Bottom sheet → CONTEXT D-01

### How should a non-normal set announce itself in the row?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend the W badge (Recommended) | Reuse `renderWarmupBadge`'s 14px circle with a per-type glyph | ✓ |
| Replace the set number | Most compact, but loses the set's position in the exercise | |
| Badge plus a text label | Unambiguous, but the row has no horizontal space to spare | |

**User's choice:** Extend the W badge → CONTEXT D-02

### What does SETS-05 "partial reps logged distinctly" mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Sub-entry under the set (Recommended) | `parent_set_id` child, so "10 full + 3 partials" is one logical set | ✓ |
| A set typed `partial` | Simplest reading of the schema, but the pairing is lost | |
| A partial-rep count on the row | Densest, but a new column, keypad field and fourth numeric column | |

**User's choice:** Sub-entry → CONTEXT D-04

### Can a set's type change after it's marked complete?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, always editable (Recommended) | You often realise a set was a failure set only afterwards | ✓ |
| Only before completion | Protects history, but contradicts every other field on the row | |

**User's choice:** Always editable → CONTEXT D-03

**Continue check:** "Move to drop sets & myoreps."

---

## Drop sets & myoreps

### How should a drop set's sub-entries be laid out?

| Option | Description | Selected |
|--------|-------------|----------|
| Indented children under the parent (Recommended) | Reads as one logical set; mirrors `parent_set_id` | ✓ |
| Flat rows joined by a bracket | No new indentation, but a weaker grouping signal | |
| Collapsed into one summary row | Densest, but cannot be logged into without expanding | |

**User's choice:** Indented children → CONTEXT D-06

### How do you add the next drop or myorep mini-set while lifting?

| Option | Description | Selected |
|--------|-------------|----------|
| A `+` on the parent group (Recommended) | Explicit, never fires on its own, identical for drops and myoreps | ✓ |
| Auto-append a blank child on completion | Zero taps, but always leaves a stray empty row | |
| Choose the count up front | Predictable, but you rarely know beforehand | |

**User's choice:** Explicit `+` → CONTEXT D-08

### What is a myorep's parent row?

| Option | Description | Selected |
|--------|-------------|----------|
| The activation set itself (Recommended) | Same shape as a drop set; nothing renders empty | ✓ |
| An empty group header | Structurally uniform, but a parent with no weight or reps | |

**User's choice:** Auto-approved recommendation → CONTEXT D-07

### Switching a set that already has children back to `normal`

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm, then delete the children (Recommended) | Matches `RemoveExerciseDialog`; no orphan state to represent | ✓ |
| Promote children to their own sets | Loses nothing, but silently inflates the working-set count | |
| Block the switch while children exist | Safe, but a dead end that never explains itself | |

**User's choice:** Confirm then delete → CONTEXT D-09

---

## Supersets

Not put to the user — covered by the standing auto-approve. Recommendations recorded as
CONTEXT D-11 … D-16:

| Decision | Recommendation taken | Main alternative rejected |
|---|---|---|
| Forming/detaching | Extend `SessionExerciseActionId` with `superset` / `detach-superset` | A dedicated pairing gesture in `ExerciseStrip` or `ReorderExercisesSheet` |
| Pager presentation | Two pages plus a link badge and header chip | One merged alternating page |
| Rest trigger | Suppress on non-final members; start on the final member's set | An explicit round counter |
| Member advance | Follows the existing auto-advance preference | A separate always-on superset advance |
| Group size | UI forms pairs; read paths tolerate N members | Hard-coding exactly two |
| Scope | `session_exercise` only | Also authoring supersets on `routine_exercise` (deferred) |

---

## Counting & per-side

Not put to the user — covered by the standing auto-approve. Recommendations recorded as
CONTEXT D-10, D-17 … D-22:

| Decision | Recommendation taken | Main alternative rejected |
|---|---|---|
| Set counting | Parent = one set toward the prescription; children add volume only | Every row counts as a set |
| Working volume | One `countsTowardWorkingVolume` predicate; `warmup` the only exclusion | Leaving four duplicated `!== 'warmup'` literals in place |
| Records | A second `countsTowardRecords` predicate excluding `warmup` and `partial` | Letting a partial-ROM rep set a heaviest-weight or e1RM PR |
| Auto-advance | Also filter to parent rows (`parentSetId === null`) | Leaving the WINDOWS #136 failure mode open to drop children |
| Per-side shape | Parent `side='left'` plus one child `side='right'` | An empty container parent, or positional L/R pairing |
| Per-side toggle | Per-exercise, derived from data, no new column | A new `logs_per_side` column, or a per-set toggle |
| Existing rows | Never retroactively rewritten | Converting already-logged sets on toggle |

---

## Claude's Discretion

The user granted a standing "auto-approve the recommended option for all questions" partway through
the drop-sets area. Everything from CONTEXT D-07 onward is therefore Claude's recommendation rather
than an explicitly debated choice. D-05 and D-10 are the load-bearing ones the rest depend on; the
remainder can be overridden individually at plan review.

## Deferred Ideas

- Program-level superset authoring on `routine_exercise` — Phase 4 territory, most likely follow-up
- Giant sets (3+ members) in the forming UI — data model already allows it
- A dedicated `partialReps` column on `logged_set` — revisit only if sub-entries prove awkward
- Per-side plate math / independent per-hand dumbbell loads — a Phase 6 amendment
- Progression rules that read the new set types — Phase 8
- Analytics separating partial volume from full volume — Phase 9/10
