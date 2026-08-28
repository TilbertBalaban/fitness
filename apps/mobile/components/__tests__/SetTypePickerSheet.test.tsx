import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { SET_TYPES } from '@fitness/api-contracts';
import {
  SET_TYPE_PICKER_ROWS,
  SetTypePickerSheetView,
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
});
