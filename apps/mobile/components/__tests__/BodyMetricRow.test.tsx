import type { ReactNode } from 'react';
import { BodyMetricRowView, type BodyMetricRowViewProps } from '../BodyMetricRow';

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

function renderRow(overrides: Partial<BodyMetricRowViewProps> = {}) {
  return BodyMetricRowView({
    kind: 'bodyweight',
    value: '82.400',
    weightUnit: 'kg',
    dateLabel: '12 Aug',
    colors: COLORS,
    onPress: jest.fn(),
    onLogPress: jest.fn(),
    ...overrides,
  });
}

describe('BodyMetricRowView', () => {
  it('renders the kind label and a fact line joining the resolved value and the date', () => {
    const text = findText(renderRow()).join(' ');

    expect(text).toContain('Weight');
    expect(text).toContain('82.40 kg');
    expect(text).toContain('12 Aug');
  });

  it('formats a circumference kind in inches under an lb preference (D-08)', () => {
    const text = findText(renderRow({ kind: 'waist', value: '76.2', weightUnit: 'lb' })).join(' ');

    expect(text).toContain('Waist');
    expect(text).toContain('in');
    expect(text).not.toContain('cm');
  });

  it('exposes two independent press targets — the row body and the trailing log icon', () => {
    const pressables = collect(renderRow()).filter((props) => typeof props.onPress === 'function');

    expect(pressables).toHaveLength(2);
  });

  it('gives the row body and the log icon their own accessibility labels', () => {
    const pressables = collect(renderRow()).filter((props) => typeof props.onPress === 'function');
    const labels = pressables.map((props) => String(props.accessibilityLabel));

    expect(labels.some((label) => label.startsWith('Weight,'))).toBe(true);
    expect(labels).toContain('Log Weight');
  });

  it('calls onPress and onLogPress independently', () => {
    const onPress = jest.fn();
    const onLogPress = jest.fn();
    const pressables = collect(renderRow({ onPress, onLogPress })).filter((props) => typeof props.onPress === 'function');
    const rowBody = pressables.find((props) => String(props.accessibilityLabel).startsWith('Weight,'));
    const logIcon = pressables.find((props) => props.accessibilityLabel === 'Log Weight');

    (rowBody?.onPress as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLogPress).not.toHaveBeenCalled();

    (logIcon?.onPress as () => void)();
    expect(onLogPress).toHaveBeenCalledTimes(1);
  });

  // R4: a long kind label or fact line wraps and grows rather than truncating.
  it('sets no line clamp on either line', () => {
    const clamped = collect(renderRow()).filter((props) => props.numberOfLines !== undefined);

    expect(clamped).toHaveLength(0);
  });

  it('holds the 48-unit minimum height on both press targets', () => {
    const pressables = collect(renderRow()).filter((props) => typeof props.onPress === 'function');

    for (const props of pressables) {
      const style = props.style as { minHeight?: number };
      expect(style.minHeight).toBe(48);
    }
  });
});
