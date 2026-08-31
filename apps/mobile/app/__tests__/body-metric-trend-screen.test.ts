// The shipped records.test.ts / exercise-performance.test.ts convention: both @powersync and
// better-auth reach ESM dists Jest cannot parse (WINDOWS #22/#33), so both are mocked before the
// screen module is imported.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import type { ReactElement, ReactNode } from 'react';
import {
  BodyMetricTrendView,
  deriveBodyMetricTrendState,
  type BodyMetricTrendViewProps,
} from '../body-metric-trend';
import { MetricEntryRow } from '@/components/MetricEntryRow';
import { SegmentedChipRow } from '@/components/SegmentedChipRow';
import { TrendChart } from '@/components/TrendChart';

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

function renderView(overrides: Partial<BodyMetricTrendViewProps> = {}) {
  return BodyMetricTrendView({
    state: 'ready',
    kindLabel: 'Weight',
    window: '3m',
    onSelectWindow: jest.fn(),
    points: [{ key: '2026-08-10', value: 80, valueLabel: '80.00 kg', dateLabel: '10 Aug' }],
    latest: { key: '2026-08-10', value: 80, valueLabel: '80.00 kg', dateLabel: '10 Aug' },
    entries: [],
    onEntryPress: jest.fn(),
    colors: COLORS,
    chartWidth: 320,
    onLogPress: jest.fn(),
    ...overrides,
  });
}

describe('deriveBodyMetricTrendState', () => {
  it('returns a distinct value for each of the five cases', () => {
    const error = deriveBodyMetricTrendState({ failed: true, allPoints: null, windowedPointCount: 0 });
    const loading = deriveBodyMetricTrendState({ failed: false, allPoints: null, windowedPointCount: 0 });
    const emptyKind = deriveBodyMetricTrendState({ failed: false, allPoints: [], windowedPointCount: 0 });
    const emptyWindow = deriveBodyMetricTrendState({
      failed: false,
      allPoints: [{ date: '2026-01-01', value: '1' }],
      windowedPointCount: 0,
    });
    const ready = deriveBodyMetricTrendState({
      failed: false,
      allPoints: [{ date: '2026-01-01', value: '1' }],
      windowedPointCount: 1,
    });

    expect(new Set([error, loading, emptyKind, emptyWindow, ready]).size).toBe(5);
    expect(error).toBe('error');
    expect(loading).toBe('loading');
    expect(emptyKind).toBe('empty-kind');
    expect(emptyWindow).toBe('empty-window');
    expect(ready).toBe('ready');
  });

  it('error beats every other signal, including a landed populated read', () => {
    expect(
      deriveBodyMetricTrendState({ failed: true, allPoints: [{ date: '2026-01-01', value: '1' }], windowedPointCount: 1 }),
    ).toBe('error');
  });

  it('never reports a not-yet-landed read as empty-kind — a null read is loading, not empty', () => {
    expect(deriveBodyMetricTrendState({ failed: false, allPoints: null, windowedPointCount: 0 })).not.toBe('empty-kind');
  });

  it('distinguishes no-entries-at-all from entries-outside-the-window — the two call for opposite remedies', () => {
    const emptyKind = deriveBodyMetricTrendState({ failed: false, allPoints: [], windowedPointCount: 0 });
    const emptyWindow = deriveBodyMetricTrendState({
      failed: false,
      allPoints: [{ date: '2026-01-01', value: '1' }],
      windowedPointCount: 0,
    });
    expect(emptyKind).not.toBe(emptyWindow);
  });
});

describe('BodyMetricTrendView — loading (R6)', () => {
  it('renders the surface-coloured block and no heading copy, and hides the window switch', () => {
    const element = renderView({ state: 'loading', points: [], latest: null });
    const texts = collectText(element).join(' ');

    expect(texts).not.toContain('logged yet');
    expect(texts).not.toContain("couldn't load");
    expect(findAll(element, isByType(SegmentedChipRow))).toHaveLength(0);
    expect(findAll(element, isByType(TrendChart))).toHaveLength(0);
  });
});

