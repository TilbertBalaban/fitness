// set-row-builders.ts imports session-query.ts for the real `referenceKey` function, which in
// turn reaches @powersync/react-native's ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked
// before importing, matching workout.test.tsx/session-query.test.ts's established rationale.
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('@/lib/db/programs/load-program', () => ({ loadExerciseNameMap: jest.fn() }));

import { buildSetRows, isBlankSubEntry } from '../set-row-builders';
import type { LoggedSetRow } from '@/lib/db/session-query';

// Same fixture shape as workout.test.tsx's LOGGED_ROW/WARMUP_ROW — a minimal LoggedSetRow with
// every field the interface requires, overridden per case.
function row(overrides: Partial<LoggedSetRow> & Pick<LoggedSetRow, 'id' | 'setIndex'>): LoggedSetRow {
  return {
    sessionExerciseId: 'se-1',
    setType: 'normal',
    weightKg: '100.000',
    reps: 10,
    rir: 2,
    completed: true,
    loggedAt: '2026-08-28T10:00:00.000Z',
    notes: null,
    parentSetId: null,
    side: null,
    ...overrides,
  };
}

describe('buildSetRows — parent-then-children ordering (07-RESEARCH.md Pitfall 2)', () => {
  it('renders a child inserted onto set 1 directly beneath it, not after a later unrelated set (the out-of-order-child regression)', () => {
    const set1 = row({ id: 'ls-1', setIndex: 1 });
    const set2 = row({ id: 'ls-2', setIndex: 2 });
    const child = row({ id: 'ls-child', setIndex: 3, setType: 'drop', parentSetId: 'ls-1' });

    const rows = buildSetRows([set1, set2, child], {}, { weight: null, reps: null, rir: null }, 'kg', null);

    expect(rows.map((r) => r.setId)).toEqual(['ls-1', 'ls-child', 'ls-2', null]);
  });

  it('renders every warm-up row ahead of every non-warm-up row, and the parent-then-children flatten applies only to the remainder', () => {
    const warmup = row({ id: 'ls-warmup', setIndex: 5, setType: 'warmup' });
    const set1 = row({ id: 'ls-1', setIndex: 1 });
    const child = row({ id: 'ls-child', setIndex: 2, setType: 'drop', parentSetId: 'ls-1' });
    const set2 = row({ id: 'ls-2', setIndex: 3 });

    const rows = buildSetRows([set1, child, set2, warmup], {}, { weight: null, reps: null, rir: null }, 'kg', null);

    expect(rows.map((r) => r.setId)).toEqual(['ls-warmup', 'ls-1', 'ls-child', 'ls-2', null]);
  });

  it('an orphan child — its parentSetId names an id absent from the input — still appears in the output, never silently dropped', () => {
    const set1 = row({ id: 'ls-1', setIndex: 1 });
    const orphan = row({ id: 'ls-orphan', setIndex: 2, setType: 'drop', parentSetId: 'does-not-exist' });

    const rows = buildSetRows([set1, orphan], {}, { weight: null, reps: null, rir: null }, 'kg', null);

    // 2 real rows + 1 trailing draft.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.setId)).toContain('ls-orphan');
  });

  it('two sibling children tying on set_index keep their incoming relative order (backstop)', () => {
    const parent = row({ id: 'ls-1', setIndex: 1 });
    const childA = row({ id: 'ls-child-a', setIndex: 2, setType: 'drop', parentSetId: 'ls-1' });
    const childB = row({ id: 'ls-child-b', setIndex: 2, setType: 'drop', parentSetId: 'ls-1' });

    const rows = buildSetRows([parent, childA, childB], {}, { weight: null, reps: null, rir: null }, 'kg', null);

    expect(rows.map((r) => r.setId)).toEqual(['ls-1', 'ls-child-a', 'ls-child-b', null]);
  });
});

describe('buildSetRows — D-23 derived parent display numbering', () => {
  it('numbers parent rows 1, 2, 3… by position among parents only, leaves children undefined, and never mutates the raw setIndex', () => {
    const parent1 = row({ id: 'ls-1', setIndex: 1 });
    const child = row({ id: 'ls-child', setIndex: 3, setType: 'drop', parentSetId: 'ls-1' });
    const parent2 = row({ id: 'ls-2', setIndex: 2 });

    const rows = buildSetRows([parent1, child, parent2], {}, { weight: null, reps: null, rir: null }, 'kg', null);

    const byId = new Map(rows.map((r) => [r.setId, r]));
    expect(byId.get('ls-1')?.displaySetIndex).toBe(1);
    expect(byId.get('ls-child')?.displaySetIndex).toBeUndefined();
    expect(byId.get('ls-2')?.displaySetIndex).toBe(2);
    const draft = rows[rows.length - 1];
    expect(draft.setId).toBeNull();
    expect(draft.displaySetIndex).toBe(3);

    // Raw setIndex values stay exactly as stored — 1, 3, 2, and the draft's own next-index.
    expect(byId.get('ls-1')?.setIndex).toBe(1);
    expect(byId.get('ls-child')?.setIndex).toBe(3);
    expect(byId.get('ls-2')?.setIndex).toBe(2);
    expect(draft.setIndex).toBe(4);
  });
});

describe('isBlankSubEntry', () => {
  it('is true for an incomplete child with reps 0 and null weight', () => {
    expect(isBlankSubEntry({ parentSetId: 'ls-1', completed: false, reps: 0, weightKg: null })).toBe(true);
  });

  it('is false when the row has no parent', () => {
    expect(isBlankSubEntry({ parentSetId: null, completed: false, reps: 0, weightKg: null })).toBe(false);
  });

  it('is false when the row is already completed', () => {
    expect(isBlankSubEntry({ parentSetId: 'ls-1', completed: true, reps: 0, weightKg: null })).toBe(false);
  });

  it('is false when reps is non-zero', () => {
    expect(isBlankSubEntry({ parentSetId: 'ls-1', completed: false, reps: 5, weightKg: null })).toBe(false);
  });

  it('is false when weight is present', () => {
    expect(isBlankSubEntry({ parentSetId: 'ls-1', completed: false, reps: 0, weightKg: '20.000' })).toBe(false);
  });

  it('buildSetRows renders a blank sub-entry’s weight and reps as null, not zero', () => {
    const parent = row({ id: 'ls-1', setIndex: 1 });
    const blankChild = row({
      id: 'ls-child',
      setIndex: 2,
      setType: 'drop',
      parentSetId: 'ls-1',
      completed: false,
      reps: 0,
      weightKg: null,
    });

    const rows = buildSetRows([parent, blankChild], {}, { weight: null, reps: null, rir: null }, 'kg', null);
    const childRow = rows.find((r) => r.setId === 'ls-child');

    expect(childRow?.values.weight).toBeNull();
    expect(childRow?.values.reps).toBeNull();
  });
});
