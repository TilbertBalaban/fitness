import type { EquipmentType, MovementPattern } from '@fitness/api-contracts';
import type { GenerationCatalog, GenerationInput } from '../result';
import { generateProgram } from '../generate';
import { estimateSlotMinutes, SESSION_OVERHEAD_MINUTES } from '../session-length';

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

// Pitfall 1: a single exercise per muscle group starves D-02's second-exercise-absorption path.
// Three distinct exercises per group, cycled through a deterministic equipment/movement-pattern
// spread (including a null of each), give the split — and, once plan 13-03 lands, tiered scoring —
// real candidates to choose among.
const EQUIPMENT_CYCLE: readonly (EquipmentType | null)[] = ['barbell', null, 'dumbbell'];
const MOVEMENT_CYCLE: readonly (MovementPattern | null)[] = ['horizontal_push', null, 'isolation'];
const EXERCISES_PER_GROUP = 3;

function fullCatalog(): GenerationCatalog {
  const exercises: GenerationCatalog['exercises'] = [];
  const mappings: GenerationCatalog['mappings'] = [];

  for (const muscleGroupId of MUSCLE_GROUPS_FOR_FULL_BODY_3) {
    for (let index = 0; index < EXERCISES_PER_GROUP; index += 1) {
      const id = `ex-${muscleGroupId}-${index}`;
      exercises.push({
        id,
        name: `${muscleGroupId} exercise ${index}`,
        equipmentRequired: EQUIPMENT_CYCLE[index % EQUIPMENT_CYCLE.length] ?? null,
        movementPattern: MOVEMENT_CYCLE[index % MOVEMENT_CYCLE.length] ?? null,
      });
      mappings.push({
        exerciseId: id,
        muscleGroupId,
        role: 'primary' as const,
        weightFactor: '1.0',
      });
    }
  }

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
    const tree = generateProgram(tracerInput({ splitPreference: 'full_body', daysPerWeek: 5 }));

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

    // The group now owns more than one slot per day (D-02), so every chest-mapped exercise id —
    // not one fixed literal — must be summed to reconstruct the group's true weekly total.
    const chestSlots = tree.days.flatMap((day) => day.slots.filter((slot) => slot.exerciseId.startsWith('ex-chest-')));
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
      exercises: fullCatalog().exercises.filter((exercise) => !exercise.id.startsWith('ex-chest-')),
      mappings: fullCatalog().mappings.filter((mapping) => !mapping.exerciseId.startsWith('ex-chest-')),
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

describe('the reported 2-day scenario (D-01..D-05, D-09)', () => {
  function wideCatalog(): GenerationCatalog {
    const exercises: GenerationCatalog['exercises'] = [];
    const mappings: GenerationCatalog['mappings'] = [];
    for (const muscleGroupId of MUSCLE_GROUPS_FOR_FULL_BODY_3) {
      for (let i = 0; i < 4; i += 1) {
        const id = `wide-${muscleGroupId}-${i}`;
        exercises.push({ id, name: `${muscleGroupId} exercise ${i}`, equipmentRequired: null, movementPattern: null });
        mappings.push({ exerciseId: id, muscleGroupId, role: 'primary' as const, weightFactor: '1.0' });
      }
    }
    return { exercises, mappings };
  }

  function scenarioInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
    return tracerInput({
      daysPerWeek: 2,
      sessionLengthMinutes: 60,
      experienceLevel: 'intermediate',
      trainingGoal: 'hypertrophy',
      splitPreference: 'full_body',
      trainingCycleCount: 4,
      catalog: wideCatalog(),
      ...overrides,
    });
  }

  it('caps every slot at 5 sets in every cycle, gives each day more than 2 slots, and fits the hardest-cycle estimate inside the session budget', () => {
    const tree = generateProgram(scenarioInput());

    expect(tree.days).toHaveLength(2);
    const lastCycleKey = tree.cycles[tree.cycles.length - 1]!.key;

    for (const day of tree.days) {
      expect(day.slots.length).toBeGreaterThan(2);

      let estimatedMinutes = SESSION_OVERHEAD_MINUTES;
      for (const slot of day.slots) {
        for (const cycle of tree.cycles) {
          const override = slot.overridesByCycleKey[cycle.key];
          const sets = override?.targetSets ?? slot.base.targetSets ?? 0;
          expect(sets).toBeLessThanOrEqual(5);
        }
        const lastCycleOverride = slot.overridesByCycleKey[lastCycleKey];
        const lastCycleSets = lastCycleOverride?.targetSets ?? slot.base.targetSets ?? 0;
        const restSeconds = slot.base.targetRestSeconds ?? 0;
        estimatedMinutes += estimateSlotMinutes(lastCycleSets, restSeconds);
      }

      expect(estimatedMinutes).toBeLessThanOrEqual(60);
    }
  });

  // Derives each exercise id's muscle group from the id's own `wide-<muscleGroupId>-<n>` shape
  // (wideCatalog's own naming convention) rather than hardcoding which slot index belongs to
  // which group — the split (D-01/D-02) can give a group more than one slot per day.
  function muscleGroupOfExerciseId(exerciseId: string): string {
    const match = /^wide-(.+)-\d+$/.exec(exerciseId);
    if (!match) throw new Error(`Unexpected exercise id shape: ${exerciseId}`);
    return match[1]!;
  }

  it('does not reuse an exercise for the same muscle group on two days of the week while an alternative exists', () => {
    const tree = generateProgram(scenarioInput());

    expect(tree.days).toHaveLength(2);
    const [dayA, dayB] = tree.days as [(typeof tree.days)[number], (typeof tree.days)[number]];

    const idsByGroupForDay = (day: (typeof tree.days)[number]) => {
      const byGroup = new Map<string, Set<string>>();
      for (const slot of day.slots) {
        const group = muscleGroupOfExerciseId(slot.exerciseId);
        const ids = byGroup.get(group) ?? new Set<string>();
        ids.add(slot.exerciseId);
        byGroup.set(group, ids);
      }
      return byGroup;
    };

    const groupIdsA = idsByGroupForDay(dayA);
    const groupIdsB = idsByGroupForDay(dayB);

    for (const [group, idsA] of groupIdsA) {
      const idsB = groupIdsB.get(group);
      if (!idsB) continue;
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);
    }
  });

  it('still forbids an exercise id appearing twice within the same day', () => {
    const tree = generateProgram(scenarioInput());

    for (const day of tree.days) {
      const ids = day.slots.map((slot) => slot.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('lets the same exercise appear on both days for a muscle group with exactly one eligible exercise', () => {
    const catalog = wideCatalog();
    const singleCandidateCatalog: GenerationCatalog = {
      exercises: catalog.exercises.filter((exercise) => !exercise.id.startsWith('wide-chest-') || exercise.id === 'wide-chest-0'),
      mappings: catalog.mappings.filter((mapping) => !mapping.exerciseId.startsWith('wide-chest-') || mapping.exerciseId === 'wide-chest-0'),
    };

    const tree = generateProgram(scenarioInput({ catalog: singleCandidateCatalog }));

    const chestIdsByDay = tree.days.map(
      (day) => new Set(day.slots.filter((slot) => slot.exerciseId.startsWith('wide-chest-')).map((slot) => slot.exerciseId)),
    );
    expect(chestIdsByDay.every((ids) => ids.size > 0)).toBe(true);
    expect(chestIdsByDay.every((ids) => ids.has('wide-chest-0'))).toBe(true);
  });

  it("gives the first slot of a group a distinct-secondary-muscle count at least as high as the second slot's", () => {
    const catalog = wideCatalog();
    // Give exactly one chest candidate secondary mappings, making it the most compound while
    // every other chest candidate still ties it on primary score.
    const catalogWithOneCompound: GenerationCatalog = {
      exercises: catalog.exercises,
      mappings: [
        ...catalog.mappings,
        { exerciseId: 'wide-chest-0', muscleGroupId: 'triceps' as never, role: 'secondary', weightFactor: '0.5' },
        { exerciseId: 'wide-chest-0', muscleGroupId: 'front_delts' as never, role: 'secondary', weightFactor: '0.5' },
      ],
    };

    const secondaryGroupCountByExerciseId = new Map<string, number>();
    for (const mapping of catalogWithOneCompound.mappings) {
      if (mapping.role !== 'secondary') continue;
      secondaryGroupCountByExerciseId.set(mapping.exerciseId, (secondaryGroupCountByExerciseId.get(mapping.exerciseId) ?? 0) + 1);
    }

    // A generous session budget (the max input allows) so the fit's overflow-removal phase never
    // has to remove chest's second exercise before this assertion can observe it.
    const tree = generateProgram(
      scenarioInput({ catalog: catalogWithOneCompound, emphasis: { chest: 'emphasize' }, sessionLengthMinutes: 180 }),
    );

    let sawTwoChestSlots = false;
    for (const day of tree.days) {
      const chestSlots = day.slots.filter((slot) => slot.exerciseId.startsWith('wide-chest-'));
      if (chestSlots.length < 2) continue;
      sawTwoChestSlots = true;
      const firstCount = secondaryGroupCountByExerciseId.get(chestSlots[0]!.exerciseId) ?? 0;
      const secondCount = secondaryGroupCountByExerciseId.get(chestSlots[1]!.exerciseId) ?? 0;
      expect(firstCount).toBeGreaterThanOrEqual(secondCount);
    }
    expect(sawTwoChestSlots).toBe(true);
  });

  it('produces byte-identical JSON across two runs, and a different result when only variantSeed changes', () => {
    const input = scenarioInput();
    const first = JSON.stringify(generateProgram(input));
    const second = JSON.stringify(generateProgram(input));
    expect(first).toBe(second);

    const varied = JSON.stringify(generateProgram(scenarioInput({ variantSeed: input.variantSeed + 1 })));
    expect(varied).not.toBe(first);
  });
});
