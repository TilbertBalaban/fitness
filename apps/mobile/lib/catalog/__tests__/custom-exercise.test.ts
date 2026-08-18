import {
  MAX_NAME_LENGTH,
  createCustomExercise,
  draftFromExerciseDetail,
  duplicateExercise,
  getExerciseOwnerUserId,
  isSaveEnabled,
  normalizeExerciseName,
  resolveEditAccess,
  submitEditExercise,
  submitNewExercise,
  updateCustomExercise,
  validateCustomExercise,
  type CustomExerciseDraft,
} from '../custom-exercise';
import type { ExerciseDetail } from '../exercise-detail';
import { getPowerSync } from '../../db/powersync';

jest.mock('../../db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));

type DbSchema = typeof import('../../db/schema');

// A table-identity-keyed in-memory fake, following the established fakeDb() shape from
// apps/mobile/lib/catalog/__tests__/load-snapshot.test.ts and
// apps/mobile/lib/db/__tests__/log-set.test.ts. Unlike those two, this fake gives
// db.transaction() real snapshot/restore rollback semantics — createCustomExercise's "a failure
// partway through leaves neither row" test needs an actual rollback, not just a callback
// pass-through. Every select/update/delete ignores its WHERE condition and operates on the whole
// table (same limitation those two established fakes document) — every test below keeps each
// table scoped to exactly the row(s) relevant to that test, which is what makes "operate on the
// whole table" equivalent to "operate on the filtered row".
function fakeDb(schema: DbSchema) {
  const rows = new Map<unknown, Record<string, unknown>[]>([
    [schema.exercise, []],
    [schema.seededExercise, []],
    [schema.exerciseMuscleMapping, []],
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
      };
    };
    insert: (table: unknown) => {
      values: (values: Record<string, unknown>) => {
        then: (resolve: (value: undefined) => unknown, reject?: (err: unknown) => unknown) => unknown;
      };
    };
    update: (table: unknown) => {
      set: (setValues: Record<string, unknown>) => { where: () => Promise<void> };
    };
    delete: (table: unknown) => { where: () => Promise<void> };
    transaction: (callback: (tx: FakeDb) => Promise<void>) => Promise<void>;
  }

  const db: FakeDb = {
    select: (fields) => ({
      from: (table) => ({
        where: () => {
          const tableRows = rows.get(table) ?? [];
          const project = (row: Record<string, unknown>) => {
            const projected: Record<string, unknown> = {};
            for (const key of Object.keys(fields)) projected[key] = row[key];
            return projected;
          };
          return Promise.resolve(tableRows.map(project));
        },
      }),
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
    update: (table) => ({
      set: (setValues) => ({
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
    delete: (table) => ({
      where: () => {
        rows.set(table, []);
        return Promise.resolve();
      },
    }),
    transaction: async (callback) => {
      const snapshot = new Map(Array.from(rows.entries()).map(([table, arr]) => [table, [...arr]]));
      try {
        await callback(db);
      } catch (err) {
        rows.clear();
        for (const [table, arr] of snapshot) rows.set(table, arr);
        throw err;
      }
    },
  };

  return { db, rows };
}

function loadSchema(): DbSchema {
  return jest.requireActual('../../db/schema');
}

type PowerSyncDb = ReturnType<typeof getPowerSync>;

describe('normalizeExerciseName', () => {
  it('trims and collapses internal whitespace without altering casing or diacritics', () => {
    expect(normalizeExerciseName('  Bench   Press  ')).toBe('Bench Press');
    expect(normalizeExerciseName('Barré Squat')).toBe('Barré Squat');
  });
});

describe('validateCustomExercise', () => {
  it('rejects an empty name with a name error', () => {
    const draft: CustomExerciseDraft = { name: '', loadType: 'external_weight' };
    expect(validateCustomExercise(draft).name).toBeDefined();
  });

  it('rejects a whitespace-only name with a name error', () => {
    const draft: CustomExerciseDraft = { name: '   ', loadType: 'external_weight' };
    expect(validateCustomExercise(draft).name).toBeDefined();
  });

  it('rejects a name made only of combining marks with a name error', () => {
    const draft: CustomExerciseDraft = { name: '́́́', loadType: 'external_weight' };
    expect(validateCustomExercise(draft).name).toBeDefined();
  });

  it('rejects a draft with no load_type', () => {
    const draft: CustomExerciseDraft = { name: 'Bench Press', loadType: null };
    expect(validateCustomExercise(draft).load_type).toBeDefined();
  });

  it('is valid with only a name and load_type set — equipment, cues and instructions are optional', () => {
    const draft: CustomExerciseDraft = { name: 'Bench Press', loadType: 'external_weight' };
    expect(validateCustomExercise(draft)).toEqual({});
  });

  it('rejects a load_type outside LOAD_TYPES', () => {
    const draft = { name: 'Bench Press', loadType: 'made_up' } as unknown as CustomExerciseDraft;
    expect(validateCustomExercise(draft).load_type).toBeDefined();
  });

  it('rejects an equipment_required outside EQUIPMENT_TYPES', () => {
    const draft = {
      name: 'Bench Press',
      loadType: 'external_weight',
      equipmentRequired: 'made_up',
    } as unknown as CustomExerciseDraft;
    expect(validateCustomExercise(draft).equipment_required).toBeDefined();
  });

  it('rejects a muscle mapping naming an unknown muscle group or role', () => {
    const draft = {
      name: 'Bench Press',
      loadType: 'external_weight',
      muscleMappings: [{ muscleGroupId: 'made_up', role: 'primary' }],
    } as unknown as CustomExerciseDraft;
    expect(validateCustomExercise(draft).muscle_mappings).toBeDefined();
  });

  it('measures name length in Unicode code points, not UTF-16 code units', () => {
    const tooLong = '💪'.repeat(MAX_NAME_LENGTH + 1);
    const atLimit = '💪'.repeat(MAX_NAME_LENGTH);

    expect([...tooLong].length).toBe(MAX_NAME_LENGTH + 1);
    expect(tooLong.length).toBeGreaterThan([...tooLong].length);

    expect(validateCustomExercise({ name: tooLong, loadType: 'external_weight' }).name).toBeDefined();
    expect(validateCustomExercise({ name: atLimit, loadType: 'external_weight' }).name).toBeUndefined();
  });
});

describe('createCustomExercise', () => {
  it('assigns an id from lib/db/id.ts before any write and returns it', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema);

    const id = await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Cable Fly',
      loadType: 'external_weight',
    });

    expect(id).toBe('fixed-id');
  });

  it('writes is_custom true, source user, user_id set, archived_at null', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);

    await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Cable Fly',
      loadType: 'external_weight',
    });

    const [row] = rows.get(schema.exercise) ?? [];
    expect(row).toMatchObject({
      id: 'fixed-id',
      userId: 'user-1',
      isCustom: true,
      source: 'user',
      archivedAt: null,
    });
  });

  it('succeeds with zero muscle mappings and writes no mapping rows', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);

    await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Plank',
      loadType: 'time_based',
    });

    expect(rows.get(schema.exercise)?.length).toBe(1);
    expect(rows.get(schema.exerciseMuscleMapping)?.length ?? 0).toBe(0);
  });

  it('survives and reads back a name with emoji, accented Latin and CJK byte-identically', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    const rawName = 'Barré Squat 💪 ベンチプレス';

    await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: rawName,
      loadType: 'external_weight',
    });

    const [row] = rows.get(schema.exercise) ?? [];
    expect(row.name).toBe(rawName.normalize('NFC'));
  });

  it('rejects an invalid draft without writing anything', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);

    await expect(
      createCustomExercise(db as unknown as PowerSyncDb, 'user-1', { name: '', loadType: null }),
    ).rejects.toThrow();

    expect(rows.get(schema.exercise)?.length ?? 0).toBe(0);
  });

  it('rolls back both the exercise row and any mapping rows if a write partway through the transaction fails', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);

    const originalInsert = db.insert.bind(db);
    jest.spyOn(db, 'insert').mockImplementation((table: unknown) => {
      if (table === schema.exerciseMuscleMapping) {
        throw new Error('simulated failure');
      }
      return originalInsert(table);
    });

    await expect(
      createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
        name: 'Cable Fly',
        loadType: 'external_weight',
        muscleMappings: [{ muscleGroupId: 'chest', role: 'primary' }],
      }),
    ).rejects.toThrow('simulated failure');

    expect(rows.get(schema.exercise)?.length ?? 0).toBe(0);
    expect(rows.get(schema.exerciseMuscleMapping)?.length ?? 0).toBe(0);
  });
});

