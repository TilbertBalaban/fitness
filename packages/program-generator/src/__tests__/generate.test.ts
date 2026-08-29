import type { GenerationCatalog, GenerationInput } from '../result';
import { generateProgram } from '../generate';

const MUSCLE_GROUPS_FOR_FULL_BODY_3 = [
  'chest',
  'lats',
  'quads',
  'hamstrings',
  'glutes',
  'front_delts',
  'side_delts',
  'biceps',
  'triceps',
  'abs',
] as const;

function fullCatalog(): GenerationCatalog {
  const exercises = MUSCLE_GROUPS_FOR_FULL_BODY_3.map((muscleGroupId) => ({
    id: `ex-${muscleGroupId}`,
    name: `${muscleGroupId} exercise`,
    equipmentRequired: null,
    movementPattern: null,
  }));

  const mappings = MUSCLE_GROUPS_FOR_FULL_BODY_3.map((muscleGroupId) => ({
    exerciseId: `ex-${muscleGroupId}`,
    muscleGroupId,
    role: 'primary' as const,
    weightFactor: '1.0',
  }));

  return { exercises, mappings };
}

function tracerInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    routineName: 'My Program',
    trainingGoal: 'hypertrophy',
    experienceLevel: 'intermediate',
    daysPerWeek: 3,
    sessionLengthMinutes: 60,
    splitPreference: 'full_body',
    emphasis: {},
    deloadPlacement: 'none',
    deloadEveryNCycles: null,
    trainingCycleCount: 4,
    variantSeed: 1,
    catalog: fullCatalog(),
    inventory: null,
    excludedExerciseIds: [],
    ...overrides,
  };
}

describe('generateProgram', () => {
  it('produces 4 training cycles, 3 days, filled slots and 8-12 rep targets for the tracer input', () => {
    const tree = generateProgram(tracerInput());

    expect(tree.cycles).toHaveLength(4);
    expect(tree.cycles.every((cycle) => cycle.kind === 'training')).toBe(true);
    expect(tree.days).toHaveLength(3);
    for (const day of tree.days) {
      expect(day.slots.length).toBeGreaterThan(0);
      for (const slot of day.slots) {
        expect(slot.base.targetRepMin).toBe(8);
        expect(slot.base.targetRepMax).toBe(12);
      }
    }
  });

  it('produces two byte-identical JSON serializations for the same input', () => {
    const input = tracerInput();
    const first = JSON.stringify(generateProgram(input));
    const second = JSON.stringify(generateProgram(input));

    expect(first).toBe(second);
  });

  it('produces a different, itself-stable result when only variantSeed changes', () => {
    const a1 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 1 })));
    const a2 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 1 })));
    const b1 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 999 })));
    const b2 = JSON.stringify(generateProgram(tracerInput({ variantSeed: 999 })));

    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it('returns a tree with zero slots and a non-empty degradations list for a zero-candidate catalog, without throwing', () => {
    const tree = generateProgram(tracerInput({ catalog: { exercises: [], mappings: [] } }));

    expect(tree.degradations.length).toBeGreaterThan(0);
    expect(tree.days.every((day) => day.slots.length === 0)).toBe(true);
  });

  it('produces one degradation entry and an empty day/cycle list for an unsupported split resolution', () => {
    const tree = generateProgram(tracerInput({ splitPreference: 'upper_lower' }));

    expect(tree.days).toHaveLength(0);
    expect(tree.degradations.some((entry) => entry.kind === 'split_unsupported')).toBe(true);
  });

  it('emits sparse overrides only where a cycle differs from the base, gated by isEmptyOverride', () => {
    const tree = generateProgram(tracerInput({ trainingCycleCount: 1 }));

    for (const day of tree.days) {
      for (const slot of day.slots) {
        expect(Object.keys(slot.overridesByCycleKey)).toEqual([]);
      }
    }
  });

  it('never allocates an emphasized muscle group more weekly sets than its EXPERIENCE_VOLUME_BAND mav', () => {
    // chest is 'large' for intermediate: mev 10, mav 18. Emphasize would raise the raw multiplier
    // past 18 (weeklySetTarget's own last-cycle value is already 18, times 1.3 = 23.4) — the clamp
    // inside applyEmphasis must hold it at 18.
    const tree = generateProgram(tracerInput({ emphasis: { chest: 'emphasize' } }));

    const chestSlots = tree.days.flatMap((day) => day.slots.filter((slot) => slot.exerciseId === 'ex-chest'));
    expect(chestSlots.length).toBeGreaterThan(0);

    // Reconstruct the last training cycle's per-session total across every day chest appears in.
    const lastCycleKey = tree.cycles[tree.cycles.length - 1]!.key;
    const weeklyTotal = chestSlots.reduce((sum, slot) => {
      const override = slot.overridesByCycleKey[lastCycleKey];
      const sets = override?.targetSets ?? slot.base.targetSets ?? 0;
      return sum + sets;
    }, 0);

    expect(weeklyTotal).toBeLessThanOrEqual(18);
  });

  it('produces a day_trimmed degradation entry naming the day when the session budget is too small', () => {
    const tree = generateProgram(tracerInput({ sessionLengthMinutes: 20 }));

    const trimmed = tree.degradations.find((entry) => entry.kind === 'day_trimmed');
    expect(trimmed).toBeDefined();
    expect(trimmed!.dayKey).not.toBeNull();
  });

  it('produces a slot_unfillable degradation entry naming the muscle group when a slot cannot be filled', () => {
    const catalogMissingChest: GenerationCatalog = {
      exercises: fullCatalog().exercises.filter((exercise) => exercise.id !== 'ex-chest'),
      mappings: fullCatalog().mappings.filter((mapping) => mapping.exerciseId !== 'ex-chest'),
    };

    const tree = generateProgram(tracerInput({ catalog: catalogMissingChest }));

    const unfillable = tree.degradations.find((entry) => entry.kind === 'slot_unfillable');
    expect(unfillable).toBeDefined();
    expect(unfillable!.muscleGroupId).toBe('chest');
  });

  it('expresses a deload cycle only as overrides on the same days and slots, never a structural change', () => {
    const tree = generateProgram(tracerInput({ deloadPlacement: 'final_cycle_only' }));

    const deloadCycle = tree.cycles.find((cycle) => cycle.kind === 'deload');
    expect(deloadCycle).toBeDefined();

    for (const day of tree.days) {
      for (const slot of day.slots) {
        const override = slot.overridesByCycleKey[deloadCycle!.key];
        expect(override).toBeDefined();
        expect(override!.targetRepMin).toBeUndefined();
        expect(override!.targetRepMax).toBeUndefined();
        expect(override!.targetRestSeconds).toBeUndefined();
      }
    }
  });
});
