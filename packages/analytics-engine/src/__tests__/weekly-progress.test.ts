import {
  WEEKLY_TRACK_IDS,
  weeklyProgress,
  type ProgramTargetInput,
  type WeeklyProgressSessionInput,
  type WeeklyTrackId,
} from '../weekly-progress';

const TODAY = '2026-08-29';
// The rolling window is 2026-08-23..2026-08-29 inclusive, so 2026-08-22 is the first day outside it.
const DAY_BEFORE_WINDOW = '2026-08-22';
const FIRST_DAY_IN_WINDOW = '2026-08-23';

const CHEST_AND_TRICEPS = ['chest', 'triceps'];

// ONE fixture drives the sets/exercises/muscles assertions below, so the divergent populations are
// visible side by side: the set count is parent-only while the exercise and muscle counts are
// driven by which exercises contributed any qualifying set at all.
const MIXED_WEEK: WeeklyProgressSessionInput[] = [
  {
    sessionId: 'session-a',
    localDate: '2026-08-25',
    exercises: [
      {
        exerciseId: 'bench',
        primaryMuscleGroupIds: CHEST_AND_TRICEPS,
        sets: [
          { id: 'a1', setType: 'warmup', completed: true, parentSetId: null },
          { id: 'a2', setType: 'normal', completed: true, parentSetId: null },
          { id: 'a3', setType: 'drop', completed: true, parentSetId: 'a2' },
          { id: 'a4', setType: 'normal', completed: false, parentSetId: null },
        ],
      },
      {
        exerciseId: 'press',
        primaryMuscleGroupIds: ['shoulders'],
        sets: [{ id: 'b1', setType: 'normal', completed: true, parentSetId: null }],
      },
      {
        // Warm-up only: this exercise contributed no qualifying set, so neither it nor its muscle
        // group may appear in any achieved figure.
        exerciseId: 'row',
        primaryMuscleGroupIds: ['back'],
        sets: [{ id: 'c1', setType: 'warmup', completed: true, parentSetId: null }],
      },
    ],
  },
  {
    sessionId: 'session-b',
    localDate: '2026-08-27',
    exercises: [
      {
        exerciseId: 'bench',
        primaryMuscleGroupIds: CHEST_AND_TRICEPS,
        sets: [
          { id: 'd1', setType: 'normal', completed: true, parentSetId: null },
          { id: 'd2', setType: 'normal', completed: true, parentSetId: null },
        ],
      },
    ],
  },
];

const PROGRAM: ProgramTargetInput = {
  days: [
    {
      slots: [
        { exerciseId: 'bench', targetSets: 4, primaryMuscleGroupIds: CHEST_AND_TRICEPS },
        { exerciseId: 'press', targetSets: 3, primaryMuscleGroupIds: ['shoulders'] },
      ],
    },
    {
      slots: [
        { exerciseId: 'squat', targetSets: 5, primaryMuscleGroupIds: ['legs'] },
        { exerciseId: 'bench', targetSets: 3, primaryMuscleGroupIds: CHEST_AND_TRICEPS },
      ],
    },
  ],
};

function trackFor(result: ReturnType<typeof weeklyProgress>, id: WeeklyTrackId) {
  const track = result.tracks.find((candidate) => candidate.id === id);
  if (track === undefined) throw new Error(`no ${id} track`);
  return track;
}

function oneSet(localDate: string, exerciseId = 'bench'): WeeklyProgressSessionInput {
  return {
    sessionId: `s-${localDate}-${exerciseId}`,
    localDate,
    exercises: [
      {
        exerciseId,
        primaryMuscleGroupIds: CHEST_AND_TRICEPS,
        sets: [{ id: `set-${localDate}-${exerciseId}`, setType: 'normal', completed: true, parentSetId: null }],
      },
    ],
  };
}

describe('weeklyProgress — the three achieved figures diverge on one fixture', () => {
  const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: null });

  it('counts sets by parent rows only, completed only, warm-ups excluded — the exercise strip predicate', () => {
    // bench's normal set and press's set in session-a, plus bench's two in session-b. The warm-up,
    // the drop-set CHILD and the incomplete set contribute nothing: the drop set is one set.
    expect(trackFor(result, 'sets').achieved).toBe(4);
  });

  it('counts distinct exercises that contributed at least one qualifying set, so bench on two days counts once', () => {
    // bench and press. row is warm-up-only and is absent.
    expect(trackFor(result, 'exercises').achieved).toBe(2);
  });

  it('counts distinct primary muscle groups of those exercises only', () => {
    // chest and triceps from bench, shoulders from press. back is absent because row contributed nothing.
    expect(trackFor(result, 'muscles').achieved).toBe(3);
  });

  it('returns the three tracks in the fixed order the card renders them in', () => {
    expect(result.tracks.map((track) => track.id)).toEqual(['sets', 'exercises', 'muscles']);
    expect(WEEKLY_TRACK_IDS).toEqual(['sets', 'exercises', 'muscles']);
  });

  it('reports activity', () => {
    expect(result.hasActivity).toBe(true);
  });
});

