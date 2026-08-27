import {
  EQUIPMENT_PROFILE_LIMITS,
  WEIGHT_UNITS,
  fromCanonicalKg,
  isExactDecimalString,
  toCanonicalKg,
  type EquipmentDumbbell,
  type EquipmentMachine,
  type EquipmentPlate,
  type EquipmentType,
  type WeightUnit,
} from '@fitness/api-contracts';
import { generateClientId } from '../db/id';
import type { EquipmentProfileRow } from '../db/equipment-profiles';

// The editor's whole logic layer: pure, synchronous, no database handle and no React import
// (mirrors apps/mobile/lib/catalog/custom-exercise.ts sitting behind the custom-exercise form).
// Every list below holds display-unit strings — the value the user actually typed, at
// draft.nativeUnit — and only toEquipmentProfileDraft/draftFromProfile cross the canonical-kg
// boundary (D-03's one conversion boundary).

export interface GymProfilePlateDraft {
  weight: string;
  pairCount: number;
}

export interface GymProfileDumbbellDraft {
  weight: string;
}

export interface GymProfileMachineDraft {
  id: string;
  name: string;
  equipmentType: EquipmentType;
  available: boolean;
  stackMin: string;
  stackMax: string;
  stackIncrement: string;
  baseResistance: string;
}

export interface GymProfileDraft {
  name: string;
  nativeUnit: WeightUnit;
  barWeight: string;
  plates: GymProfilePlateDraft[];
  dumbbells: GymProfileDumbbellDraft[];
  machines: GymProfileMachineDraft[];
}

export interface BarPreset {
  id: 'standard' | 'womens' | 'ez_curl' | 'custom';
  label: string;
  // Canonical kg, null for the custom preset (which reveals the field for manual entry instead
  // of writing a known value into it).
  weightKg: string | null;
}

// Known weights routed through toCanonicalKg rather than hardcoded literals, so a preset's stored
// value is produced by the same exact-fraction path every other canonical kg value in this module
// goes through — never a second, independently-typed source of truth for "what is 20kg".
export const BAR_PRESETS: readonly BarPreset[] = [
  { id: 'standard', label: 'Standard', weightKg: toCanonicalKg('20', 'kg') },
  { id: 'womens', label: "Women's", weightKg: toCanonicalKg('15', 'kg') },
  { id: 'ez_curl', label: 'EZ Curl', weightKg: toCanonicalKg('10', 'kg') },
  { id: 'custom', label: 'Custom', weightKg: null },
];

export function emptyGymProfileDraft(unit: WeightUnit): GymProfileDraft {
  return {
    name: '',
    nativeUnit: unit,
    barWeight: '',
    plates: [],
    dumbbells: [],
    machines: [],
  };
}

function displayOrEmpty(canonicalKg: string | null, unit: WeightUnit): string {
  if (canonicalKg === null) return '';
  return fromCanonicalKg(canonicalKg, unit) ?? '';
}

// Converts a stored profile's canonical-kg values into display-unit strings at the profile's own
// unit — the editor's pre-fill for both the create-from-duplicate case and the edit route.
export function draftFromProfile(row: EquipmentProfileRow): GymProfileDraft {
  const unit = row.nativeUnit;
  return {
    name: row.name,
    nativeUnit: unit,
    barWeight: displayOrEmpty(row.barbellWeightKg, unit),
    plates: row.plates.map((plate) => ({
      weight: displayOrEmpty(plate.weightKg, unit),
      pairCount: plate.pairCount,
    })),
    dumbbells: row.dumbbells.map((dumbbell) => ({
      weight: displayOrEmpty(dumbbell.weightKg, unit),
    })),
    machines: row.machines.map((machine) => ({
      id: machine.id,
      name: machine.name,
      equipmentType: machine.equipmentType,
      available: machine.available,
      stackMin: displayOrEmpty(machine.stackMinKg, unit),
      stackMax: displayOrEmpty(machine.stackMaxKg, unit),
      stackIncrement: displayOrEmpty(machine.stackIncrementKg, unit),
      baseResistance: displayOrEmpty(machine.baseResistanceKg, unit),
    })),
  };
}

// Reinterprets nothing already entered: every value is round-tripped through its held canonical
// kg value (toCanonicalKg at the old unit, fromCanonicalKg at the new one) rather than reparsed at
// face value in the new unit, so switching kg<->lb changes only how a weight is displayed, never
// what it is.
function convertDisplayValue(value: string, fromUnit: WeightUnit, toUnit: WeightUnit): string {
  if (!isExactDecimalString(value)) return value;
  const canonical = toCanonicalKg(value, fromUnit);
  if (canonical === null) return value;
  return fromCanonicalKg(canonical, toUnit) ?? value;
}

