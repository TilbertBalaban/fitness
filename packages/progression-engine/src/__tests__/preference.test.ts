import { resolveProgressionStep } from '../preference';

const PRESCRIPTION = { targetRepMin: 7, targetRepMax: 9 };

describe('resolveProgressionStep', () => {
  describe('widen_rep_range_first', () => {
    it('advances the rep target at the same load when below the top of the range', () => {
      const step = resolveProgressionStep({
        performance: { reps: 7 },
        prescription: PRESCRIPTION,
        preference: 'widen_rep_range_first',
      });
      expect(step).toEqual({ kind: 'advance_reps', reps: 8 });
    });

    it('raises the load and resets to the bottom of the range once reps reach the top', () => {
      const step = resolveProgressionStep({
        performance: { reps: 9 },
        prescription: PRESCRIPTION,
        preference: 'widen_rep_range_first',
      });
      expect(step).toEqual({ kind: 'raise_load', reps: 7 });
    });

    it('raises the load and resets to the bottom of the range when reps exceed the top', () => {
      const step = resolveProgressionStep({
        performance: { reps: 20 },
        prescription: PRESCRIPTION,
        preference: 'widen_rep_range_first',
      });
      expect(step).toEqual({ kind: 'raise_load', reps: 7 });
    });

    it('never advances the rep target above the range top', () => {
      const step = resolveProgressionStep({
        performance: { reps: 8 },
        prescription: PRESCRIPTION,
        preference: 'widen_rep_range_first',
      });
      expect(step.kind).toBe('advance_reps');
      expect(step.reps).toBeLessThanOrEqual(PRESCRIPTION.targetRepMax);
    });
  });

  describe('match_previous_weight', () => {
    it('raises the load and resets to the bottom of the range on a surplus below the top of the range', () => {
      const step = resolveProgressionStep({
        performance: { reps: 7 },
        prescription: PRESCRIPTION,
        preference: 'match_previous_weight',
      });
      expect(step).toEqual({ kind: 'raise_load', reps: 7 });
    });

    it('raises the load and resets to the bottom of the range on a surplus at the top of the range', () => {
      const step = resolveProgressionStep({
        performance: { reps: 9 },
        prescription: PRESCRIPTION,
        preference: 'match_previous_weight',
      });
      expect(step).toEqual({ kind: 'raise_load', reps: 7 });
    });

    it('never resolves to a rep target above the range top', () => {
      const step = resolveProgressionStep({
        performance: { reps: 50 },
        prescription: PRESCRIPTION,
        preference: 'match_previous_weight',
      });
      expect(step.reps).toBeLessThanOrEqual(PRESCRIPTION.targetRepMax);
      expect(step.reps).toBeGreaterThanOrEqual(PRESCRIPTION.targetRepMin);
    });
  });

  it('produces a different step for the same below-ceiling performance depending on preference', () => {
    const widen = resolveProgressionStep({
      performance: { reps: 7 },
      prescription: PRESCRIPTION,
      preference: 'widen_rep_range_first',
    });
    const match = resolveProgressionStep({
      performance: { reps: 7 },
      prescription: PRESCRIPTION,
      preference: 'match_previous_weight',
    });
    expect(widen.kind).toBe('advance_reps');
    expect(match.kind).toBe('raise_load');
  });
});
