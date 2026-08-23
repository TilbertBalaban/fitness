# Phase 5: In-Gym Session Logging - Research

**Researched:** 2026-08-23
**Domain:** Offline-first active-workout UI (React Native + React Native Web), wall-clock background notifications, shared pure-package PR/warm-up rules, sync apply-path wiring
**Confidence:** HIGH on codebase-verified facts (schema, sync service, existing components, vocabularies); MEDIUM on the 12 delegated design decisions (reasoned recommendations, not vendor-confirmed); LOW/ASSUMED on native background-delivery reliability and the exact warm-up percentage scheme (no public MacroFactor spec exists).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (carried forward or user-decided — do not re-litigate)

- **D-01:** Every logged set is durable the instant it is entered (`logSet()` already ships this). No draft buffer, no in-memory set list committed on finish.
- **D-02:** Snapshot-on-use — prescription frozen onto `session_exercise` at session start via `resolvePrescriptionForCycle`, never re-read from `routine_exercise`.
- **D-03:** `SyncModule`/PowerSync is the sole ingress for per-user offline-mutable data. Any new table joins back to `workout_session` in `ops/powersync/sync-rules.yaml`.
- **D-04:** Client-generated UUIDs before any network round-trip; aggregate-root ownership (child rows carry no `user_id`/`server_seq`).
- **D-05:** Weights are canonical kg as `numeric`, converted only at the display boundary (`toCanonicalKg`/`fromCanonicalKg`).
- **D-06:** `timezone`/`local_date` stamped once at session start from device IANA zone; no read path recomputes them. D-33 is the single exception.
- **D-07:** RIR is one number (`target_rir`, `logged_set.rir`), not a range. `target_rir_min/max` are forbidden columns.
- **D-08:** Platform divergence is a `.web.tsx` sibling resolved at build time, never a `Platform.OS` branch.
- **D-09:** Shared discriminator vocabularies live in `packages/api-contracts`, with a Postgres CHECK and matching SQLite values.
- **D-10:** No Xcode/Android SDK on this machine. Native claims rest on typecheck + correct API usage; web is where this phase is exercised end to end. Native observation deferred to ROADMAP Phase 999.1.
- **D-11:** One exercise at a time on a swipeable pager (reuse `DayDeck`/`react-native-tab-view` pattern), not a scrolling list.
- **D-12:** A pinned exercise strip above the pager, reusing `CycleStrip`'s visual language, with per-chip completion state and tap-to-jump.
- **D-13:** Per-exercise actions split — permanent compact bar for Warm-up/Targets/Note, overflow `⋮` for Swap/Remove/Reorder/Info. The bar's contents must be a single list constant, not hardcoded JSX.
- **D-14:** Adjusting a target mid-workout is session-only by default (writes the frozen `session_exercise` snapshot); "Also update my program" is a separate explicit write-back action.
- **D-15:** Write-back targets whichever row the displayed value resolved from (override if a cycle override row exists, else base). Distinct from Phase 4 D-17 (engine's future-cycle-only write target).
- **D-16:** Reps/RIR prefill from the program target (session_exercise snapshot); weight prefills from history (last time this exact set number was performed for this exercise). First-ever exercise shows "No previous" and a blank weight field — never guess. The lookup must be a single named function (Phase 8 replaces its body).
- **D-17:** Previous session's actual weight/reps stay visible, greyed, in the same row, tappable to overwrite.
- **D-18:** RIR is a third field (Weight | Reps | RIR); keypad next-arrow walks weight → reps → RIR → complete. Row must survive max OS accessibility font scale (04-UI-SPEC wrap-and-grow rule).
- **D-19:** One tap completes a set; second tap undoes it in place, never an edit mode.
- **D-20:** In-app numeric keypad docks at the bottom on field focus, OS keyboard never invoked. Band above the keypad reserved for Phase 6's plate strip.
- **D-21:** Rest timer is a persisted wall-clock target timestamp, never a JS interval. Remaining time recomputed from the stored timestamp on every foreground.
- **D-22:** Notification permission requested during onboarding, before any workout. Recorded risk (early-ask denial) accepted by the user; workout settings must expose a re-request path deep-linking to OS Settings.
- **D-23 (resolved by Claude):** A denied permission degrades to in-app sound + haptic with a persistent inline note — never a silently dead timer.
- **D-24:** Both timers live in a persistent header bar (duration left, rest right) above the exercise strip. Tapping rest timer opens full-screen view with extend/skip.
- **D-25:** Web gets real browser notifications behind the same `.web.tsx` seam. Background/lock-screen half is device-only and must be filed as a `.planning/WINDOWS.md` unrun-verify entry against Phase 999.1. `expo-notifications` is not installed.
- **D-26:** Rest starts from `session_exercise.target_rest_seconds` snapshot, stops/clears at zero, no overtime count-up. `logged_set.rest_taken_seconds` (exists, never written) records actual rest.
- **D-27 (resolved by Claude):** Extend adds a fixed increment and reschedules; skip cancels. Both operate on the stored target timestamp. Undoing a completed set cancels its scheduled alert.
- **D-28:** In-progress session surfaces as a Home banner (resume/discard), not silent auto-resume. Must not cost a query on the no-session-open path.
- **D-29:** Pause is a deliberate action stopping the duration clock; a crash is not a pause. Duration accounting derives from `started_at` + accumulated paused time.
- **D-30:** PR detection ships in Phase 5 (heaviest weight, best e1RM, most reps at a weight, best set volume), written to `personal_record`. `personal_record` has no server-side apply path (WINDOWS #19) — wiring it is this phase's job. PR rules must be one shared pure module imported by client and server.
- **D-31 (resolved by Claude):** Estimated 1RM shown only where the formula is valid (nullable, absence rendered explicitly). Lives in the same shared module as PR rules.
- **D-32:** Editing a past workout reopens the same screen in an editing mode — live-session machinery (timers, auto-advance, rest state) must be structurally unreachable, not merely inactive. One typed session-context value at the screen root.
- **D-33:** Adding a past workout is its own History entry point. All three session-creation paths (LOG-01/LOG-02/D-33) funnel through one `startSession` call with a date parameter. The date is the single exception to D-06 — one named function is the only code permitted to overwrite `timezone`/`local_date` after session start.

### Claude's Discretion (resolved below in Architecture Patterns / Code Examples)

- Schema additions: notes (set/exercise/session level), pause accounting, `workout_session.status` vocabulary promotion.
- `logged_set.set_type` warm-up marker vocabulary.
- Warm-up scaling ruleset: materialized rows vs. un-persisted suggestions.
- Auto-advance toggle persistence location.
- One-off session (`routine_day_id = null`) and mid-workout add degrade-legibly confirmation.
- Sync rules / server apply path completeness check beyond `personal_record`.
- Query shape for live workout screen, finish summary, History list.
- Screen-on behavior (`expo-keep-awake`).
- Two devices, one session — minimum v1 behavior.
- In-app numeric keypad implementation approach for RN + RN Web.

### Deferred Ideas (OUT OF SCOPE)

- Live PR banner mid-set (Hevy-style) — nothing in LOG-18 asks for it.
- iOS Live Activities / Dynamic Island, Android persistent countdown notification — named a "later differentiator, not v1" by PITFALLS §6.
- Superset rest semantics (rest after both exercises done) — Phase 7.
- Rest-timer defaults configurable per program/exercise beyond the existing `target_rest_seconds` — unrequested.
- Two-device concurrent session UI surfacing — Phase 10's cross-device reconciliation territory.
- Program export/import — not in any phase.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOG-01 | Start today's workout from active program | `resolveNextUp`'s `{kind:'workout', cycle, day}` feeds `startSession({routineDayId})` + `addSessionExercise({cycleId})` per exercise — see Code Examples §Session Start Funnel |
| LOG-02 | Start a one-off workout | `startSession({routineDayId: null})`, `ExercisePickerModal` multi-select, `EMPTY_PRESCRIPTION` path confirmed to resolve to nulls — see §5 discretion item |
| LOG-03 | Previous session's weight/reps shown inline | D-16/D-17 prefill+reference split; §Query Shape names the lookup query |
| LOG-04 | Tap previous value to autofill | Keypad field-focus contract in §12 |
| LOG-05 | In-app numeric keypad, never obscures value | §12 Numeric Keypad Architecture |
| LOG-06 | RIR 0–6+, changeable mid-workout | D-18; same field, same keypad flow |
| LOG-07 | One-tap complete, tap-again undo | D-19; cancels scheduled rest alert on undo (D-27) |
| LOG-08 | Rest timer auto-starts on set completion | D-21/D-26; wall-clock target write on `logSet` completion |
| LOG-09 | Rest timer survives backgrounding/lock, alerts | §8 `expo-notifications` install & API; D-25's web/native split; native half is `.planning/WINDOWS.md` unrun-verify |
| LOG-10 | Extend/skip rest timer, full-screen view | D-27; reschedule vs. cancel on the stored target |
| LOG-11 | Workout duration timer | D-29's `started_at` + accumulated-paused-seconds accounting |
| LOG-12 | Pause/resume workout | Schema additions §1 (`paused_at`, `accumulated_paused_seconds`, `'paused'` status) |
| LOG-13 | Auto-advance with toggle off | §4 `user_preference.auto_advance_enabled` column |
| LOG-14 | Add/swap/remove exercises mid-workout | `ExercisePickerModal` + `smart-swap.ts` reuse; §5 EMPTY_PRESCRIPTION confirmation |
| LOG-15 | Adjust targets mid-workout, session-only or persistent | D-14/D-15, already fully decided — no new research needed beyond wiring the Targets sheet to the two write paths |
| LOG-16 | Notes at set/exercise/session level | §1 Schema Additions — three nullable `text` columns |
| LOG-17 | Auto-calculated warm-up sets, toggleable off | §3 Warm-up Scaling Ruleset |
| LOG-18 | Finish summary: muscles, PRs, per-exercise breakdown, e1RM | §10 PR Rules + Estimator module; §7 Query Shape (summary aggregate) |
| LOG-19 | Correct entries from summary before dismissing | Same edit surface as D-19's tap-to-undo, reachable from the summary screen |
| LOG-20 | View/edit/rename/duplicate/delete past workouts | D-32 edit-mode session context; History query shape §7 |
| LOG-21 | Backfill by editing date/time | D-33's single date-rewrite function |
</phase_requirements>

## Summary

This phase builds entirely on an already-shipped, already-tested write path (`apps/mobile/lib/db/log-set.ts`) and two already-proven UI patterns from Phase 4 (`DayDeck`'s pager, `CycleStrip`'s chip strip). No new sync engine work is needed beyond extending existing PATCH field maps on `workout_session`/`session_exercise`/`logged_set` and wiring one net-new aggregate root (`personal_record`) through the server's `applyBatch`. The riskiest net-new dependency is `expo-notifications` (not installed; verified on npm at `57.0.13`, exactly SDK-57-paired), whose background-delivery behavior cannot be verified on this machine and must ship as a `.planning/WINDOWS.md` unrun-verify entry — the web half (browser `Notification` API) is fully verifiable now.

A significant codebase discovery changes the shape of two "Claude's Discretion" items: `apps/api/src/sync/sync.service.ts` already defines `SET_TYPES = new Set(['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap'])` — the full Phase-7-ready vocabulary is already anticipated in the sync validator, just missing from `packages/api-contracts` as an exported tuple and missing a Postgres CHECK constraint. This phase's job for `set_type` is to formalize what already exists, not invent it. Separately, `WINDOWS.md` entry #19 ("nine unwired tables") is now **stale**: reading `sync.service.ts`'s `TABLE_MAP` directly shows Phase 4 already wired `routine`, `routine_day`, `routine_exercise`, `routine_cycle`, and `routine_exercise_cycle_target`. Only **four** tables remain unwired — `equipment_profile`, `personal_record`, `body_metric`, `progress_photo` — and only `personal_record` is this phase's responsibility. `ops/powersync/sync-rules.yaml` already pulls `personal_record` (confirmed by reading the file); only the push/apply half needs wiring.

**Primary recommendation:** Build the active-workout screen as a thin renderer over three already-tested layers — the write path (`log-set.ts`, extended), the read pattern (`next-up-query.ts`'s one-select-per-table style), and two new shared pure packages (`packages/pr-rules` for PR detection/e1RM, extending `packages/progression-engine`'s pattern but not its file) — and treat the numeric keypad as a fully custom, non-native-focusable input surface so "OS keyboard never invoked" holds structurally on all three platforms rather than by convention.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Set/session/rest-timer state during a workout | Client (Local SQLite via PowerSync) | — | D-01/D-03: every write is local-first, durable on entry; no server round-trip on the hot path |
| Rest-timer wall-clock scheduling & OS alert | Client (native `expo-notifications` / browser `Notification`) | — | No server component; a scheduled OS notification is local-device state, not synced data |
| PR detection at session-finish time | Client (shared `packages/pr-rules`, invoked from mobile) | API (same package, invoked from `SessionModule` at sync-ingest) | ARCHITECTURE.md §4's progression-engine argument applies identically: client needs an instant answer offline, server reconciles against fully-merged history later (Phase 9/10) |
| Warm-up set scaling | Client (shared `packages/pr-rules` or a sibling pure module) | — | Deterministic pure function of one input (working weight); no server invocation needed, ever |
| `personal_record` durable storage & cross-device authority | Client write (local-first) | API (`SyncModule` apply path, this phase) | D-30: written locally like any other synced row; the *push apply path* must exist so the row survives to Postgres and pulls back to other devices |
| Sync vocabulary enforcement (`status`, `set_type`) | API (Postgres CHECK) | Client (SQLite mirror + `sync.service.ts` validator) | D-09: the CHECK constraint is the real backstop; the app-level validator is the fast-fail |
| Exercise picker / catalog read for mid-workout add | Client (Local SQLite, already-seeded catalog) | — | Phase 3's local-first catalog; no network dependency |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo-notifications` | `57.0.13` [VERIFIED: npm registry, `npm view expo-notifications versions`, 2026-08-23] | Scheduled local notification at a wall-clock target for the rest timer (D-21/D-25/D-27) | Only Expo-maintained package with `scheduleNotificationAsync`'s `DATE`-trigger API; matches installed Expo SDK 57 exactly |
| `expo-keep-awake` | `57.0.1` [VERIFIED: npm registry, `npm view expo-keep-awake versions`, 2026-08-23] | Hold the screen on during an active (non-paused) session | Package-legitimacy `OK` verdict; SDK-57-paired; official `<KeepAwake/>` scoped-activation API |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-native-pager-view` | `^9.0.2` (already installed) | D-11's exercise pager | Already proven web-compatible via `react-native-tab-view`'s internal `PanResponderAdapter` split (see `docs/platform-modules.md`) — reuse `DayDeck`, do not add a second pager library |
| `@shopify/flash-list` | `2.0.2` (already installed) | History tab's virtualized workout list | Already the house pattern for large lists |
| Browser `Notification` API | Web platform built-in, no package | D-25's `.web.tsx` sibling for rest-timer alerts | No install needed; gated behind `Notification.requestPermission()` |
| Web Screen Wake Lock API (`navigator.wakeLock`) | Web platform built-in, no package | `.web.tsx` sibling for keep-awake | Partial browser support (no Safari desktop as of this research) — must no-op gracefully, not throw |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `expo-notifications` | `react-native-push-notification` / raw native modules | Would break the Expo-managed-workflow convention this project has followed since Phase 1; no EAS-config-plugin story |
| A new `packages/pr-rules` package | Extending `packages/progression-engine` | Progression-engine's own name and Phase 8 scope ("what to lift next") are semantically distinct from "was this a record" — see §10 for the full argument |
| Fully custom keypad component | `TextInput` with `showSoftInputOnFocus={false}` | That prop is Android-only (confirmed against RN's own docs pattern used elsewhere in this codebase's platform audit) — does not suppress the keyboard on iOS or web, so it cannot satisfy D-20 on all three targets |

**Installation:**
```bash
cd apps/mobile
npx expo install expo-notifications expo-keep-awake
```

**Version verification:** `npm view expo-notifications versions --json` and `npm view expo-keep-awake versions --json`, run 2026-08-23, both top out with a `57.0.x` version published alongside the rest of the SDK-57 canary/stable train the project already runs (`expo@57.0.12` in `apps/mobile/package.json`).

## Package Legitimacy Audit

| Package | Registry | Age (latest version) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `expo-notifications` | npm | Latest version published 2026-08-20 (3 days before this research) | 4,275,802/wk | `github.com/expo/expo` | **SUS** (`too-new`) | **Flagged — planner must add `checkpoint:human-verify` before install.** The `too-new` signal fires on the latest point-release's publish date, not the package's actual age — `expo-notifications` is a first-party Expo SDK package with 4.27M weekly downloads and no postinstall script; the heuristic is tripped by Expo's own frequent SDK-57 patch cadence, not a legitimacy concern. Verify the version pinned matches the installed `expo` SDK major (57.x) before installing, same discipline already applied to every other `expo-*` package in this repo. |
| `expo-keep-awake` | npm | Latest version published 2026-07-15 | 8,010,709/wk | `github.com/expo/expo` | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `expo-notifications` — the flag is a false positive from a recency heuristic on a mono-repo-versioned first-party package; still gate the install behind a `checkpoint:human-verify` that confirms `npm view expo-notifications version` at install time resolves to a `57.x` release, per this project's existing "pin to the SDK train" discipline (see `docs/platform-modules.md`'s treatment of `react-native-gesture-handler`/`reanimated` pinning).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Active Workout Screen (apps/mobile/app/(tabs)/workout.tsx) ──────────┐
│                                                                                                    │
│  Header bar: duration (D-29 accumulated-pause math) | rest countdown (D-21 wall-clock recompute)  │
│         │                                                    │                                    │
│         ▼                                                    ▼                                    │
│  Exercise strip (CycleStrip pattern) ──tap──▶ pager index    Rest-timer module (.web.tsx split)   │
│         │                                                    │  native: expo-notifications         │
│         ▼                                                    │  web:    browser Notification API   │
│  DayDeck-style pager (one exercise per page) ─auto-advance─▶ (LOG-13, toggle from user_preference) │
│         │                                                                                          │
│         ▼                                                                                          │
│  Set row: Weight | Reps | RIR  ◀── prefill: reps/RIR from session_exercise snapshot (D-02/D-16)   │
│         │                          weight from history-lookup query (single named function)        │
│         ▼                          reference: greyed previous actual values (D-17), tap-to-fill    │
│  Field focus ──▶ NumericKeypad (docked bottom, non-native-focusable field, §12) ──▶ logSet()       │
│                                                                        │                            │
│                                                                        ▼                            │
│                                                        Local SQLite (durable, D-01) ──▶ PowerSync   │
│                                                                        │                    outbox  │
└────────────────────────────────────────────────────────────────────────┼──────────────────────────┘
                                                                          │ (background push when online)
                                                                          ▼
                                                   ┌─────────────── NestJS SyncModule ───────────────┐
                                                   │  applyBatch: TABLE_MAP + SINGLETON_ROOT_TYPES     │
                                                   │  gains `personal_record` this phase (§6)          │
                                                   └──────────────────────┬────────────────────────────┘
                                                                          ▼
                                                                     Postgres (source of truth)
                                                                          │
                                                                          ▼ (pull, already wired — sync-rules.yaml
                                                                            already SELECTs personal_record)
                                                                other devices' Local SQLite
```

### Recommended Project Structure

```
apps/mobile/
├── app/(tabs)/workout.tsx              # active-workout screen, replaces PlaceholderScreen
├── app/(tabs)/history.tsx              # history list + add-past-workout entry point (D-33)
├── components/
│   ├── ExerciseStrip.tsx               # D-12, CycleStrip-pattern reuse
│   ├── SetRow.tsx                      # D-16/D-17/D-18, hook-free View + stateful wrapper (existing pattern)
│   ├── NumericKeypad.tsx               # D-20, §12
│   ├── RestTimerBar.tsx                # D-24 header widget
│   ├── RestTimerFullScreen.tsx         # D-10's full-screen extend/skip view
│   └── WorkoutSummary.tsx              # LOG-18/LOG-19
├── lib/
│   ├── db/
│   │   ├── log-set.ts                  # EXTENDED: notes params, warm-up set_type, D-33 date param, pause/resume writers
│   │   ├── session-query.ts            # NEW — the live-screen/summary/history read pattern (§Query Shape)
│   │   └── personal-record.ts          # NEW — logPersonalRecord() write helper, mirrors log-set.ts's shape
│   ├── rest-timer.ts                   # NEW — pure scheduling math (target timestamp, remaining-time recompute)
│   ├── rest-timer.web.ts               # NEW — browser Notification implementation
│   ├── rest-timer.native.ts            # NEW — expo-notifications implementation (or plain .ts + guard, see D-08 exception note)
│   └── keep-awake.web.ts               # NEW — Screen Wake Lock, no-ops if unsupported
packages/
├── progression-engine/                 # UNCHANGED this phase (Phase 8's domain)
└── pr-rules/                           # NEW — see §10
    └── src/
        ├── index.ts
        ├── estimated-1rm.ts            # D-31, Epley + validity cutoff
        ├── personal-records.ts         # D-30's four PR types
        └── warmup.ts                   # LOG-17's scaling ruleset
```

### Discretion Item Resolutions

#### 1. Schema additions

**Notes — three nullable `text` columns, not a separate table.**
Add `notes: text('notes')` to `logged_set`, `session_exercise`, and `workout_session` (Postgres + SQLite mirror, both nullable, no CHECK). Rationale: every other per-row annotation in this schema (`cue_text`, `instructions_text` on `exercise`) is a plain nullable column; there is exactly one note per entity per instance (not a threaded/multi-author log), so a separate `note` table would only add a join for zero behavioral gain and would need its own sync-aggregate wiring (another root-family entry in `sync.service.ts`) for no reason. PATCH_FIELDS gains a `notes: 'notes'` entry on all three existing `*_PATCH_FIELDS` maps; `hasInvalidField` needs no new check beyond "is a string or null."

**Pause accounting — `paused_at` (nullable timestamp) + `accumulated_paused_seconds` (integer, default 0) on `workout_session`.**
Duration displayed = `now - started_at - accumulated_paused_seconds - (paused_at ? now - paused_at : 0)`. Pausing sets `paused_at = now`; resuming reads the elapsed pause, adds it to `accumulated_paused_seconds`, and clears `paused_at` to null — both writes go through the existing `WORKOUT_SESSION_PATCH_FIELDS` PATCH path, so no new sync machinery is needed, only two new patchable fields. **LWW reconciliation across two devices:** because both fields live on the single `workout_session` row and PATCH fields are validated column-by-column (`patch-update-set.ts`'s `patchAwareSet`), a PATCH from device A naming `paused_at` and a concurrent PATCH from device B naming `accumulated_paused_seconds` do not clobber each other structurally — but two devices *simultaneously toggling pause* is a genuine LWW race (whichever PATCH lands with the higher `server_seq` wins the whole row's current state for these two fields, since both are logically one compound state machine). This is the same class of risk the codebase already accepts everywhere else on `workout_session` (there is no field-pairing lock primitive in this sync design) — document it as an accepted risk identical in kind to the rest of the row, not a new one this phase introduces.

**`workout_session.status` — promote to a D-09 vocabulary, add `'paused'`, no separate "abandoned" status.**
`sync.service.ts` line 176 already validates against `SESSION_STATUSES = new Set(['in_progress', 'completed', 'discarded'])` [VERIFIED: apps/api/src/sync/sync.service.ts:176 — `const SESSION_STATUSES = new Set(['in_progress', 'completed', 'discarded']);`], but there is **no Postgres CHECK constraint on `workout_session.status`** (confirmed by grepping `apps/api/src/db/schema/*.ts` for `check(` — only `routine_status_check` and `routine_cycle_kind_check` exist). This phase should: (a) add `WORKOUT_SESSION_STATUSES = ['in_progress', 'paused', 'completed', 'discarded'] as const` to `packages/api-contracts`, (b) add a `workout_session_status_check` CHECK constraint mirroring the `routine_status_check` pattern in `apps/api/src/db/schema/session.ts`, (c) update `sync.service.ts`'s `SESSION_STATUSES` to build from the new exported tuple instead of a retyped literal Set (matching the `LOAD_TYPES`/`ROUTINE_STATUSES` pattern already used for every other vocabulary), (d) run `pnpm --filter api db:verify` per this project's no-migration-file convention. **No separate "abandoned" status is needed** — D-28's Home-banner discard action already writes `status: 'discarded'`, which is the only "user gave up on this session" case named by any requirement; do not invent an automatic timeout-based abandonment for v1 (unrequested, and would need a background job this project has no precedent for).

#### 2. `logged_set.set_type` vocabulary — already anticipated in code, formalize it

`apps/api/src/sync/sync.service.ts` line 177 already reads: `const SET_TYPES = new Set(['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap']);` [VERIFIED: apps/api/src/sync/sync.service.ts:177]. This is the exact additive, Phase-7-ready vocabulary D-09 calls for — it was defined ahead of need but never promoted to a shared, documented contract. This phase's job:
1. Export `SET_TYPES = ['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap'] as const` from `packages/api-contracts` (new file or added to an existing vocabulary file, following `program.ts`'s `ROUTINE_STATUSES`/`CYCLE_KINDS` pattern).
2. Add a `logged_set_set_type_check` Postgres CHECK constraint in `apps/api/src/db/schema/session.ts` mirroring `routine_cycle_kind_check`.
3. Update `sync.service.ts` to build `SET_TYPES` from the exported tuple (removing the retyped literal), matching every other vocabulary in that file.
4. This phase only ever *writes* `'normal'` and `'warmup'` — `'drop'`/`'myorep'`/`'partial'`/`'failure'`/`'amrap'` stay reserved, unwritten, for Phase 7. Nothing in this phase's UI offers them.

Add this precedent to `docs/program-vocabularies.md` (or a sibling `docs/session-vocabularies.md`) matching its existing documentation shape, since D-09 explicitly names that file's pattern as the one to follow.

#### 3. Warm-up scaling ruleset (LOG-17)

**Materialize generated warm-up sets as real `logged_set` rows at generation time, `completed: false`.**
This follows directly from D-01: every other row in this app becomes durable on entry, and an un-persisted "suggestion" would be the one exception to that rule and the one thing NOT covered by force-quit recovery (success criterion 4 says "every logged set intact," and an uncompleted warm-up suggestion the user was about to check off is exactly the kind of in-progress state a force-quit must not lose). Concretely: tapping the exercise's "Warm-up" action button (D-13) opens a small sheet asking for (or defaulting to, from the already-known working weight if a working set has already been logged, else the D-16 prefill weight) the working weight, computes N rows via the pure `warmupSets()` function, and inserts them via `logSet()` with `setType: 'warmup'`, `completed: false`, at the lowest available `set_index` values (warm-ups always precede logged working sets in the UI, and are generated before any working set exists in the common flow, so `set_index` 1..N is free; if a working set was already logged, warm-up rows still get inserted starting at index 1 and the app must re-render working sets after them by `set_index` order, never renumber existing rows — `set_index` is described in the schema comment as "strictly incrementing," not "gap-free," so inserting after the fact means later indices, sorted for display by a secondary "is warmup" flag rather than raw index, if a user adds warm-ups retroactively — flag this edge case for the planner as a UI-ordering decision, not a schema one).

**The formula (deterministic, pure, testable — `[ASSUMED]`, no public MacroFactor spec exists per PITFALLS.md §8):**
```
warmupSets(workingWeightKg: number, roundingIncrementKg = 2.5): { weightKg: number; reps: number }[]
// 3 fixed steps, evidence-informed (RPE/volume-landmark literature convention used by
// Strong/Hevy-style competitors), NOT MacroFactor's undocumented internal formula:
//   Step 1: 40% of working weight × 10 reps
//   Step 2: 60% of working weight × 5 reps
//   Step 3: 80% of working weight × 3 reps
// Each weight rounds to the nearest roundingIncrementKg (Phase 6 replaces this with the
// gym profile's real plate increments — this phase's default is a flat 2.5kg round).
```
Toggle-off is two-level: a `user_preference.warmup_sets_enabled boolean not null default true` column (global default) plus a per-invocation choice (tapping "Warm-up" is itself opt-in per exercise, so the global toggle mainly controls whether the action bar's Warm-up button pre-populates on session start vs. requires a manual tap — confirm this UX nuance with the planner/UI-SPEC phase, it is a presentation detail, not a data-model one).

#### 4. Auto-advance (LOG-13)

Persist in `user_preference` as a new `auto_advance_enabled boolean not null default true` column, Postgres + SQLite mirror, added to `USER_PREFERENCE_PATCH_FIELDS`, validated as boolean in `hasInvalidField`'s `user_preference` branch. This follows the exact precedent of `userPreference.weightUnit`/`activeRoutineId` — a single-row-per-user, PATCH-updated column, no new table, no new sync-aggregate wiring (it rides the already-wired `user_preference` singleton root).

#### 5. One-off sessions (LOG-02) and mid-workout add (LOG-14) — `EMPTY_PRESCRIPTION` degrades legibly, confirmed

`addSessionExercise` in `apps/mobile/lib/db/log-set.ts` already takes `EMPTY_PRESCRIPTION = EMPTY_TARGET` when `input.routineExerciseId` is falsy [VERIFIED: apps/mobile/lib/db/log-set.ts, `const EMPTY_PRESCRIPTION: Prescription = EMPTY_TARGET;` and the ternary in `addSessionExercise`], and `EMPTY_TARGET` is `Object.freeze({ targetSets: null, targetRepMin: null, targetRepMax: null, targetRir: null, targetRestSeconds: null })` [VERIFIED: packages/api-contracts/src/program.ts:28-34]. The Home screen already has the exact rendering precedent for this: `displayOrDash(value: number | null): string { return value === null ? '—' : \`${value}\`; }` [VERIFIED: apps/mobile/app/(tabs)/index.tsx, function `displayOrDash`]. **Recommendation: reuse `displayOrDash` (or extract it to a shared `lib/format.ts` if it is not already exported) for every target field on the set row** — a one-off session's set row shows "—" for target reps/RIR/rest, never `0` or `NaN`. This closes the discretion item with no new code needed beyond reusing an existing, already-tested function.

#### 6. Sync rules and the server apply path

**WINDOWS.md #19 is stale.** It claims nine unwired tables (`routine, routine_day, routine_exercise, equipment_profile, exercise, personal_record, body_metric, progress_photo, user_preference`), dated from Phase 2 (2026-08-17) and never updated after Phase 4. Reading `apps/api/src/sync/sync.service.ts`'s `TABLE_MAP` directly today [VERIFIED: apps/api/src/sync/sync.service.ts, `const TABLE_MAP = { workout_session, session_exercise, logged_set, exercise, user_exercise_preference, routine, routine_day, routine_exercise, user_preference, routine_cycle, routine_exercise_cycle_target }`] shows **11 of the 15** `SYNCED_TABLES` [VERIFIED: packages/api-contracts/src/sync.ts:10-26] already wired — Phase 4 wired `routine`, `routine_day`, `routine_exercise`, `user_preference`, `routine_cycle`, `routine_exercise_cycle_target` along the way. **Only four tables remain unwired: `equipment_profile`, `personal_record`, `body_metric`, `progress_photo`.** Of those, only `personal_record` is this phase's requirement (D-30); `equipment_profile` is Phase 6's, `body_metric`/`progress_photo` are Phase 12's. **The planner must file a WINDOWS.md correction** (amend #19, do not leave the stale "nine tables" claim standing) as part of this phase's housekeeping.

**Wiring `personal_record`'s apply path — the singleton-root pattern, not the aggregate-root pattern.** `personal_record` has no synced children and is never referenced as a parent by another synced type, so it fits `SINGLETON_ROOT_TYPES` exactly like `exercise`/`user_exercise_preference`/`user_preference` [VERIFIED: apps/api/src/sync/sync.service.ts:97, `const SINGLETON_ROOT_TYPES = new Set<string>(['exercise', 'user_exercise_preference', 'user_preference']);`]. Concretely, this phase adds:
- `personal_record` to `TABLE_MAP`, `SINGLETON_ROOT_TYPES`, `ROOT_TABLE_BY_TYPE`, and `AGGREGATE_RANK` (rank 0, like the other singletons).
- A `toPersonalRecordValues(id, userId, data)` function following `toUserExercisePreferenceValues`'s ownership pattern: **`userId` always comes from the authenticated session argument, never from `op.data.user_id`** [VERIFIED: apps/api/src/sync/sync.service.ts comment above `toExerciseValues`, "userId always comes from the authenticated session argument, never from data — a PUT naming another user's user_id in its payload is stored against the pusher's own id"].
- `hasInvalidField` branch for `personal_record`: validate `pr_type` against a new `PR_TYPES` vocabulary (`['heaviest_weight', 'best_e1rm', 'most_reps_at_weight', 'best_set_volume']`, exported from `packages/pr-rules` or `packages/api-contracts` and CHECK-constrained in Postgres, same D-09 shape) and `value` as a non-negative decimal (reuse `isNonNegativeDecimalOrNull`, already used for `weight_kg`).
- `PERSONAL_RECORD_PATCH_FIELDS` — likely PUT-only in practice (a PR row is written once, never edited), but the map still needs to exist for type-completeness with the rest of the file's pattern.
- The pull side needs **no change** — `ops/powersync/sync-rules.yaml` already contains `SELECT * FROM personal_record WHERE user_id = auth.user_id()` [VERIFIED: ops/powersync/sync-rules.yaml, line reading `- SELECT * FROM personal_record WHERE user_id = auth.user_id()`], so once the push path applies these rows to Postgres, they already sync back down with zero additional sync-rules work.

**No other new table is needed this phase.** Warm-up marking rides the existing `logged_set` write path; notes ride existing PATCH field maps on three already-wired tables; pause accounting rides `workout_session`'s existing PATCH path; auto-advance rides `user_preference`'s existing PATCH path. `personal_record` is the only net-new aggregate-root wiring this phase performs.

#### 7. Query shape

Follow `next-up-query.ts`'s house pattern exactly: one `select` per table, joined/assembled in memory, never a per-row loop.

**Live workout screen** (the whole open session): 4 selects —
1. `workoutSession` row by id.
2. `sessionExercise` rows `WHERE session_id = ?`.
3. `loggedSet` rows `WHERE session_exercise_id IN (...)` from query 2's ids (`inArray`, one query for the whole session, mirroring `sync.service.ts`'s own batched-lookup discipline).
4. `exercise` metadata rows `IN (...)` from query 2's `exercise_id`s (name, load type, muscle mapping needed for the header/pager labels).

**Finish summary aggregate**: reuses the same 4 selects (the session is already fully loaded by the time the user finishes) plus:
5. `personalRecord` rows written during this session (`WHERE logged_set_id IN (...)` from the session's logged-set ids, or more simply `WHERE achieved_at >= session.started_at AND user_id = ?` — prefer the `logged_set_id IN (...)` form since it is a precise join, not a time-window heuristic).
6. `exerciseMuscleMapping` + `muscleGroup` for "muscles trained" — already-existing pattern from `next-up-query.ts`'s own two selects for this exact join.

**History list**: paginate at the aggregate boundary (PITFALLS §13's explicit warning against over-fetching the whole tree). For a page of N sessions:
1. `workoutSession` rows, `ORDER BY started_at DESC LIMIT N OFFSET ...` (or a cursor on `started_at`/`id`).
2. One aggregate query for the page's set/exercise counts — `SELECT session_exercise.session_id, COUNT(logged_set.id) FROM session_exercise JOIN logged_set ... WHERE session_exercise.session_id IN (...) GROUP BY session_exercise.session_id` — a single grouped query for the visible page, never one count-query per row in a loop. This is the concrete answer to "the History list must not cost a query per session."

#### 8. `expo-notifications` — install, scheduling API, permission model, and the verification split

**Install:** `npx expo install expo-notifications` inside `apps/mobile` resolves `57.0.13` against the installed `expo@57.0.12` [VERIFIED: npm registry version list, matches the SDK-57 train]. Requires an `expo-notifications` config plugin entry in `app.json`/`app.config.ts`'s `plugins` array [CITED: docs.expo.dev/versions/latest/sdk/notifications — "Configure expo-notifications in app.json" example], which is a `expo prebuild`/dev-client-affecting change — this phase needs a new dev-client build to actually exercise anything native (this machine cannot build/run it; see Environment Availability).

**Wall-clock scheduling API [CITED: docs.expo.dev/versions/latest/sdk/notifications]:**
```ts
import * as Notifications from 'expo-notifications';

const id = await Notifications.scheduleNotificationAsync({
  content: { title: 'Rest complete', body: 'Time for your next set' },
  trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: targetTimestamp },
});
// Reschedule (extend, D-27): cancel the old id, schedule a new one at the new target — there is
// no "update" API for an already-scheduled notification.
await Notifications.cancelScheduledNotificationAsync(id);
// Cancel (skip, or undo the completed set that started this timer, D-27):
await Notifications.cancelScheduledNotificationAsync(id);
```
Foreground presentation behavior needs `Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) })` [CITED: docs.expo.dev] registered once at app startup, or a foregrounded rest-timer alert will not display at all (the handler's default is to suppress foreground notifications entirely).

**Permission flow (D-22/D-23) [CITED: docs.expo.dev]:**
- Onboarding: `await Notifications.requestPermissionsAsync()`.
- Later checks (workout settings re-request path, D-23's "degrades to in-app sound + haptic" branch): `await Notifications.getPermissionsAsync()` — never call `requestPermissionsAsync()` again after an iOS denial (iOS will not re-prompt; the only path back is `Linking.openSettings()`, which is the deep-link D-22 already calls for).
- Android channel setup is required for Android 8+ notification sound/importance control: `Notifications.setNotificationChannelAsync('rest-timer', { name: 'Rest timer', importance: Notifications.AndroidImportance.HIGH })` [CITED: docs.expo.dev "Manually configure notification sounds on Android"].
- **Android 13+ (API 33) note [ASSUMED — not directly confirmed via Context7 in this session, standard Android platform behavior]:** scheduling a notification on Android 13+ additionally requires the runtime `POST_NOTIFICATIONS` permission, distinct from iOS's authorization model; `expo-notifications`' `requestPermissionsAsync()` is documented to request this on Android 13+ as part of its unified API, but this specific claim should be spot-checked against the installed `expo-notifications` version's own Android-permission section before the planner locks the onboarding copy, since Android permission dialogs are OS-version-gated and this project's target Android API level was not confirmed in this research pass.

**What is doc-backed vs. device-only:**

| Claim | Status |
|---|---|
| `scheduleNotificationAsync`'s `DATE` trigger fires at the given `Date` | [CITED: docs.expo.dev] — documented API contract |
| Recomputing remaining time from a stored timestamp works correctly when the app returns from background | [ASSUMED, architecturally sound] — this is pure JS math on `Date.now()`, no native dependency; safe to unit-test |
| A scheduled notification actually **fires and is audible/visible while the app is fully backgrounded and the phone is locked**, on this project's target iOS/Android versions | **Device-only — cannot be verified on this machine (D-10). Must be filed as a `.planning/WINDOWS.md` unrun-verify entry against ROADMAP Phase 999.1, per STATE.md's existing flag: "expo-notifications background delivery reliability needs real-device verification, not doc reading."** |
| Browser `Notification` API posts while a tab is backgrounded/hidden | [ASSUMED, standard web platform behavior, not independently verified against a live browser in this session per CLAUDE.md's "never launch a browser unless asked" rule] — verifiable via Playwright without a real device, should be exercised in this phase's e2e suite (does not need a human) |

**Web sibling:** `lib/rest-timer.web.ts` uses `Notification.requestPermission()` and `new Notification(title, { body })`, scheduled via a plain `setTimeout` recomputed against the stored wall-clock target on every `visibilitychange` event (mirrors the native recompute-on-foreground rule) — this is the `.web.tsx`-sibling seam D-25 names explicitly, and `docs/platform-modules.md`'s Notifications row already anticipates it ("Likely a shared `notify()` module with a `.web.tsx`/`.web.ts` sibling").

#### 9. `expo-keep-awake`

**Recommend: hold the screen awake during an active (in-progress, non-paused, non-edit-mode) session.** Cost is battery drain for the session's duration (typically 30–90 minutes), which is an acceptable, well-precedented trade for a fitness-logging app — PITFALLS §6 names "users forced to keep the screen awake [manually]" as a friction complaint specifically because the app *doesn't* do this itself. Use the `<KeepAwake />` component (or `activateKeepAwakeAsync()`/`deactivateKeepAwake()` imperative pair) scoped to the workout screen's active-session render branch only — deactivate on pause (D-29), on finish, and on navigating away, and never activate at all in D-32's edit-mode branch (editing a past workout has no live timers to protect). Web sibling (`keep-awake.web.ts`) uses `navigator.wakeLock.request('screen')` behind a feature-detection guard (`'wakeLock' in navigator`), releasing the lock on the same three triggers; where unsupported, no-op silently rather than throwing — this is a legitimate "quietly degraded" case per `docs/platform-modules.md`'s own precedent for haptics ("progressive enhancement... an acceptable degradation because no capability is lost, only feedback" — screen-awake is the same class of enhancement, not a data or correctness concern).

#### 10. PR rules + estimated-1RM module placement

**Recommend a new package, `packages/pr-rules`, sibling to `packages/progression-engine`, not a merge into it.** Three reasons: (1) `progression-engine`'s name and Phase 8 scope are specifically "what to lift next" — a forward-looking recommendation engine; PR detection is retrospective ("was this session's performance a record"), a different question with different inputs (PR rules need the exercise's full logged history; progression needs the last session plus the frozen prescription). Conflating them risks Phase 8 growing `progression-engine` in a direction that couples awkwardly to PR-detection internals. (2) Phase 9/10 extend PR rules with retrospective reconciliation and cross-device authority — logic that has nothing to do with progression — so `pr-rules` growing independently keeps that boundary clean from day one. (3) The precedent D-30 cites (`packages/progression-engine` as "an existing shared pure package... currently near-empty") is about the *pattern* (pure, framework-agnostic, imported by both client and server), which a second package satisfies identically — it is not an argument that there must be exactly one such package in this monorepo.

**The four PR types, precise definitions (all exclude `set_type = 'warmup'` and require `completed = true`, matching `ARCHITECTURE.md` §1's volume-attribution exclusion rule for the same reason — a warm-up is not a working effort):**

| PR type (`pr_type`) | Definition | `value` stored |
|---|---|---|
| `heaviest_weight` | `MAX(weight_kg)` across all completed, non-warmup sets ever logged for this exercise | the weight, in kg |
| `best_e1rm` | `MAX(estimated1RM(weight_kg, reps))` where `estimated1RM` returns `null` for `reps > 10` (see below) | the estimated 1RM, in kg |
| `most_reps_at_weight` | For the specific `weight_kg` of the newly-logged set, `MAX(reps)` across all completed, non-warmup sets ever logged at that *exact* weight for this exercise | the rep count |
| `best_set_volume` | `MAX(weight_kg × reps)` — a single set's volume, not a session total — across all completed, non-warmup sets ever logged for this exercise | the volume (kg × reps) |

A PR check runs per newly-completed set against the exercise's prior history (excluding the set just logged, then comparing); if the new set ties or beats the prior best, insert a `personal_record` row with `logged_set_id` pointing at it. This is a pure function of "prior best value for this exercise/type" + "this set's value" — no ambient state, matching the `next-up.ts` shape D-30 asks for.

**Estimated 1RM formula and validity cutoff (D-31):**
```ts
// Epley formula, the simpler and more commonly cited of the two mentioned in PITFALLS.md §8.
// Both Epley and Brzycki are documented to degrade above ~10-12 reps; this project picks a
// single, conservative, deterministic cutoff rather than "roughly" — reps <= 10 is valid,
// reps >= 11 returns null. [ASSUMED: the exact cutoff value (10 vs. 12) is a project judgment
// call, not sourced from a validated study threshold — PITFALLS.md itself says "roughly
// 10-12" with no single authoritative number.]
export function estimated1RM(weightKg: number, reps: number): number | null {
  if (reps <= 0 || weightKg <= 0) return null;
  if (reps > 10) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
```
The finish-summary breakdown renders the absence explicitly (e.g., "e1RM: —" or omits the field) rather than ever showing a number computed past the cutoff — this is the literal requirement behind ANLY-10/D-31.

#### 11. Two devices, one session — minimum v1 behavior

**Recommend: no cross-device detection UI in v1 (matches the Deferred Ideas list), but document the actual mechanism so the planner does not mistake "no data loss" for "no risk."** `logged_set` rows are independent child rows with client-generated UUIDs (D-04) — two devices logging different sets to the same `session_exercise` never lose data; each row survives independently regardless of push order (PITFALLS §1's LWW-destroys-rows failure mode does not apply to *inserting new rows*, only to *concurrently editing the same row*). The one real, previously-undocumented risk this research surfaces: **`logSet()`'s `set_index` is computed as `MAX(set_index) + 1` against the device's own local database** [VERIFIED: apps/mobile/lib/db/log-set.ts, `const setIndex = (maxRow?.maxIndex ?? 0) + 1;`]. Two devices logging to the *same* `session_exercise` while both offline will each independently compute the same next `set_index` (e.g., both compute `5`), and both rows sync up as two distinct `logged_set` rows carrying the identical `set_index = 5`. This is **not** data loss (both rows survive, both have unique ids) but **is** a display-ordering ambiguity ("two set 5s"). Recommend documenting this explicitly for the planner as an accepted v1 gap (consistent with the discretion item's own framing — "unrequested, belongs with Phase 10") rather than silently discovering it during UAT; a cheap future mitigation (tie-break same-`set_index` rows by `logged_at`, never by insertion order) is a display-only fix that does not require this phase's schema to change. At minimum, `startSession` should check the device's own already-synced-down data for an existing `in_progress`/`paused` session before starting a second one and surface a simple "you already have a workout in progress" guard — this is a client-side UX convenience, not a server-enforced invariant (no unique-partial-index is proposed, matching `docs/program-vocabularies.md`'s own reasoning for why `routine.status = 'active'` isn't enforced by a DB constraint either — offline-first can't atomically enforce a global invariant without a round trip).

#### 12. In-app numeric keypad (D-20) — implementation approach for RN + RN Web

**Recommend: the "value field" is a non-native-focusable `Pressable`/`View`, never a real `TextInput`.** Render the weight/reps/RIR field as a styled `Pressable` displaying the current formatted value (with an optional blinking-cursor affordance for the actively-edited field); tapping it sets "this field is active" in the row's local state and mounts the docked `NumericKeypad` below. All digit/decimal/backspace/stepper/next-arrow presses write directly into that state — there is no `TextInput`, so there is no OS keyboard to suppress on any platform. This is the only approach confirmed to satisfy D-20 literally on **all three** targets:
- **iOS:** a real `TextInput`, even with `editable={false}`, can still trigger the system keyboard on focus in some RN versions depending on how focus is granted; avoiding `TextInput` entirely for this control sidesteps the question altogether rather than fighting it per-platform.
- **Android:** `TextInput`'s `showSoftInputOnFocus={false}` prop *would* work here, but it is **Android-only** [reasoning from this project's own established platform-divergence audit style in `docs/platform-modules.md` — RN's own documentation scopes this prop to Android] and would require a second, different suppression mechanism for iOS, doubling the surface area D-20 is trying to keep simple.
- **Web:** an `<input>` element (which `TextInput` renders to under `react-native-web`) can trigger a virtual keyboard on touch-screen web/tablets even with `readOnly` set, depending on browser; a plain `Pressable`/`View` is not an `<input>` at all, so there is structurally no virtual keyboard to suppress.

**Layout:** the `NumericKeypad` renders as a fixed-height flex row anchored to the screen bottom (`position: 'absolute', bottom: 0, left: 0, right: 0` or a bottom-pinned flex sibling of the scrollable set-row content — prefer the flex-sibling form so it participates in normal RN Web layout rather than relying on `position: absolute`, which has more cross-platform quirks under `react-native-web`). **Reserve the band directly above the keypad as an always-rendered (even if empty) fixed-height container** — D-20 explicitly names this as Phase 6's future plate-strip real estate; always rendering an empty `View` of the intended height now means Phase 6 fills content into an existing layout slot rather than triggering a relayout. The set row's scrollable content sits above both the reserved band and the keypad, so the actively-edited field is guaranteed to scroll into the visible area above the keypad (LOG-05's "never obscures the value" requirement) — this is a scroll-into-view concern for the screen's `ScrollView`/`FlatList`, not the keypad's own layout.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rest-timer background alerting | A custom native module or a JS `setInterval`-based "keep the timer running in the background" hack | `expo-notifications`' `scheduleNotificationAsync` with a `DATE` trigger | PITFALLS §6 names this exact mistake as the category's signature failure; JS timers do not survive backgrounding on either OS |
| Weight-unit conversion for prefill/reference display | A second kg↔lb conversion function inside the set-row component | `toCanonicalKg`/`fromCanonicalKg` from `packages/api-contracts` | D-05 — one conversion boundary; a second implementation is exactly how rounding drift enters a "single source of truth" schema |
| PR/e1RM math | Duplicating the formula inline in both the mobile summary screen and a future server reconciliation job | `packages/pr-rules`, imported by both | ARCHITECTURE.md §4's argument for `progression-engine` applies identically — "the fix is not to avoid running it twice, it's to avoid writing it twice" |
| Session position/rotation tracking during logging | A new "which exercise am I on" cursor column | The pager's own local `index` state, sourced from `session_exercise.order_index` (already snapshotted) | D-02's snapshot-on-use already resolved this; this phase reads it, never re-derives it |
| History pagination | Fetching the whole session tree for every visible row | The grouped-aggregate query in §7's History list pattern | PITFALLS §13 names this exact anti-pattern; the fix is one `GROUP BY` query for the visible page, not N+1 |

**Key insight:** almost nothing in this phase is a new architectural primitive — it is UI built on top of Phase 2's already-proven write/sync foundation and Phase 4's already-proven pager/strip components. The two genuinely new primitives (wall-clock notification scheduling, and a shared PR-rules package) both have a named precedent elsewhere in this codebase (D-21's own comparison to the rest-timer problem PITFALLS §6 describes; `progression-engine`'s shared-pure-package pattern) — resist inventing a third shape for either.

## Common Pitfalls

### Pitfall 1: Prefilling weight from the wrong "previous" set
**What goes wrong:** D-16 requires weight to prefill from "what you lifted for that same set number the last time you did this exercise" — a naive implementation that just takes "the last logged set for this exercise" (ignoring set-number correspondence) will prefill set 3's weight from whatever the most recent set was, not from the historical set 3.
**Why it happens:** "Most recent set for this exercise" is the easier query to write; "most recent set 3 for this exercise" requires filtering on `set_index` correspondence across sessions, which needs the exercise's own set-numbering history, not just its most recent row.
**How to avoid:** The history-lookup function (D-16's "single named function") must take the current row's intended `set_index` as an input and query the most recent *prior session's* `logged_set` row with that same `set_index` for that exercise — not simply `ORDER BY logged_at DESC LIMIT 1`.
**Warning signs:** A test that logs a 3-set exercise, then starts a new session and only enters set 1, shows set 2's prefill matching set 1's weight instead of the correct historical set 2 weight.

### Pitfall 2: Warm-up rows breaking `set_index` assumptions elsewhere
**What goes wrong:** Any code that assumes `set_index` is contiguous per "working set number" (e.g., a naive PR-detection query filtering `WHERE set_index <= target_sets`) will miscount once warm-up rows occupy low `set_index` values ahead of working sets.
**Why it happens:** `set_index` is a flat, strictly-incrementing sequence across the *whole* session-exercise, not a "working set number" — `ARCHITECTURE.md` §1 already states this ("grouping is an annotation column on a flat list, never a nested structure"), but it's easy to forget once warm-ups are real rows with real low indices.
**How to avoid:** Every consumer that needs "the working sets" must filter `WHERE set_type != 'warmup'`, never assume index position implies set type.
**Warning signs:** PR detection or volume aggregation counting a warm-up's weight/reps toward a working total.

### Pitfall 3: The edit-mode session context leaking live-session affordances
**What goes wrong:** D-32's dual-mode screen renders a rest-timer widget, auto-advance trigger, or "Complete" action inside the History-edit flow because a component checked `session.status === 'in_progress'` instead of the typed mode value.
**Why it happens:** The screen is the same component tree for both modes by design (D-32's "maximum reuse" bet); any conditional based on session data rather than the explicit mode value will drift the two apart the first time someone edits a component without checking both paths.
**How to avoid:** A single typed `SessionScreenMode = 'live' | 'editing'` value provided once at the screen root (React context or a single prop threaded down), and every timer-scheduling/auto-advance call site gated on that value, never on `session.status` or `session.endedAt`.
**Warning signs:** A code review finds a rest-timer `scheduleNotificationAsync` call reachable from a code path that also handles a completed session.

### Pitfall 4: Treating the `expo-notifications` install as done once it typechecks
**What goes wrong:** The install, config-plugin entry, and scheduling calls all typecheck and pass web-target e2e tests, and the phase is marked complete without ever filing the native-device gap.
**Why it happens:** D-10's environment constraint makes it easy to treat "typechecks + web-verified" as equivalent to "verified," but background-notification delivery is precisely the kind of platform behavior that has historically diverged from documentation (STATE.md's own standing flag on this exact dependency).
**How to avoid:** File the `.planning/WINDOWS.md` unrun-verify entry for native background delivery as part of this phase's own closing work, not as an afterthought — see §8's table above for the exact claim to file.
**Warning signs:** ROADMAP Phase 999.1's accumulated-items list has no entry for Phase 5's rest timer by the time this phase is marked complete.

## Code Examples

### Session Start Funnel (D-33's single `startSession` call, all three creation paths)

```ts
// Source: apps/mobile/lib/db/log-set.ts (existing, extend the input shape)
export interface StartSessionInput {
  routineDayId?: string | null;
  equipmentProfileId?: string | null;
  deviceId?: string | null;
  now?: Date;          // existing — the moment `timezone`/`local_date` are captured from
  // NEW for D-33: when set, this OVERRIDES the captured local_date/timezone after the fact,
  // through the one function permitted to do so post-creation (see below) — startSession
  // itself still always stamps from the real device clock on creation, D-06 is unchanged for
  // ordinary session start; the backfill path is a second, explicit write, never a param that
  // makes startSession itself lie about when it was actually created.
}

// NEW, the one function D-33 permits to rewrite timezone/local_date after session start:
export async function setSessionDate(
  sessionId: string,
  date: Date,
  timezone: string,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const { localDate } = captureCalendarDay(date, timezone);
  await db
    .update(workoutSession)
    .set({ startedAt: date.toISOString(), timezone, localDate })
    .where(eq(workoutSession.id, sessionId));
}
```

### PR detection shared pure function shape (matches `next-up.ts`'s no-database, no-clock contract)

```ts
// Source: packages/pr-rules/src/personal-records.ts — pure, no database, no React, no clock
export interface PriorBest {
  heaviestWeight: number | null;
  bestE1rm: number | null;
  mostRepsAtWeight: Map<number, number>; // weightKg -> max reps ever at that exact weight
  bestSetVolume: number | null;
}

export interface CandidateSet {
  weightKg: number | null;
  reps: number;
  setType: string;
}

export interface DetectedPr {
  prType: 'heaviest_weight' | 'best_e1rm' | 'most_reps_at_weight' | 'best_set_volume';
  value: number;
}

export function detectPrs(candidate: CandidateSet, priorBest: PriorBest): DetectedPr[] {
  if (candidate.setType === 'warmup' || candidate.weightKg === null) return [];
  const results: DetectedPr[] = [];
  if (priorBest.heaviestWeight === null || candidate.weightKg > priorBest.heaviestWeight) {
    results.push({ prType: 'heaviest_weight', value: candidate.weightKg });
  }
  const e1rm = estimated1RM(candidate.weightKg, candidate.reps);
  if (e1rm !== null && (priorBest.bestE1rm === null || e1rm > priorBest.bestE1rm)) {
    results.push({ prType: 'best_e1rm', value: e1rm });
  }
  const priorAtWeight = priorBest.mostRepsAtWeight.get(candidate.weightKg) ?? null;
  if (priorAtWeight === null || candidate.reps > priorAtWeight) {
    results.push({ prType: 'most_reps_at_weight', value: candidate.reps });
  }
  const volume = candidate.weightKg * candidate.reps;
  if (priorBest.bestSetVolume === null || volume > priorBest.bestSetVolume) {
    results.push({ prType: 'best_set_volume', value: volume });
  }
  return results;
}
```

### Rest-timer wall-clock recompute (the pure half, platform-agnostic)

```ts
// Source: apps/mobile/lib/rest-timer.ts — pure, testable without a notification library at all
export function remainingSeconds(targetTimestampMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.round((targetTimestampMs - nowMs) / 1000));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `expo-notifications`' pre-SDK-52 trigger shape (bare `{ seconds }` / `{ date }` objects) | Typed `SchedulableTriggerInputTypes` discriminated union (`TIME_INTERVAL`, `DATE`, etc.) | Confirmed current in the SDK-57-scoped docs fetched this session | The scheduling call in §8's Code Examples uses the current typed form; do not write untyped trigger objects from older tutorials found via general web search |

**Deprecated/outdated:** none identified as directly relevant to this phase's dependency set beyond the trigger-shape note above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Warm-up percentage scheme (40%/60%/80% of working weight, 10/5/3 reps) | §3 Warm-up Scaling Ruleset | Cosmetic — a wrong default scheme is a UX tuning issue, not a data-corrupting one; the ruleset is a named pure function so replacing the numbers later is a one-file change |
| A2 | Estimated-1RM validity cutoff at reps ≤ 10 (vs. some other point in the "roughly 10-12" range PITFALLS.md cites) | §10 Estimated 1RM formula | Low — affects only whether a handful of 11-12-rep sets show an e1RM; changing the constant is a one-line fix with no schema impact |
| A3 | Browser `Notification` API posts reliably while a tab is hidden/backgrounded | §8 table | Medium — if false, web's rest-timer alert (D-25) silently fails when the tab isn't focused; verifiable via Playwright's page-visibility API without a real device, should be exercised before considering D-25's web half done |
| A4 | Android 13+ requires `POST_NOTIFICATIONS` runtime permission, and `expo-notifications`' `requestPermissionsAsync()` requests it as part of its unified permission call | §8 permission flow | Medium — if the unified call does NOT request it on this project's target Android API level, D-22's onboarding flow would need an explicit second permission request; spot-check against the installed `expo-notifications` version's own docs before finalizing onboarding copy |
| A5 | `TextInput`'s `showSoftInputOnFocus={false}` is Android-only and does not suppress the iOS system keyboard | §12 Numeric Keypad | Low — this assumption only affects which technique was rejected in favor of the non-native-focusable-field approach; the recommended approach (no `TextInput` at all) is unaffected even if this specific claim about the rejected alternative were wrong |
| A6 | No automatic timeout-based "abandoned" session status is needed beyond the user-triggered `discarded` state | §1 Schema Additions | Low-Medium — if a future phase needs to distinguish "silently forgotten" sessions from explicit discards for analytics purposes, an `'abandoned'` status value would need to be added later as an additive vocabulary change (D-09-compatible), not a breaking one |

**None of these block planning** — each has either a cheap, isolated fix path or a verification step (Playwright for A3, a docs spot-check for A4) that does not require a re-architecture.

## Open Questions

1. **Does "Warm-up" being toggled off (LOG-17) hide the action-bar button entirely, or keep it visible but skip auto-population?**
   - What we know: D-13 places Warm-up as one of three permanent action-bar buttons; the global `warmup_sets_enabled` preference is this phase's new column.
   - What's unclear: whether "toggle off" means the button disappears from the action bar, or the button stays but generates zero rows until manually re-enabled per-session.
   - Recommendation: keep the button always visible (D-13's action-bar contents are meant to be a stable list per its own flag-for-the-planner note) and gate only the *auto-population at session start* behavior, if any such auto-population is even planned — tapping Warm-up is already an explicit user action per this research's read of D-13/LOG-17, so the toggle most plausibly controls a "would you like this on this session" default rather than button visibility. Confirm with the UI-SPEC phase, this is a presentation decision, not a data-model one.

2. **Does the finish-summary's "correct entries" (LOG-19) reuse the exact same `SetRow`/keypad components as the live screen, or a simplified inline editor?**
   - What we know: D-19's tap-to-undo pattern and the keypad exist for the live screen; D-32 establishes a precedent for screen-mode reuse (one typed context value) for the History-edit case.
   - What's unclear: whether the summary screen is a third "mode" of the same session-context pattern, or a genuinely separate lightweight editor.
   - Recommendation: treat the summary's correction affordance as a third value of the same `SessionScreenMode` (`'live' | 'editing' | 'summary-correction'`) rather than a new component tree, for the same reuse argument D-32 already accepted — but this is the planner's call to make explicit in the PLAN.md task breakdown.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `expo-notifications` native module (iOS/Android build) | D-21/D-25's native rest-timer alert | ✗ (no Xcode, no Android SDK, D-10) | — | Verify via typecheck + doc-confirmed API usage only; file native-device claims as `.planning/WINDOWS.md` unrun-verify against Phase 999.1 |
| Chromium (Playwright) for web-target e2e | Force-quit recovery test extension, notification-permission-flow test, browser `Notification` posting test | ✓ (confirmed present per WINDOWS #39's note: "Playwright Chromium is present on this machine") | — | None needed — this is the primary verification surface for this phase per D-10 |
| PowerSync Service + Postgres (local dev stack) | Every offline-write/sync assertion this phase needs | Assumed ✓ (already required and working since Phase 2; not re-probed this session) | — | None needed |
| Android/iOS device or simulator | Success criterion 3's "verified on a real device" | ✗ | — | No fallback exists for this specific criterion — it is explicitly deferred to ROADMAP Phase 999.1, not weakened |

**Missing dependencies with no fallback:**
- A real iOS or Android device/simulator for success criterion 3's background/lock-screen verification. This is a known, already-accepted project constraint (D-10), not a new blocker this research introduces.

**Missing dependencies with fallback:**
- `expo-notifications`' native module: the fallback is typecheck-plus-doc-confirmed-API-usage, with the gap explicitly filed rather than silently assumed working.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (`jest-expo` preset) for unit tests, `apps/mobile/e2e/*.spec.ts` via Playwright for offline/durability/sync e2e |
| Config file | `apps/mobile/jest.config.js` (existing); `apps/mobile/playwright.config.ts` (existing, drives the `/__durability` harness route) |
| Quick run command | `pnpm --filter mobile test -- --testPathPattern <file>` (unit); `pnpm --filter mobile test:e2e -- <spec-file>` (Playwright) |
| Full suite command | `pnpm --filter mobile test` and `pnpm --filter mobile test:e2e`; `pnpm --filter api test` for the API's e2e-only suite (no unit-test script by this project's design) |

**Note on RN component testing:** this codebase has **no renderer** installed for `apps/mobile` (`@testing-library/react-native`/`react-test-renderer` are absent — confirmed by WINDOWS #104's note: "the mobile lockfile has no renderer"). The established pattern (seen in `DayDeckView`, `CycleStripView`, `ExercisePickerModalView`) is to extract every screen's rendering logic into a **hook-free, pure `*View` function taking plain props**, directly invocable from a Jest test with no renderer — and to keep the stateful wrapper thin and untested-by-unit-test, covered instead by the Playwright e2e suite. This phase's `SetRow`, `NumericKeypad`, `ExerciseStrip`, and `WorkoutSummary` should all follow this exact split.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOG-01/02 | `startSession` funnels all three creation paths through one function | unit | `pnpm --filter mobile test -- log-set.test.ts` | ❌ Wave 0 — extend existing `log-set.test.ts` |
| LOG-03/04 | Weight prefill resolves the historical same-set-number value, not just "most recent" | unit | `pnpm --filter mobile test -- session-query.test.ts` | ❌ Wave 0 |
| LOG-05/20 (D-20 rejection cases) | Numeric field never mounts a real `TextInput` | unit | Direct invocation of `NumericKeypadView`/`SetRowView`, asserting no `TextInput` in the returned element tree is impractical without a renderer — instead assert the field component's prop contract never accepts `onFocus`/keyboard-type props, and cover the behavior via a Playwright e2e asserting no OS-keyboard-triggering DOM `<input>` element exists on web | ❌ Wave 0 |
| LOG-07 | Tap-to-undo cancels the scheduled rest-timer notification (D-27) | unit | `pnpm --filter mobile test -- rest-timer.test.ts` (mock `expo-notifications`) | ❌ Wave 0 |
| LOG-08/09/10 | Wall-clock recompute is correct across arbitrary elapsed time; extend/skip reschedule/cancel correctly | unit | `pnpm --filter mobile test -- rest-timer.test.ts` | ❌ Wave 0 |
| LOG-08/09 web half | Browser `Notification` requested/posted at the correct wall-clock target | e2e (Playwright) | `pnpm --filter mobile test:e2e -- rest-timer.spec.ts` | ❌ Wave 0 |
| PLAT-02/PLAT-07 (this phase's UI over them) | Force-quit mid-workout with sets, warm-ups, and a pause recovers fully | e2e (Playwright, extends `durability.spec.ts`'s established `/__durability` reload pattern) | `pnpm --filter mobile test:e2e -- durability.spec.ts` | Extend existing file |
| LOG-16 | Notes at all three levels persist and sync | e2e | `pnpm --filter api test -- session-sync` (new e2e spec, or extend `program-sync.e2e-spec.ts`'s pattern) | ❌ Wave 0 |
| LOG-17 | `warmupSets()` is deterministic for a given input | unit | `pnpm --filter pr-rules test` (new package) | ❌ Wave 0 |
| LOG-18/ANLY-01/ANLY-10 | `detectPrs`/`estimated1RM` produce correct, deterministic results including the validity-cutoff null case | unit | `pnpm --filter pr-rules test` | ❌ Wave 0 |
| D-30's `personal_record` apply path | A pushed `personal_record` op reaches Postgres and rejects invalid `pr_type`/`value` | e2e (api) | `pnpm --filter api test -- personal-record-sync.e2e-spec.ts` (new file, mirrors `exercise-sync.e2e-spec.ts`'s shape) | ❌ Wave 0 |
| LOG-13 | `user_preference.auto_advance_enabled` PATCHes and validates as boolean | e2e (api) | Extend `apps/api/test/patch-partial-update.e2e-spec.ts` or `user-exercise-preference.e2e-spec.ts`'s sibling pattern | ❌ Wave 0 |
| Schema promotions (workout_session.status, logged_set.set_type CHECK) | CHECK constraint rejects out-of-vocabulary values at the database level | e2e (api) | Extend `apps/api/test/schema-parity.e2e-spec.ts`'s existing `routine_status_check`-style test | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant single-file unit test (`pnpm --filter mobile test -- <file>` or `pnpm --filter pr-rules test`).
- **Per wave merge:** `pnpm --filter mobile test`, `pnpm --filter api test`, and the Playwright e2e suite (`pnpm --filter mobile test:e2e`).
- **Phase gate:** full suite green (mobile unit + mobile e2e + api e2e) before `/gsd-verify-work`, plus the native-device items explicitly filed as `.planning/WINDOWS.md` unrun-verify entries rather than silently skipped.

### Wave 0 Gaps
- [ ] `apps/mobile/lib/db/__tests__/session-query.test.ts` — covers LOG-03/04's prefill-by-set-number logic and the History aggregate-count query
- [ ] `apps/mobile/lib/__tests__/rest-timer.test.ts` — covers LOG-08/09/10's wall-clock math and extend/skip/undo cancellation
- [ ] `packages/pr-rules/` new package scaffold (`package.json`, `tsconfig.json` mirroring `packages/progression-engine`'s shape) plus `src/__tests__/personal-records.test.ts` and `src/__tests__/warmup.test.ts`
- [ ] `apps/api/test/personal-record-sync.e2e-spec.ts` — new file, covers D-30's apply-path wiring end to end against real Postgres
- [ ] `apps/mobile/e2e/rest-timer.spec.ts` — new Playwright spec, covers the web `.web.tsx` notification sibling
- [ ] Framework install: none — Jest/Playwright are already configured; only the new `pr-rules` package needs a `tsconfig`/`package.json` scaffold, not a new framework

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (unchanged from prior phases — Better Auth session already gates every sync request) | — |
| V3 Session Management | No (unchanged) | — |
| V4 Access Control | Yes | `personal_record`'s ownership must follow the exact `toExerciseValues`/`toUserExercisePreferenceValues` pattern — `userId` from the authenticated session, never `op.data.user_id` — otherwise a malicious client could write a PR row attributed to another user's account by naming their id in the payload |
| V5 Input Validation | Yes | `hasInvalidField` branches for `personal_record.pr_type` (closed vocabulary), `personal_record.value` (non-negative decimal, reuse `isNonNegativeDecimalOrNull`), `logged_set.set_type` (closed vocabulary, already partially enforced), `workout_session.status` (closed vocabulary, needs the CHECK constraint added) |
| V6 Cryptography | No — no new secrets, tokens, or crypto primitives in this phase | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A client claims ownership of a `personal_record` row belonging to another user by naming a different `user_id` in the sync push payload | Spoofing / Elevation of Privilege | `userId` always sourced from the authenticated session (`req.user.id`), never trusted from `op.data` — the established pattern in every `to*Values` function in `sync.service.ts` |
| A client pushes a `pr_type` or `set_type` value outside the closed vocabulary, corrupting downstream aggregation queries that assume a fixed enum | Tampering | `hasInvalidField` rejects before the apply phase; Postgres CHECK constraint is the real backstop for any write that bypasses the application layer entirely (direct SQL, a seed script, a future admin tool) |
| A client backdates a session via D-33's `setSessionDate` to attribute training to a day that benefits some derived metric (e.g., gaming a weekly-volume target) | Repudiation (of the true log time) — low severity, single-user personal app | Accepted risk — this is a personal training log for one account, not a multi-tenant leaderboard; no mitigation beyond what already exists is warranted, matching this project's explicit exclusion of social/competitive features |

## Sources

### Primary (HIGH confidence)
- `/websites/expo_dev_versions_sdk_notifications` (Context7) — `scheduleNotificationAsync`, `cancelScheduledNotificationAsync`, `requestPermissionsAsync`, `getPermissionsAsync`, `setNotificationChannelAsync`, `setNotificationHandler`, config-plugin `app.json` shape
- `apps/api/src/sync/sync.service.ts` (read in full relevant sections this session) — `TABLE_MAP`, `SINGLETON_ROOT_TYPES`, `SESSION_STATUSES`, `SET_TYPES`, `hasInvalidField`, ownership patterns
- `apps/api/src/db/schema/session.ts`, `apps/api/src/db/schema/records.ts` (read in full this session) — column definitions, existing CHECK constraints (or their absence)
- `apps/mobile/lib/db/schema.ts` (read relevant sections this session) — SQLite mirror confirming column parity
- `ops/powersync/sync-rules.yaml` (read in full this session) — confirmed `personal_record` already in the pull query
- `packages/api-contracts/src/sync.ts`, `packages/api-contracts/src/units.ts`, `packages/api-contracts/src/program.ts` (read this session) — `SYNCED_TABLES`, unit-conversion boundary, `EMPTY_TARGET`/`resolveTarget`
- `apps/mobile/lib/db/log-set.ts`, `apps/mobile/lib/programs/next-up.ts`, `apps/mobile/lib/db/programs/next-up-query.ts` (read in full this session) — the write path and the house query pattern
- `docs/platform-modules.md`, `docs/program-vocabularies.md` (read in full this session) — the `.web.tsx` convention, vocabulary-promotion precedent
- `.planning/research/ARCHITECTURE.md` §1/§4, `.planning/research/PITFALLS.md` §1/§4/§5/§6/§7/§8/§9/§11/§12/§13, `.planning/research/FEATURES.md` lines 51–97/170–192 (all read in full this session)
- npm registry, queried directly 2026-08-23 — `expo-notifications` and `expo-keep-awake` current versions

### Secondary (MEDIUM confidence)
- `.planning/WINDOWS.md` entries #16/#17/#19/#39/#104 (read this session) — native-verification gaps, the stale nine-tables claim, the no-renderer testing constraint
- Package-legitimacy seam output for `expo-notifications`/`expo-keep-awake` (run this session)

### Tertiary (LOW confidence)
- Android 13+ `POST_NOTIFICATIONS` runtime-permission behavior inside `expo-notifications`' unified `requestPermissionsAsync()` — not independently confirmed via Context7 in this session, standard-platform-behavior assumption (see Assumptions Log A4)
- The warm-up percentage/rep scheme (A1) and the e1RM validity cutoff's exact boundary (A2) — no public MacroFactor specification exists (per PITFALLS.md §8's own confirmed finding), so these are this project's own reasoned defaults, not vendor-verified facts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both new packages verified against the npm registry and version-paired to the installed Expo SDK
- Architecture: HIGH — every pattern recommendation reuses an already-shipped, already-tested component or query shape from this exact codebase, read directly this session
- Pitfalls: MEDIUM-HIGH — codebase-specific pitfalls (set_index collision, edit-mode leakage) are newly surfaced by this research and not yet battle-tested; the general categories (background timers, N+1, LWW) are HIGH confidence per the project's own PITFALLS.md

**Research date:** 2026-08-23
**Valid until:** 30 days for the architectural recommendations (stable, codebase-internal); 7 days for the `expo-notifications` version pin specifically, given Expo's active SDK-57 patch cadence observed in the npm version list (multiple `57.0.x` releases within the research window)
