---
phase: 6
slug: gym-profiles-plate-math
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-26
validated: 2026-08-27
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled in by plan 06-08 against the eight executed plans. Every command below was actually run
> during the plan that owns the row — taken from that plan's own SUMMARY.md, not from the plan's
> `<verify>` text, per this plan's own instruction that what ran is the fact and what was planned
> is not.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 — `apps/mobile`, `packages/api-contracts`, `packages/pr-rules`, `packages/plate-math`; Playwright for `apps/mobile` e2e |
| **Config file** | Per-package, inherited from each `package.json`'s `"test": "jest"` script; `apps/mobile/playwright.config.ts` for e2e |
| **Quick run command** | `pnpm --filter <pkg> test -- <pattern>` (unit) — e.g. `pnpm --filter @fitness/plate-math test -- solver`, `pnpm --filter mobile test -- session-equipment` |
| **Full suite command** | `pnpm -w test` (unit, all workspace packages) — measured at 1519 mobile tests plus the sibling packages' suites, all green on this plan's base |
| **Durability e2e command** | `pnpm --filter mobile test:e2e:durability` — the whole `durability` Playwright project, 45 cases including this phase's 4 new spec files |
| **Measured runtime** | Unit: well under 60s per targeted package; `pnpm -w test` full run: under 2 min; `pnpm --filter mobile test:e2e:durability`: ~2.1–2.4 min for all 45 cases, single-worker by design (WINDOWS #140) |

---

## Sampling Rate

- **After every task commit:** Run the touched package's `pnpm --filter <pkg> test -- <pattern>`
- **After every plan wave:** Run `pnpm -w test`
- **Before `/gsd-verify-work`:** Full suite green **plus** two consecutive green runs of `pnpm --filter mobile test:e2e:durability` — both executed for real by 06-08 Task 2, 45/45 both times
- **Max feedback latency:** 60 seconds for the per-task quick-run command; the full durability e2e project (all 45 cases, single-worker by design) is a separate, longer-running gate run before `/gsd-verify-work`, not after every task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Task 2 (tracer) | 06-01 | 1 | GYM-01 | T-06-01 | `toEquipmentProfileValues` takes `userId` from the authenticated session parameter, never `data.user_id`; the e2e ownership case pins it | unit + e2e | `pnpm -w test`; `pnpm --filter mobile test:e2e:durability plate-strip.spec.ts` | ✅ `apps/mobile/lib/db/__tests__/equipment-profiles.test.ts`, `apps/mobile/e2e/plate-strip.spec.ts` | ✅ green |
| Task 2 (tracer) | 06-01 | 1 | GYM-02 | T-06-03 | `isExactDecimalString` enforces the same decimal contract `parseDecimalToFraction` enforces; a `number` is rejected, never coerced | unit + e2e | `pnpm -w test`; `pnpm --filter mobile test:e2e:durability plate-strip.spec.ts` | ✅ `apps/mobile/components/__tests__/PlateStrip.test.tsx` | ✅ green |
| Task 2 (tracer) | 06-01 | 1 | GYM-04 | T-06-01 | Scope every `equipment_profile` push write through the session `userId` — the same ownership guarantee applies to the `equipment_profile_id` stamped onto a session at start | unit | `pnpm -w test` | ✅ `packages/plate-math/src/__tests__/solver.test.ts` | ✅ green |
| Task 3 (server leg) | 06-01 | 1 | GYM-05 | T-06-02 | `EQUIPMENT_PROFILE_LIMITS` bounds array lengths and name length; the guards reject rather than truncate, before the sync transaction opens | unit (contract layer); integration (recorded, not re-run this plan) | `pnpm --filter @fitness/api-contracts test` | ✅ `apps/api/test/equipment-profile-sync.e2e-spec.ts` (4 cases: create, partial patch, malformed rejection, ownership — recorded in 06-01-SUMMARY.md; not independently re-run in this worktree, `DATABASE_URL` unavailable, the same environment gap 06-01 itself documented) | ✅ green (contract layer, 131/131); e2e proof recorded, not re-executed |
| Task 1 | 06-02 | 2 | GYM-06 | T-06-06 | `achievableBarbellLoads` enumeration is bounded by `EQUIPMENT_PROFILE_LIMITS` and memoised on `(inventory, target)`, not recomputed per keystroke | unit | `pnpm -w test` | ✅ `packages/plate-math/src/__tests__/achievability.test.ts` | ✅ green |
| Task 1 | 06-02 | 2 | GYM-06 | T-06-03 | Every decimal is validated as an exact decimal string at the sync boundary and parsed through the exact-fraction path, never `Number()` | unit | `pnpm -w test` | ✅ `packages/plate-math/src/__tests__/solver.test.ts` | ✅ green |
| Task 2 | 06-02 | 2 | GYM-05 | T-06-07 | A zero, negative or absent `stackIncrementKg` yields the endpoints only rather than looping; the generated set is capped | unit | `pnpm -w test` | ✅ `packages/plate-math/src/__tests__/band.test.ts` (all 12 `EQUIPMENT_TYPES` named) | ✅ green |
| Task 3 | 06-02 | 2 | GYM-06 | T-06-13 | The rounding direction is a literal argument at the single warm-up call site, greppable and pinned by an acceptance criterion | unit | `pnpm -w test` | ✅ `packages/pr-rules/src/__tests__/warmup.test.ts` | ✅ green |
| Task 1–3 | 06-03 | 2 | GYM-01 | T-06-08 | `resolveLiveEquipmentProfileId` makes archival win over the pointer, so a stale pointer from another device cannot present an archived gym as active; sorts its own fallback candidates so the guarantee holds regardless of caller array order | unit | `pnpm --filter mobile test` | ✅ `apps/mobile/lib/db/__tests__/equipment-profiles.test.ts` | ✅ green |
| Task 2 | 06-03 | 2 | GYM-01 | T-06-02 | Inherited from 06-01: the parse pair rejects an out-of-bounds shape rather than materialising it, so a hostile row cannot make the list render an unbounded subtitle | unit | `pnpm --filter mobile test` | ✅ `apps/mobile/app/gym-profiles/__tests__/gym-profiles-screen.test.tsx` | ✅ green |
| Task 1–2 | 06-04 | 3 | GYM-02 | T-06-10 | `toEquipmentProfileDraft` emits only exact decimal strings produced by `toCanonicalKg`, which throws on anything that is not a non-negative decimal | unit | `pnpm --filter mobile test -- lib/gym` | ✅ `apps/mobile/lib/gym/__tests__/profile-draft.test.ts` (26/26) | ✅ green |
| Task 1–2 | 06-04 | 3 | GYM-02 | T-06-02 | `isGymProfileSaveable` refuses a draft past `EQUIPMENT_PROFILE_LIMITS`, so the client cannot author the oversized payload the server validator would reject | unit | `pnpm --filter mobile test` | ✅ `apps/mobile/components/__tests__/GymProfileEditor.test.tsx` | ✅ green |
| Task 3 | 06-04 | 3 | GYM-03 | T-06-11 | Machine entries carry a client-generated id assigned once at creation, so a rename cannot orphan a session's unavailability reference to that machine | e2e | `pnpm --filter mobile test:e2e:durability` | ✅ `apps/mobile/e2e/gym-profiles.spec.ts` | ✅ green |
| Task 1 | 06-05 | 3 | GYM-03 | T-06-04 | The session's resolved inventory is read once per session read (D-17 snapshot) and memoised on `(inventory, target)`, never recomputed per keystroke | unit | `pnpm -w test` | ✅ `apps/mobile/lib/db/__tests__/session-equipment.test.ts` | ✅ green |
| Task 2 | 06-05 | 3 | GYM-05 | T-06-04 | `PlateStrip.tsx` makes zero calls to `solve`/`resolve` at any call site (grep-enforced) — a pure, hook-free, props-driven view over an already-resolved `EquipmentBandState` | unit + e2e | `pnpm -w typecheck`; `pnpm --filter mobile test:e2e:durability plate-strip.spec.ts` | ✅ `apps/mobile/components/__tests__/PlateStrip.test.tsx`, `apps/mobile/e2e/plate-strip.spec.ts` (7 cases) | ✅ green |
| Task 3 | 06-05 | 3 | GYM-06 | T-06-12 | The achievable rounder is applied only to the value written into the in-flight field; the reference row's own displayed figure reads from the logged row and is asserted unchanged by an end-to-end case | unit + e2e | `pnpm --filter mobile test -- session-mutations`; `pnpm --filter mobile test:e2e:durability plate-strip.spec.ts` | ✅ `apps/mobile/lib/db/__tests__/session-mutations.test.ts`, `apps/mobile/e2e/plate-strip.spec.ts` | ✅ green |
| Task 1 | 06-06 | 4 | GYM-07 | T-06-05 | `isUnavailableEquipmentRefs` rejects a malformed or over-long array before the transaction opens, and the patch field map confines a PATCH naming it to that column alone | unit (validator + patch-field-map layer); integration (recorded, not re-run this plan) | `pnpm -w test` | ✅ `apps/api/test/schema-parity.e2e-spec.ts`, `apps/api/test/session-annotations-sync.e2e-spec.ts` (recorded in 06-06-SUMMARY.md; not independently re-run in this worktree, `DATABASE_URL` unavailable) | ✅ green (unit layer); e2e proof recorded, not re-executed |
| Task 2 | 06-06 | 4 | GYM-07 | T-06-14 | Two separate write helpers against two separate rows (session mark vs. profile write-through), each with its own acceptance criterion and its own e2e case — the session-scoped default performs no profile write | unit | `pnpm -w test` | ✅ `apps/mobile/lib/db/__tests__/session-equipment.test.ts` (`equipmentSwapConstraints`, `loadSessionInventory`) | ✅ green |
| Task 2 | 06-06 | 4 | GYM-07 | T-06-15 | The exercise page's swap handler threads its injectable `db` handle, matching every sibling handler (WINDOWS #138, fixed this plan); the browser spec asserts against the isolated test database | e2e | `pnpm --filter mobile test:e2e:durability` | ✅ `apps/mobile/e2e/equipment-availability.spec.ts` (3 cases) | ✅ green |
| Task 3 | 06-06 | 4 | GYM-07 | T-06-01 | Inherited: `toWorkoutSessionValues` takes `userId` from the authenticated session; ownership for a session op resolves through the existing root-table lookup, unchanged by the new column | unit | `pnpm -w test` | ✅ `apps/mobile/components/__tests__/SessionActionSheet.test.tsx` | ✅ green |
| Task 1 | 06-07 | 4 | GYM-04 | T-06-09 | Reads are scoped to the signed-in user's local database, which only contains rows the sync stream already filtered by the authenticated user | unit | `pnpm --filter mobile test` | ✅ `apps/mobile/components/__tests__/SwitchGymSheet.test.tsx` | ✅ green |
| Task 2 | 06-07 | 4 | GYM-04 | T-06-16 | `restampSessionGym` writes only the session's gym column and is the sole writer of it; an end-to-end case asserts a previously logged set's displayed weight is unchanged after a restamp | e2e | `pnpm --filter mobile test:e2e:durability switch-gym.spec.ts` | ✅ `apps/mobile/e2e/switch-gym.spec.ts` (1 case) | ✅ green |
| Task 2 | 06-08 | 5 | GYM-01 through GYM-07 | T-06-19 | Two consecutive full-project durability runs are the acceptance criterion; the suite-integrity behaviour fails an empty or skipped run, and the four new specs are grepped for skip markers (0 found) | e2e | `pnpm --filter mobile test:e2e:durability` | ✅ all 4 phase-6 spec files present in `apps/mobile/playwright.config.ts`'s `durability` project | ✅ green — run twice back to back, 45/45 both times, identical count |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Additional automated gates

Correctness gates with no single-requirement threat-register mapping, kept out of the map above so
that every row there carries a real threat identifier.

| Task ID | Plan | Wave | What it gates | Automated Command | Status |
|---------|------|------|----------------|--------------------|--------|
| Task 3 | 06-01 | 1 | `equipment_profile` moved from `PUSH_DEFERRED_TABLES` to `PUSH_APPLIED_TABLES`; the contract package's own parity test | `pnpm --filter @fitness/api-contracts test` | ✅ green — 131/131 |
| Task 3 | 06-02 | 2 | Workspace-wide typecheck and test after the `not_loadable` shape change (new required `lowerKg`/`higherKg` fields) | `pnpm -w typecheck`; `pnpm -w test` | ✅ green |
| Task 3 | 06-03 | 2 | Route-guard protected-screen-list assertion after registering `gym-profiles` | `pnpm --filter mobile test` | ✅ green — 1393/1393 |
| Task 2–3 | 06-04 | 3 | Full mobile typecheck and unit suite after the editor/route wiring | `pnpm --filter mobile typecheck`; `pnpm --filter mobile test` | ✅ green |
| Task 2–3 | 06-05 | 3 | Workspace typecheck after `PlateStripBandData`'s shape change; full mobile unit suite | `pnpm -w typecheck`; `pnpm --filter mobile test` | ✅ green — 1447 tests |
| — | 06-06 | 4 | Full workspace suite after the `unavailable_equipment` column landed — surfaced one stale test fixture (fixed same wave) | `pnpm -w test` | ✅ green — all 8 turbo tasks |
| — | 06-07 | 4 | Full mobile unit suite and typecheck | `pnpm --filter mobile test`; `pnpm --filter mobile typecheck` | ✅ green — 1473/1473 |
| Task 1 | 06-08 | 5 | Every field name documented in `docs/equipment-profile-shape.md` names a real field in the shipped contract module | `grep -c "unavailable_equipment" docs/equipment-profile-shape.md` (part of the plan's own `<verify>`) | ✅ green |
| Task 3 | 06-08 | 5 | `.planning/WINDOWS.md` still parses as valid JSON after this plan's appends | `node .claude/gsd-core/bin/gsd-tools.cjs windows status` | ✅ green — `ok: true`, 144 entries, `total_count`/`open_count` counters self-consistent |
| Task 3 | 06-08 | 5 | This plan's own `<verify>` command for the frontmatter check — recorded as a real result, not a silent pass | `node .claude/gsd-core/bin/gsd-tools.cjs query frontmatter.validate .planning/phases/06-gym-profiles-plate-math/06-VALIDATION.md` | ❌ pre-existing tooling gap — the CLI now requires `frontmatter validate <file> --schema <name>` (positional `query frontmatter.validate <file>` errors `file and schema required` regardless of file content); reproduces identically against `01-VALIDATION.md`, the phase's own already-`approved` example, confirming this is a stale plan-authored command, not a defect in this file. See `06-08-SUMMARY.md`'s Deviations section. |

---

## Wave 0 Requirements

- [x] `packages/plate-math/src/solver.ts` + `__tests__/solver.test.ts` — GYM-02, GYM-05, D-15 degenerate inventory (one pair, no pairs) — shipped 06-01, extended 06-02 (`not_loadable` neighbours)
- [x] `packages/plate-math/src/achievability.ts` + `__tests__/achievability.test.ts` — GYM-06, D-09/D-10 explicit-direction rounding — shipped 06-02
- [x] `packages/plate-math/src/inventory.ts` + `__tests__/inventory.test.ts` — D-21 resolved-inventory function — shipped 06-01; `loadSessionInventory` (06-05, `session-equipment.ts`) is the session-scoped consumer that layers D-21's subtraction on top
- [x] `packages/plate-math/package.json` — mirrors `packages/pr-rules/package.json` — shipped 06-01, its own real workspace package (not folded into `pr-rules`)
- [x] `apps/api/src/sync/__tests__/` — `equipment_profile` push-path case, following `program-sync.e2e-spec.ts`'s `routine` pattern — shipped 06-01 as `apps/api/test/equipment-profile-sync.e2e-spec.ts` (the codebase's e2e convention places this under `apps/api/test/`, not `src/sync/__tests__/`, matching every other push-path proof in this repo)
- [x] Fix WINDOWS #138 (`handleSwapPick` missing `db` threading) — required before the equipment-aware swap path is exercised by e2e — fixed in 06-06 Task 2, ledger entry marked `fixed`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native (iOS/Android) plate strip rendering inside the keypad's reserved band | GYM-05 | No native toolchain on this machine; deferred to ROADMAP Phase 999.1 | Run the dev client on device, open set entry, type a barbell weight, confirm the strip renders in the 40px reserved band |
| Profile tab Gyms section / Gym Profiles list / archive-to-collapsed-section click-through | GYM-01 | No browser/simulator session available in the 06-03 executor pass; equivalent flow covered by unit tests, not the interactive layout confirmation the plan's own `<human-check>` asked for | Deferred to human UAT. Recorded as WINDOWS.md #141 (`unrun-verify`, open) |
| Create a gym in lb, add plates, add a machine, save, reopen, on the web target | GYM-02 | No browser/simulator session available in the 06-04 executor pass; the equivalent data flow is covered by `gym-profiles.spec.ts`'s real-browser proof, but not the specific interactive/visual confirmation the human-check line asked for | Deferred to human UAT. Recorded as WINDOWS.md #142 (`unrun-verify`, open) |
| Session menu row order (Pause/Resume, Session Note, Switch Gym, Discard) and visual accent confirmation on switching gyms | GYM-04 | No browser/simulator UI session available in the 06-07 executor pass beyond the automated Playwright run (`switch-gym.spec.ts`, which passed) | Deferred to human UAT. Recorded as WINDOWS.md #143 (`unrun-verify`, open) |
| Nested-pressable locator hazard in `ExercisePickerModal.tsx` (two accessible names for one visual row) | — (pre-existing, phase 5 origin, touched by this phase's e2e specs) | A real fix (dropping one of the two nested `Pressable`s) is a UI change outside this phase's declared scope; specs work around it with an attribute selector | Not scheduled this phase. Recorded as WINDOWS.md #139 (`deviation`, open) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 22 of 23 tasks across the phase's 8 plans carry an `<automated>` block; the one that does not is 06-01 Task 1, a `checkpoint:decision` gate (the equipment-profile wire-shape choice), pre-resolved by the orchestrator before execution and a human gate by construction
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the only task without one (06-01 Task 1) is immediately followed by 06-01 Task 2 (tracer, automated) and Task 3 (auto, automated); no run of 3 exists anywhere in the phase
- [x] Wave 0 covers all MISSING references — every seeded item exists and is checked above
- [x] No watch-mode flags — no command cited anywhere in this table or any of the 8 plan summaries passes `--watch`/`--watchAll`; `apps/mobile`'s `test`/`test:e2e`/`test:e2e:durability` scripts and every `apps/api`/package `test`/`test:e2e` script are watch-free
- [x] Feedback latency < 60s for every per-task quick-run command in the table above; the full `test:e2e:durability` project (all 45 cases, single-worker by design per WINDOWS #140) is the separate, longer pre-`/gsd-verify-work` gate, not a per-task command, and both of 06-08 Task 2's real runs completed in 2.1–2.4 minutes
- [x] `nyquist_compliant: true` set in frontmatter

**Two claims this contract does not make**, matching Phase 1's own precedent of recording what
this contract cannot see rather than implying it:

1. Three `unrun-verify` human-check items (WINDOWS #141, #142, #143 — the 06-03/06-04/06-07
   interactive click-throughs) were never run in any browser/simulator session across this phase's
   entire execution. Every one of them has an equivalent automated e2e proof that passed, but the
   specific interactive/visual confirmation each plan's own `<human-check>` line asked for was not
   separately performed. These are open, not resolved, and are deferred to human UAT.
2. No native (iOS/Android) toolchain exists on this machine (D-08). Every native-rendering claim in
   this phase rests on `pnpm -w typecheck` passing, not on a device or simulator render. Deferred to
   ROADMAP Phase 999.1's native sweep, per this project's standing policy.
3. This plan's own `<verify>` command for this task (`gsd-tools.cjs query frontmatter.validate
   <file>`) does not run successfully against the current CLI, which now requires a `--schema` flag
   — confirmed to fail identically against `01-VALIDATION.md`, the one other phase in this project
   already carrying `status: approved`, so this is a stale command in the plan text, not something
   this file's content could have satisfied. The acceptance criteria this task can actually control
   — zero placeholder rows, every command verbatim-sourced from a plan summary, every requirement
   named, `.planning/WINDOWS.md` still valid JSON — are all independently confirmed above.

**Approval:** approved 2026-08-27 by plan 06-08, with the exclusions recorded above.
