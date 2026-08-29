import { TREND_BUCKET_DAYS, TREND_WEEKS } from '../constants';
import { trailingBuckets } from '../bucketing';
import { historyTrendSeries, type TrendSessionInput } from '../trend-series';

const TODAY = '2026-08-29';

// The trailing bucket list this whole file reasons about: index 11 is 2026-08-23..2026-08-29,
// index 10 is 2026-08-16..2026-08-22, index 9 is 2026-08-09..2026-08-15.
const BUCKETS = trailingBuckets({ todayLocalDate: TODAY, bucketCount: TREND_WEEKS, bucketDays: TREND_BUCKET_DAYS });

// ONE fixture drives the volume/sets/workouts assertions below, so the two deliberately divergent
// populations — child-inclusive working volume versus parent-only completed working sets — are
// visible side by side rather than hidden behind three separately-tuned fixtures.
const MIXED_WEEK: TrendSessionInput[] = [
  {
    sessionId: 'session-a',
    localDate: '2026-08-25',
    sets: [
      { id: 'a1', setType: 'warmup', weightKg: '60.000', reps: 12, completed: true, parentSetId: null },
      { id: 'a2', setType: 'normal', weightKg: '100.000', reps: 5, completed: true, parentSetId: null },
      { id: 'a3', setType: 'drop', weightKg: '80.000', reps: 8, completed: true, parentSetId: 'a2' },
      { id: 'a4', setType: 'partial', weightKg: '110.000', reps: 3, completed: true, parentSetId: null },
      { id: 'a5', setType: 'normal', weightKg: '200.000', reps: 1, completed: false, parentSetId: null },
    ],
  },
  {
    sessionId: 'session-b',
    localDate: '2026-08-27',
    sets: [{ id: 'b1', setType: 'normal', weightKg: '50.000', reps: 10, completed: true, parentSetId: null }],
  },
];

function session(sessionId: string, localDate: string, weightKg: string, reps: number): TrendSessionInput {
  return {
    sessionId,
    localDate,
    sets: [{ id: `${sessionId}-1`, setType: 'normal', weightKg, reps, completed: true, parentSetId: null }],
  };
}

describe('historyTrendSeries — the three metrics diverge on one fixture', () => {
  it('sums volume child-inclusively, counting the drop-set child and the partial the set count will not', () => {
    const { points, currentValue } = historyTrendSeries({ sessions: MIXED_WEEK, metric: 'volume', todayLocalDate: TODAY });

    expect(points).toHaveLength(1);
    // 100x5 + 80x8 (drop child) + 110x3 (partial) + 50x10 — the warm-up and the incomplete set contribute nothing.
    expect(points[0].value).toBe(1970);
    expect(currentValue).toBe(1970);
  });

  it('counts sets by parent rows only, so the drop set is one set and not three', () => {
    const { points, currentValue } = historyTrendSeries({ sessions: MIXED_WEEK, metric: 'sets', todayLocalDate: TODAY });

    expect(points).toHaveLength(1);
    // session-a contributes its normal and its partial parents; the drop child, the warm-up and the
    // incomplete set contribute nothing. session-b contributes one.
    expect(points[0].value).toBe(3);
    expect(currentValue).toBe(3);
  });

  it('counts workouts as distinct sessions that contributed at least one completed working set', () => {
    const { points, currentValue } = historyTrendSeries({ sessions: MIXED_WEEK, metric: 'workouts', todayLocalDate: TODAY });

    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(2);
    expect(currentValue).toBe(2);
  });

  it('lands all three on the bucket containing the sessions, keyed by that bucket', () => {
    const { points } = historyTrendSeries({ sessions: MIXED_WEEK, metric: 'volume', todayLocalDate: TODAY });

    expect(points[0].bucketIndex).toBe(TREND_WEEKS - 1);
    expect(points[0].key).toBe(BUCKETS[TREND_WEEKS - 1].key);
    expect(points[0].startLocalDate).toBe('2026-08-23');
    expect(points[0].endLocalDate).toBe('2026-08-29');
  });
});

