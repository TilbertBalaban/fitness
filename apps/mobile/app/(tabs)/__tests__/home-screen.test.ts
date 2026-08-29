// getPowerSync's real module chain reaches @powersync/react-native -> @powersync/shared-internals,
// whose ESM dist Jest cannot parse (WINDOWS #22/#33) — mocked before importing the screen module
// so its top-level `import { getPowerSync } from '@/lib/db/powersync'` never reaches that chain.
jest.mock('../../../lib/db/powersync', () => ({ getPowerSync: jest.fn() }));
jest.mock('../../../lib/db/programs/next-up-query', () => ({ loadNextUp: jest.fn() }));
// The Home card now reads the signed-in user id so loadNextUp can filter user_preference by it
// (WR-02); authClient's better-auth/react ESM dist is one Jest cannot parse, same rationale as the
// powersync mock above.
jest.mock('../../../lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import type { WeeklyProgressData } from '../../../lib/db/weekly-progress-query';
import {
  deriveHomeScreenState,
  dayTargetMuscles,
  formatNextUpExerciseLine,
  formatTimeOffRemaining,
  nextUpHeading,
  readInProgressSession,
  readNextUp,
  readWeeklyProgress,
} from '../index';

const WORKOUT_NO_CYCLE = {
  kind: 'workout' as const,
  cycle: null,
  day: { id: 'd1', orderIndex: 1024, name: 'Push', isRestDay: false, slots: [] },
};

const WORKOUT_WITH_CYCLE = {
  ...WORKOUT_NO_CYCLE,
  cycle: { id: 'c1', name: 'Week 2', kind: 'training' as const, orderIndex: 1024, durationDays: null },
};

const TIME_OFF = {
  kind: 'time-off' as const,
  cycle: { id: 'c2', name: 'Off', kind: 'time_off' as const, orderIndex: 2048, durationDays: 7 },
  daysRemaining: 3,
};

const PROGRAM_COMPLETE = {
  kind: 'program-complete' as const,
  lastCycle: null,
};

const NO_DAYS = { kind: 'no-days' as const };

const NO_ACTIVE_PROGRAM = { kind: 'no-active-program' as const };

function slot(id: string, exerciseId: string, exerciseName: string, targets: Record<string, number | null> = {}) {
  return {
    id,
    orderIndex: 1024,
    exerciseId,
    exerciseName,
    targetSets: null,
    targetRepMin: null,
    targetRepMax: null,
    targetRir: null,
    targetRestSeconds: null,
    overridesByCycleId: {},
    ...targets,
  };
}

describe('deriveHomeScreenState', () => {
  it('is error when the load failed', () => {
    expect(deriveHomeScreenState({ failed: true, data: null })).toBe('error');
  });

  it('is loading before the local read returns', () => {
    expect(deriveHomeScreenState({ failed: false, data: null })).toBe('loading');
  });

  it('is no-program when nothing is active', () => {
    expect(deriveHomeScreenState({ failed: false, data: { routine: null } })).toBe('no-program');
  });

  it('is ready once an active program has loaded', () => {
    expect(deriveHomeScreenState({ failed: false, data: { routine: { id: 'r1', name: 'PPL' } } })).toBe('ready');
  });

  it('lets a failure win over already-loaded data', () => {
    expect(deriveHomeScreenState({ failed: true, data: { routine: { id: 'r1', name: 'PPL' } } })).toBe('error');
  });
});

describe('formatTimeOffRemaining', () => {
  it('uses the singular for one day', () => {
    expect(formatTimeOffRemaining(1)).toBe('1 day left');
  });

  it('uses the plural for more than one day', () => {
    expect(formatTimeOffRemaining(4)).toBe('4 days left');
  });

  it('says when training resumes on the last day', () => {
    expect(formatTimeOffRemaining(0)).toBe('Back tomorrow');
  });
});

describe('nextUpHeading', () => {
  it('is the day name when no cycle applies', () => {
    expect(nextUpHeading(WORKOUT_NO_CYCLE)).toBe('Push');
  });

  it('names the cycle alongside the day', () => {
    expect(nextUpHeading(WORKOUT_WITH_CYCLE)).toBe('Push · Week 2');
  });

  it('states scheduled time off as a plain fact', () => {
    expect(nextUpHeading(TIME_OFF)).toBe("You're on scheduled time off.");
  });

  it('says the block is complete rather than looping', () => {
    expect(nextUpHeading(PROGRAM_COMPLETE)).toBe('Block complete');
  });

  it('has a heading for a program with no days', () => {
    expect(nextUpHeading(NO_DAYS)).toBe('No days yet');
  });

  it('has a heading for no active program', () => {
    expect(nextUpHeading(NO_ACTIVE_PROGRAM)).toBe('No active program');
  });

  it('never frames a state as a failure the lifter has to justify', () => {
    const headings = [
      nextUpHeading(WORKOUT_NO_CYCLE),
      nextUpHeading(WORKOUT_WITH_CYCLE),
      nextUpHeading(TIME_OFF),
      nextUpHeading(PROGRAM_COMPLETE),
      nextUpHeading(NO_DAYS),
      nextUpHeading(NO_ACTIVE_PROGRAM),
      formatTimeOffRemaining(0),
      formatTimeOffRemaining(1),
      formatTimeOffRemaining(9),
    ];
    for (const heading of headings) {
      expect(heading).not.toMatch(/missed|skipped|behind|lapsed/i);
    }
  });
});

describe('formatNextUpExerciseLine', () => {
  it('renders a fully prescribed exercise with the card template', () => {
    const line = formatNextUpExerciseLine(
      slot('re1', 'ex1', 'Bench Press', {
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        targetRir: 2,
        targetRestSeconds: 90,
      }),
      null,
    );
    expect(line).toBe('Bench Press: 3 × 8–12 reps @ 2 RIR');
  });

  it('never collapses an equal rep range to a single number', () => {
    const line = formatNextUpExerciseLine(
      slot('re1', 'ex1', 'Bench Press', { targetSets: 3, targetRepMin: 8, targetRepMax: 8, targetRir: 2 }),
      null,
    );
    expect(line).toBe('Bench Press: 3 × 8–8 reps @ 2 RIR');
  });

  it('renders an unprescribed field as an em dash, never as zero', () => {
    const line = formatNextUpExerciseLine(
      slot('re1', 'ex1', 'Bench Press', { targetSets: 3, targetRepMin: 8, targetRepMax: 12 }),
      null,
    );
    expect(line).toBe('Bench Press: 3 × 8–12 reps @ — RIR');
    expect(line).not.toContain('0 RIR');
  });

  it('keeps a zero target as a zero — zero is a value, not an absence', () => {
    const line = formatNextUpExerciseLine(
      slot('re1', 'ex1', 'Bench Press', { targetSets: 3, targetRepMin: 8, targetRepMax: 12, targetRir: 0 }),
      null,
    );
    expect(line).toBe('Bench Press: 3 × 8–12 reps @ 0 RIR');
  });

  it('says an entirely untargeted exercise has no targets set', () => {
    expect(formatNextUpExerciseLine(slot('re1', 'ex1', 'Bench Press'), null)).toBe('Bench Press: No targets set.');
  });

  it('resolves the selected cycle override over the base prescription', () => {
    const withOverride = {
      ...slot('re1', 'ex1', 'Bench Press', {
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        targetRir: 2,
      }),
      overridesByCycleId: { c1: { targetSets: 5, targetRir: 1 } },
    };
    expect(formatNextUpExerciseLine(withOverride, 'c1')).toBe('Bench Press: 5 × 8–12 reps @ 1 RIR');
    expect(formatNextUpExerciseLine(withOverride, null)).toBe('Bench Press: 3 × 8–12 reps @ 2 RIR');
  });

  it('omits rest — the Home card carries four fields, the slot row carries five', () => {
    const line = formatNextUpExerciseLine(
      slot('re1', 'ex1', 'Bench Press', {
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        targetRir: 2,
        targetRestSeconds: 90,
      }),
      null,
    );
    expect(line).not.toContain('rest');
  });
});

describe('dayTargetMuscles', () => {
  const muscles = { ex1: ['Chest', 'Triceps'], ex2: ['Triceps', 'Shoulders'], ex3: [] };

  it('collects every muscle across the day, in first-appearance order, without repeats', () => {
    const slots = [slot('re1', 'ex1', 'Bench'), slot('re2', 'ex2', 'Dip')];
    expect(dayTargetMuscles(slots, muscles)).toEqual(['Chest', 'Triceps', 'Shoulders']);
  });

  it('is empty for a day whose exercises have no mapped muscles', () => {
    expect(dayTargetMuscles([slot('re3', 'ex3', 'Sled Push')], muscles)).toEqual([]);
  });

  it('is empty for a day with no exercises', () => {
    expect(dayTargetMuscles([], muscles)).toEqual([]);
  });

  it('tolerates an exercise missing from the muscle map', () => {
    expect(dayTargetMuscles([slot('re9', 'unknown', 'Mystery')], muscles)).toEqual([]);
  });
});

// WR-04: the card loaded once on mount with an empty dependency array and nothing ever re-ran the
// read, so activating a program on the Programs tab left Home reading "No active program" until the
// app was killed. HomeScreen's focus effect is now this function and nothing else; the focus wiring
// itself is not exercised here because this workspace has no renderer.
describe('readNextUp', () => {
  const EMPTY_DATA = {
    routine: null,
    days: [],
    cycles: [],
    history: [],
    musclesByExerciseId: {},
    today: '2026-01-01',
  };

  it('passes the signed-in user through to the read', async () => {
    const load = jest.fn().mockResolvedValue(EMPTY_DATA);

    await readNextUp('user-1', load);

    expect(load).toHaveBeenCalledWith('user-1');
  });

  it('returns the data on a successful read', async () => {
    const load = jest.fn().mockResolvedValue(EMPTY_DATA);

    expect(await readNextUp('user-1', load)).toEqual({ data: EMPTY_DATA });
  });

  it('reports a failure instead of throwing, so a focus never crashes the tab', async () => {
    const load = jest.fn().mockRejectedValue(new Error('database locked'));

    expect(await readNextUp('user-1', load)).toEqual({ failed: true });
  });

  it('re-reads on every call — nothing memoises the first result', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce(EMPTY_DATA)
      .mockResolvedValueOnce({ ...EMPTY_DATA, routine: { id: 'r1', name: 'Push Pull Legs' } });

    expect(await readNextUp('user-1', load)).toEqual({ data: EMPTY_DATA });
    expect(await readNextUp('user-1', load)).toMatchObject({ data: { routine: { id: 'r1' } } });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('recovers from a failure — a later read reports data, not the earlier failure', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('database locked')).mockResolvedValueOnce(EMPTY_DATA);

    expect(await readNextUp('user-1', load)).toEqual({ failed: true });
    expect(await readNextUp('user-1', load)).toEqual({ data: EMPTY_DATA });
  });

  it('still reads with a null user, so the signed-out empty state is derived not assumed', async () => {
    const load = jest.fn().mockResolvedValue(EMPTY_DATA);

    await readNextUp(null, load);

    expect(load).toHaveBeenCalledWith(null);
  });
});

