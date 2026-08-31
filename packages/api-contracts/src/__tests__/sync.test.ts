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

  it('contains exactly workout_session, session_exercise, logged_set, personal_record, equipment_profile, exercise, user_exercise_preference, excluded_exercise, routine, routine_day, routine_exercise, user_preference, routine_cycle, routine_exercise_cycle_target, body_metric, progress_photo and dashboard_widget in PUSH_APPLIED_TABLES', () => {
    expect([...PUSH_APPLIED_TABLES].sort()).toEqual(
      [
        'body_metric',
        'dashboard_widget',
        'equipment_profile',
        'excluded_exercise',
        'exercise',
        'logged_set',
        'personal_record',
        'progress_photo',
        'routine',
        'routine_cycle',
        'routine_day',
        'routine_exercise',
        'routine_exercise_cycle_target',
        'session_exercise',
        'user_exercise_preference',
        'user_preference',
        'workout_session',
      ].sort(),
    );
  });

  it('body_metric is applied, not deferred — 12-01 gives logged weigh-ins and measurements a server-side apply path', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('body_metric')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('body_metric')).toBe(false);
  });

  it('user_preference is applied, not deferred — 04-04 closes this gap (PROG-08 needed activation to sync)', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('user_preference')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('user_preference')).toBe(false);
  });

  it('personal_record is applied, not deferred — 05-03 gives PRs a server-side apply path', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('personal_record')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('personal_record')).toBe(false);
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

  it('routine_cycle is applied, not deferred — 04-06 closes this gap', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('routine_cycle')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('routine_cycle')).toBe(false);
  });

  it('routine_exercise_cycle_target is applied, not deferred — 04-07 closes this gap', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('routine_exercise_cycle_target')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('routine_exercise_cycle_target')).toBe(false);
  });

  it('equipment_profile is applied, not deferred — 06-01 gives gym profiles a server-side apply path', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('equipment_profile')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('equipment_profile')).toBe(false);
  });

  it('progress_photo is applied, not deferred — 12-03 gives progress-photo metadata rows a server-side apply path', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('progress_photo')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('progress_photo')).toBe(false);
  });

  it('dashboard_widget is applied, not deferred — 12-05 ships it as a wholly new table with an apply path from the start (D-21)', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('dashboard_widget')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('dashboard_widget')).toBe(false);
  });
});

// 12-08's own milestone: PUSH_DEFERRED_TABLES is empty for the first time in the project's life
// (12-CONTEXT.md § Specific Ideas). These four assertions are the falsifiable claim — a future
// phase that adds a synced table without an apply path must turn this suite red. Every containment
// check iterates the tuples directly rather than hard-coding a second copy of either list, so
// adding a table can never silently pass without also being classified here.
describe('PUSH_DEFERRED_TABLES is empty — every synced table has a push apply path (12-08)', () => {
  it('has length zero', () => {
    expect(PUSH_DEFERRED_TABLES).toHaveLength(0);
  });

  it('every member of SYNCED_TABLES is a member of PUSH_APPLIED_TABLES', () => {
    const applied = new Set<string>(PUSH_APPLIED_TABLES);
    for (const table of SYNCED_TABLES) {
      expect(applied.has(table)).toBe(true);
    }
  });

  it('PUSH_APPLIED_TABLES names no table that SYNCED_TABLES does not — the applied tuple cannot drift into naming a table nothing syncs', () => {
    const synced = new Set<string>(SYNCED_TABLES);
    for (const table of PUSH_APPLIED_TABLES) {
      expect(synced.has(table)).toBe(true);
    }
  });

  it("PUSH_APPLIED_TABLES's and SYNCED_TABLES's last member are both 'dashboard_widget' — the additive-only ordering rule both files' headers state", () => {
    expect(PUSH_APPLIED_TABLES[PUSH_APPLIED_TABLES.length - 1]).toBe('dashboard_widget');
    expect(SYNCED_TABLES[SYNCED_TABLES.length - 1]).toBe('dashboard_widget');
  });
});

describe('isTerminalRejection', () => {
  // The "is true for a deferred table's unknown_table rejection" case this test used to cover
  // (against progress_photo, the last member) has no real table left to exercise it against —
  // PUSH_DEFERRED_TABLES is empty as of this plan. 12-08 owns asserting that emptiness directly;
  // both tripwires below prove the tuple move happened rather than re-asserting the now-untestable
  // true branch with a fabricated table name.
  it("isTerminalRejection('unknown_table', 'body_metric') is now false — the tripwire proving the tuple move happened (12-01)", () => {
    expect(isTerminalRejection('unknown_table', 'body_metric')).toBe(false);
  });

  it("isTerminalRejection('unknown_table', 'progress_photo') is now false — the tripwire proving the tuple move happened (12-03)", () => {
    expect(isTerminalRejection('unknown_table', 'progress_photo')).toBe(false);
  });

  it('is false for equipment_profile\'s unknown_table rejection — no longer a known permanent gap (06-01)', () => {
    expect(isTerminalRejection('unknown_table', 'equipment_profile')).toBe(false);
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

  it('is false for routine_cycle\'s unknown_table rejection — no longer a known permanent gap (04-06)', () => {
    expect(isTerminalRejection('unknown_table', 'routine_cycle')).toBe(false);
  });

  it('is false for routine_exercise_cycle_target\'s unknown_table rejection — no longer a known permanent gap (04-07)', () => {
    expect(isTerminalRejection('unknown_table', 'routine_exercise_cycle_target')).toBe(false);
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

  // CR-04 of 04-REVIEW.md: the server used to report every transaction-level throw as
  // invalid_field, so a deadlock between the same user's two devices read on the wire as "this
  // data is permanently unacceptable" and the connector completed the crud transaction away.
  it('is false for server_error on every table — a transient server failure never destroys a queued write, regardless of PUSH_DEFERRED_TABLES membership', () => {
    expect(isTerminalRejection('server_error', 'routine')).toBe(false);
    expect(isTerminalRejection('server_error', 'routine_exercise_cycle_target')).toBe(false);
    expect(isTerminalRejection('server_error', 'progress_photo')).toBe(false);
    expect(isTerminalRejection('server_error', '')).toBe(false);
  });
});
