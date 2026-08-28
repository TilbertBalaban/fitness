import type { SyncCrudOp } from '@fitness/api-contracts';
import { hasInvalidField } from '../sync.service';

function userPreferenceOp(data: Record<string, unknown> = {}): SyncCrudOp {
  return { op_id: 'op-1', op: 'PATCH', type: 'user_preference', id: 'user-1', data };
}

describe('hasInvalidField — user_preference.progression_preference', () => {
  it('rejects an unrecognised string', () => {
    expect(hasInvalidField(userPreferenceOp({ progression_preference: 'some_other_value' }))).toBe(true);
  });

  it('rejects a number', () => {
    expect(hasInvalidField(userPreferenceOp({ progression_preference: 1 }))).toBe(true);
  });

  it('rejects an object', () => {
    expect(hasInvalidField(userPreferenceOp({ progression_preference: {} }))).toBe(true);
  });

  it('accepts both recognised values', () => {
    expect(hasInvalidField(userPreferenceOp({ progression_preference: 'widen_rep_range_first' }))).toBe(false);
    expect(hasInvalidField(userPreferenceOp({ progression_preference: 'match_previous_weight' }))).toBe(false);
  });

  it('accepts an absent field', () => {
    expect(hasInvalidField(userPreferenceOp({}))).toBe(false);
  });
});
