import {
  EXERCISE_PATCH_FIELDS,
  LOGGED_SET_PATCH_FIELDS,
  patchAwareSet,
  SESSION_EXERCISE_PATCH_FIELDS,
  USER_EXERCISE_PREFERENCE_PATCH_FIELDS,
  WORKOUT_SESSION_PATCH_FIELDS,
  type ExerciseValues,
  type LoggedSetValues,
  type SessionExerciseValues,
  type UserExercisePreferenceValues,
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
    notes: null,
    ...overrides,
  };
}

function workoutSessionValues(overrides: Partial<WorkoutSessionValues> = {}): WorkoutSessionValues {
  return {
    id: 'sess-1',
    userId: 'user-1',
    routineDayId: 'rd-1',
    cycleId: null,
    equipmentProfileId: 'ep-1',
    unavailableEquipment: null,
    startedAt: new Date('2026-06-15T20:00:00Z'),
    endedAt: null,
    status: 'in_progress',
    deviceId: 'phone-1',
    timezone: 'America/New_York',
    localDate: '2026-06-15',
    notes: null,
    name: null,
    pausedAt: null,
    accumulatedPausedSeconds: 0,
    restTargetAt: null,
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
    targetRir: null,
    targetRestSeconds: null,
    notes: null,
    removedAt: null,
    ...overrides,
  };
}

function exerciseValues(overrides: Partial<ExerciseValues> = {}): ExerciseValues {
  return {
    id: 'ex-1',
    userId: 'user-1',
    name: 'Barbell Back Squat',
    aliases: ['Back Squat'],
    movementPattern: 'squat',
    equipmentRequired: 'barbell',
    loadType: 'external_weight',
    unilateral: false,
    instructionsText: 'Set up under the bar...',
    cueText: 'Knees track toes',
    imageUrls: ['https://example.com/squat.png'],
    isCustom: true,
    variationOfId: null,
    source: 'user',
    bodyweightContributionPct: null,
    archivedAt: null,
    ...overrides,
  };
}

