// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing WorkoutSummary.tsx,
// matching app/(tabs)/__tests__/workout.test.tsx's established rationale exactly. WorkoutSummary
// pulls this in transitively through log-set.ts/personal-record.ts/summary-query.ts even though
// none of these direct-invocation tests ever call WorkoutSummary (the stateful wrapper) itself.
jest.mock('../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));

import type { ReactElement, ReactNode } from 'react';
import { deriveRowDisplay, formatBreakdownLine, formatE1rm, WorkoutSummaryView, type WorkoutSummaryViewProps } from '../WorkoutSummary';
import { SetRowView } from '../SetRow';
import type { ExerciseBreakdown, SessionSummary } from '@/lib/db/summary-query';
import type { LoggedSetRow } from '@/lib/db/session-query';

const colors = { accent: 'rgb(37, 99, 235)', foregroundMuted: 'rgb(113, 113, 122)', surface: 'rgb(244, 244, 245)' };

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

type AnyElement = ReactElement<Record<string, unknown>>;

// Same technique app/(tabs)/__tests__/workout.test.tsx and components/__tests__/SetRow.test.tsx
// each already carry their own copy of — element.type identity survives a no-renderer walk even
// when a child component is passed as an unexpanded JSX element (unlike findText's props.children
// walk alone, which can't see past a component boundary at all).
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

function loggedSetRow(overrides: Partial<LoggedSetRow> = {}): LoggedSetRow {
  return {
    id: 'ls-1',
    sessionExerciseId: 'se-1',
    setIndex: 1,
    setType: 'normal',
    weightKg: '100.000',
    reps: 5,
    rir: 2,
    completed: true,
    loggedAt: '2026-08-24T09:05:00.000Z',
    notes: null,
    ...overrides,
  };
}

function breakdownRow(overrides: Partial<ExerciseBreakdown> = {}): ExerciseBreakdown {
  return {
    sessionExerciseId: 'se-1',
    exerciseId: 'ex-1',
    exerciseName: 'Bench Press',
    removedAt: null,
    completedSetCount: 3,
    // Phase 7 D-10: parent-only count, distinct from completedSetCount's child-inclusive total —
    // this fixture has no grouped rows so the two happen to match; tests that care about the
    // split override it explicitly.
    completedWorkingSetCount: 3,
    totalReps: 24,
    topWeightKg: '100.000',
    volumeKg: '2400.000',
    bestE1rmKg: '116.667',
    prTypes: [],
    completedSets: [],
    ...overrides,
  };
}

function summaryFixture(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session: { id: 's-1', startedAt: '2026-08-24T09:00:00.000Z', endedAt: '2026-08-24T10:00:00.000Z', pausedAt: null, accumulatedPausedSeconds: 0 },
    durationSeconds: 3600,
    musclesTrained: { primaryMuscles: [], secondaryMuscles: [] },
    breakdown: [breakdownRow()],
    personalRecordsBySetId: new Map(),
    ...overrides,
  };
}

function renderView(overrides: Partial<WorkoutSummaryViewProps> = {}) {
  return WorkoutSummaryView({
    summary: summaryFixture(),
    weightUnit: 'kg',
    colors,
    mode: 'summary-correction',
    expandedSessionExerciseId: null,
    editingField: null,
    onDone: jest.fn(),
    onEditPress: jest.fn(),
    onFieldPress: jest.fn(),
    onCheckmarkPress: jest.fn(),
    onKeypadPress: jest.fn(),
    onKeypadSubmit: jest.fn(),
    ...overrides,
  });
}

describe('formatBreakdownLine', () => {
  it('renders a compact sets/reps/weight/volume line', () => {
    const line = formatBreakdownLine(breakdownRow({ completedSetCount: 3, totalReps: 24, topWeightKg: '100.000', volumeKg: '2400.000' }), 'kg');
    expect(line).toContain('3 sets');
    expect(line).toContain('24 reps');
    expect(line).toContain('100.00 kg top');
    expect(line).toContain('2400.00 kg volume');
  });

  it('singularizes a one-set, one-rep row', () => {
    const line = formatBreakdownLine(breakdownRow({ completedSetCount: 1, totalReps: 1 }), 'kg');
    expect(line).toContain('1 set');
    expect(line).toContain('1 rep');
  });
});

describe('formatE1rm (D-31)', () => {
  it('returns the em dash for null', () => {
    expect(formatE1rm(null, 'kg')).toBe('—');
  });

  it('formats a real value with the display unit', () => {
    expect(formatE1rm('116.667', 'kg')).toBe('116.67 kg');
  });
});

describe('deriveRowDisplay — isolation (UI-SPEC E9 error backstop)', () => {
  it('computes a real e1RM from completedSets using the default estimator', () => {
    const row = breakdownRow({ completedSets: [loggedSetRow({ weightKg: '100.000', reps: 5 })], prTypes: ['heaviest_weight'] });
    const display = deriveRowDisplay(row, 'kg');

    expect(display.e1rmDisplay).not.toBe('—');
    expect(display.prTypes).toEqual(['heaviest_weight']);
  });

  it('degrades to the em dash and drops badges when the injected estimator throws', () => {
    const row = breakdownRow({ completedSets: [loggedSetRow({ weightKg: '100.000', reps: 5 })], prTypes: ['heaviest_weight'] });
    const throwingEstimator = () => {
      throw new Error('boom');
    };

    const display = deriveRowDisplay(row, 'kg', throwingEstimator);

    expect(display.e1rmDisplay).toBe('—');
    expect(display.prTypes).toEqual([]);
  });
});

