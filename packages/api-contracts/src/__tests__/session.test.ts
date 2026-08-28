import {
  countsTowardRecords,
  countsTowardWorkingVolume,
  PR_TYPES,
  RECORDS_EXCLUDED_SET_TYPES,
  SET_TYPES,
  WARMUP_SET_TYPE,
  WORKING_SET_TYPE,
  WORKING_VOLUME_EXCLUDED_SET_TYPES,
  WORKOUT_SESSION_STATUSES,
} from '../session';

describe('WORKOUT_SESSION_STATUSES', () => {
  it('deep-equals [in_progress, paused, completed, discarded] in that exact order', () => {
    expect(WORKOUT_SESSION_STATUSES).toEqual(['in_progress', 'paused', 'completed', 'discarded']);
  });

  it('has exactly four members', () => {
    expect(WORKOUT_SESSION_STATUSES.length).toBe(4);
  });

  it('has no automatic timeout-based abandoned value', () => {
    expect((WORKOUT_SESSION_STATUSES as readonly string[]).includes('abandoned')).toBe(false);
  });
});

describe('SET_TYPES', () => {
  it('deep-equals the seven-value vocabulary in that exact order', () => {
    expect(SET_TYPES).toEqual(['normal', 'warmup', 'drop', 'myorep', 'partial', 'failure', 'amrap']);
  });

  it('has exactly seven members', () => {
    expect(SET_TYPES.length).toBe(7);
  });

  it('contains WORKING_SET_TYPE and WARMUP_SET_TYPE', () => {
    expect((SET_TYPES as readonly string[]).includes(WORKING_SET_TYPE)).toBe(true);
    expect((SET_TYPES as readonly string[]).includes(WARMUP_SET_TYPE)).toBe(true);
  });
});

describe('WORKING_SET_TYPE / WARMUP_SET_TYPE', () => {
  it('are normal and warmup respectively', () => {
    expect(WORKING_SET_TYPE).toBe('normal');
    expect(WARMUP_SET_TYPE).toBe('warmup');
  });
});

describe('PR_TYPES', () => {
  it('deep-equals the four D-30 PR types in that exact order', () => {
    expect(PR_TYPES).toEqual(['heaviest_weight', 'best_e1rm', 'most_reps_at_weight', 'best_set_volume']);
  });

  it('has exactly four members', () => {
    expect(PR_TYPES.length).toBe(4);
  });
});

// D-17: exactly warmup is excluded — the six other SET_TYPES values (including the two children
// exclusive to grouping, drop and partial) are all genuine working effort and all count.
describe('countsTowardWorkingVolume', () => {
  it.each(SET_TYPES.map((setType) => [setType, setType !== 'warmup'] as const))(
    '%s counts toward working volume: %s',
    (setType, expected) => {
      expect(countsTowardWorkingVolume(setType)).toBe(expected);
    },
  );

  it('excludes exactly one of the seven values', () => {
    const excluded = SET_TYPES.filter((setType) => !countsTowardWorkingVolume(setType));
    expect(excluded).toEqual(['warmup']);
  });
});

// D-18: warmup AND partial are excluded — a partial-ROM rep must never set a max-based PR.
describe('countsTowardRecords', () => {
  it.each(SET_TYPES.map((setType) => [setType, setType !== 'warmup' && setType !== 'partial'] as const))(
    '%s counts toward records: %s',
    (setType, expected) => {
      expect(countsTowardRecords(setType)).toBe(expected);
    },
  );

  it('excludes exactly two of the seven values', () => {
    const excluded = SET_TYPES.filter((setType) => !countsTowardRecords(setType));
    expect(excluded).toEqual(['warmup', 'partial']);
  });
});

describe('WORKING_VOLUME_EXCLUDED_SET_TYPES / RECORDS_EXCLUDED_SET_TYPES', () => {
  it('are derived from the predicates above, not a re-typed literal', () => {
    expect(WORKING_VOLUME_EXCLUDED_SET_TYPES).toEqual(['warmup']);
    expect(RECORDS_EXCLUDED_SET_TYPES).toEqual(['warmup', 'partial']);
  });
});