describe('BodyMetricTrendView — error', () => {
  it('renders the shipped error pattern and hides the window switch', () => {
    const element = renderView({ state: 'error', points: [], latest: null });
    const texts = collectText(element).join(' ');

    expect(texts).toContain("Trend couldn't load");
    expect(texts).toContain('Restart the app to try again. Your programs and history are safe.');
    expect(findAll(element, isByType(SegmentedChipRow))).toHaveLength(0);
  });
});

describe('BodyMetricTrendView — empty-kind', () => {
  it('renders "No {kindLabel} logged yet" and hides the window switch entirely', () => {
    const element = renderView({ state: 'empty-kind', kindLabel: 'Waist', points: [], latest: null });
    const texts = collectText(element).join(' ');

    expect(texts).toContain('No Waist logged yet');
    expect(texts).toContain('Log Waist and your trend starts here.');
    expect(findAll(element, isByType(SegmentedChipRow))).toHaveLength(0);
  });
});

describe('BodyMetricTrendView — empty-window', () => {
  it('renders "Nothing logged in the last {window}" and KEEPS the window switch visible', () => {
    const element = renderView({ state: 'empty-window', window: '1y', points: [], latest: null });
    const texts = collectText(element).join(' ');

    expect(texts).toContain('Nothing logged in the last 1 year');
    expect(texts).toContain('Try a longer range.');
    expect(findAll(element, isByType(SegmentedChipRow))).toHaveLength(1);
  });
});

describe('BodyMetricTrendView — ready', () => {
  it('renders the window switch, the headline figure, the chart and the log link', () => {
    const element = renderView({ state: 'ready' });
    const texts = collectText(element).join(' ');

    expect(findAll(element, isByType(SegmentedChipRow))).toHaveLength(1);
    expect(texts).toContain('80.00 kg');
    expect(texts).toContain('Latest · 10 Aug');
    expect(texts).toContain('+ Log Weight');

    const [chart] = findAll(element, isByType(TrendChart));
    expect(chart.props.points).toHaveLength(1);
    expect(chart.props.width).toBe(320);
  });

  it('offers every window as a chip, defaulting the selection to the supplied window prop', () => {
    const element = renderView({ state: 'ready', window: '1y' });
    const [chipRow] = findAll(element, isByType(SegmentedChipRow));

    expect((chipRow.props.options as { id: string; label: string }[]).map((option) => option.id)).toEqual([
      '1m',
      '3m',
      '1y',
      'all',
    ]);
    expect(chipRow.props.selectedId).toBe('1y');
  });

  it('wires the chip row selection straight to onSelectWindow', () => {
    const onSelectWindow = jest.fn();
    const element = renderView({ state: 'ready', onSelectWindow });
    const [chipRow] = findAll(element, isByType(SegmentedChipRow));

    (chipRow.props.onSelect as (id: string) => void)('1m');
    expect(onSelectWindow).toHaveBeenCalledWith('1m');
  });

  it('renders one MetricEntryRow per entry — a genuinely different list from the chart series (D-09)', () => {
    const onEntryPress = jest.fn();
    const element = renderView({
      state: 'ready',
      entries: [
        { id: 'e1', valueLabel: '80.20 kg', dateLabel: '10 Aug', timeLabel: '7:00 PM' },
        { id: 'e2', valueLabel: '80.00 kg', dateLabel: '10 Aug', timeLabel: '7:00 AM' },
      ],
      onEntryPress,
    });

    const rows = findAll(element, isByType(MetricEntryRow));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.props.valueLabel)).toEqual(['80.20 kg', '80.00 kg']);

    (rows[0].props.onPress as () => void)();
    expect(onEntryPress).toHaveBeenCalledWith('e1');
  });
});
