import { loadCatalogSnapshot, readCatalogVersion } from '../load-snapshot';
import { getPowerSync } from '../../db/powersync';

jest.mock('../../db/powersync', () => ({ getPowerSync: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

// A minimal in-memory stand-in for the drizzle-wrapped PowerSync db, following the same
// established fakeDb() shape as lib/db/__tests__/log-set.test.ts — table identity (not row
// shape) is what every query in load-snapshot.ts branches on, so the fake keys its state by the
// drizzle table object itself.
function fakeDb(tables: {
  muscleGroup: unknown;
  exercise: unknown;
  exerciseMuscleMapping: unknown;
  catalogMeta: unknown;
}) {
  const rows = new Map<unknown, Record<string, unknown>[]>([
    [tables.muscleGroup, []],
    [tables.exercise, []],
    [tables.exerciseMuscleMapping, []],
    [tables.catalogMeta, []],
  ]);

  function upsert(table: unknown, values: Record<string, unknown>) {
    const existing = rows.get(table) ?? [];
    const index = existing.findIndex((row) => row.id === values.id);
    if (index >= 0) {
      existing[index] = values;
    } else {
      existing.push(values);
    }
    rows.set(table, existing);
  }

  interface FakeDb {
    select: (fields: Record<string, unknown>) => {
      from: (table: unknown) => {
        where: () => Promise<Record<string, unknown>[]>;
        then: (resolve: (value: unknown[]) => unknown) => unknown;
      };
    };
    insert: (table: unknown) => {
      values: (values: Record<string, unknown>) => {
        onConflictDoUpdate: (args: { set: Record<string, unknown> }) => Promise<void>;
      };
    };
    transaction: (callback: (tx: FakeDb) => Promise<void>) => Promise<void>;
  }

  const db: FakeDb = {
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const tableRows = rows.get(table) ?? [];
        const project = (row: Record<string, unknown>) => {
          const projected: Record<string, unknown> = {};
          for (const key of Object.keys(fields)) projected[key] = row[key];
          return projected;
        };
        return {
          where: () => Promise.resolve(tableRows.map(project)),
          then: (resolve: (value: unknown[]) => unknown) => resolve(tableRows.map(project)),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
          upsert(table, { ...values, ...set });
          return Promise.resolve();
        },
      }),
    }),
    transaction: async (callback: (tx: FakeDb) => Promise<void>) => {
      await callback(db);
    },
  };

  return { db, rows };
}

describe('loadCatalogSnapshot', () => {
  it('inserts the snapshot rows on a fresh database and reports loaded', async () => {
    const schema = jest.requireActual('../../db/schema');
    const { db, rows } = fakeDb(schema);
    getPowerSyncMock.mockReturnValue(db as unknown as ReturnType<typeof getPowerSync>);

    const result = await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);

    expect(result.status).toBe('loaded');
    expect(rows.get(schema.exercise)?.length).toBe(3);
    expect(rows.get(schema.muscleGroup)?.length).toBe(8);
    expect(rows.get(schema.exerciseMuscleMapping)?.length).toBe(8);
    expect(rows.get(schema.catalogMeta)?.length).toBe(1);
  });

  it('reports current and performs no writes on a second load with the same catalog_version', async () => {
    const schema = jest.requireActual('../../db/schema');
    const { db, rows } = fakeDb(schema);

    await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);
    const exerciseCountAfterFirst = rows.get(schema.exercise)?.length;

    const second = await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);

    expect(second.status).toBe('current');
    expect(rows.get(schema.exercise)?.length).toBe(exerciseCountAfterFirst);
  });

  it('readCatalogVersion returns null before any load has run', async () => {
    const schema = jest.requireActual('../../db/schema');
    const { db } = fakeDb(schema);

    const version = await readCatalogVersion(db as unknown as ReturnType<typeof getPowerSync>);

    expect(version).toBeNull();
  });
});
