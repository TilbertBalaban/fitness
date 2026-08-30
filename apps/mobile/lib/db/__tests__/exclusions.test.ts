import { Column, is, Param, SQL } from 'drizzle-orm';
import {
  addExclusion,
  isExcluded,
  loadExcludedExerciseIds,
  loadExcludedExercises,
  removeExclusion,
  UNKNOWN_EXCLUDED_EXERCISE_NAME,
} from '../exclusions';
import { exercise, excludedExercise, seededExercise } from '../schema';

// exclusions.ts reaches loadExerciseNameMap through load-program.ts, which imports powersync.ts and
// with it the untransformed @powersync/react-native ESM bundle — the same reason every other db
// test mocks this module.
jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

jest.mock('../id', () => {
  let counter = 0;
  return { generateClientId: jest.fn(() => `gen-${++counter}`) };
});

interface ExclusionRow {
  id: string;
  userId: string;
  exerciseId: string;
  createdAt: string;
}

interface NamedRow {
  id: string;
  name: string;
}

// Column name (snake_case, as drizzle stores it) -> row property. Small and hardcoded rather than a
// generic transform, because this fake only ever needs to understand this one table's shape.
const COLUMN_TO_FIELD: Partial<Record<string, keyof ExclusionRow>> = {
  id: 'id',
  user_id: 'userId',
  exercise_id: 'exerciseId',
};

function collectEqPairs(node: unknown, pairs: Array<[string, unknown]>): void {
  if (!is(node, SQL)) return;
  const chunks = node.queryChunks;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (is(chunk, Column)) {
      const maybeParam = chunks[i + 2];
      if (is(maybeParam, Param)) pairs.push([chunk.name, maybeParam.value]);
    } else if (is(chunk, SQL)) {
      collectEqPairs(chunk, pairs);
    }
  }
}

function matchesCondition(row: ExclusionRow, condition: unknown): boolean {
  const pairs: Array<[string, unknown]> = [];
  collectEqPairs(condition, pairs);
  if (pairs.length === 0) return false;
  return pairs.every(([columnName, value]) => {
    const field = COLUMN_TO_FIELD[columnName];
    return field !== undefined && row[field] === value;
  });
}

// A real in-memory implementation of the exact select/insert/delete call shapes exclusions.ts uses,
// so tests assert genuine cross-call state rather than that a method was called.
class FakeExclusionDb {
  rows: ExclusionRow[] = [];
  seeded: NamedRow[] = [];
  custom: NamedRow[] = [];
  insertedTables: unknown[] = [];
  updatedTables: unknown[] = [];
  deletedTables: unknown[] = [];

  asWriteDb() {
    const self = this;
    return {
      select: (_columns?: unknown) => ({
        from: (table: unknown) => {
          if (table === seededExercise) return Promise.resolve(self.seeded.map((row) => ({ ...row })));
          if (table === exercise) return Promise.resolve(self.custom.map((row) => ({ ...row })));

          const result = {
            where: (condition: unknown) =>
              Promise.resolve(self.rows.filter((row) => matchesCondition(row, condition)).map((row) => ({ ...row }))),
            then: (resolve: (rows: ExclusionRow[]) => unknown) => Promise.resolve(self.rows.map((row) => ({ ...row }))).then(resolve),
          };
          return result;
        },
      }),
      insert: (table: unknown) => {
        self.insertedTables.push(table);
        return {
          values: (values: ExclusionRow) => {
            self.rows.push({ ...values });
            return Promise.resolve();
          },
        };
      },
      update: (table: unknown) => {
        self.updatedTables.push(table);
        return {
          set: (_patch: unknown) => ({
            where: (_condition: unknown) => Promise.resolve(),
          }),
        };
      },
      delete: (table: unknown) => {
        self.deletedTables.push(table);
        return {
          where: (condition: unknown) => {
            self.rows = self.rows.filter((row) => !matchesCondition(row, condition));
            return Promise.resolve();
          },
        };
      },
    } as unknown as Parameters<typeof loadExcludedExerciseIds>[0];
  }
}

