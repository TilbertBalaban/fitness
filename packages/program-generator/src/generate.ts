import { isEmptyOverride, type ResolvedTarget, type TargetOverride } from '@fitness/api-contracts';
import { buildCandidatePool } from './candidate-pool';
import { REP_RANGE_BY_GOAL, REST_SECONDS_BY_GOAL, rirForCycle, weeklySetTarget } from './volume-landmarks';
import { pickSlotExercise } from './slot-fill';
import { resolveSplitTemplate, type SplitTemplate } from './split-templates';
import { isGenerationInput, type DegradationEntry, type GenerationInput, type GeneratedCycle, type GeneratedDay, type GeneratedProgramTree, type GeneratedSlot } from './result';

// Mirrors apps/mobile/lib/db/programs/order-index.ts's ORDER_INDEX_GAP (1024) — duplicated, not
// imported, because packages/program-generator cannot depend on apps/mobile. Same gap-based
// ordering convention this whole schema already uses for every ordered child table.
const ORDER_INDEX_GAP = 1024;

const TRAINING_GOAL_LABEL: Record<string, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  endurance: 'Endurance',
};

function countMuscleGroupFrequency(template: SplitTemplate): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const dayPattern of template.dayPatterns) {
    for (const slotDef of dayPattern.slots) {
      frequency.set(slotDef.muscleGroupId, (frequency.get(slotDef.muscleGroupId) ?? 0) + 1);
    }
  }
  return frequency;
}

function buildOverride(base: ResolvedTarget, cycleSets: number, cycleRir: number): TargetOverride {
  const override: TargetOverride = {};
  if (cycleSets !== base.targetSets) override.targetSets = cycleSets;
  if (cycleRir !== base.targetRir) override.targetRir = cycleRir;
  return override;
}

// The single exported entry point, composing candidate pool -> split resolution -> slot filling ->
// periodized targets into a GeneratedProgramTree (D-04). Pure: no I/O, no Date.now(), no
// Math.random() — every varying decision is driven by `input` alone, including `variantSeed`.
export function generateProgram(input: GenerationInput): GeneratedProgramTree {
  // T-11-05: rejects the whole input before any candidate-pool or slot-filling work runs, rather
  // than partially processing a malformed value that reached this boundary from outside
  // TypeScript's own compile-time guarantee (e.g. a wizard form, or a value round-tripped through
  // JSON).
  if (!isGenerationInput(input)) {
    throw new TypeError('Invalid GenerationInput');
  }

  const pool = buildCandidatePool({
    catalog: input.catalog,
    inventory: input.inventory,
    excludedExerciseIds: input.excludedExerciseIds,
  });
  const resolution = resolveSplitTemplate(input.splitPreference, input.daysPerWeek);
  const degradations: DegradationEntry[] = [];
  const goal = TRAINING_GOAL_LABEL[input.trainingGoal] ?? null;

  if (resolution.kind === 'unsupported') {
    degradations.push({
      kind: 'split_unsupported',
      dayKey: null,
      muscleGroupId: null,
      detail: `No split template for "${resolution.splitPreference}" at ${resolution.daysPerWeek} days per week`,
    });
    return { name: input.routineName, goal, cycles: [], days: [], degradations };
  }

  const template = resolution.template;
  const frequencyByMuscleGroup = countMuscleGroupFrequency(template);
  const repRange = REP_RANGE_BY_GOAL[input.trainingGoal];
  const restSeconds = REST_SECONDS_BY_GOAL[input.trainingGoal];

  const days: GeneratedDay[] = [];
  let dayOrderIndex = 0;

  template.dayPatterns.forEach((dayPattern, dayIndex) => {
    dayOrderIndex += ORDER_INDEX_GAP;
    const dayKey = `day-${dayIndex}`;
    const alreadyPicked = new Set<string>();
    const slots: GeneratedSlot[] = [];
    let slotOrderIndex = 0;

    for (const slotDef of dayPattern.slots) {
      const picked = pickSlotExercise(pool, slotDef, input.variantSeed, alreadyPicked);
      if (picked === null) {
        degradations.push({
          kind: 'slot_unfillable',
          dayKey,
          muscleGroupId: slotDef.muscleGroupId,
          detail: `No available candidate for ${slotDef.muscleGroupId} in "${dayPattern.name}"`,
        });
        continue;
      }
      alreadyPicked.add(picked.exercise.id);
      slotOrderIndex += ORDER_INDEX_GAP;

      const frequency = frequencyByMuscleGroup.get(slotDef.muscleGroupId) ?? 1;
      const baseWeeklySets = weeklySetTarget(input.experienceLevel, slotDef.muscleGroupId, 0, input.trainingCycleCount);
      const base: ResolvedTarget = {
        targetSets: Math.max(1, Math.round(baseWeeklySets / frequency)),
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetRir: rirForCycle(0),
        targetRestSeconds: restSeconds,
      };

      const overridesByCycleKey: Record<string, TargetOverride> = {};
      for (let cycleIndex = 0; cycleIndex < input.trainingCycleCount; cycleIndex += 1) {
        const cycleWeeklySets = weeklySetTarget(input.experienceLevel, slotDef.muscleGroupId, cycleIndex, input.trainingCycleCount);
        const cycleSets = Math.max(1, Math.round(cycleWeeklySets / frequency));
        const cycleRir = rirForCycle(cycleIndex);
        const override = buildOverride(base, cycleSets, cycleRir);
        if (!isEmptyOverride(override)) {
          overridesByCycleKey[`cycle-${cycleIndex}`] = override;
        }
      }

      slots.push({ key: `${dayKey}-slot-${slotOrderIndex}`, exerciseId: picked.exercise.id, orderIndex: slotOrderIndex, base, overridesByCycleKey });
    }

    days.push({ key: dayKey, name: dayPattern.name, orderIndex: dayOrderIndex, isRestDay: false, slots });
  });

  const cycles: GeneratedCycle[] = [];
  let cycleOrderIndex = 0;
  for (let cycleIndex = 0; cycleIndex < input.trainingCycleCount; cycleIndex += 1) {
    cycleOrderIndex += ORDER_INDEX_GAP;
    cycles.push({
      key: `cycle-${cycleIndex}`,
      name: `Cycle ${cycleIndex + 1}`,
      kind: 'training',
      orderIndex: cycleOrderIndex,
      durationDays: null,
    });
  }

  return { name: input.routineName, goal, cycles, days, degradations };
}
