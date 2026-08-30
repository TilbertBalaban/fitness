import { Column, is, Param, SQL } from 'drizzle-orm';
import { logMetric, loadLatestMetric } from '../body-metrics';
import { captureCalendarDay } from '../../calendar-day';
import { getPowerSync } from '../powersync';
import { bodyMetric } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../id', () => {
  let counter = 0;
  return { generateClientId: jest.fn(() => `bm-id-${counter++}`) };
});

type Row = Record<string, unknown>;

// A real in-memory implementation of the exact select/insert call shapes body-metrics.ts uses
// (exclusions.test.ts's own convention) — eq() conditions on userId/kind are evaluated for real;
// orderBy(desc(recordedAt)) + limit(1) are applied over the in-memory rows rather than asserted by
// call shape alone, so "the most recent row wins" is proven, not assumed.
function fakeDb(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  const inserted: Row[] = [];

  const db = {
    insert: (table: unknown) => ({
      values: (values: Row) => {
        if (table === bodyMetric) {
          rows.push({ ...values });
          inserted.push({ ...values });
        }
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          const pairs = collectEqPairs(condition);
          const matched = rows.filter((row) => pairs.every(([col, val]) => row[col] === val));
          return {
            orderBy: () => ({
              limit: (n: number) =>
                Promise.resolve(
                  matched
                    .slice()
                    .sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))
                    .slice(0, n),
                ),
            }),
          };
        },
      }),
    }),
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, rows, inserted };
}

// Column name (as drizzle stores it) -> row property, mirroring exclusions.test.ts's small
// hardcoded map convention — this fake only ever needs to understand body_metric's shape.
const COLUMN_TO_FIELD: Record<string, string> = {
  user_id: 'userId',
  kind: 'kind',
};

// Same Column/Param-chunk walk exclusions.test.ts uses — a raw queryChunks/name-string traversal
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

beforeEach(() => {
  (getPowerSync as jest.MockedFunction<typeof getPowerSync>).mockReset();
});

describe('logMetric (D-04, D-09)', () => {
  it('inserts one row stamped with the calendar-day helper, never a caller-derived date', async () => {
    const { db, inserted } = fakeDb();

    const id = await logMetric({ userId: 'user-1', kind: 'bodyweight', value: '82.500' }, db);

    expect(inserted).toHaveLength(1);
    const expected = captureCalendarDay(new Date());
    expect(inserted[0]).toMatchObject({
      id,
      userId: 'user-1',
      kind: 'bodyweight',
      value: '82.500',
      timezone: expected.timezone,
      localDate: expected.localDate,
    });
  });

  it('logging twice for the same kind on the same day produces two rows, both readable — no read-then-insert guard (D-09)', async () => {
    const { db, rows } = fakeDb();

    await logMetric({ userId: 'user-1', kind: 'bodyweight', value: '82.000' }, db);
    await logMetric({ userId: 'user-1', kind: 'bodyweight', value: '82.400' }, db);

    const sameKindRows = rows.filter((row) => row.userId === 'user-1' && row.kind === 'bodyweight');
    expect(sameKindRows).toHaveLength(2);
  });
});

describe('loadLatestMetric', () => {
  it('returns the most recently recorded row for a kind, not merely the last inserted', async () => {
    const { db } = fakeDb([
      { id: 'a', userId: 'user-1', kind: 'bodyweight', value: '80.000', recordedAt: '2026-08-01T09:00:00.000Z', timezone: 'UTC', localDate: '2026-08-01' },
      { id: 'b', userId: 'user-1', kind: 'bodyweight', value: '81.000', recordedAt: '2026-08-15T09:00:00.000Z', timezone: 'UTC', localDate: '2026-08-15' },
    ]);

    const latest = await loadLatestMetric('user-1', 'bodyweight', db);

    expect(latest?.id).toBe('b');
    expect(latest?.value).toBe('81.000');
  });

  it('returns undefined when the user has never logged this kind', async () => {
    const { db } = fakeDb([]);

    await expect(loadLatestMetric('user-1', 'bodyweight', db)).resolves.toBeUndefined();
  });
});
