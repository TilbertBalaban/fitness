import type { ResolvedInventory } from '@fitness/plate-math';
import {
  clearEquipmentUnavailable,
  equipmentSwapConstraints,
  loadSessionInventory,
  loadSessionUnavailable,
  markEquipmentUnavailable,
  removeEquipmentFromProfile,
  restampSessionGym,
} from '../session-equipment';
import { getPowerSync, type WriteDb } from '../powersync';
import { equipmentProfile, workoutSession } from '../schema';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

const getPowerSyncMock = getPowerSync as jest.MockedFunction<typeof getPowerSync>;

type TableLike = Record<string, { name?: string } | undefined>;
type Row = Record<string, unknown>;

function propertyKeyForColumn(table: TableLike, columnName: string): string | undefined {
  return Object.entries(table).find(([, column]) => column?.name === columnName)?.[0];
}

// Mirrors equipment-profiles.test.ts's own collectPredicates/rowMatches (kept as a per-file copy,
// matching this codebase's established convention).
interface Predicate {
  column: string;
  op: 'eq' | 'in' | 'isNull';
  values: unknown[];
}

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

// A small in-memory stand-in for the local database, same shape as equipment-profiles.test.ts's
// own inMemoryDb, extended with .update() (which that file already has) — no new query shape
// needed for this module's two functions.
function inMemoryDb() {
  const tables = new Map<unknown, Row[]>();

  function rowsFor(table: unknown): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  }

  const db = {
    select: (projection?: Record<string, unknown>) => ({
      from: (table: TableLike) => ({
        where: (condition: unknown) => {
          const matched = rowsFor(table).filter((row) => rowMatches(table, row, condition));
          return Promise.resolve(projectRows(table, projection, matched));
        },
      }),
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
  getPowerSyncMock.mockReset();
});

const BASE_PROFILE = {
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
};

describe('loadSessionInventory', () => {
  it('resolves the session\'s stamped gym into a ResolvedInventory', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', equipmentProfileId: 'p-1' });
    store.seed(equipmentProfile, BASE_PROFILE);

    const inventory = await loadSessionInventory('s-1', store.db);

    expect(inventory).toEqual({
      nativeUnit: 'kg',
      barbellWeightKg: '20.000',
      plates: [{ weightKg: '20.000', pairCount: 3 }],
      dumbbells: [{ weightKg: '2.500' }],
      machines: [],
      unavailableEquipmentTypes: [],
    });
  });

  it('returns null when the session has no stamped gym', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', equipmentProfileId: null });

    await expect(loadSessionInventory('s-1', store.db)).resolves.toBeNull();
  });

  it('returns null when the stamped gym no longer exists, rather than falling back to the live active pointer', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', equipmentProfileId: 'missing-profile' });

    await expect(loadSessionInventory('s-1', store.db)).resolves.toBeNull();
  });

  it('returns null for an unknown session id', async () => {
    const store = inMemoryDb();
    await expect(loadSessionInventory('missing-session', store.db)).resolves.toBeNull();
  });

  it('returns deeply equal inventories across two successive calls for an unchanged session', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', equipmentProfileId: 'p-1' });
    store.seed(equipmentProfile, BASE_PROFILE);

    const first = await loadSessionInventory('s-1', store.db);
    const second = await loadSessionInventory('s-1', store.db);

    expect(first).toEqual(second);
  });
});

describe('restampSessionGym', () => {
  it("writes only the session's equipment_profile_id column", async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, {
      id: 's-1',
      equipmentProfileId: 'old-profile',
      notes: 'unchanged',
      status: 'in_progress',
    });

    await restampSessionGym('s-1', 'new-profile', store.db);

    expect(store.rowsOf(workoutSession)[0]).toEqual({
      id: 's-1',
      equipmentProfileId: 'new-profile',
      notes: 'unchanged',
      status: 'in_progress',
    });
  });

  it('touches no other session row', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', equipmentProfileId: 'old' });
    store.seed(workoutSession, { id: 's-2', equipmentProfileId: 'old' });

    await restampSessionGym('s-1', 'new', store.db);

    expect(store.rowsOf(workoutSession)[1]).toEqual({ id: 's-2', equipmentProfileId: 'old' });
  });
});

