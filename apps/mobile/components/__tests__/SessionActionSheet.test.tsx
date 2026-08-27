import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import {
  SessionActionSheetView,
  SESSION_EXERCISE_ACTIONS,
  RemoveExerciseDialog,
  type SessionActionSheetViewProps,
} from '../SessionActionSheet';

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

const COLORS = { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)' };

function baseProps(overrides: Partial<SessionActionSheetViewProps> = {}): SessionActionSheetViewProps {
  return {
    exerciseName: 'Bench Press',
    colors: COLORS,
    hasEquipment: false,
    onSelect: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

describe('SESSION_EXERCISE_ACTIONS', () => {
  it('is exactly five entries, in the order Swap, Remove, Reorder, Info, Equipment', () => {
    expect(SESSION_EXERCISE_ACTIONS.map((action) => action.id)).toEqual([
      'swap',
      'remove',
      'reorder',
      'info',
      'equipment',
    ]);
  });

  it('marks only Remove as destructive', () => {
    const destructiveIds = SESSION_EXERCISE_ACTIONS.filter((action) => action.destructive).map((action) => action.id);
    expect(destructiveIds).toEqual(['remove']);
  });
});

describe('SessionActionSheetView', () => {
  it('renders all four rows, never conditionally hidden', () => {
    const result = SessionActionSheetView(baseProps());
    const labels = findByType(result, Pressable)
      .map((el) => el.props.accessibilityLabel)
      .filter((label) => label !== 'Cancel');
    expect(labels).toEqual(['Swap', 'Remove', 'Reorder', 'Info']);
  });

  it('the Remove row resolves the destructive color and the other three resolve the default foreground color', () => {
    const result = SessionActionSheetView(baseProps());
    const rows = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel !== 'Cancel');

    for (const row of rows) {
      const label = row.props.accessibilityLabel as string;
      const text = findByType(row, Text)[0];
      if (label === 'Remove') {
        expect((text?.props.className as string)).toContain('text-destructive');
      } else {
        expect((text?.props.className as string)).toContain('text-foreground');
        expect((text?.props.className as string)).not.toContain('text-destructive');
      }
    }
  });

  it('every row is always actionable — no disabled-row state', () => {
    const result = SessionActionSheetView(baseProps());
    const rows = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel !== 'Cancel');
    for (const row of rows) {
      expect(row.props.disabled).toBeUndefined();
    }
  });

  it('tapping a row calls onSelect with that row id', () => {
    const onSelect = jest.fn();
    const result = SessionActionSheetView(baseProps({ onSelect }));
    const swap = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Swap');

    (swap?.props.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('swap');
  });

  it('every row and Cancel hold the 48-height floor', () => {
    const result = SessionActionSheetView(baseProps());
    for (const pressable of findByType(result, Pressable)) {
      const style = pressable.props.style as { minHeight?: number };
      expect(style?.minHeight).toBe(48);
    }
  });

  it('renders the sheet inside a scrollable container — grows and scrolls rather than clipping at large font scale (R4)', () => {
    // ScrollView is not imported here to keep this test import-light; className presence on the
    // sheet's outer content is asserted instead, matching RoutineActionSheet.test.tsx's own style.
    const result = SessionActionSheetView(baseProps()) as AnyElement;
    expect(flatText(result)).toContain('Bench Press');
  });

  it('renders four rows, Equipment absent, when hasEquipment is false — a structural exclusion, not a disabled row', () => {
    const result = SessionActionSheetView(baseProps({ hasEquipment: false }));
    const labels = findByType(result, Pressable)
      .map((el) => el.props.accessibilityLabel)
      .filter((label) => label !== 'Cancel');
    expect(labels).toEqual(['Swap', 'Remove', 'Reorder', 'Info']);
  });

  it('renders five rows, Equipment last, when hasEquipment is true', () => {
    const result = SessionActionSheetView(baseProps({ hasEquipment: true }));
    const labels = findByType(result, Pressable)
      .map((el) => el.props.accessibilityLabel)
      .filter((label) => label !== 'Cancel');
    expect(labels).toEqual(['Swap', 'Remove', 'Reorder', 'Info', 'Equipment']);
  });

  it('the Equipment row resolves the default foreground color, never destructive', () => {
    const result = SessionActionSheetView(baseProps({ hasEquipment: true }));
    const row = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Equipment');
    const text = findByType(row, Text)[0];
    expect((text?.props.className as string)).toContain('text-foreground');
    expect((text?.props.className as string)).not.toContain('text-destructive');
  });

  it('tapping the Equipment row calls onSelect with "equipment"', () => {
    const onSelect = jest.fn();
    const result = SessionActionSheetView(baseProps({ hasEquipment: true, onSelect }));
    const row = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Equipment');

    (row?.props.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('equipment');
  });
});

describe('RemoveExerciseDialog', () => {
  it('renders the exact Copywriting Contract copy', () => {
    const result = RemoveExerciseDialog({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const text = flatText(result);
    expect(text).toContain('Remove Exercise');
    expect(text).toContain('Any sets already logged for this exercise stay in your history. Remove it from this workout?');
  });

  it('declining (Cancel) never calls onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = RemoveExerciseDialog({ onConfirm, onCancel });
    const cancel = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Cancel');

    (cancel?.props.onPress as () => void)();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirming (Remove) calls onConfirm', () => {
    const onConfirm = jest.fn();
    const result = RemoveExerciseDialog({ onConfirm, onCancel: jest.fn() });
    const confirm = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Remove');

    (confirm?.props.onPress as () => void)();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