export function setDraftUnit(draft: GymProfileDraft, unit: WeightUnit): GymProfileDraft {
  if (unit === draft.nativeUnit) return draft;
  const fromUnit = draft.nativeUnit;

  return {
    ...draft,
    nativeUnit: unit,
    barWeight: convertDisplayValue(draft.barWeight, fromUnit, unit),
    plates: draft.plates.map((plate) => ({ ...plate, weight: convertDisplayValue(plate.weight, fromUnit, unit) })),
    dumbbells: draft.dumbbells.map((dumbbell) => ({
      ...dumbbell,
      weight: convertDisplayValue(dumbbell.weight, fromUnit, unit),
    })),
    machines: draft.machines.map((machine) => ({
      ...machine,
      stackMin: convertDisplayValue(machine.stackMin, fromUnit, unit),
      stackMax: convertDisplayValue(machine.stackMax, fromUnit, unit),
      stackIncrement: convertDisplayValue(machine.stackIncrement, fromUnit, unit),
      baseResistance: convertDisplayValue(machine.baseResistance, fromUnit, unit),
    })),
  };
}

// Denominations are keyed by their canonical value, not their typed string, so entering the same
// weight twice in different notation (e.g. "2.5" and "2.50") merges into the existing row rather
// than producing a second one the solver would then have to order arbitrarily.
function canonicalOf(value: string, unit: WeightUnit): string | null {
  if (!isExactDecimalString(value)) return null;
  return toCanonicalKg(value, unit);
}

export function upsertPlateDenomination(draft: GymProfileDraft, weight: string): GymProfileDraft {
  const canonical = canonicalOf(weight, draft.nativeUnit);
  if (canonical === null) return draft;

  const alreadyPresent = draft.plates.some((plate) => canonicalOf(plate.weight, draft.nativeUnit) === canonical);
  if (alreadyPresent) return draft;

  return { ...draft, plates: [...draft.plates, { weight, pairCount: 1 }] };
}

export function removePlateDenomination(draft: GymProfileDraft, weight: string): GymProfileDraft {
  const canonical = canonicalOf(weight, draft.nativeUnit);
  return {
    ...draft,
    plates: draft.plates.filter((plate) => canonicalOf(plate.weight, draft.nativeUnit) !== canonical),
  };
}

export function setPlatePairCount(draft: GymProfileDraft, weight: string, next: number): GymProfileDraft {
  if (!Number.isInteger(next)) return draft;
  const clamped = next < 0 ? 0 : next;
  const canonical = canonicalOf(weight, draft.nativeUnit);

  return {
    ...draft,
    plates: draft.plates.map((plate) =>
      canonicalOf(plate.weight, draft.nativeUnit) === canonical ? { ...plate, pairCount: clamped } : plate,
    ),
  };
}

export function upsertDumbbellWeight(draft: GymProfileDraft, weight: string): GymProfileDraft {
  const canonical = canonicalOf(weight, draft.nativeUnit);
  if (canonical === null) return draft;

  const alreadyPresent = draft.dumbbells.some((dumbbell) => canonicalOf(dumbbell.weight, draft.nativeUnit) === canonical);
  if (alreadyPresent) return draft;

  return { ...draft, dumbbells: [...draft.dumbbells, { weight }] };
}

export function removeDumbbellWeight(draft: GymProfileDraft, weight: string): GymProfileDraft {
  const canonical = canonicalOf(weight, draft.nativeUnit);
  return {
    ...draft,
    dumbbells: draft.dumbbells.filter((dumbbell) => canonicalOf(dumbbell.weight, draft.nativeUnit) !== canonical),
  };
}

export function upsertMachine(draft: GymProfileDraft): GymProfileDraft {
  const machine: GymProfileMachineDraft = {
    id: generateClientId(),
    name: '',
    equipmentType: 'machine',
    available: true,
    stackMin: '',
    stackMax: '',
    stackIncrement: '',
    baseResistance: '',
  };
  return { ...draft, machines: [...draft.machines, machine] };
}

export function updateMachine(
  draft: GymProfileDraft,
  id: string,
  patch: Partial<Omit<GymProfileMachineDraft, 'id'>>,
): GymProfileDraft {
  return {
    ...draft,
    machines: draft.machines.map((machine) => (machine.id === id ? { ...machine, ...patch } : machine)),
  };
}

