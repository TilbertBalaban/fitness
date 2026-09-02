import type { MuscleGroupId } from '@fitness/api-contracts';
import { fitDayToSessionLength, type DaySlotPlan } from '../session-fit';
import type { VolumeClass } from '../volume-landmarks';

function plan(overrides: Partial<DaySlotPlan> = {}): DaySlotPlan {
  return {
    muscleGroupId: 'chest' as MuscleGroupId,
    volumeClass: 'large' as VolumeClass,
    groupExerciseIndex: 0,
    hardestCycleSets: 4,
    restSeconds: 120,
    ...overrides,
  };
}

describe('fitDayToSessionLength', () => {
  it('returns the same plan values and reports nothing conceded when the day already fits', () => {
    const plans = [plan({ hardestCycleSets: 3, restSeconds: 90 })];

    const result = fitDayToSessionLength(plans, 60);

    expect(result.plans).toEqual(plans);
    expect(result.removedCount).toBe(0);
    expect(result.setsRemovedCount).toBe(0);
    expect(result.overBudgetMinutes).toBe(0);
  });

  it('reduces sets before removing exercises: a day of four 4-set/120s-rest plans fitted to 20 minutes ends with every survivor at 2 sets', () => {
    const plans = [plan(), plan(), plan(), plan()];

    const result = fitDayToSessionLength(plans, 20);

    expect(result.setsRemovedCount).toBeGreaterThan(0);
    expect(result.removedCount).toBeGreaterThan(0);
    for (const survivor of result.plans) {
      expect(survivor.hardestCycleSets).toBe(2);
    }
  });

  it('concedes by reduction alone when that is enough — removedCount 0, setsRemovedCount positive', () => {
    const plans = [
      plan({ hardestCycleSets: 4, restSeconds: 60 }),
      plan({ hardestCycleSets: 4, restSeconds: 60 }),
      plan({ hardestCycleSets: 4, restSeconds: 60 }),
    ];

    const result = fitDayToSessionLength(plans, 25);

    expect(result.removedCount).toBe(0);
    expect(result.setsRemovedCount).toBeGreaterThan(0);
    expect(result.plans).toHaveLength(3);
  });

  it('a single plan fitted to 1 minute survives, reporting the shortfall instead of emptying the day', () => {
    const plans = [plan({ hardestCycleSets: 10, restSeconds: 120 })];

    const result = fitDayToSessionLength(plans, 1);

    expect(result.plans).toHaveLength(1);
    expect(result.overBudgetMinutes).toBeGreaterThan(0);
  });

  it('never removes the day-order-0 slot, and reduces a day of only large-class plans to one survivor without deadlocking', () => {
    const plans = [
      plan({ muscleGroupId: 'chest' as MuscleGroupId, volumeClass: 'large' as VolumeClass, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'lats' as MuscleGroupId, volumeClass: 'large' as VolumeClass, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'quads' as MuscleGroupId, volumeClass: 'large' as VolumeClass, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'glutes' as MuscleGroupId, volumeClass: 'large' as VolumeClass, hardestCycleSets: 2, restSeconds: 60 }),
    ];

    const result = fitDayToSessionLength(plans, 5);

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]!.muscleGroupId).toBe('chest');
    expect(result.removedCount).toBe(3);
  });

  it('removes a second exercise of a group before a first exercise of another group, regardless of volume class', () => {
    const plans = [
      plan({ muscleGroupId: 'chest' as MuscleGroupId, volumeClass: 'large' as VolumeClass, groupExerciseIndex: 0, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'chest' as MuscleGroupId, volumeClass: 'large' as VolumeClass, groupExerciseIndex: 1, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'biceps' as MuscleGroupId, volumeClass: 'small' as VolumeClass, groupExerciseIndex: 0, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'triceps' as MuscleGroupId, volumeClass: 'medium' as VolumeClass, groupExerciseIndex: 0, hardestCycleSets: 2, restSeconds: 60 }),
    ];

    const result = fitDayToSessionLength(plans, 21);

    expect(result.removedCount).toBe(1);
    expect(result.plans).toHaveLength(3);
    expect(
      result.plans.some((survivor) => survivor.muscleGroupId === 'chest' && survivor.groupExerciseIndex === 1),
    ).toBe(false);
    expect(result.plans.some((survivor) => survivor.muscleGroupId === 'biceps')).toBe(true);
    expect(result.plans.some((survivor) => survivor.muscleGroupId === 'triceps')).toBe(true);
  });

  it('removes a small volume-class group before medium before large when no group has a second exercise', () => {
    const plans = [
      plan({ muscleGroupId: 'chest' as MuscleGroupId, volumeClass: 'large' as VolumeClass, groupExerciseIndex: 0, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'triceps' as MuscleGroupId, volumeClass: 'medium' as VolumeClass, groupExerciseIndex: 0, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'biceps' as MuscleGroupId, volumeClass: 'small' as VolumeClass, groupExerciseIndex: 0, hardestCycleSets: 2, restSeconds: 60 }),
      plan({ muscleGroupId: 'glutes' as MuscleGroupId, volumeClass: 'large' as VolumeClass, groupExerciseIndex: 0, hardestCycleSets: 2, restSeconds: 60 }),
    ];

    const oneRemoval = fitDayToSessionLength(plans, 21);
    expect(oneRemoval.removedCount).toBe(1);
    expect(oneRemoval.plans.some((survivor) => survivor.muscleGroupId === 'biceps')).toBe(false);

    const twoRemovals = fitDayToSessionLength(plans, 17.5);
    expect(twoRemovals.removedCount).toBe(2);
    expect(twoRemovals.plans.some((survivor) => survivor.muscleGroupId === 'biceps')).toBe(false);
    expect(twoRemovals.plans.some((survivor) => survivor.muscleGroupId === 'triceps')).toBe(false);
    expect(twoRemovals.plans.map((survivor) => survivor.muscleGroupId).sort()).toEqual(['chest', 'glutes']);
  });

  it('neither mutates nor reorders its input array', () => {
    const plans = [
      plan({ hardestCycleSets: 4, restSeconds: 120 }),
      plan({ hardestCycleSets: 4, restSeconds: 120 }),
      plan({ hardestCycleSets: 4, restSeconds: 120 }),
    ];
    const snapshot = plans.map((entry) => ({ ...entry }));

    fitDayToSessionLength(plans, 15);

    expect(plans).toEqual(snapshot);
  });
});
