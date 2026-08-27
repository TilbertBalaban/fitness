// Same mock-before-import discipline as programs/__tests__/library-screen.test.ts: the screen
// module's top-level imports reach @powersync's ESM dist and better-auth/react, neither of which
// Jest's transform can parse.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import {
  actionsForGymRow,
  deriveGymProfilesScreenState,
  partitionGymProfiles,
} from '../index';
import type { EquipmentProfileRow } from '../../../lib/db/equipment-profiles';

function gymRow(overrides: Partial<EquipmentProfileRow> & { id: string }): EquipmentProfileRow {
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

describe('deriveGymProfilesScreenState', () => {
  it('is error when the load failed, regardless of profiles', () => {
    expect(deriveGymProfilesScreenState({ failed: true, profiles: null })).toBe('error');
    expect(deriveGymProfilesScreenState({ failed: true, profiles: [gymRow({ id: 'g1' })] })).toBe('error');
  });

  it('is loading when profiles have not been read yet', () => {
    expect(deriveGymProfilesScreenState({ failed: false, profiles: null })).toBe('loading');
  });

  // No 'empty' branch — a user reaching this screen always has at least the D-19 seeded gym.
  it('is populated even for a zero-length array, since this screen never renders an empty state', () => {
    expect(deriveGymProfilesScreenState({ failed: false, profiles: [] })).toBe('populated');
  });

  it('is populated when at least one gym loaded, archived included', () => {
    expect(deriveGymProfilesScreenState({ failed: false, profiles: [gymRow({ id: 'g1' })] })).toBe('populated');
    expect(
      deriveGymProfilesScreenState({
        failed: false,
        profiles: [gymRow({ id: 'g1', archivedAt: '2026-01-01T00:00:00.000Z' })],
      }),
    ).toBe('populated');
  });
});

describe('partitionGymProfiles', () => {
  it('returns three empty groups for an empty list', () => {
    expect(partitionGymProfiles([])).toEqual({ active: [], rest: [], archived: [] });
  });

  it('places the resolved live gym alone in the active partition', () => {
    const rows = [gymRow({ id: 'g1', name: 'Alpha' }), gymRow({ id: 'g2', name: 'Bravo' })];

    const partition = partitionGymProfiles(rows, 'g1');

    expect(partition.active.map((row) => row.id)).toEqual(['g1']);
    expect(partition.rest.map((row) => row.id)).toEqual(['g2']);
  });

  // Archived wins over the pointer — a stale pointer from another device must not present an
  // archived gym as the one in effect.
  it('classifies an archived row as archived even when the pointer still names it, resolving the other live gym as active', () => {
    const archived = gymRow({ id: 'g1', archivedAt: '2026-01-01T00:00:00.000Z' });
    const rows = [archived, gymRow({ id: 'g2' })];

    const partition = partitionGymProfiles(rows, 'g1');

    expect(partition.archived.map((row) => row.id)).toEqual(['g1']);
    expect(partition.active.map((row) => row.id)).toEqual(['g2']);
  });

  // Unlike partitionRoutines, a gym profile can never have zero active — resolveLiveEquipmentProfileId
  // always falls back to the first live gym by the total ordering.
  it('falls back to the first live gym when the pointer is null, since exactly one gym must always read as active', () => {
    const rows = [gymRow({ id: 'g2', name: 'Bravo' }), gymRow({ id: 'g1', name: 'Alpha' })];

    const partition = partitionGymProfiles(rows, null);

    expect(partition.active.map((row) => row.id)).toEqual(['g1']);
  });

  it('renders identically for exactly one gym as for many — a single-row active partition, no rest section', () => {
    const partition = partitionGymProfiles([gymRow({ id: 'g1' })], 'g1');

    expect(partition.active.map((row) => row.id)).toEqual(['g1']);
    expect(partition.rest).toEqual([]);
    expect(partition.archived).toEqual([]);
  });

  it('orders the rest partition by name then id so two gyms sharing a name have a stable order', () => {
    const rows = [
      gymRow({ id: 'active', name: 'Zed Active' }),
      gymRow({ id: 'b', name: 'Same' }),
      gymRow({ id: 'a', name: 'Same' }),
      gymRow({ id: 'c', name: 'Aardvark' }),
    ];

    const partition = partitionGymProfiles(rows, 'active');

    expect(partition.rest.map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('never places one row in two groups', () => {
    const rows = [
      gymRow({ id: 'g1' }),
      gymRow({ id: 'g2' }),
      gymRow({ id: 'g3', archivedAt: '2026-01-01T00:00:00.000Z' }),
    ];

    const partition = partitionGymProfiles(rows, 'g1');
    const placed = [...partition.active, ...partition.rest, ...partition.archived];

    expect(placed).toHaveLength(3);
    expect(new Set(placed.map((row) => row.id)).size).toBe(3);
  });
});

describe('actionsForGymRow', () => {
  it('omits Set Active on the already-active row, rendering exactly three actions', () => {
    const keys = actionsForGymRow(true, false).map((action) => action.key);
    expect(keys).toEqual(['edit', 'duplicate', 'archive']);
  });

  it('renders four actions with Set Active first on a non-active row', () => {
    const keys = actionsForGymRow(false, false).map((action) => action.key);
    expect(keys).toEqual(['set-active', 'edit', 'duplicate', 'archive']);
  });

  it('offers Restore instead of Archive on an archived row', () => {
    const keys = actionsForGymRow(false, true).map((action) => action.key);
    expect(keys).toContain('restore');
    expect(keys).not.toContain('archive');
  });

  it('marks Archive destructive and Restore not', () => {
    const archive = actionsForGymRow(false, false).find((action) => action.key === 'archive');
    const restore = actionsForGymRow(false, true).find((action) => action.key === 'restore');

    expect(archive?.destructive).toBe(true);
    expect(restore?.destructive).toBeUndefined();
  });

  it('the action list always contains at least Edit, Duplicate and Archive/Restore', () => {
    expect(actionsForGymRow(true, false).length).toBeGreaterThanOrEqual(3);
    expect(actionsForGymRow(false, false).length).toBeGreaterThanOrEqual(3);
  });
});
