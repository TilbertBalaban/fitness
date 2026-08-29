import { replayPersonalRecords, type PersonalRecordReplayInput, type ReplaySetInput } from '../personal-record-replay';

function set(overrides: Partial<ReplaySetInput> & { loggedSetId: string }): ReplaySetInput {
  return {
    localDate: '2026-01-01',
    loggedAt: '2026-01-01T10:00:00.000Z',
    setIndex: 1,
    setType: 'normal',
    completed: true,
    weightKg: 100,
    reps: 5,
    ...overrides,
  };
}

function pairs(records: ReturnType<typeof replayPersonalRecords>): string[] {
  return records.map((record) => `${record.loggedSetId}:${record.prType}`);
}

describe('replayPersonalRecords', () => {
  it('confirms heaviest_weight for the second and third of three ascending-weight sets, over the rising prior best', () => {
    // The first eligible set of a truly empty history has no floor to beat: @fitness/pr-rules'
    // own detectPrs treats a null PriorBest as "nothing to compare against yet" and confirms it
    // as the initial baseline (see the null-check in detectPrs's heaviest_weight branch) — the
    // same behaviour the client's own walkSessionPrs already relies on. This is not re-derived
    // here; it is asserted as-is per D-07. What this test actually proves is the ascending
    // shape: each heavier set in turn beats the one immediately before it.
    const input: PersonalRecordReplayInput = {
      exerciseId: 'ex-ascending',
      sets: [
        set({ loggedSetId: 's1', setIndex: 1, weightKg: 100 }),
        set({ loggedSetId: 's2', setIndex: 2, weightKg: 110 }),
        set({ loggedSetId: 's3', setIndex: 3, weightKg: 120 }),
      ],
    };

    const records = replayPersonalRecords(input);
    const heaviestWeightSetIds = records.filter((r) => r.prType === 'heaviest_weight').map((r) => r.loggedSetId);

    expect(heaviestWeightSetIds).toEqual(['s1', 's2', 's3']);
  });

  it('a set that ties the prior best confirms no record at all — strict improvement only', () => {
    const input: PersonalRecordReplayInput = {
      exerciseId: 'ex-tie',
      sets: [
        set({ loggedSetId: 's1', setIndex: 1, weightKg: 100, reps: 5 }),
        set({ loggedSetId: 's2', setIndex: 2, weightKg: 100, reps: 5 }),
      ],
    };

    const records = replayPersonalRecords(input);

    expect(records.some((r) => r.loggedSetId === 's2')).toBe(false);
  });

  it('a warm-up set and a partial set confirm no record and do not advance the prior best, despite carrying real weight and reps', () => {
    const input: PersonalRecordReplayInput = {
      exerciseId: 'ex-excluded-types',
      sets: [
        set({ loggedSetId: 'baseline', setIndex: 1, weightKg: 100, reps: 5 }),
        // Both carry weight/reps well above the baseline — proving the exclusion below is the
        // records predicate deciding, not missing data.
        set({ loggedSetId: 'warmup-set', setIndex: 2, setType: 'warmup', weightKg: 150, reps: 3 }),
        set({ loggedSetId: 'partial-set', setIndex: 3, setType: 'partial', weightKg: 160, reps: 3 }),
        set({ loggedSetId: 'next-normal', setIndex: 4, weightKg: 110, reps: 5 }),
      ],
    };

    const records = replayPersonalRecords(input);

    expect(records.some((r) => r.loggedSetId === 'warmup-set')).toBe(false);
    expect(records.some((r) => r.loggedSetId === 'partial-set')).toBe(false);
    // 110 beats the baseline's 100, not the warm-up/partial sets' 150/160 — proving those two
    // never advanced the running prior best.
    expect(records.some((r) => r.loggedSetId === 'next-normal' && r.prType === 'heaviest_weight')).toBe(true);
  });

  it('removing the middle set from a history and replaying again confirms a different set of pairs — a fresh answer, never an append', () => {
    const full: PersonalRecordReplayInput = {
      exerciseId: 'ex-removal',
      sets: [
        set({ loggedSetId: 's1', setIndex: 1, weightKg: 100 }),
        set({ loggedSetId: 's2', setIndex: 2, weightKg: 110 }),
        set({ loggedSetId: 's3', setIndex: 3, weightKg: 120 }),
      ],
    };
    const withMiddleRemoved: PersonalRecordReplayInput = {
      exerciseId: 'ex-removal',
      sets: [set({ loggedSetId: 's1', setIndex: 1, weightKg: 100 }), set({ loggedSetId: 's3', setIndex: 3, weightKg: 120 })],
    };

    const fullPairs = pairs(replayPersonalRecords(full));
    const reducedPairs = pairs(replayPersonalRecords(withMiddleRemoved));

    expect(reducedPairs).not.toEqual(fullPairs);
    expect(reducedPairs.some((pair) => pair.startsWith('s2:'))).toBe(false);
  });

  it('moving a session earlier reorders which set counted as prior, and the confirmed pairs change accordingly', () => {
    const before: PersonalRecordReplayInput = {
      exerciseId: 'ex-reorder',
      sets: [
        set({ loggedSetId: 'later-heavier', localDate: '2026-01-10', setIndex: 1, weightKg: 100 }),
        set({ loggedSetId: 'earlier-lighter', localDate: '2026-01-05', setIndex: 1, weightKg: 90 }),
      ],
    };
    // The formerly-later, heavier set's session is backfilled to an earlier date than the other
    // set — it now replays FIRST and becomes the baseline; the other set, now evaluated second,
    // is lighter than that baseline and confirms nothing.
    const afterMove: PersonalRecordReplayInput = {
      exerciseId: 'ex-reorder',
      sets: [
        set({ loggedSetId: 'later-heavier', localDate: '2026-01-01', setIndex: 1, weightKg: 100 }),
        set({ loggedSetId: 'earlier-lighter', localDate: '2026-01-05', setIndex: 1, weightKg: 90 }),
      ],
    };

    const beforePairs = pairs(replayPersonalRecords(before));
    const afterPairs = pairs(replayPersonalRecords(afterMove));

    expect(beforePairs.some((pair) => pair.startsWith('earlier-lighter:heaviest_weight'))).toBe(true);
    expect(afterPairs.some((pair) => pair.startsWith('earlier-lighter:heaviest_weight'))).toBe(false);
    expect(beforePairs).not.toEqual(afterPairs);
  });

  it('an exercise with no completed record-eligible sets replays to an empty result rather than throwing', () => {
    expect(() => replayPersonalRecords({ exerciseId: 'ex-empty', sets: [] })).not.toThrow();
    expect(replayPersonalRecords({ exerciseId: 'ex-empty', sets: [] })).toEqual([]);

    const onlyExcluded: PersonalRecordReplayInput = {
      exerciseId: 'ex-only-warmups',
      sets: [set({ loggedSetId: 's1', setType: 'warmup' }), set({ loggedSetId: 's2', setType: 'partial' })],
    };
    expect(replayPersonalRecords(onlyExcluded)).toEqual([]);
  });

  it('two replays over identical input produce identical results in identical order', () => {
    const input: PersonalRecordReplayInput = {
      exerciseId: 'ex-idempotent',
      sets: [
        set({ loggedSetId: 's1', setIndex: 1, weightKg: 100, reps: 5 }),
        set({ loggedSetId: 's2', setIndex: 2, weightKg: 110, reps: 3 }),
        set({ loggedSetId: 's3', setIndex: 3, weightKg: 90, reps: 8 }),
      ],
    };

    const first = replayPersonalRecords(input);
    const second = replayPersonalRecords(input);

    expect(second).toEqual(first);
  });

  it('a set with a null weightKg confirms no record', () => {
    const input: PersonalRecordReplayInput = {
      exerciseId: 'ex-null-weight',
      sets: [set({ loggedSetId: 's1', weightKg: null })],
    };

    expect(replayPersonalRecords(input)).toEqual([]);
  });
});
