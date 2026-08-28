// set-row-builders.ts imports session-query.ts for the real `referenceKey` function, which in
// turn reaches @powersync/react-native's ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked
// before importing, matching workout.test.tsx/session-query.test.ts's established rationale.
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('@/lib/db/programs/load-program', () => ({ loadExerciseNameMap: jest.fn() }));

import { buildSetRows, GROUP_ADD_LABEL, groupKindFor, isBlankSubEntry, resolveGroupAddControls } from '../set-row-builders';
import type { ResolvedSetRow } from '../set-row-builders';
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

describe('buildSetRows — SETS-03/ordering edge', () => {
  it("a myorep mini-set appended to the FIRST of three parents leaves the second and third parents' displaySetIndex at 2 and 3", () => {
    const parent1 = row({ id: 'ls-1', setIndex: 1, setType: 'myorep' });
    const miniSet = row({ id: 'ls-mini', setIndex: 4, setType: 'myorep', parentSetId: 'ls-1' });
    const parent2 = row({ id: 'ls-2', setIndex: 2 });
    const parent3 = row({ id: 'ls-3', setIndex: 3 });

    const rows = buildSetRows([parent1, parent2, parent3, miniSet], {}, { weight: null, reps: null, rir: null }, 'kg', null);

    const byId = new Map(rows.map((r) => [r.setId, r]));
    expect(byId.get('ls-2')?.displaySetIndex).toBe(2);
    expect(byId.get('ls-3')?.displaySetIndex).toBe(3);
  });
});

// A minimal ResolvedSetRow — the shape groupKindFor/resolveGroupAddControls consume, distinct
// from buildSetRows' own LoggedSetRow-shaped `row()` fixture above.
function resolvedRow(overrides: Partial<ResolvedSetRow> & Pick<ResolvedSetRow, 'setId'>): ResolvedSetRow {
  return {
    setIndex: 1,
    values: { weight: null, reps: null, rir: null },
    reference: { weight: null, reps: null },
    completed: false,
    setType: 'normal',
    noteText: null,
    parentSetId: null,
    side: null,
    displaySetIndex: undefined,
    ...overrides,
  };
}

describe('groupKindFor', () => {
  it('returns myorep for a parent typed myorep regardless of whether it has children yet (D-07)', () => {
    const childlessParent = resolvedRow({ setId: 'p1', setType: 'myorep' });
    expect(groupKindFor(childlessParent, [])).toBe('myorep');

    const parentWithChild = resolvedRow({ setId: 'p1', setType: 'myorep' });
    const child = resolvedRow({ setId: 'c1', setType: 'myorep', parentSetId: 'p1' });
    expect(groupKindFor(parentWithChild, [child])).toBe('myorep');
  });

  it("returns the children's own type for a normal parent with drop children, and likewise for partial children", () => {
    const parent = resolvedRow({ setId: 'p1', setType: 'normal' });
    const dropChild = resolvedRow({ setId: 'c1', setType: 'drop', parentSetId: 'p1' });
    expect(groupKindFor(parent, [dropChild])).toBe('drop');

    const partialChild = resolvedRow({ setId: 'c2', setType: 'partial', parentSetId: 'p1' });
    expect(groupKindFor(parent, [partialChild])).toBe('partial');
  });

  it('returns null for a plain normal parent with no children, and for a warmup parent', () => {
    const normalParent = resolvedRow({ setId: 'p1', setType: 'normal' });
    expect(groupKindFor(normalParent, [])).toBeNull();

    const warmupParent = resolvedRow({ setId: 'p2', setType: 'warmup' });
    expect(groupKindFor(warmupParent, [])).toBeNull();
  });
});

describe('GROUP_ADD_LABEL', () => {
  it('maps drop, myorep and partial to the exact Copywriting Contract strings and has no entry for any other set type', () => {
    expect(GROUP_ADD_LABEL.drop).toBe('+ Add Drop');
    expect(GROUP_ADD_LABEL.myorep).toBe('+ Add Myorep Set');
    expect(GROUP_ADD_LABEL.partial).toBe('+ Add Partial');
    expect(GROUP_ADD_LABEL.normal).toBeUndefined();
    expect(GROUP_ADD_LABEL.warmup).toBeUndefined();
    expect(GROUP_ADD_LABEL.failure).toBeUndefined();
    expect(GROUP_ADD_LABEL.amrap).toBeUndefined();
  });
});

describe('resolveGroupAddControls', () => {
  it('returns an empty array for a row list containing only plain parents and a draft', () => {
    const parent = resolvedRow({ setId: 'p1', setType: 'normal', completed: true });
    const draft = resolvedRow({ setId: null, setType: undefined });

    expect(resolveGroupAddControls([parent, draft])).toEqual([]);
  });

  it('marks a drop group visible once its LAST child is completed, and not visible while that last child is incomplete', () => {
    const parent = resolvedRow({ setId: 'p1', setType: 'normal', completed: true });
    const child1 = resolvedRow({ setId: 'c1', setType: 'drop', parentSetId: 'p1', completed: true });
    const child2Incomplete = resolvedRow({ setId: 'c2', setType: 'drop', parentSetId: 'p1', completed: false });

    expect(resolveGroupAddControls([parent, child1, child2Incomplete])).toEqual([
      { parentSetId: 'p1', kind: 'drop', label: '+ Add Drop', visible: false },
    ]);

    const child2Completed = resolvedRow({ setId: 'c2', setType: 'drop', parentSetId: 'p1', completed: true });
    expect(resolveGroupAddControls([parent, child1, child2Completed])).toEqual([
      { parentSetId: 'p1', kind: 'drop', label: '+ Add Drop', visible: true },
    ]);
  });

  it("named for the myorep parent-as-first-entry rule — visible flips with the PARENT's completion, not a child's", () => {
    const incompleteParent = resolvedRow({ setId: 'p1', setType: 'myorep', completed: false });
    expect(resolveGroupAddControls([incompleteParent])).toEqual([
      { parentSetId: 'p1', kind: 'myorep', label: '+ Add Myorep Set', visible: false },
    ]);

    const completeParent = resolvedRow({ setId: 'p1', setType: 'myorep', completed: true });
    expect(resolveGroupAddControls([completeParent])).toEqual([
      { parentSetId: 'p1', kind: 'myorep', label: '+ Add Myorep Set', visible: true },
    ]);

    // Once a child exists the "most recent entry" is the child, not the parent — a complete
    // parent with an incomplete mini-set does not show the control again mid-mini-set.
    const parentWithIncompleteChild = resolvedRow({ setId: 'p1', setType: 'myorep', completed: true });
    const incompleteChild = resolvedRow({ setId: 'c1', setType: 'myorep', parentSetId: 'p1', completed: false });
    expect(resolveGroupAddControls([parentWithIncompleteChild, incompleteChild])).toEqual([
      { parentSetId: 'p1', kind: 'myorep', label: '+ Add Myorep Set', visible: false },
    ]);
  });

  it('emits no control at all for a group with no kind, so a plain exercise row list is byte-identical to its Phase 5 self (R15)', () => {
    const parent1 = resolvedRow({ setId: 'p1', setType: 'normal', completed: true });
    const parent2 = resolvedRow({ setId: 'p2', setType: 'normal', completed: false });

    expect(resolveGroupAddControls([parent1, parent2])).toEqual([]);
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
