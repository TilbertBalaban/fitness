import { parseTargetField, setExerciseTargets, validateTargets, type TargetDraft } from '../programs/targets';
import { getPowerSync } from '../powersync';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

const ALL_NULL: TargetDraft = {
  targetSets: null,
  targetRepMin: null,
  targetRepMax: null,
  targetRir: null,
  targetRestSeconds: null,
};

function draft(overrides: Partial<TargetDraft>): TargetDraft {
  return { ...ALL_NULL, ...overrides };
}

function fakeDb(setSpy: jest.Mock, whereSpy: jest.Mock) {
  return {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        setSpy(values);
        return {
          where: (condition: unknown) => {
            whereSpy(condition);
            return Promise.resolve();
          },
        };
      },
    }),
  } as unknown as ReturnType<typeof getPowerSync>;
}

describe('parseTargetField', () => {
  it("is null for an empty string — unprescribed, not zero", () => {
    expect(parseTargetField('')).toEqual({ value: null });
  });

  it('is null for a whitespace-only string', () => {
    expect(parseTargetField('   ')).toEqual({ value: null });
  });

  it('parses a positive integer', () => {
    expect(parseTargetField('8')).toEqual({ value: 8 });
  });

  it('rejects a non-integer as whole-number', () => {
    expect(parseTargetField('8.5')).toEqual({ error: 'whole-number' });
  });

  it('rejects a negative value', () => {
    expect(parseTargetField('-1')).toEqual({ error: 'negative' });
  });

  it('rejects a non-numeric string', () => {
    expect(parseTargetField('abc')).toEqual({ error: 'not-a-number' });
  });

  it('parses zero — parsing does not decide whether zero is meaningful for the field', () => {
    expect(parseTargetField('0')).toEqual({ value: 0 });
  });
});

describe('validateTargets', () => {
  it('an all-null draft is savable — every field unset yields no errors', () => {
    expect(validateTargets(ALL_NULL)).toEqual({});
  });

  it('targetSets of 0 is invalid; 1 is the boundary and valid', () => {
    expect(validateTargets(draft({ targetSets: 0 }))).toHaveProperty('targetSets');
    expect(validateTargets(draft({ targetSets: 1 }))).not.toHaveProperty('targetSets');
  });

  it('targetRestSeconds of 0 is valid (a real back-to-back prescription), unlike targetSets of 0', () => {
    expect(validateTargets(draft({ targetRestSeconds: 0 }))).not.toHaveProperty('targetRestSeconds');
    expect(validateTargets(draft({ targetSets: 0 }))).toHaveProperty('targetSets');
  });

  it('a rep max below rep min is refused, naming targetRepMax', () => {
    const errors = validateTargets(draft({ targetRepMin: 12, targetRepMax: 8 }));
    expect(errors.targetRepMax).toBe('min-above-max');
  });

  it('an equal rep min and max is a valid fixed-rep prescription', () => {
    expect(validateTargets(draft({ targetRepMin: 8, targetRepMax: 8 }))).toEqual({});
  });

  it('a half-open rep range (min set, max unset) is valid', () => {
    expect(validateTargets(draft({ targetRepMin: 8, targetRepMax: null }))).toEqual({});
  });
});

describe('setExerciseTargets', () => {
  it('issues exactly one update, for the given id, writing all five columns including nulls', async () => {
    const setSpy = jest.fn();
    const whereSpy = jest.fn();
    const db = fakeDb(setSpy, whereSpy);

    await setExerciseTargets('rex-1', draft({ targetSets: 3, targetRepMin: 8, targetRepMax: 12 }), db);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith({
      targetSets: 3,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRir: null,
      targetRestSeconds: null,
    });
  });

  it('throws and issues zero updates for a draft that fails validation', async () => {
    const setSpy = jest.fn();
    const whereSpy = jest.fn();
    const db = fakeDb(setSpy, whereSpy);

    await expect(setExerciseTargets('rex-1', draft({ targetSets: 0 }), db)).rejects.toThrow();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('writes to an explicitly-passed database and never resolves getPowerSync', async () => {
    getPowerSyncMock.mockClear();
    const setSpy = jest.fn();
    const whereSpy = jest.fn();
    const db = fakeDb(setSpy, whereSpy);

    await setExerciseTargets('rex-1', ALL_NULL, db);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).not.toHaveBeenCalled();
  });

  it('falls back to getPowerSync() exactly once when no database argument is passed', async () => {
    const setSpy = jest.fn();
    const whereSpy = jest.fn();
    getPowerSyncMock.mockReturnValue(fakeDb(setSpy, whereSpy));

    await setExerciseTargets('rex-1', ALL_NULL);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(getPowerSyncMock).toHaveBeenCalledTimes(1);
  });
});

// WR-01: the server's shape validator rejects a negative target with invalid_field, which the
// connector treats as terminal — it completes the crud transaction and the offline write is gone.
// These are the fields validateTargets did not cover.
describe('validateTargets — non-negative shape (WR-01)', () => {
  it('refuses a negative rest, which the server would terminally reject', () => {
    expect(validateTargets(draft({ targetRestSeconds: -5 })).targetRestSeconds).toBe('negative');
  });

  it('refuses a negative RIR', () => {
    expect(validateTargets(draft({ targetRir: -1 })).targetRir).toBe('negative');
  });

  it('still accepts zero for both — they are real prescriptions, not absences', () => {
    expect(validateTargets(draft({ targetRestSeconds: 0, targetRir: 0 }))).toEqual({});
  });

  it('refuses a rep max below one even when rep min is unset, so the pair rule cannot be dodged', () => {
    expect(validateTargets(draft({ targetRepMax: 0 })).targetRepMax).toBe('below-minimum');
    expect(validateTargets(draft({ targetRepMax: -3 })).targetRepMax).toBe('below-minimum');
  });

  it('still names min-above-max when both halves are otherwise in range', () => {
    expect(validateTargets(draft({ targetRepMin: 12, targetRepMax: 8 })).targetRepMax).toBe('min-above-max');
  });
});
