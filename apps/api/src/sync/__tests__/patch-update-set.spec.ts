import {
  LOGGED_SET_PATCH_FIELDS,
  patchAwareSet,
  SESSION_EXERCISE_PATCH_FIELDS,
  WORKOUT_SESSION_PATCH_FIELDS,
  type LoggedSetValues,
  type SessionExerciseValues,
  type WorkoutSessionValues,
} from '../patch-update-set';
import type { SyncCrudOp } from '@fitness/api-contracts';

function loggedSetValues(overrides: Partial<LoggedSetValues> = {}): LoggedSetValues {
  return {
    id: 'set-1',
    sessionExerciseId: 'se-1',
    setIndex: 1,
    setType: 'normal',
    weightKg: '60.000',
    reps: 10,
    rir: 2,
    side: null,
    completed: true,
    parentSetId: null,
    restTakenSeconds: null,
    loggedAt: new Date('2026-06-15T20:00:00Z'),
    ...overrides,
  };
}

function workoutSessionValues(overrides: Partial<WorkoutSessionValues> = {}): WorkoutSessionValues {
  return {
    id: 'sess-1',
    userId: 'user-1',
    routineDayId: 'rd-1',
    equipmentProfileId: 'ep-1',
    startedAt: new Date('2026-06-15T20:00:00Z'),
    endedAt: null,
    status: 'in_progress',
    deviceId: 'phone-1',
    timezone: 'America/New_York',
    localDate: '2026-06-15',
    ...overrides,
  };
}

function sessionExerciseValues(overrides: Partial<SessionExerciseValues> = {}): SessionExerciseValues {
  return {
    id: 'se-1',
    sessionId: 'sess-1',
    exerciseId: 'ex-1',
    orderIndex: 0,
    supersetGroupId: null,
    routineExerciseId: null,
    targetSets: null,
    targetRepMin: null,
    targetRepMax: null,
    targetRirMin: null,
    targetRirMax: null,
    targetRestSeconds: null,
    ...overrides,
  };
}

function op(overrides: Partial<SyncCrudOp>): SyncCrudOp {
  return { op_id: 'op-1', op: 'PATCH', type: 'logged_set', id: 'set-1', data: {}, ...overrides };
}

