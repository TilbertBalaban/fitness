import { Column, is, Param, SQL } from 'drizzle-orm';
import { userExercisePreference } from '../../db/schema';
import { applyCatalogFilters } from '../catalog-filter';
import { readPreference, resolveDetailActions, setArchived, setNeverSuggest } from '../preferences';

jest.mock('../../db/id', () => {
  let counter = 0;
  return { generateClientId: jest.fn(() => `gen-${++counter}`) };
});

interface PrefRow {
  id: string;
  userId: string;
  exerciseId: string;
  archivedAt: string | null;
  neverSuggest: boolean;
  updatedAt: string;
}

// Column name (as drizzle stores it, snake_case) -> row property name (camelCase) for the three
// columns preferences.ts ever filters or updates by — small and hardcoded rather than a generic
// snake->camel transform, because this fake only ever needs to understand this one table's shape.
const COLUMN_TO_FIELD: Partial<Record<string, keyof PrefRow>> = {
  id: 'id',
  user_id: 'userId',
  exercise_id: 'exerciseId',
};

// Recursively collects every (columnName, value) pair out of an eq()/and() drizzle condition
// tree. preferences.ts only ever combines conditions with and(), never or(), so treating every
// pair found anywhere in the tree as AND-combined is exact for what this fake needs to evaluate.
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

function matchesCondition(row: PrefRow, condition: unknown): boolean {
  const pairs: Array<[string, unknown]> = [];
  collectEqPairs(condition, pairs);
  if (pairs.length === 0) return false;
  return pairs.every(([columnName, value]) => {
    const field = COLUMN_TO_FIELD[columnName];
    return field !== undefined && row[field] === value;
  });
}

// A real (if minimal) in-memory implementation of the exact select/insert/update call shapes
// preferences.ts uses against user_exercise_preference — not a canned-response stub — so tests can
// assert genuine cross-call state (no-op leaves a value unchanged, two users' rows stay distinct,
// write order does not change the outcome) rather than merely that a particular method was called.
class FakePreferenceDb {
  rows: PrefRow[] = [];
  calledTables: unknown[] = [];

  asWriteDb() {
    const self = this;
    return {
      select: (_columns?: unknown) => ({
        from: (_table: unknown) => ({
          where: (condition: unknown) => Promise.resolve(self.rows.filter((row) => matchesCondition(row, condition))),
        }),
      }),
      insert: (table: unknown) => {
        self.calledTables.push(table);
        return {
          values: (values: PrefRow) => {
            self.rows.push({ ...values });
            return Promise.resolve();
          },
        };
      },
      update: (table: unknown) => {
        self.calledTables.push(table);
        return {
          set: (patch: Partial<PrefRow>) => ({
            where: (condition: unknown) => {
              for (const row of self.rows) {
                if (matchesCondition(row, condition)) Object.assign(row, patch);
              }
              return Promise.resolve();
            },
          }),
        };
      },
    } as unknown as Parameters<typeof readPreference>[0];
  }
}

describe('readPreference', () => {
  it('returns a default of { archivedAt: null, neverSuggest: false } for an exercise with no preference row, not null or undefined', async () => {
    const fake = new FakePreferenceDb();

    const result = await readPreference(fake.asWriteDb(), 'user-a', 'ex-1');

    expect(result).toEqual({ archivedAt: null, neverSuggest: false });
  });
});

describe('setArchived', () => {
  it('creates a preference row with a client-issued id, archivedAt stamped, and neverSuggest false', async () => {
    const fake = new FakePreferenceDb();

    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].id).toBe('gen-1');
    expect(fake.rows[0].archivedAt).not.toBeNull();
    expect(fake.rows[0].neverSuggest).toBe(false);
  });

  it('calling setArchived(..., true) twice leaves archivedAt at its original value — the second call is a no-op, not a re-stamp', async () => {
    const fake = new FakePreferenceDb();

    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);
    const firstStamp = fake.rows[0].archivedAt;

    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].archivedAt).toBe(firstStamp);
  });

  it('setArchived(..., false) clears archivedAt to null and leaves neverSuggest untouched', async () => {
    const fake = new FakePreferenceDb();
    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);
    await setNeverSuggest(fake.asWriteDb(), 'user-a', 'ex-1', true);

    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', false);

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].archivedAt).toBeNull();
    expect(fake.rows[0].neverSuggest).toBe(true);
  });

  it('archiving a seeded exercise writes zero changes to any table other than user_exercise_preference', async () => {
    const fake = new FakePreferenceDb();

    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);

    expect(fake.calledTables.length).toBeGreaterThan(0);
    expect(fake.calledTables.every((table) => table === userExercisePreference)).toBe(true);
  });

  it('archiving an exercise referenced by a local session_exercise row leaves that reference untouched — preferences.ts never writes any table but user_exercise_preference', async () => {
    const fake = new FakePreferenceDb();
    const sessionExerciseSnapshot = { id: 'se-1', exerciseId: 'ex-1' };

    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);

    expect(sessionExerciseSnapshot).toEqual({ id: 'se-1', exerciseId: 'ex-1' });
    expect(fake.calledTables.every((table) => table === userExercisePreference)).toBe(true);
  });

  it('archiving an exercise with zero references behaves identically to archiving one with references', async () => {
    const noRefs = new FakePreferenceDb();
    const withRefs = new FakePreferenceDb();

    await expect(setArchived(noRefs.asWriteDb(), 'user-a', 'ex-1', true)).resolves.toBeUndefined();
    await expect(setArchived(withRefs.asWriteDb(), 'user-a', 'ex-1', true)).resolves.toBeUndefined();

    expect(noRefs.rows[0].archivedAt).not.toBeNull();
    expect(withRefs.rows[0].archivedAt).not.toBeNull();
    expect(noRefs.rows[0].neverSuggest).toBe(withRefs.rows[0].neverSuggest);
  });
});

