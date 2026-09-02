import { isEmptyOverride, type MuscleGroupId, type ResolvedTarget, type TargetOverride } from '@fitness/api-contracts';
import { buildCandidatePool } from './candidate-pool';
import { collectDegradations } from './degradation';
import { deloadOverrideFor, placeCycles } from './deload';
import { applyEmphasis } from './emphasis';
import { pickSlotExercise } from './slot-fill';
import { resolveSplitTemplate, type SplitTemplate } from './split-templates';
import { fitDayToSessionLength, type DaySlotPlan } from './session-fit';
import { distributeSets, splitSessionSets } from './volume-split';
import {
  EXPERIENCE_VOLUME_BAND,
  MUSCLE_GROUP_VOLUME_CLASS,
  REP_RANGE_BY_GOAL,
  REST_SECONDS_BY_GOAL,
  rirForCycle,
  weeklySetTarget,
} from './volume-landmarks';
import {
  isGenerationInput,
  type DegradationEntry,
  type GenerationInput,
  type GeneratedDay,
  type GeneratedProgramTree,
  type GeneratedSlot,
} from './result';

// Mirrors apps/mobile/lib/db/programs/order-index.ts's ORDER_INDEX_GAP (1024) — duplicated, not
// imported, because packages/program-generator cannot depend on apps/mobile. Same gap-based
// ordering convention this whole schema already uses for every ordered child table. Note:
// deload.ts's placeCycles owns cycle-level order indexes independently — this constant governs
// only day and slot order indexes here.
const ORDER_INDEX_GAP = 1024;

const TRAINING_GOAL_LABEL: Record<string, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  endurance: 'Endurance',
};