describe('loadSessionUnavailable', () => {
  it('returns an empty array when the session has no marks', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: null });

    await expect(loadSessionUnavailable('s-1', store.db)).resolves.toEqual([]);
  });

  it('parses the stored marks', async () => {
    const store = inMemoryDb();
    const marks = [{ kind: 'machine', machineId: 'leg-press-1' }];
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: JSON.stringify(marks) });

    await expect(loadSessionUnavailable('s-1', store.db)).resolves.toEqual(marks);
  });

  it('defensively returns an empty array for a malformed stored payload', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: JSON.stringify(['not-a-ref']) });

    await expect(loadSessionUnavailable('s-1', store.db)).resolves.toEqual([]);
  });
});

describe('markEquipmentUnavailable', () => {
  it('appends a ref and writes only the unavailable_equipment column', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: null, notes: 'unchanged' });

    await markEquipmentUnavailable('s-1', { kind: 'machine', machineId: 'leg-press-1' }, store.db);

    const row = store.rowsOf(workoutSession)[0];
    expect(JSON.parse(row.unavailableEquipment as string)).toEqual([{ kind: 'machine', machineId: 'leg-press-1' }]);
    expect(row.notes).toBe('unchanged');
  });

  it('is idempotent when the same ref is already marked', async () => {
    const store = inMemoryDb();
    const marks = [{ kind: 'machine', machineId: 'leg-press-1' }];
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: JSON.stringify(marks) });

    await markEquipmentUnavailable('s-1', { kind: 'machine', machineId: 'leg-press-1' }, store.db);

    expect(JSON.parse(store.rowsOf(workoutSession)[0].unavailableEquipment as string)).toEqual(marks);
  });
});

describe('clearEquipmentUnavailable', () => {
  it('removes a matching ref', async () => {
    const store = inMemoryDb();
    const marks = [{ kind: 'machine', machineId: 'leg-press-1' }, { kind: 'dumbbell', weightKg: '10.000' }];
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: JSON.stringify(marks) });

    await clearEquipmentUnavailable('s-1', { kind: 'machine', machineId: 'leg-press-1' }, store.db);

    expect(JSON.parse(store.rowsOf(workoutSession)[0].unavailableEquipment as string)).toEqual([
      { kind: 'dumbbell', weightKg: '10.000' },
    ]);
  });

  it('is a no-op when the ref is not present', async () => {
    const store = inMemoryDb();
    const marks = [{ kind: 'machine', machineId: 'leg-press-1' }];
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: JSON.stringify(marks) });

    await clearEquipmentUnavailable('s-1', { kind: 'machine', machineId: 'cable-row-2' }, store.db);

    expect(JSON.parse(store.rowsOf(workoutSession)[0].unavailableEquipment as string)).toEqual(marks);
  });
});

describe('removeEquipmentFromProfile', () => {
  it('flips the matching machine entry unavailable, leaving other machines untouched', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, {
      ...BASE_PROFILE,
      machineAvailability: JSON.stringify([
        { id: 'leg-press-1', name: 'Leg Press', equipmentType: 'machine', available: true, stackMinKg: null, stackMaxKg: null, stackIncrementKg: null, baseResistanceKg: null },
        { id: 'cable-row-2', name: 'Cable Row', equipmentType: 'cable', available: true, stackMinKg: null, stackMaxKg: null, stackIncrementKg: null, baseResistanceKg: null },
      ]),
    });

    await removeEquipmentFromProfile('p-1', { kind: 'machine', machineId: 'leg-press-1' }, store.db);

    const machines = JSON.parse(store.rowsOf(equipmentProfile)[0].machineAvailability as string);
    expect(machines.find((m: { id: string }) => m.id === 'leg-press-1').available).toBe(false);
    expect(machines.find((m: { id: string }) => m.id === 'cable-row-2').available).toBe(true);
  });

  it('removes the matching dumbbell weight', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, {
      ...BASE_PROFILE,
      dumbbellIncrementsKg: JSON.stringify([{ weightKg: '2.500' }, { weightKg: '5.000' }]),
    });

    await removeEquipmentFromProfile('p-1', { kind: 'dumbbell', weightKg: '2.500' }, store.db);

    expect(JSON.parse(store.rowsOf(equipmentProfile)[0].dumbbellIncrementsKg as string)).toEqual([{ weightKg: '5.000' }]);
  });

  it('clears the bar weight for an equipment_type ref', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, BASE_PROFILE);

    await removeEquipmentFromProfile('p-1', { kind: 'equipment_type', equipmentType: 'barbell' }, store.db);

    expect(store.rowsOf(equipmentProfile)[0].barbellWeightKg).toBeNull();
  });

  it('does not touch the session\'s own marks', async () => {
    const store = inMemoryDb();
    store.seed(equipmentProfile, BASE_PROFILE);
    const marks = [{ kind: 'machine', machineId: 'leg-press-1' }];
    store.seed(workoutSession, { id: 's-1', unavailableEquipment: JSON.stringify(marks) });

    await removeEquipmentFromProfile('p-1', { kind: 'machine', machineId: 'leg-press-1' }, store.db);

    expect(store.rowsOf(workoutSession)[0].unavailableEquipment).toBe(JSON.stringify(marks));
  });
});

