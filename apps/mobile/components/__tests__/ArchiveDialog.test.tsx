import type { ReactElement, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { ArchiveDialog } from '../ArchiveDialog';

// ArchiveDialog has no hooks, so it is a plain `(props) => ReactElement` function — invoking it
// directly (no renderer) is a faithful exercise of its real body, matching the direct-invocation
// technique already established for DetailSection/MuscleTargetList (03-07). Pressables are found
// by referential identity against the real `Pressable` import, not by type-name introspection.
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

describe('ArchiveDialog', () => {
  it('renders the exact archive confirmation copy from the UI-SPEC Copywriting Contract', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ onConfirm, onCancel });

    expect(flatText(result)).toContain(
      'Archiving removes it from pickers, but any logged sets stay in your history. Archive anyway?',
    );
  });

  it('pressing Cancel calls onCancel and never onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ onConfirm, onCancel });

    const pressables = findPressables(result);
    expect(pressables).toHaveLength(2);
    const cancelButton = pressables.find((p) => flatText(p.props.children) === 'Cancel');
    cancelButton?.props.onPress?.();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('pressing Archive calls onConfirm exactly once', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ onConfirm, onCancel });

    const pressables = findPressables(result);
    const confirmButton = pressables.find((p) => flatText(p.props.children) === 'Archive');
    confirmButton?.props.onPress?.();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('the unarchiving variant swaps the copy and renders an Unarchive confirm control instead of Archive', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ unarchiving: true, onConfirm, onCancel });

    const text = flatText(result);
    expect(text).toContain('Unarchive Exercise');
    expect(text).not.toContain('Archive anyway?');

    const pressables = findPressables(result);
    const confirmButton = pressables.find((p) => flatText(p.props.children) === 'Unarchive');
    expect(confirmButton).toBeDefined();
    confirmButton?.props.onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
