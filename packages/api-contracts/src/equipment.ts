import { EQUIPMENT_TYPES, type EquipmentType } from './catalog';

// Fail-closed bounds (T-06-02) — every type-guard below rejects an array past these lengths
// rather than truncating, mirroring isCatalogSnapshot's own gate.
const BASE_EQUIPMENT_PROFILE_LIMITS = {
  maxPlateDenominations: 24,
  maxDumbbellWeights: 60,
  maxMachines: 60,
  maxNameLength: 80,
} as const;

export const EQUIPMENT_PROFILE_LIMITS = {
  ...BASE_EQUIPMENT_PROFILE_LIMITS,
  // One ref per possible machine, one per dumbbell weight, plus one per equipment_type — the
  // union of every distinct thing a session can mark unavailable.
  maxUnavailableEquipmentRefs:
    BASE_EQUIPMENT_PROFILE_LIMITS.maxMachines + BASE_EQUIPMENT_PROFILE_LIMITS.maxDumbbellWeights + EQUIPMENT_TYPES.length,
} as const;

export interface EquipmentPlate {
  weightKg: string;
  pairCount: number;
}

export interface EquipmentDumbbell {
  weightKg: string;
}

export interface EquipmentMachine {
  id: string;
  name: string;
  equipmentType: EquipmentType;
  available: boolean;
  stackMinKg: string | null;
  stackMaxKg: string | null;
  stackIncrementKg: string | null;
  baseResistanceKg: string | null;
}

export type UnavailableEquipmentRef =
  | { kind: 'equipment_type'; equipmentType: EquipmentType }
  | { kind: 'machine'; machineId: string }
  | { kind: 'dumbbell'; weightKg: string };

const EXACT_DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

// The same decimal contract parseDecimalToFraction (units.ts) enforces, applied here as a
// standalone guard so a `number` is rejected outright rather than silently coerced (D-03, T-06-03).
export function isExactDecimalString(value: unknown): value is string {
  return typeof value === 'string' && EXACT_DECIMAL_PATTERN.test(value);
}

function isNullableExactDecimalString(value: unknown): value is string | null {
  return value === null || isExactDecimalString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const EQUIPMENT_TYPE_SET = new Set<string>(EQUIPMENT_TYPES);

export function isEquipmentProfilePlates(value: unknown): value is EquipmentPlate[] {
  if (!Array.isArray(value)) return false;
  if (value.length > EQUIPMENT_PROFILE_LIMITS.maxPlateDenominations) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const candidate = entry as Record<string, unknown>;
    return isExactDecimalString(candidate.weightKg) && isNonNegativeInteger(candidate.pairCount);
  });
}

export function isEquipmentDumbbellIncrements(value: unknown): value is EquipmentDumbbell[] {
  if (!Array.isArray(value)) return false;
  if (value.length > EQUIPMENT_PROFILE_LIMITS.maxDumbbellWeights) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    return isExactDecimalString((entry as Record<string, unknown>).weightKg);
  });
}

export function isEquipmentMachineAvailability(value: unknown): value is EquipmentMachine[] {
  if (!Array.isArray(value)) return false;
  if (value.length > EQUIPMENT_PROFILE_LIMITS.maxMachines) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const candidate = entry as Record<string, unknown>;
    return (
      typeof candidate.id === 'string' &&
      candidate.id.length > 0 &&
      typeof candidate.name === 'string' &&
      candidate.name.length > 0 &&
      candidate.name.length <= EQUIPMENT_PROFILE_LIMITS.maxNameLength &&
      typeof candidate.equipmentType === 'string' &&
      EQUIPMENT_TYPE_SET.has(candidate.equipmentType) &&
      typeof candidate.available === 'boolean' &&
      isNullableExactDecimalString(candidate.stackMinKg) &&
      isNullableExactDecimalString(candidate.stackMaxKg) &&
      isNullableExactDecimalString(candidate.stackIncrementKg) &&
      isNullableExactDecimalString(candidate.baseResistanceKg)
    );
  });
}

export function isUnavailableEquipmentRefs(value: unknown): value is UnavailableEquipmentRef[] {
  if (!Array.isArray(value)) return false;
  if (value.length > EQUIPMENT_PROFILE_LIMITS.maxUnavailableEquipmentRefs) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const candidate = entry as Record<string, unknown>;
    if (candidate.kind === 'equipment_type') {
      return typeof candidate.equipmentType === 'string' && EQUIPMENT_TYPE_SET.has(candidate.equipmentType);
    }
    if (candidate.kind === 'machine') {
      return typeof candidate.machineId === 'string' && candidate.machineId.length > 0;
    }
    if (candidate.kind === 'dumbbell') {
      return isExactDecimalString(candidate.weightKg);
    }
    return false;
  });
}

// The single serialize/deserialize pair for the three equipment_profile JSON columns (D-16):
// Postgres stores them as real jsonb (the pg driver hands back an already-parsed JS value),
// while the SQLite mirror stores them as text (a raw string) — every read and write on both
// sides routes through this pair rather than an inline JSON.parse/JSON.stringify at a call site.
export function serializeEquipmentJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

export function parseEquipmentJson(raw: unknown): unknown {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw;
}
