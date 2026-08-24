import { formatBreakdownLine, formatE1rm, WorkoutSummaryView } from '../WorkoutSummary';
import type { ExerciseBreakdown, SessionSummary } from '@/lib/db/summary-query';

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

function breakdownRow(overrides: Partial<ExerciseBreakdown> = {}): ExerciseBreakdown {
  return {
    sessionExerciseId: 'se-1',
    exerciseId: 'ex-1',
    exerciseName: 'Bench Press',
    removedAt: null,
    completedSetCount: 3,
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
    personalRecordsBySetId: {},
    ...overrides,
  };
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

describe('WorkoutSummaryView — populated summary (UI-SPEC E9 populated)', () => {
  it('renders the heading, duration and breakdown row', () => {
    const summary = summaryFixture();
    const result = WorkoutSummaryView({ summary, weightUnit: 'kg', colors, onDone: jest.fn() });

    const text = findText(result).join(' ');
    expect(text).toContain('Workout Complete');
    expect(text).toContain('1:00:00');
    expect(text).toContain('Bench Press');
  });

  it('the e1RM label is still rendered alongside the em dash for a null bestE1rmKg', () => {
    const summary = summaryFixture({ breakdown: [breakdownRow({ bestE1rmKg: null })] });
    const result = WorkoutSummaryView({ summary, weightUnit: 'kg', colors, onDone: jest.fn() });

    const text = findText(result).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('e1RM: —');
  });

  it('renders exactly one "New PR" badge for one detected type', () => {
    const summary = summaryFixture({ breakdown: [breakdownRow({ prTypes: ['heaviest_weight'] })] });
    const result = WorkoutSummaryView({ summary, weightUnit: 'kg', colors, onDone: jest.fn() });

    const text = findText(result);
    const badgeCount = text.filter((entry) => entry === 'New PR').length;
    expect(badgeCount).toBe(1);
  });

  it('renders two "New PR" badges for two detected types on one exercise', () => {
    const summary = summaryFixture({ breakdown: [breakdownRow({ prTypes: ['heaviest_weight', 'best_e1rm'] })] });
    const result = WorkoutSummaryView({ summary, weightUnit: 'kg', colors, onDone: jest.fn() });

    const badgeCount = findText(result).filter((entry) => entry === 'New PR').length;
    expect(badgeCount).toBe(2);
  });

  it('calls onDone when the Done button is pressed', () => {
    const onDone = jest.fn();
    const summary = summaryFixture();
    const result = WorkoutSummaryView({ summary, weightUnit: 'kg', colors, onDone }) as {
      props: { children: unknown[] };
    };

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
    const summary = summaryFixture({
      breakdown: [breakdownRow({ exerciseName: 'Squat', completedSetCount: 1, totalReps: 5 })],
    });
    const result = WorkoutSummaryView({ summary, weightUnit: 'kg', colors, onDone: jest.fn() });

    const text = findText(result).join(' ');
    expect(text).toContain('Squat');
    expect(text).toContain('1 set');
  });
});
