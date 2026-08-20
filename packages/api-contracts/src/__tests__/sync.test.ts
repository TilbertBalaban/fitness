import {
  PUSH_APPLIED_TABLES,
  PUSH_DEFERRED_TABLES,
  SYNCED_TABLES,
  isTerminalRejection,
} from '../sync';

describe('PUSH_APPLIED_TABLES / PUSH_DEFERRED_TABLES partition', () => {
  it('concatenated and sorted, equals SYNCED_TABLES sorted — every table is classified exactly once', () => {
    const concatenated = [...PUSH_APPLIED_TABLES, ...PUSH_DEFERRED_TABLES].slice().sort();
    const expected = (SYNCED_TABLES as readonly string[]).slice().sort();
    expect(concatenated).toEqual(expected);
  });

  it('shares no member between the two sets', () => {
    const deferred = new Set<string>(PUSH_DEFERRED_TABLES);
    const overlap = PUSH_APPLIED_TABLES.filter((table) => deferred.has(table));
    expect(overlap).toEqual([]);
  });

  it('contains exactly workout_session, session_exercise, logged_set, exercise, user_exercise_preference, routine, routine_day, routine_exercise and user_preference in PUSH_APPLIED_TABLES', () => {
    expect([...PUSH_APPLIED_TABLES].sort()).toEqual(
      [
        'exercise',
        'logged_set',
        'routine',
        'routine_day',
        'routine_exercise',
        'session_exercise',
        'user_exercise_preference',
        'user_preference',
        'workout_session',
      ].sort(),
    );
  });

  it('user_preference is applied, not deferred — 04-04 closes this gap (PROG-08 needed activation to sync)', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('user_preference')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('user_preference')).toBe(false);
  });

  it('exercise is applied, not deferred — the phase this plan closes', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('exercise')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('exercise')).toBe(false);
  });

  it('routine_day and routine_exercise are applied, not deferred — 04-02 closes this gap', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('routine_day')).toBe(true);
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('routine_exercise')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('routine_day')).toBe(false);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('routine_exercise')).toBe(false);
  });
});

describe('isTerminalRejection', () => {
  it('is true for a deferred table\'s unknown_table rejection — retrying cannot cure it', () => {
    expect(isTerminalRejection('unknown_table', 'equipment_profile')).toBe(true);
  });

  it('is false for routine_day\'s unknown_table rejection — no longer a known permanent gap (04-02)', () => {
    expect(isTerminalRejection('unknown_table', 'routine_day')).toBe(false);
  });

  it('is false for an unrecognized table name\'s unknown_table rejection — a later deploy may cure it', () => {
    expect(isTerminalRejection('unknown_table', 'something_unrecognised')).toBe(false);
  });

  it('is false for exercise\'s unknown_table rejection — no longer a known permanent gap', () => {
    expect(isTerminalRejection('unknown_table', 'exercise')).toBe(false);
  });

  it('is true for not_owner, invalid_field and deleted regardless of table', () => {
    expect(isTerminalRejection('not_owner', 'workout_session')).toBe(true);
    expect(isTerminalRejection('invalid_field', 'logged_set')).toBe(true);
    expect(isTerminalRejection('deleted', 'routine')).toBe(true);
  });

  it('is false for missing_parent and batch_too_large regardless of table', () => {
    expect(isTerminalRejection('missing_parent', 'workout_session')).toBe(false);
    expect(isTerminalRejection('batch_too_large', 'logged_set')).toBe(false);
  });
});
