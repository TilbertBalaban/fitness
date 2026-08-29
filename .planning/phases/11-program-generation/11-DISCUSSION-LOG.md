# Phase 11: Program Generation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 11-Program Generation
**Areas discussed:** Generator placement, Output shape & parity, Candidate pool & exclusions, Split selection, Periodization math, Deload placement, Failure behaviour
**Mode:** autonomous — every question resolved to its recommended option at the user's instruction ("auto approve recommended option, don't ask anything"). No interactive prompts were shown.

---

## Generator placement

| Option | Description | Selected |
|--------|-------------|----------|
| Shared pure package, runs on device | `@fitness/program-generator` imported by client and API; works offline | ✓ |
| Server endpoint, client renders result | Simpler package graph; needs network | |
| Client-only module inside the Expo app | No package overhead; API can never reuse it | |

**Choice:** shared pure package, on-device. **Notes:** matches the standing project decision that progression is one shared package so client and server can never diverge, and satisfies the local-first constraint. → D-01, D-02, D-03

---

## Output shape & the GEN-07 parity guarantee

| Option | Description | Selected |
|--------|-------------|----------|
| Emit a plain tree, write via the existing builder path | Parity is structural — same rows, same writer | ✓ |
| Generator writes its own rows directly | Fewer hops; risks a second write path drifting from the builder's | |
| Generated programs get their own table/kind | Explicit provenance; forks every downstream surface | |

**Choice:** plain tree through the existing write path; no behavioural generated-vs-hand-built distinction. **Notes:** per-cycle prescriptions ride the existing sparse-override mechanism rather than full per-cycle copies. → D-04, D-05, D-06, D-07

---

## Candidate pool & exclusions

| Option | Description | Selected |
|--------|-------------|----------|
| Filter catalog through resolved gym inventory, then apply exclusions as a hard last filter | Reuses plate-math; exclusion is unbypassable | ✓ |
| Filter by equipment type tags only | Cheaper; ignores whether the weight is actually loadable | |
| Soft exclusions (allowed as fallback when a slot is unfillable) | Always fills the program; violates GEN-03 | |

**Choice:** hard filter, reusing the plate-math inventory layer. Exclusions stored as a synced row-per-exercise table, user-level and global. **Notes:** the row-per-exercise shape is the same lesson that put `active_routine_id` on its own column — a multi-value list in one row loses concurrent offline edits under row-level LWW. → D-08, D-09, D-10, D-11

---

## Split selection & day structure

| Option | Description | Selected |
|--------|-------------|----------|
| Declarative template table keyed by (split, days/week) | Deterministic, diffable, testable in isolation | ✓ |
| Procedural day construction from muscle-group balance | More flexible; hard to test and to explain | |
| Single fixed split, days/week only | Simplest; fails GEN-04 | |

**Choice:** template table; full body / upper-lower / push-pull-legs plus an `auto` default. Session length trims exercise count per day, not sets per exercise. **Notes:** trimming sets instead would silently invalidate the volume targets. → D-12, D-13, D-14

---

## Periodization math

| Option | Description | Selected |
|--------|-------------|----------|
| Project-authored landmark table + documented constants module | Honest about the source; testable; closes the research flag | ✓ |
| Attempt to reverse-engineer MacroFactor's numbers | Not publicly documented — unverifiable | |
| Flat targets, no progression across cycles | Fails GEN-05 | |

**Choice:** our own documented volume-landmark table indexed by experience level; sets ramp across cycles, RIR descends within a block, goal picks the rep band. Emphasis is a three-level multiplier re-clamped to the landmark bounds. **Notes:** the standing Phase 11 research flag ("Smart Generation's volume-landmark math is not publicly documented") is closed by writing the doc, not by guessing. → D-15, D-16, D-17, D-18

---

## Deload placement

| Option | Description | Selected |
|--------|-------------|----------|
| none / every N cycles / final cycle, default every N | Covers GEN-06 with three legible choices | ✓ |
| Always include, fixed position | Simpler; removes user control the requirement asks for | |
| Free-form per-cycle marking | Maximum control; belongs to the builder, not the generator | |

**Choice:** three options, "every N cycles" as default; materialized as `deload` cycles carrying reduced-set / raised-RIR overrides against the same exercises. **Notes:** a deload that removed exercises would contradict what `deload` already means in this codebase. → D-19, D-20

---

## Failure behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Degrade explicitly, report what was reduced, preview before save | User sees a thin program and knows why | ✓ |
| Fail generation outright when a slot is unfillable | Predictable; unhelpful at a sparse gym | |
| Fill silently from outside the filter | Never fails; breaks GEN-02/GEN-03 | |

**Choice:** structured degradation report as part of the return value; the program is previewed and confirmed before any write. → D-21, D-22

---

## Claude's Discretion

- Wizard screen decomposition and step count
- Default name for a generated routine
- Internal module boundaries within `@fitness/program-generator`
- Whether provenance metadata is stored at all in v1

## Deferred Ideas

- Multiple concurrent training blocks (already v2 at project level)
- Re-periodizing a program in place after sessions have been logged against it
- Importing external program templates
- Mid-program exercise substitution when equipment is unavailable that day
