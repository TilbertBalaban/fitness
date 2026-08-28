import { shouldAutoAdvance } from '../auto-advance';

const WORKING = { setType: 'normal', completed: true, parentSetId: null };
const WORKING_INCOMPLETE = { setType: 'normal', completed: false, parentSetId: null };
const WARMUP = { setType: 'warmup', completed: true, parentSetId: null };

describe('shouldAutoAdvance (LOG-13)', () => {
  it('is null when disabled, even with every working set complete', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING],
        enabled: false,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 1,
      }),
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
        targetWorkingSets: 2,
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
        targetWorkingSets: 1,
      }),
    ).toBeNull();
  });

  it('is null on the last exercise — no wrap-around', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING],
        enabled: true,
        currentIndex: 2,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 1,
      }),
    ).toBeNull();
  });

  it('returns the next index once every working set is complete, not the last exercise, and the completion was a working set', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING, WORKING],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 2,
      }),
    ).toBe(1);
  });

  it('never infers set type from position — a warm-up at a low index and a working set at a high one still resolve correctly', () => {
    const sets = [
      { setType: 'normal', completed: true, parentSetId: null },
      { setType: 'warmup', completed: true, parentSetId: null },
    ];
    expect(
      shouldAutoAdvance({
        sets,
        enabled: true,
        currentIndex: 0,
        exerciseCount: 2,
        completedSetType: 'normal',
        targetWorkingSets: 1,
      }),
    ).toBe(1);
  });

  it('is null when no working sets exist at all', () => {
    expect(
      shouldAutoAdvance({
        sets: [WARMUP],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 1,
      }),
    ).toBeNull();
  });

  // WINDOWS #136: a 3-target exercise only has 1 existing row after its first set is completed —
  // "every EXISTING working set is complete" was trivially true there, firing advance a full two
  // sets early. targetWorkingSets is what tells the predicate there are two more still owed.
  it('is null after the first of three prescribed working sets, even though the one existing row is complete', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 3,
      }),
    ).toBeNull();
  });

  it('returns the next index only once the prescribed set count is reached and every row is complete', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING, WORKING, WORKING_INCOMPLETE],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 3,
      }),
    ).toBeNull();

    expect(
      shouldAutoAdvance({
        sets: [WORKING, WORKING, WORKING],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 3,
      }),
    ).toBe(1);
  });

  it('falls back to "every existing working set complete" for an ad-hoc exercise with no target (null/0)', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 2,
        completedSetType: 'normal',
        targetWorkingSets: null,
      }),
    ).toBe(1);

    expect(
      shouldAutoAdvance({
        sets: [WORKING],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 2,
        completedSetType: 'normal',
        targetWorkingSets: 0,
      }),
    ).toBe(1);
  });

  it('still advances once extra sets beyond the target are logged, provided all are complete', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING, WORKING, WORKING, WORKING],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 2,
        completedSetType: 'normal',
        targetWorkingSets: 3,
      }),
    ).toBe(1);
  });

  // D-10/D-19: children do not satisfy the prescribed set count — a parent plus its drop-set
  // children still reads as one set toward the prescription.
  it('is null when a drop set of one parent and three children has only satisfied 1 of 4 prescribed sets', () => {
    const parentId = 'parent-1';
    expect(
      shouldAutoAdvance({
        sets: [
          { setType: 'normal', completed: true, parentSetId: null },
          { setType: 'drop', completed: true, parentSetId: parentId },
          { setType: 'drop', completed: true, parentSetId: parentId },
          { setType: 'drop', completed: true, parentSetId: parentId },
        ],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 4,
      }),
    ).toBeNull();
  });

  it('still returns the next index once four completed parent working sets satisfy a 4-set prescription', () => {
    expect(
      shouldAutoAdvance({
        sets: [WORKING, WORKING, WORKING, WORKING],
        enabled: true,
        currentIndex: 0,
        exerciseCount: 3,
        completedSetType: 'normal',
        targetWorkingSets: 4,
      }),
    ).toBe(1);
  });
});
