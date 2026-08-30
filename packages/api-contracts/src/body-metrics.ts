import { fromCanonicalCm, fromCanonicalKg, toCanonicalCm, toCanonicalKg, type LengthUnit, type WeightUnit } from './units';

// Additive-only from this commit forward — every client build in the field reads this tuple back
// through its declared order and membership (D-06). Append only; never insert, never reorder,
// never remove a member once a row of that kind can exist on a device.

export const BODY_METRIC_KINDS = [
  'bodyweight',
  'neck',
  'shoulders',
  'chest',
  'left_bicep',
  'right_bicep',
  'left_forearm',
  'right_forearm',
  'waist',
  'hips',
  'left_thigh',
  'right_thigh',
  'left_calf',
  'right_calf',
  'body_fat_percent',
] as const;
export type BodyMetricKind = (typeof BODY_METRIC_KINDS)[number];
export const BODY_METRIC_KIND_SET: ReadonlySet<string> = new Set(BODY_METRIC_KINDS);

// Kept as a separate tuple from BODY_METRIC_KINDS, even though the values are identical today, so
// a future kind can be appended to the wire vocabulary above without disturbing where it renders
// (R32/12-UI-SPEC.md).
export const BODY_METRIC_KIND_ORDER = [
  'bodyweight',
  'neck',
  'shoulders',
  'chest',
  'left_bicep',
  'right_bicep',
  'left_forearm',
  'right_forearm',
  'waist',
  'hips',
  'left_thigh',
  'right_thigh',
  'left_calf',
  'right_calf',
  'body_fat_percent',
] as const;

export const BODY_METRIC_KIND_LABELS: Record<BodyMetricKind, string> = {
  bodyweight: 'Weight',
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  left_bicep: 'Left Bicep',
  right_bicep: 'Right Bicep',
  left_forearm: 'Left Forearm',
  right_forearm: 'Right Forearm',
  waist: 'Waist',
  hips: 'Hips',
  left_thigh: 'Left Thigh',
  right_thigh: 'Right Thigh',
  left_calf: 'Left Calf',
  right_calf: 'Right Calf',
  body_fat_percent: 'Body Fat %',
};

export const BODY_METRIC_CANONICAL_UNITS = ['kg', 'cm', 'percent'] as const;
export type BodyMetricCanonicalUnit = (typeof BODY_METRIC_CANONICAL_UNITS)[number];

// Every kind resolves to exactly one canonical storage unit (D-08) — bodyweight is the sole mass
// kind, body_fat_percent is the sole percentage kind, and the remaining thirteen are circumference
// kinds stored in centimetres. Display conversion happens at the single existing units.ts boundary,
// never here.
export const BODY_METRIC_CANONICAL_UNIT: Record<BodyMetricKind, BodyMetricCanonicalUnit> = {
  bodyweight: 'kg',
  neck: 'cm',
  shoulders: 'cm',
  chest: 'cm',
  left_bicep: 'cm',
  right_bicep: 'cm',
  left_forearm: 'cm',
  right_forearm: 'cm',
  waist: 'cm',
  hips: 'cm',
  left_thigh: 'cm',
  right_thigh: 'cm',
  left_calf: 'cm',
  right_calf: 'cm',
  body_fat_percent: 'percent',
};

export type BodyMetricDisplayUnit = WeightUnit | LengthUnit | 'percent';

// D-08's whole "one toggle, not two" rule, and the only place this mapping exists: `weight_unit`
// drives BOTH the mass and the length display, so a user can never see kilograms alongside inches.
// kg maps straight through to the user's own preference; cm maps to cm under a kg preference and
// to in under an lb preference; percent is unaffected by either.
export function resolveDisplayUnit(kind: BodyMetricKind, weightUnit: WeightUnit): BodyMetricDisplayUnit {
  const canonicalUnit = BODY_METRIC_CANONICAL_UNIT[kind];
  if (canonicalUnit === 'kg') return weightUnit;
  if (canonicalUnit === 'percent') return 'percent';
  return weightUnit === 'lb' ? 'in' : 'cm';
}

// Dispatches to the kg or cm converter (or passes a percentage through unchanged) so no call site
// ever has to branch on BODY_METRIC_CANONICAL_UNIT itself.
export function toCanonicalValue(kind: BodyMetricKind, displayValue: string | null, weightUnit: WeightUnit): string | null {
  const canonicalUnit = BODY_METRIC_CANONICAL_UNIT[kind];
  if (canonicalUnit === 'kg') return toCanonicalKg(displayValue, weightUnit);
  if (canonicalUnit === 'percent') return displayValue === null || displayValue.trim() === '' ? null : displayValue;
  return toCanonicalCm(displayValue, resolveDisplayUnit(kind, weightUnit) as LengthUnit);
}

export function fromCanonicalValue(kind: BodyMetricKind, canonicalValue: string | null, weightUnit: WeightUnit): string | null {
  const canonicalUnit = BODY_METRIC_CANONICAL_UNIT[kind];
  if (canonicalUnit === 'kg') return fromCanonicalKg(canonicalValue, weightUnit);
  if (canonicalUnit === 'percent') return canonicalValue === null || canonicalValue.trim() === '' ? null : canonicalValue;
  return fromCanonicalCm(canonicalValue, resolveDisplayUnit(kind, weightUnit) as LengthUnit);
}
