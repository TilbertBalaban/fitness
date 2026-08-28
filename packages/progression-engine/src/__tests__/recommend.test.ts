import { resolveInventory, type EquipmentProfileLike } from '@fitness/plate-math';
import { recommendNextPrescription } from '../recommend';
import type { ExerciseSessionSets, LoggedSetInput, RecommendInput } from '../result';

function inventoryFrom(overrides: Partial<EquipmentProfileLike> = {}) {
  return resolveInventory({
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [],
    dumbbells: [],
    machines: [],
    ...overrides,
  });
}

function loggedSet(overrides: Partial<LoggedSetInput> = {}): LoggedSetInput {
  return {
    id: 's1',
    parentSetId: null,
    setType: 'normal',
    weightKg: '100.000',
    reps: 8,
    rir: 2,
    side: null,
    completed: true,
    ...overrides,
  };
}

function sessionsWith(sets: LoggedSetInput[]): ExerciseSessionSets[] {
  return [{ sessionId: 'sess-1', sets }];
}

function baseInput(overrides: Partial<RecommendInput> = {}): RecommendInput {
  return {
    sessions: sessionsWith([loggedSet()]),
    prescription: { targetRepMin: 7, targetRepMax: 9, targetRir: 2 },
    equipmentType: 'barbell',
    inventory: inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 1 }] }),
    ...overrides,
  };
}

