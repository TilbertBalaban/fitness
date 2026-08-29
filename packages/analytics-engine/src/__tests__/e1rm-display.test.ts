import { E1RM_MAX_VALID_REPS } from '@fitness/pr-rules';
import { E1RM_ABOVE_CAP_COPY, resolveE1rmDisplay, type E1rmCandidateSet } from '../e1rm-display';

const VALID_SET: E1rmCandidateSet = { weightKg: '100.000', reps: 5 };
const ABOVE_CAP_SET: E1rmCandidateSet = { weightKg: '80.000', reps: E1RM_MAX_VALID_REPS + 2 };

describe('E1RM_ABOVE_CAP_COPY', () => {
  it('interpolates the imported rep cap so the copy and the rule cannot drift', () => {
    expect(E1RM_ABOVE_CAP_COPY).toContain(String(E1RM_MAX_VALID_REPS));
  });
});

describe('resolveE1rmDisplay', () => {
  it('returns the value branch with a formatted string when a valid estimate exists', () => {
    const display = resolveE1rmDisplay({ sets: [VALID_SET, ABOVE_CAP_SET], unit: 'kg' });

    expect(display.kind).toBe('value');
    expect(display.kind === 'value' && display.display).toBe('116.67 kg');
  });

  it('returns above-cap when weighted sets exist but every one is above the rep cap', () => {
    expect(resolveE1rmDisplay({ sets: [ABOVE_CAP_SET], unit: 'kg' })).toEqual({ kind: 'above-cap' });
  });

  it('returns unavailable when there are no weighted sets at all', () => {
    expect(resolveE1rmDisplay({ sets: [], unit: 'kg' })).toEqual({ kind: 'unavailable' });
    expect(resolveE1rmDisplay({ sets: [{ weightKg: null, reps: 8 }], unit: 'kg' })).toEqual({ kind: 'unavailable' });
  });

  it('returns unavailable rather than above-cap when the estimate failed for a reason other than the rep cap', () => {
    expect(resolveE1rmDisplay({ sets: [{ weightKg: '100.000', reps: 0 }], unit: 'kg' })).toEqual({ kind: 'unavailable' });
  });

  it('returns unavailable when the injected estimator throws', () => {
    const throwing = () => {
      throw new Error('estimator exploded');
    };

    expect(resolveE1rmDisplay({ sets: [VALID_SET], unit: 'kg', estimate: throwing })).toEqual({ kind: 'unavailable' });
  });

  it('applies no set-type predicate of its own — the caller owns the population', () => {
    const display = resolveE1rmDisplay({ sets: [{ weightKg: '110.000', reps: 3 }], unit: 'kg' });

    expect(display.kind).toBe('value');
  });

  it('formats in the requested display unit', () => {
    const display = resolveE1rmDisplay({ sets: [VALID_SET], unit: 'lb' });

    expect(display.kind === 'value' && display.display.endsWith(' lb')).toBe(true);
  });
});
