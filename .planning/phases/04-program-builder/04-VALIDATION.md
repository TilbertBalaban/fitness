---
phase: 4
slug: program-builder
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `04-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (`jest-expo` preset) for mobile unit tests; Playwright for mobile browser e2e (`apps/mobile/e2e/*.spec.ts` — not exercised by this phase, per the repo's no-unrequested-browser-runs rule); `apps/api` has both a unit suite (`pnpm --filter api test`, `jest.config.js` rooted at `src`) and an e2e suite (`pnpm --filter api test:e2e`, `test/jest-e2e.json`, which runs `db:push` and `nest build` first) |
| **Config file** | `apps/mobile/jest.config.js`; `apps/api/jest.config.js`; `apps/api/test/jest-e2e.json` |
| **Quick run command** | `pnpm --filter mobile test -- <pattern>` |
| **Full suite command** | `pnpm test` (root, runs `turbo run test` across all workspaces) |
| **Estimated runtime** | mobile Jest ~30-60s; `apps/api` e2e ~60-180s (spawns the built API against a live Postgres) |

---

## Sampling Rate

- **After every task commit:** the targeted suite named in that task's `<verify><automated>` — `pnpm --filter mobile test -- <pattern>`, `pnpm --filter @fitness/api-contracts test`, or `pnpm --filter api test:e2e -- <pattern>`
- **After every plan wave:** `pnpm test` (root turbo) plus `pnpm --filter api test:e2e -- program-sync` whenever the wave touched `apps/api/src/sync/`
- **After any `apps/api/src/db/schema/**` edit:** `pnpm --filter api db:push` then `pnpm --filter api db:verify` — the `[BLOCKING]` task in 04-04, 04-06 and 04-07. Build and typecheck pass against an unmigrated database, so this is the only gate that distinguishes a migrated one.
- **Before `/gsd-verify-work`:** full suite green, including `pnpm --filter api test:e2e`
- **Max feedback latency:** ~60 seconds for a targeted mobile suite; ~180 seconds for a targeted API e2e

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 01 | 1 | PROG-01 | T-04-01/02/03/05 | Routine ownership forced from the session; bad status and DELETE rejected | integration | `pnpm --filter api test:e2e -- program-sync` | created by this task | ⬜ pending |
| 04-01-T2 | 01 | 1 | PROG-01 | T-04-06 | Programs tab reads only PowerSync-scoped local rows | unit | `pnpm --filter mobile test -- programs` | `apps/mobile/lib/db/__tests__/programs.test.ts`, `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` created here | ⬜ pending |
| 04-02-T1 | 02 | 2 | PROG-01, PROG-02 | T-04-07/08/09/10 | Two-hop ownership; reparenting blocked; empty FK rejected | integration | `pnpm --filter api test:e2e -- program-sync` | extends 04-01's file | ⬜ pending |
| 04-02-T2 | 02 | 2 | PROG-02 | T-04-12 | Reorder writes one row; gap exhaustion renumbers in one pass | unit | `pnpm --filter mobile test -- order-index` | created by this task | ⬜ pending |
| 04-02-T3 | 02 | 2 | PROG-01 | T-04-11 | Query-count assertion: three selects for the whole tree | unit | `pnpm --filter mobile test -- programs` | extends 04-01's file | ⬜ pending |
| 04-03-T1 | 03 | 3 | PROG-02 | T-04-15/16 | Picker reuses the Phase 3 catalog reads; no second index per keystroke | unit | `pnpm --filter mobile test -- ExercisePickerModal` | created by this task | ⬜ pending |
| 04-03-T2 | 03 | 3 | PROG-03 | T-04-13/14 | Every target parsed through one integer-only guard; one row written | unit | `pnpm --filter mobile test -- targets` | created by this task | ⬜ pending |
| 04-03-T3 | 03 | 3 | PROG-03 | — | N/A (presentation) | unit | `pnpm --filter mobile test -- ExerciseSlotRow` | created by this task | ⬜ pending |
| 04-04-T1 | 04 | 3 | PROG-08, PROG-10 | T-04-19 | CHECK constraint rejects a direct out-of-vocabulary INSERT | integration | `pnpm --filter api db:verify` | extends schema-parity | ⬜ pending |
| 04-04-T2 | 04 | 3 | PROG-08, PROG-10 | T-04-21 | Live-catalogue read proves the migration ran | integration | `pnpm --filter api db:push && pnpm --filter api db:verify` | extends schema-parity | ⬜ pending |
| 04-04-T3 | 04 | 3 | PROG-08, PROG-10 | T-04-17/18/22 | user_preference ownership is its own id; unowned pointer rejected | integration | `pnpm --filter api test:e2e -- program-sync` | extends 04-01's file | ⬜ pending |
| 04-05-T1 | 05 | 4 | PROG-02 | T-04-SC, T-04-24/25 | Package legitimacy gate; gesture root wraps every rendered branch | integration | `pnpm --filter mobile build` | existing | ⬜ pending |
| 04-05-T2 | 05 | 4 | PROG-02 | T-04-26 | Deck index clamps rather than throwing | unit | `pnpm --filter mobile test -- DayDeck` | created by this task | ⬜ pending |
| 04-05-T3 | 05 | 4 | PROG-02 | T-04-23 | Drop arithmetic is pure and computes no order_index | unit | `pnpm --filter mobile test -- reorder-drag` | created by this task | ⬜ pending |
| 04-06-T1 | 06 | 4 | PROG-04, PROG-05, PROG-06 | T-04-29/30 | Per-user join in sync rules; kind CHECK constraint | integration | `pnpm --filter api db:verify` | extends schema-parity | ⬜ pending |
| 04-06-T2 | 06 | 4 | PROG-04, PROG-05, PROG-06 | — | Live-catalogue read proves the table exists | integration | `pnpm --filter api db:push && pnpm --filter api db:verify` | extends schema-parity | ⬜ pending |
| 04-06-T3 | 06 | 4 | PROG-04, PROG-05, PROG-06 | T-04-28/30/31 | Cycle ownership through routine.user_id; all three kinds round-trip | integration | `pnpm --filter api test:e2e -- program-sync` | extends 04-01's file | ⬜ pending |
| 04-07-T1 | 07 | 5 | PROG-04 | T-04-34/36 | Three-join per-user pull query; unique (exercise, cycle) pair | unit + integration | `pnpm --filter @fitness/api-contracts test` | extends 04-01's contracts file | ⬜ pending |
| 04-07-T2 | 07 | 5 | PROG-04 | — | Live-catalogue read proves the table and constraint exist | integration | `pnpm --filter api db:push && pnpm --filter api db:verify` | extends schema-parity | ⬜ pending |
| 04-07-T3 | 07 | 5 | PROG-04 | T-04-33/35/37/38 | Dual chains must agree on one routine; cascaded overrides tombstoned | integration | `pnpm --filter api test:e2e -- program-sync` | extends 04-01's file | ⬜ pending |
| 04-08-T1 | 08 | 6 | PROG-04, PROG-05, PROG-06 | T-04-40/41 | Override updates rather than duplicates; empty override deletes | unit | `pnpm --filter mobile test -- cycles` | created by this task | ⬜ pending |
| 04-08-T2 | 08 | 6 | PROG-04 | T-04-42/43 | Five-query tree; dangling overrides dropped at load | unit | `pnpm --filter mobile test -- CycleStrip` | created by this task | ⬜ pending |
| 04-08-T3 | 08 | 6 | PROG-04 | T-04-39 | Selection routes an edit to exactly one write path | unit | `pnpm --filter mobile test -- programs` | extends 04-01's file | ⬜ pending |
| 04-09-T1 | 09 | 6 | PROG-11 | T-04-45/47 | Snapshot resolves through the shared resolver in at most two reads | unit | `pnpm --filter mobile test -- log-set` | existing file, extended | ⬜ pending |
| 04-09-T2 | 09 | 6 | PROG-11 | T-04-44/46 | Six program edits leave a logged session unchanged; post-snapshot read tripwire | regression | `pnpm --filter mobile test -- log-set` | existing file, extended | ⬜ pending |
| 04-09-T3 | 09 | 6 | PROG-11 | T-04-46 | Same regression asserted against Postgres rows | integration | `pnpm --filter api test:e2e -- program-sync` | extends 04-01's file | ⬜ pending |
| 04-10-T1 | 10 | 7 | PROG-09 | T-04-49 | Resolver cannot index out of range; deleted day rewinds | unit | `pnpm --filter mobile test -- next-up` | created by this task | ⬜ pending |
| 04-10-T2 | 10 | 7 | PROG-09 | T-04-48/51 | Constant query count; no truncating limit on history | unit | `pnpm --filter mobile test -- next-up-query` | created by this task | ⬜ pending |
| 04-10-T3 | 10 | 7 | PROG-09 | — | Copy contains no shaming framing (grep-asserted) | unit | `pnpm --filter mobile test -- home-screen` | created by this task | ⬜ pending |
| 04-11-T1 | 11 | 7 | PROG-07, PROG-08, PROG-10 | T-04-53/54/55/56/57 | No copied FK is a source id; archive never deletes | unit | `pnpm --filter mobile test -- lifecycle && pnpm --filter mobile test -- duplicate-routine` | created by this task | ⬜ pending |
| 04-11-T2 | 11 | 7 | PROG-07, PROG-08 | T-04-52 | /programs registered exactly once inside the signed-in guard | unit | `pnpm --filter mobile test -- route-guard` | existing file, extended | ⬜ pending |
| 04-11-T3 | 11 | 7 | PROG-07, PROG-08, PROG-10 | — | N/A (presentation) | unit | `pnpm --filter mobile test -- library-screen` | created by this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement → Test Map (from RESEARCH.md)

Resolved against the plan set. RESEARCH.md guessed at file paths before the plans existed;
the paths below are the ones the tasks actually create.

| Req ID | Behavior | Test Type | Automated Command | Owning Task | File |
|--------|----------|-----------|-------------------|-------------|------|
| PROG-01 | A named program created offline reaches Postgres through the sync apply-path and appears on the Programs tab | integration + unit | `pnpm --filter api test:e2e -- program-sync`; `pnpm --filter mobile test -- programs` | 04-01-T1, 04-01-T2 | `apps/api/test/program-sync.e2e-spec.ts`; `apps/mobile/app/(tabs)/__tests__/programs-screen.test.ts` |
| PROG-02 | Days and exercise slots are added, reordered and removed; every child row round-trips through the two-hop ownership path | integration + unit | `pnpm --filter api test:e2e -- program-sync`; `pnpm --filter mobile test -- order-index` | 04-02-T1, 04-02-T2, 04-03-T1, 04-05-T3 | `apps/api/test/program-sync.e2e-spec.ts`; `apps/mobile/lib/db/__tests__/order-index.test.ts` |
| PROG-03 | Per-exercise sets / rep range / RIR / rest persist as integers or stay null; no zero-for-blank | unit | `pnpm --filter mobile test -- targets` | 04-03-T2 | `apps/mobile/lib/db/__tests__/targets.test.ts` |
| PROG-04 | Cycles exist as rows, and per-cycle overrides resolve as `override ?? base` through one shared resolver | unit + integration | `pnpm --filter @fitness/api-contracts test`; `pnpm --filter api test:e2e -- program-sync` | 04-07-T1, 04-07-T3, 04-08-T1 | `packages/api-contracts/src/__tests__/program.test.ts`; `apps/api/test/program-sync.e2e-spec.ts` |
| PROG-05 | A deload cycle is authored at the start or the end of the block; the `kind` CHECK constraint rejects anything outside the vocabulary | unit + integration | `pnpm --filter @fitness/api-contracts test`; `pnpm --filter api db:verify` | 04-06-T1, 04-06-T3, 04-08-T1 | `packages/api-contracts/src/__tests__/program.test.ts`; `apps/api/test/schema-parity.e2e-spec.ts` |
| PROG-06 | Scheduled time off is a cycle of kind `time_off`, distinct from deload in both data and display | unit + integration | `pnpm --filter mobile test -- CycleStrip`; `pnpm --filter api test:e2e -- program-sync` | 04-06-T3, 04-08-T2 | `apps/mobile/components/__tests__/CycleStrip.test.tsx`; `apps/api/test/program-sync.e2e-spec.ts` |
| PROG-07 | Duplicate deep-copies the whole tree with fresh UUIDs and no FK pointing back at a source row | unit | `pnpm --filter mobile test -- duplicate-routine` | 04-11-T1 | `apps/mobile/lib/db/__tests__/duplicate-routine.test.ts` |
| PROG-08 | Exactly one program is active at a time via `user_preference.active_routine_id`; archive clears the pointer and never deletes | integration + unit | `pnpm --filter api test:e2e -- program-sync`; `pnpm --filter mobile test -- lifecycle` | 04-04-T3, 04-11-T1 | `apps/api/test/program-sync.e2e-spec.ts`; `apps/mobile/lib/db/__tests__/lifecycle.test.ts` |
| PROG-09 | "Next up" resolves from logged history, including a since-deleted day and a time-off cycle | unit | `pnpm --filter mobile test -- next-up` | 04-10-T1, 04-10-T2 | `apps/mobile/lib/programs/__tests__/next-up.test.ts` |
| PROG-10 | `progression_frozen` persists and toggles independently of `status` and of the active pointer | integration + unit | `pnpm --filter api test:e2e -- program-sync`; `pnpm --filter mobile test -- library-screen` | 04-04-T1, 04-04-T3, 04-11-T3 | `apps/api/test/program-sync.e2e-spec.ts`; `apps/mobile/app/programs/__tests__/library-screen.test.ts` |
| PROG-11 | Editing a program never changes an already-logged session's snapshot | regression | `pnpm --filter mobile test -- log-set`; `pnpm --filter api test:e2e -- program-sync` | 04-09-T2, 04-09-T3 | `apps/mobile/lib/db/__tests__/log-set.test.ts` (extended); `apps/api/test/program-sync.e2e-spec.ts` |

---

## Wave 0 Requirements

There is no separate Wave 0 plan. Under tracer-first decomposition, every missing test file is
created by the same task that creates the behaviour it asserts, so no task ever ships with an
`<automated>MISSING>` verify. The five gaps the research identified map onto tasks as follows:

- [x] `apps/api/test/program-sync.e2e-spec.ts` — **created by 04-01 Task 1** (the tracer's own verify), extended by 04-02, 04-04, 04-06, 04-07 and 04-09. Note the final path is `apps/api/test/`, not `apps/api/src/sync/__tests__/`: this repository's e2e suites live in `apps/api/test/` and run under `test/jest-e2e.json`.
- [x] `packages/api-contracts/src/__tests__/program.test.ts` — **created by 04-01 Task 1** (`ROUTINE_STATUSES`), extended by 04-06 (`CYCLE_KINDS`) and 04-07 (`resolveTarget`)
- [x] `apps/mobile/lib/db/__tests__/duplicate-routine.test.ts` — **created by 04-11 Task 1**
- [x] `apps/mobile/lib/programs/__tests__/next-up.test.ts` — **created by 04-10 Task 1**, covering both D-20 edge cases plus the cycle and time-off boundaries
- [x] Extension to `apps/mobile/lib/db/__tests__/log-set.test.ts` — **04-09 Tasks 1 and 2**, adding the cycle-override snapshot cases and the six-scenario PROG-11 regression

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Horizontal swipe between day pages on iOS and Android | PROG-02 | No Xcode and no Android SDK on this machine; `react-native-tab-view`'s native path is `react-native-pager-view`, which no automated check here can exercise | Deferred to ROADMAP Phase 999.1. Open the Programs tab on a device, swipe left and right between days, confirm the cycle strip stays pinned and the selected cycle does not reset. |
| Always-visible drag handle reorder on iOS and Android | PROG-02 | Same; gesture-handler + reanimated worklets run on the native thread and a missing Babel plugin fails only at runtime | Deferred to Phase 999.1. Press and drag a row's grip, confirm it follows the finger and drops into place, and confirm the horizontal page swipe still works. |
| Two-device offline reorder convergence | PROG-02 | Needs two runtimes and a controllable network partition; recorded as a `verification: backstop` truth in 04-02 | Reorder the same day differently on two offline devices, reconnect both, confirm neither device's untouched rows changed `order_index`. |
| Two-device offline activation convergence | PROG-08 | Same; recorded as a `verification: backstop` truth in 04-04 | Activate a different program on each of two offline devices, reconnect, confirm exactly one active program and no jammed upload queue. |
| PowerSync Service pull-side delivery of `routine_cycle` and `routine_exercise_cycle_target` | PROG-04 | The sync-rules change is asserted only by query shape; no running PowerSync Service is exercised in this environment | Restart the self-hosted PowerSync Service against the updated `sync-rules.yaml`, confirm a second device receives both tables and receives no other user's rows. |
| The next-up card, the library, the create fork and the freeze switch on iOS and Android | PROG-07, PROG-08, PROG-09, PROG-10 | No native runtime available | Deferred to Phase 999.1. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify — every task in all 11 plans carries at least one runnable command, and no task carries a `MISSING` placeholder
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task in every plan has one
- [x] Wave 0 covers all MISSING references — folded into the owning tasks; see the section above
- [x] No watch-mode flags — no `--watch` appears in any `<automated>` command
- [x] Feedback latency: targeted mobile Jest under ~60s, targeted API e2e under ~180s
- [ ] `nyquist_compliant: true` set in frontmatter — set by `/gsd-validate-phase` after the first execution wave confirms the suites run green

**Approval:** planned — set `status: validated` after 04-01 executes and the e2e harness is confirmed working