function countMuscleGroupFrequency(template: SplitTemplate): Map<MuscleGroupId, number> {
  const frequency = new Map<MuscleGroupId, number>();
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

interface FilledSlot {
  key: string;
  exerciseId: string;
  orderIndex: number;
  muscleGroupId: MuscleGroupId;
  hardestCycleSets: number;
}

// The single exported entry point, composing candidate pool -> split resolution -> per-day
// PLAN/FIT/PICK/PER-CYCLE stages -> cycle placement into a GeneratedProgramTree. Pure: no I/O, no
// Date.now(), no Math.random() — every varying decision is driven by `input` alone, including
// `variantSeed`.
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
  const rawDegradations: DegradationEntry[] = [];
  const goal = TRAINING_GOAL_LABEL[input.trainingGoal] ?? null;

  if (resolution.kind === 'unsupported') {
    rawDegradations.push({
      kind: 'split_unsupported',
      dayKey: null,
      muscleGroupId: null,
      detail: `No split template for "${resolution.splitPreference}" at ${resolution.daysPerWeek} days per week`,
    });
    return { name: input.routineName, goal, cycles: [], days: [], degradations: collectDegradations(rawDegradations) };
  }

  const template = resolution.template;
  const frequencyByMuscleGroup = countMuscleGroupFrequency(template);
  const repRange = REP_RANGE_BY_GOAL[input.trainingGoal];
  const restSeconds = REST_SECONDS_BY_GOAL[input.trainingGoal];

  const cycles = placeCycles({
    trainingCycleCount: input.trainingCycleCount,
    deloadPlacement: input.deloadPlacement,
    deloadEveryNCycles: input.deloadEveryNCycles,
  });

  let trainingIndexCounter = 0;
  const trainingIndexByCycleKey = new Map<string, number>();
  for (const cycle of cycles) {
    if (cycle.kind === 'training') {
      trainingIndexByCycleKey.set(cycle.key, trainingIndexCounter);
      trainingIndexCounter += 1;
    }
  }

  // The hardest training cycle is always the last one: weeklySetTarget ramps monotonically from
  // mev at cycle 0 to mav at trainingCycleCount - 1, and applyEmphasis's multiplier is constant
  // across cycles for a given slot, so no search over cycles is needed.
  const hardestTrainingIndex = Math.max(0, input.trainingCycleCount - 1);

  const days: GeneratedDay[] = [];
  let dayOrderIndex = 0;

  template.dayPatterns.forEach((dayPattern, dayIndex) => {
    dayOrderIndex += ORDER_INDEX_GAP;
    const dayKey = `day-${dayIndex}`;

    // Stage 1 (PLAN): expand each frozen slotDef into 1+ DaySlotPlan entries against the hardest
    // training cycle's numbers — a fresh local array, never written back into the frozen
    // SplitTemplate (Pitfall 6).
    const plans: DaySlotPlan[] = [];
    const groupExerciseCounter = new Map<MuscleGroupId, number>();

    for (const slotDef of dayPattern.slots) {
      const frequency = frequencyByMuscleGroup.get(slotDef.muscleGroupId) ?? 1;
      const emphasisLevel = input.emphasis[slotDef.muscleGroupId] ?? 'normal';
      const volumeClass = MUSCLE_GROUP_VOLUME_CLASS[slotDef.muscleGroupId];
      const band = EXPERIENCE_VOLUME_BAND[input.experienceLevel][volumeClass];
      const hardestWeeklySets = applyEmphasis(
        weeklySetTarget(input.experienceLevel, slotDef.muscleGroupId, hardestTrainingIndex, input.trainingCycleCount),
        emphasisLevel,
        band,
      );
      const hardestSessionSets = Math.max(1, Math.round(hardestWeeklySets / frequency));

      for (const exerciseSets of splitSessionSets(hardestSessionSets)) {
        const groupExerciseIndex = groupExerciseCounter.get(slotDef.muscleGroupId) ?? 0;
        groupExerciseCounter.set(slotDef.muscleGroupId, groupExerciseIndex + 1);
        plans.push({
          muscleGroupId: slotDef.muscleGroupId,
          volumeClass,
          groupExerciseIndex,
          hardestCycleSets: exerciseSets,
          restSeconds,
        });
      }
    }

    // Stage 2 (FIT): fit the day's plan descriptors against the hardest-cycle estimate (D-03) —
    // never against picked slots, so a removed plan never consumes a candidate exercise.
    const fitResult = fitDayToSessionLength(plans, input.sessionLengthMinutes);
    if (fitResult.removedCount > 0 || fitResult.setsRemovedCount > 0) {
      rawDegradations.push({
        kind: 'day_trimmed',
        dayKey,
        muscleGroupId: null,
        detail:
          `Fitting "${dayPattern.name}" to a ${input.sessionLengthMinutes}-minute session removed ` +
          `${fitResult.removedCount} exercise(s) and reduced sets on ${fitResult.setsRemovedCount} occasion(s), ` +
          `landing at ~${Math.round(fitResult.estimatedMinutes)} minutes`,
      });
    }

    // Stage 3 (PICK): iterate the surviving plans in day order, advancing slotOrderIndex per
    // filled slot so keys stay unique and gap-ordered (D-02). A null pick is the resolution of
    // Open Question 1: report slot_unfillable for that day/muscle group and skip the slot, leaving
    // any already-picked sibling exercise at its already-capped planned sets.
    const alreadyPicked = new Set<string>();
    const filledSlots: FilledSlot[] = [];
    let slotOrderIndex = 0;

    for (const plan of fitResult.plans) {
      const picked = pickSlotExercise(pool, { muscleGroupId: plan.muscleGroupId }, input.variantSeed, alreadyPicked);
      if (picked === null) {
        rawDegradations.push({
          kind: 'slot_unfillable',
          dayKey,
          muscleGroupId: plan.muscleGroupId,
          detail: `No available candidate for ${plan.muscleGroupId} in "${dayPattern.name}"`,
        });
        continue;
      }
      alreadyPicked.add(picked.exercise.id);
      slotOrderIndex += ORDER_INDEX_GAP;

      filledSlots.push({
        key: `${dayKey}-slot-${slotOrderIndex}`,
        exerciseId: picked.exercise.id,
        orderIndex: slotOrderIndex,
        muscleGroupId: plan.muscleGroupId,
        hardestCycleSets: plan.hardestCycleSets,
      });
    }

    // Stage 4 (PER-CYCLE): group the filled slots by muscle group in day order, and for each
    // training cycle recompute weeklySetTarget at that cycle's own index (never scale the
    // hardest-cycle number linearly down, which would distort emphasized/deprioritized groups),
    // distribute it across the group's surviving slot count, and clamp to the fit's ceiling.
    const filledSlotsByMuscleGroup = new Map<MuscleGroupId, FilledSlot[]>();
    for (const filledSlot of filledSlots) {
      const group = filledSlotsByMuscleGroup.get(filledSlot.muscleGroupId) ?? [];
      group.push(filledSlot);
      filledSlotsByMuscleGroup.set(filledSlot.muscleGroupId, group);
    }

    const setsByTrainingIndexAndSlotKey = new Map<number, Map<string, number>>();
    for (let trainingIndex = 0; trainingIndex < input.trainingCycleCount; trainingIndex += 1) {
      const setsBySlotKey = new Map<string, number>();
      for (const [muscleGroupId, groupSlots] of filledSlotsByMuscleGroup) {
        const frequency = frequencyByMuscleGroup.get(muscleGroupId) ?? 1;
        const emphasisLevel = input.emphasis[muscleGroupId] ?? 'normal';
        const volumeClass = MUSCLE_GROUP_VOLUME_CLASS[muscleGroupId];
        const band = EXPERIENCE_VOLUME_BAND[input.experienceLevel][volumeClass];
        const weeklySets = applyEmphasis(
          weeklySetTarget(input.experienceLevel, muscleGroupId, trainingIndex, input.trainingCycleCount),
          emphasisLevel,
          band,
        );
        const sessionSets = Math.max(1, Math.round(weeklySets / frequency));
        const distributed = distributeSets(sessionSets, groupSlots.length);

        groupSlots.forEach((groupSlot, index) => {
          const clamped = Math.max(1, Math.min(distributed[index]!, groupSlot.hardestCycleSets));
          setsBySlotKey.set(groupSlot.key, clamped);
        });
      }
      setsByTrainingIndexAndSlotKey.set(trainingIndex, setsBySlotKey);
    }

    const finalSlots: GeneratedSlot[] = filledSlots.map((filledSlot) => {
      const cycle0Sets = setsByTrainingIndexAndSlotKey.get(0)?.get(filledSlot.key) ?? filledSlot.hardestCycleSets;
      const base: ResolvedTarget = {
        targetSets: cycle0Sets,
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetRir: rirForCycle(0, input.daysPerWeek),
        targetRestSeconds: restSeconds,
      };

      const overridesByCycleKey: Record<string, TargetOverride> = {};
      for (const cycle of cycles) {
        let override: TargetOverride;
        if (cycle.kind === 'deload') {
          override = deloadOverrideFor(base);
        } else {
          const trainingIndex = trainingIndexByCycleKey.get(cycle.key) ?? 0;
          const cycleSets = setsByTrainingIndexAndSlotKey.get(trainingIndex)?.get(filledSlot.key) ?? base.targetSets ?? 1;
          const cycleRir = rirForCycle(trainingIndex, input.daysPerWeek);
          override = buildOverride(base, cycleSets, cycleRir);
        }
        if (!isEmptyOverride(override)) {
          overridesByCycleKey[cycle.key] = override;
        }
      }

      return { key: filledSlot.key, exerciseId: filledSlot.exerciseId, orderIndex: filledSlot.orderIndex, base, overridesByCycleKey };
    });

    days.push({ key: dayKey, name: dayPattern.name, orderIndex: dayOrderIndex, isRestDay: false, slots: finalSlots });
  });

  return { name: input.routineName, goal, cycles, days, degradations: collectDegradations(rawDegradations) };
}