describe('WorkoutSummaryView — populated summary (UI-SPEC E9 populated)', () => {
  it('renders the heading, duration and breakdown row', () => {
    const result = renderView();

    const text = findText(result).join(' ');
    expect(text).toContain('Workout Complete');
    expect(text).toContain('1:00:00');
    expect(text).toContain('Bench Press');
  });

  it('the e1RM label is still rendered alongside the em dash for a null bestE1rmKg', () => {
    const result = renderView({ summary: summaryFixture({ breakdown: [breakdownRow({ bestE1rmKg: null, completedSets: [] })] }) });

    const text = findText(result).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('e1RM: —');
  });

  it('renders exactly one "New PR" badge for one detected type', () => {
    const result = renderView({ summary: summaryFixture({ breakdown: [breakdownRow({ prTypes: ['heaviest_weight'] })] }) });

    const badgeCount = findText(result).filter((entry) => entry === 'New PR').length;
    expect(badgeCount).toBe(1);
  });

  it('renders two "New PR" badges for two detected types on one exercise', () => {
    const result = renderView({ summary: summaryFixture({ breakdown: [breakdownRow({ prTypes: ['heaviest_weight', 'best_e1rm'] })] }) });

    const badgeCount = findText(result).filter((entry) => entry === 'New PR').length;
    expect(badgeCount).toBe(2);
  });

  it('calls onDone when the Done button is pressed', () => {
    const onDone = jest.fn();
    const result = renderView({ onDone }) as { props: { children: unknown[] } };

    // Done is the last top-level child (outside the scrollable content).
    const children = result.props.children as { props?: { children?: { props?: { onPress?: () => void } } } }[];
    const doneContainer = children[children.length - 1];
    const doneButton = doneContainer.props?.children as { props?: { onPress?: () => void } } | undefined;
    doneButton?.props?.onPress?.();

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('WorkoutSummaryView — partial completion (UI-SPEC E9 partial)', () => {
  it('counts only completed sets, ignoring an unrelated omitted exercise entirely', () => {
    const result = renderView({
      summary: summaryFixture({ breakdown: [breakdownRow({ exerciseName: 'Squat', completedSetCount: 1, totalReps: 5 })] }),
    });

    const text = findText(result).join(' ');
    expect(text).toContain('Squat');
    expect(text).toContain('1 set');
  });
});

describe('WorkoutSummaryView — empty session (UI-SPEC E9 empty backstop)', () => {
  it('renders only the heading, duration and Done when zero sets were completed', () => {
    const result = renderView({ summary: summaryFixture({ breakdown: [] }) });

    const text = findText(result).join(' ');
    expect(text).toContain('Workout Complete');
    expect(text).not.toContain('Muscles Trained');
    expect(text).not.toContain('Per-Exercise Breakdown');
  });
});

describe('WorkoutSummaryView — correction affordance (LOG-19, D-32)', () => {
  it('renders one SetRowView per completed set of the expanded exercise, in summary-correction mode', () => {
    const completedSets = [loggedSetRow({ id: 'ls-1', setIndex: 1 }), loggedSetRow({ id: 'ls-2', setIndex: 2 }), loggedSetRow({ id: 'ls-3', setIndex: 3 })];
    const result = renderView({
      summary: summaryFixture({ breakdown: [breakdownRow({ completedSets })] }),
      mode: 'summary-correction',
      expandedSessionExerciseId: 'se-1',
    });

    const setRows = findByType(result, SetRowView);
    expect(setRows).toHaveLength(3);
    expect(setRows.map((row) => row.props.setIndex)).toEqual([1, 2, 3]);
  });

  it('does not expand any row when mode is not summary-correction, even with an expanded id set', () => {
    const completedSets = [loggedSetRow({ id: 'ls-1', setIndex: 1 })];
    const result = renderView({
      summary: summaryFixture({ breakdown: [breakdownRow({ completedSets })] }),
      mode: 'live',
      expandedSessionExerciseId: 'se-1',
    });

    expect(findByType(result, SetRowView)).toHaveLength(0);
  });

  it('a field press calls onFieldPress with the set id, field and its current displayed value', () => {
    const onFieldPress = jest.fn();
    const completedSets = [loggedSetRow({ id: 'ls-1', setIndex: 1, weightKg: '100.000' })];
    const result = renderView({
      summary: summaryFixture({ breakdown: [breakdownRow({ completedSets })] }),
      expandedSessionExerciseId: 'se-1',
      onFieldPress,
    });

    const [setRow] = findByType(result, SetRowView) as unknown as { props: { onFieldPress: (field: string) => void } }[];
    setRow.props.onFieldPress('weight');

    expect(onFieldPress).toHaveBeenCalledWith('ls-1', 'weight', '100.00');
  });

  it('a checkmark press calls onCheckmarkPress with the set id', () => {
    const onCheckmarkPress = jest.fn();
    const completedSets = [loggedSetRow({ id: 'ls-1', setIndex: 1 })];
    const result = renderView({
      summary: summaryFixture({ breakdown: [breakdownRow({ completedSets })] }),
      expandedSessionExerciseId: 'se-1',
      onCheckmarkPress,
    });

    const [setRow] = findByType(result, SetRowView) as unknown as { props: { onCheckmarkPress: () => void } }[];
    setRow.props.onCheckmarkPress();

    expect(onCheckmarkPress).toHaveBeenCalledWith('ls-1');
  });
});
