import type { TargetOverride } from '@fitness/api-contracts';
import {
  parseTargetField,
  setExerciseTargets,
  validateResolvedOverrides,
  validateTargets,
  type TargetDraft,
} from '../programs/targets';
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

// The base write now reads this slot's cycle overrides first, so the fake answers a select too —
// an empty list is the no-overrides case every pre-existing assertion below relies on.
function fakeDb(setSpy: jest.Mock, whereSpy: jest.Mock, overrideRows: TargetOverride[] = []) {
  return {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(overrideRows) }),
    }),
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

// WR-06: validateTargets' ordering rule needs both halves of the rep range non-null, and a sparse
// override names at most one. The pair is therefore only ever invalid after the merge — the exact
// value the slot row renders and log-set.ts snapshots.
describe('validateResolvedOverrides (WR-06)', () => {
  it('accepts an override that resolves to a valid range', () => {
    const base = draft({ targetRepMin: 8, targetRepMax: 12 });
    expect(validateResolvedOverrides(base, [{ targetRepMax: 10 }])).toEqual({});
  });

  it('rejects a base whose new rep min inverts an override that only names rep max', () => {
    const base = draft({ targetRepMin: 11, targetRepMax: 12 });
    expect(validateResolvedOverrides(base, [{ targetRepMax: 9 }]).targetRepMax).toBe('cycle-conflict');
  });

  it('rejects a base whose new rep max inverts an override that only names rep min', () => {
    const base = draft({ targetRepMin: 6, targetRepMax: 8 });
    expect(validateResolvedOverrides(base, [{ targetRepMin: 12 }]).targetRepMax).toBe('cycle-conflict');
  });

  it('names cycle-conflict rather than min-above-max — the offending number is not the one being edited', () => {
    const base = draft({ targetRepMin: 11, targetRepMax: 12 });
    const errors = validateResolvedOverrides(base, [{ targetRepMax: 9 }]);
    expect(Object.values(errors)).not.toContain('min-above-max');
  });

  it('checks every override, not just the first', () => {
    const base = draft({ targetRepMin: 11, targetRepMax: 12 });
    const overrides: TargetOverride[] = [{ targetRepMax: 12 }, { targetRepMax: 9 }];
    expect(validateResolvedOverrides(base, overrides).targetRepMax).toBe('cycle-conflict');
  });

  it('accepts a slot with no overrides at all', () => {
    expect(validateResolvedOverrides(draft({ targetRepMin: 11, targetRepMax: 12 }), [])).toEqual({});
  });

  it('catches a base sets value an override would resolve below the minimum', () => {
    // An override naming only rep max inherits the base's sets; a base of 0 is already caught by
    // validateTargets, so this asserts the merged view agrees rather than diverging.
    expect(validateResolvedOverrides(draft({ targetSets: 0 }), [{ targetRepMax: 9 }]).targetSets).toBe(
      'cycle-conflict',
    );
  });
});

describe('setExerciseTargets — a base edit cannot invert a cycle (WR-06)', () => {
  it('refuses a base rep min that would leave a cycle resolving to repMin above repMax', async () => {
    const setSpy = jest.fn();
    const db = fakeDb(setSpy, jest.fn(), [{ targetRepMax: 9 }] as TargetOverride[]);

    await expect(
      setExerciseTargets('rex-1', draft({ targetRepMin: 11, targetRepMax: 12 }), db),
    ).rejects.toThrow('cycle-conflict');
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('allows the same base edit once the override no longer conflicts', async () => {
    const setSpy = jest.fn();
    const db = fakeDb(setSpy, jest.fn(), [{ targetRepMax: 12 }] as TargetOverride[]);

    await setExerciseTargets('rex-1', draft({ targetRepMin: 11, targetRepMax: 12 }), db);

    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});
