// The shipped exercise-performance.test.ts convention: both module chains reach ESM dists Jest
// cannot parse (@powersync/shared-internals, better-auth/react), so both are mocked before the
// screen module is imported. WINDOWS #22/#33.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../lib/auth-client', () => ({ authClient: { useSession: jest.fn(() => ({ data: null })) } }));

import type { ReactNode } from 'react';
import type { MuscleGroupId } from '@fitness/api-contracts';
import {
  deriveMuscleMapScreenState,
  MuscleMapScreenView,
  type MuscleMapRowViewModel,
  type MuscleMapScreenViewProps,
} from '../muscle-map';
import { SegmentedChipRow } from '@/components/SegmentedChipRow';
import { MuscleHeatmap } from '@/components/MuscleHeatmap';
import type { MuscleMapWindowData } from '@/lib/db/muscle-volume-query';

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

function windowData(overrides: Partial<MuscleMapWindowData> = {}): MuscleMapWindowData {
  return {
    points: [
      {
        muscleGroupId: 'chest' as MuscleGroupId,
        side: 'front',
        trainingVolumeKg: 100,
        weightedSets: 5,
        setCount: 5,
        relativeIntensity: 1,
      },
    ],
    muscleNames: new Map([['chest', 'Chest']]),
    overlaySessionCount: 0,
    watermarkDate: null,
    ...overrides,
  };
}

describe('deriveMuscleMapScreenState', () => {
  it('returns error when the read failed, whatever else landed', () => {
    expect(deriveMuscleMapScreenState({ failed: true, data: windowData(), hasHistory: true })).toBe('error');
  });

  it('returns loading while either signal has not landed', () => {
    expect(deriveMuscleMapScreenState({ failed: false, data: null, hasHistory: true })).toBe('loading');
    expect(deriveMuscleMapScreenState({ failed: false, data: windowData(), hasHistory: null })).toBe('loading');
  });

  it('never reports a not-yet-landed read as empty', () => {
    const state = deriveMuscleMapScreenState({ failed: false, data: null, hasHistory: null });
    expect(state).not.toBe('no-history');
    expect(state).not.toBe('nothing-in-window');
  });

  it('returns no-history when no completed session exists at all, regardless of window points', () => {
    expect(deriveMuscleMapScreenState({ failed: false, data: windowData({ points: [] }), hasHistory: false })).toBe('no-history');
  });

  it('returns nothing-in-window (not no-history) when history exists but nothing was trained in the window', () => {
    const untrainedPoints = windowData({
      points: [
        { muscleGroupId: 'chest' as MuscleGroupId, side: 'front', trainingVolumeKg: null, weightedSets: null, setCount: 0, relativeIntensity: null },
      ],
    });
    expect(deriveMuscleMapScreenState({ failed: false, data: untrainedPoints, hasHistory: true })).toBe('nothing-in-window');
  });

  it('returns ready when history exists and at least one muscle is trained in the window', () => {
    expect(deriveMuscleMapScreenState({ failed: false, data: windowData(), hasHistory: true })).toBe('ready');
  });
});

function row(overrides: Partial<MuscleMapRowViewModel> = {}): MuscleMapRowViewModel {
  return {
    muscleGroupId: 'chest',
    muscleName: 'Chest',
    point: { trainingVolumeKg: 100, setCount: 5, relativeIntensity: 1 },
    valueLabel: '100.00 kg',
    ...overrides,
  };
}

function baseViewProps(overrides: Partial<MuscleMapScreenViewProps> = {}): MuscleMapScreenViewProps {
  return {
    state: 'ready',
    windowId: '1w',
    onSelectWindow: jest.fn(),
    heatmapPoints: [],
    frontRows: [row()],
    backRows: [],
    overlaySessionCount: 0,
    colors: COLORS,
    frontWidth: 150,
    backWidth: 150,
    onMusclePress: jest.fn(),
    ...overrides,
  };
}

