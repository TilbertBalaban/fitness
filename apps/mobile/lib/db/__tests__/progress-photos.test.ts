// The shipped body-metrics.test.ts convention: @powersync/react-native reaches an ESM dist Jest
// cannot parse (WINDOWS #22/#33), so it is mocked before progress-photos.ts is imported.
jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

import { canBuildComposite, derivePhotoGalleryState, resolveGalleryCells, type ProgressPhotoRow } from '../progress-photos';

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
