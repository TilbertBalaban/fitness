import type { ReactNode } from 'react';
import { RecordRowView, type RecordRowViewProps } from '../RecordRow';
import type { RecordListRow } from '@/lib/db/records-query';

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

function recordRow(overrides: Partial<RecordListRow> = {}): RecordListRow {
  return {
    id: 'pr-1',
    exerciseId: 'ex-1',
    exerciseName: 'Barbell Bench Press',
    prType: 'heaviest_weight',
    value: '102.500',
    setWeightKg: '102.500',
    achievedAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  };
}

function renderRow(overrides: Partial<RecordRowViewProps> = {}) {
  return RecordRowView({
    row: recordRow(),
    valueLabel: '102.50 kg',
    metricLabel: 'Heaviest Weight',
    colors: COLORS,
    onPress: jest.fn(),
    ...overrides,
  });
}

describe('RecordRowView', () => {
  it('renders the exercise name and a fact line joining the value and the date', () => {
    const text = findText(renderRow()).join(' ');

    expect(text).toContain('Barbell Bench Press');
    expect(text).toContain('102.50 kg');
    expect(text).toContain('12 Aug');
  });

  it('exposes exactly one press target for the whole row, chevron included', () => {
    const pressables = collect(renderRow()).filter((props) => typeof props.onPress === 'function');

    expect(pressables).toHaveLength(1);
  });

  it('announces the exercise, the metric and the value — the chip row is not otherwise reachable from a row', () => {
    const [pressable] = collect(renderRow()).filter((props) => typeof props.onPress === 'function');
    const label = String(pressable.accessibilityLabel);

    expect(label).toContain('Barbell Bench Press');
    expect(label).toContain('Heaviest Weight');
    expect(label).toContain('102.50 kg');
    expect(pressable.accessibilityRole).toBe('button');
  });

  it('holds the 48-unit minimum height on its press target', () => {
    const [pressable] = collect(renderRow()).filter((props) => typeof props.onPress === 'function');

    expect(pressable.style).toMatchObject({ minHeight: 48 });
  });

  // R4: a long exercise name wraps and the row grows rather than truncating.
  it('sets no line clamp on either line', () => {
    const clamped = collect(renderRow({ row: recordRow({ exerciseName: 'A'.repeat(120) }) })).filter(
      (props) => props.numberOfLines !== undefined,
    );

    expect(clamped).toHaveLength(0);
  });

  it('calls onPress when the row is pressed', () => {
    const onPress = jest.fn();
    const [pressable] = collect(renderRow({ onPress })).filter((props) => typeof props.onPress === 'function');

    (pressable.onPress as () => void)();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the most-reps value label it is given verbatim', () => {
    const text = findText(
      renderRow({
        row: recordRow({ prType: 'most_reps_at_weight', value: '12.000' }),
        valueLabel: '12 reps @ 100.00 kg',
        metricLabel: 'Most Reps',
      }),
    ).join(' ');

    expect(text).toContain('12 reps @ 100.00 kg');
  });
});
