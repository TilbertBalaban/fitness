import { applyEmphasis } from '../emphasis';

describe('applyEmphasis', () => {
  it('clamps an emphasized value to the band mav rather than the raw multiplied value', () => {
    expect(applyEmphasis(12, 'emphasize', { mev: 10, mav: 14 })).toBe(14);
  });

  it('never drops a deprioritized group below the band mev', () => {
    expect(applyEmphasis(10, 'deprioritize', { mev: 10, mav: 18 })).toBe(10);
  });

  it('leaves a normal-level value unchanged when it is already within band', () => {
    expect(applyEmphasis(12, 'normal', { mev: 8, mav: 16 })).toBe(12);
  });

  it('keeps a value landing exactly on mev rather than pushing it below', () => {
    // 10 * 0.7 = 7, rounds to 7, clamps up to mev (10) — never pushed further down.
    expect(applyEmphasis(10, 'deprioritize', { mev: 10, mav: 20 })).toBe(10);
  });

  it('keeps a value landing exactly on mav rather than pushing it above', () => {
    // 10 * 1.3 = 13, rounds to 13, clamps down to mav (13) if mav is set to that boundary.
    expect(applyEmphasis(10, 'emphasize', { mev: 5, mav: 13 })).toBe(13);
  });
});
