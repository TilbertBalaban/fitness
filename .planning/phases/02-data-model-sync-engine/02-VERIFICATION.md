---
phase: 02-data-model-sync-engine
verified: 2026-08-17T10:34:58Z
status: gaps_found
score: 3/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "Upgrading the app across a local schema change preserves unsynced on-device data, verified against a populated pre-migration database (roadmap success criterion 4)"
    status: failed
    reason: "The two required test files (crash-recovery.test.ts, schema-redefinition.test.ts) were never authored. Plan 02-05 halted per its own pre-authorized contingency after six documented, empirically-confirmed attempts to construct a real PowerSync database under Jest/Node all failed (no jsdom/fake-indexeddb in the lockfile, RN-Web export condition forces a worker-requiring build, WASM sync-mode hangs, ESM migration required to go further). No mock or skipped test was substituted. This is a genuinely absent deliverable, not a task-completion illusion — the SUMMARY's own 'Self-Check: PASSED' only confirms the two files it did produce (test-support.ts, WINDOWS.md entries) are tracked in git, not that durability was proven."
    artifacts:
      - path: "apps/mobile/__tests__/crash-recovery.test.ts"
        issue: "Does not exist"
      - path: "apps/mobile/__tests__/schema-redefinition.test.ts"
        issue: "Does not exist"
      - path: "apps/mobile/lib/db/test-support.ts"
        issue: "Exists and typechecks against real PowerSync/Drizzle types, but is unexercised — no suite ever calls openTestPowerSync/reopenTestPowerSync/closeTestPowerSync"
    missing:
      - "A real vehicle to construct a PowerSync database under test (browser/device UAT harness, e.g. Playwright driving a real browser, or human sign-off on new test-only dependencies jest-environment-jsdom + fake-indexeddb through the package-legitimacy gate — plan's own six attempts suggest even that may not be sufficient given the RN-Web export-condition and WASM-loader issues)"
      - "A dependency-injection seam in apps/mobile/lib/db/log-set.ts / powersync.ts so a durability suite can route startSession/addSessionExercise/logSet to an isolated test database instead of the module-level getPowerSync() singleton (WINDOWS.md #23)"
      - "crash-recovery.test.ts proving a logged set is durable across a close/reopen with no finish/flush/sync step, driven through the real write helpers"
      - "schema-redefinition.test.ts proving the crud queue survives a client schema redefinition (added/removed nullable column) starting from a populated database, and still pushes and drains"
human_verification:
  - test: "PLAT-03/PLAT-04 two-real-browser-window convergence: open two browser profiles signed into the same account, log sets in each while offline, reconnect, and observe convergence with no logged set lost. Also observe the app staying usable with the PowerSync service stopped."
    expected: "Both devices' sets appear on both after reconnect; no data loss; app remains functional offline even when the sync service is down."
    why_human: "02-08-PLAN.md Task 3 is a checkpoint:human-verify with gate=blocking, requiring visual/functional judgment across two real browser windows. Project CLAUDE.md forbids launching a browser or driving the app without explicit request, and this execution environment has no simulator/device/Playwright browser available regardless. All infrastructure it depends on (running self-hosted PowerSync Service, token endpoint, connector wiring) is built and independently verified — this is purely the human observation step (WINDOWS.md #26)."
  - test: "Airplane-mode cold start and offline session logging on a real iOS/Android device, and confirmation that offline-write.test.ts's fake-backed assertions match real PowerSync/op-sqlite behavior on native"
    expected: "A workout can be logged start-to-finish with zero network connectivity on a real device, and every set survives app restart."
    why_human: "No Xcode/Android SDK on this machine (WINDOWS.md #16). offline-write.test.ts (mobile Jest suite) proves id-generation and SyncConnector's op-mapping logic against fakes, not the real local-write/crud-queue round trip on native op-sqlite or web WASM+IndexedDB (WINDOWS.md #17) — this is present-and-wired code whose actual runtime durability behavior is unexercised by any suite in this environment."
