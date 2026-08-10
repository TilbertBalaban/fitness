# Pitfalls Research

**Domain:** Local-first, cross-platform strength-training app (React Native + React Native Web, NestJS + Postgres) — functional clone of MacroFactor Workouts
**Researched:** 2026-08-10
**Confidence:** MEDIUM-HIGH (stack/sync/RN pitfalls are well-documented community consensus; MacroFactor's exact progression algorithm is partially public — see Pitfall 8 for what is confirmed vs. inferred)

---

## Critical Pitfalls

### Pitfall 1: Last-write-wins silently destroys logged sets on multi-device sync

**What goes wrong:**
Two devices (phone at the gym, browser at home) each hold an offline copy of the same workout. Both mutate it — e.g., the phone logs set 4 while the browser is used to edit set 2 of the same session from history. On reconnect, a naive "latest `updatedAt` wins" sync overwrites the entire row (or entire workout document), silently discarding the other device's changes. The user has no idea a set vanished until they notice missing history days later.

**Why it happens:**
LWW is the simplest sync strategy to implement and looks correct in every manual test where only one device is used at a time. It only fails under true concurrent edits, which developers rarely test for, and clock skew between devices makes "latest" itself unreliable — a device with a fast clock can win even though its edit happened first.

**How to avoid:**
- Model at set/field granularity, not whole-workout granularity — sync each set (and each field group: weight, reps, RIR, completed-at) as its own row with its own version, so a conflict on set 4 doesn't touch set 2.
- Use logical clocks (HLC — hybrid logical clock, or a per-device monotonic counter) instead of wall-clock timestamps for ordering, so device clock skew can't reorder events.
- For append-only facts (a logged set is a fact, not a mutable document) prefer an event-log / CRDT-style model: sets are inserted, not edited-in-place server-side; "editing a set" is itself a new event referencing the original. This makes most conflicts structurally impossible rather than something you have to detect.
- Where true field-level conflicts remain possible (program definition edited on two devices), pick a merge strategy per field type (e.g., last-writer-wins is acceptable for a display preference, unacceptable for a logged set) rather than one global policy.

**Warning signs:**
- Sync layer has a single `updatedAt` compared with `>` to decide the winner.
- No tests exist for "device A and device B both offline, both edit, then both reconnect."
- Support/bug reports describing "a set I definitely logged is gone."

**Phase to address:**
Data model & sync foundation phase (before any UI is built on top of it) — this is the hardest thing to retrofit once workouts exist in production with real user history.

---

### Pitfall 2: Sync engine untested against 1-2 years of accumulated history

**What goes wrong:**
Sync "works" in dev with a handful of seeded workouts, then falls apart once a real user has 18 months of history: initial sync payloads balloon, pagination/cursoring bugs surface only past a few thousand rows, and full-table replication on every app launch turns into a multi-second (or failing) cold start. This is a top real-world offline-first failure mode — the deck and blog sources on 2026 offline-first architecture repeatedly flag this exact scenario.

**Why it happens:**
Developers seed a small dataset for testing and never generate a realistic multi-year corpus. The performance cliff is invisible until real usage.

**How to avoid:**
- Build a seed script that generates 1-2 years of realistic workout history (3-5x/week, ~10-20 sets each) early, and run all sync/perf testing against it, not a handful of hand-entered workouts.
- Sync incrementally by cursor (last-synced-at / server LSN), never full-table replication after initial pull.
- Paginate/chunk initial sync (first login on a new device) so it doesn't try to pull years of history in one request.
- Add a local storage budget/retention conversation early: does the client keep full history forever, or does older history become "cold" (fetched on demand, not kept warm in the reactive local DB)?

**Warning signs:**
- Cold start time or initial-sync time not benchmarked against >6 months of data.
- No cursor/watermark table for incremental sync — every sync run recomputes deltas from scratch.

**Phase to address:**
Data model & sync foundation phase for the cursor design; explicit perf-hardening pass before beta once real usage data exists (self-dogfooding counts).

---

### Pitfall 3: Local schema migrations that brick existing installs

**What goes wrong:**
An on-device SQLite (or WatermelonDB/RxDB) schema change ships without a migration path. Existing installs either crash on next launch or silently lose local, unsynced data. This is the offline-first equivalent of a backend migration with no down-path, except the failure happens on a user's device you cannot SSH into.

**Why it happens:**
Local-first apps get schema-evolution attention on the server (standard practice) but the on-device schema is treated as an implementation detail. It is not — it holds data that may not yet be synced to the server.

**How to avoid:**
- Version the local schema explicitly (`PRAGMA user_version` or equivalent), write every migration as a numbered, ordered, idempotent step, and run them inside a transaction so a failed migration doesn't half-apply.
- Never assume the server schema and client schema evolve in lockstep — version them independently and make the sync protocol tolerant of a client running an older local schema (reject/ignore unknown fields rather than crash).
- Back up (or at minimum, do not destroy) local data before applying a destructive migration; prefer additive migrations (new nullable columns) over renames/drops wherever possible.
- Test every migration against a database seeded with realistic pre-migration data, not an empty one.

**Warning signs:**
- Local schema changes ship without a corresponding migration file/step.
- No test suite runs "upgrade from schema vN to vN+1 with populated data."

**Phase to address:**
Data model & sync foundation phase — establish the migration discipline before the schema has any real users to brick. Revisit at every phase that adds new local tables/columns (program builder, advanced set types, body metrics).

---

### Pitfall 4: Partial sync leaves referential integrity broken

**What goes wrong:**
A workout, its sets, and a PR record are three related rows. If sync pushes/pulls them independently and the connection drops mid-batch, the client (or server) can end up with a set referencing a workout that was never synced, or a PR pointing at a set ID that doesn't exist yet. Symptoms: crashes on join queries, orphaned rows, "phantom" workouts with zero sets.

**Why it happens:**
Simple sync implementations sync "table by table" rather than "aggregate by aggregate," and don't wrap the multi-row push in a transaction (locally or server-side).

**How to avoid:**
- Define sync aggregates (workout + its sets + its notes as one unit) and push/pull them atomically — either the whole aggregate lands, or none of it does.
- Make foreign keys deferrable/validated only at commit, or apply children before parents are marked "synced" and reconcile in a single transaction server-side.
- On the client, treat a workout as "pending sync" until the whole aggregate round-trips; never surface a partially-synced aggregate as if it were complete.
- Add a periodic integrity sweep (client and server) that detects orphaned children and quarantines/repairs them, because "never happens" is not achievable in distributed systems — detection matters as much as prevention.

**Warning signs:**
- Sync code iterates tables independently rather than by domain aggregate.
- No FK constraints enforced locally (SQLite often runs with foreign keys off by default — must be explicitly enabled).

**Phase to address:**
Data model & sync foundation phase for the aggregate design; in-gym logging phase for the client-side "pending sync" state machine.

---

### Pitfall 5: React Native Web platform divergence breaks core interactions

**What goes wrong:**
Components that work perfectly on iOS/Android silently misbehave on web: gesture handlers (swipe-to-delete a set, drag-to-reorder exercises) rely on native gesture responders that don't map 1:1 to mouse/trackpad; `KeyboardAvoidingView` is a no-op on web because there's no software keyboard to avoid; native modules (haptics, background timers, secure storage) throw or silently no-op on web; and popular RN libraries (bottom sheets, native-feeling pickers) either lack a web target or render broken. Accessibility is the sharpest edge: web has keyboard navigation and screen readers baked into the platform, while React Native requires manually building equivalent behavior — a shared component that "just works" on mobile can be entirely unusable via keyboard on web.

**Why it happens:**
"One codebase, two targets" is sold as free cross-platform reach, but RN Web is a compatibility layer, not a native web renderer — every component and every third-party library has to be individually verified to have a working web target, and gesture/keyboard/focus semantics are genuinely different platforms underneath the shared API.

**How to avoid:**
- Treat RN Web as "mostly shared, per-component escape hatch" from day one: use `Platform.select` / `.web.tsx` file extensions for the small set of components where native and web genuinely diverge (gesture-heavy interactions, rest-timer/background behavior, native module usage) rather than forcing one implementation to serve both.
- Audit every third-party native module (haptics, notifications, secure storage, background tasks) for a web-compatible shim before depending on it; budget time to write thin web stubs for the ones that don't have one.
- Decide gesture strategy explicitly: prefer press/tap-based interactions with visible buttons over swipe gestures for anything destructive or important (delete a set) since swipe doesn't translate cleanly to web/mouse and is also a worse "in-gym, sweaty hands" pattern (see Pitfall 6).
- Build keyboard navigation and focus management as a first-class requirement for the web target, not an afterthought — it doesn't come free the way it does with plain HTML.
- The shared-codebase bet is a mistake when a screen's *entire value* is a platform-native interaction (e.g., a highly gestural rest-timer widget, or deep OS integration like Live Activities) — those screens should be platform-specific from the start rather than retrofitted later.

**Warning signs:**
- A component works in the iOS simulator but was never opened in a desktop browser during development.
- Any use of a gesture library or native module without a documented web behavior.
- No keyboard-only pass done on the web build before considering a screen "done."

**Phase to address:**
Foundational — establish the `.web.tsx` escape-hatch convention and the native-module audit process in the client architecture/setup phase, before feature phases pile components on top of an unverified pattern. Re-audit at any phase that introduces gesture-heavy UI (set logging, program builder drag-to-reorder) or background execution (rest timer).

---

### Pitfall 6: In-gym session state lost to app backgrounding/kill

**What goes wrong:**
The classic app-killer: user is mid-workout, switches to Spotify to change a song or answers a text, OS reclaims memory or the rest timer's countdown is tied to JS-thread timers that pause when backgrounded — and the user returns to find the workout reset, the timer stopped silently, or (worst case) unsaved sets gone. iOS aggressively suspends backgrounded apps and only grants narrow background execution windows; Android's Doze mode does the same. JS `setInterval`-based timers do not survive backgrounding reliably on either platform.

**Why it happens:**
Naive implementations keep session state in memory (Redux/Zustand/React state) rather than persisting on every write, and implement the rest timer as an in-JS interval rather than an OS-level scheduled notification.

**How to avoid:**
- Persist every logged set to local storage (SQLite) immediately on entry, not just on "finish workout" — the in-progress workout should be fully reconstructable from disk after a cold app kill, not just a backgrounding.
- Implement the rest timer as a scheduled local notification (`expo-notifications` `scheduleNotificationAsync` with a date trigger, or native `UNUserNotificationCenter`/`AlarmManager`) computed from a wall-clock target time, not a running JS interval — so it fires correctly even if the app is fully backgrounded. Recompute remaining time from the stored target timestamp on foreground, don't trust an in-memory counter.
- Request notification permission proactively (with a clear "so your rest timer can alert you" rationale) since without it, background timer alerts are impossible on iOS — this is a real, known limitation of `expo-notifications` for background delivery and must be designed around, not discovered late.
- Consider platform-native enhancements as a later differentiator, not v1 requirement: iOS Live Activities / Dynamic Island for the rest timer, Android persistent notification with countdown — these need native modules RN Web can't share, reinforcing the escape-hatch pattern from Pitfall 5.
- On resume, always reconcile UI state from the persisted store rather than trusting whatever was in memory before backgrounding.

**Warning signs:**
- Rest timer implemented with `setInterval`/`setTimeout` and no OS-level notification fallback.
- Set logging writes only happen on an explicit "save workout" action rather than per-set.
- No test performed with the app force-quit (not just backgrounded) mid-workout.

**Phase to address:**
In-gym logging / set-tracking phase — this is core to the product's stated value prop ("log every set with zero connectivity... friction kills training apps") and should be validated with real backgrounding/force-quit tests before that phase is considered done.

---

### Pitfall 7: Too much friction per set — the silent app-killer

**What goes wrong:**
Every extra tap, modal, or keyboard-focus round-trip between sets compounds across a session with 20-30+ sets. Common friction sources: a full-screen "add set" modal instead of inline row editing; the numeric keyboard covering the weight/reps input with no way to see what was typed; no smart-default (previous set's weight/reps pre-filled) forcing re-entry of the same numbers 3-4 times per exercise; no quick "repeat last set" action; small touch targets that miss with sweaty/chalked hands; and no undo for a mistyped set (forcing a fumbly edit flow mid-set with a 90-second rest clock running).

**Why it happens:**
These interactions look fine in a slow, careful demo but fail under real gym conditions: one-handed use, time pressure, sweat, gym floor lighting, and a rest timer counting down. Developers who design at a desk underestimate the cost of "just one more tap" 20+ times per session.

**How to avoid:**
- Default every new set to the previous set's weight/reps (or the program's target) so most sets require zero typing, just a confirm tap.
- Keep set entry inline in the exercise row — no navigation away from the workout screen to log a set.
- Use large, high-contrast, thumb-reachable touch targets sized for imprecise/sweaty input (well above minimum platform tap-target guidance).
- Make every logged set trivially editable in place, with a visible affordance (tap-to-edit) rather than a hidden gesture, and make it obviously easy to fix a fat-fingered number.
- Keyboard handling: use a custom numeric input/stepper that never requires the OS keyboard to obscure the value being edited, or ensure the input row scrolls above the keyboard reliably (this is one of the concrete RN/RN-Web divergences from Pitfall 5 — `KeyboardAvoidingView` does not behave the same across platforms and needs explicit per-platform handling).
- Confirm destructive navigation (leaving an in-progress workout) always warns before discarding unsaved state, but never blocks or nags on routine navigation (viewing history mid-workout, etc.).

**Warning signs:**
- Logging a single set requires more than ~2 taps in the common case.
- No smart-default/pre-fill logic — every field starts empty.
- UI never tested one-handed, or never tested with a real timer running under time pressure.

**Phase to address:**
In-gym logging / set-tracking phase — this is the single highest-leverage UX surface in the entire product (per the project's own "gym is the hostile environment" framing) and deserves dedicated design/testing time, not incidental polish at the end.

---

### Pitfall 8: Progression algorithm implemented as a black box instead of MacroFactor's documented rule-based system

**What goes wrong:**
Teams either (a) reach for an opaque ML/heuristic blend that can't explain its own recommendations, contradicting the explicit source-of-truth design goal, or (b) implement "double progression" naively without the guardrails that make it usable in practice — leading to weight that ratchets up forever with no deload, estimated-1RM math that breaks down at high reps, and autoregulation that overreacts to a single bad session.

**What is actually confirmed about MacroFactor Workouts' Smart Progression (from official help-center documentation):**
- It is explicitly **rule-based, not AI/ML** — "changes in weight and reps follow clear rules versus black-box guidance." This directly validates the project's own "no AI/LLM-driven programming" constraint.
- Each programmed set carries a **target rep range and an RIR target** (e.g., "150 lb for 7-9 reps with 2 RIR").
- **Expected performance is computed as: the midpoint of the target rep range, plus the RIR target.** Example given: a 7-9 rep range with 2 RIR → midpoint 8 + RIR 2 = expected 10 reps. Progression triggers when actual logged performance exceeds this expected value.
- For **sets taken to failure (0 RIR)**, progression triggers simply on beating the prior rep count at the same weight (e.g., 11 reps beats a prior 10 reps at 150 lb).
- The system is **explicitly forgiving of imprecise RIR** — "RIR does not need to be perfectly precise. Any reasonable estimate is enough for the system to work well" — and it still recognizes progress even when the user deviates from the assigned RIR (e.g., they log 8+ reps at 3 RIR or 11+ reps at 0 RIR instead of the assigned target).
- There are **two configurable adjustment modes** governing whether the app widens the rep range first or changes weight first:
  - *Expand Rep Range enabled*: when weight can't be bumped to hit the target cleanly, the app widens/raises the rep target instead of the weight (e.g., "100 lb × 8" → "100 lb × 9" rather than forcing "105 lb × 8").
  - *Expand Rep Range disabled* / *Weight Match preferred*: the app stays within the original rep range and prefers matching the previous weight, choosing "100 lb × 9" over "105 lb × 8" when both would satisfy the target.
- Recommendations are **explicitly constrained by available equipment and weight increments** — the app will not recommend a weight the user's configured equipment can't produce.
- The app can **fail to produce a recommendation** and surfaces this explicitly (a warning icon: "Progression unavailable within target rep range") rather than forcing a bad recommendation — e.g., when the weight jump needed to match performance would push reps below the programmed minimum.
- **Missed workouts are explicitly not penalized** — the algorithm works purely off logged history and does not apply a "you missed a session, regressing you" rule.
- Deloads exist as a **program-design choice** (the user/program opts into deload phases when building a program), not as an automatic reactive response to poor performance within Smart Progression itself, based on available public documentation.
- Program auto-generation (Smart Generation) takes goal, muscle-group priority weighting, deprioritized muscle groups, frequency, session duration, equipment/gym profile, split preference, experience level, and deload-inclusion preference as inputs — but the exact volume-landmark math (sets-per-muscle-group formula, MEV/MAV/MRV specifics) is **not publicly documented** and must be treated as a gap, not assumed.

**What is NOT publicly documented (gaps to design around, not copy):**
- The exact numeric thresholds for "hold steady" vs. "regress" when performance falls short of expected (only that progression is withheld — the negative case isn't detailed in public docs).
- Deload trigger logic beyond "user opts in during program setup" — no evidence of an automatic fatigue-triggered deload inside Smart Progression itself.
- The specific e1RM/volume formulas used in Smart Generation.

**Concrete failure modes to design against, from the broader evidence-based-training literature:**
- **Unbounded ratcheting:** double progression without an upper bound (a rep-range ceiling that forces a weight increase, or a program-level deload cadence) will drive weight up indefinitely until form breaks down or the user stalls hard. MacroFactor's model avoids this by keeping progression *bounded by the programmed rep range* and by making deloads a program-structure decision, not an emergent one — replicate the bounded-range mechanic, don't invent unbounded auto-progression.
- **No deload logic = accumulating fatigue with no release valve.** Even if Smart Progression itself doesn't auto-deload, a correct implementation needs *some* mechanism (program-level scheduled deloads, or a manual "back off" affordance) or users on a rule-based system will run into a wall with no software-driven way out.
- **e1RM formulas (Epley, Brzycki) are reliable in the ~2-10 rep range and become materially unreliable above ~10-12 reps** (errors climb sharply into the high-rep/endurance range; different formulas were derived from different datasets/populations). If e1RM or "expected performance" math is used anywhere in the progression or analytics layer, it must either restrict itself to low/moderate rep ranges or swap formulas (Mayhew, Desgorces perform relatively better at higher reps) — never apply one formula uniformly across a 1-30 rep range and present it as precise.
- **Missed sessions must not be misread as regression.** Per MacroFactor's own stated behavior, absence of a logged session should never itself trigger a "reduce weight" recommendation — the next recommendation should be computed purely from the last *logged* performance, with an honest UI cue ("no recent data") rather than a punitive auto-adjustment.
- **Autoregulation overreacting to one bad day:** a system that adjusts hard off a single RIR/rep miss (e.g., a poor-sleep day) produces whiplash recommendations. MacroFactor's tolerance for "reasonable estimate" RIR and its acceptance of off-target-but-still-good performance (8+ reps at 3 RIR still counts as progress) suggests the correct posture is *forgiving bands*, not exact-match triggers — build tolerance windows around the target, not brittle equality checks.
- **Equipment-increment blindness:** a progression engine that recommends "152.5 lb" to a home-gym user who only owns 5 lb plate jumps is useless. MacroFands equipment/increment constraint (confirmed above) must be modeled from day one — progression recommendations should snap to the user's actual available increments (which in turn depend on the plate-math/equipment-profile data model — see Pitfall 10), not a theoretical continuous scale.
- **Ignoring available equipment when Expand-Rep-Range is off:** if weight-match is preferred but the increment can't hit the exact target, the algorithm needs the same "unavailable, hold and flag" fallback MacroFactor documents (the yellow-warning behavior) rather than silently rounding to something arbitrary.

**Warning signs:**
- Progression logic implemented as a single scoring function with tunable weights rather than explicit, auditable rules per rep-range/RIR-target case.
- No handling for "weight increment unavailable" — the algorithm assumes continuous weight.
- No distinction between "no data" (missed workout) and "bad performance" (logged but under target) in the progression trigger logic.
- e1RM used identically across all rep ranges without a validity cutoff.
- No user-facing "why is this the recommendation" surface — undermines the entire "not a black box" value proposition your own project scope commits to.

**Phase to address:**
Dedicated progression-engine phase, sequenced *after* set logging and exercise/program data models are stable (the engine consumes logged history and equipment profiles as inputs) but *before* analytics/PR-detection (which likely reuses the same e1RM and rep-range logic). Treat this as a phase warranting its own focused research pass during roadmap execution given how much of MacroFactor's exact negative-case/deload logic remains undocumented — flag it explicitly for deeper phase-specific research.

---

### Pitfall 9: Domain modeling that can't express real training data

**What goes wrong:**
A schema built around "weight × reps" as the universal unit breaks the moment it meets: bodyweight exercises (load is bodyweight ± added/assisted weight, which is itself sometimes unknown/unlogged), unilateral exercises (left/right sides logged separately, sometimes with different weights/reps), time- or distance-based exercises (planks, farmer's carries, sled pushes — no "reps" at all), and assisted-machine exercises (negative load reduces effective bodyweight load). A schema that hardcodes `weight NUMERIC, reps INTEGER` as required fields on every set forces awkward workarounds later (storing distance-in-reps, faking a weight of 0) that then poison analytics and progression logic built on top.

**Why it happens:**
The vast majority of exercises are weight×reps, so it's the model built first and hardest to generalize afterward without a data migration.

**How to avoid:**
- Model exercises with an explicit **load type** (external weight, bodyweight, bodyweight + added, bodyweight − assisted, time-based, distance-based, unilateral-per-side) from the start, and make the set-logging schema polymorphic enough to carry the right fields per type (weight+reps, duration, distance, per-side weight/reps pairs) rather than forcing every exercise through one shape.
- Decide bodyweight handling explicitly: capture the user's bodyweight-at-time-of-set (or reference their tracked body-metrics history) so historical "bodyweight squat" sets remain meaningful even as bodyweight changes over months — don't silently treat bodyweight exercises as "0 load."
- For unilateral/asymmetrical exercises, decide whether left/right are two child rows of one set or one row with paired fields — this decision ripples into progression (does the engine progress each side independently?) and analytics (volume per side) — make it once, deliberately.
- Keep progression and analytics logic aware of load type — an e1RM calculation, a volume sum, or a PR check that assumes weight×reps will silently produce nonsense (or crash) on a time-based set unless explicitly branched.

**Warning signs:**
- Set table has `weight` and `reps` as non-nullable columns.
- No `exercise.load_type` or equivalent field exists before set-logging UI is built.
- Time/distance exercises are shoehormed into "reps = seconds" as a hack.

**Phase to address:**
Exercise library / data model phase, before set-logging UI is built on top of an assumption that won't hold.

---

### Pitfall 10: kg/lb conversion drift and plate math against non-standard equipment

**What goes wrong:**
Converting between kg and lb with naive rounding (round-trip a value kg→lb→kg) drifts over time and produces displayed numbers that don't match what the user actually lifted, especially compounded across analytics/trend charts. Separately, a plate calculator that assumes a "standard" plate set (45/35/25/10/5/2.5 lb or 20/15/10/5/2.5/1.25 kg) breaks for home-gym users with different increments, fractional/micro plates (0.25/0.5/0.75/1 lb or kg), or gyms with mixed kg/lb equipment.

**Why it happens:**
Unit conversion is treated as a display-layer formatting concern rather than a data-modeling concern; plate math is built once against the developer's own gym's equipment and never generalized.

**How to avoid:**
- **Store the canonical unit once** (pick one internal unit, e.g., kg, store everything in it) and only convert for display — never store user-entered values in whatever unit they typed and convert repeatedly between kg/lb, which is where drift accumulates.
- Round only at the display boundary, using the increment the user's equipment actually supports (see below) — not a fixed decimal-place rule.
- Model **equipment profiles per gym** (already in scope per PROJECT.md: "multi-gym profiles with per-location equipment configuration") as a first-class entity: available plate weights and quantities, bar weight, unit system, and whether fractional/micro plates are present — and make progression/plate-calculator logic query this instead of assuming a standard set.
- Snap progression recommendations and plate-calculator output to the *nearest achievable* combination of the user's actual plates, not a theoretical continuous number (directly ties back to Pitfall 8's equipment-increment constraint).

**Warning signs:**
- Weight values converted kg↔lb more than once through the data pipeline (input → storage → display) instead of stored canonically.
- Plate calculator hardcodes a plate set rather than reading from an equipment-profile entity.
- No handling for "user's gym doesn't have fractional plates" — the calculator recommends micro-adjustments that literally don't exist there.

**Phase to address:**
Exercise/equipment data model phase for canonical storage and equipment profiles; plate-calculator feature phase for the snapping logic once equipment profiles exist.

---

### Pitfall 11: Editing history and deleting exercises silently corrupts downstream analytics

**What goes wrong:**
Two related traps: (1) letting a user retroactively edit a past workout's sets without considering that PRs, progression recommendations, and volume analytics may have already been computed from the old values — edits need to trigger recomputation, not just update the row; (2) allowing an exercise to be deleted (or renamed/merged with a duplicate) when it has logged history, silently orphaning past sets or breaking joins in analytics queries.

**Why it happens:**
Edit and delete flows are built as simple CRUD against the current-state tables, without considering that this app's entire value (progression, PRs, trends) is *derived* from historical data — mutating history has ripple effects that plain CRUD doesn't account for.

**How to avoid:**
- Treat exercise deletion as **soft-delete/archive only** — never hard-delete an exercise with logged history; archived exercises stay queryable for historical sets but don't appear in exercise pickers for new logging.
- When merging duplicate exercises (a near-certain need given ~900 seeded exercises from an open dataset), migrate historical set references to the canonical exercise rather than deleting the duplicate outright.
- When a past set is edited, invalidate/recompute any derived state that depended on it (PR flags, cached e1RM, volume aggregates for that period) rather than leaving stale derived data next to corrected raw data.
- Decide and document a policy for whether retroactive edits are even allowed for synced/finalized workouts, versus only for the currently-in-progress session — unrestricted retroactive editing is a much bigger surface (interacts with sync/conflict logic from Pitfall 1) than editing-in-session.

**Warning signs:**
- Exercise delete is a hard `DELETE` with no check for existing set references (or worse, a cascading delete that takes historical sets with it).
- PR/analytics values are computed once and stored without any invalidation path when source sets change.

**Phase to address:**
Exercise library phase for soft-delete/archive design; analytics/PR-detection phase for the recompute-on-edit invalidation logic.

---

### Pitfall 12: Timezone handling breaks "which day was that workout"

**What goes wrong:**
A workout logged at 11:45 PM local time gets stored in UTC and displayed as the next calendar day after a timezone conversion, corrupting streak calculations, weekly volume aggregation ("Monday" vs "Sunday night"), and program-day sequencing. Travel across timezones compounds this — a workout logged mid-flight or just after landing can land on the wrong local day entirely.

**Why it happens:**
Storing only a UTC instant and re-deriving "the day" via the viewing device's current timezone (rather than the timezone the workout was actually logged in) is the default behavior of most datetime libraries and looks correct until a user crosses a timezone boundary or logs late at night.

**How to avoid:**
- Store both the UTC instant **and** the local calendar date (and ideally the timezone offset) at time of logging — "which day" should be determined by the timezone the set was logged in, not recomputed later from the viewing device's current timezone.
- Aggregate weekly volume / streaks off the stored local calendar date, not a UTC-derived one.
- Decide explicitly how a workout logged while traveling is attributed (local time at the gym, not home timezone) and make that the consistent rule.

**Warning signs:**
- Only a single UTC `timestamptz` column exists on the workout/set tables with no stored local-date field.
- Streak/weekly-volume logic derives "day" via `new Date(timestamp)` on the client without an explicit stored timezone.

**Phase to address:**
Data model phase (add the local-date field up front — cheap now, expensive to backfill correctly later); analytics phase for the aggregation logic that depends on it.

---

### Pitfall 13: N+1 queries on nested workout/program data

**What goes wrong:**
A workout history endpoint that fetches a workout, then lazily loads its sets per exercise, then lazily loads exercise metadata per set, turns into hundreds of queries for a single history screen once real users have real history — the exact nested-relations shape (program → workouts → exercises → sets) this domain is built on is the textbook N+1 setup.

**Why it happens:**
ORMs (TypeORM, Prisma) default to convenient-but-lazy relation loading, and the problem is invisible with a handful of seeded rows, only appearing once history accumulates (compounding with Pitfall 2's "works in dev, falls apart with real history" pattern, but on the backend this time).

**How to avoid:**
- Use eager/explicit relation loading (Prisma `include`, TypeORM `relations`/query builder joins) for known access patterns like "workout with its sets" rather than default lazy loading.
- For genuinely dynamic/GraphQL-style access patterns, use a request-scoped DataLoader to batch relation fetches.
- Watch deeply nested eager-loads (program → many workouts → many sets) for the opposite failure — one enormous over-fetching join — and paginate at the aggregate boundary (fetch N workouts, then their sets, not the whole program tree at once).
- Add query-count assertions in integration tests for the hot endpoints (workout history, program detail) so a regression back to N+1 is caught in CI, not production.

**Warning signs:**
- No query-logging/APM in place during development to notice query counts scaling with row counts.
- Nested relation access in a loop (`for (const workout of workouts) { workout.sets = await getSets(workout.id) }`).

**Phase to address:**
Backend API phase for each nested-data endpoint (workout history, program detail) — verify with a realistically-sized seed dataset, not a handful of rows.

---

### Pitfall 14: Auth/session model that doesn't survive a stale mobile client

**What goes wrong:**
A mobile app store release can sit on a user's device for months without updating (unlike a web app, which can be forced to the latest build on every load). If the backend API has no versioning strategy and breaking-changes a response shape or a required field, old app-store builds start failing in ways that can't be hotfixed without an app-store review cycle — while the web client (deployed continuously) has already moved on. Separately, session/token handling that assumes one consistent client (e.g., short-lived tokens with an aggressive refresh flow tuned for a web SPA) can create silent logout/friction issues on mobile where the app is backgrounded for days between opens.

**Why it happens:**
It's easy to develop backend and (web) frontend in lockstep and forget that the mobile client is decoupled by an app-store release cycle and inconsistent user update behavior — "deploy backend, deploy frontend" muscle memory doesn't account for a client that might be 6 months stale.

**How to avoid:**
- Version the API explicitly (URL or header-based) from the first release, even if v1 is the only version for a while — retrofitting versioning after a breaking change has already shipped to old clients is much harder.
- Treat request/response shape changes as additive-only where possible (new optional fields, not renamed/removed required ones) for any endpoint a stale mobile build might call.
- Design refresh-token/session lifetime for the "backgrounded for weeks" mobile pattern, not just the "tab left open" web pattern — long-lived refresh tokens with silent renewal on foreground, rather than short access-token lifetimes that force re-login after normal mobile usage gaps.
- Have an explicit "minimum supported client version" mechanism (server rejects/prompts-upgrade for clients below a floor) as a release-safety valve once the API needs a genuine breaking change.

**Warning signs:**
- No API version in the URL/headers by the time the first mobile build ships to a store.
- Breaking response-shape changes deployed without a corresponding "old field still present" compatibility window.
- Session expiry tuned only against web-testing sessions (short gaps), never tested against "opened the app after 3 weeks."

**Phase to address:**
Backend/API foundation phase for versioning strategy from the start; auth phase for the mobile-appropriate session/refresh design.

---

### Pitfall 15: Solo full-parity clone scope stalls before shipping anything

**What goes wrong:**
Committing to "feature parity with MacroFactor Workouts' public feature page" as the v1 bar (per PROJECT.md) is a large surface — program builder, auto-generation, granular set logging with advanced set types, per-side tracking, plate calculator, multi-gym profiles, a rule-based progression engine, analytics/PR detection, dashboards, body metrics — built solo, alongside cross-platform client work and a real sync backend. Full-parity-as-v1 projects commonly stall not because any single feature is impossibly hard, but because there is no usable, shippable, self-dogfoodable product until nearly everything is built, so there's no forcing function for real-world testing (which is exactly what earlier pitfalls in this document depend on — real history, real gym conditions, real backgrounding behavior) until very late, and no motivating feedback loop to sustain solo momentum.

**Why it happens:**
Ambitious solo/indie efforts consistently die from undefined intermediate milestones, not from any one feature being too hard — "parity" as the only definition of done means every partial state feels unfinished, which is demotivating over a long solo timeline, and the highest-risk pitfalls in this document (sync-with-real-history, in-gym backgrounding, progression-engine correctness) only surface under real usage that a not-yet-shippable app never gets.

**How to avoid:**
- Sequence phases so a **narrow but real, self-dogfoodable slice** exists early: one-off/unplanned workout logging (already explicitly in scope) + basic set logging + local persistence, usable for the author's own training, well before program auto-generation or the full progression engine exist. This creates the forcing function that surfaces Pitfalls 1-7 under real conditions instead of synthetic tests.
- Order remaining phases by **what unlocks real usage fastest and what other phases depend on**, not by feature-list order on MacroFactor's marketing page: data model/sync foundation → exercise library → manual program building → in-gym logging → progression engine → analytics/PR detection → auto-generation/advanced set types/multi-gym profiles as later, more discretionary phases.
- Explicitly flag which "parity" features are genuinely high-leverage (progression engine, plate calculator, per-side tracking — core to daily use) versus completionist (customizable dashboards, extensive advanced set types) and be willing to sequence the latter last, even if the project's stated bar is full parity — sequencing them last is not the same as cutting them.
- Since this is explicitly also a learning exercise for the RN + NestJS stack, budget real calendar time for the stack-learning curve itself as part of early phases, not as unaccounted overhead that later erodes the schedule for feature phases.

**Warning signs:**
- Roadmap has one giant "everything" phase rather than a sequence with an early self-usable milestone.
- No point in the plan where the author can actually log a real gym session before most features exist.
- Advanced/completionist features (dashboard customization, exotic set types) scheduled before the core logging-progression-analytics loop is solid.

**Phase to address:**
Roadmap/phase-sequencing itself — this is the meta-pitfall the roadmap this research feeds directly exists to prevent.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Store weights in whatever unit the user typed, convert on read | Simpler input form initially | kg/lb drift compounds across analytics (Pitfall 10) | Never — fix before any real user data exists |
| Whole-document LWW sync instead of field/set-level | Much faster to build initially | Silent data loss on concurrent multi-device edits (Pitfall 1) | Never for logged sets; acceptable only for low-stakes preferences (theme, display units) |
| Hardcode weight×reps as the only set shape | Faster first version of set logging | Forces painful migration once bodyweight/time/unilateral exercises are added (Pitfall 9) | Only if genuinely deferring all non-weight×reps exercise types to a later phase, with the schema left extensible |
| No API versioning for v1 | One less thing to build before first ship | Breaking changes strand stale app-store clients (Pitfall 14) | Never — cost to add later is much higher than cost to add now |
| Hard-delete exercises/programs | Simpler delete UX code | Orphaned historical sets, broken analytics joins (Pitfall 11) | Never once any exercise has logged history; fine pre-launch on seed data only |
| JS-interval rest timer, no OS notification | Ships faster, works in every foreground demo | Silently fails the moment the app backgrounds — the exact scenario workouts happen in (Pitfall 6) | Never for v1 — this is core to the stated value prop |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Local SQLite / WatermelonDB / RxDB sync layer | Treating sync as "ships client-side primitives only" and improvising the server pull/push protocol ad hoc as features are added | Design the sync protocol (aggregates, cursors, conflict policy) explicitly up front — these libraries deliberately leave server-side sync design to you; don't discover the protocol incrementally |
| expo-notifications (rest timer) | Assuming background notification delivery "just works" the same as foreground | Known limitation: background local notification delivery on iOS has documented reliability issues in expo-notifications — test explicitly on real devices backgrounded, not just simulators, and compute remaining time from a stored target timestamp, not a live in-memory counter |
| Open exercise dataset (free-exercise-db / wger) | Importing raw dataset fields 1:1 without normalizing load-type, unit, or muscle-group taxonomy against your own schema | Normalize on import: map dataset fields to your explicit load-type/exercise model (Pitfall 9) rather than letting the source dataset's schema leak into your own |
| Postgres logical replication (if using PowerSync/ElectricSQL-style CDC sync) | Enabling CDC/replication as an afterthought once the schema is already large | Decide the sync-transport approach (custom pull/push vs. CDC-based) before the schema is large — retrofitting CDC-based sync onto an unprepared schema is a significant rework |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Full-table sync on every app launch | Cold start grows slower over the user's lifetime with the app | Cursor/watermark-based incremental sync from day one (Pitfall 2) | Noticeable past a few thousand logged sets (roughly 6-12 months of real training history) |
| Lazy relation loading on workout history endpoints | History screen gets progressively slower as history accumulates; query count scales with row count | Eager/explicit relation loading, DataLoader for dynamic access patterns (Pitfall 13) | Noticeable once a user has dozens of workouts with tens of sets each |
| Unbounded local reactive queries (e.g., "all sets ever" bound to a live query) | UI jank / memory growth on screens like full history or all-time analytics | Paginate/windowed queries for long lists; aggregate server-side or in a background job for all-time stats rather than scanning the full local table live | Noticeable past roughly a year of accumulated history |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Long-lived refresh tokens with no revocation path | A stolen/leaked mobile device token grants indefinite access | Implement token revocation (server-side session table, not purely stateless JWT) so a compromised device can be logged out remotely |
| Trusting client-supplied timestamps for sync ordering | A malicious or clock-skewed client can reorder/overwrite other devices' or (if multi-tenant analytics exist later) other users' data | Use server-assigned ordering (server timestamp or sequence) as the authoritative order; treat client timestamps as advisory only |
| No per-user scoping check on nested resource fetches (e.g., fetch set by ID without verifying it belongs to the requesting user's workout) | IDOR — one user can read/edit another user's logged sets by guessing/incrementing IDs | Always scope nested-resource queries through the owning chain (verify workout belongs to user, not just that the set ID exists) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Swipe-only destructive actions (delete a set) | Accidental swipes lose data; doesn't translate to web/mouse (Pitfall 5) | Explicit tap-to-confirm delete, consistent across mobile and web |
| No visible "unsaved changes" indicator when navigating away mid-workout | Users unknowingly lose an edit by navigating back | Persist on every field change (Pitfall 6), or explicit save-state indicator if not persisting immediately |
| Progression recommendation with no explanation | Users don't trust or understand "why 155 lb today," undermining the "not a black box" positioning | Surface the rule that produced the recommendation (rep range, RIR target, prior performance) inline, not just the number |
| Plate calculator ignoring the user's actual gym equipment | Recommends combinations the user physically cannot load | Equipment-profile-aware plate math, scoped per gym (Pitfall 10) |

## "Looks Done But Isn't" Checklist

- [ ] **Offline set logging:** Often missing force-quit recovery — verify a workout survives the app being fully killed (not just backgrounded) mid-session, with all logged sets intact on relaunch.
- [ ] **Multi-device sync:** Often missing true concurrent-edit testing — verify two devices editing the same workout offline, then both reconnecting, converge without silent data loss.
- [ ] **Rest timer:** Often missing background reliability — verify the timer fires a notification/alert when the app is fully backgrounded on a real device, not just the simulator/foreground case.
- [ ] **Progression engine:** Often missing the "no recommendation available" fallback — verify the system degrades gracefully (flags rather than guesses) when equipment increments or rep-range constraints can't be satisfied.
- [ ] **Exercise deletion:** Often missing the historical-reference check — verify deleting/archiving an exercise with logged sets doesn't orphan or corrupt past analytics.
- [ ] **kg/lb display:** Often missing canonical-unit storage — verify round-tripping a value through unit conversion repeatedly doesn't drift the stored number.
- [ ] **RN Web parity:** Often missing a genuine desktop-browser pass — verify every gesture-driven or native-module-dependent screen has been manually tested in a browser, not just assumed to "just work" via RN Web.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| LWW data loss already shipped | HIGH | Requires a data model migration to field/aggregate-level sync plus a one-time reconciliation pass against any server-side audit log/backup to recover what's recoverable; going forward, add append-only event logging so this class of loss becomes detectable/reversible next time |
| Local schema migration bricked installs | MEDIUM-HIGH | Ship an emergency patch that detects the broken schema version and either repairs in place or resets local cache while preserving server-synced data (never resets data that hasn't synced yet without explicit user confirmation) |
| N+1 queries discovered in production | LOW-MEDIUM | Add eager loading / DataLoader to the specific hot endpoints; low cost if caught via monitoring before it causes an outage, higher if it caused timeouts under real load first |
| Progression engine produced bad/unbounded recommendations | MEDIUM | Add the missing bound (rep-range ceiling, deload cadence) and a server-side sanity-check clamp on any recommendation before it's surfaced, as a safety net independent of the rule logic itself |
| Timezone/day-attribution bug discovered late | MEDIUM | Backfill a local-date column from stored UTC + best-guess timezone where recoverable; accept some historical data will need manual correction where the original timezone truly wasn't captured |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| LWW silently destroys sets (1) | Data model & sync foundation | Automated test: two offline devices edit the same workout concurrently, reconcile, assert no data loss |
| Sync untested at scale (2) | Data model & sync foundation | Benchmark sync/cold-start against a seeded 1-2 year history dataset |
| Local schema migrations brick installs (3) | Data model & sync foundation | Migration test suite runs every migration against a populated pre-migration database |
| Partial sync breaks referential integrity (4) | Data model & sync foundation | Integrity sweep job + FK constraints enabled locally; test interrupted mid-sync |
| RN Web platform divergence (5) | Client architecture / setup | Every gesture/native-module-dependent component manually verified in a desktop browser |
| In-gym session loss on backgrounding (6) | In-gym logging / set-tracking | Force-quit-mid-workout test; rest timer fires notification with app fully backgrounded on a real device |
| Too much friction per set (7) | In-gym logging / set-tracking | One-handed, time-pressured usability pass; tap-count audit for the common logging path |
| Progression algorithm gaps (8) | Progression engine (dedicated phase, deeper research flagged) | Explicit test cases: bounded ratcheting, missed-session non-penalty, equipment-increment snapping, forgiving-RIR tolerance bands |
| Domain modeling can't express real data (9) | Exercise library / data model | Schema review against bodyweight, unilateral, time/distance exercise types before set-logging UI is built |
| kg/lb + plate math drift (10) | Exercise/equipment data model + plate-calculator feature | Canonical-unit storage audit; plate calculator tested against non-standard/fractional equipment profiles |
| Editing/deleting corrupts analytics (11) | Exercise library + analytics/PR-detection | Soft-delete enforced; recompute-on-edit test for PR/volume aggregates |
| Timezone "which day" bugs (12) | Data model | Cross-timezone logging test (travel scenario) against streak/weekly-volume aggregation |
| N+1 on nested workout data (13) | Backend API (per nested endpoint) | Query-count assertions in CI against a realistically-sized seed dataset |
| Stale mobile client / API versioning (14) | Backend/API foundation + auth | API version present from first mobile release; session lifetime tested against multi-week app-open gaps |
| Solo full-parity scope stall (15) | Roadmap/phase sequencing itself | Roadmap contains an early, genuinely self-dogfoodable milestone before completionist features are scheduled |

## Sources

- [What Does Progressive Overload Mean in MacroFactor Workouts](https://help.macrofactorapp.com/en/articles/372-what-does-progressive-overload-mean-in-macrofactor-workouts) — official help center, fetched directly (MEDIUM-HIGH; official but general-purpose fetch tooling)
- [What is RIR and How Should I Use It During Training?](https://help.macrofactorapp.com/en/articles/385-what-is-rir-and-how-should-i-use-it-during-training) — official help center, fetched directly
- [Understanding and Using Smart Progressions](https://help.macrofactorapp.com/en/articles/305-understanding-and-using-smart-progressions) — official help center, fetched directly; primary source for adjustment-mode mechanics
- [Create a New Program via Smart Generation](https://help.macrofactorapp.com/en/articles/285-create-a-new-program-via-smart-generation) — official help center, fetched directly; confirms auto-generation inputs, confirms volume-landmark math is not publicly documented
- [MacroFactor Workouts marketing page](https://macrofactor.com/workouts/) — confirms rule-based (non-AI) positioning
- [Stronger by Science — The Science of Autoregulation](https://www.strongerbyscience.com/autoregulation/) — RTF/RIR autoregulation mechanics for comparison against MacroFactor's model
- [1RM formula accuracy comparison sources](https://www.norma-athletics.at/guides/1rm-formulas-explained/) and related — Epley/Brzycki reliability breakdown by rep range
- Web search synthesis (MEDIUM confidence, cross-checked across multiple results) on: local-first/CRDT sync pitfalls, WatermelonDB/PowerSync/RxDB tradeoffs, expo-notifications background delivery limitations, SQLite schema migration/versioning practices, kg/lb and fractional-plate mechanics, React Native Web platform-divergence and accessibility gaps, NestJS/TypeORM/Prisma N+1 query patterns, solo/indie scope-creep failure patterns.
- Gaps explicitly flagged rather than guessed: MacroFactor's exact negative-case (below-target performance) progression thresholds, automatic deload trigger logic within Smart Progression, and the specific volume-landmark formulas used in Smart Generation are not publicly documented as of this research and should be treated as design decisions for this project, informed by but not copied from the general evidence-based-training literature (RP volume landmarks, SBS autoregulation models) cited above.

---
*Pitfalls research for: local-first cross-platform strength-training app (MacroFactor Workouts clone)*
*Researched: 2026-08-10*
