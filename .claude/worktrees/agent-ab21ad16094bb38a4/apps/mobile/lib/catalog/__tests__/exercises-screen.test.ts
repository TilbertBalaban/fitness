// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (the same WINDOWS #22/#33 constraint load-snapshot.test.ts and
// refresh-catalog.test.ts already work around) — mocked before importing the screen module so its
// top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
// apiFetch is mocked for the same reason: index.tsx imports refresh-catalog.ts, which imports it.
// auth-client is mocked because createAuthClient() runs network/storage setup at module import
// time, which this Jest (Node) environment cannot support, matching the same "mock before import"
// discipline as the other two.
jest.mock('../../db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));
jest.mock('../../db/id', () => ({ generateClientId: jest.fn(() => 'new-custom-id') }));

import { ADD_CUSTOM_EXERCISE_ROUTE, handleAddCustomExercisePress, loadCatalogRows } from '../../../app/exercises/index';
import { createCustomExercise } from '../custom-exercise';
import { getPowerSync } from '../../db/powersync';

type DbSchema = typeof import('../../db/schema');
type PowerSyncDb = ReturnType<typeof getPowerSync>;

// A table-identity-keyed in-memory fake — select().from(table) is directly awaitable (no
// .where() call) for the plain unconditional selects loadCatalogRows issues against
// exerciseMuscleMapping/userExercisePreference/muscleGroup, and also supports .where() for the
// conditional seededExercise/exercise selects, matching
// apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts's established shape. insert().values()
// is a plain (non-upsert) insert, matching custom-exercise.test.ts's fake — createCustomExercise
// never calls onConflictDoUpdate.
function fakeDb(schema: DbSchema) {
  const rows = new Map<unknown, Record<string, unknown>[]>([
    [schema.exercise, []],
    [schema.seededExercise, []],
    [schema.exerciseMuscleMapping, []],
    [schema.userExercisePreference, []],
    [schema.muscleGroup, []],
  ]);

  function pushRow(table: unknown, values: Record<string, unknown>) {
    const existing = rows.get(table) ?? [];
    existing.push(values);
    rows.set(table, existing);
  }

  interface FakeDb {
    select: (fields: Record<string, unknown>) => {
      from: (table: unknown) => {
        where: () => Promise<Record<string, unknown>[]>;
        then: (resolve: (value: Record<string, unknown>[]) => unknown) => unknown;
      };
    };
    insert: (table: unknown) => {
      values: (values: Record<string, unknown>) => {
        then: (resolve: (value: undefined) => unknown, reject?: (err: unknown) => unknown) => unknown;
      };
    };
    transaction: (callback: (tx: FakeDb) => Promise<void>) => Promise<void>;
  }

  const db: FakeDb = {
    select: (fields) => ({
      from: (table) => {
        const project = () => {
          const tableRows = rows.get(table) ?? [];
          return tableRows.map((row) => {
            const projected: Record<string, unknown> = {};
            for (const key of Object.keys(fields)) projected[key] = row[key];
            return projected;
          });
        };
        return {
          where: () => Promise.resolve(project()),
          then: (resolve) => resolve(project()),
        };
      },
    }),
    insert: (table) => ({
      values: (values) => ({
        then: (resolve, reject) => {
          try {
            pushRow(table, values);
            resolve(undefined);
          } catch (err) {
            reject?.(err);
          }
        },
      }),
    }),
    transaction: async (callback) => {
      await callback(db);
    },
  };

  return { db, rows };
}

function loadSchema(): DbSchema {
  return jest.requireActual('../../db/schema');
}

describe('handleAddCustomExercisePress', () => {
  it('navigates to /exercises/new', () => {
    const push = jest.fn();
    handleAddCustomExercisePress({ push });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/exercises/new');
    expect(push).toHaveBeenCalledWith(ADD_CUSTOM_EXERCISE_ROUTE);
  });
});

describe('loadCatalogRows — a newly-created custom exercise appears immediately', () => {
  it('includes a freshly-created custom exercise in the same union query the list screen reads', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema);

    const id = await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Cable Fly',
      loadType: 'external_weight',
    });

    const catalog = await loadCatalogRows(db as unknown as PowerSyncDb);

    expect(id).toBe('new-custom-id');
    expect(catalog.rows).toHaveLength(1);
    expect(catalog.rows[0]).toMatchObject({ id: 'new-custom-id', name: 'Cable Fly' });
  });

  it('the created row is_custom true at its source table, distinguishing it from a seeded row', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);

    const id = await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Cable Fly',
      loadType: 'external_weight',
    });
    await loadCatalogRows(db as unknown as PowerSyncDb);

    const [storedRow] = rows.get(schema.exercise) ?? [];
    expect(storedRow).toMatchObject({ id, isCustom: true });
  });
});
