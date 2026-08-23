import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { DragHandle } from '../DragHandle';
import {
  CYCLE_OVERRIDE_MARKER,
  ExerciseSlotRowView,
  formatSlotSummary,
  stepBoundedValue,
  stepRepMax,
  stepRepMin,
  type ExerciseSlotRowViewProps,
} from '../ExerciseSlotRow';
import type { TargetDraft } from '../../lib/db/programs/targets';

// ExerciseSlotRowView has no hooks (colors is a prop, not a useThemeColors() call) — direct
// invocation is a faithful exercise of its real body, matching the technique already established
// for SwapSuggestionList/DetailSection (03-07/03-09) and ExerciseListRow (03-13).
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

const ALL_NULL: TargetDraft = {
  targetSets: null,
  targetRepMin: null,
  targetRepMax: null,
  targetRir: null,
  targetRestSeconds: null,
};

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function baseProps(overrides: Partial<ExerciseSlotRowViewProps> = {}): ExerciseSlotRowViewProps {
  return {
    slot: { id: 'rex-1', exerciseName: 'Bench Press' },
    expanded: false,
    draft: ALL_NULL,
    colors: COLORS,
    onToggleExpanded: jest.fn(),
    onStepSets: jest.fn(),
    onStepRepMin: jest.fn(),
    onStepRepMax: jest.fn(),
    onStepRir: jest.fn(),
    onStepRest: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
}

describe('ExerciseSlotRowView', () => {
  it('collapsed: renders the exercise name and collapsed summary, zero steppers', () => {
    const result = ExerciseSlotRowView(baseProps({ expanded: false }));
    const buttons = findByType(result, Pressable);
    const stepperButtons = buttons.filter((el) => /^(Decrease|Increase) /.test((el.props.accessibilityLabel as string) ?? ''));

    expect(stepperButtons).toHaveLength(0);
  });

  it('expanded: renders exactly five stepper fields (Sets, Rep min, Rep max, RIR, Rest) and still the exercise name', () => {
    const result = ExerciseSlotRowView(
      baseProps({ expanded: true, draft: { targetSets: 3, targetRepMin: 8, targetRepMax: 10, targetRir: 2, targetRestSeconds: 90 } }),
    );
    const buttons = findByType(result, Pressable);
    const decreaseButtons = buttons.filter((el) => /^Decrease /.test((el.props.accessibilityLabel as string) ?? ''));
    const increaseButtons = buttons.filter((el) => /^Increase /.test((el.props.accessibilityLabel as string) ?? ''));

    expect(decreaseButtons).toHaveLength(5);
    expect(increaseButtons).toHaveLength(5);

    const nameButton = buttons.find((el) => el.props.accessibilityLabel === 'Bench Press');
    expect(nameButton).toBeDefined();
  });

  it("the outer Pressable carries accessibilityRole/label/state and a 48x48 minimum", () => {
    const collapsed = ExerciseSlotRowView(baseProps({ expanded: false }));
    const expanded = ExerciseSlotRowView(baseProps({ expanded: true }));

    const collapsedHeader = findByType(collapsed, Pressable).find((el) => el.props.accessibilityLabel === 'Bench Press');
    const expandedHeader = findByType(expanded, Pressable).find((el) => el.props.accessibilityLabel === 'Bench Press');

    expect(collapsedHeader?.props.accessibilityRole).toBe('button');
    expect((collapsedHeader?.props.accessibilityState as { expanded?: boolean })?.expanded).toBe(false);
    expect((expandedHeader?.props.accessibilityState as { expanded?: boolean })?.expanded).toBe(true);
    expect((collapsedHeader?.props.style as { minHeight?: number })?.minHeight).toBe(48);
  });

  it('a remove control is present only in the expanded state and calls onRemove with the slot id', () => {
    const onRemove = jest.fn();
    const collapsed = ExerciseSlotRowView(baseProps({ expanded: false }));
    const expanded = ExerciseSlotRowView(baseProps({ expanded: true, onRemove }));

    const collapsedRemove = findByType(collapsed, Pressable).find((el) => el.props.accessibilityLabel === 'Remove Bench Press');
    const expandedRemove = findByType(expanded, Pressable).find((el) => el.props.accessibilityLabel === 'Remove Bench Press');

    expect(collapsedRemove).toBeUndefined();
    expect(expandedRemove).toBeDefined();

    (expandedRemove?.props.onPress as () => void)();
    expect(onRemove).toHaveBeenCalledWith('rex-1');
  });
});

describe('ExerciseSlotRowView — drag handle and Move up/down (04-05)', () => {
  it('renders no DragHandle and no Move up/down controls when canReorder is omitted (default false)', () => {
    const result = ExerciseSlotRowView(baseProps({ expanded: true }));

    expect(findByType(result, DragHandle)).toHaveLength(0);
    expect(findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Move Bench Press up')).toBeUndefined();
  });

  it('renders exactly one DragHandle, collapsed or expanded, when canReorder is true', () => {
    const collapsed = ExerciseSlotRowView(
      baseProps({ expanded: false, canReorder: true, orderedIds: ['rex-1', 'rex-2'], index: 0, onReorder: jest.fn() }),
    );
    const expanded = ExerciseSlotRowView(
      baseProps({ expanded: true, canReorder: true, orderedIds: ['rex-1', 'rex-2'], index: 0, onReorder: jest.fn() }),
    );

    expect(findByType(collapsed, DragHandle)).toHaveLength(1);
    expect(findByType(expanded, DragHandle)).toHaveLength(1);
  });

  it('Move up is disabled at index 0 and Move down is disabled at the last index, via accessibilityState, not by removing the control', () => {
    const result = ExerciseSlotRowView(
      baseProps({ expanded: true, canReorder: true, orderedIds: ['rex-1', 'rex-2'], index: 0, onReorder: jest.fn() }),
    );
    const buttons = findByType(result, Pressable);
    const moveUp = buttons.find((el) => el.props.accessibilityLabel === 'Move Bench Press up');
    const moveDown = buttons.find((el) => el.props.accessibilityLabel === 'Move Bench Press down');

    expect(moveUp).toBeDefined();
    expect(moveDown).toBeDefined();
    expect((moveUp?.props.accessibilityState as { disabled?: boolean })?.disabled).toBe(true);
    expect((moveDown?.props.accessibilityState as { disabled?: boolean })?.disabled).toBe(false);
  });

  it('Move down commits the identical write moveExercise expects, via onReorder', () => {
    const onReorder = jest.fn();
    const result = ExerciseSlotRowView(
      baseProps({
        expanded: true,
        canReorder: true,
        orderedIds: ['rex-1', 'rex-2', 'rex-3'],
        index: 0,
        onReorder,
        slot: { id: 'rex-1', exerciseName: 'Bench Press' },
      }),
    );
    const moveDown = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Move Bench Press down');

    (moveDown?.props.onPress as () => void)();

    expect(onReorder).toHaveBeenCalledWith('rex-2', 'rex-3');
  });
});

describe('ExerciseSlotRowView — per-cycle override marking and reset (04-08)', () => {
  function markedFields(result: ReturnType<typeof ExerciseSlotRowView>): string[] {
    return findByType(result, Text)
      .filter((el) => /overridden for this cycle$/.test((el.props.accessibilityLabel as string) ?? ''))
      .map((el) => (el.props.accessibilityLabel as string).replace(' overridden for this cycle', ''));
  }

  it('marks only the fields the selected cycle actually overrides', () => {
    const result = ExerciseSlotRowView(
      baseProps({
        expanded: true,
        cycleSelected: true,
        overriddenFields: ['targetSets'],
        draft: { targetSets: 5, targetRepMin: 8, targetRepMax: 10, targetRir: 2, targetRestSeconds: 90 },
      }),
    );

    expect(markedFields(result)).toEqual(['Sets']);
  });

  it('marks each overridden field with text, never colour alone', () => {
    const result = ExerciseSlotRowView(
      baseProps({
        expanded: true,
        cycleSelected: true,
        overriddenFields: ['targetRir', 'targetRestSeconds'],
        draft: { targetSets: 3, targetRepMin: 8, targetRepMax: 10, targetRir: 0, targetRestSeconds: 60 },
      }),
    );
    const markers = findByType(result, Text).filter((el) => el.props.children === CYCLE_OVERRIDE_MARKER);

    expect(markedFields(result)).toEqual(['RIR', 'Rest (seconds)']);
    expect(markers).toHaveLength(2);
  });

  it('renders a Reset to base control, calling onResetCycleTarget, when a cycle is selected and a field is overridden', () => {
    const onResetCycleTarget = jest.fn();
    const result = ExerciseSlotRowView(
      baseProps({ expanded: true, cycleSelected: true, overriddenFields: ['targetSets'], onResetCycleTarget }),
    );
    const reset = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Reset Bench Press to base');

    expect(reset).toBeDefined();
    expect((reset?.props.style as { minHeight?: number })?.minHeight).toBe(48);

    (reset?.props.onPress as () => void)();
    expect(onResetCycleTarget).toHaveBeenCalledWith('rex-1');
  });

  it('renders no Reset to base control when nothing is overridden in the selected cycle', () => {
    const result = ExerciseSlotRowView(baseProps({ expanded: true, cycleSelected: true, overriddenFields: [] }));

    expect(findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Reset Bench Press to base')).toBeUndefined();
  });

  it('renders neither markers nor a Reset control with no cycle selected — the base view has nothing to reset to', () => {
    const result = ExerciseSlotRowView(
      baseProps({ expanded: true, cycleSelected: false, overriddenFields: ['targetSets'] }),
    );

    expect(markedFields(result)).toEqual([]);
    expect(findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Reset Bench Press to base')).toBeUndefined();
  });
});

describe('formatSlotSummary', () => {
  it("is 'No targets set.' when all five values are null", () => {
    expect(formatSlotSummary(ALL_NULL)).toBe('No targets set.');
  });

  it('substitutes an em dash per individually-null field against the fixed four-segment template', () => {
    expect(formatSlotSummary({ targetSets: 3, targetRepMin: 8, targetRepMax: 10, targetRir: null, targetRestSeconds: 90 })).toBe(
      '3 sets · 8–10 reps · — RIR · 1:30 rest',
    );
  });

  it('never collapses an equal rep min and max — always the {n}–{n} form', () => {
    expect(formatSlotSummary({ targetSets: 3, targetRepMin: 8, targetRepMax: 8, targetRir: null, targetRestSeconds: null })).toBe(
      '3 sets · 8–8 reps · — RIR · — rest',
    );
  });

  it('renders a fully populated draft with no dashes at all', () => {
    expect(formatSlotSummary({ targetSets: 3, targetRepMin: 8, targetRepMax: 10, targetRir: 2, targetRestSeconds: 90 })).toBe(
      '3 sets · 8–10 reps · 2 RIR · 1:30 rest',
    );
  });
});

describe('stepBoundedValue', () => {
  it('increments from null to the floor', () => {
    expect(stepBoundedValue(null, 'inc', 1, null)).toBe(1);
  });

  it('increments a set value by the step, capped at the ceiling', () => {
    expect(stepBoundedValue(5, 'inc', 0, 6)).toBe(6);
    expect(stepBoundedValue(6, 'inc', 0, 6)).toBe(6);
  });

  it('decrements a null value as a no-op', () => {
    expect(stepBoundedValue(null, 'dec', 1, null)).toBeNull();
  });

  it('decrements the floor to null, clearing the target back to unprescribed', () => {
    expect(stepBoundedValue(1, 'dec', 1, null)).toBeNull();
  });

  it('decrements a value above the floor by the step', () => {
    expect(stepBoundedValue(3, 'dec', 1, null)).toBe(2);
  });

  it('respects a custom step for rest (15 seconds)', () => {
    expect(stepBoundedValue(null, 'inc', 0, null, 15)).toBe(0);
    expect(stepBoundedValue(0, 'inc', 0, null, 15)).toBe(15);
    expect(stepBoundedValue(15, 'dec', 0, null, 15)).toBe(0);
    expect(stepBoundedValue(0, 'dec', 0, null, 15)).toBeNull();
  });

  // WR-01: the old guard tested `current <= floor`, so a rest value in (0, 15) — reachable from a
  // program authored on another client, or a future importer — decremented straight past the floor
  // into a negative that the server rejects terminally.
  it('never returns a negative when a step would overshoot the floor', () => {
    expect(stepBoundedValue(10, 'dec', 0, null, 15)).toBeNull();
    expect(stepBoundedValue(1, 'dec', 0, null, 15)).toBeNull();
    expect(stepBoundedValue(14, 'dec', 0, null, 15)).toBeNull();
  });

  it('clears rather than undershoots for any step and floor combination', () => {
    for (const current of [1, 2, 7, 13, 14]) {
      expect(stepBoundedValue(current, 'dec', 0, null, 15)).toBeNull();
    }
    for (const current of [2, 3, 5]) {
      expect(stepBoundedValue(current, 'dec', 1, null, 5)).toBeNull();
    }
    expect(stepBoundedValue(6, 'dec', 1, null, 5)).toBe(1);
  });
});

describe('stepRepMin / stepRepMax — R5 structural pairing', () => {
  it('incrementing min above the current max also raises max to match', () => {
    expect(stepRepMin({ min: 10, max: 10 }, 'inc')).toEqual({ min: 11, max: 11 });
  });

  it('incrementing min when max is null does not invent a max', () => {
    expect(stepRepMin({ min: 8, max: null }, 'inc')).toEqual({ min: 9, max: null });
  });

  it('decrementing min never pushes max', () => {
    expect(stepRepMin({ min: 8, max: 10 }, 'dec')).toEqual({ min: 7, max: 10 });
  });

  it('decrementing max below the current min also lowers min to match', () => {
    expect(stepRepMax({ min: 10, max: 10 }, 'dec')).toEqual({ min: 9, max: 9 });
  });

  it('decrementing max when min is null does not invent a min', () => {
    expect(stepRepMax({ min: null, max: 8 }, 'dec')).toEqual({ min: null, max: 7 });
  });

  it('incrementing max never pushes min', () => {
    expect(stepRepMax({ min: 8, max: 10 }, 'inc')).toEqual({ min: 8, max: 11 });
  });
});
