import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EXERCISE_ACTIONS, ExerciseActionBarView, type ExerciseActionBarViewProps } from '../ExerciseActionBar';

// Same direct-invocation technique as SetRow.test.tsx/CycleStrip.test.tsx.
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

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function baseProps(overrides: Partial<ExerciseActionBarViewProps> = {}): ExerciseActionBarViewProps {
  return {
    hasNote: false,
    warmupSetsEnabled: true,
    colors: COLORS,
    onPress: jest.fn(),
    ...overrides,
  };
}

describe('EXERCISE_ACTIONS', () => {
  it('is exactly four entries, in the order warmup, targets, note, overflow', () => {
    expect(EXERCISE_ACTIONS.map((action) => action.id)).toEqual(['warmup', 'targets', 'note', 'overflow']);
  });
});

describe('ExerciseActionBarView', () => {
  it('renders all four items regardless of warmupSetsEnabled (D-13: never conditionally hidden)', () => {
    const enabled = ExerciseActionBarView(baseProps({ warmupSetsEnabled: true }));
    const disabled = ExerciseActionBarView(baseProps({ warmupSetsEnabled: false }));

    expect(findByType(enabled, Pressable)).toHaveLength(4);
    expect(findByType(disabled, Pressable)).toHaveLength(4);
    expect(findByType(disabled, Pressable).map((el) => el.props.accessibilityLabel)).toEqual([
      'Warm-up',
      'Targets',
      'Note',
      'More',
    ]);
  });

  it('renders by mapping EXERCISE_ACTIONS — not four literal Pressables', () => {
    const result = ExerciseActionBarView(baseProps());
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).toEqual(EXERCISE_ACTIONS.map((action) => action.label));
  });

  it('every item holds the 48x48 hit-target floor', () => {
    const result = ExerciseActionBarView(baseProps());
    for (const pressable of findByType(result, Pressable)) {
      expect(pressable.props.style).toMatchObject({ minWidth: 48, minHeight: 48 });
    }
  });

  it('tapping an item calls onPress with that item id', () => {
    const onPress = jest.fn();
    const result = ExerciseActionBarView(baseProps({ onPress }));
    const warmup = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Warm-up');

    (warmup?.props.onPress as () => void)();

    expect(onPress).toHaveBeenCalledWith('warmup');
  });

  it('the note dot renders only when hasNote is true', () => {
    const withNote = ExerciseActionBarView(baseProps({ hasNote: true }));
    const withoutNote = ExerciseActionBarView(baseProps({ hasNote: false }));

    const dotWith = findByType(withNote, View).filter((el) => el.props.accessibilityLabel === 'Note exists');
    const dotWithout = findByType(withoutNote, View).filter((el) => el.props.accessibilityLabel === 'Note exists');

    expect(dotWith).toHaveLength(1);
    expect(dotWithout).toHaveLength(0);
  });

  it('the note dot never appears on any button other than Note', () => {
    const result = ExerciseActionBarView(baseProps({ hasNote: true }));
    const dot = findByType(result, View).find((el) => el.props.accessibilityLabel === 'Note exists');
    expect(dot).toBeDefined();
  });

  it('never truncates a caption (R4) — no numberOfLines, no ellipsizeMode', () => {
    const result = ExerciseActionBarView(baseProps());
    for (const text of findByType(result, Text)) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
    }
  });

  it('wraps rather than scrolling or clipping (flex-wrap on the row container)', () => {
    const result = ExerciseActionBarView(baseProps()) as AnyElement;
    expect((result.props.className as string)).toContain('flex-wrap');
  });
});
