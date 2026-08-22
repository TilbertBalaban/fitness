// Same mock-before-import discipline as app/(tabs)/__tests__/programs-screen.test.ts: the screen
// module's top-level imports reach @powersync's ESM dist and better-auth/react, neither of which
// Jest's transform can parse.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/id', () => ({ generateClientId: jest.fn(() => 'fixed-id') }));
jest.mock('../../../lib/db/programs/lifecycle', () => ({
  activateRoutine: jest.fn(),
  archiveRoutine: jest.fn(),
  loadActiveRoutineId: jest.fn(),
  loadLibraryRoutines: jest.fn(),
  renameRoutine: jest.fn(),
  restoreRoutine: jest.fn(),
}));
jest.mock('../../../lib/db/programs/duplicate-routine', () => ({ duplicateRoutine: jest.fn() }));
jest.mock('../../../lib/db/programs/create-routine', () => ({ createRoutine: jest.fn() }));
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import {
  actionsForRow,
  buildLibraryListItems,
  deriveLibraryScreenState,
  formatLibraryRowSubtitle,
  partitionRoutines,
} from '../library';
import { NO_DUPLICATE_SOURCE_COPY, newProgramOptions } from '../new';
import type { LibraryRoutineRow } from '../../../lib/db/programs/lifecycle';

function row(overrides: Partial<LibraryRoutineRow> & { id: string }): LibraryRoutineRow {
  return {
    name: overrides.id,
    status: 'draft',
    goal: null,
    archivedAt: null,
    progressionFrozen: false,
    ...overrides,
  };
}

describe('deriveLibraryScreenState', () => {
  it('is error when the load failed, regardless of routines', () => {
    expect(deriveLibraryScreenState({ failed: true, routines: null })).toBe('error');
    expect(deriveLibraryScreenState({ failed: true, routines: [row({ id: 'r1' })] })).toBe('error');
  });

  it('is loading when routines have not been read yet', () => {
    expect(deriveLibraryScreenState({ failed: false, routines: null })).toBe('loading');
  });

  it('is empty when the load succeeded with zero routines', () => {
    expect(deriveLibraryScreenState({ failed: false, routines: [] })).toBe('empty');
  });

  it('is populated when at least one routine loaded, archived included', () => {
    expect(deriveLibraryScreenState({ failed: false, routines: [row({ id: 'r1' })] })).toBe('populated');
    expect(
      deriveLibraryScreenState({ failed: false, routines: [row({ id: 'r1', archivedAt: '2026-01-01T00:00:00Z' })] }),
    ).toBe('populated');
  });
});

