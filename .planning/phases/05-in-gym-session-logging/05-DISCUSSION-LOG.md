# Phase 5: In-Gym Session Logging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-23
**Phase:** 05-in-gym-session-logging
**Areas discussed:** Active workout screen shape, Set row & the numeric keypad, Rest timer & background alerts, Finish/summary/editing the past

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Active workout screen shape | Scrolling list vs. swipeable pager vs. accordion; where auto-advance, add/swap/remove and "where am I" live | ✓ |
| Set row & the numeric keypad | The two-tap common case: what the row shows, prefill sources, RIR placement, complete/undo affordance | ✓ |
| Rest timer & background alerts | Auto-start, background/lock delivery, permission handling, on-screen surface, the web story | ✓ |
| Finish, summary & editing the past | Phase 5 vs. Phase 9 summary boundary, where history editing lives, backfill and the local_date stamp | ✓ |

**User's choice:** All four.

---

## Active workout screen shape

### Q1 — How does the active workout screen present the session's exercises?

| Option | Description | Selected |
|--------|-------------|----------|
| One scrolling list, all exercises | Every exercise stacked vertically with set rows visible; Strong/Hevy model. Whole workout visible, jump freely — but the current set is often off-screen and the keypad eats the bottom third | |
| One exercise at a time, swipeable | Pager: current exercise fills the screen, swipe between exercises. Reuses Phase 4 DayDeck and react-native-pager-view, already installed and proven on web. Auto-advance becomes a page turn | ✓ |
| Accordion — current expanded, rest collapsed | Collapsed one-line rows, current expands in place. Mirrors Phase 4 D-25 — but expand/collapse is a tap the pager doesn't charge | |

**User's choice:** One exercise at a time, swipeable.
**Notes:** Accepted trade — seeing what's next costs a swipe. → CONTEXT D-11.

### Q2 — With one exercise per page, how do you see the whole session and jump?

| Option | Description | Selected |
|--------|-------------|----------|
| Pinned exercise strip at the top | Horizontal chip strip, one per exercise, completion state (3/4), tap to jump. Reuses Phase 4 CycleStrip. Also where "add exercise" lives | ✓ |
| Dots plus a pull-up session sheet | Page dots for position; swipe-up sheet for the full overview, jump, reorder, add, swap, remove. Cleanest working screen — but "what's left" costs a gesture | |
| Header shows position only | "Bench Press — 2 of 6", navigation purely by swiping. Minimum chrome — but jumping across the session means repeated swipes | |

**User's choice:** Pinned exercise strip at the top.
**Notes:** → CONTEXT D-12.

### Q3 — How do you reach per-exercise actions mid-workout?

| Option | Description | Selected |
|--------|-------------|----------|
| Action bar under the exercise header | Labelled icon row: Warm-up, Targets, Swap, Note, Info, More. MacroFactor's own model (FEATURES.md line 53). One tap each, permanently visible — at the cost of a fixed vertical band | |
| Overflow menu on the exercise header | Single ⋮ opens a sheet with every action. Two taps, hidden behind a glyph — but gives set rows the full screen and scales as Phases 6–8 add actions | |
| Split — bar for frequent, menu for rare | Warm-up, Targets, Note permanent; Swap, Remove, Reorder, Info behind ⋮. Optimizes the common case without a six-button band — but guesses which three stay frequent | ✓ |

**User's choice:** Split — bar for frequent, menu for rare.
**Notes:** → CONTEXT D-13, with a planner flag that the bar's contents should be a list constant rather than hardcoded JSX, so re-sorting later is a data change.

### Q4 — LOG-15: how is the session-only vs. persistent target choice made?

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only by default, explicit "save to program" | Targets sheet edits the frozen session snapshot; a separate deliberate action writes back. A one-off "only got 3 sets today" can never silently rewrite the program | ✓ |
| Ask every time you change a target | Immediate prompt on every edit. Never ambiguous — but a modal interruption on a minimum-friction screen | |
| A sticky toggle in the Targets sheet | Persist switch remembering your last choice. Fastest for a consistent user — but a remembered invisible setting is how a month of programs gets quietly rewritten | |

**User's choice:** Session-only by default, explicit "save to program".
**Notes:** → CONTEXT D-14. Claude resolved the follow-on: write-back targets whichever row the displayed value resolved from (cycle override if one exists, otherwise base), because writing base unconditionally would make the edit invisible behind an override → D-15.

