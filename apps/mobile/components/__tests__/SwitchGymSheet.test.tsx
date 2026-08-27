// SwitchGymSheet.tsx's wrapper reaches equipment-profiles.ts -> powersync.ts -> the real
// @powersync/react-native module chain, which Jest cannot parse (WINDOWS #22/#33) — mocked before
// import, matching gym-profiles-screen.test.tsx's own precedent exactly. This suite only exercises
// SwitchGymSheetView (hook-free, no read of its own), so the mock is never actually invoked.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { SwitchGymSheetView, type SwitchGymSheetGymRow } from '../SwitchGymSheet';

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

const GYM_A: SwitchGymSheetGymRow = { id: 'gym-a', name: 'Commercial Gym', archivedAt: null };
const GYM_B: SwitchGymSheetGymRow = { id: 'gym-b', name: 'Home Gym', archivedAt: null };
const GYM_ARCHIVED: SwitchGymSheetGymRow = { id: 'gym-c', name: 'Old Gym', archivedAt: '2026-01-01T00:00:00.000Z' };

function baseProps(overrides: Partial<Parameters<typeof SwitchGymSheetView>[0]> = {}) {
  return {
    gyms: [GYM_A, GYM_B],
    activeGymId: GYM_A.id,
    onSelect: jest.fn(),
    onManageGyms: jest.fn(),
    onDismiss: jest.fn(),
    ...overrides,
  };
}

describe('SwitchGymSheetView', () => {
  it('lists every non-archived gym, with the active one accent-tinted and labelled', () => {
    const result = SwitchGymSheetView(baseProps());
    const text = flatText(result);
    expect(text).toContain('Commercial Gym');
    expect(text).toContain('Home Gym');
    expect(text).toContain('Active now');

    const [activeRow] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Commercial Gym');
    expect(activeRow.props.className).toContain('border-accent');
    const [activeText] = findByType(activeRow, Text).filter((el) => flatText(el) === 'Commercial Gym');
    expect(activeText.props.className).toContain('text-accent');
  });

  it('excludes an archived gym from the list entirely', () => {
    const result = SwitchGymSheetView(baseProps({ gyms: [GYM_A, GYM_B, GYM_ARCHIVED] }));
    expect(flatText(result)).not.toContain('Old Gym');
    expect(findByType(result, Pressable).some((el) => el.props.accessibilityLabel === 'Old Gym')).toBe(false);
  });

  it('tapping a non-active row calls onSelect with that gym id, never onDismiss', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    const result = SwitchGymSheetView(baseProps({ onSelect, onDismiss }));
    const [row] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Home Gym');
    (row.props.onPress as () => void)();
    expect(onSelect).toHaveBeenCalledWith('gym-b');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('tapping the already-active row dismisses without a write — onSelect never called', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    const result = SwitchGymSheetView(baseProps({ onSelect, onDismiss }));
    const [row] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Commercial Gym');
    (row.props.onPress as () => void)();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('the trailing Manage Gyms link calls onManageGyms', () => {
    const onManageGyms = jest.fn();
    const result = SwitchGymSheetView(baseProps({ onManageGyms }));
    const [link] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Manage Gyms');
    (link.props.onPress as () => void)();
    expect(onManageGyms).toHaveBeenCalledTimes(1);
  });

  it('Cancel calls onDismiss without touching onSelect', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    const result = SwitchGymSheetView(baseProps({ onSelect, onDismiss }));
    const [cancel] = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Cancel');
    (cancel.props.onPress as () => void)();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('exactly one gym still renders a single tappable row', () => {
    const result = SwitchGymSheetView(baseProps({ gyms: [GYM_A], activeGymId: GYM_A.id }));
    const rows = findByType(result, Pressable).filter((el) => el.props.accessibilityLabel === 'Commercial Gym');
    expect(rows).toHaveLength(1);
  });
});