function userExercisePreferenceValues(overrides: Partial<UserExercisePreferenceValues> = {}): UserExercisePreferenceValues {
  return {
    id: 'uep-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    archivedAt: null,
    neverSuggest: false,
    updatedAt: new Date('2026-06-15T20:00:00Z'),
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
        cycle_id: 'cycle-2',
        equipment_profile_id: 'ep-2',
        started_at: '2026-06-16T00:00:00Z',
        ended_at: '2026-06-16T01:00:00Z',
        status: 'completed',
        device_id: 'phone-2',
        timezone: 'UTC',
        local_date: '2026-06-16',
        notes: 'Felt strong today',
        name: 'Push Day',
        paused_at: '2026-06-16T00:30:00Z',
        accumulated_paused_seconds: 90,
        rest_target_at: '2026-06-16T00:32:00Z',
        unavailable_equipment: '[{"kind":"equipment_type","equipmentType":"barbell"}]',
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
        target_rir: 3,
        target_rest_seconds: 180,
        notes: 'Elbow felt tight',
        removed_at: '2026-06-16T00:00:00Z',
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
        notes: 'Bar felt heavy',
      },
    });
    const result = patchAwareSet(patchOp, values, LOGGED_SET_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(Object.keys(values).sort());
  });

  it('a PATCH for exercise naming only name produces an update set of exactly the identity/server-owned keys plus name — load_type, cue_text and every other patchable column are absent', () => {
    const values = exerciseValues({ name: 'New Name' });
    const patchOp = op({ type: 'exercise', id: 'ex-1', data: { name: 'New Name' } });
    const result = patchAwareSet(patchOp, values, EXERCISE_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(
      ['id', 'userId', 'isCustom', 'source', 'archivedAt', 'name'].sort(),
    );
    expect(result.name).toBe('New Name');
    expect('loadType' in result).toBe(false);
    expect('cueText' in result).toBe(false);
  });

  it('a PUT for exercise produces an update set containing every patchable column', () => {
    const values = exerciseValues();
    const putOp = op({
      op: 'PUT',
      type: 'exercise',
      id: 'ex-1',
      data: {
        name: 'Barbell Back Squat',
        aliases: ['Back Squat'],
        movement_pattern: 'squat',
        equipment_required: 'barbell',
        load_type: 'external_weight',
        unilateral: false,
        instructions_text: 'Set up under the bar...',
        cue_text: 'Knees track toes',
        image_urls: ['https://example.com/squat.png'],
        variation_of_id: null,
        bodyweight_contribution_pct: null,
      },
    });
    const result = patchAwareSet(putOp, values, EXERCISE_PATCH_FIELDS);
    expect(result).toBe(values);
  });

  it('always retains identity/server-owned keys regardless of op.data — exercise (id, userId, isCustom, source, archivedAt), and never with a client-claimed value', () => {
    const values = exerciseValues();
    const patchOp = op({
      type: 'exercise',
      id: 'ex-1',
      data: { user_id: 'someone-else', is_custom: false, source: 'seed', archived_at: '2026-06-01T00:00:00Z', name: 'x' },
    });
    const result = patchAwareSet(patchOp, values, EXERCISE_PATCH_FIELDS);
    // Present — but only with the server-computed value from `values`, which toExerciseValues
    // (sync.service.ts) builds from the authenticated session, never from op.data. patchAwareSet
    // never reads op.data for a null-mapped key, so a value claimed in the payload can never
    // reach this result regardless of key presence.
    expect(result.userId).toBe(values.userId);
    expect(result.userId).not.toBe('someone-else');
    expect(result.isCustom).toBe(values.isCustom);
    expect(result.isCustom).not.toBe(false);
    expect(result.source).toBe(values.source);
    expect(result.source).not.toBe('seed');
    expect(result.archivedAt).toBe(values.archivedAt);
  });

  it('a PATCH for user_exercise_preference naming only never_suggest produces an update set of exactly the identity keys plus neverSuggest — archivedAt is absent', () => {
    const values = userExercisePreferenceValues();
    const patchOp = op({ type: 'user_exercise_preference', id: 'uep-1', data: { never_suggest: true } });
    const result = patchAwareSet(patchOp, values, USER_EXERCISE_PREFERENCE_PATCH_FIELDS);
    expect(Object.keys(result).sort()).toEqual(['id', 'userId', 'exerciseId', 'neverSuggest'].sort());
    expect('archivedAt' in result).toBe(false);
  });

  it('always retains identity/server-owned keys regardless of op.data — user_exercise_preference (id, userId, exerciseId), and never with a client-claimed value', () => {
    const values = userExercisePreferenceValues();
    const patchResult = patchAwareSet(
      op({
        type: 'user_exercise_preference',
        id: 'uep-1',
        data: { user_id: 'someone-else', exercise_id: 'ex-2', never_suggest: true },
      }),
      values,
      USER_EXERCISE_PREFERENCE_PATCH_FIELDS,
    );
    expect(patchResult.userId).toBe(values.userId);
    expect(patchResult.userId).not.toBe('someone-else');
    expect(patchResult.exerciseId).toBe(values.exerciseId);
    expect(patchResult.exerciseId).not.toBe('ex-2');
  });

  it('a PUT for user_exercise_preference produces an update set containing every patchable column', () => {
    const values = userExercisePreferenceValues();
    const putOp = op({
      op: 'PUT',
      type: 'user_exercise_preference',
      id: 'uep-1',
      data: { archived_at: null, never_suggest: false, updated_at: '2026-06-15T20:00:00Z' },
    });
    const result = patchAwareSet(putOp, values, USER_EXERCISE_PREFERENCE_PATCH_FIELDS);
    expect(result).toBe(values);
  });
});
