# Phase 7: Advanced Set Types - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes the shipped logging loop able to express how the lifter actually trains. It
delivers: switching a set's type from the set row itself; drop sets and myoreps as grouped
sub-entries under one logical set; failure, partial and AMRAP sets; warm-up exclusion from working
volume made explicit rather than incidental; supersetting two adjacent exercises so rest starts only
once both are done, and detaching them again; and logging different weight and reps for the left and
right side of a unilateral exercise.

Covers SETS-01 through SETS-09.

**Not this phase:** the progression engine that reads these types to decide what to suggest
(Phase 8); records and analytics surfaces built on the counting rules this phase fixes (Phases 9–10);
program-level superset *authoring* on `routine_exercise` (Phase 4 territory — see Deferred Ideas);
and any change to how a plain working set is persisted (Phase 5, shipped and locked).

**The dominant constraint:** the storage shape for everything in this phase already exists and is
already pinned by tests. This phase writes into that schema — it does not invent it.

</domain>

<decisions>
## Implementation Decisions

### Carried forward — already locked, do not re-litigate

- **CF-01:** **Every column this phase needs already ships.** `logged_set` has `set_type` (not null),
  `parent_set_id` (self-referencing FK), `side`, `completed` and `rest_taken_seconds`;
  `session_exercise` has `superset_group_id`. All are declared in `apps/api/src/db/schema/session.ts`
  and mirrored in `apps/mobile/lib/db/schema.ts`. `sync.service.ts` already validates all seven
  `set_type` literals and the shape-completeness fields, and `apps/api/test/poison-pill.e2e-spec.ts`
  already pins `completed`/`side`/`parent_set_id`/`rest_taken_seconds` against malformed writes.
  `apps/api/test/schema-parity.e2e-spec.ts` verifies the live database against the schema file.
  This phase fills these columns in; it does not add them. — **Reversibility:** n/a (statement of fact).

- **CF-02:** **`SET_TYPES` is closed, additive-only, and already names this phase.**
  `packages/api-contracts/src/session.ts` publishes
  `['normal','warmup','drop','myorep','partial','failure','amrap']`, enforced by the
  `logged_set_set_type_check` Postgres CHECK. `docs/session-vocabularies.md` records the
  written/reserved split explicitly and names Phase 7 as the phase that turns the last five from
  reserved into written. Do not add an eighth type, do not reorder, do not insert.
  — **Reversibility:** one-way — the tuple is a published contract every client build in the field
  reads back through its declared order and membership.

- **CF-03:** **Grouping is annotation, never a different storage shape.** `set_index` stays strictly
  incrementing and never fractional — "1, 2, 3, 3a, 3b becomes 1, 2, 3, 4, 5"
  (`.planning/research/ARCHITECTURE.md` §1, and the comment on `loggedSet.setIndex` itself).
  Sub-entry *display* is decided below; sub-entry *storage* is not open.
  — **Reversibility:** one-way.

- **CF-04:** **The set-number tap target is already built and currently unused.**
  `apps/mobile/components/SetRow.tsx` renders a `Pressable` with
  `accessibilityLabel={`Set ${setIndex} type`}` that wires only `onLongPress` (the note trigger).
  SETS-01 is waiting on its `onPress` — do not introduce a second tap target.

- **CF-05:** **Weights are canonical kg, converted only at the display boundary**
  (`packages/api-contracts/src/units.ts`; Phase 2 D-04, Phase 5 D-05, Phase 6 D-03). `SetRow` renders,
  it never converts. — **Reversibility:** one-way.

- **CF-06:** **Snapshot-on-use** — anything a session's behaviour depends on is frozen onto the
  session row at start and never re-read from the source (Phase 2 D-05, Phase 4 D-01, Phase 5 D-02,
  Phase 6 D-04).

- **CF-07:** **Client-generated UUIDs, aggregate-root ownership, PowerSync as sole ingress.**
  `logged_set` and `session_exercise` are children of `workout_session` — no `user_id`, no
  `server_seq`; ownership and merge ordering resolve once through the root (T-02-03). A new child row
  this phase writes inherits that and needs no sync-rules change.

- **CF-08:** **Manual entry is never fought and never rewritten** (Phase 6 D-09). A value the lifter
  typed is logged exactly as typed. This phase inherits it and D-22 applies it to per-side mode.

