import { isEmptyOverride } from '@fitness/api-contracts';
import type { GeneratedProgramTree } from '@fitness/program-generator';
import { generateClientId } from '../id';
import { getPowerSync, type WriteDb, type WriteTx } from '../powersync';
import { routine, routineCycle, routineDay, routineExercise, routineExerciseCycleTarget } from '../schema';

export interface MaterializeGeneratedProgramInput {
  tree: GeneratedProgramTree;
  name: string;
}

export interface MaterializeGeneratedProgramResult {
  id: string;
}

// D-04's write side: a generated tree already fully describes an ordinary program, so this bulk
// inserts it inside ONE transaction, structurally identical to duplicateRoutine — fresh
// generateClientId() values, one id map per table, every foreign key rewritten through the map
// that owns it. status: 'draft' and source: 'user' are hardcoded (D-05): no new status value, no
// new source value and no new column mark a generated program as different from a hand-built one.
export async function materializeGeneratedProgram(
  { tree, name }: MaterializeGeneratedProgramInput,
  db: WriteDb = getPowerSync(),
): Promise<MaterializeGeneratedProgramResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Program name is required');
  }

  const routineId = generateClientId();

  await db.transaction(async (tx: WriteTx) => {
    await tx.insert(routine).values({
      id: routineId,
      name: trimmed,
      goal: tree.goal,
      status: 'draft',
      progressionFrozen: false,
      source: 'user',
      createdFromTemplateId: null,
      archivedAt: null,
    });

    const cycleIdByKey = new Map<string, string>();
    for (const cycle of tree.cycles) {
      const id = generateClientId();
      cycleIdByKey.set(cycle.key, id);
      await tx.insert(routineCycle).values({
        id,
        routineId,
        orderIndex: cycle.orderIndex,
        name: cycle.name,
        kind: cycle.kind,
        durationDays: cycle.durationDays,
      });
    }

    for (const day of tree.days) {
      const dayId = generateClientId();
      await tx.insert(routineDay).values({
        id: dayId,
        routineId,
        orderIndex: day.orderIndex,
        name: day.name,
        isRestDay: day.isRestDay,
        archivedAt: null,
      });

      for (const slot of day.slots) {
        const slotId = generateClientId();
        await tx.insert(routineExercise).values({
          id: slotId,
          routineDayId: dayId,
          exerciseId: slot.exerciseId,
          orderIndex: slot.orderIndex,
          supersetGroupId: null,
          targetSets: slot.base.targetSets,
          targetRepMin: slot.base.targetRepMin,
          targetRepMax: slot.base.targetRepMax,
          targetRir: slot.base.targetRir,
          targetRestSeconds: slot.base.targetRestSeconds,
          progressionSchemeId: null,
          notes: null,
        });

        for (const [cycleKey, override] of Object.entries(slot.overridesByCycleKey)) {
          if (isEmptyOverride(override)) continue;
          const cycleId = cycleIdByKey.get(cycleKey);
          if (!cycleId) continue;

          await tx.insert(routineExerciseCycleTarget).values({
            id: generateClientId(),
            routineExerciseId: slotId,
            cycleId,
            targetSets: override.targetSets ?? null,
            targetRepMin: override.targetRepMin ?? null,
            targetRepMax: override.targetRepMax ?? null,
            targetRir: override.targetRir ?? null,
            targetRestSeconds: override.targetRestSeconds ?? null,
          });
        }
      }
    }
  });

  return { id: routineId };
}
