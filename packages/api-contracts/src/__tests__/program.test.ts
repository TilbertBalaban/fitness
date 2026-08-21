import { isTerminalRejection, PUSH_APPLIED_TABLES, PUSH_DEFERRED_TABLES } from '../sync';
import { ROUTINE_STATUSES } from '../program';

describe('ROUTINE_STATUSES', () => {
  it('deep-equals [draft, ready] in that exact order', () => {
    expect(ROUTINE_STATUSES).toEqual(['draft', 'ready']);
  });

  // The tripwire on this plan's own prohibitions: active/frozen/archived each live on a different
  // column (user_preference.active_routine_id, routine.progression_frozen, routine.archived_at)
  // and must never be reintroduced as a third/fourth status value — see docs/program-vocabularies.md.
  it('contains neither active, frozen, nor archived', () => {
    expect((ROUTINE_STATUSES as readonly string[]).includes('active')).toBe(false);
    expect((ROUTINE_STATUSES as readonly string[]).includes('frozen')).toBe(false);
    expect((ROUTINE_STATUSES as readonly string[]).includes('archived')).toBe(false);
  });
});

describe('routine push classification', () => {
  it('is in PUSH_APPLIED_TABLES and not in PUSH_DEFERRED_TABLES', () => {
    expect((PUSH_APPLIED_TABLES as readonly string[]).includes('routine')).toBe(true);
    expect((PUSH_DEFERRED_TABLES as readonly string[]).includes('routine')).toBe(false);
  });

  it("isTerminalRejection('unknown_table', 'routine') is now false — the tripwire proving the tuple move happened", () => {
    expect(isTerminalRejection('unknown_table', 'routine')).toBe(false);
  });
});