describe('updateCustomExercise', () => {
  it('updates the existing row by id rather than creating a second one', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    const id = await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Old Name',
      loadType: 'external_weight',
    });

    await updateCustomExercise(db as unknown as PowerSyncDb, 'user-1', id, {
      name: 'New Name',
      loadType: 'bodyweight',
    });

    const exerciseRows = rows.get(schema.exercise) ?? [];
    expect(exerciseRows.length).toBe(1);
    expect(exerciseRows[0]).toMatchObject({ id: 'fixed-id', name: 'New Name', loadType: 'bodyweight' });
  });

  it('replaces mapping rows wholesale rather than accumulating them', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    const id = await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Row',
      loadType: 'external_weight',
      muscleMappings: [{ muscleGroupId: 'lats', role: 'primary' }],
    });

    await updateCustomExercise(db as unknown as PowerSyncDb, 'user-1', id, {
      name: 'Row',
      loadType: 'external_weight',
      muscleMappings: [
        { muscleGroupId: 'lats', role: 'primary' },
        { muscleGroupId: 'biceps', role: 'secondary' },
      ],
    });

    expect(rows.get(schema.exerciseMuscleMapping)?.length).toBe(2);
  });
});

describe('duplicateExercise', () => {
  const seedSource = {
    id: 'seed-1',
    name: 'Pull-Up',
    aliases: null,
    movementPattern: 'vertical_pull',
    equipmentRequired: null,
    loadType: 'bodyweight',
    unilateral: false,
    instructionsText: null,
    cueText: null,
    imageUrls: null,
    bodyweightContributionPct: '1.000',
    variationOfId: null,
    source: 'seed',
  };

  it('produces a new id, is_custom true, source user, variation_of_id set to the source id, with copied mappings', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    rows.set(schema.seededExercise, [{ ...seedSource }]);
    rows.set(schema.exerciseMuscleMapping, [
      { id: 'seed-1:lats', exerciseId: 'seed-1', muscleGroupId: 'lats', role: 'primary', weightFactor: '1.00' },
      { id: 'seed-1:biceps', exerciseId: 'seed-1', muscleGroupId: 'biceps', role: 'secondary', weightFactor: '0.50' },
    ]);

    const newId = await duplicateExercise(db as unknown as PowerSyncDb, 'user-1', 'seed-1');

    expect(newId).toBe('fixed-id');
    const customRows = rows.get(schema.exercise) ?? [];
    expect(customRows.length).toBe(1);
    expect(customRows[0]).toMatchObject({
      id: 'fixed-id',
      userId: 'user-1',
      name: 'Pull-Up',
      isCustom: true,
      source: 'user',
      variationOfId: 'seed-1',
    });

    const copiedMappings = (rows.get(schema.exerciseMuscleMapping) ?? []).filter((row) => row.exerciseId === 'fixed-id');
    expect(copiedMappings.length).toBe(2);
    expect(copiedMappings.map((row) => row.weightFactor).sort()).toEqual(['0.50', '1.00']);
  });

  it('leaves the source row byte-identical after duplication', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    rows.set(schema.seededExercise, [{ ...seedSource }]);

    await duplicateExercise(db as unknown as PowerSyncDb, 'user-1', 'seed-1');

    expect(rows.get(schema.seededExercise)).toEqual([seedSource]);
  });
});

