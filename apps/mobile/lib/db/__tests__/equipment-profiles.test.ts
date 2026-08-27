import {
  SEEDED_PROFILE_NAME,
  archiveEquipmentProfile,
  createEquipmentProfile,
  duplicateEquipmentProfile,
  ensureDefaultEquipmentProfile,
  formatGymRowSubtitle,
  loadActiveEquipmentProfileId,
  loadEquipmentProfile,
  loadEquipmentProfiles,
  resolveLiveEquipmentProfileId,
  restoreEquipmentProfile,
  updateEquipmentProfile,
  type EquipmentProfileRow,
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

function profileRow(overrides: Partial<EquipmentProfileRow> & { id: string }): Row {
  return {
    id: overrides.id,
    userId: 'u-1',
    name: overrides.name ?? overrides.id,
    isDefault: overrides.isDefault ?? false,
    barbellWeightKg: overrides.barbellWeightKg ?? null,
    availablePlates: JSON.stringify(overrides.plates ?? []),
    dumbbellIncrementsKg: JSON.stringify(overrides.dumbbells ?? []),
    machineAvailability: JSON.stringify(overrides.machines ?? []),
    nativeUnit: overrides.nativeUnit ?? 'kg',
    archivedAt: overrides.archivedAt ?? null,
  };
}

function equipmentRow(overrides: Partial<EquipmentProfileRow> & { id: string }): EquipmentProfileRow {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    isDefault: overrides.isDefault ?? false,
    barbellWeightKg: overrides.barbellWeightKg ?? null,
    plates: overrides.plates ?? [],
    dumbbells: overrides.dumbbells ?? [],
    machines: overrides.machines ?? [],
    nativeUnit: overrides.nativeUnit ?? 'kg',
    archivedAt: overrides.archivedAt ?? null,
  };
}

describe('loadEquipmentProfiles', () => {
  it('returns every profile including archived ones, sorted by name then id', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-b', name: 'Bravo' }));
    store.seed(equipmentProfile, profileRow({ id: 'p-a', name: 'Alpha' }));
    store.seed(equipmentProfile, profileRow({ id: 'p-x', name: 'Old Gym', archivedAt: '2026-01-01T00:00:00.000Z' }));

    const rows = await loadEquipmentProfiles('u-1', store.db);

    expect(rows.map((row) => row.id)).toEqual(['p-a', 'p-b', 'p-x']);
    expect(rows.find((row) => row.id === 'p-x')?.archivedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('orders two gyms sharing a name by id so the sequence is total', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-b', name: 'Same' }));
    store.seed(equipmentProfile, profileRow({ id: 'p-a', name: 'Same' }));

    const rows = await loadEquipmentProfiles('u-1', store.db);

    expect(rows.map((row) => row.id)).toEqual(['p-a', 'p-b']);
  });
});

describe('resolveLiveEquipmentProfileId', () => {
  const LIVE = equipmentRow({ id: 'g-live', name: 'A Live Gym' });
  const OTHER_LIVE = equipmentRow({ id: 'g-other', name: 'B Other Gym' });
  const ARCHIVED = equipmentRow({ id: 'g-archived', name: 'Old Gym', archivedAt: '2026-01-01T00:00:00.000Z' });

  it('resolves a pointer naming a live gym', () => {
    expect(resolveLiveEquipmentProfileId([LIVE, OTHER_LIVE], 'g-live')).toBe('g-live');
  });

  // Unlike resolveLiveRoutineId (a program CAN have zero active), a gym profile always has exactly
  // one active gym — so archiving the currently active gym must still resolve a live one rather than
  // leaving the pointer dangling.
  it('falls back to the first live gym by the total ordering when the pointer names an archived gym', () => {
    expect(resolveLiveEquipmentProfileId([ARCHIVED, LIVE, OTHER_LIVE], 'g-archived')).toBe('g-live');
  });

  it('falls back to the first live gym when the pointer names a gym this device does not hold', () => {
    expect(resolveLiveEquipmentProfileId([LIVE, OTHER_LIVE], 'g-unsynced')).toBe('g-live');
  });

  it('falls back to the first live gym when the pointer is absent', () => {
    expect(resolveLiveEquipmentProfileId([LIVE, OTHER_LIVE], null)).toBe('g-live');
    expect(resolveLiveEquipmentProfileId([LIVE, OTHER_LIVE], undefined)).toBe('g-live');
  });

  it('returns null when every row is archived', () => {
    expect(resolveLiveEquipmentProfileId([ARCHIVED], 'g-archived')).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(resolveLiveEquipmentProfileId([], 'g-live')).toBeNull();
  });

  it('does not mutate or reorder the list it is given', () => {
    const rows = [ARCHIVED, LIVE, OTHER_LIVE];
    resolveLiveEquipmentProfileId(rows, 'g-archived');
    expect(rows).toEqual([ARCHIVED, LIVE, OTHER_LIVE]);
  });
});

describe('createEquipmentProfile', () => {
  it('inserts a non-default, non-archived row with a fresh client id', async () => {
    const store = inMemoryDb();

    const id = await createEquipmentProfile({ userId: 'u-1', name: 'Home Gym', nativeUnit: 'kg' }, store.db);

    expect(store.rowsOf(equipmentProfile)).toHaveLength(1);
    const created = store.rowsOf(equipmentProfile)[0];
    expect(created.id).toBe(id);
    expect(created.name).toBe('Home Gym');
    expect(created.isDefault).toBe(false);
    expect(created.archivedAt).toBeNull();
  });

  it('trims the name and throws on a blank one, writing nothing', async () => {
    const store = inMemoryDb();

    await expect(createEquipmentProfile({ userId: 'u-1', name: '   ', nativeUnit: 'kg' }, store.db)).rejects.toThrow(
      'Gym name is required',
    );
    expect(store.rowsOf(equipmentProfile)).toHaveLength(0);
  });
});

describe('updateEquipmentProfile', () => {
  it('writes only the fields the caller supplies', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-1', name: 'Old Name', barbellWeightKg: '20.000' }));

    await updateEquipmentProfile('p-1', { name: 'New Name' }, store.db);

    const row = store.rowsOf(equipmentProfile)[0];
    expect(row.name).toBe('New Name');
    expect(row.barbellWeightKg).toBe('20.000');
  });

  it('serializes a supplied plates array through serializeEquipmentJson, never JSON.stringify at the call site', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-1' }));

    await updateEquipmentProfile('p-1', { plates: [{ weightKg: '20.000', pairCount: 2 }] }, store.db);

    expect(JSON.parse(store.rowsOf(equipmentProfile)[0].availablePlates as string)).toEqual([
      { weightKg: '20.000', pairCount: 2 },
    ]);
  });
});

