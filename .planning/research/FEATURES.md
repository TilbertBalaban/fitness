# Feature Research

**Domain:** Strength-training / workout-logging app (MacroFactor Workouts functional clone)
**Researched:** 2026-08-10
**Confidence:** MEDIUM-HIGH (primary source: official MacroFactor help center, quick-start PDF read directly, and app feature page; competitor claims are cross-checked across 2+ independent secondary sources but not hands-on tested — see per-section notes)

## Source Note on Confidence

MacroFactor Workouts launched publicly in Q1 2026 (Jeff Nippard co-owns MacroFactor; the workouts app is a companion to MacroFactor's nutrition-coaching product). Findings below draw on:
- **HIGH confidence:** `macrofactor.com/wp-content/uploads/.../Workouts-Quick-Start-Guide.pdf` — read directly (not LLM-summarized), first-party, screenshots of actual UI.
- **MEDIUM confidence:** `help.macrofactorapp.com` help-center articles — first-party official documentation, but content below was extracted via an intermediate summarization step; cross-checked across 2+ independent fetches per topic where noted.
- **LOW confidence, flagged inline:** single-source claims, numeric figures that varied between fetches (e.g., exercise/video counts), and any competitor claim not independently verified against a second source.

There is essentially no r/macrofactor Workouts-specific discussion indexed yet (the workouts product is too new — general web search surfaced only the nutrition-app subreddit). This is a **gap**: real user complaints about the workouts logger specifically (bugs, friction points) are not yet searchable in volume. Treat the "what users complain about" claims in this doc as coming from *analogous* logger apps (Strong, Hevy, Boostcamp) that are longer-lived, not from MacroFactor Workouts itself, unless stated otherwise.

---

## MacroFactor Workouts — Full Feature Surface (Primary Source Deep Dive)

This section enumerates the actual product surface, mapped from the official quick-start guide, feature page, and ~20 help-center articles (help center has **99 articles across 8 collections**: Dashboard, Programs, Workout Logging, Exercises, History and Insights, Body Metrics and Progress Photos, Settings/Misc, FAQ — this article count/structure itself is a good proxy for feature surface breadth).

### Exercise library
- 900+ exercises (some sources say the video-demo subset is 600+, another said 638 — **numeric discrepancy, LOW confidence on exact figure**, but "900+ trackable, ~600+ with video" is the consistent shape).
- Each exercise's info screen shows: video demo (multiple camera angles), written setup/technique cues, target muscles, stability ranking, range-of-motion ranking, equipment requirements, joint actions, and **bodyweight contribution** (i.e., what % of bodyweight loads the movement — used for exercises like pull-ups, dips, lunges so volume/weight tracking accounts for bodyweight, not just added load).
- Custom exercise creation (name, target muscles, equipment, tracking type).
- Exercise search, duplicate, edit settings, delete (for custom exercises).
- "Smart" exercise swap — suggested alternatives, used both when building a program and mid-workout if equipment is unavailable.
- Per-exercise settings accessible **both** from the program editor and **mid-workout** (a deliberately duplicated affordance — you're not forced to leave the workout screen to fix something).
- "Prevent exercise from being suggested" — an exclusion list independent of deleting the exercise (used for injuries, dislikes, unavailable equipment).

### Program creation — two parallel paths
1. **Smart Generation**: inputs are training goal, experience level, training days/session length, equipment (via gym profile), exercise exclusions, and split/emphasis preference. Produces full program: exercise selection + set/rep/RIR targets per cycle (week), pre-periodized.
2. **Build From Scratch**: full manual authoring — exercises, cycle length, sets/reps/RIR per cycle, planned deload placement, planned time off. Positioned explicitly for users who already have a program (their own, a coach's) and just want tracking + progression on top of it.
- **Both paths get Smart Progression** — generation method is decoupled from the progression engine. This is a key architectural insight: programming (what to do) and progression (how to adjust load next time) are separate systems that compose.
- Programs are organized into **cycles** (weeks), each with its own targets — this is the periodization unit.
- Program library screen shows: Active Program (expandable, shows week workouts with target-muscle chips, exercise thumbnails, per-cycle rep/RIR targets color-coded), Specialized Training (secondary concurrent training blocks, e.g. "Grip Training" run alongside the main program), Workout Library (ad hoc/custom saved workouts), and an Archive.
- **Multiple concurrent programs/sections**: a user can have an Active Program *and* a separate "Specialized Training" block running in parallel (e.g., grip training 2x/week alongside a 4-day PPL). This is a genuine differentiator most competitors don't model explicitly.
- Program schedule can be changed, duplicated (whole program or single workout within it), archived/restored, reordered.
- "Update Program" toggle — a specific setting governing whether the active program keeps evolving via Smart Progression or is frozen.
- Deload can be placed at the **start or end** of a cycle (configurable), and behavior differs by "Deload First Cycle" vs "Deload Last Cycle."
- What happens when a program ends, or when workouts are missed, are both explicitly documented FAQ topics — the progression engine is designed to **not punish** missed sessions (stated directly in the quick-start guide: "does not penalize you for missing a workout").
- Programs and workouts can be **shared with other users** (import/export mechanism) and **imported** (including licensed Jeff Nippard programs — 6 at launch per one secondary source, **LOW confidence**, unverified elsewhere). The generic import/share mechanism (distinct from the Nippard-specific licensing) is a real feature worth replicating in some form even though Nippard content itself is out of scope.

### Gym profiles and equipment
- Multiple gym profiles (home, commercial gym, travel gym, etc.), each with independently configured equipment: bar types, plate denominations available, machines, and **weight stack ranges for pin-loaded machines** (so recommendations don't suggest a load the stack can't produce).
- A workout can be assigned a specific gym profile; switching gyms mid-program is supported and expected (traveling lifters).
- Equipment settings directly gate what the recommendation/progression engine will suggest — e.g., unchecking 1.25lb plates removes fractional-increment recommendations entirely, simplifying suggested loads to round numbers.
- Some machines have **built-in starting resistance** (e.g., ~50lb before any pin is inserted) — equipment config accounts for this base weight so total-resistance exercises compute correctly.
- "What should I do if I cannot perform an exercise or don't have equipment" is a first-class FAQ/flow — both pre-planned (exclusion list) and **mid-workout realization** ("What should I do if I realize mid-workout that I cannot perform an exercise?") are separately documented — i.e., the product explicitly designs for the "oh, that machine's taken/broken" moment during a live session, not just at program-build time.

### In-workout logging (the core loop)
- Two timers always visible at top of the active-workout screen: **workout duration** (counts up from zero) and **rest timer** (starts automatically the instant a set is marked complete — no manual start required).
- An **action bar** beneath the current exercise gives one-tap access to: Smart Progression wand (view/accept recommendation), Info (exercise details), Warm-up (add warm-up sets), Targets (adjust sets/reps/RIR for this session only or persistently), Swap (replace exercise), Note (session/exercise/program-level notes), Superset (pair exercises), Equipment (edit available equipment inline), More (settings/reset/remove).
- Per-exercise set table columns: set number, **previous performance** (prior session's weight/reps for that exact set number — shown inline, not a separate screen), weight, reps, and a completion checkbox. "No previous" shown for first-ever logging of an exercise.
- Numeric keypad for weight/reps entry is a **custom in-app keypad**, not the OS keyboard — visible in the quick-start screenshots (digits 1-9/0, decimal, backspace, +/- steppers, and a submit/next arrow) docked at the bottom of the screen. This keeps the plate-breakdown strip visible above the keypad simultaneously.
- **Live plate-breakdown strip** rendered directly above the keypad while entering a barbell weight (e.g., "2 × 55, 1 × 25, 1 × 2.5" with a small colored bar-diagram) — the plate calculator is not a separate screen, it's inline with data entry.
- Tap the checkmark to complete a set; **tap again to undo** — a low-friction mistake-correction path that doesn't require entering an edit mode.
- Auto-advance to the next exercise once all sets in the current one are checked off (a Feature Setting toggle can disable this for users who want manual control over pacing/order).
- RIR entry per set, 0–6+ scale (open-ended above 6, no forced precision above that). Can be **changed mid-workout**, not just at set-log time — there's a dedicated "Changing RIR During an Active Workout" flow.
- **Set-type tagging via tapping the set number** — this is the mechanism for turning a plain set into Warm-up (W), Drop set (D), Myo set (M), or Failure set (F):
  - **Drop set (D):** multiple weight/rep sub-entries logged as the weight is reduced, all grouped and displayed as a single logical "set."
  - **Myo set / myorep (M):** an initial activation set near target RIR, then 2-3 short rest-pause mini-sets at the same weight (10-20s rest), each sub-entry grouped under one set.
  - **Failure set (F):** logged at RIR 0 by definition; labeled distinctly in the UI.
  - **Partial reps** are logged as a distinct rep-entry mode (separate from full reps) — exact UI mechanism not confirmed in sources (**LOW confidence on implementation detail**, though the capability itself is confirmed by feature page and PROJECT.md's known list).
  - It is explicitly normal/expected for **RIR to trend downward across sets** or for later sets to be failure sets — this is documented as a FAQ ("Is it Normal to See Failure Sets or RIR Decreasing Across Sets?") rather than left as an unexplained UI quirk. Small but real UX-trust detail: the app anticipates the question and answers it inline.
- **Left/right asymmetrical logging**: distinct weight/rep entry per side for unilateral exercises — confirmed via FAQ ("Can I Log Different Weights or Reps for Each Side of My Body?").
- **Supersets**: pair two exercises so rest starts only after both are completed; can be created pre-workout (three-dot menu, from the program editor) or live (action bar during the workout). Undo via "Detach from superset." Exercises must be adjacent in the workout order to superset — reordering (drag on exercise thumbnails) is required first if they aren't.
- **Smart warm-ups**: auto-calculated warm-up sets scaled off the exercise and the current working weight; can be toggled on/off globally (Feature Settings) or per-workout.
- Session-level: **pause/resume** (hamburger menu → Pause Workout, stops the duration timer), and workouts can be started that are **not tied to the active program** at all — a "one-off" / "Empty Workout" path exists as a first-class option on the Workout tab alongside the active program, not buried in a menu.
- **Rest timer**: default configurable per program/exercise, adjustable mid-workout (extend/skip), full-screen mode available.
- **Workout sections** are customizable/reorderable (e.g., grouping "Active Program," "Specialized Training," "Workout Library" as distinct collapsible sections on the Workout tab).

### Post-workout
- **Workout summary/completion screen**: front/back body-map heat diagram highlighting muscles trained, PRs achieved during the session (volume record, reps record, etc., each labeled "New!"), and per-exercise breakdown (sets/reps/weight, volume, and — notably — **estimated 1RM/strength** shown per exercise in the summary).
- Summary is editable before dismissing — user can correct entries from the completion screen itself, not just via History later.
- Workout history: view, edit (including editing **date/time of a past workout** — for backfilling), delete (swipe-to-delete), rename, duplicate, archive/restore, add notes.
- **Backfilling past workouts** to build training history retroactively is an explicit supported flow, not just an incidental side effect of editing.

### Analytics / Dashboard / "Levels"
- **Dashboard**: top widgets show weekly workout progress against target (Muscles trained / Sets / Exercises, each shown as a ring toward a weekly target), Recent Records list (PRs by volume/reps/1RM with a toggle between those three metrics), Insights & Analytics tiles (workouts-last-7, weight trend), all of which are **user-customizable** in layout (add/remove/reorder widgets via a settings screen, not fixed).
- **Levels tab** (separate bottom-nav tab, not buried in Dashboard): body-map heatmap of **set volume per muscle group** over a selectable time window (1 week / 1 month / 3 months), drill-down to which exercises are contributing to each muscle's total sets — i.e., volume-landmark tracking against a target (a la RP's volume landmarks), visualized on a literal body diagram, front and back.
- **Exercise-level performance over time**: 1RM/3RM/10RM estimates, total volume, best-set volume, heaviest weight, total reps, best-set reps, total sets — selectable metric, selectable time range, per individual exercise.
- **PR tracking**: automatically detected and highlighted both live (in the completion summary) and retrospectively (Dashboard "Recent Records").
- Body metrics: measurements (multiple named body parts, dated log entries, viewable as trend) and progress photos (with guidance articles on "how to take good photos/measurements" and a **before/after photo composite generator** — "Create and Share Before-and-After Photos").
- **Period tracking** is present as a dashboard widget ("Track Your Period") — a detail worth noting since it signals MacroFactor treats cycle tracking as relevant training context, not a separate app.
- Step count import (from phone/wearable) feeds into the dashboard.
- "Understanding Levels" / "Understanding Bodyweight Contribution" / "Understanding and Using Smart Progressions" are all dedicated conceptual help articles — MacroFactor invests heavily in **explaining its own algorithm** to build user trust, not just describing UI mechanics. This is itself a notable, replicable pattern: pair every "black box" recommendation with a plain-language "why" article/tooltip.

### Progression engine ("Smart Progression")
- Deterministic, rule-based (not LLM/AI) — confirmed by product framing and matches PROJECT.md's explicit design choice.
- Two computation modes depending on set structure:
  - **Sets to failure**: progression triggers purely by comparing this session's reps at a given load to the prior session's reps at the same load (beat it → progress).
  - **Target-RIR sets**: expected performance = midpoint of the assigned rep range + assigned RIR (e.g., 7-9 rep range at 2 RIR → expected ~10 reps); exceeding that expectation (even at a different RIR than prescribed, if performance is strong) triggers a recommendation to progress. Underperforming triggers hold-or-reduce.
- Represented in-UI as a **"wand" icon** with color-coded states (progress, hold, and presumably a warning/fix state — "may highlight suggestions in different colors, each with a distinct meaning," exact color semantics not confirmed, **LOW confidence on the specific palette**).
- New exercises with no logged history get **no algorithmic weight suggestion** — the user must pick a conservative starting weight themselves; the algorithm only takes over once there's at least one logged data point for that exercise. This is an important dependency: cold-start has no recommendation, by design.
- Missed workouts explicitly do **not** penalize/reset progression — the engine is stated to be forgiving of gaps.
- RIR tracking is optional but "strongly recommended" — the algorithm degrades gracefully without it (falls back to simpler failure-based logic) but works better with it.

### Connectivity / offline behavior (important finding)
- MacroFactor Workouts is **explicitly not offline-first and has no true offline mode**, per its own troubleshooting documentation. It has a "limited offline mode that prevents faults and interruptions" for brief connectivity gaps, but app launch itself may require internet access to validate the account/subscription (documented failure mode: launch taking indefinitely long or >5s on first launch / >2s subsequent launches signals a connectivity problem).
- This is a **direct, material point of departure** from this project's local-first requirement (see PITFALLS/ARCHITECTURE implications) — MacroFactor Workouts is *not* the app to copy architecturally for gym-floor resilience, only functionally. Building genuine offline-first logging (queue writes locally, sync on reconnect, no launch-time network dependency) is a legitimate differentiator against the literal product being cloned.

### Settings / account / misc
- Unit preference (lb/kg), dark/light mode, "lifting experience" and "cardio experience" self-reported settings (feed program generation), subscription management, email/password management, data export, account deletion, sign-out.
- **Shortcuts**: a customizable quick-action menu (center "+" nav button) exposing: quick weigh-in, quick body-fat/measurement entry, quick progress-photo capture, jump to history, new program, new (one-off) workout. This is a deliberate reduction of taps for the highest-frequency non-logging actions.
- Integrations with the separate MacroFactor Nutrition app (shared account, cross-app data visibility) — out of scope for this project but signals that "training + nutrition" is MacroFactor's actual moat; a training-only clone forfeits that cross-sell entirely, which is fine given PROJECT.md's explicit scope cut.
- GrapheneOS-specific support article exists (privacy-conscious Android users) — a minor signal of the target audience's technical sophistication.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Every serious competitor (Hevy, Strong, Boostcamp, MacroFactor) has these. Missing any = product feels broken to a lifter who has used any modern logger.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Set/rep/weight logging with previous-session reference shown inline | The core loop; every competitor auto-fills or displays last time's numbers next to the entry field | LOW | Requires last-logged-set lookup per exercise, keyed by program position (not just "last time this exercise was done anywhere") |
| Rest timer, auto-starts on set completion | Universal; Strong/Hevy/Boostcamp/MacroFactor all auto-start | LOW-MEDIUM | Background/lock-screen persistence is the hard part, not the countdown logic itself (see In-Gym UX section) |
| Custom + pre-built exercise library with search | No app ships with zero library | MEDIUM | Sourcing/normalizing ~900 exercises from an open dataset is the real cost (per PROJECT.md), not the search/CRUD UI |
| Workout history: view, edit, delete past sessions | Standard; users backfill and correct mistakes constantly | LOW | Editing sets, date/time, and adding session notes are all expected sub-features |
| Custom program builder (user-authored routines) | Strong's whole pitch; expected baseline everywhere | MEDIUM | Needs a cycle/week model, not just a flat exercise list, to support periodization later |
| Supersets | Present in Hevy free tier, Strong, Boostcamp, MacroFactor | MEDIUM | Needs to change rest-timer semantics (rest after the pair, not each exercise) — a real logic branch, not just a UI tag |
| Rep-range / RIR or RPE target display per set | Boostcamp, MacroFactor, JuggernautAI, RP all show a target the user is training toward, not just blank fields | LOW-MEDIUM | Simple to display; depends on program data model already carrying targets |
| Plate calculator | Present standalone in many single-purpose apps and built into MacroFactor, Hevy (via calculator button on keypad), Boostcamp | MEDIUM | Needs to be equipment-aware (bar weight, available plate denominations) to be trustworthy, not just generic math |
| PR detection and display | Hevy (live banner), Strong, MacroFactor (session summary + dashboard) | MEDIUM | Requires tracking multiple PR types (heaviest weight, best volume, best reps, best est. 1RM) per exercise, not just "heaviest ever" |
| Workout summary screen after finishing | Universal post-session recap pattern | LOW | Aggregate the session's own logged sets; no new backend logic beyond what's already stored |
| Volume/progress charts (by exercise and by muscle group) | MacroFactor's Levels tab, Boostcamp analytics, RP's volume landmarks — all surface "am I doing enough for this muscle" | MEDIUM-HIGH | Requires an exercise→muscle-group mapping in the exercise data model, and time-bucketed aggregation queries |
| Drop sets, failure sets, basic advanced set types | Standard in Hevy (free), Strong, Boostcamp, MacroFactor | MEDIUM | Grouping multiple weight/rep sub-entries under one logical "set" is a data-model decision, not just a UI label |
| Body weight / body metrics logging | Present across nearly every competitor as a baseline | LOW | Simple time-series entity; no special logic |
| Progress photos | Standard secondary feature (Strong, MacroFactor, most general trackers) | LOW-MEDIUM | Local photo storage + sync is the main cost in a local-first architecture |
| Auto-generated program from goal/experience/equipment/schedule | MacroFactor, Fitbod, Alpha Progression, Boostcamp (11k+ pre-built programs as an alternative approach to the same need) all solve "I don't know what to do" | HIGH | This is the single most algorithmically complex table-stakes item — a rules engine over goal × experience × split × equipment × schedule |
| Rule-based progressive overload recommendations | MacroFactor, JuggernautAI, Alpha Progression, RP all auto-adjust load/reps between sessions | HIGH | Needs per-exercise logged history, a rule set for failure-based vs RIR-based progression, and graceful cold-start (no history = no suggestion) |
| Multi-gym / equipment profiles | MacroFactor, Alpha Progression (added this recently per research) both now support it; a natural expectation once plate calc + auto-progression exist | MEDIUM | Must gate program generation AND progression suggestions by the active gym's configured equipment |
| One-off / unplanned workout logging outside any active program | MacroFactor ("Empty Workout"), Strong, Hevy all support ad hoc sessions | LOW | Just a workout entity not linked to a program instance |

### Differentiators (Competitive Advantage)

Not universal; where products distinguish themselves. For this project, differentiation is less about "beating MacroFactor on features" (v1 goal is parity) and more about beating it on **execution of the promise MacroFactor itself makes but doesn't fully deliver** (offline reliability), plus optional post-parity features borrowed from competitors.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| True offline-first logging (writes always succeed, sync on reconnect) | MacroFactor Workouts itself is explicitly NOT offline-first and requires network at launch to validate subscription — this is a documented weakness of the exact product being cloned. A genuinely offline-capable clone is a real, defensible differentiator, and it's already a non-negotiable PROJECT.md constraint | HIGH | Shapes the whole data model (local write-ahead log, conflict resolution, optimistic UI) — this is the single highest-leverage differentiator available and should be a first-phase architectural concern, not bolted on later |
| Left/right asymmetrical (unilateral) tracking | MacroFactor has it; Strong/Hevy/Boostcamp support for this is inconsistent/partial in competitor research — a real point of distinction versus the broader market even though MacroFactor itself already has it | MEDIUM | Doubles the entry fields for unilateral-tagged exercises; needs per-exercise unilateral flag in the exercise data model |
| Specialized/secondary concurrent training blocks (e.g. running "grip training" alongside a main program) | MacroFactor supports parallel program tracks; most competitors model a single active program only | MEDIUM | Requires the program data model to support N concurrently active program instances, not just one |
| Muscle-fatigue / recovery heat-map (Fitbod-style) that actively re-sequences exercise selection based on recent fatigue | Fitbod's signature differentiator; MacroFactor does not do this (it does volume-by-muscle history, not predictive fatigue-based exercise selection) | HIGH | Requires a fatigue decay model per muscle group — arguably drifts toward "AI/algorithmic programming" territory PROJECT.md wants to avoid; treat as a v2+ idea only if kept rule-based (e.g., simple set-count decay, not ML) |
| Social feed / following / community programs (Hevy, Boostcamp) | Motivation via visibility and community-sourced programs (Boostcamp: 11,000+ programs, 2,000+ community-published) | HIGH | Needs public profiles, feed infrastructure, moderation — large scope add; not aligned with PROJECT.md's single-developer/personal-use framing |
| Scripting/DSL-based custom progression logic (Liftosaur) | Lets power users encode arbitrary progression rules (5/3/1, GZCLP, custom) beyond the built-in engine | HIGH | Interesting v2+ idea once the baseline rule-based engine is proven; a mini-language is real engineering investment |
| Mesocycle-structured, feedback-driven hypertrophy programming (RP Hypertrophy) with soreness/pump/workload logging | More granular autoregulation signal than RIR alone (adds joint pain, pump, soreness ratings per session) | MEDIUM-HIGH | Could be layered on top of the RIR-based engine later; adds logging fields, not a new architecture |
| Program/workout sharing via shareable link or export | MacroFactor supports it (mechanism confirmed, details of Nippard-specific import aside); Boostcamp has a full web program creator + community publish flow | MEDIUM | A generic JSON-ish export/import of a program is comparatively cheap and is genuinely useful without any social/community infrastructure |
| Live PR banner mid-set (not just end-of-workout summary) | Hevy's signature moment-of-achievement UX; MacroFactor does this too via the completion summary but Hevy surfaces it immediately after the set, not just at the end | LOW-MEDIUM | Just needs the PR-detection logic to run per-set instead of per-workout-end; small change once PR detection exists |
| Deep algorithm transparency (plain-language "why" explanations for every recommendation) | MacroFactor invests heavily in explainer help articles for its own black-box logic ("Understanding Levels," "Understanding Bodyweight Contribution," "Understanding Smart Progressions") — this builds trust in a rule-based engine, which is exactly the kind of engine PROJECT.md wants | LOW-MEDIUM | Not a "feature" so much as a UX/content discipline: every progression suggestion should be able to show its reasoning inline, since the underlying rules are deterministic and thus explainable by construction |

### Anti-Features (Deliberately Not Building — Includes Project's Explicit Exclusions)

| Feature | Why Requested / Why It Seems Good | Why Problematic (Here) | Alternative |
|---------|-----------------------------------|--------------------------|-------------|
| Nutrition / macro tracking | It's MacroFactor's actual core product and flagship differentiator; "why wouldn't a fitness app also do food" | Explicitly out of scope per PROJECT.md — a second product surface (food database, macro coaching algorithm) that would multiply scope for a solo developer and dilute the training-focused core value | Stay training-only; if nutrition is ever wanted, integrate with an existing tracker via export rather than rebuilding one |
| 3-angle exercise demo videos with voiceover technique cues | Reduces injury risk, aids beginners, matches MacroFactor's polish | A content-production problem (licensing/filming/hosting hundreds of videos), not a software problem — explicitly called out in PROJECT.md as not the point of this exercise | Text cues + static images sourced from an open exercise dataset (free-exercise-db, wger); leaves room to add video later without re-architecting |
| Jeff Nippard licensed program imports | MacroFactor uses this as a marketing/content hook | Licensed third-party IP, not reproducible, and not the point of a solo-dev clone | Ship the generic "import/export a program" mechanism (JSON-ish format) without any specific licensed content attached |
| AI/LLM-driven program generation or progression (Fitbod-style adaptive AI, JuggernautAI-style RPE-driven auto-adjustment framed as "AI") | Feels modern, promises personalization "smarter" than fixed rules | MacroFactor itself deliberately uses rule-based logic, not LLM/AI, for progression — matching that design choice keeps the system testable, explainable, and debuggable, which matters more for a personal training tool than novelty | Deterministic rule-based progression engine (fixed rules over logged performance vs RIR/rep-range targets), same approach MacroFactor uses |
| Predictive muscle-fatigue-driven exercise re-sequencing (Fitbod) | Sounds smart, avoids "overtraining," personalizes each session freshly | Blurs into the same "algorithmic black box" territory the AI exclusion is meant to avoid, and requires a fatigue-decay model that's hard to validate without real physiological data; MacroFactor itself doesn't do this (it shows historical muscle volume, not predictive re-sequencing) | Show historical volume-by-muscle (MacroFactor's Levels-tab approach) and let the user decide, rather than automatically reshuffling exercise selection |
| Social feed / public profiles / leaderboards (Hevy, Boostcamp Community) | Drives engagement and motivation via visibility | Out of scope for a single-developer personal-use tool per PROJECT.md's framing; adds a whole moderation/privacy/infrastructure surface unrelated to the core value ("log a workout with zero friction, get told what to lift next") | None needed for v1; program *export/import* (not a social feed) covers the legitimate "share a routine with a friend" need cheaply |
| Wearable/HRV/sleep-driven autoregulation | Requested by advanced users (noted as a gap even in competitor research — "some apps don't incorporate HRV or sleep data") | High integration complexity (device APIs, data reliability) for a signal (RIR self-report) that already works reasonably well per MacroFactor's own design; adds a dependency on third-party device ecosystems | RIR/RPE self-report remains the primary autoregulation signal; step-count import (a lightweight, already-common phone-level signal) is a reasonable low-cost middle ground if desired later |
| Real-time everything (live workout co-viewing, live leaderboards during a session) | Sounds engaging | Classic "seems good, isn't" scope trap — adds realtime infrastructure for a training-log use case where the only realtime requirement that actually matters is a local rest-timer countdown | Local rest timer + async multi-device sync on reconnect (already required by PROJECT.md) is sufficient; no live/realtime backend needed |

---

## In-Gym Logging UX — Deep Dive (What Separates Loved vs Abandoned Loggers)

This is the single highest-leverage area per PROJECT.md's own framing ("the gym is the hostile environment... logging friction is the thing that kills training apps"). Findings synthesized from Strong, Hevy, Boostcamp, and MacroFactor's own quick-start guide.

1. **Previous-set reference must be inline, not a lookup.** Every competitor (Hevy, Strong, MacroFactor) shows the prior session's weight/reps directly in the same row as the current entry field — not a separate screen or tab. Hevy goes further: tapping the previous value auto-fills it into the current set instead of requiring re-typing. This single affordance is repeatedly cited as a "personal highlight" in user reviews of Strong. **Implication:** the set-entry row must carry both current-entry fields and last-logged-values in the same visual unit, and tapping the reference value should populate the input, not just display it.

2. **Rest timer starts automatically on set completion — zero extra taps.** Universal across MacroFactor, Strong, Boostcamp. Manual timer starts are a friction point competitors have already eliminated; not doing this would be a regression versus the entire category.

3. **Rest timer must survive backgrounding / screen lock and notify.** This is the most technically demanding "table stakes" item and the one most often cited as a differentiator between "loved" and "abandoned" loggers in the broader competitive research (e.g., Setgraph's iOS Live Activity / lock-screen timer, dedicated timer apps offering lock-screen-controllable "media style" notifications). A rest timer that stops when the phone locks or the app backgrounds — forcing the lifter to keep the screen awake and app foregrounded between every set — is a specific, named complaint pattern in the researched space. **Implication (HIGH priority for roadmap):** the rest timer needs platform-level background execution + local notification (not just an in-app JS timer), on both iOS and Android, plus ideally a lock-screen/Live-Activity-style surface so the phone can stay in a pocket between sets.

4. **Custom numeric keypad docked at the bottom, not the OS keyboard.** MacroFactor's own screenshots show a dedicated calculator-style keypad (digits, decimal, +/- steppers, submit arrow) rather than invoking the system keyboard. This keeps a plate-breakdown strip visible simultaneously above the keypad, and avoids the OS keyboard's autocorrect/layout overhead for pure numeric entry. Hevy places a dedicated plate-calculator button directly above the keyboard for the same reason — quick access without losing the entry context.

5. **Editing a completed set is a one-tap undo, not a mode switch.** MacroFactor: tap the checkmark again to un-complete a set and re-edit it in place. Strong's documented flow for editing a *past* workout requires unchecking the box, editing, rechecking — still low-friction, but notably the live in-session correction (tap to undo) is faster than the post-hoc history edit flow. **Implication:** in-session mistake correction should be optimized separately from (and faster than) historical editing.

6. **Auto-advance between exercises, with an escape hatch.** MacroFactor auto-advances to the next exercise once all sets are checked, but this is a togglable Feature Setting — some users want to control pacing/order manually (e.g., doing exercises out of the planned order because of equipment availability). A hardcoded auto-advance with no override would be a regression versus MacroFactor.

7. **One-handed operability is implied by every design choice above but never named as a discrete "feature."** No competitor documentation calls out "one-handed use" explicitly as a spec — it emerges from: large tap targets (checkmark, numeric keypad), bottom-anchored primary controls (keypad, action bar), and minimal reliance on multi-step navigation for the core log-a-set action. **Implication for this project:** treat "can this action be done one-handed, thumb-only, while holding a barbell/dumbbell in the other hand" as an explicit acceptance criterion for every in-workout screen, since it's never validated as a named requirement anywhere in competitor docs — it has to be tested by using the app one-handed, not read about.

8. **Session interruption/resume must be trivially recoverable.** MacroFactor supports explicit Pause/Resume (via a menu action) — but the deeper requirement, given PROJECT.md's local-first mandate, is that an in-progress workout must **survive app kill, phone restart, or crash** without explicit user action, not just an intentional pause. This goes beyond what MacroFactor documents (its pause/resume is a deliberate user action, not necessarily proof of crash-resilience) and is exactly the kind of thing to verify empirically rather than assume from competitor docs (**flagged as an open question — see SUMMARY.md gaps**).

9. **Set-type entry (drop set / myorep / failure) must not add a screen/step to the common case.** MacroFactor's mechanism — tap the set *number* to reveal a type picker — keeps the entry row itself unchanged for the 90% case (a normal working set) while making advanced types reachable without leaving the row. Any implementation that forces a modal or separate screen for the common path would add friction to every single set, not just the advanced ones.

10. **Superset rest-timer semantics are a real logic branch, not cosmetic.** Rest starts only after *both* paired exercises' sets are done, not after each individually — this needs to be modeled explicitly in the rest-timer trigger logic, not just visually grouping two exercises in the UI.

---

## Feature Dependencies

```
Exercise library (with muscle-group mapping, unilateral flag, bodyweight-contribution flag)
    └──requires──> Custom program builder
                       └──requires──> Auto-generated programs (Smart Generation needs a program data model to populate)
                       └──requires──> Volume/progress charts by muscle group (needs exercise→muscle mapping)
                       └──requires──> Rule-based progression engine (needs per-exercise logged history + program targets)

Multi-gym equipment profiles
    └──requires──> Plate calculator (needs available bar/plate config to compute loadable combinations)
    └──requires──> Auto-generated programs & progression (recommendations must be gated by available equipment)

Set/rep/weight logging (core loop)
    └──requires──> Rest timer (auto-starts on set completion)
    └──requires──> Previous-set reference display
    └──enhances──> PR detection (needs logged history to compare against)
    └──enhances──> Rule-based progression engine (progression reads logged sets)

Advanced set types (drop set, myorep, failure, partial reps)
    └──requires──> Set/rep/weight logging (core loop) — extends the set data model, doesn't replace it

Supersets
    └──requires──> Set/rep/weight logging (core loop)
    └──conflicts (partially)──> simple "rest starts after every set" assumption — rest-timer trigger logic must special-case superset pairs

RIR logging
    └──enhances──> Rule-based progression engine (RIR-based progression is more precise than failure-only progression, but the engine must degrade gracefully without it)

Local-first offline logging (PROJECT.md constraint)
    └──requires──> Multi-device sync with conflict resolution (writes made offline must reconcile against server state on reconnect)
    └──enhances──> ALL in-workout logging features — this is a cross-cutting architectural requirement, not a discrete feature; it should be decided before, not after, the set-logging data model is finalized

Body metrics + progress photos
    └──independent of training program data──> can ship as a standalone module with no dependency on programs/exercises

One-off / unplanned workout logging
    └──requires──> Set/rep/weight logging (core loop)
    └──independent of──> active program (deliberately decoupled — a workout entity need not belong to a program instance)

Dashboard customization
    └──requires──> Analytics/volume aggregation (needs the underlying metrics to exist before they can be surfaced as configurable widgets)
```

### Dependency Notes

- **Exercise library requires muscle-group mapping before analytics can exist.** The volume-by-muscle-group charts (MacroFactor's "Levels" tab) are impossible without every exercise in the library being tagged with target muscle(s) — this mapping needs to be part of the initial exercise-dataset seeding work, not added later.
- **Local-first sync is a cross-cutting architectural decision, not a feature to schedule alongside others.** Per PROJECT.md, this must shape the data model from the start (write-ahead local log, conflict-resolved sync). Scheduling it as "just another phase item" risks having to retrofit every other feature's data model once sync semantics are added later. This is the strongest argument for making it a very early phase.
- **Rule-based progression engine depends on (a) logged set history existing, and (b) program targets (rep range + RIR) existing in the data model.** It cannot be built or meaningfully tested before both the core logging loop and the program/cycle data model are in place. It is correctly a *later* phase dependency, not a first-phase one — but the data model it will eventually read from (sets, RIR, targets) needs to be designed with it in mind from day one.
- **Plate calculator and multi-gym equipment profiles are tightly coupled.** A plate calculator without gym-scoped equipment config is just generic math (doesn't know what plates the user actually owns); building the calculator before equipment profiles exist means rebuilding it once profiles land. Sequence equipment profiles first, or build both together.
- **Supersets conflict with a naive "one rest timer per completed set" model.** This is worth flagging explicitly for the roadmap: whichever phase implements supersets needs to also touch the rest-timer trigger logic, even if rest timers shipped in an earlier phase.
- **Advanced set types (drop/myo/failure/partial) are additive to the core set-logging data model**, not a parallel system — they should reuse the same "set" entity with a type/grouping extension, which argues for designing the set data model with this extensibility in mind even if these types ship in a later phase than basic logging.

---

## MVP Definition

Given PROJECT.md's explicit stance — **full feature parity with MacroFactor Workouts' public feature surface is the v1 bar, not a reduced subset** — "MVP" here means "smallest complete slice that still hits parity," sequenced by dependency, not a trimmed feature set. The table-stakes list above IS effectively the v1 scope; there is no meaningfully smaller "validate the concept" cut available given the parity requirement already set by the project owner.

### Launch With (v1) — maps directly to PROJECT.md's Active requirements

- [ ] Core logging loop: sets/reps/weight, RIR, rest timer, previous-set reference — the loop everything else depends on
- [ ] Local-first offline write + sync-on-reconnect — architectural prerequisite for everything, must be decided first, not bolted on
- [ ] Exercise library (open dataset, muscle-group mapped, text cues + static images) — analytics and program generation both depend on this
- [ ] Custom program builder (cycles/weeks, targets) — prerequisite for auto-generation and progression
- [ ] Auto-generated programs (goal/experience/equipment/schedule) — table stakes, high complexity, depends on exercise library + program data model
- [ ] Advanced set types: supersets, drop sets, partial reps, myoreps, failure sets — extends the core set model
- [ ] Asymmetrical (left/right) tracking — extends the core set model
- [ ] Multi-gym profiles + equipment-scoped plate calculator — build together, sequence before/with progression
- [ ] Rule-based progressive overload engine — depends on logged history + program targets existing first
- [ ] Volume/progress analytics by muscle group, workout history, trends — depends on exercise→muscle mapping
- [ ] PR detection/highlighting — depends on logged history
- [ ] Customizable dashboard — depends on the underlying analytics existing
- [ ] Body metrics + progress photos — independent module, can ship in parallel with training-program work
- [ ] One-off/unplanned workout logging — independent of active program, low complexity, can ship early

### Add After Validation (v1.x)

- [ ] Program/workout export-import (share a routine as a file/link) — genuinely useful, cheap, no social infrastructure required
- [ ] Live PR banner mid-set (vs. end-of-session-only) — small enhancement once PR detection exists
- [ ] Algorithm-transparency "why" explanations inline with every progression suggestion — a UX/content pass once the rule-based engine is stable and its logic is fully known
- [ ] Specialized/secondary concurrent training blocks (parallel program tracks) — genuine MacroFactor feature, but the single-active-program model is a reasonable v1 simplification given it's not in PROJECT.md's explicit Active list

### Future Consideration (v2+)

- [ ] Scripting/DSL for custom progression rules (Liftosaur-style) — large investment, only worth it once the fixed rule-based engine's limitations are actually felt in practice
- [ ] Additional autoregulation signals beyond RIR (soreness/pump/joint-pain logging, RP-style) — layers onto the existing engine without new architecture
- [ ] Wearable/step-count integration — low-cost if desired, not requested in PROJECT.md
- [ ] Social/sharing beyond simple export (feeds, community programs) — explicitly against PROJECT.md's personal-use framing; revisit only if the project's purpose changes

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core set/rep/weight logging + rest timer + previous-set ref | HIGH | LOW-MEDIUM | P1 |
| Local-first offline + sync | HIGH | HIGH | P1 (architectural, must be early) |
| Exercise library (seeded, muscle-mapped) | HIGH | MEDIUM (data sourcing is the cost) | P1 |
| Custom program builder | HIGH | MEDIUM | P1 |
| Auto-generated programs | HIGH | HIGH | P1 |
| Advanced set types (superset/drop/myo/partial/failure) | HIGH | MEDIUM | P1 |
| Asymmetrical L/R tracking | MEDIUM | MEDIUM | P1 |
| Multi-gym + plate calculator | HIGH (in-gym trust) | MEDIUM | P1 |
| Rule-based progression engine | HIGH (the core value prop) | HIGH | P1 |
| Volume/muscle analytics ("Levels") | MEDIUM-HIGH | MEDIUM-HIGH | P1 |
| PR detection | MEDIUM | MEDIUM | P1 |
| Customizable dashboard | MEDIUM | LOW-MEDIUM | P1 |
| Body metrics + photos | MEDIUM | LOW-MEDIUM | P1 |
| One-off workout logging | MEDIUM | LOW | P1 |
| Background-surviving rest timer with notifications | HIGH (in-gym UX makes-or-breaks) | MEDIUM-HIGH (platform-specific) | P1 |
| Program export/import | MEDIUM | MEDIUM | P2 |
| Live mid-set PR banner | LOW-MEDIUM | LOW | P2 |
| Algorithm-transparency explanations | MEDIUM (trust) | LOW | P2 |
| Specialized/parallel training blocks | LOW-MEDIUM | MEDIUM | P2/P3 |
| Progression scripting DSL | LOW (niche) | HIGH | P3 |
| Extra autoregulation signals (soreness/pump) | LOW-MEDIUM | LOW-MEDIUM | P3 |
| Social feed / community programs | N/A (out of scope) | HIGH | Excluded |

**Priority key:**
- P1: Must have for launch (parity bar per PROJECT.md)
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | MacroFactor Workouts | Hevy | Strong | Boostcamp | Fitbod | Our Approach |
|---------|----------------------|------|--------|-----------|--------|--------------|
| Auto-generated program | Yes (Smart Generation, goal/experience/equipment/schedule) | No (templates + follow others only) | No (bring your own program) | Yes, but via 11,000+ pre-built program library, not per-user generation | Yes (session-by-session, fatigue-adaptive) | Yes — rule-based generation, matching MacroFactor's approach (not Fitbod's per-session adaptive model, to stay deterministic) |
| Progression engine | Yes, rule-based (failure-based + RIR-based) | No (manual) | No (manual, though shows history to inform manual choices) | Partial (some programs have built-in progression logic) | Yes, AI/adaptive (out of scope pattern per PROJECT.md) | Yes — rule-based, mirroring MacroFactor's dual failure/RIR logic |
| Offline-first | **No** (explicitly documented as not offline-first) | Not confirmed, likely partial | Not confirmed | Not confirmed | Not confirmed | **Yes** — explicit differentiator, PROJECT.md hard requirement |
| Multi-gym equipment profiles | Yes | Not confirmed as a named feature | Not confirmed | Not confirmed | Not confirmed | Yes |
| Left/right asymmetrical tracking | Yes | Not confirmed as a named/emphasized feature | Not confirmed | Not confirmed | Not confirmed | Yes |
| Muscle-group volume/level tracking | Yes ("Levels" tab, body-map heatmap) | Not emphasized | Not emphasized | Yes (analytics) | Yes (fatigue heat map, predictive not historical) | Yes — historical volume-by-muscle (MacroFactor's model, not Fitbod's predictive fatigue model) |
| Live PR notification mid-set | Via end-of-session summary, not confirmed live | Yes, live banner + badges | Highlights best sets | Yes (personal records tracked) | Not a primary feature | v1: end-of-session (MacroFactor parity); v1.x: consider live banner |
| Social/community feed | No | Yes (profiles, following) | No | Yes (community feed, 2,000+ published programs) | No | No (explicitly excluded) |
| Program sharing/import | Yes (including licensed Nippard programs) | Limited (follow users) | No | Yes (web program creator, shareable links, community publish) | No | Generic export/import only, no licensed content, no community publish infra |
| Video exercise demos | Yes (3-angle) | Yes | Yes (basic) | Yes | Yes | **No** — text cues + static images only (explicit v1 exclusion) |
| Nutrition tracking | Yes (companion app, shared account) | No | No | No | No | **No** — explicit exclusion |

## Sources

- [MacroFactor Workouts feature page](https://macrofactor.com/workouts/) — official product marketing page
- [MacroFactor Workouts Quick Start Guide (PDF)](https://macrofactor.com/wp-content/uploads/2026/01/Workouts-Quick-Start-Guide.pdf) — read directly, primary source, screenshots of actual UI
- [MacroFactor Help Center — Workouts collection](https://help.macrofactorapp.com/en/collections/20-macrofactor-workouts) — 99-article index used to map full feature surface
- Individual help articles cross-referenced: exercise info (`/298-`), RIR (`/385-`), progressive overload (`/372-`), equipment settings (`/390-`), myo/drop/failure sets (`/379-`, `/317-`), plate calculator (`/313-`), supersets (`/321-`), periodization customization (`/389-`), starting weight (`/377-`), connectivity/offline (`/366-`), shortcuts (`/365-`), warm-ups (`/311-`), body measurements (`/345-`), levels (`/342-`), exercise performance over time (`/344-`), backfilling workouts, dashboard widgets (`/276-`)
- [Hevy — Track Workouts feature page](https://www.hevyapp.com/features/track-workouts/), [Live PR feature page](https://www.hevyapp.com/features/live-pr/)
- [Boostcamp vs Strong comparison](https://www.boostcamp.app/vs/strong), [Boostcamp features](https://www.boostcamp.app/features), [Boostcamp program creator](https://www.boostcamp.app/program-creator)
- [Strong app review — GiFit](https://gifit.io/blog/strong-workout-app-review/), [Strong Help Center — Rest Timer](https://help.strongapp.io/article/231-rest-timer)
- Fitbod muscle recovery/heat-map documentation via Fitbod Help Center and blog (fitbod.me)
- Secondary comparison/review sources (aggregated via search, cross-checked across 2+ independent results where used): brobible.com, gymsoftwarereview.com, gymgod.app, mesostrength.com, strive-workout.com — used only for competitor positioning claims not available from first-party sources, flagged inline where confidence is LOW

---
*Feature research for: strength-training / workout-logging app (MacroFactor Workouts clone)*
*Researched: 2026-08-10*