export function removeMachine(draft: GymProfileDraft, id: string): GymProfileDraft {
  return { ...draft, machines: draft.machines.filter((machine) => machine.id !== id) };
}

export interface GymProfileSaveability {
  saveable: boolean;
  nameError: string | null;
}

const NAME_REQUIRED_ERROR = 'Gym name is required.';

// A boolean gate on the Save control, not an error map — this app's forms have no inline
// field-level error UI (R5), except the name, which follows the existing single-field-error
// convention (validateCustomExercise's own errors.name shape).
export function isGymProfileSaveable(draft: GymProfileDraft): GymProfileSaveability {
  const name = draft.name.trim();
  const nameError = name.length === 0 ? NAME_REQUIRED_ERROR : null;

  const withinLimits =
    (WEIGHT_UNITS as readonly string[]).includes(draft.nativeUnit) &&
    draft.plates.length <= EQUIPMENT_PROFILE_LIMITS.maxPlateDenominations &&
    draft.dumbbells.length <= EQUIPMENT_PROFILE_LIMITS.maxDumbbellWeights &&
    draft.machines.length <= EQUIPMENT_PROFILE_LIMITS.maxMachines &&
    draft.machines.every((machine) => machine.name.length <= EQUIPMENT_PROFILE_LIMITS.maxNameLength);

  return {
    saveable: nameError === null && withinLimits,
    nameError,
  };
}

export interface EquipmentProfileDraftOutput {
  name: string;
  nativeUnit: WeightUnit;
  barbellWeightKg: string | null;
  plates: EquipmentPlate[];
  dumbbells: EquipmentDumbbell[];
  machines: EquipmentMachine[];
}

// Exact-fraction comparison of two canonical kg strings (both always CANONICAL_KG_SCALE=3, per
// toCanonicalKg's own output format) — a BigInt comparison on the string's digits, never a
// parseFloat/Number() on the decimal value itself (T-06-10's own contract, extended to sorting).
function compareCanonicalKg(a: string, b: string): number {
  const toScaledBigInt = (value: string): bigint => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
  };
  const diff = toScaledBigInt(a) - toScaledBigInt(b);
  if (diff > 0n) return 1;
  if (diff < 0n) return -1;
  return 0;
}

function toCanonicalOrThrow(value: string, unit: WeightUnit): string {
  const canonical = toCanonicalKg(value, unit);
  if (canonical === null) {
    throw new Error(`Weight must be a non-negative decimal number, got "${value}"`);
  }
  return canonical;
}

// The editor's save path: drops plate rows whose pair count is zero and machine rows whose name
// is blank, so an abandoned add never persists as an unnamed/uncounted entry. Emits the plate
// list sorted descending and the dumbbell list sorted ascending, so what the solver later reads
// is already in the order resolveInventory guarantees and the two can never disagree.
export function toEquipmentProfileDraft(draft: GymProfileDraft): EquipmentProfileDraftOutput {
  const unit = draft.nativeUnit;

  const plates: EquipmentPlate[] = draft.plates
    .filter((plate) => plate.pairCount > 0)
    .map((plate) => ({ weightKg: toCanonicalOrThrow(plate.weight, unit), pairCount: plate.pairCount }))
    .sort((a, b) => compareCanonicalKg(b.weightKg, a.weightKg));

  const dumbbells: EquipmentDumbbell[] = draft.dumbbells
    .map((dumbbell) => ({ weightKg: toCanonicalOrThrow(dumbbell.weight, unit) }))
    .sort((a, b) => compareCanonicalKg(a.weightKg, b.weightKg));

  const machines: EquipmentMachine[] = draft.machines
    .filter((machine) => machine.name.trim().length > 0)
    .map((machine) => ({
      id: machine.id,
      name: machine.name.trim(),
      equipmentType: machine.equipmentType,
      available: machine.available,
      stackMinKg: machine.stackMin.trim() !== '' ? toCanonicalOrThrow(machine.stackMin, unit) : null,
      stackMaxKg: machine.stackMax.trim() !== '' ? toCanonicalOrThrow(machine.stackMax, unit) : null,
      stackIncrementKg: machine.stackIncrement.trim() !== '' ? toCanonicalOrThrow(machine.stackIncrement, unit) : null,
      baseResistanceKg: machine.baseResistance.trim() !== '' ? toCanonicalOrThrow(machine.baseResistance, unit) : null,
    }));

  return {
    name: draft.name.trim(),
    nativeUnit: unit,
    barbellWeightKg: draft.barWeight.trim() !== '' ? toCanonicalOrThrow(draft.barWeight, unit) : null,
    plates,
    dumbbells,
    machines,
  };
}
