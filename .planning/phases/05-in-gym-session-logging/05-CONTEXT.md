# Phase 5: In-Gym Session Logging - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The user walks into a gym with no signal, starts today's programmed workout or a one-off session, and logs every set — weight, reps, RIR — from start to finish without friction. The rest timer starts itself and alerts through a locked screen. A force-quit loses nothing. Finishing produces a summary of what was trained and what was beaten, and past workouts stay editable afterwards. **This is the phase the app becomes real** — dogfooding starts here, and every later phase is built while training on this one.

**In scope:** The active-workout screen on the Workout tab (today a `PlaceholderScreen`) — exercise pager, set rows, in-app numeric keypad, RIR, one-tap complete/undo, auto-advance, mid-workout add/swap/remove and target adjustment, notes at three levels, auto-calculated warm-up sets. Session lifecycle: starting from the active program (LOG-01) or ad hoc (LOG-02), pause/resume, force-quit recovery, finishing. The rest timer and workout duration timer, including OS-level background notification delivery on native and browser notification on web. The finish summary: muscles trained, per-exercise breakdown, estimated 1RM, and **PR detection** (see D-30). The History tab (today a `PlaceholderScreen`): view, edit, rename, duplicate, delete past workouts, and add a past workout with a chosen date. The schema additions all of that needs on both the Postgres and local-SQLite sides plus their sync rules, and wiring `personal_record` through the server-side sync apply path.

**Out of scope:** Plate calculator, gym/equipment profiles, equipment-aware load snapping — Phase 6. Advanced set types (supersets, drop sets, myoreps, partial reps) and per-side asymmetrical logging — Phase 7; `logged_set.set_type`, `parent_set_id`, `side` and `superset_group_id` already exist on the table and stay at their defaults in this phase apart from the warm-up marker (D-31). Progression recommendations, "what should I lift next" — Phase 8; the weight prefill in D-16 is a history lookup, not a rule, and Phase 8 replaces its source. Browsing records, per-exercise performance charts, weekly volume-against-target, retrospective PR reconciliation and cross-device PR authority — Phases 9–10. Program authoring — Phase 4, complete. No calendar-bound scheduling; the program stays a floating sequence (Phase 4 D-19).

</domain>

<decisions>
## Implementation Decisions

### Carried forward — already locked, do not re-litigate

Constraints this phase inherits, restated so the planner treats them as fixed inputs rather than open questions.

- **D-01:** **Every logged set is durable the instant it is entered.** `apps/mobile/lib/db/log-set.ts`'s `logSet()` already writes the row and returns — no batching, no network call, no deferral to a finish action. This is the mechanism behind success criterion 4, and it is shipped. **This phase must not introduce a draft buffer, an in-memory set list committed on finish, or a "save workout" action that is load-bearing for durability.** The work here is a UI that calls the existing write on every entry plus a regression test proving force-quit recovery, not a new persistence layer. — **Reversibility:** one-way — a set that only becomes durable at finish is a set lost to a force-quit, which is the phase's headline criterion.

- **D-02:** **Snapshot-on-use — the prescription is frozen onto `session_exercise` once at session start and never re-read from `routine_exercise`.** `addSessionExercise` already copies five `target_*` columns via `resolvePrescriptionForCycle`, which resolves `override ?? base` for the session's cycle. Every read of "what am I supposed to do" in this phase reads that snapshot, never the routine. — **Reversibility:** one-way (Phase 2 D-05, Phase 4 D-01).

- **D-03:** **`SyncModule` / PowerSync is the sole ingress for per-user, offline-mutable data.** No REST endpoint writes a set, a session, or a personal record. Any new table this phase adds joins back to `workout_session` (or `user_id` directly) in `ops/powersync/sync-rules.yaml` the same way the existing three do. — **Reversibility:** one-way (Phase 2 D-01).

- **D-04:** **Client-generated UUIDs before any network round-trip** (`apps/mobile/lib/db/id.ts`), and **aggregate-root ownership** — child rows carry no `user_id` and no `server_seq`; ownership and merge order resolve through the root. — **Reversibility:** one-way (Phase 2 D-02, T-02-03).

- **D-05:** **Weights are canonical kg as `numeric`, converted only at the display boundary** (`packages/api-contracts/src/units.ts`, `toCanonicalKg`). The keypad's entry unit is a display concern; nothing stores lb. — **Reversibility:** one-way (Phase 2 D-04).

