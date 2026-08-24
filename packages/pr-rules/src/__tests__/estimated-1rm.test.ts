import { E1RM_MAX_VALID_REPS, estimated1RM } from '../estimated-1rm';

describe('estimated1RM', () => {
  it('returns the weight itself at 1 rep', () => {
    expect(estimated1RM(100, 1)).toBe(100);
  });

  it('applies the Epley formula for a mid-range rep count', () => {
    expect(estimated1RM(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
  });

  it('returns a number at the exact validity cutoff', () => {
    expect(estimated1RM(100, E1RM_MAX_VALID_REPS)).not.toBeNull();
  });

  it('returns null one rep above the validity cutoff', () => {
    expect(estimated1RM(100, E1RM_MAX_VALID_REPS + 1)).toBeNull();
  });

  it('returns null for zero reps', () => {
    expect(estimated1RM(100, 0)).toBeNull();
  });

  it('returns null for negative reps', () => {
    expect(estimated1RM(100, -1)).toBeNull();
  });

  it('returns null for zero weight', () => {
    expect(estimated1RM(0, 5)).toBeNull();
  });

  it('returns null for negative weight', () => {
    expect(estimated1RM(-100, 5)).toBeNull();
  });

  it('returns null for non-finite weight', () => {
    expect(estimated1RM(Infinity, 5)).toBeNull();
    expect(estimated1RM(NaN, 5)).toBeNull();
  });

  it('returns null for non-finite reps', () => {
    expect(estimated1RM(100, Infinity)).toBeNull();
    expect(estimated1RM(100, NaN)).toBeNull();
  });
});