describe('getExerciseOwnerUserId', () => {
  it("returns the owning user's id for a custom row", async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    rows.set(schema.exercise, [{ id: 'ex-1', userId: 'user-1' }]);

    const owner = await getExerciseOwnerUserId(db as unknown as PowerSyncDb, 'ex-1');

    expect(owner).toBe('user-1');
  });

  it('returns null for an id not present in the synced exercise table (a seeded row)', async () => {
    const schema = loadSchema();
    const { db } = fakeDb(schema);

    const owner = await getExerciseOwnerUserId(db as unknown as PowerSyncDb, 'seed-1');

    expect(owner).toBeNull();
  });
});

describe('isSaveEnabled', () => {
  it('is false while name or load_type is unset', () => {
    expect(isSaveEnabled({ name: '', loadType: null })).toBe(false);
    expect(isSaveEnabled({ name: 'Bench Press', loadType: null })).toBe(false);
    expect(isSaveEnabled({ name: '', loadType: 'external_weight' })).toBe(false);
  });

  it('is true once name and load_type are both set, regardless of other optional fields', () => {
    expect(isSaveEnabled({ name: 'Bench Press', loadType: 'external_weight' })).toBe(true);
  });
});

describe('resolveEditAccess', () => {
  it('is owned when the current user matches the row owner', () => {
    expect(resolveEditAccess('user-1', 'user-1')).toBe('owned');
  });

  it('is not-permitted for a seeded row (null owner) — every seeded row', () => {
    expect(resolveEditAccess(null, 'user-1')).toBe('not-permitted');
  });

  it("is not-permitted for another user's custom row", () => {
    expect(resolveEditAccess('user-2', 'user-1')).toBe('not-permitted');
  });

  it('is not-permitted when there is no signed-in user', () => {
    expect(resolveEditAccess('user-1', null)).toBe('not-permitted');
  });
});

