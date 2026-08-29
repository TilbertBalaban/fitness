import { exerciseSeries, type ExerciseSessionInput } from '../exercise-series';

// ONE fixture drives the heaviest/e1rm/volume assertions below, so the two deliberately divergent
// set populations (countsTowardRecords vs countsTowardWorkingVolume) are visible side by side in a
// single session rather than hidden behind three separately-tuned fixtures.
const MIXED_SESSION: ExerciseSessionInput = {
  sessionId: 'session-1',
  localDate: '2026-08-10',
  sets: [
    { id: 'a', setType: 'warmup', weightKg: '60.000', reps: 12, completed: true, parentSetId: null },
    { id: 'b', setType: 'normal', weightKg: '100.000', reps: 5, completed: true, parentSetId: null },
    { id: 'c', setType: 'partial', weightKg: '110.000', reps: 3, completed: true, parentSetId: null },
    { id: 'd', setType: 'drop', weightKg: '80.000', reps: 8, completed: true, parentSetId: 'b' },
    { id: 'e', setType: 'normal', weightKg: '200.000', reps: 1, completed: false, parentSetId: null },
  ],
};

function session(overrides: Partial<ExerciseSessionInput> = {}): ExerciseSessionInput {
  return { sessionId: 's', localDate: '2026-08-01', sets: [], ...overrides };
}

describe('exerciseSeries — the two set predicates diverge on one fixture', () => {
  it('scores heaviest from record-eligible sets only, excluding the heavier partial and the incomplete set', () => {
    const { points } = exerciseSeries({ sessions: [MIXED_SESSION], metric: 'heaviest' });

    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(100);
  });

  it('sums volume over working-volume sets, counting the partial and the drop-set child the records predicate excluded', () => {
    const { points } = exerciseSeries({ sessions: [MIXED_SESSION], metric: 'volume' });

    expect(points).toHaveLength(1);
    // 100x5 + 110x3 (partial) + 80x8 (drop child) — the warm-up and the incomplete set contribute nothing.
    expect(points[0].value).toBe(1470);
  });

  it('estimates 1RM from record-eligible sets only, so the partial cannot inflate it', () => {
    const { points } = exerciseSeries({ sessions: [MIXED_SESSION], metric: 'e1rm' });

    expect(points).toHaveLength(1);
    expect(points[0].value).toBeCloseTo(100 * (1 + 5 / 30), 6);
  });
});

describe('exerciseSeries — sessions with no qualifying set', () => {
  const warmupOnly = session({
    sessionId: 'warmup-only',
    sets: [{ id: 'w', setType: 'warmup', weightKg: '60.000', reps: 10, completed: true, parentSetId: null }],
  });
  const partialOnly = session({
    sessionId: 'partial-only',
    sets: [{ id: 'p', setType: 'partial', weightKg: '90.000', reps: 5, completed: true, parentSetId: null }],
  });

  it('emits no point at all for a warm-up-only session, never a zero', () => {
    expect(exerciseSeries({ sessions: [warmupOnly], metric: 'heaviest' }).points).toHaveLength(0);
    expect(exerciseSeries({ sessions: [warmupOnly], metric: 'volume' }).points).toHaveLength(0);
  });

  it('emits no heaviest point for a partial-only session but still emits a volume point', () => {
    expect(exerciseSeries({ sessions: [partialOnly], metric: 'heaviest' }).points).toHaveLength(0);
    expect(exerciseSeries({ sessions: [partialOnly], metric: 'volume' }).points).toEqual([
      expect.objectContaining({ sessionId: 'partial-only', value: 450 }),
    ]);
  });

  it('emits no point for a session whose only weighted set has a null weight', () => {
    const bodyweight = session({
      sets: [{ id: 'bw', setType: 'normal', weightKg: null, reps: 10, completed: true, parentSetId: null }],
    });

    expect(exerciseSeries({ sessions: [bodyweight], metric: 'heaviest' }).points).toHaveLength(0);
  });
});

describe('exerciseSeries — the estimated-1RM rep cap', () => {
  const aboveCap = session({
    sessionId: 'above-cap',
    localDate: '2026-08-02',
    sets: [{ id: 'x', setType: 'normal', weightKg: '80.000', reps: 12, completed: true, parentSetId: null }],
  });
  const mixedCap = session({
    sessionId: 'mixed-cap',
    localDate: '2026-08-03',
    sets: [
      { id: 'y', setType: 'normal', weightKg: '80.000', reps: 12, completed: true, parentSetId: null },
      { id: 'z', setType: 'normal', weightKg: '100.000', reps: 5, completed: true, parentSetId: null },
    ],
  });

  it('omits a session whose every qualifying set is above the cap and reports it as dropped', () => {
    const series = exerciseSeries({ sessions: [aboveCap], metric: 'e1rm' });

    expect(series.points).toHaveLength(0);
    expect(series.droppedAboveCapCount).toBe(1);
  });

  it('keeps a session mixing an above-cap set with a valid one, and does not count it as dropped', () => {
    const series = exerciseSeries({ sessions: [mixedCap], metric: 'e1rm' });

    expect(series.points).toHaveLength(1);
    expect(series.points[0].value).toBeCloseTo(100 * (1 + 5 / 30), 6);
    expect(series.droppedAboveCapCount).toBe(0);
  });

  it('counts dropped sessions only for the estimate metric', () => {
    expect(exerciseSeries({ sessions: [aboveCap], metric: 'heaviest' }).droppedAboveCapCount).toBe(0);
    expect(exerciseSeries({ sessions: [aboveCap], metric: 'volume' }).droppedAboveCapCount).toBe(0);
  });
});

describe('exerciseSeries — ordering', () => {
  it('returns points chronologically oldest first whatever order the sessions arrive in', () => {
    const build = (sessionId: string, localDate: string): ExerciseSessionInput =>
      session({
        sessionId,
        localDate,
        sets: [{ id: `${sessionId}-set`, setType: 'normal', weightKg: '100.000', reps: 5, completed: true, parentSetId: null }],
      });

    const series = exerciseSeries({
      sessions: [build('c', '2026-08-20'), build('a', '2026-08-01'), build('b', '2026-08-10')],
      metric: 'heaviest',
    });

    expect(series.points.map((point) => point.localDate)).toEqual(['2026-08-01', '2026-08-10', '2026-08-20']);
    expect(series.points.map((point) => point.key)).toEqual(['a', 'b', 'c']);
  });
});