- **CF-09:** **Vocabularies live in `packages/api-contracts/`, additive-only, with a Postgres CHECK
  and the same values on the SQLite side** (Phase 4 D-13, Phase 5 D-09, Phase 6 D-06).

- **CF-10:** **Platform divergence is a `.web.tsx` sibling, never a `Platform.OS` branch**
  (`docs/platform-modules.md`). No Xcode or Android SDK on this machine — native claims rest on
  typecheck; web is where this phase is exercised end to end (Phase 5 D-10, Phase 6 D-08).

### A. Set-type switcher

- **D-01:** **Tapping a set number opens a bottom sheet listing the set types; you pick one and it
  closes.** Rejected: inline cycle-through (a mis-tap silently rewrites a logged set's type, and
  reaching `failure` from `normal` costs five taps with no way back) and an anchored popover (a new
  positioning pattern with no precedent and a separate web/native story). The sheet matches every
  other set-row affordance already shipped — `TargetsSheet`, `WarmupSheet`, `NoteSheet`,
  `SessionActionSheet` are all bottom sheets — and honours the success criterion that a plain working
  set gets no slower: a stray tap costs one dismiss, never a wrong type.

- **D-02:** **A non-normal set is marked by extending the existing warm-up badge with a per-type
  glyph**, not by a new row element. `SetRow.tsx`'s `renderWarmupBadge` already renders a 14px
  `bg-secondary` circle carrying `W` ahead of the set-number column, from inside the row itself so
  every consumer gets it (WINDOWS #109). Generalise that one badge slot to `W / D / M / P / F / A`.
  Warm-up stops being a special case, layout is unchanged, and the row keeps its number — which is
  what tells you the set's position in the exercise. Rejected: replacing the set number (loses
  position) and a badge-plus-text-label (the row is already weight/reps/RIR/note-dot/checkmark wide).

- **D-03:** **A set's type stays editable after the checkmark is ticked.** You often realise a set was
  a failure set only once it is over. Consistent with every other field on the row, which Phase 5
  already lets you correct after completion.

- **D-04:** **Partial reps (SETS-05) are a sub-entry attached to a parent set, not a standalone row
  and not a new column.** "10 full then 3 partials" is one logical set with two rows: the parent
  typed `normal`, a child typed `partial` carrying the partial-rep count. This matches how partials
  are actually performed (burned onto the end of a working set, not instead of one), reuses the
  grouping mechanism drop sets need anyway, and needs no schema change. Rejected: a standalone
  `partial` row (the pairing with the set it belonged to is lost) and a second `partialReps` numeric
  column (a new column on `logged_set`, a new keypad field, and a fourth numeric column in an already
  full row). — **Reversibility:** costly — a later move to a dedicated column means a migration plus
  a backfill that re-parents existing children.

### B. Grouping — the one mechanism that serves drops, myoreps, partials and sides

- **D-05:** **`parent_set_id` is the single grouping mechanism for all four features** — drop sets,
  myoreps, partials and per-side logging. One renderer, one add-control, one delete rule, one
  counting rule. Do not invent a second grouping concept for any of them.
  — **Reversibility:** one-way — every read path in Phases 8–10 is written against this shape.

- **D-06:** **Children render indented beneath a parent that keeps its own set number.** The group
  reads as one logical set at a glance and mirrors the `parent_set_id` shape exactly. Rejected: flat
  full-width rows joined by a bracket (weaker grouping signal) and a collapsed summary row (cannot be
  logged into without expanding, which adds a tap to the in-gym path).

- **D-07:** **A parent row is always a real set — there are no empty container parents, ever.** For a
  myorep the parent IS the activation set (you log 15 reps into it and the rest-pause mini-sets attach
  beneath as children). For a drop the parent is the top set. For partials the parent is the working
  set. For per-side see D-20. Rejected: a container-header parent — nothing else in the schema has a
  row with no weight and no reps, and every volume query would have to learn to skip it.

