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
