# Phase 2: Data Model & Sync Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 2-Data Model & Sync Engine
**Areas discussed:** none — all delegated

---

## Gray Areas Offered

Four areas were surfaced from the phase goal, its five success criteria, and the two contradictions found between the research documents. The user selected none of them.

| Option | Description | Selected |
|--------|-------------|----------|
| Sync engine & protocol | PowerSync vs. the hand-rolled outbox + seq-cursor protocol `ARCHITECTURE.md` §3 already specifies vs. WatermelonDB. Decides infra (extra service + MongoDB or not), how much sync code is owned in-repo, and what Phase 5's logging path attaches to. `STACK.md` and `ARCHITECTURE.md` §3 disagree. | |
| Schema scope this phase | Whole domain model now vs. only the slice that proves sync, with Phases 3–5 adding tables. Phase is `mvp` mode, but criterion 3's seeded 1–2 year corpus needs real tables, and `ARCHITECTURE.md` §7 orders the catalog *before* the sync skeleton while the ROADMAP inverts that. | |
| Conflict, deletes & convergence proof | Tombstone/delete story, LWW at field vs. row granularity, and what the automated two-device concurrent-edit test in criterion 2 actually asserts. `ARCHITECTURE.md` §3 prescribes row-level LWW; `PITFALLS.md` §1 warns LWW silently destroys logged sets. | |
| Day attribution & unit boundary | LOG-22 + criterion 5: calendar day from `started_at` or `ended_at`, device-local or stored offset, behavior across timezone changes; plus where kg-canonical decimal converts to display units (PLAT-08). | |

**User's choice:** "nothing, you decide" — full delegation, no area discussed.
**Notes:** The question was first presented via the interactive picker and dismissed, then re-presented as a plain-text numbered list. The response to the plain-text form was the delegation above. No preference, constraint, or example was volunteered, so nothing in CONTEXT.md's `<decisions>` section originates from this session — that section restates only what PROJECT.md, the research documents, and Phase 1's CONTEXT.md had already locked.

---

## Claude's Discretion

Everything. Recorded in `02-CONTEXT.md` `<decisions>` → "Claude's Discretion" with per-item decision criteria rather than as a bare list, because two items are unresolved contradictions between the project's own research documents and would otherwise be settled silently by whichever document an agent read last:

1. Sync engine — PowerSync vs. hand-rolled (`STACK.md` vs. `ARCHITECTURE.md` §3)
2. Conflict model — row-level LWW vs. field-level/append-only (`ARCHITECTURE.md` §3 vs. `PITFALLS.md` §1)
3. Delete and tombstone semantics — covered by neither research document
4. Schema scope for this phase
5. Local schema migration and the data-preservation guarantee
6. Calendar-day attribution and timezone policy
7. Data export format and surface
8. Performance budget — needs numbers before criterion 3 is verifiable

## Deferred Ideas

Nothing new was raised in this session. The deferred list in `02-CONTEXT.md` carries forward items from Phase 1's discussion (sync status indicator, native deep links) and from the research documents (`RoutineRevision` audit trail, server-side analytics rollups).