---

## Set row & the numeric keypad

### Q1 — What does a set row show, and what prefills weight/reps?

| Option | Description | Selected |
|--------|-------------|----------|
| Prefilled from last time, previous shown greyed alongside | Fields arrive filled with last session's numbers for that set number; PITFALLS §7's explicit recommendation. Risk: a prefilled number you didn't check is a number you can log by accident | |
| Empty fields, previous shown and tappable to fill | Blank fields; tap the previous value to fill. Nothing logged you didn't actively put there. One extra tap per set | |
| Prefilled from the program target instead | Fields arrive from the phase-4 prescription snapshot (target reps at target RIR), last session's actuals shown greyed for reference. Trains toward the program — but the target has no weight | ✓ |

**User's choice:** Prefilled from the program target.
**Notes:** → CONTEXT D-16/D-17. Deliberate split: fields train you toward the program, greyed reference tells you what you actually did.

### Q2 — Where does the weight prefill come from, since the target carries no weight?

| Option | Description | Selected |
|--------|-------------|----------|
| Last session's weight for that set number | Reps from target, weight from history. Blank on a first-ever exercise, where FEATURES.md line 95 says MacroFactor also refuses to guess. Phase 8 later replaces the source | ✓ |
| Weight stays blank, you always type it | Only reps and RIR prefill. Nothing you didn't choose gets logged as load — but typing every set is the friction PITFALLS §7 names as the app-killer | |
| Last session's weight, but only if you hit the target | Prefills when last session met its rep/RIR target, blank otherwise. A crude progression heuristic — but that's Phase 8's subject, and two places deciding what to lift is one too many | |

**User's choice:** Last session's weight for that set number.
**Notes:** → CONTEXT D-16. Lookup must be a single named function so Phase 8's swap is one call site.

### Q3 — How does the in-app numeric keypad behave (LOG-05)?

| Option | Description | Selected |
|--------|-------------|----------|
| Docked bottom, appears on field focus | Calculator-style keypad slides up on focus; row scrolls clear above it. MacroFactor's shape (FEATURES.md line 55). The band above it is where Phase 6's plate strip lands | ✓ (Claude) |
| Always docked, never dismissed | Permanent furniture, zero layout shift, thumb always in the same place — but a permanent third of the screen gone while reading | |
| Inline steppers, keypad only on tap-the-number | +/− buttons for most adjustments, keypad behind a tap. Fewest pixels — but 60 kg → 100 kg by stepper is absurd | |

**User's choice:** *Delegated — "Decide by yourself."*
**Notes:** Claude took docked-on-focus: MacroFactor's shape, leaves the Phase 6 plate-strip band addressable, and doesn't permanently cost a third of the screen. → CONTEXT D-20.

### Q4 — Where does RIR live in the row (LOG-06)?

| Option | Description | Selected |
|--------|-------------|----------|
| Third field in the row, prefilled from target | Weight \| Reps \| RIR side by side; keypad next-arrow walks weight → reps → RIR → complete. Tight on a narrow phone alongside greyed reference values | ✓ |
| Tap the completed set to reveal RIR | Two-field row; completion reveals a 0–6+ chip strip. Puts the judgement after the set, which is when you know it — at the cost of a distinct interaction to learn | |
| RIR chip strip above the keypad | 0–6+ chips above the keypad while it's up. Row never grows a third column — but competes with Phase 6's plate-math band for that space | |

**User's choice:** Third field in the row, prefilled from target.
**Notes:** → CONTEXT D-18, with a planner flag that three numeric fields plus two greyed reference values is the phase's tightest layout constraint under 04-UI-SPEC's wrap-and-grow rule.

---

## Rest timer & background alerts

### Q1 — When is notification permission asked for, and what happens on denial?

| Option | Description | Selected |
|--------|-------------|----------|
| Ask at first rest timer, degrade to in-app only | Prompt at the first completed set, when the rationale is self-evident. Declined → in-app sound and haptic plus a persistent note | |
| Ask during onboarding, before any workout | Bundled with account setup so the gym floor is never interrupted. Cost: asking before the user knows why is the classic route to a permanent denial, only reversible in iOS Settings | ✓ |
| Never prompt; offer it in Settings only | No OS dialog ever; a Settings switch triggers the request. Respectful — but the default is a timer that silently stops mattering when the phone locks | |

