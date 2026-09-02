import {
  resolveTarget,
  type EquipmentType,
  type MovementPattern,
  type MuscleGroupId,
  type TrainingGoal,
} from '@fitness/api-contracts';
import { resolveInventory, type EquipmentProfileLike } from '@fitness/plate-math';
import type { ExerciseSessionSets, LoggedSetInput, RecommendInput } from '@fitness/progression-engine';
import { generateProgram } from '../generate';
import { SPLIT_TEMPLATES } from '../split-templates';
import type { GenerationCatalog, GenerationInput } from '../result';

// GEN-07: the single input table three separate jest processes import and run —
// packages/program-generator/src/__tests__/parity.test.ts, apps/api/src/generation/__tests__
// /parity.spec.ts and apps/mobile/lib/db/__tests__/generation-parity.test.ts. Data only: no
// describe/it/expect, no import from any test framework, so all three (plain ts-jest here,
// jest-expo on mobile, ts-jest again but a different tsconfig on api) can consume the identical
// object rather than each maintaining their own copy of it.
//
// The proof is deliberately NOT a diff of the two program trees. Two trees can differ in shape and
// still progress identically, and two trees can match in shape while progressing differently — the
// only thing GEN-07 actually claims is that the progression engine cannot tell them apart. So each
// case carries two prescriptions and the runners route both through recommendNextPrescription.
export interface GenerationParityCase {
  name: string;
  // The ROADMAP/REQUIREMENTS clause this case pins — a failing case reports what broke, not just
  // an array index.
  requirement: string;
  trainingGoal: TrainingGoal;
  sessions: ExerciseSessionSets[];
  equipmentType: RecommendInput['equipmentType'];
  inventory: RecommendInput['inventory'];
  preference: RecommendInput['preference'];
  // What a user would have typed into the builder for this intent.
  handBuiltPrescription: RecommendInput['prescription'];
  // What the real generator produced for the same intent, resolved for a named cycle.
  generatedPrescription: RecommendInput['prescription'];
}

function inventoryFrom(overrides: Partial<EquipmentProfileLike> = {}) {
  return resolveInventory({
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [{ weightKg: '10.000', pairCount: 4 }],
    dumbbells: [],
    machines: [],
    ...overrides,
  });
}

function loggedSet(overrides: Partial<LoggedSetInput> = {}): LoggedSetInput {
  return {
    id: 's1',
    parentSetId: null,
    setType: 'normal',
    weightKg: '100.000',
    reps: 8,
    rir: 2,
    side: null,
    completed: true,
    ...overrides,
  };
}

function sessionsWith(sets: LoggedSetInput[], sessionId = 'sess-1'): ExerciseSessionSets[] {
  return [{ sessionId, sets }];
}

// Pitfall 1: a single exercise per muscle group starves D-02's second-exercise-absorption path.
// At least three distinct exercises per muscle group the full-body templates name, cycled through
// a deterministic equipment/movement-pattern spread (keeping at least one null of each so those
// paths stay covered too), so every slot fills and the generated half of every case is a real
// generator output — with real candidates for the split to choose among — rather than a degraded
// or starved one.
const CATALOG_EQUIPMENT_CYCLE: readonly (EquipmentType | null)[] = ['barbell', null, 'dumbbell'];
const CATALOG_MOVEMENT_CYCLE: readonly (MovementPattern | null)[] = ['horizontal_push', null, 'isolation'];
const CATALOG_EXERCISES_PER_GROUP = 3;

function catalogCovering(muscleGroupIds: readonly MuscleGroupId[]): GenerationCatalog {
  const exercises: GenerationCatalog['exercises'] = [];
  const mappings: GenerationCatalog['mappings'] = [];

  for (const groupId of muscleGroupIds) {
    for (let index = 0; index < CATALOG_EXERCISES_PER_GROUP; index += 1) {
      const id = `ex-${groupId}-${index}`;
      exercises.push({
        id,
        name: `Exercise for ${groupId} ${index}`,
        equipmentRequired: CATALOG_EQUIPMENT_CYCLE[index % CATALOG_EQUIPMENT_CYCLE.length] ?? null,
        movementPattern: CATALOG_MOVEMENT_CYCLE[index % CATALOG_MOVEMENT_CYCLE.length] ?? null,
      });
      mappings.push({
        exerciseId: id,
        muscleGroupId: groupId,
        role: 'primary' as const,
        weightFactor: '1.000',
      });
    }
  }

  return { exercises, mappings };
}

function fullBodyMuscleGroups(): MuscleGroupId[] {
  const template = SPLIT_TEMPLATES.full_body[3]!;
  const groups = new Set<MuscleGroupId>();
  for (const dayPattern of template.dayPatterns) {
    for (const slot of dayPattern.slots) groups.add(slot.muscleGroupId);
  }
  return [...groups];
}

function generationInput(trainingGoal: TrainingGoal, overrides: Partial<GenerationInput> = {}): GenerationInput {
  const groups = fullBodyMuscleGroups();
  return {
    routineName: `${trainingGoal} parity`,
    trainingGoal,
    experienceLevel: 'intermediate',
    daysPerWeek: 3,
    sessionLengthMinutes: 180,
    splitPreference: 'full_body',
    emphasis: {},
    deloadPlacement: 'none',
    deloadEveryNCycles: null,
    trainingCycleCount: 4,
    variantSeed: 1,
    catalog: catalogCovering(groups),
    inventory: null,
    excludedExerciseIds: [],
    ...overrides,
  };
}

