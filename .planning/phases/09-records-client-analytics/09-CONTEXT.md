# Phase 9: Records & Client Analytics - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning
**Mode:** Auto-generated during an unattended `/gsd-start` run — the user directed that no questions be asked. Every grey area was resolved at Claude's discretion and is marked `[CLAUDE'S CALL]` with its rationale and reversibility, so a later reader can find and overturn any of them cheaply.

<domain>
## Phase Boundary

The user can see what they've achieved and whether they're doing enough, **computed on-device**. Records, per-exercise performance over time, workout history with trends, and this week's progress against targets — all available immediately after logging, before any sync.

In scope: ANLY-01, ANLY-02, ANLY-03, ANLY-06, ANLY-07, ANLY-08, ANLY-10.

Explicitly NOT in scope — these are Phase 10, not this phase: the front/back body-map heatmap (ANLY-04), muscle-group drill-down (ANLY-05), and recomputation of PRs and volume when a past workout is edited (ANLY-09). Do not build them here even though they are adjacent and tempting.
</domain>

<decisions>
## Implementation Decisions

### Carried forward — already built, do not rebuild

- **D-01:** **PR detection already exists and must be reused, not reimplemented.** `packages/pr-rules/src/personal-records.ts` ships `PriorBest`, `CandidateSet`, `DetectedPr`, `emptyPriorBest`, `foldPriorBest` and `detectPrs` — the four PR metrics ANLY-01 names are already modelled there, and Phase 5's workout summary already surfaces a PR badge (proven by `workout-summary.spec.ts` in the durability suite). This phase extends the surfaces that read those rules; it does not fork them. — **Reversibility:** one-way in effect — a second PR implementation would immediately disagree with the shipped badge.

- **D-02:** **ANLY-10 is already enforced by `E1RM_MAX_VALID_REPS = 10` in `packages/pr-rules/src/estimated-1rm.ts`, whose `estimated1RM` returns `null` above that rep count.** The requirement is that estimated-1RM figures are only *presented* where the formula is valid, so this phase's job is to make every new e1RM surface honour that `null` — showing nothing, or an explicit "not meaningful above 10 reps", never a computed number. The rule exists; the discipline is at the call sites.

- **D-03:** **Everything is computed on-device from local SQLite.** Success criterion 4 requires this week's progress "available immediately after logging, before any sync". No analytics read may depend on a network round-trip or on the server having reconciled anything. Server-side aggregation is Phase 10's job and must not be reached for here.

- **D-04:** **Pure computation lives in a package; screens stay thin.** The house pattern is now well established — `@fitness/pr-rules`, `@fitness/plate-math` and `@fitness/progression-engine` are all pure, argument-in/value-out, and consumed from both apps. Aggregation for trends and weekly progress follows it: the maths is testable without a database or a renderer.

### Claude's calls — resolved without the user

- **D-05 [CLAUDE'S CALL]:** **One chart implementation for both targets, built on `react-native-svg`, not a native/web split.** `STACK.md`'s primary recommendation is Skia + `victory-native` on native with `recharts` on web behind a shared abstraction; its own "Stack Patterns by Variant" section offers the single-SVG alternative and names the tradeoff — "you avoid maintaining two chart implementations, at the cost of native GPU-accelerated smoothness." Taking the alternative here, for three reasons specific to this phase: the charts required are a line over time, a small trend indicator and progress bars, none of which need GPU compositing; a split would mean two renderers to keep visually identical for a solo maintainer; and a single SVG path renders in the Playwright durability harness, so these screens get **real browser evidence** rather than only unit tests. If a later phase needs a genuinely heavy visualisation, the Skia path can be adopted for that surface alone. — **Reversibility:** reversible per surface.

- **D-06 [CLAUDE'S CALL]:** **`react-native-svg` is the only new runtime dependency this phase may add.** It is the one primitive the above needs and it is already the transitive backbone of the RN charting ecosystem. Chart shapes are drawn from small local components rather than pulling a charting framework, so there is no second opinionated layout engine to fight. Adding any further chart package is out of scope. — **Reversibility:** reversible.

- **D-07 [CLAUDE'S CALL]:** **"This week" means the last 7 days ending today, not a calendar week.** A calendar week silently resets a user's visible progress at midnight on an arbitrary day and makes Sunday-evening training look like a failed week. A rolling 7-day window is stable, needs no locale-dependent week-start rule, and sidesteps the `Intl`/first-day-of-week determinism hazards Phase 8 already had to design around. Expose the window length as a named constant. — **Reversibility:** reversible.

- **D-08 [CLAUDE'S CALL]:** **Weekly targets are derived from the active program, not separately authored.** ANLY-08 asks for progress "against targets" for muscles trained, sets and exercises. The user has already expressed those targets by authoring a program in Phase 4; asking them to restate the same numbers in a second place would let the two drift and would be a new authoring surface this phase's goal does not call for. Where the active program does not express a target, show the achieved figure without a denominator rather than inventing one. — **Reversibility:** reversible; a manual override is additive.

- **D-09 [CLAUDE'S CALL]:** **A metric with no data renders an explicit empty state, never a zero or a flat line at zero.** A chart that draws zero where nothing was logged asserts something false — that the user trained and achieved nothing. This mirrors Phase 8's D-09/D-15, where "no history" is a distinct typed branch rather than a fabricated number, and the same discipline applies to every surface this phase adds. — **Reversibility:** reversible.

- **D-10 [CLAUDE'S CALL]:** **Time-bucketing is computed from dates supplied as arguments, never from a clock read inside the pure layer.** Phase 8 established that the pure packages hold no clock, and it is what made its layoff-invariance guarantee structurally enforceable. The same rule here keeps trend aggregation deterministic and testable, and keeps the client/server parity story intact for Phase 10, which will aggregate the same data server-side. — **Reversibility:** one-way in spirit — a clock read inside the pure layer would undo the property.
</decisions>

<code_context>
## Existing Code Insights

- `packages/pr-rules/src/personal-records.ts` — `foldPriorBest`, `detectPrs`, and the four PR metrics. Already consumed by the Phase 5 workout summary.
- `packages/pr-rules/src/estimated-1rm.ts` — `estimated1RM` returns `null` above `E1RM_MAX_VALID_REPS = 10`. This is ANLY-10's mechanism.
- `apps/mobile/e2e/workout-summary.spec.ts` — the shipped, passing durability spec proving the PR badge appears and disappears correctly. The ANLY-02 surface already partly exists.
- `packages/progression-engine/` — the most recent example of the pure-package pattern, including its jest config, barrel and the shared-fixture technique Phase 8 invented for client/server parity.
- `apps/mobile/app/(tabs)/` — the five-tab shell. This phase's new surfaces need a home; the tab structure already exists and should not be restructured.
- `apps/mobile/app/__durability.web.tsx` — the shared Playwright harness. Every e2e-bearing plan in the repo edits it; it is an undeclared cross-phase seam and edits must be append-only.
- Phase 7's set vocabulary (`set_type`, `parent_set_id`, per-side rows) and `countCompletedWorkingSets` in `apps/mobile/components/ExerciseStrip.tsx` — volume and set-count aggregation must respect the same "what counts as a working set" predicate, or the analytics will disagree with the strip the user already trusts.
</code_context>

<specifics>
## Specific Ideas

- Set-counting for ANLY-08 must agree with what the exercise strip already shows. Two different definitions of "a set" visible in one app is a correctness bug, not a cosmetic one.
- Every window length and bucket size is a named exported constant.
- The durability harness is the evidence path for these screens — prefer an executed spec to an asserted one.
</specifics>

<deferred>
## Deferred Ideas

- The body-map heatmap (ANLY-04) and muscle-group drill-down (ANLY-05) — Phase 10.
- Recomputation of PRs and volume after editing a past workout (ANLY-09) — Phase 10.
- Skia/GPU-accelerated charting — revisit only if a specific surface proves too heavy for SVG.
- Manually authored weekly targets independent of the active program — see D-08.
</deferred>