- **D-06:** **`timezone` and `local_date` are stamped once at session start from the device's IANA zone and no read path ever recomputes them** (`captureCalendarDay`, LOG-22, PITFALLS §12). D-33 defines the single exception.

- **D-07:** **RIR is one number, not a range.** `session_exercise.target_rir`, `logged_set.rir`. `target_rir_min`/`target_rir_max` were removed by user decision in Phase 4 and are gated by `schema-parity.e2e-spec.ts`'s `FORBIDDEN_COLUMNS` — do not reintroduce them. — **Reversibility:** one-way (Phase 4 D-25 amended).

- **D-08:** **Platform divergence is a `.web.tsx` sibling resolved at build time, never a `Platform.OS` branch at a call site** (`docs/platform-modules.md`). NativeWind 4 + `apps/mobile/lib/theme.ts` / `theme-colors.ts`. — **Reversibility:** reversible (Phase 1 D-09/D-11).

- **D-09:** **A shared discriminator vocabulary lives in `packages/api-contracts/`, with a Postgres check constraint and the same values on the local SQLite side.** `PITFALLS.md` §9 is the failure of leaving a discriminator as undocumented free text; Phase 3 paid that cost once with `load_type` and Phase 4 followed the remediation for `cycle.kind` and `routine.status`. Every vocabulary this phase introduces (D-31, D-32) follows the same shape. — **Reversibility:** one-way — the value lands in a `notNull` column and is a published contract.

- **D-10:** **No Xcode and no Android SDK on this machine.** Native claims rest on typecheck plus correct API usage; the web target is where this phase can be exercised end to end. Native observation is deferred to ROADMAP Phase 999.1 and recorded in `.planning/WINDOWS.md`. This bears directly on success criterion 3, which says "verified on a real device" — see D-25.

### The active workout screen — decided by the user

- **D-11:** **One exercise at a time on a swipeable pager, not a scrolling list.** The current exercise fills the screen with its set rows; swipe left/right to move between exercises. Reuses the Phase 4 `DayDeck` pattern and `react-native-pager-view`, both already installed and already proven on the web target. Seeing what's next costs a swipe, which is the accepted trade.

- **D-12:** **A pinned exercise strip sits above the pager.** One chip per exercise in session order, each carrying completion state (`3/4`), the current chip highlighted, tap to jump. Directly reuses the `CycleStrip` component and its visual language from Phase 4 (`04-UI-SPEC.md` § Cycle Strip). The shape of the workout reads at a glance without leaving the page, and this strip is where mid-workout "add exercise" lives.

- **D-13:** **Per-exercise actions split — a compact permanent bar for the frequent three, an overflow menu for the rest.** Warm-up (LOG-17), Targets (LOG-15) and Note (LOG-16) get always-visible buttons beneath the exercise header. Swap, Remove, Reorder and Info live behind a `⋮` on the exercise header. MacroFactor's own action bar (`FEATURES.md` line 53) carries nine actions; splitting keeps the common case one tap without a nine-button band, and leaves the overflow as the landing place for Phase 6's plate math, Phase 7's superset action and Phase 8's progression wand. **Flag for the planner:** the split is a bet on which three stay frequent once Phases 6–8 add their own actions; the bar's contents should be a single list constant, not hardcoded JSX, so re-sorting it later is a data change.

- **D-14:** **Adjusting a target mid-workout is session-only by default; writing back to the program is a separate, explicit action.** The Targets sheet edits this session's numbers immediately — that is, it updates the frozen `session_exercise` snapshot, which is what the set rows read. A distinct "Also update my program" action performs the write-back. A one-off "only got three sets today" can therefore never silently rewrite the program authored in Phase 4. — **Reversibility:** costly — every later read of "what did I intend here" assumes session-scoped and program-scoped edits are distinguishable by which row they landed in.

- **D-15:** **Write-back targets whichever row the displayed value resolved from.** Resolution is `override ?? base` (Phase 4 D-10). If the session's cycle has a `routine_exercise_cycle_target` row for that field, "Also update my program" updates the override; otherwise it updates the base `routine_exercise` row. Writing the base unconditionally would make the edit invisible whenever an override shadowed it — the user changes a number, saves it to their program, and sees nothing change next cycle. **This is a user-initiated edit and is deliberately distinct from Phase 4 D-17**, which reserves *future* cycle overrides as the progression engine's only write target; D-17 constrains the engine, not the person. — **Reversibility:** one-way — the resolution rule and the write rule must agree, and they are read by the builder, the Home next-up card and the session snapshot.

