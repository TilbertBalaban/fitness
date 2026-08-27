import { and, eq, isNull } from 'drizzle-orm';
import {
  serializeEquipmentJson,
  parseEquipmentJson,
  toCanonicalKg,
  type EquipmentDumbbell,
  type EquipmentMachine,
  type EquipmentPlate,
  type WeightUnit,
} from '@fitness/api-contracts';
import { generateClientId } from './id';
import { loadWeightUnit } from './preferences';
import { getPowerSync, type WriteDb } from './powersync';
import { equipmentProfile, userPreference } from './schema';

export const SEEDED_PROFILE_NAME = 'My Gym';

export interface EquipmentProfileRow {
  id: string;
  name: string;
  isDefault: boolean;
  barbellWeightKg: string | null;
  plates: EquipmentPlate[];
  dumbbells: EquipmentDumbbell[];
  machines: EquipmentMachine[];
  nativeUnit: WeightUnit;
  archivedAt: string | null;
}

interface EquipmentProfileSelectRow {
  id: string;
  name: string;
  isDefault: boolean;
  barbellWeightKg: string | null;
  availablePlates: string | null;
  dumbbellIncrementsKg: string | null;
  machineAvailability: string | null;
  nativeUnit: string;
  archivedAt: string | null;
}

// The single read-side shape translation for the three JSON columns — every read routes through
// serializeEquipmentJson/parseEquipmentJson (D-16), never an inline JSON.parse at a call site.
function toEquipmentProfileRow(row: EquipmentProfileSelectRow): EquipmentProfileRow {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    barbellWeightKg: row.barbellWeightKg,
    plates: (parseEquipmentJson(row.availablePlates) as EquipmentPlate[] | null) ?? [],
    dumbbells: (parseEquipmentJson(row.dumbbellIncrementsKg) as EquipmentDumbbell[] | null) ?? [],
    machines: (parseEquipmentJson(row.machineAvailability) as EquipmentMachine[] | null) ?? [],
    nativeUnit: row.nativeUnit as WeightUnit,
    archivedAt: row.archivedAt,
  };
}

export async function loadEquipmentProfile(id: string, db: WriteDb = getPowerSync()): Promise<EquipmentProfileRow | null> {
  const [row] = await db.select().from(equipmentProfile).where(eq(equipmentProfile.id, id));
  if (!row) return null;
  return toEquipmentProfileRow(row);
}

export async function loadActiveEquipmentProfileId(userId: string, db: WriteDb = getPowerSync()): Promise<string | null> {
  const [row] = await db
    .select({ defaultEquipmentProfileId: userPreference.defaultEquipmentProfileId })
    .from(userPreference)
    .where(eq(userPreference.id, userId));
  return row?.defaultEquipmentProfileId ?? null;
}

interface SeedPlateSpec {
  value: number;
  pairCount: number;
}

// The commercial-gym seed (D-19): a standard bar and a generous plate/dumbbell set, so plate math
// works before anyone configures anything. Values are plain numbers in the profile's OWN unit —
// converted to canonical kg via toCanonicalKg immediately below, never compared or stored as-is.
const KG_BAR_WEIGHT = 20;
const KG_SEED_PLATES: SeedPlateSpec[] = [
  { value: 25, pairCount: 3 },
  { value: 20, pairCount: 3 },
  { value: 15, pairCount: 2 },
  { value: 10, pairCount: 2 },
  { value: 5, pairCount: 2 },
  { value: 2.5, pairCount: 2 },
  { value: 1.25, pairCount: 2 },
];
const KG_DUMBBELL_RANGE = { min: 2.5, max: 50, step: 2.5 };

const LB_BAR_WEIGHT = 45;
const LB_SEED_PLATES: SeedPlateSpec[] = [
  { value: 45, pairCount: 3 },
  { value: 35, pairCount: 2 },
  { value: 25, pairCount: 2 },
  { value: 10, pairCount: 2 },
  { value: 5, pairCount: 2 },
  { value: 2.5, pairCount: 2 },
];
const LB_DUMBBELL_RANGE = { min: 5, max: 100, step: 5 };

function seedDumbbellValues(range: { min: number; max: number; step: number }): number[] {
  const values: number[] = [];
  const count = Math.round((range.max - range.min) / range.step) + 1;
  for (let i = 0; i < count; i++) {
    values.push(Number((range.min + i * range.step).toFixed(3)));
  }
  return values;
}

