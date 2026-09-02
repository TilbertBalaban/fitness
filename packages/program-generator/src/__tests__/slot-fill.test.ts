import type { EquipmentType, MovementPattern } from '@fitness/api-contracts';
import type { CandidatePool, PoolCandidate } from '../candidate-pool';
import { pickSlotExercise, seededRank, type SlotPickContext } from '../slot-fill';

interface SecondaryMappingOptions {
  muscleGroupId: string;
  weightFactor?: string;
}

interface CandidateOptions {
  role?: 'primary' | 'secondary';
  equipmentRequired?: EquipmentType | null;
  movementPattern?: MovementPattern | null;
  secondaryMappings?: SecondaryMappingOptions[];
}

function candidate(id: string, muscleGroupId: string, weightFactor: string, options: CandidateOptions = {}): PoolCandidate {
  const { role = 'primary', equipmentRequired = null, movementPattern = null, secondaryMappings = [] } = options;
  return {
    exercise: { id, name: id, equipmentRequired, movementPattern },
    mappings: [
      { exerciseId: id, muscleGroupId: muscleGroupId as never, role, weightFactor },
      ...secondaryMappings.map((mapping) => ({
        exerciseId: id,
        muscleGroupId: mapping.muscleGroupId as never,
        role: 'secondary' as const,
        weightFactor: mapping.weightFactor ?? '1.0',
      })),
    ],
  };
}

function poolOf(candidates: PoolCandidate[]): CandidatePool {
  return { candidates, mappingsByExerciseId: new Map(candidates.map((c) => [c.exercise.id, c.mappings])) };
}

function context(overrides: Partial<SlotPickContext> = {}): SlotPickContext {
  return {
    variantSeed: 1,
    alreadyPickedIds: new Set(),
    weekPickedIdsForGroup: new Set(),
    coveredMovementPatterns: new Set(),
    preferCompound: false,
    ...overrides,
  };
}

