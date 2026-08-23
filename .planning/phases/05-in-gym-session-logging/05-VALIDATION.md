---
phase: 5
slug: in-gym-session-logging
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-23
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `05-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (`jest-expo` preset) for mobile unit tests; Playwright for web-target e2e (`apps/mobile/e2e/*.spec.ts`, driving the existing `/__durability` harness route); `apps/api` is e2e-only by design (`pnpm --filter api test`) |
| **Config file** | `apps/mobile/jest.config.js`; `apps/mobile/playwright.config.ts`; `apps/api/jest.config.js`; `apps/api/test/jest-e2e.json` |
| **Quick run command** | `pnpm --filter mobile test -- --testPathPattern <file>` (unit) · `pnpm --filter mobile test:e2e -- <spec>` (Playwright) |
| **Full suite command** | `pnpm test` (root turbo) plus `pnpm --filter mobile test:e2e` |
| **Estimated runtime** | mobile Jest ~30–60s · api e2e ~60–180s (spawns the built API against live Postgres) · Playwright ~60–120s |

**No RN renderer is installed** (`@testing-library/react-native` / `react-test-renderer` are absent from the mobile lockfile — WINDOWS #104). The established house pattern (`DayDeckView`, `CycleStripView`, `ExercisePickerModalView`) is to extract rendering into a **hook-free pure `*View` function taking plain props**, directly invocable from Jest with no renderer, keeping the stateful wrapper thin and covered by Playwright instead. `SetRow`, `NumericKeypad`, `ExerciseStrip` and `WorkoutSummary` must all follow that split — this is a planning constraint, not a testing preference.

---

## Sampling Rate

- **After every task commit:** the targeted suite named in that task's `<verify><automated>` — `pnpm --filter mobile test -- <pattern>`, `pnpm --filter pr-rules test`, `pnpm --filter @fitness/api-contracts test`, or `pnpm --filter api test -- <pattern>`
- **After every plan wave:** `pnpm test` (root turbo) + `pnpm --filter mobile test:e2e`
- **After any `apps/api/src/db/schema/**` edit:** `pnpm --filter api db:push` then `pnpm --filter api db:verify` — build and typecheck both pass against an unmigrated database, so this is the only gate that proves the migration ran
- **Before `/gsd-verify-work`:** full suite green (mobile unit + mobile e2e + api e2e), with native-device items filed as `.planning/WINDOWS.md` unrun-verify entries rather than silently skipped
- **Max feedback latency:** ~60s targeted mobile Jest · ~180s targeted API e2e

---

## Per-Task Verification Map

> Populated by `/gsd-validate-phase` once plans exist. The requirement map below is the
> pre-planning contract each task must resolve against.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(pending planning)* | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement → Test Map (from RESEARCH.md)

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| LOG-01, LOG-02 | All three session-creation paths funnel through one `startSession` call (D-33) | unit | `pnpm --filter mobile test -- log-set` | extend `apps/mobile/lib/db/__tests__/log-set.test.ts` |
| LOG-03, LOG-04 | Weight prefill resolves the historical **same-set-number** value, not merely the most recent set | unit | `pnpm --filter mobile test -- session-query` | ❌ Wave 0 — `apps/mobile/lib/db/__tests__/session-query.test.ts` |
| LOG-05, LOG-20 | The numeric field never mounts a real `TextInput`; no OS-keyboard-triggering `<input>` exists on web, and the edited value is never obscured | unit + e2e | `pnpm --filter mobile test -- NumericKeypad`; `pnpm --filter mobile test:e2e -- keypad.spec.ts` | ❌ Wave 0 |
| LOG-06 | RIR is a third editable field on the row, prefilled from the snapshot and changeable mid-workout | unit | `pnpm --filter mobile test -- SetRow` | ❌ Wave 0 |
| LOG-07 | Tap-to-undo restores the row editable with values intact **and** cancels the scheduled rest alert (D-27) | unit | `pnpm --filter mobile test -- rest-timer` | ❌ Wave 0 — `apps/mobile/lib/__tests__/rest-timer.test.ts` |
| LOG-08, LOG-09, LOG-10 | Wall-clock recompute is correct across arbitrary elapsed time; extend reschedules and skip cancels against the stored target timestamp | unit | `pnpm --filter mobile test -- rest-timer` | ❌ Wave 0 |
| LOG-08, LOG-09 (web half) | Browser `Notification` permission requested and a notification posted at the correct wall-clock target through the `.web.tsx` sibling | e2e | `pnpm --filter mobile test:e2e -- rest-timer.spec.ts` | ❌ Wave 0 |
| LOG-11, LOG-12 | Force-quit mid-workout — with sets, warm-ups and a pause outstanding — recovers fully; pause stops the duration clock and a crash does not (D-29) | e2e | `pnpm --filter mobile test:e2e -- durability.spec.ts` | extend existing `apps/mobile/e2e/durability.spec.ts` |
| LOG-13 | `user_preference` auto-advance toggle PATCHes and validates as boolean; default on | e2e (api) | `pnpm --filter api test -- user-preference` | extend the `user-exercise-preference.e2e-spec.ts` sibling pattern |
| LOG-14, LOG-15 | Mid-workout add/swap/remove; a target edit updates the frozen `session_exercise` snapshot only, and write-back targets the row the value resolved from (D-14/D-15) | unit | `pnpm --filter mobile test -- session-targets` | ❌ Wave 0 |
| LOG-16 | Notes at set, exercise and session level persist locally and round-trip through the sync apply path | e2e (api) | `pnpm --filter api test -- session-sync` | ❌ Wave 0 |
| LOG-17 | `warmupSets()` is deterministic for a given working weight and the behaviour is toggleable off | unit | `pnpm --filter pr-rules test` | ❌ Wave 0 — new package |
| LOG-18, LOG-21 | `detectPrs` / `estimated1RM` are deterministic across all four PR types, and 1RM returns null past the validity cutoff (D-31) | unit | `pnpm --filter pr-rules test` | ❌ Wave 0 — new package |
| LOG-18 | A pushed `personal_record` op reaches Postgres, takes `user_id` from the session, and rejects an invalid `pr_type` / negative `value` | e2e (api) | `pnpm --filter api test -- personal-record-sync` | ❌ Wave 0 — mirrors `exercise-sync.e2e-spec.ts` |
| LOG-19 | The finish summary renders muscles trained, per-exercise breakdown and PRs, and entries stay correctable from it | unit | `pnpm --filter mobile test -- WorkoutSummary` | ❌ Wave 0 |
| LOG-11, LOG-19 | History list, edit, rename, duplicate, delete and backfill-with-date; the list costs a constant number of queries (PITFALLS §13) | unit | `pnpm --filter mobile test -- history-query` | ❌ Wave 0 |
| Schema promotions | CHECK constraints reject out-of-vocabulary `workout_session.status` and `logged_set.set_type` at the database level | e2e (api) | `pnpm --filter api db:push && pnpm --filter api db:verify` | extend `apps/api/test/schema-parity.e2e-spec.ts` |

---

## Wave 0 Requirements

Under tracer-first decomposition, every missing test file should be created by the same task
that creates the behaviour it asserts — no task ships with an `<automated>MISSING</automated>`
verify. The gaps the research identified:

- [ ] `apps/mobile/lib/db/__tests__/session-query.test.ts` — LOG-03/04 prefill-by-set-number, plus the History aggregate query-count assertion
- [ ] `apps/mobile/lib/__tests__/rest-timer.test.ts` — LOG-08/09/10 wall-clock math and extend/skip/undo cancellation
- [ ] `packages/pr-rules/` — new package scaffold (`package.json`, `tsconfig.json` mirroring `packages/progression-engine`), plus `src/__tests__/personal-records.test.ts` and `src/__tests__/warmup.test.ts`
- [ ] `apps/api/test/personal-record-sync.e2e-spec.ts` — D-30's apply-path wiring, end to end against real Postgres
- [ ] `apps/mobile/e2e/rest-timer.spec.ts` — the web `.web.tsx` notification sibling
- [ ] Framework install: **none**. Jest and Playwright are already configured; only `packages/pr-rules` needs a `package.json`/`tsconfig.json` scaffold.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rest-timer alert fires with the app fully backgrounded and the phone locked | LOG-09 (success criterion 3) | No Xcode and no Android SDK on this machine (D-10). `expo-notifications`' background delivery is the one claim in this phase that doc-reading cannot settle — STATE.md already flags it. | Deferred to ROADMAP Phase 999.1. Start a set, background the app, lock the phone, confirm the alert arrives at the wall-clock target and that extending before backgrounding moves it. |
| Notification permission prompt copy and the denied-permission degrade path on iOS/Android | LOG-09, D-22, D-23 | Permission dialogs and the Settings deep-link are OS surfaces with no automated harness here | Deferred to Phase 999.1. Deny at onboarding, confirm the in-app sound + haptic fallback runs, the inline note appears, and the re-request path deep-links to Settings. |
| Swipe between exercises on the pager, and the docked keypad's layout at maximum OS accessibility font scale | LOG-05, LOG-20, D-11, D-18 | `react-native-pager-view`'s native path and native font scaling cannot be exercised from the web target | Deferred to Phase 999.1. Swipe between exercises, set the OS font scale to maximum, confirm the three-field row wraps and grows rather than truncating. |
| Screen-keep-awake behaviour during an active session | — (D-24 adjacent, PITFALLS §6) | `expo-keep-awake` is a native module | Deferred to Phase 999.1. Start a session, leave the phone untouched past the OS idle timeout, confirm the screen stays awake and releases on finish. |
| Two devices with one session open | — (open design question) | Needs two runtimes and a controllable network partition | Log different sets on two offline devices against the same session, reconnect, confirm row-level LWW converges without losing a logged set (PITFALLS §1). |
| PowerSync Service pull-side delivery of any new table this phase adds | LOG-16, LOG-18 | The sync-rules change is asserted only by query shape; no running PowerSync Service is exercised here | Restart the self-hosted PowerSync Service against the updated `sync-rules.yaml`; confirm a second device receives the new tables and no other user's rows. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
