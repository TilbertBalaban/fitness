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

  // D-04 amendment phase 1: a two-slot chest group (5 sets each, 60s rest) starts at 27.5 minutes.
  // Removing the overflow (second) exercise alone brings it to 18.75, which a 19-minute budget
  // already fits — the first exercise's sets must stay at their originally planned 5, untouched.
  it('removes only the overflow exercise when that alone fits the budget, leaving the first exercise untouched', () => {
    const plans = [
      plan({ muscleGroupId: 'chest' as MuscleGroupId, groupExerciseIndex: 0, hardestCycleSets: 5, restSeconds: 60 }),
      plan({ muscleGroupId: 'chest' as MuscleGroupId, groupExerciseIndex: 1, hardestCycleSets: 5, restSeconds: 60 }),
    ];

    const result = fitDayToSessionLength(plans, 19);

    expect(result.removedCount).toBe(1);
    expect(result.setsRemovedCount).toBe(0);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]!.groupExerciseIndex).toBe(0);
    expect(result.plans[0]!.hardestCycleSets).toBe(5);
  });

  // D-04 amendment: overflow removal is tried before any set reduction even when reduction alone
  // would have been enough. Two chest slots (4 sets each, 60s rest) start at 24 minutes; reducing
  // both to the floor of 3 would reach 20.5 (fitting a 21-minute budget) without any removal, but
  // the amended order removes the overflow slot first regardless, landing at 17 minutes with the
  // first exercise's 4 sets untouched.
  it('prefers removing the overflow exercise over reducing sets, even when reduction alone would have fit', () => {
    const plans = [
      plan({ muscleGroupId: 'chest' as MuscleGroupId, groupExerciseIndex: 0, hardestCycleSets: 4, restSeconds: 60 }),
      plan({ muscleGroupId: 'chest' as MuscleGroupId, groupExerciseIndex: 1, hardestCycleSets: 4, restSeconds: 60 }),
    ];

    const result = fitDayToSessionLength(plans, 21);

    expect(result.removedCount).toBe(1);
    expect(result.setsRemovedCount).toBe(0);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]!.hardestCycleSets).toBe(4);
  });

  // No overflow slot exists here (every plan is a group's first exercise), so phase 1 is a no-op:
  // four 4-set/120s-rest plans fitted to 20 minutes go straight to reducing sets down to the floor
  // of 3 (setsRemovedCount 4), and even at the floor the day still needs three whole exercises
  // removed (removedCount 3) to reach a single 3-set survivor.
  it('reduces sets down to the floor of 3 before removing exercises when no overflow slot exists', () => {
    const plans = [plan(), plan(), plan(), plan()];

    const result = fitDayToSessionLength(plans, 20);

    expect(result.setsRemovedCount).toBe(4);
    expect(result.removedCount).toBe(3);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]!.hardestCycleSets).toBe(3);
  });

  // Three 4-set/60s-rest plans (no overflow slot) fitted to 28 minutes: two reductions land the
  // day order [4, 3, 3] at 27.5 minutes, which already fits — removedCount stays 0.
  it('concedes by reduction alone when that is enough — removedCount 0, setsRemovedCount positive', () => {
    const plans = [
      plan({ hardestCycleSets: 4, restSeconds: 60 }),
      plan({ hardestCycleSets: 4, restSeconds: 60 }),
      plan({ hardestCycleSets: 4, restSeconds: 60 }),
    ];

    const result = fitDayToSessionLength(plans, 28);

    expect(result.removedCount).toBe(0);
    expect(result.setsRemovedCount).toBe(2);
    expect(result.plans.map((survivor) => survivor.hardestCycleSets)).toEqual([4, 3, 3]);
  });

  it('a single plan fitted to 1 minute survives at the floor of 3, reporting the shortfall instead of emptying the day', () => {
    const plans = [plan({ hardestCycleSets: 10, restSeconds: 120 })];

    const result = fitDayToSessionLength(plans, 1);

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]!.hardestCycleSets).toBe(3);
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
    expect(result.setsRemovedCount).toBe(0);
    expect(result.removedCount).toBe(3);
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
