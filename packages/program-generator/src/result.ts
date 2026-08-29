import {
  MUSCLE_GROUPS,
  DELOAD_PLACEMENTS,
  EMPHASIS_LEVELS,
  EXPERIENCE_LEVELS,
  SPLIT_PREFERENCES,
  TRAINING_GOALS,
  type CycleKind,
  type DeloadPlacement,
  type EmphasisLevel,
  type EquipmentType,
  type ExperienceLevel,
  type MovementPattern,
  type MuscleGroupId,
  type MuscleRole,
  type ResolvedTarget,
  type SplitPreference,
  type TargetOverride,
  type TrainingGoal,
} from '@fitness/api-contracts';
import type { ResolvedInventory } from '@fitness/plate-math';

export interface GenerationCatalogExercise {
  id: string;
  name: string;
  equipmentRequired: EquipmentType | null;
  movementPattern: MovementPattern | null;
}

export interface GenerationCatalogMapping {
  exerciseId: string;
  muscleGroupId: MuscleGroupId;
  role: MuscleRole;
  // Decimal-as-exact-string, matching exercise_muscle_mapping's own convention — parsed with
  // Number() only inside slot-fill.ts's scoring, never compared or stored as a string.
  weightFactor: string;
}

export interface GenerationCatalog {
  exercises: GenerationCatalogExercise[];
  mappings: GenerationCatalogMapping[];
}

export interface GenerationInput {
  routineName: string;
  trainingGoal: TrainingGoal;
  experienceLevel: ExperienceLevel;
  daysPerWeek: number;
  sessionLengthMinutes: number;
  splitPreference: SplitPreference;
  emphasis: Partial<Record<MuscleGroupId, EmphasisLevel>>;
  deloadPlacement: DeloadPlacement;
  deloadEveryNCycles: number | null;
  trainingCycleCount: number;
  // D-03: threaded through candidate selection so a reroll ("give me another one") is an explicit,
  // reproducible input — never Date.now() or Math.random() inside the generator itself.
  variantSeed: number;
  catalog: GenerationCatalog;
  // null means "no gym profile chosen yet" — the equipment filter is skipped entirely. This is
  // deliberately distinct from an empty ResolvedInventory, which would filter out every
  // equipment-requiring exercise.
  inventory: ResolvedInventory | null;
  excludedExerciseIds: string[];
}

export const GENERATION_INPUT_LIMITS = {
  minDaysPerWeek: 2,
  maxDaysPerWeek: 6,
  minSessionLengthMinutes: 20,
  maxSessionLengthMinutes: 180,
  minTrainingCycleCount: 1,
  maxTrainingCycleCount: 12,
} as const;

const TRAINING_GOAL_SET = new Set<string>(TRAINING_GOALS);
const EXPERIENCE_LEVEL_SET = new Set<string>(EXPERIENCE_LEVELS);
const SPLIT_PREFERENCE_SET = new Set<string>(SPLIT_PREFERENCES);
const DELOAD_PLACEMENT_SET = new Set<string>(DELOAD_PLACEMENTS);
const EMPHASIS_LEVEL_SET = new Set<string>(EMPHASIS_LEVELS);
const MUSCLE_GROUP_SET = new Set<string>(MUSCLE_GROUPS);

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

// T-11-05: rejects the WHOLE input before any candidate-pool or slot-filling work runs — never
// partially processes a malformed GenerationInput. Every vocabulary field must be a member of its
// tuple, every numeric field must be an integer inside its declared limit, and every emphasis key
// must be a MUSCLE_GROUPS member.
export function isGenerationInput(value: unknown): value is GenerationInput {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.routineName !== 'string') return false;
  if (typeof candidate.trainingGoal !== 'string' || !TRAINING_GOAL_SET.has(candidate.trainingGoal)) return false;
  if (typeof candidate.experienceLevel !== 'string' || !EXPERIENCE_LEVEL_SET.has(candidate.experienceLevel)) return false;
  if (typeof candidate.splitPreference !== 'string' || !SPLIT_PREFERENCE_SET.has(candidate.splitPreference)) return false;
  if (typeof candidate.deloadPlacement !== 'string' || !DELOAD_PLACEMENT_SET.has(candidate.deloadPlacement)) return false;

  if (!isIntegerInRange(candidate.daysPerWeek, GENERATION_INPUT_LIMITS.minDaysPerWeek, GENERATION_INPUT_LIMITS.maxDaysPerWeek)) {
    return false;
  }
  if (
    !isIntegerInRange(
      candidate.sessionLengthMinutes,
      GENERATION_INPUT_LIMITS.minSessionLengthMinutes,
      GENERATION_INPUT_LIMITS.maxSessionLengthMinutes,
    )
  ) {
    return false;
  }
  if (
    !isIntegerInRange(
      candidate.trainingCycleCount,
      GENERATION_INPUT_LIMITS.minTrainingCycleCount,
      GENERATION_INPUT_LIMITS.maxTrainingCycleCount,
    )
  ) {
    return false;
  }
  if (typeof candidate.variantSeed !== 'number' || !Number.isFinite(candidate.variantSeed)) return false;

  if (candidate.deloadEveryNCycles !== null && !isIntegerInRange(candidate.deloadEveryNCycles, 1, Number.MAX_SAFE_INTEGER)) {
    return false;
  }

  if (typeof candidate.emphasis !== 'object' || candidate.emphasis === null) return false;
  for (const [muscleGroupId, level] of Object.entries(candidate.emphasis as Record<string, unknown>)) {
    if (!MUSCLE_GROUP_SET.has(muscleGroupId)) return false;
    if (typeof level !== 'string' || !EMPHASIS_LEVEL_SET.has(level)) return false;
  }

  if (typeof candidate.catalog !== 'object' || candidate.catalog === null) return false;
  const catalog = candidate.catalog as Record<string, unknown>;
  if (!Array.isArray(catalog.exercises) || !Array.isArray(catalog.mappings)) return false;

  if (!Array.isArray(candidate.excludedExerciseIds)) return false;
  if (!candidate.excludedExerciseIds.every((id) => typeof id === 'string')) return false;

  return true;
}

export interface GeneratedSlot {
  // Generator-local identity, never persisted — materializeGeneratedProgram assigns the real id.
  key: string;
  exerciseId: string;
  orderIndex: number;
  base: ResolvedTarget;
  overridesByCycleKey: Record<string, TargetOverride>;
}

export interface GeneratedDay {
  key: string;
  name: string;
  orderIndex: number;
  isRestDay: boolean;
  slots: GeneratedSlot[];
}

export interface GeneratedCycle {
  key: string;
  name: string;
  kind: CycleKind;
  orderIndex: number;
  durationDays: number | null;
}

export const DEGRADATION_KINDS = ['slot_unfillable', 'day_trimmed', 'split_unsupported', 'group_below_minimum'] as const;
export type DegradationKind = (typeof DEGRADATION_KINDS)[number];

// D-21: a first-class part of the generator's return value, surfaced to the user before the
// program is saved — never a log line. Not every field applies to every kind; a kind names which
// fields it populates in degradation.ts's own documentation.
export interface DegradationEntry {
  kind: DegradationKind;
  dayKey: string | null;
  muscleGroupId: MuscleGroupId | null;
  detail: string;
}

export interface GeneratedProgramTree {
  name: string;
  goal: string | null;
  cycles: GeneratedCycle[];
  days: GeneratedDay[];
  degradations: DegradationEntry[];
}
