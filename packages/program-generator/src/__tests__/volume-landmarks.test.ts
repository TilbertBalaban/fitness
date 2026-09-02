import { EXPERIENCE_VOLUME_BAND, RIR_LADDER_BY_DAYS_PER_WEEK, rirForCycle, weeklySetTarget } from '../volume-landmarks';

describe('weeklySetTarget', () => {
  it('returns the band lower bound at cycle 0', () => {
    const band = EXPERIENCE_VOLUME_BAND.intermediate.large; // chest is 'large'
    expect(weeklySetTarget('intermediate', 'chest', 0, 4)).toBe(band.mev);
  });

  it('returns a value at or below the band upper bound, strictly greater than cycle 0, on the last training cycle', () => {
    const band = EXPERIENCE_VOLUME_BAND.intermediate.large;
    const cycle0 = weeklySetTarget('intermediate', 'chest', 0, 4);
    const lastCycle = weeklySetTarget('intermediate', 'chest', 3, 4);

    expect(lastCycle).toBeLessThanOrEqual(band.mav);
    expect(lastCycle).toBeGreaterThan(cycle0);
  });

  it('returns exactly mev for a single-training-cycle block', () => {
    expect(weeklySetTarget('intermediate', 'chest', 0, 1)).toBe(EXPERIENCE_VOLUME_BAND.intermediate.large.mev);
  });
});

describe('rirForCycle', () => {
  it('is 3 at cycle 0 for a 4-day week', () => {
    expect(rirForCycle(0, 4)).toBe(3);
  });

  it('is 1 at cycle 3 for a 4-day week', () => {
    expect(rirForCycle(3, 4)).toBe(1);
  });

  it('is 0 at cycle 3 for a 2-day week — fewer sessions ramp nearer failure', () => {
    expect(rirForCycle(3, 2)).toBe(0);
  });

  it('is 1 at cycle 3 for a 6-day week — never below 1', () => {
    expect(rirForCycle(3, 6)).toBe(1);
  });

  it('floors at the last member of the ladder rather than going negative or undefined', () => {
    const ladder = RIR_LADDER_BY_DAYS_PER_WEEK[2]!;
    expect(rirForCycle(9, 2)).toBe(ladder[ladder.length - 1]);
    expect(rirForCycle(9, 2)).toBe(0);
  });
});
