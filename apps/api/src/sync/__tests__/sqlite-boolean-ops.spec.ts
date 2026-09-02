import type { SyncCrudOp } from '@fitness/api-contracts';
import { hasInvalidField } from '../sync.service';

function op(type: SyncCrudOp['type'], data: Record<string, unknown>, id = 'row-1'): SyncCrudOp {
  return { op_id: 'op-1', op: 'PATCH', type, id, data };
}

describe.each<[SyncCrudOp['type'], string, Record<string, unknown>]>([
  ['logged_set', 'completed', {}],
  ['dashboard_widget', 'enabled', {}],
  ['user_preference', 'auto_advance_enabled', {}],
  ['user_preference', 'warmup_sets_enabled', {}],
  ['equipment_profile', 'is_default', {}],
  ['routine', 'progression_frozen', {}],
  ['user_exercise_preference', 'never_suggest', { exercise_id: 'ex-1' }],
])('hasInvalidField — %s.%s', (type, field, baseData) => {
  it.each([
    [1, 'the SQLite-integer true'],
    [0, 'the SQLite-integer false'],
    [true, 'a real boolean true'],
    [false, 'a real boolean false'],
    [undefined, 'an absent field'],
  ])('accepts %j (%s)', (value, _label) => {
    const data = value === undefined ? baseData : { ...baseData, [field]: value };
    expect(hasInvalidField(op(type, data))).toBe(false);
  });

  it.each([
    ['yes', 'a non-numeric string'],
    [2, 'an out-of-range integer'],
    [-1, 'a negative integer'],
    [null, 'an explicit null'],
  ])('rejects %j (%s)', (value, _label) => {
    expect(hasInvalidField(op(type, { ...baseData, [field]: value }))).toBe(true);
  });
});

describe('hasInvalidField — exercise.is_custom', () => {
  it('rejects the SQLite-integer false (0)', () => {
    expect(hasInvalidField(op('exercise', { is_custom: 0 }))).toBe(true);
  });

  it('accepts the SQLite-integer true (1)', () => {
    expect(hasInvalidField(op('exercise', { is_custom: 1 }))).toBe(false);
  });
});

describe('hasInvalidField — logged_set realistic op', () => {
  it('accepts a completed set alongside its other fields', () => {
    expect(hasInvalidField(op('logged_set', { completed: 1, reps: 5, weight_kg: 60 }))).toBe(false);
  });
});