describe('partitionRoutines', () => {
  it('returns four empty groups for an empty library', () => {
    expect(partitionRoutines([])).toEqual({ active: [], drafts: [], ready: [], archived: [] });
  });

  it('places the row named by the pointer into active and into neither drafts nor ready', () => {
    const rows = [row({ id: 'r1', status: 'ready' }), row({ id: 'r2', status: 'draft' })];

    const partition = partitionRoutines(rows, 'r1');

    expect(partition.active.map((entry) => entry.id)).toEqual(['r1']);
    expect(partition.ready).toEqual([]);
    expect(partition.drafts.map((entry) => entry.id)).toEqual(['r2']);
  });

  // A stale pointer arriving from another device must not be able to present an archived program as
  // the active one — archived wins over every other classification.
  it('classifies an archived row as archived even when the pointer still names it', () => {
    const rows = [row({ id: 'r1', status: 'ready', archivedAt: '2026-01-01T00:00:00Z' })];

    const partition = partitionRoutines(rows, 'r1');

    expect(partition.archived.map((entry) => entry.id)).toEqual(['r1']);
    expect(partition.active).toEqual([]);
    expect(partition.ready).toEqual([]);
    expect(partition.drafts).toEqual([]);
  });

  it('classifies an archived draft as archived, not as a draft', () => {
    const partition = partitionRoutines([row({ id: 'r1', status: 'draft', archivedAt: '2026-01-01T00:00:00Z' })]);

    expect(partition.archived.map((entry) => entry.id)).toEqual(['r1']);
    expect(partition.drafts).toEqual([]);
  });

  it('treats a null pointer as no active program', () => {
    const partition = partitionRoutines([row({ id: 'r1', status: 'ready' })], null);

    expect(partition.active).toEqual([]);
    expect(partition.ready.map((entry) => entry.id)).toEqual(['r1']);
  });

  it('orders each group by name then id so two programs sharing a name have a stable order', () => {
    const rows = [
      row({ id: 'b', name: 'Same', status: 'ready' }),
      row({ id: 'a', name: 'Same', status: 'ready' }),
      row({ id: 'c', name: 'Aardvark', status: 'ready' }),
      row({ id: 'z', name: 'Zebra', status: 'draft' }),
      row({ id: 'y', name: 'Alpha', status: 'draft' }),
    ];

    const partition = partitionRoutines(rows);

    expect(partition.ready.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
    expect(partition.drafts.map((entry) => entry.id)).toEqual(['y', 'z']);
  });

  it('never places one row in two groups', () => {
    const rows = [
      row({ id: 'r1', status: 'ready' }),
      row({ id: 'r2', status: 'draft' }),
      row({ id: 'r3', status: 'ready', archivedAt: '2026-01-01T00:00:00Z' }),
    ];

    const partition = partitionRoutines(rows, 'r1');
    const placed = [...partition.active, ...partition.ready, ...partition.drafts, ...partition.archived];

    expect(placed).toHaveLength(3);
    expect(new Set(placed.map((entry) => entry.id)).size).toBe(3);
  });
});

describe('formatLibraryRowSubtitle', () => {
  it('renders a draft status in Title Case, never the raw enum value', () => {
    const subtitle = formatLibraryRowSubtitle({ status: 'draft', archivedAt: null, isActive: false });

    expect(subtitle).toContain('Draft');
    expect(subtitle).not.toContain('draft');
  });

  it('renders a ready status in Title Case', () => {
    const subtitle = formatLibraryRowSubtitle({ status: 'ready', archivedAt: null, isActive: false });

    expect(subtitle).toContain('Ready');
    expect(subtitle).not.toContain('ready');
  });

  it('names the active program', () => {
    expect(formatLibraryRowSubtitle({ status: 'ready', archivedAt: null, isActive: true })).toContain('Active');
  });

  it('names an archived program', () => {
    expect(
      formatLibraryRowSubtitle({ status: 'ready', archivedAt: '2026-01-01T00:00:00Z', isActive: false }),
    ).toContain('Archived');
  });

  // Active and frozen are independent facts (D-16) and both are shown — a frozen program is still
  // the one being run.
  it('names both active and frozen when a program is both', () => {
    const subtitle = formatLibraryRowSubtitle({
      status: 'ready',
      archivedAt: null,
      isActive: true,
      progressionFrozen: true,
    });

    expect(subtitle).toContain('Active');
    expect(subtitle).toContain('Frozen');
  });

  it('drops the active word on an archived row even when the caller still claims it is active', () => {
    const subtitle = formatLibraryRowSubtitle({
      status: 'ready',
      archivedAt: '2026-01-01T00:00:00Z',
      isActive: true,
    });

    expect(subtitle).toContain('Archived');
    expect(subtitle).not.toContain('Active');
  });

  it('never describes a frozen program as failed, stalled or stuck', () => {
    const subtitle = formatLibraryRowSubtitle({
      status: 'ready',
      archivedAt: null,
      isActive: true,
      progressionFrozen: true,
    });

    expect(subtitle).not.toMatch(/failed|stalled|stuck|behind/i);
  });
});

describe('buildLibraryListItems', () => {
  it('omits a section header entirely when that section is empty', () => {
    const items = buildLibraryListItems([row({ id: 'r1', status: 'ready' })], null);

    expect(items.filter((item) => item.kind === 'header').map((item) => item.title)).toEqual(['Your Programs']);
  });

  it('renders both headers when both sections have rows', () => {
    const items = buildLibraryListItems(
      [row({ id: 'r1', status: 'ready' }), row({ id: 'r2', archivedAt: '2026-01-01T00:00:00Z' })],
      null,
    );

    expect(items.filter((item) => item.kind === 'header').map((item) => item.title)).toEqual([
      'Your Programs',
      'Archived',
    ]);
  });

  it('renders only the archived header when every program is archived', () => {
    const items = buildLibraryListItems([row({ id: 'r1', archivedAt: '2026-01-01T00:00:00Z' })], null);

    expect(items.filter((item) => item.kind === 'header').map((item) => item.title)).toEqual(['Archived']);
  });

  // The accent-filled badge is the screen's focal point precisely because it can appear at most
  // once — a second badge would make "which program am I running" ambiguous.
  it('marks at most one row active across the whole screen', () => {
    const items = buildLibraryListItems(
      [row({ id: 'r1', status: 'ready' }), row({ id: 'r2', status: 'ready' }), row({ id: 'r3', status: 'draft' })],
      'r2',
    );

    const activeRows = items.filter((item) => item.kind === 'row' && item.isActive);
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].kind === 'row' && activeRows[0].row.id).toBe('r2');
  });

  it('marks no row active when the pointer names an archived program', () => {
    const items = buildLibraryListItems([row({ id: 'r1', archivedAt: '2026-01-01T00:00:00Z' })], 'r1');

    expect(items.filter((item) => item.kind === 'row' && item.isActive)).toHaveLength(0);
  });

  it('puts the active program first, then ready, then drafts, then the archived section', () => {
    const items = buildLibraryListItems(
      [
        row({ id: 'd1', name: 'Draft one', status: 'draft' }),
        row({ id: 'a1', name: 'Active one', status: 'ready' }),
        row({ id: 'x1', name: 'Archived one', archivedAt: '2026-01-01T00:00:00Z' }),
        row({ id: 'r1', name: 'Ready one', status: 'ready' }),
      ],
      'a1',
    );

    expect(items.map((item) => (item.kind === 'header' ? `#${item.title}` : item.row.id))).toEqual([
      '#Your Programs',
      'a1',
      'r1',
      'd1',
      '#Archived',
      'x1',
    ]);
  });

  it('is empty for an empty library — the empty state replaces the list, it does not sit inside it', () => {
    expect(buildLibraryListItems([], null)).toEqual([]);
  });
});

