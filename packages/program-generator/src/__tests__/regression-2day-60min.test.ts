import { resolveTarget, type MuscleGroupId } from '@fitness/api-contracts';
import { CATALOG_2DAY_REGRESSION } from '../__fixtures__/catalog-2day-regression';
import { generateProgram } from '../generate';
import type { GeneratedCycle, GeneratedDay, GeneratedSlot, GenerationInput } from '../result';
import { estimateSlotMinutes, SESSION_OVERHEAD_MINUTES } from '../session-length';
import { resolveSplitTemplate } from '../split-templates';
import { MAX_SETS_PER_EXERCISE } from '../volume-split';

const DAYS_PER_WEEK = 2;
const SESSION_LENGTH_MINUTES = 60;
const TRAINING_CYCLE_COUNT = 4;

// D-11: the reported scenario, verbatim — 2 days, 60 minutes, intermediate, hypertrophy, auto split,
// 4 cycles, no inventory — run against data derived from the real seeded catalog rather than a
// hand-built one, because the reported bug was a property of that catalog's shape.
function regressionInput(): GenerationInput {
  return {
    routineName: 'Reported 2-day scenario',
    trainingGoal: 'hypertrophy',
    experienceLevel: 'intermediate',
    daysPerWeek: DAYS_PER_WEEK,
    sessionLengthMinutes: SESSION_LENGTH_MINUTES,
    splitPreference: 'auto',
    emphasis: {},
    deloadPlacement: 'none',
    deloadEveryNCycles: null,
    trainingCycleCount: TRAINING_CYCLE_COUNT,
    variantSeed: 1,
    catalog: CATALOG_2DAY_REGRESSION,
    inventory: null,
    excludedExerciseIds: [],
  };
}

function templateMuscleGroups(): Set<MuscleGroupId> {
  const resolution = resolveSplitTemplate('auto', DAYS_PER_WEEK);
  if (resolution.kind !== 'template') {
    throw new Error(`Expected an auto split template for ${DAYS_PER_WEEK} days, got ${resolution.kind}`);
  }
  const groups = new Set<MuscleGroupId>();
  for (const dayPattern of resolution.template.dayPatterns) {
    for (const slotDef of dayPattern.slots) {
      groups.add(slotDef.muscleGroupId);
    }
  }
  return groups;
}

function primaryTemplateGroupsOf(exerciseId: string, templateGroups: ReadonlySet<MuscleGroupId>): MuscleGroupId[] {
  return CATALOG_2DAY_REGRESSION.mappings
    .filter(
      (mapping) =>
        mapping.exerciseId === exerciseId && mapping.role === 'primary' && templateGroups.has(mapping.muscleGroupId),
    )
    .map((mapping) => mapping.muscleGroupId);
}

function muscleGroupOfSlot(slot: GeneratedSlot, templateGroups: ReadonlySet<MuscleGroupId>): MuscleGroupId {
  const groups = primaryTemplateGroupsOf(slot.exerciseId, templateGroups);
  if (groups.length !== 1) {
    throw new Error(
      `Slot ${slot.key} (${slot.exerciseId}) resolves to ${groups.length} template muscle groups [${groups.join(', ')}]; ` +
        'the variety assertion needs exactly one',
    );
  }
  return groups[0]!;
}

function exerciseIdsByMuscleGroup(day: GeneratedDay, templateGroups: ReadonlySet<MuscleGroupId>): Map<MuscleGroupId, Set<string>> {
  const byGroup = new Map<MuscleGroupId, Set<string>>();
  for (const slot of day.slots) {
    const muscleGroupId = muscleGroupOfSlot(slot, templateGroups);
    const ids = byGroup.get(muscleGroupId) ?? new Set<string>();
    ids.add(slot.exerciseId);
    byGroup.set(muscleGroupId, ids);
  }
  return byGroup;
}

function estimatedMinutesFor(day: GeneratedDay, cycle: GeneratedCycle): number {
  let minutes = SESSION_OVERHEAD_MINUTES;
  for (const slot of day.slots) {
    const resolved = resolveTarget(slot.base, slot.overridesByCycleKey[cycle.key]);
    minutes += estimateSlotMinutes(resolved.targetSets ?? 0, resolved.targetRestSeconds ?? 0);
  }
  return minutes;
}

describe('D-11 regression: 2 days / 60 min / intermediate / hypertrophy / auto / 4 cycles / no inventory', () => {
  const tree = generateProgram(regressionInput());
  const trainingCycles = tree.cycles.filter((cycle) => cycle.kind === 'training');
  const templateGroups = templateMuscleGroups();

  it('returns exactly 2 days and 4 training cycles', () => {
    expect(tree.days).toHaveLength(DAYS_PER_WEEK);
    expect(trainingCycles).toHaveLength(TRAINING_CYCLE_COUNT);
  });

  it('D-11: gives every day at least 4 exercises', () => {
    for (const day of tree.days) {
      expect(day.slots.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('D-11: never uses an exercise for the same muscle group on both days', () => {
    const [dayA, dayB] = tree.days as [GeneratedDay, GeneratedDay];
    const idsA = exerciseIdsByMuscleGroup(dayA, templateGroups);
    const idsB = exerciseIdsByMuscleGroup(dayB, templateGroups);

    for (const [muscleGroupId, aIds] of idsA) {
      const bIds = idsB.get(muscleGroupId) ?? new Set<string>();
      const shared = [...aIds].filter((id) => bIds.has(id));
      expect({ muscleGroupId, shared }).toEqual({ muscleGroupId, shared: [] });
    }
  });

  it('D-11: never assigns more than MAX_SETS_PER_EXERCISE sets to an exercise in any cycle', () => {
    for (const day of tree.days) {
      for (const slot of day.slots) {
        for (const cycle of tree.cycles) {
          const resolved = resolveTarget(slot.base, slot.overridesByCycleKey[cycle.key]);
          expect(resolved.targetSets).toBeLessThanOrEqual(MAX_SETS_PER_EXERCISE);
        }
      }
    }
  });

  it('D-11: fits the hardest training cycle inside the 60-minute session', () => {
    const hardestCycle = trainingCycles[trainingCycles.length - 1]!;
    for (const day of tree.days) {
      expect(estimatedMinutesFor(day, hardestCycle)).toBeLessThanOrEqual(SESSION_LENGTH_MINUTES);
    }
  });

  it('D-11: prescribes RIR 0 in the fourth training cycle', () => {
    const fourthCycle = trainingCycles[3]!;
    for (const day of tree.days) {
      for (const slot of day.slots) {
        const resolved = resolveTarget(slot.base, slot.overridesByCycleKey[fourthCycle.key]);
        expect(resolved.targetRir).toBe(0);
      }
    }
  });

  it('covers every muscle group the resolved 2-day template names with a primary-mapped exercise', () => {
    const coveredGroups = new Set(
      CATALOG_2DAY_REGRESSION.mappings.filter((mapping) => mapping.role === 'primary').map((mapping) => mapping.muscleGroupId),
    );
    const uncovered = [...templateGroups].filter((muscleGroupId) => !coveredGroups.has(muscleGroupId));
    expect(uncovered).toEqual([]);
  });

  it('serializes byte-identically across two runs on the same input', () => {
    expect(JSON.stringify(generateProgram(regressionInput()))).toBe(JSON.stringify(tree));
  });
});