**User's choice:** Ask during onboarding, before any workout.
**Notes:** Risk flagged and accepted. Claude resolved the uncovered half — a denial degrades to in-app sound + haptic with a persistent inline note, never a silently dead timer, plus a Settings deep-link re-request path. → CONTEXT D-22/D-23.

### Q2 — How do the rest and duration timers sit on the workout screen?

| Option | Description | Selected |
|--------|-------------|----------|
| Both in a persistent header bar | Duration up on the left, rest down on the right, above the exercise strip. MacroFactor's layout (FEATURES.md line 52). Tap rest for full-screen | ✓ |
| Duration in the header, rest takes over the bottom | Rest countdown rises from where the keypad was, large and thumb-reachable, and recedes when rest ends. Unmissable during rest, reclaims its space after | |
| Rest goes full-screen automatically | Whole-screen countdown on set completion. Readable across a gym floor — but hides the set rows during rest and fights auto-advance | |

**User's choice:** Both in a persistent header bar.
**Notes:** → CONTEXT D-24. Rest is dormant-but-present between sets, so its position never moves under a thumb.

### Q3 — What does the rest timer do on the web target?

| Option | Description | Selected |
|--------|-------------|----------|
| Web Notifications API behind the same .web.tsx seam | One module, two siblings: expo-notifications on native, browser notification on web, both at the same wall-clock target, both recomputing from the stored timestamp | ✓ |
| Web runs in-app only, no notifications | Same maths, sound plus in-page banner, no browser permission surface. Honest that nobody trains with a laptop — web is where this phase gets verified, not used | |
| Web is the reference implementation, native adds notifications | Build and verify on web first (the only target reachable on this machine), native background delivery as an additive layer. Leaves criterion 3 unproven until Phase 999.1 | |

**User's choice:** Web Notifications API behind the same .web.tsx seam.
**Notes:** → CONTEXT D-25. `expo-notifications` is not currently installed.

### Q4 — What duration does rest start with, and what happens at zero?

| Option | Description | Selected |
|--------|-------------|----------|
| Target rest from the snapshot; alert fires and the timer counts up | Keeps running into overtime so a glance says "40 s late" rather than nothing — the signal that stops a session running to two hours | |
| Target rest; the timer stops and clears at zero | Alert fires, timer resets to dormant. Cleaner header, no ambiguous state — loses the overtime signal | ✓ |
| Last session's actual rest for that set | Adapts to how you really train — but makes the program's rest target decorative and drifts upward with no rule pulling it back | |

**User's choice:** Target rest; the timer stops and clears at zero.
**Notes:** → CONTEXT D-26. Actual rest still lands in `logged_set.rest_taken_seconds`, a column that exists and is currently never written.

---

## Finish, summary & editing the past

### Q1 — Phase 9 owns PR detection. What does Phase 5's summary compute?

| Option | Description | Selected |
|--------|-------------|----------|
| Everything except PRs — leave a slot Phase 9 fills | Muscles trained, per-exercise breakdown, duration; PR band renders nothing until Phase 9 populates personal_record. No detection rule written twice | |
| Full summary including PR detection, Phase 9 extends it | Phase 5 writes the PR rules too, so dogfooding from day one shows the motivating moment. Phase 9 adds browsing, reconciliation and cross-device authority. Risk: Phase 5 setting semantics Phase 9 has to unpick | ✓ |
| Minimal summary — breakdown only | Sets/reps/weight/volume and nothing else. Cleanest boundary — but LOG-18 names muscles trained explicitly, and the dogfooding phase would end every workout on a spreadsheet | |

**User's choice:** Full summary including PR detection.
**Notes:** Two consequences flagged and folded into CONTEXT D-30 — `personal_record` is one of WINDOWS #19's nine tables with no server-side sync apply path, and the PR rules must live in one shared pure module imported by client and server (ARCHITECTURE.md §4's argument, and the precondition for Phase 10's cross-device authority criterion). Claude additionally resolved D-31: estimated 1RM returns nullable and renders its absence explicitly rather than printing a confident number off a set of 20.

### Q2 — Are summary correction (LOG-19) and past-workout editing (LOG-20) the same surface?