describe('actionsForRow', () => {
  it('hides Activate on the already-active row', () => {
    const keys = actionsForRow(row({ id: 'r1', status: 'ready' }), true).map((action) => action.key);

    expect(keys).not.toContain('activate');
    expect(keys).toEqual(['duplicate', 'rename', 'archive']);
  });

  it('offers Activate on a non-active, non-archived row', () => {
    const keys = actionsForRow(row({ id: 'r1', status: 'ready' }), false).map((action) => action.key);

    expect(keys).toEqual(['activate', 'duplicate', 'rename', 'archive']);
  });

  // An archived program is never the active one, so offering Activate would advertise a state
  // archiveRoutine immediately undoes.
  it('offers Restore instead of Archive on an archived row, and never Activate', () => {
    const keys = actionsForRow(row({ id: 'r1', archivedAt: '2026-01-01T00:00:00Z' }), false).map(
      (action) => action.key,
    );

    expect(keys).toEqual(['duplicate', 'rename', 'restore']);
    expect(keys).not.toContain('activate');
    expect(keys).not.toContain('archive');
  });

  it('marks Archive destructive and Restore not', () => {
    const archive = actionsForRow(row({ id: 'r1' }), false).find((action) => action.key === 'archive');
    const restore = actionsForRow(row({ id: 'r1', archivedAt: '2026-01-01T00:00:00Z' }), false).find(
      (action) => action.key === 'restore',
    );

    expect(archive?.destructive).toBe(true);
    expect(restore?.destructive).toBeUndefined();
  });
});

describe('newProgramOptions', () => {
  it('leaves Start Blank as the only live path on a truly empty account', () => {
    const { options, sources } = newProgramOptions([]);

    expect(options.filter((option) => option.available).map((option) => option.key)).toEqual(['blank']);
    expect(sources).toEqual([]);
  });

  it('returns the duplicate option present but unavailable, with copy explaining why', () => {
    const duplicate = newProgramOptions([]).options.find((option) => option.key === 'duplicate')!;

    expect(duplicate.label).toBe('Duplicate Existing');
    expect(duplicate.available).toBe(false);
    expect(duplicate.unavailableReason).toBe(NO_DUPLICATE_SOURCE_COPY);
  });

  it('makes both options available once one program exists', () => {
    const { options, sources } = newProgramOptions([row({ id: 'r1', status: 'ready' })]);

    expect(options.map((option) => option.available)).toEqual([true, true]);
    expect(options.every((option) => option.unavailableReason === null)).toBe(true);
    expect(sources.map((entry) => entry.id)).toEqual(['r1']);
  });

  it('never offers an archived routine as a duplicate source', () => {
    const { options, sources } = newProgramOptions([
      row({ id: 'r1', archivedAt: '2026-01-01T00:00:00Z' }),
      row({ id: 'r2', status: 'ready' }),
    ]);

    expect(sources.map((entry) => entry.id)).toEqual(['r2']);
    expect(options.find((option) => option.key === 'duplicate')!.available).toBe(true);
  });

  it('collapses to the disabled treatment when every program is archived', () => {
    const { options, sources } = newProgramOptions([row({ id: 'r1', archivedAt: '2026-01-01T00:00:00Z' })]);

    expect(sources).toEqual([]);
    expect(options.find((option) => option.key === 'duplicate')!.available).toBe(false);
  });
});
