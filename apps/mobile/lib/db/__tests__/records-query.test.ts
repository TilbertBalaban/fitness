import { formatRecordValue, loadRecordsPage } from '../records-query';
import { getPowerSync } from '../powersync';

jest.mock('../powersync', () => ({ getPowerSync: jest.fn() }));

type Row = Record<string, unknown>;

// Returns each queued result set in turn and counts the selects issued, so "a bounded number of
// queries regardless of page size" is asserted against the real call sequence rather than assumed.
// The WHERE/ORDER BY clauses themselves are proven against a real database by the durability spec.
function fakeDb(results: Row[][]) {
  let selectCount = 0;
  const resultFor = () => results[selectCount - 1] ?? [];

  const db = {
    select: () => {
      selectCount++;
      const terminal = () => {
        const pending = Promise.resolve(resultFor());
        return Object.assign(pending, {
          where: () =>
            Object.assign(Promise.resolve(resultFor()), {
              orderBy: () => Object.assign(Promise.resolve(resultFor()), { limit: () => Promise.resolve(resultFor()) }),
            }),
          orderBy: () => Object.assign(Promise.resolve(resultFor()), { limit: () => Promise.resolve(resultFor()) }),
        });
      };
      return { from: () => terminal() };
    },
  } as unknown as ReturnType<typeof getPowerSync>;

  return { db, getSelectCount: () => selectCount };
}

const SEEDED_EXERCISES: Row[] = [{ id: 'ex-1', name: 'Barbell Bench Press' }];
const CUSTOM_EXERCISES: Row[] = [];

function recordRow(overrides: Row = {}): Row {
  return {
    id: 'pr-1',
    exerciseId: 'ex-1',
    prType: 'heaviest_weight',
    value: '102.500',
    loggedSetId: 'ls-1',
    achievedAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  };
}

// loadExerciseNameMap issues two selects of its own (seeded + custom), so a full page read is
// page + names(2) + originating sets = 4.
function pageResults(records: Row[], sets: Row[] = []): Row[][] {
  return [records, SEEDED_EXERCISES, CUSTOM_EXERCISES, sets];
}

beforeEach(() => {
  (getPowerSync as jest.MockedFunction<typeof getPowerSync>).mockReset();
});

describe('loadRecordsPage', () => {
  it('returns an empty page when nobody is signed in, without reading anything', async () => {
    const { db, getSelectCount } = fakeDb(pageResults([recordRow()]));

    await expect(loadRecordsPage({ userId: null, prType: 'heaviest_weight', limit: 25 }, db)).resolves.toEqual({
      rows: [],
      nextCursor: null,
    });
    expect(getSelectCount()).toBe(0);
  });

  it('returns an empty page without further reads when the metric has no records', async () => {
    const { db, getSelectCount } = fakeDb(pageResults([]));

    await expect(loadRecordsPage({ userId: 'user-1', prType: 'best_e1rm', limit: 25 }, db)).resolves.toEqual({
      rows: [],
      nextCursor: null,
    });
    expect(getSelectCount()).toBe(1);
  });

  it('resolves the exercise name and the originating set weight onto each row', async () => {
    const { db } = fakeDb(
      pageResults([recordRow()], [{ id: 'ls-1', weightKg: '102.500' }]),
    );

    const page = await loadRecordsPage({ userId: 'user-1', prType: 'heaviest_weight', limit: 25 }, db);

    expect(page.rows).toEqual([
      {
        id: 'pr-1',
        exerciseId: 'ex-1',
        exerciseName: 'Barbell Bench Press',
        prType: 'heaviest_weight',
        value: '102.500',
        setWeightKg: '102.500',
        achievedAt: '2026-08-12T09:00:00.000Z',
      },
    ]);
  });

  it('issues the same number of queries for a ten-row page as for a one-row page', async () => {
    const oneRow = fakeDb(pageResults([recordRow()], [{ id: 'ls-1', weightKg: '100.000' }]));
    await loadRecordsPage({ userId: 'user-1', prType: 'heaviest_weight', limit: 25 }, oneRow.db);

    const manyRecords = Array.from({ length: 10 }, (_, index) =>
      recordRow({ id: `pr-${index}`, loggedSetId: `ls-${index}` }),
    );
    const manySets = Array.from({ length: 10 }, (_, index) => ({ id: `ls-${index}`, weightKg: '100.000' }));
    const tenRows = fakeDb(pageResults(manyRecords, manySets));
    await loadRecordsPage({ userId: 'user-1', prType: 'heaviest_weight', limit: 25 }, tenRows.db);

    expect(tenRows.getSelectCount()).toBe(oneRow.getSelectCount());
  });

  it('keeps a record whose exercise id no longer resolves, using the shipped unknown-exercise fallback', async () => {
    const { db } = fakeDb(pageResults([recordRow({ exerciseId: 'ex-archived' })], [{ id: 'ls-1', weightKg: '100.000' }]));

    const page = await loadRecordsPage({ userId: 'user-1', prType: 'heaviest_weight', limit: 25 }, db);

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].exerciseName).toBe('Unknown exercise');
  });

  it('leaves the originating set weight null when the set has not been synced to this device', async () => {
    const { db } = fakeDb(pageResults([recordRow({ loggedSetId: 'ls-elsewhere' })], []));

    const page = await loadRecordsPage({ userId: 'user-1', prType: 'most_reps_at_weight', limit: 25 }, db);

    expect(page.rows[0].setWeightKg).toBeNull();
  });

  it('skips the originating-set read entirely when no row on the page carries one', async () => {
    const { db, getSelectCount } = fakeDb(pageResults([recordRow({ loggedSetId: null })]));

    const page = await loadRecordsPage({ userId: 'user-1', prType: 'heaviest_weight', limit: 25 }, db);

    expect(page.rows[0].setWeightKg).toBeNull();
    expect(getSelectCount()).toBe(3);
  });

  it('returns a keyset cursor naming the last row of a full page, and none for a partial page', async () => {
    const full = fakeDb(
      pageResults(
        [recordRow({ id: 'pr-1' }), recordRow({ id: 'pr-2', achievedAt: '2026-08-01T09:00:00.000Z' })],
        [{ id: 'ls-1', weightKg: '100.000' }],
      ),
    );
    const fullPage = await loadRecordsPage({ userId: 'user-1', prType: 'heaviest_weight', limit: 2 }, full.db);
    expect(fullPage.nextCursor).toEqual({ achievedAt: '2026-08-01T09:00:00.000Z', id: 'pr-2' });

    const partial = fakeDb(pageResults([recordRow()], [{ id: 'ls-1', weightKg: '100.000' }]));
    const partialPage = await loadRecordsPage({ userId: 'user-1', prType: 'heaviest_weight', limit: 25 }, partial.db);
    expect(partialPage.nextCursor).toBeNull();
  });
});

