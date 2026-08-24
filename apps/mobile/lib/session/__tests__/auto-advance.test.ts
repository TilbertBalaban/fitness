import { shouldAutoAdvance } from '../auto-advance';

const WORKING = { setType: 'normal', completed: true };
const WORKING_INCOMPLETE = { setType: 'normal', completed: false };
const WARMUP = { setType: 'warmup', completed: true };

describe('shouldAutoAdvance (LOG-13)', () => {
  it('is null when disabled, even with every working set complete', () => {
    expect(
      shouldAutoAdvance({ sets: [WORKING], enabled: false, currentIndex: 0, exerciseCount: 3, completedSetType: 'normal' }),
    ).toBeNull();
  });

  it('is null when a working set remains incomplete', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING, WORKING_INCOMPLETE],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
      }),
    ).toBeNull();
  });

  it('is null when the just-completed set was a warm-up, even if every working set already stood complete', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING, WARMUP],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'warmup',
      }),
    ).toBeNull();
  });

  it('is null on the last exercise — no wrap-around', () => {
    expect(
      shouldAutoAdvance({ sets: [WORKING], enabled: true, currentIndex: 2, exerciseCount: 3, completedSetType: 'normal' }),
    ).toBeNull();
  });

  it('returns the next index once every working set is complete, not the last exercise, and the completion was a working set', () => {
    expect(
      shouldAutoAdvance({ sets: [WORKING, WORKING], enabled: true, currentIndex: 0, exerciseCount: 3, completedSetType: 'normal' }),
    ).toBe(1);
  });

  it('never infers set type from position — a warm-up at a low index and a working set at a high one still resolve correctly', () => {
    const sets = [
      { setType: 'normal', completed: true },
      { setType: 'warmup', completed: true },
    ];
    expect(
      shouldAutoAdvance({ sets, enabled: true, currentIndex: 0, exerciseCount: 2, completedSetType: 'normal' }),
    ).toBe(1);
  });

  it('is null when no working sets exist at all', () => {
    expect(
      shouldAutoAdvance({ sets: [WARMUP], enabled: true, currentIndex: 0, exerciseCount: 3, completedSetType: 'normal' }),
    ).toBeNull();
  });
});
