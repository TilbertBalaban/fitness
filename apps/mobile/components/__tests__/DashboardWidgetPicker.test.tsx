// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the component module
// so its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain,
// matching home-dashboard.test.ts's own precedent.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

import type { ReactNode } from 'react';
import { DashboardWidgetPickerView, type DashboardWidgetPickerViewProps } from '../DashboardWidgetPicker';
import type { WidgetKind } from '@fitness/api-contracts';

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

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

function widgetRow(id: string, widgetKind: WidgetKind) {
  return { id, widgetKind };
}

function renderPicker(overrides: Partial<DashboardWidgetPickerViewProps> = {}) {
  return DashboardWidgetPickerView({
    widgets: [],
    colors: COLORS,
    rowHeight: 64,
    onMeasureRow: jest.fn(),
    onRemove: jest.fn(),
    onAdd: jest.fn(),
    onReorder: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  });
}

describe('DashboardWidgetPickerView', () => {
  it('renders "No widgets added yet." when zero widgets are enabled, with the full add list beneath', () => {
    const text = findText(renderPicker({ widgets: [] })).join(' ');

    expect(text).toContain('No widgets added yet.');
    expect(text).toContain('Add a Widget');
    expect(text).toContain('Next Up');
    expect(text).toContain('Weekly Progress');
    expect(text).toContain('Recent Records');
    expect(text).toContain('Muscle Heatmap');
    expect(text).toContain('Bodyweight Trend');
    expect(text).toContain('History Trend');
  });

  it('renders no "Add a Widget" section header and no add list when every kind is already enabled', () => {
    const allEnabled: DashboardWidgetPickerViewProps['widgets'] = [
      widgetRow('a', 'next_up'),
      widgetRow('b', 'weekly_progress'),
      widgetRow('c', 'recent_records'),
      widgetRow('d', 'muscle_heatmap'),
      widgetRow('e', 'bodyweight_trend'),
      widgetRow('f', 'history_trend'),
    ];

    const text = findText(renderPicker({ widgets: allEnabled })).join(' ');

    expect(text).not.toContain('Add a Widget');
  });

  it('renders both sections when the picker is partially populated', () => {
    const widgets: DashboardWidgetPickerViewProps['widgets'] = [widgetRow('a', 'next_up')];

    const text = findText(renderPicker({ widgets })).join(' ');

    expect(text).toContain('Your Widgets');
    expect(text).toContain('Next Up');
    expect(text).toContain('Add a Widget');
    expect(text).toContain('Weekly Progress');
  });

  it('calling onAdd fires with the tapped kind', () => {
    const onAdd = jest.fn();
    const pressables = collect(renderPicker({ widgets: [], onAdd })).filter(
      (props) => typeof props.onPress === 'function' && props.accessibilityLabel === 'Add Next Up to dashboard',
    );

    expect(pressables).toHaveLength(1);
    (pressables[0].onPress as () => void)();
    expect(onAdd).toHaveBeenCalledWith('next_up');
  });

  it('sets no numberOfLines on any widget display name', () => {
    const widgets: DashboardWidgetPickerViewProps['widgets'] = [widgetRow('a', 'next_up')];
    const clamped = collect(renderPicker({ widgets })).filter((props) => props.numberOfLines !== undefined);

    expect(clamped).toHaveLength(0);
  });

  it('wires each row´s DragHandle onReorder into onReorder(widgetId, beforeId, afterId)', () => {
    const onReorder = jest.fn();
    const widgets: DashboardWidgetPickerViewProps['widgets'] = [widgetRow('a', 'next_up'), widgetRow('b', 'weekly_progress')];

    const dragHandles = collect(renderPicker({ widgets, onReorder })).filter(
      (props) => typeof props.onReorder === 'function' && props.exerciseId === 'b',
    );

    expect(dragHandles).toHaveLength(1);
    (dragHandles[0].onReorder as (beforeId: string | null, afterId: string | null) => void)('a', null);
    expect(onReorder).toHaveBeenCalledWith('b', 'a', null);
  });
});
