import type { CandidatePool, PoolCandidate } from '../candidate-pool';
import { pickSlotExercise, seededRank } from '../slot-fill';

function candidate(id: string, muscleGroupId: string, weightFactor: string, role: 'primary' | 'secondary' = 'primary'): PoolCandidate {
  return {
    exercise: { id, name: id, equipmentRequired: null, movementPattern: null },
    mappings: [{ exerciseId: id, muscleGroupId: muscleGroupId as never, role, weightFactor }],
  };
}

function poolOf(candidates: PoolCandidate[]): CandidatePool {
  return { candidates, mappingsByExerciseId: new Map(candidates.map((c) => [c.exercise.id, c.mappings])) };
}

describe('pickSlotExercise', () => {
  it('returns the same candidate on every call for a given variantSeed when scores tie', () => {
    const pool = poolOf([candidate('a', 'chest', '1.0'), candidate('b', 'chest', '1.0')]);
    const slotDef = { muscleGroupId: 'chest' as const };

    const first = pickSlotExercise(pool, slotDef, 42, new Set());
    const second = pickSlotExercise(pool, slotDef, 42, new Set());

    expect(first).not.toBeNull();
    expect(first!.exercise.id).toBe(second!.exercise.id);
  });

  it('may return a different candidate for a different variantSeed on a tie', () => {
    const pool = poolOf([candidate('bench-press', 'chest', '1.0'), candidate('overhead-press', 'chest', '1.0')]);
    const slotDef = { muscleGroupId: 'chest' as const };

    const results = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      results.add(pickSlotExercise(pool, slotDef, seed, new Set())!.exercise.id);
    }

    expect(results.size).toBeGreaterThan(1);
  });

  it('does not mutate or reorder its input candidates array', () => {
    const candidates = [candidate('a', 'chest', '0.5'), candidate('b', 'chest', '1.0')];
    const pool = poolOf(candidates);
    const snapshot = [...candidates];

    pickSlotExercise(pool, { muscleGroupId: 'chest' as const }, 1, new Set());

    expect(candidates).toEqual(snapshot);
  });

  it('returns null when every candidate has already been picked for the day', () => {
    const pool = poolOf([candidate('a', 'chest', '1.0')]);

    const result = pickSlotExercise(pool, { muscleGroupId: 'chest' as const }, 1, new Set(['a']));

    expect(result).toBeNull();
  });

  it('returns null when no candidate maps to the requested muscle group', () => {
    const pool = poolOf([candidate('a', 'lats', '1.0')]);

    const result = pickSlotExercise(pool, { muscleGroupId: 'chest' as const }, 1, new Set());

    expect(result).toBeNull();
  });

  it('picks the higher-scoring candidate when scores differ', () => {
    const pool = poolOf([candidate('low', 'chest', '0.3'), candidate('high', 'chest', '1.0')]);

    const result = pickSlotExercise(pool, { muscleGroupId: 'chest' as const }, 1, new Set());

    expect(result!.exercise.id).toBe('high');
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
