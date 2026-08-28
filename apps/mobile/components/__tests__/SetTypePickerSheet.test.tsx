import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { SET_TYPES, type SetType } from '@fitness/api-contracts';
import { ErrorBanner } from '../ErrorBanner';
import {
  FAILURE_SET_RIR,
  SET_TYPE_PICKER_ROWS,
  SetTypePickerSheetView,
  resolveSetTypeSelection,
  setTypePickerEffect,
  type SetTypePickerSheetViewProps,
} from '../SetTypePickerSheet';

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

const COLORS = { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)', accent: 'rgb(37, 99, 235)' };

function baseProps(overrides: Partial<SetTypePickerSheetViewProps> = {}): SetTypePickerSheetViewProps {
  return {
    setNumber: 3,
    currentSetType: 'normal',
    childCount: 0,
    childSetType: null,
    colors: COLORS,
    onSelect: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

describe('SET_TYPE_PICKER_ROWS', () => {
  it('deep-equals the seven SET_TYPES ids in declared order', () => {
    expect(SET_TYPE_PICKER_ROWS.map((row) => row.id)).toEqual(SET_TYPES);
  });

  it('has exactly seven rows', () => {
    expect(SET_TYPE_PICKER_ROWS).toHaveLength(7);
  });
});

describe('setTypePickerEffect', () => {
  it('returns insert-child for exactly drop and partial', () => {
    expect(setTypePickerEffect('drop')).toBe('insert-child');
    expect(setTypePickerEffect('partial')).toBe('insert-child');
  });

  it('returns retype for the other five types', () => {
    for (const setType of ['normal', 'warmup', 'myorep', 'failure', 'amrap'] as const) {
      expect(setTypePickerEffect(setType)).toBe('retype');
    }
  });
});

describe('FAILURE_SET_RIR', () => {
  it('is exactly 0', () => {
    expect(FAILURE_SET_RIR).toBe(0);
  });
});

describe('resolveSetTypeSelection — the full behavior table (07-04)', () => {
  it('resolves Normal/Warm-up/Myorep/Failure/AMRAP to retype on a childless row', () => {
    for (const selected of ['normal', 'warmup', 'myorep', 'failure', 'amrap'] as const) {
      const currentSetType: SetType = selected === 'normal' ? 'warmup' : 'normal';
      expect(resolveSetTypeSelection({ selected, currentSetType, childCount: 0, childSetType: null })).toBe('retype');
    }
  });

  it('resolves Drop Set and Partial to insert-child on a childless row', () => {
    expect(resolveSetTypeSelection({ selected: 'drop', currentSetType: 'normal', childCount: 0, childSetType: null })).toBe(
      'insert-child',
    );
    expect(resolveSetTypeSelection({ selected: 'partial', currentSetType: 'normal', childCount: 0, childSetType: null })).toBe(
      'insert-child',
    );
  });

  it("resolves the row's own currently-active type to no-op, childless", () => {
    for (const setType of SET_TYPES) {
      expect(
        resolveSetTypeSelection({ selected: setType, currentSetType: setType, childCount: 0, childSetType: null }),
      ).toBe('no-op');
    }
  });

  it('resolves Drop Set on a group already carrying drop children to no-op', () => {
    expect(
      resolveSetTypeSelection({ selected: 'drop', currentSetType: 'normal', childCount: 1, childSetType: 'drop' }),
    ).toBe('no-op');
  });

  it('resolves Partial on a group already carrying partial children to no-op', () => {
    expect(
      resolveSetTypeSelection({ selected: 'partial', currentSetType: 'normal', childCount: 2, childSetType: 'partial' }),
    ).toBe('no-op');
  });

  it('resolves Drop Set on a group carrying a different child kind to confirm-first', () => {
    expect(
      resolveSetTypeSelection({ selected: 'drop', currentSetType: 'normal', childCount: 1, childSetType: 'partial' }),
    ).toBe('confirm-first');
  });

  it('resolves Partial on a group carrying a different child kind to confirm-first', () => {
    expect(
      resolveSetTypeSelection({ selected: 'partial', currentSetType: 'normal', childCount: 1, childSetType: 'drop' }),
    ).toBe('confirm-first');
  });

  it('resolves Normal/Warm-up/Failure/AMRAP on a grouped row to confirm-first (D-09)', () => {
    for (const selected of ['warmup', 'failure', 'amrap'] as const) {
      expect(
        resolveSetTypeSelection({ selected, currentSetType: 'normal', childCount: 1, childSetType: 'drop' }),
      ).toBe('confirm-first');
    }
    // 'normal' selected against a currentSetType it doesn't already equal (warmup-typed parent
    // with a mismatched drop child, an edge case R13/R14 tolerate but never produce from this UI).
    expect(
      resolveSetTypeSelection({ selected: 'normal', currentSetType: 'warmup', childCount: 1, childSetType: 'drop' }),
    ).toBe('confirm-first');
  });

  it('resolves Myorep on a myorep-shaped group to no-op, not confirm-first', () => {
    expect(
      resolveSetTypeSelection({ selected: 'myorep', currentSetType: 'myorep', childCount: 1, childSetType: 'myorep' }),
    ).toBe('no-op');
  });

  it('resolves Myorep on a grouped row of a different kind to confirm-first', () => {
    expect(
      resolveSetTypeSelection({ selected: 'myorep', currentSetType: 'normal', childCount: 1, childSetType: 'drop' }),
    ).toBe('confirm-first');
  });

  it('never resolves drop or partial to retype, under every child-state combination', () => {
    const childCounts = [0, 1, 3];
    const childSetTypes: (SetType | null)[] = [null, 'drop', 'partial', 'myorep'];
    for (const selected of ['drop', 'partial'] as const) {
      for (const currentSetType of SET_TYPES) {
        for (const childCount of childCounts) {
          for (const childSetType of childSetTypes) {
            expect(resolveSetTypeSelection({ selected, currentSetType, childCount, childSetType })).not.toBe('retype');
          }
        }
      }
    }
  });
});

describe('SetTypePickerSheetView', () => {
  it('renders exactly seven rows, each holding the 48 minimum height', () => {
    const result = SetTypePickerSheetView(baseProps());
    const rows = findByType(result, Pressable).filter((el) => SET_TYPE_PICKER_ROWS.some((row) => row.label === el.props.accessibilityLabel));

    expect(rows).toHaveLength(7);
    for (const rowEl of rows) {
      expect((rowEl.props.style as { minHeight: number }).minHeight).toBe(48);
    }
  });

  it('renders the heading "Set {N} Type"', () => {
    const result = SetTypePickerSheetView(baseProps({ setNumber: 5 }));
    expect(findByType(result, Text).some((el) => flatText(el) === 'Set 5 Type')).toBe(true);
  });

  it('renders only the row matching currentSetType as semibold accent with a trailing checkmark', () => {
    const result = SetTypePickerSheetView(baseProps({ currentSetType: 'drop' }));
    const dropLabel = findByType(result, Text).find((el) => flatText(el) === 'Drop Set');
    const normalLabel = findByType(result, Text).find((el) => flatText(el) === 'Normal');

    expect((dropLabel?.props.className as string)).toContain('text-accent');
    expect((normalLabel?.props.className as string)).not.toContain('text-accent');
  });

  it('tapping a row calls onSelect with that row’s id exactly once', () => {
    const onSelect = jest.fn();
    const result = SetTypePickerSheetView(baseProps({ onSelect }));
    const dropRow = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Drop Set');

    (dropRow?.props.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('drop');
  });

  it('tapping the already-active row still calls onSelect — the no-op-close decision belongs to the host, not the sheet', () => {
    const onSelect = jest.fn();
    const result = SetTypePickerSheetView(baseProps({ currentSetType: 'normal', onSelect }));
    const normalRow = findByType(result, Pressable).find((el) => el.props.accessibilityLabel === 'Normal');

    (normalRow?.props.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('normal');
  });

  it('tapping the overlay outside the card calls onCancel', () => {
    const onCancel = jest.fn();
    const result = SetTypePickerSheetView(baseProps({ onCancel }));

    (result.props.onPress as () => void)();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the ErrorBanner with the supplied errorMessage', () => {
    const result = SetTypePickerSheetView(baseProps({ errorMessage: "Couldn't save" }));
    const [banner] = findByType(result, ErrorBanner);
    expect(banner?.props.message).toBe("Couldn't save");
  });

  it('renders no ErrorBanner when errorMessage is not supplied', () => {
    const result = SetTypePickerSheetView(baseProps({ errorMessage: null }));
    expect(findByType(result, ErrorBanner)).toHaveLength(0);
  });
});