describe('patchAwareSet', () => {
  it('returns the values object unchanged for a PUT — full-column replace, identical to today', () => {
    const values = loggedSetValues({ reps: 5 });
    const putOp = op({ op: 'PUT', data: { reps: 9 } });
    expect(patchAwareSet(putOp, values, LOGGED_SET_PATCH_FIELDS)).toBe(values);
  });

  it('a PATCH naming {reps: 9} against logged_set returns exactly id, sessionExerciseId, reps — not a superset, and not the identity keys alone', () => {
    const values = loggedSetValues();
    const patchOp = op({ data: { reps: 9 } });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(['id', 'reps', 'sessionExerciseId'].sort());
    expect(result.reps).toBe(values.reps);
  });

  it('a PATCH with an empty data object returns exactly the identity keys, and does not throw', () => {
    const values = loggedSetValues();
    const patchOp = op({ data: {} });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(['id', 'sessionExerciseId']);
  });

  it('treats a null or absent op.data as an empty object', () => {
    const values = loggedSetValues();
    const nullDataOp = op({ data: null });
    const absentDataOp: SyncCrudOp = { op_id: 'op-2', op: 'PATCH', type: 'logged_set', id: 'set-1' };
    expect(Object.keys(patchAwareSet(nullDataOp, values, LOGGED_SET_PATCH_FIELDS)).sort()).toEqual(['id', 'sessionExerciseId']);
    expect(Object.keys(patchAwareSet(absentDataOp, values, LOGGED_SET_PATCH_FIELDS)).sort()).toEqual(['id', 'sessionExerciseId']);
  });

  it('keeps a column when op.data has an explicit null or explicit 0 for it — presence, not truthiness', () => {
    const values = loggedSetValues({ rir: null, setIndex: 0 });
    const patchOp = op({ data: { rir: null, set_index: 0 } });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect('rir' in result).toBe(true);
    expect(result.rir).toBeNull();
    expect('setIndex' in result).toBe(true);
    expect(result.setIndex).toBe(0);
  });

  it('drops a column with no matching key in op.data — an absent key is the only thing that filters a column out', () => {
    const values = loggedSetValues();
    const patchOp = op({ data: { reps: 9 } });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect('weightKg' in result).toBe(false);
    expect('side' in result).toBe(false);
  });

  it('a wire key no field map classifies is ignored — it can never introduce a column into the update set', () => {
    const values = loggedSetValues();
    const patchOp = op({ data: { unknown_field: 'x', reps: 9 } });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(['id', 'reps', 'sessionExerciseId'].sort());
    expect('unknown_field' in result).toBe(false);
  });

  it('always retains identity/server-owned keys regardless of op.data — workout_session (id, userId)', () => {
    const values = workoutSessionValues();
    const patchOp = op({ type: 'workout_session', id: 'sess-1', data: { status: 'completed' } });
    const result = patchAwareSet(patchOp, values, WORKOUT_SESSION_PATCH_FIELDS);
    expect(result.id).toBe(values.id);
    expect(result.userId).toBe(values.userId);
    expect(Object.keys(result).sort()).toEqual(['id', 'status', 'userId'].sort());
  });

  it('always retains identity/server-owned keys regardless of op.data — session_exercise (id, sessionId)', () => {
    const values = sessionExerciseValues();
    const patchOp = op({ type: 'session_exercise', id: 'se-1', data: { order_index: 3 } });
    const result = patchAwareSet(patchOp, values, SESSION_EXERCISE_PATCH_FIELDS);
    expect(result.id).toBe(values.id);
    expect(result.sessionId).toBe(values.sessionId);
    expect(Object.keys(result).sort()).toEqual(['id', 'orderIndex', 'sessionId'].sort());
  });

  it('always retains identity/server-owned keys regardless of op.data — logged_set (id, sessionExerciseId)', () => {
    const values = loggedSetValues();
    const patchOp = op({ type: 'logged_set', id: 'set-1', data: { weight_kg: '10.000' } });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect(result.id).toBe(values.id);
    expect(result.sessionExerciseId).toBe(values.sessionExerciseId);
    expect(Object.keys(result).sort()).toEqual(['id', 'sessionExerciseId', 'weightKg'].sort());
  });

  it('a PATCH naming every mutable workout_session column returns every key', () => {
    const values = workoutSessionValues();
    const patchOp = op({
      type: 'workout_session',
      id: 'sess-1',
      data: {
        routine_day_id: 'rd-2',
        equipment_profile_id: 'ep-2',
        started_at: '2026-06-16T00:00:00Z',
        ended_at: '2026-06-16T01:00:00Z',
        status: 'completed',
        device_id: 'phone-2',
        timezone: 'UTC',
        local_date: '2026-06-16',
      },
    });
    const result = patchAwareSet(patchOp, values, WORKOUT_SESSION_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(Object.keys(values).sort());
  });

  it('a PATCH naming every mutable session_exercise column returns every key', () => {
    const values = sessionExerciseValues();
    const patchOp = op({
      type: 'session_exercise',
      id: 'se-1',
      data: {
        exercise_id: 'ex-2',
        order_index: 1,
        superset_group_id: 'sg-1',
        routine_exercise_id: 're-1',
        target_sets: 4,
        target_rep_min: 6,
        target_rep_max: 10,
        target_rir_min: 1,
        target_rir_max: 3,
        target_rest_seconds: 180,
      },
    });
    const result = patchAwareSet(patchOp, values, SESSION_EXERCISE_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(Object.keys(values).sort());
  });

  it('a PATCH naming every mutable logged_set column returns every key', () => {
    const values = loggedSetValues();
    const patchOp = op({
      data: {
        set_index: 2,
        set_type: 'drop',
        weight_kg: '70.000',
        reps: 8,
        rir: 1,
        side: 'right',
        completed: false,
        parent_set_id: 'set-0',
        rest_taken_seconds: 60,
        logged_at: '2026-06-16T00:00:00Z',
      },
    });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(Object.keys(values).sort());
  });
});