describe('equipmentSwapConstraints', () => {
  const FULL_INVENTORY: ResolvedInventory = {
    nativeUnit: 'kg',
    barbellWeightKg: '20.000',
    plates: [{ weightKg: '20.000', pairCount: 3 }],
    dumbbells: [{ weightKg: '2.500' }],
    machines: [
      { id: 'leg-press-1', name: 'Leg Press', equipmentType: 'machine', available: true, stackMinKg: '10.000', stackMaxKg: '100.000', stackIncrementKg: '5.000', baseResistanceKg: null },
      { id: 'cable-row-2', name: 'Cable Row', equipmentType: 'cable', available: true, stackMinKg: '5.000', stackMaxKg: '80.000', stackIncrementKg: '5.000', baseResistanceKg: null },
    ],
    unavailableEquipmentTypes: [],
  };

  it('returns an empty constraint object when everything modelled is equippable — behaviourally identical to today', () => {
    expect(equipmentSwapConstraints(FULL_INVENTORY)).toEqual({});
  });

  it('excludes barbell/ez_bar when no bar is configured', () => {
    const inventory: ResolvedInventory = { ...FULL_INVENTORY, barbellWeightKg: null };

    const constraints = equipmentSwapConstraints(inventory);

    expect(constraints.excludeEquipment).toEqual(expect.arrayContaining(['barbell', 'ez_bar']));
  });

  it('excludes a type marked unavailable at the whole-type level even though the underlying field is still present', () => {
    const inventory: ResolvedInventory = { ...FULL_INVENTORY, unavailableEquipmentTypes: ['barbell', 'ez_bar'] };

    const constraints = equipmentSwapConstraints(inventory);

    expect(constraints.excludeEquipment).toEqual(expect.arrayContaining(['barbell', 'ez_bar']));
  });

  it('excludes dumbbell when no dumbbell weights remain', () => {
    const inventory: ResolvedInventory = { ...FULL_INVENTORY, dumbbells: [] };

    expect(equipmentSwapConstraints(inventory).excludeEquipment).toContain('dumbbell');
  });

  it('excludes machine when no available machine of that type remains', () => {
    const inventory: ResolvedInventory = {
      ...FULL_INVENTORY,
      machines: FULL_INVENTORY.machines.filter((machine) => machine.equipmentType !== 'machine'),
    };

    expect(equipmentSwapConstraints(inventory).excludeEquipment).toContain('machine');
    expect(equipmentSwapConstraints(inventory).excludeEquipment).not.toContain('cable');
  });

  it('folds every unmodelled equipment type into a returned allowEquipment list, never excluding a candidate this phase cannot reason about', () => {
    const inventory: ResolvedInventory = {
      ...FULL_INVENTORY,
      barbellWeightKg: null,
      machines: [],
      unavailableEquipmentTypes: [],
    };

    const constraints = equipmentSwapConstraints(inventory);

    // Only 'dumbbell' remains equippable among the five modelled types — a genuinely bounded set,
    // so this exercises the allowEquipment branch rather than excludeEquipment.
    expect(constraints.allowEquipment).toContain('dumbbell');
    expect(constraints.allowEquipment).toEqual(
      expect.arrayContaining(['kettlebell', 'bodyweight', 'band', 'medicine_ball', 'exercise_ball', 'foam_roller', 'other']),
    );
    expect(constraints.excludeEquipment).toBeUndefined();
  });
});

describe('optional db handle', () => {
  it('loadSessionInventory falls back to getPowerSync() when no handle is passed', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', equipmentProfileId: null });
    getPowerSyncMock.mockReturnValue(store.db);

    await expect(loadSessionInventory('s-1')).resolves.toBeNull();
    expect(getPowerSyncMock).toHaveBeenCalled();
  });

  it('restampSessionGym falls back to getPowerSync() when no handle is passed', async () => {
    const store = inMemoryDb();
    store.seed(workoutSession, { id: 's-1', equipmentProfileId: 'old' });
    getPowerSyncMock.mockReturnValue(store.db);

    await restampSessionGym('s-1', 'new');

    expect(store.rowsOf(workoutSession)[0].equipmentProfileId).toBe('new');
  });
});