describe('recommendNextPrescription', () => {
  it('returns no_history for an empty session list', () => {
    expect(recommendNextPrescription(baseInput({ sessions: [] }))).toEqual({ kind: 'no_history' });
  });

  it('returns unavailable/incomplete_prescription when a rep bound is missing', () => {
    const result = recommendNextPrescription(
      baseInput({ prescription: { targetRepMin: null, targetRepMax: 9, targetRir: 2 } }),
    );
    expect(result).toEqual({ kind: 'unavailable', reason: 'incomplete_prescription' });
  });

  it('raises the load and resets reps to targetRepMin when reps-plus-RIR exceeds expected performance', () => {
    const roomyInventory = inventoryFrom({ plates: [{ weightKg: '20.000', pairCount: 4 }] });
    const result = recommendNextPrescription(
      baseInput({
        inventory: roomyInventory,
        sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 20, rir: 5 })]),
      }),
    );
    expect(result).toMatchObject({ kind: 'recommendation', basis: 'load_increase', reps: 7 });
    if (result.kind === 'recommendation') {
      expect(Number(result.weightKg)).toBeGreaterThan(100);
    }
  });

  it('holds the weight and same weight/reps when reps-plus-RIR falls within the tolerance band of expected performance', () => {
    const result = recommendNextPrescription(
      baseInput({ sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 7, rir: 2 })]) }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 7,
      rir: 2,
      basis: 'hold',
      offeredReduction: null,
    });
  });

  it('holds the same weight and bumps reps by one, capped at targetRepMax, when the gym increment is too coarse to move', () => {
    const coarseInventory = inventoryFrom({ plates: [{ weightKg: '50.000', pairCount: 1 }] });
    const result = recommendNextPrescription(
      baseInput({
        inventory: coarseInventory,
        sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 12, rir: 3 })]),
      }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 9,
      rir: 2,
      basis: 'rep_increase',
      offeredReduction: null,
    });
  });

  it('returns unavailable/equipment_unavailable when the equipment type is in the inventory unavailable list', () => {
    const inventory = { ...inventoryFrom(), unavailableEquipmentTypes: ['barbell' as const] };
    const result = recommendNextPrescription(baseInput({ inventory }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'equipment_unavailable' });
  });

  it('never throws on a malformed row and returns unavailable', () => {
    const negativeReps = recommendNextPrescription(baseInput({ sessions: sessionsWith([loggedSet({ reps: -1 })]) }));
    expect(negativeReps.kind).toBe('unavailable');

    const nonFiniteWeight = recommendNextPrescription(
      baseInput({ sessions: sessionsWith([loggedSet({ weightKg: 'not-a-number' })]) }),
    );
    expect(nonFiniteWeight.kind).toBe('unavailable');

    const invertedPrescription = recommendNextPrescription(
      baseInput({ prescription: { targetRepMin: 10, targetRepMax: 5, targetRir: 2 } }),
    );
    expect(invertedPrescription.kind).toBe('unavailable');
  });

  it('progresses a bodyweight movement on reps alone', () => {
    const result = recommendNextPrescription(
      baseInput({
        equipmentType: 'bodyweight',
        sessions: sessionsWith([loggedSet({ weightKg: null, reps: 12, rir: 3 })]),
      }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: null,
      reps: 9,
      rir: 2,
      basis: 'rep_increase',
      offeredReduction: null,
    });
  });

  it('returns failure_rep_increase with the same weight and one more rep when a failure set beats the prior one at the same load', () => {
    const result = recommendNextPrescription(
      baseInput({
        prescription: { targetRepMin: 7, targetRepMax: 15, targetRir: 2 },
        sessions: [
          { sessionId: 'sess-recent', sets: [loggedSet({ id: 'a', rir: 0, reps: 11, weightKg: '100.000' })] },
          { sessionId: 'sess-older', sets: [loggedSet({ id: 'b', rir: 0, reps: 10, weightKg: '100.000' })] },
        ],
      }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 12,
      rir: 2,
      basis: 'failure_rep_increase',
      offeredReduction: null,
    });
  });

  it('holds at the same weight and rep target when a failure set does not beat the prior one', () => {
    const result = recommendNextPrescription(
      baseInput({
        sessions: [
          { sessionId: 'sess-recent', sets: [loggedSet({ id: 'a', rir: 0, reps: 10, weightKg: '100.000' })] },
          { sessionId: 'sess-older', sets: [loggedSet({ id: 'b', rir: 0, reps: 10, weightKg: '100.000' })] },
        ],
      }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 10,
      rir: 2,
      basis: 'hold',
      offeredReduction: null,
    });
  });

  it('holds when a failure set has no prior failure set to compare against', () => {
    const result = recommendNextPrescription(
      baseInput({ sessions: sessionsWith([loggedSet({ rir: 0, reps: 10, weightKg: '100.000' })]) }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 10,
      rir: 2,
      basis: 'hold',
      offeredReduction: null,
    });
  });

  it('produces exactly one recommendation for the exercise, derived from the weaker side, from raw per-side rows through the public entry point', () => {
    const result = recommendNextPrescription(
      baseInput({
        sessions: sessionsWith([
          loggedSet({ id: 'left', side: 'left', weightKg: '100.000', reps: 12, rir: 3 }),
          loggedSet({ id: 'right', parentSetId: 'left', side: 'right', weightKg: '80.000', reps: 8, rir: 1 }),
        ]),
      }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '80.000',
      reps: 7,
      rir: 2,
      basis: 'hold',
      offeredReduction: null,
    });
  });

  it('returns shortfall_hold with no offer when the shortfall streak is below the threshold', () => {
    const shortfallSet = (id: string) => loggedSet({ id, weightKg: '100.000', reps: 6, rir: 1 });
    const result = recommendNextPrescription(
      baseInput({
        sessions: [
          { sessionId: 's2', sets: [shortfallSet('a')] },
          { sessionId: 's1', sets: [shortfallSet('b')] },
        ],
      }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 7,
      rir: 2,
      basis: 'shortfall_hold',
      offeredReduction: null,
    });
  });

  it('returns shortfall_hold with a populated offer when the shortfall streak reaches the threshold', () => {
    const roomyInventory = inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 5 }] });
    const shortfallSet = (id: string) => loggedSet({ id, weightKg: '100.000', reps: 6, rir: 1 });
    const result = recommendNextPrescription(
      baseInput({
        inventory: roomyInventory,
        sessions: [
          { sessionId: 's3', sets: [shortfallSet('a')] },
          { sessionId: 's2', sets: [shortfallSet('b')] },
          { sessionId: 's1', sets: [shortfallSet('c')] },
        ],
      }),
    );
    expect(result).toEqual({
      kind: 'recommendation',
      weightKg: '100.000',
      reps: 7,
      rir: 2,
      basis: 'shortfall_hold',
      offeredReduction: { weightKg: '80.000', reps: 7 },
    });
  });

  it('keeps the recommendation weight and reps identical whether or not an offer is attached', () => {
    const roomyInventory = inventoryFrom({ plates: [{ weightKg: '10.000', pairCount: 5 }] });
    const shortfallSet = (id: string) => loggedSet({ id, weightKg: '100.000', reps: 6, rir: 1 });
    const belowThreshold = recommendNextPrescription(
      baseInput({
        inventory: roomyInventory,
        sessions: [
          { sessionId: 's2', sets: [shortfallSet('a')] },
          { sessionId: 's1', sets: [shortfallSet('b')] },
        ],
      }),
    );
    const atThreshold = recommendNextPrescription(
      baseInput({
        inventory: roomyInventory,
        sessions: [
          { sessionId: 's3', sets: [shortfallSet('a')] },
          { sessionId: 's2', sets: [shortfallSet('b')] },
          { sessionId: 's1', sets: [shortfallSet('c')] },
        ],
      }),
    );
    if (belowThreshold.kind !== 'recommendation' || atThreshold.kind !== 'recommendation') {
      throw new Error('expected both results to be recommendations');
    }
    expect(atThreshold.weightKg).toBe(belowThreshold.weightKg);
    expect(atThreshold.reps).toBe(belowThreshold.reps);
    expect(belowThreshold.offeredReduction).toBeNull();
    expect(atThreshold.offeredReduction).not.toBeNull();
  });
});
