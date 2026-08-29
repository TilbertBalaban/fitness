import { muscleVolumeCells, type MuscleVolumeSessionInput } from '../muscle-volume';

const CHEST_PRIMARY = { muscleGroupId: 'chest', weightFactor: 1.0 };
const TRICEPS_SECONDARY = { muscleGroupId: 'triceps', weightFactor: 0.5 };

describe('muscleVolumeCells', () => {
  it('weights a primary and a secondary mapping independently from three completed normal sets', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'bench',
            muscleMappings: [CHEST_PRIMARY, TRICEPS_SECONDARY],
            sets: [
              { setType: 'normal', completed: true, weightKg: 100, reps: 5 },
              { setType: 'normal', completed: true, weightKg: 100, reps: 5 },
              { setType: 'normal', completed: true, weightKg: 100, reps: 5 },
            ],
          },
        ],
      },
    ];

    const cells = muscleVolumeCells(sessions);

    expect(cells).toEqual([
      { muscleGroupId: 'chest', localDate: '2026-08-25', weightedVolumeKg: 1500, weightedSets: 3, setCount: 3 },
      { muscleGroupId: 'triceps', localDate: '2026-08-25', weightedVolumeKg: 750, weightedSets: 1.5, setCount: 3 },
    ]);
  });

  it('excludes a warm-up set and includes a partial set — volume uses countsTowardWorkingVolume, not the records predicate', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'bench',
            muscleMappings: [CHEST_PRIMARY],
            sets: [
              { setType: 'warmup', completed: true, weightKg: 40, reps: 10 },
              { setType: 'partial', completed: true, weightKg: 100, reps: 5 },
            ],
          },
        ],
      },
    ];

    const cells = muscleVolumeCells(sessions);

    expect(cells).toEqual([
      { muscleGroupId: 'chest', localDate: '2026-08-25', weightedVolumeKg: 500, weightedSets: 1, setCount: 1 },
    ]);
  });

  it('an uncompleted set contributes nothing, and a null-weight set contributes zero volume but still counts as a trained set', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'pull-up',
            muscleMappings: [{ muscleGroupId: 'lats', weightFactor: 1.0 }],
            sets: [
              { setType: 'normal', completed: false, weightKg: null, reps: 8 },
              { setType: 'normal', completed: true, weightKg: null, reps: 8 },
            ],
          },
        ],
      },
    ];

    const cells = muscleVolumeCells(sessions);

    expect(cells).toEqual([
      { muscleGroupId: 'lats', localDate: '2026-08-25', weightedVolumeKg: 0, weightedSets: 1, setCount: 1 },
    ]);
  });

  it('an exercise with no muscle mappings produces no cells', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'mystery-machine',
            muscleMappings: [],
            sets: [{ setType: 'normal', completed: true, weightKg: 50, reps: 10 }],
          },
        ],
      },
    ];

    expect(muscleVolumeCells(sessions)).toEqual([]);
  });

  it('an exercise whose only sets are warm-ups produces no cell — absent, never a zero row', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'bench',
            muscleMappings: [CHEST_PRIMARY],
            sets: [{ setType: 'warmup', completed: true, weightKg: 40, reps: 10 }],
          },
        ],
      },
    ];

    expect(muscleVolumeCells(sessions)).toEqual([]);
  });

  it('two sessions on the same local date touching the same muscle group fold into one summed cell', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'bench',
            muscleMappings: [CHEST_PRIMARY],
            sets: [{ setType: 'normal', completed: true, weightKg: 100, reps: 5 }],
          },
        ],
      },
      {
        sessionId: 'session-b',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'push-up',
            muscleMappings: [CHEST_PRIMARY],
            sets: [{ setType: 'normal', completed: true, weightKg: 80, reps: 10 }],
          },
        ],
      },
    ];

    const cells = muscleVolumeCells(sessions);

    expect(cells).toEqual([
      { muscleGroupId: 'chest', localDate: '2026-08-25', weightedVolumeKg: 500 + 800, weightedSets: 2, setCount: 2 },
    ]);
  });

  it('returns cells ordered by local date ascending, then by position in MUSCLE_GROUPS, with unknown ids sorted last by id', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-27',
        exercises: [
          {
            exerciseId: 'squat',
            muscleMappings: [{ muscleGroupId: 'quads', weightFactor: 1.0 }],
            sets: [{ setType: 'normal', completed: true, weightKg: 100, reps: 5 }],
          },
        ],
      },
      {
        sessionId: 'session-b',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'curl',
            muscleMappings: [
              { muscleGroupId: 'zzz_unknown_muscle', weightFactor: 1.0 },
              { muscleGroupId: 'triceps', weightFactor: 1.0 },
              CHEST_PRIMARY,
            ],
            sets: [{ setType: 'normal', completed: true, weightKg: 20, reps: 10 }],
          },
        ],
      },
    ];

    const cells = muscleVolumeCells(sessions);

    expect(cells.map((cell) => `${cell.localDate}:${cell.muscleGroupId}`)).toEqual([
      '2026-08-25:chest',
      '2026-08-25:triceps',
      '2026-08-25:zzz_unknown_muscle',
      '2026-08-27:quads',
    ]);
  });

  it('running twice over the same input is byte-identical', () => {
    const sessions: MuscleVolumeSessionInput[] = [
      {
        sessionId: 'session-a',
        localDate: '2026-08-25',
        exercises: [
          {
            exerciseId: 'bench',
            muscleMappings: [CHEST_PRIMARY, TRICEPS_SECONDARY],
            sets: [{ setType: 'normal', completed: true, weightKg: 100, reps: 5 }],
          },
        ],
      },
    ];

    expect(muscleVolumeCells(sessions)).toEqual(muscleVolumeCells(sessions));
  });
});
