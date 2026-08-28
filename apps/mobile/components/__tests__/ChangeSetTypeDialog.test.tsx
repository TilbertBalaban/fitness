import type { ReactElement, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { ChangeSetTypeDialog } from '../ChangeSetTypeDialog';
import { ErrorBanner } from '../ErrorBanner';

// Mirrors ArchiveDialog.test.tsx's own direct-invocation technique — ChangeSetTypeDialog has no
// hooks, so calling it as a plain function is a faithful exercise of its real body.
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

function flatText(node: ReactNode): string {
  return collectText(node).join('').replace(/\s+/g, ' ').trim();
}

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

describe('ChangeSetTypeDialog', () => {
  it('renders the singular body copy when subEntryCount is 1', () => {
    const result = ChangeSetTypeDialog({ subEntryCount: 1, onConfirm: jest.fn(), onCancel: jest.fn() });
    expect(flatText(result)).toContain("This set has 1 sub-entry. Changing its type will delete it. This can't be undone.");
  });

  it('renders the plural body copy when subEntryCount is 3', () => {
    const result = ChangeSetTypeDialog({ subEntryCount: 3, onConfirm: jest.fn(), onCancel: jest.fn() });
    expect(flatText(result)).toContain(
      "This set has 3 sub-entries. Changing its type will delete them. This can't be undone.",
    );
  });

  it('renders the "Change Set Type?" heading', () => {
    const result = ChangeSetTypeDialog({ subEntryCount: 1, onConfirm: jest.fn(), onCancel: jest.fn() });
    expect(flatText(result)).toContain('Change Set Type?');
  });

  it('tapping Cancel calls onCancel and never onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ChangeSetTypeDialog({ subEntryCount: 1, onConfirm, onCancel });

    const pressables = findByType(result, Pressable);
    const cancelButton = pressables.find((el) => flatText(el.props.children) === 'Cancel');
    (cancelButton?.props.onPress as () => void)();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tapping Delete and Change calls onConfirm exactly once', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = ChangeSetTypeDialog({ subEntryCount: 1, onConfirm, onCancel });

    const pressables = findByType(result, Pressable);
    const confirmButton = pressables.find((el) => flatText(el.props.children) === 'Delete and Change');
    (confirmButton?.props.onPress as () => void)();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders no ErrorBanner when errorMessage is not supplied', () => {
    const result = ChangeSetTypeDialog({ subEntryCount: 1, onConfirm: jest.fn(), onCancel: jest.fn() });
    expect(findByType(result, ErrorBanner)).toHaveLength(0);
  });

  it('renders the ErrorBanner with the supplied errorMessage and leaves the dialog open', () => {
    const result = ChangeSetTypeDialog({
      subEntryCount: 2,
      errorMessage: "Couldn't save",
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
    });
    const [banner] = findByType(result, ErrorBanner);
    expect(banner?.props.message).toBe("Couldn't save");
    expect(flatText(result)).toContain('Change Set Type?');
  });
});
