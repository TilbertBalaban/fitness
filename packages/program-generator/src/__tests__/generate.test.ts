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
});
