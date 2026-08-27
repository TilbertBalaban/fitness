import { and, eq, isNull } from 'drizzle-orm';
import {
  serializeEquipmentJson,
  parseEquipmentJson,
  toCanonicalKg,
  fromCanonicalKg,
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

function byNameThenId(a: EquipmentProfileRow, b: EquipmentProfileRow): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

// The list screen's read: every profile including archived ones (mirrors loadLibraryRoutines —
// the list is the only surface an archived gym can be restored from, so a filtered read would make
// restore unreachable). Sorted in JavaScript by name then id, matching every other total-ordering
// list in this codebase, so two gyms sharing a name still have a stable order.
export async function loadEquipmentProfiles(userId: string, db: WriteDb = getPowerSync()): Promise<EquipmentProfileRow[]> {
  const rows = await db.select().from(equipmentProfile).where(eq(equipmentProfile.userId, userId));
  return rows.map(toEquipmentProfileRow).sort(byNameThenId);
}

// Mirrors resolveLiveRoutineId's archived-wins reconciliation, with one deliberate difference: a
// program can legitimately have zero active programs, but a gym profile cannot — E1's contract
// requires exactly one gym to always read as active (D-19 guarantees at least one non-archived row
// exists). So where resolveLiveRoutineId reads a stale/archived pointer as "no active routine",
// this falls back to the first non-archived row by the total ordering (name then id) rather than
// leaving the active partition empty. Sorted on a copy here, not trusted from the caller's array
// order, so the guarantee holds regardless of what order rows arrive in — the one thing this
// function is for.
export function resolveLiveEquipmentProfileId(
  rows: EquipmentProfileRow[],
  candidateId: string | null | undefined,
): string | null {
  const target = candidateId ? rows.find((row) => row.id === candidateId) : undefined;
  if (target && target.archivedAt === null) return target.id;

  const firstLive = rows
    .filter((row) => row.archivedAt === null)
    .sort(byNameThenId)[0];
  return firstLive ? firstLive.id : null;
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

export interface CreateEquipmentProfileInput {
  userId: string;
  name: string;
  nativeUnit: WeightUnit;
  barbellWeightKg?: string | null;
  plates?: EquipmentPlate[];
  dumbbells?: EquipmentDumbbell[];
  machines?: EquipmentMachine[];
}

// The editor's create path (06-04). A new gym is never the seeded default and never archived —
// both are facts about how a row came to exist, not something a caller here gets to choose.
export async function createEquipmentProfile(input: CreateEquipmentProfileInput, db: WriteDb = getPowerSync()): Promise<string> {
  const trimmed = input.name.trim();
  if (trimmed.length === 0) {
    throw new Error('Gym name is required');
  }

  const id = generateClientId();
  await db.insert(equipmentProfile).values({
    id,
    userId: input.userId,
    name: trimmed,
    isDefault: false,
    barbellWeightKg: input.barbellWeightKg ?? null,
    availablePlates: serializeEquipmentJson(input.plates ?? []),
    dumbbellIncrementsKg: serializeEquipmentJson(input.dumbbells ?? []),
    machineAvailability: serializeEquipmentJson(input.machines ?? []),
    nativeUnit: input.nativeUnit,
    archivedAt: null,
  });

  return id;
}

export interface UpdateEquipmentProfileInput {
  name?: string;
  nativeUnit?: WeightUnit;
  barbellWeightKg?: string | null;
  plates?: EquipmentPlate[];
  dumbbells?: EquipmentDumbbell[];
  machines?: EquipmentMachine[];
}

// The editor's save path (06-04). Only the fields the caller actually supplies are written — an
// undefined field is "not part of this edit", not "clear this column" (the same partial-write
// contract updateWorkoutSession-shaped helpers elsewhere in this codebase already follow).
export async function updateEquipmentProfile(
  id: string,
  input: UpdateEquipmentProfileInput,
  db: WriteDb = getPowerSync(),
): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed.length === 0) {
      throw new Error('Gym name is required');
    }
    patch.name = trimmed;
  }
  if (input.nativeUnit !== undefined) patch.nativeUnit = input.nativeUnit;
  if (input.barbellWeightKg !== undefined) patch.barbellWeightKg = input.barbellWeightKg;
  if (input.plates !== undefined) patch.availablePlates = serializeEquipmentJson(input.plates);
  if (input.dumbbells !== undefined) patch.dumbbellIncrementsKg = serializeEquipmentJson(input.dumbbells);
  if (input.machines !== undefined) patch.machineAvailability = serializeEquipmentJson(input.machines);

  if (Object.keys(patch).length === 0) return;

  await db.update(equipmentProfile).set(patch).where(eq(equipmentProfile.id, id));
}

