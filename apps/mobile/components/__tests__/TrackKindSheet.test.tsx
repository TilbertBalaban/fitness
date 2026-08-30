import type { ReactNode } from 'react';
import { BODY_METRIC_KIND_ORDER, type BodyMetricKind } from '@fitness/api-contracts';
import { TrackKindSheetView, type TrackKindSheetViewProps } from '../TrackKindSheet';

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

function renderSheet(overrides: Partial<TrackKindSheetViewProps> = {}) {
  return TrackKindSheetView({
    trackedKinds: new Set<BodyMetricKind>(),
    onSelect: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  });
}

describe('TrackKindSheetView — empty (every kind already tracked)', () => {
  it('renders the "tracking everything" copy and no row list', () => {
    const view = renderSheet({ trackedKinds: new Set(BODY_METRIC_KIND_ORDER) });
    const text = findText(view).join(' ');
    const rows = collect(view).filter((props) => typeof props.onPress === 'function' && props.accessibilityLabel !== 'Cancel');

    expect(text).toContain("You're tracking everything");
    expect(text).toContain('Every measurement is already on your list.');
    expect(rows).toHaveLength(0);
  });
});

describe('TrackKindSheetView — populated (some kinds untracked)', () => {
  it('renders one row per untracked kind, labelled from the vocabulary, in BODY_METRIC_KIND_ORDER', () => {
    const trackedKinds = new Set<BodyMetricKind>(['bodyweight']);
    const view = renderSheet({ trackedKinds });
    const rows = collect(view).filter((props) => typeof props.onPress === 'function' && props.accessibilityLabel !== 'Cancel');
    const text = findText(view).join(' ');

    expect(rows).toHaveLength(14);
    expect(text).toContain('Waist');
    expect(text).toContain('Body Fat %');
    expect(text).not.toContain('Weight');
  });

  it('calls onSelect with the tapped kind exactly once', () => {
    const onSelect = jest.fn();
    const trackedKinds = new Set<BodyMetricKind>(BODY_METRIC_KIND_ORDER.filter((k) => k !== 'waist'));
    const view = renderSheet({ trackedKinds, onSelect });
    const [row] = collect(view).filter((props) => props.accessibilityLabel === 'Waist');

    (row.onPress as () => void)();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('waist');
  });
});
