// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the host module so
// its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/db/programs/next-up-query', () => ({ loadNextUp: jest.fn() }));

import type { ReactElement, ReactNode } from 'react';
import { WIDGET_KINDS } from '@fitness/api-contracts';
import { DashboardWidgetHost, resolveDashboardWidgets, readWeeklyProgress, type KnownWidget } from '../DashboardWidgetHost';
import type { DashboardWidgetRow } from '../../lib/db/dashboard-widgets';
import type { WeeklyProgressData } from '../../lib/db/weekly-progress-query';

function row(id: string, widgetKind: string, position: number, enabled = true): DashboardWidgetRow {
  return { id, widgetKind, position, enabled };
}

describe('resolveDashboardWidgets', () => {
  it('excludes a row whose widget_kind is outside WIDGET_KINDS, without raising', () => {
    expect(() => resolveDashboardWidgets([row('w1', 'not_a_real_widget', 1024)])).not.toThrow();
    expect(resolveDashboardWidgets([row('w1', 'not_a_real_widget', 1024)])).toEqual([]);
  });

  it('returns an empty list when every row is an unrecognised kind, without raising', () => {
    const rows = [row('w1', 'not_a_real_widget', 1024), row('w2', 'also_not_real', 2048)];
    expect(() => resolveDashboardWidgets(rows)).not.toThrow();
    expect(resolveDashboardWidgets(rows)).toEqual([]);
  });

  it('excludes a disabled row', () => {
    expect(resolveDashboardWidgets([row('w1', 'next_up', 1024, false)])).toEqual([]);
  });

  it('sorts by position, ties broken by id', () => {
    const rows = [row('b', 'weekly_progress', 1024), row('a', 'next_up', 1024)];
    expect(resolveDashboardWidgets(rows).map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('returns a known kind untouched', () => {
    expect(resolveDashboardWidgets([row('w1', 'next_up', 1024)])).toEqual([{ id: 'w1', kind: 'next_up', position: 1024 }]);
  });
});

// DashboardWidgetHost itself is hook-free — a direct call returns a Fragment of unexecuted JSX
// element descriptors (each widget component's own hooks never run without a renderer), the same
// direct-invocation technique DayDeck.test.tsx/SwapSuggestionList.test.tsx already use in this repo.
type AnyElement = ReactElement<Record<string, unknown>>;

function fragmentChildren(node: ReactNode): AnyElement[] {
  if (node === null || node === undefined) return [];
  const element = node as AnyElement;
  const children = element.props?.children;
  if (Array.isArray(children)) return children.filter((child): child is AnyElement => child !== null);
  return [];
}

describe('DashboardWidgetHost', () => {
  it('renders each of the six known kinds without raising when handed a row for it', () => {
    const widgets: KnownWidget[] = WIDGET_KINDS.map((kind, index) => ({ id: `w${index}`, kind, position: index * 1024 }));

    let element: ReturnType<typeof DashboardWidgetHost> | undefined;
    expect(() => {
      element = DashboardWidgetHost({ widgets, userId: 'u1' });
    }).not.toThrow();

    const children = fragmentChildren(element);
    expect(children).toHaveLength(WIDGET_KINDS.length);
    expect(children.every((child) => typeof child.type === 'function')).toBe(true);
  });

  it('renders nothing for an already-filtered empty widget list', () => {
    const element = DashboardWidgetHost({ widgets: [], userId: 'u1' });
    expect(fragmentChildren(element)).toEqual([]);
  });
});

describe('readWeeklyProgress', () => {
  const TODAY = '2026-08-29';

  const TRAINED: WeeklyProgressData = {
    sessions: [
      {
        sessionId: 's-1',
        localDate: '2026-08-27',
        exercises: [
          {
            exerciseId: 'ex-1',
            primaryMuscleGroupIds: ['mg-chest'],
            sets: [
              { id: 'ls-1', setType: 'normal', completed: true, parentSetId: null },
              { id: 'ls-2', setType: 'warmup', completed: true, parentSetId: null },
              { id: 'ls-3', setType: 'normal', completed: true, parentSetId: 'ls-1' },
            ],
          },
        ],
      },
    ],
    programTarget: { days: [{ slots: [{ exerciseId: 'ex-1', targetSets: 4, primaryMuscleGroupIds: ['mg-chest'] }] }] },
  };

  it('derives the three tracks from the loaded rows, counting a drop set as one set', async () => {
    const load = jest.fn().mockResolvedValue(TRAINED);

    const result = await readWeeklyProgress('user-1', TODAY, load);

    expect(result).toEqual({
      data: {
        hasActivity: true,
        tracks: [
          { id: 'sets', achieved: 1, target: 4 },
          { id: 'exercises', achieved: 1, target: 1 },
          { id: 'muscles', achieved: 1, target: 1 },
        ],
      },
    });
  });

  it('passes the signed-in user and the captured calendar day into the read', async () => {
    const load = jest.fn().mockResolvedValue(TRAINED);

    await readWeeklyProgress('user-1', TODAY, load);

    expect(load).toHaveBeenCalledWith({ userId: 'user-1', todayLocalDate: TODAY });
  });

  it('carries a null target through as a track with no denominator, never an invented one', async () => {
    const load = jest.fn().mockResolvedValue({ ...TRAINED, programTarget: null });

    const result = await readWeeklyProgress('user-1', TODAY, load);

    expect(result).toEqual({
      data: {
        hasActivity: true,
        tracks: [
          { id: 'sets', achieved: 1, target: null },
          { id: 'exercises', achieved: 1, target: null },
          { id: 'muscles', achieved: 1, target: null },
        ],
      },
    });
  });

  it('reports no activity rather than three zeroed tracks when nothing was logged', async () => {
    const load = jest.fn().mockResolvedValue({ sessions: [], programTarget: TRAINED.programTarget });

    expect(await readWeeklyProgress('user-1', TODAY, load)).toEqual({ data: { hasActivity: false, tracks: [] } });
  });

  it('measures a rolling window ending today — a session eight days back drops out', async () => {
    const stale: WeeklyProgressData = {
      ...TRAINED,
      sessions: [{ ...TRAINED.sessions[0], localDate: '2026-08-21' }],
    };
    const load = jest.fn().mockResolvedValue(stale);

    expect(await readWeeklyProgress('user-1', TODAY, load)).toEqual({ data: { hasActivity: false, tracks: [] } });
  });

  it('reports a failure instead of throwing, so a focus never crashes the tab', async () => {
    const load = jest.fn().mockRejectedValue(new Error('database locked'));

    expect(await readWeeklyProgress('user-1', TODAY, load)).toEqual({ failed: true });
  });

  it('still reads with a null user, so the signed-out empty state is derived not assumed', async () => {
    const load = jest.fn().mockResolvedValue({ sessions: [], programTarget: null });

    await readWeeklyProgress(null, TODAY, load);

    expect(load).toHaveBeenCalledWith({ userId: null, todayLocalDate: TODAY });
  });
});
