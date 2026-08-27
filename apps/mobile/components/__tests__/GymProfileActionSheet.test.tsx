import type { ReactElement, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { GymProfileActionSheet, type GymProfileAction } from '../GymProfileActionSheet';

// Same direct-invocation technique as ArchiveDialog.test.tsx (kept as a per-file copy, matching
// this codebase's established pattern): the sheet has no hooks, so calling it directly is a
// faithful exercise of its real body.
function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node === 'object') {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return element.props?.children !== undefined ? collectText(element.props.children) : [];
  }
  return [];
}

type PressableElement = ReactElement<{ children?: ReactNode; onPress?: () => void }>;

function findPressables(node: ReactNode, found: PressableElement[] = []): PressableElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findPressables(child, found);
    return found;
  }
  const element = node as PressableElement;
  if (element.type === Pressable) found.push(element);
  if (element.props?.children !== undefined) findPressables(element.props.children, found);
  return found;
}

function flatText(node: ReactNode): string {
  return collectText(node).join('').replace(/\s+/g, ' ').trim();
}

const ACTIVE_ROW_ACTIONS: GymProfileAction[] = [
  { key: 'edit', label: 'Edit' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'archive', label: 'Archive', destructive: true },
];

const OTHER_ROW_ACTIONS: GymProfileAction[] = [
  { key: 'set-active', label: 'Set Active' },
  { key: 'edit', label: 'Edit' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'archive', label: 'Archive', destructive: true },
];

const ARCHIVED_ROW_ACTIONS: GymProfileAction[] = [
  { key: 'set-active', label: 'Set Active' },
  { key: 'edit', label: 'Edit' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'restore', label: 'Restore' },
];

describe('GymProfileActionSheet', () => {
  it('renders exactly three actions for the already-active row — Set Active omitted', () => {
    const result = GymProfileActionSheet({
      gymName: 'My Gym',
      actions: ACTIVE_ROW_ACTIONS,
      onSelect: jest.fn(),
      onCancel: jest.fn(),
    });

    const pressables = findPressables(result);
    const actionLabels = pressables.map((p) => flatText(p.props.children)).filter((label) => label !== 'Cancel');
    expect(actionLabels).toEqual(['Edit', 'Duplicate', 'Archive']);
    expect(actionLabels).not.toContain('Set Active');
  });

  it('renders exactly four actions for a non-active row, Set Active first', () => {
    const result = GymProfileActionSheet({
      gymName: 'My Gym',
      actions: OTHER_ROW_ACTIONS,
      onSelect: jest.fn(),
      onCancel: jest.fn(),
    });

    const pressables = findPressables(result);
    const actionLabels = pressables.map((p) => flatText(p.props.children)).filter((label) => label !== 'Cancel');
    expect(actionLabels).toEqual(['Set Active', 'Edit', 'Duplicate', 'Archive']);
  });

  it('renders Restore in place of Archive on an archived row', () => {
    const result = GymProfileActionSheet({
      gymName: 'Old Gym',
      actions: ARCHIVED_ROW_ACTIONS,
      onSelect: jest.fn(),
      onCancel: jest.fn(),
    });

    const pressables = findPressables(result);
    const actionLabels = pressables.map((p) => flatText(p.props.children)).filter((label) => label !== 'Cancel');
    expect(actionLabels).toContain('Restore');
    expect(actionLabels).not.toContain('Archive');
  });

  it('renders the gym name as the heading', () => {
    const result = GymProfileActionSheet({
      gymName: 'Home Gym',
      actions: ACTIVE_ROW_ACTIONS,
      onSelect: jest.fn(),
      onCancel: jest.fn(),
    });

    expect(flatText(result)).toContain('Home Gym');
  });

  it('pressing an action calls onSelect with that action key exactly once', () => {
    const onSelect = jest.fn();
    const result = GymProfileActionSheet({
      gymName: 'My Gym',
      actions: OTHER_ROW_ACTIONS,
      onSelect,
      onCancel: jest.fn(),
    });

    const pressables = findPressables(result);
    const setActive = pressables.find((p) => flatText(p.props.children) === 'Set Active');
    setActive?.props.onPress?.();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('set-active');
  });

  it('pressing Cancel calls onCancel and never onSelect', () => {
    const onSelect = jest.fn();
    const onCancel = jest.fn();
    const result = GymProfileActionSheet({
      gymName: 'My Gym',
      actions: OTHER_ROW_ACTIONS,
      onSelect,
      onCancel,
    });

    const pressables = findPressables(result);
    const cancelButton = pressables.find((p) => flatText(p.props.children) === 'Cancel');
    cancelButton?.props.onPress?.();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('the same overlay/scroll-container geometry every sibling sheet in this app uses', () => {
    const result = GymProfileActionSheet({
      gymName: 'My Gym',
      actions: ACTIVE_ROW_ACTIONS,
      onSelect: jest.fn(),
      onCancel: jest.fn(),
    }) as ReactElement<{ children?: ReactNode }>;

    const scrollView = result.props.children as ReactElement<{ className?: string }>;
    expect(scrollView.props.className).toContain('max-w-[400px]');
  });
});
