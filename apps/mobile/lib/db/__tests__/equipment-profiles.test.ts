import {
  SEEDED_PROFILE_NAME,
  ensureDefaultEquipmentProfile,
  loadActiveEquipmentProfileId,
  loadEquipmentProfile,
} from '../equipment-profiles';
import { getPowerSync, type WriteDb } from '../powersync';
import { equipmentProfile, userPreference } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

let mockIdCounter = 0;
jest.mock('../id', () => ({ generateClientId: jest.fn(() => `new-profile-${mockIdCounter++}`) }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

type TableLike = Record<string, { name?: string } | undefined>;
type Row = Record<string, unknown>;

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

interface Predicate {
  column: string;
  op: 'eq' | 'in' | 'isNull';
  values: unknown[];
}

// Extends history-mutations.test.ts's collectPredicates/rowMatches (kept as a per-file copy,
// matching this codebase's established pattern) with an isNull branch — drizzle represents
// isNull(column) as [StringChunk(''), column, StringChunk(' is null')], with no Param value chunk
// for the eq branch to catch.
function collectPredicates(node: unknown, out: Predicate[]): void {
  const chunks = (node as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return;

  let column: string | null = null;
  for (const chunk of chunks) {
    const part = chunk as { queryChunks?: unknown[]; name?: string; value?: unknown };
    if (Array.isArray(part?.queryChunks)) {
      collectPredicates(part, out);
      continue;
    }
    if (typeof part?.name === 'string') {
      column = part.name;
      continue;
    }
    if (Array.isArray(chunk) && column !== null) {
      out.push({ column, op: 'in', values: (chunk as { value: unknown }[]).map((item) => item.value) });
      column = null;
      continue;
    }
    if (Array.isArray(part?.value) && column !== null) {
      const text = (part.value as unknown[]).join('');
      if (text.includes('is null')) {
        out.push({ column, op: 'isNull', values: [] });
        column = null;
      }
      continue;
    }
    if (part && 'value' in part && !Array.isArray(part.value) && column !== null) {
      out.push({ column, op: 'eq', values: [part.value] });
      column = null;
    }
  }
}

function rowMatches(table: TableLike, row: Row, condition: unknown): boolean {
  const predicates: Predicate[] = [];
  collectPredicates(condition, predicates);
  if (predicates.length === 0) return true;
  return predicates.every(({ column, op, values }) => {
    const key = propertyKeyForColumn(table, column);
    if (key === undefined) return false;
    if (op === 'eq') return row[key] === values[0];
    if (op === 'in') return values.includes(row[key]);
    return row[key] === null || row[key] === undefined;
  });
}

// A small in-memory stand-in for the local database, in the same shape as
// history-mutations.test.ts's own inMemoryDb, extended with a chainable .orderBy() — the one extra
// query shape ensureDefaultEquipmentProfile needs (its existingProfile lookup sorts by name then id).
function inMemoryDb() {
  const tables = new Map<unknown, Row[]>();

  function rowsFor(table: unknown): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  }

  function projectRows(table: TableLike, projection: Record<string, unknown> | undefined, rows: Row[]): Row[] {
    if (!projection) return rows.map((row) => ({ ...row }));
    return rows.map((row) => {
      const projected: Row = {};
      for (const [alias, column] of Object.entries(projection)) {
        const key = propertyKeyForColumn(table, (column as { name?: string })?.name ?? alias) ?? alias;
        projected[alias] = row[key] ?? null;
      }
      return projected;
    });
  }

  const db = {
    select: (projection?: Record<string, unknown>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          const matched = rowsFor(table).filter((row) => rowMatches(table, row, condition));
          const base = Promise.resolve(projectRows(table, projection, matched));
          return Object.assign(base, {
            orderBy: (...columns: { name?: string }[]) => {
              const sorted = [...matched].sort((a, b) => {
                for (const col of columns) {
                  const key = propertyKeyForColumn(table, col?.name ?? '');
                  if (key === undefined) continue;
                  const av = a[key];
                  const bv = b[key];
                  if (av === bv) continue;
                  return (av as string) < (bv as string) ? -1 : 1;
                }
                return 0;
              });
              return Promise.resolve(projectRows(table, projection, sorted));
            },
          });
        },
      }),
    }),
    insert: (table: TableLike) => ({
      values: (values: Row) => {
        rowsFor(table).push({ ...values });
        return Promise.resolve();
      },
    }),
    update: (table: TableLike) => ({
      set: (patch: Row) => ({
        where: (condition: unknown) => {
          for (const row of rowsFor(table)) {
            if (rowMatches(table, row, condition)) Object.assign(row, patch);
          }
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as WriteDb;

  return {
    db,
    seed(table: unknown, row: Row) {
      rowsFor(table).push({ ...row });
    },
    rowsOf(table: unknown): Row[] {
      return rowsFor(table);
    },
  };
}

beforeEach(() => {
  mockIdCounter = 0;
  getPowerSyncMock.mockReset();
});

describe('loadEquipmentProfile', () => {
  it('parses the three JSON columns back into arrays', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, {
      id: 'p-1',
      userId: 'u-1',
      name: 'My Gym',
      isDefault: true,
      barbellWeightKg: '20.000',
      availablePlates: JSON.stringify([{ weightKg: '20.000', pairCount: 3 }]),
      dumbbellIncrementsKg: JSON.stringify([{ weightKg: '2.500' }]),
      machineAvailability: JSON.stringify([]),
      nativeUnit: 'kg',
      archivedAt: null,
    });

    await expect(loadEquipmentProfile('p-1', store.db)).resolves.toEqual({
      id: 'p-1',
      name: 'My Gym',
      isDefault: true,
      barbellWeightKg: '20.000',
      plates: [{ weightKg: '20.000', pairCount: 3 }],
      dumbbells: [{ weightKg: '2.500' }],
      machines: [],
      nativeUnit: 'kg',
      archivedAt: null,
    });
  });

  it('returns null for an unknown id', async () => {
    const store = inMemoryDb();
    await expect(loadEquipmentProfile('missing', store.db)).resolves.toBeNull();
  });
});

describe('loadActiveEquipmentProfileId', () => {
  it('reads the preference row default_equipment_profile_id', async () => {
    const store = inMemoryDb();
    store.seed(userPreference, { id: 'u-1', userId: 'u-1', defaultEquipmentProfileId: 'p-1', weightUnit: 'kg' });

    await expect(loadActiveEquipmentProfileId('u-1', store.db)).resolves.toBe('p-1');
  });

  it('returns null when no preference row exists', async () => {
    const store = inMemoryDb();
    await expect(loadActiveEquipmentProfileId('u-1', store.db)).resolves.toBeNull();
  });
});

describe('ensureDefaultEquipmentProfile', () => {
  it('seeds one "My Gym" profile and points the preference row at it, for a user with none', async () => {
    const store = inMemoryDb();

    const id = await ensureDefaultEquipmentProfile('u-1', store.db);

    expect(store.rowsOf(equipmentProfile)).toHaveLength(1);
    const seeded = store.rowsOf(equipmentProfile)[0];
    expect(seeded.id).toBe(id);
    expect(seeded.name).toBe(SEEDED_PROFILE_NAME);
    expect(seeded.isDefault).toBe(true);
    expect(seeded.barbellWeightKg).toBe('20.000');
    expect(JSON.parse(seeded.availablePlates as string)).toHaveLength(7);
    expect(JSON.parse(seeded.dumbbellIncrementsKg as string)).toHaveLength(20);
    expect(JSON.parse(seeded.machineAvailability as string)).toEqual([]);
    expect(store.rowsOf(userPreference)[0].defaultEquipmentProfileId).toBe(id);
  });

  it('seeds an lb inventory when the user preference weight unit is lb', async () => {
    const store = inMemoryDb();
    store.seed(userPreference, { id: 'u-1', userId: 'u-1', weightUnit: 'lb', defaultEquipmentProfileId: null });

    await ensureDefaultEquipmentProfile('u-1', store.db);

    const seeded = store.rowsOf(equipmentProfile)[0];
    expect(seeded.nativeUnit).toBe('lb');
    expect(seeded.barbellWeightKg).not.toBe('20.000');
  });

  it('called twice for the same user returns the same id and leaves exactly one profile row', async () => {
    const store = inMemoryDb();

    const first = await ensureDefaultEquipmentProfile('u-1', store.db);
    const second = await ensureDefaultEquipmentProfile('u-1', store.db);

    expect(second).toBe(first);
    expect(store.rowsOf(equipmentProfile)).toHaveLength(1);
  });

  it('returns the pointer profile id when the preference row already resolves to a non-archived profile', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, {
      id: 'p-existing',
      userId: 'u-1',
      name: 'Home Gym',
      isDefault: true,
      barbellWeightKg: '20.000',
      availablePlates: '[]',
      dumbbellIncrementsKg: '[]',
      machineAvailability: '[]',
      nativeUnit: 'kg',
      archivedAt: null,
    });
    store.seed(userPreference, { id: 'u-1', userId: 'u-1', weightUnit: 'kg', defaultEquipmentProfileId: 'p-existing' });

    const id = await ensureDefaultEquipmentProfile('u-1', store.db);

    expect(id).toBe('p-existing');
    expect(store.rowsOf(equipmentProfile)).toHaveLength(1);
  });

  it('falls back to the first non-archived profile by name when the pointer is stale/archived', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, {
      id: 'p-archived',
      userId: 'u-1',
      name: 'Old Gym',
      isDefault: true,
      barbellWeightKg: '20.000',
      availablePlates: '[]',
      dumbbellIncrementsKg: '[]',
      machineAvailability: '[]',
      nativeUnit: 'kg',
      archivedAt: '2026-01-01T00:00:00.000Z',
    });
    store.seed(equipmentProfile, {
      id: 'p-active',
      userId: 'u-1',
      name: 'Active Gym',
      isDefault: false,
      barbellWeightKg: '20.000',
      availablePlates: '[]',
      dumbbellIncrementsKg: '[]',
      machineAvailability: '[]',
      nativeUnit: 'kg',
      archivedAt: null,
    });
    store.seed(userPreference, { id: 'u-1', userId: 'u-1', weightUnit: 'kg', defaultEquipmentProfileId: 'p-archived' });

    const id = await ensureDefaultEquipmentProfile('u-1', store.db);

    expect(id).toBe('p-active');
    expect(store.rowsOf(equipmentProfile)).toHaveLength(2);
    expect(store.rowsOf(userPreference)[0].defaultEquipmentProfileId).toBe('p-active');
  });

  it('falls back to getPowerSync when no database is passed', async () => {
    const store = inMemoryDb();
    getPowerSyncMock.mockReturnValue(store.db);

    await ensureDefaultEquipmentProfile('u-1');

    expect(getPowerSyncMock).toHaveBeenCalled();
  });
});
