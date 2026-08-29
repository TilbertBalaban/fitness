import { EXPERIENCE_VOLUME_BAND, RIR_PROGRESSION, rirForCycle, weeklySetTarget } from '../volume-landmarks';

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
  it('is 3 at cycle 0', () => {
    expect(rirForCycle(0)).toBe(3);
  });

  it('is 1 at cycle 3', () => {
    expect(rirForCycle(3)).toBe(1);
  });

  it('floors at the last member of the progression rather than going negative or undefined', () => {
    expect(rirForCycle(9)).toBe(RIR_PROGRESSION[RIR_PROGRESSION.length - 1]);
    expect(rirForCycle(9)).toBe(1);
  });
});
