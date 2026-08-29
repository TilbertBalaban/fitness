// The shipped exercise-performance.test.ts convention: both module chains reach ESM dists Jest
// cannot parse (@powersync/shared-internals, better-auth/react), so both are mocked before the
// screen module is imported. WINDOWS #22/#33.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { E1RM_MAX_VALID_REPS } from '@fitness/pr-rules';
import { deriveRecordsScreenState, RecordsScreenView, type RecordsScreenViewProps } from '../records';
import { RecordRow } from '@/components/RecordRow';
import { SegmentedChipRow } from '@/components/SegmentedChipRow';
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

// element.type identity survives a no-renderer walk even where a child component is an unexpanded
// JSX element — the same technique WorkoutSummary.test.tsx and workout.test.tsx each already carry.
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

function renderView(overrides: Partial<RecordsScreenViewProps> = {}) {
  return RecordsScreenView({
    state: 'ready',
    rows: [recordRow()],
    prType: 'heaviest_weight',
    weightUnit: 'kg',
    colors: COLORS,
    onSelectMetric: jest.fn(),
    onRowPress: jest.fn(),
    onEndReached: jest.fn(),
    ...overrides,
  });
}

describe('deriveRecordsScreenState', () => {
  const readyPage = { rows: [recordRow()], nextCursor: null };
  const emptyPage = { rows: [], nextCursor: null };

  it('returns a distinct value for each of failed, not-yet-landed, landed-and-empty, and landed-with-rows', () => {
    const failed = deriveRecordsScreenState({ failed: true, page: null });
    const loading = deriveRecordsScreenState({ failed: false, page: null });
    const empty = deriveRecordsScreenState({ failed: false, page: emptyPage });
    const ready = deriveRecordsScreenState({ failed: false, page: readyPage });

    expect(new Set([failed, loading, empty, ready]).size).toBe(4);
    expect(failed).toBe('error');
    expect(loading).toBe('loading');
    expect(empty).toBe('empty');
    expect(ready).toBe('ready');
  });

  it('error beats a landed page', () => {
    expect(deriveRecordsScreenState({ failed: true, page: readyPage })).toBe('error');
  });

  // A read that has not landed is not an absence of records; reporting it as empty would tell the
  // lifter their records are gone while they are still being read.
  it('never reports a not-yet-landed read as empty', () => {
    expect(deriveRecordsScreenState({ failed: false, page: null })).not.toBe('empty');
  });
});

describe('RecordsScreenView — the metric switch', () => {
  it('renders one chip row over all four record metrics, with a group label naming the dimension', () => {
    const [chipRow] = findByType(renderView(), SegmentedChipRow);

    expect(chipRow.groupLabel).toBe('Record metric');
    expect((chipRow.options as { id: string }[]).map((option) => option.id)).toEqual([
      'heaviest_weight',
      'best_e1rm',
      'most_reps_at_weight',
      'best_set_volume',
    ]);
    expect(chipRow.selectedId).toBe('heaviest_weight');
  });

  // The single most important detail on this screen: switching metrics routinely empties the list
  // while another metric has rows, and hiding the switch would strand the lifter there.
  it('keeps the switch visible in the empty state so a lifter can switch back', () => {
    const chipRows = findByType(renderView({ state: 'empty', rows: [] }), SegmentedChipRow);

    expect(chipRows).toHaveLength(1);
  });
});

describe('RecordsScreenView — empty state (per selected metric)', () => {
  it('names the selected metric in the heading and uses the shared body copy', () => {
    const text = findText(renderView({ state: 'empty', rows: [], prType: 'most_reps_at_weight' })).join(' ');

    expect(text).toContain('No Most Reps records yet');
    expect(text).toContain('Log a set on any exercise and your first record lands here.');
  });

  it('gives the estimate metric its own body copy, naming the rep cap from the imported constant', () => {
    const text = findText(renderView({ state: 'empty', rows: [], prType: 'best_e1rm' })).join(' ');

    expect(text).toContain('No Est. 1RM records yet');
    expect(text).toContain(`Estimated 1RM is only shown for sets of ${E1RM_MAX_VALID_REPS} reps or fewer.`);
    expect(text).not.toContain('Log a set on any exercise and your first record lands here.');
  });
});

describe('RecordsScreenView — error state', () => {
  it('renders the shipped error pattern with this screen’s own subject', () => {
    const text = findText(renderView({ state: 'error', rows: [] })).join(' ');

    expect(text).toContain("Records couldn't load");
    expect(text).toContain('Restart the app to try again. Your programs and history are safe.');
  });
});

describe('RecordsScreenView — loading state', () => {
  it('renders the shipped surface-coloured skeleton rows and no spinner', () => {
    const text = findText(renderView({ state: 'loading', rows: [] })).join(' ');

    expect(text).not.toContain("Records couldn't load");
    expect(text).not.toContain('records yet');
  });
});

type RenderItem = (info: { item: RecordListRow }) => ReactNode;

function renderedRowProps(view: ReactNode, rows: RecordListRow[]): Record<string, unknown>[] {
  const [list] = findByType(view, FlashList);
  const renderItem = list.renderItem as RenderItem;
  return rows.flatMap((row) => findByType(renderItem({ item: row }), RecordRow));
}

describe('RecordsScreenView — populated', () => {
  it('renders the screen title and hands the list exactly the rows it was given', () => {
    const view = renderView();

    expect(findText(view).join(' ')).toContain('Records');
    expect((findByType(view, FlashList)[0].data as RecordListRow[]).map((row) => row.id)).toEqual(['pr-1']);
  });

  it('formats each row’s value in that metric’s own units, not always as a weight', () => {
    const rows = [recordRow({ prType: 'most_reps_at_weight', value: '12.000', setWeightKg: '100.000' })];
    const view = renderView({ rows, prType: 'most_reps_at_weight' });

    const [rowProps] = renderedRowProps(view, rows);

    expect(rowProps.valueLabel).toBe('12 reps @ 100.00 kg');
    expect(rowProps.metricLabel).toBe('Most Reps');
  });

  it('renders a weight metric through the shared weight formatter at the caller’s unit', () => {
    const rows = [recordRow()];
    const view = renderView({ rows, weightUnit: 'kg' });

    expect(renderedRowProps(view, rows)[0].valueLabel).toBe('102.50 kg');
  });

  it('pressing a row asks for that record’s exercise', () => {
    const onRowPress = jest.fn();
    const rows = [recordRow()];
    const view = renderView({ rows, onRowPress });

    (renderedRowProps(view, rows)[0].onPress as () => void)();

    expect(onRowPress).toHaveBeenCalledWith(rows[0]);
  });
});