describe('archiveEquipmentProfile / restoreEquipmentProfile', () => {
  it('stamps archivedAt and never deletes', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-1' }));
    store.seed(equipmentProfile, profileRow({ id: 'p-2', name: 'Other Gym' }));

    await archiveEquipmentProfile('p-1', store.db);

    expect(store.rowsOf(equipmentProfile)).toHaveLength(2);
    const archived = store.rowsOf(equipmentProfile).find((row) => row.id === 'p-1');
    expect(typeof archived?.archivedAt).toBe('string');
  });

  // E1's contract: exactly one gym must always read as active, so archiving a user's last live
  // row is rejected rather than silently leaving zero (WR-02).
  it('rejects archiving a user\'s only remaining live gym', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-1' }));

    await expect(archiveEquipmentProfile('p-1', store.db)).rejects.toThrow();

    expect(store.rowsOf(equipmentProfile)[0].archivedAt).toBeNull();
  });

  it('allows archiving one of several live gyms for the same user', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-1' }));
    store.seed(equipmentProfile, profileRow({ id: 'p-2', name: 'Other Gym' }));

    await archiveEquipmentProfile('p-1', store.db);

    const rows = store.rowsOf(equipmentProfile);
    expect(rows.find((row) => row.id === 'p-1')?.archivedAt).not.toBeNull();
    expect(rows.find((row) => row.id === 'p-2')?.archivedAt).toBeNull();
  });

  it('is a no-op re-stamp when the target is already archived, even as the only live-or-archived row', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-1', archivedAt: '2026-01-01T00:00:00.000Z' }));

    await archiveEquipmentProfile('p-1', store.db);

    expect(store.rowsOf(equipmentProfile)[0].archivedAt).toEqual(expect.any(String));
  });

  it('clears archivedAt on restore', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-1', archivedAt: '2026-01-01T00:00:00.000Z' }));

    await restoreEquipmentProfile('p-1', store.db);

    expect(store.rowsOf(equipmentProfile)[0].archivedAt).toBeNull();
  });

  // The behaviour this plan requires: archiving the currently active gym leaves the pointer
  // resolvable. archiveEquipmentProfile itself only stamps the timestamp — the read side
  // (resolveLiveEquipmentProfileId) is the one place that must never present the archived gym as
  // active again.
  it('archiving the active gym still resolves a live gym on the read side', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, profileRow({ id: 'p-active', name: 'Active Gym' }));
    store.seed(equipmentProfile, profileRow({ id: 'p-other', name: 'Other Gym' }));

    await archiveEquipmentProfile('p-active', store.db);

    const rows = await loadEquipmentProfiles('u-1', store.db);
    expect(resolveLiveEquipmentProfileId(rows, 'p-active')).toBe('p-other');
  });
});