describe('loadExcludedExerciseIds', () => {
  it('returns an empty array for a user with no exclusions, not null and not undefined', async () => {
    const fake = new FakeExclusionDb();

    const result = await loadExcludedExerciseIds(fake.asWriteDb(), 'user-a');

    expect(result).toEqual([]);
  });

  it('returns only the supplied user ids — another user’s row is absent', async () => {
    const fake = new FakeExclusionDb();
    fake.rows = [
      { id: 'r1', userId: 'user-a', exerciseId: 'ex-mine', createdAt: 't' },
      { id: 'r2', userId: 'user-b', exerciseId: 'ex-theirs', createdAt: 't' },
    ];

    expect(await loadExcludedExerciseIds(fake.asWriteDb(), 'user-a')).toEqual(['ex-mine']);
  });

  it('returns ids in ascending order so two calls over the same database agree', async () => {
    const fake = new FakeExclusionDb();
    fake.rows = [
      { id: 'r1', userId: 'user-a', exerciseId: 'ex-c', createdAt: 't' },
      { id: 'r2', userId: 'user-a', exerciseId: 'ex-a', createdAt: 't' },
      { id: 'r3', userId: 'user-a', exerciseId: 'ex-b', createdAt: 't' },
    ];
    const db = fake.asWriteDb();

    const first = await loadExcludedExerciseIds(db, 'user-a');
    const second = await loadExcludedExerciseIds(db, 'user-a');

    expect(first).toEqual(['ex-a', 'ex-b', 'ex-c']);
    expect(second).toEqual(first);
  });
});

describe('addExclusion', () => {
  it('inserts exactly one row with a client-issued id, the supplied pair, and an ISO createdAt', async () => {
    const fake = new FakeExclusionDb();

    await addExclusion(fake.asWriteDb(), 'user-a', 'ex-1');

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].id).toBe('gen-1');
    expect(fake.rows[0].userId).toBe('user-a');
    expect(fake.rows[0].exerciseId).toBe('ex-1');
    expect(fake.rows[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is a no-op for an already-excluded pair — exactly one row and exactly one insert', async () => {
    const fake = new FakeExclusionDb();
    const db = fake.asWriteDb();

    await addExclusion(db, 'user-a', 'ex-1');
    await addExclusion(db, 'user-a', 'ex-1');

    expect(fake.rows).toHaveLength(1);
    expect(fake.insertedTables).toHaveLength(1);
  });

  it('never writes to exercise or seededExercise', async () => {
    const fake = new FakeExclusionDb();

    await addExclusion(fake.asWriteDb(), 'user-a', 'ex-1');

    expect(fake.insertedTables).toEqual([excludedExercise]);
    expect(fake.updatedTables).toEqual([]);
    expect(fake.insertedTables).not.toContain(exercise);
    expect(fake.insertedTables).not.toContain(seededExercise);
  });
});

describe('removeExclusion', () => {
  it('deletes the row and issues no update', async () => {
    const fake = new FakeExclusionDb();
    const db = fake.asWriteDb();
    await addExclusion(db, 'user-a', 'ex-1');

    await removeExclusion(db, 'user-a', 'ex-1');

    expect(fake.rows).toHaveLength(0);
    expect(fake.deletedTables).toEqual([excludedExercise]);
    expect(fake.updatedTables).toEqual([]);
  });

  it('writes nothing when the pair is not excluded', async () => {
    const fake = new FakeExclusionDb();

    await removeExclusion(fake.asWriteDb(), 'user-a', 'ex-absent');

    expect(fake.deletedTables).toEqual([]);
    expect(fake.updatedTables).toEqual([]);
  });
});

describe('isExcluded', () => {
  it('is true only for the exact user and exercise pair', async () => {
    const fake = new FakeExclusionDb();
    const db = fake.asWriteDb();
    await addExclusion(db, 'user-a', 'ex-1');

    expect(await isExcluded(db, 'user-a', 'ex-1')).toBe(true);
    expect(await isExcluded(db, 'user-a', 'ex-2')).toBe(false);
    expect(await isExcluded(db, 'user-b', 'ex-1')).toBe(false);
  });
});

describe('loadExcludedExercises', () => {
  it('resolves names through the seeded-plus-custom union', async () => {
    const fake = new FakeExclusionDb();
    fake.seeded = [{ id: 'ex-seeded', name: 'Barbell Bench Press' }];
    fake.custom = [{ id: 'ex-custom', name: 'My Machine Press' }];
    fake.rows = [
      { id: 'r1', userId: 'user-a', exerciseId: 'ex-seeded', createdAt: 't' },
      { id: 'r2', userId: 'user-a', exerciseId: 'ex-custom', createdAt: 't' },
    ];

    expect(await loadExcludedExercises(fake.asWriteDb(), 'user-a')).toEqual([
      { exerciseId: 'ex-custom', name: 'My Machine Press' },
      { exerciseId: 'ex-seeded', name: 'Barbell Bench Press' },
    ]);
  });

  it('keeps an unresolvable id in the list under a placeholder name rather than dropping it', async () => {
    const fake = new FakeExclusionDb();
    fake.rows = [{ id: 'r1', userId: 'user-a', exerciseId: 'ex-gone', createdAt: 't' }];

    expect(await loadExcludedExercises(fake.asWriteDb(), 'user-a')).toEqual([
      { exerciseId: 'ex-gone', name: UNKNOWN_EXCLUDED_EXERCISE_NAME },
    ]);
  });
});