behavior_unverified_items:
  - truth: "User can create and edit records with the device in airplane mode, and they sync automatically once connectivity returns, with no manual sync action (roadmap success criterion 1)"
    test: "Log a workout with the device/browser in airplane mode, then restore connectivity and observe the crud queue drain without any manual action"
    expected: "Local writes succeed immediately offline; on reconnect, the queue pushes automatically and PowerSync's pull stream reflects the server state, with no button tap or app restart required"
    why_human: "The push half is proven server-side (sync-push.e2e-spec.ts, concurrent-edit.e2e-spec.ts) and the pull-side infrastructure (self-hosted PowerSync Service, per-user Sync Streams, token endpoint, connector.ts wiring) is built and verified running/replicating in this session. But the actual on-device local write against a real PowerSync/SQLite engine has never executed in this Jest/Node sandbox (WINDOWS.md #17), and the end-to-end airplane-mode-to-reconnect flow has never been observed on any real client (WINDOWS.md #26). Code is present and wired; the runtime behavior is unexercised."
deferred: []
---

# Phase 2: Data Model & Sync Engine Verification Report

**Phase Goal:** Anything the user writes succeeds offline and converges correctly across their devices, on a schema that can express real training data.
**Verified:** 2026-08-17T10:34:58Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create and edit records offline; they sync automatically on reconnect, no manual action | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Push proven server-side (`sync-push.e2e-spec.ts`, `concurrent-edit.e2e-spec.ts`, both re-run and passing). Pull-side infrastructure built and independently verified: self-hosted PowerSync Service running and replicating (`docker compose up -d powersync` → "Activated new replication stream", `/probes/liveness` 200), `GET /v1/sync/token` e2e suite passes 7/7 including a real 401 from the live service on an expired token (re-run and confirmed). `connector.ts`/`_layout.tsx` wire `connect()`/`disconnect()` to session state. But the real on-device local-write round trip (native op-sqlite / web WASM+IndexedDB) has never executed under Jest (WINDOWS #17 — `offline-write.test.ts` tests id-gen and op-mapping against fakes, not a real PowerSync engine), and the end-to-end two-client convergence + airplane-mode flow has never been observed (WINDOWS #26, 02-08 Task 3 open checkpoint, `status: halted`). |
| 2 | Phone and browser converge after both edit offline, no set silently lost — automated two-device test | ✓ VERIFIED | `apps/api/test/concurrent-edit.e2e-spec.ts` re-run directly: 15/15 cases pass against real Postgres. Protocol-level (not UI-level): both push orders (A-then-B and B-then-A) assert the opposite winner and an unchanged row count; a durable `sync_conflict_log` row holds the losing value; replay, empty-batch, duplicate-op-in-batch, and identical-value-different-parent negative-space cases all covered; delete/tombstone handling (idempotent delete, resurrection-race rejection, cascade to session_exercise/logged_set, cross-user isolation) all covered. |
| 3 | Sync and cold start stay fast against a seeded 1–2yr corpus, not a handful of workouts | ✓ VERIFIED | `apps/api/test/seeded-corpus-perf.e2e-spec.ts` re-run directly: 7/7 pass. Corpus is 18 months (`CORPUS_SHAPE.spanMonths = 18`), generated deterministically through the real `applyBatch` push ingress (not direct insert) — observed generating 277 sessions / ~3,804+ sets live during this verification run. Query-count invariant (`PERF_BUDGET`) asserts an identical query count reading a 3-set and a 30-set session, which is the assertion that actually catches an N+1 regardless of machine speed. Cross-user read isolation is also asserted. |
| 4 | Upgrading across a local schema change preserves unsynced on-device data, verified against a populated pre-migration database | ✗ FAILED | `apps/mobile/__tests__/crash-recovery.test.ts` and `schema-redefinition.test.ts` do not exist (confirmed via `find` and `ls apps/mobile/__tests__/`). Plan 02-05 halted per its own pre-authorized contingency after six documented failed attempts to construct a real PowerSync database under Jest. `test-support.ts` exists and typechecks but is unexercised by any suite. Zero automated proof exists for this criterion beyond the code-level wiring already established in 02-02. |
| 5 | A weight round-trips through storage/display without drift in either unit; a workout finished at 11:45pm attributes to that day regardless of timezone | ✓ VERIFIED | `packages/api-contracts` unit tests re-run: 46/46 pass, including 50-repeat round-trip-without-drift cases, collision safety, ordering, and a single-declaration gate that fails if a second kg↔lb conversion factor appears anywhere in the repo. `apps/mobile/__tests__/calendar-day.test.ts` (8 cases) covers 23:45/00:15 midnight-crossing attribution and a DST-transition case. Caveat (not a failure of this criterion's literal text, but a related gap): WINDOWS #20/#21 — Postgres `logged_set.weight_kg` is still `NOT NULL` and sync push coerces a missing/null weight to `'0'`, so a null-weighted bodyweight set cannot round-trip. This contradicts a PLAT-08 must-have from 02-04's own plan ("never coerced to zero") but does not affect the drift/timezone claims this criterion actually states, since no bodyweight-exercise UI exists yet in this phase's scope. |

**Score:** 3/5 truths verified (1 present, behavior-unverified; 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/sync/conflict-policy.ts` | Pure merge-rule function, no clock, string-compared decimals | ✓ VERIFIED | Exports `resolveConflict`, `ConflictDecision`, `CONFLICT_LOGGED_TABLES`; wired into `sync.service.ts` inside a `db.transaction` |
| `apps/api/src/sync/conflict-log.ts` | Durable overwrite trace + tombstones | ✓ VERIFIED | Exports `recordConflict`, `recordTombstone`, `isTombstoned`; called from `sync.service.ts` |
| `apps/api/test/concurrent-edit.e2e-spec.ts` | Two-device concurrent-edit proof | ✓ VERIFIED | 15 cases, re-run and passing against real Postgres |
| `apps/api/src/seed/corpus-shape.ts` | Corpus params + perf budget, single source | ✓ VERIFIED | `CORPUS_SHAPE.spanMonths = 18`; `PERF_BUDGET` with 4 targets, imported by both generator and suite |
| `apps/api/src/seed/generate-corpus.ts` | Deterministic 18mo corpus via push ingress | ✓ VERIFIED | No `Math.random`, no direct `db.insert`; writes through `applyBatch`; observed generating real data during this run |
| `apps/api/test/seeded-corpus-perf.e2e-spec.ts` | Perf/query-count budget assertions | ✓ VERIFIED | 7 cases, re-run and passing, including the set-count-independent query-count invariant |
| `packages/api-contracts/src/units.ts` | Single kg↔lb conversion boundary, BigInt, no float | ✓ VERIFIED | Exports match spec; `grep` confirms no `parseFloat`/`toFixed`/`Number(`; single-declaration gate enforced by its own test |
| `apps/mobile/lib/calendar-day.ts` | Single IANA-timezone capture point | ✓ VERIFIED | `captureCalendarDay` is the sole read site (grep-enforced by its own test); 8 passing cases including midnight/DST |
| `apps/mobile/lib/db/test-support.ts` | Real PowerSync test-open/close/reopen primitives | ⚠️ ORPHANED | Exists, typechecks, exports the three required functions — but is imported/used by nothing (no suite calls it) |
| `apps/mobile/__tests__/crash-recovery.test.ts` | PLAT-07 durability coverage | ✗ MISSING | Does not exist |
| `apps/mobile/__tests__/schema-redefinition.test.ts` | Roadmap criterion 4 coverage | ✗ MISSING | Does not exist |
| `ops/powersync/powersync.yaml`, `sync-rules.yaml` | Self-hosted PowerSync Service config, per-user streams | ✓ VERIFIED | 12 SYNCED_TABLES covered via Sync Streams edition 3 with multi-hop JOINs; service confirmed running and replicating in this session |
| `apps/api/src/sync/powersync-token.ts` | Session-scoped, short-lived HS256 sync token | ✓ VERIFIED | `apps/api/test/powersync-token.e2e-spec.ts` re-run: 7/7 pass, including a real 401 from the live service on expiry |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `sync.service.ts` | `conflict-policy.ts` | `resolveConflict` called before every write to an existing row | ✓ WIRED | Confirmed by grep and by passing e2e assertions on winner/loser outcomes |
| `sync.service.ts` | `conflict-log.ts` | `recordConflict` inside the same `db.transaction` | ✓ WIRED | Confirmed; e2e asserts exactly one conflict-log row per overwrite |
| `sync.service.ts` | `db/schema/sync.ts` | `isTombstoned` gate on PUT/PATCH | ✓ WIRED | Confirmed; e2e asserts stale writes against tombstoned ids are rejected `deleted` |
| `seeded-corpus-perf.e2e-spec.ts` | `corpus-shape.ts` | `PERF_BUDGET`/`CORPUS_SHAPE` imported, not restated | ✓ WIRED | Confirmed; `grep` shows no inline magic numbers (2000/5000/500) in the suite |
| `generate-corpus.ts` | `sync.service.ts` | Corpus written through `applyBatch`, not direct insert | ✓ WIRED | Confirmed; corpus generation observed hitting the real push path during this run |
| `crash-recovery.test.ts` | `log-set.ts` | Suite drives real write helpers | ✗ NOT_WIRED | File does not exist — link cannot be evaluated |
| `schema-redefinition.test.ts` | `test-support.ts` | Suite reopens store against changed schema | ✗ NOT_WIRED | File does not exist — link cannot be evaluated |
| `apps/mobile/lib/db/connector.ts` | `GET /v1/sync/token` | `fetchCredentials` calls the token endpoint | ✓ WIRED | Confirmed by reading connector.ts and by the passing token e2e suite; end-to-end device behavior not observed (see human verification) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Mobile unit suite green | `pnpm --filter mobile test` | 7 suites, 126 tests, all pass | ✓ PASS |
| api-contracts unit suite green | `pnpm --filter @fitness/api-contracts test` | 46/46 pass | ✓ PASS |
| Two-device concurrent-edit e2e | `pnpm --filter api test:e2e -- concurrent-edit` | 15/15 pass against real Postgres | ✓ PASS |
| Seeded-corpus perf e2e | `pnpm --filter api test:e2e -- seeded-corpus-perf` | 7/7 pass, corpus generated live (277 sessions, ~3,804+ sets observed) | ✓ PASS |
| PowerSync token e2e (incl. live-service 401) | `pnpm --filter api test:e2e -- powersync-token` | 7/7 pass, including a real rejection from the running PowerSync container | ✓ PASS |
| Durability suites exist | `find apps/mobile/__tests__ -iname "*crash-recovery*" -o -iname "*schema-redefinition*"` | No files found | ✗ FAIL — confirms criterion 4 gap |
| Debt markers in phase files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across 10 key phase-2 files | No matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| PLAT-02 | 02-01, 02-02, 02-05 | Log a complete workout offline, zero connectivity | ⚠️ NEEDS HUMAN | Local write path exists and is wired (02-02); durability half (the specific claim that a set is durable the instant it's logged, not on finish) has no automated proof — 02-05's suite never executed (WINDOWS #17, #22) |
| PLAT-03 | 02-01, 02-07, 02-08 | Offline changes sync automatically on reconnect | ⚠️ NEEDS HUMAN | Push proven; pull infrastructure built and running; end-to-end device observation open (WINDOWS #26) |
| PLAT-04 | 02-03, 02-07, 02-08 | Phone/browser converge, no set silently lost | ✓ SATISFIED | `concurrent-edit.e2e-spec.ts`, protocol-level, re-verified passing |
| PLAT-07 | 02-02, 02-05 | In-progress workout survives force-quit/crash/restart | ✗ BLOCKED | No test exists; REQUIREMENTS.md marks this `[x]` on the strength of 02-02's typecheck-only wiring (D5, `human_judgment: true`), which 02-05 does not upgrade — see gap above |
| PLAT-08 | 02-04 | kg/lb unit choice, no drift over repeated conversions | ✓ SATISFIED | 46/46 unit tests pass; single-declaration gate enforced. Caveat: null-weight coercion bug (WINDOWS #20/#21) is real but out of this requirement's tested scope |
| PLAT-10 | 02-06 | Export training data | ✓ SATISFIED (supporting, not a top-5 criterion) | `export.test.ts`, `buildExportDocument` covered; native share-sheet path unverified (WINDOWS #24, no Xcode/Android SDK) |
| LOG-22 | 02-02 | Workout attributed to calendar day regardless of timezone | ✓ SATISFIED | `calendar-day.test.ts`, 8 cases including DST and midnight-crossing |

No orphaned requirements: PLAT-02, PLAT-03, PLAT-04, PLAT-07, PLAT-08, PLAT-10, LOG-22 all appear in at least one plan's `requirements:` frontmatter and REQUIREMENTS.md's Phase 2 traceability table lists exactly this set.

**Note on REQUIREMENTS.md accuracy:** REQUIREMENTS.md currently marks PLAT-07 as `[x]` complete and Phase 2 as "Complete" in its traceability table. Given this verification, PLAT-07 should not be marked complete — 02-02's own SUMMARY frontmatter (id D5) already flagged it `human_judgment: true` pending device/browser UAT, and 02-05 (the plan whose entire purpose was to close that gap) halted without producing any proof. This is a pre-existing optimistic mark, not something introduced by this verification, but it should be corrected before the milestone is considered shippable.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found across the phase's key files. The one notable defect found (WINDOWS #20/#21, null-weight coerced to `'0'` in sync push against a `NOT NULL` Postgres column) is already recorded in the ledger as an open, named gap rather than a silent stub, so it is reported here as a WARNING rather than an anti-pattern violation.

### Human Verification Required

See `human_verification` in frontmatter for the two items (two-browser-window PLAT-03/PLAT-04 convergence with the service stopped, and airplane-mode/native-device offline logging). Both are genuinely blocked by this execution environment (no browser automation permitted, no Xcode/Android SDK present) rather than by unfinished work — the underlying infrastructure for both is built and independently verified in this session.

### Gaps Summary

One blocking gap: **roadmap success criterion 4 has zero automated proof.** Plan 02-05 was the plan whose entire purpose was to prove that (a) a logged set is durable the instant it's written (PLAT-07) and (b) unsynced writes survive a client schema redefinition across an app upgrade (criterion 4). It halted per its own explicitly pre-authorized contingency — a real, empirically well-documented environment limitation (no way to construct a real PowerSync/IndexedDB database inside this project's Jest/Node sandbox without new dependencies or an ESM migration), not an execution failure or a shortcut. The halt was handled honestly: no mock, no skip, two WINDOWS.md entries, and a SUMMARY that says plainly "PLAT-07 and roadmap criterion 4 remain unproven here." But task-completion honesty does not change the goal-backward verdict: the deliverable this plan exists to produce does not exist, and the phase goal — "anything the user writes succeeds offline and converges correctly" — includes the schema-upgrade-preserves-data guarantee by name in the roadmap's own criterion 4.

Two items require human verification rather than pass/fail judgment (see above), both due to genuine environment constraints (no browser automation, no native toolchain) rather than incomplete work — the code and infrastructure they'd exercise are present and independently verified up to the point where only a human's eyes on a real device/browser can close them.

Three of five roadmap criteria (2, 3, 5) are solidly verified with re-run, passing automated evidence obtained directly during this verification, not taken on SUMMARY.md's word.

---

*Verified: 2026-08-17T10:34:58Z*
*Verifier: Claude (gsd-verifier)*
