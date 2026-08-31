// The shipped body-metrics.test.ts convention: @powersync/react-native reaches an ESM dist Jest
// cannot parse (WINDOWS #22/#33), so it is mocked before progress-photos.ts is imported.
jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));
// deletePhoto's own byte-deletion call, mocked so a test can assert it fired for the right key
// without touching a real native/IndexedDB store.
jest.mock('../../photos/photo-store', () => ({ deletePhotoBytes: jest.fn(() => Promise.resolve()) }));

import { Column, is, Param, SQL } from 'drizzle-orm';
import {
  canBuildComposite,
  deletePhoto,
  derivePhotoGalleryState,
  resolveGalleryCells,
  updatePhotoNote,
  type ProgressPhotoRow,
} from '../progress-photos';
import { deletePhotoBytes } from '../../photos/photo-store';
import { progressPhoto } from '../schema';

function row(overrides: Partial<ProgressPhotoRow> = {}): ProgressPhotoRow {
  return {
    id: 'pp-1',
    takenAt: '2026-08-20T09:00:00.000Z',
    timezone: 'UTC',
    localDate: '2026-08-20',
    storageKey: 'progress-photo/pp-1.jpg',
    note: null,
    ...overrides,
  };
}

describe('resolveGalleryCells', () => {
  it('tags a cell present when its storage_key is in the presence map, absent otherwise', () => {
    const rows = [row({ id: 'pp-1', storageKey: 'key-1' }), row({ id: 'pp-2', storageKey: 'key-2' })];
    const presence = new Map([
      ['key-1', true],
      ['key-2', false],
    ]);

    const cells = resolveGalleryCells(rows, presence);

    expect(cells).toEqual([
      { row: rows[0], present: true },
      { row: rows[1], present: false },
    ]);
  });

  it('preserves the rows own order across a mixed present/absent input — no grouping', () => {
    const rows = [
      row({ id: 'pp-1', storageKey: 'key-1' }),
      row({ id: 'pp-2', storageKey: 'key-2' }),
      row({ id: 'pp-3', storageKey: 'key-3' }),
      row({ id: 'pp-4', storageKey: 'key-4' }),
    ];
    const presence = new Map([
      ['key-1', true],
      ['key-2', false],
      ['key-3', true],
      ['key-4', false],
    ]);

    const cells = resolveGalleryCells(rows, presence);

    expect(cells.map((cell) => cell.row.id)).toEqual(['pp-1', 'pp-2', 'pp-3', 'pp-4']);
    expect(cells.map((cell) => cell.present)).toEqual([true, false, true, false]);
  });

  it('treats a storage_key absent from the presence map as absent, never throwing', () => {
    const rows = [row({ id: 'pp-1', storageKey: 'key-unknown' })];

    const cells = resolveGalleryCells(rows, new Map());

    expect(cells).toEqual([{ row: rows[0], present: false }]);
  });
});

describe('derivePhotoGalleryState', () => {
  it('is error when failed is true, regardless of cells', () => {
    expect(derivePhotoGalleryState({ failed: true, cells: null })).toBe('error');
    expect(derivePhotoGalleryState({ failed: true, cells: [] })).toBe('error');
  });

  it('is loading when not failed and cells has not landed yet (null)', () => {
    expect(derivePhotoGalleryState({ failed: false, cells: null })).toBe('loading');
  });

  it('is empty when cells landed as an empty array', () => {
    expect(derivePhotoGalleryState({ failed: false, cells: [] })).toBe('empty');
  });

  it('is ready when cells landed with at least one entry', () => {
    const cells = [{ row: row(), present: true }];
    expect(derivePhotoGalleryState({ failed: false, cells })).toBe('ready');
  });
});

describe('canBuildComposite', () => {
  it('is false for zero present cells', () => {
    expect(canBuildComposite([{ row: row(), present: false }])).toBe(false);
  });

  it('is false for exactly one present cell', () => {
    expect(canBuildComposite([{ row: row(), present: true }, { row: row({ id: 'pp-2' }), present: false }])).toBe(false);
  });

  it('is true for exactly two present cells', () => {
    expect(
      canBuildComposite([
        { row: row({ id: 'pp-1' }), present: true },
        { row: row({ id: 'pp-2' }), present: true },
      ]),
    ).toBe(true);
  });

  it('is true for five present cells', () => {
    const cells = Array.from({ length: 5 }, (_, index) => ({ row: row({ id: `pp-${index}` }), present: true }));
    expect(canBuildComposite(cells)).toBe(true);
  });
});

