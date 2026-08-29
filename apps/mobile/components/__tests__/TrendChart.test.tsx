import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { Circle, Path } from 'react-native-svg';
import {
  MAX_POINT_MARKERS,
  MIN_CHART_WIDTH,
  resolveChartWidth,
  TrendChart,
  trendChartSummary,
  type TrendChartProps,
  type TrendPoint,
} from '../TrendChart';

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

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function point(index: number, value: number): TrendPoint {
  return { key: `s${index}`, value, valueLabel: `${value} kg`, dateLabel: `${index + 1} Aug` };
}

function baseProps(overrides: Partial<TrendChartProps> = {}): TrendChartProps {
  return {
    points: [point(0, 100), point(1, 105), point(2, 102.5)],
    colors: COLORS,
    width: 300,
    metricLabel: 'Heaviest weight',
    rangeLabel: 'Last 3 months',
    ...overrides,
  };
}

describe('resolveChartWidth', () => {
  it('subtracts the two screen paddings and the two card paddings from the window width', () => {
    expect(resolveChartWidth(1200)).toBe(1200 - 80);
  });

  it('floors at MIN_CHART_WIDTH rather than returning a squeezed or negative width', () => {
    expect(resolveChartWidth(200)).toBe(MIN_CHART_WIDTH);
    expect(resolveChartWidth(0)).toBe(MIN_CHART_WIDTH);
    expect(resolveChartWidth(Number.NaN)).toBe(MIN_CHART_WIDTH);
  });
});

describe('trendChartSummary', () => {
  it('announces the metric, range, point count, first and last points, and the value range', () => {
    expect(trendChartSummary(baseProps())).toBe(
      'Heaviest weight over Last 3 months. 3 points. From 100 kg on 1 Aug to 102.5 kg on 3 Aug. Lowest 100 kg, highest 105 kg.',
    );
  });

  it('uses the one-point sentence for a single point', () => {
    expect(trendChartSummary(baseProps({ points: [point(0, 100)] }))).toBe(
      'Heaviest weight over Last 3 months. One point: 100 kg on 1 Aug.',
    );
  });
});

describe('TrendChart', () => {
  it('returns null for an empty points array rather than an empty frame', () => {
    expect(TrendChart(baseProps({ points: [] }))).toBeNull();
  });

  it('announces itself once as a sentence and hides every shape from assistive technology', () => {
    const result = TrendChart(baseProps());
    const paths = findByType(result, Path);
    const circles = findByType(result, Circle);

    expect(paths.length).toBeGreaterThan(0);
    for (const shape of [...paths, ...circles]) {
      expect(shape.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(shape.props.accessibilityElementsHidden).toBe(true);
    }
  });

  it('renders every number and date as an ordinary text node, never inside the canvas', () => {
    const result = TrendChart(baseProps());
    const texts = findByType(result, Text).map((element) => element.props.children);

    expect(texts).toContain('100 kg – 105 kg');
    expect(texts).toContain('1 Aug');
    expect(texts).toContain('3 Aug');
  });

  it('renders one circle and one fact line for a single point, with no value-range caption', () => {
    const result = TrendChart(baseProps({ points: [point(0, 100)] }));
    const circles = findByType(result, Circle);
    const texts = findByType(result, Text).map((element) => element.props.children);

    expect(circles).toHaveLength(1);
    expect(texts).toEqual(['100 kg · 1 Aug']);
  });

  it('drops per-point markers above MAX_POINT_MARKERS but always keeps the final one', () => {
    const many = Array.from({ length: MAX_POINT_MARKERS + 5 }, (_, index) => point(index, 100 + index));
    const result = TrendChart(baseProps({ points: many }));

    expect(findByType(result, Circle)).toHaveLength(1);
  });

  it('renders one marker per point at or below MAX_POINT_MARKERS', () => {
    const some = Array.from({ length: MAX_POINT_MARKERS }, (_, index) => point(index, 100 + index));
    const result = TrendChart(baseProps({ points: some }));

    expect(findByType(result, Circle)).toHaveLength(MAX_POINT_MARKERS);
  });
});