| Option | Description | Selected |
|--------|-------------|----------|
| One editable session screen, reached two ways | Summary and past workout open the same screen; the finish screen is that screen with a Done button. One edit path to build and get right | |
| Separate surfaces, deliberately | Read-mostly summary with inline typo fixes; a distinct History screen with the full mutation set. PITFALLS §5 notes live correction should be optimised separately — at the cost of two edit paths | |
| Reopen the workout screen to edit | Editing drops you back into the logging screen — same pager, set rows, keypad — in an editing mode. Maximum reuse, zero new entry UI. But that screen is built around a live session with running timers and auto-advance | ✓ |

**User's choice:** Reopen the workout screen to edit.
**Notes:** State-confusion risk flagged and accepted. Mitigation recorded as structural in CONTEXT D-32 — edit mode must make live-session machinery unreachable rather than merely inactive, via a single typed session-context value at the screen root, not a boolean threaded through components.

### Q3 — What do you see when you open the app with a session in progress?

| Option | Description | Selected |
|--------|-------------|----------|
| Straight back into the workout, no prompt | An in-progress session is the app's state, not a document with a dialog. Nothing to dismiss with cold hands | |
| Home shows a resume banner, you tap in | Home as usual with an unmissable "Workout in progress — 47 min" banner above the next-up card, carrying resume and discard. Safer for a session abandoned days ago — but charges a tap on every relaunch | ✓ |
| Straight back in, but stale sessions ask | Silent resume when recent, prompt when older than a threshold. Best of both — at the cost of a guessed threshold and a rarely-exercised second code path | |

**User's choice:** Home shows a resume banner, you tap in.
**Notes:** → CONTEXT D-28. Banner sits above Phase 4's next-up card on `(tabs)/index.tsx`, and must not cost a query on the common no-session path. Claude added D-29: pause is a deliberate action that stops the duration clock, and shares no state with crash recovery.

### Q4 — LOG-21: how do you log a session you did last Tuesday but never entered?

| Option | Description | Selected |
|--------|-------------|----------|
| Log it as a one-off now, then re-date it | LOG-02 plus LOG-21 composed; no third entry path. The date edit rewrites timezone and local_date together, and rotation position self-heals via resolveNextUp | |
| Pick the date up front when starting a one-off | Session stamped correctly from the first set, never re-dated. Fewer moving parts — but puts a date picker in front of the most common action in the app | |
| A distinct "add past workout" entry point | History carries its own action opening the editing screen with a date chosen. Clearest intent, discoverable where you'd look — but a third session-creation path with three sets of write semantics to keep aligned | ✓ |

**User's choice:** A distinct "add past workout" entry point.
**Notes:** Trade flagged and accepted. CONTEXT D-33 requires all three creation paths funnel through one `startSession` call with a date parameter, and makes the date edit the single permitted exception to the LOG-22 / PITFALLS §12 rule that nothing rewrites `timezone` and `local_date` after session start.

---

## Claude's Discretion

Explicitly delegated during discussion:
- **Numeric keypad behaviour (LOG-05)** — user answered "Decide by yourself". Resolved as docked-on-focus (D-20).

Following the Phase 4 split (user consulted on interaction, schema delegated), resolved or left to research and planning:
- Schema additions — notes at three levels (LOG-16), pause accounting, the `workout_session.status` vocabulary becoming a published contract.
- The warm-up marker on `logged_set.set_type`, defined so Phase 7's values are additive.
- The warm-up scaling ruleset (LOG-17) and whether generated sets are materialized rows or un-persisted suggestions.
- Auto-advance (LOG-13) as a page turn with a toggle defaulting on, and where that toggle persists.
- One-off session start (LOG-02) and mid-workout add (LOG-14) reusing the Phase 3 picker; confirming an unprescribed row degrades legibly.
- Sync rules and the server apply path for `personal_record` and any new table.
- Query shape against PITFALLS §13.
- Whether `expo-keep-awake` should hold the screen on during a session.
- What two devices with a concurrent session should do.

## Deferred Ideas

- Live PR banner mid-set rather than only in the summary (FEATURES.md line 152).
- iOS Live Activities / Dynamic Island and an Android persistent countdown notification (PITFALLS §6 calls these a later differentiator).
- Superset rest semantics — rest after the pair, not each exercise. Phase 7.
- Rest-timer defaults configurable per program or per exercise (FEATURES.md line 70).
- Two-device concurrent session detection — belongs with Phase 10's reconciliation work.
- Program export/import to share a routine with a friend.