describe('MuscleMapScreenView — no-history state', () => {
  it('hides the window switch and both captions', () => {
    const view = MuscleMapScreenView(baseViewProps({ state: 'no-history' }));
    expect(findByType(view, SegmentedChipRow)).toHaveLength(0);
    const text = findText(view).join(' ');
    expect(text).not.toContain('Training Volume — includes secondary muscles');
  });

  it('renders the no-history heading and body', () => {
    const text = findText(MuscleMapScreenView(baseViewProps({ state: 'no-history' }))).join(' ');
    expect(text).toContain('No history to show');
    expect(text).toContain('Log a workout and your muscle map starts here.');
  });
});

describe('MuscleMapScreenView — nothing-in-window state', () => {
  it('keeps the window switch and captions visible', () => {
    expect(findByType(MuscleMapScreenView(baseViewProps({ state: 'nothing-in-window' })), SegmentedChipRow)).toHaveLength(1);
  });

  it('renders the nothing-logged banner naming the window label', () => {
    const text = findText(MuscleMapScreenView(baseViewProps({ state: 'nothing-in-window', windowId: '1m' }))).join(' ');
    expect(text).toContain('Nothing logged in the last 30 days');
    expect(text).toContain('Try a longer range.');
  });

  it('still renders the figures and row lists', () => {
    const view = MuscleMapScreenView(baseViewProps({ state: 'nothing-in-window' }));
    expect(findByType(view, MuscleHeatmap)).toHaveLength(1);
  });
});

describe('MuscleMapScreenView — loading state', () => {
  it('renders the window switch and captions immediately, with no spinner', () => {
    const view = MuscleMapScreenView(baseViewProps({ state: 'loading' }));
    expect(findByType(view, SegmentedChipRow)).toHaveLength(1);
    const text = findText(view).join(' ');
    expect(text).toContain('Training Volume — includes secondary muscles');
  });

  it('replaces the figures with surface-coloured blocks and renders no row list', () => {
    const view = MuscleMapScreenView(baseViewProps({ state: 'loading' }));
    expect(findByType(view, MuscleHeatmap)).toHaveLength(0);
  });
});

describe('MuscleMapScreenView — error state', () => {
  it('hides the switch, captions, figures and rows, and renders the shipped failure pattern', () => {
    const view = MuscleMapScreenView(baseViewProps({ state: 'error' }));
    expect(findByType(view, SegmentedChipRow)).toHaveLength(0);
    expect(findByType(view, MuscleHeatmap)).toHaveLength(0);
    const text = findText(view).join(' ');
    expect(text).toContain("Muscle map couldn't load");
    expect(text).toContain('Restart the app to try again. Your programs and history are safe.');
  });
});

describe('MuscleMapScreenView — ready state', () => {
  it('renders no banner and renders the figures and grouped row lists', () => {
    const view = MuscleMapScreenView(baseViewProps({ state: 'ready' }));
    const text = findText(view).join(' ');
    expect(text).not.toContain('Nothing logged in');
    expect(text).toContain('Front');
    expect(text).toContain('Back');
    expect(findByType(view, MuscleHeatmap)).toHaveLength(1);
  });

  it('renders the Training Volume disambiguation caption whenever the switch does', () => {
    const text = findText(MuscleMapScreenView(baseViewProps({ state: 'ready' }))).join(' ');
    expect(text).toContain("This is different from 'Muscles trained' on Home.");
  });

  it('hides the stale-rollup caption at zero overlay sessions', () => {
    const text = findText(MuscleMapScreenView(baseViewProps({ state: 'ready', overlaySessionCount: 0 }))).join(' ');
    expect(text).not.toContain('not yet reflected on the server');
  });

  it('shows the stale-rollup caption with the real count when it is non-zero', () => {
    const text = findText(MuscleMapScreenView(baseViewProps({ state: 'ready', overlaySessionCount: 2 }))).join(' ');
    expect(text).toContain('Includes 2 sessions not yet reflected on the server.');
  });
});
