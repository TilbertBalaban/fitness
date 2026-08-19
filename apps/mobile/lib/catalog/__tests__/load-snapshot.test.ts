import { loadCatalogSnapshot, readCatalogVersion } from '../load-snapshot';
import { getPowerSync, getUploadQueueStats } from '../../db/powersync';

jest.mock('../../db/powersync', () => ({ getPowerSync: jest.fn(), getUploadQueueStats: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

type DbSchema = typeof import('../../db/schema');

// A minimal in-memory stand-in for the drizzle-wrapped PowerSync db, following the same
// established fakeDb() shape as lib/db/__tests__/log-set.test.ts. Table identity (not row shape)
// is what every query in load-snapshot.ts branches on, so the fake keys its state by the drizzle
// table object itself.
//
// crudCounts models PowerSync's real, documented behavior (confirmed against the PowerSync SDK
// source, Table.internalName): a localOnly table's underlying storage carries no CRUD triggers at
// all, so writes to it never populate ps_crud — writes to any other (synced) table always do,
// regardless of the row's own field values (e.g. a seeded exercise.user_id of null). Passing
// `localOnlyTables` into the fake is what lets a test assert the true, scoped claim rather than a
// blanket "the whole queue is zero" claim that the real engine would falsify for `exercise`.
// engine's own refusal text (verbatim from .planning/debug/exercise-catalog-load-failure.md's
// real sqlite3 probe) — a fake that merely lacked these methods would fail a reintroduction of
// the conflict-clause grammar with an unhelpful "not a function" instead of a message that reads
// like the real defect.
const UPSERT_AGAINST_VIEW_ERROR = 'cannot UPSERT a view';

function fakeDb(schema: DbSchema, localOnlyTables: unknown[]) {
  const rows = new Map<unknown, Record<string, unknown>[]>([
    [schema.muscleGroup, []],
    [schema.exercise, []],
    [schema.seededExercise, []],
    [schema.exerciseMuscleMapping, []],
    [schema.catalogMeta, []],
  ]);
  const localOnlySet = new Set(localOnlyTables);
  let crudCount = 0;

  // Raises a uniqueness failure when the id is already present, mirroring a real INSERT against a
  // populated view — this is what makes the 3,134-mapping expectation an actual assertion about
  // duplicate handling (Trap 1) rather than an accident.
  function insertRow(table: unknown, values: Record<string, unknown>) {
    const existing = rows.get(table) ?? [];
    if (existing.some((row) => row.id === values.id)) {
      throw new Error(`UNIQUE constraint failed: id`);
    }
    existing.push(values);
    rows.set(table, existing);
    if (!localOnlySet.has(table)) crudCount += 1;
  }

  interface InsertValuesResult extends PromiseLike<void> {
    onConflictDoUpdate: (args: { target?: unknown; set: Record<string, unknown> }) => Promise<void>;
    onConflictDoNothing: (args?: { target?: unknown }) => Promise<void>;
  }

  interface FakeDb {
    select: (fields: Record<string, unknown>) => {
      from: (table: unknown) => {
        where: () => Promise<Record<string, unknown>[]>;
        then: (resolve: (value: unknown[]) => unknown) => unknown;
      };
    };
    insert: (table: unknown) => {
      values: (values: Record<string, unknown>) => InsertValuesResult;
    };
    update: (table: unknown) => {
      set: (setValues: Record<string, unknown>) => { where: (condition?: unknown) => Promise<void> };
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
      // A thenable, not an eagerly-run insert — the production call no longer chains a conflict
      // method onto this, so awaiting it directly is what performs the write. Calling
      // onConflictDoUpdate/onConflictDoNothing instead never runs insertRow at all, matching a
      // real engine that rejects at prepare time before any row is touched.
      values: (values: Record<string, unknown>): InsertValuesResult => ({
        then: (onFulfilled, onRejected) =>
          new Promise<void>((resolve, reject) => {
            try {
              insertRow(table, values);
              resolve();
            } catch (err) {
              reject(err);
            }
          }).then(onFulfilled, onRejected),
        onConflictDoUpdate: () => Promise.reject(new Error(UPSERT_AGAINST_VIEW_ERROR)),
        onConflictDoNothing: () => Promise.reject(new Error(UPSERT_AGAINST_VIEW_ERROR)),
      }),
    }),
    // A real WHERE-clause condition (drizzle-orm's own eq()/isNull()/inArray(), not mocked here)
    // is opaque to this fake — it applies `setValues` to every row currently in `table` rather
    // than evaluating the condition. Safe for every assertion in this file (none inspect
    // archivedAt, and no table here ever holds more than one pre-existing row a per-id update
    // needs to distinguish); a genuinely selective per-row update assertion needs a real engine —
    // that coverage lives in e2e/catalog-load.spec.ts's second phase, not here.
    update: (table: unknown) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: () => {
          const tableRows = rows.get(table) ?? [];
          rows.set(
            table,
            tableRows.map((row) => ({ ...row, ...setValues })),
          );
          return Promise.resolve();
        },
      }),
    }),
    transaction: async (callback: (tx: FakeDb) => Promise<void>) => {
      await callback(db);
    },
  };

  return { db, rows, getCrudCount: () => crudCount };
}

