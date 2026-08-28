---
phase: 06
slug: gym-profiles-plate-math
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-28
register_authored_at_plan_time: true
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register built from the `<threat_model>` blocks of all eight `06-*-PLAN.md` files
(threat modelling was authored at plan time, not retroactively). No `## Threat Flags`
were raised in any `06-*-SUMMARY.md`, so no execution-time escalations feed this audit.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → sync push endpoint | Untrusted, client-authored `equipment_profile` op payloads cross into the API and Postgres | Row ids, `user_id`, three free-form JSON columns (plates, dumbbells, machines) |
| client → sync push, `unavailable_equipment` | A new free-form JSON column on `workout_session` crosses into Postgres | Array of equipment refs |
| synced row → plate solver | JSON read back out of local SQLite drives a synchronous search behind a live-typing field | Decimal weight strings, plate/machine inventory |
| user keyboard input → inventory JSON | Free-text weights and machine names become a synced wire payload a solver later trusts | Decimal strings, machine names/ids |
| band neighbour tap → weight field write | A value the app offers is written into a field that becomes a logged fact | Rounded achievable load |
| gym switch → session snapshot column | A user action rewrites the one column history's gym attribution derives from | `equipment_profile_id` on the session row |
| local gym rows → list screen | Rows may arrive from another device with a stale or dangling active pointer | Gym profile rows, active pointer |
| documentation → future implementer | A wrong shape document produces wrong payloads in a later phase | Field-shape reference prose |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Tampering / Info Disclosure | `sync.service.ts` `equipment_profile` push case | high | mitigate | `toEquipmentProfileValues(op.id, userId, op.data)` — `userId` bound from the authenticated session argument (`sync.service.ts:611,1838`, comment names T-06-01); `EQUIPMENT_PROFILE_PATCH_FIELDS` maps `id: null, userId: null` (`patch-update-set.ts:397-408`) so a PATCH cannot rewrite ownership | closed |
| T-06-02 | Denial of Service | `packages/api-contracts/src/equipment.ts` validators | medium | mitigate | `EQUIPMENT_PROFILE_LIMITS` bounds array and name lengths; guards reject rather than truncate before the sync transaction opens (present in 5 files) | closed |
| T-06-03 | Tampering | Decimal fields flowing into `solvePlateBreakdown` | medium | mitigate | `isExactDecimalString` enforces the same decimal contract `parseDecimalToFraction` enforces; a `number` is rejected, never coerced (present in 5 files) | closed |
| T-06-04 | Denial of Service | Per-keystroke band computation / bounded-knapsack search | medium | mitigate | Inventory read once per session read; achievable set derived once per inventory; band state memoised on `(inventory, target)` in `workout.tsx`; the view performs no computation and runs no effect | closed |
| T-06-05 | Tampering | `workout_session.unavailable_equipment` push path | medium | mitigate | `isUnavailableEquipmentRefs` rejects a malformed or over-long array before the transaction opens; the patch field map confines a PATCH naming it to that column alone | closed |
| T-06-06 | Denial of Service | `achievableBarbellLoads` subset enumeration | medium | mitigate | Enumeration bounded by `EQUIPMENT_PROFILE_LIMITS` (24 denominations, integer pair counts), deduplicated into an ascending set once per inventory, not per keystroke | closed |
| T-06-07 | Denial of Service | `achievableMachineLoads` stepping by `stackIncrementKg` | medium | mitigate | `achievability.ts:143` — `incrementMilli <= 0n` returns endpoints only; `:146` caps `stepCount` at `MAX_MACHINE_STEPS`, else endpoints. BigInt milli-kg throughout, no float loop | closed |
| T-06-08 | Tampering | Active-gym pointer resolution | medium | mitigate | `resolveLiveEquipmentProfileId` makes archival win over the pointer, so a stale pointer from another device cannot present an archived gym as in effect; single owner, tested (present in 6 files) | closed |
| T-06-09 | Information Disclosure | Gym profile reads (list screen, switch sheet) | low | accept | Reads scoped to the signed-in user's local database, which only contains rows the sync stream already filtered by the authenticated user; no new server read surface | closed |
| T-06-10 | Tampering | Editor draft → profile conversion | medium | mitigate | `toEquipmentProfileDraft` emits only exact decimal strings produced by `toCanonicalKg`, which throws on anything not a non-negative decimal; a malformed field cannot reach the JSON columns as a number or free string | closed |
| T-06-11 | Tampering | Machine entry identity | low | mitigate | Machine entries carry a client-generated id assigned once at creation, so a rename cannot orphan a session's unavailability reference | closed |
| T-06-12 | Tampering | Achievable autofill overwriting a logged reference | high | mitigate | Rounder applied only to in-flight values (`workout.tsx:1060`, `session-mutations.ts:227`); `plate-strip.spec.ts:247` asserts the reference row's own figure is unchanged after a tap-to-autofill | closed |
| T-06-13 | Repudiation | Warm-up rounding direction | low | mitigate | Direction is a literal argument at the single warm-up call site (`'down'`), greppable and pinned by an acceptance criterion | closed |
| T-06-14 | Tampering | Session mark vs. profile write-through | high | mitigate | Two separate helpers against two separate rows: `markEquipmentUnavailable` (`lib/db/session-equipment.ts:45`, session-scoped default, no profile write) vs. `handleConfirmWriteThrough` (`EquipmentAvailabilitySheet.tsx:373`, behind a `write-confirm` screen). Both pinned by unit tests | closed |
| T-06-15 | Tampering | Swap write path resolving the wrong database | medium | mitigate | The exercise page's swap handler threads its injectable handle, matching every sibling handler; the browser spec asserts against the isolated test database | closed |
| T-06-16 | Tampering | `restampSessionGym` | medium | mitigate | Sole writer of the session gym column; `switch-gym.spec.ts:62` asserts a previously logged set's displayed weight is unchanged after a restamp | closed |
| T-06-17 | Repudiation | History's gym attribution | medium | accept | A restamp overwrites the earlier attribution with no audit trail — the intended semantic per D-18 (you were wrong about which gym, not at two gyms) | closed |
| T-06-18 | Tampering | Shape documentation drifting from shipped validators | medium | mitigate | An acceptance criterion requires every field name in the document to appear in the contract module, so a renamed field fails a check | closed |
| T-06-19 | Repudiation | A suite reported green without being executed | high | mitigate | `jest.config.js:4` wires `scripts/jest-suite-integrity.cjs` as a reporter, which fails an empty or skipped run; zero skip/only markers confirmed across all four new phase-06 e2e specs | closed |
| T-06-SC | Tampering | Package installs (supply chain) | high | accept | Phase installs no external package. `packages/plate-math` devDependencies verified **byte-identical** to `packages/pr-rules/package.json`; its only runtime dependency is `@fitness/api-contracts` (`workspace:*`). No new version enters the lockfile | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-06-01 | T-06-09 | Gym profile reads are scoped to the signed-in user's local database, which only ever contains rows the sync stream already filtered by the authenticated user. No new server read surface is introduced by this phase. | Phase 06 plan author (06-03, 06-07) | 2026-08-28 |
| R-06-02 | T-06-17 | A gym restamp deliberately overwrites the earlier attribution with no audit trail. Per decision D-18 this is a correction ("you were wrong about which gym you were at"), not a loss of history. | Phase 06 plan author (06-07) | 2026-08-28 |
| R-06-03 | T-06-SC | The phase installs no external package; `@fitness/plate-math`'s devDependency versions are copied verbatim from `packages/pr-rules`, so the lockfile gains no new third-party version. Verified by diff during this audit. | Phase 06 plan author (06-01) | 2026-08-28 |
| R-06-04 | T-06-04 (06-01 framing) | The bounded-knapsack search space is bounded by `EQUIPMENT_PROFILE_LIMITS` and memoised on remaining per-side load; a pathological but in-bounds inventory is accepted as a sub-millisecond cost. | Phase 06 plan author (06-01) | 2026-08-28 |
| R-06-05 | T-06-02 (06-08 framing) | Documented size limits are inherited and unchanged; the shape document records them so a later phase raising them does so deliberately. | Phase 06 plan author (06-08) | 2026-08-28 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-28 | 20 | 20 | 0 | `/gsd-secure-phase 06` (orchestrator, ASVS L1 short-circuit) |

**Audit depth:** ASVS level 1 — grep-depth mitigation verification. Per the
`secure-phase` short-circuit rule, `register_authored_at_plan_time: true` and
`asvs_level == 1` with zero open threats means L1 depth is sufficient and no
deeper auditor pass was required. All four `high`-severity threats (T-06-01,
T-06-12, T-06-14, T-06-19) plus the `high` supply-chain item (T-06-SC) were
verified by direct source inspection rather than symbol presence alone.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-28
