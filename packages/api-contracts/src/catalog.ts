// Additive-only from this commit forward — every client build in the field reads these tuples
// back through their declared order and membership. Append only; never insert, never reorder.

export const LOAD_TYPES = [
  'external_weight',
  'bodyweight',
  'bodyweight_plus_added',
  'assisted',
  'time_based',
  'distance_based',
] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

// 19 ids — resolves RESEARCH.md Open Question 2 (ARCHITECTURE.md §1 calls its own list "fixed
// 15-group" while enumerating 16). abductors/adductors/neck are additions beyond
// ARCHITECTURE.md's enumeration, added so free-exercise-db's values for those muscles have a
// home instead of being silently dropped.
export const MUSCLE_GROUPS = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back_traps',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'abductors',
  'neck',
] as const;
export type MuscleGroupId = (typeof MUSCLE_GROUPS)[number];

export type BodyRegion = 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'legs';

export const MUSCLE_GROUP_BODY_REGION: Record<MuscleGroupId, BodyRegion> = {
  chest: 'chest',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  lats: 'back',
  upper_back_traps: 'back',
  lower_back: 'back',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  abs: 'core',
  obliques: 'core',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  neck: 'back',
};

export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'rotation',
  'isolation',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

// No Postgres CHECK on this one, unlike load_type — nullable, and Phases 6/7 are expected to
// extend it, so keeping enforcement in the contract package plus the sync validator leaves this
// additive without a migration (RESEARCH.md Open Question 3).
export const EQUIPMENT_TYPES = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'bodyweight',
  'band',
  'ez_bar',
  'medicine_ball',
  'exercise_ball',
  'foam_roller',
  'other',
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const MUSCLE_ROLES = ['primary', 'secondary'] as const;
export type MuscleRole = (typeof MUSCLE_ROLES)[number];

export interface CatalogSnapshotMuscleGroup {
  id: MuscleGroupId;
  name: string;
  body_region: BodyRegion;
}

export interface CatalogSnapshotMapping {
  exercise_id: string;
  muscle_group_id: MuscleGroupId;
  role: MuscleRole;
  // Decimal-as-exact-string, matching the mobile schema convention (weight_kg follows the
  // same rule) — a real column would reintroduce the binary float D-04 was chosen to avoid.
  weight_factor: string;
}

export interface CatalogSnapshotExercise {
  id: string;
  name: string;
  aliases: string[] | null;
  movement_pattern: MovementPattern | null;
  equipment_required: EquipmentType | null;
  load_type: LoadType;
  unilateral: boolean;
  instructions_text: string | null;
  cue_text: string | null;
  image_urls: string[];
  bodyweight_contribution_pct: string | null;
  variation_of_id: string | null;
  source: string;
}

export interface CatalogSnapshot {
  catalog_version: string;
  generated_at: string;
  muscle_groups: CatalogSnapshotMuscleGroup[];
  exercises: CatalogSnapshotExercise[];
  mappings: CatalogSnapshotMapping[];
}

const LOAD_TYPE_SET = new Set<string>(LOAD_TYPES);

// The validation gate T-03-08 relies on: runs before loadCatalogSnapshot opens its transaction,
// so a shape failure never produces a partial catalog write.
export function isCatalogSnapshot(value: unknown): value is CatalogSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.catalog_version !== 'string' || candidate.catalog_version.length === 0) {
    return false;
  }
  if (!Array.isArray(candidate.muscle_groups)) return false;
  if (!Array.isArray(candidate.exercises)) return false;
  if (!Array.isArray(candidate.mappings)) return false;

  for (const exerciseCandidate of candidate.exercises) {
    if (typeof exerciseCandidate !== 'object' || exerciseCandidate === null) return false;
    const loadType = (exerciseCandidate as Record<string, unknown>).load_type;
    if (typeof loadType !== 'string' || !LOAD_TYPE_SET.has(loadType)) return false;
  }

  return true;
}

export const CATALOG_VERSION_PATH = '/v1/catalog/version' as const;
export const CATALOG_DOWNLOAD_PATH = '/v1/catalog/download' as const;