function loadSchema(): DbSchema {
  return jest.requireActual('../../db/schema');
}

function totalRows(rows: Map<unknown, Record<string, unknown>[]>): number {
  let total = 0;
  for (const table of rows.values()) total += table.length;
  return total;
}

const VALID_SNAPSHOT = {
  catalog_version: 'test-0001',
  generated_at: '2026-01-01T00:00:00.000Z',
  muscle_groups: [{ id: 'chest', name: 'Chest', body_region: 'chest' }],
  exercises: [
    {
      id: 'ex-1',
      name: 'Bench Press',
      aliases: null,
      movement_pattern: 'horizontal_push',
      equipment_required: 'barbell',
      load_type: 'external_weight',
      unilateral: false,
      instructions_text: null,
      cue_text: null,
      image_urls: [],
      bodyweight_contribution_pct: null,
      variation_of_id: null,
      source: 'test',
    },
  ],
  mappings: [{ exercise_id: 'ex-1', muscle_group_id: 'chest', role: 'primary', weight_factor: '1.00' }],
};

describe('loadCatalogSnapshot — happy path (bundled snapshot)', () => {
  it('inserts the bundled snapshot rows on a fresh database and reports loaded', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema, []);
    getPowerSyncMock.mockReturnValue(db as unknown as ReturnType<typeof getPowerSync>);

    const result = await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);

    expect(result.status).toBe('loaded');
    // Seeded rows land in seededExercise (WINDOWS #32), not exercise — exercise stays empty here
    // because loadCatalogSnapshot never writes to it; it is reserved for a user's own custom rows.
    // 03-05 replaced 03-01's hand-authored 3-exercise tracer fixture with the real, committed
    // 870-exercise catalog (byte-identical copy of catalog-normalized.json) — these counts are the
    // real artifact's, not the tracer's.
    expect(rows.get(schema.seededExercise)?.length).toBe(870);
    expect(rows.get(schema.exercise)?.length).toBe(0);
    expect(rows.get(schema.muscleGroup)?.length).toBe(19);
    // The artifact's raw mapping array carries 43 rows sharing an (exercise_id, muscle_group_id)
    // pair with another row (03-04 upstream data-quality debt, also handled server-side by
    // seed-catalog.ts's explicit dedup) — this loop's mutate-as-you-go existence Set naturally
    // deduplicates via last-write-wins on the composite id (Trap 1), unlike a bulk multi-row insert.
    expect(rows.get(schema.exerciseMuscleMapping)?.length).toBe(3134);
    expect(rows.get(schema.catalogMeta)?.length).toBe(1);
  });
});

describe('fakeDb — engine-shape assertions (regression gate for the upsert-against-a-view defect)', () => {
  it('raises the engine\'s own refusal text when onConflictDoUpdate is called on an insert, without a browser', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema, []);

    await expect(
      db
        .insert(schema.muscleGroup)
        .values({ id: 'chest', name: 'Chest', bodyRegion: 'chest' })
        .onConflictDoUpdate({ target: schema.muscleGroup.id, set: { name: 'Chest', bodyRegion: 'chest' } }),
    ).rejects.toThrow('cannot UPSERT a view');
  });

  it('raises the engine\'s own refusal text when onConflictDoNothing is called on an insert, without a browser', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema, []);

    await expect(
      db.insert(schema.muscleGroup).values({ id: 'chest', name: 'Chest', bodyRegion: 'chest' }).onConflictDoNothing(),
    ).rejects.toThrow('cannot UPSERT a view');
  });

  it('raises a uniqueness failure when inserting a row whose id is already present', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema, []);

    await db.insert(schema.muscleGroup).values({ id: 'chest', name: 'Chest', bodyRegion: 'chest' });

    await expect(db.insert(schema.muscleGroup).values({ id: 'chest', name: 'Chest v2', bodyRegion: 'chest' })).rejects.toThrow();
  });
});

describe('loadCatalogSnapshot — idempotency', () => {
  it('produces identical row counts on a second load and reports current, not loaded', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema, []);

    const first = await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);
    const countsAfterFirst = totalRows(rows);

    const second = await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);
    const countsAfterSecond = totalRows(rows);

    expect(first.status).toBe('loaded');
    expect(second.status).toBe('current');
    expect(countsAfterSecond).toBe(countsAfterFirst);
  });
});

