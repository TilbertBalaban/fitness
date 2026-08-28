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
  it('is exactly nine entries, in the order Swap, Remove, Reorder, Info, Equipment, Superset, Detach, Enable Per-Side, Disable Per-Side', () => {
    expect(SESSION_EXERCISE_ACTIONS.map((action) => action.id)).toEqual([
      'swap',
      'remove',
      'reorder',
      'info',
      'equipment',
      'superset',
      'detach-superset',
      'enable-per-side',
      'disable-per-side',
    ]);
  });

  it('marks only Remove as destructive — the four new rows are all structural, reversible edits', () => {
    const destructiveIds = SESSION_EXERCISE_ACTIONS.filter((action) => action.destructive).map((action) => action.id);
    expect(destructiveIds).toEqual(['remove']);
  });

  it('appends the four new rows after equipment without moving swap/equipment (index pin)', () => {
    expect(SESSION_EXERCISE_ACTIONS[0].id).toBe('swap');
    expect(SESSION_EXERCISE_ACTIONS[4].id).toBe('equipment');
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

  it('with none of the four new props supplied, renders exactly the row set it rendered before this plan (back-compat)', () => {
    const withoutEquipment = SessionActionSheetView(baseProps({ hasEquipment: false }));
    expect(
      findByType(withoutEquipment, Pressable)
        .map((el) => el.props.accessibilityLabel)
        .filter((label) => label !== 'Cancel'),
    ).toEqual(['Swap', 'Remove', 'Reorder', 'Info']);

    const withEquipment = SessionActionSheetView(baseProps({ hasEquipment: true }));
    expect(
      findByType(withEquipment, Pressable)
        .map((el) => el.props.accessibilityLabel)
        .filter((label) => label !== 'Cancel'),
    ).toEqual(['Swap', 'Remove', 'Reorder', 'Info', 'Equipment']);
  });

  it('shows the Superset row, naming the next exercise, when not already grouped and a next exercise exists', () => {
    const result = SessionActionSheetView(baseProps({ nextExerciseName: 'Bent Over Row' }));
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).toContain('Superset with Bent Over Row');
  });

  it('hides the Superset row when there is no next exercise to pair with', () => {
    const result = SessionActionSheetView(baseProps({ nextExerciseName: null }));
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels.some((label) => (label as string).startsWith('Superset with'))).toBe(false);
  });

  it('hides the Superset row when the exercise is already in a group', () => {
    const result = SessionActionSheetView(
      baseProps({ nextExerciseName: 'Bent Over Row', supersetPartnerName: 'Bench Press' }),
    );
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels.some((label) => (label as string).startsWith('Superset with'))).toBe(false);
  });

  it('shows the Detach row, naming the partner, when the exercise is already in a group', () => {
    const result = SessionActionSheetView(baseProps({ supersetPartnerName: 'Bench Press' }));
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).toContain('Detach from Bench Press');
  });

  it('hides the Detach row when the exercise is not in a group', () => {
    const result = SessionActionSheetView(baseProps({ supersetPartnerName: null }));
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels.some((label) => (label as string).startsWith('Detach from'))).toBe(false);
  });

  it('Superset and Detach are mutually exclusive: never both visible at once', () => {
    const grouped = SessionActionSheetView(baseProps({ nextExerciseName: 'X', supersetPartnerName: 'Y' }));
    const groupedLabels = findByType(grouped, Pressable).map((el) => el.props.accessibilityLabel as string);
    expect(groupedLabels.some((label) => label.startsWith('Superset with'))).toBe(false);
    expect(groupedLabels.some((label) => label.startsWith('Detach from'))).toBe(true);
  });

  it('shows "Log Left/Right Separately" when per-side is available and not yet enabled', () => {
    const result = SessionActionSheetView(baseProps({ perSideAvailable: true, perSideEnabled: false }));
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).toContain('Log Left/Right Separately');
    expect(labels).not.toContain('Log as One Side');
  });

  it('shows "Log as One Side" when per-side is available and already enabled', () => {
    const result = SessionActionSheetView(baseProps({ perSideAvailable: true, perSideEnabled: true }));
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).toContain('Log as One Side');
    expect(labels).not.toContain('Log Left/Right Separately');
  });

  it('hides both per-side rows when per-side is not available for this exercise', () => {
    const result = SessionActionSheetView(baseProps({ perSideAvailable: false, perSideEnabled: true }));
    const labels = findByType(result, Pressable).map((el) => el.props.accessibilityLabel);
    expect(labels).not.toContain('Log Left/Right Separately');
    expect(labels).not.toContain('Log as One Side');
  });

  it('all four new rows resolve the default foreground colour, never destructive', () => {
    const result = SessionActionSheetView(
      baseProps({
        nextExerciseName: 'Bent Over Row',
        supersetPartnerName: 'Bench Press',
        perSideAvailable: true,
        perSideEnabled: true,
      }),
    );
    const newRowLabels = ['Detach from Bench Press', 'Log as One Side'];
    for (const label of newRowLabels) {
      const row = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === label);
      const text = findByType(row, Text)[0];
      expect((text?.props.className as string)).toContain('text-foreground');
      expect((text?.props.className as string)).not.toContain('text-destructive');
    }
  });

  it('every new row still holds the 48-height floor', () => {
    const result = SessionActionSheetView(
      baseProps({ nextExerciseName: 'X', perSideAvailable: true, perSideEnabled: false }),
    );
    for (const pressable of findByType(result, Pressable)) {
      const style = pressable.props.style as { minHeight?: number };
      expect(style?.minHeight).toBe(48);
    }
  });

  it('tapping Superset/Detach/per-side rows calls onSelect with the row id', () => {
    const onSelect = jest.fn();
    const result = SessionActionSheetView(baseProps({ supersetPartnerName: 'Bench Press', onSelect }));
    const row = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Detach from Bench Press');

    (row?.props.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('detach-superset');
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