- **D-08:** **The next mini-set is added by an explicit `+` control on the group**, revealed once a
  sub-entry is completed. Never fires on its own, works identically for drops and myoreps, and one
  deliberate tap per mini-set is acceptable because your hands are on the bar between drops anyway.
  Rejected: auto-appending a blank child on completion (a drop set of unknown length always leaves a
  stray empty row to clean up) and choosing the drop count up front (you rarely know beforehand
  whether you have two drops in you or three).

- **D-09:** **Switching a set that has children back to `normal` shows a confirm dialog naming how
  many sub-entries will be lost, then deletes them.** The type and the group are one concept — a
  `normal` set with orphaned children is not a state worth representing. Matches
  `RemoveExerciseDialog`, the destructive-confirm pattern already shipped in
  `apps/mobile/components/SessionActionSheet.tsx`. Rejected: promoting children to standalone sets
  (silently inflates the working-set count) and greying the option out (a dead end that never explains
  itself).

- **D-10:** **The counting rule, and it is one rule for all four features: a parent row is one set
  toward the prescription; children add volume but never increment the set count.** "3 of 4 sets
  done", `session_exercise.target_sets`, and auto-advance all read parents only. This is what keeps a
  drop set from reading as four sets and a per-side set from reading as two.
  — **Reversibility:** one-way — Phase 8's progression rules and Phases 9–10's analytics are both
  written against it.

### C. Supersets

- **D-11:** **A superset is formed and dissolved from the per-exercise action sheet** — add
  `'superset'` and `'detach-superset'` to `SessionExerciseActionId` in
  `apps/mobile/components/SessionActionSheet.tsx`, which already carries
  `'swap' | 'remove' | 'reorder' | 'info' | 'equipment'`. The action pairs the exercise with the next
  adjacent one; the detach action (SETS-08) sits in the same sheet, so forming and undoing are found
  in the same place.

- **D-12:** **The pager keeps two separate exercise pages.** Pairing is shown as a link badge on the
  paired entries in `ExerciseStrip` and a chip on each page header — not as one merged page. The
  shipped pager, `ExercisePage`, `buildSetRows` and the strip all stay structurally intact, and detach
  reduces to clearing a column rather than tearing a merged page apart.

- **D-13:** **Rest is suppressed on every non-final member of a superset group and starts only when a
  set of the final member (highest `order_index` in the group) is completed.** This is literally
  SETS-07's "rest starts only after both are done", expressed without inventing a round counter.
  Today `restTargetAt` is set per-exercise with no notion of a group; the suppression is the new
  behaviour. — **Reversibility:** reversible — one condition at the rest-start call site.

- **D-14:** **Completing a set on a non-final superset member advances to the next member**, gated by
  the same existing auto-advance preference that governs exercise advance — not a new hidden setting.
  Without this a superset means manually swiping back and forth every single set.

- **D-15:** **The UI forms pairs, but every read path must treat `superset_group_id` as a group id of
  N adjacent members and never assume exactly two.** The column is already a group id; giant sets are
  the obvious next ask, and `>= 2` costs nothing to write now.

- **D-16:** **Session-only.** `routine_exercise.superset_group_id` stays null — `days.ts:148` and
  `duplicate-routine.ts:99` both already carry comments saying superset authoring is not built, and
  those comments stay true after this phase. Supersets are formed ad hoc mid-workout on
  `session_exercise`. Program-level authoring is deferred (see Deferred Ideas).

### D. Counting — volume and records

- **D-17:** **One named predicate replaces the four scattered `!== 'warmup'` filters:**
  `countsTowardWorkingVolume(setType)` in `packages/api-contracts/src/session.ts`. `warmup` is the
  only excluded type — `drop`, `myorep`, `partial`, `failure` and `amrap` are all genuine working
  effort and all count. Today the exclusion is a bare literal in four separate places
  (`apps/mobile/lib/db/session-query.ts` `WORKING_SET_TYPE_EXCLUSION`,
  `apps/mobile/lib/db/history-query.ts`, `apps/mobile/lib/db/summary-query.ts`,
  `packages/pr-rules/src/personal-records.ts`); adding five writable types to that arrangement is how
  the four copies drift. Naming it is what makes the rule changeable later in one place, which is the
  point — SETS-06's warm-up exclusion becomes explicit rather than incidental.
  — **Reversibility:** reversible — one predicate body.