describe('an untrained bucket is absent, never a zero (D-09)', () => {
  it('omits every bucket with no session at all', () => {
    const { points } = historyTrendSeries({
      sessions: [session('s1', '2026-08-25', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(points).toHaveLength(1);
    expect(points.every((point) => point.value !== 0)).toBe(true);
  });

  it('omits a bucket whose only session contributed no completed working set', () => {
    const warmupOnly: TrendSessionInput = {
      sessionId: 'warmup-only',
      localDate: '2026-08-18',
      sets: [
        { id: 'w1', setType: 'warmup', weightKg: '60.000', reps: 12, completed: true, parentSetId: null },
        { id: 'w2', setType: 'normal', weightKg: '100.000', reps: 5, completed: false, parentSetId: null },
      ],
    };

    const { points } = historyTrendSeries({
      sessions: [warmupOnly, session('real', '2026-08-25', '100.000', 5)],
      metric: 'workouts',
      todayLocalDate: TODAY,
    });

    expect(points).toHaveLength(1);
    expect(points[0].bucketIndex).toBe(TREND_WEEKS - 1);
  });

  it('returns no points and a null current value when nothing in the window qualifies', () => {
    const result = historyTrendSeries({ sessions: [], metric: 'volume', todayLocalDate: TODAY });

    expect(result.points).toEqual([]);
    expect(result.currentValue).toBeNull();
    expect(result.delta).toEqual({ kind: 'not-comparable' });
  });

  it('drops a session dated outside the window rather than folding it into the nearest bucket', () => {
    const beforeWindow = BUCKETS[0].startLocalDate;
    const result = historyTrendSeries({
      sessions: [session('old', '2026-06-06', '100.000', 5), session('older', '2020-01-01', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(beforeWindow).toBe('2026-06-07');
    expect(result.points).toEqual([]);
    expect(result.currentValue).toBeNull();
  });

  it('drops a session dated after the supplied day', () => {
    const result = historyTrendSeries({
      sessions: [session('future', '2026-08-30', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.points).toEqual([]);
  });
});

describe('the delta compares the last two buckets by index', () => {
  it('reports improving with the magnitude of the rise', () => {
    const result = historyTrendSeries({
      sessions: [session('prev', '2026-08-18', '100.000', 4), session('curr', '2026-08-25', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.currentValue).toBe(500);
    expect(result.delta).toEqual({ kind: 'improving', percent: 25 });
  });

  it('reports declining with a positive magnitude, never a negative percentage', () => {
    const result = historyTrendSeries({
      sessions: [session('prev', '2026-08-18', '100.000', 5), session('curr', '2026-08-25', '100.000', 4)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.delta).toEqual({ kind: 'declining', percent: 20 });
  });

  it('reports unchanged, carrying no percentage at all, when the two are equal', () => {
    const result = historyTrendSeries({
      sessions: [session('prev', '2026-08-18', '100.000', 5), session('curr', '2026-08-25', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.delta).toEqual({ kind: 'unchanged' });
  });

  it('is not-comparable when only one bucket holds data', () => {
    const result = historyTrendSeries({
      sessions: [session('curr', '2026-08-25', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.points).toHaveLength(1);
    expect(result.delta).toEqual({ kind: 'not-comparable' });
  });

  it('is not-comparable across a skipped window, rather than comparing the last two POINTS', () => {
    // Data two buckets back and in the last bucket, with the bucket between them empty. Comparing
    // those two points would render "vs previous seven days" over a fourteen-day gap.
    const result = historyTrendSeries({
      sessions: [session('older', '2026-08-11', '100.000', 4), session('curr', '2026-08-25', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.points.map((point) => point.bucketIndex)).toEqual([TREND_WEEKS - 3, TREND_WEEKS - 1]);
    expect(result.delta).toEqual({ kind: 'not-comparable' });
  });

  it('is not-comparable when the most recent bucket itself holds no data, and the headline keeps the last real figure', () => {
    const result = historyTrendSeries({
      sessions: [session('older', '2026-08-11', '100.000', 4), session('prev', '2026-08-18', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.currentValue).toBe(500);
    expect(result.points[result.points.length - 1].bucketIndex).toBe(TREND_WEEKS - 2);
    expect(result.delta).toEqual({ kind: 'not-comparable' });
  });

  it('is not-comparable against a zero previous value, so no chip can claim an infinite rise', () => {
    const bodyweightWeek: TrendSessionInput = {
      sessionId: 'bodyweight',
      localDate: '2026-08-18',
      sets: [{ id: 'bw1', setType: 'normal', weightKg: null, reps: 12, completed: true, parentSetId: null }],
    };

    const result = historyTrendSeries({
      sessions: [bodyweightWeek, session('curr', '2026-08-25', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    // The bodyweight week is present as a real measured zero of external load, not omitted: the
    // lifter did train, and the sets/workouts metrics over the same bucket are non-zero.
    expect(result.points.map((point) => point.value)).toEqual([0, 500]);
    expect(result.delta).toEqual({ kind: 'not-comparable' });
    expect(historyTrendSeries({ sessions: [bodyweightWeek], metric: 'sets', todayLocalDate: TODAY }).points[0].value).toBe(1);
  });
});

describe('the delta is a closed union with no zero-percent and no em-dash branch', () => {
  it('only ever produces one of the four declared kinds', () => {
    const kinds = new Set<string>();
    for (const localDate of ['2026-08-11', '2026-08-18', '2026-08-25']) {
      for (const reps of [4, 5]) {
        kinds.add(
          historyTrendSeries({
            sessions: [session('prev', '2026-08-18', '100.000', 5), session('curr', localDate, '100.000', reps)],
            metric: 'volume',
            todayLocalDate: TODAY,
          }).delta.kind,
        );
      }
    }

    for (const kind of kinds) {
      expect(['improving', 'declining', 'unchanged', 'not-comparable']).toContain(kind);
    }
  });

  it('never carries a zero percentage on a directional branch', () => {
    const result = historyTrendSeries({
      sessions: [session('prev', '2026-08-18', '100.000', 5), session('curr', '2026-08-25', '100.000', 5)],
      metric: 'volume',
      todayLocalDate: TODAY,
    });

    expect(result.delta).not.toHaveProperty('percent');
  });
});