describe('draftFromExerciseDetail', () => {
  it('maps a loaded ExerciseDetail into a pre-filled draft with primary/secondary muscle mappings', () => {
    const detail: ExerciseDetail = {
      id: 'ex-1',
      name: 'Pull-Up',
      aliases: [],
      movementPattern: 'vertical_pull',
      equipmentRequired: null,
      loadType: 'bodyweight',
      unilateral: false,
      instructionsText: 'Grip the bar.',
      cueText: 'Chest up.',
      imageUrls: [],
      primaryMuscles: [{ muscleGroupId: 'lats', name: 'Lats', bodyRegion: 'back', weightFactor: '1.00' }],
      secondaryMuscles: [{ muscleGroupId: 'biceps', name: 'Biceps', bodyRegion: 'arms', weightFactor: '0.50' }],
    };

    const draft = draftFromExerciseDetail(detail);

    expect(draft.name).toBe('Pull-Up');
    expect(draft.loadType).toBe('bodyweight');
    expect(draft.instructionsText).toBe('Grip the bar.');
    expect(draft.muscleMappings).toEqual([
      { muscleGroupId: 'lats', role: 'primary', weightFactor: '1.00' },
      { muscleGroupId: 'biceps', role: 'secondary', weightFactor: '0.50' },
    ]);
  });
});

describe('submitNewExercise', () => {
  it('does not call the write function for an invalid draft and returns per-field errors', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);

    const result = await submitNewExercise(db as unknown as PowerSyncDb, 'user-1', { name: '', loadType: null });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.name).toBeDefined();
    expect(rows.get(schema.exercise)?.length ?? 0).toBe(0);
  });

  it('calls the write function exactly once for a valid draft and returns the new id', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);

    const result = await submitNewExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Cable Fly',
      loadType: 'external_weight',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.id).toBe('fixed-id');
    expect(rows.get(schema.exercise)?.length).toBe(1);
  });
});

describe('submitEditExercise', () => {
  it('does not call the write function for an invalid draft', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    const id = await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Original',
      loadType: 'external_weight',
    });

    const result = await submitEditExercise(db as unknown as PowerSyncDb, 'user-1', id, {
      name: '',
      loadType: null,
    });

    expect(result.ok).toBe(false);
    const [row] = rows.get(schema.exercise) ?? [];
    expect(row.name).toBe('Original');
  });

  it('calls the write function exactly once for a valid draft and updates the row', async () => {
    const schema = loadSchema();
    const { db, rows } = fakeDb(schema);
    const id = await createCustomExercise(db as unknown as PowerSyncDb, 'user-1', {
      name: 'Original',
      loadType: 'external_weight',
    });

    const result = await submitEditExercise(db as unknown as PowerSyncDb, 'user-1', id, {
      name: 'Renamed',
      loadType: 'bodyweight',
    });

    expect(result.ok).toBe(true);
    const [row] = rows.get(schema.exercise) ?? [];
    expect(row.name).toBe('Renamed');
    expect(rows.get(schema.exercise)?.length).toBe(1);
  });
});