- **D-18:** **A second predicate, `countsTowardRecords(setType)`, excludes `warmup` AND `partial`.**
  A partial-ROM rep must never set a `heaviest_weight` or `best_e1rm` PR — that is the one place where
  counting a partial as a full rep produces a wrong, durable, user-visible number.
  `packages/pr-rules/src/personal-records.ts` currently excludes `warmup` only and must switch to this
  predicate. Drops, myoreps, failure and AMRAP sets remain PR-eligible; their weights are low or their
  reps honest, so they cannot pollute a max-based record.

- **D-19:** **`shouldAutoAdvance` must additionally filter to parent rows (`parentSetId === null`).**
  `apps/mobile/lib/session/auto-advance.ts` counts `setType === WORKING_SET_TYPE` rows against
  `targetWorkingSets`; once children exist, drop and per-side children would inflate that count and
  fire advance early — the same class of failure as WINDOWS #136, which the `targetWorkingSets`
  parameter was added to fix. D-10 is the rule; this is the call site that must obey it.

### E. Per-side logging

- **D-20:** **A per-side set is a parent carrying `side = 'left'` and one child carrying
  `side = 'right'`.** No empty container parent (consistent with D-07), no positional pairing (the
  codebase's standing rule is never to infer meaning from `set_index` position —
  `.planning/research/PITFALLS.md`, RESEARCH Pitfall 2). It counts as ONE set toward the prescription
  per D-10, and both rows count toward volume. The row renders as an `L` badge on the parent and an
  `R` badge on the indented child, reusing D-02's badge slot and D-06's indent.

- **D-21:** **Per-side is a per-exercise mode, derived from data — no new column and no migration.**
  An exercise is in per-side mode when any of its sets carries a non-null `side`. The toggle lives on
  the exercise action surface alongside D-11's superset actions. Unilateral-ness is a property of the
  movement, not of an individual set, which is why the toggle is per-exercise rather than per-set.

- **D-22:** **Toggling per-side governs newly created sets only; already-logged single-sided sets are
  never retroactively rewritten** (CF-08). Turning the mode off likewise leaves existing paired sets
  alone and only makes subsequent sets single.

### Claude's Discretion

The user auto-approved the recommended option for every remaining question after the myorep-parent
question, so D-07 and D-11 through D-22 are Claude's recommendations rather than explicitly debated
choices. They are consistent with the four choices the user made directly (D-01, D-02, D-04, D-09 and
the layout/add-control pair D-06/D-08) and with the carried-forward constraints. Any of them may be
overridden at plan review without disturbing the others, with two exceptions: D-05 and D-10 are the
load-bearing decisions the rest hang off.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` — Phase 7 goal, mode (`mvp`), dependency on Phase 6, and the five success
  criteria this phase is verified against
- `.planning/REQUIREMENTS.md` — SETS-01 … SETS-09 (lines 78–86) and their coverage table rows

### The vocabularies and the schema this phase writes into
- `docs/session-vocabularies.md` — the authoritative written-vs-reserved split for `SET_TYPES`; the
  document this phase must update as the five reserved types become written. Also documents
  `WORKOUT_SESSION_STATUSES`, `PR_TYPES`, the three independent `notes` columns, and
  `session_exercise.removed_at`
- `docs/program-vocabularies.md` — the pattern `docs/session-vocabularies.md` was modelled on; follow
  it when publishing any new predicate or constant
- `packages/api-contracts/src/session.ts` — `SET_TYPES`, `WORKING_SET_TYPE`, `WARMUP_SET_TYPE`,
  `PR_TYPES`; where D-17's and D-18's predicates belong
- `apps/api/src/db/schema/session.ts` — `logged_set` (`set_type`, `parent_set_id`, `side`,
  `completed`, `rest_taken_seconds`, the `logged_set_set_type_check` CHECK), `session_exercise`
  (`superset_group_id`, `target_sets`, `removed_at`), `workout_session` (`rest_target_at`)
- `apps/mobile/lib/db/schema.ts` — the SQLite mirror that must stay in parity

### Architecture rules that constrain the shape
- `.planning/research/ARCHITECTURE.md` §1 — set_index is strictly incrementing and grouping is
  annotation, never a different storage shape (CF-03)
- `.planning/research/PITFALLS.md` — including Pitfall 2 (never infer set semantics from set_index
  position) and §9 (the cost of skipping a published vocabulary)
- `docs/platform-modules.md` — the `.web.tsx` sibling convention (CF-10)
- `.planning/CONVENTIONS.md` — project-wide conventions
- `.planning/WINDOWS.md` — the open-window log; #109 (badges belong inside `SetRow`, not its callers)
  and #136 (auto-advance firing early on an incomplete prescription) are both directly relevant

### Prior phase decisions this phase inherits
- `.planning/phases/05-in-gym-session-logging/05-CONTEXT.md` — D-02 snapshot-on-use, D-03/D-04 sync
  ownership, D-05 units, D-09 vocabularies, D-10 web-is-the-proving-ground, D-13 action bar,
  D-16/D-17 previous-actual reference values, D-28/D-29 discard and pause
- `.planning/phases/05-in-gym-session-logging/05-UI-SPEC.md` — the Set Row spec and Amendment A.1
  (long-press note, note dot, accessibility actions) that D-01/D-02 extend rather than replace
- `.planning/phases/06-gym-profiles-plate-math/06-CONTEXT.md` — D-03 canonical kg, D-08 platform
  divergence, D-09 the achievability rule (manual entry is never rewritten)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/mobile/components/SetRow.tsx` — `SetRowView` is hook-free and direct-invocable by tests.
  Already has the unused set-number `Pressable` (CF-04), `renderWarmupBadge` (D-02 generalises it),
  `renderNoteDot`, `setRowFieldState`, `formatFieldValue`, and the `noteActionProps` accessibility
  bridge. Its `warmup?: boolean` prop is optional and additive — the same discipline applies to
  whatever D-02/D-06/D-20 add.