describe('the window is the rolling seven days ending on the supplied date, inclusive', () => {
  it('excludes a session dated the day before the window', () => {
    const result = weeklyProgress({
      todayLocalDate: TODAY,
      sessions: [oneSet(DAY_BEFORE_WINDOW)],
      programTarget: null,
    });

    expect(result.hasActivity).toBe(false);
    expect(result.tracks).toEqual([]);
  });

  it('includes a session dated on the first day of the window and one dated on the supplied day itself', () => {
    const result = weeklyProgress({
      todayLocalDate: TODAY,
      sessions: [oneSet(FIRST_DAY_IN_WINDOW), oneSet(TODAY)],
      programTarget: null,
    });

    expect(trackFor(result, 'sets').achieved).toBe(2);
  });

  it('excludes a session dated after the supplied day', () => {
    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: [oneSet('2026-08-30')], programTarget: null });

    expect(result.hasActivity).toBe(false);
  });

  it('is a rolling window, not a calendar week: the same sessions measured a day later drop the oldest day', () => {
    const sessions = [oneSet(FIRST_DAY_IN_WINDOW), oneSet('2026-08-26')];

    expect(weeklyProgress({ todayLocalDate: TODAY, sessions, programTarget: null }).tracks[0].achieved).toBe(2);
    expect(weeklyProgress({ todayLocalDate: '2026-08-30', sessions, programTarget: null }).tracks[0].achieved).toBe(1);
  });
});

describe('targets come from one full pass of the active program day list (D-08)', () => {
  it('leaves all three targets null with no program, while still reporting the achieved figures', () => {
    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: null });

    expect(result.tracks.map((track) => track.target)).toEqual([null, null, null]);
    expect(result.tracks.map((track) => track.achieved)).toEqual([4, 2, 3]);
  });

  it('sums resolved set targets across every slot of every day, and counts distinct exercises and muscles across them', () => {
    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: PROGRAM });

    // 4 + 3 + 5 + 3 — bench appears on both days and both prescriptions count toward the week.
    expect(trackFor(result, 'sets').target).toBe(15);
    // bench, press, squat — bench counted once despite appearing twice.
    expect(trackFor(result, 'exercises').target).toBe(3);
    // chest, triceps, shoulders, legs.
    expect(trackFor(result, 'muscles').target).toBe(4);
  });

  it('nulls only the sets target when no slot expresses one, leaving the other two real', () => {
    const untargeted: ProgramTargetInput = {
      days: PROGRAM.days.map((day) => ({
        slots: day.slots.map((slot) => ({ ...slot, targetSets: null })),
      })),
    };

    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: untargeted });

    expect(trackFor(result, 'sets').target).toBeNull();
    expect(trackFor(result, 'exercises').target).toBe(3);
    expect(trackFor(result, 'muscles').target).toBe(4);
  });

  it('sums the slots that do express a target when only some of them do', () => {
    const partiallyTargeted: ProgramTargetInput = {
      days: [
        {
          slots: [
            { exerciseId: 'bench', targetSets: 4, primaryMuscleGroupIds: CHEST_AND_TRICEPS },
            { exerciseId: 'curl', targetSets: null, primaryMuscleGroupIds: ['biceps'] },
          ],
        },
      ],
    };

    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: partiallyTargeted });

    expect(trackFor(result, 'sets').target).toBe(4);
    expect(trackFor(result, 'exercises').target).toBe(2);
    expect(trackFor(result, 'muscles').target).toBe(3);
  });

  it('nulls every target for a program that expresses nothing at all', () => {
    for (const empty of [{ days: [] }, { days: [{ slots: [] }] }] satisfies ProgramTargetInput[]) {
      const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: empty });
      expect(result.tracks.map((track) => track.target)).toEqual([null, null, null]);
    }
  });

  it('nulls the muscles target when the programmed exercises carry no primary muscle mapping', () => {
    const unmapped: ProgramTargetInput = {
      days: [{ slots: [{ exerciseId: 'bench', targetSets: 4, primaryMuscleGroupIds: [] }] }],
    };

    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: unmapped });

    expect(trackFor(result, 'sets').target).toBe(4);
    expect(trackFor(result, 'exercises').target).toBe(1);
    expect(trackFor(result, 'muscles').target).toBeNull();
  });

  it('returns the true achieved figure over target rather than clamping it — the clamp is the bar width', () => {
    const modest: ProgramTargetInput = {
      days: [{ slots: [{ exerciseId: 'bench', targetSets: 1, primaryMuscleGroupIds: ['chest'] }] }],
    };

    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: MIXED_WEEK, programTarget: modest });

    expect(trackFor(result, 'sets')).toEqual({ id: 'sets', achieved: 4, target: 1 });
  });
});

describe('the empty state is a whole-card state, not three zeroed tracks (D-09)', () => {
  it('reports no activity and no tracks at all when nothing in the window qualifies', () => {
    const warmupOnly: WeeklyProgressSessionInput = {
      sessionId: 'warmup-only',
      localDate: '2026-08-25',
      exercises: [
        {
          exerciseId: 'bench',
          primaryMuscleGroupIds: CHEST_AND_TRICEPS,
          sets: [
            { id: 'x1', setType: 'warmup', completed: true, parentSetId: null },
            { id: 'x2', setType: 'normal', completed: false, parentSetId: null },
          ],
        },
      ],
    };

    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: [warmupOnly], programTarget: PROGRAM });

    expect(result.hasActivity).toBe(false);
    expect(result.tracks).toEqual([]);
  });

  it('makes a single logged set turn all three tracks non-zero, so there is no partially-empty case', () => {
    const result = weeklyProgress({ todayLocalDate: TODAY, sessions: [oneSet('2026-08-25')], programTarget: null });

    expect(result.hasActivity).toBe(true);
    expect(result.tracks.map((track) => track.achieved)).toEqual([1, 1, 2]);
    expect(result.tracks.every((track) => track.achieved > 0)).toBe(true);
  });
});
