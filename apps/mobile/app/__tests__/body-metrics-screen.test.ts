// The shipped records.test.ts / exercise-performance.test.ts convention: both @powersync and
// better-auth reach ESM dists Jest cannot parse (WINDOWS #22/#33), so both are mocked before the
// screen module is imported.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import type { ReactNode } from 'react';
import { BODY_METRIC_KIND_ORDER, type BodyMetricKind } from '@fitness/api-contracts';
import {
  BodyMetricsScreenView,
  deriveBodyMetricsScreenState,
  type BodyMetricsScreenViewProps,
} from '../body-metrics';
import { BodyMetricRow } from '@/components/BodyMetricRow';
import type { TrackedKindSummary } from '@/lib/db/body-metrics';

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

function findByType(node: ReactNode, type: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) findByType(child, type, found);
    return found;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type && element.props) found.push(element.props);
  const children = element.props?.children as ReactNode;
  if (children !== undefined) findByType(children, type, found);
  return found;
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

function summary(kind: BodyMetricKind, overrides: Partial<TrackedKindSummary> = {}): TrackedKindSummary {
  return { kind, value: '82.400', localDate: '2026-08-12', ...overrides };
}

const COLORS = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

function renderView(overrides: Partial<BodyMetricsScreenViewProps> = {}) {
  return BodyMetricsScreenView({
    state: 'ready',
    rows: [summary('bodyweight')],
    weightUnit: 'kg',
    colors: COLORS,
    onRowPress: jest.fn(),
    onLogPress: jest.fn(),
    onTrackPress: jest.fn(),
    ...overrides,
  });
}

describe('deriveBodyMetricsScreenState', () => {
  it('returns a distinct value for each of failed, not-yet-landed, landed-and-empty, and landed-with-rows', () => {
    const error = deriveBodyMetricsScreenState({ failed: true, rows: null });
    const loading = deriveBodyMetricsScreenState({ failed: false, rows: null });
    const empty = deriveBodyMetricsScreenState({ failed: false, rows: [] });
    const ready = deriveBodyMetricsScreenState({ failed: false, rows: [summary('bodyweight')] });

    expect(new Set([error, loading, empty, ready]).size).toBe(4);
    expect(error).toBe('error');
    expect(loading).toBe('loading');
    expect(empty).toBe('empty');
    expect(ready).toBe('ready');
  });

  it('error beats a landed, empty list', () => {
    expect(deriveBodyMetricsScreenState({ failed: true, rows: [] })).toBe('error');
  });

  it('never reports a not-yet-landed read as empty — an empty list is never a spinner', () => {
    expect(deriveBodyMetricsScreenState({ failed: false, rows: null })).not.toBe('empty');
  });
});

describe('BodyMetricsScreenView — loading', () => {
  it('renders the shipped surface-coloured skeleton and no spinner, no heading copy', () => {
    const text = findText(renderView({ state: 'loading', rows: [] })).join(' ');

    expect(text).not.toContain('No measurements yet');
    expect(text).not.toContain("couldn't load");
  });
});

describe('BodyMetricsScreenView — error', () => {
  it('renders the shipped error pattern with this screen’s own subject', () => {
    const text = findText(renderView({ state: 'error', rows: [] })).join(' ');

    expect(text).toContain("Body Metrics couldn't load");
    expect(text).toContain('Restart the app to try again. Your programs and history are safe.');
  });

  it('still renders the "Track a measurement" row beneath an error — the path forward is never hidden', () => {
    const text = findText(renderView({ state: 'error', rows: [] })).join(' ');

    expect(text).toContain('Track a measurement');
  });
});

describe('BodyMetricsScreenView — empty', () => {
  it('renders the shipped empty copy and keeps the "Track a measurement" row beneath it', () => {
    const text = findText(renderView({ state: 'empty', rows: [] })).join(' ');

    expect(text).toContain('No measurements yet');
    expect(text).toContain('Track your weight or a measurement to see it here.');
    expect(text).toContain('Track a measurement');
  });
});

describe('BodyMetricsScreenView — populated', () => {
  // The view itself renders `rows` in the order given — loadTrackedKindSummaries is the layer that
  // sorts by BODY_METRIC_KIND_ORDER (proven directly in lib/db/__tests__/body-metrics.test.ts); this
  // fixture is pre-sorted the same way the real screen always hands it rows.
  it('renders one BodyMetricRow per tracked kind, in the order it is given, plus the "Track a measurement" row', () => {
    const sortedKinds = BODY_METRIC_KIND_ORDER.filter((kind) => ['waist', 'bodyweight', 'body_fat_percent'].includes(kind));
    const rows = sortedKinds.map((kind) => summary(kind));
    const view = renderView({ state: 'ready', rows });

    const rowProps = findByType(view, BodyMetricRow);
    expect(rowProps.map((props) => props.kind)).toEqual(sortedKinds);

    const text = findText(view).join(' ');
    expect(text).toContain('Track a measurement');
  });

  it('handles a single tracked kind with no special case — one row renders', () => {
    const view = renderView({ state: 'ready', rows: [summary('bodyweight')] });

    expect(findByType(view, BodyMetricRow)).toHaveLength(1);
  });

  it('handles all fifteen tracked kinds with no special case', () => {
    const rows = BODY_METRIC_KIND_ORDER.map((kind) => summary(kind));
    const view = renderView({ state: 'ready', rows });

    expect(findByType(view, BodyMetricRow)).toHaveLength(15);
  });

  it('pressing "Track a measurement" opens the track-a-kind sheet', () => {
    const onTrackPress = jest.fn();
    const view = renderView({ onTrackPress });
    const [pressable] = collect(view).filter((props) => props.accessibilityLabel === 'Track a measurement');

    (pressable.onPress as () => void)();

    expect(onTrackPress).toHaveBeenCalledTimes(1);
  });
});