function buildSeedInventory(unit: WeightUnit): {
  barbellWeightKg: string;
  plates: EquipmentPlate[];
  dumbbells: EquipmentDumbbell[];
} {
  const barWeight = unit === 'kg' ? KG_BAR_WEIGHT : LB_BAR_WEIGHT;
  const plateSpecs = unit === 'kg' ? KG_SEED_PLATES : LB_SEED_PLATES;
  const dumbbellRange = unit === 'kg' ? KG_DUMBBELL_RANGE : LB_DUMBBELL_RANGE;

  const barbellWeightKg = toCanonicalKg(String(barWeight), unit) as string;
  const plates: EquipmentPlate[] = plateSpecs.map((spec) => ({
    weightKg: toCanonicalKg(String(spec.value), unit) as string,
    pairCount: spec.pairCount,
  }));
  const dumbbells: EquipmentDumbbell[] = seedDumbbellValues(dumbbellRange).map((value) => ({
    weightKg: toCanonicalKg(String(value), unit) as string,
  }));

  return { barbellWeightKg, plates, dumbbells };
}

// Insert-or-update singleton write, same pattern setWorkoutPreference (preferences.ts) uses for
// user_preference — writes exactly default_equipment_profile_id, leaving every sibling column
// untouched on an update.
async function pointDefaultProfileAt(userId: string, profileId: string, weightUnit: WeightUnit, db: WriteDb): Promise<void> {
  const [existing] = await db.select({ id: userPreference.id }).from(userPreference).where(eq(userPreference.id, userId));

  if (existing) {
    await db.update(userPreference).set({ defaultEquipmentProfileId: profileId }).where(eq(userPreference.id, userId));
    return;
  }

  await db.insert(userPreference).values({
    id: userId,
    userId,
    weightUnit,
    defaultEquipmentProfileId: profileId,
    activeRoutineId: null,
    autoAdvanceEnabled: true,
    warmupSetsEnabled: true,
  });
}

// D-19's seed-on-first-need: if the user already has a non-archived profile, returns the active
// one's id (or the first by name then id when no active pointer resolves); otherwise creates the
// seeded "My Gym" default and points the preference row at it. Read-then-write within the
// caller's own handle (no nested transaction) — a second call in the same session finds the first
// write and returns the same id, satisfying GYM-01's idempotency truth by construction.
export async function ensureDefaultEquipmentProfile(userId: string, db: WriteDb = getPowerSync()): Promise<string> {
  const [existingPreference] = await db
    .select({ defaultEquipmentProfileId: userPreference.defaultEquipmentProfileId })
    .from(userPreference)
    .where(eq(userPreference.id, userId));

  if (existingPreference?.defaultEquipmentProfileId) {
    const [activeRow] = await db
      .select({ id: equipmentProfile.id })
      .from(equipmentProfile)
      .where(
        and(eq(equipmentProfile.id, existingPreference.defaultEquipmentProfileId), isNull(equipmentProfile.archivedAt)),
      );
    if (activeRow) return activeRow.id;
  }

  const [existingProfile] = await db
    .select({ id: equipmentProfile.id })
    .from(equipmentProfile)
    .where(and(eq(equipmentProfile.userId, userId), isNull(equipmentProfile.archivedAt)))
    .orderBy(equipmentProfile.name, equipmentProfile.id);

  const unit = await loadWeightUnit(userId, db);

  if (existingProfile) {
    await pointDefaultProfileAt(userId, existingProfile.id, unit, db);
    return existingProfile.id;
  }

  const { barbellWeightKg, plates, dumbbells } = buildSeedInventory(unit);
  const id = generateClientId();

  await db.insert(equipmentProfile).values({
    id,
    userId,
    name: SEEDED_PROFILE_NAME,
    isDefault: true,
    barbellWeightKg,
    availablePlates: serializeEquipmentJson(plates),
    dumbbellIncrementsKg: serializeEquipmentJson(dumbbells),
    machineAvailability: serializeEquipmentJson([]),
    nativeUnit: unit,
    archivedAt: null,
  });

  await pointDefaultProfileAt(userId, id, unit, db);
  return id;
}

// Points the active-gym pointer at a caller-chosen profile directly — the write half of GYM-04's
// "switch gyms" (the read half, resolving which gym a past session used, is D-17's snapshotted
// workout_session.equipment_profile_id). Reuses pointDefaultProfileAt's own insert-or-update
// singleton write rather than a second implementation of it.
export async function setActiveEquipmentProfile(userId: string, profileId: string, db: WriteDb = getPowerSync()): Promise<void> {
  const unit = await loadWeightUnit(userId, db);
  await pointDefaultProfileAt(userId, profileId, unit, db);
}
