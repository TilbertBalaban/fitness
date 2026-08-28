import { DEFAULT_PROGRESSION_PREFERENCE, PROGRESSION_PREFERENCES, isProgressionPreference } from '../progression';

describe('PROGRESSION_PREFERENCES', () => {
  it('has exactly the two D-07 members in the declared order', () => {
    expect(PROGRESSION_PREFERENCES).toEqual(['widen_rep_range_first', 'match_previous_weight']);
  });
});

describe('DEFAULT_PROGRESSION_PREFERENCE', () => {
  it('is the widen-the-rep-range-first value', () => {
    expect(DEFAULT_PROGRESSION_PREFERENCE).toBe('widen_rep_range_first');
  });

  it('is itself a member of the tuple', () => {
    expect(PROGRESSION_PREFERENCES).toContain(DEFAULT_PROGRESSION_PREFERENCE);
  });
});

describe('isProgressionPreference', () => {
  it('accepts both recognised members', () => {
    expect(isProgressionPreference('widen_rep_range_first')).toBe(true);
    expect(isProgressionPreference('match_previous_weight')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isProgressionPreference('')).toBe(false);
  });

  it('rejects an arbitrary string', () => {
    expect(isProgressionPreference('some_other_value')).toBe(false);
  });

  it('rejects null', () => {
    expect(isProgressionPreference(null)).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isProgressionPreference(42)).toBe(false);
    expect(isProgressionPreference({})).toBe(false);
    expect(isProgressionPreference(undefined)).toBe(false);
  });
});