// T-9-11: the stored value means a different thing per metric, and reading it as kilograms
// everywhere would produce a plausible, silent, wrong number. One case per metric.
describe('formatRecordValue', () => {
  it('renders the heaviest metric through the shared weight formatter', () => {
    expect(formatRecordValue({ prType: 'heaviest_weight', value: '102.500', setWeightKg: null }, 'kg')).toBe('102.50 kg');
  });

  it('renders the estimate metric through the shared weight formatter', () => {
    expect(formatRecordValue({ prType: 'best_e1rm', value: '116.667', setWeightKg: null }, 'kg')).toBe('116.67 kg');
  });

  it('renders the set-volume metric through the shared weight formatter', () => {
    expect(formatRecordValue({ prType: 'best_set_volume', value: '1200.000', setWeightKg: null }, 'kg')).toBe('1200.00 kg');
  });

  it('converts to the caller unit rather than always rendering kilograms', () => {
    expect(formatRecordValue({ prType: 'heaviest_weight', value: '100.000', setWeightKg: null }, 'lb')).toContain('lb');
  });

  it('renders most-reps as a whole rep count joined with the weight of the set that achieved it', () => {
    expect(formatRecordValue({ prType: 'most_reps_at_weight', value: '12.000', setWeightKg: '100.000' }, 'kg')).toBe(
      '12 reps @ 100.00 kg',
    );
  });

  it('never renders the most-reps count as a three-decimal number', () => {
    expect(formatRecordValue({ prType: 'most_reps_at_weight', value: '12.000', setWeightKg: '100.000' }, 'kg')).not.toContain(
      '12.000',
    );
  });

  it('singularizes a one-rep record', () => {
    expect(formatRecordValue({ prType: 'most_reps_at_weight', value: '1.000', setWeightKg: '100.000' }, 'kg')).toBe(
      '1 rep @ 100.00 kg',
    );
  });

  // The dash means "no value"; here the weight simply is not part of what this row records.
  it('omits the weight clause entirely rather than rendering a dash when the originating set is missing', () => {
    const display = formatRecordValue({ prType: 'most_reps_at_weight', value: '8.000', setWeightKg: null }, 'kg');
    expect(display).toBe('8 reps');
    expect(display).not.toContain('—');
  });
});