// D-28's cost constraint (the query itself, not just the render, must be conditional) and the E8
// error backstop (what Home does when this query rejects) both live here.
describe('readInProgressSession', () => {
  const SUMMARY = {
    id: 's-1',
    startedAt: '2026-08-24T10:00:00.000Z',
    status: 'in_progress',
    pausedAt: null,
    accumulatedPausedSeconds: 0,
  };

  it('issues no query at all when userId is absent', async () => {
    const load = jest.fn();

    await expect(readInProgressSession(null, load)).resolves.toEqual({ data: null });

    expect(load).not.toHaveBeenCalled();
  });

  it('returns the resolved session for a signed-in user', async () => {
    const load = jest.fn().mockResolvedValue(SUMMARY);

    await expect(readInProgressSession('u-1', load)).resolves.toEqual({ data: SUMMARY });
    expect(load).toHaveBeenCalledWith('u-1');
  });

  it('returns null data, not a failure, when there is simply no open session', async () => {
    const load = jest.fn().mockResolvedValue(null);

    await expect(readInProgressSession('u-1', load)).resolves.toEqual({ data: null });
  });

  // The E8 backstop: distinguishing a query failure from "no session" is what this case pins —
  // Home's own rendering choice (collapse both to banner-absent) is made at the call site, but the
  // read function itself must still be able to report the failure distinctly.
  it('reports a failure instead of throwing, distinctly from a null-data no-session result', async () => {
    const load = jest.fn().mockRejectedValue(new Error('database locked'));

    await expect(readInProgressSession('u-1', load)).resolves.toEqual({ failed: true });
  });
});

// ANLY-08's read-and-derive sequence, exercised without a renderer exactly as the two wrappers
// above are. The arithmetic itself belongs to @fitness/analytics-engine and is asserted there; what
// this block pins is that the screen hands it the right rows and the right day, and that a rejected
// read is reported rather than thrown.
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
              // Neither of these two is a set on the exercise strip, so neither may be one here.
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