describe('pickSlotExercise', () => {
  const slotDef = { muscleGroupId: 'chest' as const };

  it('returns the same candidate on every call for a given variantSeed when scores tie', () => {
    const pool = poolOf([candidate('a', 'chest', '1.0'), candidate('b', 'chest', '1.0')]);

    const first = pickSlotExercise(pool, slotDef, context({ variantSeed: 42 }));
    const second = pickSlotExercise(pool, slotDef, context({ variantSeed: 42 }));

    expect(first).not.toBeNull();
    expect(first!.exercise.id).toBe(second!.exercise.id);
  });

  it('may return a different candidate for a different variantSeed on a tie', () => {
    const pool = poolOf([candidate('bench-press', 'chest', '1.0'), candidate('overhead-press', 'chest', '1.0')]);

    const results = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      results.add(pickSlotExercise(pool, slotDef, context({ variantSeed: seed }))!.exercise.id);
    }

    expect(results.size).toBeGreaterThan(1);
  });

  it('does not mutate or reorder its input candidates array', () => {
    const candidates = [candidate('a', 'chest', '0.5'), candidate('b', 'chest', '1.0')];
    const pool = poolOf(candidates);
    const snapshot = [...candidates];

    pickSlotExercise(pool, slotDef, context());

    expect(candidates).toEqual(snapshot);
  });

  it('returns null when every candidate has already been picked for the day', () => {
    const pool = poolOf([candidate('a', 'chest', '1.0')]);

    const result = pickSlotExercise(pool, slotDef, context({ alreadyPickedIds: new Set(['a']) }));

    expect(result).toBeNull();
  });

  it('never returns a candidate that is in alreadyPickedIds even when other candidates exist', () => {
    const pool = poolOf([candidate('picked', 'chest', '1.0'), candidate('unpicked', 'chest', '0.5')]);

    const result = pickSlotExercise(pool, slotDef, context({ alreadyPickedIds: new Set(['picked']) }));

    expect(result!.exercise.id).toBe('unpicked');
  });

  it('returns null when no candidate maps to the requested muscle group', () => {
    const pool = poolOf([candidate('a', 'lats', '1.0')]);

    const result = pickSlotExercise(pool, slotDef, context());

    expect(result).toBeNull();
  });

  it('picks the higher-scoring candidate when scores differ', () => {
    const pool = poolOf([candidate('low', 'chest', '0.3'), candidate('high', 'chest', '1.0')]);

    const result = pickSlotExercise(pool, slotDef, context());

    expect(result!.exercise.id).toBe('high');
  });

  it('lets compoundness decide only when preferCompound is true', () => {
    const seed = 42;
    const rankA = seededRank(seed, 'exA');
    const rankB = seededRank(seed, 'exB');
    const [tieBreakWinnerId, tieBreakLoserId] = rankA <= rankB ? ['exA', 'exB'] : ['exB', 'exA'];

    // Give the tie-break LOSER more secondary muscle groups, so a preferCompound win can only be
    // explained by the compoundness tier itself, never by the seededRank tie-break that would
    // otherwise favor the other candidate.
    const compoundCandidate = candidate(tieBreakLoserId, 'chest', '1.0', {
      secondaryMappings: [{ muscleGroupId: 'triceps' }, { muscleGroupId: 'front_delts' }],
    });
    const plainCandidate = candidate(tieBreakWinnerId, 'chest', '1.0');
    const pool = poolOf([compoundCandidate, plainCandidate]);

    const preferred = pickSlotExercise(pool, slotDef, context({ variantSeed: seed, preferCompound: true }));
    expect(preferred!.exercise.id).toBe(tieBreakLoserId);

    const notPreferred = pickSlotExercise(pool, slotDef, context({ variantSeed: seed, preferCompound: false }));
    expect(notPreferred!.exercise.id).toBe(tieBreakWinnerId);
  });

  it('ranks loadable equipment above non-loadable and above null, with no inventory in the picture', () => {
    const pool = poolOf([
      candidate('barbell-ex', 'chest', '1.0', { equipmentRequired: 'barbell' }),
      candidate('bodyweight-ex', 'chest', '1.0', { equipmentRequired: 'bodyweight' }),
      candidate('null-equipment-ex', 'chest', '1.0', { equipmentRequired: null }),
    ]);

    const result = pickSlotExercise(pool, slotDef, context());

    expect(result!.exercise.id).toBe('barbell-ex');
  });

  it('treats ez_bar as loadable, reading the imported MODEL_EQUIPMENT_TYPES array', () => {
    const pool = poolOf([
      candidate('ez-bar-ex', 'chest', '1.0', { equipmentRequired: 'ez_bar' }),
      candidate('bodyweight-ex', 'chest', '1.0', { equipmentRequired: 'bodyweight' }),
    ]);

    const result = pickSlotExercise(pool, slotDef, context());

    expect(result!.exercise.id).toBe('ez-bar-ex');
  });

  it('ranks a movement pattern not yet covered above one already covered, and above null', () => {
    const pool = poolOf([
      candidate('novel-pattern-ex', 'chest', '1.0', { movementPattern: 'horizontal_push' }),
      candidate('covered-pattern-ex', 'chest', '1.0', { movementPattern: 'vertical_push' }),
      candidate('null-pattern-ex', 'chest', '1.0', { movementPattern: null }),
    ]);

    const result = pickSlotExercise(
      pool,
      slotDef,
      context({ coveredMovementPatterns: new Set<MovementPattern>(['vertical_push']) }),
    );

    expect(result!.exercise.id).toBe('novel-pattern-ex');
  });

  it('never lets a secondary-only mapping beat a primary mapping, even at a lower weight', () => {
    const pool = poolOf([
      candidate('secondary-ex', 'chest', '1.0', { role: 'secondary' }),
      candidate('primary-ex', 'chest', '0.1', { role: 'primary' }),
    ]);

    const result = pickSlotExercise(pool, slotDef, context());

    expect(result!.exercise.id).toBe('primary-ex');
  });

  it('returns a secondary-only candidate rather than null when no primary-mapped candidate exists', () => {
    const pool = poolOf([candidate('secondary-ex', 'chest', '1.0', { role: 'secondary' })]);

    const result = pickSlotExercise(pool, slotDef, context());

    expect(result!.exercise.id).toBe('secondary-ex');
  });

  it('ranks a week-used candidate below any unused candidate of equal quality', () => {
    const pool = poolOf([candidate('used-ex', 'chest', '1.0'), candidate('unused-ex', 'chest', '1.0')]);

    const result = pickSlotExercise(pool, slotDef, context({ weekPickedIdsForGroup: new Set(['used-ex']) }));

    expect(result!.exercise.id).toBe('unused-ex');
  });

  it('returns a week-used candidate rather than null when every candidate for the group is week-used', () => {
    const pool = poolOf([candidate('used-ex', 'chest', '1.0')]);

    const result = pickSlotExercise(pool, slotDef, context({ weekPickedIdsForGroup: new Set(['used-ex']) }));

    expect(result!.exercise.id).toBe('used-ex');
  });
});

describe('seededRank', () => {
  it('is stable for the same (seed, exerciseId) pair', () => {
    expect(seededRank(7, 'bench-press')).toBe(seededRank(7, 'bench-press'));
  });

  it('is non-negative', () => {
    expect(seededRank(-99, 'squat')).toBeGreaterThanOrEqual(0);
  });
});
