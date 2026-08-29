import type { ReactElement, ReactNode } from 'react';
import type { HistoryTrendResult, TrendBucketPoint } from '@fitness/analytics-engine';
import {
  formatTrendDelta,
  formatTrendHeadline,
  HistoryTrendCardView,
  type HistoryTrendCardViewProps,
} from '../HistoryTrendCard';
import { SegmentedChipRow } from '../SegmentedChipRow';
import { TrendChart } from '../TrendChart';

type AnyElement = ReactElement<Record<string, unknown>>;

function findAll(node: ReactNode, matches: (element: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, matches, found);
    return found;
  }
  const element = node as AnyElement;
  if (matches(element)) found.push(element);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findAll(children, matches, found);
  return found;
}

function collectText(node: ReactNode, found: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return found;
  if (typeof node === 'string' || typeof node === 'number') {
    found.push(String(node));
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, found);
    return found;
  }
  const element = node as AnyElement;
  const children = element.props?.children as ReactNode;
  if (children !== undefined) collectText(children, found);
  return found;
}

const isByType = (type: unknown) => (element: AnyElement) => element.type === type;

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function bucket(index: number, value: number): TrendBucketPoint {
  return {
    key: `2026-06-${String(index + 1).padStart(2, '0')}`,
    bucketIndex: index,
    startLocalDate: `2026-06-${String(index + 1).padStart(2, '0')}`,
    endLocalDate: `2026-06-${String(index + 7).padStart(2, '0')}`,
    value,
  };
}

function result(overrides: Partial<HistoryTrendResult> = {}): HistoryTrendResult {
  return {
    points: [bucket(0, 8000), bucket(1, 10000)],
    currentValue: 10000,
    delta: { kind: 'improving', percent: 25 },
    ...overrides,
  };
}

function baseProps(overrides: Partial<HistoryTrendCardViewProps> = {}): HistoryTrendCardViewProps {
  return {
    result: result(),
    metric: 'volume',
    onSelectMetric: jest.fn(),
    weightUnit: 'kg',
    colors: COLORS,
    width: 320,
    ...overrides,
  };
}

describe('formatTrendHeadline', () => {
  it('formats volume through the shared weight formatter at the caller’s unit', () => {
    expect(formatTrendHeadline('volume', 10000, 'kg')).toBe('10000.00 kg');
    expect(formatTrendHeadline('volume', 10000, 'lb')).not.toBe('10000.00 kg');
  });

  it('formats a set count as a whole number with a correctly pluralised noun', () => {
    expect(formatTrendHeadline('sets', 14, 'kg')).toBe('14 sets');
    expect(formatTrendHeadline('sets', 1, 'kg')).toBe('1 set');
  });

  it('formats a workout count as a whole number with a correctly pluralised noun', () => {
    expect(formatTrendHeadline('workouts', 3, 'kg')).toBe('3 workouts');
    expect(formatTrendHeadline('workouts', 1, 'kg')).toBe('1 workout');
  });
});

describe('formatTrendDelta', () => {
  it('renders an improving delta with an upward glyph and the pinned copy', () => {
    expect(formatTrendDelta({ kind: 'improving', percent: 24.6 })).toEqual({
      glyph: 'arrow-up',
      improving: true,
      text: '25% vs previous 7 days',
    });
  });

  it('renders a declining delta with a downward glyph and the same copy', () => {
    expect(formatTrendDelta({ kind: 'declining', percent: 12.4 })).toEqual({
      glyph: 'arrow-down',
      improving: false,
      text: '12% vs previous 7 days',
    });
  });

  it('renders nothing at all for the unchanged and not-comparable branches', () => {
    expect(formatTrendDelta({ kind: 'unchanged' })).toBeNull();
    expect(formatTrendDelta({ kind: 'not-comparable' })).toBeNull();
  });

  it('renders nothing when a real change rounds away to zero percent', () => {
    expect(formatTrendDelta({ kind: 'improving', percent: 0.4 })).toBeNull();
    expect(formatTrendDelta({ kind: 'declining', percent: 0.2 })).toBeNull();
  });

  it('never implies a calendar week', () => {
    const text = formatTrendDelta({ kind: 'improving', percent: 20 })?.text ?? '';
    expect(text.toLowerCase()).not.toContain('last week');
    expect(text.toLowerCase()).not.toContain('this week');
  });
});

