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

  it('holds the weight and same weight/reps when reps-plus-RIR does not exceed expected performance', () => {
    const result = recommendNextPrescription(
      baseInput({ sessions: sessionsWith([loggedSet({ weightKg: '100.000', reps: 7, rir: 1 })]) }),
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
});
