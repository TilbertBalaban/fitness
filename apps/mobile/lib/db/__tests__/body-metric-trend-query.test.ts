import { Column, is, Param, SQL } from 'drizzle-orm';
import { bodyMetricWindowStart, loadBodyMetricTrend } from '../body-metric-trend-query';
import { getPowerSync } from '../powersync';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

type Row = Record<string, unknown>;

// A real in-memory implementation of the exact select/where call shape body-metric-trend-query.ts
// uses (body-metrics.test.ts's own convention) — eq() conditions on userId/kind are evaluated for
// real. The gte(local_date, windowStart) branch is deliberately NOT modelled here: every test below
// calls with windowStart: null (the shape the screen actually uses, D-09/D-13's dedup/gap behaviour
// being the thing under test), and the SQL-level window filter is proven against a real database by
// the durability spec's window-switch case instead.
function fakeDb(rows: Row[]) {
  return {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          const pairs = collectEqPairs(condition);
          const matched = rows.filter((row) => pairs.every(([col, val]) => row[col] === val));
          return Promise.resolve(matched);
        },
      }),
    }),
  } as unknown as ReturnType<typeof getPowerSync>;
}

// Column name (as drizzle stores it) -> row property, mirroring body-metrics.test.ts's small
// hardcoded map convention — this fake only ever needs to understand body_metric's shape.
const COLUMN_TO_FIELD: Record<string, string> = {
  user_id: 'userId',
  kind: 'kind',
};

// Same Column/Param-chunk walk body-metrics.test.ts uses — a raw queryChunks/name-string traversal
// does not reliably line up Column and its Param across an and(eq(), eq()) tree, since the SQL
// builder does not always place the value chunk immediately after the column chunk.
function collectEqPairs(node: unknown, pairs: Array<[string, unknown]> = []): Array<[string, unknown]> {
  if (!is(node, SQL)) return pairs;
  const chunks = node.queryChunks;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (is(chunk, Column)) {
      const maybeParam = chunks[i + 2];
      if (is(maybeParam, Param)) {
        const field = COLUMN_TO_FIELD[chunk.name];
        if (field) pairs.push([field, maybeParam.value]);
      }
    } else if (is(chunk, SQL)) {
      collectEqPairs(chunk, pairs);
    }
  }
  return pairs;
}

function row(userId: string, kind: string, value: string, localDate: string, recordedAt: string): Row {
  return { userId, kind, value, localDate, recordedAt };
}

beforeEach(() => {
  (getPowerSync as jest.MockedFunction<typeof getPowerSync>).mockReset();
});

describe('loadBodyMetricTrend (D-09, D-13)', () => {
  it('dedupes two entries on the same local_date to one point carrying the LATER recorded_at value', async () => {
    const db = fakeDb([
      row('user-1', 'bodyweight', '80.000', '2026-08-10', '2026-08-10T07:00:00.000Z'),
      row('user-1', 'bodyweight', '80.500', '2026-08-10', '2026-08-10T19:00:00.000Z'),
    ]);

    const points = await loadBodyMetricTrend({ userId: 'user-1', kind: 'bodyweight', windowStart: null }, db);

    expect(points).toEqual([{ date: '2026-08-10', value: '80.500' }]);
  });

  it('a gap day between two logged days yields a series length equal to the days that actually have entries', async () => {
    const db = fakeDb([
      row('user-1', 'bodyweight', '80.000', '2026-08-08', '2026-08-08T07:00:00.000Z'),
      row('user-1', 'bodyweight', '81.000', '2026-08-10', '2026-08-10T07:00:00.000Z'),
    ]);

    const points = await loadBodyMetricTrend({ userId: 'user-1', kind: 'bodyweight', windowStart: null }, db);

    // Two logged days, two points — never three, which would mean a zero was fabricated for the
    // missing 08-09.
    expect(points).toHaveLength(2);
    expect(points.map((point) => point.date)).toEqual(['2026-08-08', '2026-08-10']);
  });

  it('a single entry produces a one-point series (the R17 single-point path)', async () => {
    const db = fakeDb([row('user-1', 'bodyweight', '82.000', '2026-08-12', '2026-08-12T07:00:00.000Z')]);

    const points = await loadBodyMetricTrend({ userId: 'user-1', kind: 'bodyweight', windowStart: null }, db);

    expect(points).toEqual([{ date: '2026-08-12', value: '82.000' }]);
  });

  it('excludes another user’s rows and another kind’s rows', async () => {
    const db = fakeDb([
      row('user-1', 'bodyweight', '80.000', '2026-08-10', '2026-08-10T07:00:00.000Z'),
      row('user-2', 'bodyweight', '99.000', '2026-08-10', '2026-08-10T07:00:00.000Z'),
      row('user-1', 'waist', '90.000', '2026-08-10', '2026-08-10T07:00:00.000Z'),
    ]);

    const points = await loadBodyMetricTrend({ userId: 'user-1', kind: 'bodyweight', windowStart: null }, db);

    expect(points).toEqual([{ date: '2026-08-10', value: '80.000' }]);
  });

  it('returns an empty series for a signed-out reader, never an unscoped read', async () => {
    const db = fakeDb([row('user-1', 'bodyweight', '80.000', '2026-08-10', '2026-08-10T07:00:00.000Z')]);

    const points = await loadBodyMetricTrend({ userId: null, kind: 'bodyweight', windowStart: null }, db);

    expect(points).toEqual([]);
  });
});

describe('bodyMetricWindowStart (R21/R32)', () => {
  it('resolves 1m to 30 days (inclusive) before today, as a local-date string', () => {
    expect(bodyMetricWindowStart('2026-08-30', '1m')).toBe('2026-08-01');
  });

  it('resolves 3m to 90 days (inclusive) before today', () => {
    expect(bodyMetricWindowStart('2026-08-30', '3m')).toBe('2026-06-02');
  });

  it('resolves 1y to 365 days (inclusive) before today', () => {
    expect(bodyMetricWindowStart('2026-08-30', '1y')).toBe('2025-08-31');
  });

  it('resolves all to null — no date predicate at all, never a distant sentinel date', () => {
    expect(bodyMetricWindowStart('2026-08-30', 'all')).toBeNull();
  });
});