describe('HistoryTrendCardView', () => {
  it('renders the heading, the metric switch, the headline and the chart', () => {
    const element = HistoryTrendCardView(baseProps());
    expect(element).not.toBeNull();

    const texts = collectText(element);
    expect(texts).toContain('Trends');
    expect(texts).toContain('10000.00 kg');

    expect(findAll(element, isByType(SegmentedChipRow))).toHaveLength(1);
    const [chart] = findAll(element, isByType(TrendChart));
    expect(chart.props.points).toHaveLength(2);
    expect(chart.props.width).toBe(320);
  });

  it('maps each bucket onto a pre-formatted point rather than leaving the chart to format', () => {
    const element = HistoryTrendCardView(baseProps());
    const [chart] = findAll(element, isByType(TrendChart));
    const points = chart.props.points as { key: string; value: number; valueLabel: string; dateLabel: string }[];

    expect(points[0]).toEqual({ key: '2026-06-01', value: 8000, valueLabel: '8000.00 kg', dateLabel: '1 Jun' });
    expect(points[1].valueLabel).toBe('10000.00 kg');
  });

  it('draws a declining delta in the muted foreground and never in the destructive colour', () => {
    const element = HistoryTrendCardView(baseProps({ result: result({ delta: { kind: 'declining', percent: 12 } }) }));

    const texts = collectText(element);
    expect(texts).toContain('12% vs previous 7 days');

    const muted = findAll(element, (node) => typeof node.props?.className === 'string' && (node.props.className as string).includes('text-foreground-muted'));
    expect(muted.length).toBeGreaterThan(0);

    const destructive = findAll(
      element,
      (node) =>
        (typeof node.props?.className === 'string' && (node.props.className as string).includes('destructive')) ||
        node.props?.color === 'destructive',
    );
    expect(destructive).toHaveLength(0);
  });

  it('renders no delta chip at all when the change is zero or cannot honestly be compared', () => {
    for (const delta of [{ kind: 'unchanged' } as const, { kind: 'not-comparable' } as const]) {
      const element = HistoryTrendCardView(baseProps({ result: result({ delta }) }));
      const texts = collectText(element).join(' ');

      expect(texts).not.toContain('vs previous 7 days');
      expect(texts).not.toContain('0%');
      expect(texts).not.toContain('—');
    }
  });

  it('renders the heading, switch and headline but no delta chip with a single bucket of data', () => {
    const element = HistoryTrendCardView(
      baseProps({
        result: { points: [bucket(0, 8000)], currentValue: 8000, delta: { kind: 'not-comparable' } },
      }),
    );

    const texts = collectText(element);
    expect(texts).toContain('Trends');
    expect(texts).toContain('8000.00 kg');
    expect(texts.join(' ')).not.toContain('vs previous 7 days');
    expect(findAll(element, isByType(TrendChart))).toHaveLength(1);
  });

  it('renders nothing at all when the read has not landed or failed', () => {
    expect(HistoryTrendCardView(baseProps({ result: null }))).toBeNull();
  });

  it('renders nothing at all when the window holds no qualifying bucket, rather than an empty card', () => {
    const element = HistoryTrendCardView(
      baseProps({ result: { points: [], currentValue: null, delta: { kind: 'not-comparable' } } }),
    );

    expect(element).toBeNull();
  });

  it('switches metric through the shared chip row over the three trend metrics', () => {
    const onSelectMetric = jest.fn();
    const element = HistoryTrendCardView(baseProps({ metric: 'sets', onSelectMetric }));
    const [chipRow] = findAll(element, isByType(SegmentedChipRow));

    expect((chipRow.props.options as { id: string }[]).map((option) => option.id)).toEqual(['volume', 'sets', 'workouts']);
    expect(chipRow.props.selectedId).toBe('sets');
    expect(typeof chipRow.props.groupLabel).toBe('string');

    (chipRow.props.onSelect as (id: string) => void)('workouts');
    expect(onSelectMetric).toHaveBeenCalledWith('workouts');
  });

  it('formats the headline and the point labels for the selected metric, not always as a weight', () => {
    const element = HistoryTrendCardView(
      baseProps({ metric: 'workouts', result: { points: [bucket(0, 1), bucket(1, 3)], currentValue: 3, delta: { kind: 'unchanged' } } }),
    );
    const texts = collectText(element);
    const [chart] = findAll(element, isByType(TrendChart));

    expect(texts).toContain('3 workouts');
    expect((chart.props.points as { valueLabel: string }[]).map((point) => point.valueLabel)).toEqual([
      '1 workout',
      '3 workouts',
    ]);
  });
});