// A timestamp, never a delete — workout_session carries no foreign key into equipment_profile, but
// a destroyed gym would still orphan every session that snapshotted its id (D-04/D-17), the same
// reasoning archiveRoutine documents for routine. The active-pointer reconciliation is deliberately
// NOT done here: it lives entirely on the read side (resolveLiveEquipmentProfileId), one owner of
// the rule, matching what this plan's own behaviour contract specifies. What IS enforced here: E1's
// "exactly one gym always reads as active" contract requires at least one non-archived row per
// user, so archiving a user's last live row is rejected rather than silently leaving zero.
export async function archiveEquipmentProfile(id: string, db: WriteDb = getPowerSync()): Promise<void> {
  const [target] = await db
    .select({ userId: equipmentProfile.userId, archivedAt: equipmentProfile.archivedAt })
    .from(equipmentProfile)
    .where(eq(equipmentProfile.id, id));
  if (!target) return;

  if (target.archivedAt === null) {
    const liveRows = await db
      .select({ id: equipmentProfile.id })
      .from(equipmentProfile)
      .where(
        and(
          target.userId === null ? isNull(equipmentProfile.userId) : eq(equipmentProfile.userId, target.userId),
          isNull(equipmentProfile.archivedAt),
        ),
      );
    if (liveRows.length <= 1) {
      throw new Error("Can't archive your only gym");
    }
  }

  await db.update(equipmentProfile).set({ archivedAt: new Date().toISOString() }).where(eq(equipmentProfile.id, id));
}

// Restoring returns a gym to the list; it never makes it active. Activation is Set Active's own
// explicit act, matching restoreRoutine's identical rule for programs.
export async function restoreEquipmentProfile(id: string, db: WriteDb = getPowerSync()): Promise<void> {
  await db.update(equipmentProfile).set({ archivedAt: null }).where(eq(equipmentProfile.id, id));
}

// A deep copy with a fresh client id and a distinct name (source name + " copy", matching the
// program library's own duplicate-naming convention), never the seeded default, never archived. The
// inventory is reserialized rather than referenced, so editing the copy can never touch the source's
// rows.
export async function duplicateEquipmentProfile(
  userId: string,
  id: string,
  db: WriteDb = getPowerSync(),
): Promise<string> {
  const source = await loadEquipmentProfile(id, db);
  if (!source) {
    throw new Error('Gym profile not found');
  }

  const newId = generateClientId();
  await db.insert(equipmentProfile).values({
    id: newId,
    userId,
    name: `${source.name} copy`,
    isDefault: false,
    barbellWeightKg: source.barbellWeightKg,
    availablePlates: serializeEquipmentJson(source.plates),
    dumbbellIncrementsKg: serializeEquipmentJson(source.dumbbells),
    machineAvailability: serializeEquipmentJson(source.machines),
    nativeUnit: source.nativeUnit,
    archivedAt: null,
  });

  return newId;
}

export interface GymRowSubtitleInput {
  barbellWeightKg: string | null;
  plateCount: number;
  dumbbellCount: number;
  machineCount: number;
  nativeUnit: WeightUnit;
  archivedAt: string | null;
}

// The list row's own subtitle rule (unit-testable without a renderer, mirroring
// formatLibraryRowSubtitle): joins only the sections that actually have content, in the fixed
// order bar -> plates -> dumbbells -> machines. Absence is never a zero count — a gym with nothing
// configured returns an empty string, and the row renders no subtitle line at all, because every
// section is legitimately optional (E1 partial). An archived row returns the single word
// "Archived", same as Program Library's own archived rows.
export function formatGymRowSubtitle({
  barbellWeightKg,
  plateCount,
  dumbbellCount,
  machineCount,
  nativeUnit,
  archivedAt,
}: GymRowSubtitleInput): string {
  if (archivedAt !== null) return 'Archived';

  const parts: string[] = [];

  if (barbellWeightKg !== null) {
    const displayWeight = fromCanonicalKg(barbellWeightKg, nativeUnit);
    if (displayWeight !== null) parts.push(`${displayWeight}${nativeUnit} bar`);
  }
  if (plateCount > 0) parts.push(`${plateCount} plate type${plateCount === 1 ? '' : 's'}`);
  if (dumbbellCount > 0) parts.push(`${dumbbellCount} dumbbell weight${dumbbellCount === 1 ? '' : 's'}`);
  if (machineCount > 0) parts.push(`${machineCount} machine${machineCount === 1 ? '' : 's'}`);

  return parts.join(' · ');
}
