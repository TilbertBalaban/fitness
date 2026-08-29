import { isEmptyOverride, type MuscleGroupId, type ResolvedTarget, type TargetOverride } from '@fitness/api-contracts';
import { buildCandidatePool } from './candidate-pool';
import { collectDegradations } from './degradation';
import { deloadOverrideFor, placeCycles } from './deload';
import { applyEmphasis } from './emphasis';
import { pickSlotExercise } from './slot-fill';
import { resolveSplitTemplate, type SplitTemplate } from './split-templates';
import { trimToSessionLength } from './session-length';
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

// The single exported entry point, composing candidate pool -> split resolution -> slot filling ->
// emphasis-adjusted periodized targets -> session-length trim -> cycle placement into a
// GeneratedProgramTree (D-04). Pure: no I/O, no Date.now(), no Math.random() — every varying
// decision is driven by `input` alone, including `variantSeed`.
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

  const days: GeneratedDay[] = [];
  let dayOrderIndex = 0;

  template.dayPatterns.forEach((dayPattern, dayIndex) => {
    dayOrderIndex += ORDER_INDEX_GAP;
    const dayKey = `day-${dayIndex}`;
    const alreadyPicked = new Set<string>();
    const muscleGroupBySlotKey = new Map<string, MuscleGroupId>();
    const builtSlots: GeneratedSlot[] = [];
    let slotOrderIndex = 0;

    for (const slotDef of dayPattern.slots) {
      const picked = pickSlotExercise(pool, slotDef, input.variantSeed, alreadyPicked);
      if (picked === null) {
        rawDegradations.push({
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
      const emphasisLevel = input.emphasis[slotDef.muscleGroupId] ?? 'normal';
      const volumeClass = MUSCLE_GROUP_VOLUME_CLASS[slotDef.muscleGroupId];
      const band = EXPERIENCE_VOLUME_BAND[input.experienceLevel][volumeClass];
      const baseWeeklySets = applyEmphasis(
        weeklySetTarget(input.experienceLevel, slotDef.muscleGroupId, 0, input.trainingCycleCount),
        emphasisLevel,
        band,
      );

      const base: ResolvedTarget = {
        targetSets: Math.max(1, Math.round(baseWeeklySets / frequency)),
        targetRepMin: repRange.min,
        targetRepMax: repRange.max,
        targetRir: rirForCycle(0),
        targetRestSeconds: restSeconds,
      };

      const slotKey = `${dayKey}-slot-${slotOrderIndex}`;
      muscleGroupBySlotKey.set(slotKey, slotDef.muscleGroupId);
      builtSlots.push({ key: slotKey, exerciseId: picked.exercise.id, orderIndex: slotOrderIndex, base, overridesByCycleKey: {} });
    }

    // D-14: session length constrains exercise COUNT, never a slot's own set count — trimming runs
    // on the day's whole slot list before any per-cycle override is computed.
    const trimResult = trimToSessionLength(builtSlots, input.sessionLengthMinutes);
    if (trimResult.removedCount > 0) {
      rawDegradations.push({
        kind: 'day_trimmed',
        dayKey,
        muscleGroupId: null,
        detail: `Removed ${trimResult.removedCount} exercise(s) from "${dayPattern.name}" to fit a ${input.sessionLengthMinutes}-minute session`,
      });
    }

    const finalSlots: GeneratedSlot[] = trimResult.slots.map((slot) => {
      const muscleGroupId = muscleGroupBySlotKey.get(slot.key)!;
      const frequency = frequencyByMuscleGroup.get(muscleGroupId) ?? 1;
      const emphasisLevel = input.emphasis[muscleGroupId] ?? 'normal';
      const volumeClass = MUSCLE_GROUP_VOLUME_CLASS[muscleGroupId];
      const band = EXPERIENCE_VOLUME_BAND[input.experienceLevel][volumeClass];

      const overridesByCycleKey: Record<string, TargetOverride> = {};
      for (const cycle of cycles) {
        let override: TargetOverride;
        if (cycle.kind === 'deload') {
          override = deloadOverrideFor(slot.base);
        } else {
          const trainingIndex = trainingIndexByCycleKey.get(cycle.key) ?? 0;
          const emphasizedWeeklySets = applyEmphasis(
            weeklySetTarget(input.experienceLevel, muscleGroupId, trainingIndex, input.trainingCycleCount),
            emphasisLevel,
            band,
          );
          const cycleSets = Math.max(1, Math.round(emphasizedWeeklySets / frequency));
          const cycleRir = rirForCycle(trainingIndex);
          override = buildOverride(slot.base, cycleSets, cycleRir);
        }
        if (!isEmptyOverride(override)) {
          overridesByCycleKey[cycle.key] = override;
        }
      }

      return { ...slot, overridesByCycleKey };
    });

    days.push({ key: dayKey, name: dayPattern.name, orderIndex: dayOrderIndex, isRestDay: false, slots: finalSlots });
  });

  return { name: input.routineName, goal, cycles, days, degradations: collectDegradations(rawDegradations) };
}