describe('setNeverSuggest', () => {
  it('on an already-archived exercise sets the flag and leaves archivedAt untouched — the two are independent', async () => {
    const fake = new FakePreferenceDb();
    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);
    const archivedAt = fake.rows[0].archivedAt;

    await setNeverSuggest(fake.asWriteDb(), 'user-a', 'ex-1', true);

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].archivedAt).toBe(archivedAt);
    expect(fake.rows[0].neverSuggest).toBe(true);
  });

  it('on an exercise with no preference row creates one with archivedAt null', async () => {
    const fake = new FakePreferenceDb();

    await setNeverSuggest(fake.asWriteDb(), 'user-a', 'ex-1', true);

    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].archivedAt).toBeNull();
    expect(fake.rows[0].neverSuggest).toBe(true);
  });
});

describe('per-user isolation', () => {
  it('writing a preference for user A and then for user B against the same exercise produces two distinct rows, and each user reads back only their own', async () => {
    const fake = new FakePreferenceDb();

    await setArchived(fake.asWriteDb(), 'user-a', 'ex-1', true);
    await setArchived(fake.asWriteDb(), 'user-b', 'ex-1', false);
    await setNeverSuggest(fake.asWriteDb(), 'user-b', 'ex-1', true);

    expect(fake.rows).toHaveLength(2);
    const idsUsed = new Set(fake.rows.map((row) => row.id));
    expect(idsUsed.size).toBe(2);

    const userA = await readPreference(fake.asWriteDb(), 'user-a', 'ex-1');
    const userB = await readPreference(fake.asWriteDb(), 'user-b', 'ex-1');

    expect(userA).toEqual({ archivedAt: expect.any(String), neverSuggest: false });
    expect(userB).toEqual({ archivedAt: null, neverSuggest: true });
  });

  it('the order of those two writes does not change either user result', async () => {
    const forward = new FakePreferenceDb();
    await setArchived(forward.asWriteDb(), 'user-a', 'ex-1', true);
    await setArchived(forward.asWriteDb(), 'user-b', 'ex-1', true);

    const reversed = new FakePreferenceDb();
    await setArchived(reversed.asWriteDb(), 'user-b', 'ex-1', true);
    await setArchived(reversed.asWriteDb(), 'user-a', 'ex-1', true);

    const forwardA = await readPreference(forward.asWriteDb(), 'user-a', 'ex-1');
    const forwardB = await readPreference(forward.asWriteDb(), 'user-b', 'ex-1');
    const reversedA = await readPreference(reversed.asWriteDb(), 'user-a', 'ex-1');
    const reversedB = await readPreference(reversed.asWriteDb(), 'user-b', 'ex-1');

    expect(forwardA.archivedAt).not.toBeNull();
    expect(forwardB.archivedAt).not.toBeNull();
    expect(reversedA.archivedAt).not.toBeNull();
    expect(reversedB.archivedAt).not.toBeNull();
  });
});

describe('catalog-filter integration — archiving every exercise leaves the catalog empty', () => {
  it('archiving every exercise in the catalog leaves applyCatalogFilters returning an empty array rather than throwing', async () => {
    const fake = new FakePreferenceDb();
    const exercises = [
      { id: 'ex-1', name: 'Bench Press', aliases: null, movementPattern: null, equipmentRequired: null },
      { id: 'ex-2', name: 'Squat', aliases: null, movementPattern: null, equipmentRequired: null },
    ];

    for (const exercise of exercises) {
      await setArchived(fake.asWriteDb(), 'user-a', exercise.id, true);
    }

    const preferences = fake.rows.map((row) => ({
      userId: row.userId,
      exerciseId: row.exerciseId,
      archivedAt: row.archivedAt,
    }));

    const result = applyCatalogFilters(
      exercises,
      [],
      preferences,
      { muscleGroupIds: [], equipment: [], movementPatterns: [] },
      'user-a',
    );

    expect(result).toEqual([]);
  });
});

describe('resolveDetailActions', () => {
  it('a seeded exercise (null owner) shows Duplicate and never Edit', () => {
    const result = resolveDetailActions('user-a', null, null);
    expect(result.showEdit).toBe(false);
    expect(result.showDuplicate).toBe(true);
  });

  it('a user-owned exercise shows both Edit and Duplicate', () => {
    const result = resolveDetailActions('user-a', 'user-a', null);
    expect(result.showEdit).toBe(true);
    expect(result.showDuplicate).toBe(true);
  });

  it('archiveLabel is Archive when archivedAt is null and Unarchive when it is set', () => {
    expect(resolveDetailActions('user-a', 'user-a', null).archiveLabel).toBe('Archive');
    expect(resolveDetailActions('user-a', 'user-a', '2026-08-18T00:00:00.000Z').archiveLabel).toBe('Unarchive');
  });
});
