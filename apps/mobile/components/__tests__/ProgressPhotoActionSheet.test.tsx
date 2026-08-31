import type { ReactNode } from 'react';
import {
  DeletePhotoDialog,
  ProgressPhotoActionSheetView,
  PROGRESS_PHOTO_ACTIONS,
} from '../ProgressPhotoActionSheet';

const COLORS = { foreground: 'rgb(9, 9, 11)', destructive: 'rgb(220, 38, 38)' };

function findText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) findText(child, out);
    return out;
  }
  const element = node as { props?: { children?: unknown } };
  if (element.props?.children !== undefined) findText(element.props.children, out);
  return out;
}

function collect(node: ReactNode, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const element = node as { props?: Record<string, unknown> };
  if (element.props) out.push(element.props);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) collect(children, out);
  return out;
}

describe('PROGRESS_PHOTO_ACTIONS', () => {
  it('has exactly three entries: view, edit note, delete — only delete is destructive', () => {
    expect(PROGRESS_PHOTO_ACTIONS.map((action) => action.id)).toEqual(['view', 'edit-note', 'delete']);
    const destructiveIds = PROGRESS_PHOTO_ACTIONS.filter((action) => action.destructive).map((action) => action.id);
    expect(destructiveIds).toEqual(['delete']);
  });
});

describe('ProgressPhotoActionSheetView', () => {
  it('renders exactly three action rows with their labels', () => {
    const sheet = ProgressPhotoActionSheetView({
      dateLabel: 'Aug 20',
      colors: COLORS,
      onSelect: jest.fn(),
      onCancel: jest.fn(),
    });

    const props = collect(sheet);
    const rowLabels = props.filter((p) => typeof p.accessibilityLabel === 'string' && p.accessibilityRole === 'button');
    const actionLabels = rowLabels.map((p) => p.accessibilityLabel).filter((label) => label !== 'Cancel');
    expect(actionLabels).toEqual(['View Full Size', 'Edit Note', 'Delete']);
  });

  it('selecting delete calls onSelect with delete — the caller, not this sheet, decides to surface the confirmation', () => {
    const onSelect = jest.fn();
    const sheet = ProgressPhotoActionSheetView({ dateLabel: 'Aug 20', colors: COLORS, onSelect, onCancel: jest.fn() });

    const props = collect(sheet);
    const deleteRow = props.find((p) => p.accessibilityLabel === 'Delete');
    (deleteRow?.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('delete');
  });
});

describe('DeletePhotoDialog', () => {
  it('renders the Delete Photo heading and the exact confirm body copy', () => {
    const dialog = DeletePhotoDialog({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const text = findText(dialog).join(' ');

    expect(text).toContain('Delete Photo');
    expect(text).toContain(
      "This photo and its bytes on this device will be deleted. This can't be undone. Delete anyway?",
    );
  });

  it('renders a Cancel and a destructive Delete control', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const dialog = DeletePhotoDialog({ onConfirm, onCancel });

    const props = collect(dialog);
    const cancelButton = props.find((p) => p.accessibilityLabel === 'Cancel');
    const deleteButton = props.find((p) => p.accessibilityLabel === 'Delete');

    (cancelButton?.onPress as () => void)();
    (deleteButton?.onPress as () => void)();

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalled();
  });
});