describe('duplicateEquipmentProfile', () => {
  it('produces a new row with a fresh client id, a distinct name, is_default false, archived_at null, and a deep-equal inventory', async () => {
    const store = inMemoryDb();
    store.seed(
      equipmentProfile,
      profileRow({
        id: 'p-source',
        name: 'My Gym',
        isDefault: true,
        barbellWeightKg: '20.000',
        plates: [{ weightKg: '20.000', pairCount: 3 }],
        dumbbells: [{ weightKg: '2.500' }],
        machines: [],
      }),
    );

    const newId = await duplicateEquipmentProfile('u-1', 'p-source', store.db);

    expect(newId).not.toBe('p-source');
    expect(store.rowsOf(equipmentProfile)).toHaveLength(2);
    const copy = store.rowsOf(equipmentProfile).find((row) => row.id === newId)!;
    expect(copy.name).toBe('My Gym copy');
    expect(copy.isDefault).toBe(false);
    expect(copy.archivedAt).toBeNull();
    expect(JSON.parse(copy.availablePlates as string)).toEqual([{ weightKg: '20.000', pairCount: 3 }]);
    expect(JSON.parse(copy.dumbbellIncrementsKg as string)).toEqual([{ weightKg: '2.500' }]);
  });

  it('throws when the source profile does not exist', async () => {
    const store = inMemoryDb();
    await expect(duplicateEquipmentProfile('u-1', 'missing', store.db)).rejects.toThrow('Gym profile not found');
  });
});

describe('formatGymRowSubtitle', () => {
  it('returns "Archived" alone for an archived row, regardless of configured sections', () => {
    expect(
      formatGymRowSubtitle({
        barbellWeightKg: '20.000',
        plateCount: 6,
        dumbbellCount: 20,
        machineCount: 3,
        nativeUnit: 'kg',
        archivedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe('Archived');
  });

  it('returns an empty string for a gym with nothing configured — never a zero count', () => {
    const subtitle = formatGymRowSubtitle({
      barbellWeightKg: null,
      plateCount: 0,
      dumbbellCount: 0,
      machineCount: 0,
      nativeUnit: 'kg',
      archivedAt: null,
    });
    expect(subtitle).toBe('');
  });

  it('joins only the configured sections in fixed order: bar, plates, dumbbells, machines', () => {
    const subtitle = formatGymRowSubtitle({
      barbellWeightKg: '20.000',
      plateCount: 6,
      dumbbellCount: 0,
      machineCount: 0,
      nativeUnit: 'kg',
      archivedAt: null,
    });
    expect(subtitle).toBe('20.00kg bar · 6 plate types');
  });

  it('omits the bar section when no barbell weight is configured, without leaving a stray separator', () => {
    const subtitle = formatGymRowSubtitle({
      barbellWeightKg: null,
      plateCount: 3,
      dumbbellCount: 5,
      machineCount: 0,
      nativeUnit: 'kg',
      archivedAt: null,
    });
    expect(subtitle).toBe('3 plate types · 5 dumbbell weights');
  });

  it('formats the bar weight in the profile\'s own unit, converting from the canonical kg column', () => {
    const subtitle = formatGymRowSubtitle({
      barbellWeightKg: '20.000',
      plateCount: 0,
      dumbbellCount: 0,
      machineCount: 0,
      nativeUnit: 'lb',
      archivedAt: null,
    });
    expect(subtitle).toContain('lb bar');
    expect(subtitle).not.toContain('20lb');
  });

  it('includes every section when all four are configured', () => {
    const subtitle = formatGymRowSubtitle({
      barbellWeightKg: '20.000',
      plateCount: 1,
      dumbbellCount: 1,
      machineCount: 1,
      nativeUnit: 'kg',
      archivedAt: null,
    });
    expect(subtitle).toBe('20.00kg bar · 1 plate type · 1 dumbbell weight · 1 machine');
  });
});