### The set row and the keypad — decided by the user

- **D-16:** **Reps and RIR prefill from the program target; weight prefills from history.** The set row arrives with reps at the target's rep-range value and RIR at `target_rir` — both from the `session_exercise` snapshot (D-02) — so the row trains you toward the program rather than toward repeating yourself. The target carries no weight, so weight prefills with **what you lifted for that same set number the last time you did this exercise**. On a first-ever exercise, weight is blank and the row reads "No previous" rather than showing an empty reference; `FEATURES.md` line 95 records that MacroFactor also refuses to guess a cold-start weight. **Phase 8 replaces the weight source with a real recommendation** — the row is shaped now to receive one, and the lookup must be a single named function so that swap is one call site. — **Reversibility:** costly — the prefill source is read by the row, by the summary's "did you beat it" comparison, and later by Phase 8's replacement.

- **D-17:** **The previous session's actual weight and reps stay visible in the row, greyed, alongside the prefilled fields, and remain tappable to overwrite them.** This is LOG-03 and LOG-04 read literally, and it is the affordance `FEATURES.md` § In-Gym Logging UX item 1 identifies as the single most-cited highlight in competitor reviews. The prefilled value and the reference value are different numbers in the common case (target reps vs. what you actually hit), so both must be legible in the same visual unit.

