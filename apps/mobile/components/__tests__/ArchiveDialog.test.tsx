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

  // The 'gym' subject (06-03): the union's third extension point, verbatim copy from the
  // 06-UI-SPEC.md Copywriting Contract's Destructive confirmation row.
  it('renders the exact gym archive confirmation copy', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ subject: 'gym', onConfirm, onCancel });

    const text = flatText(result);
    expect(text).toContain('Archive Gym');
    expect(text).toContain(
      'Archiving removes it from your gym list, but any workouts logged there stay in your history. Archive anyway?',
    );

    const pressables = findPressables(result);
    const confirmButton = pressables.find((p) => flatText(p.props.children) === 'Archive');
    expect(confirmButton).toBeDefined();
    confirmButton?.props.onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders the gym restore copy with a neutral, non-destructive confirm fill', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ subject: 'gym', unarchiving: true, onConfirm, onCancel });

    const text = flatText(result);
    expect(text).toContain('Restore Gym');
    expect(text).toContain('This gym will reappear in your gym list.');

    const pressables = findPressables(result);
    const confirmButton = pressables.find((p) => flatText(p.props.children) === 'Restore');
    expect(confirmButton).toBeDefined();
    const confirmProps = confirmButton?.props as { className?: string; onPress?: () => void } | undefined;
    expect(confirmProps?.className).not.toContain('bg-destructive');
    confirmProps?.onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  // The 'day' subject (04-13/D-29): the union's fourth extension point, copy confirmed with the
  // user directly rather than lifted from 04-UI-SPEC.md's Copywriting Contract (which predates D-29).
  it('renders the exact day archive confirmation copy with the destructive fill', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ subject: 'day', onConfirm, onCancel });

    const text = flatText(result);
    expect(text).toContain('Archive Day');
    expect(text).toContain(
      'Archiving removes it from this program, but any workouts you logged from it stay in your history. Archive anyway?',
    );

    const pressables = findPressables(result);
    const confirmButton = pressables.find((p) => flatText(p.props.children) === 'Archive');
    expect(confirmButton).toBeDefined();
    const confirmProps = confirmButton?.props as { className?: string; onPress?: () => void } | undefined;
    expect(confirmProps?.className).toContain('bg-destructive');
    confirmProps?.onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders the day restore copy with a neutral, non-destructive confirm fill', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ subject: 'day', unarchiving: true, onConfirm, onCancel });

    const text = flatText(result);
    expect(text).toContain('Restore Day');
    expect(text).toContain('This day will reappear in this program.');

    const pressables = findPressables(result);
    const confirmButton = pressables.find((p) => flatText(p.props.children) === 'Restore');
    expect(confirmButton).toBeDefined();
    const confirmProps = confirmButton?.props as { className?: string; onPress?: () => void } | undefined;
    expect(confirmProps?.className).not.toContain('bg-destructive');
    confirmProps?.onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders the same two-button row and 48x48 control geometry for the day subject as every other subject', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ArchiveDialog({ subject: 'day', onConfirm, onCancel });

    const pressables = findPressables(result);
    expect(pressables).toHaveLength(2);
    for (const pressable of pressables) {
      const props = pressable.props as unknown as {
        style?: { minWidth?: number; minHeight?: number };
        accessibilityRole?: string;
      };
      expect(props.style?.minWidth).toBe(48);
      expect(props.style?.minHeight).toBe(48);
      expect(props.accessibilityRole).toBe('button');
    }
  });
});