describe('loadCatalogSnapshot — fail-closed on a malformed artifact', () => {
  it('rejects an empty catalog_version and leaves every table empty', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema, []);
    const badSnapshot = { ...VALID_SNAPSHOT, catalog_version: '' };

    const result = await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>, badSnapshot);

    expect(result.status).toBe('invalid');
    expect(totalRows(rows)).toBe(0);
  });

  it('rejects an exercise with an unrecognized load_type and leaves every table empty', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema, []);
    const badSnapshot = {
      ...VALID_SNAPSHOT,
      exercises: [{ ...VALID_SNAPSHOT.exercises[0], load_type: 'bogus' }],
    };

    const result = await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>, badSnapshot);

    expect(result.status).toBe('invalid');
    expect(totalRows(rows)).toBe(0);
  });

  // Structural guard: if isCatalogSnapshot's call in loadCatalogSnapshot is ever removed or
  // bypassed, this test goes red because the malformed snapshot above would otherwise reach the
  // transaction and write rows — the fail-closed test has teeth (03-01 task 3 acceptance).
  it('never opens a transaction for an invalid snapshot', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema, []);
    const transactionSpy = jest.spyOn(db, 'transaction');
    const badSnapshot = { ...VALID_SNAPSHOT, catalog_version: '' };

    await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>, badSnapshot);

    expect(transactionSpy).not.toHaveBeenCalled();
  });
});

describe('loadCatalogSnapshot — sync-queue visibility of localOnly tables', () => {
  it('produces zero tracked crud entries for the four localOnly tables specifically', async () => {
    const schema = loadSchema();
    // The four actual localOnly tables (matching apps/mobile/lib/db/powersync.ts's
    // localOnlyCatalogTables) are passed as localOnly here — schema.exercise is deliberately NOT
    // included, because it stays registered as an ordinary synced table in drizzleSchema
    // (reserved for a user's own custom exercises, which must sync).
    const { db, getCrudCount } = fakeDb(schema, [
      schema.muscleGroup,
      schema.seededExercise,
      schema.exerciseMuscleMapping,
      schema.catalogMeta,
    ]);

    // Isolate the localOnly-only claim: write directly to the four localOnly tables without the
    // exercise insert loadCatalogSnapshot also performs, so this assertion is not confounded by
    // the synced exercise table's own crud behavior (covered separately below).
    await db.insert(schema.muscleGroup).values({ id: 'chest', name: 'Chest', bodyRegion: 'chest' });
    await db
      .insert(schema.seededExercise)
      .values({ id: 'ex-1', name: 'Bench Press', loadType: 'external_weight', unilateral: false, source: 'test' });
    await db
      .insert(schema.exerciseMuscleMapping)
      .values({ id: 'ex-1:chest', exerciseId: 'ex-1', muscleGroupId: 'chest', role: 'primary', weightFactor: '1.00' });
    await db
      .insert(schema.catalogMeta)
      .values({ id: 'singleton', catalogVersion: 'test-0001', appliedAt: '2026-01-01T00:00:00.000Z' });

    expect(getCrudCount()).toBe(0);
  });

  // Regression guard for WINDOWS #32's fix: loadCatalogSnapshot used to write seeded exercise
  // rows into the SAME `exercise` table PowerSync registers as synced (for custom exercises).
  // PowerSync installs a CRUD trigger per table, not per row, so that insert generated a real
  // ps_crud entry per seeded row despite user_id being null — real upload traffic on every first
  // boot, ~900 rows once 03-05 seeds the full catalog. Seeded rows now go into the localOnly
  // seededExercise table instead (apps/mobile/lib/db/schema.ts), so a full catalog load must
  // produce ZERO tracked crud entries. If seeded rows ever go back into the synced `exercise`
  // table, this test goes red.
  it('a full catalog load produces zero tracked crud entries — seeded rows never enter the sync queue', async () => {
    const schema = loadSchema();
    const { db, getCrudCount } = fakeDb(schema, [
      schema.muscleGroup,
      schema.seededExercise,
      schema.exerciseMuscleMapping,
      schema.catalogMeta,
    ]);

    await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);

    expect(getCrudCount()).toBe(0);
  });

  it('getUploadQueueStats is available for a real-engine assertion of this same property', () => {
    // Not driven against a real PowerSyncDatabase here — @powersync/web's WASM engine requires a
    // real browser Worker/IndexedDB and hangs under this project's Jest (Node) environment; the
    // existing test-support.ts real-db harness is exercised exclusively by the Playwright
    // durability harness (apps/mobile/app/__durability.web.tsx), never by Jest. Filed as an
    // unrun-verify item in .planning/WINDOWS.md rather than silently skipped.
    expect(typeof getUploadQueueStats).toBe('function');
  });
});

describe('readCatalogVersion', () => {
  it('returns null before any load has run', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema, []);

    const version = await readCatalogVersion(db as unknown as ReturnType<typeof getPowerSync>);

    expect(version).toBeNull();
  });

  it('returns the applied catalog_version after a successful load', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema, []);

    await loadCatalogSnapshot(db as unknown as ReturnType<typeof getPowerSync>);
    const version = await readCatalogVersion(db as unknown as ReturnType<typeof getPowerSync>);

    // 03-05: real catalog_version (fb701c18b7999d47), not the 03-01 tracer's 'tracer-0001'.
    expect(version).toBe('fb701c18b7999d47');
  });
});