- **D-18:** **RIR is a third field on the row, prefilled from the snapshot's target.** Weight | Reps | RIR side by side. The keypad's next-arrow walks weight → reps → RIR → complete, and changing RIR later (LOG-06's "change it mid-workout") is tapping the same field, not a separate flow. **Flag for the planner:** three numeric fields plus two greyed reference values on one row is the phase's tightest layout constraint — `04-UI-SPEC.md`'s wrap-and-grow rule (no `numberOfLines`, no `ellipsizeMode`, no `allowFontScaling={false}`) applies, and the row must survive maximum OS accessibility font scale.

- **D-19:** **One tap on the checkmark completes a set; a second tap undoes it, in place, never an edit mode.** `FEATURES.md` line 57 and PITFALLS §7 both name this: in-session mistake correction must be faster than, and separate from, historical editing. Undo restores the row to editable with its values intact.

- **D-20:** **The in-app numeric keypad docks at the bottom and appears on field focus** — *delegated to Claude, resolved here.* Calculator-style: digits, decimal, backspace, `+`/`−` steppers and a next/submit arrow. The set row scrolls clear above it and the value being edited is never obscured (LOG-05). The OS keyboard is never invoked for weight, reps or RIR. **The band directly above the keypad is reserved for Phase 6's live plate-breakdown strip** (`FEATURES.md` line 56) — the layout must leave that space addressable rather than assuming the keypad is flush to the row. Rejected: an always-docked keypad (costs a permanent third of the screen while reading), and stepper-primary entry (60 kg → 100 kg by stepper is absurd, so the keypad still does the real work behind an extra tap). — **Reversibility:** reversible.

### Rest timer and background alerts — decided by the user

- **D-21:** **The rest timer is a persisted wall-clock target timestamp, never a JS interval.** Completing a set stores the target time on the session and schedules an OS-level alert for it. Remaining time is **recomputed from the stored timestamp on every foreground**, never carried in an in-memory counter — `PITFALLS.md` §6 is precisely this failure, and a JS `setInterval` does not survive backgrounding on either platform. — **Reversibility:** one-way — a timer that stops when the phone locks is the named loved-vs-abandoned divider for this product category, and success criterion 3 fails without it.

- **D-22:** **Notification permission is requested during onboarding, before any workout.** The gym floor is never interrupted by an OS dialog. **Recorded risk, accepted by the user:** asking before the user has any reason to care is the classic route to a permanent denial, and on iOS a denial is only reversible in Settings. The rationale copy must therefore carry its weight at onboarding time ("so your rest timer can alert you with the phone in your pocket"), and the workout settings must expose a re-request path that deep-links to Settings when the OS will no longer prompt.

- **D-23:** **A denied permission degrades to in-app sound plus haptic, with a persistent inline note — never a silently dead timer** — *resolved by Claude, the half D-22's option did not cover.* The countdown still runs and still alerts whenever the app is foregrounded; the workout screen carries a dismissible-but-recurring note stating that background alerts are off and how to turn them on. Nothing about the timer may appear to work while quietly not working.

- **D-24:** **Both timers live in a persistent header bar** — workout duration counting up on the left, rest counting down on the right, above the exercise strip. MacroFactor's own layout (`FEATURES.md` line 52). Tapping the rest timer opens the full-screen view with extend and skip (LOG-10). The rest timer is dormant-but-present between sets rather than appearing and disappearing, so its position never moves under a thumb.

- **D-25:** **The web target gets real browser notifications, behind the same `.web.tsx` seam.** One rest-timer module with a `.web.tsx` sibling per D-08: native schedules an `expo-notifications` alert at the wall-clock target, web requests browser notification permission and posts one at the same target. Both recompute from the stored timestamp, so a throttled or hidden tab shows the correct number the instant it is visible again. **This is what makes criterion 3 partly verifiable now** — the background/lock-screen half is only observable on a device and must be filed as a `.planning/WINDOWS.md` unrun-verify entry against Phase 999.1, exactly as Phases 1–2 did. `expo-notifications` is **not currently installed**.

- **D-26:** **Rest starts from `session_exercise.target_rest_seconds` — the snapshot value, already resolved through the cycle override — and stops and clears at zero after alerting.** No overtime count-up. Actual rest taken is written to `logged_set.rest_taken_seconds`, a column that already exists and is currently never written. Rejected: seeding the duration from last session's actual rest, which would make the program's rest target decorative and drift upward every session with no rule pulling it back.

- **D-27:** **Extend adds a fixed increment and reschedules the notification; skip cancels it** — *resolved by Claude.* Both operate on the stored target timestamp, so both survive backgrounding identically to the original schedule. Undoing a completed set (D-19) while its timer runs cancels the scheduled alert.

### Session lifecycle — decided by the user

- **D-28:** **An in-progress session surfaces as a banner on Home; you tap in.** Launching lands on Home as usual, with an unmissable "Workout in progress — 47 min" banner above the Phase 4 next-up card, carrying both a resume and a discard action. Chosen over silent auto-resume because a session abandoned days ago and forgotten is the case that silent resume handles worst. **Consequence for the Home tab:** `apps/mobile/app/(tabs)/index.tsx` gains this banner above the existing next-up card, and the banner's presence must not cost a query on the common path where no session is open.

- **D-29:** **Pause is a deliberate action that stops the duration clock; a crash is not a pause.** LOG-12's pause/resume is a menu action on the session, distinct from and unrelated to force-quit recovery. Duration accounting must therefore be derived from `started_at` plus accumulated paused time, not from a single elapsed subtraction — see D-32 for the schema this needs.

### Summary, PRs and history — decided by the user

- **D-30:** **PR detection ships in Phase 5, not Phase 9.** The summary computes muscles trained (from the Phase 3 `exercise_muscle_mapping`, already local), a per-exercise breakdown of sets/reps/weight/volume, estimated 1RM, and **PRs achieved during the session** across heaviest weight, best estimated 1RM, most reps at a weight, and best set volume — written to the existing `personal_record` table. Phase 9 then adds browsing, retrospective reconciliation, and the multi-device authority rule; Phase 10 adds recompute-on-history-edit. **Two consequences the planner must budget for:**
  1. `personal_record` is one of the **nine tables with no server-side sync apply path** in `apps/api/src/sync/sync.service.ts` (WINDOWS #19) — a push of a PR row is currently rejected as `unknown_table`. Wiring it is part of this phase, not an assumption.
  2. **The PR rules must live in one shared pure module, imported by both client and server** — the same argument `ARCHITECTURE.md` §4 makes for the progression engine, and the precondition for Phase 10 criterion 4 ("a PR set on one device is authoritative across all of them"). `packages/progression-engine` is the existing precedent for a shared pure package; the planner decides whether PR rules join it or get their own. Do not write the rules inside the mobile app.
  — **Reversibility:** one-way — `personal_record` rows written under one rule set and reconciled under another in Phase 10 is exactly the stale-derived-data failure `PITFALLS.md` §11 describes.

- **D-31:** **Estimated 1RM is shown only where the formula is valid** — *resolved by Claude, aligning with Phase 9's criterion 5 rather than deferring it.* Epley and Brzycki both degrade badly above roughly 10–12 reps; a summary that prints a confident 1RM off a set of 20 is worse than one that prints nothing. The estimator returns a nullable value and the breakdown renders the absence explicitly. The estimator belongs in the same shared module as D-30's PR rules, since best-estimated-1RM is one of the four PR types.

- **D-32:** **Editing a past workout reopens the workout screen in an editing mode** — the same pager, set rows and keypad, not a separate history editor. Maximum reuse, one entry surface to build and get right. **Recorded risk, accepted by the user:** the logging screen is built around a live session with running timers and auto-advance, and bolting a past-tense mode onto it is how criterion 4's state confusion gets in. Mitigation is structural, not a flag read at ten call sites: **edit mode must make the live-session machinery unreachable rather than merely inactive** — no timer scheduling, no auto-advance, no rest state, header shows the session's date instead of a running clock, and the primary action is Done rather than Finish. The planner should treat "which of these two modes am I in" as a single typed session-context value provided once at the screen root.

- **D-33:** **Adding a past workout is its own entry point in History**, distinct from starting a programmed workout (LOG-01) and starting a one-off (LOG-02). It opens the editing screen with a date already chosen. **Recorded trade, accepted by the user:** this is a third session-creation path, so all three must funnel through one `startSession` call with a date parameter rather than three call sites that each stamp their own columns. **The date is the single exception to D-06**: choosing or editing a session's date rewrites `timezone` and `local_date` together, deliberately, in one named function that is the only code in the repository permitted to overwrite what session start stamped. Rotation position self-heals because `resolveNextUp` derives from `local_date` (Phase 4 D-20) rather than a stored cursor. — **Reversibility:** one-way — a second place that writes those two columns is `PITFALLS.md` §12 reopened.

### Claude's Discretion

The user delegated schema-level decisions in Phase 4 and the same split holds here — consulted on interaction, delegating the model. These are resolved by the researcher and planner, with the constraints already fixed above:

- **Schema additions.** Notes at set, exercise and session level (LOG-16) — three nullable `text` columns on `logged_set`, `session_exercise` and `workout_session`, or a separate note table; decide once and record why. Pause accounting for D-29 — an accumulated-paused-seconds column plus a paused-at timestamp is the obvious shape, but it must reconcile under row-level LWW across two devices. The `workout_session.status` vocabulary is currently free text (`'in_progress'`, `'completed'` are both written as string literals today, and `next-up.ts` compares against a local `COMPLETED` constant) — D-09 says it becomes a published contract with a Postgres check and a matching SQLite side, and this phase is where `'paused'` and any abandoned state force the issue.
- **The warm-up set marker (LOG-17).** `logged_set.set_type` already exists as free text and is written as `'normal'`. Warm-up is the first real second value, so `set_type` is the vocabulary D-09 applies to — and it must be defined so that Phase 7's drop/myorep/failure/partial values are additive, not a redefinition. `packages/api-contracts` is the home.
- **The warm-up scaling ruleset (LOG-17).** Auto-calculated warm-up sets scaled off the working weight, with the behaviour toggleable off. The ruleset is deterministic and testable, so it belongs with the other shared pure code (D-30), not in a component. Decide whether generated warm-ups are materialized as real `logged_set` rows at generation time or rendered as un-persisted suggestions until completed — this determines what a force-quit restores.
- **Auto-advance (LOG-13).** A page turn on the D-11 pager when an exercise's sets are complete, with a Feature Settings toggle defaulting on. `FEATURES.md` item 6 records that a hardcoded auto-advance with no override is a regression versus MacroFactor. Where the toggle is persisted (`user_preference` is the obvious row) is open.
- **Starting a one-off (LOG-02) and adding exercises mid-workout (LOG-14).** Both open the Phase 3 catalog in multi-select — the same surface Phase 4's D-24 established via `ExercisePickerModal`. A one-off session has `routine_day_id = null`, so `addSessionExercise` takes the `EMPTY_PRESCRIPTION` path and every target renders as unset; confirm the row degrades legibly rather than showing zeros.
- **Sync rules and the server apply path.** Any new table needs a joined query in `ops/powersync/sync-rules.yaml` walking back to `workout_session`. Beyond D-30's `personal_record`, check whether anything else this phase writes is among WINDOWS #19's nine unwired tables.
- **Query shape.** `PITFALLS.md` §13 names nested session data as an N+1 setup. The workout screen holds a whole session open; the summary aggregates it; the History list must not cost a query per session. `next-up-query.ts` is the house pattern — one select per table, assembled in memory, with a comment saying so.
- **Screen-on behaviour.** `expo-keep-awake` is not installed. Whether the screen should be held awake during an active session is a real in-gym question (PITFALLS §6 mentions users "forced to keep the screen awake") that no requirement names.
- **Two devices, one session.** Nothing in the requirements says what happens when a session is in progress on the phone and the browser at once. Row-level LWW will converge the rows; whether the UI should notice is an open design question, and `PITFALLS.md` §1 is the warning about what LWW does to logged sets.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` "Phase 5: In-Gym Session Logging" — the six success criteria, and the Phase 6/7/8/9 boundaries this phase must not cross.
- `.planning/REQUIREMENTS.md` lines 53–74 — LOG-01 through LOG-22 verbatim. LOG-22 is already complete (Phase 2).
- `.planning/PROJECT.md` — core value, the local-first constraint, "the gym is the hostile environment", and the rule-based-not-AI commitment.

### The write path — read before touching any logging code
- `apps/mobile/lib/db/log-set.ts` — `startSession`, `addSessionExercise`, `resolvePrescriptionForCycle`, `logSet`. The whole existing write path. D-01, D-02 and D-16's set-index arithmetic all live here.
- `apps/api/src/db/schema/session.ts` — `workout_session`, `session_exercise`, `logged_set`. Read the column comments: they record why `session_exercise` carries no `user_id`, why `weight_kg` is `numeric` and not a float, why `set_index` is strictly incrementing and never fractional, and why the RIR range was removed.
- `apps/api/src/db/schema/records.ts` — `personal_record`, the table D-30 starts writing.
- `apps/mobile/lib/db/schema.ts` — the local SQLite mirror; gains every column this phase adds.
- `apps/mobile/lib/calendar-day.ts` — `captureCalendarDay`, the only writer of `timezone` and `local_date` (D-06, D-33).
- `ops/powersync/sync-rules.yaml` — the existing session-scoped joins any new table must copy; read the header comment on why this is Edition 3 Sync Streams.
- `apps/api/src/sync/sync.service.ts` — the server-side apply path. Nine tables including `personal_record` are currently rejected as `unknown_table` (WINDOWS #19).

### The reference product and the UX bar
- `.planning/research/FEATURES.md` lines 51–75 — MacroFactor's own in-workout logging surface: the two header timers, the action bar, the set table columns, the custom keypad, tap-to-undo, RIR entry, and the completion summary.
- `.planning/research/FEATURES.md` lines 170–190 (§ In-Gym Logging UX Deep Dive) — the ten findings separating loved from abandoned loggers. Items 1, 2, 3, 4, 5, 6 and 8 are each a requirement in this phase.

### Pitfalls this phase must not walk into
- `.planning/research/PITFALLS.md` §6 — in-gym session state lost to backgrounding/kill. The direct source of D-01, D-21 and D-28, including the `expo-notifications` background-delivery caveat.
- `.planning/research/PITFALLS.md` §7 — too much friction per set. The source of D-16 through D-20; read the warning-signs list as an acceptance checklist.
- `.planning/research/PITFALLS.md` §5 — React Native Web platform divergence; the live risk behind D-25.
- `.planning/research/PITFALLS.md` §11 — editing history corrupting downstream analytics; behind D-30 and D-32.
- `.planning/research/PITFALLS.md` §12 — timezone handling; behind D-06 and D-33.
- `.planning/research/PITFALLS.md` §13 — N+1 on nested session data.
- `.planning/research/PITFALLS.md` §1 — LWW silently destroying logged sets on multi-device sync; behind the two-devices-one-session discretion item.

### Architecture
- `.planning/research/ARCHITECTURE.md` §1 — the `WorkoutSession` / `SessionExercise` / `LoggedSet` entities and the ruling that grouping is annotation columns, never a different storage shape.
- `.planning/research/ARCHITECTURE.md` §4 — "Progression Engine Placement: Client-Side, Always" and the one-shared-pure-package argument D-30 applies to PR rules.

### What Phases 1–4 built and locked
- `.planning/phases/04-program-builder/04-CONTEXT.md` — D-01 (snapshot-on-use), D-10 (sparse cycle overrides), D-17 (engine write target), D-20 (position derived from history), D-24/D-25 (picker and inline expansion).
- `.planning/phases/04-program-builder/04-UI-SPEC.md` — the shipped design system: spacing scale, typography, colour, phase-wide rules, and the Cycle Strip contract D-12 reuses. The wrap-and-grow rule in § Phase-Wide Rules governs D-18's three-field row.
- `.planning/phases/02-data-model-sync-engine/02-CONTEXT.md` — D-01 (sync ingress), D-02 (client UUIDs), D-04 (kg canonical), D-05 (snapshot-on-use).
- `.planning/phases/03-exercise-catalog/03-CONTEXT.md` — the catalog delivery model and the picker components this phase reuses.
- `docs/platform-modules.md` — the `.web.tsx` convention and the native-capability web audit; the governing document for D-25 and for adding `expo-notifications`.
- `docs/native-verification.md` — how native-unverifiable claims are recorded.
- `docs/program-vocabularies.md` — the precedent for how a shared discriminator vocabulary is documented and enforced; D-09's vocabularies follow its shape.
- `.planning/WINDOWS.md` — open defect register, 87 entries. #19 (nine unwired sync tables) is load-bearing for D-30; #16/#17 record that native op-sqlite is entirely unexercised.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/mobile/lib/db/log-set.ts` — the entire write path already exists and is tested. This phase builds a UI on top of it, and extends it for notes, warm-up marking and the D-33 date parameter.
- `apps/mobile/components/CycleStrip.tsx` — the visual language and interaction D-12's exercise strip reuses.
- `apps/mobile/components/DayDeck.tsx` — the `react-native-pager-view` wrapper D-11's exercise pager reuses, including its web behaviour.
- `apps/mobile/components/ExercisePickerModal.tsx` — Phase 4's multi-select catalog picker; serves both LOG-02 (one-off) and LOG-14 (add mid-workout).
- `apps/mobile/components/` — `DetailSection`, `TextField`, `PrimaryButton`, `ArchiveDialog`, `ErrorBanner`, `NavBackButton`, `MuscleTargetList`, `SwapSuggestionList`. `MuscleTargetList` is a candidate for the summary's muscles-trained band; `SwapSuggestionList` and `lib/catalog/smart-swap.ts` already exist for LOG-14's swap.
- `apps/mobile/lib/programs/next-up.ts` — pure, database-free, clock-free position resolution. The model for how this phase's pure logic (PR rules, warm-up scaling, 1RM estimation) should be shaped: arguments in, no ambient state, every boundary a unit test.
- `apps/mobile/lib/db/programs/next-up-query.ts` — the house read pattern: one select per table, assembled in memory, with the N+1 reasoning written down.
- `packages/progression-engine` — an existing shared pure package, currently near-empty. The precedent (and possibly the home) for D-30's PR rules and D-31's estimator.
- `@shopify/flash-list` 2.0.2 — the installed virtualized list; the History list is the obvious consumer.
- `react-native-gesture-handler`, `react-native-reanimated` 4, `react-native-pager-view`, `react-native-tab-view` — all landed in Phase 4 and are New-Architecture compatible on Expo SDK 57. **The library risk that dominated Phase 4 does not exist here.**

### Established Patterns
- **Per-set durable writes** — every mutation is a local SQLite write that succeeds offline and reconciles on sync. There is no "save" button anywhere in this codebase.
- **Aggregate-root ownership** — child tables carry no `user_id` and no `server_seq`.
- **Pure logic separated from its reader and its renderer** — `next-up.ts` (pure) vs `next-up-query.ts` (reads) vs the screen (renders). Follow this three-way split for the summary and PR detection.
- **Platform divergence is a `.web.tsx` sibling**, never a `Platform.OS` branch.
- **Suite integrity is enforced by a Jest reporter** (`scripts/jest-suite-integrity.cjs`) — a zero-test, skipped-test or empty-suite run fails. New surfaces need real tests.
- **`apps/api` has no `test` script by design** — every API test is end-to-end. Schema changes are verified by `test/schema-parity.e2e-spec.ts` via `pnpm --filter api db:verify`, and schema changes ship as `drizzle-kit push` with no migration file (recorded convention, see the comment in `session.ts`).

### Integration Points
- `apps/mobile/app/(tabs)/workout.tsx` — a `PlaceholderScreen` today; becomes the active-workout screen (D-11 through D-24).
- `apps/mobile/app/(tabs)/history.tsx` — a `PlaceholderScreen` today; becomes the session list plus D-33's add-a-past-workout entry point.
- `apps/mobile/app/(tabs)/index.tsx` — carries Phase 4's next-up card; gains D-28's in-progress banner above it.
- `apps/mobile/lib/db/log-set.ts` — extended, not replaced: notes, warm-up `set_type`, `rest_taken_seconds` (currently never written), and the D-33 date parameter.
- `apps/mobile/lib/programs/next-up.ts` — already answers "what is today's workout"; LOG-01's start action consumes its `{ kind: 'workout', cycle, day }` result and feeds `cycleId` into `addSessionExercise` so the snapshot resolves the right cycle's overrides.
- `apps/api/src/sync/sync.service.ts` and `ops/powersync/sync-rules.yaml` — both need `personal_record` wired (D-30) plus any new table.

### The phase's largest risks — flagged, not solved
1. **Success criterion 3 says "verified on a real device" and no device exists on this machine.** Every other criterion can be exercised on web. This one cannot be fully closed in this phase; D-25 splits it into a web half that is verifiable now and a native half that becomes a `.planning/WINDOWS.md` entry against Phase 999.1. The planner must not plan around this by weakening the criterion.
2. **`expo-notifications` is not installed and its background-delivery reliability is a standing research flag** carried in STATE.md since Phase 2. It is the one dependency in this phase whose behaviour cannot be established by reading docs.
3. **`personal_record` has no server-side apply path** (WINDOWS #19). D-30 makes this phase's problem.
4. **D-32's dual-mode workout screen** is the phase's main state-confusion risk, accepted knowingly. The mitigation is structural (one typed session context at the screen root), not a boolean threaded through components.

### Environment constraint
No Xcode and no Android SDK. The web target is where this phase gets exercised end to end; Phase 2 established that a real browser driving a real PowerSync Service against real Postgres is the bar, and three production sync bugs invisible to unit tests only surfaced that way.

</code_context>

<specifics>
## Specific Ideas

- **"Prefill from the program, reference from history."** The deliberate split in D-16/D-17: the fields train you toward what you're supposed to do, the greyed numbers beside them tell you what you actually did. Most loggers conflate the two by prefilling from history; this one does not.
- **The exercise strip should read like the workout at a glance** — the same way Phase 4's cycle strip reads like the mesocycle. Completion state per chip, current chip highlighted, the whole session legible without leaving the page.
- **Weight is never guessed.** A first-ever exercise shows "No previous" and an empty weight field rather than inventing a number — `FEATURES.md` line 95 records that MacroFactor makes the same call, deliberately.
- **The band above the keypad belongs to Phase 6.** D-20 reserves it now so the plate-breakdown strip is a fill rather than a relayout.
- **A crash is not a pause.** D-29's distinction: pause is something the user does, recovery is something the app owes them. They share no state.

</specifics>

<deferred>
## Deferred Ideas

- **Live PR banner mid-set** — surfacing a PR the moment the set is logged rather than only in the summary (Hevy's signature moment, `FEATURES.md` line 152). Small once D-30's detection exists, but nothing in LOG-18 asks for it.
- **iOS Live Activities / Dynamic Island and an Android persistent countdown notification** for the rest timer — `PITFALLS.md` §6 explicitly names these as "a later differentiator, not a v1 requirement". They need native modules RN Web cannot share.
- **Superset rest semantics** — rest starting only after both paired exercises' sets are done. A real logic branch in the D-21 trigger, and Phase 7's subject.
- **Rest-timer defaults configurable per program or per exercise** — `FEATURES.md` line 70. This phase reads `target_rest_seconds` from the snapshot; authoring it per-exercise is already Phase 4's surface, and a program-level default is unrequested.
- **Screen-kept-awake during a session** (`expo-keep-awake`) — listed under Claude's Discretion because it may be trivially right, but no requirement names it and it is a real battery decision.
- **Two-device concurrent session handling** — LWW will converge the rows regardless; whether the UI should detect and surface it is unrequested and belongs with Phase 10's cross-device reconciliation work.
- **Program export/import** to share a routine with a friend — noted in `FEATURES.md` as the cheap legitimate alternative to a social feed. Not in any phase.

</deferred>

---

*Phase: 5-in-gym-session-logging*
*Context gathered: 2026-08-23*
