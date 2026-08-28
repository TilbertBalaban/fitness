# Phase 8: Progression Engine - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning
**Mode:** Auto-generated during an unattended `/gsd-start` run — the user directed that no questions be asked. Every grey area below was resolved at Claude's discretion from the ROADMAP success criteria, REQUIREMENTS.md, ARCHITECTURE.md and the conventions phases 1-7 already established. **Each such call is marked `[CLAUDE'S CALL]` so a later reader can find and overturn it cheaply.**

<domain>
## Phase Boundary

The app tells the user what to lift next, from their own logged history, with no signal. This is the core value promise of the product.

In scope: the recommendation rules themselves, the inputs they read, the shared package they live in, the per-user preference that steers them, snapping to the active gym's real increments, the explicit "no valid recommendation" state, and the client/server parity that makes a recommendation identical on both.

Out of scope: analytics and charting of progression over time (Phase 9), server-side aggregate reconciliation (Phase 10), automatic program generation (Phase 11). This phase computes a recommendation; it does not visualise history and does not author programs.
</domain>

<decisions>
## Implementation Decisions

### Carried forward — already locked, do not re-litigate

- **D-01:** **The rules live in `packages/progression-engine`, which already exists as a reserved slot.** `packages/progression-engine/src/index.ts` currently exports only `PROGRESSION_ENGINE_PLACEHOLDER` and says in its own header: "The progression rules are a single pure package imported by BOTH the client and the server so the two can never drift" (ARCHITECTURE.md §4). This phase fills that slot. Success criterion 6 — "the same rule code runs on client and server" — is satisfied by construction, not by a second implementation kept in sync. — **Reversibility:** one-way in practice; two divergent copies cannot be merged after either has shipped recommendations.

- **D-02:** **The package is pure: no I/O, no database handle, no clock, no network.** Every input arrives as an argument and every output is a value. This is what lets `apps/api` and `apps/mobile` both call it, and it is what makes the parity test in D-08 possible at all. Follows the precedent of `@fitness/plate-math` and `@fitness/pr-rules`, both of which are already consumed from both sides.

- **D-03:** **Recommendations are derived on read, never persisted as a denormalized column.** PRGR-11 requires a recommendation "with zero network connectivity, at the moment they start the exercise" — computing it locally from local SQLite satisfies that directly. A stored recommendation would immediately raise an invalidation problem (whose write bumps it? what if history syncs in later?) that the local-first model does not need to take on. — **Reversibility:** reversible; caching later is additive.

- **D-04:** **Snapping goes through `@fitness/plate-math` against the active gym profile.** Phase 6 already shipped the inventory model, the solver and the achievability check. PRGR-05 is satisfied by calling it, not by re-deriving increments here.

### Claude's calls — resolved without the user, open to being overturned

- **D-05 [CLAUDE'S CALL]:** **A shortfall holds the prescription, and a reduction is offered only after three consecutive shortfalls — never applied automatically.** Success criterion 5 says "2-3 consecutive misses" and REQUIREMENTS.md PRGR-09 says "2-3 sessions running". Three is the conservative end of the range the user themself specified, and it errs toward the requirement this phase must not violate: PRGR-08, "never given a reduced recommendation as a consequence of missing sessions". The count is a single named constant in the engine so moving it to 2 is a one-line change with a test, not a refactor. A reduction is *offered*, never silently applied — the user accepts it. — **Reversibility:** reversible.

- **D-06 [CLAUDE'S CALL]:** **RIR is matched with a tolerance band of ±1, not exactly.** PRGR-10 asks for "tolerance bands rather than exact matching" without naming a width. ±1 is the smallest band that absorbs ordinary human imprecision in a self-reported RIR while still distinguishing a genuine 0-RIR grinder from a 3-RIR back-off set. Like D-05 this is one named constant. — **Reversibility:** reversible.

- **D-07 [CLAUDE'S CALL]:** **The PRGR-04 preference is a per-user setting, defaulting to widening the rep range first.** Two values: widen the rep range before adding load (textbook double progression), or prefer matching the previous weight. Double progression is the more common default in the training literature the rest of this app follows, and it is the gentler of the two on a user with a coarse plate inventory. It belongs on the existing `user_preference` row rather than per-exercise — one dial, matching how D-14's active-routine pointer and the weight-unit setting already work. — **Reversibility:** reversible; a per-exercise override is additive.

- **D-08 [CLAUDE'S CALL]:** **Client/server parity is proven by a shared fixture table exercised by both suites, not asserted.** Success criterion 6 is the kind of claim that rots silently. A single table of input/expected-output cases lives beside the engine and is run by both the mobile unit suite and the api suite, so a change that makes the two disagree fails in CI rather than in a gym. This is the same "prove it, do not assert it" standard phases 4 and 7 were held to. — **Reversibility:** reversible.

- **D-09 [CLAUDE'S CALL]:** **"No valid recommendation" is a distinct typed result, not a null or a sentinel number.** PRGR-06 requires an explicit unavailable state. The engine returns a discriminated union so an unavailable recommendation cannot be accidentally rendered as a weight; the caller must handle the branch to compile. — **Reversibility:** one-way once call sites depend on the shape, but cheap while the package is new.

- **D-10 [CLAUDE'S CALL]:** **Recency is measured in sessions logged, never in elapsed wall-clock time.** This is the mechanism that makes PRGR-08 true: an engine that decayed on calendar time would necessarily reduce a recommendation after a layoff, which the requirement forbids outright. The engine reads the last N logged performances for the exercise and is indifferent to when they happened. — **Reversibility:** one-way in spirit — a time-decay term added later would reintroduce exactly the behaviour PRGR-08 prohibits.

- **D-11 [CLAUDE'S CALL]:** **A failure set progresses on beating the prior rep count at the same load (PRGR-03), and per-side and grouped sets from Phase 7 are reduced to a single comparable performance before the rules see them.** Phase 7 shipped supersets, drops, myoreps, partials and per-side work. The engine must not grow a branch per set type; the normalisation happens once at the boundary, so the rules stay legible and the Phase 7 vocabulary stays where it belongs.

### Resolved from `08-RESEARCH.md`'s Open Questions — 2026-08-28, still unattended, still Claude's calls

The researcher raised five genuinely open questions and, correctly, refused to invent sources for the two thresholds that have none. These five are resolved here so the planner inherits answers rather than guessing. All five are `[CLAUDE'S CALL]`.

- **D-12 [CLAUDE'S CALL]:** **A per-side pair progresses on the WEAKER side, and the exercise keeps ONE recommendation.** The researcher was right that per-side is not the "top set" case: both sides are genuinely working performance, so `ARCHITECTURE.md` §1's drop/myorep/partial precedent does not transfer. Two candidate shapes were available — one recommendation derived from a chosen side, or an independent progression stream per side. Independent streams would contradict PRGR-01, which promises "what weight and reps to use for **each exercise**", singular, and would fork the entry point for unilateral movements only. Deriving from the weaker side is the choice that keeps the prescribed load achievable for **both** limbs; deriving from the stronger side would systematically over-prescribe the weaker one, which is the exact failure unilateral work exists to correct. Expose the strategy as a named export (`PER_SIDE_STRATEGY`) so switching it is a one-line change with a test. — **Reversibility:** reversible.

- **D-13 [CLAUDE'S CALL]:** **When the ideal weight is not producible, round DOWN.** `roundToAchievable` in `packages/plate-math/src/achievability.ts` supports `'nearest' | 'down' | 'up'` and deliberately takes no default. Rounding down never delivers an unrequested extra jump on top of an intended stimulus, and an under-shot load surfaces as a beaten target next session — which the engine already handles — whereas an over-shot load surfaces as a missed target, which D-05 then holds on. Failing safe in the direction the rules already recover from is the asymmetry that decides this. Named constant, same as D-05/D-06. — **Reversibility:** reversible.

- **D-14 [CLAUDE'S CALL]:** **History is compared as stored canonical kg, and is never re-snapped to the current gym before comparison.** GYM-04 lets the user switch gyms mid-program. "Did they beat the same load" is a question about what happened; "can they load that today" is a question about what to prescribe next. Conflating them would silently rewrite training history whenever a user trains somewhere new. So: compare past performances as-recorded, and apply achievability only when computing the next recommendation. — **Reversibility:** reversible, but re-snapping history later would change the meaning of past comparisons.

- **D-15 [CLAUDE'S CALL]:** **"No history" is its own union member, not a `reason` on the unavailable case.** The result type has three branches: a recommendation, `no_history` (PRGR-07 — the user picks their own starting weight and the engine takes over afterwards), and `unavailable` (PRGR-06 — we tried and no valid weight exists within the target rep range). These are different situations with different UI: one asks the user for a number, the other explains that no number exists. An exhaustive switch forces both to be handled. — **Reversibility:** one-way once call sites depend on the shape, but cheap while the package is new.

- **D-16 [CLAUDE'S CALL]:** **Phase 8 adds NO NestJS module, service or endpoint. The api side is a spec test that imports the package directly.** Success criterion 6 says "the same rule code runs on client and server"; D-08 satisfies that with a shared fixture table run by both suites. `ARCHITECTURE.md` §4 describes server invocation as being for reconciliation and browser-based program planning, "never as the primary path", and this phase's own boundary defers server-side reconciliation to Phase 10. The researcher flagged NestJS wiring as an easy scope-creep trap for a planner skimming the architecture diagram without reading the boundary; treat it as out of scope. Note the pattern-mapper found that **no `@fitness/*` pure package is imported from `apps/api` today**, so this spec test is the first of its kind and is inventing a path, not following one. — **Reversibility:** reversible; Phase 10 adds the real call site.

> **On D-05 and D-06, now that research has reported back.** The researcher confirmed both have **no public source**, and further that Stronger By Science's actual autoregulation trigger operates on a different axis entirely — reps missed *within a single set*, not shortfalls across *consecutive sessions*. Both constants therefore stand as **our own design**, and the plan and any user-facing copy must not imply otherwise. This is the honesty requirement `.planning/STATE.md`'s standing research flag for this phase was asking for.

</decisions>

<code_context>
## Existing Code Insights

- `packages/progression-engine/` — the reserved, near-empty package this phase fills. Its own header states the both-sides constraint.
- `packages/plate-math/` — `solver.ts`, `achievability.ts`, `inventory.ts`, `band.ts`. Phase 6's shipped increment snapping; D-04 consumes it.
- `packages/pr-rules/` — `estimated-1rm.ts`, `personal-records.ts`, `warmup.ts`. The closest structural analog for a pure rules package consumed from both sides, and the pattern to copy for layout, testing and exports.
- `apps/mobile/lib/programs/next-up.ts` — `resolveNextUp` already answers "what is the next workout"; this phase answers "and what weight and reps", so the two meet at the session-start path.
- `apps/mobile/lib/db/log-set.ts` — `resolvePrescriptionForCycle` and the snapshot-on-use copy onto `session_exercise`. Phase 4's D-01 is load-bearing here: editing a program must never change a logged workout, so the engine reads logged history, not current program targets.
- Phase 7's set vocabulary (`set_type`, `parent_set_id`, `superset_group_id`, per-side rows) is what D-11's normalisation boundary has to absorb.
</code_context>

<specifics>
## Specific Ideas

- The engine's public surface should be small: one entry point that takes the exercise's logged history, the current prescription, the active gym inventory and the user's preference, and returns either a recommendation or a typed unavailable result.
- Every threshold named in the decisions above (the shortfall count, the RIR band width) is a named exported constant, so the plan-checker and a future tuning pass can find them without reading the algorithm.
- `.planning/STATE.md` records a standing research flag for this phase: "MacroFactor's below-target thresholds and deload trigger are not publicly documented — our own design decision, informed by RP volume landmarks and SBS autoregulation." The research step should confirm the landmarks it can and be explicit about what is our invention rather than implying a source that does not exist.
</specifics>

<deferred>
## Deferred Ideas

- Per-exercise overrides of the D-07 preference — the global dial ships first.
- Any automatic acceptance of a reduction. D-05 offers; it never applies.
- Progression analytics and visualisation — Phase 9.
- Server-side recomputation or reconciliation of recommendations — Phase 10.
</deferred>
