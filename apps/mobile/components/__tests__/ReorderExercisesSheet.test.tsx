import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { DragHandle } from '../DragHandle';
import { applyReorder, ReorderExercisesSheetView, type ReorderExercisesSheetViewProps } from '../ReorderExercisesSheet';

// ReorderExercisesSheet.tsx imports session-mutations.ts (for the stateful wrapper this file does
// not render — see the note below), which imports log-set.ts, which imports the real
// @powersync/react-native package — a real-module import chain this jest environment cannot parse
// (its shared-internals dependency ships ESM outside transformIgnorePatterns). Mocking powersync at
// its source, exactly like TargetsSheet.test.tsx/ExercisePickerModal.test.tsx already do, keeps
// that chain from ever loading.
jest.mock('@/lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

// Same direct-invocation technique as SessionActionSheet.test.tsx/TargetsSheet.test.tsx —
// ReorderExercisesSheetView has no hooks, so calling it directly exercises its real body with no
// renderer. The stateful ReorderExercisesSheet wrapper (useState/useThemeColors/the
// reorderSessionExercises write) is, per this codebase's established convention (TargetsSheet.test.tsx
// never renders the stateful TargetsSheet wrapper), exercised only through this hook-free view's
// onReorder/onDone/onMeasureRow callback props and applyReorder's own pure arithmetic — the actual
// write against a real database is proven end to end by e2e/reorder-exercises.spec.ts.
type AnyElement = ReactElement<Record<string, unknown>>;

function findByType(node: ReactNode, type: unknown, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findByType(child, type, found);
    return found;
  }
  const element = node as AnyElement;
  if (element.type === type) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findByType(children, type, found);
  return found;
}

function flatText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatText).join('');
  const element = node as ReactElement<{ children?: ReactNode }>;
  return element.props?.children !== undefined ? flatText(element.props.children) : '';
}

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function baseProps(overrides: Partial<ReorderExercisesSheetViewProps> = {}): ReorderExercisesSheetViewProps {
  return {
    exercises: [
      { id: 'se-1', name: 'Bench Press', completedWorkingSets: 1, targetSets: 3 },
      { id: 'se-2', name: 'Overhead Press', completedWorkingSets: 0, targetSets: 3 },
    ],
    colors: COLORS,
    rowHeight: 72,
    onMeasureRow: jest.fn(),
    onReorder: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  };
}

describe('ReorderExercisesSheetView', () => {
  it('renders one row per exercise in the given order, each with its completion fraction', () => {
    const result = ReorderExercisesSheetView(baseProps());
    const text = flatText(result);

    expect(text.indexOf('Bench Press')).toBeLessThan(text.indexOf('Overhead Press'));
    expect(text).toContain('1/3');
    expect(text).toContain('0/3');
  });

  it('renders a drag handle per row when the list holds two or more exercises', () => {
    const result = ReorderExercisesSheetView(baseProps());
    const handles = findByType(result, DragHandle);

    expect(handles).toHaveLength(2);
    expect(handles.map((handle) => handle.props.exerciseId)).toEqual(['se-1', 'se-2']);
  });

  it('renders no drag handle for a single-exercise list', () => {
    const result = ReorderExercisesSheetView(
      baseProps({ exercises: [{ id: 'se-1', name: 'Bench Press', completedWorkingSets: 1, targetSets: 3 }] }),
    );

    expect(findByType(result, DragHandle)).toHaveLength(0);
  });

  it('renders the empty copy with Done still enabled when every exercise was removed', () => {
    const result = ReorderExercisesSheetView(baseProps({ exercises: [] }));
    const text = flatText(result);
    const done = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Done');

    expect(text).toContain('No exercises to reorder');
    expect(text).toContain('Add an exercise from the workout screen to get started.');
    expect(done?.props.disabled).toBeUndefined();
  });

  it('passes the measured row height through to each drag handle', () => {
    const result = ReorderExercisesSheetView(baseProps({ rowHeight: 96 }));
    const handles = findByType(result, DragHandle);

    for (const handle of handles) {
      expect(handle.props.rowHeight).toBe(96);
    }
  });

  it('a drag handle drop calls onReorder with the moved exercise id and the reported neighbours', () => {
    const onReorder = jest.fn();
    const result = ReorderExercisesSheetView(baseProps({ onReorder }));
    const secondHandle = findByType(result, DragHandle).find((handle) => handle.props.exerciseId === 'se-2');

    (secondHandle?.props.onReorder as (beforeId: string | null, afterId: string | null) => void)(null, 'se-1');

    expect(onReorder).toHaveBeenCalledWith('se-2', null, 'se-1');
  });

  it('never truncates or shrinks an exercise name — no numberOfLines/ellipsizeMode/allowFontScaling anywhere (R4)', () => {
    const result = ReorderExercisesSheetView(baseProps());
    const texts = findByType(result, Text);

    for (const text of texts) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
      expect(text.props.allowFontScaling).not.toBe(false);
    }
  });

  it('tapping Done calls onDone', () => {
    const onDone = jest.fn();
    const result = ReorderExercisesSheetView(baseProps({ onDone }));
    const done = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Done');

    (done?.props.onPress as () => void)();

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('applyReorder — the neighbour-pair-to-ordered-array inverse a drop commits (LOG-14)', () => {
  it('moving the last row to the front (a null beforeId) inserts it at index 0', () => {
    expect(applyReorder(['a', 'b', 'c'], 'c', null)).toEqual(['c', 'a', 'b']);
  });

  it('moving the first row after a given id inserts it immediately after that id', () => {
    expect(applyReorder(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c']);
  });

  it('moving a row to the end (beforeId is the current last remaining id) appends it', () => {
    expect(applyReorder(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('dropping a row back onto its own position is a no-op on the resulting order (idempotent)', () => {
    const orderedIds = ['a', 'b', 'c'];
    expect(applyReorder(orderedIds, 'b', 'a')).toEqual(orderedIds);
  });

  it('a removed exercise absent from the input ordered ids is absent from the output', () => {
    // orderedIds here already excludes a removed exercise (upstream loadSessionTree's own
    // removed_at filter) — applyReorder never reintroduces an id it was not given.
    const result = applyReorder(['a', 'c'], 'c', null);

    expect(result).not.toContain('removed-id');
    expect(result).toEqual(['c', 'a']);
  });
});
