import { CONFLICT_LOGGED_TABLES, resolveConflict, type ConflictDecision } from '../conflict-policy';

function loggedSetRow(overrides: Record<string, unknown> = {}) {
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

function loggedSetOp(data: Record<string, unknown> = {}) {
  return {
    op_id: 'op-1',
    op: 'PUT' as const,
    type: 'logged_set',
    id: 'set-1',
    data,
  };
}

describe('resolveConflict', () => {
  it('returns an insert decision and logs nothing when the stored row does not exist', () => {
    const decision = resolveConflict('logged_set', undefined, loggedSetOp({ weight_kg: '60.000' }));
    expect(decision).toEqual<ConflictDecision>({ action: 'insert', logConflict: false, changedFields: [] });
  });

  it('overwrites and logs nothing when the stored logged_set is not completed', () => {
    const stored = loggedSetRow({ completed: false, weightKg: '55.000' });
    const decision = resolveConflict('logged_set', stored, loggedSetOp({ weight_kg: '60.000' }));
    expect(decision.action).toBe('overwrite');
    expect(decision.logConflict).toBe(false);
    expect(decision.changedFields).toEqual([]);
  });

  it('overwrites and logs nothing when the stored completed logged_set has identical incoming values', () => {
    const stored = loggedSetRow({ completed: true, weightKg: '60.000', reps: 10, rir: 2, setIndex: 1 });
    const decision = resolveConflict(
      'logged_set',
      stored,
      loggedSetOp({ weight_kg: '60.000', reps: 10, rir: 2, set_index: 1, completed: true }),
    );
    expect(decision.action).toBe('overwrite');
    expect(decision.logConflict).toBe(false);
    expect(decision.changedFields).toEqual([]);
  });

  it('overwrites and logs a conflict when the completed logged_set has a different weight_kg', () => {
    const stored = loggedSetRow({ completed: true, weightKg: '60.000' });
    const decision = resolveConflict('logged_set', stored, loggedSetOp({ weight_kg: '65.000' }));
    expect(decision.action).toBe('overwrite');
    expect(decision.logConflict).toBe(true);
    expect(decision.changedFields).toEqual(['weight_kg']);
  });

  it('overwrites and logs a conflict for each of reps, rir, set_index and completed when they differ', () => {
    const stored = loggedSetRow({ completed: true, reps: 10, rir: 2, setIndex: 1 });

    const repsDecision = resolveConflict('logged_set', stored, loggedSetOp({ reps: 8 }));
    expect(repsDecision.logConflict).toBe(true);
    expect(repsDecision.changedFields).toEqual(['reps']);

    const rirDecision = resolveConflict('logged_set', stored, loggedSetOp({ rir: 0 }));
    expect(rirDecision.logConflict).toBe(true);
    expect(rirDecision.changedFields).toEqual(['rir']);

    const setIndexDecision = resolveConflict('logged_set', stored, loggedSetOp({ set_index: 2 }));
    expect(setIndexDecision.logConflict).toBe(true);
    expect(setIndexDecision.changedFields).toEqual(['set_index']);

    const completedDecision = resolveConflict('logged_set', stored, loggedSetOp({ completed: false }));
    expect(completedDecision.logConflict).toBe(true);
    expect(completedDecision.changedFields).toEqual(['completed']);
  });

  it('returns an overwrite decision and logs nothing for workout_session metadata', () => {
    const stored = { id: 'sess-1', status: 'in_progress' };
    const op = { op_id: 'op-2', op: 'PATCH' as const, type: 'workout_session', id: 'sess-1', data: { status: 'completed' } };
    const decision = resolveConflict('workout_session', stored, op);
    expect(decision).toEqual<ConflictDecision>({ action: 'overwrite', logConflict: false, changedFields: [] });
  });

  it('returns an overwrite decision and logs nothing for user_preference', () => {
    const stored = { userId: 'user-1', units: 'kg' };
    const op = { op_id: 'op-3', op: 'PATCH' as const, type: 'user_preference', id: 'user-1', data: { units: 'lb' } };
    const decision = resolveConflict('user_preference', stored, op);
    expect(decision).toEqual<ConflictDecision>({ action: 'overwrite', logConflict: false, changedFields: [] });
  });

  it('never reads a timestamp from either side of the comparison', () => {
    const source = require('node:fs').readFileSync(require.resolve('../conflict-policy.ts'), 'utf8');
    expect(/Date\.now|new Date\(/.test(source)).toBe(false);
  });

  it('compares weight_kg as an exact decimal string, never a parsed number', () => {
    const source = require('node:fs').readFileSync(require.resolve('../conflict-policy.ts'), 'utf8');
    expect(/parseFloat|Number\(/.test(source)).toBe(false);
  });

  it('CONFLICT_LOGGED_TABLES contains only logged_set', () => {
    expect([...CONFLICT_LOGGED_TABLES]).toEqual(['logged_set']);
  });
});