interface StoredRow {
  id: string;
  userId: string;
  takenAt: string;
  timezone: string;
  localDate: string;
  storageKey: string;
  note: string | null;
}

// Column name (as drizzle stores it) -> row property — exclusions.test.ts's small hardcoded map
// convention, since this fake only ever needs to understand progress_photo's shape.
const COLUMN_TO_FIELD: Partial<Record<string, keyof StoredRow>> = {
  id: 'id',
  user_id: 'userId',
};

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

function matches(storedRow: StoredRow, condition: unknown): boolean {
  const pairs = collectEqPairs(condition);
  return pairs.every(([field, value]) => storedRow[field as keyof StoredRow] === value);
}

// A real in-memory implementation of the exact select/update/delete call shapes deletePhoto and
// updatePhotoNote use — exclusions.test.ts/body-metrics.test.ts's own convention, so a test proves
// genuine cross-call state rather than that a method was merely called.
function fakePhotoDb(seed: StoredRow[]) {
  const rows: StoredRow[] = seed.map((r) => ({ ...r }));
  const updatedPatches: Record<string, unknown>[] = [];

  const db = {
    select: (_columns?: unknown) => ({
      from: (table: unknown) => {
        if (table !== progressPhoto) return { where: () => Promise.resolve([]) };
        return {
          where: (condition: unknown) => Promise.resolve(rows.filter((r) => matches(r, condition)).map((r) => ({ ...r }))),
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updatedPatches.push(patch);
          for (const r of rows) {
            if (matches(r, condition)) Object.assign(r, patch);
          }
          return Promise.resolve();
        },
      }),
    }),
    delete: (_table: unknown) => ({
      where: (condition: unknown) => {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i], condition)) rows.splice(i, 1);
        }
        return Promise.resolve();
      },
    }),
  } as unknown as Parameters<typeof deletePhoto>[1];

  return { db, rows, updatedPatches };
}

function storedRow(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    id: 'pp-1',
    userId: 'user-1',
    takenAt: '2026-08-20T09:00:00.000Z',
    timezone: 'UTC',
    localDate: '2026-08-20',
    storageKey: 'progress-photo/pp-1.jpg',
    note: null,
    ...overrides,
  };
}

describe('deletePhoto', () => {
  beforeEach(() => {
    (deletePhotoBytes as jest.Mock).mockClear();
  });

  it('removes the progress_photo row', async () => {
    const { db, rows } = fakePhotoDb([storedRow()]);

    await deletePhoto({ userId: 'user-1', id: 'pp-1' }, db);

    expect(rows).toHaveLength(0);
  });

  it('calls deletePhotoBytes for the row storage_key', async () => {
    const { db } = fakePhotoDb([storedRow({ storageKey: 'progress-photo/target.jpg' })]);

    await deletePhoto({ userId: 'user-1', id: 'pp-1' }, db);

    expect(deletePhotoBytes).toHaveBeenCalledWith('progress-photo/target.jpg');
  });

  it('resolves without throwing when the byte store reports the key already absent', async () => {
    (deletePhotoBytes as jest.Mock).mockImplementationOnce(() => Promise.resolve());
    const { db } = fakePhotoDb([storedRow()]);

    await expect(deletePhoto({ userId: 'user-1', id: 'pp-1' }, db)).resolves.toBeUndefined();
  });

  it('only removes the row matching both id and userId — never another user\'s photo of the same id', async () => {
    const { db, rows } = fakePhotoDb([storedRow({ userId: 'user-1' }), storedRow({ userId: 'user-2' })]);

    await deletePhoto({ userId: 'user-1', id: 'pp-1' }, db);

    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('user-2');
  });
});

describe('updatePhotoNote', () => {
  it('touches no column other than note', async () => {
    const { db, rows } = fakePhotoDb([storedRow({ note: 'old note' })]);

    await updatePhotoNote({ userId: 'user-1', id: 'pp-1', note: 'new note' }, db);

    expect(rows[0]).toEqual(
      storedRow({ note: 'new note' }),
    );
  });

  it('the update patch sent to the database carries only the note field', async () => {
    const { db, updatedPatches } = fakePhotoDb([storedRow()]);

    await updatePhotoNote({ userId: 'user-1', id: 'pp-1', note: 'after week 2' }, db);

    expect(updatedPatches).toEqual([{ note: 'after week 2' }]);
  });

  it('accepts null to clear an existing note', async () => {
    const { db, rows } = fakePhotoDb([storedRow({ note: 'old note' })]);

    await updatePhotoNote({ userId: 'user-1', id: 'pp-1', note: null }, db);

    expect(rows[0].note).toBeNull();
  });
});