- `apps/mobile/components/ExercisePage.tsx` — `ExercisePageView` renders pre-ordered rows and never
  re-sorts. `ExercisePageSetRow` already carries an optional `setType`; `05-06-SUMMARY.md` records
  that `workout.tsx` does not yet thread it through. That documented gap is this phase's starting
  point, not a bug to rediscover.
- `apps/mobile/components/SessionActionSheet.tsx` — `SessionExerciseActionId`
  (`swap|remove|reorder|info|equipment`) plus `RemoveExerciseDialog`, the destructive-confirm pattern
  D-09 reuses. D-11 extends this union.
- `apps/mobile/components/ExerciseActionBar.tsx` — `ExerciseActionId`
  (`warmup|targets|note|overflow`); the per-exercise surface D-21's per-side toggle attaches to.
- `apps/mobile/lib/db/log-set.ts` — already accepts `parentSetId` and `supersetGroupId` inputs and
  writes them (defaulting to null). The write path for grouping largely exists.
- `apps/mobile/lib/db/session-mutations.ts` — the warm-up write path (`WARMUP_SET_TYPE`) is the
  closest working analog for writing a non-`normal` type.
- `packages/pr-rules/src/personal-records.ts` — pure, well-tested PR detection; D-18 changes one
  predicate in two places (lines 36 and 64).

### Established Patterns
- **Hook-free `*View` + stateful wrapper.** `SetRowView`, `ExercisePageView`, `CycleStripView`,
  `DayDeckView` are all plain functions so tests can invoke them directly with no renderer. Do not
  introduce a new component boundary inside a row — `renderSetField` is deliberately a called
  function, not a `<SetField>` element, for exactly this reason.
