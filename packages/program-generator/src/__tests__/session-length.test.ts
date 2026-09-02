import { estimateSlotMinutes, SESSION_OVERHEAD_MINUTES, WORK_SECONDS_PER_SET } from '../session-length';

describe('estimateSlotMinutes', () => {
  it('computes (sets * (workSeconds + restSeconds)) / 60', () => {
    expect(estimateSlotMinutes(4, 120)).toBe((4 * (45 + 120)) / 60);
  });

  // D-03: session-fit.ts imports these constants rather than re-deriving the time model, so their
  // stability is part of the contract this phase relies on, not just an implementation detail.
  it('keeps WORK_SECONDS_PER_SET and SESSION_OVERHEAD_MINUTES at their current values', () => {
    expect(WORK_SECONDS_PER_SET).toBe(45);
    expect(SESSION_OVERHEAD_MINUTES).toBe(10);
  });
});
