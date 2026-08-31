import type { ReactNode } from 'react';
import {
  DeleteMetricEntryDialog,
  MetricEntryActionSheetView,
  METRIC_ENTRY_ACTIONS,
} from '../MetricEntryActionSheet';

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

describe('METRIC_ENTRY_ACTIONS', () => {
  it('has exactly two entries: edit, delete — only delete is destructive (D-10)', () => {
    expect(METRIC_ENTRY_ACTIONS.map((action) => action.id)).toEqual(['edit', 'delete']);
    const destructiveIds = METRIC_ENTRY_ACTIONS.filter((action) => action.destructive).map((action) => action.id);
    expect(destructiveIds).toEqual(['delete']);
  });
});

describe('MetricEntryActionSheetView', () => {
  it('renders exactly two action rows with their labels', () => {
    const sheet = MetricEntryActionSheetView({
      entryLabel: '82.40 kg, 12 Aug',
      colors: COLORS,
      onSelect: jest.fn(),
      onCancel: jest.fn(),
    });

    const props = collect(sheet);
    const rowLabels = props.filter((p) => typeof p.accessibilityLabel === 'string' && p.accessibilityRole === 'button');
    const actionLabels = rowLabels.map((p) => p.accessibilityLabel).filter((label) => label !== 'Cancel');
    expect(actionLabels).toEqual(['Edit', 'Delete']);
  });

  it('selecting delete calls onSelect with delete — the caller, not this sheet, surfaces the confirmation', () => {
    const onSelect = jest.fn();
    const sheet = MetricEntryActionSheetView({
      entryLabel: '82.40 kg, 12 Aug',
      colors: COLORS,
      onSelect,
      onCancel: jest.fn(),
    });

    const props = collect(sheet);
    const deleteRow = props.find((p) => p.accessibilityLabel === 'Delete');
    (deleteRow?.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('delete');
  });

  it('selecting edit calls onSelect with edit', () => {
    const onSelect = jest.fn();
    const sheet = MetricEntryActionSheetView({
      entryLabel: '82.40 kg, 12 Aug',
      colors: COLORS,
      onSelect,
      onCancel: jest.fn(),
    });

    const props = collect(sheet);
    const editRow = props.find((p) => p.accessibilityLabel === 'Edit');
    (editRow?.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledWith('edit');
  });
});

describe('DeleteMetricEntryDialog', () => {
  it('renders the Delete Entry heading and the exact confirm body copy', () => {
    const dialog = DeleteMetricEntryDialog({ onConfirm: jest.fn(), onCancel: jest.fn() });
    const text = findText(dialog).join(' ');

    expect(text).toContain('Delete Entry');
    expect(text).toContain("This entry will be deleted. This can't be undone. Delete anyway?");
  });

  it('renders a Cancel and a destructive Delete control, each wired to its own callback', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const dialog = DeleteMetricEntryDialog({ onConfirm, onCancel });

    const props = collect(dialog);
    const cancelButton = props.find((p) => p.accessibilityLabel === 'Cancel');
    const deleteButton = props.find((p) => p.accessibilityLabel === 'Delete');

    (cancelButton?.onPress as () => void)();
    (deleteButton?.onPress as () => void)();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