- **Optional, additive props.** Every prop added to a shared row so far is optional so existing
  callers (notably `WorkoutSummary.tsx`'s correction rows) render unchanged.
- **Badges render from inside the row, not from its callers** (WINDOWS #109).
- **Set-type filters are explicit, never positional** (RESEARCH Pitfall 2 — cited in both
  `auto-advance.ts` and `ExercisePage.tsx`).
- **Closed vocabularies get a published tuple, a Postgres CHECK, a SQLite mirror, and a doc row.**
- **Schema changes go through `drizzle-kit push` with no migration files** — there is no `./drizzle`
  directory and no `db:generate` script; `pnpm --filter api db:verify` runs
  `test/schema-parity.e2e-spec.ts` against the live database. This phase should need no schema change
  at all (CF-01), which is the cheapest possible outcome under that arrangement.

### Integration Points
- `apps/mobile/app/(tabs)/workout.tsx` — `buildSetRows`, the `WORKING_SET_TYPE` completion path
  (~line 1232), and the `shouldAutoAdvance` call site. The largest single surface this phase touches.
- `apps/mobile/lib/session/auto-advance.ts` — D-19's parent-row filter.
- `apps/mobile/lib/db/session-query.ts` — `WORKING_SET_TYPE_EXCLUSION` (line 211) and its two uses
  (lines 294, 382), plus the `WORKING_SET_TYPE` count at line 428; all become D-17/D-10 aware.
- `apps/mobile/lib/db/history-query.ts` (line 92), `apps/mobile/lib/db/summary-query.ts` (line 186) —
  the other two copies of the warm-up exclusion D-17 replaces.
- `apps/mobile/lib/rest-timer.ts`, `RestTimerBar.tsx`, `RestTimerFullScreen.tsx`, `app/rest-timer.tsx`,
  and `workout_session.rest_target_at` — where D-13's suppression lands.
- `apps/api/src/sync/sync.service.ts` — already validates all seven set types; verify no change is
  needed rather than assuming it.
- `apps/mobile/lib/export/build-export-document.ts` — already emits `parent_set_id`; the export
  document is a downstream consumer of every grouping decision here.

### Test seams to respect
- `apps/mobile/app/__durability.web.tsx` (and its `.tsx` sibling), `apps/mobile/e2e/durability.spec.ts`,
  `apps/mobile/lib/db/durability-harness-key.ts` — the durability harness is an undeclared shared file
  every e2e-bearing plan in this repo ends up editing. Plans that touch it must be dispatched
  append-only so parallel work does not collide.
- Playwright projects are `durability` and `sync` (`apps/mobile/playwright.config.ts`). Browser and
  E2E runs are standing-authorized in this repository (`.claude/CLAUDE.md` § Conventions) — prefer
  executing a spec over asserting it would pass.
- `apps/api/test/poison-pill.e2e-spec.ts`, `patch-partial-update.e2e-spec.ts`,
  `session-annotations-sync.e2e-spec.ts`, `null-weight.e2e-spec.ts` already exercise `side`,
  `parent_set_id` and `completed` round-trips — extend rather than duplicate.

</code_context>

<specifics>
## Specific Ideas

- The success criterion "logging a plain working set is no slower than before this phase existed" is
  the phase's real acceptance bar and drove D-01 (a sheet, so a stray tap is a dismiss rather than a
  wrong type) and D-02 (a badge in a slot that already exists, so the row does not grow). Any plan
  that adds a tap, a field, or a decision to the plain-`normal` path is wrong regardless of what else
  it achieves.
- "10 full reps then 3 partials" is the concrete shape D-04 must produce — one logical set, two rows.
- The four duplicated `!== 'warmup'` filters are treated as a known hazard, not incidental
  duplication: five newly-writable types is exactly the pressure that makes four copies drift apart.

</specifics>

<deferred>
## Deferred Ideas

- **Program-level superset authoring** on `routine_exercise.superset_group_id` — so a superset
  survives from one session of a routine to the next instead of being re-formed by hand each workout.
  Phase 4 territory; `days.ts:148` and `duplicate-routine.ts:99` already carry the comments marking
  the gap. This is the most likely real follow-up ask from dogfooding.
- **Giant sets / three-or-more-member supersets in the UI.** The data model already permits them and
  D-15 requires read paths to tolerate them; only the forming UI is restricted to pairs.
- **A dedicated `partialReps` column on `logged_set`** — rejected as D-04's third option. Revisit only
  if the sub-entry shape proves awkward in real training use.
- **Per-side plate math and independent per-hand dumbbell loads** — the plate strip and achievability
  rule are Phase 6's; extending them to a two-sided set is a Phase 6 amendment, not this phase.
- **Progression rules that read the new set types** (e.g. myorep-driven volume progression) — Phase 8.
- **Analytics that separate partial volume from full volume** — Phase 9/10; D-17 counts partials in
  working volume and D-18 keeps them out of records, which is the minimum honest split for now.

</deferred>

---

*Phase: 7-Advanced Set Types*
*Context gathered: 2026-08-28*