// The generated half of a case: run the real generator, take the first slot of the first day, and
// resolve it for the named cycle exactly the way the preview and the builder do. Hand-writing the
// numbers the generator is expected to produce would make the case assert nothing.
function generatedPrescriptionFor(
  trainingGoal: TrainingGoal,
  cycleIndex: number,
  overrides: Partial<GenerationInput> = {},
): RecommendInput['prescription'] {
  const tree = generateProgram(generationInput(trainingGoal, overrides));
  const slot = tree.days[0].slots[0];
  const cycle = tree.cycles[cycleIndex];
  const resolved = resolveTarget(slot.base, slot.overridesByCycleKey[cycle.key]);
  return {
    targetRepMin: resolved.targetRepMin,
    targetRepMax: resolved.targetRepMax,
    targetRir: resolved.targetRir,
  };
}

// The same projection, applied to the base row with no override at all — the inherit-from-base
// path, distinct from a cycle that happens to carry an empty override.
function generatedBasePrescription(trainingGoal: TrainingGoal): RecommendInput['prescription'] {
  const tree = generateProgram(generationInput(trainingGoal));
  const resolved = resolveTarget(tree.days[0].slots[0].base, undefined);
  return {
    targetRepMin: resolved.targetRepMin,
    targetRepMax: resolved.targetRepMax,
    targetRir: resolved.targetRir,
  };
}

const DELOAD_OVERRIDES: Partial<GenerationInput> = {
  deloadPlacement: 'final_cycle_only',
};

function deloadCycleIndex(): number {
  const tree = generateProgram(generationInput('hypertrophy', DELOAD_OVERRIDES));
  return tree.cycles.findIndex((cycle) => cycle.kind === 'deload');
}

// Written out, never derived from the generator. Deriving both halves from generateProgram would
// make every case assert `x === x` — the equality would hold no matter what the generator did. These
// are the three numbers a user would type into the builder for the same intent: the goal's rep band,
// and the RIR the cycle in question calls for.
function handBuilt(targetRepMin: number, targetRepMax: number, targetRir: number): RecommendInput['prescription'] {
  return { targetRepMin, targetRepMax, targetRir };
}

export const GENERATION_PARITY_FIXTURES: GenerationParityCase[] = [
  {
    name: 'a hypertrophy base-cycle prescription progresses identically whether generated or hand-built',
    requirement: 'GEN-07',
    trainingGoal: 'hypertrophy',
    sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 12, rir: 3 })]),
    equipmentType: 'barbell',
    inventory: inventoryFrom(),
    preference: 'widen_rep_range_first',
    handBuiltPrescription: handBuilt(8, 12, 2),
    generatedPrescription: generatedPrescriptionFor('hypertrophy', 0),
  },
  {
    name: 'a strength prescription progresses identically, so the rep band is not fixed to hypertrophy',
    requirement: 'GEN-07',
    trainingGoal: 'strength',
    sessions: sessionsWith([loggedSet({ weightKg: '120.000', reps: 6, rir: 2 })]),
    equipmentType: 'barbell',
    inventory: inventoryFrom(),
    preference: 'match_previous_weight',
    handBuiltPrescription: handBuilt(4, 6, 2),
    generatedPrescription: generatedPrescriptionFor('strength', 0),
  },
  {
    name: 'an endurance prescription progresses identically at the far end of the rep bands',
    requirement: 'GEN-07',
    trainingGoal: 'endurance',
    sessions: sessionsWith([loggedSet({ weightKg: '60.000', reps: 18, rir: 3 })]),
    equipmentType: 'barbell',
    inventory: inventoryFrom(),
    preference: 'widen_rep_range_first',
    handBuiltPrescription: handBuilt(15, 20, 2),
    generatedPrescription: generatedPrescriptionFor('endurance', 0),
  },
  {
    name: 'a deload cycle, whose targets are overridden rather than inherited, progresses identically',
    requirement: 'GEN-07',
    trainingGoal: 'hypertrophy',
    sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 10, rir: 4 })]),
    equipmentType: 'barbell',
    inventory: inventoryFrom(),
    preference: 'widen_rep_range_first',
    handBuiltPrescription: handBuilt(8, 12, 4),
    generatedPrescription: generatedPrescriptionFor('hypertrophy', deloadCycleIndex(), DELOAD_OVERRIDES),
  },
  {
    name: 'a slot resolved with no override at all inherits the base and progresses identically',
    requirement: 'GEN-07',
    trainingGoal: 'hypertrophy',
    sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 8, rir: 2 })]),
    equipmentType: 'barbell',
    inventory: inventoryFrom(),
    preference: 'match_previous_weight',
    handBuiltPrescription: handBuilt(8, 12, 2),
    generatedPrescription: generatedBasePrescription('hypertrophy'),
  },
  {
    name: 'a generated prescription with no logged history returns no_history, exactly as a hand-built one does',
    requirement: 'GEN-07',
    trainingGoal: 'hypertrophy',
    sessions: [],
    equipmentType: 'barbell',
    inventory: inventoryFrom(),
    preference: 'widen_rep_range_first',
    handBuiltPrescription: handBuilt(8, 12, 2),
    generatedPrescription: generatedPrescriptionFor('hypertrophy', 0),
  },
];
