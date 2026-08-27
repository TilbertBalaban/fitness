# Equipment Profile & Session Unavailability Shape Reference

Reference for the four wire shapes Phase 6 introduces: the three `equipment_profile` JSON columns
(`available_plates`, `dumbbell_increments_kg`, `machine_availability`) and the session's
`unavailable_equipment` column. Each shape is defined once in `packages/api-contracts/src/equipment.ts`,
enforced by that module's own type guards, and validated on write in `apps/api/src/sync/sync.service.ts`
(`hasInvalidField`'s `equipment_profile` and `workout_session` branches) — the same enforcement layer
`docs/catalog-load-types.md` and `docs/program-vocabularies.md` describe for `load_type` and the
`routine`/`routine_cycle` vocabularies. Unlike those vocabularies, **none of these four shapes carry a
Postgres CHECK constraint** — see "Enforcement" below.

## `equipment_profile.available_plates`

Recorded plate denominations, one entry per unique plate weight, each entry naming how many *pairs*
the gym has of that weight.

| Field | Type | Nullable | Unit | Absent-value meaning |
|---|---|---|---|---|
| `weightKg` | exact decimal string | No | kilograms, canonical scale | Not applicable — required on every entry |
| `pairCount` | non-negative integer | No | pairs of plates | Not applicable — required on every entry |

A whole `available_plates` array itself may be `null`/absent — an equipment profile with no recorded
plates at all is valid and resolves to "no plates available" (`resolveInventory`, `packages/plate-math`),
not an error.

**Counts are pairs, never individual plates.** A gym with two 20kg plates on each side of the rack
is recorded as `{ weightKg: "20", pairCount: 2 }`, not `pairCount: 4`. This is deliberate: a bare
individual-plate count would be ambiguous about whether it can be loaded symmetrically at all, and
every breakdown computed against it would be silently out by a factor of two the moment a reader
assumed the more common "total plates" convention instead. `solvePlateBreakdown`
(`packages/plate-math/src/solver.ts`) consumes `pairCount` directly as the number of times that
denomination may appear **per side** of the bar.

## `equipment_profile.dumbbell_increments_kg`

The dumbbell weights a gym stocks, one entry per available weight.

| Field | Type | Nullable | Unit | Absent-value meaning |
|---|---|---|---|---|
| `weightKg` | exact decimal string | No | kilograms, canonical scale | Not applicable — required on every entry |

Each entry names one loadable single-dumbbell weight; there is no separate pair-count field here —
unlike barbell plates, a gym's dumbbell rack is assumed to carry a matched pair at every stocked
increment. A `null`/absent array means no dumbbells are recorded for this profile.

## `equipment_profile.machine_availability`

Full per-machine records: one entry per machine or cable station the gym has, each carrying its own
identity, type, availability flag, and — for stack machines — its resistance range.

| Field | Type | Nullable | Unit | Absent-value meaning |
|---|---|---|---|---|
| `id` | non-empty string | No | — | Not applicable — required, unique within the array |
| `name` | non-empty string, ≤80 chars | No | — | Not applicable — required |
| `equipmentType` | one of `EQUIPMENT_TYPES` (`packages/api-contracts/src/catalog.ts`) | No | — | Not applicable — required |
| `available` | boolean | No | — | Not applicable — required |
| `stackMinKg` | exact decimal string | Yes | kilograms, canonical scale | No minimum recorded (e.g. a fixed-resistance or cable machine with no stack) |
| `stackMaxKg` | exact decimal string | Yes | kilograms, canonical scale | No maximum recorded |
| `stackIncrementKg` | exact decimal string | Yes | kilograms, canonical scale | No increment recorded — the achievability rounder cannot compute intermediate stack loads for this machine |
| `baseResistanceKg` | exact decimal string | Yes | kilograms, canonical scale | No base resistance recorded (most machines) |

`equipmentType` reuses `EQUIPMENT_TYPES`, the same nullable, CHECK-free per-exercise discriminator
vocabulary `docs/catalog-load-types.md`'s sibling documents describe — see "Enforcement" below for
why that reuse matters. A `null`/absent `machine_availability` array means the profile records no
machines at all.

## `workout_session.unavailable_equipment`

Session-scoped equipment exclusions: a list of references naming what this one session cannot use,
subtracted from the session's resolved inventory (`resolveInventory`) without mutating the underlying
`equipment_profile`. This column lives on `workout_session`, not on `equipment_profile` — it is a
per-session override, matching the per-session `notes`/`removed_at` annotation pattern
`docs/session-vocabularies.md` already documents, not a change to the gym's own recorded inventory.

`UnavailableEquipmentRef` is a three-branch discriminated union on its `kind` field:

| `kind` | Additional fields | Type | Nullable | Meaning |
|---|---|---|---|---|
| `equipment_type` | `equipmentType` | one of `EQUIPMENT_TYPES` | No | The whole equipment type is unavailable for this session (e.g. every dumbbell, since no reliable "currently active weight" exists at the point this ref is recorded — see `06-06-SUMMARY.md`'s decision) |
| `machine` | `machineId` | non-empty string, matching a `machine_availability` entry's `id` | No | One specific machine is unavailable for this session |
| `dumbbell` | `weightKg` | exact decimal string | No | One specific dumbbell weight is unavailable for this session |

A `null`/absent `unavailable_equipment` column means nothing is excluded this session — the session's
resolved inventory equals the stamped profile's inventory unchanged.

## Enforcement

**None of these four shapes carry a Postgres CHECK constraint.** This is a deliberate departure from
`load_type` and the `routine`/`routine_cycle`/`workout_session` vocabularies documented in
`docs/catalog-load-types.md`, `docs/program-vocabularies.md` and `docs/session-vocabularies.md`, all
of which are backstopped by a CHECK constraint that holds even if `sync.service.ts`'s
application-level validator is bypassed entirely (direct SQL, a seed script). These four shapes have
no equivalent backstop: `packages/api-contracts/src/equipment.ts`'s type guards
(`isEquipmentProfilePlates`, `isEquipmentDumbbellIncrements`, `isEquipmentMachineAvailability`,
`isUnavailableEquipmentRefs`), invoked from `sync.service.ts`'s `hasInvalidField` gate on every push,
are the *only* enforcement. A reader who assumes a database constraint will catch a malformed write
here is wrong — a direct SQL write or a future code path that skips `sync.service.ts` can put an
invalid shape into either column with nothing in Postgres to stop it.

This asymmetry is deliberate and intentional (D-16, `.planning/phases/06-gym-profiles-plate-math/06-CONTEXT.md`):
a gym's inventory is authored and edited as one whole JSON document and never queried across rows, so
splitting it into child tables — which is what would let a CHECK constraint apply per-row — would buy
nothing and cost three new synced tables plus their own conflict resolution. The same asymmetry already
applies to `EQUIPMENT_TYPES` itself (D-07): it is nullable, has no Postgres CHECK, and its own header
comment in `packages/api-contracts/src/catalog.ts` names Phases 6/7 as the expected extenders — the
`equipmentType` fields inside `machine_availability` and `unavailable_equipment` inherit that same gap
by referencing the same vocabulary.

`unavailable_equipment` additionally carries no length limit at all — unlike the three
`equipment_profile` columns (see "Size limits" below), `isUnavailableEquipmentRefs` does not bound the
array's length. A future phase raising this to a real limit does so deliberately (T-06-02, accepted
severity: medium).

## Mirror: Postgres JSONB vs. SQLite text

The Postgres columns (`apps/api/src/db/schema/equipment.ts`'s `availablePlates`,
`dumbbellIncrementsKg`, `machineAvailability`; `apps/api/src/db/schema/session.ts`'s
`unavailableEquipment`) are real `jsonb` — the `pg` driver hands back an already-parsed JS value on
read. The SQLite mirror (`apps/mobile/lib/db/schema.ts`'s matching columns) stores every one of these
four columns as `text` — a raw JSON string, since SQLite has no native JSON type PowerSync's local
mirror can lean on.

Every read and write on both sides routes through exactly one pair of functions —
`serializeEquipmentJson`/`parseEquipmentJson` (`packages/api-contracts/src/equipment.ts`) — never an
inline `JSON.parse`/`JSON.stringify` at a call site. `serializeEquipmentJson` always returns a string
(defaulting a `null`/`undefined` input to `"[]"`); `parseEquipmentJson` accepts either the Postgres
driver's already-parsed value or the SQLite mirror's raw string and returns the parsed value either
way, so a caller never needs to know which side of the mirror it is reading from. An inline conversion
at a new call site is a defect — the two functions exist specifically so this pair, not a third
reimplementation, is the one place the Postgres/SQLite type mismatch is bridged.

## Size limits

| Column | Limit constant | Value |
|---|---|---|
| `available_plates` | `EQUIPMENT_PROFILE_LIMITS.maxPlateDenominations` | 24 entries |
| `dumbbell_increments_kg` | `EQUIPMENT_PROFILE_LIMITS.maxDumbbellWeights` | 60 entries |
| `machine_availability` | `EQUIPMENT_PROFILE_LIMITS.maxMachines` | 60 entries |
| `machine_availability[].name` | `EQUIPMENT_PROFILE_LIMITS.maxNameLength` | 80 characters |
| `unavailable_equipment` | — | No limit enforced (see "Enforcement" above) |

A payload past any of the enforced limits is **rejected outright by the relevant type guard**, never
truncated to fit — `isEquipmentProfilePlates`/`isEquipmentDumbbellIncrements`/`isEquipmentMachineAvailability`
each check `.length` against their limit before validating any entry, so an oversized array fails the
whole push rather than being silently cut down to the first N entries (T-06-02).

Every `weightKg`/`stackMinKg`/`stackMaxKg`/`stackIncrementKg`/`baseResistanceKg` field across all four
shapes is an **exact decimal string**, validated by `isExactDecimalString` — the same
`/^\d+(\.\d+)?$/` contract `parseDecimalToFraction` (`packages/api-contracts/src/units.ts`) enforces
for every other canonical-kilogram value in this codebase. A JavaScript `number` in any of these fields
is **rejected, not coerced** — `isExactDecimalString` returns `false` for a numeric type outright — so
the exact-fraction guarantee the units module provides for every downstream computation is never
bypassed by a binary float sneaking in through an equipment payload.

## Extension rule

Adding a field to any of these four shapes is additive only: a new optional field may be introduced,
but an existing field's name, type or meaning is never repurposed, and a shipped field is never
removed. Client builds already in the field — including offline devices that have not updated in some
time — read this exact wire contract; a rename or a meaning change is a break, not a refactor, for
every such client. The same rule already governs `EQUIPMENT_TYPES` (D-07: "extend by appending only —
never insert, never reorder") and every other closed vocabulary in this codebase
(`docs/catalog-load-types.md`, `docs/program-vocabularies.md`, `docs/session-vocabularies.md`); these
four JSON shapes carry the identical constraint even though they are objects rather than enum values.
A future phase extending a gym profile's inventory — a new machine field, a second unavailability
`kind`, a new plate attribute — adds it as a new optional field or a new union branch here, never by
changing what an existing field name means.
